import { verifyAccessToken } from './token.util.js';
import { sendError } from '../../utils/response.js';
import { FoodUser } from '../users/user.model.js';
import { FoodAdmin } from '../admin/admin.model.js';
import { sanitizeAdminForClient } from '../admin/adminAccess.constants.js';

export const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'ADMIN') {
        return sendError(res, 403, 'Admin access required');
    }
    next();
};

export const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (!token) {
        return sendError(res, 401, 'Authentication token missing');
    }

    try {
        const decoded = verifyAccessToken(token);
        if (decoded.role === 'USER') {
            req.user = {
                userId: decoded.userId,
                role: decoded.role
            };
            // Enforce active status in real-time - deactivated users are logged out on next request.
            FoodUser.findById(decoded.userId).select('isActive').lean().then((doc) => {
                if (!doc || doc.isActive === false) {
                    return sendError(res, 401, 'User account is deactivated');
                }
                next();
            }).catch(() => sendError(res, 401, 'Authentication failed'));
            return;
        }
        if (decoded.role === 'ADMIN') {
            FoodAdmin.findById(decoded.userId)
                .select('role adminType roleTitle isActive sidebarPermissions zoneAccess zoneIds servicesAccess email name')
                .lean()
                .then((doc) => {
                    if (!doc) return sendError(res, 401, 'Authentication failed');
                    const admin = sanitizeAdminForClient(doc);
                    if (admin.isActive === false) {
                        return sendError(res, 401, 'Admin account is deactivated');
                    }
                    req.user = {
                        userId: decoded.userId,
                        role: 'ADMIN',
                        adminType: admin.adminType,
                        roleTitle: admin.roleTitle,
                        sidebarPermissions: admin.sidebarPermissions,
                        zoneAccess: admin.zoneAccess,
                        zoneIds: admin.zoneIds,
                        servicesAccess: Array.isArray(admin.servicesAccess) ? admin.servicesAccess : []
                    };
                    return next();
                })
                .catch(() => sendError(res, 401, 'Authentication failed'));
            return;
        }
        req.user = {
            userId: decoded.userId,
            role: decoded.role
        };
        return next();
    } catch (error) {
        return sendError(res, 401, 'Invalid or expired token');
    }
};
