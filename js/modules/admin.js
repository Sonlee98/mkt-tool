/**
 * Module: Administration (Quản trị Hệ thống, Tài khoản Quảng cáo & Nhật ký Hoạt động)
 * Kết nối Backend thật cho Ad Accounts, Access Token Adapter & Sync thủ công từng tài khoản
 */

const AdminModule = {
    accountsCache: null,
    logsCache: null,
    securityCache: null,

    render() {
        const admin = window.PANDAWIND_DATA.administration;
        const accounts = this.accountsCache || admin.adAccounts.map(a => ({
            id: a.id,
            name: a.name,
            channel: a.channel,
            currency: 'USD',
            spendToday: a.spendToday,
            balance: a.balance,
            status: a.status,
            hasToken: false,
            tokenPreview: null,
            lastSync: a.lastSync
        }));

        // Schedule background refresh from PostgreSQL
        setTimeout(() => this.loadData(), 0);

        return `
            <div class="page-title-bar">
                <div class="page-heading">
                    <h1>Administration & Integrations</h1>
                    <p>Quản lý kết nối API tài khoản quảng cáo (Meta, TikTok, Google Ads, Mintegral), bảo mật Token AES-256-GCM và cầu chì an toàn</p>
                </div>
                <div class="page-actions">
                    <button class="btn btn-primary btn-sm" onclick="AdminModule.openAccountModal()">
                        + Kết Nối Ad Account
                    </button>
                </div>
            </div>

            <!-- Security & Guardrails Status Bar -->
            <div class="data-table-container" style="padding: 14px 18px; margin-bottom: 16px;" id="adminSecurityCard">
                ${this.renderSecurityCard(this.securityCache)}
            </div>

            <!-- Ad Account Integrations -->
            <div class="data-table-container">
                <div style="padding: 14px 18px; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between;">
                    <span style="font-weight: 700;">Tài Khoản Quảng Cáo Đã Kết Nối (Ad Network API)</span>
                    <span class="badge badge-success" id="adminAccountCountBadge">${accounts.length} Tài Khoản</span>
                </div>
                <div class="table-responsive">
                    <table class="pandawind-table">
                        <thead>
                            <tr>
                                <th>Tên Tài Khoản</th>
                                <th>Kênh (Platform)</th>
                                <th>Account ID</th>
                                <th>Chi Phí Hôm Nay</th>
                                <th>Số Dư Tài Khoản</th>
                                <th>Chế Độ Adapter</th>
                                <th>Đồng Bộ Lần Cuối</th>
                                <th>Thao Tác</th>
                            </tr>
                        </thead>
                        <tbody id="adminAdAccountsBody">
                            ${this.renderAccountRows(accounts)}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Team Members -->
            <div class="data-table-container">
                <div style="padding: 14px 18px; border-bottom: 1px solid var(--border-color); font-weight: 700;">
                    Thành Viên Đội Ngũ Tăng Trưởng (Growth & Marketing Team)
                </div>
                <div class="table-responsive">
                    <table class="pandawind-table">
                        <thead>
                            <tr>
                                <th>Họ và Tên</th>
                                <th>Email</th>
                                <th>Vai Trò (Role)</th>
                                <th>Bộ Phận</th>
                                <th>Trạng Thái</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${admin.teamMembers.map(u => `
                                <tr>
                                    <td>
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <div style="width: 26px; height: 26px; border-radius: 50%; background: #3b82f6; color: white; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;">
                                                ${u.name.charAt(0)}
                                            </div>
                                            <strong>${u.name}</strong>
                                        </div>
                                    </td>
                                    <td>${u.email}</td>
                                    <td><span class="badge badge-info">${u.role}</span></td>
                                    <td>${u.department}</td>
                                    <td><span class="badge badge-success">Active</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Audit / Telemetry Logs -->
            <div class="data-table-container">
                <div style="padding: 14px 18px; border-bottom: 1px solid var(--border-color); font-weight: 700;">
                    Nhật Ký Đồng Bộ API & Tác Vụ Tự Động (PostgreSQL Audit Log)
                </div>
                <div class="table-responsive">
                    <table class="pandawind-table">
                        <thead>
                            <tr>
                                <th>Thời Gian</th>
                                <th>Nguồn / Loại Hành Động</th>
                                <th>Chi Tiết Tác Vụ</th>
                            </tr>
                        </thead>
                        <tbody id="adminAuditLogsBody">
                            ${this.renderAuditRows(this.logsCache || admin.auditLogs)}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Connect / Update Ad Account Modal -->
            <div class="modal-backdrop" id="adAccountModalBackdrop" onclick="if(event.target === this) AdminModule.closeAccountModal()">
                <div class="modal-box" style="max-width: 640px;">
                    <div class="modal-header">
                        <div class="modal-title" id="adAccountModalTitle">Kết Nối / Cấu Hình Ad Account API</div>
                        <button class="modal-close-btn" onclick="AdminModule.closeAccountModal()">✕</button>
                    </div>
                    <form onsubmit="event.preventDefault(); AdminModule.saveAdAccount();">
                        <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
                            <div class="form-row-2">
                                <div class="form-group">
                                    <label class="form-label required">Account ID</label>
                                    <input type="text" class="form-input" id="accIdInput" required placeholder="e.g. act_102938499 hoặc 8291048201">
                                </div>
                                <div class="form-group">
                                    <label class="form-label required">Kênh Quảng Cáo</label>
                                    <select class="form-select" id="accChannelInput" onchange="AdminModule.toggleChannelFields()">
                                        <option value="Facebook">Facebook</option>
                                        <option value="TikTok">TikTok</option>
                                        <option value="Google Ads">Google Ads</option>
                                        <option value="Mintegral">Mintegral</option>
                                    </select>
                                </div>
                            </div>
                            <div class="form-row-2">
                                <div class="form-group">
                                    <label class="form-label required">Tên Tài Khoản</label>
                                    <input type="text" class="form-input" id="accNameInput" required placeholder="e.g. BM_PandaWind_Europe_01">
                                </div>
                                <div class="form-group">
                                    <label class="form-label">Tiền tệ & Số dư (USD)</label>
                                    <div style="display:flex; gap:8px;">
                                        <select class="form-select" id="accCurrencyInput" style="width:96px;">
                                            <option value="USD">USD</option>
                                            <option value="VND">VND</option>
                                        </select>
                                        <input type="number" class="form-input" id="accBalanceInput" value="15000" style="flex:1;">
                                    </div>
                                </div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Access Token (Tự động mã hóa AES-256-GCM khi lưu)</label>
                                <input type="password" class="form-input" id="accTokenInput" placeholder="Dán Meta/TikTok/Google Access Token (để trống nếu giữ token cũ hoặc chạy Sandbox)...">
                                <span style="font-size: 11px; color: var(--text-tertiary);">
                                    Khi có Token hợp lệ, Adapter Backend sẽ tự động gọi API thật của nền tảng quảng cáo tương ứng.
                                </span>
                            </div>

                            <!-- Google Ads OAuth2 & UAC Extra Config -->
                            <div id="accGoogleFieldsGroup" style="display:none; padding:12px; border:1px solid var(--border-color); border-radius:var(--radius-md); background:var(--bg-surface-subtle); margin-top:8px;">
                                <div style="font-weight:700; font-size:12.5px; margin-bottom:8px; color:var(--primary);">Cấu hình Google Ads OAuth2 Auto-Refresh & UAC (API v18)</div>
                                <div class="form-row-2">
                                    <div class="form-group">
                                        <label class="form-label">MCC Login Customer ID (10 số)</label>
                                        <input type="text" class="form-input" id="accGgLoginCidInput" placeholder="1234567890">
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">YouTube Unlisted Channel ID</label>
                                        <input type="text" class="form-input" id="accGgYoutubeIdInput" placeholder="UCxxxxxxxxxxxxxx">
                                    </div>
                                </div>
                                <div class="form-row-2">
                                    <div class="form-group">
                                        <label class="form-label">Developer Token</label>
                                        <input type="password" class="form-input" id="accGgDevTokenInput" placeholder="Để trống nếu dùng từ .env hoặc giữ cũ">
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">OAuth2 Client ID</label>
                                        <input type="text" class="form-input" id="accGgClientIdInput" placeholder="xxxx.apps.googleusercontent.com">
                                    </div>
                                </div>
                                <div class="form-row-2">
                                    <div class="form-group">
                                        <label class="form-label">OAuth2 Client Secret (AES-256)</label>
                                        <input type="password" class="form-input" id="accGgClientSecretInput" placeholder="GOCSPX-...">
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">OAuth2 Refresh Token (AES-256)</label>
                                        <input type="password" class="form-input" id="accGgRefreshTokenInput" placeholder="1//0g...">
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-outline btn-sm" onclick="AdminModule.closeAccountModal()">Hủy</button>
                            <button type="submit" class="btn btn-primary btn-sm">✓ Lưu & Mã Hóa Token</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    },

    renderSecurityCard(sec) {
        const s = sec || {
            tokenEncryption: 'AES-256-GCM',
            adminKeyRequired: false,
            webhookSecretConfigured: false,
            maxCampaignDailyBudgetUsd: 2000,
            maxBatchDailyBudgetUsd: 10000
        };
        const currentAdminKey = typeof localStorage !== 'undefined' ? (localStorage.getItem('pandawind_admin_key') || '') : '';
        return `
            <div style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px;">
                <div style="display:flex; flex-wrap:wrap; align-items:center; gap:10px; font-size:12px;">
                    <span class="badge badge-success">🔒 Vault: ${this.escapeHtml(s.tokenEncryption)}</span>
                    <span class="badge badge-info">🛡️ Budget Cap: $${Number(s.maxCampaignDailyBudgetUsd).toLocaleString()}/camp · $${Number(s.maxBatchDailyBudgetUsd).toLocaleString()}/batch</span>
                    <span class="badge ${s.webhookSecretConfigured ? 'badge-success' : 'badge-warning'}">
                        🔑 Webhook Auth: ${s.webhookSecretConfigured ? `Active (${this.escapeHtml(s.webhookSecretPreview || 'configured')})` : 'Chưa đặt SECRET'}
                    </span>
                    ${s.adminKeyRequired ? `<span class="badge badge-warning">🔐 Admin Key Bắt Buộc</span>` : `<span class="badge badge-neutral">Local Dev Admin Mode</span>`}
                </div>
                <div style="display:flex; flex-wrap:wrap; align-items:center; gap:8px;">
                    <input type="password" class="form-input" id="adminWebhookSecretInput" placeholder="Đặt WEBHOOK_SECRET..." style="width:170px; height:30px; font-size:12px;">
                    <button class="btn btn-outline btn-sm" onclick="AdminModule.saveWebhookSecret()">Lưu Webhook Secret</button>
                    <input type="password" class="form-input" id="adminSessionKeyInput" value="${this.escapeHtml(currentAdminKey)}" placeholder="x-admin-key (nếu bật)" style="width:150px; height:30px; font-size:12px;">
                    <button class="btn btn-outline btn-sm" onclick="AdminModule.saveSessionAdminKey()">Gắn Session Key</button>
                </div>
            </div>
        `;
    },

    toggleChannelFields() {
        const ch = document.getElementById('accChannelInput')?.value;
        const ggBox = document.getElementById('accGoogleFieldsGroup');
        if (ggBox) ggBox.style.display = ch === 'Google Ads' ? 'block' : 'none';
    },

    renderAccountRows(accounts) {
        return accounts.map(acc => `
            <tr>
                <td><strong>${this.escapeHtml(acc.name)}</strong></td>
                <td><span class="badge badge-neutral">${this.escapeHtml(acc.channel)}</span></td>
                <td style="font-family: var(--font-mono);">${this.escapeHtml(acc.id)}</td>
                <td style="color: #ef4444; font-weight: 600;">${acc.spendToday || '$0'}</td>
                <td style="color: #10b981; font-weight: 600;">${acc.balance || '$0'}</td>
                <td>
                    ${acc.hasToken
                        ? `<span class="badge badge-success" title="${this.escapeHtml(acc.tokenPreview || '')}">● Live API Token</span>`
                        : `<span class="badge badge-info">● Server Sandbox</span>`}
                </td>
                <td style="color: var(--text-tertiary);">${acc.lastSync || '-'}</td>
                <td>
                    <div style="display: flex; gap: 6px;">
                        <button class="btn btn-outline btn-sm" onclick="AdminModule.syncAccount('${this.escapeHtml(acc.id)}')">Sync</button>
                        <button class="btn btn-outline btn-sm" onclick="AdminModule.editAccount('${this.escapeHtml(acc.id)}')">Token</button>
                    </div>
                </td>
            </tr>
        `).join('');
    },

    renderAuditRows(logs) {
        return logs.map(log => {
            const action = log.action || log.source || 'API Sync';
            const detail = log.detail || log.text || '';
            const badgeCls = log.type === 'warning' ? 'badge-warning'
                : log.type === 'error' ? 'badge-danger'
                : log.type === 'info' ? 'badge-info' : 'badge-success';
            return `
                <tr>
                    <td style="font-family: var(--font-mono); color: var(--text-tertiary);">${log.time}</td>
                    <td><span class="badge ${badgeCls}">${this.escapeHtml(action)}</span></td>
                    <td>${this.escapeHtml(detail)}</td>
                </tr>
            `;
        }).join('');
    },

    async loadData() {
        if (!window.PandaWindApi) return;
        try {
            const [accRes, telRes, secRes] = await Promise.all([
                window.PandaWindApi.getAdAccounts(),
                window.PandaWindApi.getTelemetry(15),
                window.PandaWindApi.getSecurityConfig().catch(() => null)
            ]);
            if (secRes && secRes.ok) {
                this.securityCache = secRes;
                const secEl = document.getElementById('adminSecurityCard');
                if (secEl) secEl.innerHTML = this.renderSecurityCard(this.securityCache);
            }
            if (accRes && accRes.accounts) {
                this.accountsCache = accRes.accounts;
                const body = document.getElementById('adminAdAccountsBody');
                if (body) body.innerHTML = this.renderAccountRows(this.accountsCache);
                const badge = document.getElementById('adminAccountCountBadge');
                if (badge) badge.textContent = `${this.accountsCache.length} Tài Khoản`;
            }
            if (telRes && telRes.logs) {
                this.logsCache = telRes.logs;
                const logBody = document.getElementById('adminAuditLogsBody');
                if (logBody) logBody.innerHTML = this.renderAuditRows(this.logsCache);
            }
        } catch {
            // Keep static fallback silently if backend offline
        }
    },

    async saveWebhookSecret() {
        const val = document.getElementById('adminWebhookSecretInput')?.value.trim() || '';
        try {
            await window.PandaWindApi.saveSecurityConfig({ webhookSecret: val });
            App.showToast(val ? '🔒 Đã cập nhật WEBHOOK_SECRET xác thực MMP!' : 'Đã tắt WEBHOOK_SECRET runtime.', 'success');
            await this.loadData();
        } catch (err) {
            App.showToast(`Lỗi lưu Webhook Secret: ${err.message}`, 'danger');
        }
    },

    async saveSessionAdminKey() {
        const key = document.getElementById('adminSessionKeyInput')?.value.trim() || '';
        window.PandaWindApi.setAdminKey(key);
        App.showToast(key ? '🔐 Đã gắn x-admin-key cho phiên làm việc!' : 'Đã xóa x-admin-key khỏi trình duyệt.', 'info');
        await this.loadData();
    },

    async syncAccount(accountId) {
        App.showToast(`Đang đồng bộ tài khoản ${accountId}...`, 'info');
        try {
            const res = await window.PandaWindApi.syncAdAccount(accountId);
            App.showToast(
                `Đồng bộ thành công (${res.mode === 'live_api' ? 'Live API' : 'Server Sandbox'}): +${Math.round(res.spendDeltaTotal).toLocaleString('vi-VN')} đ!`,
                'success'
            );
            await this.loadData();
        } catch (err) {
            App.showToast(`Lỗi đồng bộ ${accountId}: ${err.message}`, 'danger');
        }
    },

    openAccountModal(existingAcc) {
        const modal = document.getElementById('adAccountModalBackdrop');
        if (!modal) return;
        const idEl = document.getElementById('accIdInput');
        const chEl = document.getElementById('accChannelInput');
        const nameEl = document.getElementById('accNameInput');
        const curEl = document.getElementById('accCurrencyInput');
        const balEl = document.getElementById('accBalanceInput');
        const tokEl = document.getElementById('accTokenInput');
        const ggLoginEl = document.getElementById('accGgLoginCidInput');
        const ggYtEl = document.getElementById('accGgYoutubeIdInput');
        const ggDevEl = document.getElementById('accGgDevTokenInput');
        const ggCidEl = document.getElementById('accGgClientIdInput');
        const ggSecEl = document.getElementById('accGgClientSecretInput');
        const ggRefEl = document.getElementById('accGgRefreshTokenInput');

        if (existingAcc) {
            const cfg = existingAcc.apiConfig || {};
            if (idEl) idEl.value = existingAcc.id;
            if (chEl) chEl.value = existingAcc.channel;
            if (nameEl) nameEl.value = existingAcc.name;
            if (curEl) curEl.value = existingAcc.currency || 'USD';
            if (balEl) balEl.value = existingAcc.balanceUsd || 10000;
            if (tokEl) tokEl.value = '';
            if (ggLoginEl) ggLoginEl.value = cfg.login_customer_id || '';
            if (ggYtEl) ggYtEl.value = cfg.youtube_channel_id || '';
            if (ggDevEl) ggDevEl.value = '';
            if (ggCidEl) ggCidEl.value = cfg.client_id || '';
            if (ggSecEl) ggSecEl.value = '';
            if (ggRefEl) ggRefEl.value = '';
        } else {
            if (idEl) idEl.value = '';
            if (nameEl) nameEl.value = '';
            if (curEl) curEl.value = 'USD';
            if (balEl) balEl.value = '15000';
            if (tokEl) tokEl.value = '';
            if (ggLoginEl) ggLoginEl.value = '';
            if (ggYtEl) ggYtEl.value = '';
            if (ggDevEl) ggDevEl.value = '';
            if (ggCidEl) ggCidEl.value = '';
            if (ggSecEl) ggSecEl.value = '';
            if (ggRefEl) ggRefEl.value = '';
        }
        this.toggleChannelFields();
        modal.classList.add('open');
    },

    editAccount(accountId) {
        const acc = (this.accountsCache || []).find(a => a.id === accountId);
        this.openAccountModal(acc || { id: accountId, channel: 'Facebook', name: accountId, balanceUsd: 10000 });
    },

    closeAccountModal() {
        const modal = document.getElementById('adAccountModalBackdrop');
        if (modal) modal.classList.remove('open');
    },

    async saveAdAccount() {
        const channel = document.getElementById('accChannelInput').value;
        const apiConfig = {};
        if (channel === 'Google Ads') {
            const loginCid = document.getElementById('accGgLoginCidInput')?.value.trim();
            const ytId = document.getElementById('accGgYoutubeIdInput')?.value.trim();
            const devTok = document.getElementById('accGgDevTokenInput')?.value.trim();
            const clientId = document.getElementById('accGgClientIdInput')?.value.trim();
            const clientSec = document.getElementById('accGgClientSecretInput')?.value.trim();
            const refreshTok = document.getElementById('accGgRefreshTokenInput')?.value.trim();
            if (loginCid) apiConfig.login_customer_id = loginCid;
            if (ytId) apiConfig.youtube_channel_id = ytId;
            if (devTok) apiConfig.developer_token = devTok;
            if (clientId) apiConfig.client_id = clientId;
            if (clientSec) apiConfig.client_secret = clientSec;
            if (refreshTok) apiConfig.refresh_token = refreshTok;
        }

        const payload = {
            id: document.getElementById('accIdInput').value.trim(),
            channel,
            name: document.getElementById('accNameInput').value.trim(),
            currency: document.getElementById('accCurrencyInput')?.value || 'USD',
            balanceUsd: parseFloat(document.getElementById('accBalanceInput').value || 0),
            accessToken: document.getElementById('accTokenInput').value.trim(),
            apiConfig
        };

        try {
            await window.PandaWindApi.saveAdAccount(payload);
            this.closeAccountModal();
            App.showToast(`🔒 Đã lưu & mã hóa cấu hình tài khoản ${payload.name}!`, 'success');
            await this.loadData();
        } catch (err) {
            App.showToast(`Lỗi lưu Ad Account: ${err.message}`, 'danger');
        }
    },

    initCharts() {},

    escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
};

window.AdminModule = AdminModule;
