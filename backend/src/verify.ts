import assert from 'node:assert/strict';

const BASE_URL = process.env.VERIFY_BASE_URL || 'http://localhost:4000';

async function getJson<T>(url: string): Promise<{ status: number; data: T }> {
    const resp = await fetch(`${BASE_URL}${url}`);
    const data = await resp.json() as T;
    return { status: resp.status, data };
}

async function postJson<T>(url: string, body?: unknown): Promise<{ status: number; data: T }> {
    const resp = await fetch(`${BASE_URL}${url}`, {
        method: 'POST',
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const data = await resp.json() as T;
    return { status: resp.status, data };
}

async function main() {
    console.log(`Running PandaWind MktPro Backend E2E Verification against ${BASE_URL}...`);

    // 1. Health check
    const health = await getJson<{ ok: boolean; db: string }>('/api/v1/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.ok, true);
    assert.equal(health.data.db, 'connected');
    console.log('✓ 1. Health & PostgreSQL connected');

    // 2. Unfiltered Intraday Report
    const report1 = await getJson<any>('/api/v1/intraday/report');
    assert.equal(report1.status, 200);
    assert.ok(report1.data.treeData.length >= 3, 'Expected >= 3 products in treeData');
    assert.ok(report1.data.hourly.length >= 2 && report1.data.hourly.length <= 24, 'Expected 2..24 hourly slots');
    assert.ok(report1.data.summary.spendVnd > 0, 'Expected spendVnd > 0');
    assert.ok(report1.data.summary.roas > 0, 'Expected roas > 0');
    console.log(`✓ 2. Intraday Report loaded (Spend: ${report1.data.summary.spendVnd.toLocaleString()} VND, Hourly: ${report1.data.hourly.length} slots)`);

    // 3. Filtered Intraday Report
    const filtered = await getJson<any>('/api/v1/intraday/report?product=AIP922&channel=Facebook');
    assert.equal(filtered.status, 200);
    assert.equal(filtered.data.treeData.length, 1);
    assert.equal(filtered.data.treeData[0].productId, 'AIP922');
    assert.equal(filtered.data.treeData[0].children.length, 1);
    assert.equal(filtered.data.treeData[0].children[0].channel, 'Facebook');
    assert.ok(filtered.data.summary.spendVnd < report1.data.summary.spendVnd);
    console.log('✓ 3. Filter (AIP922 + Facebook) verified');

    // 4. Webhook ingest persists to DB
    const beforeSpend = report1.data.summary.spendVnd;
    const beforeInstall = report1.data.summary.totalInstall;
    const wh = await postJson<any>('/api/v1/webhooks/appsflyer', {
        productId: 'AIP922',
        channel: 'Facebook',
        campaignId: 'cmp_928174102',
        country: 'US',
        spendDeltaVnd: 500000,
        cohortRevDeltaVnd: 650000,
        cutoffRevDeltaVnd: 740000,
        installsDelta: 111
    });
    assert.equal(wh.status, 200);
    assert.equal(wh.data.ok, true);

    const reportAfterWh = await getJson<any>('/api/v1/intraday/report');
    assert.ok(reportAfterWh.data.summary.spendVnd >= beforeSpend + 500000, 'Spend should increase after webhook');
    assert.ok(reportAfterWh.data.summary.totalInstall >= beforeInstall + 111, 'Installs should increase after webhook');
    console.log('✓ 4. Webhook ingest & PostgreSQL persistence verified');

    // 5. Create campaign via Data Management endpoint
    const uniqueCmp = `AIP922_Verify_Campaign_${Date.now()}`;
    const created = await postJson<any>('/api/v1/intraday/campaigns', {
        productId: 'AIP922',
        channel: 'TikTok',
        campaignName: uniqueCmp,
        externalCampaignId: '#V99',
        countries: 'US',
        budget: '25M',
        spendVnd: 1200000,
        revenueVnd: 1500000,
        installs: 300
    });
    assert.equal(created.status, 200);
    assert.equal(created.data.ok, true);

    const reportAfterCreate = await getJson<any>(`/api/v1/intraday/report?search=${encodeURIComponent(uniqueCmp)}`);
    assert.equal(reportAfterCreate.status, 200);
    assert.equal(reportAfterCreate.data.treeData.length, 1);
    const foundCmp = reportAfterCreate.data.treeData[0].children[0].children.find((c: any) => c.name === uniqueCmp);
    assert.ok(foundCmp, 'Created campaign must appear in search report');
    console.log('✓ 5. Create Campaign API & Search filter verified');

    // 6. CSV Import
    const csvSample = [
        'Product,Channel,CampaignName,CampaignId,Countries,Budget,Spend,Revenue,Installs',
        `AIP886,Facebook,Verify_CSV_Row_1_${Date.now()},#C01,US,15M,800000,960000,200`,
        `AIP919,Google Ads,Verify_CSV_Row_2_${Date.now()},#C02,VN,10M,500000,580000,150`
    ].join('\n');
    const csvRes = await postJson<any>('/api/v1/intraday/import-csv', { csvText: csvSample });
    assert.equal(csvRes.status, 200);
    assert.equal(csvRes.data.importedCount, 2);
    console.log('✓ 6. CSV Import endpoint verified');

    // 7. Export CSV
    const expResp = await fetch(`${BASE_URL}/api/v1/intraday/export.csv?product=AIP922`);
    assert.equal(expResp.status, 200);
    const expText = await expResp.text();
    assert.ok(expText.includes('AIP922') && expText.includes('Grand Total'));
    console.log('✓ 7. Export CSV endpoint verified');

    // 8. Ad Accounts & Sync
    const accs = await getJson<any>('/api/v1/ad-accounts');
    assert.equal(accs.status, 200);
    assert.ok(accs.data.accounts.length >= 5);
    const syncRes = await postJson<any>('/api/v1/ad-accounts/act_102938401/sync');
    assert.equal(syncRes.status, 200);
    assert.equal(syncRes.data.ok, true);
    console.log('✓ 8. Ad Accounts list & Sync adapter verified');

    // 9. SSE Stream + Worker Trigger
    const sseController = new AbortController();
    const sseResp = await fetch(`${BASE_URL}/api/v1/realtime/stream`, { signal: sseController.signal });
    assert.equal(sseResp.status, 200);
    const reader = sseResp.body!.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';

    const readUntil = async (token: string, timeoutMs = 6000) => {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (sseBuffer.includes(token)) return true;
            const { value, done } = await reader.read();
            if (done) break;
            sseBuffer += decoder.decode(value, { stream: true });
        }
        return sseBuffer.includes(token);
    };

    assert.ok(await readUntil('event: connected'), 'Expected SSE connected event');
    const trig = await postJson<any>('/api/v1/realtime/worker/trigger', { source: 'Verify E2E Trigger' });
    assert.equal(trig.status, 200);
    assert.ok(await readUntil('event: intraday_sync'), 'Expected SSE intraday_sync event after worker trigger');
    sseController.abort();
    console.log('✓ 9. SSE Realtime Stream & Worker Trigger verified');

    // 10. Static Frontend HTML served
    const htmlResp = await fetch(`${BASE_URL}/`);
    assert.equal(htmlResp.status, 200);
    const htmlText = await htmlResp.text();
    assert.ok(htmlText.includes('PandaWind MktPro'));
    console.log('✓ 10. Frontend static hosting verified');

    console.log('\nALL E2E CHECKS PASSED!');
}

main().catch(err => {
    console.error('Verification failed:', err);
    process.exit(1);
});
