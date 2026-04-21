import mongoose from 'mongoose';

const diningFeeSettingsSchema = new mongoose.Schema(
    {
        platformFee: { type: Number, min: 0 },
        gstRate: { type: Number, min: 0, max: 100 },
        isActive: { type: Boolean, default: true, index: true }
    },
    { collection: 'food_dining_fee_settings', timestamps: true }
);

diningFeeSettingsSchema.index({ isActive: 1, createdAt: -1 });

export const FoodDiningFeeSettings = mongoose.model('FoodDiningFeeSettings', diningFeeSettingsSchema);
