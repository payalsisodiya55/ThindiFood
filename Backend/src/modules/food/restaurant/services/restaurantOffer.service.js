import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { RestaurantOffer } from '../models/restaurantOffer.model.js';
import { FoodRestaurant } from '../models/restaurant.model.js';
import { FoodItem } from '../../admin/models/food.model.js';
import { getSequentialRestaurantId } from './restaurant.service.js';

const ensureObjectId = (value, message) => {
    if (!value || !mongoose.Types.ObjectId.isValid(String(value))) {
        throw new ValidationError(message);
    }
    return new mongoose.Types.ObjectId(String(value));
};

const normalizeOffer = (doc) => {
    if (!doc) return null;
    const obj = doc.toObject ? doc.toObject() : { ...doc };
    
    // Handle populated restaurantId
    let rawRestaurantId = obj.restaurantId;
    let restaurantName = obj.restaurantName || '';
    
    if (obj.restaurantId && typeof obj.restaurantId === 'object' && obj.restaurantId._id) {
        rawRestaurantId = String(obj.restaurantId._id);
        restaurantName = obj.restaurantId.restaurantName || '';
    } else {
        rawRestaurantId = obj.restaurantId ? String(obj.restaurantId) : null;
    }

    const restaurantId = rawRestaurantId ? getSequentialRestaurantId(rawRestaurantId) : '';

    return {
        ...obj,
        id: String(obj._id),
        _id: String(obj._id),
        rawRestaurantId,
        restaurantId,
        restaurantName,
    };
};

export const createRestaurantOffer = async (restaurantId, payload) => {
    const rid = ensureObjectId(restaurantId, 'Invalid restaurant id');
    
    const title = String(payload.title || '').trim();
    if (!title) {
        throw new ValidationError('Title is required');
    }
    if (title.length > 30) {
        throw new ValidationError('Title cannot exceed 30 characters');
    }

    const discountType = payload.discountType || 'percentage';
    if (!['percentage', 'flat'].includes(discountType)) {
        throw new ValidationError('Invalid discount type');
    }

    const discountValue = Number(payload.discountValue) || 0;
    if (discountValue <= 0) {
        throw new ValidationError('Discount value must be greater than 0');
    }
    if (discountType === 'percentage' && (discountValue < 1 || discountValue > 99)) {
        throw new ValidationError('Discount percentage must be between 1 and 99');
    }
    if (discountType === 'flat') {
        if (discountValue > 999) {
            throw new ValidationError('Discount amount cannot exceed 999');
        }
        const products = Array.isArray(payload.products) ? payload.products : [];
        let maxItemPrice = 0;
        if (products.length > 0) {
            const productIds = products.map(p => new mongoose.Types.ObjectId(String(p.productId)));
            const items = await FoodItem.find({ _id: { $in: productIds } }).lean();
            maxItemPrice = items.reduce((max, item) => Math.max(max, Number(item.price || 0)), 0);
        } else {
            const items = await FoodItem.find({ restaurantId: rid }).lean();
            maxItemPrice = items.reduce((max, item) => Math.max(max, Number(item.price || 0)), 0);
        }
        if (maxItemPrice > 0 && discountValue > maxItemPrice) {
            throw new ValidationError(`Limit flat discount to the maximum item price (₹${maxItemPrice})`);
        }
    }

    let maxDiscount = payload.discountType === 'percentage' ? (payload.maxDiscount ?? null) : null;
    if (discountType === 'percentage') {
        if (maxDiscount === null || maxDiscount === undefined || Number.isNaN(Number(maxDiscount))) {
            throw new ValidationError('Max discount is required for percentage offers');
        }
        const maxDVal = Number(maxDiscount);
        if (maxDVal < 0 || maxDVal > 9999) {
            throw new ValidationError('Max discount cannot exceed 9,999');
        }
        maxDiscount = maxDVal;
    }

    if (payload.maxItemsPerOrder !== null && payload.maxItemsPerOrder !== undefined && payload.maxItemsPerOrder !== '') {
        const val = Number(payload.maxItemsPerOrder);
        if (Number.isNaN(val) || val < 1 || val > 999) {
            throw new ValidationError('Max items per order must be between 1 and 999');
        }
    }

    if (payload.perUserRedeemLimit !== null && payload.perUserRedeemLimit !== undefined && payload.perUserRedeemLimit !== '') {
        const val = Number(payload.perUserRedeemLimit);
        if (Number.isNaN(val) || val < 1 || val > 999) {
            throw new ValidationError('Uses per customer must be between 1 and 999');
        }
    }

    if (payload.startDate && payload.endDate) {
        const start = new Date(payload.startDate);
        const end = new Date(payload.endDate);
        if (start.getTime() > end.getTime()) {
            throw new ValidationError('Start date cannot be later than end date');
        }
    }

    const products = Array.isArray(payload.products)
        ? payload.products.map((p) => ({
              productId: new mongoose.Types.ObjectId(String(p.productId)),
              name: String(p.name || ''),
          }))
        : [];

    const created = await RestaurantOffer.create({
        restaurantId: rid,
        title,
        products,
        discountType,
        discountValue,
        maxDiscount,
        maxItemsPerOrder: payload.maxItemsPerOrder ? Number(payload.maxItemsPerOrder) : null,
        perUserRedeemLimit: payload.perUserRedeemLimit ? Number(payload.perUserRedeemLimit) : null,
        startDate: payload.startDate || null,
        endDate: payload.endDate || null,
        status: 'inactive',
        approvalStatus: 'pending',
        rejectionReason: '',
    });

    return normalizeOffer(created);
};

