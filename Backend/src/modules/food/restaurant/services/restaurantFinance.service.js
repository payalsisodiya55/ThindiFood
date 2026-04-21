import mongoose from 'mongoose';
import { FoodOrder } from '../../orders/models/order.model.js';
import { FoodTransaction } from '../../orders/models/foodTransaction.model.js';
import { FoodRestaurant } from '../models/restaurant.model.js';
import { FoodRestaurantWithdrawal } from '../models/foodRestaurantWithdrawal.model.js';

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

    // If before start day, settlement belongs to previous month cycle.
    if (now.getDate() < startDay) {
        month = month - 1;
        if (month < 0) {
            month = 11;
            year -= 1;
        }
    }

    const start = new Date(year, month, startDay, 0, 0, 0, 0);
    // End should be either fixed 21 or now, let's make it more inclusive for "Current Cycle"
    // Users want to see their active earnings, so we extend it to 'now'
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
        // COD/counter impacts wallet only via settlement adjustment.
        if (settlement.applied === true) return toMoney(settlement.walletNetAdjustment);
        return 0;
    }
    // ONLINE flow remains unchanged: payout is restaurant share.
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
    // For COD/counter, commission shown in finance should come from settlement recovery,
    // not from stale pricing snapshots.
    const commission = codLike
        ? commissionFromSettlement
        : (Number.isFinite(commissionFromPricing) ? commissionFromPricing : 0);

    return {
        orderId: order?.orderId || tx.orderReadableId,
        createdAt: tx.createdAt,
        items,
        foodNames,
        orderTotal: orderTotalExclTax,
        totalAmount: tx.amounts?.totalCustomerPaid || 0,
        payout: walletImpact,
        commission,
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
    };
}

export async function getRestaurantFinance(restaurantId, query = {}) {
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) return null;
    const rid = new mongoose.Types.ObjectId(restaurantId);

    // Fetch restaurant profile for header display.
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

    // Current cycle: sum ledger payouts in the fixed window.
    const currentTransactions = await FoodTransaction.find({
        restaurantId: rid,
        ...financeEligibilityMatch,
        createdAt: { $gte: nowWindow.start, $lte: nowWindow.end }
    })
        .populate('orderId', 'orderId createdAt items pricing deliveryState orderStatus')
        .sort({ createdAt: -1 })
        .lean();

    const currentCycleOrders = currentTransactions.map(mapFinanceOrder);
    const currentCycleOnlineOrders = currentCycleOrders.filter((order) => !order.isCodLike);
    const currentCyclePendingCodOrders = currentCycleOrders.filter(
        (order) => order.isCodLike && !order.settlementApplied
    );

    const currentCycleEstimatedPayout = currentCycleOrders.reduce(
        (sum, o) => sum + (Number(o.payout) || 0),
        0
    );

    // Calculate global estimated payout (all unsettled transactions)
    const allUnsettledTransactions = await FoodTransaction.find({
        restaurantId: rid,
        ...financeEligibilityMatch,
        'settlement.isRestaurantSettled': { $ne: true }
    }).select('amounts.restaurantShare pricing payoutAdjustments payment paymentMethod settlement').lean();

    const globalEstimatedPayout = allUnsettledTransactions.reduce(
        (sum, tx) => sum + resolveWalletImpact(tx, {}),
        0
    );

    // Deduct all committed withdrawal requests (pending + approved) from available payout.
    // This prevents balance from bouncing back after admin approves a request.
    const committedWithdrawalsAgg = await FoodRestaurantWithdrawal.aggregate([
        {
            $match: {
                restaurantId: rid,
                $expr: {
                    $in: [{ $toLower: { $trim: { input: '$status' } } }, ['pending', 'approved', 'processed']]
                }
            }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalCommittedWithdrawals = Number(committedWithdrawalsAgg?.[0]?.total || 0);
    const availableBalance = Math.max(0, globalEstimatedPayout - totalCommittedWithdrawals);

    const currentCycle = {
        start: { ...nowWindow.startMeta },
        end: { ...nowWindow.endMeta },
        totalEarnings: currentCycleEstimatedPayout, // We still show current cycle earnings label
        totalWithdrawn: totalCommittedWithdrawals,
        estimatedPayout: availableBalance, // This is what UI shows as "Estimated Payout" (Available Balance)
        discountBreakdown: {
            platformCoupons: currentCycleOrders.reduce((sum, order) => sum + (Number(order.platformCouponDiscount) || 0), 0),
            restaurantCoupons: currentCycleOrders.reduce((sum, order) => sum + (Number(order.restaurantCouponDiscount) || 0), 0),
            restaurantOffers: currentCycleOrders.reduce((sum, order) => sum + (Number(order.restaurantOfferDiscount) || 0), 0),
            // "Commission Paid" in payout card should reflect ONLINE payouts only.
            // COD/counter recoveries are shown separately in settlement note.
            commissionPaid: currentCycleOnlineOrders.reduce((sum, order) => sum + (Number(order.commission) || 0), 0),
            netPayout: currentCycleEstimatedPayout
        },
        settlementBreakdown: {
            // Show only pending COD/counter settlement exposure in top note.
            // Applied settlements remain visible in per-order details/history.
            adminChargesRecoverable: currentCyclePendingCodOrders.reduce((sum, order) => sum + (Number(order.adminChargesRecoverable) || 0), 0),
            platformDiscountCompensation: currentCyclePendingCodOrders.reduce((sum, order) => sum + (Number(order.platformDiscountCompensation) || 0), 0),
            walletNetAdjustment: currentCyclePendingCodOrders.reduce((sum, order) => sum + (Number(order.walletNetAdjustment) || 0), 0),
        },
        totalOrders: currentCycleOrders.length,
        payoutDate: null,
        orders: currentCycleOrders
    };

    // Invoice Summary (derived from current cycle or broader if needed)
    const invoiceSummary = {
        count: currentCycleOrders.length,
        subtotal: currentCycleOrders.reduce((sum, o) => sum + (Number(o.orderTotal) || 0), 0),
        taxes: currentCycleOrders.reduce((sum, o) => sum + Math.max(0, (Number(o.totalAmount) || 0) - (Number(o.orderTotal) || 0)), 0),
        gross: currentCycleOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0)
    };

    // Past cycles: build from provided startDate/endDate query.
    const startDate = parseISODateParam(query.startDate);
    const endDate = parseISODateParamEnd(query.endDate);

    let pastCyclesResult = { orders: [], totalOrders: 0 };
    if (startDate && endDate) {
        const pastTransactions = await FoodTransaction.find({
            restaurantId: rid,
            ...financeEligibilityMatch,
            createdAt: { $gte: startDate, $lte: endDate }
        })
            .populate('orderId', 'orderId createdAt items pricing deliveryState orderStatus')
            .sort({ createdAt: -1 })
            .lean();

        const pastCycleOrders = pastTransactions.map(mapFinanceOrder);

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


