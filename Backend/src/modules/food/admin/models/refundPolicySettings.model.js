import mongoose from 'mongoose';

const refundModeEnum = ['automatic', 'manual'];

const refundPolicySettingsSchema = new mongoose.Schema(
    {
        cancelledByRestaurant: {
            type: String,
            enum: refundModeEnum,
            default: 'automatic'
        },
        cancelledByUser: {
            type: String,
            enum: refundModeEnum,
            default: 'manual'
        },
        isActive: { type: Boolean, default: true, index: true }
    },
    { collection: 'food_refund_policy_settings', timestamps: true }
);

refundPolicySettingsSchema.index({ isActive: 1, createdAt: -1 });

export const FoodRefundPolicySettings = mongoose.model(
    'FoodRefundPolicySettings',
    refundPolicySettingsSchema
);
