import { z } from 'zod';
import { ValidationError } from '../../../../core/auth/errors.js';

const toDateOrUndefined = (value, fieldName) => {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) {
        throw new ValidationError(`Invalid ${fieldName}`);
    }
    return parsed;
};

const baseCreateSchema = z.object({
    couponCode: z.string().min(1, 'couponCode is required').max(100),
    discountType: z.enum(['percentage', 'flat-price'], {
        required_error: 'discountType is required'
    }),
    discountValue: z.coerce.number().positive('discountValue must be greater than 0'),
    maxDiscount: z.any(),
    minOrderValue: z.coerce.number().min(0).optional(),
    usageLimit: z.coerce.number().int().min(0).optional(),
    perUserLimit: z.coerce.number().int().min(0).optional(),
    customerScope: z.enum(['all', 'first-time']).optional(),
    startDate: z.string().optional().or(z.literal('')),
    endDate: z.string().optional().or(z.literal('')),
    isFirstOrderOnly: z.boolean().optional()
});

export const validateRestaurantCreateCouponDto = (body = {}) => {
    const result = baseCreateSchema.safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0]?.message || 'Invalid coupon payload');
    }

    const data = result.data;
    const discountType = data.discountType;
    const discountValue = Number(data.discountValue);
    const maxDiscountRaw = data.maxDiscount;

    let maxDiscount = undefined;
    if (discountType === 'percentage') {
        if (maxDiscountRaw === undefined || maxDiscountRaw === null || maxDiscountRaw === '') {
            throw new ValidationError('maxDiscount is required for percentage coupons');
        }
        maxDiscount = Number(maxDiscountRaw);
        if (!Number.isFinite(maxDiscount) || maxDiscount < 0) {
            throw new ValidationError('maxDiscount must be greater than or equal to 0');
        }
    }

    const startDate = toDateOrUndefined(data.startDate, 'startDate');
    const endDate = toDateOrUndefined(data.endDate, 'endDate');
    if (startDate && endDate && endDate.getTime() <= startDate.getTime()) {
        throw new ValidationError('endDate must be after startDate');
    }

    return {
        couponCode: String(data.couponCode).trim().toUpperCase(),
        discountType,
        discountValue,
        maxDiscount,
        minOrderValue: data.minOrderValue !== undefined ? Number(data.minOrderValue) : 0,
        usageLimit: data.usageLimit !== undefined ? Number(data.usageLimit) : null,
        perUserLimit: data.perUserLimit !== undefined ? Number(data.perUserLimit) : null,
        customerScope: data.customerScope || 'all',
        startDate,
        endDate,
        isFirstOrderOnly: Boolean(data.isFirstOrderOnly)
    };
};

const baseUpdateSchema = z.object({
    couponCode: z.string().min(1).max(100).optional(),
    discountType: z.enum(['percentage', 'flat-price']).optional(),
    discountValue: z.coerce.number().positive().optional(),
    maxDiscount: z.any().optional(),
    minOrderValue: z.coerce.number().min(0).optional(),
    usageLimit: z.coerce.number().int().min(0).nullable().optional(),
    perUserLimit: z.coerce.number().int().min(0).nullable().optional(),
    customerScope: z.enum(['all', 'first-time']).optional(),
    startDate: z.string().optional().or(z.literal('')),
    endDate: z.string().optional().or(z.literal('')),
    isFirstOrderOnly: z.boolean().optional()
});

export const validateRestaurantUpdateCouponDto = (body = {}) => {
    const result = baseUpdateSchema.safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0]?.message || 'Invalid coupon payload');
    }

    const data = result.data;
    if (Object.keys(data).length === 0) {
        throw new ValidationError('At least one field is required for update');
    }

    const normalized = {};
    if (data.couponCode !== undefined) normalized.couponCode = String(data.couponCode).trim().toUpperCase();
    if (data.discountType !== undefined) normalized.discountType = data.discountType;
    if (data.discountValue !== undefined) normalized.discountValue = Number(data.discountValue);
    if (data.minOrderValue !== undefined) normalized.minOrderValue = Number(data.minOrderValue);
    if (data.usageLimit !== undefined) normalized.usageLimit = data.usageLimit === null ? null : Number(data.usageLimit);
    if (data.perUserLimit !== undefined) normalized.perUserLimit = data.perUserLimit === null ? null : Number(data.perUserLimit);
    if (data.customerScope !== undefined) normalized.customerScope = data.customerScope;
    if (data.isFirstOrderOnly !== undefined) normalized.isFirstOrderOnly = Boolean(data.isFirstOrderOnly);
    if (data.startDate !== undefined) normalized.startDate = toDateOrUndefined(data.startDate, 'startDate');
    if (data.endDate !== undefined) normalized.endDate = toDateOrUndefined(data.endDate, 'endDate');

    if (data.maxDiscount !== undefined) {
        if (data.maxDiscount === null || data.maxDiscount === '') {
            normalized.maxDiscount = null;
        } else {
            const parsed = Number(data.maxDiscount);
            if (!Number.isFinite(parsed) || parsed < 0) {
                throw new ValidationError('maxDiscount must be greater than or equal to 0');
            }
            normalized.maxDiscount = parsed;
        }
    }

    return normalized;
};
