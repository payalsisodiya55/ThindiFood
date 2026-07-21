import mongoose from 'mongoose';

const restaurantFaqSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: true,
      trim: true,
    },
    answer: {
      type: String,
      required: true,
      trim: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

restaurantFaqSchema.index({ displayOrder: 1 });
restaurantFaqSchema.index({ isActive: 1, displayOrder: 1 });

export const RestaurantFaq = mongoose.model('RestaurantFaq', restaurantFaqSchema);
