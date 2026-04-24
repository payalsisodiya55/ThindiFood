import { z } from 'zod';
import { ValidationError } from '../../../../core/auth/errors.js';

const refundModeSchema = z.enum(['automatic', 'manual']);

const schema = z.object({
    cancelledByRestaurant: refundModeSchema.optional(),
    cancelledByUser: refundModeSchema.optional(),
    isActive: z.boolean().optional()
});

export const validateRefundPolicySettingsUpsertDto = (body) => {
    const normalized = {
        cancelledByRestaurant:
            body?.cancelledByRestaurant !== undefined
                ? String(body.cancelledByRestaurant).trim().toLowerCase()
                : undefined,
        cancelledByUser:
            body?.cancelledByUser !== undefined
                ? String(body.cancelledByUser).trim().toLowerCase()
                : undefined,
        isActive: body?.isActive !== undefined ? Boolean(body.isActive) : undefined
    };

    const result = schema.safeParse(normalized);
    if (!result.success) {
        throw new ValidationError(result.error.errors?.[0]?.message || 'Validation failed');
    }
    return result.data;
};
