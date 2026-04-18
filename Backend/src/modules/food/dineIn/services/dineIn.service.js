import mongoose from 'mongoose';
import { FoodRestaurantTable } from '../models/restaurantTable.model.js';
import { FoodTableSession } from '../models/tableSession.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodDineInOrder } from '../models/dineInOrder.model.js';
import { FoodTableBooking } from '../models/tableBooking.model.js';
import { getIO, rooms } from '../../../../config/socket.js';
import { findAcceptedBooking, linkBookingToSession } from './tableBooking.service.js';

/**
 * Fetch table information and its current status.
 */
export async function getTableInfo(restaurantId, tableNumber) {
    if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
        throw new Error('Invalid Restaurant ID');
    }

    const table = await FoodRestaurantTable.findOne({
        restaurantId,
        tableNumber: String(tableNumber).trim()
    }).populate('currentSessionId').lean();

    if (!table) {
        // Fallback: Check if restaurant exists. If yes, the table might not be in our DB yet.
        const restaurant = await FoodRestaurant.findById(restaurantId).select('restaurantName').lean();
        if (!restaurant) throw new Error('Restaurant not found');
        
        return {
            restaurant,
            tableNumber,
            isRegistered: false,
            isActive: false,
            currentSession: null
        };
    }

    return {
        restaurant: await FoodRestaurant.findById(restaurantId).select('restaurantName profileImage').lean(),
        tableNumber: table.tableNumber,
        tableLabel: table.tableLabel,
        capacity: table.capacity,
        isActive: table.isActive,
        isRegistered: true,
        currentSession: table.currentSessionId
    };
}

/**
 * Create a new table session.
 */
export async function createTableSession(data) {
    const { restaurantId, tableNumber, userId } = data;

    // 1. Validate Table
    let table = await FoodRestaurantTable.findOne({ restaurantId, tableNumber });
    if (!table) {
        throw new Error('Table not found in this restaurant');
    }

    if (!table.isActive) {
        throw new Error('This table is currently not accepting new orders');
    }

    // 2. Check for existing active session
    if (table.currentSessionId) {
        const existingSession = await FoodTableSession.findById(table.currentSessionId).populate('orders');
        if (existingSession && ['active', 'bill_requested'].includes(existingSession.status)) {
            const nonCancelledOrders = (existingSession.orders || []).filter(o => o.status !== 'cancelled');
            
            // If the session has history but EVERYTHING were cancelled, 
            // we treat it as dead and allow a fresh start.
            if (existingSession.orders.length > 0 && nonCancelledOrders.length === 0) {
                existingSession.status = 'completed';
                existingSession.closedAt = new Date();
                await existingSession.save();
                // table.currentSessionId is essentially invalid now, we'll overwrite it below.
            } else {
                // If same user scans, return existing active session (with their orders)
                if (String(existingSession.userId || "") === String(userId)) {
                    return existingSession;
                }
                throw new Error('This table is already occupied');
            }
        }
    }

    // 3. Create Session
    const session = await FoodTableSession.create({
        restaurantId,
        tableNumber,
        tableId: table._id,
        userId,
        status: 'active'
    });

    // 4. Link session to table
    table.currentSessionId = session._id;
    await table.save();

    // 5. Check if user has an ACCEPTED pre-booking for this restaurant.
    //    If yes, attach bookingId to session (non-blocking).
    try {
        const acceptedBooking = await findAcceptedBooking(userId, restaurantId);
        if (acceptedBooking) {
            session.bookingId = acceptedBooking._id;
            await session.save();
            await linkBookingToSession(String(acceptedBooking._id), session._id);
        }
    } catch (e) {
        // Non-blocking: session is valid even without booking linkage
    }

    return session;
}

/**
 * Get session details by ID.
 */
export async function getSessionById(sessionId) {
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
        throw new Error('Invalid Session ID');
    }

    const session = await FoodTableSession.findById(sessionId)
        .populate('orders')
        .populate('userId', 'name phone email')
        .lean();

    if (!session) {
        throw new Error('Session not found');
    }

    return session;
}

/**
 * Place a new order round in a session.
 */
