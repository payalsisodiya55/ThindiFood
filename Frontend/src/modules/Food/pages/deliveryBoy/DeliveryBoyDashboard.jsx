import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  LogOut,
  MapPin,
  Package,
  Phone,
  Truck,
  XCircle,
} from "lucide-react";
import { deliveryBoyAPI } from "@food/api";
import { clearModuleAuth, getCurrentUser } from "@food/utils/auth";
import { toast } from "sonner";
import { useDeliveryNotifications } from "@food/hooks/useDeliveryNotifications";

const STATUS_META = {
  assigned_to_boy: {
    label: "Assigned",
    hint: "Pickup pending",
    badge: "bg-[#00c87e]/10 text-[#00a86b]",
  },
  picked_up_by_boy: {
    label: "Picked Up",
    hint: "Start delivery",
    badge: "bg-amber-100 text-amber-700",
  },
  out_for_delivery: {
    label: "Out for Delivery",
    hint: "Collect OTP",
    badge: "bg-blue-100 text-blue-700",
  },
  delivered_self: {
    label: "Delivered",
    hint: "Completed",
    badge: "bg-emerald-100 text-emerald-700",
  },
  cancelled_by_user: {
    label: "Cancelled (User)",
    hint: "Cancelled by customer",
    badge: "bg-slate-100 text-slate-500 border border-slate-200",
  },
  cancelled_by_restaurant: {
    label: "Cancelled (Restaurant)",
    hint: "Cancelled by restaurant",
    badge: "bg-slate-100 text-slate-500 border border-slate-200",
  },
  cancelled_by_admin: {
    label: "Cancelled (Admin)",
    hint: "Cancelled by administrator",
    badge: "bg-slate-100 text-slate-500 border border-slate-200",
  },
};

const formatAddress = (address) => {
  if (!address) return "Customer address unavailable";
  return [
    address.addressLine1,
    address.street,
    address.landmark,
    address.area,
    address.city,
  ]
    .filter(Boolean)
    .join(", ");
};

const formatMoney = (value) => `₹${Number(value || 0).toFixed(0)}`;

