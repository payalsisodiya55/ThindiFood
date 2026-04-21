import * as dineInService from '../services/dineIn.service.js';
import { sendResponse, sendError } from '../../../../utils/response.js';

export async function getTableInfoController(req, res, next) {
    try {
        const { restaurantId, table } = req.query;
        if (!restaurantId || !table) {
            return sendError(res, 400, 'Restaurant ID and Table Number are required');
        }

        const data = await dineInService.getTableInfo(restaurantId, table);
        return sendResponse(res, 200, 'Table info fetched successfully', data);
    } catch (error) {
        next(error);
    }
}

export async function getRestaurantDiningOfferPreviewController(req, res, next) {
    try {
        const { restaurantId } = req.params;
        const data = await dineInService.getRestaurantDiningOfferPreview(restaurantId);
        return sendResponse(res, 200, 'Restaurant dining offer fetched successfully', data);
    } catch (error) {
        next(error);
    }
}

export async function createSessionController(req, res, next) {
    try {
        const { restaurantId, tableNumber } = req.body;
        const userId = req.user.userId || req.user.id;

        if (!restaurantId || !tableNumber) {
            return sendError(res, 400, 'Restaurant ID and Table Number are required');
        }

        const session = await dineInService.createTableSession({
            restaurantId,
            tableNumber,
            userId
        });

        return sendResponse(res, 201, 'Table session created successfully', session);
    } catch (error) {
        next(error);
    }
}

export async function getSessionController(req, res, next) {
    try {
        const { id } = req.params;
        const session = await dineInService.getSessionById(id);
        
        // Basic security check: only the user who created it or restaurant staff can see it
        // (Staff check can be added later when we integrate with restaurant roles)
        if (String(session.userId._id || session.userId) !== String(req.user.userId || req.user.id) && req.user.role !== 'RESTAURANT') {
            return sendError(res, 403, 'Unauthorized to view this session');
        }

        return sendResponse(res, 200, 'Session details fetched successfully', session);
    } catch (error) {
        next(error);
    }
}

export async function placeOrderController(req, res, next) {
    try {
        const { id } = req.params;
        const orderData = req.body;
        const userId = req.user.userId || req.user.id;

        const order = await dineInService.placeOrder(id, userId, orderData);
        return sendResponse(res, 201, 'Order placed successfully', order);
    } catch (error) {
        next(error);
    }
}

export async function getSessionOrdersController(req, res, next) {
    try {
        const { id } = req.params;
        const orders = await dineInService.getSessionOrders(id);
        return sendResponse(res, 200, 'Orders fetched successfully', orders);
    } catch (error) {
        next(error);
    }
}

export async function updateOrderStatusController(req, res, next) {
    try {
        const { orderId } = req.params;
        const { status, reason } = req.body;
        
        // This is a staff check. We'll refine roles later, but for now 
        // we'll allow RESTAURANT role to update.
        const userRole = String(req.user.role || "").toUpperCase();
        if (userRole !== 'RESTAURANT' && userRole !== 'ADMIN') {
            return sendError(res, 403, 'Unauthorized to update order status');
        }

        const order = await dineInService.updateOrderStatus(orderId, status, { reason });
        return sendResponse(res, 200, 'Order status updated successfully', order);
    } catch (error) {
        next(error);
    }
}

export async function getSessionBillController(req, res, next) {
    try {
        const { id } = req.params;
        const bill = await dineInService.getSessionBill(id);
        return sendResponse(res, 200, 'Bill summary fetched successfully', bill);
    } catch (error) {
        next(error);
    }
}

export async function closeSessionController(req, res, next) {
    try {
        const { id } = req.params;
        const paymentData = req.body;
        
        const session = await dineInService.closeSession(id, paymentData);
        return sendResponse(res, 200, 'Session closed and table released', session);
    } catch (error) {
        next(error);
    }
}

export async function addTableController(req, res, next) {
    try {
        const { restaurantId, tableNumber, tableLabel, capacity } = req.body;

        // Staff check
        const userRole = String(req.user.role || "").toUpperCase();
        if (userRole !== 'RESTAURANT' && userRole !== 'ADMIN') {
            return sendError(res, 403, 'Unauthorized to manage tables');
        }

        const table = await dineInService.addTable({
            restaurantId,
            tableNumber,
            tableLabel,
            capacity
        });

        return sendResponse(res, 201, 'Table added successfully', table);
    } catch (error) {
        next(error);
    }
}

export async function listTablesController(req, res, next) {
    try {
        const { restaurantId } = req.params;
        const tables = await dineInService.listTables(restaurantId);
        return sendResponse(res, 200, 'Tables fetched successfully', tables);
    } catch (error) {
        next(error);
    }
}

export async function requestCounterPaymentController(req, res, next) {
    try {
        const { id } = req.params;
        const userId = req.user.userId || req.user.id;
        const session = await dineInService.requestCounterPayment(id, userId);
        return sendResponse(res, 200, 'Counter payment requested', session);
    } catch (error) {
        next(error);
    }
}

export async function markCounterPaidController(req, res, next) {
    try {
        const { id } = req.params;
        const session = await dineInService.markCounterPaid(id);
        return sendResponse(res, 200, 'Payment marked as paid', session);
    } catch (error) {
        next(error);
    }
}
