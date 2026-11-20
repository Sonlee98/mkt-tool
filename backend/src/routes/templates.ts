import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import {
    makeId,
    normalizeBulkChannel,
    normalizeGeneralChannel,
    validateGoogleAdCopyPayload
} from '../services/batchPlanner.js';

function mapAppRow(r: Record<string, unknown>) {
    return {
        id: r.id,
        name: r.name,
        channel: r.channel,
        productId: r.product_id,
        storeType: r.store_type,
        appId: r.platform_app_id,
        platformAppId: r.platform_app_id,
        bundleId: r.bundle_id,
        storeUrl: r.store_url,
        linkStatus: r.link_status,
        date: r.created_at ? new Date(String(r.created_at)).toISOString().slice(0, 10) : ''
    };
}

function mapCampaignTemplateRow(r: Record<string, unknown>) {
    const isUsd = String(r.budget_currency || 'VND').toUpperCase() === 'USD';
    const amt = Number(r.budget_amount || 0);
    return {
        id: r.id,
        name: r.name,
        channel: r.channel,
        buyingType: r.buying_type,
        objective: r.objective,
        goal: r.performance_goal,
        performanceGoal: r.performance_goal,
        event: r.convert_event || 'AD_IMPRESSION',
        convertEvent: r.convert_event || 'AD_IMPRESSION',
        roasGoal: r.roas_goal !== null ? Number(r.roas_goal) : null,
        targetCpa: r.target_cpa !== null ? Number(r.target_cpa) : null,
        budgetAmount: amt,
        budgetCurrency: r.budget_currency,
        budget: isUsd ? `$${amt}/day` : `${amt.toLocaleString('en-US')} ₫/day`,
        budgetLevel: r.budget_level,
        adGroupVolume: Number(r.ad_group_volume || 1),
        creativeVolume: Number(r.creative_volume || 1),
        volume: `${r.ad_group_volume || 1}G × ${r.creative_volume || 1}C`,
        isWorldwide: Boolean(r.is_worldwide),
        countries: Array.isArray(r.country_codes) ? r.country_codes : [],
        languages: Array.isArray(r.language_codes) ? r.language_codes : [],
        attribution: r.attribution_window || '1-day click',
        isAiMedia: Boolean(r.is_ai_media),
        platformExtras: r.platform_extras || {},
        date: r.created_at ? new Date(String(r.created_at)).toISOString().slice(0, 10) : ''
    };
}

function mapAdTemplateRow(r: Record<string, unknown>) {
    const payload = (r.copy_payload || {}) as Record<string, unknown>;
    let primaryText = '-';
    let headline = '-';
    let description = '-';

    if (Array.isArray(payload.groups) && payload.groups.length > 0) {
        const g0 = payload.groups[0] as { headlines?: string[]; descriptions?: string[] };
        headline = g0.headlines?.[0] || '-';
        description = g0.descriptions?.[0] || '-';
        primaryText = `[${payload.groups.length} UAC Groups] ${headline}`;
    } else {
        const bodies = Array.isArray(payload.primary_texts) ? (payload.primary_texts as string[]) : [];
        const titles = Array.isArray(payload.headlines) ? (payload.headlines as string[]) : [];
        const descs = Array.isArray(payload.descriptions) ? (payload.descriptions as string[]) : [];
        primaryText = bodies[0] || '-';
        headline = titles[0] || '-';
        description = descs[0] || '-';
    }

    return {
        id: r.id,
        name: r.name,
        channel: r.channel,
        objective: r.objective,
        format: r.format,
        cta: r.cta_type || 'INSTALL_MOBILE_APP',
        ctaType: r.cta_type || 'INSTALL_MOBILE_APP',
        primaryText,
        headline,
        description,
        copyPayload: payload,
        date: r.created_at ? new Date(String(r.created_at)).toISOString().slice(0, 10) : ''
    };
}

function mapPageTemplateRow(r: Record<string, unknown>) {
    return {
        id: r.id,
        name: r.name,
        channel: r.channel,
        pageId: r.page_id,
        instagramActorId: r.instagram_actor_id || null,
        appTemplateId: r.app_template_id || null,
        appTemplate: r.app_template_name || r.app_template_id || '-',
        status: r.status || 'Active',
        date: r.created_at ? new Date(String(r.created_at)).toISOString().slice(0, 10) : ''
    };
}

