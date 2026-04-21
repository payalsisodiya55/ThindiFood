import { FoodTransaction } from '../models/foodTransaction.model.js';
import { FoodRestaurantCommission } from '../../admin/models/restaurantCommission.model.js';
import mongoose from 'mongoose';
import { creditWallet, debitWallet } from '../../../../core/payments/wallet.service.js';
import { calculateWalletSettlement, deriveFundingType } from './settlement-calculator.service.js';

const RESTAURANT_COMMISSION_CACHE_MS = 60 * 1000;
let restaurantCommissionRulesCache = null;
let restaurantCommissionRulesLoadedAt = 0;

async function getActiveRestaurantCommissionRules() {
  const now = Date.now();
  if (
    restaurantCommissionRulesCache &&
    now - restaurantCommissionRulesLoadedAt < RESTAURANT_COMMISSION_CACHE_MS
  ) {
    return restaurantCommissionRulesCache;
  }

  const list = await FoodRestaurantCommission.find({
    status: { $ne: false },
  }).lean();
  restaurantCommissionRulesCache = list || [];
  restaurantCommissionRulesLoadedAt = now;
  return restaurantCommissionRulesCache;
}

export function computeRestaurantCommissionAmount(baseAmount, rule) {
  const safeBase = Math.max(0, Number(baseAmount) || 0);
  if (!Number.isFinite(safeBase) || safeBase < 0) return 0;

  const commissionType = rule?.defaultCommission?.type || 'percentage';
  const commissionValue = Math.max(
    0,
    Number(rule?.defaultCommission?.value ?? 0) || 0
  );

  let commissionAmount = 0;
  if (commissionType === 'percentage') {
    commissionAmount = safeBase * (commissionValue / 100);
  } else if (commissionType === 'amount') {
    commissionAmount = commissionValue;
  }

  // Round to 2 decimals and clamp to [0, base]
  commissionAmount = Math.round((commissionAmount || 0) * 100) / 100;
  commissionAmount = Math.max(0, Math.min(commissionAmount, safeBase));

  return { commissionAmount, commissionType, commissionValue, baseAmount: safeBase };
}

export async function getRestaurantCommissionSnapshot(orderDoc) {
  const baseAmount =
    Number(
      orderDoc?.pricing?.commissionBaseAmount ?? orderDoc?.pricing?.subtotal ?? 0,
    ) || 0;
  const restaurantIdRaw =
    orderDoc?.restaurantId?._id ?? orderDoc?.restaurantId ?? null;

  if (!restaurantIdRaw) {
    return {
      commissionAmount: 0,
      commissionType: 'percentage',
      commissionValue: 0,
      baseAmount,
    };
  }

  const rules = await getActiveRestaurantCommissionRules();
  const rule =
    rules.find((r) => String(r.restaurantId) === String(restaurantIdRaw)) ||
    // Fallback: accept legacy docs where restaurantId may be stored under `restaurant` / `restaurant_id`
    rules.find((r) => String(r.restaurant || r.restaurant_id || '') === String(restaurantIdRaw)) ||
    null;

  if (!rule) {
    return {
      commissionAmount: 0,
      commissionType: 'percentage',
      commissionValue: 0,
      baseAmount,
    };
  }

  return computeRestaurantCommissionAmount(baseAmount, rule);
}

/**
 * Creates an initial 'pending' transaction when an order is created.
 */
