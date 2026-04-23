import mongoose from 'mongoose';
import { FoodRestaurantTable } from '../models/restaurantTable.model.js';
import { FoodTableSession } from '../models/tableSession.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodDineInOrder } from '../models/dineInOrder.model.js';
import { FoodTableBooking } from '../models/tableBooking.model.js';
import { FoodDiningRestaurantCommission } from '../../admin/models/diningRestaurantCommission.model.js';
import { FoodDiningFeeSettings } from '../../admin/models/diningFeeSettings.model.js';
import { getIO, rooms } from '../../../../config/socket.js';
import { findAcceptedBooking, linkBookingToSession } from './tableBooking.service.js';
import { getBestApplicableDiningOffer, getDisplayDiningOfferForRestaurant } from './diningOffer.service.js';
import { creditWallet, debitWallet } from '../../../../core/payments/wallet.service.js';
import { Transaction } from '../../../../core/payments/models/transaction.model.js';
import { calculateWalletSettlement, deriveFundingType } from '../../orders/services/settlement-calculator.service.js';
import {
    createRazorpayOrder,
    getRazorpayKeyId,
    isRazorpayConfigured,
    verifyPaymentSignature,
} from '../../orders/helpers/razorpay.helper.js';
import { upsertDiningTransactionSnapshot } from './diningTransactionSnapshot.service.js';

const roundMoney = (value) => Number((Number(value) || 0).toFixed(2));
// Half-up rupee rounding:
// 19.0 -> 19, 19.5 -> 20, 19.9 -> 20
const roundStandard = (value) => {
    const n = Number(value) || 0;
    return Math.round(n + Number.EPSILON);
};
const createHttpError = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const getOwnedSessionForUser = async (sessionId, userId) => {
    if (!mongoose.Types.ObjectId.isValid(String(sessionId || ''))) {
        throw createHttpError('Invalid session id', 400);
    }

    const session = await FoodTableSession.findById(sessionId);
    if (!session) throw createHttpError('Session not found', 404);
    if (String(session.userId) !== String(userId)) {
        throw createHttpError('Unauthorized to access this session', 403);
    }
    return session;
};

const normalizeDineInOrderItems = (items = []) => {
    if (!Array.isArray(items) || items.length === 0) {
        throw createHttpError('At least one valid item is required to place an order', 400);
    }

    return items.map((item, index) => {
        const rawItemId = item?.itemId || item?._id || item?.id;
        const itemId = String(rawItemId || '').trim();
        if (!mongoose.Types.ObjectId.isValid(itemId)) {
            throw createHttpError(`Invalid itemId at position ${index + 1}`, 400);
        }

        const name = String(item?.name || '').trim();
        if (!name) {
            throw createHttpError(`Item name is required at position ${index + 1}`, 400);
        }

        const price = Number(item?.price);
        if (!Number.isFinite(price) || price < 0) {
            throw createHttpError(`Invalid item price at position ${index + 1}`, 400);
        }

        const quantity = Number(item?.quantity);
        if (!Number.isInteger(quantity) || quantity < 1) {
            throw createHttpError(`Invalid item quantity at position ${index + 1}`, 400);
        }

        return {
            itemId,
            name,
            price: roundMoney(price),
            quantity,
            isVeg: Boolean(item?.isVeg),
            notes: String(item?.notes || '').trim(),
        };
    });
};

const getCommissionConfig = async (restaurantId) => {
    const commissionDoc = await FoodDiningRestaurantCommission.findOne({
        restaurantId,
        status: { $ne: false },
    }).lean();

    return {
        type: commissionDoc?.defaultCommission?.type || 'percentage',
        value: Number(commissionDoc?.defaultCommission?.value || 0) || 0,
    };
};

