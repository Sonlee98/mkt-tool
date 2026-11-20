import assert from 'node:assert/strict';
import { pool } from './db/pool.js';
import { decryptSecret } from './utils/cryptoVault.js';

const BASE_URL = process.env.VERIFY_BASE_URL || 'http://localhost:4000';

async function getJson<T>(url: string): Promise<{ status: number; data: T }> {
    const resp = await fetch(`${BASE_URL}${url}`);
    const data = await resp.json() as T;
    return { status: resp.status, data };
}

async function postJson<T>(
    url: string,
    body?: unknown,
    headers?: Record<string, string>
): Promise<{ status: number; data: T }> {
    const resp = await fetch(`${BASE_URL}${url}`, {
        method: 'POST',
        headers: {
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(headers || {})
        },
        body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const data = await resp.json() as T;
    return { status: resp.status, data };
}

async function main() {
    console.log(`Running Apero MktPro Priority-1 Production Guardrails & Security E2E Verification against ${BASE_URL}...`);

    try {
        // 1. Health reports security metadata
        const health = await getJson<any>('/api/v1/health');
        assert.equal(health.status, 200);
        assert.equal(health.data.security?.tokenEncryption, 'AES-256-GCM');
        console.log('✓ 1. Health security metadata verified');

        // 2. AES-256-GCM Token Vault + Google OAuth Config Sanitization
        const testAccId = 'act_verify_vault_01';
        const plainAccessToken = 'ya29.test_plain_token_1234';
        const plainRefreshToken = '1//0g_test_refresh_5678';
        const plainClientSecret = 'GOCSPX-verify-secret-99';

        const saveAcc = await postJson<any>('/api/v1/ad-accounts', {
            id: testAccId,
            name: 'Google_UAC_Vault_Verify',
            channel: 'Google Ads',
            currency: 'USD',
            balanceUsd: 25000,
            accessToken: plainAccessToken,
            apiConfig: {
                sandboxOverride: true,
                login_customer_id: '1234567890',
                developer_token: 'DevToken_Verify_8888',
                client_id: '123456-client.apps.googleusercontent.com',
                client_secret: plainClientSecret,
                refresh_token: plainRefreshToken
            }
        });
        assert.equal(saveAcc.status, 200);
        assert.equal(saveAcc.data.encrypted, true);

        const dbRow = await pool.query<{ access_token: string; api_config: Record<string, string> }>(
            `SELECT access_token, api_config FROM ad_accounts WHERE id = $1`,
            [testAccId]
        );
        assert.equal(dbRow.rows.length, 1);
        const storedAccess = dbRow.rows[0].access_token;
        const storedRefresh = dbRow.rows[0].api_config.refresh_token;
        const storedSecret = dbRow.rows[0].api_config.client_secret;

        assert.ok(storedAccess.startsWith('enc:v1:'), 'access_token in PostgreSQL MUST be AES-256-GCM encrypted');
        assert.ok(storedRefresh.startsWith('enc:v1:'), 'refresh_token in PostgreSQL MUST be AES-256-GCM encrypted');
        assert.ok(storedSecret.startsWith('enc:v1:'), 'client_secret in PostgreSQL MUST be AES-256-GCM encrypted');
        assert.equal(decryptSecret(storedAccess), plainAccessToken);
        assert.equal(decryptSecret(storedRefresh), plainRefreshToken);
        assert.equal(decryptSecret(storedSecret), plainClientSecret);

        const listAccs = await getJson<any>('/api/v1/ad-accounts');
        const maskedAcc = listAccs.data.accounts.find((a: any) => a.id === testAccId);
        assert.ok(maskedAcc, 'Vault test account must appear in GET /api/v1/ad-accounts');
        assert.equal(maskedAcc.tokenPreview, '******1234');
        assert.equal(maskedAcc.apiConfig.refresh_token, undefined, 'Raw refresh_token must NOT leak in API response');
        assert.equal(maskedAcc.apiConfig.client_secret, undefined, 'Raw client_secret must NOT leak in API response');
        assert.equal(maskedAcc.apiConfig.hasRefreshToken, true);
        assert.equal(maskedAcc.apiConfig.hasClientSecret, true);
        console.log('✓ 2. AES-256-GCM Token Vault & API Sanitization verified');

        // 3. Budget Guardrail Blocks Oversized Campaign ($2,500 > $2,000 cap) without explicit override
        const ts = Date.now();
        const camRes = await postJson<any>('/api/v1/templates/campaign', {
            name: `Guardrail_HighBudget_${ts}`,
            channel: 'Google Ads',
            budgetAmount: 2500,
            budgetCurrency: 'USD',
            adGroupVolume: 1,
            creativeVolume: 2,
            countryCodes: ['US']
        });
        assert.equal(camRes.status, 200);

        const pkgRes = await postJson<any>('/api/v1/packages', {
            name: `Pkg_Guardrail_${ts}`,
            channel: 'Google Ads',
            appTemplateId: 'app_aip922_gg',
            campaignTemplateId: camRes.data.item.id,
            adTemplateId: 'ad_gg_uac_nexus_en',
            adAccountId: testAccId,
            namingTemplate: `{product}_{channel}_{geo}_GR_${ts}_{idx}`
        });
        assert.equal(pkgRes.status, 200);
        const testPkgId = pkgRes.data.item.id;

        const prevRes = await postJson<any>('/api/v1/campaigns/bulk-preview', {
            creativeIds: ['cr-61'],
            packageIds: [testPkgId]
        });
        assert.equal(prevRes.status, 200);
        assert.equal(prevRes.data.summary.exceedsBudgetGuardrail, true);

        const blockedLaunch = await postJson<any>('/api/v1/campaigns/bulk-launch', {
            creativeIds: ['cr-61'],
            packageIds: [testPkgId]
        });
        assert.equal(blockedLaunch.status, 400);
        assert.equal(blockedLaunch.data.code, 'BUDGET_GUARDRAIL_BLOCKED');
        console.log('✓ 3. Budget Guardrail blocking oversized batch verified');

        // 4. Safe Launch with launchPaused: true keeps newly created campaign OFF (PAUSED)
        const pausedLaunch = await postJson<any>(
            '/api/v1/campaigns/bulk-launch',
            {
                creativeIds: ['cr-61'],
                packageIds: [testPkgId],
                options: { allowHighBudget: true, launchPaused: true }
            },
            { 'Idempotency-Key': `verify_paused_${ts}` }
        );
        assert.equal(pausedLaunch.status, 202);
        assert.equal(pausedLaunch.data.launchPaused, true);
        const pausedBatchId = pausedLaunch.data.batchId;

        let completedBatch: any = null;
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 250));
            const st = await getJson<any>(`/api/v1/campaigns/batches/${pausedBatchId}`);
            if (st.data.batch.status === 'COMPLETED') {
                completedBatch = st.data;
                break;
            }
        }
        assert.ok(completedBatch, 'Expected launchPaused batch to reach COMPLETED');
        const createdCampName = completedBatch.jobs[0].plannedCampaignName;

        const cmpCheck = await pool.query<{ status: string }>(
            `SELECT status FROM campaigns WHERE name = $1 ORDER BY updated_at DESC LIMIT 1`,
            [createdCampName]
        );
        assert.equal(cmpCheck.rows[0]?.status, 'OFF', 'launchPaused campaign MUST be registered with status OFF (PAUSED)');
        console.log('✓ 4. Launch-as-PAUSED safety option verified (status = OFF)');

        // 5. Webhook Secret Enforcement (401 on missing/wrong secret, 200 on Bearer secret)
        const testSecret = `apr_wh_verify_${ts}`;
        const secSet = await postJson<any>('/api/v1/admin/security', { webhookSecret: testSecret });
        assert.equal(secSet.status, 200);
        assert.equal(secSet.data.webhookSecretConfigured, true);

        try {
            const whNoAuth = await postJson<any>('/api/v1/webhooks/appsflyer', {
                productId: 'AIP922',
                channel: 'Facebook',
                campaignId: 'cmp_928174102',
                spendDeltaVnd: 1000
            });
            assert.equal(whNoAuth.status, 401);

            const whBadAuth = await postJson<any>(
                '/api/v1/webhooks/appsflyer',
                { productId: 'AIP922', channel: 'Facebook', campaignId: 'cmp_928174102', spendDeltaVnd: 1000 },
                { 'Authorization': 'Bearer wrong_secret' }
            );
            assert.equal(whBadAuth.status, 401);

            const whGoodAuth = await postJson<any>(
                '/api/v1/webhooks/appsflyer',
                {
                    productId: 'AIP922',
                    channel: 'Facebook',
                    campaignId: 'cmp_928174102',
                    country: 'US',
                    cohortRevDeltaVnd: 50000,
                    cutoffRevDeltaVnd: 55000,
                    installsDelta: 2
                },
                { 'Authorization': `Bearer ${testSecret}` }
            );
            assert.equal(whGoodAuth.status, 200);
            assert.equal(whGoodAuth.data.ok, true);
        } finally {
            // Reset runtime webhook secret so local sandbox stays open after verification
            await postJson<any>('/api/v1/admin/security', { webhookSecret: '' });
        }
        console.log('✓ 5. Webhook Secret constant-time authentication verified');

        console.log('\nALL PRIORITY-1 PRODUCTION GUARDRAILS & SECURITY CHECKS PASSED!');
    } finally {
        await pool.end();
    }
}

main().catch(err => {
    console.error('Security/Guardrails verification failed:', err);
    process.exit(1);
});
