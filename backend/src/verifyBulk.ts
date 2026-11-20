import assert from 'node:assert/strict';
import crypto from 'node:crypto';

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
    console.log(`Running Bulk Campaign Launcher E2E Verification against ${BASE_URL}...`);

    // 1. Seeded Templates, Tactics, Packages, Creatives
    const [tmplRes, tacRes, pkgRes, crRes] = await Promise.all([
        getJson<any>('/api/v1/templates'),
        getJson<any>('/api/v1/tactics'),
        getJson<any>('/api/v1/packages'),
        getJson<any>('/api/v1/creatives')
    ]);
    assert.equal(tmplRes.status, 200);
    assert.ok(tmplRes.data.applications.length >= 6);
    assert.ok(tmplRes.data.campaigns.length >= 5);
    assert.ok(tmplRes.data.ads.length >= 5);
    assert.ok(tmplRes.data.pages.length >= 4);
    assert.ok(tacRes.data.items.length >= 4);
    assert.ok(pkgRes.data.items.length >= 5);
    assert.ok(crRes.data.items.length >= 8);
    console.log('✓ 1. Seeded Templates, Tactics, Packages & Creatives verified');

    // 2. Cross-Validation rejects invalid Packages & Google UAC copy > 30 chars
    const badFbPkg = await postJson<any>('/api/v1/packages', {
        name: 'Bad_FB_No_Page',
        channel: 'Facebook',
        appTemplateId: 'app_aip922_fb',
        campaignTemplateId: 'cam_fb_single_100k',
        adTemplateId: 'ad_fb_ai_hug_video',
        adAccountId: 'act_102938401'
    });
    assert.equal(badFbPkg.status, 400);

    const badGoogleAd = await postJson<any>('/api/v1/templates/ads', {
        name: 'Bad_Google_Too_Long_Headline',
        channel: 'Google Ads',
        copyPayload: {
            groups: [{
                headlines: ['This headline is definitely way longer than thirty characters', 'Second short headline'],
                descriptions: ['Valid short description']
            }]
        }
    });
    assert.equal(badGoogleAd.status, 400);

    const mismatchPkg = await postJson<any>('/api/v1/packages', {
        name: 'Bad_Channel_Mismatch',
        channel: 'Google Ads',
        appTemplateId: 'app_aip922_fb',
        campaignTemplateId: 'cam_gg_uac_us_troas',
        adTemplateId: 'ad_gg_uac_nexus_en',
        adAccountId: 'act_829104820'
    });
    assert.equal(mismatchPkg.status, 400);
    console.log('✓ 2. Package & Google UAC Cross-Validation verified');

    // 3. Real Binary MP4 Upload + SHA-256 verification + Static serving
    const fakeMp4 = Buffer.concat([
        Buffer.from('00000018667479706d703432', 'hex'),
        Buffer.from(`verify_video_${Date.now()}_payload`)
    ]);
    const expectedHash = crypto.createHash('sha256').update(fakeMp4).digest('hex');
    const uploadResp = await fetch(
        `${BASE_URL}/api/v1/creatives/upload?fileName=verify_upload_${Date.now()}.mp4&productId=AIP922&angleCode=AI%20Hug&languageCode=English`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'video/mp4' },
            body: fakeMp4
        }
    );
    assert.equal(uploadResp.status, 200);
    const uploadJson = await uploadResp.json() as any;
    assert.equal(uploadJson.data?.sha256Hash || uploadJson.item?.sha256Hash, expectedHash);
    const uploadedCreative = uploadJson.item;
    assert.ok(uploadedCreative.publicUrl, 'Uploaded creative must have publicUrl');

    const staticFileResp = await fetch(`${BASE_URL}${uploadedCreative.publicUrl}`);
    assert.equal(staticFileResp.status, 200);
    const downloadedBuf = Buffer.from(await staticFileResp.arrayBuffer());
    assert.equal(downloadedBuf.length, fakeMp4.length);
    console.log('✓ 3. Binary Upload, SHA-256 & Static Media Serving verified');

    // 4. Bulk Preview Matrix Math (Facebook SINGLE 1x1 + Google Ads UAC)
    const testCreatives = ['cr-61', 'cr-92', uploadedCreative.id];
    const testPackages = ['pkg_fb_single_tk01', 'pkg_gg_uac_us_01'];
    const prev1 = await postJson<any>('/api/v1/campaigns/bulk-preview', {
        creativeIds: testCreatives,
        packageIds: testPackages
    });
    assert.equal(prev1.status, 200);
    // pkg_fb_single_tk01 (1G x 1C) -> 3 campaigns; pkg_gg_uac_us_01 (2G x 5C) -> 1 campaign => Total 4 campaigns
    assert.equal(prev1.data.summary.totalCampaignsToCreate, 4);
    assert.equal(prev1.data.summary.totalAdGroupsToCreate, 4); // 3*1 + 1*1 (3 creatives fit in 1st group of 5)
    assert.equal(prev1.data.summary.totalAdsToCreate, 6); // 3 + 3
    console.log('✓ 4. Batch Matrix Preview Math (Facebook + Google UAC) verified');

    // 5 & 6. Bulk Launch + Idempotency + SSE Real-time Stream until Completion
    const sseController = new AbortController();
    const sseResp = await fetch(`${BASE_URL}/api/v1/realtime/stream`, { signal: sseController.signal });
    assert.equal(sseResp.status, 200);
    const reader = sseResp.body!.getReader();
    const decoder = new TextDecoder();
    let sseBuf = '';

    const idemKey = `verify_idem_${Date.now()}`;
    const launch1 = await postJson<any>(
        '/api/v1/campaigns/bulk-launch',
        { creativeIds: testCreatives, packageIds: testPackages, createdBy: 'HoangNC' },
        { 'Idempotency-Key': idemKey }
    );
    assert.equal(launch1.status, 202);
    assert.equal(launch1.data.deduplicated, false);
    const batchId = launch1.data.batchId;

    // Duplicate submission with same Idempotency-Key MUST NOT create duplicate batch
    const launchDup = await postJson<any>(
        '/api/v1/campaigns/bulk-launch',
        { creativeIds: testCreatives, packageIds: testPackages, createdBy: 'HoangNC' },
        { 'Idempotency-Key': idemKey }
    );
    assert.equal(launchDup.data.deduplicated, true);
    assert.equal(launchDup.data.batchId, batchId);

    const deadline = Date.now() + 15000;
    let sawJobUpdate = false;
    let sawBatchCompleted = false;
    while (Date.now() < deadline && (!sawJobUpdate || !sawBatchCompleted)) {
        const { value, done } = await reader.read();
        if (done) break;
        sseBuf += decoder.decode(value, { stream: true });
        if (sseBuf.includes('event: bulk_job_updated') && sseBuf.includes(batchId)) sawJobUpdate = true;
        if (sseBuf.includes('event: bulk_batch_completed') && sseBuf.includes(batchId)) sawBatchCompleted = true;
    }
    sseController.abort();
    assert.ok(sawJobUpdate, 'Expected bulk_job_updated SSE event');
    assert.ok(sawBatchCompleted, 'Expected bulk_batch_completed SSE event');

    const batchCheck = await getJson<any>(`/api/v1/campaigns/batches/${batchId}`);
    assert.equal(batchCheck.data.batch.status, 'COMPLETED');
    assert.equal(batchCheck.data.batch.succeededJobs, 4);
    const launchedNames = batchCheck.data.jobs.map((j: any) => j.plannedCampaignName);
    console.log('✓ 5 & 6. Idempotent Bulk Launch & SSE Saga Execution verified');

    // 7. Second Preview confirms Media Deduplication Cache Hits increased
    const prev2 = await postJson<any>('/api/v1/campaigns/bulk-preview', {
        creativeIds: [uploadedCreative.id],
        packageIds: ['pkg_fb_single_tk01', 'pkg_gg_uac_us_01']
    });
    assert.equal(prev2.status, 200);
    assert.equal(prev2.data.summary.mediaCacheHitCount, 2, 'Uploaded video must hit both Facebook & YouTube caches');
    assert.equal(prev2.data.summary.mediaUploadNeededCount, 0);
    console.log('✓ 7. SHA-256 Media Deduplication Cache verified (0 duplicate uploads)');

    // 8. Simulated Failure + Checkpoint Resume & Retry
    const failLaunch = await postJson<any>(
        '/api/v1/campaigns/bulk-launch',
        {
            creativeIds: [uploadedCreative.id],
            packageIds: ['pkg_fb_single_tk01'],
            options: { simulateFailOnce: true }
        },
        { 'Idempotency-Key': `verify_retry_${Date.now()}` }
    );
    assert.equal(failLaunch.status, 202);
    const failBatchId = failLaunch.data.batchId;

    let failedJob: any = null;
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 250));
        const st = await getJson<any>(`/api/v1/campaigns/batches/${failBatchId}`);
        if (st.data.batch.status === 'FAILED') {
            failedJob = st.data.jobs[0];
            break;
        }
    }
    assert.ok(failedJob, 'Expected simulated batch to reach FAILED state');
    assert.ok(failedJob.platformCampaignId, 'Expected PAUSED platformCampaignId checkpoint to be saved before failure');
    const savedCheckpointId = failedJob.platformCampaignId;

    const retryRes = await postJson<any>(`/api/v1/campaigns/jobs/${failedJob.id}/retry`);
    assert.equal(retryRes.status, 200);

    let retriedBatch: any = null;
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 250));
        const st = await getJson<any>(`/api/v1/campaigns/batches/${failBatchId}`);
        if (st.data.batch.status === 'COMPLETED') {
            retriedBatch = st.data;
            break;
        }
    }
    assert.ok(retriedBatch, 'Expected retried job to reach COMPLETED');
    assert.equal(retriedBatch.jobs[0].platformCampaignId, savedCheckpointId, 'Retry must reuse PAUSED campaign checkpoint');
    console.log('✓ 8. Checkpointed Saga Failure & Resume Retry verified');

    // 9. Newly launched campaigns (Facebook + Google Ads) appear in Intraday Report
    const intraday = await getJson<any>('/api/v1/intraday/report');
    assert.equal(intraday.status, 200);
    const allIntradayNames: string[] = [];
    for (const prod of intraday.data.treeData) {
        for (const ch of prod.children || []) {
            for (const cmp of ch.children || []) {
                allIntradayNames.push(cmp.name);
            }
        }
    }
    for (const name of launchedNames) {
        assert.ok(allIntradayNames.includes(name), `Expected "${name}" to appear in Intraday Report`);
    }
    console.log('✓ 9. Intraday Report Integration (Facebook & Google UAC campaigns visible) verified');

    console.log('\nALL BULK CAMPAIGN E2E CHECKS PASSED!');
}

main().catch(err => {
    console.error('Bulk verification failed:', err);
    process.exit(1);
});
