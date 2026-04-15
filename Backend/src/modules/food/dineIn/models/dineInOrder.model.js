import mongoose from 'mongoose';

/**
 * DineInOrder — Represents one round of ordering within a TableSession.
 * A single session can have multiple DineInOrders (round 1, round 2...).
 *
 * Item lifecycle: received → preparing → ready → served
 * Order lifecycle: received → preparing → ready → served
 *
 * Collection: food_dine_in_orders
 */

const dineInOrderItemSchema = new mongoose.Schema(
    {
        itemId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodItem',
            required: true,
        },

        name: {
            type: String,
            required: true,
            trim: true,
        },

        price: {
            type: Number,
            required: true,
            min: 0,
        },

        quantity: {
            type: Number,
            required: true,
            min: 1,
            default: 1,
        },

        // Customer notes for this item (e.g. "no onion", "extra spicy")
        notes: {
            type: String,
            trim: true,
            default: '',
        },

        // Per-item status (kitchen can update each item individually)
        status: {
            type: String,
            enum: ['received', 'preparing', 'ready', 'served', 'cancelled'],
            default: 'received',
        },

        // Calculated field — price * quantity
        itemTotal: {
            type: Number,
            default: 0,
            min: 0,
        },

        // Whether item is veg or non-veg (for display)
        isVeg: {
            type: Boolean,
            default: true,
        },
    },
    { _id: true }
);

const dineInOrderSchema = new mongoose.Schema(
    {
        // Parent session this order belongs to
        sessionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodTableSession',
            required: true,
            index: true,
        },

        restaurantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            required: true,
            index: true,
        },

        // Denormalized for fast kitchen dashboard queries
        tableNumber: {
            type: String,
            required: true,
            trim: true,
        },

        // Items in this order round
        items: {
            type: [dineInOrderItemSchema],
            default: [],
        },

        // Which round of ordering this is (1st, 2nd, 3rd...)
        roundNumber: {
            type: Number,
            default: 1,
            min: 1,
        },

        // Overall order status (updated as kitchen works through items)
        status: {
            type: String,
            enum: ['received', 'preparing', 'ready', 'served', 'cancelled'],
            default: 'received',
            index: true,
        },

        // Order-level totals
        subtotal: {
            type: Number,
            default: 0,
            min: 0,
        },

        // Timestamps for kitchen SLA tracking
        placedAt: {
            type: Date,
            default: () => new Date(),
        },

        preparingAt: {
            type: Date,
            default: null,
        },

        readyAt: {
            type: Date,
            default: null,
        },

        servedAt: {
            type: Date,
            default: null,
        },

        // Optional special instruction for the whole order round
        specialRequest: {
            type: String,
            trim: true,
            default: '',
        },

        // Cancellation reason if status is 'cancelled'
        reason: {
            type: String,
            trim: true,
            default: '',
        },

        cancelledAt: {
            type: Date,
            default: null,
        },
    },
    {
        collection: 'food_dine_in_orders',
        timestamps: true,
    }
);

// Pre-save hook: auto-calculate itemTotal and subtotal
dineInOrderSchema.pre('save', function (next) {
    let subtotal = 0;
    for (const item of this.items) {
        item.itemTotal = Number((item.price * item.quantity).toFixed(2));
        subtotal += item.itemTotal;
    }
    this.subtotal = Number(subtotal.toFixed(2));
    next();
});

dineInOrderSchema.index({ sessionId: 1, roundNumber: 1 });
dineInOrderSchema.index({ restaurantId: 1, status: 1 });
dineInOrderSchema.index({ restaurantId: 1, tableNumber: 1, status: 1 });

export const FoodDineInOrder = mongoose.model(
    'FoodDineInOrder',
    dineInOrderSchema
);
