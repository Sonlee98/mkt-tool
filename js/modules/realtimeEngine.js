/**
 * Module: Realtime Engine (Bộ Máy Cập Nhật & Đồng Bộ Dữ Liệu Thời Gian Thực)
 * Kết nối SSE (Server-Sent Events) từ Backend Fastify + PostgreSQL, cập nhật KPI/Chart/Table tức thì,
 * và hiển thị Live API Telemetry & Webhook Monitor.
 */

const RealtimeEngine = {
    state: {
        isRunning: true,
        backendConnected: false,
        intervalMs: 8000,
        eventSource: null,
        lastSyncTime: new Date(),
        syncCount: 0,
        logs: []
    },

    init() {
        this.updateHeaderBadge();
        this.loadTelemetry();
        this.connectSse();

        // Lắng nghe custom event cho developer test nhanh qua Console -> đẩy thẳng vào Webhook API
        window.addEventListener('pandawind:api-update', async (event) => {
            if (!event.detail) return;
            await this.pushUpdate(event.detail, event.detail.source || 'Browser CustomEvent');
        });
    },

    async loadTelemetry() {
        if (!window.PandaWindApi) return;
        try {
            const res = await window.PandaWindApi.getTelemetry(40);
            if (res && res.ok) {
                this.state.backendConnected = true;
                this.state.logs = res.logs || [];
                if (res.worker) {
                    this.state.isRunning = res.worker.isRunning;
                    this.state.intervalMs = res.worker.intervalMs;
                    this.state.syncCount = res.worker.syncCount;
                }
                this.updateHeaderBadge();
                this.refreshTelemetryModalIfOpen();
            }
        } catch {
            this.state.backendConnected = false;
            this.updateHeaderBadge();
        }
    },

    connectSse() {
        if (!window.PandaWindApi) return;
        if (this.state.eventSource) {
            this.state.eventSource.close();
        }

        this.state.eventSource = window.PandaWindApi.connectRealtimeStream({
            onConnected: (data) => {
                this.state.backendConnected = true;
                if (data && data.worker) {
                    this.state.isRunning = data.worker.isRunning;
                    this.state.intervalMs = data.worker.intervalMs;
                    this.state.syncCount = data.worker.syncCount;
                }
                this.updateHeaderBadge();
            },

            onSync: (data) => {
                this.state.backendConnected = true;
                this.state.lastSyncTime = new Date();
                this.state.syncCount++;

                if (data && data.telemetry) {
                    this.state.logs.unshift(data.telemetry);
                    if (this.state.logs.length > 40) this.state.logs.pop();
                }

                this.updateHeaderBadge();
                this.refreshTelemetryModalIfOpen();

                if (window.App && window.App.state && window.App.state.currentRoute === 'intraday' && window.IntradayModule) {
                    window.IntradayModule.refreshFromRealtime(data);
                }
            },

            onWorkerStatus: (worker) => {
                this.state.backendConnected = true;
                if (worker) {
                    this.state.isRunning = worker.isRunning;
                    this.state.intervalMs = worker.intervalMs;
                    this.state.syncCount = worker.syncCount;
                }
                this.updateHeaderBadge();
                this.refreshTelemetryModalIfOpen();
            },

            onError: () => {
                this.state.backendConnected = window.PandaWindApi.isBackendOnline;
                this.updateHeaderBadge();
            }
        });
    },

    async toggle() {
        if (!window.PandaWindApi) return;
        try {
            const res = await window.PandaWindApi.toggleWorker();
            if (res && res.worker) {
                this.state.isRunning = res.worker.isRunning;
                this.state.syncCount = res.worker.syncCount;
            }
            this.updateHeaderBadge();
            this.refreshTelemetryModalIfOpen();
            App.showToast(
                this.state.isRunning
                    ? `Đã kích hoạt Server Sync Worker (${this.state.intervalMs / 1000}s/lần)!`
                    : 'Đã tạm dừng Server Sync Worker!',
                this.state.isRunning ? 'success' : 'warning'
            );
        } catch (err) {
            App.showToast(`Không thể kết nối Backend: ${err.message}`, 'danger');
        }
    },

    async triggerNow() {
        if (!window.PandaWindApi) return;
        try {
            await window.PandaWindApi.triggerWorker('Manual Telemetry Trigger');
            App.showToast('Đã kích hoạt đồng bộ gói tin mới vào PostgreSQL!', 'success');
        } catch (err) {
            App.showToast(`Lỗi đồng bộ: ${err.message}`, 'danger');
        }
    },

    /**
     * API cho Developer test gửi webhook trực tiếp từ Browser Console
     */
    async pushUpdate(payload, source = 'Browser Console Webhook') {
        if (window.PandaWindApi) {
            try {
                await window.PandaWindApi.sendWebhook('custom', Object.assign({ source }, payload));
                return;
            } catch (err) {
                App.showToast(`Webhook error: ${err.message}`, 'danger');
            }
        }
    },

    updateHeaderBadge() {
        const badge = document.getElementById('realtimeHeaderBadge');
        if (!badge) return;

        if (!this.state.backendConnected) {
            badge.className = 'realtime-status-pill offline';
            badge.innerHTML = `
                <span class="live-dot-static"></span>
                <span class="status-text">OFFLINE (Static)</span>
            `;
            badge.title = 'Không kết nối được Backend tại localhost:4000. Nhấn để xem Telemetry.';
            return;
        }

        if (this.state.isRunning) {
            badge.className = 'realtime-status-pill online';
            badge.innerHTML = `
                <span class="live-dot-pulse"></span>
                <span class="status-text">LIVE SYNC (${this.state.syncCount} packets)</span>
            `;
            badge.title = `Realtime SSE đang bật (Worker ${this.state.intervalMs / 1000}s). Nhấn để xem Telemetry Logs.`;
        } else {
            badge.className = 'realtime-status-pill offline';
            badge.innerHTML = `
                <span class="live-dot-static"></span>
                <span class="status-text">PAUSED (${this.state.syncCount})</span>
            `;
            badge.title = 'Server Sync Worker đang tạm dừng. Nhấn để bật lại.';
        }
    },

    renderIndicator() {
        this.updateHeaderBadge();
    },

    buildTelemetryRowsHtml() {
        if (!this.state.logs || this.state.logs.length === 0) {
            return `
                <tr>
                    <td colspan="5" style="padding: 20px; text-align: center; color: var(--text-tertiary);">
                        Chưa có gói tin telemetry nào (hoặc Backend chưa bật).
                    </td>
                </tr>
            `;
        }

        return this.state.logs.map(l => `
            <tr style="font-size: 11.5px; border-bottom: 1px solid var(--border-color);">
                <td style="padding: 8px 10px; color: var(--text-tertiary); font-family: var(--font-mono); white-space: nowrap;">${l.time || '-'}</td>
                <td style="padding: 8px 10px; font-weight: 600; color: var(--primary);">${this.escapeHtml(l.source)}</td>
                <td style="padding: 8px 10px;">
                    <span style="background: rgba(16, 185, 129, 0.12); color: #10b981; padding: 2px 6px; border-radius: 4px; font-weight: 700;">
                        ${l.status || 200}
                    </span>
                </td>
                <td style="padding: 8px 10px; color: var(--text-secondary);">${l.latency || '-'}</td>
                <td style="padding: 8px 10px; color: var(--text-primary);">${this.escapeHtml(l.text)}</td>
            </tr>
        `).join('');
    },

    refreshTelemetryModalIfOpen() {
        const modal = document.getElementById('telemetryModal');
        if (modal && modal.classList.contains('open')) {
            this.renderTelemetryModalContents(modal);
        }
    },

    showTelemetryModal() {
        let modal = document.getElementById('telemetryModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'telemetryModal';
            modal.className = 'modal-backdrop';
            modal.onclick = (e) => {
                if (e.target === modal) this.closeTelemetryModal();
            };
            document.body.appendChild(modal);
        }

        this.renderTelemetryModalContents(modal);
        modal.classList.add('open');
        this.loadTelemetry();
    },

    renderTelemetryModalContents(modal) {
        const base = (window.PandaWindApi && window.PandaWindApi.baseUrl) || window.location.origin;
        const webhookUrl = `${base}/api/v1/webhooks/appsflyer`;

        modal.innerHTML = `
            <div class="modal-box" style="max-width: 880px;">
                <div class="modal-header">
                    <div>
                        <h3 class="modal-title" style="display: flex; align-items: center; gap: 8px;">
                            <span class="${this.state.backendConnected && this.state.isRunning ? 'live-dot-pulse' : 'live-dot-static'}"></span>
                            Live API Telemetry & Webhook Monitor (PostgreSQL + SSE)
                        </h3>
                        <p style="font-size: 12px; color: var(--text-tertiary); margin-top: 3px;">
                            Nhật ký thời gian thực các gói tin từ Facebook Ads API, TikTok API, Google UAC, Webhook & CSV/GGSheet
                        </p>
                    </div>
                    <button class="modal-close-btn" onclick="RealtimeEngine.closeTelemetryModal()">✕</button>
                </div>
                <div class="modal-body" style="padding: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; background: var(--bg-surface-subtle); padding: 10px 14px; border-radius: 6px; border: 1px solid var(--border-color);">
                        <div style="font-size: 12px; color: var(--text-secondary);">
                            Kết nối: <strong>${this.state.backendConnected ? '🟢 PostgreSQL Online' : '🔴 Offline'}</strong> |
                            Worker: <strong>${this.state.isRunning ? 'ĐANG CHẠY' : 'TẠM DỪNG'}</strong> (${this.state.intervalMs / 1000}s) |
                            Packets SSE: <strong>${this.state.syncCount}</strong>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-sm ${this.state.isRunning ? 'btn-outline' : 'btn-primary'}" onclick="RealtimeEngine.toggle()">
                                ${this.state.isRunning ? '⏸️ Tạm Dừng Worker' : '▶️ Bật Worker'}
                            </button>
                            <button class="btn btn-sm btn-primary" onclick="RealtimeEngine.triggerNow()">
                                ⚡ Test Gửi Gói Tin Ngay
                            </button>
                        </div>
                    </div>

                    <div style="max-height: 360px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 6px;">
                        <table style="width: 100%; border-collapse: collapse; text-align: left;">
                            <thead style="background: var(--bg-surface-subtle); position: sticky; top: 0; font-size: 11px; text-transform: uppercase; color: var(--text-secondary);">
                                <tr>
                                    <th style="padding: 8px 10px;">Thời Gian</th>
                                    <th style="padding: 8px 10px;">Nguồn API</th>
                                    <th style="padding: 8px 10px;">Code</th>
                                    <th style="padding: 8px 10px;">Độ trễ</th>
                                    <th style="padding: 8px 10px;">Nội Dung Gói Tin</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this.buildTelemetryRowsHtml()}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="modal-footer" style="padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                    <span style="font-size: 11.5px; color: var(--text-tertiary);">
                        Webhook Endpoint: <code>POST ${this.escapeHtml(webhookUrl)}</code>
                    </span>
                    <button class="btn btn-outline btn-sm" onclick="RealtimeEngine.closeTelemetryModal()">Đóng</button>
                </div>
            </div>
        `;
    },

    closeTelemetryModal() {
        const modal = document.getElementById('telemetryModal');
        if (modal) modal.classList.remove('open');
    },

    escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
};

window.RealtimeEngine = RealtimeEngine;
