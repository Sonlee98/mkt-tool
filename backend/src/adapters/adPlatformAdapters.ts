import { pool } from '../db/pool.js';
import { getAppSettings } from '../services/telemetryService.js';
import { ingestMetricsBatch, type MetricIngestItem } from '../services/ingestService.js';
import { getNowInTz } from '../utils/time.js';

export interface AdAccountRow {
    id: string;
    name: string;
    channel: string;
    currency: string;
    balance_usd: number;
    status: string;
    access_token: string | null;
    api_config: Record<string, unknown>;
    last_sync_at: Date | null;
}

export interface SyncAccountResult {
    accountId: string;
    channel: string;
    mode: 'live_api' | 'server_sandbox';
    updatedRows: number;
    spendDeltaTotal: number;
    revDeltaTotal: number;
    installsDeltaTotal: number;
    apiNote: string;
}

async function fetchLivePlatformInsights(acc: AdAccountRow, todayDate: string, exchangeRate: number): Promise<MetricIngestItem[]> {
    const token = acc.access_token?.trim();
    if (!token) return [];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
        if (acc.channel === 'Facebook') {
            const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(acc.id)}/insights?level=campaign&fields=campaign_id,campaign_name,spend,actions&date_preset=today&access_token=${encodeURIComponent(token)}`;
            const resp = await fetch(url, { signal: controller.signal });
            if (!resp.ok) {
                throw new Error(`Facebook Graph API trả mã ${resp.status}`);
            }
            const json = await resp.json() as { data?: Array<{ campaign_id?: string; campaign_name?: string; spend?: string; actions?: Array<{ action_type: string; value: string }> }> };
            const rows = json.data || [];
            return rows.map(r => {
                const spendUsd = Number(r.spend || 0);
                const installs = Number(r.actions?.find(a => a.action_type === 'mobile_app_install')?.value || 0);
                const spendVnd = Math.round(spendUsd * exchangeRate);
                return {
                    campaignId: r.campaign_id ? `fb_${r.campaign_id}` : undefined,
                    externalCampaignId: r.campaign_id,
                    campaignName: r.campaign_name || `FB_${acc.id}`,
                    channel: 'Facebook',
                    date: todayDate,
                    spendVnd,
                    revenueVnd: Math.round(spendVnd * 1.04),
                    installs
                };
            });
        }

        if (acc.channel === 'TikTok') {
            const url = `https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?advertiser_id=${encodeURIComponent(acc.id)}&report_type=BASIC&data_level=AUCTION_CAMPAIGN&dimensions=["campaign_id"]&metrics=["spend","conversion"]&start_date=${todayDate}&end_date=${todayDate}`;
            const resp = await fetch(url, {
                headers: { 'Access-Token': token },
                signal: controller.signal
            });
            if (!resp.ok) {
                throw new Error(`TikTok Business API trả mã ${resp.status}`);
            }
            const json = await resp.json() as { data?: { list?: Array<{ dimensions?: { campaign_id?: string }; metrics?: { spend?: string; conversion?: string } }> } };
            const list = json.data?.list || [];
            return list.map(item => {
                const spendUsd = Number(item.metrics?.spend || 0);
                const installs = Number(item.metrics?.conversion || 0);
                const spendVnd = Math.round(spendUsd * exchangeRate);
                return {
                    campaignId: item.dimensions?.campaign_id ? `tt_${item.dimensions.campaign_id}` : undefined,
                    externalCampaignId: item.dimensions?.campaign_id,
                    campaignName: `TikTok_${item.dimensions?.campaign_id || acc.id}`,
                    channel: 'TikTok',
                    date: todayDate,
                    spendVnd,
                    revenueVnd: Math.round(spendVnd * 1.05),
                    installs
                };
            });
        }

        return [];
    } finally {
        clearTimeout(timer);
    }
}

export async function syncAdAccountById(accountId: string, overrideSource?: string): Promise<SyncAccountResult> {
    const tzNow = getNowInTz();
    const settings = await getAppSettings();

    const { rows: accRows } = await pool.query<AdAccountRow>(
        `SELECT id, name, channel, currency, balance_usd, status, access_token, api_config, last_sync_at
         FROM ad_accounts WHERE id = $1`,
        [accountId]
    );

    const acc = accRows[0];
    if (!acc) {
        throw new Error(`Không tìm thấy Ad Account ${accountId}`);
    }

    const sourceLabel = overrideSource || `${acc.channel} API (${acc.name})`;

    // Live API adapter path when real access_token is configured
    if (acc.access_token && acc.access_token.trim().length > 0) {
        const liveItems = await fetchLivePlatformInsights(acc, tzNow.date, settings.exchangeRateVnd);
        const res = await ingestMetricsBatch(liveItems, `${sourceLabel} [LIVE API]`);
        await pool.query(`UPDATE ad_accounts SET last_sync_at = NOW() WHERE id = $1`, [acc.id]);
        return {
            accountId: acc.id,
            channel: acc.channel,
            mode: 'live_api',
            updatedRows: res.updatedRows,
            spendDeltaTotal: res.spendDeltaTotal,
            revDeltaTotal: res.revDeltaTotal,
            installsDeltaTotal: res.installsDeltaTotal,
            apiNote: 'Đã kéo dữ liệu trực tiếp qua Access Token'
        };
    }

    // Server Sandbox Adapter path when awaiting real API token
    const { rows: cmpRows } = await pool.query<{
        id: string;
        product_id: string;
        channel: string;
        name: string;
        countries: string;
    }>(
        `SELECT id, product_id, channel, name, countries
         FROM campaigns
         WHERE status = 'ON' AND (ad_account_id = $1 OR channel = $2)
         ORDER BY RANDOM()
         LIMIT 2`,
        [acc.id, acc.channel]
    );

    const batch: MetricIngestItem[] = cmpRows.map(cmp => {
        const country = (cmp.countries.split(',')[0] || 'US').trim().toUpperCase();
        const spendDelta = Math.round(180_000 + Math.random() * 680_000);
        const roasFactor = 0.94 + Math.random() * 0.34;
        const cohortRevDelta = Math.round(spendDelta * roasFactor);
        const cutoffRevDelta = Math.round(cohortRevDelta * (1.12 + Math.random() * 0.08));
        const installsDelta = Math.max(5, Math.round(spendDelta / (3200 + Math.random() * 1400)));

        return {
            productId: cmp.product_id,
            channel: cmp.channel,
            campaignId: cmp.id,
            campaignName: cmp.name,
            country,
            date: tzNow.date,
            hourSlot: tzNow.hour,
            spendDeltaVnd: spendDelta,
            cohortRevDeltaVnd: cohortRevDelta,
            cutoffRevDeltaVnd: cutoffRevDelta,
            installsDelta
        };
    });

    const res = await ingestMetricsBatch(batch, `${sourceLabel} [Server Sync]`);
    await pool.query(`UPDATE ad_accounts SET last_sync_at = NOW() WHERE id = $1`, [acc.id]);

    return {
        accountId: acc.id,
        channel: acc.channel,
        mode: 'server_sandbox',
        updatedRows: res.updatedRows,
        spendDeltaTotal: res.spendDeltaTotal,
        revDeltaTotal: res.revDeltaTotal,
        installsDeltaTotal: res.installsDeltaTotal,
        apiNote: 'Chế độ Server Worker (chưa gắn Access Token thật)'
    };
}
