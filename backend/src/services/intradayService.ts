import { pool } from '../db/pool.js';
import { getAppSettings } from './telemetryService.js';
import { formatTimeInTz, getNowInTz, shiftDate } from '../utils/time.js';

export interface IntradayFilterParams {
    date?: string;
    division?: string;
    product?: string;
    channel?: string;
    marketer?: string;
    country?: string;
    search?: string;
}

export interface HourlyPoint {
    hour: string;
    hourSlot: number;
    spend: number;
    rev: number;
    cohortRev: number;
    roas: number;
    installs: number;
}

export interface TreeCampaignNode {
    id: string;
    type: 'campaign';
    name: string;
    productId: string;
    channel: string;
    campaign: string;
    campaignId: string;
    externalCampaignId: string;
    marketerId: string | null;
    countries: string;
    budgetVnd: number;
    roasD0: number | null;
    roasD0T1: number | null;
    roasT2: number | null;
    roasT3: number | null;
    spendVnd: number;
    revenueVnd: number;
    cutoffRevVnd: number;
    conversions: number;
    cpiVnd: number;
    ltvVnd: number;
    estRoas: number | null;
    estRoasH1: number | null;
    status: string;
    lastUpdate: string;
}

export interface TreeChannelNode {
    id: string;
    type: 'channel';
    name: string;
    productId: string;
    channel: string;
    budgetVnd: number;
    roasD0: number | null;
    roasD0T1: number | null;
    roasT2: number | null;
    roasT3: number | null;
    spendVnd: number;
    revenueVnd: number;
    cutoffRevVnd: number;
    conversions: number;
    cpiVnd: number;
    ltvVnd: number;
    estRoas: number | null;
    estRoasH1: number | null;
    status: string;
    lastUpdate: string;
    children: TreeCampaignNode[];
}

export interface TreeProductNode {
    id: string;
    type: 'product';
    name: string;
    productId: string;
    division: string;
    channel: string;
    budgetVnd: number;
    roasD0: number | null;
    roasD0T1: number | null;
    roasT2: number | null;
    roasT3: number | null;
    spendVnd: number;
    revenueVnd: number;
    cutoffRevVnd: number;
    conversions: number;
    cpiVnd: number;
    ltvVnd: number;
    estRoas: number | null;
    estRoasH1: number | null;
    status: string;
    lastUpdate: string;
    children: TreeChannelNode[];
}

export interface IntradayReportResponse {
    filters: Required<IntradayFilterParams>;
    summary: {
        date: string;
        displayDate: string;
        currentHourSlot: number;
        currentHourLabel: string;
        lastUpdate: string;
        exchangeRate: number;
        platformFeeRate: number;
        spendVnd: number;
        cohortRevVnd: number;
        cutoffRevVnd: number;
        roas: number;
        pl2Vnd: number;
        percentPl2: number;
        estRoas: number;
        roasD0T1: number | null;
        roasT2: number | null;
        roasT3: number | null;
        totalInstall: number;
        cpiVnd: number;
        ltvVnd: number;
    };
    grandTotal: {
        spendVnd: number;
        revenueVnd: number;
        cutoffRevVnd: number;
        conversions: number;
        roasD0: number;
        estRoas: number;
        estRoasH1: number;
        roasD0T1: number | null;
        roasT2: number | null;
        roasT3: number | null;
        cpiVnd: number;
        ltvVnd: number;
        lastUpdate: string;
    };
    hourly: HourlyPoint[];
    treeData: TreeProductNode[];
    meta: {
        products: Array<{ id: string; division: string; name: string; dauLabel: string }>;
        marketers: Array<{ id: string; fullName: string }>;
        ggsheetCsvUrl: string;
    };
}

interface FilterSqlResult {
    clauses: string[];
    values: unknown[];
}

function normalizeChannelFilter(channel?: string): string {
    if (!channel || channel === 'All') return 'All';
    const lower = channel.trim().toLowerCase();
    if (lower === 'googleads' || lower === 'google ads') return 'Google Ads';
    if (lower === 'tiktok') return 'TikTok';
    if (lower === 'facebook') return 'Facebook';
    if (lower === 'organic') return 'Organic';
    if (lower === 'mediation') return 'Mediation';
    if (lower === 'mintegral') return 'Mintegral';
    return channel.trim();
}

