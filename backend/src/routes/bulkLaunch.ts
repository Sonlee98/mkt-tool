import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { buildBulkLaunchPlan, makeId } from '../services/batchPlanner.js';
import { bulkLaunchWorker } from '../workers/bulkLaunchWorker.js';

function formatJobRow(r: Record<string, unknown>) {
    return {
        id: r.id,
        batchId: r.batch_id,
        packageId: r.package_id,
        adAccountId: r.ad_account_id,
        productId: r.product_id,
        channel: r.channel,
        plannedCampaignName: r.planned_campaign_name,
        creativeAllocation: r.creative_allocation,
        currentStep: r.current_step,
        status: r.status,
        executionMode: r.execution_mode,
        platformCampaignId: r.platform_campaign_id,
        adGroupsCount: Array.isArray(r.platform_adgroup_ids) ? r.platform_adgroup_ids.length : 0,
        adsCount: Array.isArray(r.platform_ad_ids) ? r.platform_ad_ids.length : 0,
        errorStep: r.error_step,
        errorCode: r.error_code,
        errorMessage: r.error_message,
        isRetryable: Boolean(r.is_retryable),
        attemptCount: Number(r.attempt_count || 0),
        startedAt: r.started_at,
        finishedAt: r.finished_at
    };
}

export async function bulkLaunchRoutes(app: FastifyInstance): Promise<void> {
    app.post<{
        Body: { creativeIds?: string[]; packageIds?: string[] };
    }>('/api/v1/campaigns/bulk-preview', async (req, reply) => {
        try {
            const creativeIds = Array.isArray(req.body?.creativeIds) ? req.body.creativeIds : [];
            const packageIds = Array.isArray(req.body?.packageIds) ? req.body.packageIds : [];
            const plan = await buildBulkLaunchPlan(creativeIds, packageIds);
            return {
                ok: true,
                summary: plan.summary,
                warnings: plan.warnings,
                planPreview: plan.planPreview,
                plannedJobs: plan.plannedJobs
            };
        } catch (err) {
            return reply.code(400).send({ ok: false, error: (err as Error).message });
        }
    });

    app.post<{
        Body: {
            creativeIds?: string[];
            packageIds?: string[];
            idempotencyKey?: string;
            createdBy?: string;
            options?: Record<string, unknown>;
        };
    }>('/api/v1/campaigns/bulk-launch', async (req, reply) => {
        const b = req.body || {};
        const headerKey = req.headers['idempotency-key'];
        const idempotencyKey = (
            (typeof headerKey === 'string' ? headerKey : '') ||
            b.idempotencyKey ||
            makeId('idem')
        ).trim();

        // Idempotency guard: return existing batch if already submitted
        const existingBatch = await pool.query(
            `SELECT * FROM bulk_launch_batches WHERE idempotency_key = $1`,
            [idempotencyKey]
        );
        if (existingBatch.rows[0]) {
            const batch = existingBatch.rows[0];
            const { rows: jobs } = await pool.query(
                `SELECT * FROM campaign_launch_jobs WHERE batch_id = $1 ORDER BY created_at ASC`,
                [batch.id]
            );
            return reply.code(200).send({
                ok: true,
                deduplicated: true,
                batchId: batch.id,
                status: batch.status,
                totalJobs: batch.total_jobs,
                jobs: jobs.map(formatJobRow)
            });
        }

        let plan;
        try {
            plan = await buildBulkLaunchPlan(
                Array.isArray(b.creativeIds) ? b.creativeIds : [],
                Array.isArray(b.packageIds) ? b.packageIds : []
            );
        } catch (err) {
            return reply.code(400).send({ ok: false, error: (err as Error).message });
        }

        const options = Object.assign({}, b.options || {});
        if (plan.summary.exceedsBudgetGuardrail && !Boolean(options.allowHighBudget)) {
            return reply.code(400).send({
                ok: false,
                code: 'BUDGET_GUARDRAIL_BLOCKED',
                error: plan.summary.guardrailReason || 'Vượt trần ngân sách an toàn mặc định. Vui lòng xác nhận cho phép vượt trần.',
                summary: plan.summary
            });
        }

        const batchId = makeId('batch');
        const createdJobs: Array<Record<string, unknown>> = [];

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const plannedJobIds = plan.plannedJobs.map(() => makeId('job'));
            if (options.simulateFailOnce && !options.targetJobId && plannedJobIds.length > 0) {
                options.targetJobId = plannedJobIds[0];
            }

            await client.query(
                `INSERT INTO bulk_launch_batches (
                    id, idempotency_key, created_by, selected_creative_ids, selected_package_ids,
                    total_jobs, succeeded_jobs, failed_jobs, status, options
                 ) VALUES ($1,$2,$3,$4,$5,$6,0,0,'RUNNING',$7::jsonb)`,
                [
                    batchId,
                    idempotencyKey,
                    String(b.createdBy || 'HoangNC'),
                    b.creativeIds || [],
                    b.packageIds || [],
                    plan.plannedJobs.length,
                    JSON.stringify(options)
                ]
            );

            for (let i = 0; i < plan.plannedJobs.length; i++) {
                const j = plan.plannedJobs[i];
                const jobId = plannedJobIds[i];
                const { rows } = await client.query(
                    `INSERT INTO campaign_launch_jobs (
                        id, batch_id, package_id, ad_account_id, product_id, channel,
                        planned_campaign_name, creative_allocation, current_step, status, execution_mode
                     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'QUEUED','QUEUED',$9)
                     RETURNING *`,
                    [
                        jobId,
                        batchId,
                        j.packageId,
                        j.adAccountId,
                        j.productId,
                        j.channel,
                        j.plannedCampaignName,
                        JSON.stringify(j.creativeAllocation),
                        j.executionMode
                    ]
                );
                createdJobs.push(rows[0]);
            }

            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

        bulkLaunchWorker.nudge();

        return reply.code(202).send({
            ok: true,
            deduplicated: false,
            batchId,
            status: 'RUNNING',
            launchPaused: Boolean(options.launchPaused),
            totalJobs: createdJobs.length,
            summary: plan.summary,
            jobs: createdJobs.map(formatJobRow)
        });
    });

    app.get('/api/v1/campaigns/batches', async () => {
        const { rows } = await pool.query(
            `SELECT * FROM bulk_launch_batches ORDER BY created_at DESC LIMIT 20`
        );
        return {
            ok: true,
            batches: rows.map(b => ({
                id: b.id,
                status: b.status,
                launchPaused: Boolean((b.options as Record<string, unknown> | null)?.launchPaused),
                totalJobs: b.total_jobs,
                succeededJobs: b.succeeded_jobs,
                failedJobs: b.failed_jobs,
                createdAt: b.created_at,
                completedAt: b.completed_at
            }))
        };
    });

    app.get<{ Params: { batchId: string } }>('/api/v1/campaigns/batches/:batchId', async (req, reply) => {
        const [batchRes, jobsRes] = await Promise.all([
            pool.query('SELECT * FROM bulk_launch_batches WHERE id = $1', [req.params.batchId]),
            pool.query('SELECT * FROM campaign_launch_jobs WHERE batch_id = $1 ORDER BY created_at ASC', [req.params.batchId])
        ]);

        const batch = batchRes.rows[0];
        if (!batch) {
            return reply.code(404).send({ ok: false, error: 'Không tìm thấy Batch.' });
        }

        return {
            ok: true,
            batch: {
                id: batch.id,
                status: batch.status,
                launchPaused: Boolean((batch.options as Record<string, unknown> | null)?.launchPaused),
                totalJobs: batch.total_jobs,
                succeededJobs: batch.succeeded_jobs,
                failedJobs: batch.failed_jobs,
                createdAt: batch.created_at,
                completedAt: batch.completed_at
            },
            jobs: jobsRes.rows.map(formatJobRow)
        };
    });

    app.post<{ Params: { jobId: string } }>('/api/v1/campaigns/jobs/:jobId/retry', async (req, reply) => {
        const { rows } = await pool.query<{
            id: string;
            batch_id: string;
            status: string;
            creative_allocation: Array<{ creativeIds: string[] }>;
        }>(
            `SELECT id, batch_id, status, creative_allocation FROM campaign_launch_jobs WHERE id = $1`,
            [req.params.jobId]
        );
        const job = rows[0];
        if (!job) {
            return reply.code(404).send({ ok: false, error: 'Không tìm thấy Job.' });
        }
        if (job.status !== 'FAILED') {
            return reply.code(400).send({ ok: false, error: `Job đang ở trạng thái ${job.status}, không thể retry.` });
        }

        const crIds = Array.from(new Set((job.creative_allocation || []).flatMap(g => g.creativeIds || [])));
        if (crIds.length > 0) {
            await pool.query(
                `UPDATE creatives SET campaign_failed_count = GREATEST(0, campaign_failed_count - 1)
                 WHERE id = ANY($1::varchar[])`,
                [crIds]
            );
        }

        await pool.query(
            `UPDATE campaign_launch_jobs
             SET status = 'QUEUED',
                 current_step = 'QUEUED',
                 next_run_at = NOW(),
                 locked_at = NULL,
                 finished_at = NULL
             WHERE id = $1`,
            [job.id]
        );
        await pool.query(
            `UPDATE bulk_launch_batches SET status = 'RUNNING', completed_at = NULL WHERE id = $1`,
            [job.batch_id]
        );

        bulkLaunchWorker.nudge();
        return { ok: true, jobId: job.id, batchId: job.batch_id, status: 'QUEUED' };
    });

    app.post<{ Params: { batchId: string } }>('/api/v1/campaigns/batches/:batchId/retry-failed', async (req, reply) => {
        const { rows: failedJobs } = await pool.query<{
            id: string;
            creative_allocation: Array<{ creativeIds: string[] }>;
        }>(
            `SELECT id, creative_allocation FROM campaign_launch_jobs
             WHERE batch_id = $1 AND status = 'FAILED' AND is_retryable = TRUE`,
            [req.params.batchId]
        );

        if (failedJobs.length === 0) {
            return reply.code(400).send({ ok: false, error: 'Không có Job lỗi nào đủ điều kiện Retry.' });
        }

        for (const job of failedJobs) {
            const crIds = Array.from(new Set((job.creative_allocation || []).flatMap(g => g.creativeIds || [])));
            if (crIds.length > 0) {
                await pool.query(
                    `UPDATE creatives SET campaign_failed_count = GREATEST(0, campaign_failed_count - 1)
                     WHERE id = ANY($1::varchar[])`,
                    [crIds]
                );
            }
        }

        await pool.query(
            `UPDATE campaign_launch_jobs
             SET status = 'QUEUED',
                 current_step = 'QUEUED',
                 next_run_at = NOW(),
                 locked_at = NULL,
                 finished_at = NULL
             WHERE batch_id = $1 AND status = 'FAILED' AND is_retryable = TRUE`,
            [req.params.batchId]
        );
        await pool.query(
            `UPDATE bulk_launch_batches SET status = 'RUNNING', completed_at = NULL WHERE id = $1`,
            [req.params.batchId]
        );

        bulkLaunchWorker.nudge();
        return { ok: true, retriedCount: failedJobs.length };
    });
}
