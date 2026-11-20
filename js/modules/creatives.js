/**
 * Module: Creative Hub / Creative Management & Bulk Campaign Launcher
 * Upload video thật, AI policy check, chọn nhiều creatives, Dry-run Preview & Live Saga Monitor qua SSE
 */

const CreativesModule = {
    state: {
        selectedIds: [],
        preselectedPackageIds: [],
        selectedPackageIds: [],
        filterTikTok: 'All',
        filterMeta: 'All',
        filterAngle: 'All',
        filterProduct: 'All',
        searchTerm: '',
        activeVideo: null,
        cache: null,
        summaryCache: null,
        packagesCache: [],
        batchesCache: [],
        previewResult: null,
        activeBatch: null,
        activeBatchJobs: [],
        launchModalTab: 'preview', // 'preview' | 'monitor' | 'history'
        loading: false,
        sseBound: false
    },

    getCreativesData() {
        if (this.state.cache && this.state.summaryCache) {
            return { summary: this.state.summaryCache, items: this.state.cache };
        }
        return window.PANDAWIND_DATA.creatives;
    },

    bindSseEvents() {
        if (this.state.sseBound || !window.PandaWindApi) return;
        this.state.sseBound = true;

        window.PandaWindApi.on('bulk_job_updated', (job) => {
            if (!this.state.activeBatch || job.batchId !== this.state.activeBatch.id) return;
            const idx = this.state.activeBatchJobs.findIndex(j => j.id === job.id);
            if (idx >= 0) {
                this.state.activeBatchJobs[idx] = Object.assign({}, this.state.activeBatchJobs[idx], job);
            } else {
                this.state.activeBatchJobs.push(job);
            }
            const succeeded = this.state.activeBatchJobs.filter(j => j.status === 'SUCCEEDED').length;
            const failed = this.state.activeBatchJobs.filter(j => j.status === 'FAILED').length;
            this.state.activeBatch.succeededJobs = succeeded;
            this.state.activeBatch.failedJobs = failed;
            this.refreshLaunchModalBody();
        });

        window.PandaWindApi.on('bulk_batch_completed', (batchInfo) => {
            if (this.state.activeBatch && batchInfo.batchId === this.state.activeBatch.id) {
                this.state.activeBatch.status = batchInfo.status;
                this.state.activeBatch.succeededJobs = batchInfo.succeededJobs;
                this.state.activeBatch.failedJobs = batchInfo.failedJobs;
                this.refreshLaunchModalBody();
                App.showToast(
                    `Batch ${batchInfo.batchId} hoàn tất: ${batchInfo.succeededJobs}/${batchInfo.totalJobs} thành công!`,
                    batchInfo.failedJobs > 0 ? 'warning' : 'success'
                );
            }
            void this.loadData(true);
        });
    },

    getFilteredItems(allItems) {
        let items = allItems || [];
        if (this.state.filterTikTok !== 'All') {
            items = items.filter(i => i.tiktokPolicy === this.state.filterTikTok);
        }
        if (this.state.filterMeta !== 'All') {
            items = items.filter(i => i.metaPolicy === this.state.filterMeta);
        }
        if (this.state.filterAngle !== 'All') {
            items = items.filter(i => i.angle === this.state.filterAngle);
        }
        if (this.state.filterProduct !== 'All') {
            items = items.filter(i => i.product === this.state.filterProduct);
        }
        if (this.state.searchTerm) {
            const q = this.state.searchTerm.toLowerCase();
            items = items.filter(i => `${i.title} ${i.angle} ${i.product}`.toLowerCase().includes(q));
        }
        return items;
    },

    render() {
        this.bindSseEvents();
        const hub = this.getCreativesData();
        const s = hub.summary;
        const items = this.getFilteredItems(hub.items);
        const isAllSelected = items.length > 0 && items.every(i => this.state.selectedIds.includes(i.id));

        setTimeout(() => this.loadData(), 0);

        return `
            <div class="page-title-bar">
                <div class="page-heading">
                    <h1>Creative Management (Creative Hub)</h1>
                    <p>Upload video thật, kiểm duyệt AI TikTok & Meta, và khởi chạy chiến dịch hàng loạt đa kênh (${s.totalCreatives.toLocaleString()} creatives)</p>
                </div>
                <div class="page-actions">
                    <button class="btn btn-outline btn-sm" onclick="CreativesModule.openHistoryModal()">
                        📜 Lịch sử Batch
                    </button>
                    <button class="btn btn-outline btn-sm" onclick="CreativesModule.toggleSelectAll()">
                        ${isAllSelected ? 'Deselect All' : 'Select All (' + items.length + ')'}
                    </button>
                    <button class="btn btn-outline btn-sm" onclick="CreativesModule.openUploadModal()">
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                        Upload Creatives
                    </button>
                    <button class="btn btn-primary btn-sm" onclick="CreativesModule.openBulkLaunchModal()">
                        🚀 Create Campaign (${this.state.selectedIds.length})
                    </button>
                </div>
            </div>

            <!-- Hub Top Metrics Banner -->
            <div class="stats-grid" id="creativesSummaryGrid">
                ${this.renderSummaryCards(s)}
            </div>

            <!-- Filter Toolbar -->
            <div class="filter-toolbar">
                <div class="filter-group-left">
                    <input type="text" class="filter-input" placeholder="🔍 Tìm creative, angle code, tên file..." value="${this.escapeHtml(this.state.searchTerm)}" oninput="CreativesModule.onSearch(this.value)">
                    
                    <select class="filter-select" onchange="CreativesModule.filterTikTokPolicy(this.value)">
                        <option value="All" ${this.state.filterTikTok === 'All' ? 'selected' : ''}>TikTok Policy: Tất cả</option>
                        <option value="Passed" ${this.state.filterTikTok === 'Passed' ? 'selected' : ''}>Passed (Hợp lệ)</option>
                        <option value="Check failed" ${this.state.filterTikTok === 'Check failed' ? 'selected' : ''}>Check failed (Lỗi)</option>
                    </select>

                    <select class="filter-select" onchange="CreativesModule.filterMetaPolicy(this.value)">
                        <option value="All" ${this.state.filterMeta === 'All' ? 'selected' : ''}>Meta Policy: Tất cả</option>
                        <option value="Approved" ${this.state.filterMeta === 'Approved' ? 'selected' : ''}>Approved (Đã duyệt)</option>
                        <option value="Review" ${this.state.filterMeta === 'Review' ? 'selected' : ''}>Review (Đang duyệt AI)</option>
                        <option value="Flagged" ${this.state.filterMeta === 'Flagged' ? 'selected' : ''}>Flagged (Bị gắn cờ)</option>
                    </select>

                    <select class="filter-select" onchange="CreativesModule.filterAngleCode(this.value)">
                        <option value="All" ${this.state.filterAngle === 'All' ? 'selected' : ''}>Angle Codes: Tất cả</option>
                        <option value="Transformation">Transformation</option>
                        <option value="AI Hug">AI Hug</option>
                        <option value="Face Dance">Face Dance</option>
                        <option value="Anime Morph">Anime Morph</option>
                        <option value="Short Drama">Short Drama</option>
                        <option value="Photo Restore">Photo Restore</option>
                    </select>

                    <select class="filter-select" onchange="CreativesModule.filterByProduct(this.value)">
                        <option value="All">Product IDs: Tất cả</option>
                        <option value="AIP922">AIP922 (Nexus)</option>
                        <option value="AIP886">AIP886 (Framly)</option>
                        <option value="AIP919">AIP919 (GeniAI)</option>
                        <option value="AAP885">AAP885 (CloutDrama)</option>
                        <option value="AAP858">AAP858 (AI Couple)</option>
                    </select>
                </div>
                <div class="filter-group-right">
                    <button class="btn btn-outline btn-sm" onclick="CreativesModule.batchRecheck()">
                        🔄 Re-check AI Policy
                    </button>
                </div>
            </div>

            <!-- Batch Actions Bar -->
            ${this.state.selectedIds.length > 0 ? `
                <div style="background: var(--primary-light); border: 1px solid var(--primary-border); border-radius: var(--radius-md); padding: 10px 16px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between;">
                    <div style="font-size: 13px; font-weight: 600; color: var(--primary);">
                        Đã chọn <strong>${this.state.selectedIds.length}</strong> creative(s)
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-outline btn-sm" onclick="CreativesModule.batchRecheck()">🛡️ Kiểm duyệt lại AI</button>
                        <button class="btn btn-primary btn-sm" onclick="CreativesModule.openBulkLaunchModal()">🚀 Tạo Chiến Dịch Hàng Loạt</button>
                    </div>
                </div>
            ` : ''}

            <!-- Creative Cards Grid -->
            <div class="creative-grid" id="creativeCardsGrid">
                ${this.renderCardsHtml(items)}
            </div>

            ${this.renderVideoPlayerModal()}
            ${this.renderUploadModal()}
            ${this.renderBulkLaunchModal()}
        `;
    },

    renderSummaryCards(s) {
        return `
            <div class="stat-card">
                <div class="stat-card-title">Total Creatives</div>
                <div class="stat-card-value">${Number(s.totalCreatives || 0).toLocaleString()}</div>
                <div class="stat-card-footer"><span class="badge badge-info">PostgreSQL Hub</span></div>
            </div>
            <div class="stat-card">
                <div class="stat-card-title">Total Campaigns Run</div>
                <div class="stat-card-value">${Number(s.totalCampaigns || 0).toLocaleString()}</div>
                <div class="stat-card-footer"><span style="color: var(--text-tertiary);">Đã triển khai đa kênh</span></div>
            </div>
            <div class="stat-card">
                <div class="stat-card-title">Chiến dịch Thành công</div>
                <div class="stat-card-value" style="color: #10b981;">${Number(s.successfulCampaigns || 0).toLocaleString()}</div>
                <div class="stat-card-footer"><span class="delta-badge positive">${this.escapeHtml(s.approvalRate || '100%')}</span></div>
            </div>
            <div class="stat-card">
                <div class="stat-card-title">Chiến dịch Thất bại / Lỗi</div>
                <div class="stat-card-value" style="color: #ef4444;">${Number(s.failedCampaigns || 0).toLocaleString()}</div>
                <div class="stat-card-footer"><span style="color: var(--text-tertiary);">Theo dõi & Retry từng job</span></div>
            </div>
        `;
    },

    renderCardsHtml(items) {
        if (!items || items.length === 0) {
            return `<div style="grid-column: 1 / -1; text-align:center; padding:40px; color:var(--text-tertiary);">Không tìm thấy Creative phù hợp bộ lọc.</div>`;
        }
        return items.map(cr => {
            const bg = cr.posterGradient || 'linear-gradient(135deg, #2563eb 0%, #0e7490 100%)';
            const checked = this.state.selectedIds.includes(cr.id);
            return `
                <div class="creative-card ${checked ? 'selected' : ''}" style="${checked ? 'border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-light);' : ''}">
                    <div class="creative-thumbnail-wrapper" onclick="CreativesModule.openVideoPlayer('${this.escapeHtml(cr.id)}')">
                        <div class="creative-poster-bg" style="background: ${bg};"></div>
                        <div class="creative-badge-top-left">
                            <span class="badge" style="background: rgba(0,0,0,0.65); color: white; font-size: 10px;">${this.escapeHtml(cr.type)}</span>
                            <span class="badge" style="background: rgba(0,0,0,0.65); color: #cbd5e1; font-size: 10px;">${this.escapeHtml(cr.visibility)}</span>
                            ${cr.publicUrl ? `<span class="badge" style="background: rgba(16,185,129,0.85); color: white; font-size: 10px;">MP4</span>` : ''}
                        </div>
                        <div class="creative-badge-top-right" onclick="event.stopPropagation()">
                            <input type="checkbox" style="width: 16px; height: 16px; cursor: pointer;" ${checked ? 'checked' : ''} onchange="CreativesModule.toggleSelect('${this.escapeHtml(cr.id)}')">
                        </div>
                        <div class="creative-play-overlay">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                        </div>
                        <div class="creative-badge-bottom">${this.escapeHtml(cr.duration)} | ${this.escapeHtml(cr.format)}</div>
                    </div>

                    <div class="creative-info-body">
                        <div class="creative-title" title="${this.escapeHtml(cr.title)}">🎬 ${this.escapeHtml(cr.title)}</div>
                        <div class="creative-meta-row">
                            <span>${this.escapeHtml(cr.size)}</span>
                            <span class="badge badge-neutral">${this.escapeHtml(cr.product)}</span>
                            <span>Angle: <strong>${this.escapeHtml(cr.angle)}</strong></span>
                        </div>
                        <div class="creative-policies">
                            <div class="policy-item">
                                <span style="font-weight: 600;">TIKTOK</span>
                                <span class="badge ${cr.tiktokPolicy === 'Passed' ? 'badge-success' : 'badge-danger'}">
                                    ${cr.tiktokPolicy === 'Passed' ? '✓ Passed' : '✕ ' + this.escapeHtml(cr.tiktokPolicy)}
                                </span>
                            </div>
                            <div class="policy-item">
                                <span style="font-weight: 600;">META · AI</span>
                                <span class="badge ${cr.metaPolicy === 'Approved' ? 'badge-success' : cr.metaPolicy === 'Review' ? 'badge-warning' : 'badge-danger'}">
                                    ${this.escapeHtml(cr.metaPolicy)}
                                </span>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; background: var(--bg-surface-subtle); padding: 4px 8px; border-radius: 4px;">
                            <span>CAMPAIGNS:</span>
                            <span>
                                <strong style="color: #10b981;">${cr.campaignSuccess} SUCCESS</strong> /
                                <strong style="color: #ef4444;">${cr.campaignFailed} FAIL</strong>
                            </span>
                        </div>
                        <div class="creative-card-footer">
                            <span>By ${this.escapeHtml(cr.creator)}</span>
                            <span>${this.escapeHtml(cr.updatedAgo)}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    async loadData(force = false) {
        if (!window.PandaWindApi || (this.state.loading && !force)) return;
        this.state.loading = true;
        try {
            const [crRes, pkgRes] = await Promise.all([
                window.PandaWindApi.getCreatives(),
                window.PandaWindApi.getPackages()
            ]);
            if (crRes && crRes.ok) {
                this.state.cache = crRes.items || [];
                this.state.summaryCache = crRes.summary;
            }
            if (pkgRes && pkgRes.ok) {
                this.state.packagesCache = pkgRes.items || [];
                if (this.state.preselectedPackageIds.length > 0) {
                    this.state.selectedPackageIds = [...this.state.preselectedPackageIds];
                    this.state.preselectedPackageIds = [];
                } else if (this.state.selectedPackageIds.length === 0 && this.state.packagesCache.length > 0) {
                    this.state.selectedPackageIds = [this.state.packagesCache[0].id];
                }
            }
            this.refreshDom();
        } catch {
            // Keep static fallback if backend offline
        } finally {
            this.state.loading = false;
        }
    },

    refreshDom() {
        const hub = this.getCreativesData();
        const items = this.getFilteredItems(hub.items);
        const grid = document.getElementById('creativeCardsGrid');
        if (grid) grid.innerHTML = this.renderCardsHtml(items);
        const stats = document.getElementById('creativesSummaryGrid');
        if (stats) stats.innerHTML = this.renderSummaryCards(hub.summary);
    },

    toggleSelect(id) {
        if (this.state.selectedIds.includes(id)) {
            this.state.selectedIds = this.state.selectedIds.filter(x => x !== id);
        } else {
            this.state.selectedIds.push(id);
        }
        App.renderRoute();
    },

    toggleSelectAll() {
        const items = this.getFilteredItems(this.getCreativesData().items);
        const allSelected = items.length > 0 && items.every(i => this.state.selectedIds.includes(i.id));
        if (allSelected) {
            this.state.selectedIds = [];
        } else {
            this.state.selectedIds = items.map(i => i.id);
        }
        App.renderRoute();
    },

    onSearch(q) { this.state.searchTerm = q; this.refreshDom(); },
    filterTikTokPolicy(val) { this.state.filterTikTok = val; this.refreshDom(); },
    filterMetaPolicy(val) { this.state.filterMeta = val; this.refreshDom(); },
    filterAngleCode(val) { this.state.filterAngle = val; this.refreshDom(); },
    filterByProduct(val) { this.state.filterProduct = val; this.refreshDom(); },

    async batchRecheck() {
        App.showToast('🛡️ Đang chạy kiểm duyệt chính sách AI cho Creatives...', 'info');
        try {
            if (window.PandaWindApi) {
                const res = await window.PandaWindApi.recheckCreativePolicy(this.state.selectedIds);
                App.showToast(`Kiểm duyệt hoàn tất: ${res.passedCount} đạt chuẩn, ${res.flaggedCount} cần rà soát.`, 'success');
                await this.loadData(true);
            }
        } catch (err) {
            App.showToast(`Lỗi kiểm duyệt: ${err.message}`, 'danger');
        }
    },

    // --- Video Player Modal ---
    openVideoPlayer(id) {
        const cr = this.getCreativesData().items.find(x => x.id === id);
        if (!cr) return;
        this.state.activeVideo = cr;
        const modal = document.getElementById('creativeVideoModalBackdrop');
        if (modal) {
            modal.innerHTML = this.renderVideoPlayerInner(cr);
            modal.classList.add('open');
        }
    },

    closeVideoPlayer() {
        this.state.activeVideo = null;
        const modal = document.getElementById('creativeVideoModalBackdrop');
        if (modal) {
            modal.classList.remove('open');
            modal.innerHTML = '';
        }
    },

    renderVideoPlayerModal() {
        return `<div class="modal-backdrop" id="creativeVideoModalBackdrop" onclick="if(event.target === this) CreativesModule.closeVideoPlayer()"></div>`;
    },

    renderVideoPlayerInner(cr) {
        const fullUrl = cr.publicUrl ? `${window.PandaWindApi?.baseUrl || ''}${cr.publicUrl}` : null;
        return `
            <div class="modal-box" style="max-width: 520px;">
                <div class="modal-header">
                    <div class="modal-title" style="font-size: 14px;">🎥 ${this.escapeHtml(cr.title)}</div>
                    <button class="modal-close-btn" onclick="CreativesModule.closeVideoPlayer()">✕</button>
                </div>
                <div class="modal-body" style="padding: 16px; background: #000;">
                    <div class="video-player-container">
                        ${fullUrl && cr.type === 'VIDEO' ? `
                            <video src="${this.escapeHtml(fullUrl)}" controls autoplay playsinline style="width:100%; height:100%; object-fit:contain; background:#000;"></video>
                        ` : fullUrl && cr.type === 'IMAGE' ? `
                            <img src="${this.escapeHtml(fullUrl)}" style="width:100%; height:100%; object-fit:contain;" />
                        ` : `
                            <div style="position: absolute; inset:0; background: ${cr.posterGradient || 'linear-gradient(135deg, #1e1b4b, #312e81)'}; display:flex; flex-direction:column; align-items:center; justify-content:center; color:white; text-align:center; padding:20px;">
                                <div style="font-weight: 700; font-size: 15px; margin-bottom: 6px;">${this.escapeHtml(cr.title)}</div>
                                <div style="font-size: 12px; color: #e2e8f0;">Asset Seed (${this.escapeHtml(cr.resolution)} · ${this.escapeHtml(cr.duration)})</div>
                                <div style="margin-top: 12px; display: flex; gap: 8px;">
                                    <span class="badge badge-info">${this.escapeHtml(cr.angle)}</span>
                                    <span class="badge badge-success">${this.escapeHtml(cr.language)}</span>
                                </div>
                            </div>
                        `}
                    </div>
                    <div style="margin-top: 12px; background: #111827; border: 1px solid #1f2937; border-radius: 8px; padding: 12px; color: white; font-size: 12px;">
                        <div style="font-weight: 700; margin-bottom: 6px; color: #93c5fd;">Thông số & Chính sách:</div>
                        <div>• <strong>SHA-256:</strong> <code>${this.escapeHtml((cr.sha256Hash || '').slice(0, 20))}...</code></div>
                        <div>• <strong>TikTok:</strong> ${this.escapeHtml(cr.tiktokPolicyReason)}</div>
                        <div>• <strong>Meta AI:</strong> ${this.escapeHtml(cr.metaPolicyReason)}</div>
                        ${cr.youtubeVideoId ? `<div>• <strong>YouTube ID:</strong> <code>${this.escapeHtml(cr.youtubeVideoId)}</code></div>` : ''}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary btn-sm" onclick="CreativesModule.closeVideoPlayer()">Đóng</button>
                </div>
            </div>
        `;
    },

    // --- Upload Modal ---
    openUploadModal() {
        const modal = document.getElementById('creativeUploadModalBackdrop');
        if (modal) modal.classList.add('open');
    },

    closeUploadModal() {
        const modal = document.getElementById('creativeUploadModalBackdrop');
        if (modal) modal.classList.remove('open');
    },

    onFilePicked(input) {
        const label = document.getElementById('pickedFilesLabel');
        if (!label) return;
        const files = Array.from(input.files || []);
        label.textContent = files.length > 0
            ? `Đã chọn ${files.length} tệp: ${files.map(f => f.name).join(', ')}`
            : 'Kéo thả video MP4/ảnh vào đây hoặc Click để chọn file';
    },

    async saveUploadedCreative() {
        const fileInput = document.getElementById('creativeUploadFileInput');
        const files = fileInput ? Array.from(fileInput.files || []) : [];
        const meta = {
            productId: document.getElementById('uploadProdSelect')?.value || 'AIP922',
            angleCode: document.getElementById('uploadAngleSelect')?.value || 'Transformation',
            marketTarget: document.getElementById('uploadMarketSelect')?.value || 'US / Tier 1',
            languageCode: document.getElementById('uploadLangSelect')?.value || 'English',
            youtubeVideoId: document.getElementById('uploadYtInput')?.value.trim() || undefined,
            autoCheckPolicy: String(Boolean(document.getElementById('uploadAutoCheck')?.checked))
        };

        try {
            if (!window.PandaWindApi) throw new Error('Backend chưa bật');
            if (files.length > 0) {
                for (const file of files) {
                    await window.PandaWindApi.uploadCreativeBinary(file, meta);
                }
                App.showToast(`Đã tải lên ${files.length} creative lên Server & lưu PostgreSQL!`, 'success');
            } else {
                const customName = document.getElementById('uploadCustomNameInput')?.value.trim();
                if (!customName) {
                    App.showToast('Vui lòng chọn file MP4/ảnh hoặc nhập tên Creative!', 'warning');
                    return;
                }
                await window.PandaWindApi.uploadCreativeMeta(Object.assign({ fileName: customName, title: customName }, meta));
                App.showToast(`Đã đăng ký creative "${customName}" vào Creative Hub!`, 'success');
            }
            this.closeUploadModal();
            await this.loadData(true);
        } catch (err) {
            App.showToast(`Lỗi upload: ${err.message}`, 'danger');
        }
    },

    renderUploadModal() {
        return `
            <div class="modal-backdrop" id="creativeUploadModalBackdrop" onclick="if(event.target === this) CreativesModule.closeUploadModal()">
                <div class="modal-box" style="max-width: 600px;">
                    <div class="modal-header">
                        <div class="modal-title">Upload New Creatives to Hub</div>
                        <button class="modal-close-btn" onclick="CreativesModule.closeUploadModal()">✕</button>
                    </div>
                    <div class="modal-body">
                        <div style="border: 2px dashed var(--border-color); border-radius: var(--radius-lg); padding: 24px; text-align: center; cursor: pointer; background: var(--bg-surface-subtle);" onclick="document.getElementById('creativeUploadFileInput').click()">
                            <div style="font-size: 32px; margin-bottom: 6px;">📤</div>
                            <div style="font-size: 13.5px; font-weight: 700; color: var(--text-primary);" id="pickedFilesLabel">Click để chọn file MP4 / MOV / PNG / JPG từ máy tính</div>
                            <div style="font-size: 11.5px; color: var(--text-tertiary); margin-top: 4px;">Server tự tính SHA-256 chống upload trùng và đọc kích thước/thời lượng video</div>
                            <input type="file" id="creativeUploadFileInput" accept="video/*,image/*" multiple style="display:none;" onchange="CreativesModule.onFilePicked(this)">
                        </div>
                        <div class="form-row-2">
                            <div class="form-group">
                                <label class="form-label">Hoặc nhập Tên file (nếu chưa có MP4)</label>
                                <input type="text" class="form-input" id="uploadCustomNameInput" placeholder="e.g. nexus_hug_us_hook05.mp4">
                            </div>
                            <div class="form-group">
                                <label class="form-label">YouTube Video ID (Tùy chọn cho UAC)</label>
                                <input type="text" class="form-input" id="uploadYtInput" placeholder="e.g. dQw4w9WgXcQ">
                            </div>
                        </div>
                        <div class="form-row-2">
                            <div class="form-group">
                                <label class="form-label required">Product ID</label>
                                <select class="form-select" id="uploadProdSelect">
                                    <option value="AIP922">AIP922 (Nexus - AI Video)</option>
                                    <option value="AIP886">AIP886 (Framly - AI Photo)</option>
                                    <option value="AIP919">AIP919 (GeniAI)</option>
                                    <option value="AAP885">AAP885 (CloutDrama)</option>
                                    <option value="AAP858">AAP858 (AI Couple)</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label required">Angle Code</label>
                                <select class="form-select" id="uploadAngleSelect">
                                    <option value="Transformation">Transformation</option>
                                    <option value="AI Hug">AI Hug</option>
                                    <option value="Face Dance">Face Dance</option>
                                    <option value="Anime Morph">Anime Morph</option>
                                    <option value="Short Drama">Short Drama</option>
                                    <option value="Photo Restore">Photo Restore</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-row-2">
                            <div class="form-group">
                                <label class="form-label required">Market Target</label>
                                <select class="form-select" id="uploadMarketSelect">
                                    <option value="US / Tier 1">US / Tier 1 (US, UK, CA, AU)</option>
                                    <option value="LATAM">LATAM (PE, CO, MX, CL)</option>
                                    <option value="India / SEA">SEA & India</option>
                                    <option value="Global">Global</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label required">Ngôn ngữ</label>
                                <select class="form-select" id="uploadLangSelect">
                                    <option value="English">English</option>
                                    <option value="Hindi">Hindi</option>
                                    <option value="Spanish">Spanish</option>
                                    <option value="Global (No voiceover)">No Voiceover (Global)</option>
                                </select>
                            </div>
                        </div>
                        <label style="font-size: 12.5px; display:flex; align-items:center; gap:8px;">
                            <input type="checkbox" id="uploadAutoCheck" checked> Quét tự động vi phạm chính sách TikTok & Meta ngay khi tải lên
                        </label>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-outline btn-sm" onclick="CreativesModule.closeUploadModal()">Hủy</button>
                        <button class="btn btn-primary btn-sm" onclick="CreativesModule.saveUploadedCreative()">✓ Bắt đầu Tải lên</button>
                    </div>
                </div>
            </div>
        `;
    },

    // --- Bulk Campaign Launch & Live Saga Monitor Modal ---
    async openBulkLaunchModal() {
        if (this.state.selectedIds.length === 0) {
            App.showToast('Vui lòng tích chọn ít nhất 1 Creative trước khi tạo chiến dịch!', 'warning');
            return;
        }
        this.state.launchModalTab = 'preview';
        const modal = document.getElementById('bulkLaunchModalBackdrop');
        if (modal) modal.classList.add('open');

        if (this.state.packagesCache.length === 0) {
            await this.loadData(true);
        }
        if (this.state.selectedPackageIds.length === 0 && this.state.packagesCache.length > 0) {
            this.state.selectedPackageIds = [this.state.packagesCache[0].id];
        }
        await this.fetchPreview();
    },

    async openHistoryModal() {
        this.state.launchModalTab = 'history';
        const modal = document.getElementById('bulkLaunchModalBackdrop');
        if (modal) modal.classList.add('open');
        try {
            if (window.PandaWindApi) {
                const res = await window.PandaWindApi.getBulkBatches();
                this.state.batchesCache = res.batches || [];
            }
        } catch {}
        this.refreshLaunchModalBody();
    },

    closeBulkLaunchModal() {
        const modal = document.getElementById('bulkLaunchModalBackdrop');
        if (modal) modal.classList.remove('open');
    },

    async togglePackageSelection(pkgId, checked) {
        if (checked && !this.state.selectedPackageIds.includes(pkgId)) {
            this.state.selectedPackageIds.push(pkgId);
        } else if (!checked) {
            this.state.selectedPackageIds = this.state.selectedPackageIds.filter(x => x !== pkgId);
        }
        await this.fetchPreview();
    },

    async fetchPreview() {
        if (!window.PandaWindApi || this.state.selectedPackageIds.length === 0 || this.state.selectedIds.length === 0) {
            this.state.previewResult = null;
            this.refreshLaunchModalBody();
            return;
        }
        try {
            const res = await window.PandaWindApi.previewBulkLaunch(this.state.selectedIds, this.state.selectedPackageIds);
            this.state.previewResult = res;
        } catch (err) {
            this.state.previewResult = { error: err.message };
        }
        this.refreshLaunchModalBody();
    },

    async startBulkLaunch() {
        if (this.state.selectedIds.length === 0 || this.state.selectedPackageIds.length === 0) {
            App.showToast('Vui lòng chọn ít nhất 1 Creative và 1 Package!', 'warning');
            return;
        }

        const prev = this.state.previewResult;
        const launchPaused = Boolean(document.getElementById('chkLaunchPaused')?.checked);
        const allowHighBudget = Boolean(document.getElementById('chkAllowHighBudget')?.checked);
        if (prev?.summary?.exceedsBudgetGuardrail && !allowHighBudget) {
            App.showToast('Ngân sách vượt trần an toàn! Vui lòng tích xác nhận cho phép vượt trần.', 'warning');
            return;
        }

        const simFail = Boolean(document.getElementById('chkSimulateFailOnce')?.checked);
        const options = {};
        if (simFail) options.simulateFailOnce = true;
        if (launchPaused) options.launchPaused = true;
        if (allowHighBudget) options.allowHighBudget = true;

        const idemKey = `ui_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        try {
            const res = await window.PandaWindApi.launchBulkCampaigns({
                creativeIds: this.state.selectedIds,
                packageIds: this.state.selectedPackageIds,
                createdBy: 'HoangNC',
                options
            }, idemKey);

            this.state.activeBatch = {
                id: res.batchId,
                status: res.status,
                launchPaused: Boolean(res.launchPaused),
                totalJobs: res.totalJobs,
                succeededJobs: 0,
                failedJobs: 0
            };
            this.state.activeBatchJobs = res.jobs || [];
            this.state.launchModalTab = 'monitor';
            this.refreshLaunchModalBody();
            App.showToast(
                launchPaused
                    ? `🛡️ Đã đẩy ${res.totalJobs} Campaign Jobs (giữ trạng thái PAUSED an toàn)!`
                    : `🚀 Đã đẩy ${res.totalJobs} Campaign Jobs vào hàng đợi SQL!`,
                'success'
            );
        } catch (err) {
            App.showToast(`Lỗi khởi chạy: ${err.message}`, 'danger');
        }
    },

    async inspectBatch(batchId) {
        try {
            const res = await window.PandaWindApi.getBulkBatch(batchId);
            this.state.activeBatch = res.batch;
            this.state.activeBatchJobs = res.jobs || [];
            this.state.launchModalTab = 'monitor';
            this.refreshLaunchModalBody();
        } catch (err) {
            App.showToast(`Lỗi tải Batch: ${err.message}`, 'danger');
        }
    },

    async retryJob(jobId) {
        try {
            await window.PandaWindApi.retryLaunchJob(jobId);
            App.showToast('↻ Đã đưa Job lỗi quay lại hàng đợi (Resume từ Checkpoint)!', 'info');
        } catch (err) {
            App.showToast(`Lỗi Retry: ${err.message}`, 'danger');
        }
    },

    async retryAllFailed() {
        if (!this.state.activeBatch) return;
        try {
            const res = await window.PandaWindApi.retryBatchFailed(this.state.activeBatch.id);
            App.showToast(`↻ Đang chạy lại ${res.retriedCount} jobs lỗi...`, 'info');
        } catch (err) {
            App.showToast(`Lỗi Retry Batch: ${err.message}`, 'danger');
        }
    },

    refreshLaunchModalBody() {
        const body = document.getElementById('bulkLaunchModalBody');
        const footer = document.getElementById('bulkLaunchModalFooter');
        if (body) body.innerHTML = this.renderBulkLaunchBody();
        if (footer) footer.innerHTML = this.renderBulkLaunchFooter();
    },

    renderBulkLaunchModal() {
        return `
            <div class="modal-backdrop" id="bulkLaunchModalBackdrop" onclick="if(event.target === this) CreativesModule.closeBulkLaunchModal()">
                <div class="modal-box" style="max-width: 920px;">
                    <div class="modal-header">
                        <div>
                            <div class="modal-title">🚀 Mass Campaign Launcher (Meta Marketing API & Google Ads UAC)</div>
                            <div style="font-size: 12px; color: var(--text-tertiary); margin-top: 2px;">
                                Ma trận chia lô tự động · SHA-256 Media Cache · SQL SKIP LOCKED Checkpointed Saga
                            </div>
                        </div>
                        <button class="modal-close-btn" onclick="CreativesModule.closeBulkLaunchModal()">✕</button>
                    </div>
                    <div class="modal-body" id="bulkLaunchModalBody" style="max-height: 70vh; overflow-y: auto;">
                        ${this.renderBulkLaunchBody()}
                    </div>
                    <div class="modal-footer" id="bulkLaunchModalFooter">
                        ${this.renderBulkLaunchFooter()}
                    </div>
                </div>
            </div>
        `;
    },

    renderBulkLaunchBody() {
        if (this.state.launchModalTab === 'history') {
            return `
                <div style="font-weight:700; margin-bottom:10px;">Lịch sử Các Đợt Tạo Camp Hàng Loạt (20 Batch Gần Nhất)</div>
                <table class="pandawind-table">
                    <thead>
                        <tr>
                            <th>Batch ID</th>
                            <th>Tổng Jobs</th>
                            <th>Thành công</th>
                            <th>Thất bại</th>
                            <th>Trạng thái</th>
                            <th>Thao tác</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(this.state.batchesCache || []).map(b => `
                            <tr>
                                <td style="font-family:var(--font-mono);">${this.escapeHtml(b.id)}</td>
                                <td><strong>${b.totalJobs}</strong></td>
                                <td style="color:#10b981; font-weight:700;">${b.succeededJobs}</td>
                                <td style="color:#ef4444; font-weight:700;">${b.failedJobs}</td>
                                <td><span class="badge ${b.status === 'COMPLETED' ? 'badge-success' : b.status === 'RUNNING' ? 'badge-info' : 'badge-warning'}">${this.escapeHtml(b.status)}</span></td>
                                <td><button class="btn btn-outline btn-sm" onclick="CreativesModule.inspectBatch('${this.escapeHtml(b.id)}')">Xem Jobs</button></td>
                            </tr>
                        `).join('') || `<tr><td colspan="6" style="text-align:center; color:var(--text-tertiary);">Chưa có đợt Launch nào.</td></tr>`}
                    </tbody>
                </table>
            `;
        }

        if (this.state.launchModalTab === 'monitor' && this.state.activeBatch) {
            const b = this.state.activeBatch;
            const jobs = this.state.activeBatchJobs || [];
            const done = (b.succeededJobs || 0) + (b.failedJobs || 0);
            const pct = b.totalJobs > 0 ? Math.round((done / b.totalJobs) * 100) : 0;
            const hasFailed = jobs.some(j => j.status === 'FAILED');

            return `
                <div style="background:var(--bg-surface-subtle); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:14px; margin-bottom:14px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <div>
                            <strong style="font-size:13.5px;">Batch <code>${this.escapeHtml(b.id)}</code></strong>
                            <span class="badge ${b.status === 'COMPLETED' ? 'badge-success' : b.status === 'RUNNING' ? 'badge-info' : 'badge-warning'}" style="margin-left:8px;">${this.escapeHtml(b.status)}</span>
                            ${b.launchPaused ? `<span class="badge badge-warning" style="margin-left:6px;">🛡️ PAUSED GUARDRAIL</span>` : ''}
                        </div>
                        <div style="font-size:12.5px;">
                            <strong style="color:#10b981;">${b.succeededJobs || 0} Thành công</strong> ·
                            <strong style="color:#ef4444;">${b.failedJobs || 0} Lỗi</strong> ·
                            Tổng: <strong>${b.totalJobs}</strong> (${pct}%)
                        </div>
                    </div>
                    <div style="height:8px; background:var(--border-color); border-radius:99px; overflow:hidden;">
                        <div style="width:${pct}%; height:100%; background:${b.failedJobs > 0 ? '#f59e0b' : '#10b981'}; transition:width 0.25s;"></div>
                    </div>
                </div>

                ${hasFailed ? `
                    <div style="margin-bottom:10px; display:flex; justify-content:flex-end;">
                        <button class="btn btn-warning btn-sm" onclick="CreativesModule.retryAllFailed()">↻ Retry Tất Cả Jobs Lỗi</button>
                    </div>
                ` : ''}

                <div style="border:1px solid var(--border-color); border-radius:var(--radius-md); overflow:hidden;">
                    <table class="pandawind-table">
                        <thead>
                            <tr>
                                <th>Tên Chiến Dịch</th>
                                <th>Kênh / Mode</th>
                                <th>Bước Saga Hiện Tại</th>
                                <th>Platform ID (Checkpoint)</th>
                                <th>Trạng thái</th>
                                <th>Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${jobs.map(j => `
                                <tr>
                                    <td><strong style="font-size:12px;">${this.escapeHtml(j.plannedCampaignName)}</strong></td>
                                    <td>
                                        <span class="badge ${j.channel === 'Google Ads' ? 'badge-warning' : 'badge-info'}">${this.escapeHtml(j.channel)}</span>
                                        <div style="font-size:10.5px; color:var(--text-tertiary);">${j.executionMode === 'live_api' ? 'Live API' : 'Sandbox'}</div>
                                    </td>
                                    <td style="font-family:var(--font-mono); font-size:11.5px;">
                                        ${this.escapeHtml(j.currentStep)}
                                        ${j.errorMessage ? `<div style="color:#ef4444; font-family:inherit; margin-top:2px;">${this.escapeHtml(j.errorMessage)}</div>` : ''}
                                    </td>
                                    <td style="font-family:var(--font-mono); font-size:11.5px;">${this.escapeHtml(j.platformCampaignId || '-')}</td>
                                    <td>
                                        <span class="badge ${j.status === 'SUCCEEDED' ? 'badge-success' : j.status === 'FAILED' ? 'badge-danger' : 'badge-info'}">
                                            ${this.escapeHtml(j.status)}
                                        </span>
                                    </td>
                                    <td>
                                        ${j.status === 'FAILED'
                                            ? `<button class="btn btn-outline btn-sm" onclick="CreativesModule.retryJob('${this.escapeHtml(j.id)}')">↻ Retry</button>`
                                            : j.status === 'SUCCEEDED'
                                                ? `<span style="color:#10b981; font-size:11.5px;">✓ Đã lên Intraday</span>`
                                                : `<span style="color:var(--text-tertiary); font-size:11px;">Đang chạy...</span>`}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        // Default: Dry-Run Preview Tab
        const pkgs = this.state.packagesCache || [];
        const prev = this.state.previewResult;
        const hasLivePackage = pkgs
            .filter(p => this.state.selectedPackageIds.includes(p.id))
            .some(p => Boolean(p.hasToken));

        return `
            <div style="display:grid; grid-template-columns: 1.1fr 1fr; gap:16px;">
                <div>
                    <div style="font-size:12.5px; font-weight:700; margin-bottom:8px;">1. Chọn Gói Package Áp Dụng (${this.state.selectedIds.length} Creatives đã chọn):</div>
                    <div style="display:flex; flex-direction:column; gap:8px; max-height:260px; overflow-y:auto;">
                        ${pkgs.map(p => {
                            const checked = this.state.selectedPackageIds.includes(p.id);
                            return `
                                <label style="display:flex; align-items:flex-start; gap:10px; padding:10px; border-radius:var(--radius-md); border:1px solid ${checked ? 'var(--primary)' : 'var(--border-color)'}; background:${checked ? 'var(--primary-light)' : 'var(--bg-surface-subtle)'}; cursor:pointer;">
                                    <input type="checkbox" ${checked ? 'checked' : ''} onchange="CreativesModule.togglePackageSelection('${this.escapeHtml(p.id)}', this.checked)" style="margin-top:3px;">
                                    <div style="flex:1; min-width:0;">
                                        <div style="font-weight:700; font-size:12.5px; color:var(--text-primary);">${this.escapeHtml(p.name)}</div>
                                        <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">
                                            <span class="badge ${p.channel === 'Google Ads' ? 'badge-warning' : 'badge-info'}">${this.escapeHtml(p.channel)}</span>
                                            · ${p.adGroupVolume}G × ${p.creativeVolume}C · ${this.escapeHtml(p.budgetLabel)} · ${p.hasToken ? 'Live Token' : 'Sandbox'}
                                        </div>
                                    </div>
                                </label>
                            `;
                        }).join('') || `<div style="color:var(--text-tertiary); font-size:12px;">Đang tải danh sách Package...</div>`}
                    </div>

                    <div style="margin-top:12px; padding:10px; border:1px solid var(--border-color); border-radius:var(--radius-md); background:var(--bg-surface-subtle); display:flex; flex-direction:column; gap:8px;">
                        <label style="display:flex; align-items:flex-start; gap:8px; font-size:12px; color:var(--text-primary); cursor:pointer;">
                            <input type="checkbox" id="chkLaunchPaused" ${hasLivePackage ? 'checked' : ''} style="margin-top:2px;">
                            <span><strong>🛡️ Chế độ an toàn: Giữ trạng thái PAUSED sau khi tạo xong</strong><br><span style="color:var(--text-tertiary); font-size:11px;">Tạo đủ Campaign/AdGroup/Ad nhưng chưa cắn tiền thật để Marketer kiểm tra lại trên Ads Manager.</span></span>
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; font-size:12px; color:var(--text-secondary); cursor:pointer;">
                            <input type="checkbox" id="chkSimulateFailOnce">
                            Giả lập 1 Job lỗi tạm thời để test cơ chế Checkpoint Resume & Retry
                        </label>
                    </div>
                </div>

                <div>
                    <div style="font-size:12.5px; font-weight:700; margin-bottom:8px;">2. Dự Toán Ma Trận (Dry-Run Preview):</div>
                    ${prev && prev.summary ? `
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px;">
                            <div class="stat-card" style="padding:10px;">
                                <div class="stat-card-title">Campaigns Sinh Ra</div>
                                <div class="stat-card-value" style="font-size:20px; color:var(--primary);">${prev.summary.totalCampaignsToCreate}</div>
                                <div style="font-size:11px; color:var(--text-tertiary);">${prev.summary.totalAdGroupsToCreate} AdGroups · ${prev.summary.totalAdsToCreate} Ads</div>
                            </div>
                            <div class="stat-card" style="padding:10px;">
                                <div class="stat-card-title">Ngân Sách Ngày Dự Kiến</div>
                                <div class="stat-card-value" style="font-size:18px; color:${prev.summary.exceedsBudgetGuardrail ? '#ef4444' : '#10b981'};">$${prev.summary.estimatedDailyBudgetUsd.toLocaleString('en-US')}</div>
                                <div style="font-size:11px; color:var(--text-tertiary);">${prev.summary.estimatedDailyBudgetVnd.toLocaleString('en-US')} ₫</div>
                            </div>
                        </div>

                        ${prev.summary.exceedsBudgetGuardrail ? `
                            <div style="background:rgba(239,68,68,0.1); border:1px solid #ef4444; color:#fca5a5; border-radius:var(--radius-md); padding:10px; font-size:12px; margin-bottom:10px;">
                                <div style="font-weight:700; color:#ef4444; margin-bottom:4px;">🛡️ Chặn Vượt Trần Ngân Sách An Toàn</div>
                                <div style="color:var(--text-primary); margin-bottom:8px;">${this.escapeHtml(prev.summary.guardrailReason || '')}</div>
                                <label style="display:flex; align-items:center; gap:8px; font-weight:600; color:var(--text-primary); cursor:pointer;">
                                    <input type="checkbox" id="chkAllowHighBudget">
                                    Tôi xác nhận muốn vượt trần ngân sách mặc định ($${prev.summary.maxCampaignDailyBudgetUsd}/camp · $${prev.summary.maxBatchDailyBudgetUsd}/batch)
                                </label>
                            </div>
                        ` : ''}

                        <div style="background:var(--bg-surface-subtle); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:10px; font-size:12px; margin-bottom:10px;">
                            <div>• <strong>SHA-256 Media Cache Hit:</strong> <span style="color:#10b981; font-weight:700;">${prev.summary.mediaCacheHitCount}</span> | Upload mới: <strong>${prev.summary.mediaUploadNeededCount}</strong></div>
                            ${prev.summary.estimatedYoutubeQuotaUnits > 0 ? `<div>• <strong>YouTube Data API Quota:</strong> ~${prev.summary.estimatedYoutubeQuotaUnits.toLocaleString()} units</div>` : ''}
                        </div>

                        ${(prev.warnings || []).length > 0 ? `
                            <div style="background:var(--warning-light); border:1px solid var(--warning-border); color:var(--warning-text); border-radius:var(--radius-md); padding:10px; font-size:11.5px; margin-bottom:10px;">
                                ${(prev.warnings || []).map(w => `<div>⚠️ ${this.escapeHtml(w.message)}</div>`).join('')}
                            </div>
                        ` : ''}

                        <div style="font-size:11.5px; color:var(--text-secondary);">
                            <strong>Tên mẫu sinh tự động:</strong>
                            ${(prev.planPreview || []).map(pp => `
                                <div style="margin-top:4px;">
                                    <span class="badge badge-neutral">${this.escapeHtml(pp.channel)}</span>
                                    <code>${this.escapeHtml(pp.sampleCampaignNames[0] || '')}</code>
                                </div>
                            `).join('')}
                        </div>
                    ` : prev && prev.error ? `
                        <div style="color:#ef4444; font-size:12.5px;">${this.escapeHtml(prev.error)}</div>
                    ` : `<div style="color:var(--text-tertiary); font-size:12px;">Chọn ít nhất 1 Package để tính toán ma trận.</div>`}
                </div>
            </div>
        `;
    },

    renderBulkLaunchFooter() {
        if (this.state.launchModalTab === 'monitor') {
            return `
                <button class="btn btn-outline btn-sm" onclick="CreativesModule.state.launchModalTab='preview'; CreativesModule.refreshLaunchModalBody();">← Tạo Batch Mới</button>
                <button class="btn btn-outline btn-sm" onclick="CreativesModule.closeBulkLaunchModal(); App.setRoute('intraday');">⚡ Mở Intraday Report</button>
                <button class="btn btn-primary btn-sm" onclick="CreativesModule.closeBulkLaunchModal()">Đóng</button>
            `;
        }
        if (this.state.launchModalTab === 'history') {
            return `
                <button class="btn btn-outline btn-sm" onclick="CreativesModule.state.launchModalTab='preview'; CreativesModule.refreshLaunchModalBody();">← Quay lại Preview</button>
                <button class="btn btn-primary btn-sm" onclick="CreativesModule.closeBulkLaunchModal()">Đóng</button>
            `;
        }

        const count = this.state.previewResult?.summary?.totalCampaignsToCreate || 0;
        return `
            <button class="btn btn-outline btn-sm" onclick="CreativesModule.closeBulkLaunchModal()">Hủy</button>
            <button class="btn btn-primary btn-sm" ${count === 0 ? 'disabled' : ''} onclick="CreativesModule.startBulkLaunch()">
                🚀 Launch ${count} Campaigns Ngay
            </button>
        `;
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

window.CreativesModule = CreativesModule;
