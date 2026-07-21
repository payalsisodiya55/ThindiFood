import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodItem } from '../models/food.model.js';
import { FoodAddon } from '../../restaurant/models/foodAddon.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { syncMenuItemApprovalStatus } from '../../restaurant/services/restaurantMenu.service.js';
import { getFoodDisplayPrice, serializeFoodVariants } from './foodVariant.service.js';
import { createInboxNotifications } from '../../../../core/notifications/notification.service.js';
import { getIO, rooms } from '../../../../config/socket.js';

const normalizeAllowedZoneIds = (scope = {}) => {
    if (!Array.isArray(scope?.allowedZoneIds) || scope.allowedZoneIds.length === 0) return [];
    return scope.allowedZoneIds
        .map((id) => String(id || '').trim())
        .filter((id) => mongoose.Types.ObjectId.isValid(id));
};

const toRestaurantDisplayId = (mongoId) => {
    const s = String(mongoId || '');
    return s.length >= 5 ? s.slice(-5) : s;
};

export async function listPendingFoodApprovals(query = {}, scope = {}) {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 200, 1), 1000);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;
    const allowedZoneIds = normalizeAllowedZoneIds(scope);
    const requestedZoneId = mongoose.Types.ObjectId.isValid(String(query.zoneId || ''))
        ? String(query.zoneId)
        : '';

    if (requestedZoneId && allowedZoneIds.length > 0 && !allowedZoneIds.includes(requestedZoneId)) {
        throw new ValidationError('Selected zone is outside your allowed scope');
    }

    const effectiveZoneIds = requestedZoneId
        ? [requestedZoneId]
        : allowedZoneIds;

    const restaurantFilter = {};
    if (effectiveZoneIds.length === 1) {
        restaurantFilter.zoneId = new mongoose.Types.ObjectId(effectiveZoneIds[0]);
    } else if (effectiveZoneIds.length > 1) {
        restaurantFilter.zoneId = { $in: effectiveZoneIds.map((id) => new mongoose.Types.ObjectId(id)) };
    }

    const statusQuery = String(query.status || 'pending').toLowerCase();
    const filter = {};
    if (statusQuery !== 'all') {
        filter.approvalStatus = statusQuery;
    }
    if (query.restaurantId && mongoose.Types.ObjectId.isValid(String(query.restaurantId))) {
        filter.restaurantId = query.restaurantId;
    }
    if (query.search && String(query.search).trim()) {
        const term = String(query.search).trim().slice(0, 80);
        filter.$or = [
            { name: { $regex: term, $options: 'i' } },
            { categoryName: { $regex: term, $options: 'i' } }
        ];
    }

    const zoneScopedRestaurantIds = Object.keys(restaurantFilter).length > 0
        ? await FoodRestaurant.find(restaurantFilter).distinct('_id')
        : [];

    if (Object.keys(restaurantFilter).length > 0) {
        if (!zoneScopedRestaurantIds.length) {
            return { requests: [], page, limit, total: 0 };
        }
        if (query.restaurantId && mongoose.Types.ObjectId.isValid(String(query.restaurantId))) {
            const scopedRestaurantIds = new Set(zoneScopedRestaurantIds.map((id) => String(id)));
            if (!scopedRestaurantIds.has(String(query.restaurantId))) {
                return { requests: [], page, limit, total: 0 };
            }
            filter.restaurantId = query.restaurantId;
        } else {
            filter.restaurantId = { $in: zoneScopedRestaurantIds };
        }
    }

    const foodList = await FoodItem.find(filter)
        .sort({ requestedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('restaurantId categoryName name price variants image foodType description approvalStatus rejectionReason requestedAt createdAt previousVersion')
        .lean();

    const addonFilter = {};
    if (statusQuery !== 'all') {
        addonFilter.approvalStatus = statusQuery;
    }
    if (Object.keys(restaurantFilter).length > 0) {
        addonFilter.restaurantId = { $in: zoneScopedRestaurantIds };
    }

    const addonList = await FoodAddon.find(addonFilter)
        .sort({ requestedAt: -1, createdAt: -1 })
        .limit(limit)
        .select('restaurantId draft isAvailable approvalStatus rejectionReason requestedAt createdAt')
        .lean();

    const restaurantIds = Array.from(new Set([
        ...foodList.map((f) => String(f.restaurantId)),
        ...addonList.map((a) => String(a.restaurantId))
    ].filter(Boolean)));

    const restaurants = restaurantIds.length
        ? await FoodRestaurant.find({ _id: { $in: restaurantIds } })
            .select('restaurantName zoneId')
            .populate('zoneId', 'name zoneName serviceLocation')
            .lean()
        : [];
    const restaurantMap = new Map(restaurants.map((r) => [String(r._id), r]));

    const foodRequests = foodList.map((f) => {
        const restaurant = restaurantMap.get(String(f.restaurantId)) || {};
        return {
        _id: f._id,
        id: f._id,
        entityType: 'food',
        type: 'food',
        restaurantName: restaurant.restaurantName || 'Unknown Restaurant',
        restaurantId: toRestaurantDisplayId(f.restaurantId),
        zoneId: restaurant.zoneId?._id ? String(restaurant.zoneId._id) : '',
        zoneName: restaurant.zoneId?.zoneName || restaurant.zoneId?.name || restaurant.zoneId?.serviceLocation || '',
        category: f.categoryName || '',
        itemName: f.name,
        foodType: f.foodType || 'Non-Veg',
        description: f.description || '',
        sectionName: f.categoryName || '',
        subsectionName: '',
        approvalStatus: f.approvalStatus || 'pending',
        rejectionReason: f.rejectionReason || '',
        price: getFoodDisplayPrice(f),
        variants: serializeFoodVariants(f.variants),
        image: f.image || '',
        images: f.image ? [f.image] : [],
        requestedAt: f.requestedAt || f.createdAt,
        isActionable: (f.approvalStatus || 'pending') === 'pending',
        previousVersion: f.previousVersion || null
        };
    });

    const addonRequests = addonList.map((a) => {
        const restaurant = restaurantMap.get(String(a.restaurantId)) || {};
        return {
        _id: a._id,
        id: a._id,
        entityType: 'addon',
        type: 'addon',
        restaurantName: restaurant.restaurantName || 'Unknown Restaurant',
        restaurantId: toRestaurantDisplayId(a.restaurantId),
        zoneId: restaurant.zoneId?._id ? String(restaurant.zoneId._id) : '',
        zoneName: restaurant.zoneId?.zoneName || restaurant.zoneId?.name || restaurant.zoneId?.serviceLocation || '',
        category: 'Add-on',
        itemName: a.draft?.name || 'Unnamed Add-on',
        foodType: 'Add-on',
        sectionName: 'Add-on',
        subsectionName: '',
        approvalStatus: a.approvalStatus || 'pending',
        rejectionReason: a.rejectionReason || '',
        price: a.draft?.price ?? 0,
        image: a.draft?.image || (a.draft?.images && a.draft.images[0]) || '',
        images: a.draft?.images || (a.draft?.image ? [a.draft.image] : []),
        requestedAt: a.requestedAt || a.createdAt,
        isActionable: (a.approvalStatus || 'pending') === 'pending',
        description: a.draft?.description || ''
        };
    });

    const allRequests = [...foodRequests, ...addonRequests].sort((a, b) => 
        new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()
    );

    return { requests: allRequests, page, limit, total: allRequests.length };
}

export async function approveFoodItem(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid food id');
    }
    const updated = await FoodItem.findOneAndUpdate(
        { _id: id, approvalStatus: 'pending' },
        { $set: { approvalStatus: 'approved', approvedAt: new Date(), rejectedAt: null, rejectionReason: '' } },
        { new: true }
    ).lean();
    if (updated?.restaurantId) {
        await syncMenuItemApprovalStatus(updated.restaurantId, updated._id, 'approved', '');
        await createInboxNotifications({
            notifications: [{
                ownerType: 'RESTAURANT',
                ownerId: updated.restaurantId,
                title: 'Dish Approved',
                message: `Your dish "${updated.name}" has been approved and is now visible to customers.`,
                category: 'food_approved',
                source: 'FOOD_APPROVAL',
                metadata: {
                    type: 'food_approved',
                    foodId: String(updated._id),
                    restaurantId: String(updated.restaurantId)
                }
            }]
        });
        const io = getIO();
        if (io) {
            io.to(rooms.restaurant(updated.restaurantId)).emit('admin_notification', {
                title: 'Dish Approved',
                message: `Your dish "${updated.name}" has been approved and is now visible to customers.`,
                createdAt: new Date().toISOString(),
                type: 'food_approved',
                foodId: String(updated._id),
                restaurantId: String(updated.restaurantId)
            });
        }
        
        try {
            const { notifyOwnersSafely } = await import('../../../core/notifications/firebase.service.js');
            await notifyOwnersSafely(
                [{ ownerType: 'RESTAURANT', ownerId: updated.restaurantId }],
                {
                    title: 'Dish Approved! 🍲',
                    body: `Your dish "${updated.name}" has been approved and is now visible to customers.`,
                    image: updated.image || 'https://i.ibb.co/3m2Yh7r/Appzeto-Brand-Image.png',
                    data: {
                        type: 'food_approved',
                        foodId: String(updated._id),
                        restaurantId: String(updated.restaurantId)
                    }
                }
            );
        } catch (e) {
            console.error('Failed to send food approval notification:', e);
        }
    }
    return updated;
}

