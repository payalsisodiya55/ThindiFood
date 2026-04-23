import mongoose from 'mongoose';
import { FoodDineInOrder } from '../models/dineInOrder.model.js';
import { FoodTableSession } from '../models/tableSession.model.js';
import { FoodDiningTransaction } from '../models/diningTransaction.model.js';

const toMoney = (value) => Number((Number(value) || 0).toFixed(2));

const normalizePaymentType = (session) => {
    const method = String(session?.paymentMethod || '').trim().toLowerCase();
    const mode = String(session?.paymentMode || '').trim().toLowerCase();
    if (mode === 'counter' || method === 'counter' || method === 'cash') return 'cod';
    return 'online';
};

const deriveOrderType = (session) => (session?.bookingId ? 'pre-book' : 'walk-in');

const mapSessionStatus = (session) => {
    if (session?.isPaid === true) return 'paid';
    const paymentStatus = String(session?.paymentStatus || '').trim().toLowerCase();
    if (paymentStatus) return paymentStatus;
    const status = String(session?.status || '').trim().toLowerCase();
    return status || 'paid';
};

const buildReadableOrderId = (sessionId) => `DIN-${String(sessionId || '').slice(-8).toUpperCase()}`;

const computeFinancials = (session) => {
    const snapshot = session?.billingSnapshot || {};
    const summary = snapshot?.summary || {};
    const pricing = snapshot?.pricing || {};
    const walletSettlement = snapshot?.walletSettlement || {};
    const adminBreakdown = walletSettlement?.adminChargesRecoverableBreakdown || {};
    const diningBreakdown = walletSettlement?.diningBreakdown || {};

    const subtotal = toMoney(summary?.subtotal ?? session?.subtotal ?? 0);
    const discount = toMoney(summary?.offerDiscount ?? 0);
    const finalAmount = toMoney(summary?.totalAmount ?? session?.totalAmount ?? 0);
    const commission = toMoney(
        pricing?.restaurantCommission ??
            adminBreakdown?.commission ??
            diningBreakdown?.commission ??
            0
    );
    const gst = toMoney(summary?.taxAmount ?? adminBreakdown?.tax ?? diningBreakdown?.gst ?? 0);
    const platformFee = toMoney(summary?.platformFee ?? adminBreakdown?.platformFee ?? diningBreakdown?.platformFee ?? 0);
    const restaurantEarning = toMoney(pricing?.restaurantPayout ?? Math.max(0, subtotal - commission));
    const paymentType = normalizePaymentType(session);
    const codDue = paymentType === 'cod'
        ? toMoney(walletSettlement?.adminChargesRecoverable ?? adminBreakdown?.total ?? diningBreakdown?.total ?? (commission + gst + platformFee))
        : 0;
    const adminEarning = toMoney(commission + gst + platformFee);

    return {
        subtotal,
        discount,
        finalAmount,
        commission,
        gst,
        platformFee,
        adminEarning,
        restaurantEarning,
        codDue,
    };
};

const flattenItems = (orders = []) => {
    const items = [];
    for (const order of orders) {
        const orderItems = Array.isArray(order?.items) ? order.items : [];
        for (const item of orderItems) {
            const quantity = Number(item?.quantity || 0);
            const price = Number(item?.price || 0);
            items.push({
                name: String(item?.name || '').trim(),
                quantity,
                price: toMoney(price),
                total: toMoney(quantity * price),
                status: String(item?.status || order?.status || '').trim(),
            });
        }
    }
    return items;
};

const fetchSessionWithRefs = async (sessionOrId) => {
    if (sessionOrId && typeof sessionOrId === 'object' && sessionOrId._id) {
        return sessionOrId;
    }

    if (!mongoose.Types.ObjectId.isValid(String(sessionOrId || ''))) return null;
    return FoodTableSession.findById(sessionOrId)
        .populate('restaurantId', 'restaurantName')
        .populate('userId', 'name phone')
        .populate('bookingId', 'bookingId')
        .lean();
};

export async function upsertDiningTransactionSnapshot(sessionOrId) {
    const session = await fetchSessionWithRefs(sessionOrId);
    if (!session?._id) return null;
    if (String(session?.status || '').toLowerCase() !== 'completed' || session?.isPaid !== true) {
        return null;
    }

    const orders = await FoodDineInOrder.find({ sessionId: session._id })
        .sort({ createdAt: 1 })
        .lean();
    const items = flattenItems(orders);
    const orderRefs = orders.map((order) => order._id).filter(Boolean);
    const financials = computeFinancials(session);

    const payload = {
        orderId: buildReadableOrderId(session._id),
        sessionId: session._id,
        restaurantId: session.restaurantId?._id || session.restaurantId,
        userId: session.userId?._id || session.userId || null,
        bookingId: session.bookingId?._id || session.bookingId || null,
        restaurantName: String(session.restaurantId?.restaurantName || '').trim(),
        userName: String(session.userId?.name || '').trim(),
        userPhone: String(session.userId?.phone || '').trim(),
        tableNo: String(session.tableNumber || '').trim(),
        orderType: deriveOrderType(session),
        paymentType: normalizePaymentType(session),
        status: mapSessionStatus(session),
        ...financials,
        itemCount: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
        items,
        orderRefs,
        paidAt: session.paidAt || session.closedAt || session.updatedAt || session.createdAt || new Date(),
    };

    await FoodDiningTransaction.updateOne(
        { sessionId: session._id },
        { $set: payload },
        { upsert: true }
    );

    return payload;
}

export async function backfillDiningTransactionSnapshots(filter = {}) {
    const query = {
        status: 'completed',
        isPaid: true,
    };
    if (filter?.restaurantId && mongoose.Types.ObjectId.isValid(String(filter.restaurantId))) {
        query.restaurantId = new mongoose.Types.ObjectId(String(filter.restaurantId));
    }
    if (filter?.fromDate || filter?.toDate) {
        const paidAt = {};
        if (filter?.fromDate) {
            const from = new Date(filter.fromDate);
            if (!Number.isNaN(from.getTime())) paidAt.$gte = from;
        }
        if (filter?.toDate) {
            const to = new Date(filter.toDate);
            if (!Number.isNaN(to.getTime())) paidAt.$lte = to;
        }
        if (Object.keys(paidAt).length > 0) {
            query.$or = [
                { paidAt },
                { closedAt: paidAt },
                { updatedAt: paidAt },
                { createdAt: paidAt },
            ];
        }
    }

    const sessions = await FoodTableSession.find(query)
        .select('_id')
        .sort({ updatedAt: -1 })
        .limit(3000)
        .lean();

    for (const session of sessions) {
        await upsertDiningTransactionSnapshot(session._id);
    }
}
