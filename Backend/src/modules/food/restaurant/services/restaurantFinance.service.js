import mongoose from 'mongoose';
import { FoodTransaction } from '../../orders/models/foodTransaction.model.js';
import { FoodRestaurant } from '../models/restaurant.model.js';
import { FoodRestaurantWithdrawal } from '../models/foodRestaurantWithdrawal.model.js';
import { FoodTableSession } from '../../dineIn/models/tableSession.model.js';
import { getWalletBalance } from '../../../../core/payments/wallet.service.js';
import { creditWallet } from '../../../../core/payments/wallet.service.js';
import { Transaction } from '../../../../core/payments/models/transaction.model.js';

const COD_LIKE_METHODS = new Set(['cash', 'razorpay_qr', 'counter']);

function toTwoDigitYearString(dateObj) {
    const y = String(dateObj.getFullYear());
    return y.slice(-2);
}

function monthShort(monthIndex) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[monthIndex] || 'Jan';
}

function getFixedCurrentCycleWindow(now = new Date()) {
    const startDay = 15;

    let year = now.getFullYear();
    let month = now.getMonth();

    if (now.getDate() < startDay) {
        month -= 1;
        if (month < 0) {
            month = 11;
            year -= 1;
        }
    }

    const start = new Date(year, month, startDay, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    return {
        start,
        end,
        startMeta: { day: String(startDay), month: monthShort(month), year: toTwoDigitYearString(new Date(year, month, startDay)) },
        endMeta: { day: String(now.getDate()), month: monthShort(now.getMonth()), year: toTwoDigitYearString(now) }
    };
}

function parseISODateParam(v) {
    if (!v) return null;
    const s = String(v).trim();
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
}

function parseISODateParamEnd(v) {
    if (!v) return null;
    const s = String(v).trim();
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(23, 59, 59, 999);
    return d;
}

function toMoney(v) {
    const n = Number(v || 0);
    return Number.isFinite(n) ? n : 0;
}

function normalizePaymentMethod(tx, order = {}) {
    return String(
        tx?.payment?.method ||
        tx?.paymentMethod ||
        order?.payment?.method ||
        ''
    ).trim().toLowerCase();
}

function isCodLike(tx, order = {}) {
    return COD_LIKE_METHODS.has(normalizePaymentMethod(tx, order));
}

function resolveWalletImpact(tx, order = {}) {
    const settlement = tx?.settlement?.walletSettlement || {};
    if (isCodLike(tx, order)) {
        if (settlement.applied === true) return toMoney(settlement.walletNetAdjustment);
        return 0;
    }
    const pricing = tx?.pricing || order?.pricing || {};
    return toMoney(tx?.amounts?.restaurantShare ?? pricing?.payoutAdjustments?.netPayout ?? 0);
}

function mapFinanceOrder(tx) {
    const order = tx.orderId || {};
    const items = Array.isArray(order.items) ? order.items : [];
    const foodNames = items.map((it) => it?.name).filter(Boolean).join(', ');
    const pricing = tx.pricing || order.pricing || {};
    const payoutAdjustments = pricing.payoutAdjustments || {};
    const walletSettlement = tx.settlement?.walletSettlement || {};
    const orderTotalExclTax = Math.max(
        0,
        Number(order?.pricing?.total ?? pricing.total ?? 0) - Number(order?.pricing?.tax ?? pricing.tax ?? 0) || 0
    );
    const walletImpact = resolveWalletImpact(tx, order);
    const paymentMethod = normalizePaymentMethod(tx, order);
    const codLike = COD_LIKE_METHODS.has(paymentMethod);
    const commissionFromSettlement = toMoney(walletSettlement?.adminChargesRecoverable?.commission);
    const commissionFromPricing = Number(
        tx.amounts?.restaurantCommission || pricing.restaurantCommission || payoutAdjustments.commission || 0
    );
    const commission = codLike
        ? commissionFromSettlement
        : (Number.isFinite(commissionFromPricing) ? commissionFromPricing : 0);
    const deliveryFee = Number(pricing.deliveryFee || order?.pricing?.deliveryFee || 0);
    const riderShare = Number(tx.amounts?.riderShare || 0);
    const fulfillmentType = String(order?.fulfillmentType || '').toLowerCase();
    const deliveryType = String(order?.deliveryType || order?.deliveryFleet || '').toLowerCase();
    // Self-delivery: order type is 'delivery' AND restaurant uses own fleet (no external rider)
    const isSelfDelivery = fulfillmentType === 'delivery' && (deliveryType === 'self' || (deliveryFee > 0 && riderShare === 0));

    return {
        orderId: order?.orderId || tx.orderReadableId,
        sourceModule: 'takeaway',
        sourceLabel: 'Takeaway',
        createdAt: tx.createdAt,
        items,
        foodNames,
        orderTotal: orderTotalExclTax,
        totalAmount: tx.amounts?.totalCustomerPaid || 0,
        payout: walletImpact,
        commission,
        deliveryFee,
        isSelfDelivery,
        platformCouponDiscount: Number(pricing.platformCouponDiscount || payoutAdjustments.platformCouponDiscount || 0),
        restaurantCouponDiscount: Number(pricing.restaurantCouponDiscount || payoutAdjustments.restaurantCouponDiscount || 0),
        restaurantOfferDiscount: Number(pricing.restaurantOfferDiscount || payoutAdjustments.restaurantOfferDiscount || 0),
        couponFundingType: String(pricing.couponFundingType || 'none'),
        fundingType: String(pricing.fundingType || '').toUpperCase() || 'NONE',
        commissionBaseAmount: Number(pricing.commissionBaseAmount || pricing.offerAdjustedSubtotal || pricing.subtotal || 0),
        restaurantGrossBeforeDiscount: Number(pricing.restaurantGrossBeforeDiscount || 0),
        paymentMethod,
        isCodLike: codLike,
        orderStatus: order?.orderStatus || order?.deliveryState?.currentPhase || order?.deliveryState?.status,
        status: tx.status,
        settlementApplied: walletSettlement.applied === true,
        adminChargesRecoverable: Number(walletSettlement?.adminChargesRecoverable?.total || 0),
        adminChargesRecoverableBreakdown: {
            commission: Number(walletSettlement?.adminChargesRecoverable?.commission || 0),
            platformFee: Number(walletSettlement?.adminChargesRecoverable?.platformFee || 0),
            tax: Number(walletSettlement?.adminChargesRecoverable?.tax || 0),
            deliveryFee: Number(walletSettlement?.adminChargesRecoverable?.deliveryFee || 0),
            total: Number(walletSettlement?.adminChargesRecoverable?.total || 0),
        },
        platformDiscountCompensation: Number(walletSettlement?.platformDiscountCompensation || 0),
        walletNetAdjustment: Number(walletSettlement?.walletNetAdjustment || 0),
        diningBreakdown: {
            commission: 0,
            platformFee: 0,
            gst: 0,
            total: 0,
        },
    };
}

function normalizeDiningPaymentMethod(session) {
    const raw = String(
        session?.paymentMethod ||
        (session?.paymentMode === 'COUNTER' ? 'counter' : session?.paymentMode) ||
        ''
    ).trim().toLowerCase();

    if (raw === 'online') return 'online';
    if (raw === 'cash') return 'counter';
    return raw;
}

function resolveDiningWalletImpact(session) {
    const snapshot = session?.billingSnapshot || {};
    const walletSettlement = snapshot?.walletSettlement || {};
    const paymentMethod = normalizeDiningPaymentMethod(session);

    if (COD_LIKE_METHODS.has(paymentMethod)) {
        if (walletSettlement.applied === true) return toMoney(walletSettlement.walletNetAdjustment);
        return 0;
    }

    return toMoney(snapshot?.pricing?.restaurantPayout || 0);
}

function mapDiningFinanceOrder(session) {
    const snapshot = session?.billingSnapshot || {};
    const summary = snapshot?.summary || {};
    const pricing = snapshot?.pricing || {};
    const walletSettlement = snapshot?.walletSettlement || {};
    const paymentMethod = normalizeDiningPaymentMethod(session);
    const codLike = COD_LIKE_METHODS.has(paymentMethod);
    const breakdown = walletSettlement?.diningBreakdown || {};
    const adminCharges = walletSettlement?.adminChargesRecoverableBreakdown || {};

    return {
        orderId: `DIN-${String(session?._id || '').slice(-6).toUpperCase()}`,
        sourceModule: 'dining',
        sourceLabel: 'Dining',
        createdAt: session?.paidAt || session?.closedAt || session?.updatedAt || session?.createdAt,
        items: [],
        foodNames: `Dining table ${String(session?.tableNumber || '-').trim()}`,
        orderTotal: Number(summary?.subtotal || session?.subtotal || 0),
        totalAmount: Number(summary?.totalAmount || session?.totalAmount || 0),
        payout: resolveDiningWalletImpact(session),
        commission: codLike
            ? Number(adminCharges?.commission || breakdown?.commission || 0)
            : Number(pricing?.restaurantCommission || 0),
        platformCouponDiscount: Number(pricing?.platformOverallOfferDiscount || 0),
        restaurantCouponDiscount: 0,
        restaurantOfferDiscount: Number(pricing?.restaurantOverallOfferDiscount || 0),
        couponFundingType: String(snapshot?.appliedOffer?.fundedBy || 'none'),
        fundingType: String(pricing?.fundingType || '').toUpperCase() || 'NONE',
        commissionBaseAmount: Number(pricing?.commissionBaseAmount || summary?.subtotal || 0),
        restaurantGrossBeforeDiscount: Number(summary?.subtotal || 0),
        paymentMethod,
        isCodLike: codLike,
        orderStatus: session?.status || '',
        status: session?.paymentStatus || session?.status || '',
        settlementApplied: walletSettlement?.applied === true,
        adminChargesRecoverable: Number(walletSettlement?.adminChargesRecoverable || adminCharges?.total || 0),
        adminChargesRecoverableBreakdown: {
            commission: Number(adminCharges?.commission || breakdown?.commission || 0),
            platformFee: Number(adminCharges?.platformFee || breakdown?.platformFee || 0),
            tax: Number(adminCharges?.tax || breakdown?.gst || 0),
            deliveryFee: Number(adminCharges?.deliveryFee || 0),
            total: Number(adminCharges?.total || breakdown?.total || 0),
        },
        platformDiscountCompensation: Number(walletSettlement?.platformDiscountCompensation || 0),
        walletNetAdjustment: Number(walletSettlement?.walletNetAdjustment || 0),
        diningBreakdown: {
            commission: Number(breakdown?.commission || adminCharges?.commission || 0),
            platformFee: Number(breakdown?.platformFee || adminCharges?.platformFee || 0),
            gst: Number(breakdown?.gst || adminCharges?.tax || 0),
            total: Number(breakdown?.total || adminCharges?.total || 0),
        },
        tableNumber: String(session?.tableNumber || ''),
        appliedOfferTitle: String(snapshot?.appliedOffer?.title || ''),
    };
}

function sortByCreatedDesc(list = []) {
    return [...list].sort((a, b) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0));
}

