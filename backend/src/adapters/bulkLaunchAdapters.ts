import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../db/pool.js';
import { config } from '../config.js';
import type { BulkChannel, CreativeRow, CreativeGroupAllocation } from '../services/batchPlanner.js';

export interface LaunchAccountInfo {
    id: string;
    name: string;
    channel: string;
    currency: string;
    access_token: string | null;
    api_config: Record<string, unknown>;
}

export interface LaunchPackageBundle {
    packageId: string;
    packageName: string;
    channel: BulkChannel;
    tacticIds: string[];
    appTemplate: {
        id: string;
        name: string;
        store_type: string;
        platform_app_id: string;
        bundle_id: string;
        store_url: string;
    };
    pageTemplate: {
        id: string;
        page_id: string;
        instagram_actor_id: string | null;
    } | null;
    campaignTemplate: {
        id: string;
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
    };
    adTemplate: {
        id: string;
        format: string;
        cta_type: string | null;
        copy_payload: Record<string, unknown>;
    };
}

export interface ResolvedMediaResult {
    mediaByCreativeId: Map<string, { remoteMediaId: string; remoteAssetRn?: string; cacheHit: boolean }>;
    cacheHits: number;
    uploadsPerformed: number;
}

export class BulkAdapterError extends Error {
    code: string;
    retryable: boolean;

    constructor(message: string, code = 'API_ERROR', retryable = true) {
        super(message);
        this.code = code;
        this.retryable = retryable;
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function isLiveModeAccount(acc: LaunchAccountInfo): boolean {
    return Boolean(acc.access_token && acc.access_token.trim().length > 0 && !acc.api_config?.sandboxOverride);
}

async function checkMetaUsageAndBackoff(accountId: string, headers: Headers): Promise<void> {
    const rawUsage = headers.get('x-ad-account-usage') || headers.get('x-business-use-case-usage');
    if (!rawUsage) return;

    try {
        const parsed = JSON.parse(rawUsage) as Record<string, unknown>;
        const text = JSON.stringify(parsed);
        const pctMatches = Array.from(text.matchAll(/"(?:call_count|total_cputime|total_time)"\s*:\s*(\d+)/g))
            .map(m => Number(m[1]));
        const maxPct = pctMatches.length > 0 ? Math.max(...pctMatches) : 0;
        if (maxPct >= 75) {
            const backoffUntil = new Date(Date.now() + 60_000).toISOString();
            await pool.query(
                `UPDATE ad_accounts
                 SET api_config = COALESCE(api_config, '{}'::jsonb) || jsonb_build_object('rate_limited_until', $2::text)
                 WHERE id = $1`,
                [accountId, backoffUntil]
            );
        }
    } catch {
        // Ignore unparseable headers
    }
}

async function graphFetch(
    accountId: string,
    urlPath: string,
    token: string,
    body: Record<string, unknown> | FormData
): Promise<Record<string, unknown>> {
    const url = `https://graph.facebook.com/v21.0/${urlPath.replace(/^\//, '')}`;
    const isForm = body instanceof FormData;
    const finalUrl = isForm ? `${url}${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}` : url;

    const resp = await fetch(finalUrl, {
        method: 'POST',
        headers: isForm ? undefined : { 'Content-Type': 'application/json' },
        body: isForm ? body : JSON.stringify({ ...body, access_token: token })
    });

    await checkMetaUsageAndBackoff(accountId, resp.headers);

    const json = await resp.json() as Record<string, unknown>;
    if (!resp.ok || json.error) {
        const errObj = (json.error || {}) as { code?: number; message?: string };
        const code = String(errObj.code || resp.status);
        const retryable = resp.status === 429 || ['4', '17', '80004'].includes(code);
        throw new BulkAdapterError(
            errObj.message || `Meta API HTTP ${resp.status}`,
            `META_${code}`,
            retryable
        );
    }
    return json;
}

export async function resolveJobMedia(
    channel: BulkChannel,
    acc: LaunchAccountInfo,
    creatives: CreativeRow[]
): Promise<ResolvedMediaResult> {
    const isLive = isLiveModeAccount(acc);
    const mediaByCreativeId = new Map<string, { remoteMediaId: string; remoteAssetRn?: string; cacheHit: boolean }>();
    let cacheHits = 0;
    let uploadsPerformed = 0;

    const ytPoolScope = (acc.api_config?.youtube_channel_id as string) || 'yt_apero_uac_pool_01';

    for (const cr of creatives) {
        if (channel === 'Facebook') {
            const cacheScope = acc.id;
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`Facebook|${cacheScope}|${cr.sha256_hash}`]);

                const existing = await client.query<{ remote_media_id: string; status: string }>(
                    `SELECT remote_media_id, status FROM ad_account_media_cache
                     WHERE channel = 'Facebook' AND scope_key = $1 AND creative_sha256 = $2`,
                    [cacheScope, cr.sha256_hash]
                );

                if (existing.rows[0]?.status === 'READY' && existing.rows[0].remote_media_id) {
                    mediaByCreativeId.set(cr.id, { remoteMediaId: existing.rows[0].remote_media_id, cacheHit: true });
                    cacheHits++;
                    await client.query('COMMIT');
                    continue;
                }

                let fbVideoId: string;
                if (isLive) {
                    const token = acc.access_token!.trim();
                    const publicBase = process.env.PUBLIC_MEDIA_BASE_URL?.trim();
                    if (publicBase && cr.public_url) {
                        const res = await graphFetch(acc.id, `${acc.id}/advideos`, token, {
                            name: cr.title,
                            file_url: `${publicBase.replace(/\/$/, '')}${cr.public_url}`
                        });
                        fbVideoId = String(res.id);
                    } else if (!cr.storage_path.startsWith('seed://')) {
                        const diskPath = path.resolve(config.frontendDir, 'backend', cr.storage_path);
                        const fileBuf = await fs.readFile(diskPath);
                        const fd = new FormData();
                        fd.append('title', cr.title);
                        fd.append('source', new Blob([fileBuf]), cr.file_name);
                        const res = await graphFetch(acc.id, `${acc.id}/advideos`, token, fd);
                        fbVideoId = String(res.id);
                    } else {
                        throw new BulkAdapterError(
                            `Creative "${cr.title}" chưa có file MP4 thật trên ổ đĩa để đẩy lên Meta Live API.`,
                            'MISSING_LOCAL_FILE',
                            false
                        );
                    }
                } else {
                    await sleep(120);
                    fbVideoId = `fb_vid_${cr.sha256_hash.slice(0, 12)}`;
                }

                await client.query(
                    `INSERT INTO ad_account_media_cache (channel, scope_key, creative_sha256, remote_media_id, status, updated_at)
                     VALUES ('Facebook', $1, $2, $3, 'READY', NOW())
                     ON CONFLICT (channel, scope_key, creative_sha256)
                     DO UPDATE SET remote_media_id = EXCLUDED.remote_media_id, status = 'READY', updated_at = NOW()`,
                    [cacheScope, cr.sha256_hash, fbVideoId]
                );
                await client.query('COMMIT');

                mediaByCreativeId.set(cr.id, { remoteMediaId: fbVideoId, cacheHit: false });
                uploadsPerformed++;
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        } else {
            // Google Ads UAC: 2-tier cache (YouTube Unlisted Video -> Google Ads Asset Resource Name)
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`Google|${acc.id}|${cr.sha256_hash}`]);

