import crypto from 'node:crypto';
import { config } from '../config.js';

const ENC_PREFIX = 'enc:v1:';

function getVaultKey(): Buffer {
    return crypto.createHash('sha256').update(config.tokenEncryptionKey, 'utf8').digest();
}

/**
 * Encrypts sensitive API credentials using AES-256-GCM before storing in PostgreSQL.
 */
export function encryptSecret(plain: string | null | undefined): string | null {
    if (!plain) return null;
    const trimmed = plain.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith(ENC_PREFIX)) return trimmed;

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getVaultKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(trimmed, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${ENC_PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/**
 * Decrypts AES-256-GCM vault values while preserving backward compatibility for legacy plaintext rows.
 */
export function decryptSecret(stored: string | null | undefined): string | null {
    if (!stored) return null;
    const trimmed = stored.trim();
    if (!trimmed) return null;
    if (!trimmed.startsWith(ENC_PREFIX)) return trimmed;

    const payload = trimmed.slice(ENC_PREFIX.length);
    const parts = payload.split(':');
    if (parts.length !== 3) {
        throw new Error('Dữ liệu token mã hóa không đúng định dạng AES-256-GCM.');
    }

    const [ivB64, tagB64, cipherB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const ciphertext = Buffer.from(cipherB64, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', getVaultKey(), iv);
    decipher.setAuthTag(authTag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    return plain.trim() || null;
}

export function maskSecret(stored: string | null | undefined): string | null {
    if (!stored || !stored.trim()) return null;
    try {
        const plain = decryptSecret(stored);
        if (!plain) return null;
        if (plain.length <= 6) return '******';
        return `${'*'.repeat(6)}${plain.slice(-4)}`;
    } catch {
        return '****** (locked)';
    }
}

export function verifySecretConstantTime(provided: string | undefined | null, expected: string): boolean {
    if (!provided || !expected) return false;
    const hashA = crypto.createHash('sha256').update(provided.trim(), 'utf8').digest();
    const hashB = crypto.createHash('sha256').update(expected.trim(), 'utf8').digest();
    return crypto.timingSafeEqual(hashA, hashB);
}
