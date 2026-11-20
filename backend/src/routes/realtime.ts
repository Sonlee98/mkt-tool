import type { FastifyInstance } from 'fastify';
import { sseHub } from '../services/sseHub.js';
import { getRecentTelemetry } from '../services/telemetryService.js';
import { syncWorker } from '../workers/syncWorker.js';

export async function realtimeRoutes(app: FastifyInstance): Promise<void> {
    app.get('/api/v1/realtime/stream', async (req, reply) => {
        reply.hijack();
        const res = reply.raw;
        res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });

        sseHub.addClient(res);

        const initPayload = {
            worker: syncWorker.getStatus(),
            serverTime: new Date().toISOString()
        };
        res.write(`event: connected\ndata: ${JSON.stringify(initPayload)}\n\n`);

        req.raw.on('close', () => {
            if (!res.writableEnded) res.end();
        });
    });

    app.get<{ Querystring: { limit?: string } }>('/api/v1/telemetry/logs', async (req) => {
        const limit = Number(req.query.limit || 40);
        const logs = await getRecentTelemetry(limit);
        return {
            ok: true,
            worker: syncWorker.getStatus(),
            logs
        };
    });

    app.post('/api/v1/realtime/worker/toggle', async () => {
        const worker = syncWorker.toggle();
        return { ok: true, worker };
    });

    app.post<{ Body: { source?: string } }>('/api/v1/realtime/worker/trigger', async (req) => {
        return syncWorker.triggerOnce(req.body?.source);
    });
}