                let youtubeVideoId = cr.youtube_video_id || null;
                let wasCacheHit = Boolean(youtubeVideoId);

                if (!youtubeVideoId) {
                    const ytCache = await client.query<{ remote_media_id: string; status: string }>(
                        `SELECT remote_media_id, status FROM ad_account_media_cache
                         WHERE channel = 'YouTube' AND scope_key = $1 AND creative_sha256 = $2`,
                        [ytPoolScope, cr.sha256_hash]
                    );
                    if (ytCache.rows[0]?.status === 'READY' && ytCache.rows[0].remote_media_id) {
                        youtubeVideoId = ytCache.rows[0].remote_media_id;
                        wasCacheHit = true;
                    }
                }

                if (!youtubeVideoId) {
                    if (isLive) {
                        throw new BulkAdapterError(
                            `Creative "${cr.title}" chưa có youtube_video_id (YouTube Data API v3 upload cần OAuth kênh YouTube Unlisted).`,
                            'YOUTUBE_VIDEO_ID_REQUIRED',
                            false
                        );
                    }
                    await sleep(140);
                    youtubeVideoId = `yt_${cr.sha256_hash.slice(0, 11)}`;
                }

                await client.query(
                    `INSERT INTO ad_account_media_cache (channel, scope_key, creative_sha256, remote_media_id, status, updated_at)
                     VALUES ('YouTube', $1, $2, $3, 'READY', NOW())
                     ON CONFLICT (channel, scope_key, creative_sha256)
                     DO UPDATE SET remote_media_id = EXCLUDED.remote_media_id, status = 'READY', updated_at = NOW()`,
                    [ytPoolScope, cr.sha256_hash, youtubeVideoId]
                );

