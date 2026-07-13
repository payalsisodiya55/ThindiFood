import { z } from 'zod';
import { ValidationError } from '../../core/auth/errors.js';

const schema = z.object({
    message: z.string().min(10, 'Message must be at least 10 characters').max(4000, 'Message too long'),
    relatedOrderId: z.string().optional()
});

export const validateSafetyEmergencyCreateDto = (body) => {
    const result = schema.safeParse({
        message: String(body?.message || '').trim(),
        relatedOrderId: body?.relatedOrderId || undefined
    });
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }
    return result.data;
};