const calculateCommissionAmount = (commissionConfig, baseAmount) => {
    const base = roundMoney(baseAmount);
    if (base <= 0) return 0;
    if (commissionConfig.type === 'amount') {
        return roundStandard(Math.min(base, commissionConfig.value));
    }
    return roundStandard((base * commissionConfig.value) / 100);
};

const getFeeSettings = async () => {
    const feeDoc = await FoodDiningFeeSettings.findOne({ isActive: true })
        .sort({ createdAt: -1 })
        .lean();

    return feeDoc || {
        platformFee: 0,
        gstRate: 0,
    };
};

const buildBillingSnapshot = async (session) => {
    const subtotal = roundMoney(session?.subtotal || 0);
    const feeSettings = await getFeeSettings();
    const gstRate = Number(feeSettings?.gstRate || 0);
    const taxAmount = roundStandard((subtotal * gstRate) / 100);
    const platformFee = roundStandard(feeSettings?.platformFee || 0);
    const grossTotalAmount = roundMoney(subtotal + platformFee + taxAmount);
    const applicableOffer = await getBestApplicableDiningOffer({
        restaurantId: session.restaurantId,
        subtotal,
    });
    const offerDiscount = roundMoney(applicableOffer?.discountAmount || 0);
    const payableSubtotal = roundMoney(Math.max(0, subtotal - offerDiscount));
    const totalAmount = roundMoney(Math.max(0, payableSubtotal + platformFee + taxAmount));
    const commissionConfig = await getCommissionConfig(session.restaurantId);
    const commissionBaseAmount = applicableOffer?.fundedBy === 'restaurant' ? payableSubtotal : subtotal;
    const restaurantCommission = calculateCommissionAmount(commissionConfig, commissionBaseAmount);
    const restaurantPayout =
        applicableOffer?.fundedBy === 'restaurant'
            ? roundMoney(Math.max(0, payableSubtotal - restaurantCommission))
            : roundMoney(Math.max(0, subtotal - restaurantCommission));

    return {
        appliedOffer: applicableOffer
            ? {
                  id: applicableOffer._id,
                  title: applicableOffer.title,
                  fundedBy: applicableOffer.fundedBy,
                  fundingType: deriveFundingType(applicableOffer.fundedBy, {
                      platformOverallOfferDiscount: applicableOffer?.fundedBy === 'platform' ? offerDiscount : 0,
                      restaurantOverallOfferDiscount: applicableOffer?.fundedBy === 'restaurant' ? offerDiscount : 0,
                  }),
                  createdByRole: applicableOffer.createdByRole,
                  discountType: applicableOffer.discountType,
                  discountValue: applicableOffer.discountValue,
                  discountAmount: offerDiscount,
                  minBillAmount: applicableOffer.minBillAmount || 0,
              }
            : null,
        summary: {
            subtotal,
            gstRate,
            platformFee,
            taxAmount,
            grossTotalAmount,
            offerDiscount,
            totalAmount,
        },
        pricing: {
            commissionType: commissionConfig.type,
            commissionRate: commissionConfig.value,
            commissionBaseAmount: roundMoney(commissionBaseAmount),
            restaurantCommission,
            restaurantPayout,
            platformOverallOfferDiscount: applicableOffer?.fundedBy === 'platform' ? offerDiscount : 0,
            restaurantOverallOfferDiscount: applicableOffer?.fundedBy === 'restaurant' ? offerDiscount : 0,
            fundingType: deriveFundingType(applicableOffer?.fundedBy, {
                platformOverallOfferDiscount: applicableOffer?.fundedBy === 'platform' ? offerDiscount : 0,
                restaurantOverallOfferDiscount: applicableOffer?.fundedBy === 'restaurant' ? offerDiscount : 0,
            }),
        },
    };
};

