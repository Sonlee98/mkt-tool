import { pool } from '../db/pool.js';
import { sseHub } from '../services/sseHub.js';
import { getAppSettings, recordTelemetry } from '../services/telemetryService.js';
import { getNowInTz } from '../utils/time.js';
import type { CreativeGroupAllocation, CreativeRow, BulkChannel } from '../services/batchPlanner.js';
import {
    activateCampaignStep,
    BulkAdapterError,
    createAdGroupsStep,
    createAdsStep,
    createPausedCampaignStep,
    isLiveModeAccount,
    resolveJobMedia,
    type LaunchAccountInfo,
    type LaunchPackageBundle
} from '../adapters/bulkLaunchAdapters.js';

interface LaunchJobRow {
    id: string;
    batch_id: string;
    package_id: string;
    ad_account_id: string;
    product_id: string;
    channel: BulkChannel;
    planned_campaign_name: string;
    creative_allocation: CreativeGroupAllocation[];
    current_step: string;
    status: string;
    execution_mode: string;
    platform_campaign_id: string | null;
    platform_budget_rn: string | null;
    platform_adgroup_ids: string[];
    platform_ad_ids: string[];
    attempt_count: number;
}

class BulkLaunchWorker {
    private timer: NodeJS.Timeout | null = null;
    private polling = false;
    private activeCount = 0;
    private readonly maxGlobalConcurrency = 4;

