import crypto from 'node:crypto';
import { pool } from '../db/pool.js';
import { getAppSettings } from './telemetryService.js';
import { getNowInTz } from '../utils/time.js';

export type BulkChannel = 'Facebook' | 'Google Ads';

export function normalizeBulkChannel(raw?: string | null): BulkChannel {
    const val = (raw || 'Facebook').trim().toLowerCase();
    if (val.includes('google') || val === 'uac') return 'Google Ads';
    return 'Facebook';
}

export function normalizeGeneralChannel(raw?: string | null): string {
    const val = (raw || 'Facebook').trim().toLowerCase();
    if (val.includes('google') || val === 'uac') return 'Google Ads';
    if (val.includes('tiktok')) return 'TikTok';
    if (val.includes('mintegral')) return 'Mintegral';
    return 'Facebook';
}

export interface GoogleAdGroupCopy {
    group_index?: number;
    theme_name?: string;
    headlines: string[];
    descriptions: string[];
}

export function validateGoogleAdCopyPayload(copyPayload: Record<string, unknown>): string[] {
    const errors: string[] = [];
    const groups = Array.isArray(copyPayload?.groups) ? (copyPayload.groups as GoogleAdGroupCopy[]) : [];
    if (groups.length === 0) {
        errors.push('Google Ads UAC Ad Template phải có ít nhất 1 Copy Group (groups[]).');
        return errors;
    }

    groups.forEach((grp, idx) => {
        const gLabel = `Group #${idx + 1}`;
        const headlines = Array.isArray(grp.headlines) ? grp.headlines.map(h => String(h).trim()).filter(Boolean) : [];
        const descriptions = Array.isArray(grp.descriptions) ? grp.descriptions.map(d => String(d).trim()).filter(Boolean) : [];

        if (headlines.length < 2 || headlines.length > 5) {
            errors.push(`${gLabel}: Google UAC yêu cầu từ 2 đến 5 Headlines (hiện có ${headlines.length}).`);
        }
        headlines.forEach((h, hIdx) => {
            if (h.length > 30) {
                errors.push(`${gLabel} Headline #${hIdx + 1} vượt quá 30 ký tự (${h.length}/30): "${h}".`);
            }
        });

        if (descriptions.length < 1 || descriptions.length > 5) {
            errors.push(`${gLabel}: Google UAC yêu cầu từ 1 đến 5 Descriptions (hiện có ${descriptions.length}).`);
        }
        descriptions.forEach((d, dIdx) => {
            if (d.length > 90) {
                errors.push(`${gLabel} Description #${dIdx + 1} vượt quá 90 ký tự (${d.length}/90).`);
            }
        });
    });

    return errors;
}

export interface PackageValidationInput {
    channel: string;
    appTemplateId: string;
    campaignTemplateId: string;
    adTemplateId: string;
    pageTemplateId?: string | null;
    adAccountId: string;
}

