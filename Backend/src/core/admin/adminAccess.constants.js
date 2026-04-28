import mongoose from 'mongoose';

export const ADMIN_TYPES = {
    SUPERADMIN: 'SUPERADMIN',
    SUBADMIN: 'SUBADMIN'
};

export const ADMIN_ZONE_ACCESS = {
    ALL: 'all',
    CUSTOM: 'custom'
};

export const ADMIN_SIDEBAR_PERMISSIONS = [
    'dashboard',
    'foods',
    'categories',
    'restaurants',
    'zones',
    'orders',
    'promotions',
    'customers',
    'support',
    'reports',
    'transactions',
    'dining',
    'settings',
    'pages'
];

export const ADMIN_SIDEBAR_PERMISSION_LABELS = {
    dashboard: 'Dashboard',
    foods: 'Foods',
    categories: 'Categories',
    restaurants: 'Restaurants',
    zones: 'Zones',
    orders: 'Orders',
    promotions: 'Promotions',
    customers: 'Customers',
    support: 'Support',
    reports: 'Reports',
    transactions: 'Transactions',
    dining: 'Dining',
    settings: 'Settings',
    pages: 'Pages & Policies'
};

export function normalizeAdminType(value) {
    return String(value || '').trim().toUpperCase() === ADMIN_TYPES.SUBADMIN
        ? ADMIN_TYPES.SUBADMIN
        : ADMIN_TYPES.SUPERADMIN;
}

export function isSuperAdmin(adminLike = {}) {
    return normalizeAdminType(adminLike.adminType) === ADMIN_TYPES.SUPERADMIN;
}

export function normalizeSidebarPermissions(value) {
    if (!Array.isArray(value)) return [];
    const unique = new Set();
    value.forEach((item) => {
        const normalized = String(item || '').trim();
        if (ADMIN_SIDEBAR_PERMISSIONS.includes(normalized)) unique.add(normalized);
    });
    return Array.from(unique);
}

export function normalizeZoneAccess(value) {
    return String(value || '').trim().toLowerCase() === ADMIN_ZONE_ACCESS.CUSTOM
        ? ADMIN_ZONE_ACCESS.CUSTOM
        : ADMIN_ZONE_ACCESS.ALL;
}

export function normalizeZoneIds(value) {
    if (!Array.isArray(value)) return [];
    const zoneIds = [];
    const seen = new Set();
    value.forEach((item) => {
        const raw = String(item?._id || item?.id || item || '').trim();
        if (!mongoose.Types.ObjectId.isValid(raw) || seen.has(raw)) return;
        seen.add(raw);
        zoneIds.push(raw);
    });
    return zoneIds;
}

export function sanitizeAdminForClient(adminLike = {}) {
    const next = { ...(adminLike?.toObject ? adminLike.toObject() : adminLike) };
    delete next.password;

    const adminType = normalizeAdminType(next.adminType);
    const zoneAccess = adminType === ADMIN_TYPES.SUPERADMIN
        ? ADMIN_ZONE_ACCESS.ALL
        : normalizeZoneAccess(next.zoneAccess);

    next.adminType = adminType;
    next.roleTitle = String(next.roleTitle || (adminType === ADMIN_TYPES.SUPERADMIN ? 'Super Admin' : 'Sub Admin')).trim();
    next.sidebarPermissions = adminType === ADMIN_TYPES.SUPERADMIN
        ? []
        : normalizeSidebarPermissions(next.sidebarPermissions);
    next.zoneAccess = zoneAccess;
    next.zoneIds = zoneAccess === ADMIN_ZONE_ACCESS.CUSTOM ? normalizeZoneIds(next.zoneIds) : [];

    return next;
}

export function hasAdminSidebarPermission(adminLike = {}, permissionKey) {
    if (!permissionKey || isSuperAdmin(adminLike)) return true;
    return normalizeSidebarPermissions(adminLike.sidebarPermissions).includes(String(permissionKey || '').trim());
}

export function getScopedZoneIds(adminLike = {}) {
    if (isSuperAdmin(adminLike)) return [];
    if (normalizeZoneAccess(adminLike.zoneAccess) !== ADMIN_ZONE_ACCESS.CUSTOM) return [];
    return normalizeZoneIds(adminLike.zoneIds);
}