function getTransactionPriority(status = '') {
    const normalized = String(status || '').trim().toLowerCase();
    if (normalized === 'captured') return 3;
    if (normalized === 'authorized') return 2;
    if (normalized === 'pending') return 1;
    return 0;
}

function dedupeTakeawayTransactions(transactions = []) {
    const byOrder = new Map();

    for (const tx of transactions) {
        const orderKeyRaw = tx?.orderId?._id || tx?.orderId || tx?.orderReadableId || tx?._id;
        if (!orderKeyRaw) continue;
        const key = String(orderKeyRaw);
        const existing = byOrder.get(key);
        if (!existing) {
            byOrder.set(key, tx);
            continue;
        }

        const existingPriority = getTransactionPriority(existing?.status);
        const currentPriority = getTransactionPriority(tx?.status);
        if (currentPriority > existingPriority) {
            byOrder.set(key, tx);
            continue;
        }
        if (currentPriority === existingPriority) {
            const existingAt = new Date(existing?.createdAt || 0).getTime();
            const currentAt = new Date(tx?.createdAt || 0).getTime();
            if (currentAt > existingAt) {
                byOrder.set(key, tx);
            }
        }
    }

    return sortByCreatedDesc(Array.from(byOrder.values()));
}

async function reconcileTakeawayOnlineWalletCredits(transactions = []) {
    for (const tx of transactions) {
        const paymentMethod = normalizePaymentMethod(tx, tx?.orderId || {});
        if (COD_LIKE_METHODS.has(paymentMethod)) continue;

        // Skip if settlement was already applied by applyWalletSettlementForFoodOrder
        if (tx?.settlement?.walletSettlement?.applied === true) continue;

        const pricing = tx?.pricing || tx?.orderId?.pricing || {};
        const payoutAmount = Number(
            tx?.amounts?.restaurantShare ?? pricing?.payoutAdjustments?.netPayout ?? 0
        );
        if (payoutAmount <= 0.009) continue;

        // Check BOTH settlement types to avoid duplicate credits
        const existingCreditTxn = await Transaction.findOne({
            entityType: 'restaurant',
            entityId: tx.restaurantId,
            type: 'credit',
            orderId: tx.orderId?._id || tx.orderId,
            'metadata.settlementType': { $in: ['TAKEAWAY_ONLINE_PAYOUT', 'SELF_DELIVERY_ONLINE_PAYOUT'] },
        })
            .select('_id createdAt')
            .lean();

        if (!existingCreditTxn) {
            await creditWallet({
                entityType: 'restaurant',
                entityId: String(tx.restaurantId),
                amount: payoutAmount,
                description: `Order ${String(tx.orderId?._id || tx.orderId)} online payout`,
                category: 'settlement_payout',
                orderId: String(tx.orderId?._id || tx.orderId),
                metadata: {
                    settlementType: 'TAKEAWAY_ONLINE_PAYOUT',
                    paymentMethod: paymentMethod || 'online',
                    restaurantPayout: payoutAmount,
                },
            });
        }

        const walletSettlement = tx?.settlement?.walletSettlement || {};
        await FoodTransaction.updateOne(
            { _id: tx._id },
            {
                $set: {
                    'settlement.walletSettlement.applied': true,
                    'settlement.walletSettlement.paymentMode': walletSettlement?.paymentMode || paymentMethod || 'online',
                    'settlement.walletSettlement.note': payoutAmount > 0.009
                        ? 'Online payout credited to wallet.'
                        : (walletSettlement?.note || 'Online payout recorded.'),
                    'settlement.walletSettlement.onlinePayoutCredited': true,
                    'settlement.walletSettlement.onlinePayoutAmount': payoutAmount,
                    'settlement.walletSettlement.onlinePayoutCreditedAt': existingCreditTxn?.createdAt || new Date(),
                },
            }
        );
    }
}

