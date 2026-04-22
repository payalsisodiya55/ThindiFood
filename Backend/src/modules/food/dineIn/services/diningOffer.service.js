import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodDiningOffer } from '../models/diningOffer.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';

const ensureObjectId = (value, message) => {
    if (!value || !mongoose.Types.ObjectId.isValid(String(value))) {
        throw new ValidationError(message);
    }
    return new mongoose.Types.ObjectId(String(value));
};

const roundMoney = (value) => Number((Number(value) || 0).toFixed(2));

const normalizeOffer = (doc) => {
    if (!doc) return null;
    const obj = doc.toObject ? doc.toObject() : { ...doc };
    return {
        ...obj,
        id: String(obj._id),
        _id: String(obj._id),
        restaurantId: obj.restaurantId ? String(obj.restaurantId) : null,
        createdById: obj.createdById ? String(obj.createdById) : null,
    };
};

const toDateOrNull = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const getRestaurantForOffer = async (restaurantId) => {
    const rid = ensureObjectId(restaurantId, 'Invalid restaurant id');
    const restaurant = await FoodRestaurant.findById(rid)
        .select('restaurantName diningSettings status')
        .lean();

    if (!restaurant) {
        throw new ValidationError('Restaurant not found');
    }

    if (restaurant.status !== 'approved') {
        throw new ValidationError('Restaurant is not approved');
    }

    return { rid, restaurant };
};

const getAllApprovedRestaurantsForDiningOffers = async () => {
    const restaurants = await FoodRestaurant.find({ status: 'approved' })
        .select('restaurantName')
        .lean();

    return restaurants.map((restaurant) => ({
        rid: new mongoose.Types.ObjectId(String(restaurant._id)),
        restaurant,
    }));
};

const buildOfferPayload = (payload, { restaurantId, restaurantName, fundedBy, createdByRole, createdById, status, approvalStatus, rejectionReason = '' }) => ({
    restaurantId,
    restaurantName,
    title: String(payload.title || '').trim(),
    description: String(payload.description || '').trim(),
    discountType: payload.discountType === 'flat' ? 'flat' : 'percentage',
    discountValue: Number(payload.discountValue) || 0,
    maxDiscount:
        (payload.discountType === 'percentage' || payload.discountType === undefined)
            ? (payload.maxDiscount !== undefined && payload.maxDiscount !== null && payload.maxDiscount !== '' ? Number(payload.maxDiscount) : null)
            : null,
    minBillAmount: payload.minBillAmount !== undefined && payload.minBillAmount !== null && payload.minBillAmount !== ''
        ? Number(payload.minBillAmount)
        : 0,
    fundedBy,
    createdByRole,
    createdById,
    status,
    approvalStatus,
    rejectionReason,
    startDate: toDateOrNull(payload.startDate),
    endDate: toDateOrNull(payload.endDate),
    priority: payload.priority !== undefined ? Number(payload.priority) || 0 : 0,
});

const validateOfferPayload = (payload) => {
    if (!String(payload.title || '').trim()) {
        throw new ValidationError('Title is required');
    }
    if (!Number.isFinite(Number(payload.discountValue)) || Number(payload.discountValue) <= 0) {
        throw new ValidationError('Discount value must be greater than 0');
    }
    if (String(payload.discountType || 'percentage') === 'percentage') {
        if (payload.maxDiscount !== null && payload.maxDiscount !== undefined && payload.maxDiscount !== '' && Number(payload.maxDiscount) < 0) {
            throw new ValidationError('Max discount must be 0 or more');
        }
    }
    if (payload.minBillAmount !== null && payload.minBillAmount !== undefined && payload.minBillAmount !== '' && Number(payload.minBillAmount) < 0) {
        throw new ValidationError('Minimum bill amount must be 0 or more');
    }

    const startDate = toDateOrNull(payload.startDate);
    const endDate = toDateOrNull(payload.endDate);
    if (startDate && endDate && endDate.getTime() <= startDate.getTime()) {
        throw new ValidationError('End date must be after start date');
    }
};

export const createRestaurantDiningOffer = async (restaurantId, payload) => {
    validateOfferPayload(payload);
    const { rid, restaurant } = await getRestaurantForOffer(restaurantId);
    const created = await FoodDiningOffer.create(
        buildOfferPayload(payload, {
            restaurantId: rid,
            restaurantName: restaurant.restaurantName || '',
            fundedBy: 'restaurant',
            createdByRole: 'restaurant',
            createdById: rid,
            status: 'inactive',
            approvalStatus: 'pending',
        })
    );
    return normalizeOffer(created);
};

export const getMyRestaurantDiningOffers = async (restaurantId) => {
    const rid = ensureObjectId(restaurantId, 'Invalid restaurant id');
    const offers = await FoodDiningOffer.find({ restaurantId: rid }).sort({ createdAt: -1 }).lean();
    return { offers: offers.map(normalizeOffer) };
};

