/**
 * Module: Package Management (Gói Tạo Chiến Dịch Tự Động Hóa Trọn Gói)
 * Hỗ trợ Facebook & Google Ads UAC, Cross-Validation trên PostgreSQL thật
 */

const PackagesModule = {
    state: {
        searchTerm: '',
        filterChannel: 'All',
        filterStatus: 'All',
        wizardStep: 1,
        wizardData: {
            name: 'AIP922-US-TIER1-SCALE-AUTO-v2',
            channel: 'Facebook',
            appTemplateId: '',
            campaignTemplateId: '',
            adTemplateId: '',
            pageTemplateId: '',
            tacticIds: [],
            adAccountId: '',
            namingTemplate: '{product}_{channel}_{geo}_{angle}_{lang}_{pkg_tag}_{acc_short}_{date}_{idx}'
        },
        cache: null,
        refs: {
            applications: [],
            campaigns: [],
            ads: [],
            pages: [],
            accounts: [],
            tactics: []
        },
        loading: false
    },

    getPackagesList() {
        return this.state.cache || window.APERO_DATA.packages || [];
    },

    render() {
        const pkgs = this.getPackagesList();
        setTimeout(() => this.loadData(), 0);

        return `
            <div class="page-title-bar">
                <div class="page-heading">
                    <h1>Package Management</h1>
                    <p>Đóng gói App Template + Campaign Template (G × V) + Ad Template + Page + Ad Account + Tactic thành gói triển khai hàng loạt</p>
                </div>
                <div class="page-actions">
                    <button class="btn btn-primary btn-sm" onclick="PackagesModule.openWizard()">
                        + Create Package
                    </button>
                </div>
            </div>

            <!-- Filter Toolbar -->
            <div class="filter-toolbar">
                <div class="filter-group-left">
                    <input type="text" class="filter-input" placeholder="🔍 Tìm package, tài khoản..." value="${this.escapeHtml(this.state.searchTerm)}" oninput="PackagesModule.onSearch(this.value)">
                    <select class="filter-select" onchange="PackagesModule.onFilterChannel(this.value)">
                        <option value="All">Channel: Tất cả Kênh</option>
                        <option value="Facebook">Facebook</option>
                        <option value="Google Ads">Google Ads (UAC)</option>
                    </select>
                    <select class="filter-select" onchange="PackagesModule.onFilterStatus(this.value)">
                        <option value="All">Status: Tất cả</option>
                        <option value="Running">Running</option>
                        <option value="Draft">Draft</option>
                    </select>
                </div>
                <div class="filter-group-right">
                    <span style="font-size: 12px; color: var(--text-tertiary);">Tổng số: <strong id="packagesCountLabel">${pkgs.length}</strong> packages</span>
                </div>
            </div>

            <!-- Package Table -->
            <div class="data-table-container">
                <div class="table-responsive">
                    <table class="apero-table">
                        <thead>
                            <tr>
                                <th>Package Name</th>
                                <th>Kênh</th>
                                <th>App Template</th>
                                <th>Campaign Template</th>
                                <th>Matrix / Budget</th>
                                <th>Tactic Tự Động</th>
                                <th>Tài Khoản Quảng Cáo</th>
                                <th>Trạng Thái</th>
                                <th>Thao Tác</th>
                            </tr>
                        </thead>
                        <tbody id="packagesTableBody">
                            ${this.renderRows(pkgs)}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Create Package Wizard Modal -->
            <div class="modal-backdrop" id="packageModalBackdrop" onclick="if(event.target === this) PackagesModule.closeWizard()">
                <div class="modal-box" style="max-width: 720px;">
                    <div class="modal-header">
                        <div>
                            <div class="modal-title" id="pkgWizardTitle">Create New Package (Step ${this.state.wizardStep} of 4)</div>
                            <div style="font-size: 12px; color: var(--text-tertiary); margin-top: 2px;" id="pkgWizardSub">
                                ${this.getStepTitle()}
                            </div>
                        </div>
                        <button class="modal-close-btn" onclick="PackagesModule.closeWizard()">✕</button>
                    </div>
                    <div class="modal-body" id="pkgWizardBody">
                        ${this.renderWizardStepContent()}
                    </div>
                    <div class="modal-footer" id="pkgWizardFooter">
                        ${this.renderWizardFooter()}
                    </div>
                </div>
            </div>
        `;
    },

    renderRows(list) {
        let items = list || [];
        if (this.state.filterChannel !== 'All') {
            items = items.filter(p => p.channel === this.state.filterChannel);
        }
        if (this.state.filterStatus !== 'All') {
            items = items.filter(p => p.status === this.state.filterStatus);
        }
        if (this.state.searchTerm) {
            const q = this.state.searchTerm.toLowerCase();
            items = items.filter(p => `${p.name} ${p.adAccount} ${p.appTemplate} ${p.camTemplate}`.toLowerCase().includes(q));
        }

        if (items.length === 0) {
            return `<tr><td colspan="9" style="text-align:center; color:var(--text-tertiary);">Không có Package phù hợp.</td></tr>`;
        }

        return items.map(p => `
            <tr>
                <td>
                    <div style="font-weight: 700; color: var(--primary); max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.escapeHtml(p.name)}">
                        📦 ${this.escapeHtml(p.name)}
                    </div>
                </td>
                <td><span class="badge ${p.channel === 'Google Ads' ? 'badge-warning' : 'badge-info'}">${this.escapeHtml(p.channel)}</span></td>
                <td><span class="badge badge-neutral">${this.escapeHtml(p.appTemplate)}</span></td>
                <td style="font-size: 11.5px; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.escapeHtml(p.camTemplate)}">${this.escapeHtml(p.camTemplate)}</td>
                <td style="font-size: 11.5px;">
                    <strong>${p.adGroupVolume || 1}G × ${p.creativeVolume || 1}C</strong>
                    ${p.budgetLabel ? `<div style="color:var(--text-tertiary);">${this.escapeHtml(p.budgetLabel)}</div>` : ''}
                </td>
                <td><span class="badge badge-warning">⚡ ${this.escapeHtml(p.tactics)}</span></td>
                <td style="font-size: 11px; font-family: var(--font-mono);">${this.escapeHtml(p.adAccount)}</td>
                <td><span class="badge badge-success">● ${this.escapeHtml(p.status)}</span></td>
                <td>
                    <button class="btn btn-primary btn-sm" onclick="PackagesModule.deployPackageQuick('${this.escapeHtml(String(p.id))}')">🚀 Deploy</button>
                </td>
            </tr>
        `).join('');
    },

    async loadData(force = false) {
        if (!window.AperoApi || (this.state.loading && !force)) return;
        this.state.loading = true;
        try {
            const [pkgRes, tmplRes, accRes, tacRes] = await Promise.all([
                window.AperoApi.getPackages(),
                window.AperoApi.getTemplates(),
                window.AperoApi.getAdAccounts(),
                window.AperoApi.getTactics()
            ]);

            if (pkgRes && pkgRes.ok) {
                this.state.cache = pkgRes.items || [];
            }
            if (tmplRes && tmplRes.ok) {
                this.state.refs.applications = tmplRes.applications || [];
                this.state.refs.campaigns = tmplRes.campaigns || [];
                this.state.refs.ads = tmplRes.ads || [];
                this.state.refs.pages = tmplRes.pages || [];
            }
            if (accRes && accRes.accounts) {
                this.state.refs.accounts = accRes.accounts;
            }
            if (tacRes && tacRes.items) {
                this.state.refs.tactics = tacRes.items;
            }
            this.refreshDom();
        } catch {
            // Static fallback
        } finally {
            this.state.loading = false;
        }
    },

    refreshDom() {
        const list = this.getPackagesList();
        const body = document.getElementById('packagesTableBody');
        if (body) body.innerHTML = this.renderRows(list);
        const cnt = document.getElementById('packagesCountLabel');
        if (cnt) cnt.textContent = String(list.length);
    },

    getStepTitle() {
        switch (this.state.wizardStep) {
            case 1: return 'Bước 1: Tên Package, Kênh Quảng Cáo & Application Template';
            case 2: return 'Bước 2: Chọn Campaign Template, Ad Template & Page Template';
            case 3: return 'Bước 3: Gắn Bộ Quy Tắc Tự Động (Tactics)';
            case 4: return 'Bước 4: Chọn Tài Khoản Quảng Cáo & Lưu Package';
            default: return '';
        }
    },

    renderWizardFooter() {
        return `
            ${this.state.wizardStep > 1 ? `<button class="btn btn-outline btn-sm" onclick="PackagesModule.prevStep()">← Quay lại</button>` : ''}
            <button class="btn btn-outline btn-sm" onclick="PackagesModule.closeWizard()">Hủy</button>
            ${this.state.wizardStep < 4
                ? `<button class="btn btn-primary btn-sm" onclick="PackagesModule.nextStep()">Tiếp theo →</button>`
                : `<button class="btn btn-success btn-sm" onclick="PackagesModule.savePackage()">✓ Lưu Package vào DB</button>`
            }
        `;
    },

    renderWizardStepContent() {
        const wd = this.state.wizardData;
        const ch = wd.channel;
        const apps = this.state.refs.applications.filter(a => a.channel === ch);
        const cams = this.state.refs.campaigns.filter(c => c.channel === ch);
        const ads = this.state.refs.ads.filter(a => a.channel === ch);
        const pages = this.state.refs.pages;
        const accs = this.state.refs.accounts.filter(a => a.channel === ch);
        const tactics = this.state.refs.tactics;

        if (this.state.wizardStep === 1) {
            if (!wd.appTemplateId && apps[0]) wd.appTemplateId = apps[0].id;
            return `
                <div class="form-group">
                    <label class="form-label required">Tên Package</label>
                    <input type="text" class="form-input" id="pkgInputName" value="${this.escapeHtml(wd.name)}" oninput="PackagesModule.state.wizardData.name = this.value">
                </div>
                <div class="form-row-2">
                    <div class="form-group">
                        <label class="form-label required">Kênh Triển Khai (Channel)</label>
                        <select class="form-select" id="pkgInputChannel" onchange="PackagesModule.onWizardChannelChange(this.value)">
                            <option value="Facebook" ${ch === 'Facebook' ? 'selected' : ''}>Facebook Ads</option>
                            <option value="Google Ads" ${ch === 'Google Ads' ? 'selected' : ''}>Google Ads (UAC)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label required">Application Template (${apps.length} mẫu)</label>
                        <select class="form-select" id="pkgInputApp" onchange="PackagesModule.state.wizardData.appTemplateId = this.value">
                            ${apps.map(a => `<option value="${this.escapeHtml(a.id)}" ${wd.appTemplateId === a.id ? 'selected' : ''}>${this.escapeHtml(a.name)} (${this.escapeHtml(a.productId)})</option>`).join('') || `<option value="">Chưa có App Template cho ${ch}</option>`}
                        </select>
                    </div>
                </div>
            `;
        }

        if (this.state.wizardStep === 2) {
            if (!wd.campaignTemplateId && cams[0]) wd.campaignTemplateId = cams[0].id;
            if (!wd.adTemplateId && ads[0]) wd.adTemplateId = ads[0].id;
            if (ch === 'Facebook' && !wd.pageTemplateId && pages[0]) wd.pageTemplateId = pages[0].id;

            return `
                <div class="form-group">
                    <label class="form-label required">Campaign Template (${cams.length} mẫu ${ch})</label>
                    <select class="form-select" id="pkgInputCam" onchange="PackagesModule.state.wizardData.campaignTemplateId = this.value">
                        ${cams.map(c => `<option value="${this.escapeHtml(c.id)}" ${wd.campaignTemplateId === c.id ? 'selected' : ''}>${this.escapeHtml(c.name)} (${c.adGroupVolume}G × ${c.creativeVolume}C · ${this.escapeHtml(c.budget)})</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label required">Ad Template (${ads.length} mẫu ${ch})</label>
                    <select class="form-select" id="pkgInputAd" onchange="PackagesModule.state.wizardData.adTemplateId = this.value">
                        ${ads.map(a => `<option value="${this.escapeHtml(a.id)}" ${wd.adTemplateId === a.id ? 'selected' : ''}>${this.escapeHtml(a.name)}</option>`).join('')}
                    </select>
                </div>
                ${ch === 'Facebook' ? `
                    <div class="form-group">
                        <label class="form-label required">Facebook Page Template</label>
                        <select class="form-select" id="pkgInputPage" onchange="PackagesModule.state.wizardData.pageTemplateId = this.value">
                            ${pages.map(p => `<option value="${this.escapeHtml(p.id)}" ${wd.pageTemplateId === p.id ? 'selected' : ''}>${this.escapeHtml(p.name)} (${this.escapeHtml(p.pageId)})</option>`).join('')}
                        </select>
                    </div>
                ` : `
                    <div style="background: var(--bg-surface-subtle); border:1px solid var(--border-color); padding:10px 12px; border-radius:var(--radius-md); font-size:12px; color:var(--text-secondary);">
                        ℹ️ Google Ads UAC không sử dụng Fanpage. Hệ thống tự động lấy tên & icon ứng dụng trực tiếp từ App Store / Google Play.
                    </div>
                `}
            `;
        }

        if (this.state.wizardStep === 3) {
            return `
                <div class="form-group">
                    <label class="form-label">Chọn Tactic Tối Ưu Tự Động (có thể chọn nhiều)</label>
                    <div style="display:flex; flex-direction:column; gap:8px; max-height:240px; overflow-y:auto;">
                        ${tactics.map(t => `
                            <label style="display:flex; align-items:center; justify-content:space-between; background:var(--bg-surface-subtle); border:1px solid var(--border-color); padding:10px 12px; border-radius:var(--radius-md); cursor:pointer;">
                                <div style="display:flex; align-items:center; gap:10px;">
                                    <input type="checkbox" ${wd.tacticIds.includes(t.id) ? 'checked' : ''} onchange="PackagesModule.toggleWizardTactic('${this.escapeHtml(t.id)}', this.checked)">
                                    <div>
                                        <div style="font-weight:700; font-size:12.5px;">⚡ ${this.escapeHtml(t.name)}</div>
                                        <div style="font-size:11px; color:var(--text-tertiary);">${this.escapeHtml(t.description)}</div>
                                    </div>
                                </div>
                                <span class="badge badge-info">${t.rulesCount || 0} rules</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        if (this.state.wizardStep === 4) {
            if (!wd.adAccountId && accs[0]) wd.adAccountId = accs[0].id;
            return `
                <div class="form-group">
                    <label class="form-label required">Chọn Tài Khoản Quảng Cáo Đích (${ch})</label>
                    <select class="form-select" id="pkgInputAccount" onchange="PackagesModule.state.wizardData.adAccountId = this.value">
                        ${accs.map(a => `<option value="${this.escapeHtml(a.id)}" ${wd.adAccountId === a.id ? 'selected' : ''}>${this.escapeHtml(a.id)} - ${this.escapeHtml(a.name)} (${a.hasToken ? 'Live Token' : 'Server Sandbox'} · ${this.escapeHtml(a.balance)})</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Mẫu Đặt Tên Chiến Dịch (Naming Template)</label>
                    <input type="text" class="form-input" value="${this.escapeHtml(wd.namingTemplate)}" oninput="PackagesModule.state.wizardData.namingTemplate = this.value" style="font-family:var(--font-mono); font-size:12px;">
                </div>
                <div style="background: var(--success-light); border: 1px solid var(--success-border); color: var(--success-text); padding: 12px; border-radius: var(--radius-md); font-size: 12px;">
                    <strong>Sẵn sàng lưu & kiểm tra chéo (Cross-Validation):</strong> Backend sẽ kiểm tra tính đồng nhất kênh, Fanpage (Facebook) hoặc giới hạn ký tự Headline/Description (Google UAC) trước khi lưu.
                </div>
            `;
        }
        return '';
    },

    updateWizardDom() {
        const title = document.getElementById('pkgWizardTitle');
        const sub = document.getElementById('pkgWizardSub');
        const body = document.getElementById('pkgWizardBody');
        const footer = document.getElementById('pkgWizardFooter');
        if (title) title.textContent = `Create New Package (Step ${this.state.wizardStep} of 4)`;
        if (sub) sub.textContent = this.getStepTitle();
        if (body) body.innerHTML = this.renderWizardStepContent();
        if (footer) footer.innerHTML = this.renderWizardFooter();
    },

    onWizardChannelChange(ch) {
        this.state.wizardData.channel = ch;
        this.state.wizardData.appTemplateId = '';
        this.state.wizardData.campaignTemplateId = '';
        this.state.wizardData.adTemplateId = '';
        this.state.wizardData.pageTemplateId = '';
        this.state.wizardData.adAccountId = '';
        this.updateWizardDom();
    },

    toggleWizardTactic(tacticId, checked) {
        const arr = this.state.wizardData.tacticIds;
        if (checked && !arr.includes(tacticId)) arr.push(tacticId);
        if (!checked) this.state.wizardData.tacticIds = arr.filter(x => x !== tacticId);
    },

    openWizard() {
        this.state.wizardStep = 1;
        this.updateWizardDom();
        const modal = document.getElementById('packageModalBackdrop');
        if (modal) modal.classList.add('open');
    },

    closeWizard() {
        const modal = document.getElementById('packageModalBackdrop');
        if (modal) modal.classList.remove('open');
    },

    nextStep() {
        if (this.state.wizardStep < 4) {
            this.state.wizardStep++;
            this.updateWizardDom();
        }
    },

    prevStep() {
        if (this.state.wizardStep > 1) {
            this.state.wizardStep--;
            this.updateWizardDom();
        }
    },

    async savePackage() {
        const wd = this.state.wizardData;
        try {
            if (window.AperoApi) {
                await window.AperoApi.createPackage({
                    name: wd.name,
                    channel: wd.channel,
                    appTemplateId: wd.appTemplateId,
                    campaignTemplateId: wd.campaignTemplateId,
                    adTemplateId: wd.adTemplateId,
                    pageTemplateId: wd.channel === 'Facebook' ? wd.pageTemplateId : null,
                    adAccountId: wd.adAccountId,
                    tacticIds: wd.tacticIds,
                    namingTemplate: wd.namingTemplate
                });
                App.showToast(`Đã lưu Package "${wd.name}" vào PostgreSQL!`, 'success');
                this.closeWizard();
                await this.loadData(true);
            }
        } catch (err) {
            App.showToast(`Validation Error: ${err.message}`, 'danger');
        }
    },

    deployPackageQuick(packageId) {
        if (window.CreativesModule) {
            window.CreativesModule.state.preselectedPackageIds = [packageId];
        }
        App.showToast('Chọn các Creatives cần chạy và bấm "Create Campaign" để xem Dry-Run Preview!', 'info');
        App.setRoute('creatives');
    },

    onSearch(q) {
        this.state.searchTerm = q;
        this.refreshDom();
    },

    onFilterChannel(ch) {
        this.state.filterChannel = ch;
        this.refreshDom();
    },

    onFilterStatus(st) {
        this.state.filterStatus = st;
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

window.PackagesModule = PackagesModule;
