import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  LogOut,
  MapPin,
  Package,
  Phone,
  ShieldCheck,
  Truck,
  User,
  XCircle,
} from "lucide-react";
import { deliveryBoyAPI } from "@food/api";
import { clearModuleAuth, getCurrentUser } from "@food/utils/auth";
import { toast } from "sonner";
import { useDeliveryNotifications } from "@food/hooks/useDeliveryNotifications";

const ACTIONS = {
  assigned_to_boy: {
    label: "Confirm Pickup",
    action: "pickup",
    helper: "Mark that you collected the order from the restaurant.",
  },
  picked_up_by_boy: {
    label: "Start Delivery",
    action: "out_for_delivery",
    helper: "Mark this order as out for delivery.",
  },
  out_for_delivery: {
    label: "Complete Delivery",
    action: "deliver",
    helper: "Verify customer OTP to confirm delivery.",
  },
};

const STATUS_META = {
  assigned_to_boy: {
    label: "Assigned",
    badge: "bg-[#00c87e]/10 text-[#00a86b]",
  },
  picked_up_by_boy: {
    label: "Picked Up",
    badge: "bg-amber-100 text-amber-700",
  },
  out_for_delivery: {
    label: "Out for Delivery",
    badge: "bg-blue-100 text-blue-700",
  },
  delivered_self: {
    label: "Delivered",
    badge: "bg-emerald-100 text-emerald-700",
  },
  cancelled_by_user: {
    label: "Cancelled (User)",
    badge: "bg-slate-100 text-slate-500 border border-slate-200",
  },
  cancelled_by_restaurant: {
    label: "Cancelled (Restaurant)",
    badge: "bg-slate-100 text-slate-500 border border-slate-200",
  },
  cancelled_by_admin: {
    label: "Cancelled (Admin)",
    badge: "bg-slate-100 text-slate-500 border border-slate-200",
  },
};


const formatMoney = (value) => `₹${Number(value || 0).toFixed(2)}`;

const formatAddress = (address) => {
  if (!address) return "No address available";
  return [
    address.addressLine1,
    address.street,
    address.landmark,
    address.area,
    address.city,
    address.state,
  ]
    .filter(Boolean)
    .join(", ");
};

