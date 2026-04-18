import mongoose from 'mongoose';

const restaurantOfferSchema = new mongoose.Schema(
    {
        restaurantId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
        },
        products: [
            {
                productId: { type: mongoose.Schema.Types.ObjectId, required: true },
                name: { type: String, default: '' },
            },
        ],
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
        },
        maxItemsPerOrder: {
            type: Number,
            default: null,
            min: 1,
        },
        perUserRedeemLimit: {
            type: Number,
            default: null,
            min: 1,
        },
        startDate: {
            type: Date,
            default: null,
        },
        endDate: {
            type: Date,
            default: null,
        },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'inactive',
        },
        approvalStatus: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending',
        },
        rejectionReason: {
            type: String,
            default: '',
        },
    },
    { timestamps: true }
);

export const RestaurantOffer = mongoose.model('RestaurantOffer', restaurantOfferSchema);
