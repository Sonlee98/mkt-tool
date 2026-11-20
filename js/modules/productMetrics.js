/**
 * Module: Product Metrics Overview (Chỉ số Hệ quả & Chỉ số Hữu ích)
 */

const ProductMetricsModule = {
    state: {
        userType: 'all', // 'all' | 'new_user' | 'return_user'
        version: 'all',
        sessionFrequency: 'all'
    },

    render() {
        const pm = window.APERO_DATA.productMetrics;
        const kpis = pm.kpis;

        return `
            <div class="page-title-bar">
                <div class="page-heading">
                    <h1>Product Metrics Overview</h1>
                    <p>Phân tích chỉ số sản phẩm, mức độ gắn kết người dùng và phễu tính năng hữu ích cho ${pm.app}</p>
                </div>
                <div class="page-actions">
                    <button class="btn btn-outline btn-sm" onclick="App.showToast('Đang tải dữ liệu sản phẩm...', 'info')">Làm mới</button>
                    <button class="btn btn-primary btn-sm" onclick="App.showToast('Đã xuất báo cáo Chỉ số Sản phẩm!', 'success')">Xuất Báo Cáo</button>
                </div>
            </div>

            <!-- Filter Strip (Matching Original Apero Header) -->
            <div class="filter-toolbar">
                <div class="filter-group-left">
                    <select class="filter-select" onchange="ProductMetricsModule.setUserType(this.value)">
                        <option value="all">User Type: Tất cả (new_user, return_user)</option>
                        <option value="new_user">Chỉ New Users (Người dùng mới)</option>
                        <option value="return_user">Chỉ Returning Users (Người dùng quay lại)</option>
                    </select>
                    <select class="filter-select">
                        <option value="all">Daily App Version: All Versions</option>
                        <option value="3.5.0">Phiên bản 3.5.0 (Latest)</option>
                        <option value="3.3.0">Phiên bản 3.3.0</option>
                        <option value="3.2.1">Phiên bản 3.2.1</option>
                    </select>
                    <select class="filter-select">
                        <option value="all">Frequency: Tất cả (, 1, 2+ Sessions)</option>
                        <option value="1">1 Session / Ngày</option>
                        <option value="2+">2+ Sessions / Ngày (High Frequency)</option>
                    </select>
                    <select class="filter-select">
                        <option value="All">Quốc gia: Tất cả</option>
                        <option value="US">United States</option>
                        <option value="Peru">Peru</option>
                        <option value="India">India</option>
                    </select>
                </div>
                <div class="filter-group-right">
                    <span class="badge badge-info">App ID: AIP922</span>
                </div>
            </div>

            <!-- Top KPIs Banner -->
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-card-title">DAU (Daily Active)</div>
                    <div class="stat-card-value">${kpis.dau}</div>
                    <div class="stat-card-footer"><span class="delta-badge positive">+14.2%</span> <span style="color: var(--text-tertiary);">MAU: ${kpis.mau}</span></div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-title">Thời lượng Phiên TB</div>
                    <div class="stat-card-value">${kpis.avgSessionLength}</div>
                    <div class="stat-card-footer"><span style="color: var(--text-tertiary);">${kpis.sessionsPerUser} sessions / user / ngày</span></div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-title">ARPDAU</div>
                    <div class="stat-card-value" style="color: #10b981;">${kpis.arpdau}</div>
                    <div class="stat-card-footer"><span style="color: var(--text-tertiary);">IAP ${kpis.iapRevShare} | Ads ${kpis.adRevShare}</span></div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-title">Paywall CVR</div>
                    <div class="stat-card-value" style="color: #3b82f6;">${kpis.paywallCvr}</div>
                    <div class="stat-card-footer"><span class="delta-badge positive">+0.6% pts</span> <span style="color: var(--text-tertiary);">Chuyển đổi mua gói</span></div>
                </div>
            </div>

            <!-- Section 1: Chỉ số hệ quả (Outcome Metrics) -->
            <div style="margin-top: 10px; margin-bottom: 24px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 14px;">
                    <span style="font-size: 18px;">🎯</span>
                    <h2 style="font-size: 16px; font-weight: 700; color: var(--text-primary);">Chỉ số hệ quả (Outcome Metrics)</h2>
                    <span class="badge badge-neutral">Tăng trưởng & Doanh thu</span>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px;">
                    ${pm.outcomeMetrics.map(m => `
                        <div class="stat-card" style="padding: 14px 16px;">
                            <div class="stat-card-title">${m.name}</div>
                            <div class="stat-card-value" style="font-size: 18px; margin-top: 4px;">${m.value}</div>
                            <div class="stat-card-footer">
                                <span class="delta-badge ${m.trend === 'up' ? 'positive' : 'negative'}">${m.delta}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <!-- Retention Curve Chart -->
                <div class="chart-card">
                    <div class="chart-header">
                        <div>
                            <div class="chart-title">Đường cong Giữ chân Người dùng (Retention Curve D0 - D28)</div>
                            <p style="font-size: 11.5px; color: var(--text-tertiary); margin-top: 2px;">Tỷ lệ người dùng tiếp tục mở app theo thời gian</p>
                        </div>
                        <span class="badge badge-success">D1: 38.4% | D7: 16.8%</span>
                    </div>
                    <div class="chart-canvas-wrap">
                        <canvas id="retentionCurveCanvas"></canvas>
                    </div>
                </div>
            </div>

            <!-- Section 2: Chỉ số hữu ích (Useful & Engagement Metrics) -->
            <div>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 14px;">
                    <span style="font-size: 18px;">💡</span>
                    <h2 style="font-size: 16px; font-weight: 700; color: var(--text-primary);">Chỉ số hữu ích (Useful Engagement & Funnel Metrics)</h2>
                    <span class="badge badge-neutral">Trải nghiệm & Giá trị cốt lõi</span>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px;">
                    ${pm.usefulMetrics.map(u => `
                        <div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; box-shadow: var(--shadow-sm);">
                            <div style="display: flex; align-items: center; justify-content: space-between;">
                                <span style="font-size: 12.5px; font-weight: 600; color: var(--text-secondary);">${u.name}</span>
                                <span style="font-size: 16px; font-weight: 800; color: var(--primary);">${u.value}</span>
                            </div>
                            <p style="font-size: 11.5px; color: var(--text-tertiary);">${u.desc}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    },

    setUserType(type) {
        this.state.userType = type;
        App.showToast(`Lọc theo loại user: ${type}`, 'info');
    },

    initCharts() {
        const retData = window.APERO_DATA.productMetrics.retentionCurve;
        const labels = retData.map(r => r.day);
        const vals = retData.map(r => r.retention);

        window.AperoCharts.renderLineChart('retentionCurveCanvas', {
            labels: labels,
            datasets: [
                {
                    label: 'Tỷ lệ Giữ chân (%)',
                    data: vals,
                    borderColor: '#3b82f6',
                    fill: true,
                    fillColor: 'rgba(59, 130, 246, 0.15)'
                }
            ],
            yAxisFormatter: (v) => v.toFixed(0) + '%'
        });
    }
};

window.ProductMetricsModule = ProductMetricsModule;
