import mongoose from 'mongoose';
import { FoodTableBooking } from '../models/tableBooking.model.js';
import { FoodTableSession } from '../models/tableSession.model.js';
import { FoodRestaurantTable } from '../models/restaurantTable.model.js';
import { FoodUser } from '../../../../core/users/user.model.js';
import { getIO, rooms } from '../../../../config/socket.js';
import { logger } from '../../../../utils/logger.js';
import { getOutletTimingsForRestaurant } from '../../restaurant/services/outletTimings.service.js';

const MEAL_WINDOWS = {
    lunch: { start: 12 * 60, end: 16 * 60 },
    dinner: { start: 18 * 60, end: 26 * 60 },
};

const toSafeUserRef = (candidate) => {
    if (!candidate || typeof candidate !== 'object') return null;
    const name = String(candidate?.name || candidate?.fullName || '').trim();
    const phone = String(candidate?.phone || candidate?.mobile || candidate?.phoneNumber || '').trim();
    const email = String(candidate?.email || '').trim();
    const _id = candidate?._id || candidate?.id || null;
    const id = candidate?.id || candidate?._id || null;
    if (!_id && !id && !name && !phone && !email) return null;
    return { _id, id, name, phone, email };
};

const getDayName = (value) => new Date(value).toLocaleDateString('en-US', { weekday: 'long' });

const parseTimeToMinutes = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;

    const hhmmMatch = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (hhmmMatch) {
        const hour = Number(hhmmMatch[1]);
        const minute = Number(hhmmMatch[2]);
        if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            return null;
        }
        return hour * 60 + minute;
    }

    const meridiemMatch = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
    if (!meridiemMatch) return null;

    let hour = Number(meridiemMatch[1]);
    const minute = Number(meridiemMatch[2] || 0);
    const meridiem = meridiemMatch[3].toLowerCase();
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 1 || hour > 12 || minute < 0 || minute > 59) {
        return null;
    }

    if (meridiem === 'pm' && hour !== 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    return hour * 60 + minute;
};

const formatMinutesToLabel = (minutes) => {
    const normalizedMinutes = ((minutes % (24 * 60)) + (24 * 60)) % (24 * 60);
    const hours = Math.floor(normalizedMinutes / 60);
    const mins = normalizedMinutes % 60;
    const period = hours >= 12 ? 'pm' : 'am';
    const displayHour = hours % 12 || 12;
    return `${displayHour}:${String(mins).padStart(2, '0')} ${period}`;
};

const normalizeMealType = (value) => {
    const mealType = String(value || '').trim().toLowerCase();
    return mealType === 'lunch' || mealType === 'dinner' ? mealType : null;
};

const normalizeDateOnly = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
};

const getMealTypeForMinutes = (minutes) => {
    if (!Number.isFinite(minutes)) return null;
    if (minutes >= MEAL_WINDOWS.lunch.start && minutes <= MEAL_WINDOWS.lunch.end) return 'lunch';
    if (minutes >= MEAL_WINDOWS.dinner.start) return 'dinner';
    return null;
};

const isTimeWithinOperatingWindow = (slotMinutes, timing) => {
    if (!timing || timing.isOpen === false) return false;
    const opening = parseTimeToMinutes(timing.openingTime);
    const closing = parseTimeToMinutes(timing.closingTime);
    if (opening === null || closing === null || slotMinutes === null) return false;

    const adjustedClosing = closing > opening ? closing : closing + 24 * 60;
    const adjustedSlot = slotMinutes < opening ? slotMinutes + 24 * 60 : slotMinutes;
    return adjustedSlot >= opening && adjustedSlot <= adjustedClosing;
};

const validateAndNormalizeBookingSlot = async (restaurantId, bookingDate, rawTimeSlot, requestedMealType) => {
    const slotMinutes = parseTimeToMinutes(rawTimeSlot);
    if (slotMinutes === null) {
        throw new Error('Invalid time slot format');
    }

    const derivedMealType = getMealTypeForMinutes(slotMinutes);
    if (!derivedMealType) {
        throw new Error('Please select a valid lunch or dinner time slot');
    }

    if (requestedMealType && requestedMealType !== derivedMealType) {
        throw new Error('Selected slot does not match the chosen meal session');
    }

    const { outletTimings } = await getOutletTimingsForRestaurant(restaurantId);
    const dayTiming = outletTimings?.[getDayName(bookingDate)];
    if (!isTimeWithinOperatingWindow(slotMinutes, dayTiming)) {
        throw new Error('Selected time slot is outside restaurant operating hours');
    }

    return {
        mealType: derivedMealType,
        timeSlot: formatMinutesToLabel(slotMinutes),
    };
};

