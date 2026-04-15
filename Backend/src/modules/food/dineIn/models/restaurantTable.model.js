import mongoose from 'mongoose';

/**
 * RestaurantTable — Represents a physical table inside a restaurant.
 * Each table has a unique QR code URL that customers scan to start a dine-in session.
 *
 * Collection: food_restaurant_tables
 */
const restaurantTableSchema = new mongoose.Schema(
    {
        restaurantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            required: true,
            index: true,
        },

        // e.g. "T1", "T2", "VIP-1"
        tableNumber: {
            type: String,
            required: true,
            trim: true,
        },

        // Human-readable label, e.g. "Table 1 - Window Side"
        tableLabel: {
            type: String,
            trim: true,
            default: '',
        },

        // Max number of people this table can seat
        capacity: {
            type: Number,
            default: 4,
            min: 1,
        },

        // Full URL encoded inside the QR code
        // e.g. https://thindifood.com/food/user/dine-in?r=<restaurantId>&t=T1
        qrCodeUrl: {
            type: String,
            trim: true,
            default: '',
        },

        // Cloudinary / storage URL to the QR code image (for printing)
        qrImageUrl: {
            type: String,
            trim: true,
            default: '',
        },

        // Whether this table is active (accepting sessions) or not
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },

        // Reference to current active session (null if table is free)
        currentSessionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodTableSession',
            default: null,
        },
    },
    {
        collection: 'food_restaurant_tables',
        timestamps: true,
    }
);

// Compound index: each table number must be unique per restaurant
restaurantTableSchema.index(
    { restaurantId: 1, tableNumber: 1 },
    { unique: true }
);

restaurantTableSchema.index({ restaurantId: 1, isActive: 1 });

export const FoodRestaurantTable = mongoose.model(
    'FoodRestaurantTable',
    restaurantTableSchema
);
