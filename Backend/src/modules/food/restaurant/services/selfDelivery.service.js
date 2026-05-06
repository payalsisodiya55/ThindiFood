import mongoose from "mongoose";
import { ValidationError, NotFoundError, ForbiddenError, AuthError } from "../../../../core/auth/errors.js";
import { FoodRestaurant } from "../models/restaurant.model.js";
import { FoodDeliveryBoy } from "../models/deliveryBoy.model.js";
import { FoodOrder } from "../../orders/models/order.model.js";
import { FoodBusinessSettings } from "../../admin/models/businessSettings.model.js";
import * as foodTransactionService from "../../orders/services/foodTransaction.service.js";

const FINAL_SELF_DELIVERY_STATUSES = new Set([
  "delivered_self",
  "cancelled_by_user",
  "cancelled_by_restaurant",
  "cancelled_by_admin",
]);

const ACTIVE_SELF_DELIVERY_STATUSES = new Set([
  "assigned_to_boy",
  "picked_up_by_boy",
  "out_for_delivery",
]);

function toObjectId(value, label = "Id") {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
  return new mongoose.Types.ObjectId(value);
}

function toLowerUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function pushStatusHistory(order, { byRole, byId, from, to, note = "" }) {
  order.statusHistory = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  order.statusHistory.push({
    at: new Date(),
    byRole,
    byId: byId || undefined,
    from,
    to,
    note,
  });
}

export function isSelfDeliveryOrder(orderLike = {}) {
  return (
    String(orderLike?.fulfillmentType || "").toLowerCase() === "delivery" &&
    (
      String(orderLike?.deliveryType || "").toLowerCase() === "self" ||
      String(orderLike?.deliveryFleet || "").toLowerCase() === "self"
    )
  );
}

export async function getSelfDeliveryGlobalSettings() {
  const settings = await FoodBusinessSettings.findOne().sort({ createdAt: -1 }).lean();
  return {
    globalEnabled: settings?.selfDelivery?.globalEnabled !== false,
  };
}

