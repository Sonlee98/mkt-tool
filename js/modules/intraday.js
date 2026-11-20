/**
 * Module: Intraday Report (Báo cáo trong ngày - Thời gian thực)
 * Kết nối Backend PostgreSQL + SSE Realtime Stream, hỗ trợ đầy đủ lọc đa chiều, VND/USD, Export CSV & Google Sheets
 */

const IntradayModule = {
    state: {
        expandedNodes: {},
        autoExpandedOnce: false,
        chartMetric: 'spend_rev', // 'spend_rev' | 'roas' | 'installs'
        filterDate: '',
        filterDivision: 'All',
        filterProduct: 'All',
        filterChannel: 'All',
        filterMarketer: 'All',
        filterCountry: 'All',
        searchTerm: '',
        isLoading: false,
        lastError: null
    },

    reportData: null,
    _searchTimer: null,
    _lastFetchAt: 0,

    getFilterParams() {
        return {
            date: this.state.filterDate || undefined,
            division: this.state.filterDivision || 'All',
            product: this.state.filterProduct || 'All',
            channel: this.state.filterChannel || 'All',
            marketer: this.state.filterMarketer || 'All',
            country: this.state.filterCountry || 'All',
            search: (this.state.searchTerm || '').trim() || undefined
        };
    },

    parseShorthandMoney(val, rate = 25718) {
        if (typeof val === 'number') return val;
        if (!val) return 0;
        const s = String(val).trim().toUpperCase().replace(/,/g, '');
        const m = s.match(/-?\d+(\.\d+)?/);
        if (!m) return 0;
        let num = parseFloat(m[0]);
        if (s.includes('B')) num *= 1e9;
        else if (s.includes('M')) num *= 1e6;
        else if (s.includes('K')) num *= 1e3;
        if (s.includes('$')) num *= rate;
        return Math.round(num);
    },

    parsePercent(val) {
        if (typeof val === 'number') return val;
        if (!val || val === '-' || val === 'N/A') return null;
        const n = parseFloat(String(val).replace('%', '').trim());
        return Number.isFinite(n) ? n : null;
    },

    getFallbackReport() {
        const d = window.PANDAWIND_DATA.intraday;
        const s = d.summary;
        const rate = 25718;

        const mapNode = (node) => {
            const out = {
                id: node.id,
                type: node.type,
                name: node.name,
                productId: node.productId,
                channel: node.channel,
                campaignId: node.campaignId || '-',
                externalCampaignId: node.campaignId || '-',
                countries: node.countries || (node.type === 'product' ? 'Global' : 'All Target'),
                budgetVnd: this.parseShorthandMoney(node.budget, rate),
                roasD0: this.parsePercent(node.roasD0),
                roasD0T1: this.parsePercent(node.roasD0T1),
                roasT2: this.parsePercent(node.roasT2) ?? 107.89,
                roasT3: this.parsePercent(node.roasT3) ?? 107.21,
                spendVnd: this.parseShorthandMoney(node.spend, rate),
                revenueVnd: this.parseShorthandMoney(node.revenue, rate),
                conversions: parseInt(String(node.conversion || '0').replace(/,/g, ''), 10) || 0,
                cpiVnd: this.parseShorthandMoney(node.cpi, rate),
                ltvVnd: this.parseShorthandMoney(node.ltv, rate),
                estRoas: this.parsePercent(node.estRoas),
                estRoasH1: this.parsePercent(node.estRoasH1) ?? 105.55,
                status: node.status || 'ON',
                lastUpdate: node.lastUpdate || '-'
            };
            if (node.children) {
                out.children = node.children.map(mapNode);
            }
            return out;
        };

        return {
            summary: {
                date: '',
                displayDate: s.date,
                currentHourLabel: '#20:00',
                lastUpdate: 'Chế độ tĩnh (Offline)',
                exchangeRate: rate,
                spendVnd: s.spendVnd,
                cohortRevVnd: s.cutoffRevVnd,
                cutoffRevVnd: s.cutoffRevVnd,
                roas: s.roas,
                pl2Vnd: s.pl2Vnd,
                percentPl2: s.percentPl2,
                estRoas: s.estRoas,
                totalInstall: s.totalInstall,
                cpiVnd: s.cpiVnd,
                ltvVnd: s.ltvVnd
            },
            grandTotal: {
                spendVnd: s.spendVnd,
                revenueVnd: s.cutoffRevVnd,
                conversions: s.totalInstall,
                roasD0: s.roas,
                estRoas: s.estRoas,
                lastUpdate: 'Offline'
            },
            hourly: d.hourly,
            treeData: d.treeData.map(mapNode),
            meta: {
                products: window.PANDAWIND_DATA.products.map(p => ({ id: p.id, name: p.name })),
                marketers: [
                    { id: 'HoangNC', fullName: 'Nguyễn Công Hoàng' },
                    { id: 'TrangDQ', fullName: 'Đồng Quỳnh Trang' },
                    { id: 'PhuongNTK', fullName: 'Nguyễn Thị Kim Phượng' },
                    { id: 'MinhTV', fullName: 'Trần Văn Minh' },
                    { id: 'LienDT', fullName: 'Đỗ Thị Liên' }
                ],
                ggsheetCsvUrl: ''
            }
        };
    },

    getDisplayReport() {
        return this.reportData || this.getFallbackReport();
    },

    ensureAutoExpand(report) {
        if (this.state.autoExpandedOnce) return;
        if (report && report.treeData && report.treeData.length > 0) {
            const firstProd = report.treeData[0];
            this.state.expandedNodes[firstProd.id] = true;
            if (firstProd.children && firstProd.children.length > 0) {
                this.state.expandedNodes[firstProd.children[0].id] = true;
            }
            this.state.autoExpandedOnce = true;
        }
    },

    render() {
        const report = this.getDisplayReport();
        this.ensureAutoExpand(report);

        const products = (report.meta && report.meta.products) || [
            { id: 'AIP922' }, { id: 'AIP886' }, { id: 'AIP919' }, { id: 'AAP885' }, { id: 'AAP858' }
        ];
        const marketers = (report.meta && report.meta.marketers) || [
            { id: 'HoangNC', fullName: 'Nguyễn Công Hoàng' },
            { id: 'TrangDQ', fullName: 'Đồng Quỳnh Trang' },
            { id: 'PhuongNTK', fullName: 'Nguyễn Thị Kim Phượng' },
            { id: 'MinhTV', fullName: 'Trần Văn Minh' },
            { id: 'LienDT', fullName: 'Đỗ Thị Liên' }
        ];
        const exchangeRate = (report.summary && report.summary.exchangeRate) || 25718;
        const activeDate = this.state.filterDate || (report.summary && report.summary.date) || '';

        return `
            <!-- Top Action & Filter Strip -->
            <div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 12px 18px; margin-bottom: 16px; box-shadow: var(--shadow-sm);">
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex: 1;">
                        <input type="date" id="intradayDateFilter" class="filter-select" value="${activeDate}" onchange="IntradayModule.setFilter('filterDate', this.value)" title="Chọn ngày báo cáo">

                        <select id="intradayDivisionFilter" class="filter-select" onchange="IntradayModule.setFilter('filterDivision', this.value)">
                            <option value="All" ${this.state.filterDivision === 'All' ? 'selected' : ''}>Division: Tất cả</option>
                            <option value="AIP" ${this.state.filterDivision === 'AIP' ? 'selected' : ''}>AIP Division</option>
                            <option value="AAP" ${this.state.filterDivision === 'AAP' ? 'selected' : ''}>AAP Division</option>
                        </select>

                        <!-- Product Pill Selector -->
                        <div id="intradayProductPills" style="display: flex; align-items: center; background: var(--bg-surface-subtle); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 2px 8px; gap: 6px; font-size: 12px; flex-wrap: wrap;">
                            <span style="color: var(--text-tertiary); font-weight: 600;">Products:</span>
                            <span class="badge ${this.state.filterProduct === 'All' ? 'badge-info' : 'badge-neutral'}" style="cursor: pointer;" onclick="IntradayModule.selectProductPill('All')">All</span>
                            ${products.map(p => `
                                <span class="badge ${this.state.filterProduct === p.id ? 'badge-info' : 'badge-neutral'}" style="cursor: pointer;" onclick="IntradayModule.selectProductPill('${p.id}')">${p.id}</span>
                            `).join('')}
                        </div>

                        <input type="text" id="intradaySearchInput" class="filter-input" placeholder="🔍 Tìm chiến dịch / ID..." style="max-width: 180px;" value="${this.escapeHtml(this.state.searchTerm)}" oninput="IntradayModule.onSearchInput(this.value)">

                        <select id="intradayChannelFilter" class="filter-select" onchange="IntradayModule.setFilter('filterChannel', this.value)">
                            <option value="All" ${this.state.filterChannel === 'All' ? 'selected' : ''}>Channel: All Channels</option>
                            <option value="Facebook" ${this.state.filterChannel === 'Facebook' ? 'selected' : ''}>Facebook</option>
                            <option value="TikTok" ${this.state.filterChannel === 'TikTok' ? 'selected' : ''}>TikTok</option>
                            <option value="Google Ads" ${this.state.filterChannel === 'Google Ads' ? 'selected' : ''}>Google Ads</option>
                            <option value="Mintegral" ${this.state.filterChannel === 'Mintegral' ? 'selected' : ''}>Mintegral</option>
                            <option value="Organic" ${this.state.filterChannel === 'Organic' ? 'selected' : ''}>Organic</option>
                            <option value="Mediation" ${this.state.filterChannel === 'Mediation' ? 'selected' : ''}>Mediation</option>
                        </select>

                        <select id="intradayMarketerFilter" class="filter-select" onchange="IntradayModule.setFilter('filterMarketer', this.value)">
                            <option value="All" ${this.state.filterMarketer === 'All' ? 'selected' : ''}>Marketer: All Marketers</option>
                            ${marketers.map(m => `
                                <option value="${m.id}" ${this.state.filterMarketer === m.id ? 'selected' : ''}>${m.fullName}</option>
                            `).join('')}
                        </select>

                        <select id="intradayCountryFilter" class="filter-select" onchange="IntradayModule.setFilter('filterCountry', this.value)">
                            <option value="All" ${this.state.filterCountry === 'All' ? 'selected' : ''}>Country: All Countries</option>
                            <option value="US" ${this.state.filterCountry === 'US' ? 'selected' : ''}>United States (US)</option>
                            <option value="PE" ${this.state.filterCountry === 'PE' ? 'selected' : ''}>Peru (PE)</option>
                            <option value="IN" ${this.state.filterCountry === 'IN' ? 'selected' : ''}>India (IN)</option>
                            <option value="VN" ${this.state.filterCountry === 'VN' ? 'selected' : ''}>Vietnam (VN)</option>
                            <option value="CA" ${this.state.filterCountry === 'CA' ? 'selected' : ''}>Canada (CA)</option>
                            <option value="PH" ${this.state.filterCountry === 'PH' ? 'selected' : ''}>Philippines (PH)</option>
                            <option value="CO" ${this.state.filterCountry === 'CO' ? 'selected' : ''}>Colombia (CO)</option>
                            <option value="AU" ${this.state.filterCountry === 'AU' ? 'selected' : ''}>Australia (AU)</option>
                        </select>

                        <button class="btn btn-outline btn-sm" onclick="IntradayModule.resetFilters()" title="Reset toàn bộ bộ lọc">
                            ↺ Reset
                        </button>
                    </div>

                    <!-- Right Controls -->
                    <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                        <div style="background: var(--bg-surface-subtle); border: 1px solid var(--border-color); padding: 4px 10px; border-radius: var(--radius-md); font-size: 11.5px; font-weight: 600; display: flex; align-items: center; gap: 6px;">
                            <span style="color: var(--text-tertiary);">Tỷ giá:</span>
                            <span style="color: var(--primary);">USD = ${exchangeRate.toLocaleString('en-US')} VND</span>
                        </div>

                        <button class="btn btn-outline btn-sm" onclick="IntradayModule.exportExcel()">
                            📊 Excel
                        </button>
                        <button class="btn btn-outline btn-sm" onclick="IntradayModule.openGgsheetModal()">
                            📋 GGSheet
                        </button>
                        <button class="btn btn-primary btn-sm" onclick="App.setRoute('data-management')">
                            + Nhập Dữ Liệu Thật
                        </button>
                    </div>
                </div>
            </div>

            <!-- Dynamic Report Area (replaced on filter / SSE update without losing toolbar focus) -->
            <div id="intradayDynamicBody">
                ${this.renderDynamicBody(report)}
            </div>

            <!-- Google Sheets Sync Modal -->
            <div class="modal-backdrop" id="ggsheetModalBackdrop" onclick="if(event.target === this) IntradayModule.closeGgsheetModal()">
                <div class="modal-box" style="max-width: 560px;">
                    <div class="modal-header">
                        <div class="modal-title">📋 Đồng Bộ Dữ Liệu Từ Google Sheets</div>
                        <button class="modal-close-btn" onclick="IntradayModule.closeGgsheetModal()">✕</button>
                    </div>
                    <div class="modal-body">
                        <p style="font-size: 12.5px; color: var(--text-secondary); line-height: 1.5;">
                            Dán đường dẫn Google Sheets (đã bật quyền <strong>"Anyone with the link can view"</strong> hoặc link CSV Publish).
                            Các cột hỗ trợ: <code>Product, Channel, CampaignName, CampaignId, Countries, Budget, Spend, Revenue, Installs</code>.
                        </p>
                        <div class="form-group">
                            <label class="form-label required">URL Google Sheets</label>
                            <input type="url" class="form-input" id="ggsheetUrlInput" value="${this.escapeHtml((report.meta && report.meta.ggsheetCsvUrl) || '')}" placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=0">
                        </div>
                        <div id="ggsheetSyncStatus" style="font-size: 12px; color: var(--text-tertiary);"></div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-outline btn-sm" onclick="IntradayModule.closeGgsheetModal()">Đóng</button>
                        <button class="btn btn-primary btn-sm" onclick="IntradayModule.submitGgsheetSync()">✓ Kéo & Đồng Bộ Ngay</button>
                    </div>
                </div>
            </div>
        `;
    },

    renderDynamicBody(report) {
        const config = window.PANDAWIND_DATA.config;
        const s = report.summary;
        const gt = report.grandTotal || {};
        const rate = s.exchangeRate || 25718;
        const isVnd = config.currency === 'VND';

        const formatMoney = (vndVal) => {
            const v = Number(vndVal || 0);
            if (isVnd) {
                if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2) + 'B ₫';
                if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M ₫';
                return Math.round(v).toLocaleString('en-US') + ' ₫';
            }
            const usd = v / rate;
            if (Math.abs(usd) >= 1000) return '$' + (usd / 1000).toFixed(2) + 'K';
            return '$' + usd.toFixed(2);
        };

        const formatKpiMain = (vndVal) => {
            const v = Number(vndVal || 0);
            if (isVnd) {
                if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2) + 'B';
                if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M';
                return Math.round(v).toLocaleString('en-US');
            }
            const usd = v / rate;
            return '$' + Math.round(usd).toLocaleString('en-US');
        };

        const formatKpiSub = (vndVal) => {
            const v = Number(vndVal || 0);
            if (isVnd) {
                const usd = v / rate;
                return '$' + Math.round(usd).toLocaleString('en-US') + ' USD';
            }
            return Math.round(v).toLocaleString('en-US') + ' ₫';
        };

        const formatUnitMoney = (vndVal) => {
            const v = Number(vndVal || 0);
            if (isVnd) return Math.round(v).toLocaleString('en-US') + ' ₫';
            return '$' + (v / rate).toFixed(3);
        };

        const formatGrandMoney = (vndVal) => {
            const v = Number(vndVal || 0);
            if (isVnd) return Math.round(v).toLocaleString('en-US') + ' ₫';
            return '$' + (v / rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        };

        const pl2Positive = s.pl2Vnd >= 0;
        const roasPass = s.roas >= 100;

        return `
            <!-- Main Middle Section: Chart (Left) + 9 KPI Cards (Right) -->
            <div style="display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; margin-bottom: 20px;">
                <!-- Left: Interactive Hourly Performance Chart -->
                <div class="chart-card" id="intradayChartCard" style="margin-bottom: 0; display: flex; flex-direction: column;">
                    <div class="chart-header">
                        <div>
                            <div class="chart-title">Hourly Performance (00:00 - 23:00 • ${s.displayDate})</div>
                            <div style="font-size: 11.5px; color: var(--text-tertiary); margin-top: 2px;">
                                Dữ liệu PostgreSQL thời gian thực • Rê chuột để xem chi tiết từng giờ
                            </div>
                        </div>

                        <div style="display: flex; gap: 4px; background: var(--bg-surface-subtle); padding: 2px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
                            <button class="btn btn-sm ${this.state.chartMetric === 'spend_rev' ? 'btn-primary' : 'btn-outline'}" style="border:none; padding: 4px 10px;" onclick="IntradayModule.setChartMetric('spend_rev')">
                                Spend & Rev
                            </button>
                            <button class="btn btn-sm ${this.state.chartMetric === 'roas' ? 'btn-primary' : 'btn-outline'}" style="border:none; padding: 4px 10px;" onclick="IntradayModule.setChartMetric('roas')">
                                ROAS D0 %
                            </button>
                            <button class="btn btn-sm ${this.state.chartMetric === 'installs' ? 'btn-primary' : 'btn-outline'}" style="border:none; padding: 4px 10px;" onclick="IntradayModule.setChartMetric('installs')">
                                Installs
                            </button>
                        </div>
                    </div>

                    <div class="chart-canvas-wrap" style="flex: 1; min-height: 270px;">
                        <canvas id="intradayHourlyCanvas"></canvas>
                    </div>

                    <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 10px; border-top: 1px solid var(--border-color); font-size: 11.5px; color: var(--text-tertiary);">
                        <span>Điểm giờ hiện tại: <strong style="color: var(--primary);">${s.currentHourLabel || '#00:00'}</strong></span>
                        <span>EST ROAS ngày: <strong style="color: ${s.estRoas >= 100 ? '#10b981' : '#f59e0b'};">${s.estRoas}%</strong></span>
                    </div>
                </div>

                <!-- Right: 9 KPI Cards -->
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                    <div class="stat-card" style="padding: 12px 14px;" id="kpiCardSpend">
                        <div class="stat-card-title">Spend</div>
                        <div class="stat-card-value" style="font-size: 19px; color: #3b82f6;" id="kpiValSpend">${formatKpiMain(s.spendVnd)}</div>
                        <div class="stat-card-footer" style="font-size: 10.5px; color: var(--text-tertiary);" id="kpiSubSpend">
                            ${formatKpiSub(s.spendVnd)}
                        </div>
                    </div>

                    <div class="stat-card" style="padding: 12px 14px;" id="kpiCardRev">
                        <div class="stat-card-title">Cutoff Rev</div>
                        <div class="stat-card-value" style="font-size: 19px; color: #10b981;" id="kpiValRev">${formatKpiMain(s.cutoffRevVnd)}</div>
                        <div class="stat-card-footer" style="font-size: 10.5px; color: var(--text-tertiary);" id="kpiSubRev">
                            ${formatKpiSub(s.cutoffRevVnd)}
                        </div>
                    </div>

                    <div class="stat-card" style="padding: 12px 14px;" id="kpiCardRoas">
                        <div class="stat-card-title">ROAS</div>
                        <div class="stat-card-value" style="font-size: 19px; color: ${roasPass ? '#10b981' : '#f59e0b'};" id="kpiValRoas">${s.roas} %</div>
                        <div class="stat-card-footer">
                            <span class="badge ${roasPass ? 'badge-success' : 'badge-warning'}" style="font-size: 10px;">
                                ${roasPass ? '✓ Đạt mục tiêu' : 'Cần tối ưu'}
                            </span>
                        </div>
                    </div>

                    <div class="stat-card" style="padding: 12px 14px;" id="kpiCardPl2">
                        <div class="stat-card-title">PL2</div>
                        <div class="stat-card-value" style="font-size: 19px; color: ${pl2Positive ? '#10b981' : '#ef4444'};" id="kpiValPl2">${formatKpiMain(s.pl2Vnd)}</div>
                        <div class="stat-card-footer" style="font-size: 10.5px; color: var(--text-tertiary);">Lợi nhuận ròng</div>
                    </div>

                    <div class="stat-card" style="padding: 12px 14px;" id="kpiCardPercentPl2">
                        <div class="stat-card-title">%PL2</div>
                        <div class="stat-card-value" style="font-size: 19px; color: ${pl2Positive ? '#10b981' : '#ef4444'};" id="kpiValPercentPl2">${s.percentPl2} %</div>
                        <div class="stat-card-footer" style="font-size: 10.5px; color: var(--text-tertiary);">Tỷ suất LN</div>
                    </div>

                    <div class="stat-card" style="padding: 12px 14px;" id="kpiCardEstRoas">
                        <div class="stat-card-title">EST ROAS</div>
                        <div class="stat-card-value" style="font-size: 19px; color: #3b82f6;" id="kpiValEstRoas">${s.estRoas} %</div>
                        <div class="stat-card-footer" style="font-size: 10.5px; color: var(--text-tertiary);">Dự báo cả ngày</div>
                    </div>

                    <div class="stat-card" style="padding: 12px 14px;" id="kpiCardInstalls">
                        <div class="stat-card-title">Total Install</div>
                        <div class="stat-card-value" style="font-size: 19px; color: #8b5cf6;" id="kpiValInstalls">${s.totalInstall >= 1000 ? (s.totalInstall / 1000).toFixed(2) + 'K' : s.totalInstall.toLocaleString('en-US')}</div>
                        <div class="stat-card-footer" style="font-size: 10.5px; color: var(--text-tertiary);">${s.totalInstall.toLocaleString('en-US')} lượt</div>
                    </div>

                    <div class="stat-card" style="padding: 12px 14px;" id="kpiCardCpi">
                        <div class="stat-card-title">CPI</div>
                        <div class="stat-card-value" style="font-size: 17px; font-family: var(--font-mono);" id="kpiValCpi">${formatUnitMoney(s.cpiVnd)}</div>
                        <div class="stat-card-footer" style="font-size: 10.5px; color: var(--text-tertiary);">Chi phí / cài đặt</div>
                    </div>

                    <div class="stat-card" style="padding: 12px 14px;" id="kpiCardLtv">
                        <div class="stat-card-title">LTV</div>
                        <div class="stat-card-value" style="font-size: 17px; font-family: var(--font-mono); color: #10b981;" id="kpiValLtv">${formatUnitMoney(s.ltvVnd)}</div>
                        <div class="stat-card-footer" style="font-size: 10.5px; color: var(--text-tertiary);">Cohort D0 / Install</div>
                    </div>
                </div>
            </div>

            <!-- Grand Total Strip Header -->
            <div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 10px 16px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; font-size: 12.5px; flex-wrap: wrap; gap: 10px;">
                <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
                    <span style="font-weight: 800; color: var(--primary);">GRAND TOTAL TOÀN CHIẾN DỊCH:</span>
                    <span>Spend: <strong>${formatGrandMoney(gt.spendVnd ?? s.spendVnd)}</strong></span>
                    <span>Cohort Rev: <strong style="color: #10b981;">${formatGrandMoney(gt.revenueVnd ?? s.cohortRevVnd)}</strong></span>
                    <span>Conversions: <strong>${Number(gt.conversions ?? s.totalInstall).toLocaleString('en-US')}</strong></span>
                    <span>ROASD0: <strong style="color: ${s.roas >= 100 ? '#10b981' : '#f59e0b'};">${gt.roasD0 ?? s.roas}%</strong></span>
                    <span>Est ROAS: <strong>${gt.estRoas ?? s.estRoas}%</strong></span>
                </div>
                <div style="font-size: 11px; color: var(--text-tertiary);" id="filterLastUpdate">
                    Cập nhật thời gian thực: <strong>${s.lastUpdate} (${s.displayDate})</strong>
                </div>
            </div>

            <!-- Full Hierarchical AG-Grid Style Table -->
            <div class="data-table-container">
                <div class="table-responsive" id="intradayTableWrap">
                    <table class="pandawind-table">
                        <thead>
                            <tr>
                                <th style="min-width: 290px;">Product Id / Channel / Campaign</th>
                                <th>Channel</th>
                                <th>Campaign Id</th>
                                <th>Status</th>
                                <th>Countries</th>
                                <th>Budget</th>
                                <th>ROASD0</th>
                                <th>ROASD0 T-1</th>
                                <th>Spend</th>
                                <th>Revenue</th>
                                <th>Conversion</th>
                                <th>CPI</th>
                                <th>LTV</th>
                                <th>Est Roas</th>
                                <th>Est Roas H1</th>
                                <th>ROASD0 T-2</th>
                                <th>ROASD0 T-3</th>
                                <th>Last update</th>
                            </tr>
                        </thead>
                        <tbody id="intradayTableBody">
                            ${this.renderTreeRows(report)}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    renderTreeRows(report) {
        const tree = (report && report.treeData) || [];
        if (tree.length === 0) {
            return `
                <tr>
                    <td colspan="18" style="text-align: center; padding: 36px; color: var(--text-tertiary);">
                        Không có chiến dịch nào khớp với bộ lọc hiện tại. Hãy nhấn <strong>Reset</strong> hoặc thêm dữ liệu mới.
                    </td>
                </tr>
            `;
        }

        const config = window.PANDAWIND_DATA.config;
        const isVnd = config.currency === 'VND';
        const rate = (report.summary && report.summary.exchangeRate) || 25718;

        const fmtCellMoney = (vndVal) => {
            const v = Number(vndVal || 0);
            if (isVnd) {
                if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
                if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
                return Math.round(v).toLocaleString('en-US');
            }
            const usd = v / rate;
            return '$' + usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        };

        const fmtUnit = (vndVal) => {
            const v = Number(vndVal || 0);
            if (v <= 0) return '-';
            if (isVnd) return Math.round(v).toLocaleString('en-US') + ' ₫';
            return '$' + (v / rate).toFixed(3);
        };

        const fmtRoas = (val, bold = false) => {
            if (val === null || val === undefined) {
                return '<span style="color: var(--text-tertiary);">N/A</span>';
            }
            const color = val >= 100 ? '#10b981' : '#f59e0b';
            return `<span style="color: ${color}; ${bold ? 'font-weight: 800;' : 'font-weight: 600;'}">${Number(val).toFixed(2)}%</span>`;
        };

        const fmtHistRoas = (val) => {
            if (val === null || val === undefined) return '<span style="color: var(--text-tertiary);">-</span>';
            return `${Number(val).toFixed(2)}%`;
        };

        let html = '';

        tree.forEach(prod => {
            const isProdOpen = !!this.state.expandedNodes[prod.id];
            html += `
                <tr class="tree-row-product" style="background: var(--bg-surface-subtle); font-weight: 700;">
                    <td>
                        <div class="tree-node">
                            <span class="tree-toggle-icon ${isProdOpen ? 'expanded' : ''}" onclick="IntradayModule.toggleNode('${prod.id}')">▶</span>
                            <span style="color: var(--primary);">📦 ${this.escapeHtml(prod.name)}</span>
                        </div>
                    </td>
                    <td><span class="badge badge-info">${this.escapeHtml(prod.channel)}</span></td>
                    <td>-</td>
                    <td><span class="badge ${prod.status === 'ON' ? 'badge-success' : 'badge-neutral'}">${prod.status}</span></td>
                    <td>Global</td>
                    <td>${fmtCellMoney(prod.budgetVnd)}</td>
                    <td>${fmtRoas(prod.roasD0, true)}</td>
                    <td>${fmtHistRoas(prod.roasD0T1)}</td>
                    <td title="${Math.round(prod.spendVnd).toLocaleString('vi-VN')} ₫">${fmtCellMoney(prod.spendVnd)}</td>
                    <td style="color: #10b981;" title="${Math.round(prod.revenueVnd).toLocaleString('vi-VN')} ₫">${fmtCellMoney(prod.revenueVnd)}</td>
                    <td>${Number(prod.conversions || 0).toLocaleString('en-US')}</td>
                    <td>${fmtUnit(prod.cpiVnd)}</td>
                    <td>${fmtUnit(prod.ltvVnd)}</td>
                    <td>${fmtHistRoas(prod.estRoas)}</td>
                    <td>${fmtHistRoas(prod.estRoasH1)}</td>
                    <td>${fmtHistRoas(prod.roasT2)}</td>
                    <td>${fmtHistRoas(prod.roasT3)}</td>
                    <td style="font-size: 11px; color: var(--text-tertiary);">${prod.lastUpdate || '-'}</td>
                </tr>
            `;

            if (isProdOpen && prod.children) {
                prod.children.forEach(ch => {
                    const isChOpen = !!this.state.expandedNodes[ch.id];
                    html += `
                        <tr class="tree-row-channel" style="background: var(--bg-surface);">
                            <td>
                                <div class="tree-node tree-indent-1">
                                    <span class="tree-toggle-icon ${isChOpen ? 'expanded' : ''}" onclick="IntradayModule.toggleNode('${ch.id}')">▶</span>
                                    <span>🌐 <strong>${this.escapeHtml(ch.name)}</strong></span>
                                </div>
                            </td>
                            <td><span class="badge badge-neutral">${this.escapeHtml(ch.channel)}</span></td>
                            <td>-</td>
                            <td><span class="badge ${ch.status === 'ON' ? 'badge-success' : 'badge-neutral'}">${ch.status}</span></td>
                            <td>All Target</td>
                            <td>${ch.budgetVnd > 0 ? fmtCellMoney(ch.budgetVnd) : '-'}</td>
                            <td>${fmtRoas(ch.roasD0, true)}</td>
                            <td>${fmtHistRoas(ch.roasD0T1)}</td>
                            <td>${fmtCellMoney(ch.spendVnd)}</td>
                            <td style="color: #10b981;">${fmtCellMoney(ch.revenueVnd)}</td>
                            <td>${Number(ch.conversions || 0).toLocaleString('en-US')}</td>
                            <td>${fmtUnit(ch.cpiVnd)}</td>
                            <td>${fmtUnit(ch.ltvVnd)}</td>
                            <td>${fmtHistRoas(ch.estRoas)}</td>
                            <td>${fmtHistRoas(ch.estRoasH1)}</td>
                            <td>${fmtHistRoas(ch.roasT2)}</td>
                            <td>${fmtHistRoas(ch.roasT3)}</td>
                            <td style="font-size: 11px; color: var(--text-tertiary);">${ch.lastUpdate || '-'}</td>
                        </tr>
                    `;

                    if (isChOpen && ch.children) {
                        ch.children.forEach(cmp => {
                            const isChecked = cmp.status === 'ON';
                            html += `
                                <tr class="tree-row-campaign" data-campaign-id="${this.escapeHtml(cmp.id)}">
                                    <td>
                                        <div class="tree-node tree-indent-2">
                                            <span style="color: var(--text-tertiary);">↳</span>
                                            <span title="${this.escapeHtml(cmp.name)}">🎯 ${this.escapeHtml(cmp.name)}</span>
                                        </div>
                                    </td>
                                    <td><span class="badge badge-neutral">${this.escapeHtml(cmp.channel)}</span></td>
                                    <td style="font-family: var(--font-mono); font-weight: 600;">${this.escapeHtml(cmp.externalCampaignId || cmp.campaignId)}</td>
                                    <td>
                                        <label class="switch-toggle" title="Bật / Tắt chiến dịch">
                                            <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="IntradayModule.toggleCampaignStatus('${this.escapeHtml(cmp.id)}', this.checked)">
                                            <span class="switch-slider"></span>
                                        </label>
                                    </td>
                                    <td><span class="badge badge-info">${this.escapeHtml(cmp.countries || 'Global')}</span></td>
                                    <td>${cmp.budgetVnd > 0 ? fmtCellMoney(cmp.budgetVnd) : '-'}</td>
                                    <td>${fmtRoas(cmp.roasD0, true)}</td>
                                    <td>${fmtHistRoas(cmp.roasD0T1)}</td>
                                    <td>${fmtCellMoney(cmp.spendVnd)}</td>
                                    <td style="color: #10b981;">${fmtCellMoney(cmp.revenueVnd)}</td>
                                    <td>${Number(cmp.conversions || 0).toLocaleString('en-US')}</td>
                                    <td>${fmtUnit(cmp.cpiVnd)}</td>
                                    <td>${fmtUnit(cmp.ltvVnd)}</td>
                                    <td>${fmtHistRoas(cmp.estRoas)}</td>
                                    <td>${fmtHistRoas(cmp.estRoasH1)}</td>
                                    <td>${fmtHistRoas(cmp.roasT2)}</td>
                                    <td>${fmtHistRoas(cmp.roasT3)}</td>
                                    <td style="font-size: 11px; color: var(--text-tertiary);">${cmp.lastUpdate || '-'}</td>
                                </tr>
                            `;
                        });
                    }
                });
            }
        });

        return html;
    },

    toggleNode(nodeId) {
        this.state.expandedNodes[nodeId] = !this.state.expandedNodes[nodeId];
        const tbody = document.getElementById('intradayTableBody');
        if (tbody) {
            tbody.innerHTML = this.renderTreeRows(this.getDisplayReport());
        }
    },

    async toggleCampaignStatus(campaignId, checked) {
        const nextStatus = checked ? 'ON' : 'OFF';
        try {
            await window.PandaWindApi.toggleCampaignStatus(campaignId, nextStatus);
            App.showToast(`Đã chuyển chiến dịch sang trạng thái ${nextStatus}`, 'success');
            await this.loadReport({ silent: true });
        } catch (err) {
            App.showToast(`Lỗi cập nhật trạng thái: ${err.message}`, 'danger');
        }
    },

    setChartMetric(metric) {
        this.state.chartMetric = metric;
        App.renderRoute();
    },

    onSearchInput(val) {
        this.state.searchTerm = val;
        if (this._searchTimer) clearTimeout(this._searchTimer);
        this._searchTimer = setTimeout(() => {
            this.loadReport({ silent: true });
        }, 250);
    },

    setFilter(key, val) {
        this.state[key] = val;
        if (key === 'filterProduct') {
            this.syncProductHeaderAndPills(val);
        }
        this.loadReport({ silent: true });
    },

    selectProductPill(prodId) {
        this.state.filterProduct = prodId;
        if (prodId !== 'All') {
            this.state.expandedNodes[prodId] = true;
        }
        this.syncProductHeaderAndPills(prodId);
        this.loadReport({ silent: true });
    },

    syncProductHeaderAndPills(prodId) {
        if (window.PANDAWIND_DATA && window.PANDAWIND_DATA.config) {
            window.PANDAWIND_DATA.config.activeProduct = prodId;
        }
        const label = document.getElementById('activeProductLabel');
        if (label) {
            const prod = window.PANDAWIND_DATA.products.find(p => p.id === prodId);
            label.textContent = prodId === 'All'
                ? 'Tất cả sản phẩm (All)'
                : (prod ? `${prod.code} - ${prod.name.split('-')[0].trim()}` : prodId);
        }
        const pillsWrap = document.getElementById('intradayProductPills');
        if (pillsWrap) {
            pillsWrap.querySelectorAll('.badge').forEach(b => {
                const txt = b.textContent.trim();
                b.className = `badge ${txt === prodId ? 'badge-info' : 'badge-neutral'}`;
            });
        }
        if (window.App && typeof window.App.updateBreadcrumb === 'function') {
            window.App.updateBreadcrumb();
        }
    },

    resetFilters() {
        this.state.filterDate = '';
        this.state.filterDivision = 'All';
        this.state.filterProduct = 'All';
        this.state.filterChannel = 'All';
        this.state.filterMarketer = 'All';
        this.state.filterCountry = 'All';
        this.state.searchTerm = '';
        this.syncProductHeaderAndPills('All');
        App.showToast('Đã đặt lại tất cả bộ lọc về mặc định', 'success');
        this.loadReport({ resetToolbar: true });
    },

    async loadReport(options = {}) {
        if (!window.PandaWindApi) return;
        try {
            this.state.isLoading = true;
            const data = await window.PandaWindApi.getIntradayReport(this.getFilterParams());
            this.reportData = data;
            this._lastFetchAt = Date.now();
            this.ensureAutoExpand(data);

            // Sync date input if empty
            if (!this.state.filterDate && data.summary && data.summary.date) {
                const dateEl = document.getElementById('intradayDateFilter');
                if (dateEl && !dateEl.value) dateEl.value = data.summary.date;
            }

            // Keep legacy global summary synced
            if (window.PANDAWIND_DATA && window.PANDAWIND_DATA.intraday) {
                Object.assign(window.PANDAWIND_DATA.intraday.summary, {
                    spendVnd: data.summary.spendVnd,
                    cutoffRevVnd: data.summary.cutoffRevVnd,
                    roas: data.summary.roas,
                    pl2Vnd: data.summary.pl2Vnd,
                    percentPl2: data.summary.percentPl2,
                    estRoas: data.summary.estRoas,
                    totalInstall: data.summary.totalInstall,
                    cpiVnd: data.summary.cpiVnd,
                    ltvVnd: data.summary.ltvVnd
                });
            }

            if (options.resetToolbar) {
                App.renderRoute();
                return;
            }

            this.updateDynamicBodyDom(data);
            if (options.flashCampaignIds) {
                this.flashRealtimeTargets(options.flashCampaignIds, options.flashTheme || 'green');
            }
        } catch (err) {
            this.state.lastError = err.message;
            // Keep existing fallback render cleanly
        } finally {
            this.state.isLoading = false;
        }
    },

    updateDynamicBodyDom(report) {
        const bodyEl = document.getElementById('intradayDynamicBody');
        if (!bodyEl) return;

        // Preserve horizontal/vertical table scroll position
        const oldWrap = document.getElementById('intradayTableWrap');
        const prevTop = oldWrap ? oldWrap.scrollTop : 0;
        const prevLeft = oldWrap ? oldWrap.scrollLeft : 0;

        bodyEl.innerHTML = this.renderDynamicBody(report);

        const newWrap = document.getElementById('intradayTableWrap');
        if (newWrap) {
            newWrap.scrollTop = prevTop;
            newWrap.scrollLeft = prevLeft;
        }

        this.drawChart(report);
    },

    async refreshFromRealtime(syncEvent) {
        const theme = (syncEvent && syncEvent.revDeltaTotal >= syncEvent.spendDeltaTotal) ? 'green' : 'blue';
        const campaignIds = (syncEvent && syncEvent.campaignIds) || [];
        await this.loadReport({
            silent: true,
            flashCampaignIds: campaignIds,
            flashTheme: theme
        });
    },

    flashRealtimeTargets(campaignIds = [], theme = 'green') {
        const cls = theme === 'green' ? 'flash-update-green' : 'flash-update-blue';
        const targets = [
            document.getElementById('kpiCardSpend'),
            document.getElementById('kpiCardRev'),
            document.getElementById('kpiCardRoas'),
            document.getElementById('kpiCardInstalls'),
            document.getElementById('intradayChartCard')
        ];

        campaignIds.forEach(cid => {
            const row = document.querySelector(`tr[data-campaign-id="${CSS.escape(cid)}"]`);
            if (row) targets.push(row);
        });

        targets.filter(Boolean).forEach(el => {
            el.classList.remove('flash-update-green', 'flash-update-blue');
            void el.offsetWidth;
            el.classList.add(cls);
            setTimeout(() => el.classList.remove(cls), 1400);
        });
    },

    exportExcel() {
        const config = window.PANDAWIND_DATA.config;
        if (window.PandaWindApi && window.PandaWindApi.isBackendOnline) {
            const params = Object.assign({}, this.getFilterParams(), { currency: config.currency });
            const url = window.PandaWindApi.getExportCsvUrl(params);
            const link = document.createElement('a');
            link.href = url;
            link.download = `PandaWind_Intraday_Report_${config.currency}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            App.showToast('Đang tải xuống file CSV Intraday Report từ Backend!', 'success');
            return;
        }

        // Offline fallback export from displayed report
        const report = this.getDisplayReport();
        const rows = [['Product Id', 'Channel', 'Campaign', 'Campaign Id', 'Countries', 'ROASD0', 'Spend', 'Revenue', 'Conversion']];
        report.treeData.forEach(p => {
            (p.children || []).forEach(ch => {
                (ch.children || []).forEach(c => {
                    rows.push([c.productId, c.channel, c.name, c.externalCampaignId, c.countries, c.roasD0 ?? 'N/A', c.spendVnd, c.revenueVnd, c.conversions]);
                });
            });
        });
        const csv = '\uFEFF' + rows.map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `PandaWind_Intraday_Offline_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        App.showToast('Đã xuất file CSV (chế độ Offline)!', 'success');
    },

    openGgsheetModal() {
        const modal = document.getElementById('ggsheetModalBackdrop');
        if (modal) modal.classList.add('open');
    },

    closeGgsheetModal() {
        const modal = document.getElementById('ggsheetModalBackdrop');
        if (modal) modal.classList.remove('open');
    },

    async submitGgsheetSync() {
        const input = document.getElementById('ggsheetUrlInput');
        const statusEl = document.getElementById('ggsheetSyncStatus');
        const url = input ? input.value.trim() : '';

        if (!url) {
            App.showToast('Vui lòng nhập đường dẫn Google Sheets!', 'warning');
            return;
        }

        if (statusEl) statusEl.textContent = 'Đang kết nối và kéo dữ liệu CSV từ Google Sheets...';
        try {
            const res = await window.PandaWindApi.syncGoogleSheet(url);
            if (statusEl) statusEl.textContent = `✓ Thành công! Đã đồng bộ ${res.importedCount} dòng vào PostgreSQL.`;
            App.showToast(`Đồng bộ GGSheet thành công (${res.importedCount} dòng)!`, 'success');
            this.closeGgsheetModal();
            await this.loadReport({ silent: true });
        } catch (err) {
            if (statusEl) statusEl.innerHTML = `<span style="color:#ef4444;">✕ ${this.escapeHtml(err.message)}</span>`;
            App.showToast(err.message, 'danger');
        }
    },

    drawChart(report) {
        const hourly = (report && report.hourly) || [];
        if (hourly.length === 0 || !window.PandaWindCharts) return;

        const config = window.PANDAWIND_DATA.config;
        const isVnd = config.currency === 'VND';
        const rate = (report.summary && report.summary.exchangeRate) || 25718;
        const labels = hourly.map(h => h.hour);

        if (this.state.chartMetric === 'spend_rev') {
            const spendData = hourly.map(h => isVnd ? h.spend / 1e6 : h.spend / rate);
            const revData = hourly.map(h => isVnd ? h.rev / 1e6 : h.rev / rate);
            const unitLabel = isVnd ? 'Triệu ₫' : 'USD';
            const valFmt = isVnd
                ? (v) => v.toFixed(2) + 'M ₫'
                : (v) => '$' + Math.round(v).toLocaleString('en-US');
            const yFmt = isVnd ? (v) => v.toFixed(1) + 'M' : (v) => '$' + Math.round(v);

            window.PandaWindCharts.renderLineChart('intradayHourlyCanvas', {
                labels,
                datasets: [
                    {
                        label: `Cutoff Rev (${unitLabel})`,
                        data: revData,
                        borderColor: '#10b981',
                        fill: true,
                        fillColor: 'rgba(16, 185, 129, 0.2)',
                        tooltipValueFormatter: valFmt
                    },
                    {
                        label: `Spend (${unitLabel})`,
                        data: spendData,
                        borderColor: '#3b82f6',
                        fill: true,
                        fillColor: 'rgba(59, 130, 246, 0.1)',
                        tooltipValueFormatter: valFmt
                    }
                ],
                yAxisFormatter: yFmt
            });
        } else if (this.state.chartMetric === 'roas') {
            const roasData = hourly.map(h => h.roas);
            window.PandaWindCharts.renderLineChart('intradayHourlyCanvas', {
                labels,
                baselineY: 100,
                datasets: [
                    {
                        label: 'ROAS D0 (%)',
                        data: roasData,
                        borderColor: '#8b5cf6',
                        fill: true,
                        fillColor: 'rgba(139, 92, 246, 0.15)',
                        tooltipValueFormatter: (v) => v.toFixed(1) + '%'
                    }
                ],
                yAxisFormatter: (v) => v.toFixed(0) + '%'
            });
        } else {
            const installsData = hourly.map(h => h.installs);
            window.PandaWindCharts.renderLineChart('intradayHourlyCanvas', {
                labels,
                datasets: [
                    {
                        label: 'Installs / Hour',
                        data: installsData,
                        borderColor: '#f59e0b',
                        fill: true,
                        fillColor: 'rgba(245, 158, 11, 0.15)',
                        tooltipValueFormatter: (v) => Math.round(v).toLocaleString('en-US') + ' installs'
                    }
                ],
                yAxisFormatter: (v) => Math.round(v).toLocaleString('en-US')
            });
        }
    },

    initCharts() {
        const report = this.getDisplayReport();
        this.drawChart(report);

        if (window.RealtimeEngine && typeof window.RealtimeEngine.updateHeaderBadge === 'function') {
            window.RealtimeEngine.updateHeaderBadge();
        }

        // Always fetch fresh report from backend if not fetched in the last 1.5s
        if (Date.now() - this._lastFetchAt > 1500) {
            this.loadReport({ silent: true });
        }
    },

    escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
};

window.IntradayModule = IntradayModule;
