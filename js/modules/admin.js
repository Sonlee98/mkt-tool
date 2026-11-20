/**
 * Module: Administration (Quản trị Hệ thống, Tài khoản Quảng cáo & Nhật ký Hoạt động)
 * Kết nối Backend thật cho Ad Accounts, Access Token Adapter & Sync thủ công từng tài khoản
 */

const AdminModule = {
    accountsCache: null,
    logsCache: null,

    render() {
        const admin = window.APERO_DATA.administration;
        const accounts = this.accountsCache || admin.adAccounts.map(a => ({
            id: a.id,
            name: a.name,
            channel: a.channel,
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
                    <p>Quản lý kết nối API tài khoản quảng cáo (Meta, TikTok, Google Ads, Mintegral), Access Token và nhật ký đồng bộ</p>
                </div>
                <div class="page-actions">
                    <button class="btn btn-primary btn-sm" onclick="AdminModule.openAccountModal()">
                        + Kết Nối Ad Account
                    </button>
                </div>
            </div>

            <!-- Ad Account Integrations -->
            <div class="data-table-container">
                <div style="padding: 14px 18px; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between;">
                    <span style="font-weight: 700;">Tài Khoản Quảng Cáo Đã Kết Nối (Ad Network API)</span>
                    <span class="badge badge-success" id="adminAccountCountBadge">${accounts.length} Tài Khoản</span>
                </div>
                <div class="table-responsive">
                    <table class="apero-table">
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
                    <table class="apero-table">
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
                    <table class="apero-table">
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
                <div class="modal-box" style="max-width: 560px;">
                    <div class="modal-header">
                        <div class="modal-title" id="adAccountModalTitle">Kết Nối / Cấu Hình Ad Account API</div>
                        <button class="modal-close-btn" onclick="AdminModule.closeAccountModal()">✕</button>
                    </div>
                    <form onsubmit="event.preventDefault(); AdminModule.saveAdAccount();">
                        <div class="modal-body">
                            <div class="form-row-2">
                                <div class="form-group">
                                    <label class="form-label required">Account ID</label>
                                    <input type="text" class="form-input" id="accIdInput" required placeholder="e.g. act_102938499">
                                </div>
                                <div class="form-group">
                                    <label class="form-label required">Kênh Quảng Cáo</label>
                                    <select class="form-select" id="accChannelInput">
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
                                    <input type="text" class="form-input" id="accNameInput" required placeholder="e.g. BM_Apero_Europe_01">
                                </div>
                                <div class="form-group">
                                    <label class="form-label">Số Dư (USD)</label>
                                    <input type="number" class="form-input" id="accBalanceInput" value="15000">
                                </div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Access Token (Tuỳ chọn - để trống nếu dùng Server Sandbox)</label>
                                <input type="password" class="form-input" id="accTokenInput" placeholder="Dán Meta/TikTok/Google Access Token thật tại đây...">
                                <span style="font-size: 11px; color: var(--text-tertiary);">
                                    Khi có Token, Adapter Backend sẽ tự động gọi API thật của nền tảng quảng cáo tương ứng.
                                </span>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-outline btn-sm" onclick="AdminModule.closeAccountModal()">Hủy</button>
                            <button type="submit" class="btn btn-primary btn-sm">✓ Lưu Kết Nối</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
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
        if (!window.AperoApi) return;
        try {
            const [accRes, telRes] = await Promise.all([
                window.AperoApi.getAdAccounts(),
                window.AperoApi.getTelemetry(15)
            ]);
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

    async syncAccount(accountId) {
        App.showToast(`Đang đồng bộ tài khoản ${accountId}...`, 'info');
        try {
            const res = await window.AperoApi.syncAdAccount(accountId);
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
        const balEl = document.getElementById('accBalanceInput');
        const tokEl = document.getElementById('accTokenInput');

        if (existingAcc) {
            if (idEl) idEl.value = existingAcc.id;
            if (chEl) chEl.value = existingAcc.channel;
            if (nameEl) nameEl.value = existingAcc.name;
            if (balEl) balEl.value = existingAcc.balanceUsd || 10000;
            if (tokEl) tokEl.value = '';
        } else {
            if (idEl) idEl.value = '';
            if (nameEl) nameEl.value = '';
            if (balEl) balEl.value = '15000';
            if (tokEl) tokEl.value = '';
        }
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
        const payload = {
            id: document.getElementById('accIdInput').value.trim(),
            channel: document.getElementById('accChannelInput').value,
            name: document.getElementById('accNameInput').value.trim(),
            balanceUsd: parseFloat(document.getElementById('accBalanceInput').value || 0),
            accessToken: document.getElementById('accTokenInput').value.trim()
        };

        try {
            await window.AperoApi.saveAdAccount(payload);
            this.closeAccountModal();
            App.showToast(`Đã lưu cấu hình tài khoản ${payload.name}!`, 'success');
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
