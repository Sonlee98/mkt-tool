import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { syncAdAccountById } from '../adapters/adPlatformAdapters.js';
import { getAppSettings, setSystemSetting } from '../services/telemetryService.js';
import { encryptSecret, maskSecret } from '../utils/cryptoVault.js';
import { hasAccountLiveCredentials } from '../utils/googleOAuth.js';
import { formatShortDateTimeInTz, getNowInTz } from '../utils/time.js';

function sanitizeApiConfigForClient(rawConfig: Record<string, unknown> | null): Record<string, unknown> {
    const src = Object.assign({}, rawConfig || {});
    const hasRefreshToken = typeof src.refresh_token === 'string' && src.refresh_token.trim().length > 0;
    const hasClientSecret = typeof src.client_secret === 'string' && src.client_secret.trim().length > 0;
    const hasDeveloperToken = typeof src.developer_token === 'string' && src.developer_token.trim().length > 0;

    delete src.refresh_token;
    delete src.client_secret;
    if (hasDeveloperToken) {
        src.developer_token_preview = maskSecret(String(src.developer_token));
        delete src.developer_token;
    }

    return {
        ...src,
        hasRefreshToken,
        hasClientSecret,
        hasDeveloperToken,
        encryption: 'AES-256-GCM'
    };
}

export async function adAccountRoutes(app: FastifyInstance): Promise<void> {
    app.get('/api/v1/admin/security', async () => {
        const settings = await getAppSettings();
        const effectiveWebhookSecret = config.webhookSecret || settings.webhookSecret;
        return {
            ok: true,
            tokenEncryption: 'AES-256-GCM',
            adminKeyRequired: Boolean(config.adminApiKey),
            webhookSecretConfigured: Boolean(effectiveWebhookSecret),
            webhookSecretFromEnv: Boolean(config.webhookSecret),
            webhookSecretPreview: maskSecret(effectiveWebhookSecret),
            maxCampaignDailyBudgetUsd: config.maxCampaignDailyBudgetUsd,
            maxBatchDailyBudgetUsd: config.maxBatchDailyBudgetUsd
        };
    });

    app.post<{ Body: { webhookSecret?: string } }>('/api/v1/admin/security', async (req) => {
        const nextSecret = typeof req.body?.webhookSecret === 'string' ? req.body.webhookSecret.trim() : '';
        await setSystemSetting('webhook_secret', nextSecret);
        const effectiveWebhookSecret = config.webhookSecret || nextSecret;
        return {
            ok: true,
            webhookSecretConfigured: Boolean(effectiveWebhookSecret),
            webhookSecretPreview: maskSecret(effectiveWebhookSecret)
        };
    });

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
                const refreshPreview = typeof r.api_config?.refresh_token === 'string'
                    ? maskSecret(r.api_config.refresh_token)
                    : null;
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
                    hasToken: hasAccountLiveCredentials(r),
                    tokenPreview: maskSecret(r.access_token) || refreshPreview,
                    apiConfig: sanitizeApiConfigForClient(r.api_config),
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
        const existing = await pool.query<{ access_token: string | null; api_config: Record<string, unknown> }>(
            `SELECT access_token, api_config FROM ad_accounts WHERE id = $1`,
            [id]
        );

        let tokenToSave: string | null = existing.rows[0]?.access_token ?? null;
        if (b.clearToken) {
            tokenToSave = null;
        } else if (typeof b.accessToken === 'string' && b.accessToken.trim().length > 0) {
            tokenToSave = encryptSecret(b.accessToken.trim());
        } else if (tokenToSave && !tokenToSave.startsWith('enc:v1:')) {
            tokenToSave = encryptSecret(tokenToSave);
        }

        const prevConfig = Object.assign({}, existing.rows[0]?.api_config || {});
        const nextConfig: Record<string, unknown> = { ...prevConfig, ...(b.apiConfig || {}) };

        if (b.clearToken) {
            delete nextConfig.refresh_token;
            delete nextConfig.client_secret;
        } else {
            const incomingRefresh = typeof b.apiConfig?.refresh_token === 'string' ? b.apiConfig.refresh_token.trim() : '';
            if (incomingRefresh) {
                nextConfig.refresh_token = encryptSecret(incomingRefresh);
            } else if (typeof prevConfig.refresh_token === 'string' && prevConfig.refresh_token) {
                nextConfig.refresh_token = prevConfig.refresh_token;
            } else {
                delete nextConfig.refresh_token;
            }

            const incomingSecret = typeof b.apiConfig?.client_secret === 'string' ? b.apiConfig.client_secret.trim() : '';
            if (incomingSecret) {
                nextConfig.client_secret = encryptSecret(incomingSecret);
            } else if (typeof prevConfig.client_secret === 'string' && prevConfig.client_secret) {
                nextConfig.client_secret = prevConfig.client_secret;
            } else {
                delete nextConfig.client_secret;
            }

            if (typeof nextConfig.developer_token === 'string' && !nextConfig.developer_token.trim()) {
                if (typeof prevConfig.developer_token === 'string' && prevConfig.developer_token) {
                    nextConfig.developer_token = prevConfig.developer_token;
                } else {
                    delete nextConfig.developer_token;
                }
            }
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
                api_config = EXCLUDED.api_config`,
            [
                id,
                b.name.trim(),
                b.channel.trim(),
                (b.currency || 'USD').trim().toUpperCase(),
                Number(b.balanceUsd ?? 10000),
                tokenToSave,
                JSON.stringify(nextConfig)
            ]
        );

        const credRow = { id, channel: b.channel.trim(), access_token: tokenToSave, api_config: nextConfig };
        return {
            ok: true,
            id,
            hasToken: hasAccountLiveCredentials(credRow),
            encrypted: Boolean(tokenToSave?.startsWith('enc:v1:') || String(nextConfig.refresh_token || '').startsWith('enc:v1:'))
        };
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
