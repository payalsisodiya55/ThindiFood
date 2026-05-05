import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  checkOnboardingStatus,
  isRestaurantOnboardingComplete,
} from "@food/utils/onboardingUtils";
import { motion, AnimatePresence } from "framer-motion";
import Lenis from "lenis";
import {
  Printer,
  Volume2,
  VolumeX,
  ChevronDown,
  ChevronUp,
  X,
  AlertCircle,
  Loader2,
  Calendar,
  Clock,
  Users,
  MessageSquare,
  Utensils,
  Wallet,
  Phone,
} from "lucide-react";
import { toast } from "sonner";
import BottomNavOrders from "@food/components/restaurant/BottomNavOrders";
import RestaurantNavbar from "@food/components/restaurant/RestaurantNavbar";
import notificationSound from "@food/assets/audio/alert.mp3";
import { restaurantAPI, diningAPI, dineInAPI } from "@food/api";
import { useRestaurantNotifications } from "@food/hooks/useRestaurantNotifications";
import { RESTAURANT_THEME } from "@food/constants/restaurantTheme";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
const debugLog = (...args) => {};
const debugWarn = (...args) => {};
const debugError = (...args) => {};

const STORAGE_KEY = "restaurant_online_status";

// Top filter tabs
const filterTabs = [
  { id: "all", label: "All" },
  { id: "preparing", label: "Preparing" },
  { id: "ready", label: "Ready" },
  { id: "scheduled", label: "Scheduled" },
  { id: "table-booking", label: "Table Booking" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

const allOrdersStatusPriority = {
  pending: 0,
  confirmed: 1,
  preparing: 2,
  ready: 3,
  out_for_delivery: 4,
  scheduled: 5,
  delivered: 6,
  completed: 6,
  cancelled: 7,
};

const getAllOrdersTimestamp = (order) =>
  order?.cancelledAt ||
  order?.deliveredAt ||
  order?.updatedAt ||
  order?.createdAt ||
  new Date().toISOString();

const formatClockTime = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const getOrderPrepTimeMinutes = (orderLike) => {
  const directValue = Number(orderLike?.prep_time);
  if (Number.isFinite(directValue) && directValue > 0) {
    return Math.round(directValue);
  }

  const itemPrepMinutes = (orderLike?.items || [])
    .map((item) => {
      const matches = String(item?.preparationTime || "")
        .match(/\d+(?:\.\d+)?/g)
        ?.map(Number)
        ?.filter((value) => Number.isFinite(value) && value > 0);
      return matches?.length ? Math.ceil(Math.max(...matches)) : null;
    })
    .filter((value) => Number.isFinite(value) && value > 0);

  return itemPrepMinutes.length > 0 ? Math.max(...itemPrepMinutes) : null;
};

const isDineInOrderLike = (orderLike) => {
  if (!orderLike) return false;

  if (orderLike.isDineIn) return true;
  if (orderLike.sessionId || orderLike.tableNumber || orderLike.tableLabel) return true;

  const orderType = String(orderLike.type || orderLike.order_type || "").toLowerCase();
  if (orderType.includes("dine")) return true;

  const displayOrderId = String(orderLike.orderId || "").trim();
  return /^table\s+\S+/i.test(displayOrderId);
};

const getDineInRoundId = (orderLike) =>
  orderLike?.orderMongoId || orderLike?.mongoId || orderLike?._id || orderLike?.id || null;

const normalizeOrderForPopup = (orderLike) => {
  if (!orderLike) return null;

  const isDineIn = isDineInOrderLike(orderLike);

  return {
    orderId: orderLike.orderId,
    orderMongoId: orderLike.orderMongoId || orderLike._id || orderLike.id,
    restaurantId: orderLike.restaurantId,
    restaurantName:
      orderLike.restaurantName ||
      orderLike.restaurantId?.restaurantName ||
      orderLike.restaurantId?.name ||
      "",
    items: Array.isArray(orderLike.items) ? orderLike.items : [],
    total:
      Number(orderLike.total) > 0
        ? Number(orderLike.total)
        : Number(orderLike.pricing?.total) > 0
          ? Number(orderLike.pricing.total)
          : 0,
    customerAddress:
      orderLike.customerAddress || orderLike.address || orderLike.deliveryAddress,
    status: orderLike.status || orderLike.orderStatus,
    orderStatus: orderLike.orderStatus || orderLike.status,
    createdAt: orderLike.createdAt,
    updatedAt: orderLike.updatedAt,
    scheduledAt: orderLike.scheduledAt,
    pickupAt: orderLike.pickupAt,
    order_type: orderLike.order_type,
    type: orderLike.type,
    prep_time: orderLike.prep_time,
    prep_start_time: orderLike.prep_start_time,
    isAcceptedByRestaurant: Boolean(orderLike.isAcceptedByRestaurant),
    fulfillmentType: orderLike.fulfillmentType || "delivery",
    isDineIn,
    sessionId: orderLike.sessionId || null,
    tableNumber: orderLike.tableNumber || null,
    tableLabel: orderLike.tableLabel || null,
    estimatedDeliveryTime:
      Number(orderLike.prep_time) > 0
        ? Number(orderLike.prep_time)
        : orderLike.estimatedDeliveryTime || 30,
    note: orderLike.note || "",
    sendCutlery: orderLike.sendCutlery,
    paymentMethod: orderLike.paymentMethod || orderLike.payment?.method || null,
    payment: orderLike.payment,
  };
};

const isPopupOrderIncomplete = (orderLike) => {
  if (!orderLike) return true;
  const items = Array.isArray(orderLike.items) ? orderLike.items : [];
  const total = Number(orderLike.total || orderLike.pricing?.total || 0);
  return (
    !orderLike.restaurantName ||
    items.length === 0 ||
    total <= 0
  );
};

const getRestaurantOrderTypeLabel = (orderLike = {}) => {
  const fulfillmentType = String(orderLike?.fulfillmentType || "").trim().toLowerCase();
  const deliveryType = String(orderLike?.deliveryType || "").trim().toLowerCase();
  const orderType = String(orderLike?.order_type || "").trim().toUpperCase();
  const hasPickupWindow = Boolean(orderLike?.pickupAt || orderLike?.scheduledAt);

  if (
    fulfillmentType === "takeaway" ||
    deliveryType.includes("take") ||
    deliveryType.includes("pickup") ||
    hasPickupWindow ||
    orderType === "SCHEDULED" ||
    orderType === "IMMEDIATE"
  ) {
    return "Takeaway";
  }

  if (deliveryType.includes("dine")) {
    return "Dine In";
  }

  return orderLike?.deliveryFleet === "express"
    ? "Express Delivery"
    : "Home Delivery";
};

const getBookingGuestName = (bookingLike) => {
  const value = String(
  bookingLike?.userName ||
      bookingLike?.guestName ||
      bookingLike?.user?.name ||
      bookingLike?.user?.fullName ||
      bookingLike?.userId?.name ||
      bookingLike?.customer?.name ||
      bookingLike?.customerName ||
      bookingLike?.bookedBy?.name ||
      bookingLike?.name ||
      "Guest",
  ).trim();
  return value || "Guest";
};

const getBookingGuestPhone = (bookingLike) =>
  String(
    bookingLike?.guestPhone ||
    bookingLike?.user?.phone ||
      bookingLike?.user?.phoneNumber ||
      bookingLike?.userId?.phone ||
      bookingLike?.customer?.phone ||
      bookingLike?.phone ||
      bookingLike?.phoneNumber ||
      bookingLike?.mobile ||
      bookingLike?.bookedBy?.phone ||
      bookingLike?.customerPhone ||
      "",
  ).trim();

const getOrderCustomerPhone = (orderLike) =>
  String(
    orderLike?.customerPhone ||
      orderLike?.userId?.phone ||
      orderLike?.userId?.phoneNumber ||
      orderLike?.user?.phone ||
      orderLike?.user?.phoneNumber ||
      orderLike?.customer?.phone ||
      orderLike?.phone ||
      orderLike?.phoneNumber ||
      orderLike?.mobile ||
      "",
  ).trim();

const normalizePhoneForCall = (phoneLike) => String(phoneLike || "").replace(/[^\d+]/g, "").trim();

const getBookingStatusMeta = (statusLike) => {
  const normalized = String(statusLike || "")
    .trim()
    .toUpperCase()
    .replace(/-/g, "_");

  if (["ACCEPTED", "CONFIRMED"].includes(normalized)) {
    return {
      className: "bg-green-100 text-green-700",
      label: "CONFIRMED",
    };
  }
  if (normalized === "CHECKED_IN") {
    return {
      className: "bg-orange-100 text-orange-700",
      label: "CHECKED-IN",
    };
  }
  if (normalized === "COMPLETED") {
    return {
      className: "bg-blue-100 text-blue-700",
      label: "COMPLETED",
    };
  }
  if (["DECLINED", "CANCELLED", "CANCELED"].includes(normalized)) {
    return {
      className: "bg-gray-100 text-gray-600",
      label: "CANCELLED",
    };
  }
  return {
    className: "bg-gray-100 text-gray-600",
    label: normalized ? normalized.replace(/_/g, "-") : "PENDING",
  };
};

const transformOrderForList = (order) => ({
  orderId: order.orderId || order._id,
  mongoId: order._id,
  status: order.status || "pending",
  customerName: order.userId?.name || order.customerName || "Customer",
  customerPhone: getOrderCustomerPhone(order),
  type: getRestaurantOrderTypeLabel(order),
  tableOrToken: null,
  timePlaced: new Date(getAllOrdersTimestamp(order)).toLocaleDateString(
    "en-US",
    {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  ),
  eta: null,
  itemsSummary:
    order.items?.map((item) => `${item.quantity}x ${item.name}`).join(", ") ||
    "No items",
  photoUrl: order.items?.[0]?.image || null,
  photoAlt: order.items?.[0]?.name || "Order",
  paymentMethod: order.paymentMethod || order.payment?.method || null,
  deliveryPartnerId: order.deliveryPartnerId || null,
  dispatchStatus: order.dispatch?.status || null,
  preparingTimestamp: order.tracking?.preparing?.timestamp
    ? new Date(order.tracking.preparing.timestamp)
    : new Date(order.createdAt || Date.now()),
  initialETA: order.estimatedDeliveryTime || 30,
  sortTimestamp: new Date(getAllOrdersTimestamp(order)).getTime(),
});

const getDineInSessionLatestRound = (session) => {
  const rounds = Array.isArray(session?.orders) ? session.orders : [];
  return rounds.length ? rounds[rounds.length - 1] : null;
};

const getDineInItemsSummary = (session) => {
  const rounds = Array.isArray(session?.orders) ? session.orders : [];
  const items = rounds.flatMap((round) => (Array.isArray(round?.items) ? round.items : []));
  return items.length
    ? items.map((item) => `${item.quantity}x ${item.name}`).join(", ")
    : "No items";
};

const transformDineInSessionForList = (session, tableLike = null) => {
  if (!session?._id) return null;

  const latestRound = getDineInSessionLatestRound(session);
  const sessionStatus = String(session?.status || "").toLowerCase();
  const closureType = String(session?.closureType || "").toUpperCase();
  const isEmptyCancelled = closureType === "EMPTY_CANCELLED";
  const isClosedSession =
    sessionStatus === "completed" ||
    sessionStatus === "cancelled" ||
    sessionStatus === "expired" ||
    isEmptyCancelled;
  const latestStatus = String(latestRound?.status || "").toLowerCase();
  const displayStatus =
    isEmptyCancelled || sessionStatus === "cancelled"
      ? "cancelled"
      : sessionStatus === "completed"
        ? "completed"
      : latestStatus === "received"
        ? "active"
        : latestStatus || sessionStatus || "active";
  const tableNumber = tableLike?.tableNumber || session?.tableNumber || "Table";
  const tableLabel = tableLike?.tableLabel || `Table ${tableNumber}`;
  const displayTimeSource =
    isClosedSession
      ? session?.closedAt || session?.paidAt || session?.updatedAt || session?.createdAt
      : latestRound?.createdAt || session?.updatedAt || session?.createdAt;

  return {
    orderId: `Table ${tableNumber}`,
    mongoId: session._id,
    status: displayStatus,
    isDineIn: true,
    customerName:
      session?.userId?.name ||
      `Table ${tableNumber} (${tableLabel || "Default"})`,
    customerPhone: getOrderCustomerPhone(session),
    type: "Dine-In",
    tableOrToken: tableLabel || `Table ${tableNumber}`,
    timePlaced: new Date(displayTimeSource || Date.now()).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    itemsSummary:
      isClosedSession
        ? getDineInItemsSummary(session)
        : (latestRound?.items || []).map((item) => `${item.quantity}x ${item.name}`).join(", ") || "Active Session",
    photoUrl: null,
    photoAlt: "Dine-In",
    sortTimestamp: new Date(displayTimeSource || Date.now()).getTime(),
    deliveredAt: session?.closedAt || session?.paidAt || session?.updatedAt || session?.createdAt,
    amount: Number(session?.totalAmount || 0),
    paymentMethod: session?.paymentMethod || session?.paymentMode || null,
    closureType: session?.closureType || "",
    closeReason: session?.closeReason || "",
  };
};

// Completed Orders List Component
function CompletedOrders({ onSelectOrder, refreshToken = 0 }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchOrders = async () => {
      try {
        const [response, dineInSessionsRes] = await Promise.all([
          restaurantAPI.getOrders(),
          dineInAPI.getRestaurantSessions({ status: "completed", limit: 100 }),
        ]);

        if (!isMounted) return;

        const dineInCompletedOrders = Array.isArray(dineInSessionsRes?.data?.data)
          ? dineInSessionsRes.data.data
              .filter((session) => {
                const closureType = String(session?.closureType || "").toUpperCase();
                if (closureType === "EMPTY_CANCELLED") return false;
                return session?.isPaid || closureType === "PAID";
              })
              .map((session) => transformDineInSessionForList(session))
              .filter(Boolean)
          : [];

        if (response.data?.success && response.data.data?.orders) {
          const completedOrders = response.data.data.orders.filter(
            (order) =>
              order.status === "delivered" || order.status === "completed",
          );

          const transformedOrders = completedOrders.map((order) => ({
            orderId: order.orderId || order._id,
            mongoId: order._id,
            status: order.status || "delivered",
            customerName: order.userId?.name || order.customerName || "Customer",
            type: getRestaurantOrderTypeLabel(order),
            tableOrToken: null,
            timePlaced: new Date(order.createdAt).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            deliveredAt:
              order.deliveredAt || order.updatedAt || order.createdAt,
            itemsSummary:
              order.items
                ?.map((item) => `${item.quantity}x ${item.name}`)
                .join(", ") || "No items",
            photoUrl: order.items?.[0]?.image || null,
            photoAlt: order.items?.[0]?.name || "Order",
            amount: order.pricing?.total || order.total || 0,
            paymentMethod: order.paymentMethod || order.payment?.method || null,
          }));

          const mergedOrders = [...transformedOrders, ...dineInCompletedOrders];

          mergedOrders.sort((a, b) => {
            const dateA = new Date(a.deliveredAt);
            const dateB = new Date(b.deliveredAt);
            return dateB - dateA;
          });

          if (isMounted) {
            setOrders(mergedOrders);
            setLoading(false);
          }
        } else {
          if (isMounted) {
            setOrders(dineInCompletedOrders);
            setLoading(false);
          }
        }
      } catch (error) {
        if (!isMounted) return;

        if (error.code !== "ERR_NETWORK" && error.response?.status !== 404) {
          debugError("Error fetching completed orders:", error);
        }

        if (isMounted) {
          setOrders([]);
          setLoading(false);
        }
      }
    };

    fetchOrders();

    return () => {
      isMounted = false;
    };
  }, [refreshToken]);

  if (loading) {
    return (
      <div className="pt-4 pb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-black">
            Completed orders
          </h2>
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
        <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="pt-4 pb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-semibold text-black">Completed orders</h2>
        <span className="text-xs text-gray-500">{orders.length} total</span>
      </div>
      {orders.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          No completed orders yet
        </div>
      ) : (
        <div>
          {orders.map((order) => {
            const deliveredDate = order.deliveredAt
              ? new Date(order.deliveredAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "N/A";

            return (
              <div
                key={order.mongoId || order.orderId}
                className="w-full bg-white rounded-2xl p-4 mb-3 border border-gray-200">
                <button
                  type="button"
                  onClick={() =>
                    onSelectOrder?.({
                      orderId: order.orderId,
                      status: "Delivered",
                      customerName: order.customerName,
                      type: order.type,
                      tableOrToken: order.tableOrToken,
                      timePlaced: deliveredDate,
                      itemsSummary: order.itemsSummary,
                      paymentMethod: order.paymentMethod,
                    })
                  }
                  className="w-full text-left flex gap-3 items-stretch">
                  <div className="h-20 w-20 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0 my-auto">
                    {order.photoUrl ? (
                      <img
                        src={order.photoUrl}
                        alt={order.photoAlt}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center px-2">
                        <span className="text-[11px] font-medium text-gray-500 text-center leading-tight">
                          {order.photoAlt}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 flex flex-col justify-between min-h-[80px]">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-black leading-tight">
                          Order #{order.orderId}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-1">
                          {order.customerName}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border border-green-500 text-green-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                          Delivered
                        </span>
                        <span className="text-[11px] text-gray-500 text-right">
                          {deliveredDate}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2">
                      <p className="text-xs text-gray-600 line-clamp-1">
                        {order.itemsSummary}
                      </p>
                    </div>

                    <div className="mt-2 flex items-end justify-between gap-2">
                      <div className="flex flex-col gap-1">
                        <p className="text-[11px] text-gray-500">
                          {order.type}
                        </p>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-[11px] text-gray-500">
                          Amount
                        </span>
                        <span className="text-xs font-medium text-black">
                          ₹{order.amount.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Cancelled Orders List Component
function CancelledOrders({ onSelectOrder, refreshToken = 0 }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchOrders = async () => {
      try {
        const [response, dineInCancelledRes, dineInCompletedRes] = await Promise.all([
          restaurantAPI.getOrders(),
          dineInAPI.getRestaurantSessions({ status: "cancelled", limit: 100 }),
          dineInAPI.getRestaurantSessions({ status: "completed", limit: 100 }),
        ]);

        if (!isMounted) return;

        const dineInCancelledByStatus = Array.isArray(dineInCancelledRes?.data?.data)
          ? dineInCancelledRes.data.data
          : [];
        const dineInCancelledLegacy = Array.isArray(dineInCompletedRes?.data?.data)
          ? dineInCompletedRes.data.data.filter(
              (session) =>
                String(session?.closureType || "").toUpperCase() === "EMPTY_CANCELLED",
            )
          : [];

        const mergedDineInCancelled = [
          ...dineInCancelledByStatus,
          ...dineInCancelledLegacy,
        ];

        const seenSessionIds = new Set();
        const transformedDineInCancelledOrders = mergedDineInCancelled
          .filter((session) => {
            const key = String(session?._id || "").trim();
            if (!key || seenSessionIds.has(key)) return false;
            seenSessionIds.add(key);
            return true;
          })
          .map((session) => {
            const transformed = transformDineInSessionForList(session);
            if (!transformed) return null;
            const closedBy = String(session?.closedByRole || "").toLowerCase();
            return {
              ...transformed,
              status: "cancelled",
              cancelledAt:
                session?.closedAt ||
                session?.updatedAt ||
                session?.createdAt ||
                new Date().toISOString(),
              cancelledBy: ["user", "restaurant", "system"].includes(closedBy)
                ? closedBy
                : "user",
              cancellationReason:
                String(session?.closeReason || "").trim() ||
                "Session closed without ordering",
            };
          })
          .filter(Boolean);

        if (response.data?.success && response.data.data?.orders) {
          // Filter cancelled orders (both restaurant and user cancelled)
          const cancelledOrders = response.data.data.orders.filter(
            (order) => order.status === "cancelled",
          );

          const transformedOrders = cancelledOrders.map((order) => ({
            orderId: order.orderId || order._id,
            mongoId: order._id,
            status: order.status || "cancelled",
            customerName: order.userId?.name || order.customerName || "Customer",
            type: getRestaurantOrderTypeLabel(order),
            tableOrToken: null,
            timePlaced: new Date(order.createdAt).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            cancelledAt:
              order.cancelledAt || order.updatedAt || order.createdAt,
            cancelledBy: order.cancelledBy || "unknown",
            cancellationReason:
              order.cancellationReason || "No reason provided",
            itemsSummary:
              order.items
                ?.map((item) => `${item.quantity}x ${item.name}`)
                .join(", ") || "No items",
            photoUrl: order.items?.[0]?.image || null,
            photoAlt: order.items?.[0]?.name || "Order",
            amount: order.pricing?.total || order.total || 0,
            paymentMethod: order.paymentMethod || order.payment?.method || null,
          }));

          const combinedCancelledOrders = [...transformedOrders, ...transformedDineInCancelledOrders];

          combinedCancelledOrders.sort((a, b) => {
            const dateA = new Date(a.cancelledAt);
            const dateB = new Date(b.cancelledAt);
            return dateB - dateA;
          });

          if (isMounted) {
            setOrders(combinedCancelledOrders);
            setLoading(false);
          }
        } else {
          if (isMounted) {
            setOrders(transformedDineInCancelledOrders);
            setLoading(false);
          }
        }
      } catch (error) {
        if (!isMounted) return;

        if (error.code !== "ERR_NETWORK" && error.response?.status !== 404) {
          debugError("Error fetching cancelled orders:", error);
        }

        if (isMounted) {
          setOrders([]);
          setLoading(false);
        }
      }
    };

    fetchOrders();

    return () => {
      isMounted = false;
    };
  }, [refreshToken]);

  if (loading) {
    return (
      <div className="pt-4 pb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-black">
            Cancelled orders
          </h2>
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
        <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="pt-4 pb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-semibold text-black">Cancelled orders</h2>
        <span className="text-xs text-gray-500">{orders.length} total</span>
      </div>
      {orders.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          No cancelled orders yet
        </div>
      ) : (
        <div>
          {orders.map((order) => {
            const cancelledDate = order.cancelledAt
              ? new Date(order.cancelledAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "N/A";

            const cancelledByText =
              order.cancelledBy === "user"
                ? "Cancelled by User"
                : order.cancelledBy === "restaurant"
                  ? "Cancelled by Restaurant"
                  : "Cancelled";

            return (
              <div
                key={order.mongoId || order.orderId}
                className="w-full bg-white rounded-2xl p-4 mb-3 border border-gray-200">
                <button
                  type="button"
                  onClick={() =>
                    onSelectOrder?.({
                      orderId: order.orderId,
                      status: "Cancelled",
                      customerName: order.customerName,
                      type: order.type,
                      tableOrToken: order.tableOrToken,
                      timePlaced: cancelledDate,
                      itemsSummary: order.itemsSummary,
                      paymentMethod: order.paymentMethod,
                    })
                  }
                  className="w-full text-left flex gap-3 items-stretch">
                  <div className="h-20 w-20 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0 my-auto">
                    {order.photoUrl ? (
                      <img
                        src={order.photoUrl}
                        alt={order.photoAlt}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center px-2">
                        <span className="text-[11px] font-medium text-gray-500 text-center leading-tight">
                          {order.photoAlt}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 flex flex-col justify-between min-h-[80px]">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-black leading-tight">
                          Order #{order.orderId}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-1">
                          {order.customerName}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border ${
                            order.cancelledBy === "user"
                              ? "border-orange-500 text-orange-600"
                              : "border-red-500 text-red-600"
                          }`}>
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              order.cancelledBy === "user"
                                ? "bg-orange-500"
                                : "bg-red-500"
                            }`}
                          />
                          {cancelledByText}
                        </span>
                        <span className="text-[11px] text-gray-500 text-right">
                          {cancelledDate}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2">
                      <p className="text-xs text-gray-600 line-clamp-1">
                        {order.itemsSummary}
                      </p>
                      {order.cancellationReason && (
                        <p className="text-[10px] text-red-600 mt-1 line-clamp-1">
                          Reason: {order.cancellationReason}
                        </p>
                      )}
                    </div>

                    <div className="mt-2 flex items-end justify-between gap-2">
                      <div className="flex flex-col gap-1">
                        <p className="text-[11px] text-gray-500">
                          {order.type}
                        </p>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-[11px] text-gray-500">
                          Amount
                        </span>
                        <span className="text-xs font-medium text-black">
                          ₹{order.amount.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Table Bookings List Component
function TableBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchBookings = async () => {
      try {
        const response = await dineInAPI.getRestaurantBookings();
        if (isMounted && response?.data?.success) {
          setBookings(Array.isArray(response?.data?.data) ? response.data.data : []);
          setLoading(false);
          return;
        }
      } catch (error) {
        debugError("Error fetching table bookings from dine-in API:", error);
      }

      // Fallback for local/stub environments
      try {
        const res = await restaurantAPI.getCurrentRestaurant();
        const restaurant = res.data?.data?.restaurant || res.data?.restaurant || res.data?.data;
        const restaurantId = restaurant?._id || restaurant?.id;
        if (restaurantId) {
          const fallbackResponse = await diningAPI.getRestaurantBookings(restaurant);
          if (isMounted && fallbackResponse?.data?.success) {
            setBookings(Array.isArray(fallbackResponse?.data?.data) ? fallbackResponse.data.data : []);
          }
        }
      } catch (error) {
        debugError("Error fetching table bookings fallback:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchBookings();
    const interval = setInterval(fetchBookings, 10000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  if (loading)
    return (
      <div className="text-center py-10 text-gray-400">Loading bookings...</div>
    );

  return (
    <div className="pt-4 pb-6 px-1">
      <div className="flex items-baseline justify-between mb-4 px-1">
        <h2 className="text-base font-semibold text-black">Table Bookings</h2>
        <span className="text-xs text-gray-500">{bookings.length} total</span>
      </div>

      {bookings.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
          <p className="text-gray-400 text-sm">No table bookings yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => (
            <div
              key={booking._id || booking.id || booking.bookingId}
              className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm transition-all hover:border-gray-300">
              {(() => {
                const statusMeta = getBookingStatusMeta(booking?.status);
                return (
                  <>
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-gray-900">
                    {getBookingGuestName(booking)}
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    {getBookingGuestPhone(booking) || "No phone"}
                  </p>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${statusMeta.className}`}>
                  {statusMeta.label}
                </span>
              </div>

              <div className="flex items-center gap-4 text-[11px] text-gray-600 bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  <span>
                    {new Date(booking.date).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  <span>{booking.timeSlot}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-gray-400" />
                  <span>{booking.guests} Guests</span>
                </div>
              </div>

              {booking.specialRequest && (
                <div className="mt-3 p-2 bg-blue-50/50 rounded-lg border border-blue-100/50">
                  <p className="text-[10px] text-blue-700 italic flex items-start gap-1">
                    <MessageSquare className="w-3 h-3 mt-0.5 shrink-0" />
                    <span className="line-clamp-2">
                      {booking.specialRequest}
                    </span>
                  </p>
                </div>
              )}
                  </>
                );
              })()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AllOrders({ onSelectOrder, onCancel, refreshToken = 0 }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [markingReadyOrderIds, setMarkingReadyOrderIds] = useState({});
  const [otpModalOrder, setOtpModalOrder] = useState(null);
  const [deliveryOtp, setDeliveryOtp] = useState("");
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [verifyingOrderIds, setVerifyingOrderIds] = useState({});

  useEffect(() => {
    let isMounted = true;
    let intervalId = null;
    let countdownIntervalId = null;

    const fetchOrders = async () => {
      try {
        const [response, dineInSessionsRes] = await Promise.all([
          restaurantAPI.getOrders(),
          dineInAPI.getRestaurantSessions({ limit: 100 }),
        ]);
        
        // --- ADD DINE-IN FETCHING ---
        let dineInOrdersTransformed = [];
        try {
          const profileRes = await restaurantAPI.getCurrentRestaurant();
          const rId = profileRes.data?.data?.restaurant?._id || profileRes.data?.data?._id;
          
          if (rId) {
            const tablesRes = await dineInAPI.listTables(rId);
            if (tablesRes.data?.success) {
              const activeTables = (tablesRes.data.data || []).filter((t) => t.currentSessionId);
              const sessions = await Promise.all(
                activeTables.map(async (table) => {
                  try {
                    const sessionIdentity =
                      table?.currentSessionId?._id ||
                      table?.currentSessionId?.id ||
                      table?.currentSessionId;
                    if (!sessionIdentity) {
                      return { table, session: null };
                    }
                    const sRes = await dineInAPI.getSession(sessionIdentity);
                    const sessionData = sRes.data?.data || null;

                    return { table, session: sessionData };
                  } catch {
                    return { table, session: null };
                  }
                })
              );

              dineInOrdersTransformed = sessions
                .filter(({ session }) => Boolean(session))
                .map(({ table, session }) => {
                  const sessionStatus = String(session?.status || "").toLowerCase();
                  if (sessionStatus !== "active") return null;
                  const rounds = Array.isArray(session.orders) ? session.orders : [];
                  const latestRound = rounds.length ? rounds[rounds.length - 1] : null;
                  const latestStatus = String(latestRound?.status || "").toLowerCase();
                  const displayStatus =
                    latestStatus === "received" ? "active" : latestStatus || "active";

                  return {
                    orderId: `Table ${table.tableNumber}`,
                    mongoId: session._id,
                    status: displayStatus,
                    isDineIn: true,
                    customerName: `Table ${table.tableNumber} (${table.tableLabel || "Default"})`,
                    type: "Dine-In",
                    tableOrToken: table.tableLabel || `Table ${table.tableNumber}`,
                    timePlaced: new Date(latestRound?.createdAt || session.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    }),
                    itemsSummary: (latestRound?.items || [])
                      .map((item) => `${item.quantity}x ${item.name}`)
                      .join(", ") || "Active Session",
                    photoUrl: null,
                    photoAlt: "Dine-In",
                    sortTimestamp: new Date(session.updatedAt || session.createdAt).getTime(),
                  };
                })
                .filter(Boolean);
            }
          }
        } catch (dineInErr) {
          console.error("Dine-In fetch failed", dineInErr);
        }
        // ----------------------------

        const historicalDineInOrders = Array.isArray(dineInSessionsRes?.data?.data)
          ? dineInSessionsRes.data.data
              .map((session) => transformDineInSessionForList(session))
              .filter((session) => Boolean(session) && String(session.status || "").toLowerCase() !== "active")
          : [];

        const activeDineInSessionIds = new Set(
          dineInOrdersTransformed
            .map((entry) => String(entry?.mongoId || "").trim())
            .filter(Boolean),
        );

        if (!isMounted) return;

        let regularOrders = [];
        if (response.data?.success && response.data.data?.orders) {
          regularOrders = response.data.data.orders.map(transformOrderForList);
        }

        // Combine and Sort
        const combined = [
          ...regularOrders,
          ...dineInOrdersTransformed,
          ...historicalDineInOrders.filter(
            (entry) => !activeDineInSessionIds.has(String(entry?.mongoId || "").trim()),
          ),
        ].sort((a, b) => b.sortTimestamp - a.sortTimestamp);

        setOrders(combined);
      } catch (error) {
        if (!isMounted) return;
        setOrders([]);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchOrders();
    intervalId = setInterval(fetchOrders, 10000);
    countdownIntervalId = setInterval(() => {
      if (isMounted) {
        setCurrentTime(new Date());
      }
    }, 1000);

    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
      if (countdownIntervalId) clearInterval(countdownIntervalId);
    };
  }, [refreshToken]);

  const handleMarkReady = async ({ orderId, mongoId, isDineIn }) => {
    if (isDineIn) return;
    const orderKey = mongoId || orderId;
    if (!orderKey || markingReadyOrderIds[orderKey]) return;

    try {
      setMarkingReadyOrderIds((prev) => ({ ...prev, [orderKey]: true }));
      await restaurantAPI.markOrderReady(orderKey);
      setOrders((prev) =>
        prev.map((order) =>
          (order.mongoId || order.orderId) === orderKey
            ? {
                ...order,
                status: "ready",
                eta: null,
                sortTimestamp: Date.now(),
              }
            : order,
        ),
      );
      toast.success("Order marked as ready");
    } catch (error) {
      debugError("Error marking order as ready from All orders:", error);
      toast.error(
        error.response?.data?.message || "Failed to mark order as ready",
      );
    } finally {
      setMarkingReadyOrderIds((prev) => ({ ...prev, [orderKey]: false }));
    }
  };

  const handleOpenOtpModal = ({ orderId, mongoId, customerName }) => {
    setOtpModalOrder({
      orderId,
      mongoId: mongoId || orderId,
      customerName: customerName || "Customer",
    });
    setDeliveryOtp("");
  };

  const handleCloseOtpModal = () => {
    if (isVerifyingOtp) return;
    setOtpModalOrder(null);
    setDeliveryOtp("");
  };

  const handleVerifyOtpAndDeliver = async () => {
    const rawOtp = String(deliveryOtp || "").replace(/\D/g, "");
    if (rawOtp.length < 4) {
      toast.error("Please enter a valid OTP");
      return;
    }

    const orderKey = otpModalOrder?.mongoId || otpModalOrder?.orderId;
    if (!orderKey) {
      toast.error("Order not found for OTP verification");
      return;
    }

    try {
      setIsVerifyingOtp(true);
      setVerifyingOrderIds((prev) => ({ ...prev, [orderKey]: true }));
      await restaurantAPI.verifyDeliveryOtpAndComplete(orderKey, rawOtp);
      setOrders((prev) =>
        prev.filter((order) => (order.mongoId || order.orderId) !== orderKey),
      );
      toast.success(
        `Order ${otpModalOrder?.orderId || ""} marked delivered successfully`,
      );
      handleCloseOtpModal();
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Failed to verify OTP";
      toast.error(message);
    } finally {
      setIsVerifyingOtp(false);
      setVerifyingOrderIds((prev) => {
        const next = { ...prev };
        delete next[orderKey];
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="pt-4 pb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-black">All orders</h2>
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
        <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="pt-4 pb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-semibold text-black">All orders</h2>
        <span className="text-xs text-gray-500">{orders.length} total</span>
      </div>
      {orders.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          No orders found
        </div>
      ) : (
        <div>
          {orders.map((order) => {
            const normalizedStatus = String(order.status || "").toLowerCase();
            let etaDisplay = order.eta;

            if (normalizedStatus === "preparing" && order.preparingTimestamp) {
              const elapsedMs = currentTime - order.preparingTimestamp;
              const elapsedMinutes = Math.floor(elapsedMs / 60000);
              const remainingMinutes = Math.max(
                0,
                order.initialETA - elapsedMinutes,
              );

              if (remainingMinutes <= 0) {
                const remainingSeconds = Math.max(
                  0,
                  Math.floor(order.initialETA * 60 - elapsedMs / 1000),
                );
                etaDisplay =
                  remainingSeconds > 0 ? `${remainingSeconds} secs` : "0 mins";
              } else {
                etaDisplay = `${remainingMinutes} mins`;
              }
            }

            return (
              <OrderCard
                key={order.mongoId || order.orderId}
                {...order}
                eta={etaDisplay}
                onSelect={onSelectOrder}
                onCancel={
                  normalizedStatus === "preparing" && !order.isDineIn
                    ? onCancel
                    : undefined
                }
                onMarkReady={
                  normalizedStatus === "preparing" && !order.isDineIn
                    ? handleMarkReady
                    : undefined
                }
                onVerifyOtp={
                  normalizedStatus === "ready" && !order.isDineIn
                    ? handleOpenOtpModal
                    : undefined
                }
                isVerifyingOtp={Boolean(
                  verifyingOrderIds[order.mongoId || order.orderId],
                )}
                isMarkingReady={Boolean(
                  markingReadyOrderIds[order.mongoId || order.orderId],
                )}
              />
            );
          })}
        </div>
      )}
      <AnimatePresence>
        {otpModalOrder && (
          <motion.div
            className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCloseOtpModal}>
            <motion.div
              className="w-[95%] max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}>
              <div className="px-4 py-4 border-b border-gray-200">
                <h3 className="text-lg font-bold text-gray-900">
                  Verify OTP for Order #{otpModalOrder.orderId}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Enter customer OTP to mark this order as delivered.
                </p>
              </div>

              <div className="px-4 py-5">
                <label
                  htmlFor="all-orders-delivery-otp"
                  className="block text-sm font-semibold text-gray-700 mb-2">
                  Delivery OTP
                </label>
                <input
                  id="all-orders-delivery-otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={deliveryOtp}
                  onChange={(e) =>
                    setDeliveryOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base font-semibold tracking-[0.35em] text-center text-gray-900 outline-none focus:border-[#00c87e] focus:ring-4 focus:ring-[#00c87e]/15"
                  placeholder="Enter OTP"
                />
              </div>

              <div className="px-4 pb-4 flex gap-3">
                <button
                  type="button"
                  onClick={handleCloseOtpModal}
                  disabled={isVerifyingOtp}
                  className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleVerifyOtpAndDeliver}
                  disabled={isVerifyingOtp}
                  className="flex-1 rounded-xl bg-[#00c87e] px-4 py-3 text-sm font-semibold text-white hover:bg-[#00b874] disabled:opacity-60">
                  {isVerifyingOtp ? "Verifying..." : "Verify & Complete"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function OrdersMain() {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState("all");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const contentRef = useRef(null);
  const filterBarRef = useRef(null);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const touchStartY = useRef(0);
  const isSwiping = useRef(false);
  const mouseStartX = useRef(0);
  const mouseEndX = useRef(0);
  const isMouseDown = useRef(false);

  // New order popup states
  const [showNewOrderPopup, setShowNewOrderPopup] = useState(false);
  const [popupOrder, setPopupOrder] = useState(null); // Store order for popup (from Socket.IO or API)
  const [isMuted, setIsMuted] = useState(false);
  const [countdown, setCountdown] = useState(240); // 4 minutes in seconds
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(true);
  const [showRejectPopup, setShowRejectPopup] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showCancelPopup, setShowCancelPopup] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [orderToCancel, setOrderToCancel] = useState(null);
  const [acceptSwipeProgress, setAcceptSwipeProgress] = useState(0);
  const [isAcceptingOrder, setIsAcceptingOrder] = useState(false);
  const audioRef = useRef(null);
  const shownOrdersRef = useRef(new Set()); // Track orders already shown in popup
  // Keep booking-popup dedupe in-memory only.
  // If page refreshes and booking is still pending, popup should appear again.
  const shownBookingsRef = useRef(new Set());
  const acceptSliderRef = useRef(null);
  const acceptSwipeStartXRef = useRef(0);
  const acceptSwipeActiveRef = useRef(false);
  // New table booking popup states
  const [showNewBookingPopup, setShowNewBookingPopup] = useState(false);
  const [popupBooking, setPopupBooking] = useState(null);
  // Counter payment popup states
  const [showCounterPaymentPopup, setShowCounterPaymentPopup] = useState(false);
  const [popupPayment, setPopupPayment] = useState(null);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const shownPaymentsRef = useRef(new Set());
  const [restaurantStatus, setRestaurantStatus] = useState({
    isActive: null,
    rejectionReason: null,
    onboarding: null,
    isLoading: true,
  });
  const [isReverifying, setIsReverifying] = useState(false);
  const audioUnlockedRef = useRef(false);
  const showNewOrderPopupRef = useRef(showNewOrderPopup);
  const isMutedRef = useRef(isMuted);
  const newOrderRef = useRef(null);
  const popupHydrationInFlightRef = useRef(new Set());

  const isCancelledStatus = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .includes("cancelled");

  const getOrderIdentityKey = (orderLike) =>
    String(
      orderLike?.orderMongoId ||
        orderLike?.orderId ||
        orderLike?._id ||
        orderLike?.id ||
        "",
    ).trim();

  const markOrderAsShown = (orderLike) => {
        if (orderLike?.isDineIn && orderLike?.orderMongoId) { return shownOrdersRef.current.has(orderLike.orderMongoId); }

    const keys = [
      orderLike?.orderMongoId,
      orderLike?.orderId,
      orderLike?._id,
      orderLike?.id,
    ]
      .map((v) => (v == null ? "" : String(v).trim()))
      .filter(Boolean);

    for (const k of keys) shownOrdersRef.current.add(k);
  };

  const hasOrderBeenShown = (orderLike) => {
        if (orderLike?.isDineIn && orderLike?.orderMongoId) { return shownOrdersRef.current.has(orderLike.orderMongoId); }

    const keys = [
      orderLike?.orderMongoId,
      orderLike?.orderId,
      orderLike?._id,
      orderLike?.id,
    ]
      .map((v) => (v == null ? "" : String(v).trim()))
      .filter(Boolean);

    return keys.some((k) => shownOrdersRef.current.has(k));
  };

  const isScheduledAwaitingRestaurantAcceptance = (orderLike) =>
    orderLike?.fulfillmentType === "takeaway" &&
    String(orderLike?.order_type || "").toUpperCase() === "SCHEDULED" &&
    String(orderLike?.status || orderLike?.orderStatus || "").toLowerCase() === "confirmed" &&
    !Boolean(orderLike?.isAcceptedByRestaurant);

  const getPopupOrderTotal = (orderLike) => {
    if (!orderLike) return 0;

    const directTotal = Number(orderLike.total);
    if (Number.isFinite(directTotal) && directTotal > 0) return directTotal;

    const pricingTotal = Number(orderLike.pricing?.total);
    if (Number.isFinite(pricingTotal) && pricingTotal > 0) return pricingTotal;

    const amountDue = Number(orderLike.payment?.amountDue);
    if (Number.isFinite(amountDue) && amountDue > 0) return amountDue;

    const items = Array.isArray(orderLike.items) ? orderLike.items : [];
    const itemsTotal = items.reduce((sum, item) => {
      const price = Number(item?.price || 0);
      const qty = Number(item?.quantity || 0);
      return sum + (Number.isFinite(price) ? price : 0) * (Number.isFinite(qty) ? qty : 0);
    }, 0);

    return Number.isFinite(itemsTotal) ? itemsTotal : 0;
  };

  const hydratePopupOrder = async (orderLike) => {
    if (isDineInOrderLike(orderLike)) return null;

    const lookupIds = Array.from(
      new Set(
        [
          orderLike?.orderMongoId,
          orderLike?._id,
          orderLike?.id,
          orderLike?.orderId,
        ]
          .map((value) => String(value || "").trim())
          .filter(Boolean),
      ),
    );
    const orderKey = getOrderIdentityKey(orderLike);
    if (!lookupIds.length || !orderKey) return null;
    if (popupHydrationInFlightRef.current.has(orderKey)) return null;

    popupHydrationInFlightRef.current.add(orderKey);
    try {
      for (const lookupId of lookupIds) {
        try {
          const response = await restaurantAPI.getOrderById(lookupId);
          const freshOrder =
            response?.data?.data?.order ||
            response?.data?.order ||
            response?.data?.data ||
            null;
          if (freshOrder) {
            return normalizeOrderForPopup(freshOrder);
          }
        } catch (error) {
          if (error?.response?.status !== 404) {
            throw error;
          }
        }
      }
      return null;
    } catch (error) {
      debugWarn("Failed to hydrate popup order in real time:", error);
      return null;
    } finally {
      popupHydrationInFlightRef.current.delete(orderKey);
    }
  };

  // Restaurant notifications hook for real-time orders + table bookings
  const { 
    newOrder, 
    latestOrderStatusUpdate,
    clearNewOrder, 
    newBooking, 
    clearNewBooking, 
    newPaymentRequest, 
    clearNewPaymentRequest, 
    newClosedSession,
    clearNewClosedSession,
    isConnected,
    stopNotificationSound,
    setNotificationSoundMuted,
  } = useRestaurantNotifications();

  const rejectReasons = [
    "Restaurant is too busy",
    "Item not available",
    "Outside delivery area",
    "Kitchen closing soon",
    "Technical issue",
    "Other reason",
  ];

  // Fetch restaurant verification status
  useEffect(() => {
    const fetchRestaurantStatus = async () => {
      try {
        const response = await restaurantAPI.getCurrentRestaurant();
        const restaurant =
          response?.data?.data?.restaurant || response?.data?.restaurant;
        if (restaurant) {
          setRestaurantStatus({
            isActive: restaurant.isActive,
            rejectionReason: restaurant.rejectionReason || null,
            onboarding: restaurant.onboarding || null,
            isLoading: false,
          });

          // Check if onboarding is incomplete and redirect if needed
          if (!isRestaurantOnboardingComplete(restaurant)) {
            // Onboarding is incomplete, redirect to onboarding page
            const incompleteStep = await checkOnboardingStatus();
            if (incompleteStep) {
              navigate(`/restaurant/onboarding?step=${incompleteStep}`, {
                replace: true,
              });
              return;
            }
          }
        }
      } catch (error) {
        // Only log error if it's not a network/timeout error (backend might be down/slow)
        if (
          error.code !== "ERR_NETWORK" &&
          error.code !== "ECONNABORTED" &&
          !error.message?.includes("timeout")
        ) {
          debugError("Error fetching restaurant status:", error);
        }
        // Set loading to false so UI doesn't stay in loading state
        setRestaurantStatus((prev) => ({ ...prev, isLoading: false }));
      }
    };

    fetchRestaurantStatus();

    // Listen for restaurant profile updates
    const handleProfileRefresh = () => {
      fetchRestaurantStatus();
    };

    window.addEventListener("restaurantProfileRefresh", handleProfileRefresh);

    return () => {
      window.removeEventListener(
        "restaurantProfileRefresh",
        handleProfileRefresh,
      );
    };
  }, [navigate]);

  // Handle reverify (resubmit for approval)
  const handleReverify = async () => {
    try {
      setIsReverifying(true);
      await restaurantAPI.reverify();

      // Refresh restaurant status
      const response = await restaurantAPI.getCurrentRestaurant();
      const restaurant =
        response?.data?.data?.restaurant || response?.data?.restaurant;
      if (restaurant) {
        setRestaurantStatus({
          isActive: restaurant.isActive,
          rejectionReason: restaurant.rejectionReason || null,
          onboarding: restaurant.onboarding || null,
          isLoading: false,
        });
      }

      // Trigger profile refresh event
      window.dispatchEvent(new Event("restaurantProfileRefresh"));

      alert(
        "Restaurant reverified successfully! Verification will be done in 24 hours.",
      );
    } catch (error) {
      // Don't log network/timeout errors (backend might be down)
      if (
        error.code !== "ERR_NETWORK" &&
        error.code !== "ECONNABORTED" &&
        !error.message?.includes("timeout")
      ) {
        debugError("Error reverifying restaurant:", error);
      }

      // Handle 401 Unauthorized errors (token expired/invalid)
      if (error.response?.status === 401) {
        const errorMessage =
          error.response?.data?.message ||
          "Your session has expired. Please login again.";
        alert(errorMessage);
        // The axios interceptor should handle redirecting to login
        // But if it doesn't, we can manually redirect
        if (!error.response?.data?.message?.includes("inactive")) {
          // Only redirect if it's not an "inactive" error (which we handle differently)
          setTimeout(() => {
            window.location.href = "/restaurant/login";
          }, 1500);
        }
      } else {
        // Other errors (400, 500, etc.)
        const errorMessage =
          error.response?.data?.message ||
          "Failed to reverify restaurant. Please try again.";
        alert(errorMessage);
      }
    } finally {
      setIsReverifying(false);
    }
  };

  // Lenis smooth scrolling
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);

    return () => {
      lenis.destroy();
    };
  }, []);

  // Show new order popup when real order notification arrives from Socket.IO
  useEffect(() => {
    if (newOrder) {
      debugLog("?? New order received via Socket.IO:", newOrder);

      if (isCancelledStatus(newOrder?.orderStatus || newOrder?.status)) {
        return;
      }

      const scheduledAt = newOrder.scheduledAt
        ? new Date(newOrder.scheduledAt).getTime()
        : null;
      const isFutureScheduled =
        scheduledAt && scheduledAt > Date.now() + 30 * 60000;

      if (isFutureScheduled) {
        toast.info(
          `New scheduled order received for ${new Date(scheduledAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`,
        );
        requestOrdersRefresh();
        return; // Do not show the immediate popup
      }

      const normalizedIncomingOrder = normalizeOrderForPopup(newOrder);

      if (
        !hasOrderBeenShown(newOrder) &&
        (
          isScheduledAwaitingRestaurantAcceptance(newOrder) ||
          !Boolean(newOrder?.isAcceptedByRestaurant)
        )
      ) {
        markOrderAsShown(newOrder);
        setPopupOrder(normalizedIncomingOrder);
        setShowNewOrderPopup(true);
        setCountdown(240); // Reset countdown to 4 minutes
        requestOrdersRefresh();
      }

      if (isPopupOrderIncomplete(normalizedIncomingOrder)) {
        const currentOrderKey = getOrderIdentityKey(normalizedIncomingOrder);
        hydratePopupOrder(newOrder).then((hydratedOrder) => {
          if (!hydratedOrder) return;
          const hydratedKey = getOrderIdentityKey(hydratedOrder);
          if (!hydratedKey || hydratedKey !== currentOrderKey) return;

          setPopupOrder((prev) => {
            const prevKey = getOrderIdentityKey(prev);
            if (prevKey && prevKey !== hydratedKey) return prev;
            return hydratedOrder;
          });
        });
      }
    }
  }, [newOrder]);

  useEffect(() => {
    if (!latestOrderStatusUpdate) return;

    const isUserCancelled =
      latestOrderStatusUpdate.cancelledBy === "user" &&
      isCancelledStatus(latestOrderStatusUpdate.orderStatus);

    if (!isUserCancelled) return;

    const activePopupOrder = popupOrder || newOrder;
    const activePopupKey = getOrderIdentityKey(activePopupOrder);
    const updatedOrderKey = getOrderIdentityKey(latestOrderStatusUpdate);

    if (!activePopupKey || !updatedOrderKey || activePopupKey !== updatedOrderKey) {
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    setShowRejectPopup(false);
    setShowNewOrderPopup(false);
    setPopupOrder(null);
    clearNewOrder();
    setCountdown(240);
    setAcceptSwipeProgress(0);
    setIsAcceptingOrder(false);

    const trimmedReason = String(
      latestOrderStatusUpdate.cancellationReason || "",
    ).trim();

    toast.info(
      trimmedReason
        ? `Order cancelled by user. Reason: ${trimmedReason}`
        : "Order cancelled by user.",
    );

    requestOrdersRefresh();
  }, [latestOrderStatusUpdate, popupOrder, newOrder, clearNewOrder]);

  const getBookingKey = (bookingLike) =>
    String(bookingLike?._id || bookingLike?.id || bookingLike?.bookingId || "")
      .trim();

  const hasBookingBeenShown = (bookingLike) => {
    const key = getBookingKey(bookingLike);
    if (!key) return false;
    return shownBookingsRef.current.has(key);
  };

  const markBookingAsShown = (bookingLike) => {
    const key = getBookingKey(bookingLike);
    if (!key) return;
    shownBookingsRef.current.add(key);
  };

  // Show new table booking popup when booking notification arrives (polling)
  useEffect(() => {
    if (!newBooking) return;
    // Only show popup for PENDING bookings — not for already accepted/declined ones
    const status = String(newBooking?.status || '').toUpperCase();
    if (status && status !== 'PENDING') return;
    // Don't stack over order popup; booking will keep polling until accepted/declined.
    if (showNewOrderPopupRef.current) return;

    if (!hasBookingBeenShown(newBooking)) {
      markBookingAsShown(newBooking);
      setPopupBooking(newBooking);
      setShowNewBookingPopup(true);
      toast.success(`New table booking ${newBooking?.bookingId ? `#${newBooking.bookingId}` : ""}`.trim());
    }
  }, [newBooking]);

  // Show counter payment popup when payment request arrives
  useEffect(() => {
    if (!newPaymentRequest) return;
    console.log("DEBUG: newPaymentRequest arrived in OrdersMain:", newPaymentRequest);
    
    // Prioritize payment popup - it's crucial for money collection
    // We only block it if a new order popup is ACTIVE (swipe to accept one)
    if (showNewOrderPopupRef.current) {
        console.log("DEBUG: Suppressing payment popup because new order popup is showing");
        return;
    }
    
    const key = `payment-${newPaymentRequest.sessionId}`;
    if (!shownPaymentsRef.current.has(key)) {
      console.log("DEBUG: Showing counter payment popup for key:", key);
      shownPaymentsRef.current.add(key);
      setPopupPayment(newPaymentRequest);
      setShowCounterPaymentPopup(true);
      toast.info(`Counter payment request for Table ${newPaymentRequest.tableNumber}`);
    } else {
      console.log("DEBUG: Payment request already shown for key:", key);
    }
  }, [newPaymentRequest]);

  useEffect(() => {
    if (!newClosedSession?.sessionId) return;

    const closureType = String(newClosedSession?.closureType || "").toUpperCase();
    if (closureType === "EMPTY_CANCELLED") {
      const reasonText = String(newClosedSession?.closeReason || "").trim();
      toast.info(
        reasonText
          ? `Table ${newClosedSession.tableNumber} session closed by user: ${reasonText}`
          : `Table ${newClosedSession.tableNumber} empty session was closed by user`
      );
      requestOrdersRefresh();
    }

    clearNewClosedSession();
  }, [newClosedSession]);

  // Keep refs in sync to avoid stale state inside one-time event handlers.
  useEffect(() => {
    showNewOrderPopupRef.current = showNewOrderPopup;
  }, [showNewOrderPopup]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    newOrderRef.current = newOrder;
  }, [newOrder]);

  const stopOrderAlertSound = () => {
    stopNotificationSound?.();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  useEffect(() => {
    setNotificationSoundMuted?.(isMuted);
    if (isMuted) {
      stopOrderAlertSound();
    }
  }, [isMuted, setNotificationSoundMuted]);

  const getRestaurantOrderActionIds = (orderLike) => {
    const objectLikeIds = [
      orderLike?.orderMongoId,
      orderLike?._id,
      orderLike?.id,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    const displayOrderId = String(orderLike?.orderId || "").trim();
    const includeDisplayOrderId =
      displayOrderId &&
      !isDineInOrderLike(orderLike) &&
      !/^table\s+\S+/i.test(displayOrderId);

    return Array.from(
      new Set([
        ...objectLikeIds,
        ...(includeDisplayOrderId ? [displayOrderId] : []),
      ]),
    );
  };

  const runRestaurantOrderAction = async (orderLike, action) => {
    const candidateIds = getRestaurantOrderActionIds(orderLike);
    let lastError = null;

    for (const candidateId of candidateIds) {
      try {
        return await action(candidateId);
      } catch (error) {
        lastError = error;
        if (error?.response?.status !== 404) {
          throw error;
        }
      }
    }

    throw lastError || new Error("Order not found");
  };

  // Best-effort unlock for popup buzzer so it can keep playing when tab is backgrounded.
  useEffect(() => {
    const unlockAudio = async () => {
      if (audioUnlockedRef.current || !audioRef.current) return;
      try {
        audioRef.current.muted = true;
        await audioRef.current.play();
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.muted = false;
        audioRef.current.volume = 1;
        audioUnlockedRef.current = true;

        // If an order popup is already open, start buzzing immediately after unlock.
        if (showNewOrderPopupRef.current && !isMutedRef.current) {
          audioRef.current.loop = true;
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => {});
        }
      } catch (_) {
        audioRef.current.muted = false;
      }
    };

    window.addEventListener("pointerdown", unlockAudio, {
      once: true,
      passive: true,
    });
    window.addEventListener("keydown", unlockAudio, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  const [ordersRefreshToken, setOrdersRefreshToken] = useState(0);
  const requestOrdersRefresh = () => setOrdersRefreshToken((t) => t + 1);

  // Check for confirmed orders that haven't been shown in popup yet, or scheduled orders whose time has come
  useEffect(() => {
    const checkOrdersToPopup = async () => {
      // Skip if popup is already showing or Socket.IO order exists
      if (showNewOrderPopupRef.current || newOrderRef.current) return;

      try {
        const response = await restaurantAPI.getOrders();
        if (response.data?.success && response.data.data?.orders) {
          const now = Date.now();

          // Find orders that should trigger the popup
          const targetOrders = response.data.data.orders.filter((order) => {
            if (hasOrderBeenShown(order)) return false;

            const isConfirmed = order.status === "confirmed";
            const isUnacceptedScheduled =
              isScheduledAwaitingRestaurantAcceptance(order);

            if (
              isConfirmed &&
              !order.scheduledAt &&
              !Boolean(order.isAcceptedByRestaurant)
            ) {
              return true; // ordinary confirmed fallback
            }

            if (
              order.scheduledAt &&
              (
                order.status === "created" ||
                isUnacceptedScheduled
              )
            ) {
              const scheduledTime = new Date(order.scheduledAt).getTime();
              // Show popup if scheduled time is <= 30 mins from now
              if (scheduledTime <= now + 30 * 60000) return true;
            }

            return false;
          });

          // Show the most recent matching order in popup
          if (
            targetOrders.length > 0 &&
            !showNewOrderPopupRef.current &&
            !newOrderRef.current
          ) {
            const orderToPopup = targetOrders[0];
            const orderId = orderToPopup.orderId || orderToPopup._id;

            const orderForPopup = normalizeOrderForPopup(orderToPopup);

            debugLog("?? Found order ready for popup:", orderForPopup);
            markOrderAsShown({ orderId, _id: orderToPopup._id });
            setPopupOrder(orderForPopup);
            setShowNewOrderPopup(true);
            setCountdown(240);
          }
        }
      } catch (error) {
        if (error.response?.status !== 401) {
          debugError("Error checking orders to popup:", error);
        }
      }
    };

    // Check once on mount, and then every minute
    checkOrdersToPopup();
    const intervalId = setInterval(checkOrdersToPopup, 60000);

    return () => clearInterval(intervalId);
  }, [ordersRefreshToken]);

  // Play audio when popup opens
  useEffect(() => {
    if (showNewOrderPopup && !isMuted) {
      if (audioRef.current) {
        audioRef.current.loop = true;
        audioRef.current.muted = false;
        audioRef.current.volume = 1;
        audioRef.current.currentTime = 0;
        audioRef.current
          .play()
          .catch((err) => debugLog("Audio play failed:", err));
      }
    } else if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [showNewOrderPopup, isMuted]);

  // Countdown timer
  useEffect(() => {
    if (showNewOrderPopup && countdown > 0) {
      const timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [showNewOrderPopup, countdown]);

  useEffect(() => {
    if (!showNewOrderPopup) {
      setAcceptSwipeProgress(0);
      setIsAcceptingOrder(false);
      acceptSwipeActiveRef.current = false;
      acceptSwipeStartXRef.current = 0;
    }
  }, [showNewOrderPopup]);

  useEffect(() => {
    const handlePointerMove = (event) => {
      if (acceptSwipeActiveRef.current) {
        if (typeof event.preventDefault === "function") event.preventDefault();
        handleAcceptSwipeMove(event.clientX);
      }
    };

    const handleMouseMove = (event) => {
      if (acceptSwipeActiveRef.current) {
        handleAcceptSwipeMove(event.clientX);
      }
    };

    const handleTouchMove = (event) => {
      if (acceptSwipeActiveRef.current && event.touches[0]) {
        // Prevent page scroll while swiping the slider
        if (typeof event.preventDefault === "function") event.preventDefault();
        handleAcceptSwipeMove(event.touches[0].clientX);
      }
    };

    const handlePointerEnd = () => {
      if (acceptSwipeActiveRef.current) {
        handleAcceptSwipeEnd();
      }
    };

    // Pointer events are the most reliable option inside Android/iOS webviews.
    window.addEventListener("pointermove", handlePointerMove, {
      passive: false,
    });
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handlePointerEnd);
    // passive: false is required to allow preventDefault() during swipe
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handlePointerEnd);
    window.addEventListener("touchcancel", handlePointerEnd);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handlePointerEnd);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handlePointerEnd);
      window.removeEventListener("touchcancel", handlePointerEnd);
    };
  }, [isAcceptingOrder]);

  // Format countdown time
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const getAcceptSliderMetrics = () => {
    const sliderWidth = acceptSliderRef.current?.offsetWidth || 320;
    const handleWidth = 56;
    const horizontalPadding = 8;
    const maxTravel = Math.max(
      sliderWidth - handleWidth - horizontalPadding * 2,
      1,
    );
    return { maxTravel };
  };

  const triggerSwipeAccept = () => {
    if (isAcceptingOrder) return;
    setAcceptSwipeProgress(1);
    setTimeout(() => {
      handleAcceptOrder();
    }, 160);
  };

  const handleAcceptSwipeStart = (clientX) => {
    if (isAcceptingOrder) return;
    acceptSwipeStartXRef.current = clientX;
    acceptSwipeActiveRef.current = true;
  };

  const handleAcceptSwipeMove = (clientX) => {
    if (!acceptSwipeActiveRef.current || isAcceptingOrder) return;
    const deltaX = Math.max(clientX - acceptSwipeStartXRef.current, 0);
    const { maxTravel } = getAcceptSliderMetrics();
    setAcceptSwipeProgress(Math.min(deltaX / maxTravel, 1));
  };

  const handleAcceptSwipeEnd = () => {
    if (!acceptSwipeActiveRef.current || isAcceptingOrder) return;
    acceptSwipeActiveRef.current = false;

    if (acceptSwipeProgress >= 0.45) {
      triggerSwipeAccept();
      return;
    }

    setAcceptSwipeProgress(0);
  };

  // Handle accept order
  const handleAcceptOrder = async () => {
    if (isAcceptingOrder) return;
    setIsAcceptingOrder(true);

    stopOrderAlertSound();

    // Use popupOrder (from Socket.IO or API fallback) or newOrder (from hook)
    const orderToAccept = popupOrder || newOrder;

    // Ensure this order can't re-trigger fallback popup by using a different id key.
    markOrderAsShown(orderToAccept);

    // Accept order via API if we have a real order
    if (orderToAccept?.orderMongoId || orderToAccept?.orderId) {
      try {
        const orderId = orderToAccept.orderMongoId || orderToAccept.orderId;
        
        // DINE-IN SPECIAL HANDLING
        if (isDineInOrderLike(orderToAccept)) {
            // For Dine-In, "accepting" moves the latest round from received -> preparing.
            const roundId = getDineInRoundId(orderToAccept);
            if (roundId) {
                await dineInAPI.updateOrderStatus(roundId, { status: "preparing" });
                toast.success("Dine-In order accepted & marked as Preparing");
            } else {
                toast.error("Dine-In round not found");
                setIsAcceptingOrder(false);
                setAcceptSwipeProgress(0);
                return;
            }
        } else {
            const isScheduledTakeaway =
              orderToAccept?.fulfillmentType === "takeaway" &&
              (
                String(orderToAccept?.order_type || "").toUpperCase() === "SCHEDULED" ||
                Boolean(orderToAccept?.scheduledAt || orderToAccept?.prep_start_time)
              );

            if (isScheduledTakeaway) {
              await runRestaurantOrderAction(orderToAccept, (resolvedOrderId) =>
                restaurantAPI.updateOrderStatus(resolvedOrderId, { orderStatus: "confirmed" }),
              );
              toast.success("Scheduled order accepted");
            } else {
              // Standard Takeaway/Delivery acceptance
              await runRestaurantOrderAction(orderToAccept, (resolvedOrderId) =>
                restaurantAPI.acceptOrder(resolvedOrderId),
              );
              toast.success("Order accepted successfully");
            }
        }
        
        debugLog("? Order accepted:", orderId);
        requestOrdersRefresh();
      } catch (error) {
        debugError("? Error accepting order:", error);
        const errorMessage =
          error.response?.data?.message ||
          error.message ||
          "Failed to accept order. Please try again.";

        // Show specific error message
        if (error.response?.status === 400) {
          toast.error(errorMessage);
        } else if (error.response?.status === 404) {
          toast.error(
            "Order not found. It may have been cancelled or already processed.",
          );
        } else {
          toast.error(errorMessage);
        }
        setIsAcceptingOrder(false);
        setAcceptSwipeProgress(0);
        return;
      }
    }

    setShowNewOrderPopup(false);
    setPopupOrder(null);
    clearNewOrder();
    setCountdown(240);
    setAcceptSwipeProgress(0);
    setIsAcceptingOrder(false);

    // Note: PreparingOrders component will automatically refresh orders via its own useEffect
    // No need to manually refresh here as the component polls every 10 seconds
  };

  // Handle reject order
  const handleRejectClick = () => {
    setShowRejectPopup(true);
  };

  const handleRejectConfirm = async () => {
    if (!rejectReason) return;

    // Use popupOrder (from Socket.IO or API fallback) or newOrder (from hook)
    const orderToReject = popupOrder || newOrder;

    // Reject order via API if we have a real order
    if (orderToReject?.orderMongoId || orderToReject?.orderId) {
      try {
        const orderId = isDineInOrderLike(orderToReject)
          ? getDineInRoundId(orderToReject)
          : orderToReject.orderMongoId || orderToReject.orderId;
        
        if (isDineInOrderLike(orderToReject)) {
            // Dine-In order rejection handling
            if (!orderId) throw new Error("Dine-In round not found");
            await dineInAPI.updateOrderStatus(orderId, { status: "cancelled", reason: rejectReason });
            toast.success("Dine-In order rejected");
        } else {
            // Standard order rejection
            await runRestaurantOrderAction(orderToReject, (resolvedOrderId) =>
              restaurantAPI.rejectOrder(resolvedOrderId, rejectReason),
            );
            toast.success("Order rejected successfully");
        }

        debugLog("? Order rejected:", orderId);
        requestOrdersRefresh();
      } catch (error) {
        debugError("? Error rejecting order:", error);
        alert("Failed to reject order. Please try again.");
        return;
      }
    }

    stopOrderAlertSound();
    setShowRejectPopup(false);
    setShowNewOrderPopup(false);
    setPopupOrder(null);
    clearNewOrder();
    setRejectReason("");
    setCountdown(240);
  };

  const handleRejectCancel = () => {
    setShowRejectPopup(false);
    setShowNewOrderPopup(false);
    setPopupOrder(null);
    clearNewOrder();
    setRejectReason("");
    setCountdown(240);
  };

  // Handle cancel order (for preparing orders)
  const handleCancelClick = (order) => {
    setOrderToCancel(order);
    setShowCancelPopup(true);
  };

  const handleCancelConfirm = async () => {
    if (!cancelReason.trim() || !orderToCancel) return;

    try {
      const orderId = isDineInOrderLike(orderToCancel)
        ? getDineInRoundId(orderToCancel)
        : orderToCancel.mongoId || orderToCancel.orderId;
      
      if (isDineInOrderLike(orderToCancel)) {
        // Dine-In specific cancellation
        if (!orderId) throw new Error("Dine-In round not found");
        await dineInAPI.updateOrderStatus(orderId, { status: "cancelled", reason: cancelReason.trim() });
      } else {
        // Standard order cancellation
        await runRestaurantOrderAction(orderToCancel, (resolvedOrderId) =>
          restaurantAPI.rejectOrder(resolvedOrderId, cancelReason.trim()),
        );
      }
      
      toast.success("Order cancelled successfully");
      requestOrdersRefresh();
      setShowCancelPopup(false);
      setOrderToCancel(null);
      setCancelReason("");
    } catch (error) {
      debugError("? Error cancelling order:", error);
      toast.error(error.response?.data?.message || "Failed to cancel order");
    }
  };

  const handleCancelPopupClose = () => {
    setShowCancelPopup(false);
    setOrderToCancel(null);
    setCancelReason("");
  };

  const handleCloseBookingPopup = () => {
    setShowNewBookingPopup(false);
    setPopupBooking(null);
    clearNewBooking();
  };

  const handleCloseCounterPopup = () => {
    setShowCounterPaymentPopup(false);
    setPopupPayment(null);
    clearNewPaymentRequest();
  };

  const handleMarkPaid = async () => {
    const payment = popupPayment || newPaymentRequest;
    if (!payment?.sessionId) return;

    try {
      setIsMarkingPaid(true);
      const res = await dineInAPI.markCounterPaymentPaid(payment.sessionId);
      if (res?.data?.success) {
        toast.success(`Payment marked as PAID for Table ${payment.tableNumber}`);
        handleCloseCounterPopup();
        requestOrdersRefresh();
      } else {
        toast.error(res?.data?.message || "Failed to mark as paid");
      }
    } catch (e) {
      toast.error(
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        "Error marking payment as paid"
      );
    } finally {
      setIsMarkingPaid(false);
    }
  };

  const handleAcceptBooking = async () => {
    const booking = popupBooking || newBooking;
    const bookingId = booking?._id || booking?.id;
    if (!bookingId) return;

    try {
      const res = await dineInAPI.acceptBooking(bookingId);
      if (res?.data?.success) {
        markBookingAsShown(booking);
        toast.success("Booking accepted");
      } else {
        toast.error("Failed to accept booking");
        return;
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || "Failed to accept booking");
      return;
    }

    handleCloseBookingPopup();
    navigate("/restaurant/reservations");
  };

  const handleDeclineBooking = async () => {
    const booking = popupBooking || newBooking;
    const bookingId = booking?._id || booking?.id;
    if (!bookingId) return;

    try {
      const res = await dineInAPI.declineBooking(bookingId);
      if (res?.data?.success) {
        markBookingAsShown(booking);
        toast.success("Booking declined");
      } else {
        toast.error("Failed to decline booking");
        return;
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || "Failed to decline booking");
      return;
    }

    handleCloseBookingPopup();
    navigate("/restaurant/reservations");
  };

  // Toggle mute
  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (audioRef.current) {
      if (nextMuted) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } else if (showNewOrderPopup) {
        audioRef.current.muted = false;
        audioRef.current.volume = 1;
        audioRef.current.currentTime = 0;
        audioRef.current
          .play()
          .catch((err) => debugLog("Audio play failed:", err));
      }
    }
  };

  // Handle PDF download
  const handlePrint = async () => {
    if (!newOrder) {
      debugWarn("No order data available for PDF generation");
      return;
    }

    try {
      // Create new PDF document
      const doc = new jsPDF();

      // Set font
      doc.setFont("helvetica", "bold");

      // Header
      doc.setFontSize(20);
      doc.text("Order Receipt", 105, 20, { align: "center" });

      // Restaurant name
      doc.setFontSize(14);
      doc.setFont("helvetica", "normal");
      doc.text(orderToPrint.restaurantName || "Restaurant", 105, 30, {
        align: "center",
      });

      // Order details
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(`Order ID: ${orderToPrint.orderId || "N/A"}`, 20, 45);
      doc.setFont("helvetica", "normal");

      const orderDate = orderToPrint.createdAt
        ? new Date(orderToPrint.createdAt).toLocaleString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : new Date().toLocaleString("en-GB");

      doc.text(`Date: ${orderDate}`, 20, 52);

      // Customer address
      if (orderToPrint.customerAddress) {
        doc.setFont("helvetica", "bold");
        doc.text("Delivery Address:", 20, 62);
        doc.setFont("helvetica", "normal");
        const addressText =
          [
            orderToPrint.customerAddress.street,
            orderToPrint.customerAddress.city,
            orderToPrint.customerAddress.state,
          ]
            .filter(Boolean)
            .join(", ") || "Address not available";
        const addressLines = doc.splitTextToSize(addressText, 170);
        doc.text(addressLines, 20, 69);
      }

      // Items table
      let yPos = 85;
      if (orderToPrint.items && orderToPrint.items.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.text("Items:", 20, yPos);
        yPos += 8;

        // Prepare table data
        const tableData = orderToPrint.items.map((item) => [
          item.name || "Item",
          item.quantity || 1,
          `₹${(item.price || 0).toFixed(2)}`,
          `₹${((item.price || 0) * (item.quantity || 1)).toFixed(2)}`,
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [["Item", "Qty", "Price", "Total"]],
          body: tableData,
          theme: "striped",
          headStyles: {
            fillColor: [0, 0, 0],
            textColor: 255,
            fontStyle: "bold",
          },
          styles: { fontSize: 9 },
          columnStyles: {
            0: { cellWidth: 80 },
            1: { cellWidth: 30, halign: "center" },
            2: { cellWidth: 35, halign: "right" },
            3: { cellWidth: 35, halign: "right" },
          },
        });

        yPos = doc.lastAutoTable.finalY + 10;
      }

      // Total
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(`Total: ₹${(orderToPrint.total || 0).toFixed(2)}`, 20, yPos);

      // Payment status
      yPos += 10;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Payment Status: ${orderToPrint.status === "confirmed" ? "Paid" : "Pending"}`,
        20,
        yPos,
      );

      // Estimated delivery time
      if (orderToPrint.estimatedDeliveryTime) {
        yPos += 8;
        doc.text(
          `Estimated Delivery: ${orderToPrint.estimatedDeliveryTime} minutes`,
          20,
          yPos,
        );
      }

      // Notes
      if (orderToPrint.note) {
        yPos += 10;
        doc.setFont("helvetica", "bold");
        doc.text("Note:", 20, yPos);
        doc.setFont("helvetica", "normal");
        const noteLines = doc.splitTextToSize(orderToPrint.note, 170);
        doc.text(noteLines, 20, yPos + 7);
      }

      // Cutlery preference
      yPos += 15;
      doc.setFont("helvetica", "normal");
      doc.text(
        orderToPrint.sendCutlery === false
          ? "? Don't send cutlery"
          : "? Send cutlery requested",
        20,
        yPos,
      );

      // Footer
      const pageHeight = doc.internal.pageSize.height;
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.text(
        `Generated on ${new Date().toLocaleString("en-GB")}`,
        105,
        pageHeight - 10,
        { align: "center" },
      );

      // Download PDF
      const fileName = `Order-${orderToPrint.orderId || "Receipt"}-${Date.now()}.pdf`;
      doc.save(fileName);

      debugLog("? PDF generated successfully:", fileName);
    } catch (error) {
      debugError("? Error generating PDF:", error);
      alert("Failed to generate PDF. Please try again.");
    }
  };

  // Handle swipe gestures with smooth animations
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchEndX.current = e.touches[0].clientX;
    isSwiping.current = false;
  };

  const handleTouchMove = (e) => {
    if (!isSwiping.current) {
      const deltaX = Math.abs(e.touches[0].clientX - touchStartX.current);
      const deltaY = Math.abs(e.touches[0].clientY - touchStartY.current);

      // Determine if this is a horizontal swipe
      if (deltaX > deltaY && deltaX > 10) {
        isSwiping.current = true;
      }
    }

    if (isSwiping.current) {
      touchEndX.current = e.touches[0].clientX;
    }
  };

  const handleTouchEnd = () => {
    if (!isSwiping.current) {
      touchStartX.current = 0;
      touchEndX.current = 0;
      return;
    }

    const swipeDistance = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 50;
    const swipeVelocity = Math.abs(swipeDistance);

    if (swipeVelocity > minSwipeDistance && !isTransitioning) {
      const currentIndex = filterTabs.findIndex(
        (tab) => tab.id === activeFilter,
      );
      let newIndex = currentIndex;

      if (swipeDistance > 0 && currentIndex < filterTabs.length - 1) {
        // Swipe left - go to next filter (right side)
        newIndex = currentIndex + 1;
      } else if (swipeDistance < 0 && currentIndex > 0) {
        // Swipe right - go to previous filter (left side)
        newIndex = currentIndex - 1;
      }

      if (newIndex !== currentIndex) {
        setIsTransitioning(true);

        // Smooth transition with animation
        setTimeout(() => {
          setActiveFilter(filterTabs[newIndex].id);
          scrollToFilter(newIndex);

          // Reset transition state after animation
          setTimeout(() => {
            setIsTransitioning(false);
          }, 300);
        }, 50);
      }
    }

    // Reset touch positions
    touchStartX.current = 0;
    touchEndX.current = 0;
    touchStartY.current = 0;
    isSwiping.current = false;
  };

  // Scroll filter bar to show active button with smooth animation
  const scrollToFilter = (index) => {
    if (filterBarRef.current) {
      const buttons = filterBarRef.current.querySelectorAll("button");
      if (buttons[index]) {
        const button = buttons[index];
        const container = filterBarRef.current;
        const buttonLeft = button.offsetLeft;
        const buttonWidth = button.offsetWidth;
        const containerWidth = container.offsetWidth;
        const scrollLeft = buttonLeft - containerWidth / 2 + buttonWidth / 2;

        container.scrollTo({
          left: scrollLeft,
          behavior: "smooth",
        });
      }
    }
  };

  // Scroll to active filter on change with smooth animation
  useEffect(() => {
    const index = filterTabs.findIndex((tab) => tab.id === activeFilter);
    if (index >= 0) {
      // Use requestAnimationFrame for smoother scrolling
      requestAnimationFrame(() => {
        scrollToFilter(index);
      });
    }
  }, [activeFilter]);

  const handleSelectOrder = (order) => {
    setSelectedOrder(order);
    setIsSheetOpen(true);
  };

  const updateSelectedDineInRoundStatus = async (nextStatus, successMessage) => {
    try {
      const sessionId = selectedOrder?.mongoId;
      if (!sessionId) {
        toast.error("Dine-In session not found");
        return;
      }

      const res = await dineInAPI.getSession(sessionId);
      const session = res.data?.data;
      const rounds = Array.isArray(session?.orders) ? session.orders : [];
      const lastRound = rounds.length ? rounds[rounds.length - 1] : null;

      if (!lastRound?._id) {
        toast.error("No active order round found for this table");
        return;
      }

      await dineInAPI.updateOrderStatus(lastRound._id, { status: nextStatus });
      toast.success(successMessage);
      setIsSheetOpen(false);
      requestOrdersRefresh();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to update table status");
    }
  };

  const renderContent = () => {
    switch (activeFilter) {
      case "all":
        return (
          <AllOrders
            onSelectOrder={handleSelectOrder}
            onCancel={handleCancelClick}
            refreshToken={ordersRefreshToken}
          />
        );
      case "preparing":
        return (
          <PreparingOrders
            onSelectOrder={handleSelectOrder}
            onCancel={handleCancelClick}
            refreshToken={ordersRefreshToken}
            onStatusChanged={requestOrdersRefresh}
          />
        );
      case "ready":
        return (
          <ReadyOrders
            onSelectOrder={handleSelectOrder}
            refreshToken={ordersRefreshToken}
            onStatusChanged={requestOrdersRefresh}
          />
        );
      case "scheduled":
        return (
          <ScheduledOrders
            onSelectOrder={handleSelectOrder}
            refreshToken={ordersRefreshToken}
          />
        );
      case "completed":
        return (
          <CompletedOrders
            onSelectOrder={handleSelectOrder}
            refreshToken={ordersRefreshToken}
          />
        );
      case "table-booking":
        return <TableBookings />;
      case "cancelled":
        return (
          <CancelledOrders
            onSelectOrder={handleSelectOrder}
            refreshToken={ordersRefreshToken}
          />
        );
      default:
        return <EmptyState />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Restaurant Navbar - Sticky at top */}
      <div className="sticky top-0 z-50 bg-white">
        <RestaurantNavbar showNotifications={true} />
      </div>

      {/* Top Filter Bar - Sticky below navbar */}
      <div className="sticky top-[50px] z-40 pb-2 bg-gray-100">
        <div
          ref={filterBarRef}
          className="flex gap-2 overflow-x-auto scrollbar-hide bg-transparent rounded-full px-3 py-2 mt-2"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            WebkitOverflowScrolling: "touch",
          }}>
          <style>{`
            .scrollbar-hide::-webkit-scrollbar {
              display: none;
            }
          `}</style>
          {filterTabs.map((tab, index) => {
            const isActive = activeFilter === tab.id;

            return (
              <motion.button
                key={tab.id}
                onClick={() => {
                  if (!isTransitioning) {
                    setIsTransitioning(true);
                    setActiveFilter(tab.id);
                    scrollToFilter(index);
                    setTimeout(() => setIsTransitioning(false), 300);
                  }
                }}
                className={`shrink-0 px-6 py-3.5 rounded-full font-medium text-sm whitespace-nowrap relative overflow-hidden ${
                  isActive ? "text-white" : "bg-white text-black"
                }`}
                animate={{
                  scale: isActive ? 1.05 : 1,
                  opacity: isActive ? 1 : 0.7,
                }}
                transition={{
                  duration: 0.3,
                  ease: [0.25, 0.1, 0.25, 1],
                }}
                whileTap={{ scale: 0.95 }}>
                {isActive && (
                  <motion.div
                    layoutId="activeFilterBackground"
                    className="absolute inset-0 rounded-full -z-10"
                    style={{ backgroundColor: RESTAURANT_THEME.brand }}
                    initial={false}
                    transition={{
                      type: "spring",
                      stiffness: 500,
                      damping: 30,
                    }}
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Content Area - Scrollable */}
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto px-4 pb-24 content-scroll"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={(e) => {
          mouseStartX.current = e.clientX;
          mouseEndX.current = e.clientX;
          isMouseDown.current = true;
          isSwiping.current = false;
        }}
        onMouseMove={(e) => {
          if (isMouseDown.current) {
            if (!isSwiping.current) {
              const deltaX = Math.abs(e.clientX - mouseStartX.current);
              if (deltaX > 10) {
                isSwiping.current = true;
              }
            }
            if (isSwiping.current) {
              mouseEndX.current = e.clientX;
            }
          }
        }}
        onMouseUp={() => {
          if (isMouseDown.current && isSwiping.current) {
            const swipeDistance = mouseStartX.current - mouseEndX.current;
            const minSwipeDistance = 50;

            if (
              Math.abs(swipeDistance) > minSwipeDistance &&
              !isTransitioning
            ) {
              const currentIndex = filterTabs.findIndex(
                (tab) => tab.id === activeFilter,
              );
              let newIndex = currentIndex;

              if (swipeDistance > 0 && currentIndex < filterTabs.length - 1) {
                newIndex = currentIndex + 1;
              } else if (swipeDistance < 0 && currentIndex > 0) {
                newIndex = currentIndex - 1;
              }

              if (newIndex !== currentIndex) {
                setIsTransitioning(true);
                setTimeout(() => {
                  setActiveFilter(filterTabs[newIndex].id);
                  scrollToFilter(newIndex);
                  setTimeout(() => setIsTransitioning(false), 300);
                }, 50);
              }
            }
          }

          isMouseDown.current = false;
          isSwiping.current = false;
          mouseStartX.current = 0;
          mouseEndX.current = 0;
        }}
        onMouseLeave={() => {
          isMouseDown.current = false;
          isSwiping.current = false;
        }}>
        <style>{`
          .content-scroll {
            scrollbar-width: none;
            -ms-overflow-style: none;
          }
          .content-scroll::-webkit-scrollbar {
            display: none;
          }
        `}</style>

        {/* Verification Pending Card - Show if onboarding is complete (all 4 steps) and restaurant is not active */}
        {!restaurantStatus.isLoading &&
          !restaurantStatus.isActive &&
          restaurantStatus.onboarding?.completedSteps === 4 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className={`mt-4 mb-4 rounded-2xl shadow-sm px-6 py-4 ${
                restaurantStatus.rejectionReason
                  ? "bg-white border border-red-200"
                  : "bg-white border border-yellow-200"
              }`}>
              {restaurantStatus.rejectionReason ? (
                <>
                  <div className="flex items-start gap-3 mb-3">
                    <div className="flex-shrink-0 rounded-full p-2 bg-red-100">
                      <AlertCircle className="w-5 h-5 text-red-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-red-600 mb-2">
                        Denied Verification
                      </h3>
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                        <p className="text-xs font-semibold text-red-800 mb-2">
                          Reason for Rejection:
                        </p>
                        <div className="text-xs text-red-700 space-y-1">
                          {restaurantStatus.rejectionReason
                            .split("\n")
                            .filter((line) => line.trim()).length > 1 ? (
                            <ul className="space-y-1 list-disc list-inside">
                              {restaurantStatus.rejectionReason
                                .split("\n")
                                .map(
                                  (point, index) =>
                                    point.trim() && (
                                      <li key={index}>{point.trim()}</li>
                                    ),
                                )}
                            </ul>
                          ) : (
                            <p className="text-red-700">
                              {restaurantStatus.rejectionReason}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 mb-3">
                    Please correct the above issues and click "Reverify" to
                    resubmit your request for approval.
                  </p>
                  <button
                    onClick={handleReverify}
                    disabled={isReverifying}
                    className="w-full px-6 py-2.5 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                    {isReverifying ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      "Reverify"
                    )}
                  </button>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">
                    Verification Done in 24 Hours
                  </h3>
                  <p className="text-sm text-gray-600">
                    Your account is under verification. You'll be notified once
                    approved.
                  </p>
                </>
              )}
            </motion.div>
          )}

        <AnimatePresence mode="wait">
          <motion.div
            key={activeFilter}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}>
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Audio element */}
      <audio
        ref={audioRef}
        src={notificationSound}
        preload="auto"
        playsInline
      />

      {/* New Order Popup */}
      <AnimatePresence>
        {showNewOrderPopup && (
          <>
            <motion.div
              className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}>
              <motion.div
                className="w-[95%] max-w-md max-h-[calc(100vh-2rem)] bg-white rounded-3xl shadow-2xl overflow-hidden p-0.5 flex flex-col"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="px-4 py-2 bg-white border-b border-gray-200 flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-base font-bold text-gray-900">
                      {(popupOrder || newOrder)?.isDineIn
                        ? "New Dine-In Order"
                        : (popupOrder || newOrder)?.scheduledAt
                          ? "New Scheduled Order"
                          : "New Order"}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Order{" "}
                      {(popupOrder || newOrder)?.orderId
                        ? `#${(popupOrder || newOrder).orderId}`
                        : ""}
                      {(popupOrder || newOrder)?.restaurantName
                        ? ` • ${(popupOrder || newOrder).restaurantName}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePrint}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      aria-label="Print">
                      <Printer className="w-5 h-5 text-gray-700" />
                    </button>
                    <button
                      onClick={toggleMute}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      aria-label={isMuted ? "Unmute" : "Mute"}>
                      {isMuted ? (
                        <VolumeX className="w-5 h-5 text-gray-700" />
                      ) : (
                        <Volume2 className="w-5 h-5 text-gray-700" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="px-4 py-2 flex-1 overflow-y-auto min-h-0">
                  {/* Scheduled Indicator */}
                  {((popupOrder || newOrder)?.fulfillmentType === "takeaway" ||
                    (popupOrder || newOrder)?.pickupAt) && (
                    <div className="mb-2 bg-orange-50 border border-orange-200 rounded-lg p-2 flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                        <Calendar className="w-4 h-4 text-orange-600" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-orange-800 uppercase tracking-wider">
                          {((popupOrder || newOrder)?.order_type === "SCHEDULED")
                            ? "Scheduled Order"
                            : "Takeaway Order"}
                        </p>
                        {(() => {
                          const activeOrder = popupOrder || newOrder;
                          const prepTimeMinutes = getOrderPrepTimeMinutes(activeOrder);
                          const isImmediateTakeaway =
                            activeOrder?.fulfillmentType === "takeaway" &&
                            activeOrder?.order_type === "IMMEDIATE";

                          return (
                            <>
                              {isImmediateTakeaway && (
                                <p className="text-sm font-semibold text-orange-900 mt-0.5">
                                  Prepare now
                                </p>
                              )}
                              {!isImmediateTakeaway && activeOrder?.pickupAt && (
                                <p className="text-sm font-semibold text-orange-900 mt-0.5">
                                  Pickup at {formatClockTime(activeOrder.pickupAt)}
                                </p>
                              )}
                              {prepTimeMinutes ? (
                                <p className="text-xs text-orange-800 mt-1">
                                  Prep time: {prepTimeMinutes} min
                                </p>
                              ) : null}
                              {isImmediateTakeaway && activeOrder?.pickupAt && (
                                <p className="text-xs text-orange-800 mt-1">
                                  Ready at {formatClockTime(activeOrder.pickupAt)}
                                </p>
                              )}
                              {!isImmediateTakeaway && activeOrder?.prep_start_time && (
                                <p className="text-xs text-orange-800 mt-1">
                                  Auto start at {formatClockTime(activeOrder.prep_start_time)}
                                </p>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  {/* DINE-IN Indicator */}
                  {(popupOrder || newOrder)?.isDineIn && (
                    <div className="mb-2 bg-indigo-50 border border-indigo-200 rounded-lg p-2 flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                        <Utensils className="w-4 h-4 text-indigo-600" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider">
                          Dine-In Order
                        </p>
                        <p className="text-sm font-black text-indigo-900 mt-0.5">
                          {(popupOrder || newOrder)?.orderId || "New Table Order"}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Customer info */}
                  <div className="mb-2">
                    <h4 className="text-sm font-semibold text-gray-900">
                      {(popupOrder || newOrder)?.items?.[0]?.name ||
                        "New Order"}
                    </h4>
                    <p className="text-xs text-gray-500 mt-1">
                      {(popupOrder || newOrder)?.createdAt
                        ? new Date(
                            (popupOrder || newOrder).createdAt,
                          ).toLocaleString("en-GB", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Just now"}
                    </p>
                  </div>

                  {/* Details Accordion */}
                  <div className="mb-2">
                    <button
                      onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
                      className="w-full flex items-center justify-between py-1.5 border-b border-gray-200">
                      <div className="flex items-center gap-2">
                        <svg
                          className="w-5 h-5 text-gray-700"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                        <span className="text-sm font-semibold text-gray-900">
                          Details
                        </span>
                        <span className="text-xs text-gray-500">
                          {(popupOrder || newOrder)?.items?.length || 0} item
                          {(popupOrder || newOrder)?.items?.length !== 1
                            ? "s"
                            : ""}
                        </span>
                      </div>
                      {isDetailsExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-600" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-600" />
                      )}
                    </button>

                    <AnimatePresence>
                      {isDetailsExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden">
                          <div className="py-2 space-y-2">
                            {(popupOrder || newOrder)?.items?.map(
                              (item, index) => (
                                <div
                                  key={index}
                                  className="flex items-start gap-3">
                                  <div
                                    className={`w-2 h-2 rounded-full mt-1 shrink-0 ${item.isVeg ? "bg-green-500" : "bg-red-500"}`}></div>
                                  <div className="flex-1">
                                    <div className="flex items-start justify-between">
                                      <p className="text-sm font-medium text-gray-900">
                                        {item.quantity} x {item.name}
                                      </p>
                                      <p className="text-xs text-gray-600 ml-2">
                                        ₹{item.price * item.quantity}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ),
                            ) || (
                              <p className="text-sm text-gray-500">No items</p>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Cutlery preference */}
                  <div
                    className={`mb-2 flex items-center gap-2 rounded-lg p-2 ${(popupOrder || newOrder)?.sendCutlery === false
                        ? "bg-orange-50"
                        : "bg-gray-50"
                      }`}>
                    <svg
                      className={`h-5 w-5 ${(popupOrder || newOrder)?.sendCutlery === false
                          ? "text-orange-600"
                          : "text-gray-600"
                        }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                    <span
                      className={`text-sm font-medium ${(popupOrder || newOrder)?.sendCutlery === false
                          ? "text-orange-700"
                          : "text-gray-700"
                        }`}>
                      {(popupOrder || newOrder)?.sendCutlery === false
                        ? "Don't send cutlery"
                        : "Send cutlery"}
                    </span>
                  </div>

                  {/* Total bill */}
                  <div className="mb-2 flex items-center justify-between py-2 border-y border-gray-200">
                    <div className="flex items-center gap-2">
                      <svg
                        className="w-5 h-5 text-gray-700"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"
                        />
                      </svg>
                      <span className="text-sm font-semibold text-gray-900">
                        Total bill
                      </span>
                    </div>
                    <span className="text-base font-bold text-gray-900">
                      ₹{getPopupOrderTotal(popupOrder || newOrder)}
                    </span>
                  </div>

                  {/* Payment method: treat cash/cod (any case) as COD */}
                  {(() => {
                    const raw =
                      (popupOrder || newOrder)?.paymentMethod ||
                      (popupOrder || newOrder)?.payment?.method;
                    const m =
                      raw != null ? String(raw).toLowerCase().trim() : "";
                    const isCod = m === "cash" || m === "cod";
                    return (
                      <div className="mb-2 flex items-center justify-between py-1">
                        <span className="text-sm font-medium text-gray-700">
                          Payment
                        </span>
                        <span
                          className={`text-sm font-semibold ${isCod ? "text-amber-600" : "text-green-600"}`}>
                          {isCod ? "Cash on Delivery" : "Online"}
                        </span>
                      </div>
                    );
                  })()}

                  {(() => {
                    const activeOrder = popupOrder || newOrder;
                    const prepTimeMinutes = getOrderPrepTimeMinutes(activeOrder);
                    if (!prepTimeMinutes) return null;

                    return (
                      <div className="mb-2 rounded-lg bg-gray-50 px-3 py-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700">
                            Prep time
                          </span>
                          <span className="text-base font-semibold text-gray-900">
                            {prepTimeMinutes} mins
                          </span>
                        </div>
                        {activeOrder?.pickupAt && (
                          <div className="mt-2 flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-700">
                              {activeOrder?.order_type === "IMMEDIATE" ? "Ready at" : "Pickup at"}
                            </span>
                            <span className="text-sm font-semibold text-gray-900">
                              {formatClockTime(activeOrder.pickupAt)}
                            </span>
                          </div>
                        )}
                        {activeOrder?.order_type === "SCHEDULED" &&
                          activeOrder?.prep_start_time && (
                            <div className="mt-2 flex items-center justify-between">
                              <span className="text-sm font-medium text-gray-700">
                                Auto start at
                              </span>
                              <span className="text-sm font-semibold text-gray-900">
                                {formatClockTime(activeOrder.prep_start_time)}
                              </span>
                            </div>
                          )}
                      </div>
                    );
                  })()}
                </div>

                <div className="px-4 pb-4 pt-2 border-t border-gray-200 bg-white">
                  <div className="space-y-2">
                    <div
                      ref={acceptSliderRef}
                      className="relative h-12 rounded-2xl bg-gray-900 overflow-hidden select-none"
                      style={{ touchAction: "none" }}>
                      <motion.div
                        className="absolute inset-y-0 left-0 bg-blue-600"
                        initial={{ width: "100%" }}
                        animate={{ width: `${(countdown / 240) * 100}%` }}
                        transition={{ duration: 1, ease: "linear" }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center px-16">
                        <span className="relative z-10 text-sm font-semibold text-white text-center">
                          {isAcceptingOrder
                            ? "Accepting order..."
                            : `Slide to accept (${formatTime(countdown)})`}
                        </span>
                      </div>
                      <motion.button
                        type="button"
                        className="absolute left-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl bg-white text-gray-900 shadow-md disabled:cursor-not-allowed"
                        style={{
                          touchAction: "none",
                          x: (() => {
                            const sliderWidth =
                              acceptSliderRef.current?.offsetWidth || 320;
                            const handleWidth = 40;
                            const maxTravel = Math.max(
                              sliderWidth - handleWidth - 16,
                              0,
                            );
                            return acceptSwipeProgress * maxTravel;
                          })(),
                        }}
                        onPointerDown={(e) => {
                          if (typeof e.preventDefault === "function") e.preventDefault();
                          if (typeof e.currentTarget?.setPointerCapture === "function") {
                            try {
                              e.currentTarget.setPointerCapture(e.pointerId);
                            } catch (_) {}
                          }
                          handleAcceptSwipeStart(e.clientX);
                        }}
                        onPointerMove={(e) => {
                          if (!acceptSwipeActiveRef.current) return;
                          if (typeof e.preventDefault === "function") e.preventDefault();
                          handleAcceptSwipeMove(e.clientX);
                        }}
                        onPointerUp={(e) => {
                          if (typeof e.currentTarget?.releasePointerCapture === "function") {
                            try {
                              e.currentTarget.releasePointerCapture(e.pointerId);
                            } catch (_) {}
                          }
                          handleAcceptSwipeEnd();
                        }}
                        onPointerCancel={(e) => {
                          if (typeof e.currentTarget?.releasePointerCapture === "function") {
                            try {
                              e.currentTarget.releasePointerCapture(e.pointerId);
                            } catch (_) {}
                          }
                          handleAcceptSwipeEnd();
                        }}
                        onMouseDown={(e) => handleAcceptSwipeStart(e.clientX)}
                        onTouchStart={(e) =>
                          handleAcceptSwipeStart(e.touches[0].clientX)
                        }
                        onMouseMove={(e) => {
                          if (acceptSwipeActiveRef.current)
                            handleAcceptSwipeMove(e.clientX);
                        }}
                        onTouchMove={(e) =>
                          handleAcceptSwipeMove(e.touches[0].clientX)
                        }
                        onMouseUp={handleAcceptSwipeEnd}
                        onTouchEnd={handleAcceptSwipeEnd}
                        onTouchCancel={handleAcceptSwipeEnd}
                        disabled={isAcceptingOrder}>
                        <span className="text-lg font-bold">›</span>
                      </motion.button>
                    </div>

                    <button
                      onClick={handleRejectClick}
                      disabled={isAcceptingOrder}
                      className="w-full bg-white border-2 border-red-500 text-red-600 py-2.5 rounded-lg font-semibold text-sm hover:bg-red-50 transition-colors disabled:opacity-60">
                      Reject Order
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 💰 Counter Payment Pending Alert */}
      <AnimatePresence>
        {showCounterPaymentPopup && (
          <>
            <motion.div
              className="fixed inset-0 z-[65] bg-black/60 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseCounterPopup}
            >
              <motion.div
                className="w-[95%] max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="bg-orange-500 p-6 text-white text-center">
                  <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Wallet className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-black leading-tight uppercase tracking-wide">
                    Payment at Counter
                  </h3>
                  <p className="text-sm font-medium opacity-90 mt-1">
                    Customer is coming to pay
                  </p>
                </div>

                <div className="p-6">
                  <div className="space-y-4 mb-4">
                    <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                      <span className="text-gray-500 font-bold text-xs uppercase tracking-widest">Table</span>
                      <span className="text-2xl font-black text-gray-900">
                        {(popupPayment || newPaymentRequest)?.tableNumber || "—"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                      <span className="text-gray-500 font-bold text-xs uppercase tracking-widest">Payable</span>
                      <span className="text-2xl font-black text-emerald-600">
                        ₹{(popupPayment || newPaymentRequest)?.totalAmount || 0}
                      </span>
                    </div>
                    <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 flex items-center gap-3">
                      <Clock className="w-5 h-5 text-orange-500" />
                      <p className="text-[11px] font-black text-orange-800 leading-tight">
                        STATUS: PAYMENT PENDING
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <button
                      type="button"
                      disabled={isMarkingPaid}
                      onClick={handleMarkPaid}
                      className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black text-base hover:bg-emerald-700 shadow-lg shadow-emerald-200 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {isMarkingPaid ? "Processing..." : "Mark as Paid"}
                    </button>
                    <button
                      type="button"
                      onClick={handleCloseCounterPopup}
                      className="w-full bg-white border-2 border-gray-100 text-gray-400 py-3 rounded-2xl font-bold text-xs hover:bg-gray-50 active:scale-95 transition-all"
                    >
                      Remind later
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* New Table Booking Popup */}
      <AnimatePresence>
        {showNewBookingPopup && (
          <>
            <motion.div
              className="fixed inset-0 z-[65] bg-black/60 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseBookingPopup}
            >
              <motion.div
                className="w-[95%] max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-4 py-4 border-b border-gray-200 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-gray-900">
                      New Table Booking
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {(popupBooking || newBooking)?.bookingId
                        ? `Booking #${(popupBooking || newBooking).bookingId}`
                        : "Booking request received"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseBookingPopup}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5 text-gray-700" />
                  </button>
                </div>

                <div className="px-4 py-4">
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                      <span className="text-gray-600 font-medium">Guest</span>
                      <span className="text-gray-900 font-semibold truncate max-w-[60%] text-right">
                        {getBookingGuestName(popupBooking || newBooking)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                      <span className="text-gray-600 font-medium">Guests</span>
                      <span className="text-gray-900 font-semibold">
                        {(popupBooking || newBooking)?.guests || 1}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                      <span className="text-gray-600 font-medium">Date</span>
                      <span className="text-gray-900 font-semibold">
                        {(popupBooking || newBooking)?.date
                          ? new Date((popupBooking || newBooking).date).toLocaleDateString(
                              "en-GB",
                              { day: "2-digit", month: "short", year: "numeric" },
                            )
                          : "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                      <span className="text-gray-600 font-medium">Time</span>
                      <span className="text-gray-900 font-semibold">
                        {(popupBooking || newBooking)?.timeSlot || "—"}
                      </span>
                    </div>
                    {(popupBooking || newBooking)?.specialRequest ? (
                      <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-blue-800">
                        <div className="text-xs font-bold uppercase tracking-wider">
                          Special request
                        </div>
                        <div className="mt-1 text-sm font-medium">
                          {(popupBooking || newBooking).specialRequest}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={handleDeclineBooking}
                      className="bg-white border-2 border-rose-500 text-rose-600 py-3 rounded-lg font-semibold text-sm hover:bg-rose-50 transition-colors"
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      onClick={handleAcceptBooking}
                      className="bg-emerald-600 text-white py-3 rounded-lg font-semibold text-sm hover:bg-emerald-700 transition-colors"
                    >
                      Accept
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate("/restaurant/reservations")}
                    className="mt-3 w-full bg-gray-100 text-gray-800 py-3 rounded-lg font-semibold text-sm hover:bg-gray-200 transition-colors"
                  >
                    View all reservations
                  </button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Reject Order Popup */}
      <AnimatePresence>
        {showRejectPopup && (
          <>
            <motion.div
              className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleRejectCancel}>
              <motion.div
                className="w-[95%] max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="px-4 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-bold text-gray-900">
                    Reject Order {(popupOrder || newOrder)?.orderId || "#Order"}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Please select a reason for rejecting this order
                  </p>
                </div>

                {/* Content */}
                <div className="px-4 py-4 max-h-[60vh] overflow-y-auto">
                  <div className="space-y-2">
                    {rejectReasons.map((reason) => (
                      <button
                        key={reason}
                        onClick={() => setRejectReason(reason)}
                        className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                          rejectReason === reason
                            ? "border-black bg-black/5"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}>
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-sm font-medium ${
                              rejectReason === reason
                                ? "text-black"
                                : "text-gray-900"
                            }`}>
                            {reason}
                          </span>
                          {rejectReason === reason && (
                            <div className="w-5 h-5 rounded-full bg-black flex items-center justify-center">
                              <svg
                                className="w-3 h-3 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={3}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Footer */}
                <div className="px-4 py-4 bg-gray-50 border-t border-gray-200 flex gap-3">
                  <button
                    onClick={handleRejectCancel}
                    className="flex-1 bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-semibold text-sm hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={handleRejectConfirm}
                    disabled={!rejectReason}
                    className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-colors ${
                      rejectReason
                        ? "!bg-black !text-white"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    }`}>
                    Confirm Rejection
                  </button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Cancel Order Popup */}
      <AnimatePresence>
        {showCancelPopup && orderToCancel && (
          <>
            <motion.div
              className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCancelPopupClose}>
              <motion.div
                className="w-[95%] max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="px-4 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-bold text-gray-900">
                    Cancel Order {orderToCancel.orderId || "#Order"}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Please provide a reason for cancelling this order
                  </p>
                </div>

                {/* Content */}
                <div className="px-4 py-4">
                  <div className="space-y-3">
                    {rejectReasons.map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => setCancelReason(reason)}
                        className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${
                          cancelReason === reason
                            ? "border-red-500 bg-red-50"
                            : "border-gray-200 hover:border-gray-300"
                        }`}>
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                              cancelReason === reason
                                ? "border-red-500 bg-red-500"
                                : "border-gray-300"
                            }`}>
                            {cancelReason === reason && (
                              <svg
                                className="w-3 h-3 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={3}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </div>
                          <span
                            className={`text-sm font-medium ${
                              cancelReason === reason
                                ? "text-red-700"
                                : "text-gray-700"
                            }`}>
                            {reason}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Footer */}
                <div className="px-4 py-4 bg-gray-50 border-t border-gray-200 flex gap-3">
                  <button
                    onClick={handleCancelPopupClose}
                    className="flex-1 bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-semibold text-sm hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={handleCancelConfirm}
                    disabled={!cancelReason}
                    className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-colors ${
                      cancelReason
                        ? "!bg-red-600 !text-white hover:bg-red-700"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    }`}>
                    Confirm Cancellation
                  </button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom Sheet for Order Details */}
      <AnimatePresence>
        {isSheetOpen && selectedOrder && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSheetOpen(false)}>
            <motion.div
              className="w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto bg-white rounded-t-3xl p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom)+6rem)] shadow-lg"
              initial={{ y: 80 }}
              animate={{ y: 0 }}
              exit={{ y: 80 }}
              transition={{ duration: 0.25 }}
              onClick={(e) => e.stopPropagation()}>
              {/* Drag handle */}
              <div className="flex justify-center mb-3">
                <div className="h-1 w-10 rounded-full bg-gray-300" />
              </div>

              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="text-sm font-semibold text-black">
                    Order #{selectedOrder.orderId}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {selectedOrder.customerName}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {selectedOrder.type}
                    {selectedOrder.tableOrToken
                      ? ` • ${selectedOrder.tableOrToken}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {(() => {
                    const selectedStatus = String(selectedOrder.status || "").toLowerCase();
                    const isReadyStatus = selectedStatus === "ready";
                    return (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border ${
                      isReadyStatus
                        ? "border-green-500 text-green-600"
                        : "border-gray-800 text-gray-900"
                    }`}>
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isReadyStatus
                          ? "bg-green-500"
                          : "bg-gray-800"
                      }`}
                    />
                    {selectedOrder.status}
                  </span>
                    );
                  })()}
                  <span className="text-[11px] text-gray-500">
                    {selectedOrder.timePlaced}
                  </span>
                </div>
              </div>

              <div className="border-t border-gray-100 my-3" />

              <div className="mb-3">
                <p className="text-xs font-medium text-gray-700 mb-1">Items</p>
                <p className="text-xs text-gray-600">
                  {selectedOrder.itemsSummary}
                </p>
              </div>

              <div className="flex items-center justify-between text-[11px] text-gray-500 mb-4">
                {/* Hide ETA for ready orders */}
                {String(selectedOrder.status || "").toLowerCase() !== "ready" && selectedOrder.eta && (
                  <span>
                    ETA:{" "}
                    <span className="font-medium text-black">
                      {selectedOrder.eta}
                    </span>
                  </span>
                )}
                {(() => {
                  const raw = selectedOrder.paymentMethod;
                  const normalized =
                    raw != null ? String(raw).toLowerCase().trim() : "";
                  const isCod = normalized === "cash" || normalized === "cod";
                  return (
                    <span>
                      Payment:{" "}
                      <span
                        className={`font-medium ${isCod ? "text-amber-700" : "text-black"}`}>
                        {isCod ? "Cash on Delivery" : "Paid online"}
                      </span>
                    </span>
                  );
                })()}
              </div>

              {/* ACTION BUTTONS FOR DINE-IN */}
              { (selectedOrder.isDineIn || String(selectedOrder.orderId).includes("Table")) && (
                <div className="space-y-3 mb-4">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      className="flex-1 bg-orange-600 text-white py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm hover:bg-orange-700 active:scale-95 transition-all"
                      onClick={() => updateSelectedDineInRoundStatus("preparing", "Table marked as Preparing")}>
                      Preparing
                    </button>
                    <button
                      className="flex-1 bg-[#00c87e] text-white py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm hover:bg-[#00a165] active:scale-95 transition-all"
                      onClick={() => updateSelectedDineInRoundStatus("ready", "Food is Ready")}>
                      Ready
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm hover:bg-blue-700 active:scale-95 transition-all"
                      onClick={() => updateSelectedDineInRoundStatus("served", "Food Served")}>
                      Served
                    </button>
                    <button
                      className="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm hover:bg-red-700 active:scale-95 transition-all"
                      onClick={() => {
                        // Redirect to live dine-in orders view which handles active sessions
                        navigate(`/food/restaurant/dine-in/orders`);
                        setIsSheetOpen(false);
                      }}>
                      Settle Bill
                    </button>
                  </div>
                </div>
              )}

              <button
                className={`w-full py-3 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors ${
                  selectedOrder.isDineIn 
                    ? "bg-gray-100 text-gray-800 hover:bg-gray-200" 
                    : "bg-black text-white hover:bg-black/90"
                }`}
                onClick={() => setIsSheetOpen(false)}>
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Navigation - Sticky */}
      <BottomNavOrders />
    </div>
  );
}


// Order Card Component
function OrderCard({
  orderId,
  mongoId,
  status,
  customerName,
  customerPhone,
  type,
  tableOrToken,
  timePlaced,
  eta,
  prepTimeMinutes,
  prepStartTime,
  pickupAt,
  itemsSummary,
  paymentMethod,
  photoUrl,
  photoAlt,
  deliveryPartnerId,
  dispatchStatus,
  onSelect,
  onCancel,
  onMarkReady,
  onVerifyOtp,
  isVerifyingOtp = false,
  isMarkingReady = false,
  isDineIn = false,
}) {
  const normalizedStatus = String(status || "").toLowerCase();
  const isReady = normalizedStatus === "ready";
  const isPreparing = normalizedStatus === "preparing";
  const isConfirmed = normalizedStatus === "confirmed";
  const isActiveDineIn = isDineIn && normalizedStatus === "active";
  const phoneForCall = normalizePhoneForCall(customerPhone);
  const shouldShowCustomerContact =
    Boolean(customerName || phoneForCall) &&
    !["completed", "delivered", "cancelled", "canceled"].includes(normalizedStatus);
  
  const statusLabel = isActiveDineIn 
    ? "Live Table" 
    : String(status || "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="w-full bg-white rounded-2xl p-4 mb-3 border border-gray-200 hover:border-gray-400 transition-colors relative">
      {/* Cancel button - only show for preparing orders */}
      {isPreparing && onCancel && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCancel({ orderId, mongoId, customerName });
          }}
          className="absolute top-2 right-2 p-1.5 rounded-full bg-red-100 text-red-600 hover:bg-red-200 transition-colors z-10"
          title="Cancel Order">
          <X className="w-4 h-4" />
        </button>
      )}
      <div
        onClick={() =>
          onSelect?.({
            orderId,
            mongoId,
            status,
            isDineIn,
            customerName,
            type,
            tableOrToken,
            timePlaced,
            eta,
            itemsSummary,
            paymentMethod,
          })
        }
        className="w-full text-left flex gap-3 items-stretch cursor-pointer">
        {/* Photo */}
        <div className="h-20 w-20 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0 my-auto">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={photoAlt}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center px-2">
              <span className="text-[11px] font-medium text-gray-500 text-center leading-tight">
                {photoAlt}
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col justify-between min-h-[80px]">
          {/* Top row */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-black leading-tight">
                Order #{orderId}
              </p>
              {shouldShowCustomerContact && (
                <div className="mt-1.5 flex flex-col gap-1">
                  {customerName && (
                    <p className="text-[11px] font-medium text-gray-600 leading-tight">
                      {customerName}
                    </p>
                  )}
                  {(customerPhone || phoneForCall) && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {customerPhone && (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-[10px] font-medium text-gray-500 leading-none">
                          {customerPhone}
                        </span>
                      )}
                      {phoneForCall && (
                        <a
                          href={`tel:${phoneForCall}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 rounded-full bg-[#00c87e] px-2.5 py-1 text-[10px] font-semibold leading-none text-white shadow-sm transition-all hover:bg-[#00b874]"
                        >
                          <Phone className="h-3 w-3" />
                          Call Now
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}
              {!shouldShowCustomerContact && customerName && (
                <p className="text-[11px] text-gray-500 mt-1">{customerName}</p>
              )}
            </div>

            <div className="flex flex-col items-end gap-1">
      <div
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border transition-all ${
          isActiveDineIn
            ? "bg-[#00c87e] border-[#00c87e] text-white shadow-lg shadow-[#00c87e]/20"
            : isReady
            ? "bg-green-50 border-green-500 text-green-700"
            : "bg-gray-50 border-gray-200 text-gray-700"
        }`}>
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            isActiveDineIn ? "bg-white animate-pulse" : isReady ? "bg-green-500" : "bg-gray-400"
          }`}
        />
        {isActiveDineIn ? "DINE-IN ACTIVE" : statusLabel}
      </div>
              <span className="text-[11px] text-gray-500 text-right whitespace-normal break-words max-w-[120px] leading-tight">
                {timePlaced}
              </span>
            </div>
          </div>

          {/* Middle row */}
          <div className="mt-2">
            <p className="text-xs text-gray-600 line-clamp-1">{itemsSummary}</p>
          </div>

          {/* Bottom row */}
          <div className="mt-2 flex items-end justify-between gap-2">
            <div className="flex flex-col gap-1">
              <p className="text-[11px] text-gray-500">
                {type}
                {tableOrToken ? ` • ${tableOrToken}` : ""}
              </p>
              {Number(prepTimeMinutes) > 0 && (
                <p className="text-[11px] text-gray-500">
                  Prep {Math.round(Number(prepTimeMinutes))} min
                  {pickupAt ? ` • Pickup ${formatClockTime(pickupAt)}` : ""}
                </p>
              )}
              {prepStartTime && (
                <p className="text-[11px] text-gray-500">
                  Prep start {formatClockTime(prepStartTime)}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isPreparing && onMarkReady && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkReady({ orderId, mongoId, customerName, isDineIn });
                  }}
                  disabled={isMarkingReady}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-green-600 text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
                  {isMarkingReady ? "Marking..." : "Mark Ready"}
                </button>
              )}
              {isReady && onVerifyOtp && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onVerifyOtp({ orderId, mongoId, customerName });
                  }}
                  disabled={isVerifyingOtp}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-blue-600 text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
                  {isVerifyingOtp ? "Verifying..." : "Verify OTP"}
                </button>
              )}
              {/* Hide ETA for ready orders */}
              {!isReady && eta && (
                <div className="flex items-baseline gap-1">
                  <span className="text-[11px] text-gray-500">ETA</span>
                  <span className="text-xs font-medium text-black">{eta}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Preparing Orders List
function PreparingOrders({
  onSelectOrder,
  onCancel,
  refreshToken = 0,
  onStatusChanged,
}) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [markingReadyOrderIds, setMarkingReadyOrderIds] = useState({});

  useEffect(() => {
    let isMounted = true;

    const fetchOrders = async () => {
      try {
        // Fetch all orders and filter for 'preparing' status on frontend
        const response = await restaurantAPI.getOrders();

        if (!isMounted) return;

        if (response.data?.success && response.data.data?.orders) {
          // Filter orders with 'preparing' status only
          // 'confirmed' orders should only appear in popup notification, not in preparing list
          // After accepting, order status changes to 'preparing' and then appears here
          const preparingOrders = response.data.data.orders.filter(
            (order) => order.status === "preparing",
          );

          const transformedOrders = preparingOrders.map((order) => {
            const initialETA =
              Number(order.prep_time) > 0
                ? Number(order.prep_time)
                : order.estimatedDeliveryTime || 30; // in minutes
            const preparingTimestamp = order.tracking?.preparing?.timestamp
              ? new Date(order.tracking.preparing.timestamp)
              : new Date(order.createdAt); // Fallback to createdAt if preparing timestamp not available

            return {
              orderId: order.orderId || order._id,
              mongoId: order._id,
              status: order.status || "preparing",
              customerName: order.userId?.name || "Customer",
              type: getRestaurantOrderTypeLabel(order),
              tableOrToken: null,
              timePlaced: new Date(order.createdAt).toLocaleTimeString(
                "en-US",
                { hour: "2-digit", minute: "2-digit" },
              ),
              sortTimestamp: preparingTimestamp.getTime(),
              initialETA, // Store initial ETA in minutes
              preparingTimestamp, // Store when order started preparing
              itemsSummary:
                order.items
                  ?.map((item) => `${item.quantity}x ${item.name}`)
                  .join(", ") || "No items",
              photoUrl: order.items?.[0]?.image || null,
              photoAlt: order.items?.[0]?.name || "Order",
              deliveryPartnerId: order.deliveryPartnerId || null,
              dispatchStatus: order.dispatch?.status || null,
              paymentMethod:
                order.paymentMethod || order.payment?.method || null,
            };
          });

          let dineInPreparingOrders = [];
          try {
            const profileRes = await restaurantAPI.getCurrentRestaurant();
            const rId = profileRes?.data?.data?.restaurant?._id || profileRes?.data?.data?._id;

            if (rId) {
              const tablesRes = await dineInAPI.listTables(rId);
              if (tablesRes.data?.success) {
                const activeTables = (tablesRes.data.data || []).filter((t) => t.currentSessionId);
                const sessions = await Promise.all(
                  activeTables.map(async (table) => {
                    try {
                      const sRes = await dineInAPI.getSession(table.currentSessionId);
                      return { table, session: sRes.data?.data || null };
                    } catch {
                      return { table, session: null };
                    }
                  })
                );

                dineInPreparingOrders = sessions
                  .filter(({ session }) => Boolean(session))
                  .map(({ table, session }) => {
                    const sessionStatus = String(session?.status || "").toLowerCase();
                    if (sessionStatus !== "active") return null;
                    const rounds = Array.isArray(session.orders) ? session.orders : [];
                    const latestRound = rounds.length ? rounds[rounds.length - 1] : null;
                    const latestStatus = String(latestRound?.status || "").toLowerCase();
                    if (latestStatus !== "preparing") return null;

                    return {
                      orderId: `Table ${table.tableNumber}`,
                      mongoId: session._id,
                      status: "preparing",
                      isDineIn: true,
                      customerName: `Table ${table.tableNumber} (${table.tableLabel || "Default"})`,
                      type: "Dine-In",
                      tableOrToken: table.tableLabel || `Table ${table.tableNumber}`,
                      timePlaced: new Date(latestRound?.createdAt || session.createdAt).toLocaleTimeString(
                        "en-US",
                        { hour: "2-digit", minute: "2-digit" },
                      ),
                      initialETA: 30,
                      preparingTimestamp: new Date(latestRound?.preparingAt || latestRound?.updatedAt || latestRound?.createdAt || Date.now()),
                      sortTimestamp: new Date(latestRound?.preparingAt || latestRound?.updatedAt || latestRound?.createdAt || Date.now()).getTime(),
                      itemsSummary:
                        (latestRound?.items || [])
                          .map((item) => `${item.quantity}x ${item.name}`)
                          .join(", ") || "No items",
                      photoUrl: null,
                      photoAlt: "Dine-In",
                      deliveryPartnerId: null,
                      dispatchStatus: null,
                      paymentMethod: null,
                    };
                  })
                  .filter(Boolean);
              }
            }
          } catch (_) {}

          if (isMounted) {
            setOrders([...dineInPreparingOrders, ...transformedOrders].sort((a, b) => b.sortTimestamp - a.sortTimestamp));
            setLoading(false);
          }
        } else {
          if (isMounted) {
            setOrders([]);
            setLoading(false);
          }
        }
      } catch (error) {
        if (!isMounted) return;

        // Don't log network errors, 404, or 401 errors
        // 401 is handled by axios interceptor (token refresh/redirect)
        // 404 means no orders found (normal)
        // ERR_NETWORK means backend is down (expected in dev)
        if (
          error.code !== "ERR_NETWORK" &&
          error.response?.status !== 404 &&
          error.response?.status !== 401
        ) {
          debugError("Error fetching preparing orders:", error);
        }

        if (isMounted) {
          setOrders([]);
          setLoading(false);
        }
      }
    };

    fetchOrders();

    // Update countdown every second
    const countdownIntervalId = setInterval(() => {
      if (isMounted) {
        setCurrentTime(new Date());
      }
    }, 1000);

    return () => {
      isMounted = false;
      if (countdownIntervalId) {
        clearInterval(countdownIntervalId);
      }
    };
  }, [refreshToken]); // Re-fetch only when parent requests it

  // Track which orders have been marked as ready to avoid duplicate API calls
  const markedReadyOrdersRef = useRef(new Set());

  // Auto-mark orders as ready when ETA reaches 0
  useEffect(() => {
    if (!currentTime || orders.length === 0) return;

    const checkAndMarkReady = async () => {
      for (const order of orders) {
        const orderKey = order.mongoId || order.orderId;

        // Skip if already marked as ready
        if (markedReadyOrdersRef.current.has(orderKey)) {
          continue;
        }

        // Calculate remaining ETA
        const elapsedMs = currentTime - order.preparingTimestamp;
        const elapsedMinutes = Math.floor(elapsedMs / 60000);
        const remainingMinutes = Math.max(0, order.initialETA - elapsedMinutes);

        // If ETA has reached 0 (or slightly past), mark as ready
        if (remainingMinutes <= 0 && order.status === "preparing") {
          const elapsedSeconds = Math.floor(elapsedMs / 1000);
          const totalETASeconds = order.initialETA * 60;

          // Mark as ready when ETA time has elapsed (with 2 second buffer)
          if (elapsedSeconds >= totalETASeconds - 2) {
            try {
              debugLog(
                `?? Auto-marking order ${order.orderId} as ready (ETA reached 0)`,
              );
              markedReadyOrdersRef.current.add(orderKey); // Mark as processing
              await restaurantAPI.markOrderReady(
                order.mongoId || order.orderId,
              );
              debugLog(`? Order ${order.orderId} marked as ready`);
              onStatusChanged?.();
              // Order will be removed from preparing list on next fetch
            } catch (error) {
              const status = error.response?.status;
              const msg = (
                error.response?.data?.message ||
                error.message ||
                ""
              ).toLowerCase();
              // If 400 and message says order cannot be marked ready (e.g. already ready),
              // treat as idempotent - backend cron or another client already marked it.
              if (
                status === 400 &&
                (msg.includes("cannot be marked as ready") ||
                  msg.includes("current status"))
              ) {
                // Keep in markedReadyOrdersRef so we don't retry; order will disappear on next fetch
              } else {
                debugError(
                  `? Failed to auto-mark order ${order.orderId} as ready:`,
                  error,
                );
                markedReadyOrdersRef.current.delete(orderKey);
              }
              // Don't show error toast - it will retry on next check (for non-idempotent errors)
            }
          }
        }
      }
    };

    // Check every 2 seconds for orders that need to be marked ready
    const readyCheckInterval = setInterval(checkAndMarkReady, 2000);

    return () => {
      clearInterval(readyCheckInterval);
    };
  }, [currentTime, orders]);

  // Clear marked orders when orders list changes (orders moved to ready)
  useEffect(() => {
    const currentOrderKeys = new Set(orders.map((o) => o.mongoId || o.orderId));
    // Remove keys that are no longer in the preparing orders list
    for (const key of markedReadyOrdersRef.current) {
      if (!currentOrderKeys.has(key)) {
        markedReadyOrdersRef.current.delete(key);
      }
    }
  }, [orders]);

  const handleMarkReady = async ({ orderId, mongoId, customerName, isDineIn }) => {
    if (isDineIn) return;
    const orderKey = mongoId || orderId;
    if (!orderKey || markingReadyOrderIds[orderKey]) return;

    try {
      setMarkingReadyOrderIds((prev) => ({ ...prev, [orderKey]: true }));
      await restaurantAPI.markOrderReady(orderKey);
      setOrders((prev) =>
        prev.filter((order) => (order.mongoId || order.orderId) !== orderKey),
      );
      toast.success(
        `Order ${orderId} marked ready${customerName ? ` for ${customerName}` : ""}`,
      );
      onStatusChanged?.();
    } catch (error) {
      const status = error.response?.status;
      const message =
        error.response?.data?.message || "Failed to mark order as ready";
      if (
        status === 400 &&
        String(message).toLowerCase().includes("current status")
      ) {
        setOrders((prev) =>
          prev.filter((order) => (order.mongoId || order.orderId) !== orderKey),
        );
        toast.success(`Order ${orderId} is already ready`);
        onStatusChanged?.();
      } else {
        toast.error(message);
      }
    } finally {
      setMarkingReadyOrderIds((prev) => {
        const next = { ...prev };
        delete next[orderKey];
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="pt-4 pb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-black">
            Preparing orders
          </h2>
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
        <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="pt-4 pb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-semibold text-black">Preparing orders</h2>
        <span className="text-xs text-gray-500">{orders.length} active</span>
      </div>
      {orders.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          No orders in preparation
        </div>
      ) : (
        <div>
          {orders.map((order) => {
            // Calculate remaining ETA (countdown)
            const elapsedMs = currentTime - order.preparingTimestamp;
            const elapsedMinutes = Math.floor(elapsedMs / 60000);
            const remainingMinutes = Math.max(
              0,
              order.initialETA - elapsedMinutes,
            );

            // Format ETA display
            let etaDisplay = "";
            if (remainingMinutes <= 0) {
              const remainingSeconds = Math.max(
                0,
                Math.floor(order.initialETA * 60 - elapsedMs / 1000),
              );
              if (remainingSeconds > 0) {
                etaDisplay = `${remainingSeconds} secs`;
              } else {
                etaDisplay = "0 mins";
              }
            } else {
              etaDisplay = `${remainingMinutes} mins`;
            }

            return (
              <OrderCard
                key={order.mongoId || order.orderId}
                orderId={order.orderId}
                mongoId={order.mongoId}
                status={order.status}
                customerName={order.customerName}
                type={order.type}
                tableOrToken={order.tableOrToken}
                timePlaced={order.timePlaced}
                eta={etaDisplay}
                itemsSummary={order.itemsSummary}
                photoUrl={order.photoUrl}
                photoAlt={order.photoAlt}
                paymentMethod={order.paymentMethod}
                deliveryPartnerId={order.deliveryPartnerId}
                dispatchStatus={order.dispatchStatus}
                onSelect={onSelectOrder}
                onCancel={order.isDineIn ? undefined : onCancel}
                onMarkReady={order.isDineIn ? undefined : handleMarkReady}
                isMarkingReady={Boolean(
                  markingReadyOrderIds[order.mongoId || order.orderId],
                )}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// Ready Orders List
function ReadyOrders({ onSelectOrder, refreshToken = 0, onStatusChanged }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [otpModalOrder, setOtpModalOrder] = useState(null);
  const [deliveryOtp, setDeliveryOtp] = useState("");
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [verifyingOrderIds, setVerifyingOrderIds] = useState({});

  useEffect(() => {
    let isMounted = true;

    const fetchOrders = async () => {
      try {
        // Fetch all orders and filter for 'ready' status on frontend
        const response = await restaurantAPI.getOrders();

        if (!isMounted) return;

        if (response.data?.success && response.data.data?.orders) {
          // Filter orders with 'ready' status
          const readyOrders = response.data.data.orders.filter(
            (order) => order.status === "ready",
          );

          const transformedOrders = readyOrders.map((order) => ({
            orderId: order.orderId || order._id,
            mongoId: order._id,
            status: order.status || "ready",
            customerName: order.userId?.name || "Customer",
            type: getRestaurantOrderTypeLabel(order),
            tableOrToken: null,
            timePlaced: new Date(order.createdAt).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            sortTimestamp: new Date(order.createdAt).getTime(),
            eta: null, // Don't show ETA for ready orders
            itemsSummary:
              order.items
                ?.map((item) => `${item.quantity}x ${item.name}`)
                .join(", ") || "No items",
            photoUrl: order.items?.[0]?.image || null,
            photoAlt: order.items?.[0]?.name || "Order",
            paymentMethod: order.paymentMethod || order.payment?.method || null,
            deliveryPartnerId: order.deliveryPartnerId || null,
            dispatchStatus: order.dispatch?.status || null,
          }));

          let dineInReadyOrders = [];
          try {
            const profileRes = await restaurantAPI.getCurrentRestaurant();
            const rId = profileRes?.data?.data?.restaurant?._id || profileRes?.data?.data?._id;

            if (rId) {
              const tablesRes = await dineInAPI.listTables(rId);
              if (tablesRes.data?.success) {
                const activeTables = (tablesRes.data.data || []).filter((t) => t.currentSessionId);
                const sessions = await Promise.all(
                  activeTables.map(async (table) => {
                    try {
                      const sRes = await dineInAPI.getSession(table.currentSessionId);
                      return { table, session: sRes.data?.data || null };
                    } catch {
                      return { table, session: null };
                    }
                  })
                );

                dineInReadyOrders = sessions
                  .filter(({ session }) => Boolean(session))
                  .map(({ table, session }) => {
                    const sessionStatus = String(session?.status || "").toLowerCase();
                    if (sessionStatus !== "active") return null;
                    const rounds = Array.isArray(session.orders) ? session.orders : [];
                    const latestRound = rounds.length ? rounds[rounds.length - 1] : null;
                    const latestStatus = String(latestRound?.status || "").toLowerCase();
                    if (latestStatus !== "ready") return null;

                    return {
                      orderId: `Table ${table.tableNumber}`,
                      mongoId: session._id,
                      status: "ready",
                      isDineIn: true,
                      customerName: `Table ${table.tableNumber} (${table.tableLabel || "Default"})`,
                      type: "Dine-In",
                      tableOrToken: table.tableLabel || `Table ${table.tableNumber}`,
                      timePlaced: new Date(latestRound?.createdAt || session.createdAt).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      }),
                      sortTimestamp: new Date(latestRound?.createdAt || session.createdAt).getTime(),
                      eta: null,
                      itemsSummary:
                        (latestRound?.items || [])
                          .map((item) => `${item.quantity}x ${item.name}`)
                          .join(", ") || "No items",
                      photoUrl: null,
                      photoAlt: "Dine-In",
                      paymentMethod: null,
                      deliveryPartnerId: null,
                      dispatchStatus: null,
                    };
                  })
                  .filter(Boolean);
              }
            }
          } catch (_) {}

          if (isMounted) {
            setOrders([...dineInReadyOrders, ...transformedOrders].sort((a, b) => b.sortTimestamp - a.sortTimestamp));
            setLoading(false);
          }
        } else {
          if (isMounted) {
            setOrders([]);
            setLoading(false);
          }
        }
      } catch (error) {
        if (!isMounted) return;

        // Don't log network errors repeatedly - they're expected if backend is down
        if (error.code !== "ERR_NETWORK" && error.response?.status !== 404) {
          debugError("Error fetching ready orders:", error);
        }

        if (isMounted) {
          setOrders([]);
          setLoading(false);
        }
      }
    };

    fetchOrders();

    return () => {
      isMounted = false;
    };
  }, [refreshToken]); // Re-fetch only when parent requests it

  if (loading) {
    return (
      <div className="pt-4 pb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-black">
            Ready for pickup
          </h2>
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
        <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  const handleOpenOtpModal = ({ orderId, mongoId, customerName }) => {
    setOtpModalOrder({
      orderId,
      mongoId: mongoId || orderId,
      customerName: customerName || "Customer",
    });
    setDeliveryOtp("");
  };

  const handleCloseOtpModal = () => {
    if (isVerifyingOtp) return;
    setOtpModalOrder(null);
    setDeliveryOtp("");
  };

  const handleVerifyOtpAndDeliver = async () => {
    const rawOtp = String(deliveryOtp || "").replace(/\D/g, "");
    if (rawOtp.length < 4) {
      toast.error("Please enter a valid OTP");
      return;
    }

    const orderKey = otpModalOrder?.mongoId || otpModalOrder?.orderId;
    if (!orderKey) {
      toast.error("Order not found for OTP verification");
      return;
    }

    try {
      setIsVerifyingOtp(true);
      setVerifyingOrderIds((prev) => ({ ...prev, [orderKey]: true }));
      await restaurantAPI.verifyDeliveryOtpAndComplete(orderKey, rawOtp);
      setOrders((prev) =>
        prev.filter((order) => (order.mongoId || order.orderId) !== orderKey),
      );
      toast.success(
        `Order ${otpModalOrder?.orderId || ""} marked delivered successfully`,
      );
      handleCloseOtpModal();
      onStatusChanged?.();
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Failed to verify OTP";
      toast.error(message);
    } finally {
      setIsVerifyingOtp(false);
      setVerifyingOrderIds((prev) => {
        const next = { ...prev };
        delete next[orderKey];
        return next;
      });
    }
  };

  return (
    <div className="pt-4 pb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-semibold text-black">Ready for pickup</h2>
        <span className="text-xs text-gray-500">{orders.length} active</span>
      </div>
      {orders.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          No orders ready for pickup
        </div>
      ) : (
        <div>
          {orders.map((order) => (
            <OrderCard
              key={order.mongoId || order.orderId}
              {...order}
              onSelect={onSelectOrder}
              onVerifyOtp={order.isDineIn ? undefined : handleOpenOtpModal}
              isVerifyingOtp={Boolean(
                verifyingOrderIds[order.mongoId || order.orderId],
              )}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {otpModalOrder && (
          <motion.div
            className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCloseOtpModal}>
            <motion.div
              className="w-[95%] max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}>
              <div className="px-4 py-4 border-b border-gray-200">
                <h3 className="text-lg font-bold text-gray-900">
                  Verify OTP for Order #{otpModalOrder.orderId}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Enter customer OTP to mark this order as delivered.
                </p>
              </div>

              <div className="px-4 py-4">
                <label
                  htmlFor="delivery-otp-input"
                  className="block text-sm font-medium text-gray-700 mb-2">
                  Takeaway OTP
                </label>
                <input
                  id="delivery-otp-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={deliveryOtp}
                  onChange={(e) =>
                    setDeliveryOtp(String(e.target.value || "").replace(/\D/g, ""))
                  }
                  placeholder="Enter OTP"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base font-medium tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="px-4 py-4 bg-gray-50 border-t border-gray-200 flex gap-3">
                <button
                  type="button"
                  onClick={handleCloseOtpModal}
                  disabled={isVerifyingOtp}
                  className="flex-1 bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-semibold text-sm hover:bg-gray-50 transition-colors disabled:opacity-60">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleVerifyOtpAndDeliver}
                  disabled={isVerifyingOtp || String(deliveryOtp).length < 4}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold text-sm hover:bg-blue-700 transition-colors disabled:opacity-60">
                  {isVerifyingOtp ? "Verifying..." : "Confirm Delivery"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ScheduledOrders({ onSelectOrder, refreshToken = 0 }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchOrders = async () => {
      try {
        const response = await restaurantAPI.getOrders();

        if (!isMounted) return;

        if (response.data?.success && response.data.data?.orders) {
          const scheduledOrders = response.data.data.orders
            .filter((order) => {
              const status = String(order.status || "").toLowerCase();
              return (
                order.order_type === "SCHEDULED" &&
                status === "confirmed"
              );
            })
            .map((order) => ({
              orderId: order.orderId || order._id,
              mongoId: order._id,
              status: "scheduled",
              customerName: order.userId?.name || "Customer",
              type: "Takeaway",
              tableOrToken: null,
              timePlaced: new Date(order.createdAt).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
              }),
              sortTimestamp: new Date(
                order.pickupAt || order.scheduledAt || order.createdAt,
              ).getTime(),
              eta: order.pickupAt
                ? `Pickup ${formatClockTime(order.pickupAt)}`
                : null,
              prepTimeMinutes:
                Number(order.prep_time) > 0 ? Number(order.prep_time) : null,
              prepStartTime: order.prep_start_time || null,
              itemsSummary:
                order.items
                  ?.map((item) => `${item.quantity}x ${item.name}`)
                  .join(", ") || "No items",
              photoUrl: order.items?.[0]?.image || null,
              photoAlt: order.items?.[0]?.name || "Order",
              paymentMethod: order.paymentMethod || order.payment?.method || null,
              deliveryPartnerId: order.deliveryPartnerId || null,
              dispatchStatus: order.dispatch?.status || null,
              order_type: order.order_type,
              pickupAt: order.pickupAt || null,
              prep_start_time: order.prep_start_time || null,
            }))
            .sort((a, b) => a.sortTimestamp - b.sortTimestamp);

          setOrders(scheduledOrders);
        } else {
          setOrders([]);
        }
      } catch (error) {
        if (!isMounted) return;
        if (error.code !== "ERR_NETWORK" && error.response?.status !== 404) {
          debugError("Error fetching scheduled orders:", error);
        }
        setOrders([]);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchOrders();

    return () => {
      isMounted = false;
    };
  }, [refreshToken]);

  if (loading) {
    return (
      <div className="pt-4 pb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-black">Scheduled orders</h2>
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
        <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="pt-4 pb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-semibold text-black">Scheduled orders</h2>
        <span className="text-xs text-gray-500">{orders.length} active</span>
      </div>
      {orders.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          No scheduled orders right now
        </div>
      ) : (
        <div>
          {orders.map((order) => (
            <OrderCard
              key={order.mongoId || order.orderId}
              {...order}
              onSelect={onSelectOrder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Empty State Component
function EmptyState({ message = "Temporarily closed" }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] py-12">
      {/* Store Illustration */}
      <div className="mb-6">
        <svg
          width="200"
          height="200"
          viewBox="0 0 200 200"
          className="text-gray-300"
          fill="none"
          xmlns="http://www.w3.org/2000/svg">
          {/* Storefront */}
          <rect
            x="40"
            y="80"
            width="120"
            height="80"
            stroke="currentColor"
            strokeWidth="2"
            fill="white"
          />
          {/* Awning */}
          <path
            d="M30 80 L100 50 L170 80"
            stroke="currentColor"
            strokeWidth="2"
            fill="white"
          />
          {/* Doors */}
          <rect
            x="60"
            y="100"
            width="30"
            height="60"
            stroke="currentColor"
            strokeWidth="2"
            fill="white"
          />
          <rect
            x="110"
            y="100"
            width="30"
            height="60"
            stroke="currentColor"
            strokeWidth="2"
            fill="white"
          />
          {/* Laptop */}
          <rect
            x="70"
            y="140"
            width="40"
            height="25"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="white"
          />
          <text
            x="85"
            y="155"
            fontSize="8"
            fill="currentColor"
            textAnchor="middle">
            CLOSED
          </text>
          {/* Sign */}
          <rect
            x="80"
            y="170"
            width="40"
            height="20"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="white"
          />
        </svg>
      </div>

      {/* Message */}
      <h2 className="text-lg font-semibold text-gray-600 mb-4 text-center">
        {message}
      </h2>

      {/* View Status Button */}
      <button className="bg-black text-white px-6 py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors">
        View status
      </button>
    </div>
  );
}