const ensureDiningOnlinePayoutCredited = async (session, billingSnapshot, existingSettlement = null, paymentMethod = '') => {
    const payoutAmount = Number(billingSnapshot?.pricing?.restaurantPayout || 0);
    const normalizedPaymentMethod = String(paymentMethod || '').trim().toLowerCase();

    if (payoutAmount <= 0.009) {
        return {
            ...(existingSettlement || {}),
            restaurantOnlinePayoutCredited: true,
            restaurantOnlinePayoutAmount: 0,
            restaurantOnlinePayoutCreditedAt: new Date(),
        };
    }

    const sessionId = String(session?._id || '');
    const existingCreditTxn = await Transaction.findOne({
        entityType: 'restaurant',
        entityId: session.restaurantId,
        type: 'credit',
        'metadata.settlementType': 'DINING_ONLINE_PAYOUT',
        'metadata.sessionId': sessionId,
    })
        .select('_id amount createdAt')
        .lean();

    if (!existingCreditTxn) {
        await creditWallet({
            entityType: 'restaurant',
            entityId: String(session.restaurantId),
            amount: payoutAmount,
            description: `Dining session ${sessionId} online payout`,
            category: 'settlement_payout',
            metadata: {
                settlementType: 'DINING_ONLINE_PAYOUT',
                sessionId,
                paymentMethod: normalizedPaymentMethod || 'online',
                restaurantPayout: payoutAmount,
            },
        });
    }

    return {
        ...(existingSettlement || {}),
        restaurantOnlinePayoutCredited: true,
        restaurantOnlinePayoutAmount: payoutAmount,
        restaurantOnlinePayoutCreditedAt: existingCreditTxn?.createdAt || new Date(),
    };
};

const applyWalletSettlementForDiningSession = async (session, billingSnapshot, paymentMode, paymentMethod) => {
    const existing = session?.billingSnapshot?.walletSettlement;
    if (existing?.applied === true) {
        if (!existing?.isCodLike && existing?.paymentMode === 'online' && existing?.restaurantOnlinePayoutCredited !== true) {
            const updatedSettlement = await ensureDiningOnlinePayoutCredited(
                session,
                billingSnapshot,
                existing,
                paymentMethod,
            );
            return {
                ...existing,
                ...updatedSettlement,
            };
        }
        return existing;
    }

    const settlement = calculateWalletSettlement({
        paymentMode,
        pricing: {
            total: Number(billingSnapshot?.summary?.totalAmount || 0),
            tax: Number(billingSnapshot?.summary?.taxAmount || 0),
            platformFee: Number(billingSnapshot?.summary?.platformFee || 0),
            deliveryFee: 0,
            platformOverallOfferDiscount: Number(billingSnapshot?.pricing?.platformOverallOfferDiscount || 0),
            restaurantOverallOfferDiscount: Number(billingSnapshot?.pricing?.restaurantOverallOfferDiscount || 0),
            fundedBy: billingSnapshot?.appliedOffer?.fundedBy,
            payoutAdjustments: {
                commission: Number(billingSnapshot?.pricing?.restaurantCommission || 0),
                netPayout: Number(billingSnapshot?.pricing?.restaurantPayout || 0),
            },
        },
        restaurantShouldRetain: Number(billingSnapshot?.pricing?.restaurantPayout || 0),
        customerCashCollected:
            String(paymentMode || '').toLowerCase() === 'counter'
                ? Number(billingSnapshot?.summary?.totalAmount || 0)
                : 0,
    });

    const walletNetAdjustment = Number(settlement.walletNetAdjustment || 0);
    const adjustmentAmount = Math.abs(walletNetAdjustment);
    if (settlement.isCodLike && adjustmentAmount > 0.009) {
        const walletPayload = {
            entityType: 'restaurant',
            entityId: String(session.restaurantId),
            amount: adjustmentAmount,
            description: `Dining session ${String(session._id)} counter settlement adjustment`,
            category: 'adjustment',
            allowNegative: true,
            metadata: {
                settlementType: 'DINING_COUNTER_WALLET_ADJUSTMENT',
                sessionId: String(session._id),
                paymentMethod: paymentMethod || '',
                walletNetAdjustment,
                adminChargesRecoverable: settlement.adminChargesRecoverable,
                platformDiscountCompensation: settlement.platformDiscountCompensation,
            },
        };
        if (walletNetAdjustment > 0) {
            await creditWallet(walletPayload);
        } else {
            await debitWallet(walletPayload);
        }
    }

    let onlinePayoutState = {};
    if (!settlement.isCodLike) {
        onlinePayoutState = await ensureDiningOnlinePayoutCredited(
            session,
            billingSnapshot,
            null,
            paymentMethod,
        );
    }

    return {
        applied: true,
        appliedAt: new Date(),
        paymentMode: settlement.paymentMode,
        isCodLike: settlement.isCodLike,
        fundingType: settlement.fundingType,
        restaurantShouldRetain: settlement.restaurantShouldRetain,
        customerCashCollected: settlement.customerCashCollected,
        adminChargesRecoverable: settlement.adminChargesRecoverable,
        adminChargesRecoverableBreakdown: settlement.adminChargesRecoverableBreakdown,
        diningBreakdown: {
            commission: Number(settlement.adminChargesRecoverableBreakdown?.commission || 0),
            platformFee: Number(settlement.adminChargesRecoverableBreakdown?.platformFee || 0),
            gst: Number(settlement.adminChargesRecoverableBreakdown?.tax || 0),
            total: Number(settlement.adminChargesRecoverableBreakdown?.total || 0),
        },
        platformDiscountCompensation: settlement.platformDiscountCompensation,
        walletNetAdjustment: settlement.walletNetAdjustment,
        settlementApplied: true,
        note: settlement.isCodLike
            ? 'Counter/COD settlement applied'
            : 'Online payout credited to wallet.',
        ...onlinePayoutState,
    };
};

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
    if (!mongoose.Types.ObjectId.isValid(String(sessionId || ''))) {
        throw createHttpError('Invalid Session ID', 400);
    }

    const session = await FoodTableSession.findById(sessionId)
        .populate('orders')
        .populate('userId', 'name phone email')
        .lean();

    if (!session) {
        throw createHttpError('Session not found', 404);
    }

    return session;
}

