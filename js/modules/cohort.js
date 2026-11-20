/**
 * Module: Cohort Report (Báo cáo LTV & ROAS Cohort Heatmap)
 */

const CohortModule = {
    state: {
        viewMode: 'roas', // 'roas' | 'ltv'
        dayOrder: '>= 0',
        filterChannel: 'All'
    },

    render() {
        const data = window.APERO_DATA.cohort;
        const config = window.APERO_DATA.config;

        const getHeatClass = (val) => {
            if (val >= 130) return 'heat-level-5';
            if (val >= 115) return 'heat-level-4';
            if (val >= 100) return 'heat-level-3';
            if (val >= 90) return 'heat-level-2';
            return 'heat-level-1';
        };

        return `
            <div class="page-title-bar">
                <div class="page-heading">
                    <h1>Cohort Report (ROAS & LTV Heatmap)</h1>
                    <p>Theo dõi tỷ lệ hoàn vốn ROAS và giá trị trọn đời LTV theo từng lứa người dùng (Install Date Cohort)</p>
                </div>
                <div class="page-actions">
                    <div class="currency-toggle">
                        <button class="currency-btn ${this.state.viewMode === 'roas' ? 'active' : ''}" onclick="CohortModule.setViewMode('roas')">ROAS %</button>
                        <button class="currency-btn ${this.state.viewMode === 'ltv' ? 'active' : ''}" onclick="CohortModule.setViewMode('ltv')">LTV ($)</button>
                    </div>
                    <button class="btn btn-primary btn-sm" onclick="CohortModule.exportExcel()">
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        Xuất Heatmap
                    </button>
                </div>
            </div>

            <!-- Heatmap Legend Strip -->
            <div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 10px 16px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; font-size: 12px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-weight: 600; color: var(--text-secondary);">Thang đo ROAS:</span>
                    <span class="badge" style="background: #059669; color: white;">≥ 130% Siêu lợi nhuận</span>
                    <span class="badge" style="background: #10b981; color: white;">115% - 129% Lợi nhuận cao</span>
                    <span class="badge" style="background: #34d399; color: #064e3b;">100% - 114% Hòa vốn / Có lãi</span>
                    <span class="badge" style="background: #fbbf24; color: #78350f;">90% - 99% Cận hòa vốn</span>
                    <span class="badge" style="background: #f87171; color: white;">< 90% Cần tối ưu</span>
                </div>
                <div style="color: var(--text-tertiary);">
                    Sản phẩm: <strong>${data.summary.app}</strong> | Day Order: <strong>${data.summary.dayOrder}</strong>
                </div>
            </div>

            <!-- Filter Toolbar -->
            <div class="filter-toolbar">
                <div class="filter-group-left">
                    <select class="filter-select" onchange="CohortModule.onFilterDayOrder(this.value)">
                        <option value=">= 0">Day order: >= 0 (Tất cả ngày)</option>
                        <option value=">= 1">Day order: >= 1</option>
                        <option value=">= 7">Day order: >= 7</option>
                    </select>
                    <select class="filter-select">
                        <option value="All">Kênh: Tất cả Kênh</option>
                        <option value="Facebook">Facebook Ads</option>
                        <option value="TikTok">TikTok Ads</option>
                        <option value="GoogleAds">Google Ads</option>
                    </select>
                    <select class="filter-select">
                        <option value="All">Quốc gia: Tất cả</option>
                        <option value="US">United States</option>
                        <option value="Peru">Peru</option>
                        <option value="India">India</option>
                    </select>
                </div>
                <div class="filter-group-right">
                    <span style="font-size: 12px; color: var(--text-tertiary);">Dữ liệu Cohort hoàn chỉnh đến: <strong>D90</strong></span>
                </div>
            </div>

            <!-- Cohort Matrix Table -->
            <div class="data-table-container">
                <div class="table-responsive">
                    <table class="apero-table">
                        <thead>
                            <tr>
                                <th>First Open Time</th>
                                <th>Cohort Users</th>
                                <th>Installs</th>
                                <th>Cost USD</th>
                                <th>CPI</th>
                                <th>R1</th>
                                <th>R7</th>
                                <th style="text-align: center;">D0</th>
                                <th style="text-align: center;">D1</th>
                                <th style="text-align: center;">D3</th>
                                <th style="text-align: center;">D7</th>
                                <th style="text-align: center;">D14</th>
                                <th style="text-align: center;">D21</th>
                                <th style="text-align: center;">D28</th>
                                <th style="text-align: center;">D35</th>
                                <th style="text-align: center;">D60</th>
                                <th style="text-align: center;">D90</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.rows.map(r => `
                                <tr>
                                    <td><strong>${r.date}</strong></td>
                                    <td>${r.userD0}</td>
                                    <td>${r.installs}</td>
                                    <td>$${r.costUsd.toLocaleString()}</td>
                                    <td>${r.cpi}</td>
                                    <td><span style="color: #10b981;">${r.r1}</span></td>
                                    <td><span style="color: #6366f1;">${r.r7}</span></td>
                                    <td class="cohort-cell ${getHeatClass(r.d0)}">${r.d0.toFixed(1)}%</td>
                                    <td class="cohort-cell ${getHeatClass(r.d1)}">${r.d1.toFixed(1)}%</td>
                                    <td class="cohort-cell ${getHeatClass(r.d3)}">${r.d3.toFixed(1)}%</td>
                                    <td class="cohort-cell ${getHeatClass(r.d7)}">${r.d7.toFixed(1)}%</td>
                                    <td class="cohort-cell ${getHeatClass(r.d14)}">${r.d14.toFixed(1)}%</td>
                                    <td class="cohort-cell ${getHeatClass(r.d21)}">${r.d21.toFixed(1)}%</td>
                                    <td class="cohort-cell ${getHeatClass(r.d28)}">${r.d28.toFixed(1)}%</td>
                                    <td class="cohort-cell ${getHeatClass(r.d35)}">${r.d35.toFixed(1)}%</td>
                                    <td class="cohort-cell ${getHeatClass(r.d60)}">${r.d60.toFixed(1)}%</td>
                                    <td class="cohort-cell ${getHeatClass(r.d90)}">${r.d90.toFixed(1)}%</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    setViewMode(mode) {
        this.state.viewMode = mode;
        App.showToast(`Chuyển sang chế độ xem: ${mode.toUpperCase()}`, 'info');
        App.renderRoute();
    },

    onFilterDayOrder(val) {
        this.state.dayOrder = val;
        App.showToast(`Đã lọc Day Order: ${val}`, 'info');
    },

    exportExcel() {
        App.showToast('Đang tạo file Excel Cohort Matrix...', 'info');
        setTimeout(() => {
            App.showToast('Đã xuất file Cohort Heatmap thành công!', 'success');
        }, 500);
    },

    initCharts() {
        // no canvas needed for heatmap, rendered via HTML grid
    }
};

window.CohortModule = CohortModule;
