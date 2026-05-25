import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { config } from "../../../../config/env.js";

const deliveryBoySchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FoodRestaurant",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    username: { type: String, required: true, trim: true, unique: true },
    password: { type: String, required: true },
    passwordChangedAt: {
      type: Date,
      default: Date.now,
    },
    isActive: { type: Boolean, default: true, index: true },
    availabilityStatus: {
      type: String,
      enum: ["online", "offline"],
      default: "offline",
      index: true,
    },
    lastSeenAt: {
      type: Date,
      default: null,
    },
    currentOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FoodOrder",
      default: null,
    },
  },
  {
    collection: "food_delivery_boys",
    timestamps: true,
  },
);

deliveryBoySchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) return next();
  this.passwordChangedAt = new Date();
  const salt = await bcrypt.genSalt(config.bcryptSaltRounds);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

deliveryBoySchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(String(candidate || ""), this.password);
};

export const FoodDeliveryBoy = mongoose.model(
  "FoodDeliveryBoy",
  deliveryBoySchema,
);