function buildFilterSql(filters: Required<IntradayFilterParams>, startIdx: number): FilterSqlResult {
    const clauses: string[] = [];
    const values: unknown[] = [];
    let idx = startIdx;

    if (filters.division !== 'All') {
        clauses.push(`p.division = $${idx++}`);
        values.push(filters.division);
    }
    if (filters.product !== 'All') {
        clauses.push(`m.product_id = $${idx++}`);
        values.push(filters.product);
    }
    if (filters.channel !== 'All') {
        clauses.push(`LOWER(m.channel) = LOWER($${idx++})`);
        values.push(filters.channel);
    }
    if (filters.marketer !== 'All') {
        clauses.push(`c.marketer_id = $${idx++}`);
        values.push(filters.marketer);
    }
    if (filters.country !== 'All') {
        clauses.push(`UPPER(m.country) = UPPER($${idx++})`);
        values.push(filters.country);
    }
    if (filters.search) {
        clauses.push(`(c.name ILIKE $${idx} OR c.external_campaign_id ILIKE $${idx} OR c.id ILIKE $${idx} OR p.name ILIKE $${idx} OR m.product_id ILIKE $${idx})`);
        values.push(`%${filters.search}%`);
        idx++;
    }

    return { clauses, values };
}

function round2(val: number): number {
    return Number(val.toFixed(2));
}

function calcRoas(rev: number, spend: number): number | null {
    if (spend <= 0) return null;
    return round2((rev / spend) * 100);
}

interface PastBucket {
    sameSpend: number;
    sameRev: number;
    eodSpend: number;
    eodRev: number;
}