export default function DeliveryBoyOrderDetail() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const deliveryBoy = getCurrentUser("delivery");

  const { triggerIncomingAlert, stopIncomingAlert } = useDeliveryNotifications();

  const loadOrder = async () => {
    const response = await deliveryBoyAPI.getOrderById(orderId);
    setOrder(response?.data?.data?.order || null);
  };

  const isRejectedByMe = useMemo(() => {
    return order?.selfDelivery?.rejectedHistory?.some(
      (h) => String(h.deliveryBoyId?._id || h.deliveryBoyId) === String(deliveryBoy?.id || deliveryBoy?._id)
    ) &&
    String(order?.selfDelivery?.deliveryBoyId?._id || order?.selfDelivery?.deliveryBoyId) !== String(deliveryBoy?.id || deliveryBoy?._id);
  }, [order, deliveryBoy]);

  const isCancelled = useMemo(() => {
    return String(order?.orderStatus || "").toLowerCase().startsWith("cancelled");
  }, [order]);

  const isPendingAcceptance = useMemo(() => {
    if (isRejectedByMe || isCancelled) return false;
    return String(order?.orderStatus || "") === "assigned_to_boy" && order?.selfDelivery?.status !== "accepted";
  }, [order, isRejectedByMe, isCancelled]);

  useEffect(() => {
    if (isPendingAcceptance && order) {
      triggerIncomingAlert(order);
    } else {
      stopIncomingAlert();
    }
  }, [isPendingAcceptance, order, triggerIncomingAlert, stopIncomingAlert]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        await loadOrder();
      } catch (err) {
        if (active) {
          setError(err?.response?.data?.message || err?.message || "Failed to load order");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    run();
    return () => {
      active = false;
    };
  }, [orderId]);
 
  const handleAcceptOrder = async () => {
    if (!order) return;
    stopIncomingAlert();
    setSubmitting(true);
    setError("");
    try {
      await deliveryBoyAPI.acceptOrder(order._id || order.orderId);
      toast.success("Order assignment accepted!");
      await loadOrder();
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to accept order");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectOrder = async () => {
    if (!order) return;
    stopIncomingAlert();
    setSubmitting(true);
    setError("");
    try {
      await deliveryBoyAPI.rejectOrder(order._id || order.orderId);
      toast.success("Order assignment rejected");
      navigate("/food/delivery-boy/orders", { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to reject order");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async () => {
    if (!order) return;
    const status = String(order.orderStatus || "");
    setSubmitting(true);
    setError("");
    try {
      if (status === "assigned_to_boy") {
        await deliveryBoyAPI.confirmPickup(order._id || order.orderId);
        toast.success("Order picked up successfully!");
      } else if (status === "picked_up_by_boy") {
        await deliveryBoyAPI.startDelivery(order._id || order.orderId);
        toast.success("Order is now out for delivery!");
      } else if (status === "out_for_delivery") {
        await deliveryBoyAPI.deliver(order._id || order.orderId, otp);
        toast.success("Delivery completed successfully!");
      }
      await loadOrder();
      setOtp("");
    } catch (err) {
      const isOtpStep = status === "out_for_delivery";
      let errorMsg = err?.response?.data?.message || err?.message || "Action failed";
      
      if (isOtpStep) {
        errorMsg = "Invalid OTP. Please enter the correct OTP to complete delivery.";
      }
      
      toast.error(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    clearModuleAuth("delivery");
    navigate("/food/restaurant/login?role=delivery", { replace: true });
  };

  const statusMeta = useMemo(() => {
    if (!order) return { label: "", badge: "" };
    if (isRejectedByMe) {
      return {
        label: "Rejected by You",
        badge: "bg-rose-100 text-rose-900 border border-rose-250 font-extrabold",
      };
    }
    const status = String(order.orderStatus || "").toLowerCase();
    if (status === "assigned_to_boy") {
      if (order.selfDelivery?.status === "accepted") {
        return {
          label: "Accepted",
          badge: "bg-emerald-100 text-emerald-850 font-bold",
        };
      }
      return {
        label: "Pending Acceptance",
        badge: "bg-amber-100 text-amber-900 font-bold animate-pulse",
      };
    }
    return STATUS_META[status] || { label: order.orderStatus, badge: "bg-slate-100 text-slate-700" };
  }, [order, isRejectedByMe]);

  const nextAction = ACTIONS[String(order?.orderStatus || "")] || null;
  const address = useMemo(() => formatAddress(order?.deliveryAddress), [order]);

  return (
    <div className="min-h-screen bg-[#f8faf8] text-slate-900">
      <div className="bg-[#00c87e] px-4 pb-8 pt-5 text-white">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Link
                to="/food/delivery-boy/orders"
                className="inline-flex items-center gap-2 text-sm font-semibold text-white/90"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to orders
              </Link>
              <h1 className="mt-3 text-3xl font-black break-words">
                Order #{order?.orderId || orderId}
              </h1>
              <p className="mt-1 text-sm text-white/90 break-words">
                {deliveryBoy?.name || "Delivery Person"} delivery workflow
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white shrink-0"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="-mt-4 px-4 pb-8">
        <div className="mx-auto max-w-2xl space-y-4">
          {loading ? (
            <div className="rounded-[28px] border border-[#00c87e]/10 bg-white p-6 text-sm text-slate-500 shadow-sm">
              Loading order...
            </div>
          ) : null}


          {order ? (
            <>
              <div className="rounded-[28px] border border-[#00c87e]/10 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusMeta.badge}`}>
                      {statusMeta.label}
                    </span>
                    <h2 className="mt-3 text-2xl font-black text-slate-900 break-words">
                      {order.restaurantId?.restaurantName || "Restaurant"}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500 break-words">
                      Self delivery order
                    </p>
                  </div>
                  <div className="text-right flex items-center justify-end shrink-0">
                    <p className="text-2xl font-black text-slate-900">
                      {formatMoney(order?.pricing?.total)}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 rounded-[24px] bg-[#f0fff8] p-4 text-sm text-slate-700">
                  <div className="flex items-start gap-3">
                    <User className="mt-[3px] h-[18px] w-[18px] text-[#00a86b] shrink-0" strokeWidth={2.2} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900 leading-tight break-words">
                        {order.userId?.name || "Customer"}
                      </p>
                      <p className="mt-1 text-slate-600 leading-none break-words">{order.userId?.phone || order.deliveryAddress?.phone || "No phone"}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-[3px] h-[18px] w-[18px] text-[#00a86b] shrink-0" strokeWidth={2.2} />
                    <p className="min-w-0 flex-1 leading-normal break-words">{address}</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <Package className="mt-[3px] h-[18px] w-[18px] text-[#00a86b] shrink-0" strokeWidth={2.2} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900 leading-tight">Items</p>
                      <p className="mt-1 leading-normal break-words">
                        {Array.isArray(order.items)
                           ? order.items.map((item) => `${item.quantity} x ${item.name}`).join(", ")
                           : "No items"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-[#00c87e]/10 bg-white p-6 shadow-sm">
                {isRejectedByMe ? (
                  <div className="flex items-start gap-3.5">
                    <XCircle className="h-5 w-5 text-rose-500 mt-[3.5px] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-black text-rose-700 leading-tight">
                        Assignment Rejected
                      </h3>
                      <p className="text-sm text-slate-500 mt-1 leading-normal">
                        You rejected this delivery assignment. The restaurant has been notified to re-assign a different delivery partner.
                      </p>
                    </div>
                  </div>
                ) : isCancelled ? (
                  <div className="flex items-start gap-3.5">
                    <XCircle className="h-5 w-5 text-slate-500 mt-[3.5px] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-black text-slate-700 leading-tight">
                        Order Cancelled
                      </h3>
                      <p className="text-sm text-slate-500 mt-1 leading-normal">
                        This order was cancelled. You do not need to take any action.
                      </p>
                    </div>
                  </div>
                ) : isPendingAcceptance ? (
                  <>
                    <div className="flex items-start gap-3.5">
                      <Truck className="h-5 w-5 text-amber-500 mt-[3.5px] shrink-0" />
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base font-black text-slate-900 leading-tight">
                          New Delivery Assignment!
                        </h3>
                        <p className="text-sm text-slate-500 mt-1 leading-normal">
                          You have been assigned this delivery. Please accept to proceed or reject if you are unavailable.
                        </p>
                      </div>
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={handleAcceptOrder}
                        disabled={submitting}
                        className="w-full rounded-3xl bg-[#00c87e] py-4 text-base font-black text-white transition hover:bg-[#00b874] disabled:opacity-60 shadow-md shadow-[#00c87e]/10"
                      >
                        {submitting ? "Accepting..." : "Accept Order"}
                      </button>
                      <button
                        type="button"
                        onClick={handleRejectOrder}
                        disabled={submitting}
                        className="w-full rounded-3xl bg-rose-500 py-4 text-base font-black text-white transition hover:bg-rose-600 disabled:opacity-60 shadow-md shadow-rose-500/10"
                      >
                        {submitting ? "Rejecting..." : "Reject Order"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start gap-3.5">
                      {nextAction?.action === "deliver" ? (
                        <ShieldCheck className="h-5 w-5 text-[#00a86b] mt-[3.5px] shrink-0" />
                      ) : (
                        <Truck className="h-5 w-5 text-[#00a86b] mt-[3.5px] shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base font-black text-slate-900 leading-tight">
                          {nextAction ? nextAction.label : "Delivery completed"}
                        </h3>
                        {nextAction?.helper && (
                          <p className="text-sm text-slate-500 mt-1 leading-normal">
                            {nextAction.helper}
                          </p>
                        )}
                      </div>
                    </div>

                    {nextAction?.action === "deliver" ? (
                      <div className="mt-5">
                        <label className="mb-2 block text-sm font-semibold text-slate-700">
                          Customer OTP
                        </label>
                        <input
                          value={otp}
                          onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
                          className="w-full rounded-3xl border border-[#00c87e]/20 bg-[#f8faf8] px-4 py-4 text-center text-lg font-black tracking-[0.4em] outline-none focus:border-[#00c87e] focus:ring-4 focus:ring-[#00c87e]/10"
                          placeholder="0000"
                        />
                        <p className="mt-2 text-xs text-slate-500">
                          Please collect the OTP from the customer and enter it here.
                        </p>
                      </div>
                    ) : null}

                    {nextAction ? (
                      <button
                        type="button"
                        onClick={handleAction}
                        disabled={submitting || (nextAction.action === "deliver" && otp.length < 4)}
                        className="mt-5 w-full rounded-3xl bg-[#00c87e] py-4 text-base font-black text-white transition hover:bg-[#00b874] disabled:opacity-60"
                      >
                        {submitting ? "Updating..." : nextAction.label}
                      </button>
                    ) : (
                      <div className="mt-5 rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                        Order delivered successfully.
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <a
                  href={`tel:${order.userId?.phone || order.deliveryAddress?.phone || ""}`}
                  className="inline-flex items-center justify-center gap-2 rounded-3xl border border-[#00c87e]/20 bg-white px-4 py-3 text-sm font-bold text-[#00a86b] shadow-sm"
                >
                  <Phone className="h-4 w-4" />
                  Call Customer
                </a>
                <Link
                  to="/food/delivery-boy/orders"
                  className="inline-flex items-center justify-center gap-2 rounded-3xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-sm"
                >
                  More Orders
                </Link>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