export const getMyRestaurantOffers = async (restaurantId) => {
    const rid = ensureObjectId(restaurantId, 'Invalid restaurant id');
    const offers = await RestaurantOffer.find({ restaurantId: rid })
        .sort({ createdAt: -1 })
        .lean();
    return { offers: offers.map(normalizeOffer) };
};

export const updateMyRestaurantOffer = async (restaurantId, offerId, payload) => {
    const rid = ensureObjectId(restaurantId, 'Invalid restaurant id');
    const oid = ensureObjectId(offerId, 'Invalid offer id');

    const existing = await RestaurantOffer.findOne({ _id: oid, restaurantId: rid });
    if (!existing) return null;

    const title = payload.title !== undefined ? String(payload.title || '').trim() : existing.title;
    if (payload.title !== undefined) {
        if (!title) {
            throw new ValidationError('Title is required');
        }
        if (title.length > 30) {
            throw new ValidationError('Title cannot exceed 30 characters');
        }
    }

    const discountType = payload.discountType || existing.discountType;
    if (payload.discountType !== undefined && !['percentage', 'flat'].includes(discountType)) {
        throw new ValidationError('Invalid discount type');
    }

    const discountValue = payload.discountValue !== undefined ? Number(payload.discountValue) : existing.discountValue;
    if (payload.discountValue !== undefined) {
        if (discountValue <= 0) {
            throw new ValidationError('Discount value must be greater than 0');
        }
        if (discountType === 'percentage' && (discountValue < 1 || discountValue > 99)) {
            throw new ValidationError('Discount percentage must be between 1 and 99');
        }
        if (discountType === 'flat') {
            if (discountValue > 999) {
                throw new ValidationError('Discount amount cannot exceed 999');
            }
            let maxItemPrice = 0;
            if (products.length > 0) {
                const productIds = products.map(p => new mongoose.Types.ObjectId(String(p.productId)));
                const items = await FoodItem.find({ _id: { $in: productIds } }).lean();
                maxItemPrice = items.reduce((max, item) => Math.max(max, Number(item.price || 0)), 0);
            } else {
                const items = await FoodItem.find({ restaurantId: rid }).lean();
                maxItemPrice = items.reduce((max, item) => Math.max(max, Number(item.price || 0)), 0);
            }
            if (maxItemPrice > 0 && discountValue > maxItemPrice) {
                throw new ValidationError(`Limit flat discount to the maximum item price (₹${maxItemPrice})`);
            }
        }
    }

    let maxDiscount = existing.maxDiscount;
    if (discountType === 'percentage') {
        const mDiscount = payload.maxDiscount !== undefined ? payload.maxDiscount : existing.maxDiscount;
        if (mDiscount === null || mDiscount === undefined || Number.isNaN(Number(mDiscount))) {
            throw new ValidationError('Max discount is required for percentage offers');
        }
        const maxDVal = Number(mDiscount);
        if (maxDVal < 0 || maxDVal > 9999) {
            throw new ValidationError('Max discount cannot exceed 9,999');
        }
        maxDiscount = maxDVal;
    } else {
        maxDiscount = null;
    }

    if (payload.maxItemsPerOrder !== undefined && payload.maxItemsPerOrder !== null && payload.maxItemsPerOrder !== '') {
        const val = Number(payload.maxItemsPerOrder);
        if (Number.isNaN(val) || val < 1 || val > 999) {
            throw new ValidationError('Max items per order must be between 1 and 999');
        }
    }

    if (payload.perUserRedeemLimit !== undefined && payload.perUserRedeemLimit !== null && payload.perUserRedeemLimit !== '') {
        const val = Number(payload.perUserRedeemLimit);
        if (Number.isNaN(val) || val < 1 || val > 999) {
            throw new ValidationError('Uses per customer must be between 1 and 999');
        }
    }

    const startStr = payload.startDate !== undefined ? payload.startDate : existing.startDate;
    const endStr = payload.endDate !== undefined ? payload.endDate : existing.endDate;
    if (startStr && endStr) {
        const start = new Date(startStr);
        const end = new Date(endStr);
        if (start.getTime() > end.getTime()) {
            throw new ValidationError('Start date cannot be later than end date');
        }
    }

    const products = Array.isArray(payload.products)
        ? payload.products.map((p) => ({
              productId: new mongoose.Types.ObjectId(String(p.productId)),
              name: String(p.name || ''),
          }))
        : existing.products;

    const payloadKeys = Object.keys(payload);
    const isOnlyStatusToggle = payloadKeys.length === 1 && payloadKeys[0] === 'status';

    const set = {
        title,
        products,
        discountType,
        discountValue,
        maxDiscount,
        maxItemsPerOrder: (payload.maxItemsPerOrder !== undefined) 
            ? (payload.maxItemsPerOrder ? Number(payload.maxItemsPerOrder) : null) 
            : existing.maxItemsPerOrder,
        perUserRedeemLimit: (payload.perUserRedeemLimit !== undefined) 
            ? (payload.perUserRedeemLimit ? Number(payload.perUserRedeemLimit) : null) 
            : existing.perUserRedeemLimit,
        startDate: payload.startDate !== undefined ? (payload.startDate || null) : existing.startDate,
        endDate: payload.endDate !== undefined ? (payload.endDate || null) : existing.endDate,
    };

    if (isOnlyStatusToggle) {
        set.status = payload.status;
    } else {
        set.approvalStatus = 'pending';
        set.rejectionReason = '';
        set.status = 'inactive';
    }

    const updated = await RestaurantOffer.findOneAndUpdate(
        { _id: oid, restaurantId: rid },
        { $set: set },
        { new: true }
    );

    return normalizeOffer(updated);
};