export async function getIntradayReport(rawFilters: IntradayFilterParams = {}): Promise<IntradayReportResponse> {
    const tzNow = getNowInTz();
    const settings = await getAppSettings();

    const filters: Required<IntradayFilterParams> = {
        date: rawFilters.date && /^\d{4}-\d{2}-\d{2}$/.test(rawFilters.date) ? rawFilters.date : tzNow.date,
        division: rawFilters.division || 'All',
        product: rawFilters.product || 'All',
        channel: normalizeChannelFilter(rawFilters.channel),
        marketer: rawFilters.marketer || 'All',
        country: rawFilters.country || 'All',
        search: (rawFilters.search || '').trim()
    };

    const { clauses, values } = buildFilterSql(filters, 2);
    const extraWhere = clauses.length > 0 ? `AND ${clauses.join(' AND ')}` : '';

    // 1. Hourly aggregation for the requested date
    const hourlyRes = await pool.query<{
        hour_slot: number;
        spend_vnd: number;
        cohort_rev_vnd: number;
        cutoff_rev_vnd: number;
        installs: number;
    }>(
        `SELECT m.hour_slot,
                COALESCE(SUM(m.spend_vnd), 0) AS spend_vnd,
                COALESCE(SUM(m.cohort_rev_vnd), 0) AS cohort_rev_vnd,
                COALESCE(SUM(m.cutoff_rev_vnd), 0) AS cutoff_rev_vnd,
                COALESCE(SUM(m.installs), 0) AS installs
         FROM intraday_hourly_metrics m
         JOIN campaigns c ON c.id = m.campaign_id
         JOIN products p ON p.id = m.product_id
         WHERE m.metric_date = $1 ${extraWhere}
         GROUP BY m.hour_slot
         ORDER BY m.hour_slot ASC`,
        [filters.date, ...values]
    );

    const maxDbHour = hourlyRes.rows.reduce((m, r) => Math.max(m, r.hour_slot), 0);
    let maxHourSlot = 23;
    if (filters.date === tzNow.date) {
        maxHourSlot = Math.min(23, Math.max(tzNow.hour, maxDbHour));
    } else if (filters.date > tzNow.date) {
        maxHourSlot = 0;
    }

    const hourMap = new Map(hourlyRes.rows.map(r => [r.hour_slot, r]));
    const chartMaxHour = Math.max(1, maxHourSlot);
    const hourly: HourlyPoint[] = [];
    for (let h = 0; h <= chartMaxHour; h++) {
        const row = hourMap.get(h);
        const spend = row ? Number(row.spend_vnd) : 0;
        const cohortRev = row ? Number(row.cohort_rev_vnd) : 0;
        const cutoffRev = row ? Number(row.cutoff_rev_vnd) : 0;
        const installs = row ? Number(row.installs) : 0;
        hourly.push({
            hour: `${String(h).padStart(2, '0')}:00`,
            hourSlot: h,
            spend,
            rev: cutoffRev,
            cohortRev,
            roas: spend > 0 ? Number(((cohortRev / spend) * 100).toFixed(1)) : 0,
            installs
        });
    }

    // 2. Campaign-level aggregation for the requested date (plus recent 2 hours for Est ROAS H1)
    const recentStartHour = Math.max(0, maxHourSlot - 1);
    const cmpRes = await pool.query<{
        campaign_id: string;
        external_campaign_id: string;
        campaign_name: string;
        product_id: string;
        product_name: string;
        division: string;
        channel: string;
        marketer_id: string | null;
        countries: string;
        daily_budget_vnd: number;
        status: string;
        spend_vnd: number;
        cohort_rev_vnd: number;
        cutoff_rev_vnd: number;
        installs: number;
        recent_spend_vnd: number;
        recent_cohort_rev_vnd: number;
        last_updated: Date;
    }>(
        `SELECT c.id AS campaign_id,
                c.external_campaign_id,
                c.name AS campaign_name,
                c.product_id,
                p.name AS product_name,
                p.division,
                m.channel,
                c.marketer_id,
                c.countries,
                c.daily_budget_vnd,
                c.status,
                COALESCE(SUM(m.spend_vnd), 0) AS spend_vnd,
                COALESCE(SUM(m.cohort_rev_vnd), 0) AS cohort_rev_vnd,
                COALESCE(SUM(m.cutoff_rev_vnd), 0) AS cutoff_rev_vnd,
                COALESCE(SUM(m.installs), 0) AS installs,
                COALESCE(SUM(CASE WHEN m.hour_slot >= $2 THEN m.spend_vnd ELSE 0 END), 0) AS recent_spend_vnd,
                COALESCE(SUM(CASE WHEN m.hour_slot >= $2 THEN m.cohort_rev_vnd ELSE 0 END), 0) AS recent_cohort_rev_vnd,
                MAX(GREATEST(m.updated_at, c.updated_at)) AS last_updated
         FROM intraday_hourly_metrics m
         JOIN campaigns c ON c.id = m.campaign_id
         JOIN products p ON p.id = m.product_id
         WHERE m.metric_date = $1 ${extraWhere.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + 1}`)}
         GROUP BY c.id, c.external_campaign_id, c.name, c.product_id, p.name, p.division, m.channel, c.marketer_id, c.countries, c.daily_budget_vnd, c.status
         ORDER BY spend_vnd DESC, cohort_rev_vnd DESC`,
        [filters.date, recentStartHour, ...values]
    );

    // 3. Historical T-1, T-2, T-3 comparison (same hour window + EOD completion shift)
    const t1Date = shiftDate(filters.date, -1);
    const t2Date = shiftDate(filters.date, -2);
    const t3Date = shiftDate(filters.date, -3);

    const histRes = await pool.query<{
        metric_date: string;
        product_id: string;
        channel: string;
        campaign_id: string;
        same_spend: number;
        same_rev: number;
        eod_spend: number;
        eod_rev: number;
    }>(
        `SELECT m.metric_date,
                m.product_id,
                m.channel,
                m.campaign_id,
                COALESCE(SUM(CASE WHEN m.hour_slot <= $4 THEN m.spend_vnd ELSE 0 END), 0) AS same_spend,
                COALESCE(SUM(CASE WHEN m.hour_slot <= $4 THEN m.cohort_rev_vnd ELSE 0 END), 0) AS same_rev,
                COALESCE(SUM(m.spend_vnd), 0) AS eod_spend,
                COALESCE(SUM(m.cohort_rev_vnd), 0) AS eod_rev
         FROM intraday_hourly_metrics m
         JOIN campaigns c ON c.id = m.campaign_id
         JOIN products p ON p.id = m.product_id
         WHERE m.metric_date IN ($1, $2, $3) ${extraWhere.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + 3}`)}
         GROUP BY m.metric_date, m.product_id, m.channel, m.campaign_id`,
        [t1Date, t2Date, t3Date, maxHourSlot, ...values]
    );

    // Accumulate history buckets keyed by `${scopeKey}|${metricDate}`
    const histBuckets = new Map<string, PastBucket>();
    const addHist = (scopeKey: string, dt: string, row: typeof histRes.rows[number]) => {
        const k = `${scopeKey}|${dt}`;
        const cur = histBuckets.get(k) || { sameSpend: 0, sameRev: 0, eodSpend: 0, eodRev: 0 };
        cur.sameSpend += Number(row.same_spend);
        cur.sameRev += Number(row.same_rev);
        cur.eodSpend += Number(row.eod_spend);
        cur.eodRev += Number(row.eod_rev);
        histBuckets.set(k, cur);
    };

    for (const row of histRes.rows) {
        addHist('TOTAL', row.metric_date, row);
        addHist(`P:${row.product_id}`, row.metric_date, row);
        addHist(`PC:${row.product_id}:${row.channel}`, row.metric_date, row);
        addHist(`C:${row.campaign_id}`, row.metric_date, row);
    }

    const getHistStats = (scopeKey: string, currentRoas: number | null, recentSpend: number, recentRev: number) => {
        const getDayRoas = (dt: string) => {
            const b = histBuckets.get(`${scopeKey}|${dt}`);
            return b && b.sameSpend > 0 ? round2((b.sameRev / b.sameSpend) * 100) : null;
        };
        const roasD0T1 = getDayRoas(t1Date);
        const roasT2 = getDayRoas(t2Date);
        const roasT3 = getDayRoas(t3Date);

        let estRoas: number | null = currentRoas;
        let estRoasH1: number | null = currentRoas;

        if (currentRoas !== null) {
            if (filters.date < tzNow.date) {
                estRoas = currentRoas;
                estRoasH1 = currentRoas;
            } else {
                const shifts: number[] = [];
                for (const dt of [t1Date, t2Date, t3Date]) {
                    const b = histBuckets.get(`${scopeKey}|${dt}`);
                    if (b && b.sameSpend > 0 && b.eodSpend > 0) {
                        const sameR = (b.sameRev / b.sameSpend) * 100;
                        const eodR = (b.eodRev / b.eodSpend) * 100;
                        shifts.push(eodR - sameR);
                    }
                }
                const avgShift = shifts.length > 0 ? shifts.reduce((a, b) => a + b, 0) / shifts.length : 0;
                estRoas = round2(Math.max(0, currentRoas + avgShift));
                const recentRoas = recentSpend > 0 ? (recentRev / recentSpend) * 100 : currentRoas;
                estRoasH1 = round2(Math.max(0, currentRoas * 0.65 + recentRoas * 0.35 + avgShift));
            }
        }

        return { roasD0T1, roasT2, roasT3, estRoas, estRoasH1 };
    };

    // 4. Build 3-level Tree Data (Product -> Channel -> Campaign)
    const prodMap = new Map<string, {
        productId: string;
        productName: string;
        division: string;
        channels: Map<string, {
            channel: string;
            campaigns: TreeCampaignNode[];
            spendVnd: number;
            cohortRevVnd: number;
            cutoffRevVnd: number;
            conversions: number;
            budgetVnd: number;
            recentSpend: number;
            recentRev: number;
            lastUpdated: Date | null;
        }>;
        spendVnd: number;
        cohortRevVnd: number;
        cutoffRevVnd: number;
        conversions: number;
        budgetVnd: number;
        recentSpend: number;
        recentRev: number;
        lastUpdated: Date | null;
    }>();

    let totalSpend = 0;
    let totalCohortRev = 0;
    let totalCutoffRev = 0;
    let totalInstalls = 0;
    let totalRecentSpend = 0;
    let totalRecentRev = 0;
    let latestUpdate: Date | null = null;

    for (const r of cmpRes.rows) {
        const spend = Number(r.spend_vnd);
        const cohortRev = Number(r.cohort_rev_vnd);
        const cutoffRev = Number(r.cutoff_rev_vnd);
        const installs = Number(r.installs);
        const budget = Number(r.daily_budget_vnd);
        const recSpend = Number(r.recent_spend_vnd);
        const recRev = Number(r.recent_cohort_rev_vnd);
        const upd = r.last_updated ? new Date(r.last_updated) : null;

        totalSpend += spend;
        totalCohortRev += cohortRev;
        totalCutoffRev += cutoffRev;
        totalInstalls += installs;
        totalRecentSpend += recSpend;
        totalRecentRev += recRev;
        if (upd && (!latestUpdate || upd > latestUpdate)) latestUpdate = upd;

        if (!prodMap.has(r.product_id)) {
            prodMap.set(r.product_id, {
                productId: r.product_id,
                productName: r.product_name,
                division: r.division,
                channels: new Map(),
                spendVnd: 0,
                cohortRevVnd: 0,
                cutoffRevVnd: 0,
                conversions: 0,
                budgetVnd: 0,
                recentSpend: 0,
                recentRev: 0,
                lastUpdated: null
            });
        }
        const pNode = prodMap.get(r.product_id)!;
        pNode.spendVnd += spend;
        pNode.cohortRevVnd += cohortRev;
        pNode.cutoffRevVnd += cutoffRev;
        pNode.conversions += installs;
        pNode.budgetVnd += budget;
        pNode.recentSpend += recSpend;
        pNode.recentRev += recRev;
        if (upd && (!pNode.lastUpdated || upd > pNode.lastUpdated)) pNode.lastUpdated = upd;

        if (!pNode.channels.has(r.channel)) {
            pNode.channels.set(r.channel, {
                channel: r.channel,
                campaigns: [],
                spendVnd: 0,
                cohortRevVnd: 0,
                cutoffRevVnd: 0,
                conversions: 0,
                budgetVnd: 0,
                recentSpend: 0,
                recentRev: 0,
                lastUpdated: null
            });
        }
        const chNode = pNode.channels.get(r.channel)!;
        chNode.spendVnd += spend;
        chNode.cohortRevVnd += cohortRev;
        chNode.cutoffRevVnd += cutoffRev;
        chNode.conversions += installs;
        chNode.budgetVnd += budget;
        chNode.recentSpend += recSpend;
        chNode.recentRev += recRev;
        if (upd && (!chNode.lastUpdated || upd > chNode.lastUpdated)) chNode.lastUpdated = upd;

        const cmpRoas = calcRoas(cohortRev, spend);
        const cmpHist = getHistStats(`C:${r.campaign_id}`, cmpRoas, recSpend, recRev);

        chNode.campaigns.push({
            id: r.campaign_id,
            type: 'campaign',
            name: r.campaign_name,
            productId: r.product_id,
            channel: r.channel,
            campaign: r.campaign_name,
            campaignId: r.external_campaign_id,
            externalCampaignId: r.external_campaign_id,
            marketerId: r.marketer_id,
            countries: r.countries,
            budgetVnd: budget,
            roasD0: cmpRoas,
            roasD0T1: cmpHist.roasD0T1,
            roasT2: cmpHist.roasT2,
            roasT3: cmpHist.roasT3,
            spendVnd: spend,
            revenueVnd: cohortRev,
            cutoffRevVnd: cutoffRev,
            conversions: installs,
            cpiVnd: installs > 0 && spend > 0 ? Math.round(spend / installs) : 0,
            ltvVnd: installs > 0 ? Math.round(cohortRev / installs) : 0,
            estRoas: cmpHist.estRoas,
            estRoasH1: cmpHist.estRoasH1,
            status: r.status,
            lastUpdate: formatTimeInTz(upd)
        });
    }

    const treeData: TreeProductNode[] = [];
    for (const p of prodMap.values()) {
        const channelsArr: TreeChannelNode[] = [];
        for (const ch of p.channels.values()) {
            const chRoas = calcRoas(ch.cohortRevVnd, ch.spendVnd);
            const chHist = getHistStats(`PC:${p.productId}:${ch.channel}`, chRoas, ch.recentSpend, ch.recentRev);
            channelsArr.push({
                id: `${p.productId}::${ch.channel}`,
                type: 'channel',
                name: ch.channel === 'Google Ads' || ch.channel === 'Organic' || ch.channel === 'Mediation'
                    ? ch.channel
                    : `${ch.channel} Ads`,
                productId: p.productId,
                channel: ch.channel,
                budgetVnd: ch.budgetVnd,
                roasD0: chRoas,
                roasD0T1: chHist.roasD0T1,
                roasT2: chHist.roasT2,
                roasT3: chHist.roasT3,
                spendVnd: ch.spendVnd,
                revenueVnd: ch.cohortRevVnd,
                cutoffRevVnd: ch.cutoffRevVnd,
                conversions: ch.conversions,
                cpiVnd: ch.conversions > 0 && ch.spendVnd > 0 ? Math.round(ch.spendVnd / ch.conversions) : 0,
                ltvVnd: ch.conversions > 0 ? Math.round(ch.cohortRevVnd / ch.conversions) : 0,
                estRoas: chHist.estRoas,
                estRoasH1: chHist.estRoasH1,
                status: ch.campaigns.some(c => c.status === 'ON') ? 'ON' : 'OFF',
                lastUpdate: formatTimeInTz(ch.lastUpdated),
                children: ch.campaigns
            });
        }
        channelsArr.sort((a, b) => b.spendVnd - a.spendVnd || b.revenueVnd - a.revenueVnd);

        const pRoas = calcRoas(p.cohortRevVnd, p.spendVnd);
        const pHist = getHistStats(`P:${p.productId}`, pRoas, p.recentSpend, p.recentRev);
        treeData.push({
            id: p.productId,
            type: 'product',
            name: `${p.productId} - ${p.productName}`,
            productId: p.productId,
            division: p.division,
            channel: 'Multi-Channel',
            budgetVnd: p.budgetVnd,
            roasD0: pRoas,
            roasD0T1: pHist.roasD0T1,
            roasT2: pHist.roasT2,
            roasT3: pHist.roasT3,
            spendVnd: p.spendVnd,
            revenueVnd: p.cohortRevVnd,
            cutoffRevVnd: p.cutoffRevVnd,
            conversions: p.conversions,
            cpiVnd: p.conversions > 0 && p.spendVnd > 0 ? Math.round(p.spendVnd / p.conversions) : 0,
            ltvVnd: p.conversions > 0 ? Math.round(p.cohortRevVnd / p.conversions) : 0,
            estRoas: pHist.estRoas,
            estRoasH1: pHist.estRoasH1,
            status: channelsArr.some(c => c.status === 'ON') ? 'ON' : 'OFF',
            lastUpdate: formatTimeInTz(p.lastUpdated),
            children: channelsArr
        });
    }
    treeData.sort((a, b) => b.spendVnd - a.spendVnd || b.revenueVnd - a.revenueVnd);

    // 5. Global KPI Summary & Meta
    const globalRoas = calcRoas(totalCohortRev, totalSpend) ?? 0;
    const globalHist = getHistStats('TOTAL', totalSpend > 0 ? globalRoas : null, totalRecentSpend, totalRecentRev);
    const netCutoffRev = totalCutoffRev * (1 - settings.platformFeeRate);
    const pl2Vnd = Math.round(netCutoffRev - totalSpend);
    const percentPl2 = netCutoffRev > 0 ? round2((pl2Vnd / netCutoffRev) * 100) : 0;
    const cpiVnd = totalInstalls > 0 && totalSpend > 0 ? round2(totalSpend / totalInstalls) : 0;
    const ltvVnd = totalInstalls > 0 ? round2(totalCohortRev / totalInstalls) : 0;

    const [y, m, d] = filters.date.split('-');
    const displayDate = `${d}/${m}/${y}`;
    const lastUpdateStr = latestUpdate ? formatTimeInTz(latestUpdate) : tzNow.timeLabel;

    const [productsMetaRes, marketersMetaRes] = await Promise.all([
        pool.query<{ id: string; division: string; name: string; dau_label: string }>(
            'SELECT id, division, name, dau_label FROM products ORDER BY id ASC'
        ),
        pool.query<{ id: string; full_name: string }>(
            'SELECT id, full_name FROM marketers ORDER BY full_name ASC'
        )
    ]);

    return {
        filters,
        summary: {
            date: filters.date,
            displayDate,
            currentHourSlot: maxHourSlot,
            currentHourLabel: `#${String(maxHourSlot).padStart(2, '0')}:00 ${d}/${m}`,
            lastUpdate: lastUpdateStr,
            exchangeRate: settings.exchangeRateVnd,
            platformFeeRate: settings.platformFeeRate,
            spendVnd: Math.round(totalSpend),
            cohortRevVnd: Math.round(totalCohortRev),
            cutoffRevVnd: Math.round(totalCutoffRev),
            roas: globalRoas,
            pl2Vnd,
            percentPl2,
            estRoas: globalHist.estRoas ?? globalRoas,
            roasD0T1: globalHist.roasD0T1,
            roasT2: globalHist.roasT2,
            roasT3: globalHist.roasT3,
            totalInstall: totalInstalls,
            cpiVnd,
            ltvVnd
        },
        grandTotal: {
            spendVnd: Math.round(totalSpend),
            revenueVnd: Math.round(totalCohortRev),
            cutoffRevVnd: Math.round(totalCutoffRev),
            conversions: totalInstalls,
            roasD0: globalRoas,
            estRoas: globalHist.estRoas ?? globalRoas,
            estRoasH1: globalHist.estRoasH1 ?? globalRoas,
            roasD0T1: globalHist.roasD0T1,
            roasT2: globalHist.roasT2,
            roasT3: globalHist.roasT3,
            cpiVnd,
            ltvVnd,
            lastUpdate: lastUpdateStr
        },
        hourly,
        treeData,
        meta: {
            products: productsMetaRes.rows.map(r => ({
                id: r.id,
                division: r.division,
                name: r.name,
                dauLabel: r.dau_label
            })),
            marketers: marketersMetaRes.rows.map(r => ({
                id: r.id,
                fullName: r.full_name
            })),
            ggsheetCsvUrl: settings.ggsheetCsvUrl
        }
    };
}

