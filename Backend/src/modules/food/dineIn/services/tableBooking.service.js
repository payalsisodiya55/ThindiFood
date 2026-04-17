import mongoose from 'mongoose';
import { FoodTableBooking } from '../models/tableBooking.model.js';
import { FoodTableSession } from '../models/tableSession.model.js';
import { FoodUser } from '../../../../core/users/user.model.js';
import { getIO, rooms } from '../../../../config/socket.js';
import { logger } from '../../../../utils/logger.js';

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
        date: new Date(body.date),
        timeSlot: String(body.timeSlot).trim(),
        specialRequest: String(body.specialRequest || '').trim(),
        status: 'PENDING',
    });

    // Notify restaurant in real-time about new booking
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

/**
 * Get all bookings for a user
 */
export async function getUserBookings(userId) {
    const bookings = await FoodTableBooking.find({ userId })
        .populate({ path: 'userId', select: 'name phone email' })
        .sort({ createdAt: -1 })
        .lean();
    return bookings.map(hydrateBookingGuest);
}

/**
 * Get all bookings for a restaurant
 */
export async function getRestaurantBookings(restaurantId) {
    const bookings = await FoodTableBooking.find({ restaurantId })
        .populate({ path: 'userId', select: 'name phone email' })
        .sort({ createdAt: -1 })
        .lean();
    return bookings.map(hydrateBookingGuest);
}

/**
 * Get a single booking by ID
 */
export async function getBookingById(bookingId) {
    if (!mongoose.Types.ObjectId.isValid(bookingId)) return null;
    return FoodTableBooking.findById(bookingId).lean();
}

/**
 * Restaurant accepts a booking
 * Status: PENDING → ACCEPTED
 */
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

    // Notify user in real-time
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

/**
 * Restaurant declines a booking
 * Status: PENDING → DECLINED
 */
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

    // Notify user
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

/**
 * Restaurant clicks CHECK-IN button.
 * Status: ACCEPTED → CHECKED_IN
 * IMPORTANT: This does NOT create a session.
 * It only sends a notification to the user: "Your table is ready. Scan QR to start ordering."
 */
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

    // Notify user — "Your table is ready. Scan QR to start ordering."
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

/**
 * User cancels a booking
 * Status: PENDING | ACCEPTED → CANCELLED
 */
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

    // Notify restaurant
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

/**
 * Look up an ACCEPTED booking for this user+restaurant combination.
 * Called during QR session creation to optionally attach bookingId.
 */
export async function findAcceptedBooking(userId, restaurantId) {
    return FoodTableBooking.findOne({
        userId,
        restaurantId,
        status: { $in: ['ACCEPTED', 'CHECKED_IN'] },
    })
        .sort({ createdAt: -1 })
        .lean();
}

/**
 * Mark a booking as linked to a session (called after QR session creation)
 */
export async function linkBookingToSession(bookingMongoId, sessionId) {
    if (!mongoose.Types.ObjectId.isValid(bookingMongoId)) return;
    await FoodTableBooking.findByIdAndUpdate(bookingMongoId, {
        sessionId,
    });
}
