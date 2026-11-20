/**
 * Module: Tactic Management (Quản lý Bộ quy tắc Tự động hóa Chiến dịch)
 * Kết nối PostgreSQL thật, hỗ trợ tạo/nhân bản/bật-tắt và xem rule bằng Modal
 */

const TacticsModule = {
    state: {
        searchTerm: '',
        filterStatus: 'All',
        filterOwner: 'All',
        cache: null,
        loading: false,
        newRules: [
            { if: 'Spend > $25 AND ROAS D0 < 70%', then: 'Pause Ad Set immediately' },
            { if: 'Spend > $40 AND ROAS D0 >= 120%', then: 'Increase Budget by 25%' }
        ]
    },

    getTacticsList() {
        return this.state.cache || window.PANDAWIND_DATA.tactics || [];
    },

    render() {
        const tactics = this.getTacticsList();
        setTimeout(() => this.loadData(), 0);

        return `
            <div class="page-title-bar">
                <div class="page-heading">
                    <h1>Tactic Management</h1>
                    <p>Bộ quy tắc tự động hóa tối ưu giá thầu, gắn trực tiếp vào Package khi khởi tạo chiến dịch hàng loạt</p>
                </div>
                <div class="page-actions">
                    <button class="btn btn-primary btn-sm" onclick="TacticsModule.openModal()">
                        + Create New Tactic
                    </button>
                </div>
            </div>

            <!-- Filter Toolbar -->
            <div class="filter-toolbar">
                <div class="filter-group-left">
                    <input type="text" class="filter-input" placeholder="🔍 Tìm tactic theo tên, người tạo..." value="${this.escapeHtml(this.state.searchTerm)}" oninput="TacticsModule.onSearch(this.value)">
                    <select class="filter-select" onchange="TacticsModule.onFilterStatus(this.value)">
                        <option value="All">Status: Tất cả</option>
                        <option value="Active">Active</option>
                        <option value="Paused">Paused</option>
                    </select>
                    <select class="filter-select" onchange="TacticsModule.onFilterOwner(this.value)">
                        <option value="All">Owner: Tất cả chuyên viên</option>
                        <option value="Nguyễn Công Hoàng">Nguyễn Công Hoàng</option>
                        <option value="Nguyễn Thị Kim Phượng">Nguyễn Thị Kim Phượng</option>
                        <option value="Đồng Quỳnh Trang">Đồng Quỳnh Trang</option>
                        <option value="Đỗ Thị Liên">Đỗ Thị Liên</option>
                    </select>
                </div>
                <div class="filter-group-right">
                    <span style="font-size: 12px; color: var(--text-tertiary);">Tổng số: <strong id="tacticsCountLabel">${tactics.length}</strong> tactics</span>
                </div>
            </div>

            <!-- Tactics Table -->
            <div class="data-table-container">
                <div class="table-responsive">
                    <table class="pandawind-table">
                        <thead>
                            <tr>
                                <th>Tactic Name</th>
                                <th>Mô tả Chiến lược</th>
                                <th>Quy tắc (Rules)</th>
                                <th>Người Phụ Trách</th>
                                <th>Created At</th>
                                <th>Last Updated</th>
                                <th>Trạng Thái</th>
                                <th>Thao Tác</th>
                            </tr>
                        </thead>
                        <tbody id="tacticsTableBody">
                            ${this.renderRows(tactics)}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Create Tactic Modal -->
            <div class="modal-backdrop" id="tacticModalBackdrop" onclick="if(event.target === this) TacticsModule.closeModal()">
                <div class="modal-box" style="max-width: 650px;">
                    <div class="modal-header">
                        <div class="modal-title">Create Automation Tactic</div>
                        <button class="modal-close-btn" onclick="TacticsModule.closeModal()">✕</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label required">Tactic Name</label>
                            <input type="text" class="form-input" id="newTacticName" placeholder="e.g. HoangNC_Scale_Tier1_HighROAS">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Mô tả mục tiêu tactic</label>
                            <textarea class="form-textarea" id="newTacticDesc" rows="2" placeholder="Mục tiêu điều kiện tăng/giảm ngân sách hoặc tự động bảo vệ ROAS..."></textarea>
                        </div>

                        <div>
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                                <label class="form-label required">Cấu hình Quy tắc Tự động (IF... THEN...)</label>
                                <button type="button" class="btn btn-outline btn-sm" onclick="TacticsModule.addRuleRow()">+ Thêm Quy Tắc</button>
                            </div>
                            <div id="ruleBuilderList" style="display: flex; flex-direction: column; gap: 8px;">
                                ${this.renderRuleBuilderRows()}
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-outline btn-sm" onclick="TacticsModule.closeModal()">Hủy</button>
                        <button class="btn btn-primary btn-sm" onclick="TacticsModule.saveTactic()">✓ Lưu Tactic</button>
                    </div>
                </div>
            </div>

            <!-- View Rules Modal -->
            <div class="modal-backdrop" id="tacticViewModalBackdrop" onclick="if(event.target === this) TacticsModule.closeViewModal()">
                <div class="modal-box" style="max-width: 620px;">
                    <div class="modal-header">
                        <div class="modal-title" id="tacticViewModalTitle">Chi tiết Quy tắc Tactic</div>
                        <button class="modal-close-btn" onclick="TacticsModule.closeViewModal()">✕</button>
                    </div>
                    <div class="modal-body" id="tacticViewModalBody"></div>
                    <div class="modal-footer">
                        <button class="btn btn-primary btn-sm" onclick="TacticsModule.closeViewModal()">Đóng</button>
                    </div>
                </div>
            </div>
        `;
    },

    renderRows(list) {
        let items = list || [];
        if (this.state.filterStatus !== 'All') {
            items = items.filter(t => t.status === this.state.filterStatus);
        }
        if (this.state.filterOwner !== 'All') {
            items = items.filter(t => String(t.owner).toLowerCase().includes(this.state.filterOwner.toLowerCase()));
        }
        if (this.state.searchTerm) {
            const q = this.state.searchTerm.toLowerCase();
            items = items.filter(t => `${t.name} ${t.description} ${t.owner}`.toLowerCase().includes(q));
        }

        if (items.length === 0) {
            return `<tr><td colspan="8" style="text-align:center; color:var(--text-tertiary);">Không có Tactic phù hợp.</td></tr>`;
        }

        return items.map(t => `
            <tr>
                <td>
                    <div style="font-weight: 700; color: var(--primary);">⚡ ${this.escapeHtml(t.name)}</div>
                </td>
                <td style="max-width: 300px; color: var(--text-secondary);">${this.escapeHtml(t.description)}</td>
                <td>
                    <span class="badge badge-info" style="cursor: pointer;" onclick="TacticsModule.viewRules('${this.escapeHtml(String(t.id))}')">
                        ${t.rulesCount || (t.rules || []).length} rules
                    </span>
                </td>
                <td><strong>${this.escapeHtml(t.owner)}</strong></td>
                <td style="font-size: 11.5px; color: var(--text-tertiary);">${this.escapeHtml(t.createdAt)}</td>
                <td style="font-size: 11.5px; color: var(--text-tertiary);">${this.escapeHtml(t.lastUpdated)}</td>
                <td>
                    <label class="switch-toggle">
                        <input type="checkbox" ${t.status === 'Active' ? 'checked' : ''} onchange="TacticsModule.toggleStatus('${this.escapeHtml(String(t.id))}', this.checked)">
                        <span class="switch-slider"></span>
                    </label>
                </td>
                <td>
                    <div style="display: flex; gap: 6px;">
                        <button class="btn btn-outline btn-sm" onclick="TacticsModule.viewRules('${this.escapeHtml(String(t.id))}')">Xem Rules</button>
                        <button class="btn btn-outline btn-sm" onclick="TacticsModule.cloneTactic('${this.escapeHtml(String(t.id))}')">Clone</button>
                    </div>
                </td>
            </tr>
        `).join('');
    },

    renderRuleBuilderRows() {
        return this.state.newRules.map((r, idx) => `
            <div style="background: var(--bg-surface-subtle); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 10px 12px; display: flex; flex-direction: column; gap: 6px;">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <span style="font-size: 11px; font-weight: 700; color: var(--primary);">RULE #${idx + 1}</span>
                    <button type="button" style="background:none; border:none; color: var(--danger); cursor:pointer; font-size:12px;" onclick="TacticsModule.removeRuleRow(${idx})">Xóa</button>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-weight: 700; color: #f59e0b; font-size: 12px; width: 42px;">IF:</span>
                    <input type="text" class="form-input tactic-rule-if" style="flex:1;" value="${this.escapeHtml(r.if)}">
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-weight: 700; color: #10b981; font-size: 12px; width: 42px;">THEN:</span>
                    <input type="text" class="form-input tactic-rule-then" style="flex:1;" value="${this.escapeHtml(r.then)}">
                </div>
            </div>
        `).join('');
    },

    async loadData(force = false) {
        if (!window.PandaWindApi || (this.state.loading && !force)) return;
        this.state.loading = true;
        try {
            const res = await window.PandaWindApi.getTactics();
            if (res && res.ok) {
                this.state.cache = res.items || [];
                this.refreshDom();
            }
        } catch {
            // Static fallback
        } finally {
            this.state.loading = false;
        }
    },

    refreshDom() {
        const list = this.getTacticsList();
        const body = document.getElementById('tacticsTableBody');
        if (body) body.innerHTML = this.renderRows(list);
        const cnt = document.getElementById('tacticsCountLabel');
        if (cnt) cnt.textContent = String(list.length);
    },

    openModal() {
        const modal = document.getElementById('tacticModalBackdrop');
        if (modal) modal.classList.add('open');
    },

    closeModal() {
        const modal = document.getElementById('tacticModalBackdrop');
        if (modal) modal.classList.remove('open');
    },

    syncRulesFromDom() {
        const ifInputs = document.querySelectorAll('#ruleBuilderList .tactic-rule-if');
        const thenInputs = document.querySelectorAll('#ruleBuilderList .tactic-rule-then');
        const synced = [];
        for (let i = 0; i < ifInputs.length; i++) {
            synced.push({
                if: ifInputs[i].value.trim(),
                then: thenInputs[i] ? thenInputs[i].value.trim() : ''
            });
        }
        if (synced.length > 0) this.state.newRules = synced;
    },

    addRuleRow() {
        this.syncRulesFromDom();
        this.state.newRules.push({ if: 'Spend > $20 AND CPI > $0.35', then: 'Decrease Budget by 15%' });
        const list = document.getElementById('ruleBuilderList');
        if (list) list.innerHTML = this.renderRuleBuilderRows();
    },

    removeRuleRow(idx) {
        this.syncRulesFromDom();
        this.state.newRules.splice(idx, 1);
        const list = document.getElementById('ruleBuilderList');
        if (list) list.innerHTML = this.renderRuleBuilderRows();
    },

    async saveTactic() {
        this.syncRulesFromDom();
        const name = document.getElementById('newTacticName')?.value.trim();
        const description = document.getElementById('newTacticDesc')?.value.trim() || '';
        if (!name) {
            App.showToast('Vui lòng nhập Tên Tactic!', 'warning');
            return;
        }

        try {
            if (window.PandaWindApi) {
                await window.PandaWindApi.createTactic({
                    name,
                    description,
                    rules: this.state.newRules.filter(r => r.if && r.then),
                    ownerName: 'Nguyễn Công Hoàng'
                });
                App.showToast(`Đã lưu Tactic "${name}" vào PostgreSQL!`, 'success');
                this.closeModal();
                await this.loadData(true);
            }
        } catch (err) {
            App.showToast(`Lỗi lưu Tactic: ${err.message}`, 'danger');
        }
    },

    async toggleStatus(id, checked) {
        const nextStatus = checked ? 'Active' : 'Paused';
        try {
            if (window.PandaWindApi) {
                await window.PandaWindApi.updateTactic(id, { status: nextStatus });
                App.showToast(`Tactic đã chuyển trạng thái: ${nextStatus}`, 'info');
                await this.loadData(true);
            }
        } catch (err) {
            App.showToast(`Lỗi cập nhật Tactic: ${err.message}`, 'danger');
        }
    },

    async cloneTactic(id) {
        const t = this.getTacticsList().find(x => String(x.id) === String(id));
        if (!t || !window.PandaWindApi) return;
        try {
            await window.PandaWindApi.createTactic({
                name: `${t.name}_Copy`,
                description: t.description,
                rules: t.rules || [],
                ownerName: t.owner
            });
            App.showToast(`Đã nhân bản tactic "${t.name}"!`, 'success');
            await this.loadData(true);
        } catch (err) {
            App.showToast(`Lỗi clone: ${err.message}`, 'danger');
        }
    },

    viewRules(id) {
        const t = this.getTacticsList().find(x => String(x.id) === String(id));
        if (!t) return;
        const titleEl = document.getElementById('tacticViewModalTitle');
        const bodyEl = document.getElementById('tacticViewModalBody');
        if (titleEl) titleEl.textContent = `⚡ ${t.name} (${(t.rules || []).length} rules)`;
        if (bodyEl) {
            bodyEl.innerHTML = `
                <div style="font-size: 12.5px; color: var(--text-secondary); margin-bottom: 10px;">${this.escapeHtml(t.description)}</div>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    ${(t.rules || []).map((r, i) => `
                        <div style="background:var(--bg-surface-subtle); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:10px 12px; font-size:12.5px;">
                            <div style="font-weight:700; color:var(--primary); margin-bottom:4px;">Rule #${i + 1}</div>
                            <div><strong style="color:#f59e0b;">IF:</strong> ${this.escapeHtml(r.if)}</div>
                            <div><strong style="color:#10b981;">THEN:</strong> ${this.escapeHtml(r.then)}</div>
                        </div>
                    `).join('')}
                </div>
            `;
        }
        const modal = document.getElementById('tacticViewModalBackdrop');
        if (modal) modal.classList.add('open');
    },

    closeViewModal() {
        const modal = document.getElementById('tacticViewModalBackdrop');
        if (modal) modal.classList.remove('open');
    },

    onSearch(q) {
        this.state.searchTerm = q;
        this.refreshDom();
    },

    onFilterStatus(s) {
        this.state.filterStatus = s;
        this.refreshDom();
    },

    onFilterOwner(o) {
        this.state.filterOwner = o;
        this.refreshDom();
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

window.TacticsModule = TacticsModule;
