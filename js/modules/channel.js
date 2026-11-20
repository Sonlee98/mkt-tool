/**
 * Module: Channel Report (Báo cáo Hiệu suất Đa kênh)
 */

const ChannelModule = {
    state: {
        filterProduct: 'AIP922',
        showColumnsModal: false,
        visibleColumns: {
            cohortRev: true,
            userD0: true,
            installs: true,
            cost: true,
            cpi: true,
            ltvD0: true,
            ltvD7: true,
            roasD0: true,
            roasD7: true,
            roasAll: true,
            r1: true,
            r7: true,
            churnD0: true,
            formats: true
        }
    },

    render() {
        const data = window.PANDAWIND_DATA.channels;
        const s = data.summary;
        const config = window.PANDAWIND_DATA.config;

        return `
            <div class="page-title-bar">
                <div class="page-heading">
                    <h1>Channel Report</h1>
                    <p>Phân tích chuyên sâu chi phí, lượt cài đặt, LTV và ROAS trên từng kênh quảng cáo & Organic</p>
                </div>
                <div class="page-actions">
                    <button class="btn btn-outline btn-sm" onclick="ChannelModule.openColumnsModal()">
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16m-7 6h7"/></svg>
                        Tùy chỉnh Cột (Columns)
                    </button>
                    <button class="btn btn-primary btn-sm" onclick="App.showToast('Đang xuất báo cáo Kênh...', 'info'); setTimeout(() => App.showToast('Đã xuất Excel thành công!', 'success'), 500)">
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        Xuất Excel
                    </button>
                </div>
            </div>

            <!-- Summary KPI Strip -->
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-card-title">Tổng Chi phí UA (Paid)</div>
                    <div class="stat-card-value" style="color: #ef4444;">$${(s.totalCostUsd / 1000).toFixed(1)}K</div>
                    <div class="stat-card-footer"><span class="delta-badge positive">All Channels</span></div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-title">Tổng Cohort Revenue</div>
                    <div class="stat-card-value" style="color: #10b981;">$${(s.totalRevUsd / 1000).toFixed(1)}K</div>
                    <div class="stat-card-footer"><span class="delta-badge positive">Bao gồm Organic</span></div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-title">ROAS Toàn Kênh (Grand)</div>
                    <div class="stat-card-value" style="color: #3b82f6;">${s.grandRoas}</div>
                    <div class="stat-card-footer"><span class="delta-badge positive">Lãi ròng tốt</span></div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-title">Tổng Lượt Cài Đặt (Installs)</div>
                    <div class="stat-card-value">${s.totalInstalls}</div>
                    <div class="stat-card-footer"><span style="color: var(--text-tertiary);">Paid: 3.28M | Organic: 1.84M</span></div>
                </div>
            </div>

            <!-- Double Charts: Channel Spend vs Revenue & Ad Format Split -->
            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 16px; margin-bottom: 20px;">
                <div class="chart-card" style="margin-bottom: 0;">
                    <div class="chart-header">
                        <div class="chart-title">So sánh Chi phí (Cost) & Doanh thu (Cohort Rev) theo Kênh</div>
                    </div>
                    <div class="chart-canvas-wrap">
                        <canvas id="channelBarCanvas"></canvas>
                    </div>
                </div>

                <div class="chart-card" style="margin-bottom: 0;">
                    <div class="chart-header">
                        <div class="chart-title">Cơ cấu Doanh thu Định dạng Quảng cáo</div>
                    </div>
                    <div class="chart-canvas-wrap" style="height: 240px;">
                        <canvas id="channelFormatDonutCanvas"></canvas>
                    </div>
                    <div style="font-size: 11.5px; text-align: center; color: var(--text-tertiary); margin-top: 8px;">
                        Interstitial (50%) | Native (31%) | Rewarded (19%)
                    </div>
                </div>
            </div>

            <!-- Detailed Channel Table -->
            <div class="data-table-container">
                <div class="table-responsive">
                    <table class="pandawind-table">
                        <thead>
                            <tr>
                                <th>No.</th>
                                <th>Kênh Quảng Cáo</th>
                                <th>Cohort Rev</th>
                                <th>User D0</th>
                                <th>Installs</th>
                                <th>Chi phí UA</th>
                                <th>CPI</th>
                                <th>LTV D0</th>
                                <th>LTV D7</th>
                                <th>ROAS D0</th>
                                <th>ROAS D7</th>
                                <th>ROAS All</th>
                                <th>R1</th>
                                <th>R7</th>
                                <th>Churn D0</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.items.map((ch, idx) => `
                                <tr>
                                    <td>${idx + 1}</td>
                                    <td>
                                        <div style="display: flex; align-items: center; gap: 8px; font-weight: 600;">
                                            <span style="font-size: 16px;">${ch.code === 'Facebook' ? '🟦' : ch.code === 'Tiktok' ? '⬛' : ch.code === 'GoogleAds' ? '🟥' : '🟩'}</span>
                                            <span>${ch.name}</span>
                                        </div>
                                    </td>
                                    <td style="color: #10b981; font-weight: 600;">$${ch.cohortRevUsd.toLocaleString()}</td>
                                    <td>${ch.userD0}</td>
                                    <td>${ch.installs}</td>
                                    <td style="color: #ef4444;">$${ch.costUsd.toLocaleString()}</td>
                                    <td>$${ch.cpi.toFixed(4)}</td>
                                    <td>$${ch.ltvD0.toFixed(4)}</td>
                                    <td>$${ch.ltvD7.toFixed(4)}</td>
                                    <td style="color: #10b981;">${ch.roasD0}</td>
                                    <td style="color: #10b981; font-weight: 600;">${ch.roasD7}</td>
                                    <td><span class="badge ${ch.roasAll !== 'N/A' && parseFloat(ch.roasAll) >= 100 ? 'badge-success' : 'badge-warning'}">${ch.roasAll}</span></td>
                                    <td>${ch.r1}</td>
                                    <td>${ch.r7}</td>
                                    <td>${ch.churnD0}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr class="grand-total-row">
                                <td colspan="2">Grand Total (Tất cả Kênh)</td>
                                <td style="color: #10b981;">$${s.totalRevUsd.toLocaleString()}</td>
                                <td>5.05M</td>
                                <td>${s.totalInstalls}</td>
                                <td style="color: #ef4444;">$${s.totalCostUsd.toLocaleString()}</td>
                                <td>$0.1079</td>
                                <td>$0.138</td>
                                <td>$0.169</td>
                                <td>82.4%</td>
                                <td>104.2%</td>
                                <td><span class="badge badge-success">${s.grandRoas}</span></td>
                                <td>39.2%</td>
                                <td>17.1%</td>
                                <td>60.8%</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            <!-- Custom Columns Modal -->
            <div class="modal-backdrop ${this.state.showColumnsModal ? 'open' : ''}" id="columnsModalBackdrop">
                <div class="modal-box" style="max-width: 480px;">
                    <div class="modal-header">
                        <div class="modal-title">Tùy chỉnh Cột Báo Cáo Kênh</div>
                        <button class="modal-close-btn" onclick="ChannelModule.closeColumnsModal()">✕</button>
                    </div>
                    <div class="modal-body">
                        <p style="font-size: 13px; color: var(--text-tertiary); margin-bottom: 10px;">Chọn các chỉ số bạn muốn hiển thị trên bảng Channel Report:</p>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px;">
                            <label><input type="checkbox" checked> Cohort Rev</label>
                            <label><input type="checkbox" checked> User D0</label>
                            <label><input type="checkbox" checked> Installs</label>
                            <label><input type="checkbox" checked> Cost USD</label>
                            <label><input type="checkbox" checked> CPI & CPU</label>
                            <label><input type="checkbox" checked> LTV D0 & D7</label>
                            <label><input type="checkbox" checked> ROAS D0, D7, All</label>
                            <label><input type="checkbox" checked> Retention R1 & R7</label>
                            <label><input type="checkbox" checked> Churn Rate D0/D7</label>
                            <label><input type="checkbox" checked> Doanh thu Định dạng Ad</label>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-outline btn-sm" onclick="ChannelModule.closeColumnsModal()">Hủy</button>
                        <button class="btn btn-primary btn-sm" onclick="ChannelModule.saveColumns()">Áp dụng</button>
                    </div>
                </div>
            </div>
        `;
    },

    openColumnsModal() {
        this.state.showColumnsModal = true;
        const modal = document.getElementById('columnsModalBackdrop');
        if (modal) modal.classList.add('open');
    },

    closeColumnsModal() {
        this.state.showColumnsModal = false;
        const modal = document.getElementById('columnsModalBackdrop');
        if (modal) modal.classList.remove('open');
    },

    saveColumns() {
        this.closeColumnsModal();
        App.showToast('Đã cập nhật cấu hình cột thành công!', 'success');
    },

    initCharts() {
        const items = window.PANDAWIND_DATA.channels.items.slice(0, 3);
        const labels = items.map(i => i.name);
        const costData = items.map(i => i.costUsd / 1000);
        const revData = items.map(i => i.cohortRevUsd / 1000);

        window.PandaWindCharts.renderBarChart('channelBarCanvas', {
            labels: labels,
            datasets: [
                {
                    label: 'Chi phí ($K)',
                    data: costData,
                    backgroundColor: '#ef4444'
                },
                {
                    label: 'Doanh thu ($K)',
                    data: revData,
                    backgroundColor: '#10b981'
                }
            ],
            yAxisFormatter: (v) => '$' + v.toFixed(0) + 'K'
        });

        // Ad format donut
        window.PandaWindCharts.renderDonutChart('channelFormatDonutCanvas', {
            labels: ['Interstitial', 'Native', 'Rewarded', 'Banner'],
            data: [320, 202, 119, 63],
            colors: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'],
            centerText: { value: '$704K', label: 'Ad Revenue' }
        });
    }
};

window.ChannelModule = ChannelModule;
