import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodOffer } from '../../admin/models/offer.model.js';

const ensureObjectId = (value, message) => {
    if (!value || !mongoose.Types.ObjectId.isValid(String(value))) {
        throw new ValidationError(message);
    }
    return new mongoose.Types.ObjectId(String(value));
};

const normalizeCouponDoc = (doc) => {
    if (!doc) return null;
    const draft = doc.toObject ? doc.toObject() : doc;
    return {
        ...draft,
        id: String(draft._id),
        _id: String(draft._id),
        restaurantId: draft.restaurantId ? String(draft.restaurantId) : null
    };
};

export const createRestaurantCoupon = async (restaurantId, payload) => {
    const rid = ensureObjectId(restaurantId, 'Invalid restaurant id');

    const existing = await FoodOffer.findOne({ couponCode: payload.couponCode }).select('_id').lean();
    if (existing?._id) {
        throw new ValidationError('Coupon code already exists');
    }

    const created = await FoodOffer.create({
        couponCode: payload.couponCode,
        discountType: payload.discountType,
        discountValue: payload.discountValue,
        customerScope: payload.customerScope || 'all',
        restaurantScope: 'selected',
        restaurantId: rid,
        minOrderValue: payload.minOrderValue ?? 0,
        maxDiscount: payload.discountType === 'percentage' ? (payload.maxDiscount ?? 0) : null,
        usageLimit: payload.usageLimit ?? null,
        perUserLimit: payload.perUserLimit ?? null,
        startDate: payload.startDate,
        endDate: payload.endDate,
        isFirstOrderOnly: payload.isFirstOrderOnly ?? false,
        status: 'inactive',
        approvalStatus: 'pending',
        rejectionReason: '',
        showInCart: true
    });

    return normalizeCouponDoc(created);
};

export const getMyRestaurantCoupons = async (restaurantId) => {
    const rid = ensureObjectId(restaurantId, 'Invalid restaurant id');
    const coupons = await FoodOffer.find({ restaurantId: rid })
        .sort({ createdAt: -1 })
        .lean();
    return { coupons: coupons.map(normalizeCouponDoc) };
};

export const updateMyRestaurantCoupon = async (restaurantId, couponId, payload) => {
    const rid = ensureObjectId(restaurantId, 'Invalid restaurant id');
    const oid = ensureObjectId(couponId, 'Invalid coupon id');

    const existing = await FoodOffer.findOne({ _id: oid, restaurantId: rid });
    if (!existing) return null;

    if (existing.approvalStatus === 'approved') {
        throw new ValidationError('Approved coupons cannot be edited');
    }

    if (!['pending', 'rejected'].includes(existing.approvalStatus || 'pending')) {
        throw new ValidationError('Only pending or rejected coupons can be edited');
    }

    if (payload.couponCode && payload.couponCode !== existing.couponCode) {
        const duplicate = await FoodOffer.findOne({
            couponCode: payload.couponCode,
            _id: { $ne: oid }
        })
            .select('_id')
            .lean();
        if (duplicate?._id) {
            throw new ValidationError('Coupon code already exists');
        }
    }

    const nextDiscountType = payload.discountType || existing.discountType;
    const nextStartDate = payload.startDate !== undefined ? payload.startDate : existing.startDate;
    const nextEndDate = payload.endDate !== undefined ? payload.endDate : existing.endDate;
    if (nextStartDate && nextEndDate && new Date(nextEndDate).getTime() <= new Date(nextStartDate).getTime()) {
        throw new ValidationError('endDate must be after startDate');
    }

    const set = {
        ...payload,
        restaurantScope: 'selected',
        restaurantId: rid,
        status: 'inactive'
    };

    if (nextDiscountType === 'flat-price') {
        set.maxDiscount = null;
    } else {
        const rawMax = payload.maxDiscount !== undefined ? payload.maxDiscount : existing.maxDiscount;
        if (rawMax === null || rawMax === undefined || rawMax === '') {
            throw new ValidationError('maxDiscount is required for percentage coupons');
        }
        const parsed = Number(rawMax);
        if (!Number.isFinite(parsed) || parsed < 0) {
            throw new ValidationError('maxDiscount must be greater than or equal to 0');
        }
        set.maxDiscount = parsed;
    }

    if (existing.approvalStatus === 'rejected') {
        set.approvalStatus = 'pending';
        set.rejectionReason = '';
    } else {
        set.approvalStatus = 'pending';
    }

    const updated = await FoodOffer.findOneAndUpdate(
        { _id: oid, restaurantId: rid },
        { $set: set },
        { new: true }
    );

    return normalizeCouponDoc(updated);
};

export const deleteMyRestaurantCoupon = async (restaurantId, couponId) => {
    const rid = ensureObjectId(restaurantId, 'Invalid restaurant id');
    const oid = ensureObjectId(couponId, 'Invalid coupon id');

    const deleted = await FoodOffer.findOneAndDelete({ _id: oid, restaurantId: rid }).lean();
    if (!deleted) return null;
    return { id: String(deleted._id) };
};
