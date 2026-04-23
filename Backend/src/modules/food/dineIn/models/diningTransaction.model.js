import mongoose from 'mongoose';

const diningTransactionItemSchema = new mongoose.Schema(
    {
        name: { type: String, default: '', trim: true },
        quantity: { type: Number, default: 0, min: 0 },
        price: { type: Number, default: 0, min: 0 },
        total: { type: Number, default: 0, min: 0 },
        status: { type: String, default: '', trim: true },
    },
    { _id: false }
);

const diningTransactionSchema = new mongoose.Schema(
    {
        orderId: { type: String, required: true, trim: true, index: true },
        sessionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodTableSession',
            required: true,
            unique: true,
            index: true,
        },
        restaurantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            required: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodUser',
            default: null,
            index: true,
        },
        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodTableBooking',
            default: null,
            index: true,
        },
        restaurantName: { type: String, default: '', trim: true },
        userName: { type: String, default: '', trim: true },
        userPhone: { type: String, default: '', trim: true },
        tableNo: { type: String, default: '', trim: true },
        orderType: {
            type: String,
            enum: ['walk-in', 'pre-book'],
            default: 'walk-in',
            index: true,
        },
        paymentType: {
            type: String,
            enum: ['online', 'cod'],
            default: 'online',
            index: true,
        },
        status: { type: String, default: 'paid', trim: true, index: true },
        subtotal: { type: Number, default: 0, min: 0 },
        discount: { type: Number, default: 0, min: 0 },
        platformCouponDiscount: { type: Number, default: 0, min: 0 },
        restaurantCouponDiscount: { type: Number, default: 0, min: 0 },
        restaurantOfferDiscount: { type: Number, default: 0, min: 0 },
        finalAmount: { type: Number, default: 0, min: 0 },
        commission: { type: Number, default: 0, min: 0 },
        gst: { type: Number, default: 0, min: 0 },
        platformFee: { type: Number, default: 0, min: 0 },
        adminEarning: { type: Number, default: 0, min: 0 },
        restaurantEarning: { type: Number, default: 0, min: 0 },
        codDue: { type: Number, default: 0, min: 0 },
        itemCount: { type: Number, default: 0, min: 0 },
        items: { type: [diningTransactionItemSchema], default: [] },
        orderRefs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FoodDineInOrder' }],
        paidAt: { type: Date, default: null, index: true },
    },
    {
        collection: 'food_dining_transactions',
        timestamps: true,
    }
);

diningTransactionSchema.index({ restaurantId: 1, createdAt: -1 });
diningTransactionSchema.index({ paymentType: 1, createdAt: -1 });
diningTransactionSchema.index({ orderType: 1, createdAt: -1 });

export const FoodDiningTransaction = mongoose.model('FoodDiningTransaction', diningTransactionSchema);
