import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { RestaurantOffer } from '../models/restaurantOffer.model.js';

const ensureObjectId = (value, message) => {
    if (!value || !mongoose.Types.ObjectId.isValid(String(value))) {
        throw new ValidationError(message);
    }
    return new mongoose.Types.ObjectId(String(value));
};

const normalizeOffer = (doc) => {
    if (!doc) return null;
    const obj = doc.toObject ? doc.toObject() : { ...doc };
    return {
        ...obj,
        id: String(obj._id),
        _id: String(obj._id),
        restaurantId: obj.restaurantId ? String(obj.restaurantId) : null,
    };
};

export const createRestaurantOffer = async (restaurantId, payload) => {
    const rid = ensureObjectId(restaurantId, 'Invalid restaurant id');
    const products = Array.isArray(payload.products)
        ? payload.products.map((p) => ({
              productId: new mongoose.Types.ObjectId(String(p.productId)),
              name: String(p.name || ''),
          }))
        : [];

    const created = await RestaurantOffer.create({
        restaurantId: rid,
        title: String(payload.title || '').trim(),
        products,
        discountType: payload.discountType || 'percentage',
        discountValue: Number(payload.discountValue) || 0,
        maxDiscount: payload.discountType === 'percentage' ? (payload.maxDiscount ?? null) : null,
        maxItemsPerOrder: payload.maxItemsPerOrder ?? null,
        perUserRedeemLimit: payload.perUserRedeemLimit ?? null,
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

    const products = Array.isArray(payload.products)
        ? payload.products.map((p) => ({
              productId: new mongoose.Types.ObjectId(String(p.productId)),
              name: String(p.name || ''),
          }))
        : existing.products;

    const set = {
        title: String(payload.title || existing.title || '').trim(),
        products,
        discountType: payload.discountType || existing.discountType,
        discountValue: payload.discountValue !== undefined ? Number(payload.discountValue) : existing.discountValue,
        maxItemsPerOrder: payload.maxItemsPerOrder !== undefined ? payload.maxItemsPerOrder : existing.maxItemsPerOrder,
        perUserRedeemLimit: payload.perUserRedeemLimit !== undefined ? payload.perUserRedeemLimit : existing.perUserRedeemLimit,
        startDate: payload.startDate !== undefined ? payload.startDate : existing.startDate,
        endDate: payload.endDate !== undefined ? payload.endDate : existing.endDate,
        // If was approved, reset to pending (re-approval required)
        approvalStatus: 'pending',
        rejectionReason: '',
        status: 'inactive',
    };

    const nextDiscountType = set.discountType;
    if (nextDiscountType === 'percentage') {
        set.maxDiscount = payload.maxDiscount !== undefined ? payload.maxDiscount : existing.maxDiscount;
    } else {
        set.maxDiscount = null;
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