export async function rejectFoodItem(id, reason) {
    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid food id');
    }
    const r = typeof reason === 'string' ? reason.trim() : '';
    if (!r) throw new ValidationError('Rejection reason is required');
    if (r.length > 500) throw new ValidationError('Rejection reason is too long');

    const updated = await FoodItem.findOneAndUpdate(
        { _id: id, approvalStatus: 'pending' },
        { $set: { approvalStatus: 'rejected', rejectedAt: new Date(), rejectionReason: r, approvedAt: null } },
        { new: true }
    ).lean();
    if (updated?.restaurantId) {
        await syncMenuItemApprovalStatus(updated.restaurantId, updated._id, 'rejected', r);
        await createInboxNotifications({
            notifications: [{
                ownerType: 'RESTAURANT',
                ownerId: updated.restaurantId,
                title: 'Dish Rejected',
                message: `Your dish "${updated.name}" was rejected. Reason: ${r}`,
                category: 'food_rejected',
                source: 'FOOD_APPROVAL',
                metadata: {
                    type: 'food_rejected',
                    foodId: String(updated._id),
                    restaurantId: String(updated.restaurantId),
                    reason: r
                }
            }]
        });
        const io = getIO();
        if (io) {
            io.to(rooms.restaurant(updated.restaurantId)).emit('admin_notification', {
                title: 'Dish Rejected',
                message: `Your dish "${updated.name}" was rejected. Reason: ${r}`,
                createdAt: new Date().toISOString(),
                type: 'food_rejected',
                foodId: String(updated._id),
                restaurantId: String(updated.restaurantId),
                reason: r
            });
        }

        try {
            const { notifyOwnersSafely } = await import('../../../core/notifications/firebase.service.js');
            await notifyOwnersSafely(
                [{ ownerType: 'RESTAURANT', ownerId: updated.restaurantId }],
                {
                    title: 'Dish Rejected ❌',
                    body: `Your dish "${updated.name}" was rejected. Reason: ${r}`,
                    image: updated.image || 'https://i.ibb.co/3m2Yh7r/Appzeto-Brand-Image.png',
                    data: {
                        type: 'food_rejected',
                        foodId: String(updated._id),
                        restaurantId: String(updated.restaurantId),
                        reason: r
                    }
                }
            );
        } catch (e) {
            console.error('Failed to send food rejection notification:', e);
        }
    }
    return updated;
}