export async function validatePackageInput(input: PackageValidationInput): Promise<{ channel: BulkChannel; errors: string[] }> {
    const channel = normalizeBulkChannel(input.channel);
    const errors: string[] = [];

    const [appRes, camRes, adRes, accRes] = await Promise.all([
        pool.query<{ id: string; channel: string }>('SELECT id, channel FROM app_templates WHERE id = $1', [input.appTemplateId]),
        pool.query<{ id: string; channel: string; creative_volume: number; ad_group_volume: number }>(
            'SELECT id, channel, creative_volume, ad_group_volume FROM campaign_templates WHERE id = $1',
            [input.campaignTemplateId]
        ),
        pool.query<{ id: string; channel: string; copy_payload: Record<string, unknown> }>(
            'SELECT id, channel, copy_payload FROM ad_templates WHERE id = $1',
            [input.adTemplateId]
        ),
        pool.query<{ id: string; channel: string }>('SELECT id, channel FROM ad_accounts WHERE id = $1', [input.adAccountId])
    ]);

    const app = appRes.rows[0];
    const cam = camRes.rows[0];
    const ad = adRes.rows[0];
    const acc = accRes.rows[0];

    if (!app) errors.push(`Không tìm thấy App Template "${input.appTemplateId}".`);
    if (!cam) errors.push(`Không tìm thấy Campaign Template "${input.campaignTemplateId}".`);
    if (!ad) errors.push(`Không tìm thấy Ad Template "${input.adTemplateId}".`);
    if (!acc) errors.push(`Không tìm thấy Ad Account "${input.adAccountId}".`);

    if (app && normalizeGeneralChannel(app.channel) !== channel) {
        errors.push(`Kênh của App Template (${app.channel}) không khớp kênh Package (${channel}).`);
    }
    if (cam && normalizeGeneralChannel(cam.channel) !== channel) {
        errors.push(`Kênh của Campaign Template (${cam.channel}) không khớp kênh Package (${channel}).`);
    }
    if (ad && normalizeGeneralChannel(ad.channel) !== channel) {
        errors.push(`Kênh của Ad Template (${ad.channel}) không khớp kênh Package (${channel}).`);
    }
    if (acc && normalizeGeneralChannel(acc.channel) !== channel) {
        errors.push(`Kênh của Ad Account (${acc.channel}) không khớp kênh Package (${channel}).`);
    }

    if (channel === 'Facebook') {
        if (!input.pageTemplateId) {
            errors.push('Package Facebook bắt buộc phải chọn Fanpage (Page Template).');
        } else {
            const pageRes = await pool.query<{ id: string; channel: string }>(
                'SELECT id, channel FROM page_templates WHERE id = $1',
                [input.pageTemplateId]
            );
            if (!pageRes.rows[0]) {
                errors.push(`Không tìm thấy Page Template "${input.pageTemplateId}".`);
            }
        }
    }

    if (channel === 'Google Ads') {
        if (cam && cam.creative_volume > 20) {
            errors.push(`Google Ads UAC chỉ cho phép tối đa 20 video/Ad Group (hiện cấu hình ${cam.creative_volume}).`);
        }
        if (ad) {
            errors.push(...validateGoogleAdCopyPayload(ad.copy_payload));
        }
    }

    return { channel, errors };
}

export interface CreativeRow {
    id: string;
    title: string;
    file_name: string;
    sha256_hash: string;
    storage_path: string;
    public_url: string | null;
    product_id: string;
    angle_code: string | null;
    language_code: string | null;
    market_target: string | null;
    tiktok_policy: string;
    meta_policy: string;
    google_policy: string;
    youtube_video_id: string | null;
}

export interface CreativeGroupAllocation {
    groupIndex: number;
    creativeIds: string[];
}

export interface PlannedJobSpec {
    packageId: string;
    packageName: string;
    adAccountId: string;
    adAccountName: string;
    productId: string;
    channel: BulkChannel;
    plannedCampaignName: string;
    creativeAllocation: CreativeGroupAllocation[];
    dailyBudgetVnd: number;
    dailyBudgetUsd: number;
    budgetCurrency: string;
    executionMode: 'live_api' | 'server_sandbox';
    cacheHits: number;
    uploadsNeeded: number;
}

export interface BulkLaunchPlan {
    summary: {
        totalCreatives: number;
        totalPackages: number;
        totalCampaignsToCreate: number;
        totalAdGroupsToCreate: number;
        totalAdsToCreate: number;
        estimatedDailyBudgetVnd: number;
        estimatedDailyBudgetUsd: number;
        mediaCacheHitCount: number;
        mediaUploadNeededCount: number;
        estimatedYoutubeQuotaUnits: number;
        exchangeRateVnd: number;
    };
    warnings: Array<{ code: string; creativeId?: string; message: string }>;
    planPreview: Array<{
        packageId: string;
        packageName: string;
        channel: BulkChannel;
        adAccount: string;
        executionMode: 'live_api' | 'server_sandbox';
        adGroupVolume: number;
        creativeVolume: number;
        campaignsCount: number;
        adGroupsCount: number;
        adsCount: number;
        estimatedDailyBudgetVnd: number;
        sampleCampaignNames: string[];
    }>;
    plannedJobs: PlannedJobSpec[];
}

function sanitizeToken(val: string | null | undefined, fallback: string, maxLen = 16): string {
    const clean = (val || fallback)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '')
        .slice(0, maxLen);
    return clean || fallback;
}

