/**
 * Module: Monetization Report (Báo cáo Doanh thu Kiếm tiền: AdMob/MAX vs IAP)
 */

const MonetizationModule = {
    render() {
        const mon = window.PANDAWIND_DATA.monetization;
        const s = mon.summary;

        return `
            <div class="page-title-bar">
                <div class="page-heading">
                    <h1>Monetization Report</h1>
                    <p>Phân tích chi tiết nguồn doanh thu từ Mạng quảng cáo (Ad Mediation) và Gói đăng ký ứng dụng (IAP Subscriptions)</p>
                </div>
                <div class="page-actions">
                    <button class="btn btn-primary btn-sm" onclick="App.showToast('Đã xuất báo cáo Monetization!', 'success')">Xuất Báo Cáo</button>
                </div>
            </div>

            <!-- Top Stats -->
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-card-title">Tổng Doanh Thu Hợp Nhất</div>
                    <div class="stat-card-value" style="color: #10b981;">${s.totalRevenue}</div>
                    <div class="stat-card-footer"><span class="delta-badge positive">+16.4% MoM</span></div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-title">Doanh Thu Quảng Cáo (Ads)</div>
                    <div class="stat-card-value">${s.adRevenue}</div>
                    <div class="stat-card-footer"><span style="color: var(--text-tertiary);">AppLovin, AdMob, Mintegral</span></div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-title">Doanh Thu Mua Gói (IAP)</div>
                    <div class="stat-card-value" style="color: #3b82f6;">${s.iapRevenue}</div>
                    <div class="stat-card-footer"><span class="delta-badge positive">Tỷ lệ giữ gói cao</span></div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-title">eCPM Trung Bình</div>
                    <div class="stat-card-value">${s.overallEcpm}</div>
                    <div class="stat-card-footer"><span style="color: var(--text-tertiary);">ARPDAU: ${s.overallArpdau}</span></div>
                </div>
            </div>

            <!-- Networks Table -->
            <div class="data-table-container">
                <div style="padding: 14px 18px; border-bottom: 1px solid var(--border-color); font-weight: 700;">
                    Mạng Quảng Cáo Hòa Giải (Ad Mediation Networks)
                </div>
                <div class="table-responsive">
                    <table class="pandawind-table">
                        <thead>
                            <tr>
                                <th>Mạng Quảng Cáo</th>
                                <th>Định Dạng Hỗ Trợ</th>
                                <th>Doanh Thu (USD)</th>
                                <th>eCPM</th>
                                <th>Lượt Hiển Thị (Impressions)</th>
                                <th>Tỷ Lệ Lấp Đầy (Fill Rate)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${mon.networks.map(n => `
                                <tr>
                                    <td><strong>${n.name}</strong></td>
                                    <td><span class="badge badge-neutral">${n.format}</span></td>
                                    <td style="color: #10b981; font-weight: 600;">$${n.revUsd.toLocaleString()}</td>
                                    <td><strong style="color: var(--primary);">${n.ecpm}</strong></td>
                                    <td>${n.impressions}</td>
                                    <td><span class="badge badge-success">${n.fillRate}</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- IAP Plans Breakdown -->
            <div class="data-table-container">
                <div style="padding: 14px 18px; border-bottom: 1px solid var(--border-color); font-weight: 700;">
                    Cơ Cấu Gói Đăng Ký In-App Purchase (IAP)
                </div>
                <div class="table-responsive">
                    <table class="pandawind-table">
                        <thead>
                            <tr>
                                <th>Gói Sản Phẩm (Plan)</th>
                                <th>Người Dùng Đang Đăng Ký</th>
                                <th>Tỷ Trọng Doanh Thu</th>
                                <th>Tỷ Lệ Chuyển Đổi (CVR)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${mon.iapPlans.map(p => `
                                <tr>
                                    <td><strong>${p.plan}</strong></td>
                                    <td>${p.users}</td>
                                    <td><span class="badge badge-info">${p.revShare}</span></td>
                                    <td><strong style="color: #10b981;">${p.conversion}</strong></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    initCharts() {}
};

window.MonetizationModule = MonetizationModule;
