/**
 * Module: Data Management & Import (Trang Nhập Dữ Liệu Thực Tế)
 * Kết nối trực tiếp Backend PostgreSQL: Form thêm chiến dịch, Import CSV thật, JSON API Payload, Google Sheets Sync
 */

const DataManagementModule = {
    state: {
        activeTab: 'intraday_input', // 'intraday_input' | 'csv_import' | 'json_payload' | 'ggsheet_sync' | 'cutoff_input'
        previewSpend: 15000000,
        previewRev: 18500000,
        previewInstalls: 3800,
        lastCsvPreview: ''
    },

    render() {
        return `
            <div class="page-title-bar">
                <div class="page-heading">
                    <h1>Data Management & Real-time Integration</h1>
                    <p>Nhập dữ liệu thực tế vào PostgreSQL, tải lên tệp CSV, dán JSON API hoặc đồng bộ trực tiếp từ Google Sheets</p>
                </div>
                <div class="page-actions">
                    <button class="btn btn-outline btn-sm" onclick="DataManagementModule.downloadSampleCsv()">
                        📥 Tải Tệp CSV Mẫu
                    </button>
                    <button class="btn btn-primary btn-sm" onclick="App.setRoute('intraday')">
                        ⚡ Xem Báo Cáo Intraday
                    </button>
                </div>
            </div>

            <!-- Tab Navigation Strip -->
            <div class="tabs-header" style="flex-wrap: wrap;">
                <button class="tab-btn ${this.state.activeTab === 'intraday_input' ? 'active' : ''}" onclick="DataManagementModule.setTab('intraday_input')">
                    ⚡ Thêm Dữ Liệu Intraday
                </button>
                <button class="tab-btn ${this.state.activeTab === 'csv_import' ? 'active' : ''}" onclick="DataManagementModule.setTab('csv_import')">
                    📁 Import File CSV
                </button>
                <button class="tab-btn ${this.state.activeTab === 'json_payload' ? 'active' : ''}" onclick="DataManagementModule.setTab('json_payload')">
                    📋 Dán JSON API Payload
                </button>
                <button class="tab-btn ${this.state.activeTab === 'ggsheet_sync' ? 'active' : ''}" onclick="DataManagementModule.setTab('ggsheet_sync')">
                    📊 Đồng Bộ Google Sheets
                </button>
                <button class="tab-btn ${this.state.activeTab === 'cutoff_input' ? 'active' : ''}" onclick="DataManagementModule.setTab('cutoff_input')">
                    📅 Thêm Dữ Liệu Cutoff
                </button>
            </div>

            <div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 24px; box-shadow: var(--shadow-sm); margin-bottom: 24px;">
                ${this.renderActiveTabContent()}
            </div>
        `;
    },

    renderActiveTabContent() {
        if (this.state.activeTab === 'intraday_input') {
            const roas = ((this.state.previewRev / (this.state.previewSpend || 1)) * 100).toFixed(2);
            const cpi = Math.round(this.state.previewSpend / (this.state.previewInstalls || 1));
            const ltv = Math.round(this.state.previewRev / (this.state.previewInstalls || 1));
            const pl2 = this.state.previewRev - this.state.previewSpend;

            return `
                <div style="max-width: 850px;">
                    <div style="margin-bottom: 18px;">
                        <h2 style="font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">
                            Thêm Chiến Dịch Mới Vào Báo Cáo Intraday (PostgreSQL)
                        </h2>
                        <p style="font-size: 12.5px; color: var(--text-tertiary);">
                            Dữ liệu được lưu vào PostgreSQL, tự động tính ROAS/CPI/LTV và phát sóng SSE cập nhật tức thì lên Intraday Report.
                        </p>
                    </div>

                    <form onsubmit="event.preventDefault(); DataManagementModule.saveIntradayCampaign();">
                        <div class="form-row-2">
                            <div class="form-group">
                                <label class="form-label required">Sản Phẩm (Product)</label>
                                <select class="form-select" id="inputProduct">
                                    <option value="AIP922">AIP922 - Nexus - AI Video Generator</option>
                                    <option value="AIP886">AIP886 - Framly - AI Photo Video Maker</option>
                                    <option value="AIP919">AIP919 - GeniAI: Photo & Video Creator</option>
                                    <option value="AAP885">AAP885 - CloutDrama: AI Short Drama</option>
                                    <option value="AAP858">AAP858 - AI Couple: Relationship AI</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label required">Kênh Quảng Cáo (Channel)</label>
                                <select class="form-select" id="inputChannel">
                                    <option value="Facebook">Facebook Ads</option>
                                    <option value="TikTok">TikTok Ads</option>
                                    <option value="Google Ads">Google Ads (UAC)</option>
                                    <option value="Mintegral">Mintegral</option>
                                </select>
                            </div>
                        </div>

                        <div class="form-row-2">
                            <div class="form-group">
                                <label class="form-label required">Tên Chiến Dịch (Campaign Name)</label>
                                <input type="text" class="form-input" id="inputCampaignName" required value="AIP922_FB_US_VideoHug_Scale_New">
                            </div>
                            <div class="form-group">
                                <label class="form-label required">Campaign ID / Mã Chiến Dịch</label>
                                <input type="text" class="form-input" id="inputCampaignId" required value="#999">
                            </div>
                        </div>

                        <div class="form-row-2">
                            <div class="form-group">
                                <label class="form-label required">Quốc Gia Mục Tiêu (Target Countries)</label>
                                <input type="text" class="form-input" id="inputCountries" required value="US">
                            </div>
                            <div class="form-group">
                                <label class="form-label required">Ngân Sách Ngày (Budget)</label>
                                <input type="text" class="form-input" id="inputBudget" required value="20.00M" placeholder="e.g. 20.00M hoặc $800">
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 6px;">
                            <div class="form-group">
                                <label class="form-label required">Chi Phí Thực Tế (Spend VND)</label>
                                <input type="number" class="form-input" id="inputSpend" required value="${this.state.previewSpend}" oninput="DataManagementModule.updateLiveCalculation()">
                            </div>
                            <div class="form-group">
                                <label class="form-label required">Doanh Thu Cohort D0 (Revenue VND)</label>
                                <input type="number" class="form-input" id="inputRevenue" required value="${this.state.previewRev}" oninput="DataManagementModule.updateLiveCalculation()">
                            </div>
                            <div class="form-group">
                                <label class="form-label required">Lượt Cài Đặt (Installs)</label>
                                <input type="number" class="form-input" id="inputInstalls" required value="${this.state.previewInstalls}" oninput="DataManagementModule.updateLiveCalculation()">
                            </div>
                        </div>

                        <div style="margin-top: 18px; background: var(--bg-surface-subtle); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px;">
                            <div style="font-size: 12px; font-weight: 700; color: var(--text-tertiary); text-transform: uppercase; margin-bottom: 10px;">
                                ⚡ Xem Trước Kết Quả Tính Toán Tự Động:
                            </div>
                            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
                                <div>
                                    <div style="font-size: 11px; color: var(--text-tertiary);">ROAS D0 Dự Kiến:</div>
                                    <div style="font-size: 18px; font-weight: 800; color: ${parseFloat(roas) >= 100 ? '#10b981' : '#f59e0b'};" id="calcRoas">${roas}%</div>
                                </div>
                                <div>
                                    <div style="font-size: 11px; color: var(--text-tertiary);">CPI (Giá / Cài đặt):</div>
                                    <div style="font-size: 18px; font-weight: 800; font-family: var(--font-mono);" id="calcCpi">${cpi.toLocaleString()} ₫</div>
                                </div>
                                <div>
                                    <div style="font-size: 11px; color: var(--text-tertiary);">LTV (Doanh thu / User):</div>
                                    <div style="font-size: 18px; font-weight: 800; font-family: var(--font-mono); color: #10b981;" id="calcLtv">${ltv.toLocaleString()} ₫</div>
                                </div>
                                <div>
                                    <div style="font-size: 11px; color: var(--text-tertiary);">Lợi Nhuận (Cohort - Spend):</div>
                                    <div style="font-size: 18px; font-weight: 800; color: ${pl2 >= 0 ? '#10b981' : '#ef4444'};" id="calcPl2">${Math.round(pl2).toLocaleString()} ₫</div>
                                </div>
                            </div>
                        </div>

                        <div style="margin-top: 20px; display: flex; align-items: center; justify-content: flex-end; gap: 10px;">
                            <button type="reset" class="btn btn-outline btn-sm">Đặt Lại Form</button>
                            <button type="submit" class="btn btn-primary">
                                ✓ Lưu Vào PostgreSQL & Cập Nhật Intraday
                            </button>
                        </div>
                    </form>
                </div>
            `;
        }

        if (this.state.activeTab === 'csv_import') {
            return `
                <div style="max-width: 780px;">
                    <h2 style="font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">
                        Tải Lên Tệp Dữ Liệu CSV
                    </h2>
                    <p style="font-size: 12.5px; color: var(--text-tertiary); margin-bottom: 18px;">
                        Hệ thống sẽ gửi nội dung CSV lên Backend PostgreSQL để parse, upsert toàn bộ chiến dịch vào khung giờ hiện tại và đẩy SSE realtime.
                    </p>

                    <div style="border: 2px dashed var(--border-color); border-radius: var(--radius-lg); padding: 36px 20px; text-align: center; cursor: pointer; background: var(--bg-surface-subtle);" onclick="document.getElementById('csvFileInput').click()">
                        <div style="font-size: 40px; margin-bottom: 10px;">📊</div>
                        <div style="font-size: 14px; font-weight: 700; color: var(--text-primary);">Nhấp để chọn tệp CSV từ máy tính</div>
                        <div style="font-size: 12px; color: var(--text-tertiary); margin-top: 4px;">Hỗ trợ .csv / .txt (comma hoặc tab-separated)</div>
                        <input type="file" id="csvFileInput" accept=".csv,.txt" style="display: none;" onchange="DataManagementModule.handleCsvFile(event)">
                    </div>

                    <div style="margin-top: 20px; background: var(--bg-surface-subtle); padding: 14px; border-radius: var(--radius-md); font-size: 12px; color: var(--text-secondary);">
                        <strong>Cấu trúc tệp CSV chuẩn khuyến nghị:</strong>
                        <pre style="margin-top: 6px; font-family: var(--font-mono); font-size: 11px; background: var(--bg-surface); padding: 8px; border-radius: 4px; overflow-x: auto;">Product,Channel,CampaignName,CampaignId,Countries,Budget,Spend,Revenue,Installs
AIP922,Facebook,AIP922_FB_US_Scale_01,#991,US,25M,21500000,25400000,4200
AIP886,TikTok,AIP886_TikTok_Viral,#992,PE,15M,12000000,14500000,3100</pre>
                    </div>

                    <div id="csvPreviewArea" style="margin-top: 16px;">${this.state.lastCsvPreview}</div>
                </div>
            `;
        }

        if (this.state.activeTab === 'json_payload') {
            return `
                <div style="max-width: 850px;">
                    <h2 style="font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">
                        Dán Chuỗi JSON API Payload Trực Tiếp
                    </h2>
                    <p style="font-size: 12.5px; color: var(--text-tertiary); margin-bottom: 16px;">
                        Hỗ trợ danh sách <code>campaigns</code>, mảng sự kiện webhook (<code>spendDeltaVnd</code>/<code>revDeltaVnd</code>), hoặc JSON tổng hợp.
                    </p>

                    <div class="form-group">
                        <label class="form-label required">JSON Payload</label>
                        <textarea class="form-textarea" id="jsonPayloadInput" rows="12" style="font-family: var(--font-mono); font-size: 12px;" placeholder='{
  "campaigns": [
    {
      "productId": "AIP922",
      "channel": "Facebook",
      "campaignName": "AIP922_FB_US_Webhook_Batch",
      "externalCampaignId": "#W01",
      "country": "US",
      "spendDeltaVnd": 1500000,
      "cohortRevDeltaVnd": 1950000,
      "installsDelta": 350
    }
  ]
}'></textarea>
                    </div>

                    <div style="margin-top: 14px; display: flex; align-items: center; justify-content: space-between;">
                        <button class="btn btn-outline btn-sm" onclick="DataManagementModule.fillSampleJson()">
                            Dán Mẫu JSON Thử Nghiệm
                        </button>
                        <button class="btn btn-primary" onclick="DataManagementModule.applyJsonPayload()">
                            ✓ Xác Thực & Đồng Bộ Vào Database
                        </button>
                    </div>
                </div>
            `;
        }

        if (this.state.activeTab === 'ggsheet_sync') {
            const savedUrl = (window.IntradayModule && window.IntradayModule.reportData && window.IntradayModule.reportData.meta && window.IntradayModule.reportData.meta.ggsheetCsvUrl) || '';
            return `
                <div style="max-width: 800px;">
                    <h2 style="font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">
                        Đồng Bộ Trực Tiếp Từ Google Sheets
                    </h2>
                    <p style="font-size: 12.5px; color: var(--text-tertiary); margin-bottom: 18px;">
                        Backend sẽ tự động chuyển link Google Sheet thành luồng CSV, parse dữ liệu và nạp vào PostgreSQL.
                        Sheet cần bật quyền xem công khai ("Anyone with the link can view").
                    </p>

                    <div class="form-group">
                        <label class="form-label required">Đường dẫn Google Sheets</label>
                        <input type="url" class="form-input" id="dmGgsheetUrl" value="${savedUrl}" placeholder="https://docs.google.com/spreadsheets/d/1ABC.../edit#gid=0">
                    </div>

                    <div style="margin-top: 16px; display: flex; justify-content: flex-end; gap: 10px;">
                        <button class="btn btn-primary" onclick="DataManagementModule.syncGoogleSheetFromTab()">
                            📋 Kéo Dữ Liệu Google Sheets Ngay
                        </button>
                    </div>
                    <div id="dmGgsheetStatus" style="margin-top: 12px; font-size: 12.5px;"></div>
                </div>
            `;
        }

        if (this.state.activeTab === 'cutoff_input') {
            return `
                <div style="max-width: 850px;">
                    <h2 style="font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">
                        Thêm Dữ Liệu Báo Cáo Cutoff Hàng Ngày (Session)
                    </h2>
                    <p style="font-size: 12.5px; color: var(--text-tertiary); margin-bottom: 18px;">
                        Thêm nhanh số liệu vào bảng Cutoff Report (lưu tạm trong phiên giao diện hiện tại; phạm vi Backend đợt 1 tập trung vào Report Realtime).
                    </p>

                    <form onsubmit="event.preventDefault(); DataManagementModule.saveCutoffRow();">
                        <div class="form-row-2">
                            <div class="form-group">
                                <label class="form-label required">Ngày Báo Cáo</label>
                                <input type="text" class="form-input" id="inputCutoffDate" value="Nov 18, 2026" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label required">Quốc Gia</label>
                                <input type="text" class="form-input" id="inputCutoffCountry" value="Grand Total" required>
                            </div>
                        </div>
                        <div class="form-row-2">
                            <div class="form-group">
                                <label class="form-label required">DAU</label>
                                <input type="text" class="form-input" id="inputCutoffDau" value="295.40K" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label required">Lượt Cài Đặt (Paid Installs)</label>
                                <input type="text" class="form-input" id="inputCutoffInstalls" value="198.50K" required>
                            </div>
                        </div>
                        <div class="form-row-2">
                            <div class="form-group">
                                <label class="form-label required">Chi Phí (Cost USD)</label>
                                <input type="number" class="form-input" id="inputCutoffCost" value="14200" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label required">Doanh Thu Cutoff (Revenue USD)</label>
                                <input type="number" class="form-input" id="inputCutoffRev" value="19800" required>
                            </div>
                        </div>
                        <div style="margin-top: 18px; text-align: right;">
                            <button type="submit" class="btn btn-primary">✓ Lưu Dòng Cutoff</button>
                        </div>
                    </form>
                </div>
            `;
        }
    },

    setTab(tab) {
        this.state.activeTab = tab;
        App.renderRoute();
    },

    updateLiveCalculation() {
        const spend = parseFloat(document.getElementById('inputSpend')?.value || 0);
        const rev = parseFloat(document.getElementById('inputRevenue')?.value || 0);
        const installs = parseFloat(document.getElementById('inputInstalls')?.value || 1);

        const roas = ((rev / (spend || 1)) * 100).toFixed(2);
        const cpi = Math.round(spend / (installs || 1));
        const ltv = Math.round(rev / (installs || 1));
        const pl2 = rev - spend;

        const roasEl = document.getElementById('calcRoas');
        if (roasEl) {
            roasEl.textContent = roas + '%';
            roasEl.style.color = parseFloat(roas) >= 100 ? '#10b981' : '#f59e0b';
        }
        const cpiEl = document.getElementById('calcCpi');
        if (cpiEl) cpiEl.textContent = cpi.toLocaleString() + ' ₫';
        const ltvEl = document.getElementById('calcLtv');
        if (ltvEl) ltvEl.textContent = ltv.toLocaleString() + ' ₫';
        const pl2El = document.getElementById('calcPl2');
        if (pl2El) {
            pl2El.textContent = Math.round(pl2).toLocaleString() + ' ₫';
            pl2El.style.color = pl2 >= 0 ? '#10b981' : '#ef4444';
        }
    },

    async saveIntradayCampaign() {
        const payload = {
            productId: document.getElementById('inputProduct').value,
            channel: document.getElementById('inputChannel').value,
            campaignName: document.getElementById('inputCampaignName').value.trim(),
            externalCampaignId: document.getElementById('inputCampaignId').value.trim(),
            countries: document.getElementById('inputCountries').value.trim(),
            budget: document.getElementById('inputBudget').value.trim(),
            spendVnd: parseFloat(document.getElementById('inputSpend').value || 0),
            revenueVnd: parseFloat(document.getElementById('inputRevenue').value || 0),
            installs: Math.round(parseFloat(document.getElementById('inputInstalls').value || 0))
        };

        try {
            await window.AperoApi.createIntradayCampaign(payload);
            App.showToast(`Đã lưu chiến dịch ${payload.campaignName} vào PostgreSQL!`, 'success');
            if (window.IntradayModule) window.IntradayModule._lastFetchAt = 0;
            setTimeout(() => App.setRoute('intraday'), 350);
        } catch (err) {
            App.showToast(`Lỗi lưu dữ liệu: ${err.message}`, 'danger');
        }
    },

    saveCutoffRow() {
        const date = document.getElementById('inputCutoffDate').value;
        const country = document.getElementById('inputCutoffCountry').value;
        const dau = document.getElementById('inputCutoffDau').value;
        const installs = document.getElementById('inputCutoffInstalls').value;
        const cost = parseFloat(document.getElementById('inputCutoffCost').value);
        const rev = parseFloat(document.getElementById('inputCutoffRev').value);

        const newRow = {
            id: window.APERO_DATA.cutoff.dailyData.length + 1,
            date, dau, newFirstOpen: installs, paidInstall: installs,
            cpi: parseFloat((cost / (parseFloat(installs) * 1000 || 1)).toFixed(4)),
            cutoffRev: rev, cost, profit: rev - cost,
            pl2: (((rev - cost) / rev) * 100).toFixed(2) + '%',
            country, channel: 'All'
        };

        window.APERO_DATA.cutoff.dailyData.unshift(newRow);
        App.showToast(`Đã thêm dòng Cutoff ngày ${date}!`, 'success');
        setTimeout(() => App.setRoute('cutoff'), 400);
    },

    handleCsvFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target.result;
            const previewEl = document.getElementById('csvPreviewArea');
            try {
                const res = await window.AperoApi.importCsv(text);
                this.state.lastCsvPreview = `
                    <div style="padding: 12px 14px; border-radius: var(--radius-md); background: var(--success-light); color: var(--success-text); font-size: 13px; font-weight: 600;">
                        ✓ Đã import thành công ${res.importedCount} dòng từ tệp "${file.name}" vào PostgreSQL!
                    </div>
                `;
                if (previewEl) previewEl.innerHTML = this.state.lastCsvPreview;
                if (window.IntradayModule) window.IntradayModule._lastFetchAt = 0;
                App.showToast(`Đã nạp ${res.importedCount} dòng CSV vào Database!`, 'success');
                setTimeout(() => App.setRoute('intraday'), 700);
            } catch (err) {
                if (previewEl) {
                    previewEl.innerHTML = `<div style="padding: 12px; border-radius: var(--radius-md); background: var(--danger-light); color: var(--danger-text); font-size: 12.5px;">✕ ${err.message}</div>`;
                }
                App.showToast(`Lỗi import CSV: ${err.message}`, 'danger');
            }
        };
        reader.readAsText(file, 'UTF-8');
    },

    downloadSampleCsv() {
        const csv = "\uFEFFProduct,Channel,CampaignName,CampaignId,Countries,Budget,Spend,Revenue,Installs\n" +
            "AIP922,Facebook,AIP922_FB_US_BlackFriday_01,#991,US,25M,21500000,25400000,4200\n" +
            "AIP922,TikTok,AIP922_TikTok_Viral_Dance,#992,PE,15M,12000000,14500000,3100\n" +
            "AIP886,Facebook,AIP886_FB_LATAM_Enhancer,#993,PE,18M,16000000,17200000,3900";
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "apero_mktpro_sample_import.csv";
        link.click();
        App.showToast('Đã tải xuống tệp CSV mẫu chuẩn!', 'success');
    },

    fillSampleJson() {
        const sample = {
            campaigns: [
                {
                    productId: 'AIP922',
                    channel: 'Facebook',
                    campaignName: 'AIP922_FB_US_VideoHug_Tier1_CBO',
                    campaignId: 'cmp_928174102',
                    country: 'US',
                    spendDeltaVnd: 1500000,
                    cohortRevDeltaVnd: 1950000,
                    cutoffRevDeltaVnd: 2200000,
                    installsDelta: 320
                },
                {
                    productId: 'AIP886',
                    channel: 'TikTok',
                    campaignName: 'AIP886_TikTok_JSON_Import_01',
                    externalCampaignId: '#J88',
                    country: 'VN',
                    budget: '18M',
                    spendVnd: 4500000,
                    revenueVnd: 5100000,
                    installs: 1200
                }
            ]
        };
        const el = document.getElementById('jsonPayloadInput');
        if (el) el.value = JSON.stringify(sample, null, 2);
    },

    async applyJsonPayload() {
        const val = document.getElementById('jsonPayloadInput')?.value;
        if (!val) {
            App.showToast('Vui lòng dán chuỗi JSON hợp lệ!', 'warning');
            return;
        }

        try {
            const parsed = JSON.parse(val);
            const res = await window.AperoApi.importJson(parsed);
            if (window.IntradayModule) window.IntradayModule._lastFetchAt = 0;
            App.showToast(`Đã đồng bộ ${res.importedCount} bản ghi JSON vào PostgreSQL!`, 'success');
            setTimeout(() => App.setRoute('intraday'), 450);
        } catch (err) {
            App.showToast('Lỗi xử lý JSON: ' + err.message, 'danger');
        }
    },

    async syncGoogleSheetFromTab() {
        const input = document.getElementById('dmGgsheetUrl');
        const statusEl = document.getElementById('dmGgsheetStatus');
        const url = input ? input.value.trim() : '';
        if (!url) {
            App.showToast('Vui lòng nhập URL Google Sheets!', 'warning');
            return;
        }
        if (statusEl) statusEl.textContent = 'Đang đồng bộ từ Google Sheets...';
        try {
            const res = await window.AperoApi.syncGoogleSheet(url);
            if (statusEl) statusEl.innerHTML = `<span style="color:#10b981;">✓ Đã nhập ${res.importedCount} dòng từ Google Sheets!</span>`;
            if (window.IntradayModule) window.IntradayModule._lastFetchAt = 0;
            App.showToast(`Đồng bộ Google Sheets thành công (${res.importedCount} dòng)!`, 'success');
        } catch (err) {
            if (statusEl) statusEl.innerHTML = `<span style="color:#ef4444;">✕ ${err.message}</span>`;
            App.showToast(err.message, 'danger');
        }
    },

    initCharts() {}
};

window.DataManagementModule = DataManagementModule;