export async function createInitialTransaction(order) {
    const { commissionAmount } = await getRestaurantCommissionSnapshot(order);
    
    // Split logic
    const totalCustomerPaid = order.pricing?.total || 0;
    const riderShare = order.riderEarning || 0;
    // Prefer commission already computed & stored on the order (source of truth for this order),
    // fallback to rule snapshot for older orders.
    const restaurantCommissionFromOrder = Number(order.pricing?.restaurantCommission);
    const restaurantCommission =
        Number.isFinite(restaurantCommissionFromOrder) && restaurantCommissionFromOrder > 0
            ? restaurantCommissionFromOrder
            : (commissionAmount || 0);
    const restaurantNetFromOrder = Number(order.pricing?.payoutAdjustments?.netPayout);
    const restaurantNet = Number.isFinite(restaurantNetFromOrder)
        ? restaurantNetFromOrder
        : ((order.pricing?.subtotal || 0) + (order.pricing?.packagingFee || 0) - restaurantCommission);
    const platformNetProfitFromOrder = Number(order.platformProfit);
    const platformNetProfit = Number.isFinite(platformNetProfitFromOrder)
        ? platformNetProfitFromOrder
        : ((order.pricing?.platformFee || 0) + (order.pricing?.deliveryFee || 0) + restaurantCommission - riderShare);

    const transaction = new FoodTransaction({
        orderId: order._id,

        userId: order.userId,
        restaurantId: order.restaurantId,
        deliveryPartnerId: order.dispatch?.deliveryPartnerId,
        paymentMethod: order.payment?.method || 'cash',
        status: order.payment?.status === 'paid' ? 'captured' : 'pending',
        payment: {
            method: String(order.payment?.method || 'cash'),
            status: String(order.payment?.status || 'cod_pending'),
            amountDue: Number(order.payment?.amountDue ?? order.pricing?.total ?? 0) || 0,
            razorpay: {
                orderId: String(order.payment?.razorpay?.orderId || ''),
                paymentId: String(order.payment?.razorpay?.paymentId || ''),
                signature: String(order.payment?.razorpay?.signature || ''),
            },
            qr: {
                qrId: String(order.payment?.qr?.qrId || ''),
                imageUrl: String(order.payment?.qr?.imageUrl || ''),
                paymentLinkId: String(order.payment?.qr?.paymentLinkId || ''),
                shortUrl: String(order.payment?.qr?.shortUrl || ''),
                status: String(order.payment?.qr?.status || ''),
                expiresAt: order.payment?.qr?.expiresAt || null,
            }
        },
        pricing: {
            originalSubtotal: Number(order.pricing?.originalSubtotal || order.pricing?.subtotal || 0) || 0,
            offerAdjustedSubtotal: Number(order.pricing?.offerAdjustedSubtotal || order.pricing?.subtotal || 0) || 0,
            subtotal: Number(order.pricing?.subtotal || 0) || 0,
            tax: Number(order.pricing?.tax || 0) || 0,
            packagingFee: Number(order.pricing?.packagingFee || 0) || 0,
            deliveryFee: Number(order.pricing?.deliveryFee || 0) || 0,
            platformFee: Number(order.pricing?.platformFee || 0) || 0,
            restaurantCommission,
            discount: Number(order.pricing?.discount || 0) || 0,
            couponDiscount: Number(order.pricing?.couponDiscount || 0) || 0,
            restaurantDiscount: Number(order.pricing?.restaurantDiscount || 0) || 0,
            platformCouponDiscount: Number(order.pricing?.platformCouponDiscount || 0) || 0,
            restaurantCouponDiscount: Number(order.pricing?.restaurantCouponDiscount || 0) || 0,
            restaurantOfferDiscount: Number(order.pricing?.restaurantOfferDiscount || 0) || 0,
            commissionBaseAmount: Number(order.pricing?.commissionBaseAmount || order.pricing?.subtotal || 0) || 0,
            restaurantGrossBeforeDiscount: Number(order.pricing?.restaurantGrossBeforeDiscount || 0) || 0,
            couponFundingType: String(order.pricing?.couponFundingType || 'none'),
            fundingType: deriveFundingType(order.pricing?.couponFundingType, order.pricing),
            payoutAdjustments: {
                platformCouponDiscount: Number(order.pricing?.payoutAdjustments?.platformCouponDiscount || 0) || 0,
                restaurantCouponDiscount: Number(order.pricing?.payoutAdjustments?.restaurantCouponDiscount || 0) || 0,
                restaurantOfferDiscount: Number(order.pricing?.payoutAdjustments?.restaurantOfferDiscount || 0) || 0,
                commission: Number(order.pricing?.payoutAdjustments?.commission || restaurantCommission || 0) || 0,
                netPayout: Number(order.pricing?.payoutAdjustments?.netPayout || restaurantNet || 0) || 0
            },
            total: Number(order.pricing?.total || 0) || 0,
            currency: String(order.pricing?.currency || order.currency || 'INR'),
        },
        amounts: {
            totalCustomerPaid,
            restaurantShare: Math.max(0, restaurantNet),
            restaurantCommission,
            riderShare,
            platformNetProfit,
            taxAmount: order.pricing?.tax || 0
        },
        gateway: {
            razorpayOrderId: order.payment?.razorpay?.orderId,
            qrUrl: order.payment?.qr?.imageUrl
        },
        history: [{
            kind: 'created',
            amount: totalCustomerPaid,
            note: 'Initial transaction created with order'
        }]
    });

    await transaction.save();

    // Link back to the order
    try {
        await mongoose.model('FoodOrder').updateOne(
            { _id: order._id },
            { $set: { transactionId: transaction._id } }
        );
    } catch (err) {
        // Log but don't fail transaction if the backlink fails
    }

    return transaction;
}

