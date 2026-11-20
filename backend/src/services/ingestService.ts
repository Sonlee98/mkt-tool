import type { PoolClient } from 'pg';
import { pool } from '../db/pool.js';
import { getNowInTz, parseBudgetToVnd, parseNumberSafe } from '../utils/time.js';
import { getAppSettings, recordTelemetry } from './telemetryService.js';
import { sseHub } from './sseHub.js';

export interface MetricIngestItem {
    productId?: string;
    channel?: string;
    campaignId?: string;
    externalCampaignId?: string;
    campaignName?: string;
    marketerId?: string;
    countries?: string;
    country?: string;
    budgetVnd?: number;
    budget?: string | number;
    date?: string;
    hourSlot?: number;
    // Delta mode (increment existing hour slot)
    spendDeltaVnd?: number;
    cohortRevDeltaVnd?: number;
    cutoffRevDeltaVnd?: number;
    installsDelta?: number;
    // Absolute mode (sets metric for the hour/day slot)
    spendVnd?: number;
    revenueVnd?: number;
    cohortRevVnd?: number;
    cutoffRevVnd?: number;
    installs?: number;
    // Live Ad Network sync sets spend/installs without overwriting MMP cohort/cutoff revenue
    preserveRevenue?: boolean;
}

function normalizeChannelName(ch?: string): string {
    const raw = (ch || 'Facebook').trim();
    const lower = raw.toLowerCase();
    if (lower.includes('tiktok')) return 'TikTok';
    if (lower.includes('google')) return 'Google Ads';
    if (lower.includes('mintegral')) return 'Mintegral';
    if (lower.includes('organic')) return 'Organic';
    if (lower.includes('mediation')) return 'Mediation';
    if (lower.includes('facebook') || lower === 'fb') return 'Facebook';
    return raw || 'Facebook';
}

function defaultAccountForChannel(channel: string): string | null {
    switch (channel) {
        case 'Facebook': return 'act_102938401';
        case 'TikTok': return 'act_719284109';
        case 'Google Ads': return 'act_829104820';
        case 'Mintegral': return 'act_552910481';
        default: return null;
    }
}

async function ensureProductAndCampaign(
    client: PoolClient,
    item: MetricIngestItem,
    exchangeRate: number
): Promise<{ campaignId: string; productId: string; channel: string; country: string; campaignName: string }> {
    const productId = (item.productId || 'AIP922').trim().toUpperCase();
    const division = productId.startsWith('AAP') ? 'AAP' : 'AIP';
    const channel = normalizeChannelName(item.channel);
    const countries = (item.countries || item.country || 'US').trim();
    const primaryCountry = (item.country || countries.split(',')[0] || 'GLOBAL').trim().toUpperCase().slice(0, 16) || 'GLOBAL';

    await client.query(
        `INSERT INTO products (id, division, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO NOTHING`,
        [productId, division, `${productId} - Growth App`]
    );

    const campaignName = (item.campaignName || item.campaignId || `${productId}_${channel}_Auto_${Date.now()}`).trim();
    const extId = (item.externalCampaignId || item.campaignId || `#${Math.floor(100 + Math.random() * 899)}`).trim();
    const safeSlug = campaignName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
    const campaignId = (item.campaignId && !item.campaignId.startsWith('#'))
        ? item.campaignId.trim()
        : `cmp_${productId}_${safeSlug}`;

    // Check if campaign already exists by id OR by (product_id, name)
    const existing = await client.query<{ id: string; product_id: string; channel: string; name: string }>(
        `SELECT id, product_id, channel, name FROM campaigns
         WHERE id = $1 OR (product_id = $2 AND LOWER(name) = LOWER($3))
         LIMIT 1`,
        [campaignId, productId, campaignName]
    );

    const resolvedBudget = item.budgetVnd ?? parseBudgetToVnd(item.budget ?? 0, exchangeRate);

    if (existing.rows.length > 0) {
        const found = existing.rows[0];
        if (resolvedBudget > 0) {
            await client.query(
                `UPDATE campaigns SET daily_budget_vnd = $2, updated_at = NOW() WHERE id = $1`,
                [found.id, resolvedBudget]
            );
        } else {
            await client.query(`UPDATE campaigns SET updated_at = NOW() WHERE id = $1`, [found.id]);
        }
        return {
            campaignId: found.id,
            productId: found.product_id,
            channel: found.channel,
            country: primaryCountry,
            campaignName: found.name
        };
    }

    const adAccountId = defaultAccountForChannel(channel);
    await client.query(
        `INSERT INTO campaigns
            (id, external_campaign_id, product_id, ad_account_id, channel, marketer_id, name, countries, daily_budget_vnd, status, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ON',NOW())`,
        [
            campaignId,
            extId,
            productId,
            adAccountId,
            channel,
            item.marketerId || 'HoangNC',
            campaignName,
            countries,
            resolvedBudget || 20_000_000
        ]
    );

    return { campaignId, productId, channel, country: primaryCountry, campaignName };
}