export async function placeOrder(sessionId, userId, orderData) {
    const session = await FoodTableSession.findById(sessionId);
    if (!session) throw new Error('Session not found');

    if (session.status !== 'active') {
        throw new Error('This session is no longer active and cannot accept new orders');
    }

    // Block new orders if bill has been finalized for settlement.
    if (
        session.isBillFinalized === true ||
        session.status === 'bill_requested' ||
        (session.paymentMode === 'COUNTER' && session.paymentStatus === 'PENDING')
    ) {
        throw new Error('Bill is finalized. No new orders can be placed after requesting counter payment.');
    }

    if (String(session.userId) !== String(userId)) {
        throw new Error('Unauthorized to place order for this session');
    }

    // 1. Calculate round number
    const roundNumber = session.orders.length + 1;

    // 2. Create Order
    const order = new FoodDineInOrder({
        sessionId: session._id,
        restaurantId: session.restaurantId,
        tableNumber: session.tableNumber,
        items: orderData.items,
        roundNumber,
        specialRequest: orderData.specialRequest || '',
        status: 'received'
    });

    await order.save();

    // 3. Update Session
    session.orders.push(order._id);
    
    await session.save();

    // Ensure totals are accurate and only include active rounds
    await recalculateSessionTotal(session._id);

    // 4. Real-time notify restaurant so they see the order instantly
    try {
        const io = getIO();
        if (io) {
            io.to(rooms.restaurant(session.restaurantId)).emit('new_dine_in_order', {
                sessionId: String(session._id),
                restaurantId: String(session.restaurantId),
                tableNumber: String(session.tableNumber),
                orderId: String(order._id),
                roundNumber: order.roundNumber,
                items: order.items,
                subtotal: order.subtotal,
                status: order.status,
                createdAt: order.createdAt,
            });
        }
    } catch {
        // Non-blocking: order is saved even if socket emit fails
    }

    return order;
}

/**
 * Get all orders for a session.
 */
export async function getSessionOrders(sessionId) {
    return await FoodDineInOrder.find({ sessionId }).sort({ createdAt: -1 }).lean();
}

/**
 * Update status of an order (Staff action).
 */
export async function updateOrderStatus(orderId, status, extraData = {}) {
    const order = await FoodDineInOrder.findById(orderId);
    if (!order) throw new Error('Order not found');

    const nextStatus = String(status || '').trim().toLowerCase();
    order.status = nextStatus;

    // Keep item statuses in sync with round status so user-side progress updates.
    if (Array.isArray(order.items)) {
        // Mutate in-place (more reliable than replacing subdoc array for Mongoose change tracking).
        order.items.forEach((item) => {
            if (item) item.status = nextStatus;
        });
        order.markModified('items');
    }

    const now = new Date();
    if (nextStatus === 'preparing') order.preparingAt = now;
    if (nextStatus === 'ready') order.readyAt = now;
    if (nextStatus === 'served') order.servedAt = now;

    if (nextStatus === 'cancelled') {
        order.cancelledAt = now;
        if (extraData?.reason) {
            order.reason = extraData.reason;
        }
    }

    await order.save();

    // If order was cancelled, we must remove its value from the session total
    if (nextStatus === 'cancelled') {
        await recalculateSessionTotal(order.sessionId);
    }

    return order;
}

/**
 * Helper to recalculate session totals based on non-cancelled orders.
 */
async function recalculateSessionTotal(sessionId) {
    const session = await FoodTableSession.findById(sessionId);
    if (!session) return;

    // Only count orders that are NOT cancelled
    const activeOrders = await FoodDineInOrder.find({ 
        sessionId: session._id, 
        status: { $ne: 'cancelled' } 
    });

    const subtotal = activeOrders.reduce((sum, o) => sum + (o.subtotal || 0), 0);
    
    // GST logic (consistent across app)
    const GST_PERCENT = 5; 
    const taxAmount = Number(((subtotal * GST_PERCENT) / 100).toFixed(2));

    session.subtotal = subtotal;
    session.taxAmount = taxAmount;
    session.totalAmount = Number((subtotal + taxAmount).toFixed(2));

    await session.save();
    return session;
}

/**
 * Get final aggregated bill for a session.
 */