export const updateMyRestaurantDiningOffer = async (restaurantId, offerId, payload) => {
    validateOfferPayload(payload);
    const rid = ensureObjectId(restaurantId, 'Invalid restaurant id');
    const oid = ensureObjectId(offerId, 'Invalid dining offer id');
    const existing = await FoodDiningOffer.findOne({ _id: oid, restaurantId: rid });
    if (!existing) return null;

    const restaurant = await FoodRestaurant.findById(rid).select('restaurantName').lean();
    const updated = await FoodDiningOffer.findOneAndUpdate(
        { _id: oid, restaurantId: rid },
        {
            $set: buildOfferPayload(payload, {
                restaurantId: rid,
                restaurantName: restaurant?.restaurantName || existing.restaurantName || '',
                fundedBy: 'restaurant',
                createdByRole: 'restaurant',
                createdById: rid,
                status: 'inactive',
                approvalStatus: 'pending',
                rejectionReason: '',
            }),
        },
        { new: true }
    );

    return normalizeOffer(updated);
};

export const deleteMyRestaurantDiningOffer = async (restaurantId, offerId) => {
    const rid = ensureObjectId(restaurantId, 'Invalid restaurant id');
    const oid = ensureObjectId(offerId, 'Invalid dining offer id');
    const deleted = await FoodDiningOffer.findOneAndDelete({ _id: oid, restaurantId: rid }).lean();
    if (!deleted) return null;
    return { id: String(deleted._id) };
};

export const getAllDiningOffersAdmin = async (query = {}) => {
    const filter = {};
    if (query.approvalStatus) filter.approvalStatus = String(query.approvalStatus);
    if (query.status) filter.status = String(query.status);
    if (query.fundedBy) filter.fundedBy = String(query.fundedBy);
    if (query.createdByRole) filter.createdByRole = String(query.createdByRole);
    if (query.restaurantId && mongoose.Types.ObjectId.isValid(String(query.restaurantId))) {
        filter.restaurantId = new mongoose.Types.ObjectId(String(query.restaurantId));
    }

    const offers = await FoodDiningOffer.find(filter).sort({ createdAt: -1 }).lean();
    return { offers: offers.map(normalizeOffer) };
};

export const createAdminDiningOffer = async (adminId, payload) => {
    validateOfferPayload(payload);
    const aid = adminId && mongoose.Types.ObjectId.isValid(String(adminId))
        ? new mongoose.Types.ObjectId(String(adminId))
        : null;

    const applyToAllRestaurants =
        payload.applyToAllRestaurants === true ||
        String(payload.restaurantId || '').trim().toUpperCase() === 'ALL_RESTAURANTS';

    const targetRestaurants = applyToAllRestaurants
        ? await getAllApprovedRestaurantsForDiningOffers()
        : [await getRestaurantForOffer(payload.restaurantId)];

    if (!targetRestaurants.length) {
        throw new ValidationError('No approved restaurants found for this dining offer');
    }

    const offerPayloads = targetRestaurants.map(({ rid, restaurant }) =>
        buildOfferPayload(payload, {
            restaurantId: rid,
            restaurantName: restaurant.restaurantName || '',
            fundedBy: payload.fundedBy === 'restaurant' ? 'restaurant' : 'platform',
            createdByRole: 'admin',
            createdById: aid,
            status: payload.status === 'inactive' ? 'inactive' : 'active',
            approvalStatus: 'approved',
        })
    );

    const createdOffers = await FoodDiningOffer.insertMany(offerPayloads);

    if (applyToAllRestaurants) {
        return {
            createdCount: createdOffers.length,
            offers: createdOffers.map(normalizeOffer),
            applyToAllRestaurants: true,
        };
    }

    return normalizeOffer(createdOffers[0]);
};