export async function ingestMetricsBatch(
    items: MetricIngestItem[],
    source: string
): Promise<{ updatedRows: number; campaignIds: string[]; spendDeltaTotal: number; revDeltaTotal: number; installsDeltaTotal: number }> {
    if (items.length === 0) {
        return { updatedRows: 0, campaignIds: [], spendDeltaTotal: 0, revDeltaTotal: 0, installsDeltaTotal: 0 };
    }

    const startedAt = Date.now();
    const tzNow = getNowInTz();
    const settings = await getAppSettings();
    const client = await pool.connect();

    const touchedCampaignIds = new Set<string>();
    let spendDeltaTotal = 0;
    let revDeltaTotal = 0;
    let installsDeltaTotal = 0;
    let updatedRows = 0;

    try {
        await client.query('BEGIN');

        for (const item of items) {
            const metricDate = item.date && /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : tzNow.date;
            const hourSlot = typeof item.hourSlot === 'number' && item.hourSlot >= 0 && item.hourSlot <= 23
                ? Math.floor(item.hourSlot)
                : tzNow.hour;

            const resolved = await ensureProductAndCampaign(client, item, settings.exchangeRateVnd);
            touchedCampaignIds.add(resolved.campaignId);

            const isDelta = item.spendDeltaVnd !== undefined ||
                item.cohortRevDeltaVnd !== undefined ||
                item.cutoffRevDeltaVnd !== undefined ||
                item.installsDelta !== undefined;

            if (isDelta) {
                const sd = Math.round(parseNumberSafe(item.spendDeltaVnd, 0));
                const crd = Math.round(parseNumberSafe(item.cohortRevDeltaVnd, 0));
                const cutd = Math.round(parseNumberSafe(item.cutoffRevDeltaVnd, Math.round(crd * 1.15)));
                const insd = Math.round(parseNumberSafe(item.installsDelta, 0));

                await client.query(
                    `INSERT INTO intraday_hourly_metrics
                        (metric_date, hour_slot, product_id, channel, campaign_id, country, spend_vnd, cohort_rev_vnd, cutoff_rev_vnd, installs, updated_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
                     ON CONFLICT (metric_date, hour_slot, campaign_id, country)
                     DO UPDATE SET
                        spend_vnd = GREATEST(0, intraday_hourly_metrics.spend_vnd + EXCLUDED.spend_vnd),
                        cohort_rev_vnd = GREATEST(0, intraday_hourly_metrics.cohort_rev_vnd + EXCLUDED.cohort_rev_vnd),
                        cutoff_rev_vnd = GREATEST(0, intraday_hourly_metrics.cutoff_rev_vnd + EXCLUDED.cutoff_rev_vnd),
                        installs = GREATEST(0, intraday_hourly_metrics.installs + EXCLUDED.installs),
                        updated_at = NOW()`,
                    [metricDate, hourSlot, resolved.productId, resolved.channel, resolved.campaignId, resolved.country, sd, crd, cutd, insd]
                );

                spendDeltaTotal += sd;
                revDeltaTotal += crd;
                installsDeltaTotal += insd;
            } else if (item.preserveRevenue) {
                const absSpend = Math.round(parseNumberSafe(item.spendVnd, 0));
                const absInstalls = Math.round(parseNumberSafe(item.installs, 0));

                await client.query(
                    `INSERT INTO intraday_hourly_metrics
                        (metric_date, hour_slot, product_id, channel, campaign_id, country, spend_vnd, cohort_rev_vnd, cutoff_rev_vnd, installs, updated_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,0,0,$8,NOW())
                     ON CONFLICT (metric_date, hour_slot, campaign_id, country)
                     DO UPDATE SET
                        spend_vnd = EXCLUDED.spend_vnd,
                        installs = CASE WHEN EXCLUDED.installs > 0 THEN EXCLUDED.installs ELSE intraday_hourly_metrics.installs END,
                        updated_at = NOW()`,
                    [metricDate, hourSlot, resolved.productId, resolved.channel, resolved.campaignId, resolved.country, absSpend, absInstalls]
                );

                spendDeltaTotal += absSpend;
                installsDeltaTotal += absInstalls;
            } else {
                const absSpend = Math.round(parseNumberSafe(item.spendVnd, 0));
                const absCohort = Math.round(parseNumberSafe(item.cohortRevVnd ?? item.revenueVnd, 0));
                const absCutoff = Math.round(parseNumberSafe(item.cutoffRevVnd, Math.round(absCohort * 1.15)));
                const absInstalls = Math.round(parseNumberSafe(item.installs, 0));

                await client.query(
                    `INSERT INTO intraday_hourly_metrics
                        (metric_date, hour_slot, product_id, channel, campaign_id, country, spend_vnd, cohort_rev_vnd, cutoff_rev_vnd, installs, updated_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
                     ON CONFLICT (metric_date, hour_slot, campaign_id, country)
                     DO UPDATE SET
                        spend_vnd = EXCLUDED.spend_vnd,
                        cohort_rev_vnd = EXCLUDED.cohort_rev_vnd,
                        cutoff_rev_vnd = EXCLUDED.cutoff_rev_vnd,
                        installs = EXCLUDED.installs,
                        updated_at = NOW()`,
                    [metricDate, hourSlot, resolved.productId, resolved.channel, resolved.campaignId, resolved.country, absSpend, absCohort, absCutoff, absInstalls]
                );

                spendDeltaTotal += absSpend;
                revDeltaTotal += absCohort;
                installsDeltaTotal += absInstalls;
            }
            updatedRows++;
        }

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }

    const latencyMs = Math.max(8, Date.now() - startedAt);
    const campaignIds = Array.from(touchedCampaignIds);
    const message = `[200 OK] Đồng bộ ${updatedRows} bản ghi từ ${source} (Spend: +${spendDeltaTotal.toLocaleString('vi-VN')} đ | Rev: +${revDeltaTotal.toLocaleString('vi-VN')} đ)`;

    const telemetry = await recordTelemetry({
        source,
        statusCode: 200,
        latencyMs,
        message,
        payloadSummary: { updatedRows, campaignIds, spendDeltaTotal, revDeltaTotal, installsDeltaTotal }
    });

    sseHub.broadcast('intraday_sync', {
        source,
        updatedRows,
        campaignIds,
        spendDeltaTotal,
        revDeltaTotal,
        installsDeltaTotal,
        telemetry
    });

    return { updatedRows, campaignIds, spendDeltaTotal, revDeltaTotal, installsDeltaTotal };
}