export async function getSessionBill(sessionId) {
    const session = await FoodTableSession.findById(sessionId).populate('orders').lean();
    if (!session) throw new Error('Session not found');

    // Itemized aggregation
    const itemMap = {};
    session.orders.forEach(order => {
        // Skip cancelled orders in the final bill breakdown
        if (order.status === 'cancelled') return;

        order.items.forEach(item => {
            const key = String(item.itemId);
            if (itemMap[key]) {
                itemMap[key].quantity += item.quantity;
                itemMap[key].itemTotal += item.itemTotal;
            } else {
                itemMap[key] = {
                    itemId: item.itemId,
                    name: item.name,
                    price: item.price,
                    quantity: item.quantity,
                    itemTotal: item.itemTotal,
                    isVeg: item.isVeg
                };
            }
        });
    });

    return {
        sessionId: session._id,
        restaurantId: session.restaurantId,
        tableNumber: session.tableNumber,
        itemized: Object.values(itemMap),
        summary: {
            subtotal: session.subtotal,
            taxAmount: session.taxAmount,
            totalAmount: session.totalAmount
        },
        status: session.status,
        isPaid: session.isPaid,
        paymentMode: session.paymentMode || '',
        paymentStatus: session.paymentStatus || '',
        paymentRequestedAt: session.paymentRequestedAt || null,
        isBillFinalized: session.isBillFinalized === true
    };
}

/**
 * User requests Pay at Counter — locks bill, notifies restaurant via socket.
 */
export async function requestCounterPayment(sessionId, userId) {
    const session = await FoodTableSession.findById(sessionId);
    if (!session) throw new Error('Session not found');
    if (session.status === 'completed') throw new Error('Session already completed');
    if (String(session.userId) !== String(userId)) {
        throw new Error('Unauthorized to request counter payment for this session');
    }
    if (session.paymentMode === 'COUNTER' && session.paymentStatus === 'PENDING') {
        return session; // Already requested, idempotent
    }

    session.paymentMode = 'COUNTER';
    session.paymentStatus = 'PENDING';
    session.status = 'bill_requested';
    session.isBillFinalized = true;
    session.paymentRequestedAt = new Date();
    await session.save();

    // Emit socket event to restaurant
    try {
        const io = getIO();
        if (io) {
            io.to(rooms.restaurant(session.restaurantId)).emit('payment_pending', {
                sessionId: String(session._id),
                tableNumber: session.tableNumber,
                totalAmount: session.totalAmount,
                restaurantId: String(session.restaurantId),
                requestedAt: session.paymentRequestedAt.toISOString(),
            });
        }
    } catch { /* non-blocking */ }

    return session;
}

/**
 * Restaurant marks counter payment as paid — closes session and frees table.
 */
export async function markCounterPaid(sessionId) {
    const session = await FoodTableSession.findById(sessionId);
    if (!session) throw new Error('Session not found');
    if (session.status === 'completed') throw new Error('Session already completed');
    if (session.paymentMode !== 'COUNTER' || session.paymentStatus !== 'PENDING') {
        throw new Error('No pending counter payment found for this session');
    }

    session.paymentStatus = 'PAID';
    session.isBillFinalized = true;
    await session.save();

    // Close the session via existing closeSession logic
    return closeSession(sessionId, { paymentMethod: 'counter' });
}

/**
 * Mark session as closed and release the table.
 */
