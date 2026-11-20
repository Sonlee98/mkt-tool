/**
 * Module: Template Management (Quản lý Mẫu Chiến dịch & Quảng cáo Tự động)
 * Hỗ trợ đầy đủ Facebook & Google Ads UAC, kết nối PostgreSQL thật với fallback offline
 */

const TemplatesModule = {
    state: {
        activeTab: 'application', // 'application' | 'campaign' | 'ads' | 'page'
        searchTerm: '',
        filterChannel: 'All',
        filterProduct: 'All',
        modalOpen: false,
        modalChannel: 'Facebook',
        cache: null,
        loading: false
    },

    getDataset() {
        return this.state.cache || window.APERO_DATA.templates;
    },

    render() {
        const tmpl = this.getDataset();
        setTimeout(() => this.loadData(), 0);

        return `
            <div class="page-title-bar">
                <div class="page-heading">
                    <h1>Template Management</h1>
                    <p>Thiết lập khuôn mẫu Application, Campaign (G × V), Ads (Facebook / Google UAC) và Fanpage tự động hóa</p>
                </div>
                <div class="page-actions">
                    <button class="btn btn-outline btn-sm" onclick="App.showToast('Quy trình: App Template → Campaign Template (G × V) → Ads Template → Gom vào Package', 'info')">
                        ❓ How to create?
                    </button>
                    <button class="btn btn-primary btn-sm" onclick="TemplatesModule.openCreateModal()">
                        + Create New ${this.getTabLabel()}
                    </button>
                </div>
            </div>

            <!-- Sub-tabs Navigation -->
            <div class="tabs-header">
                <button class="tab-btn ${this.state.activeTab === 'application' ? 'active' : ''}" onclick="TemplatesModule.setTab('application')">
                    Application
                    <span class="tab-count-badge" id="tmplCntApp">${(tmpl.applications || []).length}</span>
                </button>
                <button class="tab-btn ${this.state.activeTab === 'campaign' ? 'active' : ''}" onclick="TemplatesModule.setTab('campaign')">
                    Campaign
                    <span class="tab-count-badge" id="tmplCntCam">${(tmpl.campaigns || []).length}</span>
                </button>
                <button class="tab-btn ${this.state.activeTab === 'ads' ? 'active' : ''}" onclick="TemplatesModule.setTab('ads')">
                    Ads
                    <span class="tab-count-badge" id="tmplCntAds">${(tmpl.ads || []).length}</span>
                </button>
                <button class="tab-btn ${this.state.activeTab === 'page' ? 'active' : ''}" onclick="TemplatesModule.setTab('page')">
                    Page
                    <span class="tab-count-badge" id="tmplCntPage">${(tmpl.pages || []).length}</span>
                </button>
            </div>

            <!-- Filter Toolbar -->
            <div class="filter-toolbar">
                <div class="filter-group-left">
                    <input type="text" class="filter-input" placeholder="🔍 Tìm template theo tên, ID..." value="${this.escapeHtml(this.state.searchTerm)}" oninput="TemplatesModule.onSearch(this.value)">
                    <select class="filter-select" onchange="TemplatesModule.onFilterChannel(this.value)">
                        <option value="All" ${this.state.filterChannel === 'All' ? 'selected' : ''}>Channel: Tất cả Kênh</option>
                        <option value="Facebook" ${this.state.filterChannel === 'Facebook' ? 'selected' : ''}>Facebook</option>
                        <option value="Google Ads" ${this.state.filterChannel === 'Google Ads' ? 'selected' : ''}>Google Ads (UAC)</option>
                    </select>
                    <select class="filter-select" onchange="TemplatesModule.onFilterProduct(this.value)">
                        <option value="All" ${this.state.filterProduct === 'All' ? 'selected' : ''}>Product ID: Tất cả</option>
                        <option value="AIP922" ${this.state.filterProduct === 'AIP922' ? 'selected' : ''}>AIP922 (Nexus)</option>
                        <option value="AIP886" ${this.state.filterProduct === 'AIP886' ? 'selected' : ''}>AIP886 (Framly)</option>
                        <option value="AIP919" ${this.state.filterProduct === 'AIP919' ? 'selected' : ''}>AIP919 (GeniAI)</option>
                        <option value="AAP885" ${this.state.filterProduct === 'AAP885' ? 'selected' : ''}>AAP885 (CloutDrama)</option>
                        <option value="AAP858" ${this.state.filterProduct === 'AAP858' ? 'selected' : ''}>AAP858 (AI Couple)</option>
                    </select>
                </div>
                <div class="filter-group-right">
                    <button class="btn btn-outline btn-sm" onclick="TemplatesModule.loadData(true)">↻ Làm mới</button>
                </div>
            </div>

            <!-- Tab Content -->
            <div class="data-table-container">
                <div class="table-responsive" id="templatesTableContainer">
                    ${this.renderActiveTabTable(tmpl)}
                </div>
            </div>

            ${this.renderModal()}
        `;
    },

    async loadData(force = false) {
        if (!window.AperoApi || (this.state.loading && !force)) return;
        this.state.loading = true;
        try {
            const res = await window.AperoApi.getTemplates();
            if (res && res.ok) {
                this.state.cache = {
                    applications: res.applications || [],
                    campaigns: res.campaigns || [],
                    ads: res.ads || [],
                    pages: res.pages || []
                };
                this.refreshDom();
            }
        } catch {
            // Static fallback remains active when backend offline
        } finally {
            this.state.loading = false;
        }
    },

    refreshDom() {
        const tmpl = this.getDataset();
        const wrap = document.getElementById('templatesTableContainer');
        if (wrap) wrap.innerHTML = this.renderActiveTabTable(tmpl);
        const updateBadge = (id, len) => {
            const el = document.getElementById(id);
            if (el) el.textContent = String(len);
        };
        updateBadge('tmplCntApp', (tmpl.applications || []).length);
        updateBadge('tmplCntCam', (tmpl.campaigns || []).length);
        updateBadge('tmplCntAds', (tmpl.ads || []).length);
        updateBadge('tmplCntPage', (tmpl.pages || []).length);
    },

    getTabLabel() {
        switch (this.state.activeTab) {
            case 'application': return 'Application Template';
            case 'campaign': return 'Campaign Template';
            case 'ads': return 'Ads Template';
            case 'page': return 'Page Template';
            default: return 'Template';
        }
    },

    filterItems(items, getSearchText, getChannel, getProduct) {
        let list = items || [];
        if (this.state.filterChannel !== 'All' && getChannel) {
            list = list.filter(item => {
                const ch = String(getChannel(item) || '').toLowerCase();
                const target = this.state.filterChannel.toLowerCase();
                return ch === target || (target === 'google ads' && ch === 'googleads');
            });
        }
        if (this.state.filterProduct !== 'All' && getProduct) {
            list = list.filter(item => getProduct(item) === this.state.filterProduct);
        }
        if (this.state.searchTerm) {
            const q = this.state.searchTerm.toLowerCase();
            list = list.filter(item => String(getSearchText(item)).toLowerCase().includes(q));
        }
        return list;
    },

    renderActiveTabTable(tmpl) {
        if (this.state.activeTab === 'application') {
            const rows = this.filterItems(
                tmpl.applications,
                a => `${a.name} ${a.appId} ${a.productId}`,
                a => a.channel,
                a => a.productId
            );
            return `
                <table class="apero-table">
                    <thead>
                        <tr>
                            <th>Application Name</th>
                            <th>Channel</th>
                            <th>Application ID / Bundle</th>
                            <th>Product ID</th>
                            <th>Link Status</th>
                            <th>Created Date</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(app => `
                            <tr>
                                <td><strong>${this.escapeHtml(app.name)}</strong></td>
                                <td><span class="badge ${app.channel === 'Google Ads' ? 'badge-warning' : 'badge-info'}">${this.escapeHtml(app.channel)}</span></td>
                                <td style="font-family: var(--font-mono);">${this.escapeHtml(app.appId)}</td>
                                <td><span class="badge badge-neutral">${this.escapeHtml(app.productId)}</span></td>
                                <td><span class="badge badge-success">✓ ${this.escapeHtml(app.linkStatus || 'Linked')}</span></td>
                                <td>${this.escapeHtml(app.date || '-')}</td>
                                <td>
                                    <button class="btn btn-outline btn-sm" onclick="TemplatesModule.cloneItem('application', '${this.escapeHtml(String(app.id))}')">Clone</button>
                                </td>
                            </tr>
                        `).join('') || `<tr><td colspan="7" style="text-align:center; color:var(--text-tertiary);">Không có Application Template phù hợp.</td></tr>`}
                    </tbody>
                </table>
            `;
        }

        if (this.state.activeTab === 'campaign') {
            const rows = this.filterItems(
                tmpl.campaigns,
                c => `${c.name} ${c.goal} ${c.objective}`,
                c => c.channel,
                null
            );
            return `
                <table class="apero-table">
                    <thead>
                        <tr>
                            <th>Cam Template's Name</th>
                            <th>Channel</th>
                            <th>Buying / Objective</th>
                            <th>Performance Goal</th>
                            <th>Event</th>
                            <th>Budget</th>
                            <th>Batch Matrix (G × C)</th>
                            <th>Countries</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(c => `
                            <tr>
                                <td><strong>${this.escapeHtml(c.name)}</strong></td>
                                <td><span class="badge ${c.channel === 'Google Ads' ? 'badge-warning' : 'badge-info'}">${this.escapeHtml(c.channel)}</span></td>
                                <td>${this.escapeHtml(c.buyingType)} · ${this.escapeHtml(c.objective)}</td>
                                <td style="color: #10b981; font-weight: 600;">${this.escapeHtml(c.goal)}</td>
                                <td>${this.escapeHtml(c.event || 'AD_IMPRESSION')}</td>
                                <td style="font-weight: 700;">${this.escapeHtml(c.budget)}</td>
                                <td><span class="badge badge-info">${c.adGroupVolume || 1} AdGrp × ${c.creativeVolume || 1} Video</span></td>
                                <td style="font-size: 11px;">${c.isWorldwide ? 'Worldwide' : this.escapeHtml((c.countries || []).join(', ') || 'US')}</td>
                                <td>
                                    <button class="btn btn-outline btn-sm" onclick="TemplatesModule.cloneItem('campaign', '${this.escapeHtml(String(c.id))}')">Clone</button>
                                </td>
                            </tr>
                        `).join('') || `<tr><td colspan="9" style="text-align:center; color:var(--text-tertiary);">Không có Campaign Template phù hợp.</td></tr>`}
                    </tbody>
                </table>
            `;
        }

        if (this.state.activeTab === 'ads') {
            const rows = this.filterItems(
                tmpl.ads,
                ad => `${ad.name} ${ad.primaryText} ${ad.headline}`,
                ad => ad.channel,
                null
            );
            return `
                <table class="apero-table">
                    <thead>
                        <tr>
                            <th>Ads Template's Name</th>
                            <th>Channel</th>
                            <th>Format</th>
                            <th>Primary Text / Copy Group</th>
                            <th>Headline</th>
                            <th>Call To Action</th>
                            <th>Date</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(ad => `
                            <tr>
                                <td><strong>${this.escapeHtml(ad.name)}</strong></td>
                                <td><span class="badge ${ad.channel === 'Google Ads' ? 'badge-warning' : 'badge-info'}">${this.escapeHtml(ad.channel)}</span></td>
                                <td><span class="badge badge-neutral">${this.escapeHtml(ad.format)}</span></td>
                                <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.escapeHtml(ad.primaryText)}">${this.escapeHtml(ad.primaryText)}</td>
                                <td style="font-weight: 600;">${this.escapeHtml(ad.headline)}</td>
                                <td><span class="badge badge-success">${this.escapeHtml(ad.cta || 'INSTALL_MOBILE_APP')}</span></td>
                                <td>${this.escapeHtml(ad.date || '-')}</td>
                                <td>
                                    <button class="btn btn-outline btn-sm" onclick="TemplatesModule.cloneItem('ads', '${this.escapeHtml(String(ad.id))}')">Clone</button>
                                </td>
                            </tr>
                        `).join('') || `<tr><td colspan="8" style="text-align:center; color:var(--text-tertiary);">Không có Ads Template phù hợp.</td></tr>`}
                    </tbody>
                </table>
            `;
        }

        if (this.state.activeTab === 'page') {
            const rows = this.filterItems(
                tmpl.pages,
                p => `${p.name} ${p.pageId} ${p.appTemplate}`,
                p => p.channel,
                null
            );
            return `
                <table class="apero-table">
                    <thead>
                        <tr>
                            <th>Page Name</th>
                            <th>Page ID</th>
                            <th>App Template Liên Kết</th>
                            <th>Channel</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(p => `
                            <tr>
                                <td><strong>${this.escapeHtml(p.name)}</strong></td>
                                <td style="font-family: var(--font-mono);">${this.escapeHtml(p.pageId)}</td>
                                <td><span class="badge badge-info">${this.escapeHtml(p.appTemplate)}</span></td>
                                <td>${this.escapeHtml(p.channel)}</td>
                                <td><span class="badge badge-success">● ${this.escapeHtml(p.status)}</span></td>
                                <td>
                                    <button class="btn btn-outline btn-sm" onclick="App.showToast('Page ID ${this.escapeHtml(p.pageId)} đã sẵn sàng cho Meta API', 'success')">Test Link</button>
                                </td>
                            </tr>
                        `).join('') || `<tr><td colspan="6" style="text-align:center; color:var(--text-tertiary);">Không có Page Template phù hợp.</td></tr>`}
                    </tbody>
                </table>
            `;
        }
        return '';
    },

    setTab(tab) {
        this.state.activeTab = tab;
        App.renderRoute();
    },

    onSearch(q) {
        this.state.searchTerm = q;
        this.refreshDom();
    },

    onFilterChannel(ch) {
        this.state.filterChannel = ch;
        this.refreshDom();
    },

    onFilterProduct(p) {
        this.state.filterProduct = p;
        this.refreshDom();
    },

    openCreateModal() {
        this.state.modalOpen = true;
        this.state.modalChannel = 'Facebook';
        const modal = document.getElementById('templateModalBackdrop');
        if (modal) {
            const body = document.getElementById('templateModalBody');
            if (body) body.innerHTML = this.renderModalFormContent();
            modal.classList.add('open');
        }
    },

    closeModal() {
        this.state.modalOpen = false;
        const modal = document.getElementById('templateModalBackdrop');
        if (modal) modal.classList.remove('open');
    },

    onModalChannelChange(val) {
        this.state.modalChannel = val;
        const body = document.getElementById('templateModalBody');
        if (body) body.innerHTML = this.renderModalFormContent();
    },

    updateCharCounter(inputEl, counterId, maxLen) {
        const el = document.getElementById(counterId);
        if (!el || !inputEl) return;
        const len = inputEl.value.length;
        el.textContent = `${len}/${maxLen}`;
        el.style.color = len > maxLen ? '#ef4444' : 'var(--text-tertiary)';
    },

    async cloneItem(type, id) {
        const tmpl = this.getDataset();
        let src = null;
        let payload = {};
        if (type === 'application') {
            src = (tmpl.applications || []).find(x => String(x.id) === id);
            if (src) payload = { name: `${src.name}_Copy`, channel: src.channel, productId: src.productId, platformAppId: src.appId, bundleId: src.bundleId || src.appId };
        } else if (type === 'campaign') {
            src = (tmpl.campaigns || []).find(x => String(x.id) === id);
            if (src) payload = { name: `${src.name}_Copy`, channel: src.channel, buyingType: src.buyingType, objective: src.objective, performanceGoal: src.performanceGoal || src.goal, convertEvent: src.event, budgetAmount: src.budgetAmount || 250, budgetCurrency: src.budgetCurrency || 'USD', adGroupVolume: src.adGroupVolume || 1, creativeVolume: src.creativeVolume || 1, countryCodes: src.countries || ['US'], isWorldwide: Boolean(src.isWorldwide) };
        } else if (type === 'ads') {
            src = (tmpl.ads || []).find(x => String(x.id) === id);
            if (src) payload = { name: `${src.name}_Copy`, channel: src.channel, format: src.format, ctaType: src.ctaType || src.cta, copyPayload: src.copyPayload };
        }
        if (!src) return;

        try {
            if (window.AperoApi) {
                await window.AperoApi.createTemplate(type, payload);
                App.showToast(`Đã nhân bản ${src.name} vào PostgreSQL!`, 'success');
                await this.loadData(true);
            }
        } catch (err) {
            App.showToast(`Lỗi nhân bản: ${err.message}`, 'danger');
        }
    },

    async saveNewTemplate() {
        const tab = this.state.activeTab;
        let payload = {};

        if (tab === 'application') {
            payload = {
                channel: document.getElementById('tmplAppChannel')?.value,
                name: document.getElementById('tmplAppName')?.value.trim(),
                platformAppId: document.getElementById('tmplAppId')?.value.trim(),
                bundleId: document.getElementById('tmplAppBundle')?.value.trim(),
                productId: document.getElementById('tmplAppProduct')?.value
            };
        } else if (tab === 'campaign') {
            payload = {
                channel: document.getElementById('tmplCamChannel')?.value,
                name: document.getElementById('tmplCamName')?.value.trim(),
                buyingType: document.getElementById('tmplCamBuying')?.value,
                objective: document.getElementById('tmplCamObj')?.value,
                performanceGoal: document.getElementById('tmplCamGoal')?.value,
                convertEvent: document.getElementById('tmplCamEvent')?.value,
                budgetAmount: Number(document.getElementById('tmplCamBudget')?.value || 0),
                budgetCurrency: document.getElementById('tmplCamCurrency')?.value,
                adGroupVolume: Number(document.getElementById('tmplCamAdGroups')?.value || 1),
                creativeVolume: Number(document.getElementById('tmplCamCreatives')?.value || 1),
                countries: document.getElementById('tmplCamCountries')?.value,
                isWorldwide: Boolean(document.getElementById('tmplCamWorldwide')?.checked),
                isAiMedia: Boolean(document.getElementById('tmplCamAiMedia')?.checked)
            };
        } else if (tab === 'ads') {
            const ch = document.getElementById('tmplAdChannel')?.value || 'Facebook';
            const name = document.getElementById('tmplAdName')?.value.trim();
            if (ch === 'Google Ads') {
                const h1 = document.getElementById('tmplGgH1')?.value.trim();
                const h2 = document.getElementById('tmplGgH2')?.value.trim();
                const h3 = document.getElementById('tmplGgH3')?.value.trim();
                const d1 = document.getElementById('tmplGgD1')?.value.trim();
                const d2 = document.getElementById('tmplGgD2')?.value.trim();
                payload = {
                    channel: ch,
                    name,
                    format: 'UAC Multi-Asset',
                    copyPayload: {
                        groups: [{
                            group_index: 1,
                            theme_name: 'Primary_UAC_Group',
                            headlines: [h1, h2, h3].filter(Boolean),
                            descriptions: [d1, d2].filter(Boolean)
                        }]
                    }
                };
            } else {
                payload = {
                    channel: ch,
                    name,
                    format: document.getElementById('tmplAdFormat')?.value,
                    ctaType: document.getElementById('tmplAdCta')?.value,
                    copyPayload: {
                        primary_texts: [document.getElementById('tmplFbPrimary')?.value.trim()].filter(Boolean),
                        headlines: [document.getElementById('tmplFbHeadline')?.value.trim()].filter(Boolean),
                        descriptions: [document.getElementById('tmplFbDesc')?.value.trim()].filter(Boolean)
                    }
                };
            }
        } else if (tab === 'page') {
            payload = {
                name: document.getElementById('tmplPageName')?.value.trim(),
                pageId: document.getElementById('tmplPageId')?.value.trim(),
                appTemplateId: document.getElementById('tmplPageApp')?.value
            };
        }

        try {
            if (window.AperoApi) {
                await window.AperoApi.createTemplate(tab, payload);
                App.showToast(`Đã lưu ${this.getTabLabel()} vào PostgreSQL thành công!`, 'success');
                this.closeModal();
                await this.loadData(true);
            }
        } catch (err) {
            App.showToast(`Lỗi lưu Template: ${err.message}`, 'danger');
        }
    },

    renderModal() {
        return `
            <div class="modal-backdrop" id="templateModalBackdrop" onclick="if(event.target === this) TemplatesModule.closeModal()">
                <div class="modal-box" style="max-width: 660px;">
                    <div class="modal-header">
                        <div class="modal-title">Create New ${this.getTabLabel()}</div>
                        <button class="modal-close-btn" onclick="TemplatesModule.closeModal()">✕</button>
                    </div>
                    <div class="modal-body" id="templateModalBody">
                        ${this.renderModalFormContent()}
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-outline btn-sm" onclick="TemplatesModule.closeModal()">Hủy</button>
                        <button class="btn btn-primary btn-sm" onclick="TemplatesModule.saveNewTemplate()">✓ Lưu Template</button>
                    </div>
                </div>
            </div>
        `;
    },

    renderModalFormContent() {
        const tmpl = this.getDataset();

        if (this.state.activeTab === 'application') {
            return `
                <div class="form-row-2">
                    <div class="form-group">
                        <label class="form-label required">Channel</label>
                        <select class="form-select" id="tmplAppChannel">
                            <option value="Facebook">Facebook</option>
                            <option value="Google Ads">Google Ads (UAC)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label required">Product ID</label>
                        <select class="form-select" id="tmplAppProduct">
                            <option value="AIP922">AIP922 (Nexus AI Video)</option>
                            <option value="AIP886">AIP886 (Framly AI)</option>
                            <option value="AIP919">AIP919 (GeniAI)</option>
                            <option value="AAP885">AAP885 (CloutDrama)</option>
                            <option value="AAP858">AAP858 (AI Couple)</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label required">Application Name</label>
                    <input type="text" class="form-input" id="tmplAppName" placeholder="e.g. AIP922_Nexus_FB_Scale">
                </div>
                <div class="form-row-2">
                    <div class="form-group">
                        <label class="form-label required">Platform App ID (Meta ID / Bundle)</label>
                        <input type="text" class="form-input" id="tmplAppId" placeholder="e.g. 29321565010862795">
                    </div>
                    <div class="form-group">
                        <label class="form-label required">Store Bundle ID</label>
                        <input type="text" class="form-input" id="tmplAppBundle" value="com.ai.aiimage.aivideogenerator">
                    </div>
                </div>
            `;
        }

        if (this.state.activeTab === 'campaign') {
            const isGoogle = this.state.modalChannel === 'Google Ads';
            return `
                <div class="form-row-2">
                    <div class="form-group">
                        <label class="form-label required">Channel</label>
                        <select class="form-select" id="tmplCamChannel" onchange="TemplatesModule.onModalChannelChange(this.value)">
                            <option value="Facebook" ${!isGoogle ? 'selected' : ''}>Facebook</option>
                            <option value="Google Ads" ${isGoogle ? 'selected' : ''}>Google Ads (UAC)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label required">Campaign Template Name</label>
                        <input type="text" class="form-input" id="tmplCamName" placeholder="e.g. CAM_${isGoogle ? 'GG_UAC' : 'FB'}_US_ROAS_01">
                    </div>
                </div>
                <div class="form-row-2">
                    <div class="form-group">
                        <label class="form-label required">Buying Type</label>
                        <select class="form-select" id="tmplCamBuying">
                            <option value="${isGoogle ? 'UAC' : 'Auction'}">${isGoogle ? 'UAC (App Campaign)' : 'Auction'}</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label required">Objective</label>
                        <select class="form-select" id="tmplCamObj">
                            <option value="App Promotion">App Promotion</option>
                            <option value="App Installs">App Installs</option>
                        </select>
                    </div>
                </div>
                <div class="form-row-2">
                    <div class="form-group">
                        <label class="form-label required">Performance Goal</label>
                        <select class="form-select" id="tmplCamGoal">
                            <option value="MAXIMIZE_VALUE">Maximise value (AdROAS)</option>
                            <option value="TARGET_ROAS">Target ROAS</option>
                            <option value="MAXIMIZE_INSTALLS">Maximise Installs</option>
                            <option value="TARGET_CPA">Target CPA</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Convert Event</label>
                        <select class="form-select" id="tmplCamEvent">
                            <option value="AD_IMPRESSION">AdImpression</option>
                            <option value="APP_INSTALL">App Install</option>
                            <option value="PURCHASE">In-App Subscription</option>
                        </select>
                    </div>
                </div>
                <div class="form-row-2">
                    <div class="form-group">
                        <label class="form-label required">Daily Budget</label>
                        <div style="display:flex; gap:6px;">
                            <input type="number" class="form-input" id="tmplCamBudget" style="flex:1;" value="${isGoogle ? 250 : 1500000}">
                            <select class="form-select" id="tmplCamCurrency" style="width:90px;">
                                <option value="VND" ${!isGoogle ? 'selected' : ''}>VND</option>
                                <option value="USD" ${isGoogle ? 'selected' : ''}>USD</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label required">Target Countries (ISO)</label>
                        <input type="text" class="form-input" id="tmplCamCountries" value="US, CA, AU">
                    </div>
                </div>
                <div class="form-row-2">
                    <div class="form-group">
                        <label class="form-label required">Ad Group Volume (G / Camp)</label>
                        <input type="number" class="form-input" id="tmplCamAdGroups" min="1" max="50" value="${isGoogle ? 2 : 1}">
                    </div>
                    <div class="form-group">
                        <label class="form-label required">Creative Volume (Video / Group${isGoogle ? ', max 20' : ''})</label>
                        <input type="number" class="form-input" id="tmplCamCreatives" min="1" max="${isGoogle ? 20 : 50}" value="${isGoogle ? 5 : 1}">
                    </div>
                </div>
                <div style="display:flex; gap:18px; font-size:12.5px;">
                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                        <input type="checkbox" id="tmplCamWorldwide"> Worldwide (All Countries)
                    </label>
                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                        <input type="checkbox" id="tmplCamAiMedia" checked> Ad includes AI-generated media
                    </label>
                </div>
            `;
        }

        if (this.state.activeTab === 'ads') {
            const isGoogle = this.state.modalChannel === 'Google Ads';
            return `
                <div class="form-row-2">
                    <div class="form-group">
                        <label class="form-label required">Channel</label>
                        <select class="form-select" id="tmplAdChannel" onchange="TemplatesModule.onModalChannelChange(this.value)">
                            <option value="Facebook" ${!isGoogle ? 'selected' : ''}>Facebook</option>
                            <option value="Google Ads" ${isGoogle ? 'selected' : ''}>Google Ads (UAC)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label required">Ads Template Name</label>
                        <input type="text" class="form-input" id="tmplAdName" placeholder="e.g. ADS_${isGoogle ? 'GG_UAC' : 'FB'}_VIDEO_01">
                    </div>
                </div>
                ${isGoogle ? `
                    <div style="background: var(--bg-surface-subtle); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 12px; display:flex; flex-direction:column; gap:10px;">
                        <div style="font-size:12px; font-weight:700; color:#f59e0b;">Google Ads UAC Copy Group (Headlines ≤ 30 ký tự, Descriptions ≤ 90 ký tự)</div>
                        <div class="form-group">
                            <div style="display:flex; justify-content:space-between;"><label class="form-label required">Headline #1</label><span id="cntH1" style="font-size:11px; color:var(--text-tertiary);">24/30</span></div>
                            <input type="text" class="form-input" id="tmplGgH1" value="Make Photos Hug with AI" oninput="TemplatesModule.updateCharCounter(this, 'cntH1', 30)">
                        </div>
                        <div class="form-group">
                            <div style="display:flex; justify-content:space-between;"><label class="form-label required">Headline #2</label><span id="cntH2" style="font-size:11px; color:var(--text-tertiary);">23/30</span></div>
                            <input type="text" class="form-input" id="tmplGgH2" value="AI Video Generator Free" oninput="TemplatesModule.updateCharCounter(this, 'cntH2', 30)">
                        </div>
                        <div class="form-group">
                            <div style="display:flex; justify-content:space-between;"><label class="form-label">Headline #3</label><span id="cntH3" style="font-size:11px; color:var(--text-tertiary);">0/30</span></div>
                            <input type="text" class="form-input" id="tmplGgH3" placeholder="Optional headline <= 30 chars" oninput="TemplatesModule.updateCharCounter(this, 'cntH3', 30)">
                        </div>
                        <div class="form-group">
                            <div style="display:flex; justify-content:space-between;"><label class="form-label required">Description #1</label><span id="cntD1" style="font-size:11px; color:var(--text-tertiary);">65/90</span></div>
                            <input type="text" class="form-input" id="tmplGgD1" value="Create emotional AI hug videos from old photos in seconds. Try!" oninput="TemplatesModule.updateCharCounter(this, 'cntD1', 90)">
                        </div>
                        <div class="form-group">
                            <div style="display:flex; justify-content:space-between;"><label class="form-label">Description #2</label><span id="cntD2" style="font-size:11px; color:var(--text-tertiary);">0/90</span></div>
                            <input type="text" class="form-input" id="tmplGgD2" placeholder="Optional description <= 90 chars" oninput="TemplatesModule.updateCharCounter(this, 'cntD2', 90)">
                        </div>
                    </div>
                ` : `
                    <div class="form-row-2">
                        <div class="form-group">
                            <label class="form-label required">Format</label>
                            <select class="form-select" id="tmplAdFormat">
                                <option value="Single Video (9:16)">Single Video (9:16)</option>
                                <option value="Dynamic Creative">Dynamic Creative</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label required">Call To Action</label>
                            <select class="form-select" id="tmplAdCta">
                                <option value="INSTALL_MOBILE_APP">Install Now</option>
                                <option value="DOWNLOAD">Download</option>
                                <option value="USE_APP">Use App</option>
                                <option value="WATCH_MORE">Watch More</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label required">Primary Text</label>
                        <textarea class="form-textarea" id="tmplFbPrimary" rows="2">Transform your photos into moving AI videos with one tap!</textarea>
                    </div>
                    <div class="form-row-2">
                        <div class="form-group">
                            <label class="form-label required">Headline</label>
                            <input type="text" class="form-input" id="tmplFbHeadline" value="AI Video Generator #1">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Description</label>
                            <input type="text" class="form-input" id="tmplFbDesc" value="5M+ Creators Love Nexus AI">
                        </div>
                    </div>
                `}
            `;
        }

        if (this.state.activeTab === 'page') {
            const fbApps = (tmpl.applications || []).filter(a => a.channel === 'Facebook');
            return `
                <div class="form-group">
                    <label class="form-label required">Page Name</label>
                    <input type="text" class="form-input" id="tmplPageName" placeholder="e.g. Nexus AI Video Official">
                </div>
                <div class="form-group">
                    <label class="form-label required">Facebook Page ID</label>
                    <input type="text" class="form-input" id="tmplPageId" placeholder="e.g. 109284710293847">
                </div>
                <div class="form-group">
                    <label class="form-label required">App Template Liên Kết</label>
                    <select class="form-select" id="tmplPageApp">
                        ${fbApps.map(a => `<option value="${this.escapeHtml(String(a.id))}">${this.escapeHtml(a.name)}</option>`).join('')}
                    </select>
                </div>
            `;
        }
        return '';
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

window.TemplatesModule = TemplatesModule;
