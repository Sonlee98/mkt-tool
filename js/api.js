/**
 * Apero MktPro - Backend API & Realtime SSE Client
 * Tự động kết nối Backend Node.js/Fastify + PostgreSQL và fallback an toàn khi mở offline
 */

(function () {
    const isBackendSameOrigin =
        typeof window !== 'undefined' &&
        window.location &&
        window.location.protocol.startsWith('http') &&
        window.location.port === '4000';

    const DEFAULT_BASE = isBackendSameOrigin ? '' : 'http://localhost:4000';

    const AperoApi = {
        baseUrl: DEFAULT_BASE,
        isBackendOnline: false,
        listeners: {},

        on(eventName, callback) {
            if (!this.listeners[eventName]) {
                this.listeners[eventName] = new Set();
            }
            this.listeners[eventName].add(callback);
            return () => this.off(eventName, callback);
        },

        off(eventName, callback) {
            if (this.listeners[eventName]) {
                this.listeners[eventName].delete(callback);
            }
        },

        emit(eventName, data) {
            const set = this.listeners[eventName];
            if (!set) return;
            set.forEach(fn => {
                try {
                    fn(data);
                } catch (err) {
                    console.warn('[AperoApi] Listener error:', err);
                }
            });
        },

        async request(path, options = {}) {
            const controller = new AbortController();
            const timeoutMs = options.timeoutMs || 15000;
            const timer = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const headers = Object.assign({}, options.headers || {});
                const adminKey = typeof localStorage !== 'undefined' ? (localStorage.getItem('apero_admin_key') || '').trim() : '';
                if (adminKey && !headers['x-admin-key']) {
                    headers['x-admin-key'] = adminKey;
                }
                if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
                    headers['Content-Type'] = 'application/json';
                }

                const resp = await fetch(`${this.baseUrl}${path}`, {
                    method: options.method || 'GET',
                    headers,
                    body: options.body,
                    signal: controller.signal
                });

                const contentType = resp.headers.get('content-type') || '';
                const data = contentType.includes('application/json')
                    ? await resp.json()
                    : await resp.text();

                if (!resp.ok) {
                    const msg = (data && data.error) ? data.error : `HTTP ${resp.status}`;
                    const err = new Error(msg);
                    err.details = data;
                    throw err;
                }

                this.isBackendOnline = true;
                return data;
            } catch (err) {
                if (err.name === 'TypeError' || err.name === 'AbortError') {
                    this.isBackendOnline = false;
                }
                throw err;
            } finally {
                clearTimeout(timer);
            }
        },

        buildQuery(params = {}) {
            const qs = new URLSearchParams();
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== null && String(v).trim() !== '') {
                    qs.set(k, String(v).trim());
                }
            });
            const str = qs.toString();
            return str ? `?${str}` : '';
        },

        // Intraday Report
        getIntradayReport(params = {}) {
            return this.request(`/api/v1/intraday/report${this.buildQuery(params)}`);
        },

        getExportCsvUrl(params = {}) {
            return `${this.baseUrl}/api/v1/intraday/export.csv${this.buildQuery(params)}`;
        },

        toggleCampaignStatus(campaignId, status) {
            return this.request(`/api/v1/campaigns/${encodeURIComponent(campaignId)}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ status })
            });
        },

        // Data Ingestion / Webhook / CSV / JSON / Google Sheets
        createIntradayCampaign(payload) {
            return this.request('/api/v1/intraday/campaigns', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
        },

        importCsv(csvText, date) {
            return this.request('/api/v1/intraday/import-csv', {
                method: 'POST',
                body: JSON.stringify({ csvText, date })
            });
        },

        importJson(payload) {
            return this.request('/api/v1/intraday/import-json', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
        },

        syncGoogleSheet(sheetUrl) {
            return this.request('/api/v1/intraday/sync-ggsheet', {
                method: 'POST',
                body: JSON.stringify({ sheetUrl })
            });
        },

        sendWebhook(source, payload) {
            return this.request(`/api/v1/webhooks/${encodeURIComponent(source || 'custom')}`, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
        },

        // Telemetry & Worker Controls
        getTelemetry(limit = 40) {
            return this.request(`/api/v1/telemetry/logs?limit=${limit}`);
        },

        toggleWorker() {
            return this.request('/api/v1/realtime/worker/toggle', { method: 'POST' });
        },

        triggerWorker(source) {
            return this.request('/api/v1/realtime/worker/trigger', {
                method: 'POST',
                body: JSON.stringify(source ? { source } : {})
            });
        },

        // Ad Accounts & Security Guardrails
        getAdAccounts() {
            return this.request('/api/v1/ad-accounts');
        },

        saveAdAccount(payload) {
            return this.request('/api/v1/ad-accounts', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
        },

        syncAdAccount(accountId) {
            return this.request(`/api/v1/ad-accounts/${encodeURIComponent(accountId)}/sync`, {
                method: 'POST'
            });
        },

        getSecurityConfig() {
            return this.request('/api/v1/admin/security');
        },

        saveSecurityConfig(payload) {
            return this.request('/api/v1/admin/security', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
        },

        setAdminKey(key) {
            if (typeof localStorage === 'undefined') return;
            const trimmed = String(key || '').trim();
            if (trimmed) localStorage.setItem('apero_admin_key', trimmed);
            else localStorage.removeItem('apero_admin_key');
        },

        // Templates Management
        getTemplates(type, params = {}) {
            if (!type) return this.request('/api/v1/templates');
            return this.request(`/api/v1/templates/${encodeURIComponent(type)}${this.buildQuery(params)}`);
        },

        createTemplate(type, payload) {
            return this.request(`/api/v1/templates/${encodeURIComponent(type)}`, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
        },

        // Tactics Management
        getTactics(params = {}) {
            return this.request(`/api/v1/tactics${this.buildQuery(params)}`);
        },

        createTactic(payload) {
            return this.request('/api/v1/tactics', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
        },

        updateTactic(id, payload) {
            return this.request(`/api/v1/tactics/${encodeURIComponent(id)}`, {
                method: 'PATCH',
                body: JSON.stringify(payload)
            });
        },

        // Packages Management
        getPackages(params = {}) {
            return this.request(`/api/v1/packages${this.buildQuery(params)}`);
        },

        createPackage(payload) {
            return this.request('/api/v1/packages', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
        },

        // Creative Hub
        getCreatives(params = {}) {
            return this.request(`/api/v1/creatives${this.buildQuery(params)}`);
        },

        async uploadCreativeBinary(file, meta = {}) {
            const qs = this.buildQuery(Object.assign({ fileName: file.name }, meta));
            const headers = { 'Content-Type': file.type || 'application/octet-stream' };
            const adminKey = typeof localStorage !== 'undefined' ? (localStorage.getItem('apero_admin_key') || '').trim() : '';
            if (adminKey) headers['x-admin-key'] = adminKey;

            const resp = await fetch(`${this.baseUrl}/api/v1/creatives/upload${qs}`, {
                method: 'POST',
                headers,
                body: file
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data?.error || `Upload HTTP ${resp.status}`);
            this.isBackendOnline = true;
            return data;
        },

        uploadCreativeMeta(payload) {
            return this.request('/api/v1/creatives/upload', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
        },

        recheckCreativePolicy(creativeIds) {
            return this.request('/api/v1/creatives/recheck-policy', {
                method: 'POST',
                body: JSON.stringify({ creativeIds })
            });
        },

        // Bulk Campaign Launcher
        previewBulkLaunch(creativeIds, packageIds) {
            return this.request('/api/v1/campaigns/bulk-preview', {
                method: 'POST',
                body: JSON.stringify({ creativeIds, packageIds })
            });
        },

        launchBulkCampaigns(payload, idempotencyKey) {
            return this.request('/api/v1/campaigns/bulk-launch', {
                method: 'POST',
                headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
                body: JSON.stringify(payload)
            });
        },

        getBulkBatches() {
            return this.request('/api/v1/campaigns/batches');
        },

        getBulkBatch(batchId) {
            return this.request(`/api/v1/campaigns/batches/${encodeURIComponent(batchId)}`);
        },

        retryLaunchJob(jobId) {
            return this.request(`/api/v1/campaigns/jobs/${encodeURIComponent(jobId)}/retry`, {
                method: 'POST'
            });
        },

        retryBatchFailed(batchId) {
            return this.request(`/api/v1/campaigns/batches/${encodeURIComponent(batchId)}/retry-failed`, {
                method: 'POST'
            });
        },

        // Native Server-Sent Events (SSE)
        connectRealtimeStream(handlers = {}) {
            if (typeof EventSource === 'undefined') return null;

            const es = new EventSource(`${this.baseUrl}/api/v1/realtime/stream`);

            es.addEventListener('connected', (ev) => {
                this.isBackendOnline = true;
                try {
                    const data = JSON.parse(ev.data);
                    if (handlers.onConnected) handlers.onConnected(data);
                    this.emit('connected', data);
                } catch (e) {}
            });

            es.addEventListener('intraday_sync', (ev) => {
                this.isBackendOnline = true;
                try {
                    const data = JSON.parse(ev.data);
                    if (handlers.onSync) handlers.onSync(data);
                    this.emit('intraday_sync', data);
                } catch (e) {}
            });

            es.addEventListener('worker_status', (ev) => {
                this.isBackendOnline = true;
                try {
                    const data = JSON.parse(ev.data);
                    if (handlers.onWorkerStatus) handlers.onWorkerStatus(data);
                    this.emit('worker_status', data);
                } catch (e) {}
            });

            es.addEventListener('bulk_job_updated', (ev) => {
                this.isBackendOnline = true;
                try {
                    const data = JSON.parse(ev.data);
                    if (handlers.onBulkJobUpdated) handlers.onBulkJobUpdated(data);
                    this.emit('bulk_job_updated', data);
                } catch (e) {}
            });

            es.addEventListener('bulk_batch_completed', (ev) => {
                this.isBackendOnline = true;
                try {
                    const data = JSON.parse(ev.data);
                    if (handlers.onBulkBatchCompleted) handlers.onBulkBatchCompleted(data);
                    this.emit('bulk_batch_completed', data);
                } catch (e) {}
            });

            es.onerror = (err) => {
                if (es.readyState === EventSource.CLOSED) {
                    this.isBackendOnline = false;
                }
                if (handlers.onError) handlers.onError(err);
            };

            return es;
        }
    };

    window.AperoApi = AperoApi;
})();
