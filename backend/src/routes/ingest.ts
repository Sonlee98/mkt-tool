import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import {
    ingestMetricsBatch,
    parseCsvToMetrics,
    type MetricIngestItem
} from '../services/ingestService.js';
import { getIntradayReport } from '../services/intradayService.js';
import { getAppSettings, setSystemSetting } from '../services/telemetryService.js';
import { verifySecretConstantTime } from '../utils/cryptoVault.js';
import { parseNumberSafe } from '../utils/time.js';

function normalizeWebhookEvent(raw: Record<string, unknown>): MetricIngestItem {
    return {
        productId: (raw.productId ?? raw.product ?? raw.appId) as string | undefined,
        channel: (raw.channel ?? raw.source) as string | undefined,
        campaignId: (raw.campaignId ?? raw.campaign_id) as string | undefined,
        externalCampaignId: (raw.externalCampaignId ?? raw.external_campaign_id ?? raw.campaignId) as string | undefined,
        campaignName: (raw.campaignName ?? raw.campaign_name ?? raw.campaign) as string | undefined,
        marketerId: (raw.marketerId ?? raw.marketer) as string | undefined,
        countries: (raw.countries ?? raw.country) as string | undefined,
        country: (raw.country) as string | undefined,
        budgetVnd: raw.budgetVnd !== undefined ? parseNumberSafe(raw.budgetVnd) : undefined,
        budget: raw.budget as string | number | undefined,
        date: raw.date as string | undefined,
        hourSlot: raw.hourSlot !== undefined ? Number(raw.hourSlot) : undefined,
        spendDeltaVnd: (raw.spendDeltaVnd ?? raw.spendDelta) as number | undefined,
        cohortRevDeltaVnd: (raw.cohortRevDeltaVnd ?? raw.revDeltaVnd ?? raw.revDelta) as number | undefined,
        cutoffRevDeltaVnd: (raw.cutoffRevDeltaVnd ?? raw.cutoffDeltaVnd) as number | undefined,
        installsDelta: (raw.installsDelta ?? raw.installDelta) as number | undefined,
        spendVnd: (raw.spendVnd ?? raw.spend) as number | undefined,
        revenueVnd: (raw.revenueVnd ?? raw.cohortRevVnd ?? raw.revenue) as number | undefined,
        cutoffRevVnd: raw.cutoffRevVnd as number | undefined,
        installs: (raw.installs ?? raw.conversion) as number | undefined
    };
}