export default function DeliveryBoyDashboard() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState(null);
  const deliveryBoy = getCurrentUser("delivery");

  const { triggerIncomingAlert, stopIncomingAlert } = useDeliveryNotifications();

  const loadOrders = async () => {
    try {
      const response = await deliveryBoyAPI.getOrders();
      setOrders(response?.data?.data?.orders || []);
    } catch (err) {
      console.error("Failed to load orders:", err);
    }
  };

  const pendingOrders = useMemo(() => {
    return orders.filter((order) => {
      const normalizedStatus = String(order?.orderStatus || "").toLowerCase();
      const isRejectedByMe =
        order?.selfDelivery?.rejectedHistory?.some(
          (h) => String(h.deliveryBoyId?._id || h.deliveryBoyId) === String(deliveryBoy?.id || deliveryBoy?._id)
        ) &&
        String(order?.selfDelivery?.deliveryBoyId?._id || order?.selfDelivery?.deliveryBoyId) !== String(deliveryBoy?.id || deliveryBoy?._id);

      return (
        !isRejectedByMe &&
        normalizedStatus === "assigned_to_boy" &&
        order?.selfDelivery?.status !== "accepted"
      );
    });
  }, [orders, deliveryBoy]);

  useEffect(() => {
    if (pendingOrders.length > 0) {
      triggerIncomingAlert(pendingOrders[0]);
    } else {
      stopIncomingAlert();
    }
  }, [pendingOrders, triggerIncomingAlert, stopIncomingAlert]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        await deliveryBoyAPI.updateAvailability("online");
        if (active) {
          await loadOrders();
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();

    const intervalId = setInterval(() => {
      if (active) {
        loadOrders();
      }
    }, 5000);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, []);

  const handleAcceptRequest = async (e, orderId) => {
    e.preventDefault();
    e.stopPropagation();
    stopIncomingAlert();
    setSubmittingId(orderId);
    try {
      await deliveryBoyAPI.acceptOrder(orderId);
      toast.success("Order assignment accepted!");
      await loadOrders();
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to accept order");
    } finally {
      setSubmittingId(null);
    }
  };

  const handleRejectRequest = async (e, orderId) => {
    e.preventDefault();
    e.stopPropagation();
    stopIncomingAlert();
    setSubmittingId(orderId);
    try {
      await deliveryBoyAPI.rejectOrder(orderId);
      toast.success("Order assignment rejected");
      await loadOrders();
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to reject order");
    } finally {
      setSubmittingId(null);
    }
  };

  const stats = useMemo(() => {
    const total = orders.length;
    
    const completed = orders.filter(
      (order) => String(order?.orderStatus || "").toLowerCase() === "delivered_self",
    ).length;
    
    const outForDelivery = orders.filter(
      (order) => String(order?.orderStatus || "").toLowerCase() === "out_for_delivery",
    ).length;
    
    const cancelled = orders.filter((order) => {
      const status = String(order?.orderStatus || "").toLowerCase();
      const isRejected = order?.selfDelivery?.rejectedHistory?.some(
        (h) => String(h.deliveryBoyId?._id || h.deliveryBoyId) === String(deliveryBoy?.id || deliveryBoy?._id)
      ) &&
      String(order?.selfDelivery?.deliveryBoyId?._id || order?.selfDelivery?.deliveryBoyId) !== String(deliveryBoy?.id || deliveryBoy?._id);
      return status.startsWith("cancelled") || isRejected;
    }).length;
    
    const pending = orders.filter((order) => {
      const status = String(order?.orderStatus || "").toLowerCase();
      const isRejected = order?.selfDelivery?.rejectedHistory?.some(
        (h) => String(h.deliveryBoyId?._id || h.deliveryBoyId) === String(deliveryBoy?.id || deliveryBoy?._id)
      ) &&
      String(order?.selfDelivery?.deliveryBoyId?._id || order?.selfDelivery?.deliveryBoyId) !== String(deliveryBoy?.id || deliveryBoy?._id);
      return status !== "delivered_self" && !status.startsWith("cancelled") && !isRejected;
    }).length;

    return { total, completed, pending, outForDelivery, cancelled };
  }, [orders, deliveryBoy]);

  const handleLogout = async () => {
    try {
      await deliveryBoyAPI.updateAvailability("offline");
    } catch {}
    clearModuleAuth("delivery");
    navigate("/food/restaurant/login?role=delivery", { replace: true });
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="relative overflow-hidden bg-[#00c87e] px-4 pb-10 pt-6 text-white">
        <div className="absolute -left-10 -top-10 h-32 w-32 rounded-full bg-white/10" />
        <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-white/10" />
        <div className="relative mx-auto max-w-3xl">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-white/80 break-words">
                Delivery Partner Panel
              </p>
              <h1 className="mt-2 text-3xl font-black break-words">
                {deliveryBoy?.name || "Delivery Partner"}
              </h1>
              <p className="mt-1 text-sm text-white/90 break-words">
                {deliveryBoy?.restaurantId?.restaurantName || "Self-delivery orders dashboard"}
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20 shrink-0"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="rounded-3xl bg-white/15 p-4 backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/70">
                Total
              </p>
              <p className="mt-2 text-2xl font-black">{stats.total}</p>
            </div>
            <div className="rounded-3xl bg-white/15 p-4 backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/70">
                Pending
              </p>
              <p className="mt-2 text-2xl font-black">{stats.pending}</p>
            </div>
            <div className="rounded-3xl bg-white/15 p-4 backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/70">
                On Route
              </p>
              <p className="mt-2 text-2xl font-black">{stats.outForDelivery}</p>
            </div>
            <div className="rounded-3xl bg-white/15 p-4 backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/70">
                Completed
              </p>
              <p className="mt-2 text-2xl font-black">{stats.completed}</p>
            </div>
            {/* <div className="rounded-3xl bg-white/15 p-4 backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/70">
                Cancelled
              </p>
              <p className="mt-2 text-2xl font-black">{stats.cancelled}</p>
            </div> */}
          </div>
        </div>
      </div>

      <div className="-mt-5 rounded-t-[32px] bg-[#f8faf8] px-4 pb-8 pt-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-slate-900">Assigned Orders</h2>
              <p className="text-sm text-slate-500">
                Open an order to manage pickup, delivery, and OTP verification.
              </p>
            </div>

          </div>

          {loading ? (
            <div className="rounded-3xl border border-[#00c87e]/10 bg-white p-6 text-sm text-slate-500 shadow-sm">
              Loading orders...
            </div>
          ) : null}

          {!loading && orders.length === 0 ? (
            <div className="rounded-3xl border border-[#00c87e]/10 bg-white p-6 text-slate-500 shadow-sm">
              No assigned orders right now.
            </div>
          ) : null}

          <div className="space-y-4">
            {orders.map((order) => {
              const normalizedStatus = String(order?.orderStatus || "").toLowerCase();
              const isRejectedByMe =
                order?.selfDelivery?.rejectedHistory?.some(
                  (h) => String(h.deliveryBoyId?._id || h.deliveryBoyId) === String(deliveryBoy?.id || deliveryBoy?._id)
                ) &&
                String(order?.selfDelivery?.deliveryBoyId?._id || order?.selfDelivery?.deliveryBoyId) !== String(deliveryBoy?.id || deliveryBoy?._id);

              const isPendingAcceptance =
                !isRejectedByMe &&
                normalizedStatus === "assigned_to_boy" &&
                order?.selfDelivery?.status !== "accepted";

              const meta = isRejectedByMe
                ? {
                    label: "Rejected by You",
                    hint: "You rejected this assignment",
                    badge: "bg-rose-100 text-rose-905 border border-rose-250 font-extrabold",
                  }
                : isPendingAcceptance
                ? {
                    label: "Pending Acceptance",
                    hint: "Please accept or reject this assignment",
                    badge: "bg-amber-100 text-amber-900 border border-amber-200 animate-pulse font-extrabold",
                  }
                : STATUS_META[normalizedStatus] || {
                    label: order?.orderStatus || "Assigned",
                    hint: "View order",
                    badge: "bg-slate-100 text-slate-700",
                  };

              const address = formatAddress(order?.deliveryAddress);
              const orderKey = order._id || order.orderId;
              
              return (
                <Link
                  key={orderKey}
                  to={`/food/delivery-boy/orders/${orderKey}`}
                  className="block rounded-[28px] border border-[#00c87e]/10 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold ${meta.badge}`}>
                        {meta.label}
                      </span>
                      <h3 className="mt-3 text-lg font-black text-slate-900 break-words">
                        Order #{order.orderId}
                      </h3>
                      <p className="mt-1 text-sm font-medium text-slate-600 break-words">
                        {order.restaurantId?.restaurantName || "Restaurant"}
                      </p>
                    </div>
                    <div className="text-right flex items-center justify-end shrink-0">
                      <p className="text-2xl font-black text-slate-900">
                        {formatMoney(order?.pricing?.total)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2.5 text-sm text-slate-600">
                    <div className="flex items-center gap-2.5">
                      <Package className="h-[18px] w-[18px] text-[#00a86b] shrink-0" strokeWidth={2.2} />
                      <span className="leading-none break-words">{Array.isArray(order.items) ? order.items.length : 0} item(s)</span>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <MapPin className="mt-0.5 h-[18px] w-[18px] text-[#00a86b] shrink-0" strokeWidth={2.2} />
                      <span className="line-clamp-2 leading-tight break-words">{address}</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Phone className="h-[18px] w-[18px] text-[#00a86b] shrink-0" strokeWidth={2.2} />
                      <span className="leading-none break-words">{order.userId?.phone || order.deliveryAddress?.phone || "No phone"}</span>
                    </div>
                  </div>

                  {isRejectedByMe ? (
                    <div className="mt-4 flex items-center justify-between rounded-2xl bg-rose-50 border border-rose-100 px-4 py-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-rose-700">
                        <XCircle className="h-4 w-4 text-rose-500" />
                        <span>{meta.hint}</span>
                      </div>
                      <span className="inline-flex items-center gap-1 text-sm font-bold text-rose-700">
                        Details
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </div>
                  ) : normalizedStatus.startsWith("cancelled") ? (
                    <div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                        <XCircle className="h-4 w-4 text-slate-450" />
                        <span>{meta.hint}</span>
                      </div>
                      <span className="inline-flex items-center gap-1 text-sm font-bold text-slate-500">
                        Closed
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </div>
                  ) : isPendingAcceptance ? (
                    <div className="mt-4 flex gap-3">
                      <button
                        type="button"
                        onClick={(e) => handleAcceptRequest(e, orderKey)}
                        disabled={submittingId !== null}
                        className="flex-1 rounded-2xl bg-[#00c87e] hover:bg-[#00b874] py-3 text-sm font-black text-white active:scale-95 transition-all shadow-md shadow-[#00c87e]/10 disabled:opacity-60 text-center"
                      >
                        {submittingId === orderKey ? "Accepting..." : "Accept"}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleRejectRequest(e, orderKey)}
                        disabled={submittingId !== null}
                        className="flex-1 rounded-2xl bg-rose-500 hover:bg-rose-600 py-3 text-sm font-black text-white active:scale-95 transition-all shadow-md shadow-rose-500/10 disabled:opacity-60 text-center"
                      >
                        {submittingId === orderKey ? "Rejecting..." : "Reject"}
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4 flex items-center justify-between rounded-2xl bg-[#f0fff8] px-4 py-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        {normalizedStatus === "out_for_delivery" ? (
                          <CheckCircle2 className="h-4 w-4 text-[#00a86b]" />
                        ) : normalizedStatus === "picked_up_by_boy" ? (
                          <Truck className="h-4 w-4 text-[#00a86b]" />
                        ) : (
                          <ClipboardList className="h-4 w-4 text-[#00a86b]" />
                        )}
                        <span>{meta.hint}</span>
                      </div>
                      <span className="inline-flex items-center gap-1 text-sm font-bold text-[#00a86b]">
                        Open
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
