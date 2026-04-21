import mongoose from 'mongoose';

/**
 * TableSession — Represents a live dine-in session at a table.
 * Created when a customer scans the QR code and logs in.
 * A session holds all order rounds until billing is done.
 *
 * Lifecycle: created → active → bill_requested → completed | expired
 *
 * Collection: food_table_sessions
 */
const tableSessionSchema = new mongoose.Schema(
    {
        restaurantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            required: true,
            index: true,
        },

        // Physical table identifier (e.g. "T5")
        tableNumber: {
            type: String,
            required: true,
            trim: true,
        },

        // Reference to the table document
        tableId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurantTable',
            default: null,
        },

        // The customer who scanned the QR and started session
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodUser',
            required: true,
            index: true,
        },

        // Session lifecycle status
        status: {
            type: String,
            enum: ['active', 'bill_requested', 'completed', 'expired'],
            default: 'active',
            index: true,
        },

        // All order rounds within this session (references to DineInOrder)
        orders: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'FoodDineInOrder',
            },
        ],

        // Running totals (updated after each order round)
        subtotal: {
            type: Number,
            default: 0,
            min: 0,
        },

        taxAmount: {
            type: Number,
            default: 0,
            min: 0,
        },

        totalAmount: {
            type: Number,
            default: 0,
            min: 0,
        },

        // Payment info (filled when session is closed)
        paymentMethod: {
            type: String,
            enum: ['online', 'cash', 'upi', 'counter', ''],
            default: '',
        },

        isPaid: {
            type: Boolean,
            default: false,
        },

        paidAt: {
            type: Date,
            default: null,
        },

        // Pay-at-counter flow
        paymentMode: {
            type: String,
            enum: ['ONLINE', 'COUNTER', ''],
            default: '',
        },

        paymentStatus: {
            type: String,
            enum: ['PENDING', 'PAID', ''],
            default: '',
        },

        paymentRequestedAt: {
            type: Date,
            default: null,
        },

        // Once finalized, no new items should be added to this session.
        isBillFinalized: {
            type: Boolean,
            default: false,
        },

        // Session timestamps
        startedAt: {
            type: Date,
            default: () => new Date(),
        },

        closedAt: {
            type: Date,
            default: null,
        },

        closedByRole: {
            type: String,
            enum: ['USER', 'RESTAURANT', 'SYSTEM', ''],
            default: '',
        },

        closureType: {
            type: String,
            enum: ['PAID', 'EMPTY_CANCELLED', 'EXPIRED', ''],
            default: '',
        },

        closeReason: {
            type: String,
            trim: true,
            default: '',
        },

        // Auto-expire sessions older than 4 hours if not closed
        expiresAt: {
            type: Date,
            default: () => new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours
            index: { expireAfterSeconds: 0 },
        },


        // Optional notes (e.g. "anniversary couple", "allergy note")
        notes: {
            type: String,
            trim: true,
            default: '',
        },

        // If this session was created from a pre-booked table reservation
        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodTableBooking',
            default: null,
        },
        billingSnapshot: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
    },
    {
        collection: 'food_table_sessions',
        timestamps: true,
    }
);

tableSessionSchema.index({ restaurantId: 1, status: 1 });
tableSessionSchema.index({ restaurantId: 1, tableNumber: 1, status: 1 });
tableSessionSchema.index({ userId: 1, status: 1 });

export const FoodTableSession = mongoose.model(
    'FoodTableSession',
    tableSessionSchema
);