async function reconcileDiningOnlineWalletCredits(sessions = []) {
    for (const session of sessions) {
        const paymentMethod = normalizeDiningPaymentMethod(session);
        if (COD_LIKE_METHODS.has(paymentMethod)) continue;

        const snapshot = session?.billingSnapshot || {};
        const walletSettlement = snapshot?.walletSettlement || {};
        if (walletSettlement?.restaurantOnlinePayoutCredited === true) continue;

        const payoutAmount = Number(snapshot?.pricing?.restaurantPayout || 0);
        const sessionId = String(session?._id || '');
        if (!sessionId) continue;

        const existingCreditTxn = await Transaction.findOne({
            entityType: 'restaurant',
            entityId: session.restaurantId,
            type: 'credit',
            'metadata.settlementType': 'DINING_ONLINE_PAYOUT',
            'metadata.sessionId': sessionId,
        })
            .select('_id amount createdAt')
            .lean();

        if (!existingCreditTxn && payoutAmount > 0.009) {
            await creditWallet({
                entityType: 'restaurant',
                entityId: String(session.restaurantId),
                amount: payoutAmount,
                description: `Dining session ${sessionId} online payout`,
                category: 'settlement_payout',
                metadata: {
                    settlementType: 'DINING_ONLINE_PAYOUT',
                    sessionId,
                    paymentMethod: paymentMethod || 'online',
                    restaurantPayout: payoutAmount,
                },
            });
        }

        const updatedSettlement = {
            ...walletSettlement,
            applied: walletSettlement?.applied === true,
            paymentMode: walletSettlement?.paymentMode || 'online',
            isCodLike: false,
            restaurantOnlinePayoutCredited: true,
            restaurantOnlinePayoutAmount: payoutAmount,
            restaurantOnlinePayoutCreditedAt: existingCreditTxn?.createdAt || new Date(),
            note: payoutAmount > 0.009
                ? 'Online payout credited to wallet.'
                : (walletSettlement?.note || 'Online payout recorded.'),
        };

        session.billingSnapshot = {
            ...snapshot,
            walletSettlement: updatedSettlement,
        };
        session.markModified('billingSnapshot');
        await session.save();
    }
}

