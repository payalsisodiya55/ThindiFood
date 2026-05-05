import express from 'express';
import { authMiddleware } from '../../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../../core/roles/role.middleware.js';
import {
    getTableInfoController,
    getRestaurantDiningOfferPreviewController,
    createSessionController,
    getSessionController,
    placeOrderController,
    getSessionOrdersController,
    updateOrderStatusController,
    getSessionBillController,
    closeSessionController,
    initiateOnlinePaymentController,
    verifyOnlinePaymentController,
    cancelEmptySessionController,
    addTableController,
    listTablesController,
    updateTableController,
    deleteTableController,
    requestCounterPaymentController,
    markCounterPaidController,
    listRestaurantSessionsController,
} from '../controllers/dineIn.controller.js';
import {
    createBookingController,
    getUserBookingsController,
    cancelBookingController,
    getRestaurantBookingsController,
    acceptBookingController,
    declineBookingController,
    checkInBookingController,
} from '../controllers/tableBooking.controller.js';

const router = express.Router();

// ─── Table Info (public) ──────────────────────────────────────────────────────
router.get('/table-info', getTableInfoController);
router.get('/restaurants/:restaurantId/overall-offer', getRestaurantDiningOfferPreviewController);

// ─── Sessions (QR flow — untouched) ──────────────────────────────────────────
router.post('/sessions', authMiddleware, createSessionController);
router.get('/sessions/:id', authMiddleware, getSessionController);

// Orders within session
router.post('/sessions/:id/orders', authMiddleware, placeOrderController);
router.get('/sessions/:id/orders', authMiddleware, getSessionOrdersController);

// Kitchen/Staff side status updates
router.patch('/orders/:orderId/status', authMiddleware, requireRoles('RESTAURANT', 'ADMIN'), updateOrderStatusController);

// Billing & Payment
router.get('/sessions/:id/bill', authMiddleware, getSessionBillController);
router.post('/sessions/:id/pay', authMiddleware, closeSessionController);
router.post('/sessions/:id/pay/initiate', authMiddleware, requireRoles('USER'), initiateOnlinePaymentController);
router.post('/sessions/:id/pay/verify', authMiddleware, requireRoles('USER'), verifyOnlinePaymentController);
router.post('/sessions/:id/cancel-empty', authMiddleware, requireRoles('USER'), cancelEmptySessionController);
// Pay at Counter
router.post('/sessions/:id/request-counter-payment', authMiddleware, requireRoles('USER'), requestCounterPaymentController);
router.post('/sessions/:id/mark-counter-paid', authMiddleware, requireRoles('RESTAURANT', 'ADMIN'), markCounterPaidController);

// Table Management
router.post('/tables', authMiddleware, requireRoles('RESTAURANT', 'ADMIN'), addTableController);
router.get('/restaurants/:restaurantId/tables', authMiddleware, requireRoles('RESTAURANT', 'ADMIN'), listTablesController);
router.patch('/tables/:id', authMiddleware, requireRoles('RESTAURANT', 'ADMIN'), updateTableController);
router.delete('/tables/:id', authMiddleware, requireRoles('RESTAURANT', 'ADMIN'), deleteTableController);
router.get('/restaurants/current/sessions', authMiddleware, requireRoles('RESTAURANT', 'ADMIN'), listRestaurantSessionsController);

// ─── Table Bookings (Pre-book flow) ─────────────────────────────────────────

// User routes
router.post('/bookings', authMiddleware, requireRoles('USER'), createBookingController);
router.get('/bookings/my', authMiddleware, requireRoles('USER'), getUserBookingsController);
router.patch('/bookings/:id/cancel', authMiddleware, requireRoles('USER'), cancelBookingController);

// Restaurant routes
router.get('/bookings/restaurant', authMiddleware, requireRoles('RESTAURANT', 'ADMIN'), getRestaurantBookingsController);
router.patch('/bookings/:id/accept', authMiddleware, requireRoles('RESTAURANT', 'ADMIN'), acceptBookingController);
router.patch('/bookings/:id/decline', authMiddleware, requireRoles('RESTAURANT', 'ADMIN'), declineBookingController);
// CHECK-IN: only sends user notification, does NOT create session
router.patch('/bookings/:id/check-in', authMiddleware, requireRoles('RESTAURANT', 'ADMIN'), checkInBookingController);

export default router;
