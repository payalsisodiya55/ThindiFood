import {
    createTableBooking,
    getUserBookings,
    getRestaurantBookings,
    acceptBooking,
    declineBooking,
    checkInBooking,
    cancelBooking,
    getBookingById,
} from '../services/tableBooking.service.js';

// ─── User Controllers ─────────────────────────────────────────────────────────

export async function createBookingController(req, res) {
    try {
        const userId = req.user?.userId;
        const booking = await createTableBooking(userId, req.body);
        res.json({ success: true, data: booking });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
}

export async function getUserBookingsController(req, res) {
    try {
        const userId = req.user?.userId;
        const bookings = await getUserBookings(userId);
        res.json({ success: true, data: bookings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

export async function cancelBookingController(req, res) {
    try {
        const userId = req.user?.userId;
        const { id } = req.params;
        const booking = await cancelBooking(id, userId);
        res.json({ success: true, data: booking });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
}

// ─── Restaurant Controllers ───────────────────────────────────────────────────

export async function getRestaurantBookingsController(req, res) {
    try {
        const restaurantId = req.user?.userId;
        const bookings = await getRestaurantBookings(restaurantId);
        res.json({ success: true, data: bookings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

export async function acceptBookingController(req, res) {
    try {
        const restaurantId = req.user?.userId;
        const { id } = req.params;
        const booking = await acceptBooking(id, restaurantId);
        res.json({ success: true, data: booking });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
}

export async function declineBookingController(req, res) {
    try {
        const restaurantId = req.user?.userId;
        const { id } = req.params;
        const booking = await declineBooking(id, restaurantId);
        res.json({ success: true, data: booking });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
}

export async function checkInBookingController(req, res) {
    try {
        const restaurantId = req.user?.userId;
        const { id } = req.params;
        // CHECK-IN: only sends notification, does NOT create session
        const booking = await checkInBooking(id, restaurantId);
        res.json({ success: true, data: booking, message: 'Notification sent to user' });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
}