function renderCampaignName(params: {
    template: string;
    productId: string;
    channel: BulkChannel;
    countries: string[];
    isWorldwide: boolean;
    leadCreative: CreativeRow;
    packageName: string;
    accountId: string;
    index: number;
}): string {
    const tzNow = getNowInTz();
    const dateCompact = tzNow.ddMm.replace('/', '');
    const channelShort = params.channel === 'Facebook' ? 'FB' : 'UAC';
    const geoShort = params.isWorldwide ? 'GLB' : sanitizeToken(params.countries[0] || 'US', 'GLB', 6).toUpperCase();
    const angleShort = sanitizeToken(params.leadCreative.angle_code, 'Mix', 14);
    const langShort = sanitizeToken(params.leadCreative.language_code, 'EN', 6).toUpperCase();
    const pkgTag = sanitizeToken(params.packageName.split('-')[1] || params.packageName, 'AUTO', 10).toUpperCase();
    const accShort = sanitizeToken(params.accountId.slice(-4), 'ACC', 6).toUpperCase();
    const idxStr = String(params.index + 1).padStart(2, '0');

    const rendered = (params.template || '{product}_{channel}_{geo}_{angle}_{lang}_{pkg_tag}_{acc_short}_{date}_{idx}')
        .replace(/\{product\}/g, params.productId)
        .replace(/\{channel\}/g, channelShort)
        .replace(/\{geo\}/g, geoShort)
        .replace(/\{angle\}/g, angleShort)
        .replace(/\{lang\}/g, langShort)
        .replace(/\{pkg_tag\}/g, pkgTag)
        .replace(/\{acc_short\}/g, accShort)
        .replace(/\{date\}/g, dateCompact)
        .replace(/\{idx\}/g, idxStr);

    const maxLen = params.channel === 'Google Ads' ? 120 : 200;
    return rendered.slice(0, maxLen);
}

