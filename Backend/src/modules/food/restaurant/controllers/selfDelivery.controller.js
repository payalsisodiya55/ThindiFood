import { sendResponse } from "../../../../utils/response.js";
import * as selfDeliveryService from "../services/selfDelivery.service.js";

export async function getCurrentRestaurantSelfDeliveryController(req, res, next) {
  try {
    const restaurantId = req.user?.userId;
    const data = await selfDeliveryService.getRestaurantSelfDeliveryConfigAdmin(restaurantId);
    return sendResponse(res, 200, "Self-delivery config retrieved", data);
  } catch (error) {
    next(error);
  }
}

export async function updateCurrentRestaurantSelfDeliveryController(req, res, next) {
  try {
    const restaurantId = req.user?.userId;
    const data = await selfDeliveryService.updateRestaurantSelfDeliveryConfigById(
      restaurantId,
      req.body || {},
    );
    return sendResponse(res, 200, "Self-delivery config updated", data);
  } catch (error) {
    next(error);
  }
}

export async function createDeliveryBoyController(req, res, next) {
  try {
    const restaurantId = req.user?.userId;
    const data = await selfDeliveryService.createDeliveryBoy(restaurantId, req.body || {});
    return sendResponse(res, 201, "Delivery boy created", { deliveryBoy: data });
  } catch (error) {
    next(error);
  }
}

export async function listDeliveryBoysController(req, res, next) {
  try {
    const restaurantId = req.user?.userId;
    const deliveryBoys = await selfDeliveryService.listDeliveryBoys(restaurantId);
    return sendResponse(res, 200, "Delivery boys retrieved", { deliveryBoys });
  } catch (error) {
    next(error);
  }
}

export async function updateDeliveryBoyController(req, res, next) {
  try {
    const restaurantId = req.user?.userId;
    const deliveryBoy = await selfDeliveryService.updateDeliveryBoy(
      restaurantId,
      req.params.id,
      req.body || {},
    );
    return sendResponse(res, 200, "Delivery boy updated", { deliveryBoy });
  } catch (error) {
    next(error);
  }
}

export async function deactivateDeliveryBoyController(req, res, next) {
  try {
    const restaurantId = req.user?.userId;
    const deliveryBoy = await selfDeliveryService.deactivateDeliveryBoy(
      restaurantId,
      req.params.id,
    );
    return sendResponse(res, 200, "Delivery boy deactivated", { deliveryBoy });
  } catch (error) {
    next(error);
  }
}

export async function assignDeliveryBoyToOrderController(req, res, next) {
  try {
    const restaurantId = req.user?.userId;
    const order = await selfDeliveryService.assignDeliveryBoyToOrder(
      restaurantId,
      req.params.orderId,
      req.body?.deliveryBoyId,
    );
    return sendResponse(res, 200, "Delivery boy assigned", { order });
  } catch (error) {
    next(error);
  }
}

export async function listDeliveryBoyOrdersController(req, res, next) {
  try {
    const deliveryBoyId = req.user?.userId;
    const orders = await selfDeliveryService.listOrdersForDeliveryBoy(deliveryBoyId);
    return sendResponse(res, 200, "Orders retrieved", { orders });
  } catch (error) {
    next(error);
  }
}

export async function getDeliveryBoyOrderByIdController(req, res, next) {
  try {
    const deliveryBoyId = req.user?.userId;
    const order = await selfDeliveryService.getOrderForDeliveryBoy(
      req.params.orderId,
      deliveryBoyId,
    );
    return sendResponse(res, 200, "Order retrieved", { order });
  } catch (error) {
    next(error);
  }
}

export async function pickupSelfDeliveryOrderController(req, res, next) {
  try {
    const deliveryBoyId = req.user?.userId;
    const order = await selfDeliveryService.markOrderPickedUpByDeliveryBoy(
      req.params.orderId,
      deliveryBoyId,
    );
    return sendResponse(res, 200, "Pickup confirmed", { order });
  } catch (error) {
    next(error);
  }
}

export async function outForDeliverySelfOrderController(req, res, next) {
  try {
    const deliveryBoyId = req.user?.userId;
    const order = await selfDeliveryService.markOrderOutForDeliveryByDeliveryBoy(
      req.params.orderId,
      deliveryBoyId,
    );
    return sendResponse(res, 200, "Order marked out for delivery", { order });
  } catch (error) {
    next(error);
  }
}

export async function deliverSelfDeliveryOrderController(req, res, next) {
  try {
    const deliveryBoyId = req.user?.userId;
    const order = await selfDeliveryService.deliverSelfDeliveryOrder(
      req.params.orderId,
      deliveryBoyId,
      req.body?.otp,
    );
    return sendResponse(res, 200, "Order delivered", { order });
  } catch (error) {
    next(error);
  }
}

export async function getRestaurantSelfDeliveryConfigAdminController(req, res, next) {
  try {
    const data = await selfDeliveryService.getRestaurantSelfDeliveryConfigAdmin(
      req.params.id,
    );
    return sendResponse(res, 200, "Self-delivery config retrieved", data);
  } catch (error) {
    next(error);
  }
}

export async function updateRestaurantSelfDeliveryConfigAdminController(req, res, next) {
  try {
    const data = await selfDeliveryService.updateRestaurantSelfDeliveryConfigById(
      req.params.id,
      req.body || {},
    );
    return sendResponse(res, 200, "Self-delivery config updated", data);
  } catch (error) {
    next(error);
  }
}

export async function getSelfDeliveryGlobalSettingsController(req, res, next) {
  try {
    const data = await selfDeliveryService.getSelfDeliveryGlobalSettings();
    return sendResponse(res, 200, "Self-delivery settings retrieved", data);
  } catch (error) {
    next(error);
  }
}

export async function updateSelfDeliveryGlobalSettingsController(req, res, next) {
  try {
    const data = await selfDeliveryService.updateSelfDeliveryGlobalSettings(req.body || {});
    return sendResponse(res, 200, "Self-delivery settings updated", data);
  } catch (error) {
    next(error);
  }
}
