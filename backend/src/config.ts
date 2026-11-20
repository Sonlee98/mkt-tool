import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
    port: Number(process.env.PORT || 4000),
    databaseUrl: process.env.DATABASE_URL || 'postgres://apero:apero123@127.0.0.1:5434/apero_mktpro',
    timezone: process.env.TIMEZONE || 'Asia/Ho_Chi_Minh',
    syncWorkerIntervalMs: Math.max(2000, Number(process.env.SYNC_WORKER_INTERVAL_MS || 8000)),
    syncWorkerEnabled: process.env.SYNC_WORKER_ENABLED !== 'false',
    exchangeRateVnd: Number(process.env.EXCHANGE_RATE_VND || 25718),
    platformFeeRate: Number(process.env.PLATFORM_FEE_RATE || 0.0155),
    frontendDir: path.resolve(__dirname, '../../'),
    maxCampaignDailyBudgetUsd: Math.max(10, Number(process.env.MAX_CAMPAIGN_DAILY_BUDGET_USD || 2000)),
    maxBatchDailyBudgetUsd: Math.max(10, Number(process.env.MAX_BATCH_DAILY_BUDGET_USD || 10000)),
    tokenEncryptionKey: (process.env.TOKEN_ENCRYPTION_KEY || 'apero-mktpro-dev-vault-key-change-in-prod').trim(),
    webhookSecret: (process.env.WEBHOOK_SECRET || '').trim(),
    adminApiKey: (process.env.ADMIN_API_KEY || '').trim(),
    googleAdsDeveloperToken: (process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '').trim(),
    googleOAuthClientId: (process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim(),
    googleOAuthClientSecret: (process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim(),
    googleOAuthRefreshToken: (process.env.GOOGLE_OAUTH_REFRESH_TOKEN || '').trim()
};