                // Tier 2: Google Ads Asset
                const assetCache = await client.query<{ remote_asset_rn: string; status: string }>(
                    `SELECT remote_asset_rn, status FROM ad_account_media_cache
                     WHERE channel = 'GoogleAsset' AND scope_key = $1 AND creative_sha256 = $2`,
                    [acc.id, cr.sha256_hash]
                );

                let assetRn = assetCache.rows[0]?.status === 'READY' ? assetCache.rows[0].remote_asset_rn : null;
                if (!assetRn) {
                    const cleanCid = acc.id.replace(/^act_/, '').replace(/-/g, '');
                    if (isLive) {
                        const devToken = String(acc.api_config?.developer_token || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '');
                        const resp = await fetch(`https://googleads.googleapis.com/v18/customers/${cleanCid}/assets:mutate`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${acc.access_token!.trim()}`,
                                'developer-token': devToken,
                                ...(acc.api_config?.login_customer_id ? { 'login-customer-id': String(acc.api_config.login_customer_id) } : {}),
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                operations: [{
                                    create: {
                                        name: cr.title.slice(0, 120),
                                        type: 'YOUTUBE_VIDEO',
                                        youtubeVideoAsset: { youtubeVideoId }
                                    }
                                }]
                            })
                        });
                        const json = await resp.json() as { results?: Array<{ resourceName?: string }>; error?: { message?: string } };
                        if (!resp.ok || !json.results?.[0]?.resourceName) {
                            throw new BulkAdapterError(json.error?.message || `Google Ads Asset HTTP ${resp.status}`, `GOOGLE_${resp.status}`, resp.status === 429);
                        }
                        assetRn = json.results[0].resourceName;
                    } else {
                        await sleep(90);
                        assetRn = `customers/${cleanCid}/assets/${cr.sha256_hash.slice(0, 10)}`;
                    }

                    await client.query(
                        `INSERT INTO ad_account_media_cache (channel, scope_key, creative_sha256, remote_media_id, remote_asset_rn, status, updated_at)
                         VALUES ('GoogleAsset', $1, $2, $3, $4, 'READY', NOW())
                         ON CONFLICT (channel, scope_key, creative_sha256)
                         DO UPDATE SET remote_asset_rn = EXCLUDED.remote_asset_rn, status = 'READY', updated_at = NOW()`,
                        [acc.id, cr.sha256_hash, youtubeVideoId, assetRn]
                    );
                }

                await client.query('COMMIT');
                mediaByCreativeId.set(cr.id, { remoteMediaId: youtubeVideoId, remoteAssetRn: assetRn, cacheHit: wasCacheHit });
                if (wasCacheHit) cacheHits++;
                else uploadsPerformed++;
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        }
    }

    return { mediaByCreativeId, cacheHits, uploadsPerformed };
}

export async function createPausedCampaignStep(
    acc: LaunchAccountInfo,
    bundle: LaunchPackageBundle,
    campaignName: string,
    dailyBudgetVnd: number,
    exchangeRate: number
): Promise<{ platformCampaignId: string; platformBudgetRn?: string }> {
    const isLive = isLiveModeAccount(acc);

    if (bundle.channel === 'Facebook') {
        if (!isLive) {
            await sleep(160);
            return { platformCampaignId: `sbx_fb_${Date.now().toString(36)}_${Math.floor(Math.random() * 999)}` };
        }
        const token = acc.access_token!.trim();
        const isUsdAcc = acc.currency.toUpperCase() === 'USD';
        const budgetInAccUnit = isUsdAcc
            ? Math.max(100, Math.round((dailyBudgetVnd / exchangeRate) * 100))
            : Math.max(25000, Math.round(dailyBudgetVnd));

        const res = await graphFetch(acc.id, `${acc.id}/campaigns`, token, {
            name: campaignName,
            objective: 'OUTCOME_APP_PROMOTION',
            buying_type: 'AUCTION',
            status: 'PAUSED',
            special_ad_categories: [],
            daily_budget: budgetInAccUnit,
            bid_strategy: bundle.campaignTemplate.roas_goal ? 'LOWEST_COST_WITH_MIN_ROAS' : 'LOWEST_COST_WITHOUT_CAP'
        });
        return { platformCampaignId: String(res.id) };
    }

    // Google Ads UAC: Sandbox creates logical ID; Live API creates Atomic Batch in createAdGroupsStep or Budget+Campaign here
    if (!isLive) {
        await sleep(170);
        const cleanCid = acc.id.replace(/^act_/, '');
        const randId = `${Date.now().toString().slice(-6)}${Math.floor(100 + Math.random() * 899)}`;
        return {
            platformCampaignId: `sbx_gg_${randId}`,
            platformBudgetRn: `customers/${cleanCid}/campaignBudgets/b_${randId}`
        };
    }

    const cleanCid = acc.id.replace(/^act_/, '');
    const devToken = String(acc.api_config?.developer_token || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '');
    const headers = {
        'Authorization': `Bearer ${acc.access_token!.trim()}`,
        'developer-token': devToken,
        ...(acc.api_config?.login_customer_id ? { 'login-customer-id': String(acc.api_config.login_customer_id) } : {}),
        'Content-Type': 'application/json'
    };

    const budgetMicros = String(
        acc.currency.toUpperCase() === 'USD'
            ? Math.round((dailyBudgetVnd / exchangeRate) * 1_000_000)
            : Math.round(dailyBudgetVnd * 1_000_000)
    );

    const mutateResp = await fetch(`https://googleads.googleapis.com/v18/customers/${cleanCid}/googleAds:mutate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            mutateOperations: [
                {
                    campaignBudgetOperation: {
                        create: {
                            resourceName: `customers/${cleanCid}/campaignBudgets/-1`,
                            name: `Budget_${campaignName}`.slice(0, 120),
                            amountMicros: budgetMicros,
                            explicitlyShared: false
                        }
                    }
                },
                {
                    campaignOperation: {
                        create: {
                            resourceName: `customers/${cleanCid}/campaigns/-2`,
                            name: campaignName,
                            status: 'PAUSED',
                            advertisingChannelType: 'MULTI_CHANNEL',
                            advertisingChannelSubType: 'APP_CAMPAIGN',
                            campaignBudget: `customers/${cleanCid}/campaignBudgets/-1`,
                            biddingStrategyType: bundle.campaignTemplate.roas_goal ? 'TARGET_ROAS' : 'TARGET_CPA',
                            ...(bundle.campaignTemplate.roas_goal
                                ? { targetRoas: { targetRoas: Number(bundle.campaignTemplate.roas_goal) / 100 } }
                                : { targetCpa: { targetCpaMicros: String(Math.round((bundle.campaignTemplate.target_cpa || 0.15) * 1_000_000)) } }),
                            appCampaignSetting: {
                                appId: bundle.appTemplate.bundle_id,
                                appStore: bundle.appTemplate.store_type === 'APP_STORE' ? 'APPLE_APP_STORE' : 'GOOGLE_APP_STORE',
                                biddingStrategyGoalType: String(
                                    bundle.campaignTemplate.platform_extras?.bidding_strategy_goal_type || 'OPTIMIZE_INSTALLS_TARGET_INSTALL_COST'
                                )
                            }
                        }
                    }
                }
            ]
        })
    });

    const json = await mutateResp.json() as {
        mutateOperationResponses?: Array<{ campaignBudgetResult?: { resourceName?: string }; campaignResult?: { resourceName?: string } }>;
        error?: { message?: string };
    };
    if (!mutateResp.ok || !json.mutateOperationResponses?.[1]?.campaignResult?.resourceName) {
        throw new BulkAdapterError(json.error?.message || `Google Campaign HTTP ${mutateResp.status}`, `GOOGLE_${mutateResp.status}`, mutateResp.status === 429);
    }
    const campRn = json.mutateOperationResponses[1].campaignResult.resourceName;
    const budgetRn = json.mutateOperationResponses[0].campaignBudgetResult?.resourceName;
    return { platformCampaignId: campRn.split('/').pop() || campRn, platformBudgetRn: budgetRn };
}