function summarizeDiningBreakdown(orders = [], walletAvailableBalance = 0) {
    const diningCashOrders = orders.filter((order) => order?.sourceModule === 'dining' && order?.isCodLike);
    const commission = diningCashOrders.reduce((sum, order) => sum + Number(order?.diningBreakdown?.commission || 0), 0);
    const platformFee = diningCashOrders.reduce((sum, order) => sum + Number(order?.diningBreakdown?.platformFee || 0), 0);
    const gst = diningCashOrders.reduce((sum, order) => sum + Number(order?.diningBreakdown?.gst || 0), 0);
    const totalDeduction = diningCashOrders.reduce((sum, order) => sum + Number(order?.diningBreakdown?.total || 0), 0);
    const outstandingDue = totalDeduction > 0
        ? Math.min(totalDeduction, Math.max(0, Math.abs(Math.min(0, Number(walletAvailableBalance || 0)))))
        : 0;
    const adjustedAmount = Math.max(0, totalDeduction - outstandingDue);
    const outstandingRatio = totalDeduction > 0.009 ? outstandingDue / totalDeduction : 0;
    const adjustedRatio = totalDeduction > 0.009 ? adjustedAmount / totalDeduction : 0;
    const pendingCommission = commission * outstandingRatio;
    const pendingPlatformFee = platformFee * outstandingRatio;
    const pendingGst = gst * outstandingRatio;
    const adjustedCommission = commission * adjustedRatio;
    const adjustedPlatformFee = platformFee * adjustedRatio;
    const adjustedGst = gst * adjustedRatio;

    return {
        ordersCount: diningCashOrders.length,
        commission,
        platformFee,
        gst,
        totalDeduction,
        outstandingDue,
        adjustedAmount,
        pendingCommission,
        pendingPlatformFee,
        pendingGst,
        adjustedCommission,
        adjustedPlatformFee,
        adjustedGst,
        hasDeductions: totalDeduction > 0.009,
        isFullyAdjusted: totalDeduction > 0.009 && outstandingDue <= 0.009,
        note: outstandingDue > 0.009
            ? 'Pending dining COD dues will be adjusted automatically in the next payout.'
            : 'Dining COD dues for this cycle are already adjusted from takeaway earnings.',
    };
}