export async function applyWalletSettlementForFoodOrder(orderId, opts = {}) {
    const orderObjectId = mongoose.Types.ObjectId.isValid(orderId)
        ? new mongoose.Types.ObjectId(orderId)
        : null;
    if (!orderObjectId) return null;

    const claimFilter = {
        orderId: orderObjectId,
        $or: [
            { 'settlement.walletSettlement.applied': { $exists: false } },
            { 'settlement.walletSettlement.applied': { $ne: true } },
        ],
        'settlement.walletSettlement.processing': { $ne: true },
    };

    const now = new Date();
    const tx = await FoodTransaction.findOneAndUpdate(
        claimFilter,
        {
            $set: {
                'settlement.walletSettlement.processing': true,
            },
        },
        { new: true },
    );

    if (!tx) {
        return { applied: false, reason: 'already_applied_or_missing' };
    }

    try {
        const paymentMethod = String(tx.payment?.method || tx.paymentMethod || '').trim().toLowerCase();
        const pricing = tx.pricing || {};
        const onlineRestaurantPayout = Number(
            tx.amounts?.restaurantShare ?? pricing?.payoutAdjustments?.netPayout ?? 0,
        );
        const settlement = calculateWalletSettlement({
            paymentMode: paymentMethod,
            pricing,
            charges: {
                commission: Number(tx.amounts?.restaurantCommission ?? pricing?.payoutAdjustments?.commission ?? pricing?.restaurantCommission ?? 0),
                platformFee: Number(pricing?.platformFee ?? 0),
                tax: Number(pricing?.tax ?? 0),
                deliveryFee: Number(pricing?.deliveryFee ?? 0),
            },
            contributions: {
                platformDiscount: Number(pricing?.platformCouponDiscount ?? 0) + Number(pricing?.platformOverallOfferDiscount ?? 0),
            },
            restaurantShouldRetain: Number(tx.amounts?.restaurantShare || pricing?.payoutAdjustments?.netPayout || 0),
            customerCashCollected:
                paymentMethod === 'cash' || paymentMethod === 'razorpay_qr' || paymentMethod === 'counter'
                    ? Number(tx.amounts?.totalCustomerPaid || pricing?.total || 0)
                    : 0,
        });

        const walletNetAdjustment = Number(settlement.walletNetAdjustment || 0);
        const adjustmentAmount = Math.abs(walletNetAdjustment);

        if (settlement.isCodLike && adjustmentAmount > 0.009) {
            const walletPayload = {
                entityType: 'restaurant',
                entityId: String(tx.restaurantId),
                amount: adjustmentAmount,
                description: `Order ${String(tx.orderId)} COD settlement adjustment`,
                category: 'adjustment',
                orderId: String(tx.orderId),
                allowNegative: true,
                metadata: {
                    settlementType: 'COD_WALLET_ADJUSTMENT',
                    walletNetAdjustment,
                    adminChargesRecoverable: settlement.adminChargesRecoverable,
                    platformDiscountCompensation: settlement.platformDiscountCompensation,
                    paymentMethod,
                },
            };

            if (walletNetAdjustment > 0) {
                await creditWallet(walletPayload);
            } else {
                await debitWallet(walletPayload);
            }
        }

        if (!settlement.isCodLike && onlineRestaurantPayout > 0.009) {
            const existingCreditTxn = await mongoose.model('Transaction').findOne({
                entityType: 'restaurant',
                entityId: tx.restaurantId,
                type: 'credit',
                orderId: tx.orderId,
                'metadata.settlementType': 'TAKEAWAY_ONLINE_PAYOUT',
            })
                .select('_id createdAt')
                .lean();

            if (!existingCreditTxn) {
                await creditWallet({
                    entityType: 'restaurant',
                    entityId: String(tx.restaurantId),
                    amount: onlineRestaurantPayout,
                    description: `Order ${String(tx.orderId)} online payout`,
                    category: 'settlement_payout',
                    orderId: String(tx.orderId),
                    metadata: {
                        settlementType: 'TAKEAWAY_ONLINE_PAYOUT',
                        paymentMethod,
                        restaurantPayout: onlineRestaurantPayout,
                    },
                });
            }
        }

        tx.settlement = tx.settlement || {};
        tx.settlement.walletSettlement = {
            processing: false,
            applied: true,
            appliedAt: now,
            paymentMode: settlement.paymentMode,
            fundingType: settlement.fundingType,
            restaurantShouldRetain: settlement.restaurantShouldRetain,
            customerCashCollected: settlement.customerCashCollected,
            platformDiscountCompensation: settlement.platformDiscountCompensation,
            walletNetAdjustment: settlement.walletNetAdjustment,
            adminChargesRecoverable: settlement.adminChargesRecoverableBreakdown,
            note: settlement.isCodLike
                ? 'COD-like settlement applied'
                : 'Online payout credited to wallet.',
            onlinePayoutCredited: !settlement.isCodLike && onlineRestaurantPayout > 0.009,
            onlinePayoutAmount: !settlement.isCodLike ? onlineRestaurantPayout : 0,
            recordedBy: {
                role: opts.recordedByRole || 'SYSTEM',
                id: opts.recordedById || null,
            },
        };

        tx.history.push({
            kind: 'wallet_settlement_applied',
            amount: adjustmentAmount > 0.009 ? adjustmentAmount : 0,
            at: now,
            note: `Wallet settlement applied (${paymentMethod || 'unknown'})`,
            recordedBy: { role: opts.recordedByRole || 'SYSTEM', id: opts.recordedById || null },
        });

        await tx.save();
        return tx;
    } catch (error) {
        await FoodTransaction.updateOne(
            { _id: tx._id },
            {
                $set: {
                    'settlement.walletSettlement.processing': false,
                    'settlement.walletSettlement.note': `Settlement failed: ${error?.message || 'unknown error'}`,
                },
            },
        );
        throw error;
    }
}

