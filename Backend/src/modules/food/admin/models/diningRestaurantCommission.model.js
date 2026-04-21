import mongoose from 'mongoose';

const diningRestaurantCommissionSchema = new mongoose.Schema(
    {
        restaurantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            required: true,
            unique: true,
            index: true
        },
        defaultCommission: {
            type: {
                type: String,
                enum: ['percentage', 'amount'],
                default: 'percentage'
            },
            value: { type: Number, default: 0 }
        },
        notes: { type: String, trim: true, default: '' },
        status: { type: Boolean, default: true, index: true }
    },
    { collection: 'food_dining_restaurant_commissions', timestamps: true }
);

export const FoodDiningRestaurantCommission = mongoose.model(
    'FoodDiningRestaurantCommission',
    diningRestaurantCommissionSchema
);
