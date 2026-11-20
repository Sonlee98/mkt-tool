import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { syncAdAccountById } from '../adapters/adPlatformAdapters.js';
import { getAppSettings } from '../services/telemetryService.js';
import { formatShortDateTimeInTz, getNowInTz } from '../utils/time.js';

function maskToken(token: string | null): string | null {
    if (!token || token.trim().length === 0) return null;
    const t = token.trim();
    if (t.length <= 6) return '******';
    return `${'*'.repeat(6)}${t.slice(-4)}`;
}

export async function adAccountRoutes(app: FastifyInstance): Promise<void> {
    app.get('/api/v1/ad-accounts', async () => {
        const tzNow = getNowInTz();
        const settings = await getAppSettings();

        const { rows } = await pool.query<{
            id: string;
            name: string;
            channel: string;
            currency: string;
            balance_usd: number;
            status: string;
            access_token: string | null;
            api_config: Record<string, unknown>;
            last_sync_at: Date | null;
            spend_today_vnd: number;
        }>(
            `SELECT a.id,
                    a.name,
                    a.channel,
                    a.currency,
                    a.balance_usd,
                    a.status,
                    a.access_token,
                    a.api_config,
                    a.last_sync_at,
                    COALESCE(SUM(m.spend_vnd), 0) AS spend_today_vnd
             FROM ad_accounts a
             LEFT JOIN campaigns c ON c.ad_account_id = a.id
             LEFT JOIN intraday_hourly_metrics m ON m.campaign_id = c.id AND m.metric_date = $1
             GROUP BY a.id, a.name, a.channel, a.currency, a.balance_usd, a.status, a.access_token, a.api_config, a.last_sync_at
             ORDER BY spend_today_vnd DESC, a.name ASC`,
            [tzNow.date]
        );

        return {
            ok: true,
            exchangeRate: settings.exchangeRateVnd,
            accounts: rows.map(r => {
                const spendVnd = Number(r.spend_today_vnd);
                const spendUsd = spendVnd / settings.exchangeRateVnd;
                return {
                    id: r.id,
                    name: r.name,
                    channel: r.channel,
                    currency: r.currency,
                    balanceUsd: Number(r.balance_usd),
                    balance: `$${Number(r.balance_usd).toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
                    spendTodayVnd: Math.round(spendVnd),
                    spendToday: `$${Math.round(spendUsd).toLocaleString('en-US')}`,
                    status: r.status,
                    hasToken: Boolean(r.access_token && r.access_token.trim().length > 0),
                    tokenPreview: maskToken(r.access_token),
                    apiConfig: r.api_config,
                    lastSync: formatShortDateTimeInTz(r.last_sync_at)
                };
            })
        };
    });

    app.post<{
        Body: {
            id?: string;
            name?: string;
            channel?: string;
            currency?: string;
            balanceUsd?: number;
            accessToken?: string;
            clearToken?: boolean;
            apiConfig?: Record<string, unknown>;
        };
    }>('/api/v1/ad-accounts', async (req, reply) => {
        const b = req.body || {};
        if (!b.id || !b.name || !b.channel) {
            return reply.code(400).send({ ok: false, error: 'Thiếu Account ID, Tên tài khoản hoặc Kênh.' });
        }

        const id = b.id.trim();
        const existing = await pool.query<{ access_token: string | null }>(
            `SELECT access_token FROM ad_accounts WHERE id = $1`,
            [id]
        );

        let tokenToSave: string | null = existing.rows[0]?.access_token ?? null;
        if (b.clearToken) {
            tokenToSave = null;
        } else if (typeof b.accessToken === 'string' && b.accessToken.trim().length > 0) {
            tokenToSave = b.accessToken.trim();
        }

        await pool.query(
            `INSERT INTO ad_accounts (id, name, channel, currency, balance_usd, status, access_token, api_config, last_sync_at)
             VALUES ($1, $2, $3, $4, $5, 'Connected', $6, $7::jsonb, NOW())
             ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                channel = EXCLUDED.channel,
                currency = EXCLUDED.currency,
                balance_usd = EXCLUDED.balance_usd,
                access_token = EXCLUDED.access_token,
                api_config = COALESCE(EXCLUDED.api_config, ad_accounts.api_config)`,
            [
                id,
                b.name.trim(),
                b.channel.trim(),
                (b.currency || 'USD').trim().toUpperCase(),
                Number(b.balanceUsd ?? 10000),
                tokenToSave,
                JSON.stringify(b.apiConfig || {})
            ]
        );

        return { ok: true, id, hasToken: Boolean(tokenToSave) };
    });

    app.post<{ Params: { id: string } }>('/api/v1/ad-accounts/:id/sync', async (req, reply) => {
        try {
            const result = await syncAdAccountById(req.params.id);
            return { ok: true, ...result };
        } catch (err) {
            return reply.code(404).send({ ok: false, error: (err as Error).message });
        }
    });
}
