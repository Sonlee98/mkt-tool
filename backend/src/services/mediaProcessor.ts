import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

export const UPLOADS_ROOT_DIR = path.resolve(config.frontendDir, 'backend', 'uploads');
export const CREATIVES_UPLOAD_DIR = path.join(UPLOADS_ROOT_DIR, 'creatives');

export interface ProcessedMediaInfo {
    sha256Hash: string;
    storagePath: string;
    publicUrl: string;
    mediaType: 'VIDEO' | 'IMAGE';
    durationSec: number;
    durationLabel: string;
    width: number;
    height: number;
    aspectRatio: string;
    sizeLabel: string;
    fileSizeBytes: number;
}

export async function ensureUploadDirs(): Promise<void> {
    await fs.mkdir(CREATIVES_UPLOAD_DIR, { recursive: true });
}

function formatDuration(seconds: number): string {
    const safe = Math.max(1, Math.round(seconds));
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function deriveAspectRatio(w: number, h: number): string {
    if (!w || !h) return '9:16';
    const ratio = w / h;
    if (Math.abs(ratio - 9 / 16) < 0.12) return '9:16';
    if (Math.abs(ratio - 1) < 0.12) return '1:1';
    if (Math.abs(ratio - 16 / 9) < 0.15) return '16:9';
    if (Math.abs(ratio - 4 / 5) < 0.1) return '4:5';
    return `${w}:${h}`;
}

function parseMp4Metadata(buf: Buffer): { durationSec?: number; width?: number; height?: number } {
    const result: { durationSec?: number; width?: number; height?: number } = {};
    try {
        const mvhdIdx = buf.indexOf(Buffer.from('mvhd'));
        if (mvhdIdx !== -1 && mvhdIdx + 24 < buf.length) {
            const version = buf.readUInt8(mvhdIdx + 4);
            if (version === 0 && mvhdIdx + 24 <= buf.length) {
                const timescale = buf.readUInt32BE(mvhdIdx + 16);
                const duration = buf.readUInt32BE(mvhdIdx + 20);
                if (timescale > 0 && duration > 0) {
                    result.durationSec = Number((duration / timescale).toFixed(2));
                }
            } else if (version === 1 && mvhdIdx + 36 <= buf.length) {
                const timescale = buf.readUInt32BE(mvhdIdx + 24);
                const durationHigh = buf.readUInt32BE(mvhdIdx + 28);
                const durationLow = buf.readUInt32BE(mvhdIdx + 32);
                const duration = durationHigh * 4294967296 + durationLow;
                if (timescale > 0 && duration > 0) {
                    result.durationSec = Number((duration / timescale).toFixed(2));
                }
            }
        }

        const tkhdIdx = buf.indexOf(Buffer.from('tkhd'));
        if (tkhdIdx !== -1 && tkhdIdx + 88 <= buf.length) {
            const version = buf.readUInt8(tkhdIdx + 4);
            const offset = version === 1 ? tkhdIdx + 88 : tkhdIdx + 76;
            if (offset + 8 <= buf.length) {
                const w = buf.readUInt32BE(offset) >> 16;
                const h = buf.readUInt32BE(offset + 4) >> 16;
                if (w >= 100 && w <= 8192 && h >= 100 && h <= 8192) {
                    result.width = w;
                    result.height = h;
                }
            }
        }
    } catch {
        // Fallback safely for synthetic or non-standard video buffers
    }
    return result;
}

export async function processAndStoreCreativeFile(
    buffer: Buffer,
    originalFileName: string
): Promise<ProcessedMediaInfo> {
    await ensureUploadDirs();

    const safeFileName = path.basename(originalFileName || `creative_${Date.now()}.mp4`)
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(-100);
    const ext = path.extname(safeFileName).toLowerCase();
    const isImage = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);

    const sha256Hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const diskFileName = `${sha256Hash.slice(0, 12)}_${safeFileName}`;
    const fullDiskPath = path.join(CREATIVES_UPLOAD_DIR, diskFileName);

    await fs.writeFile(fullDiskPath, buffer);

    const parsed = !isImage ? parseMp4Metadata(buffer) : {};
    const width = parsed.width || 1080;
    const height = parsed.height || 1920;
    const durationSec = isImage ? 0 : (parsed.durationSec || 15);

    return {
        sha256Hash,
        storagePath: `uploads/creatives/${diskFileName}`,
        publicUrl: `/uploads/creatives/${encodeURIComponent(diskFileName)}`,
        mediaType: isImage ? 'IMAGE' : 'VIDEO',
        durationSec,
        durationLabel: isImage ? 'IMG' : formatDuration(durationSec),
        width,
        height,
        aspectRatio: deriveAspectRatio(width, height),
        sizeLabel: formatSize(buffer.length),
        fileSizeBytes: buffer.length
    };
}
