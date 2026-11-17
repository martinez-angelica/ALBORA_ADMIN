(function () {
    'use strict';

    const KEYS = {
        products: 'alboraAdminProducts',
        users: 'alboraAdminUsers',
        audit: 'alboraAdminAudit',
        settings: 'alboraAdminSettings',
        role: 'alboraAdminRole',
        user: 'alboraAdminUser',
        expires: 'alboraAdminExpires'
    };
    const SESSION_DEFAULT = 30;
    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
    const page = decodeURIComponent(location.pathname.split('/').pop() || '').toLowerCase();
    const roleLabels = {
        admin: 'Admin',
        staff: 'Staff'
    };
    let products = [];
    let users = [];
    let selectedProductId = '';
    let selectedUserId = '';
    let feedbackTimer;

    function escapeHTML(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[character]);
    }

    function notice(message, kind = 'info') {
        let container = $('#admin-feedback');
        if (!container) {
            container = document.createElement('div');
            container.id = 'admin-feedback';
            container.className = 'admin-feedback';
            container.setAttribute('role', 'status');
            container.setAttribute('aria-live', 'polite');
            document.body.appendChild(container);
        }
        container.dataset.kind = kind;
        container.textContent = message;
        container.hidden = false;
        window.clearTimeout(feedbackTimer);
        feedbackTimer = window.setTimeout(() => {
            container.hidden = true;
        }, 5000);
    }

    function readJSON(key, fallback) {
        try {
            const value = localStorage.getItem(key);
            return value === null ? fallback : JSON.parse(value);
        } catch (error) {
            notice(`Could not read saved ${key.replace(/^alboraAdmin/, '').toLowerCase()} data: ${error.message}`, 'error');
            return fallback;
        }
    }

    function writeJSON(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            notice(`Could not save changes in this browser: ${error.message}`, 'error');
            return false;
        }
    }

    function currentRole() {
        try {
            return sessionStorage.getItem(KEYS.role) || '';
        } catch (error) {
            notice(`Could not access this browser session: ${error.message}`, 'error');
            return '';
        }
    }

    function settingValues() {
        const settings = readJSON(KEYS.settings, {});
        return settings && typeof settings === 'object' ? settings : {};
    }

    function sessionMinutes() {
        const value = Number(settingValues().sessionTimeout);
        return Number.isFinite(value) && value >= 5 && value <= 120 ? value : SESSION_DEFAULT;
    }

    function recordAudit(action, detail = '') {
        const entries = readJSON(KEYS.audit, []);
        if (!Array.isArray(entries)) {
            notice('The activity log is invalid and could not be updated.', 'error');
            return;
        }
        entries.unshift({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            at: new Date().toISOString(),
            actor: getSessionUser(),
            role: roleLabels[currentRole()] || 'Unknown',
            action,
            detail
        });
        writeJSON(KEYS.audit, entries.slice(0, 500));
    }

    function getSessionUser() {
        try {
            return sessionStorage.getItem(KEYS.user) || 'Workspace user';
        } catch (error) {
            return 'Workspace user';
        }
    }

    function refreshSession() {
        if (!currentRole()) return;
        try {
            sessionStorage.setItem(KEYS.expires, String(Date.now() + sessionMinutes() * 60 * 1000));
        } catch (error) {
            notice(`Could not refresh the browser session: ${error.message}`, 'error');
        }
    }

    function endSession(message) {
        try {
            sessionStorage.removeItem(KEYS.role);
            sessionStorage.removeItem(KEYS.user);
            sessionStorage.removeItem(KEYS.expires);
        } catch (error) {
            notice(`Could not clear the browser session: ${error.message}`, 'error');
        }
        if (message) notice(message);
    }

    function canVisit(role, file) {
        if (role === 'admin') return true;
        const adminOnly = ['user & permissions.html', 'backup & data recovery.html', 'system_settings.html'];
        if (adminOnly.includes(file)) return false;
        if (role === 'staff') {
            return !['add_product.html', 'edit_product.html', 'delete_product.html'].includes(file);
        }
        return false;
    }

    function isLoginPage() {
        return page === 'admin_login.html';
    }

    function initializeAccess() {
        if (page === 'admin_logout.html') {
            if (currentRole()) recordAudit('Logged out');
            endSession();
            return true;
        }
        if (isLoginPage()) return true;

        const role = currentRole();
        if (!role) {
            location.replace('admin_login.html');
            return false;
        }
        let expiresAt = 0;
        try {
            expiresAt = Number(sessionStorage.getItem(KEYS.expires));
        } catch (error) {
            notice(`Could not verify the browser session: ${error.message}`, 'error');
        }
        if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
            endSession();
            location.replace('admin_login.html?expired=1');
            return false;
        }
        if (!canVisit(role, page)) {
            notice('Your selected role does not have access to that page.', 'error');
            location.replace('dashboard_admin.html');
            return false;
        }
        refreshSession();
        return true;
    }

    function signIn(form) {
        const name = form.querySelector('[name="username"]')?.value;
        const password = form.querySelector('[name="password"]')?.value;
        const role = form.querySelector('[name="role"]')?.value;
        const demoCredentials = {
            admin: { username: 'Jonson', password: 'admin123' },
            staff: { username: 'Martinez', password: 'staff123' }
        };
        const expected = demoCredentials[role];
        const errorBox = $('#loginError', form);
        if (!expected || name !== expected.username || password !== expected.password) {
            if (errorBox) {
                errorBox.textContent = 'Invalid username, password, or role. Use the assigned demo account for the selected role.';
                errorBox.classList.add('show');
            }
            form.querySelector('[name="password"]')?.focus();
            return;
        }
        if (errorBox) {
            errorBox.textContent = '';
            errorBox.classList.remove('show');
        }
        try {
            sessionStorage.setItem(KEYS.role, role);
            sessionStorage.setItem(KEYS.user, name);
            sessionStorage.setItem(KEYS.expires, String(Date.now() + sessionMinutes() * 60 * 1000));
        } catch (error) {
            notice(`Could not start a browser session: ${error.message}`, 'error');
            return;
        }
        recordAudit('Signed in', `${name} · ${roleLabels[role]}`);
        location.href = 'dashboard_admin.html';
    }

    function installSessionControls() {
        if (!currentRole()) return;
        const check = () => {
            let expiresAt = 0;
            try {
                expiresAt = Number(sessionStorage.getItem(KEYS.expires));
            } catch (error) {
                notice(`Could not verify the browser session: ${error.message}`, 'error');
            }
            if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
                endSession('Your session expired due to inactivity. Please sign in again.');
                location.replace('admin_login.html?expired=1');
                return;
            }
        };
        ['pointerdown', 'keydown', 'input'].forEach(eventName => {
            document.addEventListener(eventName, refreshSession, { passive: true });
        });
        window.setInterval(check, 60 * 1000);
        window.addEventListener('beforeprint', () => {
            document.body.dataset.printUser = getSessionUser();
            document.body.dataset.printTime = new Date().toLocaleString();
            recordAudit('Printed page', page);
        });
        document.addEventListener('click', event => {
            const link = event.target instanceof Element
                ? event.target.closest('a[href="admin_logout.html"]')
                : null;
            if (!link) return;
            if (!window.confirm('Are you sure you want to log out?')) event.preventDefault();
        }, true);
    }

    function applyRoleUI() {
        const role = currentRole();
        if (!role) return;
        const restrictedPages = new Set(['user & permissions.html', 'backup & data recovery.html']);
        let restrictedHeadingAdded = Boolean($('.admin-only-nav-heading', $('.sidebar')));
        $$('a[href]').forEach(link => {
            const target = decodeURIComponent(link.getAttribute('href').split('?')[0]).toLowerCase();
            if (link.closest('.sidebar') && restrictedPages.has(target)) {
                if (!restrictedHeadingAdded) {
                    const heading = document.createElement('li');
                    heading.className = 'admin-only-nav-heading';
                    heading.textContent = 'ADMIN ONLY · RESTRICTED';
                    link.closest('li')?.before(heading);
                    restrictedHeadingAdded = true;
                }
                if (!link.dataset.adminRestrictedLabel) {
                    link.dataset.adminRestrictedLabel = link.textContent.trim();
                    link.textContent = '';
                    const lock = document.createElement('span');
                    lock.className = 'admin-only-nav-lock';
                    lock.setAttribute('aria-hidden', 'true');
                    lock.textContent = '🔒';
                    link.append(lock, document.createTextNode(` ${link.dataset.adminRestrictedLabel}`));
                }
                link.title = 'Admin only · Restricted';
                if (role === 'staff') {
                    link.dataset.adminOnlyNav = 'true';
                    link.href = '#admin-only';
                    link.setAttribute('aria-disabled', 'true');
                    link.setAttribute('tabindex', '-1');
                    link.addEventListener('click', event => {
                        event.preventDefault();
                        notice('Admin only · Restricted. Staff cannot open this page.', 'error');
                    });
                }
                return;
            }
            if (target.endsWith('.html') && !canVisit(role, target)) {
                const item = link.closest('li');
                if (item) item.hidden = true;
                else link.hidden = true;
            }
        });
        const userInfo = $('.user-info, .topbar-right');
        if (userInfo) {
            const roleText = userInfo.querySelector('span');
            if (roleText) roleText.textContent = `${getSessionUser()} · ${roleLabels[role]}`;
        }
        document.body.dataset.role = role;
        if (role === 'staff') {
            document.body.classList.add('admin-read-only');
            $$('[data-admin-write], .btn-danger-custom, .btn-outline-danger-custom').forEach(control => {
                control.hidden = true;
            });
            $$('button[onclick*="view-add"], #view-list .btn-gold').forEach(control => {
                if (/add|create/i.test(control.textContent)) control.hidden = true;
            });
        }
    }

    function installSharedStyles() {
        const style = document.createElement('style');
        style.textContent = `
            :root {
                color-scheme: dark;
                --alborá-gold: #c6a253 !important;
                --surface: #191612 !important;
                --header-bg: #171410 !important;
                --gold-accent: #d3b46d !important;
                --alborá-gold-hover: #dfc27c !important;
                --bg-cream: #100e0c !important;
                --text-dark: #f3eadc !important;
                --text-light: #b7aa96 !important;
                --brand-gold: #c6a253 !important;
                --brand-gold-light: #2b2418 !important;
                --bg-gray: #100e0c !important;
                --text-main: #f3eadc !important;
                --text-muted: #b7aa96 !important;
                --border-color: #393124 !important;
                --gold: #c6a253 !important;
                --gold-hover: #dfc27c !important;
                --page-bg: #100e0c !important;
                --text: #f3eadc !important;
                --muted: #b7aa96 !important;
                --line: #393124 !important;
                --bs-body-bg: #100e0c;
                --bs-body-color: #f3eadc;
                --bs-secondary-color: #b7aa96;
                --bs-secondary-bg: #201c16;
                --bs-tertiary-bg: #191612;
                --bs-border-color: #393124;
                --bs-emphasis-color: #f3eadc;
                --bs-link-color: #d3b46d;
                --bs-link-hover-color: #ead49e;
            }
            html,body{background:#100e0c!important;color:#f3eadc!important}
            body .sidebar{background:#14120f!important;color:#f3eadc!important;border-right:1px solid #342b1e}
            .sidebar-menu li a{color:#e9dfd0!important}
            .sidebar-menu li a:hover,.sidebar-menu li.active a{background:#292319!important;color:#f5e7c8!important}
            .sidebar-menu li.active a{border-left-color:#c6a253!important}
            .admin-only-nav-heading{color:#d8b867!important}
            .topbar,.navbar,.header,.sidebar-logo-container{background:#171410!important;color:#f3eadc!important;border-color:#393124!important}
            .main-content,.page-content,.dashboard-container{background:transparent!important;color:#f3eadc!important}
            .page-title,h1,h2,h3,h4,h5,h6,.section-title,.stat-value,label,strong,th{color:#f3eadc}
            .page-subtitle,.breadcrumb-text,.stat-title,.stat-desc,.form-text,.text-muted{color:#b7aa96!important}
            .section-card,.stat-card,.content-card,.auth-card,.info-box,.admin-audit-card,.modal-content,.dropdown-menu,.card,.bg-white,.bg-light{
                background:#191612!important;color:#f3eadc!important;border-color:#393124!important;
                box-shadow:0 8px 24px rgba(0,0,0,.18)
            }
            .panel,.inner-card{background:#191612!important;color:#f3eadc!important;border-color:#393124!important}
            .info-banner{background:#211c15!important;color:#f3eadc!important;border-color:#493d29!important}
            .info-banner strong{color:#f3eadc!important}
            .card-header,.card-footer,.modal-header,.modal-footer{background:#171410!important;color:#f3eadc!important;border-color:#393124!important}
            .info-box{background:#211c15!important}
            .proof-container{color:#30271b!important}
            .proof-container .text-muted,.proof-container .form-text{color:#655b4d!important}
            .info-box-icon,.success-icon,.stat-highlight{color:#8ed4ce!important}
            .success-banner{background:#22251c!important;border-color:#48513b!important;color:#d9c487!important}
            .notice{background:#2b2418!important;border-color:#6d5730!important;color:#f3eadc!important}
            .notice p{color:#f3eadc!important}
            .upload-box{background:#211d17!important;color:#c6b89f!important;border-color:#766440!important}
            .receipt-wrapper{background:#100e0c!important;color:#f3eadc!important}
            .receipt-paper{background:#fffaf0!important;color:#30271b!important;border:1px solid #d8c99e!important}
            .receipt-paper,.receipt-paper *{color:#30271b!important}
            .receipt-paper .receipt-divider{border-color:#d8c99e!important}
            .receipt-paper .receipt-disclaimer{color:#655b4d!important}
            .receipt-logo{display:block;width:160px;max-width:100%;max-height:96px;object-fit:contain;margin:0 auto;filter:brightness(0) saturate(100%) opacity(.78)}
            .receipt-footer{color:#30271b!important}
            .receipt-check svg{stroke:#c6b89f!important}
            .topbar .user-info{color:#f3eadc!important}
            .topbar .user-info span,.topbar .user-divider{color:#b7aa96!important}
            .form-control,.form-select,.form-control:disabled,.form-select:disabled,textarea,input:not([type="checkbox"]):not([type="radio"]){
                background-color:#211d17!important;color:#f3eadc!important;border-color:#493d29!important
            }
            .form-control::placeholder,input::placeholder,textarea::placeholder{color:#a99d8b!important}
            .form-control:focus,.form-select:focus,textarea:focus,input:focus{
                border-color:#c6a253!important;box-shadow:0 0 0 .2rem rgba(198,162,83,.2)!important
            }
            option{background:#211d17;color:#f3eadc}
            .form-check-input{background-color:#211d17;border-color:#766440}
            .form-check-input:checked{background-color:#c6a253;border-color:#c6a253}
            .table{--bs-table-color:#f3eadc;--bs-table-bg:transparent;--bs-table-border-color:#393124;--bs-table-striped-bg:#201c16;--bs-table-hover-bg:#292319}
            table thead th,.table thead th,.table-custom th,.backup-table th{
                background:#2b2418!important;color:#e5c779!important;border-color:#493d29!important
            }
            .table td,.table-custom td{color:#e9dfd0;border-color:#393124!important}
            .table-responsive,.table-custom,.table-custom tr{border-color:#393124!important}
            .backup-table tbody tr.selected,.backup-table tbody tr[data-backup-id]:hover,
            .backup-table tbody tr.selected td,.backup-table tbody tr[data-backup-id]:hover td{
                color:#30271b!important
            }
            .category-chart-item,.product-ranking-item{color:#30271b!important}
            .category-chart-heading,.product-ranking-heading{color:#30271b!important}
            .product-ranking-label,.product-ranking-item .form-text{color:#655b4d!important}
            .checklist,.check-row,.selected-backup{color:#c6b89f!important}
            .pill-badge,.pill-badge-archived,.badge.text-bg-light,.badge.bg-light{
                background:#f5ecd9!important;color:#30271b!important;border-color:#d8c99e!important
            }
            .btn-outline-dark{background:#211d17!important;border-color:#c6a253!important;color:#f3eadc!important}
            .btn-outline-dark:hover{background:#302719!important;border-color:#dfc27c!important;color:#fff4df!important}
            .warning-box,.warning-box strong,.warning-box p,.warning-box div:not(.warning-box-icon){color:#30271b!important}
            .product-card{background:#fffdf8!important;border-color:#d8c99e!important;color:#30271b!important}
            .product-card .product-card-body,.product-card .product-card-topline,.product-card .product-name,
            .product-card .product-description,.product-card .product-variant,.product-card .product-details,
            .product-card .product-details summary,.product-card label,.product-card p{color:#30271b!important}
            .product-card .product-card-topline,.product-card .product-description{color:#554b3c!important}
            .product-card .product-card-price{color:#3b2c14!important}
            .product-card .form-select{background:#fffdf8!important;color:#30271b!important;border-color:#c6a253!important}
            .btn-gold,.btn-primary,.btn-success,.btn-warning,.payment-btn.active{
                background:#c6a253!important;border-color:#c6a253!important;color:#17130d!important
            }
            .btn-gold:hover,.btn-primary:hover,.btn-success:hover,.btn-warning:hover,.payment-btn.active:hover{
                background:#dfc27c!important;border-color:#dfc27c!important;color:#17130d!important
            }
            .btn-outline-custom,.btn-outline-secondary,.btn-outline-primary,.btn-outline-light,.btn-secondary{
                background:#211d17!important;border-color:#8f7440!important;color:#f3eadc!important
            }
            .btn-outline-custom:hover,.btn-outline-secondary:hover,.btn-outline-primary:hover,.btn-outline-light:hover,.btn-secondary:hover{
                background:#302719!important;border-color:#c6a253!important;color:#f5e7c8!important
            }
            .payment-btn:not(.active){background:#211d17!important;color:#e9dfd0!important;border-color:#493d29!important}
            .pill-badge-single,.status-pill{background:#2b2418!important;color:#e5c779!important;border-color:#6d5730!important}
            .status-pill.good{background:#22251c!important;color:#d9c487!important}
            .status-pill.warn{background:#2a2418!important;color:#e5c779!important}
            .status-pill.bad,.btn-danger,.alert-danger{background:#34201d!important;color:#f0c4bd!important;border-color:#71403a!important}
            .alert-success{background:#22251c!important;color:#d9c487!important;border-color:#48513b!important}
            .alert-warning{background:#2a2418!important;color:#e5c779!important;border-color:#6d5730!important}
            a:not(.btn){color:#d3b46d}
            a:not(.btn):hover{color:#ead49e}
            .chart-legend,.chart-legend-item{color:#c6b89f!important}
            .chart-legend-line{border-top-color:#c6a253!important}
            #dashboardSalesChart svg text{fill:#c6b89f!important}
            #dashboardSalesChart svg path,.trend-chart path,.pareto-chart path{stroke:#c6a253!important}
            #dashboardSalesChart svg circle{fill:#c6a253!important}
            #dashboardSalesChart svg line,.trend-chart line,.pareto-chart line{stroke:#393124!important}
            .admin-feedback{position:fixed;right:20px;bottom:20px;z-index:1100;max-width:min(420px,calc(100vw - 40px));padding:13px 17px;border:1px solid #6d5730;border-radius:10px;background:#211d17;color:#f3eadc;box-shadow:0 6px 24px #0008;font:600 14px/1.45 Lato,Arial,sans-serif}
            .admin-feedback[hidden]{display:none}.admin-feedback[data-kind="error"]{background:#34201d;border-color:#71403a}.admin-feedback[data-kind="success"]{background:#292319;border-color:#8f7440}
            .table-tools{display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap;margin:0 0 12px}
            .table-tools input,.table-tools select{min-height:38px;max-width:260px;padding:6px 10px;border:1px solid #493d29;border-radius:6px;background:#211d17;color:#f3eadc}
            .table-page-tools{display:flex;align-items:center;gap:8px;justify-content:flex-end;padding:10px 0;font-size:.85rem;color:#b7aa96}
            .table-page-tools button{border:1px solid #8f7440;background:#211d17;color:#f3eadc;border-radius:6px;padding:5px 10px}
            .table-page-tools button:disabled{opacity:.5}
            .admin-table-search{flex:1}
            .sidebar-toggle{display:none;border:1px solid #8f7440;background:#211d17;color:#f3eadc;border-radius:6px;padding:6px 10px}
            .admin-only-nav-heading{padding:18px 20px 6px;color:#d8b867;font-size:.68rem;font-weight:700;letter-spacing:.08em;list-style:none}
            .sidebar .admin-only-nav-lock{margin-right:4px}
            .sidebar a[aria-disabled="true"]{opacity:.62;cursor:not-allowed;pointer-events:none}
            .admin-read-only [data-admin-write]{display:none!important}
            .admin-audit-card{margin-top:24px;padding:20px;background:#191612;border:1px solid #393124;border-radius:12px}
            .admin-audit-card table{width:100%;font-size:.86rem}
            .admin-audit-card td,.admin-audit-card th{padding:9px;border-bottom:1px solid #393124;text-align:left}
            .status-pill{display:inline-block;padding:3px 9px;border:1px solid #6d5730;border-radius:99px;background:#2b2418;color:#e5c779;font-size:.78rem}
            .status-pill.good{background:#22251c;color:#d9c487}.status-pill.warn{background:#2a2418;color:#e5c779}.status-pill.bad{background:#34201d;color:#f0c4bd}
            .bulk-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0}
            .mock-chart .bar-wrapper,.mock-bar-chart .bar-wrapper{height:100%;justify-content:flex-end;min-height:0}
            .mock-chart .bar,.mock-bar-chart .bar{flex:0 0 auto;max-height:calc(100% - 28px)}
            .admin-read-only button[data-product-edit],.admin-read-only button[data-product-delete]{display:none}
            @media(max-width:900px){
                .sidebar-toggle{display:inline-block}
                body .sidebar{
                    position:fixed!important;top:0!important;bottom:0!important;left:0!important;right:auto!important;
                    width:var(--sidebar-width,260px)!important;max-width:80vw!important;
                    min-height:100vh!important;height:100vh!important;max-height:none!important;
                    margin:0!important;padding:0!important;overflow-y:auto!important;z-index:1000;
                    transform:translateX(-100%);transition:transform .2s ease
                }
                body .sidebar.admin-sidebar-open{transform:translateX(0)}
                body .sidebar .sidebar-logo-container{
                    display:block!important;text-align:center!important;padding:20px 25px!important;margin-bottom:10px!important
                }
                body .sidebar .sidebar-menu{display:block!important;max-height:none!important;overflow:visible!important}
                body .sidebar .sidebar-menu li a{display:block!important;padding:12px 25px!important}
                .main-content{margin-left:0!important;width:100%!important}
                .topbar{gap:10px;flex-wrap:wrap}
                .page-content,.dashboard-container{padding:18px!important}
            }
            @media print{.sidebar,.topbar,.btn,.table-tools,.table-page-tools,.admin-feedback{display:none!important}body:after{content:"ALBORÁ · " attr(data-print-user) " · " attr(data-print-time);display:block;position:fixed;bottom:0;right:0;font:10px Arial,sans-serif;color:#777}}
        `;
        document.head.appendChild(style);
    }

    function installNavigation() {
        const nav = $('.sidebar');
        if (nav) {
            const menuItems = [
                { label: 'Overview', href: 'dashboard_admin.html', pages: ['dashboard_admin.html'] },
                { label: 'Products', href: 'products.html', pages: ['products.html', 'add_product.html', 'edit_product.html', 'delete_product.html'] },
                { label: 'Inventory', href: 'alerts_stock.html', pages: ['alerts_stock.html', 'inventory.html', 'stock_list_update.html'] },
                { label: 'Orders', href: 'order_list.html', pages: ['order_list.html', 'order_details.html'] },
                { label: 'Payment verification', href: 'product_payment_proof.html', pages: ['product_payment_proof.html', 'shipping_payment_proof.html'] },
                { label: 'Two-stage payments', href: 'two_stage_payment.html', pages: ['two_stage_payment.html'] },
                { label: 'Point of sale', href: 'point_of_sales.html', pages: ['point_of_sales.html', 'pos_payment_record.html', 'pos_digital_reciept.html', 'bottle_returns.html'] },
                { label: 'Transactions', href: 'transaction_list.html', pages: ['transaction_list.html'] },
                { label: 'Reports', href: 'sales.html', pages: ['sales.html', 'profits.html', 'transaction.html', 'product_performance.html'] },
                { label: 'Business analytics', href: 'business_analytics.html', pages: ['business_analytics.html'] },
                { label: 'Historical data', href: 'historical_data.html', pages: ['historical_data.html'] },
                { label: 'System settings', href: 'system_settings.html', pages: ['system_settings.html'] },
                { heading: 'ADMIN ONLY · RESTRICTED' },
                { label: 'Users & permissions', href: 'user & permissions.html', pages: ['user & permissions.html'] },
                { label: 'Backup & recovery', href: 'backup & data recovery.html', pages: ['backup & data recovery.html'] }
            ];
            let menu = $('.sidebar-menu', nav);
            if (!menu) {
                menu = document.createElement('ul');
                menu.className = 'sidebar-menu';
                nav.appendChild(menu);
            }
            menu.replaceChildren();
            menuItems.forEach(item => {
                const listItem = document.createElement('li');
                if (item.heading) {
                    listItem.className = 'admin-only-nav-heading';
                    listItem.textContent = item.heading;
                } else {
                    const link = document.createElement('a');
                    link.href = encodeURIComponent(item.href);
                    link.textContent = item.label;
                    if (item.pages.includes(page)) {
                        listItem.className = 'active';
                        link.setAttribute('aria-current', 'page');
                    }
                    listItem.appendChild(link);
                }
                menu.appendChild(listItem);
            });
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'sidebar-toggle';
            toggle.textContent = 'Menu';
            toggle.setAttribute('aria-expanded', 'false');
            toggle.setAttribute('aria-controls', 'admin-sidebar-menu');
            menu.id = 'admin-sidebar-menu';
            const topbar = $('.topbar');
            if (topbar && !$('.sidebar-toggle', topbar)) {
                topbar.prepend(toggle);
                toggle.addEventListener('click', () => {
                    const open = nav.classList.toggle('admin-sidebar-open');
                    toggle.setAttribute('aria-expanded', String(open));
                });
            }
        }
    }

    function seedDemoTransactions() {
        try {
            if (localStorage.getItem('alboraDemoReceiptsCleared') === 'true') return;
        } catch (error) {
            notice(`Demo transactions could not be checked in browser storage: ${error.message}`, 'error');
            return;
        }
        const demoSales = [
            { id: 'DEMO-POS-001', daysAgo: 0, method: 'Cash', items: [['perf-lun-001', 'PERF-LUN-001', 'Lunaria', 'Perfume', 1250, 1], ['acc-hcl-010', 'ACC-HCL-010', 'Hair Clip', 'Accessories', 150, 2]] },
            { id: 'DEMO-POS-002', daysAgo: 1, method: 'Maribank', items: [['flw-bq1-008', 'FLW-BQ1-008', '#1 Flower Bouquet', 'Flowers', 850, 1], ['jwl-aur-020', 'JWL-AUR-020', 'Aurora Bling Earrings', 'Jewelry', 380, 1]] },
            { id: 'DEMO-POS-003', daysAgo: 3, method: 'Cash', items: [['perf-ivo-002', 'PERF-IVO-002', 'Ivory Pear', 'Perfume', 1150, 1]] },
            { id: 'DEMO-POS-004', daysAgo: 6, method: 'Maribank', items: [['cos-vmp-015', 'COS-VMP-015', 'Velvet Matte Peneloppe', 'Cosmetics', 350, 2], ['acc-hti-012', 'ACC-HTI-012', 'Hair Tie', 'Accessories', 80, 1]] },
            { id: 'DEMO-POS-005', daysAgo: 9, method: 'Cash', items: [['jwl-chn-018', 'JWL-CHN-018', 'Chain Of Hearts Necklace Silver 18 inch', 'Jewelry', 450, 1], ['acc-rst-014', 'ACC-RST-014', 'Rhinestone Sticker', 'Accessories', 120, 1]] },
            { id: 'DEMO-POS-006', daysAgo: 16, method: 'Maribank', items: [['perf-fra-003', 'PERF-FRA-003', 'Fraise Royale', 'Perfume', 1300, 1]] },
            { id: 'DEMO-POS-007', daysAgo: 35, method: 'Cash', items: [['flw-bq2-009', 'FLW-BQ2-009', '#2 Flower Bouquet', 'Flowers', 950, 1], ['jwl-but-021', 'JWL-BUT-021', 'Butterfly Silver Rings', 'Jewelry', 250, 1]] },
            { id: 'DEMO-POS-008', daysAgo: 65, method: 'Maribank', items: [['perf-alt-004', 'PERF-ALT-004', 'Althéa', 'Perfume', 1400, 1], ['acc-hcm-011', 'ACC-HCM-011', 'Hair Clamp', 'Accessories', 180, 1]] },
            { id: 'DEMO-POS-009', daysAgo: 100, method: 'Cash', items: [['jwl-amo-019', 'JWL-AMO-019', 'Amore Locket Necklace Gold 18 inch', 'Jewelry', 550, 1], ['cos-mls-017', 'COS-MLS-017', 'Magic Lip Serum Pink Shimmer', 'Cosmetics', 280, 1]] },
            { id: 'DEMO-POS-010', daysAgo: 200, method: 'Maribank', items: [['perf-our-005', 'PERF-OUR-005', 'Our Story', 'Perfume', 1500, 1]] },
            { id: 'DEMO-POS-011', daysAgo: 380, method: 'Cash', items: [['jwl-ara-022', 'JWL-ARA-022', 'Araw Araw Song Bracelet', 'Jewelry', 320, 1], ['acc-hne-013', 'ACC-HNE-013', 'Hair Net', 'Accessories', 60, 2]] },
            { id: 'DEMO-POS-012', daysAgo: 760, method: 'Maribank', items: [['perf-fem-006', 'PERF-FEM-006', 'Femme Fatale', 'Perfume', 1450, 1], ['jwl-nab-023', 'JWL-NAB-023', 'Na Para Bang Song Bracelet', 'Jewelry', 320, 1]] }
        ];
        let rawReceipts;
        try {
            rawReceipts = localStorage.getItem('alboraPosReceipts');
        } catch (error) {
            notice(`Demo transactions could not be loaded from browser storage: ${error.message}`, 'error');
            return;
        }

        let receipts = [];
        if (rawReceipts !== null) {
            try {
                receipts = JSON.parse(rawReceipts);
            } catch (error) {
                notice('Saved POS receipt data is invalid; demo transactions were not added.', 'error');
                return;
            }
            if (!Array.isArray(receipts)) {
                notice('Saved POS receipt data is not a list; demo transactions were not added.', 'error');
                return;
            }
        }

        const existingIds = new Set(receipts.map(receipt => receipt?.receiptNumber));
        const now = new Date();
        const newReceipts = demoSales.filter(sale => !existingIds.has(sale.id)).map((sale, index) => {
            const createdAt = new Date(now);
            createdAt.setDate(createdAt.getDate() - sale.daysAgo);
            createdAt.setHours(11 + (index % 7), 15 + (index % 4) * 10, 0, 0);
            const items = sale.items.map(([productId, sku, name, category, price, quantity]) => ({
                productId, sku, name, category, price, quantity, variant: 'Default'
            }));
            const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
            const vat = Math.round(subtotal * 0.12 * 100) / 100;
            const total = subtotal + vat;
            const cashTendered = sale.method === 'Cash' ? total + 100 : 0;
            return {
                receiptNumber: sale.id,
                createdAt: createdAt.toISOString(),
                items,
                subtotal,
                discount: 0,
                vat,
                total,
                paymentMethod: sale.method,
                paymentReference: sale.method === 'Cash' ? '' : `DEMO-REF-${sale.id}`,
                walletVerified: sale.method !== 'Cash',
                cashTendered,
                change: sale.method === 'Cash' ? cashTendered - total : 0,
                customerName: `Sample Customer ${index + 1}`,
                customerContact: '',
                note: 'Demo transaction — sample data',
                demo: true
            };
        });
        if (!newReceipts.length) return;
        if (writeJSON('alboraPosReceipts', [...receipts, ...newReceipts])) {
            window.dispatchEvent(new CustomEvent('albora:demo-receipts-seeded'));
        }
    }

    function stockCount(product) {
        const stock = product.stock;
        if (typeof stock === 'number') return Math.max(0, stock);
        if (stock && typeof stock === 'object') {
            return Object.values(stock).reduce((sum, value) => sum + (Number(value) || 0), 0);
        }
        return 0;
    }

    function normalizeProduct(product) {
        if (!product || typeof product !== 'object' || !product.id || !product.name) return null;
        const normalized = { ...product };
        normalized.price = Number(normalized.price);
        normalized.cost = Number(normalized.cost) || 0;
        const defaultThreshold = Number(settingValues().lowStockThreshold);
        normalized.threshold = Number.isFinite(Number(normalized.threshold)) ? Number(normalized.threshold) :
            (Number.isInteger(defaultThreshold) && defaultThreshold >= 0 ? defaultThreshold : 5);
        normalized.active = normalized.active !== false;
        normalized.featured = normalized.featured === true;
        normalized.sku = String(normalized.sku || normalized.id).trim();
        normalized.cat = String(normalized.cat || 'Accessories');
        normalized.stock = normalized.stock == null ? 0 : normalized.stock;
        if (!normalized.variant || !Array.isArray(normalized.variant.opts) || !normalized.variant.opts.length) {
            normalized.variant = { label: 'Option', opts: ['Default'] };
        }
        return Number.isFinite(normalized.price) && normalized.price >= 0 ? normalized : null;
    }

    async function loadProducts() {
        const saved = readJSON(KEYS.products, null);
        const hasSavedCatalog = Array.isArray(saved);
        if (saved !== null && !hasSavedCatalog) {
            notice('Saved product data is invalid. The starter catalog will be reloaded.', 'error');
        }
        if (location.protocol === 'file:' && hasSavedCatalog) {
            products = saved.map(normalizeProduct).filter(Boolean);
            if (products.length !== saved.length) writeJSON(KEYS.products, products);
            return;
        }
        try {
            const response = await fetch('catalog-seed.json', { cache: 'no-store' });
            if (!response.ok) throw new Error(`Catalog request failed with status ${response.status}`);
            const seed = await response.json();
            if (!Array.isArray(seed)) throw new Error('The starter catalog has an unexpected format');
            const seedProducts = seed.map(normalizeProduct).filter(Boolean);
            if (seedProducts.length !== seed.length) throw new Error('Some starter catalog records are invalid');

            products = hasSavedCatalog ? saved.map(normalizeProduct).filter(Boolean) : [];
            let changed = !hasSavedCatalog || products.length !== saved.length;
            seedProducts.forEach(seedProduct => {
                const exists = products.some(product =>
                    product.id === seedProduct.id || product.sku.toLowerCase() === seedProduct.sku.toLowerCase());
                if (!exists) {
                    products.push(seedProduct);
                    changed = true;
                }
            });
            if (changed) writeJSON(KEYS.products, products);
        } catch (error) {
            products = hasSavedCatalog ? saved.map(normalizeProduct).filter(Boolean) : [];
            if (hasSavedCatalog && products.length !== saved.length) writeJSON(KEYS.products, products);
            notice(`Could not load the updated starter catalog: ${error.message}. Existing products are still available.`, 'error');
        }
    }

    function saveProducts(nextProducts, action, detail) {
        if (!writeJSON(KEYS.products, nextProducts)) return false;
        products = nextProducts;
        recordAudit(action, detail);
        renderProductCatalog();
        updateDashboardMetrics();
        return true;
    }

    function findControl(root, phrase) {
        const normalizedPhrase = phrase.toLowerCase();
        const label = $$('label', root).find(item => item.textContent.trim().toLowerCase().includes(normalizedPhrase));
        if (!label) return null;
        if (label.htmlFor) {
            const associated = root.querySelector(`#${CSS.escape(label.htmlFor)}`);
            if (associated) return associated;
        }
        const sibling = label.nextElementSibling;
        if (sibling && sibling.matches('input,select,textarea')) return sibling;
        return label.parentElement?.querySelector('input,select,textarea') || null;
    }

    function setCategoryOptions(root) {
        const categories = Array.from(new Set(products.map(product => product.cat)));
        if (!categories.length) categories.push('Accessories', 'Alborá Men', 'Cosmetics', 'Flowers', 'Jewelry', 'Perfume');
        categories.sort();
        $$('select', root).forEach(select => {
            const label = select.previousElementSibling;
            if (!label || !/category/i.test(label.textContent)) return;
            const selectedValue = select.value;
            select.replaceChildren(new Option('Select category', ''));
            categories.forEach(category => select.add(new Option(category, category)));
            if (categories.includes(selectedValue)) select.value = selectedValue;
        });
    }

    function productFormValues(root, existing) {
        const name = findControl(root, 'product name')?.value.trim() || '';
        const sku = findControl(root, 'sku')?.value.trim().toUpperCase() || '';
        const category = findControl(root, 'category')?.value || '';
        const description = findControl(root, 'description')?.value.trim() || '';
        const priceValue = findControl(root, 'selling price')?.value || '';
        const costValue = findControl(root, 'unit cost')?.value || '';
        const stockValue = findControl(root, 'opening stock')?.value ?? findControl(root, 'current stock')?.value;
        const thresholdValue = findControl(root, 'low-stock threshold')?.value;
        const price = Number(String(priceValue).replace(/[₱,\s]/g, ''));
        const cost = Number(String(costValue).replace(/[₱,\s]/g, ''));
        const stock = Number(stockValue);
        const threshold = thresholdValue === '' || thresholdValue == null ? 5 : Number(thresholdValue);
        const visibility = findControl(root, 'visibility')?.value || '';
        const featured = $('#featuredCheck', root)?.checked ?? $('#featHome', root)?.checked ?? $('#featHomeEdit', root)?.checked ?? false;
        const online = $('#onlineCheck', root)?.checked ?? $('#allowOnline', root)?.checked ?? $('#allowOnlineEdit', root)?.checked ?? true;

        if (!name || !sku || !category || !description) throw new Error('Complete the required product details.');
        if (String(priceValue).trim() === '' || !Number.isFinite(price) || price <= 0) throw new Error('Enter a selling price greater than zero.');
        if (String(costValue).trim() === '' || !Number.isFinite(cost) || cost < 0) throw new Error('Enter a valid unit cost.');
        if (!existing && (stockValue == null || String(stockValue).trim() === '' || !Number.isInteger(stock) || stock < 0)) {
            throw new Error('Opening stock must be a whole number of zero or more.');
        }
        if (existing && stockValue !== undefined && stockValue !== '' && (!Number.isInteger(stock) || stock < 0)) {
            throw new Error('Current stock must be a whole number of zero or more.');
        }
        if (!Number.isInteger(threshold) || threshold < 0) throw new Error('Low-stock threshold must be a whole number of zero or more.');
        const duplicate = products.find(product => product.sku.toLowerCase() === sku.toLowerCase() && product.id !== existing?.id);
        if (duplicate) throw new Error(`SKU ${sku} is already assigned to ${duplicate.name}.`);

        const product = {
            ...(existing || {}),
            id: existing?.id || `alb-${Date.now().toString(36)}`,
            name,
            sku,
            cat: category,
            desc: description,
            price,
            cost,
            threshold,
            stock: existing ? existing.stock : stock,
            active: visibility ? !/draft|hidden/i.test(visibility) : (existing?.active ?? true),
            featured: Boolean(featured),
            online: Boolean(online),
            type: existing?.type || 'Product',
            sub: existing?.sub || 'Unisex',
            variant: existing?.variant || { label: 'Option', opts: ['Default'] }
        };
        if (root.dataset.productImage !== undefined) product.img = root.dataset.productImage;
        const care = findControl(root, 'care / specifications');
        if (care) product.care = care.value.trim();
        return product;
    }

    function setupProductPhoto(root, product) {
        const area = $('.upload-area, .upload-box', root);
        if (!area || area.querySelector('[data-product-photo]')) return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/webp';
        input.className = 'form-control mt-3';
        input.setAttribute('aria-label', 'Choose product photo');
        input.dataset.productPhoto = 'true';
        area.appendChild(input);
        if (product?.img) root.dataset.productImage = product.img;
        input.addEventListener('change', () => {
            const file = input.files?.[0];
            input.value = '';
            if (!file) return;
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
                notice('Choose a JPG, PNG, or WebP product image.', 'error');
                return;
            }
            if (file.size > 10 * 1024 * 1024) {
                notice('Product images must be 10 MB or smaller.', 'error');
                return;
            }
            const reader = new FileReader();
            reader.onerror = () => notice('The selected product image could not be read.', 'error');
            reader.onload = () => {
                const image = new Image();
                image.onerror = () => notice('The selected product image could not be decoded.', 'error');
                image.onload = () => {
                    const scale = Math.min(1, 1000 / Math.max(image.naturalWidth, image.naturalHeight));
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
                    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
                    const context = canvas.getContext('2d');
                    if (!context) return notice('Your browser could not prepare the product image.', 'error');
                    context.drawImage(image, 0, 0, canvas.width, canvas.height);
                    root.dataset.productImage = canvas.toDataURL('image/jpeg', 0.82);
                    let preview = $('.product-photo-preview', area);
                    if (!preview) {
                        preview = document.createElement('img');
                        preview.className = 'product-photo-preview img-fluid mt-2 rounded';
                        preview.alt = 'Selected product photo preview';
                        preview.style.maxHeight = '180px';
                        area.appendChild(preview);
                    }
                    preview.src = root.dataset.productImage;
                    notice('Product photo is ready to save.', 'success');
                };
                image.src = String(reader.result);
            };
            reader.readAsDataURL(file);
        });
    }

    function fillProductForm(root, product) {
        const values = {
            'product name': product.name,
            sku: product.sku,
            category: product.cat,
            description: product.desc,
            'selling price': product.price,
            'unit cost': product.cost,
            'current stock': stockCount(product),
            'low-stock threshold': product.threshold,
            'stock location': product.location || ''
        };
        Object.entries(values).forEach(([label, value]) => {
            const control = findControl(root, label);
            if (control) control.value = value;
        });
        const featured = $('#featuredCheck', root) || $('#featHome', root) || $('#featHomeEdit', root);
        const online = $('#onlineCheck', root) || $('#allowOnline', root) || $('#allowOnlineEdit', root);
        if (featured) featured.checked = Boolean(product.featured);
        if (online) online.checked = product.online !== false;
        root.dataset.productImage = product.img || '';
        const photoArea = $('.upload-area, .upload-box', root);
        if (photoArea && product.img) {
            let preview = $('.product-photo-preview', photoArea);
            if (!preview) {
                preview = document.createElement('img');
                preview.className = 'product-photo-preview img-fluid mt-2 rounded';
                preview.alt = 'Selected product photo preview';
                preview.style.maxHeight = '180px';
                photoArea.appendChild(preview);
            }
            preview.src = product.img;
        }
        const visibility = findControl(root, 'visibility');
        if (visibility) {
            const desired = product.active ? 'Published' : 'Draft';
            let option = Array.from(visibility.options).find(item => item.textContent.toLowerCase().includes(desired.toLowerCase()));
            if (!option) {
                option = new Option(desired, desired);
                visibility.add(option);
            }

            visibility.value = option.value;
        }
    }

    function productQueryId() {
        return new URLSearchParams(location.search).get('id') || '';
    }

    function setupStandaloneProductPage() {
        const form = $('form');
        if (page === 'add_product.html' && form) {
            setCategoryOptions(form);
            setupProductPhoto(form, null);
            const visibility = findControl(form, 'visibility');
            if (visibility && !Array.from(visibility.options).some(option => /published/i.test(option.textContent))) {
                visibility.add(new Option('Published', 'Published'));
            }
            form.addEventListener('submit', event => {
                event.preventDefault();
                if (currentRole() === 'staff') return notice('Staff access is view-only for catalog changes.', 'error');
                try {
                    const product = productFormValues(form, null);
                    if (saveProducts([product, ...products], 'Created product', `${product.name} (${product.sku})`)) {
                        location.href = 'products.html';
                    }
                } catch (error) {
                    notice(error.message, 'error');
                }
            });
        }
        if (page === 'edit_product.html' && form) {
            setCategoryOptions(form);
            const id = productQueryId();
            const product = products.find(item => item.id === id);
            if (!product) {
                notice('Choose a product from the catalog before editing.', 'error');
                location.replace('products.html');
                return;
            }
            selectedProductId = product.id;
            fillProductForm(form, product);
            setupProductPhoto(form, product);
            form.addEventListener('submit', event => {
                event.preventDefault();
                if (currentRole() === 'staff') return notice('Staff access is view-only for catalog changes.', 'error');
                try {
                    const updated = productFormValues(form, product);
                    const next = products.map(item => item.id === product.id ? updated : item);
                    if (saveProducts(next, 'Updated product', `${updated.name} (${updated.sku})`)) location.href = 'products.html';
                } catch (error) {
                    notice(error.message, 'error');
                }
            });
        }
        if (page === 'delete_product.html') {
            const id = productQueryId();
            const product = products.find(item => item.id === id);
            if (!product) {
                notice('Choose a product from the catalog before deleting.', 'error');
                location.replace('products.html');
                return;
            }
            selectedProductId = product.id;
            const name = $('.product-header .product-name') || $('h3.fw-bold');
            if (name) name.textContent = product.name;
            const details = $$('.product-meta strong');
            [product.sku, product.cat, `₱${Number(product.price).toLocaleString()}`, stockCount(product)].forEach((value, index) => {
                if (details[index]) details[index].textContent = String(value);
            });
            const skuInput = $('input[placeholder*="SKU"]');
            const deleteButton = $$('button').find(button => /delete product permanently/i.test(button.textContent));
            if (deleteButton) deleteButton.disabled = true;
            skuInput?.addEventListener('input', () => {
                if (deleteButton) deleteButton.disabled = skuInput.value.trim().toUpperCase() !== product.sku.toUpperCase();
            });
            form?.addEventListener('submit', event => {
                event.preventDefault();
                if (currentRole() === 'staff') return notice('Staff access is view-only for catalog changes.', 'error');
                if (skuInput?.value.trim().toUpperCase() !== product.sku.toUpperCase()) {
                    notice('Enter the exact product SKU to confirm deletion.', 'error');
                    return;
                }
                if (!window.confirm(`Permanently delete ${product.name} (${product.sku})?`)) return;
                if (saveProducts(products.filter(item => item.id !== product.id), 'Deleted product', `${product.name} (${product.sku})`)) {
                    location.href = 'products.html';
                }
            });
        }
    }

    function totalProductsInStock(product) {
        return stockCount(product);
    }

    function renderProductCatalog() {
        if (page !== 'products.html') return;
        const list = $('#view-list');
        const table = $('table', list);
        const body = $('tbody', table);
        if (!list || !table || !body) return;
        const search = $('.catalog-search', list);
        const selects = $$('.filter-select', list);
        const query = search?.value.trim().toLowerCase() || '';
        const stockFilter = selects[0]?.value || 'All products';
        const categoryFilter = selects[1]?.value || 'All categories';
        const statusFilter = selects[2]?.value || 'All statuses';
        const shown = products.filter(product => {
            if (query && !`${product.name} ${product.sku} ${product.cat}`.toLowerCase().includes(query)) return false;
            if (categoryFilter !== 'All categories' && product.cat !== categoryFilter) return false;
            const count = totalProductsInStock(product);
            if (stockFilter === 'In stock' && count <= 0) return false;
            if (stockFilter === 'Low stock' && (count <= 0 || count > product.threshold)) return false;
            if (stockFilter === 'Out of stock' && count > 0) return false;
            if (statusFilter === 'Published' && (!product.active || product.archived)) return false;
            if (statusFilter === 'Draft' && (product.active || product.archived)) return false;
            if (statusFilter === 'Archived' && !product.archived) return false;
            return true;
        });
        body.innerHTML = shown.length ? shown.map(product => {
            const count = totalProductsInStock(product);
            const statusClass = count <= 0 ? 'bad' : count <= product.threshold ? 'warn' : 'good';
            return `<tr>
                <td><input type="checkbox" class="product-row-select" value="${escapeHTML(product.id)}" aria-label="Select ${escapeHTML(product.name)}"></td>
                <td><strong>${escapeHTML(product.name)}</strong><small class="d-block text-muted">${escapeHTML(product.type || product.cat)}</small></td>
                <td>${escapeHTML(product.sku)}</td>
                <td>${escapeHTML(product.cat)}</td>
                <td class="text-end">₱${Number(product.price).toLocaleString()}</td>
                <td><span class="status-pill ${statusClass}">${count}</span></td>
                <td><span class="status-pill ${product.archived ? 'bad' : product.active ? 'good' : 'warn'}">${product.archived ? 'Archived' : product.active ? 'Published' : 'Draft'}</span></td>
                <td class="text-nowrap">
                    ${product.archived ? `<button class="btn btn-sm btn-outline-secondary" type="button" data-product-restore="${escapeHTML(product.id)}">Restore</button>` : `<button class="btn btn-sm btn-outline-secondary" type="button" data-product-edit="${escapeHTML(product.id)}">Edit</button>
                    <button class="btn btn-sm btn-outline-danger" type="button" data-product-delete="${escapeHTML(product.id)}">Delete</button>`}
                </td>
            </tr>`;
        }).join('') : `<tr><td colspan="8" class="text-center text-muted py-4">${products.length ? 'No products match these filters.' : 'No products are available. Add a product to get started.'}</td></tr>`;

        const heading = $('thead tr', table);
        if (heading && !table.dataset.adminCatalogHeaders) {
            heading.innerHTML = '<th scope="col"><input type="checkbox" class="select-all-products" aria-label="Select all visible products"></th><th scope="col">Product</th><th scope="col">SKU</th><th scope="col">Category</th><th scope="col" class="text-end">Price</th><th scope="col">Stock</th><th scope="col">Status</th><th scope="col">Actions</th>';
            table.dataset.adminCatalogHeaders = 'true';
        }
        const footer = $('.content-card .p-3.text-muted', list);
        if (footer) footer.firstElementChild.textContent = `${shown.length} of ${products.length} products`;

        const kpis = $$('.kpi-card', list);
        const inStock = products.filter(item => item.active && stockCount(item) > 0).length;
        const soldOut = products.filter(item => stockCount(item) <= 0).length;
        const featured = products.filter(item => item.featured).length;
        [products.length, inStock, soldOut, featured].forEach((value, index) => {
            const field = $('.kpi-value', kpis[index]);
            if (field) field.textContent = String(value);
        });

        if (selects.length >= 3) {
            const setOptions = (select, values, first) => {
                const current = select.value;
                select.replaceChildren(new Option(first, first), ...values.map(value => new Option(value, value)));
                if (Array.from(select.options).some(option => option.value === current)) select.value = current;
                else select.selectedIndex = 0;
            };
            setOptions(selects[0], ['In stock', 'Low stock', 'Out of stock'], 'All products');
            setOptions(selects[1], Array.from(new Set(products.map(item => item.cat))).sort(), 'All categories');
            setOptions(selects[2], ['Published', 'Draft', 'Archived'], 'All statuses');
        }
        ensureProductBulkTools(list);
    }

    function ensureProductBulkTools(list) {
        const toolbar = $('.catalog-toolbar', list);
        if (!toolbar || $('#product-bulk-tools', list)) return;
        const wrapper = document.createElement('div');
        wrapper.id = 'product-bulk-tools';
        wrapper.className = 'bulk-tools';
        wrapper.innerHTML = '<label><input type="checkbox" class="select-all-products" aria-label="Select all visible products"> Select visible</label><span class="selected-product-count">0 selected</span><button type="button" class="btn btn-outline-secondary" data-bulk-product="publish">Publish selected</button><button type="button" class="btn btn-outline-secondary" data-bulk-product="draft">Move to draft</button><button type="button" class="btn btn-outline-danger" data-bulk-product="archive">Archive selected</button>';
        toolbar.insertAdjacentElement('afterend', wrapper);
        if (currentRole() === 'staff') wrapper.hidden = true;
    }

    function openProductView(view, product) {
        selectedProductId = product.id;
        if (typeof window.switchView === 'function') window.switchView(view);
        const root = $(`#${view}`);
        if (!root) return;
        if (view === 'view-edit') fillProductForm(root, product);
        if (view === 'view-delete') {
            const name = $('h3.fw-bold', root);
            if (name) name.textContent = product.name;
            const summary = $$('td', root);
            [product.sku, product.cat, `₱${Number(product.price).toLocaleString()}`, stockCount(product)].forEach((value, index) => {
                if (summary[index * 2 + 1]) summary[index * 2 + 1].textContent = String(value);
            });
            const input = $('input[placeholder*="SKU"]', root);
            const button = $$('button', root).find(item => /delete product permanently/i.test(item.textContent));
            if (button) button.disabled = true;
            input?.addEventListener('input', () => {
                if (button) button.disabled = input.value.trim().toUpperCase() !== product.sku.toUpperCase();
            }, { once: false });
        }
    }

    function bindProductCatalog() {
        if (page !== 'products.html') return;
        const list = $('#view-list');
        if (!list) return;
        setCategoryOptions($('#view-add'));
        setCategoryOptions($('#view-edit'));
        setupProductPhoto($('#view-add'), null);
        setupProductPhoto($('#view-edit'), null);
        const search = $('.catalog-search', list);
        search?.addEventListener('input', renderProductCatalog);
        $$('.filter-select', list).forEach(select => select.addEventListener('change', renderProductCatalog));
        document.addEventListener('click', event => {
            const editButton = event.target.closest('[data-product-edit]');
            if (editButton) {
                const product = products.find(item => item.id === editButton.dataset.productEdit);
                if (product) openProductView('view-edit', product);
                return;
            }
            const deleteButton = event.target.closest('[data-product-delete]');
            if (deleteButton) {
                const product = products.find(item => item.id === deleteButton.dataset.productDelete);
                if (product) openProductView('view-delete', product);
                return;
            }
            const restoreButton = event.target.closest('[data-product-restore]');
            if (restoreButton) {
                const product = products.find(item => item.id === restoreButton.dataset.productRestore);
                if (product && saveProducts(products.map(item => item.id === product.id ?
                    { ...item, archived: false, active: false } : item), 'Restored product', product.sku)) {
                    notice(`${product.name} restored as a draft.`, 'success');
                }
                return;
            }
            if (event.target.matches('.select-all-products')) {
                $$('.product-row-select', list).forEach(box => { box.checked = event.target.checked; });
                updateProductSelection();
                return;
            }
            const bulkButton = event.target.closest('[data-bulk-product]');
            if (bulkButton) {
                const ids = $$('.product-row-select:checked', list).map(box => box.value);
                if (!ids.length) return notice('Select at least one product first.', 'error');
                const action = bulkButton.dataset.bulkProduct;
                if (action === 'archive' && !window.confirm(`Archive ${ids.length} selected product(s)?`)) return;
                const next = products.map(item => {
                    if (!ids.includes(item.id)) return item;
                    if (action === 'publish') return { ...item, active: true, archived: false };
                    if (action === 'draft') return { ...item, active: false, archived: false };
                    return { ...item, active: false, archived: true };
                });
                if (saveProducts(next, `Bulk ${action} products`, `${ids.length} selected`)) notice(`${ids.length} product(s) updated.`, 'success');
                return;
            }
            const root = event.target.closest('#view-add, #view-edit, #view-delete');
            const button = event.target.closest('button');
            if (!root || !button) return;
            if (root.id === 'view-add' && /create product/i.test(button.textContent)) {
                event.preventDefault();
                event.stopImmediatePropagation();
                if (currentRole() === 'staff') return notice('Staff access is view-only for catalog changes.', 'error');
                try {
                    const product = productFormValues(root, null);
                    if (saveProducts([product, ...products], 'Created product', `${product.name} (${product.sku})`)) {
                        window.switchView('view-list');
                        notice(`${product.name} was added to the catalog.`, 'success');
                    }
                } catch (error) {
                    notice(error.message, 'error');
                }
            }
            if (root.id === 'view-edit' && /save changes/i.test(button.textContent)) {
                event.preventDefault();
                event.stopImmediatePropagation();
                if (currentRole() === 'staff') return notice('Staff access is view-only for catalog changes.', 'error');
                const existing = products.find(item => item.id === selectedProductId);
                if (!existing) return notice('Select a product before saving changes.', 'error');
                try {
                    const updated = productFormValues(root, existing);
                    if (saveProducts(products.map(item => item.id === existing.id ? updated : item), 'Updated product', `${updated.name} (${updated.sku})`)) {
                        window.switchView('view-list');
                        notice(`${updated.name} was updated.`, 'success');
                    }
                } catch (error) {
                    notice(error.message, 'error');
                }
            }
            if (root.id === 'view-delete' && /delete product permanently/i.test(button.textContent)) {
                event.preventDefault();
                event.stopImmediatePropagation();
                if (currentRole() === 'staff') return notice('Staff access is view-only for catalog changes.', 'error');
                const existing = products.find(item => item.id === selectedProductId);
                const input = $('input[placeholder*="SKU"]', root);
                if (!existing || input?.value.trim().toUpperCase() !== existing.sku.toUpperCase()) {
                    return notice('Enter the exact product SKU to confirm deletion.', 'error');
                }
                if (!window.confirm(`Permanently delete ${existing.name} (${existing.sku})?`)) return;
                if (saveProducts(products.filter(item => item.id !== existing.id), 'Deleted product', `${existing.name} (${existing.sku})`)) {
                    window.switchView('view-list');
                    notice(`${existing.name} was deleted.`, 'success');
                }
            }
        }, true);
        document.addEventListener('change', event => {
            if (event.target.matches('.product-row-select')) updateProductSelection();
        });
        const exportButton = $$('button', list).find(button => /export catalog/i.test(button.textContent));
        exportButton?.addEventListener('click', () => exportCSV(products.map(item => ({
            name: item.name, sku: item.sku, category: item.cat, price: item.price,
            stock: stockCount(item), status: item.active ? 'Published' : 'Draft'
        })), 'albora-catalog.csv'));
    }

    function updateProductSelection() {
        const list = $('#view-list');
        if (!list) return;
        const checkboxes = $$('.product-row-select', list);
        const count = checkboxes.filter(box => box.checked).length;
        const label = $('.selected-product-count', list);
        if (label) label.textContent = `${count} selected`;
        $$('.select-all-products', list).forEach(box => {
            box.checked = checkboxes.length > 0 && count === checkboxes.length;
        });
    }

    function exportCSV(rows, filename) {
        if (!rows.length) return notice('There are no records to export.', 'error');
        const headers = Object.keys(rows[0]);
        const csv = [headers.join(','), ...rows.map(row => headers.map(header => {
            const value = String(row[header] == null ? '' : row[header]).replace(/"/g, '""');
            return `"${value}"`;
        }).join(','))].join('\r\n');
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(link.href);
        recordAudit('Exported data', filename);
        notice(`${filename} downloaded.`, 'success');
    }

    function productStockFor(product, variant) {
        if (typeof product.stock === 'number') return Math.max(0, product.stock);
        if (product.stock && typeof product.stock === 'object') {
            return Math.max(0, Number(product.stock[variant]) || 0);
        }
        return 0;
    }

    function stockStatus(product) {
        const quantity = stockCount(product);
        if (quantity <= 0) return { text: 'Out of stock', kind: 'bad' };
        if (quantity <= product.threshold) return { text: 'Low stock', kind: 'warn' };
        return { text: 'In stock', kind: 'good' };
    }

    function stockMovements() {
        const movements = readJSON('alboraStockMovements', []);
        if (!Array.isArray(movements)) {
            notice('Saved stock movement history is invalid and cannot be displayed.', 'error');
            return [];
        }
        return movements;
    }

    function updateInventoryStats() {
        const inventoryProducts = products.filter(product => !product.archived);
        const quantities = inventoryProducts.map(stockCount);
        const total = quantities.reduce((sum, quantity) => sum + quantity, 0);
        const low = inventoryProducts.filter(product => stockCount(product) > 0 && stockCount(product) <= product.threshold).length;
        const out = inventoryProducts.filter(product => stockCount(product) <= 0).length;

        if (page === 'stock_list_update.html') {
            const cards = $$('.stat-card');
            [total, low, out, 0].forEach((value, index) => {
                const field = $('.stat-value', cards[index]);
                if (field) field.textContent = String(value);
            });
        }
        if (page === 'alerts_stock.html') {
            const cards = $$('.stat-card');
            const lowField = $('.stat-value', cards[0]);
            const outField = $('.stat-value', cards[1]);
            const suggestedField = $('.stat-value', cards[2]);
            const suggestions = inventoryProducts.reduce((sum, product) =>
                sum + Math.max(0, product.threshold * 2 - stockCount(product)), 0);
            if (lowField) lowField.textContent = String(low);
            if (outField) outField.textContent = String(out);
            if (suggestedField) suggestedField.textContent = `${suggestions} units`;
            const first = $('.stat-desc', cards[0]);
            const second = $('.stat-desc', cards[1]);
            if (first) first.textContent = low ? 'Products at or below their reorder threshold' : 'No products need a low-stock reorder';
            if (second) second.textContent = out ? 'Products with no sellable stock' : 'No products are sold out';
        }
        if (page === 'inventory.html') {
            const cards = $$('.stat-card');
            const fields = cards.map(card => $('.stat-value', card));
            if (fields[0]) fields[0].textContent = `${total} units`;
            if (fields[1]) fields[1].textContent = String(low);
            if (fields[2]) fields[2].textContent = String(out);
            cards.forEach((card, index) => {
                const description = $('.stat-desc', card);
                if (!description) return;
                description.textContent = index === 0 ? `${inventoryProducts.length} catalog products` :
                    index === 1 ? `${low} product${low === 1 ? '' : 's'} at or below threshold` :
                        `${out} product${out === 1 ? '' : 's'} with no stock`;
            });
        }
    }

    function renderStockUpdate() {
        if (page !== 'stock_list_update.html') return;
        const tables = $$('table');
        const stockBody = $('tbody', tables[0]);
        const movementBody = $('tbody', tables[1]);
        const query = $('.filter-bar input')?.value.trim().toLowerCase() || '';
        const stockFilter = $$('.filter-bar select')[0]?.value || 'All stock';
        const categoryFilter = $$('.filter-bar select')[2]?.value || 'Category';
        const inventoryProducts = products.filter(product => !product.archived);
        const visible = inventoryProducts.filter(product => {
            if (query && !`${product.name} ${product.sku}`.toLowerCase().includes(query)) return false;
            if (categoryFilter !== 'Category' && categoryFilter && product.cat !== categoryFilter) return false;
            const status = stockStatus(product).text;
            if (stockFilter === 'Low stock' && status !== 'Low stock') return false;
            if (stockFilter === 'Out of stock' && status !== 'Out of stock') return false;
            return true;
        });
        if (stockBody) stockBody.innerHTML = visible.length ? visible.map(product => {
            const status = stockStatus(product);
            return `<tr>
                <td><strong>${escapeHTML(product.name)}</strong><small class="d-block text-muted">${escapeHTML(product.sku)}</small></td>
                <td class="text-end">${stockCount(product)}</td>
                <td class="text-end">${product.threshold}</td>
                <td><span class="status-pill ${status.kind}">${status.text}</span></td>
                <td><button class="btn btn-sm btn-outline-secondary" type="button" data-stock-select="${escapeHTML(product.id)}">Adjust</button></td>
            </tr>`;
        }).join('') : '<tr><td colspan="5" class="text-center text-muted py-4">No products match this inventory filter.</td></tr>';
        const header = $('thead tr', tables[0]);
        if (header && header.cells.length === 4) header.insertAdjacentHTML('beforeend', '<th scope="col">Action</th>');
        const categorySelect = $$('.filter-bar select')[2];
        if (categorySelect && !categorySelect.dataset.adminCategories) {
            const currentCategory = categorySelect.value;
            const categories = Array.from(new Set(inventoryProducts.map(product => product.cat))).sort();
            categorySelect.replaceChildren(new Option('Category', 'Category'), ...categories.map(category => new Option(category, category)));
            if (categories.includes(currentCategory)) categorySelect.value = currentCategory;
            categorySelect.dataset.adminCategories = 'true';
        }
        const countButton = $$('.section-card button').find(button => /inventory records/i.test(button.textContent));
        if (countButton) countButton.textContent = `${inventoryProducts.length} inventory records`;

        const movements = stockMovements().slice(0, 20);
        if (movementBody) movementBody.innerHTML = movements.length ? movements.map(movement => {
            const date = new Date(movement.at);
            const product = products.find(item => item.id === movement.productId);
            return `<tr><td>${escapeHTML(Number.isNaN(date.getTime()) ? '' : date.toLocaleString())}</td>
                <td>${escapeHTML(movement.productName || product?.name || 'Deleted product')}<small class="d-block text-muted">${escapeHTML(movement.sku || '')}</small></td>
                <td>${escapeHTML(movement.type)} · ${escapeHTML(movement.variant || 'All variants')} (${movement.before} → ${movement.after})<small class="d-block text-muted">${escapeHTML(movement.reason)}</small></td>
                <td>${escapeHTML(movement.actor || 'Workspace user')}</td></tr>`;
        }).join('') : '<tr><td colspan="4" class="text-center text-muted py-4">No stock movements yet.</td></tr>';
    }

    function setupStockForm() {
        if (page !== 'stock_list_update.html') return;
        const form = $('form');
        if (!form) return;
        const productInput = findControl(form, 'product');
        const quantityInput = findControl(form, 'quantity');
        const adjustment = findControl(form, 'adjustment type');
        const reasonInput = findControl(form, 'reason / reference');
        const currentLabel = $$('label', form).find(label => /current available/i.test(label.textContent));
        const newLabel = $$('label', form).find(label => /new available stock/i.test(label.textContent));
        if (!productInput || !quantityInput || !adjustment || !reasonInput) return;

        productInput.readOnly = true;
        quantityInput.min = '1';
        quantityInput.step = '1';
        quantityInput.required = true;
        reasonInput.required = true;
        const variantSelect = document.createElement('select');
        variantSelect.className = 'form-select mb-3';
        variantSelect.setAttribute('aria-label', 'Product variant');
        variantSelect.hidden = true;
        const variantLabel = document.createElement('label');
        variantLabel.className = 'form-label';
        variantLabel.textContent = 'Variant';
        variantLabel.hidden = true;
        productInput.closest('.mb-3')?.after(variantLabel, variantSelect);
        const currentValue = document.createElement('div');
        currentValue.className = 'fw-bold';
        currentValue.dataset.stockCurrent = 'true';
        currentLabel?.after(currentValue);
        const newValue = document.createElement('div');
        newValue.className = 'fw-bold';
        newValue.dataset.stockNew = 'true';
        newLabel?.after(newValue);
        const badge = $('.panel-header-badge');
        const saveButton = $$('button', form).find(button => /save stock update/i.test(button.textContent));
        if (saveButton) saveButton.disabled = true;
        const initialId = productQueryId();

        function selectedProduct() {
            return products.find(product => product.id === productInput.dataset.productId) || null;
        }
        function selectedQuantity() {
            const product = selectedProduct();
            return product ? productStockFor(product, variantSelect.value) : 0;
        }
        function refreshStockPreview() {
            const product = selectedProduct();
            if (!product) {
                currentValue.textContent = '—';
                newValue.textContent = '—';
                if (saveButton) saveButton.disabled = true;
                return;
            }
            const before = selectedQuantity();
            const count = Number(quantityInput.value);
            const type = adjustment.value;
            let after = before;
            if (Number.isInteger(count) && count >= 0) {
                if (/Receive stock/i.test(type)) after = before + count;
                else if (/Deduct stock/i.test(type)) after = Math.max(0, before - count);
                else if (/Set exact count/i.test(type)) after = count;
            }
            currentValue.textContent = `${before} units`;
            newValue.textContent = `${after} units`;
            if (saveButton) {
                saveButton.disabled = !adjustment.value || !Number.isInteger(count) || count < 0 ||
                    !reasonInput.value.trim() || (/Deduct stock/i.test(type) && count > before);
            }
        }
        function selectProduct(product) {
            if (!product) return;
            selectedProductId = product.id;
            productInput.value = `${product.name} · ${product.sku}`;
            productInput.dataset.productId = product.id;
            variantSelect.replaceChildren(...product.variant.opts.map(option => new Option(option, option)));
            const useVariants = typeof product.stock === 'object' && product.stock !== null;
            variantSelect.hidden = !useVariants;
            variantLabel.hidden = !useVariants;
            if (badge) badge.textContent = `Selected · ${product.sku}`;
            refreshStockPreview();
        }
        variantSelect.addEventListener('change', refreshStockPreview);
        [quantityInput, adjustment, reasonInput].forEach(control => control.addEventListener('input', refreshStockPreview));
        adjustment.addEventListener('change', refreshStockPreview);
        form.addEventListener('submit', event => {
            event.preventDefault();
            const product = selectedProduct();
            if (!product) return notice('Select a product before recording a stock adjustment.', 'error');
            const quantity = Number(quantityInput.value);
            const type = adjustment.value;
            const reason = reasonInput.value.trim();
            const variant = variantSelect.value || '';
            if (!['Receive stock (+)', 'Deduct stock (-)', 'Set exact count'].includes(type)) {
                return notice('Choose a stock adjustment type.', 'error');
            }
            if (!Number.isInteger(quantity) || quantity <= 0) return notice('Enter a whole-number quantity greater than zero.', 'error');
            if (!reason) return notice('Enter a reason or reference for this adjustment.', 'error');
            const before = productStockFor(product, variant);
            if (/Deduct stock/i.test(type) && quantity > before) return notice(`Only ${before} units are available for this variant.`, 'error');
            const after = /Receive stock/i.test(type) ? before + quantity :
                /Deduct stock/i.test(type) ? before - quantity : quantity;
            const nextProducts = products.map(item => {
                if (item.id !== product.id) return item;
                if (item.stock && typeof item.stock === 'object') {
                    return { ...item, stock: { ...item.stock, [variant]: after } };
                }
                return { ...item, stock: after };
            });
            if (!saveProducts(nextProducts, 'Adjusted inventory', `${product.sku} · ${type} · ${quantity} · ${reason}`)) return;
            const movements = stockMovements();
            movements.unshift({
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                at: new Date().toISOString(),
                productId: product.id,
                productName: product.name,
                sku: product.sku,
                variant,
                type,
                quantity,
                before,
                after,
                reason,
                actor: getSessionUser()
            });
            const movementSaved = writeJSON('alboraStockMovements', movements.slice(0, 1000));
            quantityInput.value = '';
            reasonInput.value = '';
            renderStockUpdate();
            updateInventoryStats();
            const refreshed = products.find(item => item.id === product.id);
            if (refreshed) selectProduct(refreshed);
            if (movementSaved) notice(`${product.name} stock updated: ${before} → ${after}.`, 'success');
            else notice('Stock was updated, but its movement could not be saved. Check browser storage.', 'error');
        });
        document.addEventListener('click', event => {
            const button = event.target.closest('[data-stock-select]');
            if (button) selectProduct(products.find(product => product.id === button.dataset.stockSelect));
        });
        $$('.filter-bar input, .filter-bar select').forEach(control => {
            control.addEventListener('input', renderStockUpdate);
            control.addEventListener('change', renderStockUpdate);
        });
        if (initialId) selectProduct(products.find(product => product.id === initialId));
        renderStockUpdate();
    }

    function renderStockAlerts() {
        if (page !== 'alerts_stock.html') return;
        const body = $('tbody');
        if (!body) return;
        const alerts = products.filter(product => !product.archived && stockCount(product) <= product.threshold);
        const query = $('input[placeholder*="Search stock alerts"]')?.value.trim().toLowerCase() || '';
        const statusFilter = $('select.filter-select')?.value || 'All alerts';
        const visible = alerts.filter(product => {
            if (query && !`${product.name} ${product.sku}`.toLowerCase().includes(query)) return false;
            if (/Low stock/i.test(statusFilter) && stockCount(product) <= 0) return false;
            if (/Out of stock/i.test(statusFilter) && stockCount(product) > 0) return false;
            return true;
        });
        body.innerHTML = visible.length ? visible.map(product => {
            const stock = stockCount(product);
            const suggested = Math.max(0, product.threshold * 2 - stock);
            return `<tr><td>${escapeHTML(product.name)}</td><td>${escapeHTML(product.sku)}</td>
                <td><span class="status-pill ${stock <= 0 ? 'bad' : 'warn'}">${stock}</span></td>
                <td>${Number(product.sold) || 0}</td><td class="text-end">${suggested}</td>
                <td><a class="btn btn-sm btn-outline-secondary" href="stock_list_update.html?id=${encodeURIComponent(product.id)}">Adjust stock</a></td></tr>`;
        }).join('') : '<tr><td colspan="6" class="text-center text-muted py-4">No products match these stock alerts.</td></tr>';
        const select = $('select.filter-select');
        if (select && !select.dataset.adminStockOptions) {
            select.replaceChildren(new Option(`All alerts · ${alerts.length}`, 'All alerts'),
                new Option(`Low stock · ${alerts.filter(product => stockCount(product) > 0).length}`, 'Low stock'),
                new Option(`Out of stock · ${alerts.filter(product => stockCount(product) <= 0).length}`, 'Out of stock'));
            select.dataset.adminStockOptions = 'true';
        }
        const search = $('input[placeholder*="Search stock alerts"]');
        if (search && !search.dataset.adminStockBound) {
            search.dataset.adminStockBound = 'true';
            search.addEventListener('input', renderStockAlerts);
        }
        if (select && !select.dataset.adminStockBound) {
            select.dataset.adminStockBound = 'true';
            select.addEventListener('change', renderStockAlerts);
        }
        const exportButton = $$('button').find(button => /export restock list/i.test(button.textContent));
        if (exportButton && !exportButton.dataset.adminExportBound) {
            exportButton.dataset.adminExportBound = 'true';
            exportButton.addEventListener('click', () => exportCSV(alerts.map(product => ({
                name: product.name,
                sku: product.sku,
                stock: stockCount(product),
                threshold: product.threshold,
                suggestedRestock: Math.max(0, product.threshold * 2 - stockCount(product))
            })), 'albora-restock-list.csv'));
        }
    }

    function renderInventoryReport() {
        if (page !== 'inventory.html') return;
        const body = $('tbody');
        if (!body) return;
        const categories = new Map();
        products.filter(product => !product.archived).forEach(product => {
            const group = categories.get(product.cat) || { count: 0, stock: 0, low: 0, out: 0 };
            const quantity = stockCount(product);
            group.count += 1;
            group.stock += quantity;
            if (quantity <= 0) group.out += 1;
            else if (quantity <= product.threshold) group.low += 1;
            categories.set(product.cat, group);
        });
        body.innerHTML = categories.size ? Array.from(categories.entries()).map(([category, values]) =>
            `<tr><td>${escapeHTML(category)}</td><td class="text-end">${values.count}</td><td class="text-end">${values.stock}</td><td class="text-end">${values.low}</td><td class="text-end">${values.out}</td></tr>`
        ).join('') : '<tr><td colspan="5" class="text-center text-muted py-4">No inventory records yet.</td></tr>';

        const chart = $('.mock-chart');
        if (chart) {
            const max = Math.max(1, ...Array.from(categories.values(), item => item.stock));
            chart.innerHTML = Array.from(categories.entries()).map(([category, values]) => {
                const percent = Math.round(values.stock / max * 100);
                return `<div class="bar-wrapper"><div class="bar" style="height:${percent}%"></div><div class="bar-label">${escapeHTML(category)} · ${values.stock}</div></div>`;
            }).join('');
        }
        const exportButton = $$('button').find(button => /export pdf \/ csv/i.test(button.textContent));
        if (exportButton && !exportButton.dataset.adminExportBound) {
            exportButton.dataset.adminExportBound = 'true';
            exportButton.addEventListener('click', () => exportCSV(Array.from(categories.entries()).map(([category, values]) => ({
                category, products: values.count, availableUnits: values.stock, lowStock: values.low, outOfStock: values.out
            })), 'albora-inventory-report.csv'));
        }
    }

    function updateDashboardMetrics() {
        if (page !== 'dashboard_admin.html') return;
        const cards = $$('.stat-card');
        const lowStock = products.filter(item => !item.archived && stockCount(item) <= item.threshold).length;
        if (cards[2]) {
            const value = $('.stat-value', cards[2]);
            const desc = $('.stat-desc', cards[2]);
            if (value) value.textContent = String(lowStock);
            if (desc) desc.textContent = lowStock ? 'Products at or below their reorder threshold' : 'All products are above their reorder threshold';
        }
        const alert = $$('.alert-custom').find(item => /stock alerts/i.test(item.textContent));
        if (alert) {
            const title = $('.alert-title', alert);
            const text = $('.alert-text', alert);
            if (title) title.textContent = lowStock ? `${lowStock} stock alert${lowStock === 1 ? '' : 's'}` : 'No stock alerts';
            if (text) text.textContent = lowStock ? 'Review Inventory to replenish products at or below their low-stock threshold.' : 'Inventory is above each product low-stock threshold.';
        }
    }

    function reportingRows() {
        const savedReceipts = readJSON('alboraPosReceipts', []);
        const receipts = Array.isArray(savedReceipts) ? savedReceipts : [];
        if (!Array.isArray(savedReceipts)) notice('Saved POS receipt data is invalid and could not be included in reports.', 'error');
        const orders = customerOrders();
        const catalog = products.filter(product => !product.archived);
        const findProduct = item => catalog.find(product =>
            (item.productId && product.id === item.productId) ||
            (item.sku && product.sku?.toLowerCase() === String(item.sku).toLowerCase()) ||
            product.name.toLowerCase() === String(item.name || '').toLowerCase()
        );
        const rows = [];
        receipts.forEach(receipt => {
            if (!receipt || !Array.isArray(receipt.items) || !Number.isFinite(Date.parse(receipt.createdAt))) return;
            const gross = receipt.items.reduce((sum, item) =>
                sum + Math.max(0, Number(item.price) || 0) * Math.max(0, Number(item.quantity) || 0), 0);
            const discount = Math.min(gross, Math.max(0, Number(receipt.discount) || 0));
            receipt.items.forEach(item => {
                const quantity = Math.max(0, Number(item.quantity) || 0);
                const lineGross = Math.max(0, Number(item.price) || 0) * quantity;
                if (!quantity || !lineGross) return;
                const product = findProduct(item);
                rows.push({
                    channel: 'Walk-in',
                    orderId: receipt.receiptNumber || '',
                    date: new Date(receipt.createdAt),
                    name: String(item.name || product?.name || 'Unknown product'),
                    category: String(item.category || product?.cat || 'Uncategorized'),
                    quantity,
                    revenue: Math.max(0, lineGross - (gross ? discount * lineGross / gross : 0)),
                    cost: Math.max(0, Number(product?.cost) || 0) * quantity
                });
            });
        });
        orders.forEach(order => {
            if (order.pay?.product?.status !== 'verified' || !Array.isArray(order.items)) return;
            const timestamp = Number(order.at);
            const date = new Date(Number.isFinite(timestamp) ? timestamp : order.at);
            if (Number.isNaN(date.getTime())) return;
            order.items.forEach(item => {
                const quantity = Math.max(0, Number(item.qty) || 0);
                const revenue = Math.max(0, Number(item.amt) || (Number(item.unit) || 0) * quantity);
                if (!quantity || !revenue) return;
                const product = findProduct(item);
                rows.push({
                    channel: 'Online',
                    orderId: String(order.id),
                    date,
                    name: String(item.name || product?.name || 'Unknown product'),
                    category: String(product?.cat || item.category || 'Uncategorized'),
                    quantity,
                    revenue,
                    cost: Math.max(0, Number(product?.cost) || 0) * quantity
                });
            });
        });
        return rows;
    }

    function reportMoney(value) {
        return `₱${(Number(value) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    function renderBarChart(container, entries, valueOf, labelOf, formatter, maxItems = 12) {
        if (!container) return;
        const values = entries.slice(0, maxItems);
        if (!values.length) {
            container.innerHTML = '<div class="text-muted small py-3">No records to chart yet. Complete a POS sale or verify an online product payment to see results.</div>';
            return;
        }
        const maximum = Math.max(0, ...values.map(valueOf));
        container.replaceChildren(...values.map(entry => {
            const value = Math.max(0, Number(valueOf(entry)) || 0);
            const wrapper = document.createElement('div');
            wrapper.className = 'bar-wrapper';
            const bar = document.createElement('div');
            bar.className = 'bar';
            bar.style.height = maximum > 0 && value > 0 ? `${Math.max(4, value / maximum * 100)}%` : '0%';
            bar.setAttribute('role', 'img');
            bar.setAttribute('aria-label', `${labelOf(entry)}: ${formatter(value)}`);
            bar.title = `${labelOf(entry)} · ${formatter(value)}`;
            const label = document.createElement('div');
            label.className = 'bar-label';
            const fullLabel = labelOf(entry);
            label.textContent = fullLabel.length > 20 ? `${fullLabel.slice(0, 18)}…` : fullLabel;
            label.title = fullLabel;
            label.style.maxWidth = '100%';
            label.style.overflow = 'hidden';
            label.style.textOverflow = 'ellipsis';
            wrapper.append(bar, label);
            return wrapper;
        }));
    }

    function dayKey(date) {
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' })
            .format(date);
    }

    function monthKey(date) {
        const parts = new Intl.DateTimeFormat('en', {
            timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit'
        }).formatToParts(date);
        const year = parts.find(part => part.type === 'year')?.value;
        const month = parts.find(part => part.type === 'month')?.value;
        return `${year}-${month}`;
    }

    function yearKey(date) {
        return new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', year: 'numeric' }).format(date);
    }

    function weekKey(date) {
        const [year, month, day] = dayKey(date).split('-').map(Number);
        const start = new Date(Date.UTC(year, month - 1, day));
        start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
        return start.toISOString().slice(0, 10);
    }

    function renderDashboardSalesComboChart(rows) {
        const container = $('#dashboardSalesChart');
        const periodSelect = $('#dashboardSalesPeriod');
        if (!container || !periodSelect) return;
        const period = periodSelect.value;
        const now = new Date();
        const buckets = [];
        if (period === 'yearly') {
            const currentYear = Number(yearKey(now));
            for (let index = 5; index >= 0; index -= 1) {
                const year = currentYear - index;
                buckets.push({
                    key: String(year),
                    label: String(year),
                    date: new Date(Date.UTC(year, 0, 1))
                });
            }
        } else if (period === 'monthly') {
            const [currentYear, currentMonth] = monthKey(now).split('-').map(Number);
            for (let index = 11; index >= 0; index -= 1) {
                const date = new Date(Date.UTC(currentYear, currentMonth - 1 - index, 1));
                buckets.push({
                    key: monthKey(date),
                    label: date.toLocaleDateString('en-PH', { month: 'short', timeZone: 'UTC' }),
                    date
                });
            }
        } else if (period === 'weekly') {
            const currentWeek = new Date(`${weekKey(now)}T00:00:00Z`);
            for (let index = 7; index >= 0; index -= 1) {
                const date = new Date(currentWeek);
                date.setUTCDate(date.getUTCDate() - index * 7);
                const key = date.toISOString().slice(0, 10);
                buckets.push({
                    key,
                    label: date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
                    date
                });
            }
        } else {
            const monday = new Date(`${weekKey(now)}T00:00:00Z`);
            for (let index = 0; index < 7; index += 1) {
                const date = new Date(monday);
                date.setUTCDate(date.getUTCDate() + index);
                buckets.push({
                    key: date.toISOString().slice(0, 10),
                    label: date.toLocaleDateString('en-PH', { weekday: 'long', timeZone: 'UTC' }),
                    date
                });
            }
        }
        const totals = new Map(buckets.map(bucket => [bucket.key, 0]));
        rows.forEach(row => {
            const key = period === 'yearly' ? yearKey(row.date) :
                period === 'monthly' ? monthKey(row.date) :
                    period === 'weekly' ? weekKey(row.date) : dayKey(row.date);
            if (totals.has(key)) totals.set(key, totals.get(key) + row.revenue);
        });
        const values = buckets.map(bucket => ({
            ...bucket,
            revenue: totals.get(bucket.key) || 0
        }));

        const width = Math.max(320, Math.round(container.clientWidth || 960));
        const compact = width < 500;
        const height = compact ? 260 : 300;
        const isLineChart = period === 'monthly' || period === 'yearly';
        const margin = compact
            ? { top: 18, right: 12, bottom: 42, left: 48 }
            : { top: 20, right: 20, bottom: 46, left: 62 };
        const axisFontSize = compact ? 9 : 12;
        const plotWidth = width - margin.left - margin.right;
        const plotHeight = height - margin.top - margin.bottom;
        const maxRevenue = Math.max(0, ...values.map(item => item.revenue));
        const revenueScaleMax = maxRevenue > 0 ? maxRevenue * 1.15 : 0;
        const x = index => margin.left + (index + 0.5) * plotWidth / values.length;
        const yRevenue = value => margin.top + plotHeight -
            (revenueScaleMax > 0 ? value / revenueScaleMax * plotHeight : 0);
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-labelledby', 'dashboard-sales-chart-title dashboard-sales-chart-description');
        const add = (name, attributes, text) => {
            const element = document.createElementNS('http://www.w3.org/2000/svg', name);
            Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
            if (text) element.textContent = text;
            svg.appendChild(element);
            return element;
        };
        add('title', { id: 'dashboard-sales-chart-title' }, `Product sales ${period} ${isLineChart ? 'line' : 'bar'} chart`);
        add('desc', { id: 'dashboard-sales-chart-description' },
            isLineChart
                ? 'A green line shows product sales in pesos over time.'
                : period === 'daily'
                    ? 'Gold bars show product sales in pesos from Monday through Sunday.'
                    : 'Gold bars show product sales in pesos for each time bucket.');

        for (let tick = 0; tick <= 4; tick += 1) {
            const ratio = tick / 4;
            const y = margin.top + plotHeight * ratio;
            const amount = revenueScaleMax * (1 - ratio);
            add('line', { x1: margin.left, y1: y, x2: width - margin.right, y2: y, stroke: '#eee8dc', 'stroke-width': 1 });
            add('text', {
                x: margin.left - 8, y: y + 4, 'text-anchor': 'end',
                fill: '#7c796f', 'font-size': axisFontSize
            }, amount >= 1000 ? `₱${(amount / 1000).toFixed(amount >= 10000 ? 0 : 1)}k` : `₱${Math.round(amount)}`);
        }

        if (isLineChart) {
            const linePath = values.map((item, index) =>
                `${index ? 'L' : 'M'} ${x(index)} ${yRevenue(item.revenue)}`
            ).join(' ');
            const path = add('path', {
                d: linePath, fill: 'none', stroke: '#47665b', 'stroke-width': 3,
                'stroke-linecap': 'round', 'stroke-linejoin': 'round'
            });
            values.forEach((item, index) => {
                const circle = add('circle', {
                    cx: x(index), cy: yRevenue(item.revenue), r: 4,
                    fill: '#47665b', stroke: '#fff', 'stroke-width': 2
                });
                const pointTitle = document.createElementNS('http://www.w3.org/2000/svg', 'title');
                pointTitle.textContent = `${item.label}: ${reportMoney(item.revenue)}`;
                circle.appendChild(pointTitle);
            });
            path.setAttribute('aria-hidden', 'true');
        } else {
            const barWidth = Math.max(2, Math.min(34, plotWidth / values.length * 0.58));
            values.forEach((item, index) => {
                const barTop = yRevenue(item.revenue);
                const bar = add('rect', {
                    x: x(index) - barWidth / 2,
                    y: barTop,
                    width: barWidth,
                    height: Math.max(0, margin.top + plotHeight - barTop),
                    rx: Math.min(4, barWidth / 3),
                    fill: '#c5a038',
                    opacity: item.revenue > 0 ? 0.88 : 0.18
                });
                const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
                title.textContent = `${item.label}: ${reportMoney(item.revenue)}`;
                bar.appendChild(title);
            });
        }
        values.forEach((item, index) => {
            add('text', {
                x: x(index), y: height - 12, 'text-anchor': 'middle',
                fill: '#7c796f', 'font-size': compact ? 8.5 : period === 'monthly' ? 11 : 12
            }, item.label);
        });
        if (!maxRevenue) {
            add('text', {
                x: width / 2, y: margin.top + plotHeight / 2,
                'text-anchor': 'middle', fill: '#7c796f', 'font-size': 14
            }, 'No sales recorded in this period');
        }
        const label = period === 'daily' ? 'Daily · Monday-Sunday' :
            period === 'weekly' ? 'Weekly · last 8 weeks' :
                period === 'monthly' ? 'Monthly · last 12 months' : 'Yearly · last 6 years';
        const chartTitle = $('#chartTitle');
        if (chartTitle) chartTitle.textContent = `Product sales · ${period[0].toUpperCase()}${period.slice(1)}`;
        container.setAttribute('aria-label', `Product sales ${isLineChart ? 'line' : 'bar'} chart. ${label}.`);
        container.replaceChildren(svg);
        const legendItems = $$('.chart-legend-item', $('.chart-legend'));
        if (legendItems[0]) {
            legendItems[0].style.display = isLineChart ? 'none' : '';
        }
        if (legendItems[1]) {
            legendItems[1].style.display = isLineChart ? '' : 'none';
            const legendLabel = $('[data-sales-trend-legend]', legendItems[1]);
            if (legendLabel) legendLabel.textContent = 'Sales trend (₱)';
        }
        const title = $('.section-header .section-title');
        if (title) title.title = label;
    }

    function renderDashboardOrders() {
        const body = $('#dashboardLatestOrders');
        if (!body) return;
        const onlineOrders = customerOrders().map(order => ({
            id: String(order.id),
            at: Number.isFinite(Number(order.at)) ? new Date(Number(order.at)) : new Date(order.at),
            customer: order.cust?.name || '—',
            channel: 'Online',
            items: Array.isArray(order.items) ? order.items.map(item => `${item.name} × ${item.qty}`).join(', ') : '—',
            payment: `${orderPaymentLabel(order.pay.product)} · ${orderPaymentLabel(order.pay.ship)}`,
            fulfillment: orderStage(order),
            href: `order_details.html?id=${encodeURIComponent(order.id)}`
        }));
        const savedReceipts = readJSON('alboraPosReceipts', []);
        if (!Array.isArray(savedReceipts)) {
            notice('Saved POS receipt data is invalid and could not be displayed on the dashboard.', 'error');
        }
        const walkInOrders = (Array.isArray(savedReceipts) ? savedReceipts : []).filter(receipt =>
            receipt && Number.isFinite(Date.parse(receipt.createdAt))
        ).map(receipt => ({
            id: String(receipt.receiptNumber || 'POS sale'),
            at: new Date(receipt.createdAt),
            customer: receipt.customerName || receipt.customerContact || 'Walk-in customer',
            channel: receipt.demo === true ? 'Walk-in · Demo' : 'Walk-in',
            items: Array.isArray(receipt.items) ? receipt.items.map(item => `${item.name} × ${item.quantity}`).join(', ') : '—',
            payment: `${receipt.paymentMethod || 'Payment'} · paid`,
            fulfillment: 'Complete',
            href: 'transaction_list.html'
        }));
        const latest = [...onlineOrders, ...walkInOrders]
            .filter(order => !Number.isNaN(order.at.getTime()))
            .sort((a, b) => b.at - a.at)
            .slice(0, 8);
        body.innerHTML = latest.length ? latest.map(order => `<tr>
            <td><a href="${order.href}">${escapeHTML(order.id)}</a><small class="d-block text-muted">${escapeHTML(orderTime(order.at))}</small></td>
            <td>${escapeHTML(order.customer)}</td>
            <td>${escapeHTML(order.channel)}</td>
            <td>${escapeHTML(order.items)}</td>
            <td>${escapeHTML(order.payment)}</td>
            <td>${escapeHTML(order.fulfillment)}</td>
        </tr>`).join('') : '<tr><td colspan="6" class="text-center text-muted py-4">No orders or POS sales recorded yet.</td></tr>';
    }

    function renderDashboardActionQueue(orders) {
        const list = $('#dashboardActionQueue');
        if (!list) return;
        const counts = [
            orders.filter(order => order.pay.product?.status === 'pending').length,
            orders.filter(order => order.pay.ship?.status === 'pending').length,
            orders.filter(order => order.pay.product?.status === 'verified' && order.ship?.fee == null).length,
            orders.filter(order => order.pay.product?.status === 'verified' &&
                order.pay.ship?.status === 'verified' && !['Shipped', 'Delivered'].includes(order.fulfillment)).length
        ];
        const labels = ['Product payments to review', 'Shipping payments to review', 'Shipping fees to quote', 'Ready for dispatch'];
        list.innerHTML = labels.map((label, index) =>
            `<li><span>${label}</span><span class="action-count">${counts[index]}</span></li>`
        ).join('');
    }

    function renderDashboardCharts() {
        if (page !== 'dashboard_admin.html') return;
        const rows = reportingRows();
        const orders = customerOrders();
        const today = dayKey(new Date());
        const weekStart = new Date(`${today}T00:00:00Z`);
        weekStart.setUTCDate(weekStart.getUTCDate() - 6);
        const weekStartKey = weekStart.toISOString().slice(0, 10);
        const todayRows = rows.filter(row => dayKey(row.date) === today);
        const weekRows = rows.filter(row => dayKey(row.date) >= weekStartKey && dayKey(row.date) <= today);
        const todayRevenue = todayRows.reduce((sum, row) => sum + row.revenue, 0);
        const weekRevenue = weekRows.reduce((sum, row) => sum + row.revenue, 0);
        const openOrders = orders.filter(order =>
            order.fulfillment !== 'Delivered' && !(order.pay?.product?.status === 'verified' && order.pay?.ship?.status === 'verified' && order.tracking)
        ).length;
        const cards = $$('.stat-card');
        if (cards[0]) {
            const value = $('.stat-value', cards[0]);
            const desc = $('.stat-desc', cards[0]);
            if (value) value.textContent = reportMoney(todayRevenue);
            if (desc) desc.textContent = `${new Set(todayRows.map(row => `${row.channel}:${row.orderId}`)).size} recorded sale(s) today`;
        }
        if (cards[1]) {
            const value = $('.stat-value', cards[1]);
            const desc = $('.stat-desc', cards[1]);
            if (value) value.textContent = String(openOrders);
            if (desc) desc.textContent = openOrders ? 'Online orders still in progress' : 'No open online orders';
        }
        if (cards[3]) {
            const value = $('.stat-value', cards[3]);
            const desc = $('.stat-desc', cards[3]);
            if (value) value.textContent = reportMoney(weekRevenue);
            if (desc) desc.textContent = `${new Set(weekRows.map(row => `${row.channel}:${row.orderId}`)).size} recorded sale(s) in the last 7 days`;
        }
        const dateLabel = $('#dashboardDate');
        if (dateLabel) {
            dateLabel.textContent = `${new Date().toLocaleDateString('en-PH', {
                weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
            })} · Today's operations at a glance`;
        }
        renderDashboardActionQueue(orders);
        renderDashboardOrders();
        renderDashboardSalesComboChart(rows);
        const periodSelect = $('#dashboardSalesPeriod');
        if (periodSelect && !periodSelect.dataset.chartBound) {
            periodSelect.dataset.chartBound = 'true';
            periodSelect.addEventListener('change', renderDashboardCharts);
        }
        if (periodSelect && !periodSelect.dataset.chartResizeBound) {
            periodSelect.dataset.chartResizeBound = 'true';
            let resizeFrame = 0;
            window.addEventListener('resize', () => {
                if (resizeFrame) cancelAnimationFrame(resizeFrame);
                resizeFrame = requestAnimationFrame(() => {
                    resizeFrame = 0;
                    renderDashboardSalesComboChart(reportingRows());
                });
            }, { passive: true });
        }
    }

    function renderBusinessAnalytics() {
        if (page !== 'business_analytics.html') return;
        const rows = reportingRows();
        const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
        const cost = rows.reduce((sum, row) => sum + row.cost, 0);
        const grossProfit = revenue - cost;
        const online = rows.filter(row => row.channel === 'Online').reduce((sum, row) => sum + row.revenue, 0);
        const walkIn = revenue - online;
        const onlinePercent = revenue ? online / revenue * 100 : 0;
        const walkInPercent = revenue ? walkIn / revenue * 100 : 0;
        const cards = $$('.stat-card');
        if (cards[0]?.querySelector('.stat-value')) cards[0].querySelector('.stat-value').textContent = reportMoney(revenue);
        if (cards[0]?.querySelector('.stat-desc')) cards[0].querySelector('.stat-desc').textContent = `${rows.length ? new Set(rows.map(row => `${row.channel}:${row.orderId}`)).size : 0} completed order(s)`;
        if (cards[1]?.querySelector('.stat-value')) cards[1].querySelector('.stat-value').textContent = `${onlinePercent.toFixed(2)}%`;
        if (cards[1]?.querySelector('.stat-desc')) cards[1].querySelector('.stat-desc').textContent = `${reportMoney(online)} from verified online product payments`;
        if (cards[2]?.querySelector('.stat-value')) cards[2].querySelector('.stat-value').textContent = `${walkInPercent.toFixed(2)}%`;
        if (cards[2]?.querySelector('.stat-desc')) cards[2].querySelector('.stat-desc').textContent = `${reportMoney(walkIn)} from completed POS sales`;
        if (cards[3]?.querySelector('.stat-value')) cards[3].querySelector('.stat-value').textContent = `${(revenue ? grossProfit / revenue * 100 : 0).toFixed(2)}%`;
        if (cards[3]?.querySelector('.stat-desc')) cards[3].querySelector('.stat-desc').textContent = `${reportMoney(grossProfit)} gross profit using current catalog costs`;

        const channelBar = $('.channel-bar');
        if (channelBar) {
            const segments = $$('.channel-segment', channelBar);
            if (segments[0]) {
                segments[0].style.width = `${onlinePercent}%`;
                segments[0].textContent = onlinePercent >= 8 ? `Online ${onlinePercent.toFixed(0)}%` : '';
                segments[0].setAttribute('aria-label', `Online ${onlinePercent.toFixed(2)}%`);
            }
            if (segments[1]) {
                segments[1].style.width = `${walkInPercent}%`;
                segments[1].textContent = walkInPercent >= 8 ? `Walk-in ${walkInPercent.toFixed(0)}%` : '';
                segments[1].setAttribute('aria-label', `Walk-in ${walkInPercent.toFixed(2)}%`);
            }
        }
        const channelDescriptions = $$('.channel-bar + .d-flex .stat-desc');
        if (channelDescriptions[0]) channelDescriptions[0].textContent = `Online · ${new Set(rows.filter(row => row.channel === 'Online').map(row => row.orderId)).size} orders · ${reportMoney(online)} · ${onlinePercent.toFixed(2)}%`;
        if (channelDescriptions[1]) channelDescriptions[1].textContent = `Walk-in · ${new Set(rows.filter(row => row.channel === 'Walk-in').map(row => row.orderId)).size} sales · ${reportMoney(walkIn)} · ${walkInPercent.toFixed(2)}%`;
        const categoryTotals = new Map();
        rows.forEach(row => categoryTotals.set(row.category, (categoryTotals.get(row.category) || 0) + row.revenue));
        renderBarChart($('.mock-bar-chart'), Array.from(categoryTotals, ([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value), item => item.value, item => item.label, reportMoney, 8);

        const aggregate = new Map();
        rows.forEach(row => {
            const item = aggregate.get(row.name) || { name: row.name, category: row.category, units: 0, revenue: 0, cost: 0 };
            item.units += row.quantity;
            item.revenue += row.revenue;
            item.cost += row.cost;
            aggregate.set(row.name, item);
        });
        const body = $('tbody', $$('.table', document).find(table => $$('th', table).length === 4) || document);
        const ranked = Array.from(aggregate.values()).sort((a, b) => b.units - a.units || b.revenue - a.revenue);
        if (body && page === 'business_analytics.html') body.innerHTML = ranked.length ? ranked.slice(0, 10).map(item => {
            const product = products.find(entry => entry.name === item.name);
            return `<tr><td>${escapeHTML(item.name)}</td><td class="text-end">${item.units}</td><td class="text-end">${reportMoney(item.revenue)}</td><td class="text-end">${stockCount(product || { stock: 0 })}</td></tr>`;
        }).join('') : '<tr><td colspan="4" class="text-center text-muted">No products or sales yet</td></tr>';
        const exportButton = $$('button').find(button => /download insights/i.test(button.textContent));
        if (exportButton && !exportButton.dataset.analyticsExportBound) {
            exportButton.dataset.analyticsExportBound = 'true';
            exportButton.addEventListener('click', () => exportCSV(ranked.map(item => ({
                product: item.name, category: item.category, units: item.units, revenue: item.revenue, cost: item.cost,
                grossProfit: item.revenue - item.cost
            })), 'albora-business-insights.csv'));
        }
    }

    function renderProfitReport() {
        if (page !== 'profits.html') return;
        const rows = reportingRows();
        const channels = ['Walk-in', 'Online'].map(channel => {
            const channelRows = rows.filter(row => row.channel === channel);
            const revenue = channelRows.reduce((sum, row) => sum + row.revenue, 0);
            const cost = channelRows.reduce((sum, row) => sum + row.cost, 0);
            return { channel, revenue, cost, profit: revenue - cost, margin: revenue ? (revenue - cost) / revenue * 100 : 0 };
        });
        const revenue = channels.reduce((sum, channel) => sum + channel.revenue, 0);
        const cost = channels.reduce((sum, channel) => sum + channel.cost, 0);
        const profit = revenue - cost;
        const cards = $$('.stat-card');
        if (cards[0]?.querySelector('.stat-value')) cards[0].querySelector('.stat-value').textContent = reportMoney(profit);
        if (cards[0]?.querySelector('.stat-desc')) cards[0].querySelector('.stat-desc').textContent = `${reportMoney(revenue)} product revenue less ${reportMoney(cost)} product costs`;
        if (cards[1]?.querySelector('.stat-value')) cards[1].querySelector('.stat-value').textContent = `${revenue ? (profit / revenue * 100).toFixed(1) : 0}%`;
        if (cards[2]?.querySelector('.stat-value')) cards[2].querySelector('.stat-value').textContent = reportMoney(profit);
        if (cards[2]?.querySelector('.stat-desc')) cards[2].querySelector('.stat-desc').textContent = 'Gross profit · operating expenses are not recorded in this prototype';
        const values = [
            { label: 'Revenue', value: revenue },
            { label: 'Costs', value: cost },
            { label: 'Gross profit', value: profit },
            { label: 'Expenses', value: 0 },
            { label: 'Net profit', value: profit }
        ];
        renderBarChart($('.mock-chart'), values, item => item.value, item => `${item.label} · ${reportMoney(item.value)}`, reportMoney, 5);
        const body = $$('table').find(table => $$('th', table).length === 5)?.querySelector('tbody');
        if (body) body.innerHTML = channels.map(item =>
            `<tr><td>${item.channel}</td><td class="text-end">${reportMoney(item.revenue)}</td><td class="text-end">${reportMoney(item.cost)}</td><td class="text-end">${reportMoney(item.profit)}</td><td class="text-end">${item.margin.toFixed(1)}%</td></tr>`
        ).join('');
        const exportButton = $$('button').find(button => /export pdf \/ csv/i.test(button.textContent));
        if (exportButton && !exportButton.dataset.profitExportBound) {
            exportButton.dataset.profitExportBound = 'true';
            exportButton.addEventListener('click', () => exportCSV(channels, 'albora-profit-report.csv'));
        }
    }

    function renderProductPerformance() {
        if (page !== 'product_performance.html') return;
        const rows = reportingRows();
        const aggregate = new Map();
        rows.forEach(row => {
            const item = aggregate.get(row.name) || { name: row.name, category: row.category, units: 0, revenue: 0, cost: 0 };
            item.units += row.quantity;
            item.revenue += row.revenue;
            item.cost += row.cost;
            aggregate.set(row.name, item);
        });
        const ranked = Array.from(aggregate.values()).sort((a, b) => b.units - a.units || b.revenue - a.revenue);
        const top = ranked[0];
        const cards = $$('.stat-card');
        if (cards[0]?.querySelector('.stat-value')) cards[0].querySelector('.stat-value').textContent = String(top?.units || 0);
        if (cards[0]?.querySelector('.stat-desc')) cards[0].querySelector('.stat-desc').textContent = top?.name || 'No completed sales yet';
        if (cards[1]?.querySelector('.stat-value')) cards[1].querySelector('.stat-value').textContent = reportMoney(top?.revenue || 0);
        if (cards[1]?.querySelector('.stat-desc')) cards[1].querySelector('.stat-desc').textContent = top?.name || 'No completed sales yet';
        const bestMargin = ranked.reduce((best, item) => {
            const margin = item.revenue ? (item.revenue - item.cost) / item.revenue * 100 : 0;
            return margin > best.margin ? { item, margin } : best;
        }, { item: null, margin: -Infinity });
        if (cards[2]?.querySelector('.stat-value')) cards[2].querySelector('.stat-value').textContent = bestMargin.item ? `${bestMargin.margin.toFixed(1)}%` : '0%';
        if (cards[2]?.querySelector('.stat-desc')) cards[2].querySelector('.stat-desc').textContent = bestMargin.item?.name || 'No margin data yet';
        renderBarChart($('.mock-chart'), ranked, item => item.units, item => item.name, value => `${value} sold`, 8);
        const body = $$('table').find(table => $$('th', table).length === 6)?.querySelector('tbody');
        if (body) body.innerHTML = ranked.length ? ranked.slice(0, 20).map(item => {
            const product = products.find(entry => entry.name === item.name);
            const unitCost = Number(product?.cost) || 0;
            const averageUnitCost = item.units ? item.cost / item.units : unitCost;
            return `<tr><td>${escapeHTML(item.name)}</td><td>${escapeHTML(item.category)}</td><td class="text-end">${item.units}</td><td class="text-end">${reportMoney(item.revenue)}</td><td class="text-end">${reportMoney(averageUnitCost)}</td><td class="text-end">${reportMoney(item.revenue - item.cost)}</td></tr>`;
        }).join('') : '<tr><td colspan="6" class="text-center text-muted py-4">No product performance data yet. Complete a POS sale or verify an online product payment.</td></tr>';
        const exportButton = $$('button').find(button => /export pdf \/ csv/i.test(button.textContent));
        if (exportButton && !exportButton.dataset.performanceExportBound) {
            exportButton.dataset.performanceExportBound = 'true';
            exportButton.addEventListener('click', () => exportCSV(ranked.map(item => ({
                product: item.name, category: item.category, units: item.units, revenue: item.revenue,
                cost: item.cost, grossProfit: item.revenue - item.cost
            })), 'albora-product-performance.csv'));
        }
    }

    function renderOperationalCharts() {
        renderDashboardCharts();
        renderBusinessAnalytics();
        renderProfitReport();
        renderProductPerformance();
    }

    function renderAuditHistory() {
        if (page !== 'dashboard_admin.html') return;
        const content = $('.page-content');
        if (!content || $('#admin-audit-history')) return;
        const entries = readJSON(KEYS.audit, []);
        const card = document.createElement('section');
        card.id = 'admin-audit-history';
        card.className = 'admin-audit-card';
        card.innerHTML = '<div class="d-flex justify-content-between align-items-center gap-2 flex-wrap"><div><h2 class="h5 mb-1">Recent activity</h2><p class="text-muted mb-0">Administrative actions in this browser.</p></div><button type="button" class="btn btn-outline-dark btn-sm" data-export-audit>Export activity</button></div><div class="table-responsive mt-3"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead><tbody></tbody></table></div>';
        const body = $('tbody', card);
        (Array.isArray(entries) ? entries : []).slice(0, 8).forEach(entry => {
            const row = document.createElement('tr');
            const date = new Date(entry.at);
            row.innerHTML = `<td>${escapeHTML(Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString())}</td><td>${escapeHTML(entry.actor)} · ${escapeHTML(entry.role)}</td><td>${escapeHTML(entry.action)}</td><td>${escapeHTML(entry.detail)}</td>`;
            body.appendChild(row);
        });
        if (!body.children.length) body.innerHTML = '<tr><td colspan="4" class="text-muted">No activity recorded yet.</td></tr>';
        content.appendChild(card);
        $('[data-export-audit]', card)?.addEventListener('click', () => exportCSV(
            (Array.isArray(entries) ? entries : []).map(entry => ({
                at: entry.at, actor: entry.actor, role: entry.role, action: entry.action, detail: entry.detail
            })),
            'albora-activity-log.csv'
        ));
    }

    function roleSelectOptions(select) {
        if (!select) return;
        const current = select.value;
        select.replaceChildren(new Option('Select role', ''));
        Object.entries(roleLabels).forEach(([value, label]) => select.add(new Option(label, value)));
        if (Array.from(select.options).some(option => option.value === current)) select.value = current;
    }

    function renderUsers() {
        if (page !== 'user & permissions.html') return;
        const section = $$('h5').find(heading => /admin \/ staff accounts/i.test(heading.textContent))?.closest('.section-card');
        const body = $('tbody', section);
        if (!section || !body) return;
        users = readJSON(KEYS.users, []);
        if (!Array.isArray(users)) {
            notice('Saved account data is invalid and cannot be displayed.', 'error');
            users = [];
        }
        const activeCount = users.filter(user => user.status === 'Active').length;
        const pendingCount = users.filter(user => user.status === 'Invited').length;
        const statCards = $$('.stat-card');
        [users.length, activeCount, pendingCount].forEach((value, index) => {
            const stat = $('.stat-value', statCards[index]);
            if (stat) stat.textContent = String(value);
        });
        const header = $('thead tr', section);
        if (header && header.cells.length === 4) header.insertAdjacentHTML('beforeend', '<th scope="col">Actions</th>');
        body.innerHTML = users.length ? users.map(user => `<tr>
            <td>${escapeHTML(user.name)}<small class="d-block text-muted">${escapeHTML(user.email)}</small></td>
            <td>${escapeHTML(roleLabels[user.role] || user.role)}</td>
            <td><span class="status-pill ${user.status === 'Active' ? 'good' : 'warn'}">${escapeHTML(user.status)}</span></td>
            <td>${escapeHTML(user.lastActive || 'Never')}</td>
            <td class="text-nowrap"><button type="button" class="btn btn-sm btn-outline-secondary" data-user-edit="${escapeHTML(user.id)}">Edit</button><button type="button" class="btn btn-sm btn-outline-danger" data-user-deactivate="${escapeHTML(user.id)}">${user.status === 'Active' ? 'Deactivate' : 'Reactivate'}</button></td>
        </tr>`).join('') : '<tr><td colspan="5" class="text-center text-muted py-4">No accounts or invitations yet. Invite a team member to get started.</td></tr>';

        const forms = $$('form');
        const inviteForm = forms[0];
        const editForm = forms[1];
        const inviteRole = findControl(inviteForm, 'role');
        roleSelectOptions(inviteRole);
        if (inviteRole) inviteRole.required = true;
        const editRole = findControl(editForm, 'role');
        if (editRole) {
            roleSelectOptions(editRole);
            editRole.disabled = false;
        }
        const status = findControl(editForm, 'account status');
        if (status) {
            status.replaceChildren(new Option('Select status', ''), new Option('Active', 'Active'), new Option('Deactivated', 'Deactivated'));
            status.disabled = false;
        }
        const editControls = editForm ? $$('button', editForm) : [];
        editControls.forEach(button => { button.disabled = false; });
        if (editForm && !$('#accountTarget', editForm)) {
            const label = document.createElement('label');
            label.className = 'form-label';
            label.htmlFor = 'accountTarget';
            label.textContent = 'Account';
            const select = document.createElement('select');
            select.id = 'accountTarget';
            select.className = 'form-select mb-2';
            select.innerHTML = '<option value="">Select an account</option>';
            users.forEach(user => select.add(new Option(`${user.name} · ${user.email}`, user.id)));
            const firstLabel = $('label', editForm);
            firstLabel?.before(label, select);
            select.addEventListener('change', () => loadAccountForEdit(select.value, editForm));
        }
    }

    function loadAccountForEdit(id, form) {
        selectedUserId = id;
        const user = users.find(item => item.id === id);
        const role = findControl(form, 'role');
        const status = findControl(form, 'account status');
        if (role) role.value = user?.role || '';
        if (status) status.value = user?.status === 'Active' ? 'Active' : user?.status === 'Deactivated' ? 'Deactivated' : '';
        if (!user) notice('Choose an account to edit.', 'error');
    }

    function saveUsers(next, action, detail) {
        if (!writeJSON(KEYS.users, next)) return false;
        users = next;
        recordAudit(action, detail);
        renderUsers();
        return true;
    }

    function bindUserActions() {
        if (page !== 'user & permissions.html') return;
        document.addEventListener('click', event => {
            const editButton = event.target.closest('[data-user-edit]');
            if (editButton) {
                const form = $$('form')[1];
                const target = $('#accountTarget', form);
                if (target) {
                    target.value = editButton.dataset.userEdit;
                    loadAccountForEdit(target.value, form);
                    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                return;
            }
            const actionButton = event.target.closest('[data-user-deactivate]');
            if (actionButton) {
                const user = users.find(item => item.id === actionButton.dataset.userDeactivate);
                if (!user) return;
                const nextStatus = user.status === 'Active' ? 'Deactivated' : 'Active';
                if (nextStatus === 'Deactivated' && user.role === 'admin' &&
                    users.filter(item => item.role === 'admin' && item.status === 'Active').length <= 1) {
                    return notice('At least one active Admin must remain.', 'error');
                }
                if (!window.confirm(`${nextStatus === 'Active' ? 'Reactivate' : 'Deactivate'} ${user.name}?`)) return;
                saveUsers(users.map(item => item.id === user.id ? { ...item, status: nextStatus } : item), `${nextStatus} account`, user.email);
                return;
            }
            const button = event.target.closest('button');
            if (!button) return;
            const forms = $$('form');
            const inviteForm = forms[0];
            const editForm = forms[1];
            if (inviteForm?.contains(button) && /send invitation/i.test(button.textContent)) {
                event.preventDefault();
                const name = findControl(inviteForm, 'full name')?.value.trim() || '';
                const email = findControl(inviteForm, 'work email')?.value.trim().toLowerCase() || '';
                const role = findControl(inviteForm, 'role')?.value || '';
                if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !roleLabels[role]) {
                    return notice('Enter a valid name, work email, and role.', 'error');
                }
                if (users.some(user => user.email.toLowerCase() === email)) return notice('An account or invitation already uses that email.', 'error');
                const invited = { id: `user-${Date.now().toString(36)}`, name, email, role, status: 'Invited', lastActive: 'Never' };
                if (saveUsers([invited, ...users], 'Created invitation', `${email} · ${roleLabels[role]}`)) {
                    inviteForm.reset();
                    notice('Invitation saved locally. Email delivery needs a configured mail service.', 'success');
                }
                return;
            }
            if (editForm?.contains(button) && /save account changes/i.test(button.textContent)) {
                event.preventDefault();
                const user = users.find(item => item.id === selectedUserId);
                const role = findControl(editForm, 'role')?.value;
                const status = findControl(editForm, 'account status')?.value;
                if (!user || !roleLabels[role] || !['Active', 'Deactivated'].includes(status)) return notice('Select an account, role, and status before saving.', 'error');
                if (user.role === 'admin' && status !== 'Active' &&
                    users.filter(item => item.role === 'admin' && item.status === 'Active').length <= 1) {
                    return notice('At least one active Admin must remain.', 'error');
                }
                if (saveUsers(users.map(item => item.id === user.id ? { ...item, role, status } : item), 'Updated account', `${user.email} · ${roleLabels[role]} · ${status}`)) {
                    notice('Account permissions updated.', 'success');
                }
                return;
            }
            if (editForm?.contains(button) && /deactivate account/i.test(button.textContent)) {
                event.preventDefault();
                const user = users.find(item => item.id === selectedUserId);
                if (!user) return notice('Choose an account before deactivating it.', 'error');
                if (user.role === 'admin' && user.status === 'Active' &&
                    users.filter(item => item.role === 'admin' && item.status === 'Active').length <= 1) {
                    return notice('At least one active Admin must remain.', 'error');
                }
                if (!window.confirm(`Deactivate ${user.name}?`)) return;
                saveUsers(users.map(item => item.id === user.id ? { ...item, status: 'Deactivated' } : item), 'Deactivated account', user.email);
            }
        }, true);
    }

    function bindSettings() {
        if (page !== 'system_settings.html') return;
        const form = $('#systemSettingsForm');
        if (!form) return;
        const settings = settingValues();
        Object.entries(settings).forEach(([key, value]) => {
            const control = $(`[name="${CSS.escape(key)}"]`, form);
            if (control) control.value = String(value);
        });
        form.addEventListener('submit', event => {
            event.preventDefault();
            const formData = new FormData(form);
            const next = {
                businessName: String(formData.get('businessName') || '').trim(),
                currency: String(formData.get('currency') || 'PHP'),
                lowStockThreshold: Number(formData.get('lowStockThreshold')),
                sessionTimeout: Number(formData.get('sessionTimeout'))
            };
            if (!next.businessName || !Number.isInteger(next.lowStockThreshold) || next.lowStockThreshold < 0 ||
                !Number.isInteger(next.sessionTimeout) || next.sessionTimeout < 5 || next.sessionTimeout > 120) {
                return notice('Check the business name, low-stock threshold, and timeout values.', 'error');
            }
            if (writeJSON(KEYS.settings, next)) {
                recordAudit('Updated system settings', `${next.businessName} · ${next.sessionTimeout}-minute timeout`);
                refreshSession();
                notice('Settings saved in this browser.', 'success');
            }
        });
        const exportButton = $('[data-export-audit]');
        exportButton?.addEventListener('click', () => {
            const entries = readJSON(KEYS.audit, []);
            exportCSV(Array.isArray(entries) ? entries : [], 'albora-activity-log.csv');
        });
        const auditBody = $('#settingsAuditRows');
        const entries = readJSON(KEYS.audit, []);
        if (auditBody && Array.isArray(entries)) {
            auditBody.innerHTML = entries.slice(0, 30).map(entry => `<tr><td>${escapeHTML(new Date(entry.at).toLocaleString())}</td><td>${escapeHTML(entry.actor)} · ${escapeHTML(entry.role)}</td><td>${escapeHTML(entry.action)}</td><td>${escapeHTML(entry.detail)}</td></tr>`).join('') ||
                '<tr><td colspan="4" class="text-muted">No activity recorded yet.</td></tr>';
        }
    }

    function enhanceTables() {
        const ignored = new Set(['products.html', 'user & permissions.html', 'backup & data recovery.html', 'system_settings.html']);
        if (ignored.has(page)) return;
        $$('table').forEach((table, tableIndex) => {
            const body = $('tbody', table);
            const headers = $$('thead th', table);
            if (!body || headers.length < 2 || body.rows.length < 6 || table.closest('.admin-audit-card')) return;
            const hasSearch = $$('input[placeholder*="search" i], input[type="search"]')
                .some(input => input.closest('.page-content, .dashboard-container') === table.closest('.page-content, .dashboard-container'));
            const tools = document.createElement('div');
            tools.className = 'table-tools';
            if (!hasSearch) {
                const search = document.createElement('input');
                search.type = 'search';
                search.className = 'admin-table-search';
                search.placeholder = 'Search this table';
                search.setAttribute('aria-label', 'Search table rows');
                tools.appendChild(search);
                search.addEventListener('input', () => updateTable(table, search.value, 1, Number(tools.querySelector('select')?.value || 10)));
            }
            const pageSize = document.createElement('select');
            pageSize.setAttribute('aria-label', 'Rows per page');
            [10, 25, 50].forEach(size => pageSize.add(new Option(`${size} rows`, String(size))));
            tools.appendChild(pageSize);
            const container = table.closest('.table-responsive') || table;
            container.parentNode.insertBefore(tools, container);
            const pagination = document.createElement('div');
            pagination.className = 'table-page-tools';
            pagination.innerHTML = '<span class="table-page-count"></span><button type="button" data-page-step="-1">Previous</button><button type="button" data-page-step="1">Next</button>';
            container.insertAdjacentElement('afterend', pagination);
            let currentPage = 1;
            pageSize.addEventListener('change', () => {
                currentPage = 1;
                updateTable(table, $('.admin-table-search', tools)?.value || '', currentPage, Number(pageSize.value));
            });
            pagination.addEventListener('click', event => {
                const button = event.target.closest('[data-page-step]');
                if (!button || button.disabled) return;
                currentPage += Number(button.dataset.pageStep);
                updateTable(table, $('.admin-table-search', tools)?.value || '', currentPage, Number(pageSize.value));
            });
            headers.forEach((header, index) => {
                header.tabIndex = 0;
                header.setAttribute('aria-sort', 'none');
                const sort = () => {
                    const direction = header.dataset.sortDirection === 'asc' ? 'desc' : 'asc';
                    header.dataset.sortDirection = direction;
                    headers.forEach(item => {
                        if (item !== header) {
                            item.dataset.sortDirection = '';
                            item.setAttribute('aria-sort', 'none');
                        }
                    });
                    header.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : 'descending');
                    const rows = Array.from(body.rows);
                    rows.sort((a, b) => {
                        const left = a.cells[index]?.textContent.trim() || '';
                        const right = b.cells[index]?.textContent.trim() || '';
                        const leftNumber = Number(left.replace(/[^\d.-]/g, ''));
                        const rightNumber = Number(right.replace(/[^\d.-]/g, ''));
                        const order = Number.isFinite(leftNumber) && Number.isFinite(rightNumber) ?
                            leftNumber - rightNumber : left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
                        return direction === 'asc' ? order : -order;
                    });
                    rows.forEach(row => body.appendChild(row));
                    currentPage = 1;
                    updateTable(table, $('.admin-table-search', tools)?.value || '', currentPage, Number(pageSize.value));
                };
                header.addEventListener('click', sort);
                header.addEventListener('keydown', event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        sort();
                    }
                });
            });
            updateTable(table, '', currentPage, Number(pageSize.value), pagination);
            pageSize.dataset.tableIndex = String(tableIndex);
        });
    }

    function updateTable(table, query, requestedPage, size = 10, pagination = null) {
        const rows = Array.from($$('tbody tr', table));
        const filtered = rows.filter(row => row.textContent.toLowerCase().includes(query.toLowerCase()));
        const pageCount = Math.max(1, Math.ceil(filtered.length / size));
        const pageNumber = Math.min(Math.max(1, requestedPage), pageCount);
        rows.forEach(row => { row.hidden = true; });
        filtered.slice((pageNumber - 1) * size, pageNumber * size).forEach(row => { row.hidden = false; });
        const controls = pagination || table.closest('.table-responsive')?.nextElementSibling;
        if (!controls?.classList.contains('table-page-tools')) return;
        const count = $('.table-page-count', controls);
        const previous = $('[data-page-step="-1"]', controls);
        const next = $('[data-page-step="1"]', controls);
        if (count) count.textContent = `${filtered.length ? (pageNumber - 1) * size + 1 : 0}–${Math.min(pageNumber * size, filtered.length)} of ${filtered.length}`;
        if (previous) previous.disabled = pageNumber <= 1;
        if (next) next.disabled = pageNumber >= pageCount;
        controls.dataset.page = String(pageNumber);
    }

    function initializeLogin() {
        if (!isLoginPage()) return;
        const form = $('#loginForm');
        form?.addEventListener('submit', event => {
            event.preventDefault();
            signIn(form);
        });
        const signup = $('#signupForm');
        signup?.addEventListener('submit', event => {
            event.preventDefault();
            notice('Self-service sign-up is disabled. Ask an Admin for an invitation.', 'error');
        });
        const forgot = $('#forgotForm');
        forgot?.addEventListener('submit', event => {
            event.preventDefault();
            notice('Password recovery needs a verified email service. Contact your Admin.', 'error');
        });
        if (new URLSearchParams(location.search).has('expired')) notice('Your session expired. Please sign in again.', 'error');
    }

    function initializeLogout() {
        if (page !== 'admin_logout.html') return;
        const message = $('.logout-message');
        if (message) message.textContent = 'Your browser session has ended. For security, close this tab when finished.';
    }

    const ORDER_KEY = 'albora-orders-v1';

    function customerOrders() {
        const orders = readJSON(ORDER_KEY, []);
        if (!Array.isArray(orders)) {
            notice('Saved online orders are invalid and could not be displayed.', 'error');
            return [];
        }
        return orders.filter(order => order && order.id && order.pay && order.ship);
    }

    function money(value) {
        return `₱${(Number(value) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    function orderStage(order) {
        const product = order.pay.product;
        const shipping = order.pay.ship;
        if (product?.status === 'rejected') return 'Product payment rejected';
        if (product?.status !== 'verified') return 'Product payment review';
        if (order.ship.fee == null) return 'Shipping fee needed';
        if (!shipping) return 'Shipping payment due';
        if (shipping.status === 'rejected') return 'Shipping payment rejected';
        if (shipping.status !== 'verified') return 'Shipping payment review';
        return order.fulfillment || (order.tracking ? 'Ready to ship' : 'Confirmed');
    }

    function orderTime(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
    }

    function orderPaymentLabel(payment) {
        if (!payment) return 'Not submitted';
        return `${payment.method || 'Payment'} · ${payment.status || 'pending'}`;
    }

    function recordOrderEvent(order, message) {
        if (!Array.isArray(order.log)) order.log = [];
        order.log.push({ t: Date.now(), txt: `${message} · ${getSessionUser()} (${roleLabels[currentRole()] || 'User'})` });
    }

    function saveOrderChange(order, action) {
        const orders = customerOrders();
        const index = orders.findIndex(item => item.id === order.id);
        if (index < 0) {
            notice('This order no longer exists in browser storage.', 'error');
            return false;
        }
        orders[index] = order;
        if (!writeJSON(ORDER_KEY, orders)) return false;
        recordAudit(action, order.id);
        return true;
    }

    function renderOrderList() {
        if (page !== 'order_list.html') return;
        const allOrders = customerOrders().slice().sort((a, b) => Number(b.at) - Number(a.at));
        const body = $('tbody');
        if (!body) return;
        const stage = order => orderStage(order);
        const counts = [
            allOrders.filter(order => !['Confirmed', 'Ready to ship', 'Shipped', 'Delivered'].includes(stage(order))).length,
            allOrders.filter(order => stage(order) === 'Product payment review').length,
            allOrders.filter(order => ['Shipping payment due', 'Shipping payment review', 'Shipping payment rejected'].includes(stage(order))).length,
            allOrders.filter(order => ['Confirmed', 'Ready to ship'].includes(stage(order))).length
        ];
        $$('.stat-card').forEach((card, index) => {
            const value = $('.stat-value', card);
            if (value && counts[index] !== undefined) value.textContent = String(counts[index]);
        });

        const search = $('.filter-bar input');
        const filters = $$('.filter-bar select');
        const query = search?.value.trim().toLowerCase() || '';
        const visible = allOrders.filter(order => {
            const text = `${order.id} ${order.cust?.name || ''} ${order.cust?.mob || ''} ${order.cust?.social || ''}`.toLowerCase();
            if (query && !text.includes(query)) return false;
            const group = filters[0]?.value || 'All orders';
            const currentStage = stage(order);
            if (group === 'Awaiting verification' && !currentStage.includes('review')) return false;
            if (group === 'Preparing' && !['Shipping fee needed', 'Shipping payment due'].includes(currentStage)) return false;
            if (group === 'Ready to ship' && !['Confirmed', 'Ready to ship'].includes(currentStage)) return false;
            const status = filters[1]?.value || 'Status';
            if (status === 'Pending' && currentStage === 'Delivered') return false;
            if (status === 'Confirmed' && !['Confirmed', 'Ready to ship'].includes(currentStage)) return false;
            if (status === 'Shipped' && !['Shipped', 'Delivered'].includes(currentStage)) return false;
            const payment = filters[2]?.value || 'Payment';
            if (payment !== 'Payment' && !`${order.pay.product?.method || ''} ${order.pay.ship?.method || ''}`.toLowerCase().includes(payment.toLowerCase())) return false;
            return true;
        });
        body.innerHTML = visible.length ? visible.map(order => {
            const href = `order_details.html?id=${encodeURIComponent(order.id)}`;
            const items = (order.items || []).map(item => `${item.name} × ${item.qty}`).join(', ');
            const productReview = order.pay.product?.status === 'pending'
                ? `<a href="product_payment_proof.html?id=${encodeURIComponent(order.id)}">${escapeHTML(orderPaymentLabel(order.pay.product))}</a>`
                : escapeHTML(orderPaymentLabel(order.pay.product));
            const shippingReview = order.pay.ship?.status === 'pending'
                ? `<a href="shipping_payment_proof.html?id=${encodeURIComponent(order.id)}">${escapeHTML(orderPaymentLabel(order.pay.ship))}</a>`
                : escapeHTML(orderPaymentLabel(order.pay.ship));
            return `<tr>
                <td><a href="${href}">${escapeHTML(order.id)}</a><small class="d-block text-muted">${escapeHTML(orderTime(order.at))}</small></td>
                <td>${escapeHTML(order.cust?.name || '—')}</td><td>${escapeHTML(items || '—')}</td>
                <td><span class="status-pill">${productReview}</span></td>
                <td><span class="status-pill">${shippingReview}</span></td>
                <td>${escapeHTML(stage(order))}</td></tr>`;
        }).join('') : '<tr><td colspan="6" class="text-center text-muted py-4">No orders match these filters.</td></tr>';
        const summary = $('.pagination-text');
        if (summary) summary.innerHTML = `<span>${visible.length} of ${allOrders.length} orders</span><span>${counts[0]} need attention</span>`;
        $$('.filter-bar input, .filter-bar select').forEach(control => {
            if (control.dataset.orderFilterBound) return;
            control.dataset.orderFilterBound = 'true';
            control.addEventListener('input', renderOrderList);
            control.addEventListener('change', renderOrderList);
        });
        const exportButton = $$('button').find(button => /export orders/i.test(button.textContent));
        if (exportButton && !exportButton.dataset.orderExportBound) {
            exportButton.dataset.orderExportBound = 'true';
            exportButton.addEventListener('click', () => exportCSV(visible.map(order => ({
                id: order.id,
                placed: orderTime(order.at),
                customer: order.cust?.name || '',
                mobile: order.cust?.mob || '',
                products: (order.items || []).map(item => `${item.name} x ${item.qty}`).join('; '),
                productPayment: orderPaymentLabel(order.pay.product),
                shippingPayment: orderPaymentLabel(order.pay.ship),
                status: stage(order),
                total: (Number(order.sub) || 0) + (Number(order.ship.fee) || 0)
            })), 'albora-online-orders.csv'));
        }
    }

    function renderOrderDetails() {
        if (page !== 'order_details.html') return;
        const orderId = new URLSearchParams(location.search).get('id');
        const order = customerOrders().find(item => item.id === orderId);
        const content = $('.page-content');
        if (!content) return;
        const cards = $$('.section-card', content);
        const subtitle = $('.page-subtitle', content);
        if (subtitle) subtitle.textContent = order ? `${order.id} · ${orderTime(order.at)} · ${orderStage(order)}` : 'No order selected';
        if (!order) {
            const first = cards[0]?.querySelector('.inner-card');
            if (first) first.innerHTML = '<div class="text-center text-muted py-4">Order not found. Return to Orders and select an online order.</div>';
            return;
        }
        const total = (Number(order.sub) || 0) + (Number(order.ship.fee) || 0);
        if (cards[0]) {
            const inner = $('.inner-card', cards[0]);
            if (inner) inner.innerHTML = (order.items || []).map(item => `<div class="d-flex justify-content-between gap-3 py-2 border-bottom"><span>${escapeHTML(item.name)}<small class="d-block text-muted">${escapeHTML(item.opt || '')} · ${Number(item.qty) || 0} × ${money(item.unit)}</small></span><strong>${money(item.amt)}</strong></div>`).join('') || '<p class="text-muted">No items recorded.</p>';
            const summary = $$('.summary-row', cards[0]);
            if (summary[0]) summary[0].lastElementChild.textContent = money(order.sub);
            if (summary[1]) summary[1].lastElementChild.textContent = order.ship.fee == null ? 'Not set' : money(order.ship.fee);
            if (summary[2]) summary[2].lastElementChild.textContent = money(total);
            if (summary[3]) summary[3].lastElementChild.textContent = money(order.sub);
            if (summary[4]) summary[4].lastElementChild.textContent = order.pay.ship ? money(order.ship.fee) : 'Not submitted';
            const stageBadges = $$('.pill-badge', cards[0]);
            if (stageBadges[0]) stageBadges[0].textContent = `Stage 1 · ${order.pay.product?.status || 'not submitted'}`;
            if (stageBadges[1]) stageBadges[1].textContent = `Stage 2 · ${order.pay.ship?.status || (order.ship.fee == null ? 'fee not set' : 'not submitted')}`;
            const paymentText = $$('.form-text', cards[0]);
            if (paymentText[0]) paymentText[0].textContent = orderPaymentLabel(order.pay.product);
            if (paymentText[1]) paymentText[1].textContent = orderPaymentLabel(order.pay.ship);
        }
        if (cards[1]) {
            const name = $('.customer-name', cards[1]);
            if (name) name.textContent = order.cust?.name || '—';
            const info = $$('.customer-info', cards[1]);
            if (info[0]) info[0].textContent = `${order.cust?.mob || 'No mobile'} · ${order.cust?.social || 'No social account'}${order.cust?.em ? ` · ${order.cust.em}` : ''}`;
            if (info[1]) info[1].textContent = order.cust?.addr || 'No delivery address recorded';
            const rows = $$('.summary-row', cards[1]);
            if (rows[0]) rows[0].lastElementChild.textContent = order.ship.courier || 'J&T Express';
            if (rows[1]) rows[1].lastElementChild.textContent = order.ship.fee == null ? 'Not set' : money(order.ship.fee);
        }
        if (cards[2]) {
            const timeline = $('tbody', cards[2]);
            const logs = Array.isArray(order.log) ? order.log.slice().reverse() : [];
            if (timeline) timeline.innerHTML = logs.length ? logs.map(entry => `<tr><td>${escapeHTML(orderTime(entry.t))}</td><td>${escapeHTML(entry.txt)}</td><td>${escapeHTML(getSessionUser())}</td></tr>`).join('') : '<tr><td colspan="3" class="text-center text-muted">No order activity yet</td></tr>';
        }
        const statusForm = $('form[data-order-status-form]');
        if (statusForm) {
            const select = $('select', statusForm);
            const inputs = $$('input', statusForm);
            if (select) select.value = order.fulfillment || 'Select status';
            if (inputs[0]) inputs[0].value = order.tracking?.no || '';
            const ready = order.pay.product?.status === 'verified' && order.pay.ship?.status === 'verified';
            if (select) select.disabled = !ready;
            if (inputs[0]) inputs[0].disabled = !ready;
            const note = $('.info-box', statusForm);
            if (note) note.innerHTML = `<div class="info-box-icon">${ready ? '✓' : 'ℹ️'}</div><div><strong>${ready ? escapeHTML(orderStage(order)) : 'Payments must be verified first'}</strong>${ready ? ' Save a fulfillment status and tracking number.' : ' Product and shipping payments must both be verified before dispatch.'}</div>`;
            const submit = $('button[type="submit"]', statusForm);
            if (submit) submit.disabled = !ready;
            statusForm.onsubmit = event => {
                event.preventDefault();
                if (!ready) return notice('Verify both payments before updating fulfillment.', 'error');
                const nextStatus = select?.value || '';
                const tracking = inputs[0]?.value.trim() || '';
                if (['Ready to ship', 'Delivered'].includes(nextStatus) && !tracking) return notice('Enter the J&T waybill before marking this order ready or delivered.', 'error');
                if (!nextStatus || nextStatus === 'Select status') return notice('Choose a fulfillment status.', 'error');
                order.fulfillment = nextStatus;
                if (tracking) order.tracking = { no: tracking, t: Date.now() };
                const noteInput = $('textarea', statusForm);
                if (noteInput?.value.trim()) recordOrderEvent(order, `Staff note: ${noteInput.value.trim()}`);
                recordOrderEvent(order, `Fulfillment updated to ${nextStatus}${tracking ? ` · Tracking ${tracking}` : ''}`);
                if (saveOrderChange(order, 'Updated order fulfillment')) {
                    notice('Order status and tracking saved.', 'success');
                    renderOrderDetails();
                }
            };
        }
        const feeForm = $('form[data-order-fee-form]');
        if (feeForm) {
            const feeInput = $('input', feeForm);
            if (feeInput) {
                feeInput.type = 'number';
                feeInput.min = '0';
                feeInput.step = '1';
                feeInput.value = order.ship.fee == null ? '' : String(order.ship.fee);
                feeInput.disabled = order.pay.product?.status !== 'verified' || Boolean(order.pay.ship);
            }
            const note = $('.form-text', feeForm);
            if (note) note.textContent = order.pay.ship ? 'Fee is locked after the customer submits a shipping payment.' : order.pay.product?.status === 'verified' ? 'Set the fee before asking the customer to pay.' : 'Verify the product payment before setting a shipping fee.';
            const submit = $('button[type="submit"]', feeForm);
            if (submit) submit.disabled = order.pay.product?.status !== 'verified' || Boolean(order.pay.ship);
            feeForm.onsubmit = event => {
                event.preventDefault();
                const raw = feeInput?.value || '';
                const fee = Number(raw);
                if (raw === '' || !Number.isFinite(fee) || fee < 0) return notice('Enter a valid shipping fee of zero or more pesos.', 'error');
                if (order.pay.ship) return notice('The fee cannot be changed after a shipping payment is submitted.', 'error');
                order.ship.fee = Math.round(fee);
                recordOrderEvent(order, `J&T shipping fee set to ${money(order.ship.fee)}`);
                if (saveOrderChange(order, 'Set order shipping fee')) {
                    notice('Shipping fee saved.', 'success');
                    renderOrderDetails();
                }
            };
        }
    }

    function initializePaymentReview() {
        if (!['product_payment_proof.html', 'shipping_payment_proof.html'].includes(page)) return;
        const type = page === 'product_payment_proof.html' ? 'product' : 'ship';
        const key = type === 'product' ? 'product' : 'shipping';
        const orderId = new URLSearchParams(location.search).get('id');
        const orders = customerOrders();
        const order = orderId ? orders.find(item => item.id === orderId) : orders.find(item => {
            const payment = item.pay[type];
            return payment?.status === 'pending';
        });
        const content = $('.page-content');
        if (!content) return;
        const title = $('.page-subtitle', content);
        const proofArea = $('.proof-container', content);
        const badges = $$('.pill-badge-review', content);
        const reviewRows = $$('.review-row', content);
        const inputs = $$('input[readonly]', content);
        const checkboxes = $$('.form-check-input', content);
        const verifyButton = $$('button', content).find(button => /^verify .* payment$/i.test(button.textContent.trim()));
        const rejectButton = $$('#rejectionForm .btn-danger-custom', content)[0];
        if (!order) {
            if (title) title.textContent = 'No order selected · open a pending payment from Orders';
            if (proofArea) proofArea.innerHTML = '<div class="text-center text-muted py-5">No pending payment proof found. Select an order from the Orders list.</div>';
            if (verifyButton) verifyButton.disabled = true;
            if (rejectButton) rejectButton.disabled = true;
            return;
        }
        const payment = order.pay[type];
        const expected = type === 'product' ? Number(order.sub) || 0 : Number(order.ship.fee) || 0;
        const statusText = payment ? `${payment.method || 'Payment'} · ${payment.status || 'pending'}` : 'No payment submitted';
        if (title) title.textContent = `${order.id} · ${order.cust?.name || 'Customer'} · ${statusText}`;
        if (proofArea) {
            proofArea.replaceChildren();
            const proof = typeof payment?.proof === 'string' && /^data:image\/(?:jpeg|png|webp);base64,/i.test(payment.proof) ? payment.proof : '';
            if (proof) {
                const image = document.createElement('img');
                image.src = proof;
                image.alt = `Customer-submitted ${key} payment proof`;
                image.className = 'img-fluid rounded';
                image.style.maxHeight = '70vh';
                proofArea.appendChild(image);
            } else {
                const empty = document.createElement('div');
                empty.className = 'text-center text-muted py-5';
                empty.textContent = 'No accessible image proof is attached to this payment.';
                proofArea.appendChild(empty);
            }
        }
        const fileInfo = $$('.file-info', content);
        if (fileInfo[0]) fileInfo[0].innerHTML = `<strong>Uploaded file</strong> · ${payment?.proof ? 'Customer payment proof' : 'None'}`;
        if (fileInfo[1]) fileInfo[1].innerHTML = `<strong>Submitted</strong> · ${escapeHTML(payment?.at ? orderTime(payment.at) : 'Not submitted')}`;
        if (badges[0]) badges[0].textContent = statusText;
        if (reviewRows[0]) reviewRows[0].lastElementChild.textContent = type === 'product' ? '1 · Products' : '2 · J&T shipping';
        if (reviewRows[1]) reviewRows[1].lastElementChild.textContent = money(expected);
        if (reviewRows[2]) reviewRows[2].lastElementChild.textContent = payment ? 'Not included in customer order data' : 'Not submitted';
        if (inputs[0]) inputs[0].value = payment?.method || '';
        if (inputs[1]) inputs[1].value = payment?.ref || '';
        if (verifyButton) verifyButton.disabled = payment?.status !== 'pending' || !payment?.proof;
        if (rejectButton) rejectButton.disabled = payment?.status !== 'pending' || !payment?.proof;

        const refreshButtons = () => {
            const checksPassed = checkboxes.length === 4 && checkboxes.every(input => input.checked);
            if (verifyButton) verifyButton.disabled = payment?.status !== 'pending' || !payment?.proof || !checksPassed;
        };
        checkboxes.forEach(input => input.addEventListener('change', refreshButtons));
        if (payment?.status !== 'pending') checkboxes.forEach(input => { input.disabled = true; });
        if (verifyButton) verifyButton.addEventListener('click', () => {
            if (!checkboxes.every(input => input.checked)) return notice('Complete all payment checks before verification.', 'error');
            payment.status = 'verified';
            payment.vt = Date.now();
            payment.reason = '';
            recordOrderEvent(order, `${type === 'product' ? 'Product' : 'Shipping'} payment verified`);
            if (saveOrderChange(order, `Verified ${type} payment`)) {
                notice('Payment verification saved.', 'success');
                initializePaymentReview();
            }
        });
        if (rejectButton) rejectButton.addEventListener('click', () => {
            if (payment?.status !== 'pending' || !payment.proof) return;
            window.showRejectionConfirmation?.();
        });
        window.confirmRejection = () => {
            const reason = $('#rejectionForm textarea', content)?.value.trim() || '';
            if (!reason) return notice('Enter a reason so the customer knows what to correct.', 'error');
            if (payment?.status !== 'pending') return notice('This payment is no longer pending review.', 'error');
            payment.status = 'rejected';
            payment.reason = reason;
            recordOrderEvent(order, `${type === 'product' ? 'Product' : 'Shipping'} payment rejected: ${reason}`);
            if (saveOrderChange(order, `Rejected ${type} payment`)) {
                window.cancelRejection?.();
                notice('Payment rejection saved. The customer can submit a new proof.', 'success');
                initializePaymentReview();
            }
        };
        refreshButtons();
    }

    function installOperationalAudit() {
        const excluded = new Set([
            'admin_login.html', 'admin_logout.html', 'products.html',
            'add_product.html', 'edit_product.html', 'delete_product.html',
            'user & permissions.html', 'system_settings.html'
        ]);
        if (excluded.has(page)) return;
        document.addEventListener('submit', () => recordAudit('Submitted operation', page), true);
        document.addEventListener('click', event => {
            const control = event.target.closest('button, a');
            if (!control) return;
            const action = control.textContent.trim().replace(/\s+/g, ' ');
            if (/approve|reject|complete|record|update|save|delete|restore|backup|recover|export|print|fulfill|ship|return|adjust|receive|deduct|confirm/i.test(action)) {
                recordAudit('Selected operation', `${page} · ${action.slice(0, 100)}`);
            }
        }, true);
    }

    function initialize() {
        installSharedStyles();
        if (page === 'admin_login.html') {
            initializeLogin();
            return;
        }
        if (!initializeAccess()) return;
        initializeLogout();
        if (page === 'admin_logout.html') return;
        seedDemoTransactions();
        installSessionControls();
        installNavigation();
        applyRoleUI();
        installOperationalAudit();
        window.addEventListener('storage', event => {
            if (event.key === ORDER_KEY) {
                renderOrderList();
                renderOrderDetails();
                initializePaymentReview();
            }
            if (['alboraPosReceipts', 'alboraAdminProducts', ORDER_KEY].includes(event.key)) {
                if (event.key === 'alboraAdminProducts') {
                    const savedProducts = readJSON(KEYS.products, []);
                    if (!Array.isArray(savedProducts)) {
                        notice('Saved product data is invalid and could not refresh the reports.', 'error');
                        products = [];
                    } else {
                        products = savedProducts.map(normalizeProduct).filter(Boolean);
                    }
                    renderInventoryReport();
                    updateInventoryStats();
                }
                renderOperationalCharts();
            }
        });
        enhanceTables();
        bindSettings();
        bindUserActions();
        renderUsers();
        renderOrderList();
        renderOrderDetails();
        initializePaymentReview();
        const productPages = [
            'dashboard_admin.html', 'products.html', 'add_product.html',
            'edit_product.html', 'delete_product.html', 'inventory.html',
            'alerts_stock.html', 'stock_list_update.html', 'business_analytics.html',
            'profits.html', 'product_performance.html'
        ];
        if (productPages.includes(page)) {
            loadProducts().then(() => {
                renderProductCatalog();
                updateDashboardMetrics();
                renderOperationalCharts();
                updateInventoryStats();
                renderStockUpdate();
                setupStockForm();
                renderStockAlerts();
                renderInventoryReport();
                renderAuditHistory();
                setupStandaloneProductPage();
                bindProductCatalog();
            });
        } else {
            renderOperationalCharts();
            renderAuditHistory();
        }
    }

    window.AdminApp = {
        signIn,
        notice,
        audit: recordAudit,
        exportCSV
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
})();