const hydrateBookingGuest = (booking) => {
    const snapshot = toSafeUserRef(booking?.userRef);
    const populated = booking?.userId && typeof booking.userId === 'object' ? booking.userId : null;

    const name =
        String(
            populated?.name ||
            snapshot?.name ||
            booking?.customerName ||
            '',
        ).trim();
    const phone =
        String(
            populated?.phone ||
            snapshot?.phone ||
            booking?.phone ||
            booking?.phoneNumber ||
            '',
        ).trim();
    const email = String(populated?.email || snapshot?.email || '').trim();

    return {
        ...booking,
        user: {
            _id: populated?._id || snapshot?._id || null,
            id: populated?._id || snapshot?.id || null,
            name: name || 'Guest',
            phone,
            email,
        },
        customerName: name || 'Guest',
        customerPhone: phone,
    };
};

export async function getPublicBookingAvailability(restaurantId, query = {}) {
    const restaurantIdStr = String(restaurantId || '').trim();
    if (!restaurantIdStr || !mongoose.Types.ObjectId.isValid(restaurantIdStr)) {
        throw new Error('Valid restaurantId is required');
    }

    const targetDate = normalizeDateOnly(query.date);
    if (!targetDate) {
        throw new Error('Valid booking date is required');
    }

    const guests = Math.max(1, Number(query.guests) || 1);
    const dateStart = new Date(targetDate);
    const dateEnd = new Date(targetDate);
    dateEnd.setDate(dateEnd.getDate() + 1);

    const [matchingTablesCount, bookings] = await Promise.all([
        FoodRestaurantTable.countDocuments({
            restaurantId: restaurantIdStr,
            isActive: true,
            capacity: { $gte: guests },
        }),
        FoodTableBooking.find({
            restaurantId: restaurantIdStr,
            date: { $gte: dateStart, $lt: dateEnd },
            status: { $in: ['PENDING', 'ACCEPTED', 'CHECKED_IN'] },
        })
            .select('timeSlot mealType guests status')
            .lean(),
    ]);

    const slotCounts = bookings.reduce((acc, booking) => {
        const slotLabel = String(booking?.timeSlot || '').trim().toLowerCase();
        if (!slotLabel) return acc;
        acc[slotLabel] = (acc[slotLabel] || 0) + 1;
        return acc;
    }, {});

    const effectiveCapacity = matchingTablesCount > 0 ? matchingTablesCount : null;
    const unavailableSlots = effectiveCapacity
        ? Object.entries(slotCounts)
            .filter(([, count]) => Number(count || 0) >= effectiveCapacity)
            .map(([slot]) => slot)
        : [];

    return {
        date: dateStart.toISOString(),
        guests,
        totalMatchingTables: matchingTablesCount,
        unavailableSlots,
        bookings: bookings.map((booking) => ({
            timeSlot: booking?.timeSlot || '',
            mealType: booking?.mealType || null,
            guests: Number(booking?.guests || 0),
            status: booking?.status || '',
        })),
    };
}

/**
 * Create a new table booking (User side)
 * Status starts as PENDING — restaurant must accept.
 */
export async function createTableBooking(userId, body = {}) {
    const restaurantId = String(body.restaurant || '').trim();
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) {
        throw new Error('Valid restaurantId is required');
    }
    if (!body.guests || isNaN(Number(body.guests)) || Number(body.guests) < 1) {
        throw new Error('Number of guests is required');
    }
    if (!body.date) throw new Error('Booking date is required');
    if (!body.timeSlot) throw new Error('Time slot is required');

    const bookingDate = new Date(body.date);
    if (Number.isNaN(bookingDate.getTime())) throw new Error('Booking date is invalid');
    const requestedMealType = normalizeMealType(body.mealType);
    const normalizedSlot = await validateAndNormalizeBookingSlot(
        restaurantId,
        bookingDate,
        body.timeSlot,
        requestedMealType,
    );

    const trustedUser =
        (mongoose.Types.ObjectId.isValid(userId)
            ? await FoodUser.findById(userId).select('name phone email').lean()
            : null) || null;

    const mergedUserRef = (() => {
        const bodyUser = toSafeUserRef(body.userRef);
        const dbUser = toSafeUserRef(trustedUser);
        if (!bodyUser && !dbUser) return null;
        return {
            _id: dbUser?._id || bodyUser?._id || userId || null,
            id: dbUser?._id || bodyUser?.id || userId || null,
            name: String(dbUser?.name || bodyUser?.name || '').trim(),
            phone: String(dbUser?.phone || bodyUser?.phone || '').trim(),
            email: String(dbUser?.email || bodyUser?.email || '').trim(),
        };
    })();

    const booking = await FoodTableBooking.create({
        userId,
        restaurantId,
        restaurantRef: body.restaurantRef || null,
        userRef: mergedUserRef,
        guests: Number(body.guests),
        date: bookingDate,
        timeSlot: normalizedSlot.timeSlot,
        mealType: normalizedSlot.mealType,
        specialRequest: String(body.specialRequest || '').trim(),
        status: 'PENDING',
    });

    try {
        const io = getIO();
        if (io) {
            const bookingGuest = hydrateBookingGuest(
                typeof booking?.toObject === 'function' ? booking.toObject() : booking,
            );
            io.to(rooms.restaurant(restaurantId)).emit('new_table_booking', {
                bookingId: bookingGuest.bookingId || booking.bookingId,
                _id: String(bookingGuest._id || booking._id),
                userId: String(userId),
                user: bookingGuest.user || null,
                customerName: bookingGuest.customerName || 'Guest',
                customerPhone: bookingGuest.customerPhone || '',
                guests: bookingGuest.guests,
                date: bookingGuest.date,
                timeSlot: bookingGuest.timeSlot,
                status: 'PENDING',
            });
        }
    } catch (e) {
        logger.warn(`Socket emit new_table_booking failed: ${e.message}`);
    }

    return booking;
}

