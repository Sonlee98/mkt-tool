import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { syncAdAccountById } from '../adapters/adPlatformAdapters.js';
import { ingestMetricsBatch } from '../services/ingestService.js';
import { sseHub } from '../services/sseHub.js';
import { getNowInTz } from '../utils/time.js';

const ROTATING_SOURCES = [
    { type: 'account', accountId: 'act_102938401', label: 'Facebook Marketing API (v20.0)' },
    { type: 'account', accountId: 'act_719284109', label: 'TikTok Business API (v1.3)' },
    { type: 'account', accountId: 'act_829104820', label: 'Google Ads UAC Stream' },
    { type: 'account', accountId: 'act_102938402', label: 'Facebook Marketing API - LATAM' },
    { type: 'mmp', label: 'AppsFlyer / AppLovin MAX Push' }
] as const;

class SyncWorker {
    private timer: NodeJS.Timeout | null = null;
    private isRunning = false;
    private intervalMs = config.syncWorkerIntervalMs;
    private syncCount = 0;
    private cursor = 0;
    private lastSyncAt: string | null = null;
    private inFlight = false;

    start(): void {
        if (this.timer) clearInterval(this.timer);
        this.isRunning = true;
        this.timer = setInterval(() => {
            void this.triggerOnce().catch(err => {
                console.error('[SyncWorker] Tick error:', err);
            });
        }, this.intervalMs);
        sseHub.broadcast('worker_status', this.getStatus());
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.isRunning = false;
        sseHub.broadcast('worker_status', this.getStatus());
    }

    toggle(): { isRunning: boolean; intervalMs: number; syncCount: number; lastSyncAt: string | null } {
        if (this.isRunning) {
            this.stop();
        } else {
            this.start();
        }
        return this.getStatus();
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            intervalMs: this.intervalMs,
            syncCount: this.syncCount,
            lastSyncAt: this.lastSyncAt,
            connectedClients: sseHub.getClientCount()
        };
    }

    async triggerOnce(customSource?: string) {
        if (this.inFlight) {
            return { skipped: true, status: this.getStatus() };
        }
        this.inFlight = true;
        try {
            const pick = ROTATING_SOURCES[this.cursor % ROTATING_SOURCES.length];
            this.cursor++;

            let result;
            if (pick.type === 'account') {
                result = await syncAdAccountById(pick.accountId, customSource || pick.label);
            } else {
                // Organic / Mediation cutoff revenue tick
                const tzNow = getNowInTz();
                const { rows } = await pool.query<{ id: string; product_id: string; channel: string; name: string }>(
                    `SELECT id, product_id, channel, name FROM campaigns
                     WHERE channel IN ('Organic', 'Mediation') AND status = 'ON'
                     ORDER BY RANDOM() LIMIT 1`
                );
                if (rows.length > 0) {
                    const c = rows[0];
                    const cutDelta = Math.round(250_000 + Math.random() * 480_000);
                    const cohDelta = c.channel === 'Organic' ? Math.round(cutDelta * 0.45) : Math.round(cutDelta * 0.25);
                    result = await ingestMetricsBatch([{
                        productId: c.product_id,
                        channel: c.channel,
                        campaignId: c.id,
                        campaignName: c.name,
                        country: 'US',
                        date: tzNow.date,
                        hourSlot: tzNow.hour,
                        spendDeltaVnd: 0,
                        cohortRevDeltaVnd: cohDelta,
                        cutoffRevDeltaVnd: cutDelta,
                        installsDelta: c.channel === 'Organic' ? Math.round(cutDelta / 5000) : 0
                    }], customSource || pick.label);
                } else {
                    result = await syncAdAccountById('act_102938401', customSource || pick.label);
                }
            }

            this.syncCount++;
            this.lastSyncAt = new Date().toISOString();
            return { ok: true, result, status: this.getStatus() };
        } finally {
            this.inFlight = false;
        }
    }
}

export const syncWorker = new SyncWorker();
