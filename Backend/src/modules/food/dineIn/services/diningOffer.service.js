import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodDiningOffer } from '../models/diningOffer.model.js';
import { FoodDiningOfferUsage } from '../models/diningOfferUsage.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';

const ensureObjectId = (value, message) => {
    if (!value || !mongoose.Types.ObjectId.isValid(String(value))) {
        throw new ValidationError(message);
    }
    return new mongoose.Types.ObjectId(String(value));
};

const roundMoney = (value) => Number((Number(value) || 0).toFixed(2));
const normalizePositiveIntegerOrNull = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) return null;
    if (normalized < 1) return null;
    return Math.trunc(normalized);
};

const normalizeOffer = (doc) => {
    if (!doc) return null;
    const obj = doc.toObject ? doc.toObject() : { ...doc };
    return {
        ...obj,
        id: String(obj._id),
        _id: String(obj._id),
        restaurantId: obj.restaurantId ? String(obj.restaurantId) : null,
        createdById: obj.createdById ? String(obj.createdById) : null,
        // Ensure schedule always present in API responses
        schedule: obj.schedule || { mode: 'all_days', customDays: [], happyHours: [] },
        termsAndConditions: obj.termsAndConditions || '',
    };
};

const toDateOrNull = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const toOfferBoundaryDate = (value, boundary = 'start') => {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const normalized = new Date(value);
        if (boundary === 'end') {
            normalized.setHours(23, 59, 59, 999);
        } else {
            normalized.setHours(0, 0, 0, 0);
        }
        return normalized;
    }

    const normalizedValue = String(value).trim();
    const dateParts = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateParts) {
        const [, year, month, day] = dateParts;
        return boundary === 'end'
            ? new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59, 999)
            : new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
    }

    const parsed = new Date(normalizedValue);
    if (Number.isNaN(parsed.getTime())) return null;
    if (boundary === 'end') {
        parsed.setHours(23, 59, 59, 999);
    } else {
        parsed.setHours(0, 0, 0, 0);
    }
    return parsed;
};

// ─── Schedule helpers ─────────────────────────────────────────────────────────

/**
 * Parse 'HH:MM' string into total minutes since midnight.
 * Returns NaN for invalid input.
 */
const parseTimeToMinutes = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return NaN;
    const [h, m] = timeStr.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return NaN;
    return h * 60 + m;
};

/**
 * Validate and normalize a schedule object from request payload.
 * Throws ValidationError on invalid input.
 */
const normalizeSchedulePayload = (rawSchedule) => {
    if (!rawSchedule || typeof rawSchedule !== 'object') {
        return { mode: 'all_days', customDays: [], happyHours: [] };
    }

    const VALID_MODES = ['all_days', 'weekdays', 'weekends', 'custom'];
    const mode = VALID_MODES.includes(rawSchedule.mode) ? rawSchedule.mode : 'all_days';

    // Validate customDays
    let customDays = [];
    if (mode === 'custom') {
        const rawDays = Array.isArray(rawSchedule.customDays) ? rawSchedule.customDays : [];
        customDays = [...new Set(rawDays.map(Number).filter((d) => Number.isFinite(d) && d >= 0 && d <= 6))];
        if (customDays.length === 0) {
            throw new ValidationError('Custom schedule requires at least one selected day');
        }
    }

    // Validate happyHours
    const rawHours = Array.isArray(rawSchedule.happyHours) ? rawSchedule.happyHours : [];
    const happyHours = rawHours
        .filter((slot) => slot && typeof slot === 'object')
        .map((slot) => ({
            start: String(slot.start || '').trim(),
            end: String(slot.end || '').trim(),
        }));

    for (const slot of happyHours) {
        const startMins = parseTimeToMinutes(slot.start);
        const endMins = parseTimeToMinutes(slot.end);
        if (Number.isNaN(startMins) || Number.isNaN(endMins)) {
            throw new ValidationError('Happy hour times must be in HH:MM format (e.g. 15:00)');
        }
        if (endMins <= startMins) {
            throw new ValidationError(`Happy hour slot ${slot.start}–${slot.end}: end time must be after start time`);
        }
    }

    // Check for overlapping slots
    const sorted = [...happyHours].sort((a, b) => parseTimeToMinutes(a.start) - parseTimeToMinutes(b.start));
    for (let i = 1; i < sorted.length; i++) {
        if (parseTimeToMinutes(sorted[i].start) < parseTimeToMinutes(sorted[i - 1].end)) {
            throw new ValidationError(
                `Happy hour slots overlap: ${sorted[i - 1].start}–${sorted[i - 1].end} and ${sorted[i].start}–${sorted[i].end}`
            );
        }
    }

    return { mode, customDays, happyHours };
};