/**
 * Place a new order round in a session.
 */
export async function placeOrder(sessionId, userId, orderData) {
    if (!mongoose.Types.ObjectId.isValid(String(sessionId || ''))) {
        throw createHttpError('Invalid session id', 400);
    }

    const session = await FoodTableSession.findById(sessionId);
    if (!session) throw createHttpError('Session not found', 404);

    if (session.status !== 'active') {
        throw createHttpError('This session is no longer active and cannot accept new orders', 409);
    }

    // Block new orders if bill has been finalized for settlement.
    if (
        session.isBillFinalized === true ||
        session.status === 'bill_requested' ||
        (session.paymentMode === 'COUNTER' && session.paymentStatus === 'PENDING')
    ) {
        throw createHttpError('Bill is finalized. No new orders can be placed after requesting counter payment.', 409);
    }

    if (String(session.userId) !== String(userId)) {
        throw createHttpError('Unauthorized to place order for this session', 403);
    }

    const normalizedItems = normalizeDineInOrderItems(orderData?.items);

    // 1. Calculate round number
    const roundNumber = (Array.isArray(session.orders) ? session.orders.length : 0) + 1;

    // 2. Create Order
    const order = new FoodDineInOrder({
        sessionId: session._id,
        restaurantId: session.restaurantId,
        tableNumber: session.tableNumber,
        items: normalizedItems,
        roundNumber,
        specialRequest: String(orderData?.specialRequest || '').trim(),
        status: 'received'
    });

    try {
        await order.save();
    } catch (error) {
        if (error?.name === 'ValidationError' || error?.name === 'CastError') {
            throw createHttpError(error.message || 'Invalid order payload', 400);
        }
        throw error;
    }

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
    session.subtotal = roundMoney(subtotal);

    // Keep live session totals in sync with final-bill calculation:
    // platform fee + GST + dining offer discount.
    const billingSnapshot = await buildBillingSnapshot(session);
    session.taxAmount = roundMoney(Number(billingSnapshot?.summary?.taxAmount || 0));
    session.totalAmount = roundMoney(Number(billingSnapshot?.summary?.totalAmount || 0));
    session.billingSnapshot = billingSnapshot;
    session.markModified('billingSnapshot');

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

    const billingSnapshot =
        session?.billingSnapshot && session?.isBillFinalized
            ? session.billingSnapshot
            : await buildBillingSnapshot(session);

    return {
        sessionId: session._id,
        restaurantId: session.restaurantId,
        tableNumber: session.tableNumber,
        itemized: Object.values(itemMap),
        summary: billingSnapshot.summary,
        appliedOffer: billingSnapshot.appliedOffer,
        pricing: billingSnapshot.pricing,
        settlement: billingSnapshot.walletSettlement
            ? {
                  adminChargesRecoverable: Number(billingSnapshot.walletSettlement.adminChargesRecoverable || 0),
                  adminChargesRecoverableBreakdown: billingSnapshot.walletSettlement.adminChargesRecoverableBreakdown || {
                      commission: 0,
                      platformFee: 0,
                      tax: 0,
                      deliveryFee: 0,
                      total: 0,
                  },
                  platformDiscountCompensation: Number(billingSnapshot.walletSettlement.platformDiscountCompensation || 0),
                  walletNetAdjustment: Number(billingSnapshot.walletSettlement.walletNetAdjustment || 0),
                  settlementApplied: billingSnapshot.walletSettlement.settlementApplied === true,
              }
            : {
                  adminChargesRecoverable: 0,
                  adminChargesRecoverableBreakdown: {
                      commission: 0,
                      platformFee: 0,
                      tax: 0,
                      deliveryFee: 0,
                      total: 0,
                  },
                  platformDiscountCompensation: 0,
                  walletNetAdjustment: 0,
                  settlementApplied: false,
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
    const session = await getOwnedSessionForUser(sessionId, userId);
    if (session.status === 'completed') throw new Error('Session already completed');
    if (session.paymentMode === 'COUNTER' && session.paymentStatus === 'PENDING') {
        return session; // Already requested, idempotent
    }

    const billingSnapshot = await buildBillingSnapshot(session);
    session.paymentMode = 'COUNTER';
    session.paymentStatus = 'PENDING';
    session.status = 'bill_requested';
    session.isBillFinalized = true;
    session.paymentRequestedAt = new Date();
    session.billingSnapshot = billingSnapshot;
    await session.save();

    // Emit socket event to restaurant
    try {
        const io = getIO();
        if (io) {
            io.to(rooms.restaurant(session.restaurantId)).emit('payment_pending', {
                sessionId: String(session._id),
                tableNumber: session.tableNumber,
                totalAmount: billingSnapshot.summary.totalAmount,
                restaurantId: String(session.restaurantId),
                requestedAt: session.paymentRequestedAt.toISOString(),
            });
        }
    } catch { /* non-blocking */ }

    return session;
}

export async function initiateOnlinePayment(sessionId, userId) {
    const session = await getOwnedSessionForUser(sessionId, userId);

    if (session.status === 'completed' || session.isPaid === true) {
        throw createHttpError('Session is already paid', 409);
    }
    if (session.paymentMode === 'COUNTER' && session.paymentStatus === 'PENDING') {
        throw createHttpError('Counter payment already requested. Please complete payment at restaurant counter.', 409);
    }
    if (!isRazorpayConfigured()) {
        throw createHttpError('Payment gateway is not configured', 503);
    }

    const billingSnapshot =
        session?.billingSnapshot && session?.isBillFinalized
            ? session.billingSnapshot
            : await buildBillingSnapshot(session);

    const totalAmount = Number(billingSnapshot?.summary?.totalAmount || 0);
    const amountPaise = Math.round(totalAmount * 100);
    if (!Number.isFinite(amountPaise) || amountPaise < 100) {
        throw createHttpError('Amount too low for online payment', 400);
    }

    let razorpayOrder;
    try {
        razorpayOrder = await createRazorpayOrder(amountPaise, 'INR', `dinein_${String(session._id).slice(-10)}`);
    } catch (error) {
        throw createHttpError(error?.message || 'Payment gateway error', 400);
    }

    session.paymentMode = 'ONLINE';
    session.paymentStatus = 'PENDING';
    session.isBillFinalized = true;
    session.paymentRequestedAt = new Date();
    session.billingSnapshot = {
        ...billingSnapshot,
        razorpay: {
            orderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency || 'INR',
        },
    };
    await session.save();

    return {
        session: {
            _id: session._id,
            tableNumber: session.tableNumber,
        },
        razorpay: {
            key: getRazorpayKeyId(),
            orderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency || 'INR',
        },
        summary: billingSnapshot.summary,
    };
}

export async function verifyOnlinePayment(sessionId, userId, payload = {}) {
    const session = await getOwnedSessionForUser(sessionId, userId);

    if (session.status === 'completed' || session.isPaid === true) {
        return session;
    }

    const billingSnapshot = session?.billingSnapshot || {};
    const storedOrderId = String(billingSnapshot?.razorpay?.orderId || '').trim();
    const razorpayOrderId = String(payload?.razorpayOrderId || '').trim();
    const razorpayPaymentId = String(payload?.razorpayPaymentId || '').trim();
    const razorpaySignature = String(payload?.razorpaySignature || '').trim();

    if (!storedOrderId || storedOrderId !== razorpayOrderId) {
        throw createHttpError('Invalid payment order reference', 400);
    }
    if (!razorpayPaymentId || !razorpaySignature) {
        throw createHttpError('Payment verification details are required', 400);
    }

    const valid = verifyPaymentSignature(
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
    );
    if (!valid) {
        throw createHttpError('Payment verification failed', 400);
    }

    session.paymentMode = 'ONLINE';
    session.paymentStatus = 'PAID';
    session.billingSnapshot = {
        ...billingSnapshot,
        razorpay: {
            ...(billingSnapshot?.razorpay || {}),
            orderId: razorpayOrderId,
            paymentId: razorpayPaymentId,
            signature: razorpaySignature,
            verifiedAt: new Date(),
        },
    };
    await session.save();

    return closeSession(sessionId, { paymentMethod: 'online' });
}

/**
 * Restaurant marks counter payment as paid — closes session and frees table.
 */
export async function markCounterPaid(sessionId) {
    if (!mongoose.Types.ObjectId.isValid(String(sessionId || ''))) {
        throw createHttpError('Invalid session id', 400);
    }

    const session = await FoodTableSession.findById(sessionId);
    if (!session) throw createHttpError('Session not found', 404);
    if (session.status === 'completed') return session;
    if (session.paymentMode !== 'COUNTER' || session.paymentStatus !== 'PENDING') {
        throw createHttpError('No pending counter payment found for this session', 409);
    }

    session.paymentStatus = 'PAID';
    session.isBillFinalized = true;
    await session.save();

    // Close the session via existing closeSession logic
    return closeSession(sessionId, { paymentMethod: 'counter' });
}

export async function cancelEmptySession(sessionId, userId, reason) {
    if (!mongoose.Types.ObjectId.isValid(String(sessionId || ''))) {
        throw createHttpError('Invalid session id', 400);
    }

    const normalizedReason = String(reason || '').trim();
    if (!normalizedReason) {
        throw createHttpError('Reason is required to close the session', 400);
    }

    const session = await FoodTableSession.findById(sessionId);
    if (!session) throw createHttpError('Session not found', 404);

    if (String(session.userId) !== String(userId)) {
        throw createHttpError('Unauthorized to close this session', 403);
    }

    if (session.status !== 'active') {
        throw createHttpError('Only active empty sessions can be closed', 409);
    }

    if (session.isPaid || session.isBillFinalized) {
        throw createHttpError('This session is already in billing flow and cannot be closed this way', 409);
    }

    const existingOrderCount = await FoodDineInOrder.countDocuments({ sessionId: session._id });
    if (existingOrderCount > 0 || (Array.isArray(session.orders) && session.orders.length > 0)) {
        throw createHttpError('Session cannot be closed after placing an order', 409);
    }

    const now = new Date();
    session.status = 'completed';
    session.closedAt = now;
    session.closedByRole = 'USER';
    session.closureType = 'EMPTY_CANCELLED';
    session.closeReason = normalizedReason;
    session.notes = normalizedReason;
    await session.save();

    const tableReleaseFilter = session.tableId
        ? { _id: session.tableId }
        : {
              $or: [
                  { currentSessionId: session._id },
                  {
                      restaurantId: session.restaurantId,
                      tableNumber: String(session.tableNumber || '').trim(),
                  },
              ],
          };
    await FoodRestaurantTable.updateMany(tableReleaseFilter, { currentSessionId: null });

    try {
        const io = getIO();
        if (io) {
            io.to(rooms.restaurant(session.restaurantId)).emit('dine_in_session_closed', {
                sessionId: session._id?.toString?.() || String(session._id),
                restaurantId: session.restaurantId?.toString?.() || String(session.restaurantId),
                tableNumber: String(session.tableNumber || ''),
                status: 'completed',
                closeReason: normalizedReason,
                closureType: 'EMPTY_CANCELLED',
                closedByRole: 'USER',
                closedAt: now.toISOString(),
            });
        }
    } catch {
        // ignore
    }

    return session;
}

/**
 * Mark session as closed and release the table.
 */
export async function closeSession(sessionId, paymentData) {
    if (!mongoose.Types.ObjectId.isValid(String(sessionId || ''))) {
        throw createHttpError('Invalid session id', 400);
    }

    const session = await FoodTableSession.findById(sessionId);
    if (!session) throw createHttpError('Session not found', 404);

    if (session.status === 'completed') {
        throw createHttpError('Session is already completed', 409);
    }

    // Prevent switching to online after selecting "Pay at Counter".
    const requestedMethod = String(paymentData?.paymentMethod || '').toLowerCase();
    const counterPending = session.paymentMode === 'COUNTER' && session.paymentStatus === 'PENDING';
    const isCounterSettlement = ['counter', 'cash'].includes(requestedMethod);
    if (counterPending && !isCounterSettlement) {
        throw createHttpError('Counter payment already requested. Please complete payment at restaurant counter.', 409);
    }

    const now = new Date();
    const billingSnapshot = await buildBillingSnapshot(session);
    const settlementPaymentMode = session.paymentMode === 'COUNTER' ? 'counter' : 'online';
    let walletSettlement = null;
    try {
        walletSettlement = await applyWalletSettlementForDiningSession(
            session,
            billingSnapshot,
            settlementPaymentMode,
            paymentData?.paymentMethod || '',
        );
    } catch (error) {
        // Non-blocking: payment close must not fail due wallet sync issues.
        walletSettlement = {
            applied: false,
            appliedAt: new Date(),
            paymentMode: settlementPaymentMode,
            fundingType: 'unknown',
            restaurantShouldRetain: Number(billingSnapshot?.pricing?.restaurantPayout || 0),
            customerCashCollected: settlementPaymentMode === 'counter'
                ? Number(billingSnapshot?.summary?.totalAmount || 0)
                : 0,
            adminChargesRecoverable: 0,
            adminChargesRecoverableBreakdown: {
                commission: 0,
                platformFee: 0,
                tax: 0,
                deliveryFee: 0,
                total: 0,
            },
            platformDiscountCompensation: 0,
            walletNetAdjustment: 0,
            settlementApplied: false,
            note: `Wallet settlement skipped: ${error?.message || 'unknown error'}`,
        };
    }
    billingSnapshot.walletSettlement = walletSettlement;

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
    session.closedByRole = 'USER';
    session.closureType = 'PAID';
    if (session.paymentMode === 'COUNTER') {
        session.paymentStatus = 'PAID';
        session.closedByRole = 'RESTAURANT';
    }
    session.isBillFinalized = true;
    session.billingSnapshot = billingSnapshot;
    session.paidAt = now;
    session.closedAt = now;
    await session.save();

    // 2. Release Table
    // Prefer deterministic table linkage; fall back to restaurantId + tableNumber for legacy rows.
    const tableReleaseFilter = session.tableId
        ? { _id: session.tableId }
        : {
              $or: [
                  { currentSessionId: session._id },
                  {
                      restaurantId: session.restaurantId,
                      tableNumber: String(session.tableNumber || '').trim(),
                  },
              ],
          };
    await FoodRestaurantTable.updateMany(tableReleaseFilter, { currentSessionId: null });

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
                closeReason: session.closeReason || '',
                closureType: session.closureType || 'PAID',
                closedByRole: session.closedByRole || '',
                paidAt: now.toISOString(),
            });
        }
    } catch {
        // ignore
    }

    // 5. Persist immutable admin/report transaction snapshot (non-blocking).
    try {
        await upsertDiningTransactionSnapshot(session._id);
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
    const tables = await FoodRestaurantTable.find({ restaurantId: rId }).sort({ tableNumber: 1 }).lean();

    const sessionIds = tables
        .map((table) => table?.currentSessionId)
        .filter((value) => mongoose.Types.ObjectId.isValid(String(value || '')))
        .map((value) => new mongoose.Types.ObjectId(String(value)));

    if (!sessionIds.length) {
        return tables;
    }

    const sessions = await FoodTableSession.find({ _id: { $in: sessionIds } })
        .select('_id status')
        .lean();
    const sessionMap = new Map(sessions.map((session) => [String(session._id), session]));

    const staleTableIds = [];
    const normalizedTables = tables.map((table) => {
        const currentSessionId = table?.currentSessionId ? String(table.currentSessionId) : '';
        if (!currentSessionId) return table;

        const currentSession = sessionMap.get(currentSessionId);
        const status = String(currentSession?.status || '').toLowerCase();
        const isActiveSession = status === 'active' || status === 'bill_requested';

        if (isActiveSession) {
            return table;
        }

        staleTableIds.push(table._id);
        return {
            ...table,
            currentSessionId: null,
        };
    });

    if (staleTableIds.length) {
        await FoodRestaurantTable.updateMany(
            { _id: { $in: staleTableIds } },
            { currentSessionId: null }
        );
    }

    return normalizedTables;
}

export async function listRestaurantSessions(restaurantId, filters = {}) {
    const normalizedRestaurantId = String(restaurantId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(normalizedRestaurantId)) {
        throw createHttpError('Invalid restaurant id', 400);
    }

    const statusFilter = String(filters?.status || '').trim().toLowerCase();
    const query = {
        restaurantId: new mongoose.Types.ObjectId(normalizedRestaurantId),
    };

    if (statusFilter) {
        query.status = statusFilter;
    }

    const limit = Math.min(Math.max(Number(filters?.limit) || 50, 1), 200);

    return FoodTableSession.find(query)
        .populate('orders')
        .populate('userId', 'name phone email')
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(limit)
        .lean();
}

export async function getRestaurantDiningOfferPreview(restaurantId) {
    const offer = await getDisplayDiningOfferForRestaurant(restaurantId);
    return { offer };
}