export async function buildBulkLaunchPlan(creativeIds: string[], packageIds: string[]): Promise<BulkLaunchPlan> {
    const uniqueCreativeIds = Array.from(new Set(creativeIds.map(id => id.trim()).filter(Boolean)));
    const uniquePackageIds = Array.from(new Set(packageIds.map(id => id.trim()).filter(Boolean)));

    if (uniqueCreativeIds.length === 0) {
        throw new Error('Vui lòng chọn ít nhất 1 Creative.');
    }
    if (uniquePackageIds.length === 0) {
        throw new Error('Vui lòng chọn ít nhất 1 Package.');
    }

    const settings = await getAppSettings();

    const { rows: crRows } = await pool.query<CreativeRow>(
        `SELECT id, title, file_name, sha256_hash, storage_path, public_url,
                product_id, angle_code, language_code, market_target,
                tiktok_policy, meta_policy, google_policy, youtube_video_id
         FROM creatives
         WHERE id = ANY($1::varchar[])`,
        [uniqueCreativeIds]
    );
    const creativeMap = new Map(crRows.map(c => [c.id, c]));
    const orderedCreatives = uniqueCreativeIds.map(id => creativeMap.get(id)).filter((c): c is CreativeRow => Boolean(c));
    if (orderedCreatives.length === 0) {
        throw new Error('Không tìm thấy các Creative đã chọn trong hệ thống.');
    }

    const { rows: pkgRows } = await pool.query<{
        package_id: string;
        package_name: string;
        channel: string;
        naming_template: string;
        ad_account_id: string;
        ad_account_name: string;
        access_token: string | null;
        api_config: Record<string, unknown>;
        product_id: string;
        budget_amount: number;
        budget_currency: string;
        ad_group_volume: number;
        creative_volume: number;
        is_worldwide: boolean;
        country_codes: string[];
    }>(
        `SELECT p.id AS package_id,
                p.name AS package_name,
                p.channel,
                p.naming_template,
                p.ad_account_id,
                acc.name AS ad_account_name,
                acc.access_token,
                acc.api_config,
                app.product_id,
                cam.budget_amount,
                cam.budget_currency,
                cam.ad_group_volume,
                cam.creative_volume,
                cam.is_worldwide,
                cam.country_codes
         FROM packages p
         JOIN ad_accounts acc ON acc.id = p.ad_account_id
         JOIN app_templates app ON app.id = p.app_template_id
         JOIN campaign_templates cam ON cam.id = p.campaign_template_id
         WHERE p.id = ANY($1::varchar[])`,
        [uniquePackageIds]
    );

    if (pkgRows.length === 0) {
        throw new Error('Không tìm thấy Package hợp lệ nào.');
    }

    // Load media cache to compute exact Cache Hit vs Upload Needed
    const hashes = Array.from(new Set(orderedCreatives.map(c => c.sha256_hash)));
    const { rows: cacheRows } = await pool.query<{
        channel: string;
        scope_key: string;
        creative_sha256: string;
        status: string;
    }>(
        `SELECT channel, scope_key, creative_sha256, status
         FROM ad_account_media_cache
         WHERE creative_sha256 = ANY($1::varchar[]) AND status = 'READY'`,
        [hashes]
    );
    const cacheSet = new Set(cacheRows.map(r => `${r.channel}|${r.scope_key}|${r.creative_sha256}`));

    const warnings: Array<{ code: string; creativeId?: string; message: string }> = [];
    const hasFacebook = pkgRows.some(p => normalizeBulkChannel(p.channel) === 'Facebook');
    const hasGoogle = pkgRows.some(p => normalizeBulkChannel(p.channel) === 'Google Ads');

    orderedCreatives.forEach(cr => {
        if (hasFacebook && (cr.meta_policy === 'Flagged' || cr.meta_policy === 'Review')) {
            warnings.push({
                code: 'META_POLICY_RISK',
                creativeId: cr.id,
                message: `Creative "${cr.title}" đang có trạng thái Meta AI: ${cr.meta_policy}.`
            });
        }
        if (cr.tiktok_policy === 'Check failed') {
            warnings.push({
                code: 'TIKTOK_POLICY_WARN',
                creativeId: cr.id,
                message: `Creative "${cr.title}" từng bị TikTok gắn cờ (${cr.tiktok_policy}).`
            });
        }
    });

    const plannedJobs: PlannedJobSpec[] = [];
    const planPreview: BulkLaunchPlan['planPreview'] = [];
    const uniqueUploadsNeeded = new Set<string>();
    const uniqueYoutubeUploadsNeeded = new Set<string>();

    let totalCampaignsToCreate = 0;
    let totalAdGroupsToCreate = 0;
    let totalAdsToCreate = 0;
    let estimatedDailyBudgetVnd = 0;
    let mediaCacheHitCount = 0;
    let mediaUploadNeededCount = 0;

    for (const pkg of pkgRows) {
        const ch = normalizeBulkChannel(pkg.channel);
        const G = Math.max(1, Number(pkg.ad_group_volume) || 1);
        const V = Math.max(1, ch === 'Google Ads' ? Math.min(20, Number(pkg.creative_volume) || 1) : (Number(pkg.creative_volume) || 1));
        const chunkCap = G * V;
        const campaignsCount = Math.ceil(orderedCreatives.length / chunkCap);

        const isUsd = (pkg.budget_currency || 'VND').toUpperCase() === 'USD';
        const dailyBudgetVnd = isUsd
            ? Math.round(Number(pkg.budget_amount) * settings.exchangeRateVnd)
            : Math.round(Number(pkg.budget_amount));
        const dailyBudgetUsd = Number((dailyBudgetVnd / settings.exchangeRateVnd).toFixed(2));
        const executionMode: 'live_api' | 'server_sandbox' =
            Boolean(pkg.access_token && pkg.access_token.trim().length > 0 && !pkg.api_config?.sandboxOverride)
                ? 'live_api'
                : 'server_sandbox';

        const ytPoolScope = (pkg.api_config?.youtube_channel_id as string) || 'yt_apero_uac_pool_01';

        let pkgAdGroups = 0;
        let pkgAds = 0;
        const sampleNames: string[] = [];

        for (let cIdx = 0; cIdx < campaignsCount; cIdx++) {
            const slice = orderedCreatives.slice(cIdx * chunkCap, (cIdx + 1) * chunkCap);
            const allocation: CreativeGroupAllocation[] = [];

            for (let gIdx = 0; gIdx < G; gIdx++) {
                const groupCreatives = slice.slice(gIdx * V, (gIdx + 1) * V);
                if (groupCreatives.length === 0) break;
                allocation.push({
                    groupIndex: gIdx + 1,
                    creativeIds: groupCreatives.map(c => c.id)
                });
                pkgAdGroups++;
                pkgAds += groupCreatives.length;
            }

            let jobCacheHits = 0;
            let jobUploadsNeeded = 0;
            for (const cr of slice) {
                if (ch === 'Facebook') {
                    const cacheKey = `Facebook|${pkg.ad_account_id}|${cr.sha256_hash}`;
                    if (cacheSet.has(cacheKey) || uniqueUploadsNeeded.has(cacheKey)) {
                        jobCacheHits++;
                        mediaCacheHitCount++;
                    } else {
                        uniqueUploadsNeeded.add(cacheKey);
                        jobUploadsNeeded++;
                        mediaUploadNeededCount++;
                    }
                } else {
                    const ytKey = `YouTube|${ytPoolScope}|${cr.sha256_hash}`;
                    if (cr.youtube_video_id || cacheSet.has(ytKey) || uniqueYoutubeUploadsNeeded.has(ytKey)) {
                        jobCacheHits++;
                        mediaCacheHitCount++;
                    } else {
                        uniqueYoutubeUploadsNeeded.add(ytKey);
                        jobUploadsNeeded++;
                        mediaUploadNeededCount++;
                    }
                }
            }

            const plannedName = renderCampaignName({
                template: pkg.naming_template,
                productId: pkg.product_id,
                channel: ch,
                countries: pkg.country_codes || [],
                isWorldwide: pkg.is_worldwide,
                leadCreative: slice[0],
                packageName: pkg.package_name,
                accountId: pkg.ad_account_id,
                index: cIdx
            });

            if (sampleNames.length < 3) sampleNames.push(plannedName);

            plannedJobs.push({
                packageId: pkg.package_id,
                packageName: pkg.package_name,
                adAccountId: pkg.ad_account_id,
                adAccountName: pkg.ad_account_name,
                productId: pkg.product_id,
                channel: ch,
                plannedCampaignName: plannedName,
                creativeAllocation: allocation,
                dailyBudgetVnd,
                dailyBudgetUsd,
                budgetCurrency: pkg.budget_currency,
                executionMode,
                cacheHits: jobCacheHits,
                uploadsNeeded: jobUploadsNeeded
            });
        }

        const pkgTotalBudgetVnd = dailyBudgetVnd * campaignsCount;
        totalCampaignsToCreate += campaignsCount;
        totalAdGroupsToCreate += pkgAdGroups;
        totalAdsToCreate += pkgAds;
        estimatedDailyBudgetVnd += pkgTotalBudgetVnd;

        planPreview.push({
            packageId: pkg.package_id,
            packageName: pkg.package_name,
            channel: ch,
            adAccount: `${pkg.ad_account_id} (${pkg.ad_account_name})`,
            executionMode,
            adGroupVolume: G,
            creativeVolume: V,
            campaignsCount,
            adGroupsCount: pkgAdGroups,
            adsCount: pkgAds,
            estimatedDailyBudgetVnd: pkgTotalBudgetVnd,
            sampleCampaignNames: sampleNames
        });
    }

    const estimatedDailyBudgetUsd = Number((estimatedDailyBudgetVnd / settings.exchangeRateVnd).toFixed(2));
    const estimatedYoutubeQuotaUnits = hasGoogle ? uniqueYoutubeUploadsNeeded.size * 1600 : 0;

    if (estimatedYoutubeQuotaUnits > 8000) {
        warnings.push({
            code: 'YOUTUBE_QUOTA_WARNING',
            message: `Google UAC cần upload ${uniqueYoutubeUploadsNeeded.size} video mới lên YouTube Unlisted (~${estimatedYoutubeQuotaUnits.toLocaleString('en-US')} / 10,000 quota units/ngày mặc định).`
        });
    }
    if (estimatedDailyBudgetUsd >= 5000) {
        warnings.push({
            code: 'HIGH_BUDGET_WARNING',
            message: `Tổng ngân sách ngày dự kiến khá cao ($${estimatedDailyBudgetUsd.toLocaleString('en-US')}/ngày). Hãy kiểm tra lại trước khi Launch.`
        });
    }

    return {
        summary: {
            totalCreatives: orderedCreatives.length,
            totalPackages: pkgRows.length,
            totalCampaignsToCreate,
            totalAdGroupsToCreate,
            totalAdsToCreate,
            estimatedDailyBudgetVnd,
            estimatedDailyBudgetUsd,
            mediaCacheHitCount,
            mediaUploadNeededCount,
            estimatedYoutubeQuotaUnits,
            exchangeRateVnd: settings.exchangeRateVnd
        },
        warnings,
        planPreview,
        plannedJobs
    };
}

export function makeId(prefix: string): string {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}