    start(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(() => {
            void this.pollAndExecute();
        }, 400);
        // Reclaim orphaned RUNNING jobs if process restarted mid-flight
        void pool.query(
            `UPDATE campaign_launch_jobs
             SET status = 'QUEUED', locked_at = NULL
             WHERE status = 'RUNNING' AND locked_at < NOW() - INTERVAL '2 minutes'`
        ).catch(() => {});
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    nudge(): void {
        setTimeout(() => {
            void this.pollAndExecute();
        }, 20);
    }

    private async pollAndExecute(): Promise<void> {
        if (this.polling || this.activeCount >= this.maxGlobalConcurrency) return;
        this.polling = true;

        try {
            const slotsAvailable = this.maxGlobalConcurrency - this.activeCount;
            if (slotsAvailable <= 0) return;

            const { rows: claimedJobs } = await pool.query<LaunchJobRow>(
                `WITH active_per_account AS (
                    SELECT ad_account_id, COUNT(*) AS running_cnt
                    FROM campaign_launch_jobs
                    WHERE status = 'RUNNING'
                    GROUP BY ad_account_id
                ),
                candidate_jobs AS (
                    SELECT j.id
                    FROM campaign_launch_jobs j
                    JOIN ad_accounts a ON a.id = j.ad_account_id
                    LEFT JOIN active_per_account act ON act.ad_account_id = j.ad_account_id
                    WHERE j.status = 'QUEUED'
                      AND j.next_run_at <= NOW()
                      AND COALESCE(act.running_cnt, 0) < COALESCE((a.api_config->>'max_concurrent_jobs')::INT, 2)
                      AND (
                          a.api_config->>'rate_limited_until' IS NULL
                          OR (a.api_config->>'rate_limited_until')::TIMESTAMPTZ <= NOW()
                      )
                    ORDER BY j.created_at ASC
                    LIMIT $1
                    FOR UPDATE OF j SKIP LOCKED
                )
                UPDATE campaign_launch_jobs j
                SET status = 'RUNNING',
                    locked_at = NOW(),
                    started_at = COALESCE(j.started_at, NOW()),
                    attempt_count = j.attempt_count + 1
                FROM candidate_jobs c
                WHERE j.id = c.id
                RETURNING j.*`,
                [slotsAvailable]
            );

            for (const job of claimedJobs) {
                this.activeCount++;
                void this.executeJob(job).finally(() => {
                    this.activeCount--;
                    this.nudge();
                });
            }
        } catch (err) {
            console.error('[BulkLaunchWorker] Poll error:', err);
        } finally {
            this.polling = false;
        }
    }

    private async broadcastJobUpdate(jobId: string): Promise<void> {
        const { rows } = await pool.query(
            `SELECT id, batch_id, package_id, ad_account_id, product_id, channel,
                    planned_campaign_name, current_step, status, execution_mode,
                    platform_campaign_id, platform_adgroup_ids, platform_ad_ids,
                    error_step, error_code, error_message, is_retryable, attempt_count,
                    started_at, finished_at
             FROM campaign_launch_jobs WHERE id = $1`,
            [jobId]
        );
        const r = rows[0];
        if (!r) return;

        sseHub.broadcast('bulk_job_updated', {
            id: r.id,
            batchId: r.batch_id,
            packageId: r.package_id,
            adAccountId: r.ad_account_id,
            productId: r.product_id,
            channel: r.channel,
            plannedCampaignName: r.planned_campaign_name,
            currentStep: r.current_step,
            status: r.status,
            executionMode: r.execution_mode,
            platformCampaignId: r.platform_campaign_id,
            adGroupsCount: Array.isArray(r.platform_adgroup_ids) ? r.platform_adgroup_ids.length : 0,
            adsCount: Array.isArray(r.platform_ad_ids) ? r.platform_ad_ids.length : 0,
            errorStep: r.error_step,
            errorCode: r.error_code,
            errorMessage: r.error_message,
            isRetryable: r.is_retryable,
            attemptCount: r.attempt_count
        });
    }

    private async updateStep(jobId: string, step: string, patchSql = '', params: unknown[] = []): Promise<void> {
        if (patchSql) {
            await pool.query(
                `UPDATE campaign_launch_jobs SET current_step = $2, ${patchSql} WHERE id = $1`,
                [jobId, step, ...params]
            );
        } else {
            await pool.query(
                `UPDATE campaign_launch_jobs SET current_step = $2 WHERE id = $1`,
                [jobId, step]
            );
        }
        await this.broadcastJobUpdate(jobId);
    }

    private async refreshBatchStatus(batchId: string): Promise<void> {
        const { rows } = await pool.query<{
            total: number;
            succeeded: number;
            failed: number;
            pending: number;
        }>(
            `SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'SUCCEEDED')::int AS succeeded,
                COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed,
                COUNT(*) FILTER (WHERE status IN ('QUEUED', 'RUNNING'))::int AS pending
             FROM campaign_launch_jobs
             WHERE batch_id = $1`,
            [batchId]
        );

        const stats = rows[0];
        if (!stats) return;

        let batchStatus = 'RUNNING';
        if (stats.pending === 0) {
            if (stats.failed === 0) batchStatus = 'COMPLETED';
            else if (stats.succeeded === 0) batchStatus = 'FAILED';
            else batchStatus = 'PARTIAL_FAILED';
        }

        await pool.query(
            `UPDATE bulk_launch_batches
             SET succeeded_jobs = $2,
                 failed_jobs = $3,
                 status = $4,
                 completed_at = CASE WHEN $5 = 0 THEN NOW() ELSE NULL END
             WHERE id = $1`,
            [batchId, stats.succeeded, stats.failed, batchStatus, stats.pending]
        );

        if (stats.pending === 0) {
            sseHub.broadcast('bulk_batch_completed', {
                batchId,
                status: batchStatus,
                totalJobs: stats.total,
                succeededJobs: stats.succeeded,
                failedJobs: stats.failed
            });
        }
    }

    private async executeJob(job: LaunchJobRow): Promise<void> {
        const startedAt = Date.now();
        let lastStep = job.current_step;

        try {
            const settings = await getAppSettings();

            const [bundleRes, accRes, batchRes] = await Promise.all([
                pool.query<{
                    package_id: string;
                    package_name: string;
                    channel: BulkChannel;
                    tactic_ids: string[];
                    app_id: string;
                    app_name: string;
                    store_type: string;
                    platform_app_id: string;
                    bundle_id: string;
                    store_url: string;
                    page_id: string | null;
                    fb_page_id: string | null;
                    ig_actor_id: string | null;
                    cam_id: string;
                    buying_type: string;
                    objective: string;
                    performance_goal: string;
                    convert_event: string | null;
                    roas_goal: number | null;
                    target_cpa: number | null;
                    budget_amount: number;
                    budget_currency: string;
                    budget_level: string;
                    is_worldwide: boolean;
                    country_codes: string[];
                    language_codes: string[];
                    attribution_window: string | null;
                    is_ai_media: boolean;
                    platform_extras: Record<string, unknown>;
                    ad_id: string;
                    ad_format: string;
                    cta_type: string | null;
                    copy_payload: Record<string, unknown>;
                }>(
                    `SELECT p.id AS package_id, p.name AS package_name, p.channel, p.tactic_ids,
                            app.id AS app_id, app.name AS app_name, app.store_type, app.platform_app_id, app.bundle_id, app.store_url,
                            pg.id AS page_id, pg.page_id AS fb_page_id, pg.instagram_actor_id AS ig_actor_id,
                            cam.id AS cam_id, cam.buying_type, cam.objective, cam.performance_goal, cam.convert_event,
                            cam.roas_goal, cam.target_cpa, cam.budget_amount, cam.budget_currency, cam.budget_level,
                            cam.is_worldwide, cam.country_codes, cam.language_codes, cam.attribution_window,
                            cam.is_ai_media, cam.platform_extras,
                            ad.id AS ad_id, ad.format AS ad_format, ad.cta_type, ad.copy_payload
                     FROM packages p
                     JOIN app_templates app ON app.id = p.app_template_id
                     JOIN campaign_templates cam ON cam.id = p.campaign_template_id
                     JOIN ad_templates ad ON ad.id = p.ad_template_id
                     LEFT JOIN page_templates pg ON pg.id = p.page_template_id
                     WHERE p.id = $1`,
                    [job.package_id]
                ),
                pool.query<LaunchAccountInfo>(
                    `SELECT id, name, channel, currency, access_token, api_config FROM ad_accounts WHERE id = $1`,
                    [job.ad_account_id]
                ),
                pool.query<{ created_by: string | null; options: Record<string, unknown> }>(
                    `SELECT created_by, options FROM bulk_launch_batches WHERE id = $1`,
                    [job.batch_id]
                )
            ]);

            const bRow = bundleRes.rows[0];
            const acc = accRes.rows[0];
            const batchMeta = batchRes.rows[0];
            if (!bRow || !acc) {
                throw new BulkAdapterError('Không tìm thấy Package hoặc Ad Account liên kết.', 'MISSING_REF', false);
            }

            const bundle: LaunchPackageBundle = {
                packageId: bRow.package_id,
                packageName: bRow.package_name,
                channel: bRow.channel,
                tacticIds: bRow.tactic_ids || [],
                appTemplate: {
                    id: bRow.app_id,
                    name: bRow.app_name,
                    store_type: bRow.store_type,
                    platform_app_id: bRow.platform_app_id,
                    bundle_id: bRow.bundle_id,
                    store_url: bRow.store_url
                },
                pageTemplate: bRow.page_id ? {
                    id: bRow.page_id,
                    page_id: bRow.fb_page_id || '',
                    instagram_actor_id: bRow.ig_actor_id
                } : null,
                campaignTemplate: {
                    id: bRow.cam_id,
                    buying_type: bRow.buying_type,
                    objective: bRow.objective,
                    performance_goal: bRow.performance_goal,
                    convert_event: bRow.convert_event,
                    roas_goal: bRow.roas_goal,
                    target_cpa: bRow.target_cpa,
                    budget_amount: Number(bRow.budget_amount),
                    budget_currency: bRow.budget_currency,
                    budget_level: bRow.budget_level,
                    is_worldwide: bRow.is_worldwide,
                    country_codes: bRow.country_codes || [],
                    language_codes: bRow.language_codes || [],
                    attribution_window: bRow.attribution_window,
                    is_ai_media: bRow.is_ai_media,
                    platform_extras: bRow.platform_extras || {}
                },
                adTemplate: {
                    id: bRow.ad_id,
                    format: bRow.ad_format,
                    cta_type: bRow.cta_type,
                    copy_payload: bRow.copy_payload || {}
                }
            };

            const allocations: CreativeGroupAllocation[] = Array.isArray(job.creative_allocation)
                ? job.creative_allocation
                : [];
            const allCreativeIds = Array.from(new Set(allocations.flatMap(g => g.creativeIds)));

            const { rows: crRows } = await pool.query<CreativeRow>(
                `SELECT id, title, file_name, sha256_hash, storage_path, public_url,
                        product_id, angle_code, language_code, market_target,
                        tiktok_policy, meta_policy, google_policy, youtube_video_id
                 FROM creatives WHERE id = ANY($1::varchar[])`,
                [allCreativeIds]
            );

            // Step 1: Resolve / Upload Media with SHA-256 Deduplication Cache
            lastStep = 'RESOLVING_MEDIA';
            await this.updateStep(job.id, lastStep);
            const mediaResult = await resolveJobMedia(bundle.channel, acc, crRows);

            const dailyBudgetVnd = bundle.campaignTemplate.budget_currency.toUpperCase() === 'USD'
                ? Math.round(bundle.campaignTemplate.budget_amount * settings.exchangeRateVnd)
                : Math.round(bundle.campaignTemplate.budget_amount);

            // Step 2: Create PAUSED Campaign (Checkpoint if already created)
            let platformCampaignId = job.platform_campaign_id;
            let platformBudgetRn = job.platform_budget_rn;
            if (!platformCampaignId) {
                lastStep = 'CREATING_CAMPAIGN';
                await this.updateStep(job.id, lastStep);
                const createdCamp = await createPausedCampaignStep(
                    acc,
                    bundle,
                    job.planned_campaign_name,
                    dailyBudgetVnd,
                    settings.exchangeRateVnd
                );
                platformCampaignId = createdCamp.platformCampaignId;
                platformBudgetRn = createdCamp.platformBudgetRn || null;
                await pool.query(
                    `UPDATE campaign_launch_jobs
                     SET platform_campaign_id = $2, platform_budget_rn = $3
                     WHERE id = $1`,
                    [job.id, platformCampaignId, platformBudgetRn]
                );
            }

            // Optional deterministic failure simulation for Retry/Checkpoint verification
            if (batchMeta?.options?.simulateFailOnce && job.attempt_count === 1) {
                const targetJobId = batchMeta.options.targetJobId as string | undefined;
                if (!targetJobId || targetJobId === job.id) {
                    lastStep = 'CREATING_ADGROUPS';
                    throw new BulkAdapterError(
                        'Giả lập lỗi tạm thời ở bước tạo Ad Group (đã lưu checkpoint Campaign PAUSED).',
                        'SANDBOX_SIMULATED_ERROR',
                        true
                    );
                }
            }

            // Step 3: Create missing AdGroups / AdSets
            lastStep = 'CREATING_ADGROUPS';
            await this.updateStep(job.id, lastStep);
            const existingGroupIds = Array.isArray(job.platform_adgroup_ids) ? job.platform_adgroup_ids : [];
            const groupIds = await createAdGroupsStep(
                acc,
                bundle,
                platformCampaignId,
                job.planned_campaign_name,
                allocations,
                existingGroupIds
            );
            await pool.query(
                `UPDATE campaign_launch_jobs SET platform_adgroup_ids = $2::jsonb WHERE id = $1`,
                [job.id, JSON.stringify(groupIds)]
            );

            // Step 4: Create missing Ads
            lastStep = 'CREATING_ADS';
            await this.updateStep(job.id, lastStep);
            const existingAdIds = Array.isArray(job.platform_ad_ids) ? job.platform_ad_ids : [];
            const adIds = await createAdsStep(
                acc,
                bundle,
                job.planned_campaign_name,
                allocations,
                groupIds,
                mediaResult,
                existingAdIds
            );
            await pool.query(
                `UPDATE campaign_launch_jobs SET platform_ad_ids = $2::jsonb WHERE id = $1`,
                [job.id, JSON.stringify(adIds)]
            );

            // Step 5: Activate Campaign & Register into Intraday `campaigns` + `intraday_hourly_metrics`
            lastStep = 'ACTIVATING';
            await this.updateStep(job.id, lastStep);
            await activateCampaignStep(acc, bundle.channel, platformCampaignId);

            const tzNow = getNowInTz();
            const countriesText = bundle.campaignTemplate.is_worldwide || bundle.campaignTemplate.country_codes.length === 0
                ? 'Global'
                : bundle.campaignTemplate.country_codes.join(', ');
            const primaryCountry = (countriesText.split(',')[0] || 'GLOBAL').trim().toUpperCase().slice(0, 16) || 'GLOBAL';
            const intradayCampaignId = platformCampaignId.startsWith('cmp_')
                ? platformCampaignId.slice(0, 64)
                : `cmp_${platformCampaignId}`.slice(0, 64);

            const dbClient = await pool.connect();
            try {
                await dbClient.query('BEGIN');
                await dbClient.query(
                    `INSERT INTO campaigns (
                        id, external_campaign_id, product_id, ad_account_id, channel, marketer_id,
                        name, countries, daily_budget_vnd, status,
                        package_id, source_job_id, creative_ids, tactic_ids, updated_at
                     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ON',$10,$11,$12,$13,NOW())
                     ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        daily_budget_vnd = EXCLUDED.daily_budget_vnd,
                        status = 'ON',
                        package_id = EXCLUDED.package_id,
                        source_job_id = EXCLUDED.source_job_id,
                        creative_ids = EXCLUDED.creative_ids,
                        tactic_ids = EXCLUDED.tactic_ids,
                        updated_at = NOW()`,
                    [
                        intradayCampaignId,
                        platformCampaignId.slice(0, 64),
                        job.product_id,
                        acc.id,
                        bundle.channel,
                        batchMeta?.created_by || 'HoangNC',
                        job.planned_campaign_name,
                        countriesText,
                        dailyBudgetVnd,
                        job.package_id,
                        job.id,
                        allCreativeIds,
                        bundle.tacticIds
                    ]
                );

                await dbClient.query(
                    `INSERT INTO intraday_hourly_metrics (
                        metric_date, hour_slot, product_id, channel, campaign_id, country,
                        spend_vnd, cohort_rev_vnd, cutoff_rev_vnd, installs, updated_at
                     ) VALUES ($1,$2,$3,$4,$5,$6,0,0,0,0,NOW())
                     ON CONFLICT (metric_date, hour_slot, campaign_id, country) DO NOTHING`,
                    [tzNow.date, tzNow.hour, job.product_id, bundle.channel, intradayCampaignId, primaryCountry]
                );

                await dbClient.query(
                    `UPDATE creatives
                     SET campaign_success_count = campaign_success_count + 1,
                         updated_at = NOW()
                     WHERE id = ANY($1::varchar[])`,
                    [allCreativeIds]
                );

                await dbClient.query(
                    `UPDATE campaign_launch_jobs
                     SET status = 'SUCCEEDED',
                         current_step = 'SUCCEEDED',
                         error_step = NULL,
                         error_code = NULL,
                         error_message = NULL,
                         locked_at = NULL,
                         finished_at = NOW()
                     WHERE id = $1`,
                    [job.id]
                );

                await dbClient.query('COMMIT');
            } catch (dbErr) {
                await dbClient.query('ROLLBACK');
                throw dbErr;
            } finally {
                dbClient.release();
            }

            const modeLabel = isLiveModeAccount(acc) ? 'LIVE API' : 'Sandbox';
            const telemetry = await recordTelemetry({
                source: `Bulk Launcher (${bundle.channel} ${modeLabel})`,
                statusCode: 200,
                latencyMs: Math.max(20, Date.now() - startedAt),
                message: `Tạo thành công chiến dịch ${job.planned_campaign_name} (${groupIds.length} AdGroups, ${adIds.length} Ads, Cache Hits: ${mediaResult.cacheHits})`,
                payloadSummary: {
                    batchId: job.batch_id,
                    jobId: job.id,
                    platformCampaignId,
                    channel: bundle.channel,
                    cacheHits: mediaResult.cacheHits
                }
            });

            await this.broadcastJobUpdate(job.id);
            sseHub.broadcast('intraday_sync', {
                source: `Bulk Launcher (${bundle.channel})`,
                updatedRows: 1,
                campaignIds: [intradayCampaignId],
                spendDeltaTotal: 0,
                revDeltaTotal: 0,
                installsDeltaTotal: 0,
                telemetry
            });
        } catch (err) {
            const bErr = err instanceof BulkAdapterError
                ? err
                : new BulkAdapterError((err as Error).message || 'Lỗi không xác định', 'UNEXPECTED_ERROR', true);

            const allocations: CreativeGroupAllocation[] = Array.isArray(job.creative_allocation)
                ? job.creative_allocation
                : [];
            const allCreativeIds = Array.from(new Set(allocations.flatMap(g => g.creativeIds)));

            await pool.query(
                `UPDATE campaign_launch_jobs
                 SET status = 'FAILED',
                     current_step = 'FAILED',
                     error_step = $2,
                     error_code = $3,
                     error_message = $4,
                     is_retryable = $5,
                     locked_at = NULL,
                     finished_at = NOW()
                 WHERE id = $1`,
                [job.id, lastStep, bErr.code, bErr.message, bErr.retryable]
            );

            if (allCreativeIds.length > 0) {
                await pool.query(
                    `UPDATE creatives
                     SET campaign_failed_count = campaign_failed_count + 1,
                         updated_at = NOW()
                     WHERE id = ANY($1::varchar[])`,
                    [allCreativeIds]
                );
            }

            await recordTelemetry({
                source: `Bulk Launcher (${job.channel})`,
                statusCode: 400,
                latencyMs: Math.max(15, Date.now() - startedAt),
                message: `Lỗi tại ${lastStep} cho ${job.planned_campaign_name}: ${bErr.message}`,
                payloadSummary: { batchId: job.batch_id, jobId: job.id, errorCode: bErr.code }
            });

            await this.broadcastJobUpdate(job.id);
        } finally {
            await this.refreshBatchStatus(job.batch_id);
        }
    }
}

export const bulkLaunchWorker = new BulkLaunchWorker();