export const deleteMyRestaurantOffer = async (restaurantId, offerId) => {
    const rid = ensureObjectId(restaurantId, 'Invalid restaurant id');
    const oid = ensureObjectId(offerId, 'Invalid offer id');

    const deleted = await RestaurantOffer.findOneAndDelete({ _id: oid, restaurantId: rid }).lean();
    if (!deleted) return null;
    return { id: String(deleted._id) };
};

// Admin functions
export const getAllRestaurantOffersAdmin = async (query = {}) => {
    const filter = {};
    if (query.approvalStatus) filter.approvalStatus = query.approvalStatus;
    if (query.restaurantId && mongoose.Types.ObjectId.isValid(String(query.restaurantId))) {
        filter.restaurantId = new mongoose.Types.ObjectId(String(query.restaurantId));
    }

    const offers = await RestaurantOffer.find(filter)
        .populate('restaurantId', 'restaurantName')
        .sort({ createdAt: -1 })
        .lean();
    return { offers: offers.map(normalizeOffer) };
};

export const approveRestaurantOfferAdmin = async (offerId) => {
    const oid = ensureObjectId(offerId, 'Invalid offer id');
    const updated = await RestaurantOffer.findByIdAndUpdate(
        oid,
        { $set: { approvalStatus: 'approved', status: 'active', rejectionReason: '' } },
        { new: true }
    );
    return normalizeOffer(updated);
};

export const rejectRestaurantOfferAdmin = async (offerId, reason) => {
    const oid = ensureObjectId(offerId, 'Invalid offer id');
    const updated = await RestaurantOffer.findByIdAndUpdate(
        oid,
        { $set: { approvalStatus: 'rejected', status: 'inactive', rejectionReason: String(reason || '') } },
        { new: true }
    );
    return normalizeOffer(updated);
};

export const updateRestaurantOfferAdmin = async (offerId, payload) => {
    const oid = ensureObjectId(offerId, 'Invalid offer id');
    const existing = await RestaurantOffer.findById(oid);
    if (!existing) return null;

    const products = Array.isArray(payload?.products)
        ? payload.products.map((p) => ({
              productId: new mongoose.Types.ObjectId(String(p.productId)),
              name: String(p.name || ''),
          }))
        : existing.products;

    const nextDiscountType = payload?.discountType || existing.discountType;

    const set = {
        title:
            payload?.title !== undefined
                ? String(payload.title || '').trim()
                : existing.title,
        products,
        discountType: nextDiscountType,
        discountValue:
            payload?.discountValue !== undefined
                ? Number(payload.discountValue)
                : existing.discountValue,
        maxItemsPerOrder:
            payload?.maxItemsPerOrder !== undefined
                ? payload.maxItemsPerOrder
                : existing.maxItemsPerOrder,
        perUserRedeemLimit:
            payload?.perUserRedeemLimit !== undefined
                ? payload.perUserRedeemLimit
                : existing.perUserRedeemLimit,
        startDate:
            payload?.startDate !== undefined ? payload.startDate : existing.startDate,
        endDate:
            payload?.endDate !== undefined ? payload.endDate : existing.endDate,
    };

    if (nextDiscountType === 'percentage') {
        set.maxDiscount =
            payload?.maxDiscount !== undefined ? payload.maxDiscount : existing.maxDiscount;
    } else {
        set.maxDiscount = null;
    }

    const updated = await RestaurantOffer.findByIdAndUpdate(
        oid,
        { $set: set },
        { new: true }
    );
    return normalizeOffer(updated);
};
