import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { ensureDatabaseReady, pool } from './db/pool.js';
import { intradayRoutes } from './routes/intraday.js';
import { ingestRoutes } from './routes/ingest.js';
import { realtimeRoutes } from './routes/realtime.js';
import { adAccountRoutes } from './routes/adAccounts.js';
import { templateRoutes } from './routes/templates.js';
import { tacticRoutes } from './routes/tactics.js';
import { packageRoutes } from './routes/packages.js';
import { creativeRoutes } from './routes/creatives.js';
import { bulkLaunchRoutes } from './routes/bulkLaunch.js';
import { syncWorker } from './workers/syncWorker.js';
import { bulkLaunchWorker } from './workers/bulkLaunchWorker.js';
import { ensureUploadDirs, UPLOADS_ROOT_DIR } from './services/mediaProcessor.js';

async function main() {
    await ensureDatabaseReady();
    await ensureUploadDirs();

    const app = Fastify({ logger: true });

    // Support direct raw binary file upload for Creatives Hub (zero extra dependencies)
    app.addContentTypeParser(
        /^video\/|^image\/|^application\/octet-stream/,
        { parseAs: 'buffer', bodyLimit: 250 * 1024 * 1024 },
        (_req, body, done) => {
            done(null, body);
        }
    );

    await app.register(cors, {
        origin: true,
        methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']
    });

    app.get('/api/v1/health', async () => {
        await pool.query('SELECT 1');
        return {
            ok: true,
            db: 'connected',
            timezone: config.timezone,
            worker: syncWorker.getStatus()
        };
    });

    await app.register(intradayRoutes);
    await app.register(ingestRoutes);
    await app.register(realtimeRoutes);
    await app.register(adAccountRoutes);
    await app.register(templateRoutes);
    await app.register(tacticRoutes);
    await app.register(packageRoutes);
    await app.register(creativeRoutes);
    await app.register(bulkLaunchRoutes);

    // Serve uploaded creative video/image previews
    await app.register(fastifyStatic, {
        root: UPLOADS_ROOT_DIR,
        prefix: '/uploads/',
        decorateReply: false
    });

    // Serve Apero MktPro Frontend static files from parent folder
    await app.register(fastifyStatic, {
        root: config.frontendDir,
        prefix: '/',
        index: 'index.html'
    });

    await app.listen({ port: config.port, host: '0.0.0.0' });

    if (config.syncWorkerEnabled) {
        syncWorker.start();
    }
    bulkLaunchWorker.start();

    console.log(`[Server] Apero MktPro running at http://localhost:${config.port}`);
}

main().catch((err) => {
    console.error('[Server] Fatal startup error:', err);
    process.exit(1);
});
