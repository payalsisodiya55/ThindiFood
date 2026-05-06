import mongoose from 'mongoose';

/**
 * TableBooking — Represents a table reservation for a future visit.
 * Created when a user pre-books a table from the app.
 *
 * Status lifecycle:
 *   PENDING  → Restaurant sees the request
 *   ACCEPTED → Restaurant has confirmed the slot
 *   DECLINED → Restaurant rejected it
 *   CHECKED_IN → Restaurant notified user table is ready (no session created here)
 *   CANCELLED → User cancelled the booking
 *
 * NOTE: This booking NEVER creates a session.
 * Session is only created when the user scans the QR code at the table.
 *
 * Collection: food_table_bookings
 */
const tableBookingSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodUser',
            required: true,
            index: true,
        },

        restaurantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            required: true,
            index: true,
        },

        // Snapshot of restaurant info at time of booking
        restaurantRef: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },

        // Snapshot of user info at time of booking
        userRef: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },

        guests: {
            type: Number,
            required: true,
            min: 1,
        },

        date: {
            type: Date,
            required: true,
        },

        timeSlot: {
            type: String,
            required: true,
            trim: true,
        },

        mealType: {
            type: String,
            enum: ['lunch', 'dinner'],
            trim: true,
        },

        specialRequest: {
            type: String,
            trim: true,
            default: '',
        },

        status: {
            type: String,
            enum: ['PENDING', 'ACCEPTED', 'DECLINED', 'CHECKED_IN', 'CANCELLED', 'COMPLETED'],
            default: 'PENDING',
            index: true,
        },

        // Short readable booking ID (e.g. "TBK-7G3K")
        bookingId: {
            type: String,
            unique: true,
            index: true,
        },

        // Timestamps for each status transition
        acceptedAt: { type: Date, default: null },
        declinedAt: { type: Date, default: null },
        checkedInAt: { type: Date, default: null },
        cancelledAt: { type: Date, default: null },

        // If a session was eventually created via QR and linked to this booking
        sessionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodTableSession',
            default: null,
        },
    },
    {
        collection: 'food_table_bookings',
        timestamps: true,
    }
);

tableBookingSchema.index({ restaurantId: 1, status: 1 });
tableBookingSchema.index({ userId: 1, status: 1 });

// Auto-generate short readable bookingId before save
tableBookingSchema.pre('save', function (next) {
    if (!this.bookingId) {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let id = 'TBK-';
        for (let i = 0; i < 6; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        this.bookingId = id;
    }
    next();
});

export const FoodTableBooking = mongoose.model('FoodTableBooking', tableBookingSchema);