export async function updateCampaignStatus(campaignId: string, status: 'ON' | 'OFF') {
    const { rows } = await pool.query<{ id: string; name: string; status: string }>(
        `UPDATE campaigns SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING id, name, status`,
        [campaignId, status]
    );
    return rows[0] || null;
}

function csvEscape(val: unknown): string {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

export function buildIntradayCsv(report: IntradayReportResponse, currency: 'VND' | 'USD' = 'VND'): string {
    const rate = report.summary.exchangeRate || 25718;
    const fmtMoney = (vnd: number) =>
        currency === 'USD' ? (vnd / rate).toFixed(2) : String(Math.round(vnd));
    const fmtRoas = (r: number | null) => (r === null ? 'N/A' : `${r.toFixed(2)}%`);

    const header = [
        'Level', 'Product Id', 'Channel', 'Campaign', 'Campaign Id', 'Status',
        'Countries', `Budget (${currency})`, 'ROASD0', 'ROASD0 T-1', 'ROASD0 T-2', 'ROASD0 T-3',
        `Spend (${currency})`, `Revenue (${currency})`, 'Conversion', `CPI (${currency})`,
        `LTV (${currency})`, 'Est Roas', 'Est Roas H1', 'Last update'
    ];

    const lines: string[] = [header.map(csvEscape).join(',')];

    for (const prod of report.treeData) {
        for (const ch of prod.children) {
            for (const cmp of ch.children) {
                lines.push([
                    'Campaign',
                    cmp.productId,
                    cmp.channel,
                    cmp.name,
                    cmp.externalCampaignId,
                    cmp.status,
                    cmp.countries,
                    fmtMoney(cmp.budgetVnd),
                    fmtRoas(cmp.roasD0),
                    fmtRoas(cmp.roasD0T1),
                    fmtRoas(cmp.roasT2),
                    fmtRoas(cmp.roasT3),
                    fmtMoney(cmp.spendVnd),
                    fmtMoney(cmp.revenueVnd),
                    cmp.conversions,
                    fmtMoney(cmp.cpiVnd),
                    fmtMoney(cmp.ltvVnd),
                    fmtRoas(cmp.estRoas),
                    fmtRoas(cmp.estRoasH1),
                    cmp.lastUpdate
                ].map(csvEscape).join(','));
            }
        }
    }

    lines.push([
        'Grand Total', 'ALL', 'ALL', 'GRAND TOTAL', '-', '-', 'All', '-',
        fmtRoas(report.grandTotal.roasD0),
        fmtRoas(report.grandTotal.roasD0T1),
        fmtRoas(report.grandTotal.roasT2),
        fmtRoas(report.grandTotal.roasT3),
        fmtMoney(report.grandTotal.spendVnd),
        fmtMoney(report.grandTotal.revenueVnd),
        report.grandTotal.conversions,
        fmtMoney(report.grandTotal.cpiVnd),
        fmtMoney(report.grandTotal.ltvVnd),
        fmtRoas(report.grandTotal.estRoas),
        fmtRoas(report.grandTotal.estRoasH1),
        report.grandTotal.lastUpdate
    ].map(csvEscape).join(','));

    return '\uFEFF' + lines.join('\r\n');
}
