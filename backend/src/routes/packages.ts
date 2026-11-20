import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { makeId, normalizeBulkChannel, validatePackageInput } from '../services/batchPlanner.js';

async function fetchFormattedPackages() {
    const [pkgRes, tacRes] = await Promise.all([
        pool.query(`
            SELECT p.*,
                   app.name AS app_template_name,
                   app.product_id,
                   cam.name AS cam_template_name,
                   cam.budget_amount,
                   cam.budget_currency,
                   cam.ad_group_volume,
                   cam.creative_volume,
                   ad.name AS ad_template_name,
                   pg.name AS page_template_name,
                   acc.name AS ad_account_name,
                   acc.access_token IS NOT NULL AND LENGTH(TRIM(acc.access_token)) > 0 AS has_token
            FROM packages p
            JOIN app_templates app ON app.id = p.app_template_id
            JOIN campaign_templates cam ON cam.id = p.campaign_template_id
            JOIN ad_templates ad ON ad.id = p.ad_template_id
            LEFT JOIN page_templates pg ON pg.id = p.page_template_id
            JOIN ad_accounts acc ON acc.id = p.ad_account_id
            ORDER BY p.updated_at DESC
        `),
        pool.query<{ id: string; name: string }>('SELECT id, name FROM tactics')
    ]);

    const tacMap = new Map(tacRes.rows.map(t => [t.id, t.name]));

    return pkgRes.rows.map(r => {
        const tacIds = Array.isArray(r.tactic_ids) ? (r.tactic_ids as string[]) : [];
        const tacNames = tacIds.map(id => tacMap.get(id) || id);
        return {
            id: r.id,
            name: r.name,
            channel: r.channel,
            productId: r.product_id,
            appTemplateId: r.app_template_id,
            appTemplate: r.app_template_name,
            campaignTemplateId: r.campaign_template_id,
            camTemplate: r.cam_template_name,
            adTemplateId: r.ad_template_id,
            adTemplate: r.ad_template_name,
            pageTemplateId: r.page_template_id,
            pageTemplate: r.page_template_name || '-',
            adAccountId: r.ad_account_id,
            adAccount: `${r.ad_account_id} - ${r.ad_account_name}`,
            hasToken: Boolean(r.has_token),
            budgetLabel: r.budget_currency === 'USD'
                ? `$${Number(r.budget_amount)}/day`
                : `${Number(r.budget_amount).toLocaleString('en-US')} ₫/day`,
            adGroupVolume: Number(r.ad_group_volume || 1),
            creativeVolume: Number(r.creative_volume || 1),
            tacticIds: tacIds,
            tacticNames: tacNames,
            tactics: tacNames.join(', ') || 'None',
            namingTemplate: r.naming_template,
            status: r.status || 'Running',
            createdDate: r.created_at ? new Date(String(r.created_at)).toISOString().slice(0, 10) : ''
        };
    });
}

export async function packageRoutes(app: FastifyInstance): Promise<void> {
    app.get<{ Querystring: { channel?: string; status?: string; search?: string } }>(
        '/api/v1/packages',
        async (req) => {
            let items = await fetchFormattedPackages();
            const ch = req.query.channel?.trim();
            const st = req.query.status?.trim();
            const q = req.query.search?.trim().toLowerCase();

            if (ch && ch !== 'All') {
                const normCh = normalizeBulkChannel(ch);
                items = items.filter(p => p.channel === normCh);
            }
            if (st && st !== 'All') {
                items = items.filter(p => p.status === st);
            }
            if (q) {
                items = items.filter(p =>
                    `${p.name} ${p.adAccount} ${p.appTemplate} ${p.camTemplate}`.toLowerCase().includes(q)
                );
            }

            return { ok: true, items, totalCount: items.length };
        }
    );

    app.post<{
        Body: {
            name?: string;
            channel?: string;
            appTemplateId?: string;
            campaignTemplateId?: string;
            adTemplateId?: string;
            pageTemplateId?: string | null;
            adAccountId?: string;
            tacticIds?: string[];
            namingTemplate?: string;
            status?: string;
            createdBy?: string;
        };
    }>('/api/v1/packages', async (req, reply) => {
        const b = req.body || {};
        const name = String(b.name || '').trim();
        if (!name || !b.appTemplateId || !b.campaignTemplateId || !b.adTemplateId || !b.adAccountId) {
            return reply.code(400).send({
                ok: false,
                error: 'Thiếu thông tin bắt buộc (name, appTemplateId, campaignTemplateId, adTemplateId, adAccountId).'
            });
        }

        const validation = await validatePackageInput({
            channel: String(b.channel || 'Facebook'),
            appTemplateId: b.appTemplateId,
            campaignTemplateId: b.campaignTemplateId,
            adTemplateId: b.adTemplateId,
            pageTemplateId: b.pageTemplateId || null,
            adAccountId: b.adAccountId
        });

        if (validation.errors.length > 0) {
            return reply.code(400).send({
                ok: false,
                error: validation.errors[0],
                errors: validation.errors
            });
        }

        const id = makeId('pkg');
        await pool.query(
            `INSERT INTO packages (
                id, name, channel, app_template_id, campaign_template_id, ad_template_id,
                page_template_id, ad_account_id, tactic_ids, naming_template, status, created_by
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [
                id,
                name,
                validation.channel,
                b.appTemplateId,
                b.campaignTemplateId,
                b.adTemplateId,
                validation.channel === 'Facebook' ? (b.pageTemplateId || null) : null,
                b.adAccountId,
                Array.isArray(b.tacticIds) ? b.tacticIds : [],
                b.namingTemplate || '{product}_{channel}_{geo}_{angle}_{lang}_{pkg_tag}_{acc_short}_{date}_{idx}',
                b.status === 'Draft' ? 'Draft' : 'Running',
                b.createdBy || 'HoangNC'
            ]
        );

        const all = await fetchFormattedPackages();
        const created = all.find(x => x.id === id);
        return { ok: true, item: created };
    });

    app.patch<{
        Params: { id: string };
        Body: { status?: string; name?: string; tacticIds?: string[] };
    }>('/api/v1/packages/:id', async (req, reply) => {
        const b = req.body || {};
        const { rows } = await pool.query(
            `UPDATE packages
             SET status = COALESCE($2, status),
                 name = COALESCE($3, name),
                 tactic_ids = COALESCE($4, tactic_ids),
                 updated_at = NOW()
             WHERE id = $1
             RETURNING id`,
            [
                req.params.id,
                b.status || null,
                b.name ? String(b.name).trim() : null,
                Array.isArray(b.tacticIds) ? b.tacticIds : null
            ]
        );
        if (!rows[0]) return reply.code(404).send({ ok: false, error: 'Không tìm thấy Package.' });

        const all = await fetchFormattedPackages();
        return { ok: true, item: all.find(x => x.id === req.params.id) };
    });
}
