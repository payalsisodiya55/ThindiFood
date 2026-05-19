import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodRestaurantOutletTimings } from '../models/outletTimings.model.js';
import { FoodRestaurant } from '../models/restaurant.model.js';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const normalizeDay = (value) => {
    const v = String(value || '').trim();
    if (!v) return null;
    const exact = DAY_NAMES.find((d) => d.toLowerCase() === v.toLowerCase());
    if (exact) return exact;
    const abbr = v.slice(0, 3).toLowerCase();
    const match = DAY_NAMES.find((d) => d.toLowerCase().startsWith(abbr));
    return match || null;
};

const normalizeTime = (value, fallback) => {
    const raw = String(value || '').trim();
    if (!raw) return fallback;
    // Accept "HH:mm" or "H:mm"
    const m = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return fallback;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return fallback;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

const defaultTimings = () =>
    DAY_NAMES.map((day) => ({
        day,
        isOpen: true,
        openingTime: '09:00',
        closingTime: '22:00'
    }));

const buildTimingsFromRestaurantRegistration = (restaurant) => {
    const openingTime = normalizeTime(restaurant?.openingTime, '09:00');
    const closingTime = normalizeTime(restaurant?.closingTime, '22:00');
    const normalizedOpenDays = new Set(
        (Array.isArray(restaurant?.openDays) ? restaurant.openDays : [])
            .map((day) => normalizeDay(day))
            .filter(Boolean)
    );

    if (!normalizedOpenDays.size) {
        return defaultTimings();
    }

    return DAY_NAMES.map((day) => {
        const isOpen = normalizedOpenDays.has(day);
        return {
            day,
            isOpen,
            openingTime: isOpen ? openingTime : '',
            closingTime: isOpen ? closingTime : ''
        };
    });
};

const isLegacyDefaultTimings = (timings) =>
    Array.isArray(timings) &&
    timings.length === DAY_NAMES.length &&
    DAY_NAMES.every((day) => {
        const entry = timings.find((item) => normalizeDay(item?.day) === day);
        return (
            entry &&
            entry.isOpen !== false &&
            normalizeTime(entry?.openingTime, '09:00') === '09:00' &&
            normalizeTime(entry?.closingTime, '22:00') === '22:00'
        );
    });

const registrationDiffersFromLegacyDefault = (restaurant) => {
    const openingTime = normalizeTime(restaurant?.openingTime, '09:00');
    const closingTime = normalizeTime(restaurant?.closingTime, '22:00');
    const normalizedOpenDays = new Set(
        (Array.isArray(restaurant?.openDays) ? restaurant.openDays : [])
            .map((day) => normalizeDay(day))
            .filter(Boolean)
    );

    if (!normalizedOpenDays.size) return false;
    if (openingTime !== '09:00' || closingTime !== '22:00') return true;
    return normalizedOpenDays.size !== DAY_NAMES.length;
};

const toClientShape = (doc) => {
    const timings = Array.isArray(doc?.timings) ? doc.timings : [];
    const map = {};
    for (const day of DAY_NAMES) {
        const found = timings.find((t) => normalizeDay(t?.day) === day);
        const isOpen = found ? found.isOpen !== false : true;
        map[day] = {
            isOpen,
            openingTime: isOpen ? normalizeTime(found?.openingTime, '09:00') : '',
            closingTime: isOpen ? normalizeTime(found?.closingTime, '22:00') : ''
        };
    }
    return map;
};

export async function getOutletTimingsForRestaurant(restaurantId) {
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(String(restaurantId))) {
        throw new ValidationError('Invalid restaurant id');
    }
    const doc = await FoodRestaurantOutletTimings.findOne({ restaurantId }).select('timings updatedAt').lean();
    const restaurant = await FoodRestaurant.findById(restaurantId)
        .select('openingTime closingTime openDays')
        .lean();
    if (!doc) {
        return {
            outletTimings: toClientShape({
                timings: buildTimingsFromRestaurantRegistration(restaurant)
            })
        };
    }
    if (isLegacyDefaultTimings(doc.timings) && registrationDiffersFromLegacyDefault(restaurant)) {
        const timings = buildTimingsFromRestaurantRegistration(restaurant);
        await FoodRestaurantOutletTimings.findOneAndUpdate(
            { restaurantId },
            { $set: { timings } },
            { new: false }
        );
        return { outletTimings: toClientShape({ timings }) };
    }
    return { outletTimings: toClientShape(doc) };
}

export async function upsertOutletTimingsForRestaurant(restaurantId, outletTimings) {
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(String(restaurantId))) {
        throw new ValidationError('Invalid restaurant id');
    }
    if (!outletTimings || typeof outletTimings !== 'object' || Array.isArray(outletTimings)) {
        throw new ValidationError('outletTimings must be an object keyed by day name');
    }

    const timings = DAY_NAMES.map((day) => {
        const src = outletTimings[day] && typeof outletTimings[day] === 'object' ? outletTimings[day] : {};
        const isOpen = src.isOpen !== false;
        return {
            day,
            isOpen,
            openingTime: isOpen ? normalizeTime(src.openingTime, '09:00') : '',
            closingTime: isOpen ? normalizeTime(src.closingTime, '22:00') : ''
        };
    });

    const doc = await FoodRestaurantOutletTimings.findOneAndUpdate(
        { restaurantId },
        { $set: { timings } },
        { upsert: true, new: true, setDefaultsOnInsert: true, projection: 'timings updatedAt' }
    ).lean();

    return { outletTimings: toClientShape(doc) };
}