export async function getUserBookings(userId) {
    const bookings = await FoodTableBooking.find({ userId })
        .populate({ path: 'userId', select: 'name phone email' })
        .sort({ createdAt: -1 })
        .lean();
    return bookings.map(hydrateBookingGuest);
}

export async function getRestaurantBookings(restaurantId) {
    const bookings = await FoodTableBooking.find({ restaurantId })
        .populate({ path: 'userId', select: 'name phone email' })
        .sort({ createdAt: -1 })
        .lean();
    return bookings.map(hydrateBookingGuest);
}

export async function getBookingById(bookingId) {
    if (!mongoose.Types.ObjectId.isValid(bookingId)) return null;
    return FoodTableBooking.findById(bookingId).lean();
}

export async function acceptBooking(bookingId, restaurantId) {
    const booking = await FoodTableBooking.findOne({
        _id: bookingId,
        restaurantId,
        status: 'PENDING',
    });
    if (!booking) throw new Error('Booking not found or already processed');

    booking.status = 'ACCEPTED';
    booking.acceptedAt = new Date();
    await booking.save();

    try {
        const io = getIO();
        if (io) {
            io.to(rooms.user(booking.userId)).emit('booking_status_update', {
                bookingId: booking.bookingId,
                _id: String(booking._id),
                status: 'ACCEPTED',
                message: 'Your table booking has been accepted! We look forward to seeing you.',
            });
        }
    } catch (e) {
        logger.warn(`Socket emit booking_status_update failed: ${e.message}`);
    }

    return booking;
}

export async function declineBooking(bookingId, restaurantId) {
    const booking = await FoodTableBooking.findOne({
        _id: bookingId,
        restaurantId,
        status: 'PENDING',
    });
    if (!booking) throw new Error('Booking not found or already processed');

    booking.status = 'DECLINED';
    booking.declinedAt = new Date();
    await booking.save();

    try {
        const io = getIO();
        if (io) {
            io.to(rooms.user(booking.userId)).emit('booking_status_update', {
                bookingId: booking.bookingId,
                _id: String(booking._id),
                status: 'DECLINED',
                message: 'Your booking request was declined by the restaurant.',
            });
        }
    } catch (e) {
        logger.warn(`Socket emit booking_status_update failed: ${e.message}`);
    }

    return booking;
}

export async function checkInBooking(bookingId, restaurantId) {
    const booking = await FoodTableBooking.findOne({
        _id: bookingId,
        restaurantId,
        status: 'ACCEPTED',
    });
    if (!booking) throw new Error('Booking not found or not in ACCEPTED state');

    booking.status = 'CHECKED_IN';
    booking.checkedInAt = new Date();
    await booking.save();

    try {
        const io = getIO();
        if (io) {
            io.to(rooms.user(booking.userId)).emit('table_ready', {
                bookingId: booking.bookingId,
                _id: String(booking._id),
                status: 'CHECKED_IN',
                message: 'Your table is ready! Please scan the QR code on your table to start ordering.',
            });
        }
    } catch (e) {
        logger.warn(`Socket emit table_ready failed: ${e.message}`);
    }

    return booking;
}

export async function cancelBooking(bookingId, userId) {
    const booking = await FoodTableBooking.findOne({
        _id: bookingId,
        userId,
        status: { $in: ['PENDING', 'ACCEPTED'] },
    });
    if (!booking) throw new Error('Booking not found or cannot be cancelled');

    booking.status = 'CANCELLED';
    booking.cancelledAt = new Date();
    await booking.save();

    try {
        const io = getIO();
        if (io) {
            io.to(rooms.restaurant(booking.restaurantId)).emit('booking_cancelled', {
                bookingId: booking.bookingId,
                _id: String(booking._id),
                userId: String(userId),
            });
        }
    } catch (e) {
        logger.warn(`Socket emit booking_cancelled failed: ${e.message}`);
    }

    return booking;
}

export async function findAcceptedBooking(userId, restaurantId) {
    return FoodTableBooking.findOne({
        userId,
        restaurantId,
        status: { $in: ['ACCEPTED', 'CHECKED_IN'] },
    })
        .sort({ createdAt: -1 })
        .lean();
}

export async function linkBookingToSession(bookingMongoId, sessionId) {
    if (!mongoose.Types.ObjectId.isValid(bookingMongoId)) return;
    await FoodTableBooking.findByIdAndUpdate(bookingMongoId, {
        sessionId,
    });
}