export const updateAdminDiningOffer = async (offerId, payload) => {
    const oid = ensureObjectId(offerId, 'Invalid dining offer id');
    const existing = await FoodDiningOffer.findById(oid);
    if (!existing) return null;

    const restaurantId = payload.restaurantId || existing.restaurantId;
    const { rid, restaurant } = await getRestaurantForOffer(restaurantId);

    validateOfferPayload({
        ...existing.toObject(),
        ...payload,
        restaurantId: rid,
    });

    existing.restaurantId = rid;
    existing.restaurantName = restaurant.restaurantName || existing.restaurantName || '';
    existing.title = String(payload.title ?? existing.title ?? '').trim();
    existing.description = String(payload.description ?? existing.description ?? '').trim();
    existing.discountType = payload.discountType === 'flat' ? 'flat' : (payload.discountType ? 'percentage' : existing.discountType);
    existing.discountValue = payload.discountValue !== undefined ? Number(payload.discountValue) : existing.discountValue;
    existing.maxDiscount = existing.discountType === 'percentage'
        ? (payload.maxDiscount !== undefined ? (payload.maxDiscount === null || payload.maxDiscount === '' ? null : Number(payload.maxDiscount)) : existing.maxDiscount)
        : null;
    existing.minBillAmount = payload.minBillAmount !== undefined
        ? Number(payload.minBillAmount) || 0
        : existing.minBillAmount;
    if (payload.fundedBy !== undefined) existing.fundedBy = payload.fundedBy === 'restaurant' ? 'restaurant' : 'platform';
    if (payload.status !== undefined) existing.status = payload.status === 'inactive' ? 'inactive' : 'active';
    if (payload.startDate !== undefined) existing.startDate = toDateOrNull(payload.startDate);
    if (payload.endDate !== undefined) existing.endDate = toDateOrNull(payload.endDate);
    if (payload.priority !== undefined) existing.priority = Number(payload.priority) || 0;
    existing.approvalStatus = 'approved';
    existing.rejectionReason = '';
    await existing.save();
    return normalizeOffer(existing);
};

export const approveDiningOfferAdmin = async (offerId) => {
    const oid = ensureObjectId(offerId, 'Invalid dining offer id');
    const updated = await FoodDiningOffer.findByIdAndUpdate(
        oid,
        { $set: { approvalStatus: 'approved', status: 'active', rejectionReason: '' } },
        { new: true }
    );
    return normalizeOffer(updated);
};

export const rejectDiningOfferAdmin = async (offerId, reason) => {
    const oid = ensureObjectId(offerId, 'Invalid dining offer id');
    const updated = await FoodDiningOffer.findByIdAndUpdate(
        oid,
        { $set: { approvalStatus: 'rejected', status: 'inactive', rejectionReason: String(reason || '').trim() } },
        { new: true }
    );
    return normalizeOffer(updated);
};

export const deleteDiningOfferAdmin = async (offerId) => {
    const oid = ensureObjectId(offerId, 'Invalid dining offer id');
    const deleted = await FoodDiningOffer.findByIdAndDelete(oid).lean();
    if (!deleted) return null;
    return { id: String(deleted._id) };
};

export const calculateDiningOfferDiscount = (offer, subtotal) => {
    const baseAmount = roundMoney(subtotal);
    if (!offer || baseAmount <= 0) return 0;

    let discountAmount = 0;
    if (offer.discountType === 'flat') {
        discountAmount = Number(offer.discountValue) || 0;
    } else {
        discountAmount = (baseAmount * (Number(offer.discountValue) || 0)) / 100;
        if (offer.maxDiscount !== null && offer.maxDiscount !== undefined) {
            discountAmount = Math.min(discountAmount, Number(offer.maxDiscount) || 0);
        }
    }
    const normalizedDiscount = Math.max(0, Math.min(baseAmount, discountAmount));
    return Math.round(normalizedDiscount);
};

export const getBestApplicableDiningOffer = async ({ restaurantId, subtotal }) => {
    const rid = ensureObjectId(restaurantId, 'Invalid restaurant id');
    const baseAmount = roundMoney(subtotal);
    if (baseAmount <= 0) return null;

    const now = new Date();
    const offers = await FoodDiningOffer.find({
        restaurantId: rid,
        status: 'active',
        approvalStatus: 'approved',
        $or: [{ startDate: null }, { startDate: { $lte: now } }],
        $and: [{ $or: [{ endDate: null }, { endDate: { $gte: now } }] }],
        minBillAmount: { $lte: baseAmount },
    }).lean();

    if (!offers.length) return null;

    const ranked = offers
        .map((offer) => ({
            ...offer,
            discountAmount: calculateDiningOfferDiscount(offer, baseAmount),
        }))
        .filter((offer) => offer.discountAmount > 0)
        .sort((a, b) => {
            if (b.discountAmount !== a.discountAmount) return b.discountAmount - a.discountAmount;
            if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });

    return ranked.length ? normalizeOffer(ranked[0]) : null;
};

export const getDisplayDiningOfferForRestaurant = async (restaurantId) => {
    const rid = ensureObjectId(restaurantId, 'Invalid restaurant id');
    const now = new Date();

    const offer = await FoodDiningOffer.findOne({
        restaurantId: rid,
        status: 'active',
        approvalStatus: 'approved',
        $or: [{ startDate: null }, { startDate: { $lte: now } }],
        $and: [{ $or: [{ endDate: null }, { endDate: { $gte: now } }] }],
    })
        .sort({ priority: -1, createdAt: 1 })
        .lean();

    return normalizeOffer(offer);
};
