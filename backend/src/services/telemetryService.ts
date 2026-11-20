import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { formatTimeInTz } from '../utils/time.js';

export interface AppSettings {
    exchangeRateVnd: number;
    platformFeeRate: number;
    ggsheetCsvUrl: string;
}

export async function getAppSettings(): Promise<AppSettings> {
    const { rows } = await pool.query<{ key: string; value: string }>(
        `SELECT key, value FROM system_settings WHERE key IN ('exchange_rate_vnd', 'platform_fee_rate', 'ggsheet_csv_url')`
    );
    const map = new Map(rows.map(r => [r.key, r.value]));
    return {
        exchangeRateVnd: Number(map.get('exchange_rate_vnd')) || config.exchangeRateVnd,
        platformFeeRate: Number(map.get('platform_fee_rate')) || config.platformFeeRate,
        ggsheetCsvUrl: map.get('ggsheet_csv_url') || ''
    };
}

export async function setSystemSetting(key: string, value: string): Promise<void> {
    await pool.query(
        `INSERT INTO system_settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, value]
    );
}

export interface TelemetryEntry {
    id: number;
    time: string;
    createdAt: string;
    source: string;
    status: number;
    latency: string;
    text: string;
    payloadSummary?: Record<string, unknown> | null;
}

export async function recordTelemetry(params: {
    source: string;
    statusCode?: number;
    latencyMs?: number;
    message: string;
    payloadSummary?: Record<string, unknown>;
}): Promise<TelemetryEntry> {
    const { rows } = await pool.query<{
        id: number;
        created_at: Date;
        source: string;
        status_code: number;
        latency_ms: number;
        message: string;
        payload_summary: Record<string, unknown> | null;
    }>(
        `INSERT INTO telemetry_logs (source, status_code, latency_ms, message, payload_summary)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING id, created_at, source, status_code, latency_ms, message, payload_summary`,
        [
            params.source,
            params.statusCode ?? 200,
            params.latencyMs ?? 25,
            params.message,
            params.payloadSummary ? JSON.stringify(params.payloadSummary) : null
        ]
    );
    const row = rows[0];
    return {
        id: row.id,
        time: formatTimeInTz(row.created_at),
        createdAt: new Date(row.created_at).toISOString(),
        source: row.source,
        status: row.status_code,
        latency: `${row.latency_ms}ms`,
        text: row.message,
        payloadSummary: row.payload_summary
    };
}

export async function getRecentTelemetry(limit = 40): Promise<TelemetryEntry[]> {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const { rows } = await pool.query<{
        id: number;
        created_at: Date;
        source: string;
        status_code: number;
        latency_ms: number;
        message: string;
        payload_summary: Record<string, unknown> | null;
    }>(
        `SELECT id, created_at, source, status_code, latency_ms, message, payload_summary
         FROM telemetry_logs
         ORDER BY id DESC
         LIMIT $1`,
        [safeLimit]
    );
    return rows.map(row => ({
        id: row.id,
        time: formatTimeInTz(row.created_at),
        createdAt: new Date(row.created_at).toISOString(),
        source: row.source,
        status: row.status_code,
        latency: `${row.latency_ms}ms`,
        text: row.message,
        payloadSummary: row.payload_summary
    }));
}
