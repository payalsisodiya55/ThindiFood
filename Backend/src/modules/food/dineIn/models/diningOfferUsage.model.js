import mongoose from 'mongoose';

const foodDiningOfferUsageSchema = new mongoose.Schema(
    {
        offerId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodDiningOffer', index: true, required: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodUser', index: true, required: true },
        count: { type: Number, default: 0, min: 0 },
        lastUsedAt: { type: Date, default: null },
    },
    { collection: 'food_dining_offer_usages', timestamps: true }
);

foodDiningOfferUsageSchema.index({ offerId: 1, userId: 1 }, { unique: true });

export const FoodDiningOfferUsage = mongoose.model('FoodDiningOfferUsage', foodDiningOfferUsageSchema);
