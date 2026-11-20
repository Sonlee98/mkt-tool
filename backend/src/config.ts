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
    frontendDir: path.resolve(__dirname, '../../')
};
