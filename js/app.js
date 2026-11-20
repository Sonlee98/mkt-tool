/**
 * Apero MktPro - Main Application Controller
 * Handles routing, themes, currency, product switcher, search, notifications, and toasts
 */

const App = {
    state: {
        currentRoute: 'intraday',
        sidebarCollapsed: false,
        notificationsOpen: false,
        searchOpen: false,
        productDropdownOpen: false
    },

    init() {
        try {
            // Load stored theme or default to dark
            const savedTheme = localStorage.getItem('apero_theme') || 'dark';
            document.documentElement.setAttribute('data-theme', savedTheme);
            if (window.APERO_DATA && window.APERO_DATA.config) {
                window.APERO_DATA.config.theme = savedTheme;
            }

            // Keyboard shortcuts (Ctrl+K for search)
            document.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                    e.preventDefault();
                    App.openSearchModal();
                }
                if (e.key === 'Escape') {
                    App.closeSearchModal();
                    App.closeNotifications();
                    App.closeProductDropdown();
                }
            });

            // Close dropdowns on outside click
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.notification-container')) {
                    App.closeNotifications();
                }
                if (!e.target.closest('.product-selector-wrapper')) {
                    App.closeProductDropdown();
                }
            });

            // Render Notifications List
            this.renderNotifications();

            // Initialize Realtime Sync Engine if available
            if (window.RealtimeEngine && typeof window.RealtimeEngine.init === 'function') {
                window.RealtimeEngine.init();
            }

            // Initial route render
            this.renderRoute();
            console.log("Apero MktPro initialized successfully.");
        } catch (err) {
            console.error("Initialization error:", err);
            const container = document.getElementById('mainContentArea');
            if (container) {
                container.innerHTML = `<div style="padding: 30px; color: red;"><h3>Lỗi khởi tạo hệ thống:</h3><pre>${err.message}\n${err.stack}</pre></div>`;
            }
        }
    },

    renderNotifications() {
        const list = document.getElementById('notificationsPopoverList');
        if (!list || !window.APERO_DATA || !window.APERO_DATA.notifications) return;
        list.innerHTML = window.APERO_DATA.notifications.map(n => `
            <div style="padding: 12px 14px; border-bottom: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 4px; font-size: 12px; cursor: pointer;" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background='transparent'">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <span style="font-weight: 700; color: var(--text-primary);">${n.title}</span>
                    <span style="font-size: 10.5px; color: var(--text-tertiary);">${n.time}</span>
                </div>
                <div style="color: var(--text-secondary); line-height: 1.4;">${n.desc}</div>
            </div>
        `).join('');
    },

    setRoute(routeId) {
        this.state.currentRoute = routeId;
        
        // Update sidebar active classes
        document.querySelectorAll('.nav-item, .nav-subitem').forEach(el => {
            el.classList.remove('active');
        });
        const activeNav = document.querySelector(`[data-route="${routeId}"]`);
        if (activeNav) {
            activeNav.classList.add('active');
            const parentNav = activeNav.closest('.nav-group');
            if (parentNav) {
                const header = parentNav.querySelector('.nav-item');
                if (header) header.classList.add('active');
            }
        }

        // Render page content
        this.renderRoute();
        
        // Scroll content to top
        const contentEl = document.getElementById('mainContentArea');
        if (contentEl) contentEl.scrollTop = 0;
    },

    renderRoute() {
        const container = document.getElementById('mainContentArea');
        if (!container) return;

        let html = '';
        const route = this.state.currentRoute;

        try {
            switch (route) {
                case 'intraday':
                    html = window.IntradayModule.render();
                    break;
                case 'cutoff':
                    html = window.CutoffModule.render();
                    break;
                case 'cohort':
                    html = window.CohortModule.render();
                    break;
                case 'channel':
                    html = window.ChannelModule.render();
                    break;
                case 'product-metrics':
                    html = window.ProductMetricsModule.render();
                    break;
                case 'compare-version':
                    html = window.CompareVersionModule.render();
                    break;
                case 'templates':
                    html = window.TemplatesModule.render();
                    break;
                case 'tactics':
                    html = window.TacticsModule.render();
                    break;
                case 'packages':
                    html = window.PackagesModule.render();
                    break;
                case 'creatives':
                    html = window.CreativesModule.render();
                    break;
                case 'monetization':
                    html = window.MonetizationModule.render();
                    break;
                case 'business':
                    html = window.BusinessModule.render();
                    break;
                case 'admin':
                    html = window.AdminModule.render();
                    break;
                case 'data-management':
                    html = window.DataManagementModule.render();
                    break;
                default:
                    html = window.IntradayModule.render();
            }

            container.innerHTML = html;

            // Initialize charts
            setTimeout(() => {
                try {
                    switch (route) {
                        case 'intraday':
                            if (window.IntradayModule.initCharts) window.IntradayModule.initCharts();
                            break;
                        case 'cutoff':
                            if (window.CutoffModule.initCharts) window.CutoffModule.initCharts();
                            break;
                        case 'channel':
                            if (window.ChannelModule.initCharts) window.ChannelModule.initCharts();
                            break;
                        case 'product-metrics':
                            if (window.ProductMetricsModule.initCharts) window.ProductMetricsModule.initCharts();
                            break;
                        case 'compare-version':
                            if (window.CompareVersionModule.initCharts) window.CompareVersionModule.initCharts();
                            break;
                    }
                } catch (cErr) {
                    console.warn("Chart render warning:", cErr);
                }
            }, 60);

            // Update Breadcrumb
            this.updateBreadcrumb();
        } catch (rErr) {
            console.error("Route render error:", rErr);
            container.innerHTML = `<div style="padding: 24px; color: red;"><h3>Lỗi hiển thị trang:</h3><pre>${rErr.message}</pre></div>`;
        }
    },

    updateBreadcrumb() {
        const breadcrumbEl = document.getElementById('headerBreadcrumb');
        if (!breadcrumbEl) return;

        const titles = {
            'intraday': 'Intraday Report',
            'cutoff': 'Marketing Report > Cutoff',
            'cohort': 'Marketing Report > Cohort Heatmap',
            'channel': 'Marketing Report > Channel',
            'product-metrics': 'Product Report > Metrics Overview',
            'compare-version': 'Product Report > Compare Version',
            'templates': 'Automate Campaign > Templates',
            'tactics': 'Automate Campaign > Tactics',
            'packages': 'Automate Campaign > Packages',
            'creatives': 'Automate Campaign > Creative Hub',
            'monetization': 'Monetization Report',
            'business': 'Business Report',
            'admin': 'Administration',
            'data-management': 'Data Management & Real-time Integration'
        };

        const activeProd = window.APERO_DATA.products.find(p => p.id === window.APERO_DATA.config.activeProduct);
        const prodName = window.APERO_DATA.config.activeProduct === 'All'
            ? 'All Apps'
            : (activeProd ? activeProd.code : 'AIP922');

        breadcrumbEl.innerHTML = `
            <span>Apero MktPro</span>
            <span class="breadcrumb-separator">/</span>
            <span style="color: var(--primary); font-weight: 600;">${prodName}</span>
            <span class="breadcrumb-separator">/</span>
            <span class="breadcrumb-current">${titles[this.state.currentRoute] || 'Dashboard'}</span>
        `;
    },

    toggleSidebar() {
        this.state.sidebarCollapsed = !this.state.sidebarCollapsed;
        const sidebar = document.getElementById('appSidebar');
        if (sidebar) {
            sidebar.classList.toggle('collapsed', this.state.sidebarCollapsed);
        }
    },

    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('apero_theme', next);
        window.APERO_DATA.config.theme = next;
        
        App.showToast(`Đã chuyển sang giao diện ${next === 'dark' ? 'Tối (Dark)' : 'Sáng (Light)'}`, 'info');
        this.renderRoute();
    },

    setCurrency(cur) {
        window.APERO_DATA.config.currency = cur;

        const btnVND = document.getElementById('btnCurVND');
        const btnUSD = document.getElementById('btnCurUSD');
        if (btnVND) btnVND.classList.toggle('active', cur === 'VND');
        if (btnUSD) btnUSD.classList.toggle('active', cur === 'USD');

        App.showToast(`Đã chuyển đơn vị tiền tệ sang: ${cur}`, 'info');
        this.renderRoute();
    },

    toggleCurrency() {
        const cur = window.APERO_DATA.config.currency;
        const next = cur === 'VND' ? 'USD' : 'VND';
        this.setCurrency(next);
    },

    // Product Switcher
    toggleProductDropdown() {
        this.state.productDropdownOpen = !this.state.productDropdownOpen;
        const dd = document.getElementById('productDropdownMenu');
        if (dd) dd.style.display = this.state.productDropdownOpen ? 'block' : 'none';
    },

    closeProductDropdown() {
        this.state.productDropdownOpen = false;
        const dd = document.getElementById('productDropdownMenu');
        if (dd) dd.style.display = 'none';
    },

    selectProduct(prodId) {
        window.APERO_DATA.config.activeProduct = prodId;
        const prod = window.APERO_DATA.products.find(p => p.id === prodId);

        const label = document.getElementById('activeProductLabel');
        if (label) {
            if (prodId === 'All') {
                label.textContent = 'Tất cả sản phẩm (All)';
            } else if (prod) {
                label.textContent = `${prod.code} - ${prod.name.split('-')[0].trim()}`;
            }
        }

        if (window.IntradayModule) {
            window.IntradayModule.state.filterProduct = prodId;
            if (prodId !== 'All') {
                window.IntradayModule.state.expandedNodes[prodId] = true;
            }
        }

        this.closeProductDropdown();
        const displayName = prodId === 'All' ? 'Tất cả sản phẩm' : (prod ? `${prod.code} (${prod.name})` : prodId);
        App.showToast(`Đã chuyển sang sản phẩm: ${displayName}`, 'success');
        this.renderRoute();
    },

    // Notifications Center
    toggleNotifications() {
        this.state.notificationsOpen = !this.state.notificationsOpen;
        const pop = document.getElementById('notificationsPopover');
        if (pop) pop.style.display = this.state.notificationsOpen ? 'block' : 'none';
    },

    closeNotifications() {
        this.state.notificationsOpen = false;
        const pop = document.getElementById('notificationsPopover');
        if (pop) pop.style.display = 'none';
    },

    // Global Search Modal (Ctrl+K)
    openSearchModal() {
        this.state.searchOpen = true;
        const modal = document.getElementById('globalSearchBackdrop');
        if (modal) {
            modal.classList.add('open');
            const input = document.getElementById('globalSearchInput');
            if (input) {
                input.value = '';
                input.focus();
            }
            this.handleSearch('');
        }
    },

    closeSearchModal() {
        this.state.searchOpen = false;
        const modal = document.getElementById('globalSearchBackdrop');
        if (modal) modal.classList.remove('open');
    },

    handleSearch(query) {
        const q = query.toLowerCase().trim();
        const resultsContainer = document.getElementById('searchResultsContainer');
        if (!resultsContainer) return;

        const navLinks = [
            { title: 'Intraday Report', desc: 'Báo cáo thời gian thực trong ngày, Spend, ROAS D0', route: 'intraday', icon: '⚡' },
            { title: 'Cutoff Report', desc: 'Báo cáo doanh thu hòa vốn 30 ngày, xuất Excel', route: 'cutoff', icon: '📊' },
            { title: 'Cohort Report', desc: 'Heatmap LTV và ROAS D0 đến D90', route: 'cohort', icon: '🧬' },
            { title: 'Channel Report', desc: 'Hiệu suất Facebook, TikTok, Google Ads', route: 'channel', icon: '🌐' },
            { title: 'Product Metrics Overview', desc: 'Chỉ số hệ quả & Chỉ số hữu ích DAU, Retention', route: 'product-metrics', icon: '📱' },
            { title: 'Compare App Version', desc: 'So sánh A/B phiên bản 3.3.0 vs 3.5.0', route: 'compare-version', icon: '⚖️' },
            { title: 'Template Management', desc: 'Application, Campaign, Ads, Page templates', route: 'templates', icon: '📋' },
            { title: 'Tactic Management', desc: '213 bộ quy tắc tự động hóa tối ưu giá thầu', route: 'tactics', icon: '🧠' },
            { title: 'Package Management', desc: '3,349 gói tạo chiến dịch trọn gói tự động', route: 'packages', icon: '📦' },
            { title: 'Creative Hub', desc: '32,173 video/ảnh quảng cáo, kiểm duyệt AI TikTok & Meta', route: 'creatives', icon: '🎬' },
            { title: 'Monetization Report', desc: 'Doanh thu Ad Mediation vs In-App Purchases', route: 'monetization', icon: '💰' },
            { title: 'Business Report', desc: 'Báo cáo tài chính P&L tổng thể doanh nghiệp', route: 'business', icon: '🏢' },
            { title: 'Administration', desc: 'Tài khoản quảng cáo API & quản lý nhân sự', route: 'admin', icon: '⚙️' }
        ];

        const filtered = q === '' 
            ? navLinks 
            : navLinks.filter(l => l.title.toLowerCase().includes(q) || l.desc.toLowerCase().includes(q));

        resultsContainer.innerHTML = filtered.map(item => `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-radius: var(--radius-md); cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background='transparent'" onclick="App.navigateTo('${item.route}')">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 20px;">${item.icon}</span>
                    <div>
                        <div style="font-weight: 600; font-size: 13.5px; color: var(--text-primary);">${item.title}</div>
                        <div style="font-size: 11.5px; color: var(--text-tertiary);">${item.desc}</div>
                    </div>
                </div>
                <span class="badge badge-neutral" style="font-size: 10px;">Chuyển trang →</span>
            </div>
        `).join('');
    },

    navigateTo(route) {
        this.closeSearchModal();
        this.setRoute(route);
    },

    // Toast Manager
    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: '✓',
            warning: '⚠️',
            danger: '✕',
            info: 'ℹ️'
        };

        toast.innerHTML = `
            <span style="font-weight: 700;">${icons[type] || 'ℹ️'}</span>
            <span style="flex: 1;">${message}</span>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'none';
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3200);
    }
};

window.App = App;