function toGoogleSheetCsvUrl(rawUrl: string): string {
    const trimmed = rawUrl.trim();
    const docMatch = trimmed.match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!docMatch) return trimmed;
    if (trimmed.includes('/export?') && trimmed.includes('format=csv')) return trimmed;
    const gidMatch = trimmed.match(/[#&?]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : '0';
    return `https://docs.google.com/spreadsheets/d/${docMatch[1]}/export?format=csv&gid=${gid}`;
}

export async function ingestRoutes(app: FastifyInstance): Promise<void> {
    // Standard Realtime Webhook Endpoint (protected by WEBHOOK_SECRET when configured)
    app.post<{ Params: { source: string }; Body: unknown }>('/api/v1/webhooks/:source', async (req, reply) => {
        const expectedSecret = config.webhookSecret || (await getAppSettings()).webhookSecret;
        if (expectedSecret) {
            const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
            const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
            const customHeader = typeof req.headers['x-webhook-secret'] === 'string' ? req.headers['x-webhook-secret'].trim() : '';
            const provided = bearerToken || customHeader;
            if (!verifySecretConstantTime(provided, expectedSecret)) {
                return reply.code(401).send({
                    ok: false,
                    error: 'Unauthorized: Thiếu hoặc sai WEBHOOK_SECRET.'
                });
            }
        }

        const sourceParam = req.params.source || 'custom';
        const sourceMap: Record<string, string> = {
            facebook: 'Facebook Marketing Webhook',
            tiktok: 'TikTok Events Webhook',
            google_ads: 'Google Ads Webhook',
            appsflyer: 'AppsFlyer Push API',
            adjust: 'Adjust Real-time Callback',
            custom: 'Custom REST Webhook'
        };
        const sourceLabel = sourceMap[sourceParam.toLowerCase()] || `Webhook (${sourceParam})`;
        const body = req.body;

        let rawEvents: Record<string, unknown>[] = [];
        if (Array.isArray(body)) {
            rawEvents = body as Record<string, unknown>[];
        } else if (body && typeof body === 'object') {
            const obj = body as Record<string, unknown>;
            if (Array.isArray(obj.events)) {
                rawEvents = obj.events as Record<string, unknown>[];
            } else {
                rawEvents = [obj];
            }
        }

        if (rawEvents.length === 0) {
            return reply.code(400).send({ ok: false, error: 'Payload webhook trống hoặc không hợp lệ.' });
        }

        const items = rawEvents.map(normalizeWebhookEvent);
        const result = await ingestMetricsBatch(items, sourceLabel);
        return { ok: true, source: sourceLabel, ...result };
    });

    // Manual Campaign Entry from Data Management Form
    app.post<{ Body: Record<string, unknown> }>('/api/v1/intraday/campaigns', async (req, reply) => {
        const b = req.body || {};
        if (!b.campaignName) {
            return reply.code(400).send({ ok: false, error: 'Thiếu tên chiến dịch (campaignName).' });
        }

        const item = normalizeWebhookEvent(b);
        const result = await ingestMetricsBatch([item], 'Manual Data Input Form');
        return { ok: true, ...result };
    });

    // CSV Import
    app.post<{ Body: { csvText?: string; date?: string } }>('/api/v1/intraday/import-csv', async (req, reply) => {
        const csvText = req.body?.csvText;
        if (!csvText || !csvText.trim()) {
            return reply.code(400).send({ ok: false, error: 'Nội dung tệp CSV trống.' });
        }

        try {
            const items = parseCsvToMetrics(csvText, req.body?.date);
            const result = await ingestMetricsBatch(items, 'CSV File Import');
            return { ok: true, importedCount: result.updatedRows, ...result };
        } catch (err) {
            return reply.code(400).send({ ok: false, error: (err as Error).message });
        }
    });

    // JSON Payload Import (supports campaign array, { campaigns: [...] }, or summary payload)
    app.post<{ Body: unknown }>('/api/v1/intraday/import-json', async (req, reply) => {
        const payload = req.body;
        if (!payload || typeof payload !== 'object') {
            return reply.code(400).send({ ok: false, error: 'Payload JSON không hợp lệ.' });
        }

        if (Array.isArray(payload)) {
            const items = payload.map(x => normalizeWebhookEvent(x as Record<string, unknown>));
            const res = await ingestMetricsBatch(items, 'JSON Payload Import');
            return { ok: true, importedCount: res.updatedRows, ...res };
        }

        const obj = payload as Record<string, unknown>;
        if (Array.isArray(obj.campaigns)) {
            const items = obj.campaigns.map(x => normalizeWebhookEvent(x as Record<string, unknown>));
            const res = await ingestMetricsBatch(items, 'JSON Payload Import');
            return { ok: true, importedCount: res.updatedRows, ...res };
        }
        if (Array.isArray(obj.events)) {
            const items = obj.events.map(x => normalizeWebhookEvent(x as Record<string, unknown>));
            const res = await ingestMetricsBatch(items, 'JSON Payload Import');
            return { ok: true, importedCount: res.updatedRows, ...res };
        }

        // Summary-style JSON fallback (e.g. { spendVnd, cutoffRevVnd, totalInstall } or { summary: {...} })
        const sumObj = (obj.summary && typeof obj.summary === 'object' ? obj.summary : obj) as Record<string, unknown>;
        if (sumObj.spendVnd !== undefined || sumObj.cutoffRevVnd !== undefined || sumObj.spendDeltaVnd !== undefined) {
            if (sumObj.spendDeltaVnd !== undefined || sumObj.revDelta !== undefined) {
                const res = await ingestMetricsBatch([normalizeWebhookEvent(sumObj)], 'JSON Payload Import');
                return { ok: true, importedCount: res.updatedRows, ...res };
            }
            const current = await getIntradayReport();
            const targetSpend = parseNumberSafe(sumObj.spendVnd, current.summary.spendVnd);
            const targetCutoff = parseNumberSafe(sumObj.cutoffRevVnd, current.summary.cutoffRevVnd);
            const targetInstalls = parseNumberSafe(sumObj.totalInstall ?? sumObj.installs, current.summary.totalInstall);
            const spendDeltaVnd = Math.round(targetSpend - current.summary.spendVnd);
            const cutoffDeltaVnd = Math.round(targetCutoff - current.summary.cutoffRevVnd);
            const cohortDeltaVnd = Math.round(cutoffDeltaVnd * 0.85);
            const installsDelta = Math.round(targetInstalls - current.summary.totalInstall);

            const res = await ingestMetricsBatch([{
                productId: 'AIP922',
                channel: 'Facebook',
                campaignId: 'cmp_928174102',
                country: 'US',
                spendDeltaVnd,
                cohortRevDeltaVnd: cohortDeltaVnd,
                cutoffRevDeltaVnd: cutoffDeltaVnd,
                installsDelta
            }], 'JSON Summary Sync');
            return { ok: true, importedCount: res.updatedRows, ...res };
        }

        const singleRes = await ingestMetricsBatch([normalizeWebhookEvent(obj)], 'JSON Payload Import');
        return { ok: true, importedCount: singleRes.updatedRows, ...singleRes };
    });

    // Google Sheets CSV Sync
    app.post<{ Body: { sheetUrl?: string } }>('/api/v1/intraday/sync-ggsheet', async (req, reply) => {
        const settings = await getAppSettings();
        const rawInputUrl = req.body?.sheetUrl?.trim() || settings.ggsheetCsvUrl;

        if (!rawInputUrl) {
            return reply.code(400).send({
                ok: false,
                error: 'Chưa cấu hình URL Google Sheets (CSV export hoặc link Google Sheet chia sẻ công khai).'
            });
        }

        const csvUrl = toGoogleSheetCsvUrl(rawInputUrl);
        await setSystemSetting('ggsheet_csv_url', rawInputUrl);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        try {
            const resp = await fetch(csvUrl, { signal: controller.signal });
            if (!resp.ok) {
                return reply.code(400).send({
                    ok: false,
                    error: `Không tải được Google Sheets (HTTP ${resp.status}). Hãy đảm bảo Sheet đang bật quyền xem công khai hoặc Publish to CSV.`
                });
            }
            const csvText = await resp.text();
            if (csvText.trim().startsWith('<!DOCTYPE') || csvText.trim().startsWith('<html')) {
                return reply.code(400).send({
                    ok: false,
                    error: 'Google Sheets trả về trang HTML đăng nhập. Vui lòng bật quyền "Anyone with the link can view" hoặc Publish CSV.'
                });
            }
            const items = parseCsvToMetrics(csvText);
            const result = await ingestMetricsBatch(items, 'Google Sheets Live Sync');
            return { ok: true, importedCount: result.updatedRows, sheetUrl: rawInputUrl, csvUrl, ...result };
        } catch (err) {
            return reply.code(400).send({
                ok: false,
                error: `Lỗi kết nối Google Sheets: ${(err as Error).message}`
            });
        } finally {
            clearTimeout(timer);
        }
    });
}