export async function templateRoutes(app: FastifyInstance): Promise<void> {
    app.get('/api/v1/templates', async () => {
        const [apps, cams, ads, pages] = await Promise.all([
            pool.query('SELECT * FROM app_templates ORDER BY created_at DESC'),
            pool.query('SELECT * FROM campaign_templates ORDER BY created_at DESC'),
            pool.query('SELECT * FROM ad_templates ORDER BY created_at DESC'),
            pool.query(
                `SELECT p.*, a.name AS app_template_name
                 FROM page_templates p
                 LEFT JOIN app_templates a ON a.id = p.app_template_id
                 ORDER BY p.created_at DESC`
            )
        ]);

        return {
            ok: true,
            applications: apps.rows.map(mapAppRow),
            campaigns: cams.rows.map(mapCampaignTemplateRow),
            ads: ads.rows.map(mapAdTemplateRow),
            pages: pages.rows.map(mapPageTemplateRow)
        };
    });

    app.get<{
        Params: { type: string };
        Querystring: { channel?: string; productId?: string; search?: string };
    }>('/api/v1/templates/:type', async (req, reply) => {
        const type = req.params.type.toLowerCase();
        const chFilter = req.query.channel && req.query.channel !== 'All'
            ? normalizeGeneralChannel(req.query.channel)
            : null;
        const search = req.query.search?.trim().toLowerCase() || '';

        if (type === 'application') {
            const { rows } = await pool.query('SELECT * FROM app_templates ORDER BY created_at DESC');
            let items = rows.map(mapAppRow);
            if (chFilter) items = items.filter(i => i.channel === chFilter);
            if (req.query.productId && req.query.productId !== 'All') {
                items = items.filter(i => i.productId === req.query.productId);
            }
            if (search) items = items.filter(i => `${i.name} ${i.appId}`.toLowerCase().includes(search));
            return { ok: true, items };
        }

        if (type === 'campaign') {
            const { rows } = await pool.query('SELECT * FROM campaign_templates ORDER BY created_at DESC');
            let items = rows.map(mapCampaignTemplateRow);
            if (chFilter) items = items.filter(i => i.channel === chFilter);
            if (search) items = items.filter(i => String(i.name).toLowerCase().includes(search));
            return { ok: true, items };
        }

        if (type === 'ads') {
            const { rows } = await pool.query('SELECT * FROM ad_templates ORDER BY created_at DESC');
            let items = rows.map(mapAdTemplateRow);
            if (chFilter) items = items.filter(i => i.channel === chFilter);
            if (search) items = items.filter(i => `${i.name} ${i.headline} ${i.primaryText}`.toLowerCase().includes(search));
            return { ok: true, items };
        }

        if (type === 'page') {
            const { rows } = await pool.query(
                `SELECT p.*, a.name AS app_template_name
                 FROM page_templates p
                 LEFT JOIN app_templates a ON a.id = p.app_template_id
                 ORDER BY p.created_at DESC`
            );
            let items = rows.map(mapPageTemplateRow);
            if (chFilter) items = items.filter(i => i.channel === chFilter);
            if (search) items = items.filter(i => `${i.name} ${i.pageId}`.toLowerCase().includes(search));
            return { ok: true, items };
        }

        return reply.code(400).send({ ok: false, error: `Loại template không hợp lệ: ${type}` });
    });

    app.post<{ Params: { type: string }; Body: Record<string, unknown> }>(
        '/api/v1/templates/:type',
        async (req, reply) => {
            const type = req.params.type.toLowerCase();
            const b = req.body || {};

            if (type === 'application') {
                const name = String(b.name || '').trim();
                const channel = normalizeGeneralChannel(String(b.channel || 'Facebook'));
                const productId = String(b.productId || 'AIP922').trim().toUpperCase();
                const platformAppId = String(b.platformAppId || b.appId || '').trim();
                const bundleId = String(b.bundleId || platformAppId || 'com.apero.app').trim();
                const storeType = String(b.storeType || 'GOOGLE_PLAY').trim();
                const storeUrl = String(
                    b.storeUrl || `https://play.google.com/store/apps/details?id=${encodeURIComponent(bundleId)}`
                ).trim();

                if (!name || !platformAppId) {
                    return reply.code(400).send({ ok: false, error: 'Thiếu Application Name hoặc Application ID.' });
                }

                const id = makeId('app');
                const { rows } = await pool.query(
                    `INSERT INTO app_templates (id, name, channel, product_id, store_type, platform_app_id, bundle_id, store_url, link_status, created_by)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Linked',$9)
                     RETURNING *`,
                    [id, name, channel, productId, storeType, platformAppId, bundleId, storeUrl, String(b.createdBy || 'HoangNC')]
                );
                return { ok: true, item: mapAppRow(rows[0]) };
            }

            if (type === 'campaign') {
                const name = String(b.name || '').trim();
                const channel = normalizeBulkChannel(String(b.channel || 'Facebook'));
                const budgetAmount = Number(b.budgetAmount ?? 100000);
                const budgetCurrency = String(b.budgetCurrency || (channel === 'Facebook' ? 'VND' : 'USD')).toUpperCase();
                const adGroupVolume = Math.min(50, Math.max(1, Number(b.adGroupVolume ?? 1)));
                const creativeVolume = Math.min(50, Math.max(1, Number(b.creativeVolume ?? 1)));

                if (!name || !Number.isFinite(budgetAmount) || budgetAmount <= 0) {
                    return reply.code(400).send({ ok: false, error: 'Thiếu tên Campaign Template hoặc ngân sách không hợp lệ.' });
                }
                if (channel === 'Google Ads' && creativeVolume > 20) {
                    return reply.code(400).send({ ok: false, error: 'Google Ads UAC chỉ hỗ trợ tối đa 20 video/Ad Group.' });
                }

                const id = makeId('cam');
                const countries = Array.isArray(b.countryCodes)
                    ? (b.countryCodes as string[])
                    : String(b.countries || 'US').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
                const languages = Array.isArray(b.languageCodes)
                    ? (b.languageCodes as string[])
                    : String(b.languages || 'en').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

                const { rows } = await pool.query(
                    `INSERT INTO campaign_templates (
                        id, name, channel, buying_type, objective, performance_goal, convert_event,
                        roas_goal, target_cpa, budget_amount, budget_currency, budget_level,
                        ad_group_volume, creative_volume, is_worldwide, country_codes, language_codes,
                        attribution_window, is_ai_media, platform_extras, created_by
                     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21)
                     RETURNING *`,
                    [
                        id,
                        name,
                        channel,
                        String(b.buyingType || (channel === 'Google Ads' ? 'UAC' : 'Auction')),
                        String(b.objective || 'App Promotion'),
                        String(b.performanceGoal || (channel === 'Google Ads' ? 'TARGET_CPA' : 'MAXIMIZE_VALUE')),
                        String(b.convertEvent || 'AD_IMPRESSION'),
                        b.roasGoal !== undefined && b.roasGoal !== null && b.roasGoal !== '' ? Number(b.roasGoal) : null,
                        b.targetCpa !== undefined && b.targetCpa !== null && b.targetCpa !== '' ? Number(b.targetCpa) : null,
                        budgetAmount,
                        budgetCurrency,
                        String(b.budgetLevel || 'CAMPAIGN_CBO'),
                        adGroupVolume,
                        creativeVolume,
                        Boolean(b.isWorldwide),
                        countries,
                        languages,
                        String(b.attributionWindow || '1-day click'),
                        Boolean(b.isAiMedia),
                        JSON.stringify(b.platformExtras || {}),
                        String(b.createdBy || 'HoangNC')
                    ]
                );
                return { ok: true, item: mapCampaignTemplateRow(rows[0]) };
            }

            if (type === 'ads') {
                const name = String(b.name || '').trim();
                const channel = normalizeBulkChannel(String(b.channel || 'Facebook'));
                if (!name) {
                    return reply.code(400).send({ ok: false, error: 'Thiếu Ads Template Name.' });
                }

                let copyPayload = (b.copyPayload as Record<string, unknown>) || null;
                if (!copyPayload) {
                    if (channel === 'Google Ads') {
                        copyPayload = {
                            groups: [{
                                group_index: 1,
                                theme_name: 'Default',
                                headlines: Array.isArray(b.headlines) ? b.headlines : [String(b.headline || 'AI Video App'), 'Create Videos Fast'],
                                descriptions: Array.isArray(b.descriptions) ? b.descriptions : [String(b.description || 'Create amazing AI videos with one tap. Download today!')]
                            }]
                        };
                    } else {
                        copyPayload = {
                            primary_texts: Array.isArray(b.primaryTexts) ? b.primaryTexts : [String(b.primaryText || '')].filter(Boolean),
                            headlines: Array.isArray(b.headlines) ? b.headlines : [String(b.headline || '')].filter(Boolean),
                            descriptions: Array.isArray(b.descriptions) ? b.descriptions : [String(b.description || '')].filter(Boolean)
                        };
                    }
                }

                if (channel === 'Google Ads') {
                    const copyErrors = validateGoogleAdCopyPayload(copyPayload);
                    if (copyErrors.length > 0) {
                        return reply.code(400).send({ ok: false, error: copyErrors[0], errors: copyErrors });
                    }
                }

                const id = makeId('ad');
                const { rows } = await pool.query(
                    `INSERT INTO ad_templates (id, name, channel, objective, format, cta_type, copy_payload, created_by)
                     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
                     RETURNING *`,
                    [
                        id,
                        name,
                        channel,
                        String(b.objective || 'App Promotion'),
                        String(b.format || (channel === 'Google Ads' ? 'UAC Multi-Asset' : 'Single Video (9:16)')),
                        String(b.ctaType || 'INSTALL_MOBILE_APP'),
                        JSON.stringify(copyPayload),
                        String(b.createdBy || 'TrangDQ')
                    ]
                );
                return { ok: true, item: mapAdTemplateRow(rows[0]) };
            }

            if (type === 'page') {
                const name = String(b.name || '').trim();
                const pageId = String(b.pageId || '').trim();
                const appTemplateId = b.appTemplateId ? String(b.appTemplateId) : null;
                if (!name || !pageId) {
                    return reply.code(400).send({ ok: false, error: 'Thiếu Page Name hoặc Page ID.' });
                }

                const id = makeId('page');
                const { rows } = await pool.query(
                    `INSERT INTO page_templates (id, name, channel, page_id, instagram_actor_id, app_template_id, status)
                     VALUES ($1,$2,'Facebook',$3,$4,$5,'Active')
                     RETURNING *`,
                    [id, name, pageId, b.instagramActorId ? String(b.instagramActorId) : null, appTemplateId]
                );
                return { ok: true, item: mapPageTemplateRow(rows[0]) };
            }

            return reply.code(400).send({ ok: false, error: `Loại template không hợp lệ: ${type}` });
        }
    );

    app.patch<{ Params: { type: string; id: string }; Body: Record<string, unknown> }>(
        '/api/v1/templates/:type/:id',
        async (req, reply) => {
            const { type, id } = req.params;
            const b = req.body || {};
            if (type.toLowerCase() === 'campaign' && b.budgetAmount !== undefined) {
                const { rows } = await pool.query(
                    `UPDATE campaign_templates
                     SET name = COALESCE($2, name),
                         budget_amount = COALESCE($3, budget_amount),
                         ad_group_volume = COALESCE($4, ad_group_volume),
                         creative_volume = COALESCE($5, creative_volume)
                     WHERE id = $1
                     RETURNING *`,
                    [
                        id,
                        b.name ? String(b.name) : null,
                        b.budgetAmount !== undefined ? Number(b.budgetAmount) : null,
                        b.adGroupVolume !== undefined ? Number(b.adGroupVolume) : null,
                        b.creativeVolume !== undefined ? Number(b.creativeVolume) : null
                    ]
                );
                if (!rows[0]) return reply.code(404).send({ ok: false, error: 'Không tìm thấy template.' });
                return { ok: true, item: mapCampaignTemplateRow(rows[0]) };
            }
            return reply.code(400).send({ ok: false, error: 'Không hỗ trợ cập nhật trường yêu cầu.' });
        }
    );
}
