import express from 'express';
import { authMiddleware } from '../../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../../core/roles/role.middleware.js';
import {
    getTableInfoController,
    createSessionController,
    getSessionController,
    placeOrderController,
    getSessionOrdersController,
    updateOrderStatusController,
    getSessionBillController,
    closeSessionController,
    addTableController,
    listTablesController
} from '../controllers/dineIn.controller.js';

const router = express.Router();

// Publicly accessible to fetch table info (used for QR landing pre-check)
router.get('/table-info', getTableInfoController);

// Protected routes (User must be logged in)
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

// Table Management (Admin/Restaurant)
router.post('/tables', authMiddleware, requireRoles('RESTAURANT', 'ADMIN'), addTableController);
router.get('/restaurants/:restaurantId/tables', authMiddleware, requireRoles('RESTAURANT', 'ADMIN'), listTablesController);

export default router;
