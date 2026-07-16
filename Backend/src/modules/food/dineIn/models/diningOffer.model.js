import mongoose from 'mongoose';

const happyHourSlotSchema = new mongoose.Schema(
    {
        start: { type: String, trim: true, default: '' }, // 'HH:MM' 24-hour format
        end:   { type: String, trim: true, default: '' }, // 'HH:MM' 24-hour format
    },
    { _id: false }
);

const scheduleSchema = new mongoose.Schema(
    {
        mode: {
            type: String,
            enum: ['all_days', 'weekdays', 'weekends', 'custom'],
            default: 'all_days',
        },
        // Array of weekday indices (0=Sun, 1=Mon, … 6=Sat). Used only when mode='custom'.
        customDays: {
            type: [Number],
            default: [],
        },
        // One or more happy-hour windows per day. Empty array = full day.
        happyHours: {
            type: [happyHourSlotSchema],
            default: [],
        },
    },
    { _id: false }
);

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
        usageLimit: {
            type: Number,
            default: null,
            min: 1,
        },
        perUserLimit: {
            type: Number,
            default: null,
            min: 1,
        },
        usedCount: {
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
        // ─── NEW: Scheduling ─────────────────────────────────────────────────────
        schedule: {
            type: scheduleSchema,
            default: () => ({ mode: 'all_days', customDays: [], happyHours: [] }),
        },
        // ─── NEW: Terms & Conditions ─────────────────────────────────────────────
        termsAndConditions: {
            type: String,
            trim: true,
            default: '',
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

