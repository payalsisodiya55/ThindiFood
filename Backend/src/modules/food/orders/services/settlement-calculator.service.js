const COD_LIKE_METHODS = new Set(['cash', 'razorpay_qr', 'counter']);

const roundMoney = (value) => {
    const n = Number(value) || 0;
    return Math.round(n * 100) / 100;
};

const toPositiveMoney = (value) => Math.max(0, roundMoney(value));

export const deriveFundingType = (rawFunding, pricing = {}) => {
    const raw = String(rawFunding || '').trim().toLowerCase();
    if (raw === 'platform') return 'PLATFORM';
    if (raw === 'restaurant') return 'RESTAURANT';

    const platformDiscount = toPositiveMoney(
        Number(pricing.platformCouponDiscount || 0) +
            Number(pricing.platformOverallOfferDiscount || 0),
    );
    const restaurantDiscount = toPositiveMoney(
        Number(pricing.restaurantCouponDiscount || 0) +
            Number(pricing.restaurantOfferDiscount || 0) +
            Number(pricing.restaurantOverallOfferDiscount || 0),
    );

    if (platformDiscount > 0 && restaurantDiscount <= 0) return 'PLATFORM';
    if (restaurantDiscount > 0 && platformDiscount <= 0) return 'RESTAURANT';
    return 'NONE';
};

export const calculateWalletSettlement = ({
    paymentMode,
    pricing = {},
    charges = {},
    contributions = {},
    restaurantShouldRetain,
    customerCashCollected,
}) => {
    const normalizedPaymentMode = String(paymentMode || '').trim().toLowerCase();
    const isCodLike = COD_LIKE_METHODS.has(normalizedPaymentMode);

    const commission = toPositiveMoney(
        charges?.commission ??
            pricing?.payoutAdjustments?.commission ??
            pricing?.restaurantCommission ??
            0,
    );
    const platformFee = toPositiveMoney(charges?.platformFee ?? pricing?.platformFee ?? 0);
    const tax = toPositiveMoney(charges?.tax ?? pricing?.tax ?? 0);
    // Delivery-related charge is intentionally excluded from COD/counter admin recovery.
    const deliveryFee = 0;
    const adminChargesRecoverable = toPositiveMoney(
        commission + platformFee + tax + deliveryFee,
    );

    const platformDiscountCompensation = toPositiveMoney(
        Number(
            contributions?.platformDiscount ??
                (Number(pricing?.platformCouponDiscount || 0) +
                    Number(pricing?.platformOverallOfferDiscount || 0)),
        ),
    );

    const retainAmount = toPositiveMoney(
        restaurantShouldRetain ??
            pricing?.payoutAdjustments?.netPayout ??
            pricing?.restaurantPayout ??
            0,
    );
    const cashCollected = toPositiveMoney(
        customerCashCollected ??
            (isCodLike ? pricing?.total : 0) ??
            0,
    );

    const walletNetAdjustment = isCodLike
        ? roundMoney(retainAmount - cashCollected)
        : 0;

    return {
        paymentMode: normalizedPaymentMode,
        isCodLike,
        fundingType: deriveFundingType(
            pricing?.fundedBy || pricing?.couponFundingType,
            pricing,
        ),
        restaurantShouldRetain: retainAmount,
        customerCashCollected: cashCollected,
        platformDiscountCompensation,
        adminChargesRecoverableBreakdown: {
            commission,
            platformFee,
            tax,
            deliveryFee,
            total: adminChargesRecoverable,
        },
        adminChargesRecoverable,
        walletNetAdjustment,
    };
};