export async function updateSelfDeliveryGlobalSettings(payload = {}) {
  const nextEnabled = payload?.globalEnabled !== false;
  const doc = await FoodBusinessSettings.findOneAndUpdate(
    {},
    { $set: { "selfDelivery.globalEnabled": nextEnabled } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  return {
    globalEnabled: doc?.selfDelivery?.globalEnabled !== false,
  };
}

export async function getRestaurantSelfDeliveryConfigAdmin(restaurantId) {
  const restaurant = await FoodRestaurant.findById(restaurantId)
    .select("restaurantName selfDelivery")
    .lean();
  if (!restaurant) throw new NotFoundError("Restaurant not found");
  return {
    restaurantId: restaurant._id,
    restaurantName: restaurant.restaurantName,
    selfDelivery: restaurant.selfDelivery || {},
  };
}

export async function updateRestaurantSelfDeliveryConfigById(restaurantId, payload = {}) {
  const update = {
    "selfDelivery.enabled": payload?.enabled === true,
    "selfDelivery.radius": Math.max(0, Number(payload?.radius ?? 3) || 0),
    "selfDelivery.fee": Math.max(0, Number(payload?.fee ?? 0) || 0),
    "selfDelivery.minOrderAmount": Math.max(
      0,
      Number(payload?.minOrderAmount ?? 0) || 0,
    ),
    "selfDelivery.timings.start": String(
      payload?.timings?.start || payload?.start || "10:00",
    ).trim(),
    "selfDelivery.timings.end": String(
      payload?.timings?.end || payload?.end || "22:00",
    ).trim(),
  };

  const restaurant = await FoodRestaurant.findByIdAndUpdate(
    restaurantId,
    { $set: update },
    { new: true },
  )
    .select("restaurantName selfDelivery")
    .lean();

  if (!restaurant) throw new NotFoundError("Restaurant not found");
  return {
    restaurantId: restaurant._id,
    restaurantName: restaurant.restaurantName,
    selfDelivery: restaurant.selfDelivery || {},
  };
}

export async function createDeliveryBoy(restaurantId, payload = {}) {
  const restaurantObjectId = toObjectId(restaurantId, "Restaurant id");
  const name = String(payload?.name || "").trim();
  const phone = String(payload?.phone || "").trim();
  const username = toLowerUsername(payload?.username);
  const password = String(payload?.password || "");

  if (!name || !phone || !username || !password) {
    throw new ValidationError("Name, phone, username and password are required");
  }

  const existing = await FoodDeliveryBoy.findOne({ username }).lean();
  if (existing) {
    throw new ValidationError("Username already exists");
  }

  const deliveryBoy = await FoodDeliveryBoy.create({
    restaurantId: restaurantObjectId,
    name,
    phone,
    username,
    password,
  });

  return deliveryBoy.toObject();
}

export async function listDeliveryBoys(restaurantId) {
  return FoodDeliveryBoy.find({
    restaurantId: toObjectId(restaurantId, "Restaurant id"),
  })
    .populate("currentOrderId", "orderId orderStatus")
    .sort({ createdAt: -1 })
    .lean();
}

export async function updateDeliveryBoy(restaurantId, deliveryBoyId, payload = {}) {
  const restaurantObjectId = toObjectId(restaurantId, "Restaurant id");
  const deliveryBoy = await FoodDeliveryBoy.findOne({
    _id: toObjectId(deliveryBoyId, "Delivery boy id"),
    restaurantId: restaurantObjectId,
  });
  if (!deliveryBoy) throw new NotFoundError("Delivery boy not found");

  if (payload?.name !== undefined) deliveryBoy.name = String(payload.name || "").trim();
  if (payload?.phone !== undefined) deliveryBoy.phone = String(payload.phone || "").trim();
  if (payload?.isActive !== undefined) deliveryBoy.isActive = payload.isActive === true;
  if (payload?.password) deliveryBoy.password = String(payload.password);

  await deliveryBoy.save();
  return deliveryBoy.toObject();
}

export async function deactivateDeliveryBoy(restaurantId, deliveryBoyId) {
  return updateDeliveryBoy(restaurantId, deliveryBoyId, { isActive: false });
}

export async function assignDeliveryBoyToOrder(restaurantId, orderId, deliveryBoyId) {
  const restaurantObjectId = toObjectId(restaurantId, "Restaurant id");
  const order = await FoodOrder.findOne({
    _id: toObjectId(orderId, "Order id"),
    restaurantId: restaurantObjectId,
  });
  if (!order) throw new NotFoundError("Order not found");
  if (!isSelfDeliveryOrder(order)) {
    throw new ValidationError("This order is not a self-delivery order");
  }
  if (String(order.orderStatus || "").toLowerCase() !== "ready_for_pickup") {
    throw new ValidationError("Delivery boy can be assigned only after order is ready");
  }

  const deliveryBoy = await FoodDeliveryBoy.findOne({
    _id: toObjectId(deliveryBoyId, "Delivery boy id"),
    restaurantId: restaurantObjectId,
    isActive: true,
  });
  if (!deliveryBoy) throw new NotFoundError("Active delivery boy not found");

  if (deliveryBoy.currentOrderId) {
    const activeOrder = await FoodOrder.findById(deliveryBoy.currentOrderId)
      .select("orderStatus")
      .lean();
    if (activeOrder && !FINAL_SELF_DELIVERY_STATUSES.has(String(activeOrder.orderStatus || "").toLowerCase())) {
      throw new ValidationError("Delivery boy already has an active order");
    }
  }

  const from = order.orderStatus;
  order.selfDelivery = {
    ...(order.selfDelivery?.toObject?.() || order.selfDelivery || {}),
    deliveryBoyId: deliveryBoy._id,
    assignedAt: new Date(),
    otpVerified: Boolean(order.selfDelivery?.otpVerified),
  };
  order.orderStatus = "assigned_to_boy";
  pushStatusHistory(order, {
    byRole: "RESTAURANT",
    byId: restaurantObjectId,
    from,
    to: "assigned_to_boy",
    note: `Assigned to ${deliveryBoy.name}`,
  });

  deliveryBoy.currentOrderId = order._id;
  await Promise.all([order.save(), deliveryBoy.save()]);

  return FoodOrder.findById(order._id)
    .populate("selfDelivery.deliveryBoyId", "name phone username isActive currentOrderId")
    .lean();
}

export async function listOrdersForDeliveryBoy(deliveryBoyId) {
  const boyObjectId = toObjectId(deliveryBoyId, "Delivery boy id");
  return FoodOrder.find({
    "selfDelivery.deliveryBoyId": boyObjectId,
    fulfillmentType: "delivery",
    deliveryType: "self",
  })
    .populate("restaurantId", "restaurantName ownerPhone location area city")
    .populate("userId", "name phone")
    .sort({ createdAt: -1 })
    .lean();
}

export async function getOrderForDeliveryBoy(orderId, deliveryBoyId) {
  const order = await FoodOrder.findOne({
    _id: toObjectId(orderId, "Order id"),
    "selfDelivery.deliveryBoyId": toObjectId(deliveryBoyId, "Delivery boy id"),
  })
    .populate("restaurantId", "restaurantName ownerPhone location area city")
    .populate("userId", "name phone")
    .lean();

  if (!order) throw new NotFoundError("Order not found");
  return order;
}

async function loadAssignedSelfDeliveryOrder(orderId, deliveryBoyId) {
  const order = await FoodOrder.findOne({
    _id: toObjectId(orderId, "Order id"),
    "selfDelivery.deliveryBoyId": toObjectId(deliveryBoyId, "Delivery boy id"),
  }).select("+deliveryOtp");

  if (!order) throw new NotFoundError("Order not found");
  if (!isSelfDeliveryOrder(order)) {
    throw new ValidationError("This order is not a self-delivery order");
  }
  return order;
}

export async function markOrderPickedUpByDeliveryBoy(orderId, deliveryBoyId) {
  const order = await loadAssignedSelfDeliveryOrder(orderId, deliveryBoyId);
  if (String(order.orderStatus || "").toLowerCase() !== "assigned_to_boy") {
    throw new ValidationError("Order is not ready for pickup confirmation");
  }

  const from = order.orderStatus;
  order.orderStatus = "picked_up_by_boy";
  order.selfDelivery = {
    ...(order.selfDelivery?.toObject?.() || order.selfDelivery || {}),
    pickedUpAt: new Date(),
  };
  pushStatusHistory(order, {
    byRole: "DELIVERY_BOY",
    byId: deliveryBoyId,
    from,
    to: "picked_up_by_boy",
  });
  await order.save();
  return order.toObject();
}

export async function markOrderOutForDeliveryByDeliveryBoy(orderId, deliveryBoyId) {
  const order = await loadAssignedSelfDeliveryOrder(orderId, deliveryBoyId);
  if (String(order.orderStatus || "").toLowerCase() !== "picked_up_by_boy") {
    throw new ValidationError("Order must be picked up first");
  }

  const from = order.orderStatus;
  order.orderStatus = "out_for_delivery";
  order.selfDelivery = {
    ...(order.selfDelivery?.toObject?.() || order.selfDelivery || {}),
    outForDeliveryAt: new Date(),
  };
  pushStatusHistory(order, {
    byRole: "DELIVERY_BOY",
    byId: deliveryBoyId,
    from,
    to: "out_for_delivery",
  });
  await order.save();
  return order.toObject();
}

export async function deliverSelfDeliveryOrder(orderId, deliveryBoyId, otp) {
  const otpStr = String(otp || "").replace(/\D/g, "").trim();
  if (!otpStr) throw new ValidationError("OTP is required");

  const order = await loadAssignedSelfDeliveryOrder(orderId, deliveryBoyId);
  if (String(order.orderStatus || "").toLowerCase() !== "out_for_delivery") {
    throw new ValidationError("Order is not out for delivery");
  }

  const expected = String(order.deliveryOtp || "").trim();
  if (!expected || expected !== otpStr) {
    throw new ValidationError("Invalid OTP");
  }

  const from = order.orderStatus;
  order.orderStatus = "delivered_self";
  order.deliveryOtp = "";
  order.selfDelivery = {
    ...(order.selfDelivery?.toObject?.() || order.selfDelivery || {}),
    deliveredAt: new Date(),
    otpVerified: true,
  };
  pushStatusHistory(order, {
    byRole: "DELIVERY_BOY",
    byId: deliveryBoyId,
    from,
    to: "delivered_self",
  });

  await order.save();

  await FoodDeliveryBoy.updateOne(
    { _id: toObjectId(deliveryBoyId, "Delivery boy id") },
    { $set: { currentOrderId: null } },
  );

  try {
    await foodTransactionService.updateTransactionStatus(order._id, "self_delivered", {
      status: "captured",
      recordedByRole: "DELIVERY_BOY",
      recordedById: deliveryBoyId,
      note: "Order delivered by self-delivery boy",
    });
    await foodTransactionService.applyWalletSettlementForFoodOrder(order._id, {
      recordedByRole: "DELIVERY_BOY",
      recordedById: deliveryBoyId,
    });
  } catch {
    // Non-blocking financial sync; order delivery should still complete.
  }

  return order.toObject();
}
