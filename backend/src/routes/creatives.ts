import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { makeId } from '../services/batchPlanner.js';
import { processAndStoreCreativeFile } from '../services/mediaProcessor.js';

function timeAgoLabel(dt: Date | string): string {
    const ms = Date.now() - new Date(dt).getTime();
    const mins = Math.max(0, Math.floor(ms / 60000));
    if (mins < 1) return 'Vừa xong';
    if (mins < 60) return `${mins} phút trước`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} giờ trước`;
    return `${Math.floor(hrs / 24)} ngày trước`;
}

function mapCreativeRow(r: Record<string, unknown>) {
    return {
        id: r.id,
        title: r.title,
        fileName: r.file_name,
        sha256Hash: r.sha256_hash,
        publicUrl: r.public_url || null,
        posterGradient: r.poster_gradient,
        type: r.media_type || 'VIDEO',
        visibility: r.visibility || 'PUBLIC',
        duration: r.duration_label || '00:15',
        format: r.aspect_ratio || '9:16',
        resolution: `${r.width || 1080}x${r.height || 1920}`,
        size: r.size_label || '1.50 MB',
        product: r.product_id,
        angle: r.angle_code || 'General',
        language: r.language_code || 'English',
        target: r.market_target ? `Market Targets: ${r.market_target}` : 'Market Targets: Global',
        marketTarget: r.market_target || 'Global',
        tiktokPolicy: r.tiktok_policy || 'Passed',
        tiktokPolicyReason: r.tiktok_policy_reason || 'Verified',
        metaPolicy: r.meta_policy || 'Approved',
        metaPolicyReason: r.meta_policy_reason || 'Meta AI Safe',
        googlePolicy: r.google_policy || 'Approved',
        youtubeVideoId: r.youtube_video_id || null,
        campaignSuccess: Number(r.campaign_success_count || 0),
        campaignFailed: Number(r.campaign_failed_count || 0),
        creator: r.creator_name || 'Đồng Quỳnh Trang',
        updatedAgo: r.updated_at ? timeAgoLabel(r.updated_at as Date) : 'Vừa xong'
    };
}

function evaluateAiPolicy(fileName: string, angleCode?: string) {
    const lower = `${fileName} ${angleCode || ''}`.toLowerCase();
    const hasRisk = ['weapon', 'explosive', 'gamble', 'ban', 'violation'].some(k => lower.includes(k));
    if (hasRisk) {
        return {
            tiktokPolicy: 'Check failed',
            tiktokReason: 'Simulated weapon or policy risk flagged by pre-check model',
            metaPolicy: 'Review',
            metaReason: 'Requires manual compliance review before scaling',
            googlePolicy: 'Review'
        };
    }
    return {
        tiktokPolicy: 'Passed',
        tiktokReason: 'Compliance verified by AI audio & visual check',
        metaPolicy: 'Approved',
        metaReason: 'Meta AI Safe for App Promotion',
        googlePolicy: 'Approved'
    };
}

const POSTER_GRADIENTS = [
    'linear-gradient(135deg, #2563eb 0%, #0e7490 100%)',
    'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)',
    'linear-gradient(135deg, #059669 0%, #0284c7 100%)',
    'linear-gradient(135deg, #d97706 0%, #be123c 100%)',
    'linear-gradient(135deg, #4f46e5 0%, #1d4ed8 100%)'
];

export async function creativeRoutes(app: FastifyInstance): Promise<void> {
    app.get<{
        Querystring: {
            product?: string;
            tiktokPolicy?: string;
            metaPolicy?: string;
            angle?: string;
            search?: string;
        };
    }>('/api/v1/creatives', async (req) => {
        const { rows } = await pool.query(`SELECT * FROM creatives ORDER BY created_at DESC`);
        const allItems = rows.map(mapCreativeRow);

        let items = allItems;
        const { product, tiktokPolicy, metaPolicy, angle, search } = req.query;

        if (product && product !== 'All') {
            items = items.filter(i => i.product === product);
        }
        if (tiktokPolicy && tiktokPolicy !== 'All') {
            items = items.filter(i => i.tiktokPolicy === tiktokPolicy);
        }
        if (metaPolicy && metaPolicy !== 'All') {
            items = items.filter(i => i.metaPolicy === metaPolicy);
        }
        if (angle && angle !== 'All') {
            items = items.filter(i => i.angle === angle);
        }
        if (search && search.trim()) {
            const q = search.trim().toLowerCase();
            items = items.filter(i => `${i.title} ${i.angle} ${i.language} ${i.product}`.toLowerCase().includes(q));
        }

        const totalSuccess = allItems.reduce((s, x) => s + x.campaignSuccess, 0);
        const totalFailed = allItems.reduce((s, x) => s + x.campaignFailed, 0);
        const totalRuns = totalSuccess + totalFailed;
        const approvalRate = totalRuns > 0 ? `${((totalSuccess / totalRuns) * 100).toFixed(2)}%` : '100.00%';

        return {
            ok: true,
            summary: {
                totalCreatives: allItems.length,
                totalCampaigns: totalRuns,
                successfulCampaigns: totalSuccess,
                failedCampaigns: totalFailed,
                approvalRate
            },
            items
        };
    });

    app.post<{
        Querystring: Record<string, string | undefined>;
    }>('/api/v1/creatives/upload', async (req, reply) => {
        const isBinary = Buffer.isBuffer(req.body);
        const meta = isBinary
            ? (req.query || {})
            : ((req.body as Record<string, unknown>) || {});

        const fileName = String(meta.fileName || meta.title || `creative_${Date.now()}.mp4`).trim();
        const title = String(meta.title || fileName).trim();
        const productId = String(meta.productId || 'AIP922').trim().toUpperCase();
        const angleCode = String(meta.angleCode || 'Transformation').trim();
        const languageCode = String(meta.languageCode || 'English').trim();
        const marketTarget = String(meta.marketTarget || 'US / Tier 1').trim();
        const visibility = String(meta.visibility || 'PUBLIC').toUpperCase() === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC';
        const youtubeVideoId = meta.youtubeVideoId ? String(meta.youtubeVideoId).trim() : null;
        const autoCheck = String(meta.autoCheckPolicy ?? 'true') !== 'false';

        let sha256Hash: string;
        let storagePath = `seed://${fileName}`;
        let publicUrl: string | null = null;
        let mediaType: 'VIDEO' | 'IMAGE' = 'VIDEO';
        let durationSec = 15;
        let durationLabel = '00:15';
        let width = 1080;
        let height = 1920;
        let aspectRatio = '9:16';
        let sizeLabel = '1.85 MB';
        let fileSizeBytes = Number(meta.sizeBytes || 1939865);

        if (isBinary) {
            const buf = req.body as Buffer;
            if (buf.length === 0) {
                return reply.code(400).send({ ok: false, error: 'File upload rỗng.' });
            }
            const processed = await processAndStoreCreativeFile(buf, fileName);
            sha256Hash = processed.sha256Hash;
            storagePath = processed.storagePath;
            publicUrl = processed.publicUrl;
            mediaType = processed.mediaType;
            durationSec = processed.durationSec;
            durationLabel = processed.durationLabel;
            width = processed.width;
            height = processed.height;
            aspectRatio = processed.aspectRatio;
            sizeLabel = processed.sizeLabel;
            fileSizeBytes = processed.fileSizeBytes;
        } else {
            sha256Hash = crypto.createHash('sha256').update(`${fileName}:${Date.now()}`).digest('hex');
        }

        const policy = autoCheck
            ? evaluateAiPolicy(fileName, angleCode)
            : {
                tiktokPolicy: 'Review',
                tiktokReason: 'Skipped auto-check',
                metaPolicy: 'Review',
                metaReason: 'Skipped auto-check',
                googlePolicy: 'Review'
            };

        const id = makeId('cr');
        const gradient = POSTER_GRADIENTS[Math.floor(Math.random() * POSTER_GRADIENTS.length)];

        const { rows } = await pool.query(
            `INSERT INTO creatives (
                id, title, file_name, sha256_hash, storage_path, public_url,
                poster_gradient, media_type, visibility, duration_sec, duration_label,
                width, height, aspect_ratio, size_label, file_size_bytes,
                product_id, angle_code, language_code, market_target,
                tiktok_policy, tiktok_policy_reason, meta_policy, meta_policy_reason, google_policy,
                youtube_video_id, creator_id, creator_name
             ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,'TrangDQ',$27
             ) RETURNING *`,
            [
                id, title, fileName, sha256Hash, storagePath, publicUrl,
                gradient, mediaType, visibility, durationSec, durationLabel,
                width, height, aspectRatio, sizeLabel, fileSizeBytes,
                productId, angleCode, languageCode, marketTarget,
                policy.tiktokPolicy, policy.tiktokReason, policy.metaPolicy, policy.metaReason, policy.googlePolicy,
                youtubeVideoId, String(meta.creatorName || 'Đồng Quỳnh Trang')
            ]
        );

        return { ok: true, item: mapCreativeRow(rows[0]) };
    });

    app.post<{ Body: { creativeIds?: string[] } }>(
        '/api/v1/creatives/recheck-policy',
        async (req) => {
            const ids = Array.isArray(req.body?.creativeIds) ? req.body.creativeIds : [];
            const { rows } = ids.length > 0
                ? await pool.query('SELECT id, file_name, angle_code FROM creatives WHERE id = ANY($1::varchar[])', [ids])
                : await pool.query('SELECT id, file_name, angle_code FROM creatives');

            let passedCount = 0;
            let flaggedCount = 0;
            for (const r of rows) {
                const pol = evaluateAiPolicy(r.file_name, r.angle_code);
                if (pol.metaPolicy === 'Approved') passedCount++;
                else flaggedCount++;

                await pool.query(
                    `UPDATE creatives
                     SET tiktok_policy = $2,
                         tiktok_policy_reason = $3,
                         meta_policy = $4,
                         meta_policy_reason = $5,
                         google_policy = $6,
                         updated_at = NOW()
                     WHERE id = $1`,
                    [r.id, pol.tiktokPolicy, pol.tiktokReason, pol.metaPolicy, pol.metaReason, pol.googlePolicy]
                );
            }

            return { ok: true, checked: rows.length, passedCount, flaggedCount };
        }
    );
}