export async function getRestaurantFinance(restaurantId, query = {}) {
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) return null;
    const rid = new mongoose.Types.ObjectId(restaurantId);

    const restaurant = await FoodRestaurant.findById(rid)
        .select('restaurantName addressLine1 addressLine2 area city state pincode location')
        .lean();

    const address =
        restaurant?.location?.formattedAddress ||
        (restaurant?.addressLine1
            ? [restaurant.addressLine1, restaurant.addressLine2, restaurant.area].filter(Boolean).join(', ')
            : restaurant?.addressLine1 || '');

    const nowWindow = getFixedCurrentCycleWindow(new Date());

    const financeEligibilityMatch = {
        $or: [
            { status: { $in: ['captured', 'authorized'] } },
            { status: 'pending', paymentMethod: { $in: ['cash', 'wallet'] } }
        ]
    };

    const diningCompletedMatch = {
        restaurantId: rid,
        status: 'completed',
        isPaid: true,
        billingSnapshot: { $ne: null },
    };

    const latestSettledWithdrawal = await FoodRestaurantWithdrawal.findOne({
        restaurantId: rid,
        $expr: {
            $in: [{ $toLower: { $trim: { input: '$status' } } }, ['approved', 'processed']]
        }
    })
        .sort({ processedAt: -1, updatedAt: -1, createdAt: -1 })
        .select('processedAt updatedAt createdAt')
        .lean();

    const latestSettlementAtRaw =
        latestSettledWithdrawal?.processedAt ||
        latestSettledWithdrawal?.updatedAt ||
        latestSettledWithdrawal?.createdAt ||
        null;
    const latestSettlementAt = latestSettlementAtRaw ? new Date(latestSettlementAtRaw) : null;
    const hasValidSettlementAt = latestSettlementAt && !Number.isNaN(latestSettlementAt.getTime());

    const effectiveCurrentStart =
        hasValidSettlementAt && latestSettlementAt > nowWindow.start
            ? latestSettlementAt
            : nowWindow.start;
    const currentWindowMeta = {
        start: {
            day: String(effectiveCurrentStart.getDate()),
            month: monthShort(effectiveCurrentStart.getMonth()),
            year: toTwoDigitYearString(effectiveCurrentStart),
        },
        end: { ...nowWindow.endMeta },
    };

    const [currentTransactionsRaw, currentDiningSessions] = await Promise.all([
        FoodTransaction.find({
            restaurantId: rid,
            ...financeEligibilityMatch,
            createdAt: { $gte: effectiveCurrentStart, $lte: nowWindow.end }
        })
            .populate('orderId', 'orderId createdAt items pricing deliveryState orderStatus fulfillmentType deliveryType deliveryFleet')
            .sort({ createdAt: -1 })
            .lean(),
        FoodTableSession.find({
            ...diningCompletedMatch,
            closedAt: { $gte: effectiveCurrentStart, $lte: nowWindow.end }
        })
            .select('restaurantId tableNumber subtotal totalAmount paymentMethod paymentMode paymentStatus status isPaid paidAt closedAt updatedAt createdAt billingSnapshot')
            .sort({ closedAt: -1, updatedAt: -1 }),
    ]);
    const currentTransactions = dedupeTakeawayTransactions(currentTransactionsRaw);

    await reconcileTakeawayOnlineWalletCredits(currentTransactions);
    await reconcileDiningOnlineWalletCredits(currentDiningSessions);
    const walletSnapshot = await getWalletBalance('restaurant', restaurantId);

    const currentDiningOrders = currentDiningSessions.map((session) =>
        mapDiningFinanceOrder(session?.toObject?.() || session)
    );

    const currentCycleOrders = sortByCreatedDesc([
        ...currentTransactions.map(mapFinanceOrder),
        ...currentDiningOrders,
    ]);

    const currentCycleTakeawayOrders = currentCycleOrders.filter((order) => order?.sourceModule === 'takeaway');
    const currentCycleTakeawayOnlineOrders = currentCycleTakeawayOrders.filter((order) => !order.isCodLike);
    const currentCyclePendingCodOrders = currentCycleOrders.filter(
        (order) => order.isCodLike && !order.settlementApplied
    );
    const currentCycleEstimatedPayout = currentCycleOrders.reduce(
        (sum, order) => sum + (Number(order?.payout) || 0),
        0
    );

    const [pendingWithdrawalsAgg, withdrawnAmountAgg] = await Promise.all([
        FoodRestaurantWithdrawal.aggregate([
            {
                $match: {
                    restaurantId: rid,
                    $expr: {
                        $eq: [{ $toLower: { $trim: { input: '$status' } } }, 'pending']
                    }
                }
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        FoodRestaurantWithdrawal.aggregate([
            {
                $match: {
                    restaurantId: rid,
                    $expr: {
                        $in: [{ $toLower: { $trim: { input: '$status' } } }, ['approved', 'processed']]
                    }
                }
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
    ]);

    const totalPendingWithdrawals = Number(pendingWithdrawalsAgg?.[0]?.total || 0);
    const totalWithdrawnAmount = Number(withdrawnAmountAgg?.[0]?.total || 0);
    const walletAvailableBalance = Number(walletSnapshot?.availableBalance || 0);
    const availableBalance = Math.max(0, walletAvailableBalance - totalPendingWithdrawals);
    const diningBreakdown = summarizeDiningBreakdown(currentCycleOrders, walletAvailableBalance);

    const currentCycle = {
        start: { ...currentWindowMeta.start },
        end: { ...currentWindowMeta.end },
        totalEarnings: currentCycleEstimatedPayout,
        totalWithdrawn: totalWithdrawnAmount,
        pendingWithdrawals: totalPendingWithdrawals,
        estimatedPayout: availableBalance,
        walletBalance: Number(walletSnapshot?.balance || 0),
        walletAvailableBalance,
        discountBreakdown: {
            platformCoupons: currentCycleTakeawayOrders.reduce((sum, order) => sum + (Number(order.platformCouponDiscount) || 0), 0),
            restaurantCoupons: currentCycleTakeawayOrders.reduce((sum, order) => sum + (Number(order.restaurantCouponDiscount) || 0), 0),
            restaurantOffers: currentCycleTakeawayOrders.reduce((sum, order) => sum + (Number(order.restaurantOfferDiscount) || 0), 0),
            commissionPaid: currentCycleTakeawayOnlineOrders.reduce((sum, order) => sum + (Number(order.commission) || 0), 0),
            netPayout: currentCycleTakeawayOrders.reduce((sum, order) => sum + (Number(order.payout) || 0), 0),
            deliveryFee: currentCycleTakeawayOrders.reduce((sum, order) => sum + (order.isSelfDelivery ? (Number(order.deliveryFee) || 0) : 0), 0),
            totalOrders: currentCycleTakeawayOrders.length,
        },
        settlementBreakdown: {
            adminChargesRecoverable: currentCyclePendingCodOrders.reduce((sum, order) => sum + (Number(order.adminChargesRecoverable) || 0), 0),
            platformDiscountCompensation: currentCyclePendingCodOrders.reduce((sum, order) => sum + (Number(order.platformDiscountCompensation) || 0), 0),
            walletNetAdjustment: currentCyclePendingCodOrders.reduce((sum, order) => sum + (Number(order.walletNetAdjustment) || 0), 0),
        },
        diningBreakdown,
        totalOrders: currentCycleOrders.length,
        payoutDate: null,
        orders: currentCycleOrders
    };

    const invoiceSummary = {
        count: currentCycleOrders.length,
        subtotal: currentCycleOrders.reduce((sum, order) => sum + (Number(order.orderTotal) || 0), 0),
        taxes: currentCycleOrders.reduce((sum, order) => sum + Math.max(0, (Number(order.totalAmount) || 0) - (Number(order.orderTotal) || 0)), 0),
        gross: currentCycleOrders.reduce((sum, order) => sum + (Number(order.totalAmount) || 0), 0),
        earnings: currentCycleOrders.reduce((sum, order) => sum + (Number(order.payout) || 0), 0),
        commission: currentCycleOrders.reduce((sum, order) => sum + (Number(order.commission) || 0), 0),
        diningDeductions: diningBreakdown.totalDeduction,
    };

    const startDate = parseISODateParam(query.startDate);
    const endDate = parseISODateParamEnd(query.endDate);

    let pastCyclesResult = { orders: [], totalOrders: 0 };
    if (startDate && endDate) {
        const [pastTransactionsRaw, pastDiningSessions] = await Promise.all([
            FoodTransaction.find({
                restaurantId: rid,
                ...financeEligibilityMatch,
                createdAt: { $gte: startDate, $lte: endDate }
            })
                .populate('orderId', 'orderId createdAt items pricing deliveryState orderStatus fulfillmentType deliveryType deliveryFleet')
                .sort({ createdAt: -1 })
                .lean(),
            FoodTableSession.find({
                ...diningCompletedMatch,
                closedAt: { $gte: startDate, $lte: endDate }
            })
                .select('restaurantId tableNumber subtotal totalAmount paymentMethod paymentMode paymentStatus status isPaid paidAt closedAt updatedAt createdAt billingSnapshot')
                .sort({ closedAt: -1, updatedAt: -1 }),
        ]);
        const pastTransactions = dedupeTakeawayTransactions(pastTransactionsRaw);

        await reconcileTakeawayOnlineWalletCredits(pastTransactions);
        await reconcileDiningOnlineWalletCredits(pastDiningSessions);

        const pastCycleOrders = sortByCreatedDesc([
            ...pastTransactions.map(mapFinanceOrder),
            ...pastDiningSessions.map((session) => mapDiningFinanceOrder(session?.toObject?.() || session)),
        ]);

        pastCyclesResult = {
            orders: pastCycleOrders,
            totalOrders: pastCycleOrders.length
        };
    }

    return {
        restaurant: {
            name: restaurant?.restaurantName || '',
            restaurantId: restaurant?._id ? `REST${restaurant._id.toString().slice(-6).padStart(6, '0')}` : 'N/A',
            address
        },
        currentCycle,
        invoiceSummary,
        pastCycles: pastCyclesResult
    };
}