export async function createAdGroupsStep(
    acc: LaunchAccountInfo,
    bundle: LaunchPackageBundle,
    platformCampaignId: string,
    campaignName: string,
    allocations: CreativeGroupAllocation[],
    existingGroupIds: string[]
): Promise<string[]> {
    const isLive = isLiveModeAccount(acc);
    const groupIds = [...existingGroupIds];

    for (let i = groupIds.length; i < allocations.length; i++) {
        const grp = allocations[i];
        if (!isLive) {
            await sleep(130);
            groupIds.push(`sbx_ag_${platformCampaignId.slice(-6)}_g${grp.groupIndex}`);
            continue;
        }

        if (bundle.channel === 'Facebook') {
            const token = acc.access_token!.trim();
            const countries = bundle.campaignTemplate.is_worldwide || bundle.campaignTemplate.country_codes.length === 0
                ? ['US', 'CA', 'AU', 'GB', 'IN']
                : bundle.campaignTemplate.country_codes;

            const res = await graphFetch(acc.id, `${acc.id}/adsets`, token, {
                name: `${campaignName}_AdSet_${grp.groupIndex}`,
                campaign_id: platformCampaignId,
                status: 'ACTIVE',
                billing_event: 'IMPRESSIONS',
                optimization_goal: bundle.campaignTemplate.performance_goal === 'MAXIMIZE_INSTALLS' ? 'APP_INSTALLS' : 'VALUE',
                promoted_object: {
                    application_id: bundle.appTemplate.platform_app_id,
                    object_store_url: bundle.appTemplate.store_url,
                    custom_event_type: bundle.campaignTemplate.convert_event || 'AD_IMPRESSION'
                },
                targeting: {
                    geo_locations: { countries },
                    user_os: ['Android_ver_9.0_and_above']
                },
                attribution_spec: [
                    { event_type: 'CLICK_THROUGH', window_days: 1 },
                    { event_type: 'VIEW_THROUGH', window_days: 1 }
                ]
            });
            groupIds.push(String(res.id));
        } else {
            const cleanCid = acc.id.replace(/^act_/, '');
            const devToken = String(acc.api_config?.developer_token || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '');
            const resp = await fetch(`https://googleads.googleapis.com/v18/customers/${cleanCid}/adGroups:mutate`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${acc.access_token!.trim()}`,
                    'developer-token': devToken,
                    ...(acc.api_config?.login_customer_id ? { 'login-customer-id': String(acc.api_config.login_customer_id) } : {}),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    operations: [{
                        create: {
                            name: `${campaignName}_AdGroup_${grp.groupIndex}`.slice(0, 120),
                            campaign: `customers/${cleanCid}/campaigns/${platformCampaignId}`,
                            status: 'ENABLED'
                        }
                    }]
                })
            });
            const json = await resp.json() as { results?: Array<{ resourceName?: string }>; error?: { message?: string } };
            if (!resp.ok || !json.results?.[0]?.resourceName) {
                throw new BulkAdapterError(json.error?.message || `Google AdGroup HTTP ${resp.status}`, `GOOGLE_${resp.status}`, resp.status === 429);
            }
            groupIds.push(json.results[0].resourceName);
        }
    }

    return groupIds;
}

export async function createAdsStep(
    acc: LaunchAccountInfo,
    bundle: LaunchPackageBundle,
    campaignName: string,
    allocations: CreativeGroupAllocation[],
    groupIds: string[],
    mediaResult: ResolvedMediaResult,
    existingAdIds: string[]
): Promise<string[]> {
    const isLive = isLiveModeAccount(acc);
    const adIds = [...existingAdIds];

    if (bundle.channel === 'Facebook') {
        let totalExpectedIdx = 0;
        for (let gIdx = 0; gIdx < allocations.length; gIdx++) {
            const grp = allocations[gIdx];
            const adSetId = groupIds[gIdx];
            for (const crId of grp.creativeIds) {
                if (totalExpectedIdx < adIds.length) {
                    totalExpectedIdx++;
                    continue;
                }
                if (!isLive) {
                    await sleep(110);
                    adIds.push(`sbx_ad_${adSetId.slice(-6)}_${totalExpectedIdx + 1}`);
                    totalExpectedIdx++;
                    continue;
                }

                const token = acc.access_token!.trim();
                const media = mediaResult.mediaByCreativeId.get(crId);
                const copy = bundle.adTemplate.copy_payload || {};
                const bodies = ((copy.primary_texts as string[]) || ['Download app now!']).map(text => ({ text }));
                const titles = ((copy.headlines as string[]) || ['Try AI Video Maker']).map(text => ({ text }));
                const descriptions = ((copy.descriptions as string[]) || ['5M+ creators']).map(text => ({ text }));

                const creativeRes = await graphFetch(acc.id, `${acc.id}/adcreatives`, token, {
                    name: `${campaignName}_Cr_${totalExpectedIdx + 1}`,
                    object_story_spec: {
                        page_id: bundle.pageTemplate?.page_id
                    },
                    asset_feed_spec: {
                        videos: [{ video_id: media?.remoteMediaId }],
                        bodies,
                        titles,
                        descriptions,
                        call_to_action_types: [bundle.adTemplate.cta_type || 'INSTALL_MOBILE_APP'],
                        ad_formats: ['SINGLE_VIDEO'],
                        link_urls: [{ website_url: bundle.appTemplate.store_url }]
                    }
                });

                const adRes = await graphFetch(acc.id, `${acc.id}/ads`, token, {
                    name: `${campaignName}_Ad_${totalExpectedIdx + 1}`,
                    adset_id: adSetId,
                    creative: { creative_id: String(creativeRes.id) },
                    status: 'ACTIVE'
                });
                adIds.push(String(adRes.id));
                totalExpectedIdx++;
            }
        }
        return adIds;
    }

    // Google Ads UAC: 1 AppAd per AdGroup holding up to 20 YouTube video assets + Copy Group
    for (let gIdx = adIds.length; gIdx < allocations.length; gIdx++) {
        const grp = allocations[gIdx];
        const adGroupRn = groupIds[gIdx];
        if (!isLive) {
            await sleep(120);
            adIds.push(`sbx_uac_ad_${adGroupRn.slice(-6)}`);
            continue;
        }

        const cleanCid = acc.id.replace(/^act_/, '');
        const devToken = String(acc.api_config?.developer_token || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '');
        const copyGroups = (bundle.adTemplate.copy_payload?.groups as Array<{ headlines: string[]; descriptions: string[] }>) || [];
        const pickedCopy = copyGroups[gIdx % Math.max(1, copyGroups.length)] || {
            headlines: ['AI Video Generator', 'Create Videos Fast'],
            descriptions: ['Turn your photos into viral AI videos in seconds!']
        };

        const youtubeVideos = grp.creativeIds
            .map(cid => mediaResult.mediaByCreativeId.get(cid)?.remoteAssetRn)
            .filter(Boolean)
            .map(asset => ({ asset }));

        const resp = await fetch(`https://googleads.googleapis.com/v18/customers/${cleanCid}/adGroupAds:mutate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${acc.access_token!.trim()}`,
                'developer-token': devToken,
                ...(acc.api_config?.login_customer_id ? { 'login-customer-id': String(acc.api_config.login_customer_id) } : {}),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                operations: [{
                    create: {
                        adGroup: adGroupRn,
                        status: 'ENABLED',
                        ad: {
                            appAd: {
                                headlines: pickedCopy.headlines.map(text => ({ text })),
                                descriptions: pickedCopy.descriptions.map(text => ({ text })),
                                youtubeVideos
                            }
                        }
                    }
                }]
            })
        });
        const json = await resp.json() as { results?: Array<{ resourceName?: string }>; error?: { message?: string } };
        if (!resp.ok || !json.results?.[0]?.resourceName) {
            throw new BulkAdapterError(json.error?.message || `Google AppAd HTTP ${resp.status}`, `GOOGLE_${resp.status}`, resp.status === 429);
        }
        adIds.push(json.results[0].resourceName);
    }

    return adIds;
}

