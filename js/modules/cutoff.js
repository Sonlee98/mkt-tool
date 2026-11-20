/**
 * Module: Cutoff Report (Báo cáo Điểm hòa vốn & Doanh thu Cutoff)
 */

const CutoffModule = {
    state: {
        filterCountry: 'All',
        filterChannel: 'All',
        searchTerm: ''
    },

    render() {
        const data = window.APERO_DATA.cutoff;
        const config = window.APERO_DATA.config;
        const s = data.summary;
        const isVnd = config.currency === 'VND';

        const formatUsdOrVnd = (usdVal) => {
            if (isVnd) {
                const vnd = usdVal * config.exchangeRate;
                if (vnd >= 1000000000) return (vnd / 1000000000).toFixed(2) + 'B ₫';
                if (vnd >= 1000000) return (vnd / 1000000).toFixed(1) + 'M ₫';
                return Math.round(vnd).toLocaleString() + ' ₫';
            } else {
                if (usdVal >= 1000) return '$' + (usdVal / 1000).toFixed(1) + 'K';
                return '$' + usdVal.toLocaleString();
            }
        };

        const formatExactMoney = (usdVal) => {
            if (isVnd) {
                return Math.round(usdVal * config.exchangeRate).toLocaleString() + ' ₫';
            } else {
                return '$' + usdVal.toFixed(2);
            }
        };

        return `
            <div class="page-title-bar">
                <div class="page-heading">
                    <h1>Cutoff Report</h1>
                    <p>Báo cáo doanh thu và chi phí hòa vốn theo ngày và quốc gia (${s.dateRange})</p>
                </div>
                <div class="page-actions">
                    <button class="btn btn-outline btn-sm" onclick="App.showToast('Đang đồng bộ Google Sheets...', 'info'); setTimeout(() => App.showToast('Đã đồng bộ Google Sheets thành công!', 'success'), 800)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        GGSheet Sync
                    </button>
                    <button class="btn btn-primary btn-sm" onclick="CutoffModule.exportExcel()">
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        Xuất Excel (.xlsx)
                    </button>
                </div>
            </div>

            <!-- Grand Total Stats Grid -->
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-card-header">
                        <span class="stat-card-title">Cutoff Rev (Gross)</span>
                        <div class="stat-card-icon" style="background: rgba(16, 185, 129, 0.15); color: #10b981;">
                            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        </div>
                    </div>
                    <div class="stat-card-value">${formatUsdOrVnd(s.cutoffRevUsd)}</div>
                    <div class="stat-card-footer">
                        <span class="delta-badge positive">30 Days</span>
                        <span style="color: var(--text-tertiary);">Doanh thu tích lũy</span>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-card-header">
                        <span class="stat-card-title">Cost (Chi phí UA)</span>
                        <div class="stat-card-icon" style="background: rgba(239, 68, 68, 0.15); color: #ef4444;">
                            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                        </div>
                    </div>
                    <div class="stat-card-value">${formatUsdOrVnd(s.costUsd)}</div>
                    <div class="stat-card-footer">
                        <span style="color: var(--text-tertiary);">Chi trả cho Ad Networks</span>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-card-header">
                        <span class="stat-card-title">Profit (Lợi nhuận gộp)</span>
                        <div class="stat-card-icon" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6;">
                            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
                        </div>
                    </div>
                    <div class="stat-card-value" style="color: #10b981;">${formatUsdOrVnd(s.profitUsd)}</div>
                    <div class="stat-card-footer">
                        <span class="delta-badge positive">%PL2: ${s.pl2}</span>
                        <span style="color: var(--text-tertiary);">Biên lợi nhuận cao</span>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-card-header">
                        <span class="stat-card-title">Paid Installs & CPI</span>
                        <div class="stat-card-icon" style="background: rgba(139, 92, 246, 0.15); color: #8b5cf6;">
                            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                        </div>
                    </div>
                    <div class="stat-card-value">${s.paidInstall}</div>
                    <div class="stat-card-footer">
                        <span style="color: var(--text-tertiary);">Avg CPI: </span>
                        <strong style="color: var(--text-primary);">$${s.cpi.toFixed(4)}</strong>
                    </div>
                </div>
            </div>

            <!-- Double Charts Row -->
            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 16px; margin-bottom: 20px;">
                <div class="chart-card" style="margin-bottom: 0;">
                    <div class="chart-header">
                        <div class="chart-title">Xu hướng Doanh thu (Cutoff Rev) vs Chi phí (Cost) hàng ngày</div>
                        <span class="badge badge-success">30 Ngày gần nhất</span>
                    </div>
                    <div class="chart-canvas-wrap">
                        <canvas id="cutoffTrendCanvas"></canvas>
                    </div>
                </div>

                <div class="chart-card" style="margin-bottom: 0;">
                    <div class="chart-header">
                        <div class="chart-title">Cơ cấu Doanh thu theo Quốc gia</div>
                    </div>
                    <div class="chart-canvas-wrap" style="height: 240px;">
                        <canvas id="cutoffCountryDonutCanvas"></canvas>
                    </div>
                    <div style="font-size: 11.5px; text-align: center; color: var(--text-tertiary); margin-top: 8px;">
                        Dẫn đầu: <strong>Peru (32%)</strong> & <strong>US (31%)</strong>
                    </div>
                </div>
            </div>

            <!-- Filter Toolbar -->
            <div class="filter-toolbar">
                <div class="filter-group-left">
                    <input type="text" class="filter-input" placeholder="🔍 Tìm theo ngày, quốc gia..." id="cutoffSearchInput" oninput="CutoffModule.onSearch(this.value)">
                    <select class="filter-select" id="cutoffCountrySelect" onchange="CutoffModule.onFilterCountry(this.value)">
                        <option value="All">Quốc gia: Tất cả (${data.countries.length} Quốc gia)</option>
                        ${data.countries.map(c => `<option value="${c.country}">${c.country}</option>`).join('')}
                    </select>
                    <select class="filter-select" id="cutoffChannelSelect" onchange="CutoffModule.onFilterChannel(this.value)">
                        <option value="All">Kênh: Tất cả Kênh</option>
                        <option value="Facebook">Facebook Ads</option>
                        <option value="TikTok">TikTok Ads</option>
                        <option value="GoogleAds">Google Ads</option>
                    </select>
                </div>
                <div class="filter-group-right">
                    <button class="btn btn-outline btn-sm" onclick="App.toggleCurrency()">
                        Đổi tiền tệ: <strong>${config.currency}</strong>
                    </button>
                </div>
            </div>

            <!-- Cutoff Data Table -->
            <div class="data-table-container">
                <div class="table-responsive">
                    <table class="apero-table">
                        <thead>
                            <tr>
                                <th>No.</th>
                                <th>Date (GMT+7)</th>
                                <th>Product ID</th>
                                <th>App Name</th>
                                <th>DAU</th>
                                <th>New First Open</th>
                                <th>Paid Install</th>
                                <th>CPI</th>
                                <th>Cutoff Rev</th>
                                <th>Cost</th>
                                <th>Profit</th>
                                <th>%PL2</th>
                                <th>Quốc gia</th>
                            </tr>
                        </thead>
                        <tbody id="cutoffTableBody">
                            ${this.renderTableRows(data.dailyData, formatUsdOrVnd, formatExactMoney)}
                        </tbody>
                        <tfoot>
                            <tr class="grand-total-row">
                                <td colspan="4">Grand Total (Toàn kỳ)</td>
                                <td>${s.dau}</td>
                                <td>${s.newFirstOpen}</td>
                                <td>${s.paidInstall}</td>
                                <td>$${s.cpi.toFixed(4)}</td>
                                <td style="color: #10b981;">${formatUsdOrVnd(s.cutoffRevUsd)}</td>
                                <td style="color: #ef4444;">${formatUsdOrVnd(s.costUsd)}</td>
                                <td style="color: #10b981; font-weight: 800;">${formatUsdOrVnd(s.profitUsd)}</td>
                                <td><span class="badge badge-success">${s.pl2}</span></td>
                                <td>Toàn cầu</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        `;
    },

    renderTableRows(rows, formatUsdOrVnd, formatExactMoney) {
        return rows.map((r, idx) => `
            <tr>
                <td>${r.id || idx + 1}</td>
                <td><strong>${r.date}</strong></td>
                <td><span class="badge badge-neutral">AIP922</span></td>
                <td>Nexus AI Video Maker</td>
                <td>${r.dau}</td>
                <td>${r.newFirstOpen}</td>
                <td>${r.paidInstall}</td>
                <td>$${r.cpi.toFixed(4)}</td>
                <td style="color: #10b981; font-weight: 600;">${formatUsdOrVnd(r.cutoffRev)}</td>
                <td style="color: #ef4444;">${formatUsdOrVnd(r.cost)}</td>
                <td style="color: #10b981; font-weight: 600;">${formatUsdOrVnd(r.profit)}</td>
                <td><span class="badge ${parseFloat(r.pl2) >= 20 ? 'badge-success' : 'badge-warning'}">${r.pl2}</span></td>
                <td>${r.country}</td>
            </tr>
        `).join('');
    },

    onSearch(q) {
        this.state.searchTerm = q.toLowerCase();
    },

    onFilterCountry(c) {
        this.state.filterCountry = c;
        App.showToast(`Đã lọc quốc gia: ${c}`, 'info');
    },

    onFilterChannel(ch) {
        this.state.filterChannel = ch;
        App.showToast(`Đã lọc kênh: ${ch}`, 'info');
    },

    exportExcel() {
        const rows = [
            ['No', 'Date', 'App', 'DAU', 'New Users', 'Paid Installs', 'CPI', 'Cutoff Rev USD', 'Cost USD', 'Profit USD', 'PL2 %']
        ];
        window.APERO_DATA.cutoff.dailyData.forEach(r => {
            rows.push([r.id, r.date, 'AIP922', r.dau, r.newFirstOpen, r.paidInstall, r.cpi, r.cutoffRev, r.cost, r.profit, r.pl2]);
        });
        let csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Apero_Cutoff_Report_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        App.showToast('Đã xuất file báo cáo Cutoff thành công!', 'success');
    },

    initCharts() {
        const daily = window.APERO_DATA.cutoff.dailyData.slice(0, 12).reverse();
        const labels = daily.map(d => d.date.replace(', 2026', ''));
        const revData = daily.map(d => d.cutoffRev / 1000);
        const costData = daily.map(d => d.cost / 1000);

        window.AperoCharts.renderLineChart('cutoffTrendCanvas', {
            labels: labels,
            datasets: [
                {
                    label: 'Cutoff Rev ($K)',
                    data: revData,
                    borderColor: '#10b981',
                    fill: true,
                    fillColor: 'rgba(16, 185, 129, 0.15)'
                },
                {
                    label: 'Cost ($K)',
                    data: costData,
                    borderColor: '#ef4444',
                    fill: false
                }
            ],
            yAxisFormatter: (v) => '$' + v.toFixed(0) + 'K'
        });

        // Donut Chart
        const countries = window.APERO_DATA.cutoff.countries;
        window.AperoCharts.renderDonutChart('cutoffCountryDonutCanvas', {
            labels: countries.slice(0, 5).map(c => c.country),
            data: countries.slice(0, 5).map(c => c.cutoffRev),
            colors: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'],
            centerText: { value: '$758.8K', label: 'Tổng Cutoff Rev' }
        });
    }
};

window.CutoffModule = CutoffModule;
