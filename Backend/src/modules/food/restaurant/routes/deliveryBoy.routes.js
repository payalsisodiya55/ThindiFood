import express from "express";
import { loginDeliveryBoyController } from "../../../../core/auth/auth.controller.js";
import { authMiddleware } from "../../../../core/auth/auth.middleware.js";
import { requireRoles } from "../../../../core/roles/role.middleware.js";
import {
  listDeliveryBoyOrdersController,
  getDeliveryBoyOrderByIdController,
  pickupSelfDeliveryOrderController,
  outForDeliverySelfOrderController,
  deliverSelfDeliveryOrderController,
} from "../controllers/selfDelivery.controller.js";

const router = express.Router();

router.post("/login", loginDeliveryBoyController);

router.use(authMiddleware, requireRoles("DELIVERY_BOY"));

router.get("/orders", listDeliveryBoyOrdersController);
router.get("/orders/:orderId", getDeliveryBoyOrderByIdController);
router.patch("/orders/:orderId/pickup", pickupSelfDeliveryOrderController);
router.patch(
  "/orders/:orderId/out-for-delivery",
  outForDeliverySelfOrderController,
);
router.post("/orders/:orderId/deliver", deliverSelfDeliveryOrderController);

export default router;