function splitCsvLine(line: string, delimiter: string): string[] {
    const out: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === delimiter && !inQuotes) {
            out.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    out.push(current.trim());
    return out;
}

export function parseCsvToMetrics(csvText: string, dateOverride?: string): MetricIngestItem[] {
    const cleanText = csvText.replace(/^\uFEFF/, '');
    const lines = cleanText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
        throw new Error('CSV phải có ít nhất 1 dòng tiêu đề và 1 dòng dữ liệu.');
    }

    const delimiter = lines[0].includes('\t') && !lines[0].includes(',') ? '\t' : ',';
    const headers = splitCsvLine(lines[0], delimiter).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

    const findCol = (aliases: string[]) => headers.findIndex(h => aliases.some(a => h === a || h.includes(a)));
    const idxProduct = findCol(['product', 'productid', 'app']);
    const idxChannel = findCol(['channel', 'source']);
    const idxName = findCol(['campaignname', 'campaign']);
    const idxId = findCol(['campaignid', 'externalid']);
    const idxCountries = findCol(['countries', 'country']);
    const idxBudget = findCol(['budget']);
    const idxSpend = findCol(['spend', 'cost']);
    const idxRev = findCol(['revenue', 'cohortrev', 'rev']);
    const idxInstalls = findCol(['installs', 'conversion', 'install']);
    const idxMarketer = findCol(['marketer', 'owner']);

    if (idxName === -1 && idxSpend === -1) {
        throw new Error('Không tìm thấy cột CampaignName hoặc Spend trong tệp CSV.');
    }

    const items: MetricIngestItem[] = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = splitCsvLine(lines[i], delimiter);
        if (cols.every(c => !c)) continue;

        const productId = idxProduct >= 0 ? cols[idxProduct] : 'AIP922';
        const channel = idxChannel >= 0 ? cols[idxChannel] : 'Facebook';
        const campaignName = idxName >= 0 ? cols[idxName] : `Imported_Campaign_${i}`;
        const externalCampaignId = idxId >= 0 ? cols[idxId] : `#CSV${i}`;
        const countries = idxCountries >= 0 ? cols[idxCountries] : 'US';
        const budget = idxBudget >= 0 ? cols[idxBudget] : '20M';
        const spendVnd = idxSpend >= 0 ? parseNumberSafe(cols[idxSpend], 0) : 0;
        const revenueVnd = idxRev >= 0 ? parseNumberSafe(cols[idxRev], 0) : 0;
        const installs = idxInstalls >= 0 ? Math.round(parseNumberSafe(cols[idxInstalls], 0)) : 0;
        const marketerId = idxMarketer >= 0 && cols[idxMarketer] ? cols[idxMarketer] : 'HoangNC';

        items.push({
            productId: productId || 'AIP922',
            channel: channel || 'Facebook',
            campaignName,
            externalCampaignId,
            countries,
            budget,
            spendVnd,
            revenueVnd,
            installs,
            marketerId,
            date: dateOverride
        });
    }

    return items;
}
