/**
 * Module: Business Report (Báo cáo Tài chính P&L Doanh Nghiệp)
 */

const BusinessModule = {
    render() {
        const b = window.PANDAWIND_DATA.business;
        const config = window.PANDAWIND_DATA.config;

        return `
            <div class="page-title-bar">
                <div class="page-heading">
                    <h1>Business Report</h1>
                    <p>Báo cáo tài chính P&L tổng thể, phân tích dòng tiền doanh thu, chi phí UA, phí nền tảng và lợi nhuận ròng</p>
                </div>
                <div class="page-actions">
                    <button class="btn btn-primary btn-sm" onclick="App.showToast('Đã xuất báo cáo P&L tài chính!', 'success')">Xuất Báo Cáo P&L</button>
                </div>
            </div>

            <!-- Financial Waterfall Table -->
            <div class="data-table-container">
                <div style="padding: 16px 20px; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between;">
                    <span style="font-weight: 700; font-size: 14px;">Bảng Kết Quả Hoạt Động Kinh Doanh (P&L Level 2)</span>
                    <span class="badge badge-success" style="font-size: 12px;">Biên Lợi Nhuận Ròng: 29.01%</span>
                </div>
                <div class="table-responsive">
                    <table class="pandawind-table">
                        <thead>
                            <tr>
                                <th>Khoản Mục Tài Chính (Line Item)</th>
                                <th style="text-align: right;">Số Tiền (USD)</th>
                                <th>Ghi Chú Nghiệp Vụ</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${b.pnl.map(p => `
                                <tr style="${p.amountUsd < 0 ? 'color: var(--danger);' : p.item.includes('Net Operating Profit') ? 'background: var(--success-light); font-weight: 800; color: var(--success-text);' : ''}">
                                    <td>
                                        <strong>${p.item}</strong>
                                    </td>
                                    <td style="text-align: right; font-family: var(--font-mono); font-weight: 700;">
                                        ${p.amountUsd >= 0 ? '$' + p.amountUsd.toLocaleString() : '-$' + Math.abs(p.amountUsd).toLocaleString()}
                                    </td>
                                    <td style="color: var(--text-tertiary);">${p.note}</td>
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

window.BusinessModule = BusinessModule;
