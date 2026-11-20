import { config } from '../config.js';
import { decryptSecret } from './cryptoVault.js';

interface CachedOAuthToken {
    accessToken: string;
    expiresAtMs: number;
}

const googleTokenCache = new Map<string, CachedOAuthToken>();

export interface AccountCredentialShape {
    id?: string;
    channel: string;
    access_token: string | null;
    api_config?: Record<string, unknown> | null;
}

/**
 * Determines whether an ad account is configured with live API credentials
 * (either an encrypted/plain access_token, or for Google Ads a refresh_token).
 */
export function hasAccountLiveCredentials(acc: AccountCredentialShape): boolean {
    const apiCfg = (acc.api_config || {}) as Record<string, unknown>;
    if (Boolean(apiCfg.sandboxOverride)) return false;

    try {
        if (Boolean(decryptSecret(acc.access_token))) {
            return true;
        }
    } catch {
        if (acc.access_token && acc.access_token.trim().length > 0) return true;
    }

    if (acc.channel === 'Google Ads') {
        const rawRefresh = typeof apiCfg.refresh_token === 'string' ? apiCfg.refresh_token : '';
        try {
            if (Boolean(decryptSecret(rawRefresh)) || Boolean(config.googleOAuthRefreshToken)) {
                return true;
            }
        } catch {
            if (rawRefresh.trim().length > 0 || Boolean(config.googleOAuthRefreshToken)) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Resolves a valid Bearer Access Token for Google Ads API v18, auto-refreshing via
 * OAuth2 refresh_token and caching until ~5 minutes before expiration.
 */
export async function resolveGoogleBearerToken(acc: {
    id: string;
    access_token: string | null;
    api_config?: Record<string, unknown> | null;
}): Promise<string> {
    const cached = googleTokenCache.get(acc.id);
    if (cached && cached.expiresAtMs > Date.now()) {
        return cached.accessToken;
    }

    const apiCfg = (acc.api_config || {}) as Record<string, unknown>;
    const refreshToken = decryptSecret(typeof apiCfg.refresh_token === 'string' ? apiCfg.refresh_token : null)
        || config.googleOAuthRefreshToken;
    const clientId = String(apiCfg.client_id || config.googleOAuthClientId || '').trim();
    const clientSecret = decryptSecret(typeof apiCfg.client_secret === 'string' ? apiCfg.client_secret : null)
        || config.googleOAuthClientSecret;

    if (refreshToken && clientId && clientSecret) {
        const params = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token'
        });

        const resp = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });
        const json = await resp.json() as {
            access_token?: string;
            expires_in?: number;
            error?: string;
            error_description?: string;
        };

        if (!resp.ok || !json.access_token) {
            throw new Error(
                `Google OAuth2 refresh failed (${resp.status}): ${json.error_description || json.error || 'Unknown error'}`
            );
        }

        const ttlSec = Math.max(60, Number(json.expires_in || 3600) - 300);
        googleTokenCache.set(acc.id, {
            accessToken: json.access_token,
            expiresAtMs: Date.now() + ttlSec * 1000
        });
        return json.access_token;
    }

    const staticAccess = decryptSecret(acc.access_token);
    if (staticAccess) {
        return staticAccess;
    }

    throw new Error('Thiếu Google OAuth Refresh Token (kèm Client ID/Secret) hoặc Access Token.');
}
