import { sendError } from '../../utils/response.js';
import { getScopedZoneIds, hasAdminSidebarPermission, isSuperAdmin } from './adminAccess.constants.js';

const PATH_PERMISSION_MATCHERS = [
    { test: (path) => path === '/dashboard-stats' || path === '/sidebar-badges', permission: 'dashboard' },
    { test: (path) => path.startsWith('/foods') || path.startsWith('/addons'), permission: 'foods' },
    { test: (path) => path.startsWith('/categories'), permission: 'categories' },
    { test: (path) => path.startsWith('/restaurants'), permission: 'restaurants' },
    { test: (path) => path.startsWith('/zones'), permission: 'zones' },
    { test: (path) => path.startsWith('/orders'), permission: 'orders' },
    { test: (path) => path.startsWith('/offers') || path.startsWith('/product-offers') || path.startsWith('/dining/offers'), permission: 'promotions' },
    { test: (path) => path.startsWith('/customers'), permission: 'customers' },
    { test: (path) => path.startsWith('/support-tickets') || path.startsWith('/delivery/support-tickets') || path.startsWith('/contact-messages') || path.startsWith('/safety-emergency-reports'), permission: 'support' },
    { test: (path) => path.startsWith('/reports') || path.startsWith('/tax-report'), permission: 'reports' },
    { test: (path) => path.startsWith('/withdrawals') || path.startsWith('/delivery/withdrawals') || path.startsWith('/restaurant-commissions') || path.startsWith('/dining-restaurant-commissions'), permission: 'transactions' },
    { test: (path) => path.startsWith('/dining/'), permission: 'dining' },
    { test: (path) => path.startsWith('/business-settings') || path.startsWith('/fee-settings') || path.startsWith('/dining-fee-settings') || path.startsWith('/referral-settings') || path.startsWith('/refund-policy-settings') || path.startsWith('/delivery-cash-limit') || path.startsWith('/delivery-emergency-help') || path.startsWith('/notifications/broadcast'), permission: 'settings' },
    { test: (path) => path.startsWith('/pages-social-media'), permission: 'pages' }
];

function resolvePermissionForPath(pathname = '') {
    const path = String(pathname || '').trim().toLowerCase();
    const match = PATH_PERMISSION_MATCHERS.find((item) => item.test(path));
    return match?.permission || null;
}

export function enrichAdminScope(req, _res, next) {
    req.adminScope = {
        isSuperAdmin: isSuperAdmin(req.user),
        allowedZoneIds: getScopedZoneIds(req.user)
    };
    next();
}

export function enforceAdminSidebarAccessByPath(req, res, next) {
    if (isSuperAdmin(req.user)) return next();
    const permissionKey = resolvePermissionForPath(req.path);
    if (!permissionKey || hasAdminSidebarPermission(req.user, permissionKey)) return next();
    return sendError(res, 403, 'You do not have access to this admin section');
}

export function requireSuperAdmin(req, res, next) {
    if (!isSuperAdmin(req.user)) {
        return sendError(res, 403, 'Super admin access required');
    }
    return next();
}