const isDateAllowedBySchedule = (date, schedule) => {
    if (!date || !schedule) return true;
    const day = date.getDay();
    if (schedule.mode === 'all_days') return true;
    if (schedule.mode === 'weekdays') return day >= 1 && day <= 5;
    if (schedule.mode === 'weekends') return day === 0 || day === 6;
    if (schedule.mode === 'custom') {
        const days = Array.isArray(schedule.customDays) ? schedule.customDays : [];
        return days.includes(day);
    }
    return true;
};

const dateRangeIncludesApplicableScheduleDay = (startDate, endDate, schedule) => {
    if (!startDate || !endDate || !schedule) return false;
    const cursor = new Date(startDate);
    cursor.setHours(0, 0, 0, 0);
    const limit = new Date(endDate);
    limit.setHours(0, 0, 0, 0);

    while (cursor.getTime() <= limit.getTime()) {
        if (isDateAllowedBySchedule(cursor, schedule)) return true;
        cursor.setDate(cursor.getDate() + 1);
    }

    return false;
};

const getScheduleWindowLabel = (schedule) => {
    if (!schedule) return 'selected day(s)';
    if (schedule.mode === 'weekdays') return 'weekday(s)';
    if (schedule.mode === 'weekends') return 'weekend day(s)';
    if (schedule.mode === 'custom') return 'selected custom day(s)';
    return 'selected day(s)';
};

/**
 * Return true if the offer's schedule allows the given moment (defaults to now).
 */
const isOfferActiveForSchedule = (offer, now = new Date()) => {
    const schedule = offer?.schedule;
    if (!schedule || schedule.mode === 'all_days') return true;

    const dayOfWeek = now.getDay(); // 0=Sun … 6=Sat

    if (schedule.mode === 'weekdays' && (dayOfWeek === 0 || dayOfWeek === 6)) return false;
    if (schedule.mode === 'weekends' && dayOfWeek >= 1 && dayOfWeek <= 5) return false;
    if (schedule.mode === 'custom') {
        const days = Array.isArray(schedule.customDays) ? schedule.customDays : [];
        if (!days.includes(dayOfWeek)) return false;
    }

    // Check happy hours (if any configured)
    const happyHours = Array.isArray(schedule.happyHours) ? schedule.happyHours : [];
    if (happyHours.length === 0) return true;

    const currentMins = now.getHours() * 60 + now.getMinutes();
    return happyHours.some((slot) => {
        const startMins = parseTimeToMinutes(slot.start);
        const endMins = parseTimeToMinutes(slot.end);
        if (Number.isNaN(startMins) || Number.isNaN(endMins)) return false;
        return currentMins >= startMins && currentMins < endMins;
    });
};

// ─── Restaurant helpers ───────────────────────────────────────────────────────

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
    usageLimit: normalizePositiveIntegerOrNull(payload.usageLimit),
    perUserLimit: normalizePositiveIntegerOrNull(payload.perUserLimit ?? payload.perUserRedeemLimit),
    fundedBy,
    createdByRole,
    createdById,
    status,
    approvalStatus,
    rejectionReason,
    startDate: toOfferBoundaryDate(payload.startDate, 'start'),
    endDate: toOfferBoundaryDate(payload.endDate, 'end'),
    priority: payload.priority !== undefined ? Number(payload.priority) || 0 : 0,
    // ─── NEW fields ───────────────────────────────────────────────────────────
    schedule: normalizeSchedulePayload(payload.schedule),
    termsAndConditions: String(payload.termsAndConditions || '').trim(),
});

