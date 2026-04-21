import mongoose from 'mongoose';

const diningOfferSchema = new mongoose.Schema(
    {
        restaurantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            required: true,
            index: true,
        },
        restaurantName: {
            type: String,
            trim: true,
            default: '',
        },
        title: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
            default: '',
        },
        discountType: {
            type: String,
            enum: ['percentage', 'flat'],
            default: 'percentage',
        },
        discountValue: {
            type: Number,
            required: true,
            min: 0,
        },
        maxDiscount: {
            type: Number,
            default: null,
            min: 0,
        },
        minBillAmount: {
            type: Number,
            default: 0,
            min: 0,
        },
        fundedBy: {
            type: String,
            enum: ['platform', 'restaurant'],
            required: true,
        },
        createdByRole: {
            type: String,
            enum: ['admin', 'restaurant'],
            required: true,
        },
        createdById: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        offerScope: {
            type: String,
            enum: ['overall_bill'],
            default: 'overall_bill',
        },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'inactive',
            index: true,
        },
        approvalStatus: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending',
            index: true,
        },
        rejectionReason: {
            type: String,
            trim: true,
            default: '',
        },
        startDate: {
            type: Date,
            default: null,
        },
        endDate: {
            type: Date,
            default: null,
        },
        priority: {
            type: Number,
            default: 0,
        },
    },
    {
        collection: 'food_dining_offers',
        timestamps: true,
    }
);

diningOfferSchema.index({ restaurantId: 1, approvalStatus: 1, status: 1 });
diningOfferSchema.index({ createdByRole: 1, fundedBy: 1, createdAt: -1 });

export const FoodDiningOffer = mongoose.model('FoodDiningOffer', diningOfferSchema);