export async function activateCampaignStep(
    acc: LaunchAccountInfo,
    channel: BulkChannel,
    platformCampaignId: string
): Promise<void> {
    if (!isLiveModeAccount(acc)) {
        await sleep(100);
        return;
    }

    if (channel === 'Facebook') {
        await graphFetch(acc.id, platformCampaignId, acc.access_token!.trim(), {
            status: 'ACTIVE'
        });
        return;
    }

    const cleanCid = acc.id.replace(/^act_/, '');
    const devToken = String(acc.api_config?.developer_token || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '');
    const resp = await fetch(`https://googleads.googleapis.com/v18/customers/${cleanCid}/campaigns:mutate`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${acc.access_token!.trim()}`,
            'developer-token': devToken,
            ...(acc.api_config?.login_customer_id ? { 'login-customer-id': String(acc.api_config.login_customer_id) } : {}),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            operations: [{
                update: {
                    resourceName: `customers/${cleanCid}/campaigns/${platformCampaignId}`,
                    status: 'ENABLED'
                },
                updateMask: 'status'
            }]
        })
    });
    if (!resp.ok) {
        const json = await resp.json() as { error?: { message?: string } };
        throw new BulkAdapterError(json.error?.message || `Google Activate HTTP ${resp.status}`, `GOOGLE_${resp.status}`, resp.status === 429);
    }
}