/**
 * Updates transaction status (captured, settled, etc) and appends to history.
 */
export async function updateTransactionStatus(orderId, kind, details = {}) {
    const query = { orderId };
    const transaction = await FoodTransaction.findOne(query);
    if (!transaction) return null;

    if (details.status) transaction.status = details.status;
    if (details.razorpayPaymentId) transaction.gateway.razorpayPaymentId = details.razorpayPaymentId;
    if (details.razorpaySignature) transaction.gateway.razorpaySignature = details.razorpaySignature;
    
    transaction.history.push({
        kind,
        amount: transaction.amounts.totalCustomerPaid,
        at: new Date(),
        note: details.note || `Transaction updated: ${kind}`,
        recordedBy: { role: details.recordedByRole || 'SYSTEM', id: details.recordedById }
    });

    await transaction.save();
    return transaction;
}

/**
 * Updates the rider in the transaction when an order is accepted.
 */
export async function updateTransactionRider(orderId, riderId) {
    const query = { orderId };
    return await FoodTransaction.findOneAndUpdate(
        query,
        { $set: { deliveryPartnerId: riderId } },
        { new: true }
    );
}

/**
 * Marks restaurant as settled in the finance record.
 */
export async function settleRestaurant(orderId, adminId) {
    return await updateTransactionStatus(orderId, 'settled', {
        status: 'captured', // Ensure it's marked as captured if it was pending cash
        note: 'Restaurant payout settled by admin',
        recordedByRole: 'ADMIN',
        recordedById: adminId
    });
}