export async function closeSession(sessionId, paymentData) {
    const session = await FoodTableSession.findById(sessionId);
    if (!session) throw new Error('Session not found');

    if (session.status === 'completed') {
        throw new Error('Session is already completed');
    }

    // Prevent switching to online after selecting "Pay at Counter".
    const requestedMethod = String(paymentData?.paymentMethod || '').toLowerCase();
    const counterPending = session.paymentMode === 'COUNTER' && session.paymentStatus === 'PENDING';
    const isCounterSettlement = ['counter', 'cash'].includes(requestedMethod);
    if (counterPending && !isCounterSettlement) {
        throw new Error('Counter payment already requested. Please complete payment at restaurant counter.');
    }

    const now = new Date();

    // 0. Finalize all order rounds/items for this session.
    // UX expectation: once the bill is paid, the session is "complete" and all rounds are closed.
    try {
        const orders = await FoodDineInOrder.find({ sessionId: session._id });
        for (const order of orders) {
            const nextItems = Array.isArray(order.items)
                ? order.items.map((item) => ({
                    ...item.toObject?.() || item,
                    status: 'served',
                }))
                : order.items;

            order.items = nextItems;
            order.status = 'served';
            if (!order.servedAt) order.servedAt = now;
            if (!order.readyAt) order.readyAt = now;
            if (!order.preparingAt) order.preparingAt = now;
            await order.save();
        }
    } catch {
        // Non-blocking: session close should still succeed even if round finalization fails.
    }

    // 1. Update Session
    session.status = 'completed';
    session.paymentMethod = paymentData.paymentMethod || 'online';
    session.isPaid = true;
    if (session.paymentMode === 'COUNTER') {
        session.paymentStatus = 'PAID';
    }
    session.isBillFinalized = true;
    session.paidAt = now;
    session.closedAt = now;
    await session.save();

    // 2. Release Table
    await FoodRestaurantTable.findOneAndUpdate(
        { restaurantId: session.restaurantId, tableNumber: session.tableNumber },
        { currentSessionId: null }
    );

    // 3. Mark linked booking as COMPLETED (if any)
    try {
        const bookingId = session.bookingId;
        if (bookingId) {
            await FoodTableBooking.findByIdAndUpdate(bookingId, {
                status: 'COMPLETED',
            });
        } else {
            // Also try to find booking by userId + restaurantId in CHECKED_IN state
            await FoodTableBooking.findOneAndUpdate(
                {
                    userId: session.userId,
                    restaurantId: session.restaurantId,
                    status: 'CHECKED_IN',
                },
                { status: 'COMPLETED' }
            );
        }
    } catch {
        // Non-blocking
    }

    // 4. Real-time notify restaurant clients to refresh their dine-in dashboards.
    try {
        const io = getIO();
        if (io) {
            io.to(rooms.restaurant(session.restaurantId)).emit('dine_in_session_closed', {
                sessionId: session._id?.toString?.() || String(session._id),
                restaurantId: session.restaurantId?.toString?.() || String(session.restaurantId),
                tableNumber: String(session.tableNumber || ''),
                status: 'completed',
                paidAt: now.toISOString(),
            });
        }
    } catch {
        // ignore
    }

    return session;
}

/**
 * Add a new table to a restaurant (Staff/Admin).
 */
export async function addTable(data) {
    const { restaurantId, tableNumber, tableLabel, capacity } = data;
    const normalizedRestaurantId = String(restaurantId || '').trim();
    const normalizedTableNumber = String(tableNumber || '').trim();

    if (!normalizedRestaurantId || !mongoose.Types.ObjectId.isValid(normalizedRestaurantId)) {
        const error = new Error('Valid restaurantId is required');
        error.statusCode = 400;
        throw error;
    }

    if (!normalizedTableNumber) {
        const error = new Error('Table number is required');
        error.statusCode = 400;
        throw error;
    }

    const restaurantExists = await FoodRestaurant.exists({ _id: normalizedRestaurantId });
    if (!restaurantExists) {
        const error = new Error('Restaurant not found');
        error.statusCode = 404;
        throw error;
    }

    // 1. Check if table already exists
    const existing = await FoodRestaurantTable.findOne({
        restaurantId: normalizedRestaurantId,
        tableNumber: normalizedTableNumber,
    });
    if (existing) {
        const error = new Error('Table number already exists for this restaurant');
        error.statusCode = 409;
        throw error;
    }

    // 2. Generate QR Code URL
    // Format: http://localhost:5173/food/user/dine-in?r=REST_ID&t=T1
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const qrCodeUrl = `${frontendUrl}/food/user/dine-in?r=${normalizedRestaurantId}&t=${normalizedTableNumber}`;

    // 3. Create
    const table = await FoodRestaurantTable.create({
        restaurantId: normalizedRestaurantId,
        tableNumber: normalizedTableNumber,
        tableLabel: tableLabel || `Table ${normalizedTableNumber}`,
        capacity: capacity || 4,
        qrCodeUrl
    });

    return table;
}

/**
 * List all tables for a restaurant.
 */
export async function listTables(restaurantId) {
    const rId = new mongoose.Types.ObjectId(restaurantId);
    return await FoodRestaurantTable.find({ restaurantId: rId }).sort({ tableNumber: 1 }).lean();
}