const validateOfferPayload = (payload) => {
    if (!String(payload.title || '').trim()) {
        throw new ValidationError('Title is required');
    }
    if (String(payload.title || '').trim().length > 100) {
        throw new ValidationError('Title cannot exceed 100 characters');
    }
    if (payload.description && String(payload.description).trim().length > 500) {
        throw new ValidationError('Description cannot exceed 500 characters');
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
    if (payload.usageLimit !== undefined && payload.usageLimit !== null && payload.usageLimit !== '') {
        if (!Number.isInteger(Number(payload.usageLimit)) || Number(payload.usageLimit) < 1) {
            throw new ValidationError('Usage limit must be at least 1');
        }
    }
    const perUserLimit = payload.perUserLimit ?? payload.perUserRedeemLimit;
    if (perUserLimit !== undefined && perUserLimit !== null && perUserLimit !== '') {
        if (!Number.isInteger(Number(perUserLimit)) || Number(perUserLimit) < 1) {
            throw new ValidationError('Per user limit must be at least 1');
        }
    }
    if (payload.termsAndConditions && String(payload.termsAndConditions).trim().length > 2000) {
        throw new ValidationError('Terms and conditions cannot exceed 2000 characters');
    }

    // Validate schedule (throws on invalid input)
    const scheduleObj = normalizeSchedulePayload(payload.schedule);
    const startDate = toOfferBoundaryDate(payload.startDate, 'start');
    const endDate = toOfferBoundaryDate(payload.endDate, 'end');

    if (!startDate || !endDate) {
        throw new ValidationError('Start date and end date are required for every dining offer');
    }
    if (endDate.getTime() < startDate.getTime()) {
        throw new ValidationError('End date cannot be earlier than start date');
    }

    if (!dateRangeIncludesApplicableScheduleDay(startDate, endDate, scheduleObj)) {
        throw new ValidationError(`The selected date range does not include any ${getScheduleWindowLabel(scheduleObj)}. Please adjust the dates or schedule.`);
    }

    if (scheduleObj.happyHours && scheduleObj.happyHours.length > 0) {
        if (scheduleObj.mode === 'custom' && (!scheduleObj.customDays || scheduleObj.customDays.length === 0)) {
            throw new ValidationError('Please select the applicable day(s) before configuring Happy Hours.');
        }
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
    if (payload.startDate !== undefined) existing.startDate = toOfferBoundaryDate(payload.startDate, 'start');
    if (payload.endDate !== undefined) existing.endDate = toOfferBoundaryDate(payload.endDate, 'end');
    if (payload.priority !== undefined) existing.priority = Number(payload.priority) || 0;
    if (payload.usageLimit !== undefined) existing.usageLimit = normalizePositiveIntegerOrNull(payload.usageLimit);
    if (payload.perUserLimit !== undefined || payload.perUserRedeemLimit !== undefined) {
        existing.perUserLimit = normalizePositiveIntegerOrNull(payload.perUserLimit ?? payload.perUserRedeemLimit);
    }
    if (payload.schedule !== undefined) existing.schedule = normalizeSchedulePayload(payload.schedule);
    if (payload.termsAndConditions !== undefined) existing.termsAndConditions = String(payload.termsAndConditions || '').trim();
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

const buildUsageLimitFilter = () => ({
    $or: [
        { usageLimit: { $exists: false } },
        { usageLimit: null },
        { usageLimit: { $lte: 0 } },
        { $expr: { $lt: ['$usedCount', '$usageLimit'] } },
    ],
});

export const getBestApplicableDiningOffer = async ({ restaurantId, subtotal, userId = null, excludeOfferIds = [] }) => {
    const rid = ensureObjectId(restaurantId, 'Invalid restaurant id');
    const baseAmount = roundMoney(subtotal);
    if (baseAmount <= 0) return null;

    const now = new Date();
    const excludedIds = (Array.isArray(excludeOfferIds) ? excludeOfferIds : [])
        .map((value) => String(value || '').trim())
        .filter((value) => mongoose.Types.ObjectId.isValid(value))
        .map((value) => new mongoose.Types.ObjectId(value));
    const filter = {
        restaurantId: rid,
        status: 'active',
        approvalStatus: 'approved',
        $or: [{ startDate: null }, { startDate: { $lte: now } }],
        $and: [{ $or: [{ endDate: null }, { endDate: { $gte: now } }] }],
        minBillAmount: { $lte: baseAmount },
        ...buildUsageLimitFilter(),
    };
    if (excludedIds.length) {
        filter._id = { $nin: excludedIds };
    }
    let offers = await FoodDiningOffer.find(filter).lean();

    if (!offers.length) return null;

    // ─── Schedule-aware filtering ──────────────────────────────────────────────
    offers = offers.filter((offer) => isOfferActiveForSchedule(offer, now));

    if (!offers.length) return null;

    if (userId && mongoose.Types.ObjectId.isValid(String(userId))) {
        const limitedOfferIds = offers
            .filter((offer) => Number(offer?.perUserLimit || 0) > 0)
            .map((offer) => offer._id);

        if (limitedOfferIds.length) {
            const usages = await FoodDiningOfferUsage.find({
                offerId: { $in: limitedOfferIds },
                userId: new mongoose.Types.ObjectId(String(userId)),
            })
                .select('offerId count')
                .lean();

            const usageMap = new Map(
                usages.map((usage) => [String(usage.offerId), Number(usage.count || 0)])
            );

            offers = offers.filter((offer) => {
                const perUserLimit = Number(offer?.perUserLimit || 0);
                if (perUserLimit <= 0) return true;
                return Number(usageMap.get(String(offer._id)) || 0) < perUserLimit;
            });
        }
    }

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

export const consumeDiningOfferUsage = async ({ offerId, userId = null }) => {
    const oid = ensureObjectId(offerId, 'Invalid dining offer id');
    const offer = await FoodDiningOffer.findById(oid)
        .select('_id usageLimit usedCount perUserLimit status')
        .lean();

    if (!offer || String(offer.status || '').toLowerCase() !== 'active') {
        return false;
    }

    let userUsageIncremented = false;
    let normalizedUserId = null;
    const perUserLimit = Number(offer.perUserLimit || 0);

    if (userId && mongoose.Types.ObjectId.isValid(String(userId)) && perUserLimit > 0) {
        normalizedUserId = new mongoose.Types.ObjectId(String(userId));
        try {
            const usageDoc = await FoodDiningOfferUsage.findOneAndUpdate(
                {
                    offerId: oid,
                    userId: normalizedUserId,
                    $or: [
                        { count: { $exists: false } },
                        { count: { $lt: perUserLimit } },
                    ],
                },
                {
                    $inc: { count: 1 },
                    $set: { lastUsedAt: new Date() },
                },
                {
                    new: true,
                    upsert: true,
                    setDefaultsOnInsert: true,
                }
            ).lean();

            if (!usageDoc || Number(usageDoc.count || 0) > perUserLimit) {
                return false;
            }

            userUsageIncremented = true;
        } catch (error) {
            if (error?.code === 11000) {
                return false;
            }
            throw error;
        }
    }

    const updatedOffer = await FoodDiningOffer.findOneAndUpdate(
        {
            _id: oid,
            status: 'active',
            ...buildUsageLimitFilter(),
        },
        { $inc: { usedCount: 1 } },
        { new: true, projection: { _id: 1, usageLimit: 1, usedCount: 1, status: 1 } }
    ).lean();

    if (!updatedOffer) {
        if (userUsageIncremented && normalizedUserId) {
            await FoodDiningOfferUsage.updateOne(
                { offerId: oid, userId: normalizedUserId, count: { $gt: 0 } },
                { $inc: { count: -1 } }
            );
        }
        return false;
    }

    const usageLimit = Number(updatedOffer.usageLimit || 0);
    if (usageLimit > 0 && Number(updatedOffer.usedCount || 0) >= usageLimit) {
        await FoodDiningOffer.updateOne(
            { _id: oid, status: 'active' },
            { $set: { status: 'inactive' } }
        );
    }

    return true;
};

export const getDisplayDiningOfferForRestaurant = async (restaurantId) => {
    const rid = ensureObjectId(restaurantId, 'Invalid restaurant id');
    const now = new Date();

    // Fetch all date-range-eligible offers and apply schedule check in memory,
    // so the richest matching offer (highest priority, correct schedule) is returned.
    const candidates = await FoodDiningOffer.find({
        restaurantId: rid,
        status: 'active',
        approvalStatus: 'approved',
        $or: [{ startDate: null }, { startDate: { $lte: now } }],
        $and: [{ $or: [{ endDate: null }, { endDate: { $gte: now } }] }],
    })
        .sort({ priority: -1, createdAt: 1 })
        .lean();

    const offer = candidates.find((o) => isOfferActiveForSchedule(o, now)) || null;
    return normalizeOffer(offer);
};

// Export schedule helper so it can be used in other modules if needed
export { isOfferActiveForSchedule };
