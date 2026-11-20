/**
 * Module: Compare App Version (So sánh Phiên bản Ứng dụng A/B)
 */

const CompareVersionModule = {
    state: {
        versionA: '3.3.0',
        versionB: '3.5.0',
        activeCategory: 'All'
    },

    render() {
        const comp = window.PANDAWIND_DATA.versionComparison;

        const categories = ['All', 'Chỉ số hệ quả', 'LTV', 'Retention', 'Churn', 'LTFE (Final Event)'];

        const filteredMetrics = this.state.activeCategory === 'All'
            ? comp.metrics
            : comp.metrics.filter(m => m.category.toLowerCase().includes(this.state.activeCategory.toLowerCase()));

        return `
            <div class="page-title-bar">
                <div class="page-heading">
                    <h1>Compare App Version</h1>
                    <p>So sánh A/B toàn diện các chỉ số tăng trưởng, giữ chân, LTV và phễu sự kiện giữa hai phiên bản app</p>
                </div>
                <div class="page-actions">
                    <span class="badge badge-warning" style="padding: 6px 12px; font-size: 12px;">
                        ⚠️ Lưu ý: Chọn ngày có số lượng new users lớn để kết quả so sánh đạt độ tin cậy thống kê cao nhất
                    </span>
                    <button class="btn btn-primary btn-sm" onclick="App.showToast('Đã xuất báo cáo so sánh phiên bản!', 'success')">Xuất Báo Cáo</button>
                </div>
            </div>

            <!-- Version Selector Banner -->
            <div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 16px 20px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; box-shadow: var(--shadow-sm);">
                <div style="display: flex; align-items: center; gap: 16px;">
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <span style="font-size: 11px; text-transform: uppercase; color: var(--text-tertiary); font-weight: 600;">Phiên bản Gốc (Baseline A)</span>
                        <select class="filter-select" style="font-weight: 700; color: #f59e0b;" onchange="CompareVersionModule.setVersionA(this.value)">
                            <option value="3.3.0" selected>Version 3.3.0 (Old Release)</option>
                            <option value="3.2.1">Version 3.2.1</option>
                            <option value="3.1.0">Version 3.1.0</option>
                        </select>
                    </div>

                    <div style="font-size: 20px; color: var(--text-tertiary); font-weight: 800; padding-top: 14px;">VS</div>

                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <span style="font-size: 11px; text-transform: uppercase; color: var(--text-tertiary); font-weight: 600;">Phiên bản Mới (Target B)</span>
                        <select class="filter-select" style="font-weight: 700; color: #10b981;" onchange="CompareVersionModule.setVersionB(this.value)">
                            <option value="3.5.0" selected>Version 3.5.0 (New AI Video Model)</option>
                            <option value="3.4.2">Version 3.4.2</option>
                        </select>
                    </div>
                </div>

                <div style="display: flex; gap: 14px;">
                    <div style="text-align: right;">
                        <div style="font-size: 11px; color: var(--text-tertiary);">Đánh giá chung:</div>
                        <div style="font-size: 15px; font-weight: 800; color: #10b981;">v3.5.0 VƯỢT TRỘI (+22.4% Avg)</div>
                    </div>
                </div>
            </div>

            <!-- Comparison Bar Chart Card -->
            <div class="chart-card">
                <div class="chart-header">
                    <div class="chart-title">So sánh LTV trọn đời giữa Version 3.3.0 và Version 3.5.0 ($ USD)</div>
                    <span class="badge badge-success">LTV D28 tăng trưởng +26.9%</span>
                </div>
                <div class="chart-canvas-wrap">
                    <canvas id="compareLtvBarCanvas"></canvas>
                </div>
            </div>

            <!-- Category Filter Tabs -->
            <div class="tabs-header">
                ${categories.map(cat => `
                    <button class="tab-btn ${this.state.activeCategory === cat ? 'active' : ''}" onclick="CompareVersionModule.setCategory('${cat}')">
                        ${cat}
                    </button>
                `).join('')}
            </div>

            <!-- Comparative Data Table -->
            <div class="data-table-container">
                <div class="table-responsive">
                    <table class="pandawind-table">
                        <thead>
                            <tr>
                                <th>Nhóm Chỉ Số</th>
                                <th>Chỉ Số Đo Lường (Metric)</th>
                                <th>Version 3.3.0 (A)</th>
                                <th>Version 3.5.0 (B)</th>
                                <th>Chênh lệch (Delta %)</th>
                                <th>Kết quả Đánh giá</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filteredMetrics.map(m => `
                                <tr>
                                    <td><span class="badge badge-neutral">${m.category}</span></td>
                                    <td><strong>${m.metric}</strong></td>
                                    <td style="color: var(--text-secondary); font-family: var(--font-mono);">${m.vA}</td>
                                    <td style="color: var(--text-primary); font-weight: 700; font-family: var(--font-mono);">${m.vB}</td>
                                    <td>
                                        <span class="delta-badge ${m.status === 'better' ? 'positive' : 'negative'}">
                                            ${m.delta}
                                        </span>
                                    </td>
                                    <td>
                                        <span style="font-size: 12px; font-weight: 600; color: #10b981;">
                                            ${m.status === 'better' ? '✓ Cải thiện tốt' : 'Không đổi'}
                                        </span>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    setCategory(cat) {
        this.state.activeCategory = cat;
        App.renderRoute();
    },

    setVersionA(v) {
        this.state.versionA = v;
        App.showToast(`Đã chọn Version A: ${v}`, 'info');
    },

    setVersionB(v) {
        this.state.versionB = v;
        App.showToast(`Đã chọn Version B: ${v}`, 'info');
    },

    initCharts() {
        const labels = ['D0', 'D1', 'D3', 'D7', 'D14', 'D28'];
        const vAData = [0.045, 0.068, 0.089, 0.112, 0.145, 0.182];
        const vBData = [0.052, 0.081, 0.108, 0.138, 0.182, 0.231];

        window.PandaWindCharts.renderBarChart('compareLtvBarCanvas', {
            labels: labels,
            datasets: [
                {
                    label: 'Version 3.3.0 ($)',
                    data: vAData,
                    backgroundColor: '#f59e0b'
                },
                {
                    label: 'Version 3.5.0 ($)',
                    data: vBData,
                    backgroundColor: '#10b981'
                }
            ],
            yAxisFormatter: (v) => '$' + v.toFixed(2)
        });
    }
};

window.CompareVersionModule = CompareVersionModule;
