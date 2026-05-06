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
} from "lucide-react";
import { deliveryBoyAPI } from "@food/api";
import { clearModuleAuth, getCurrentUser } from "@food/utils/auth";

const ACTIONS = {
  assigned_to_boy: {
    label: "Confirm Pickup",
    action: "pickup",
    helper: "Mark that you collected the order from the restaurant.",
  },
  picked_up_by_boy: {
    label: "Start Delivery",
    action: "out_for_delivery",
    helper: "Move the order to out-for-delivery.",
  },
  out_for_delivery: {
    label: "Complete Delivery",
    action: "deliver",
    helper: "Take OTP from customer and complete delivery.",
  },
};

const formatMoney = (value) => `₹${Number(value || 0).toFixed(0)}`;

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

  const loadOrder = async () => {
    const response = await deliveryBoyAPI.getOrderById(orderId);
    setOrder(response?.data?.data?.order || null);
  };

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

  const handleAction = async () => {
    if (!order) return;
    const status = String(order.orderStatus || "");
    setSubmitting(true);
    setError("");
    try {
      if (status === "assigned_to_boy") {
        await deliveryBoyAPI.confirmPickup(order._id || order.orderId);
      } else if (status === "picked_up_by_boy") {
        await deliveryBoyAPI.startDelivery(order._id || order.orderId);
      } else if (status === "out_for_delivery") {
        await deliveryBoyAPI.deliver(order._id || order.orderId, otp);
      }
      await loadOrder();
      setOtp("");
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Action failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    clearModuleAuth("delivery");
    navigate("/food/restaurant/login?role=delivery", { replace: true });
  };

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
              <h1 className="mt-3 text-3xl font-black">
                Order #{order?.orderId || orderId}
              </h1>
              <p className="mt-1 text-sm text-white/90">
                {deliveryBoy?.name || "Delivery Boy"} delivery workflow
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white"
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

          {error ? (
            <div className="rounded-[28px] border border-red-200 bg-red-50 px-4 py-3 text-red-600 shadow-sm">
              {error}
            </div>
          ) : null}

          {order ? (
            <>
              <div className="rounded-[28px] border border-[#00c87e]/10 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="inline-flex rounded-full bg-[#00c87e]/10 px-3 py-1 text-xs font-bold text-[#00a86b]">
                      {String(order.orderStatus || "").replace(/_/g, " ")}
                    </span>
                    <h2 className="mt-3 text-2xl font-black text-slate-900">
                      {order.restaurantId?.restaurantName || "Restaurant"}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Self delivery order
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-slate-900">
                      {formatMoney(order?.pricing?.total)}
                    </p>
                    <p className="text-xs font-semibold text-[#00a86b]">
                      Delivery Fee {formatMoney(order?.pricing?.deliveryFee)}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 rounded-[24px] bg-[#f0fff8] p-4 text-sm text-slate-700">
                  <div className="flex items-start gap-3">
                    <User className="mt-0.5 h-4 w-4 text-[#00a86b]" />
                    <div>
                      <p className="font-semibold text-slate-900">
                        {order.userId?.name || "Customer"}
                      </p>
                      <p>{order.userId?.phone || order.deliveryAddress?.phone || "No phone"}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-4 w-4 text-[#00a86b]" />
                    <p>{address}</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <Package className="mt-0.5 h-4 w-4 text-[#00a86b]" />
                    <div>
                      <p className="font-semibold text-slate-900">Items</p>
                      <p>
                        {Array.isArray(order.items)
                          ? order.items.map((item) => `${item.quantity} x ${item.name}`).join(", ")
                          : "No items"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-[#00c87e]/10 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  {nextAction?.action === "deliver" ? (
                    <ShieldCheck className="h-5 w-5 text-[#00a86b]" />
                  ) : (
                    <Truck className="h-5 w-5 text-[#00a86b]" />
                  )}
                  <div>
                    <h3 className="text-lg font-black text-slate-900">
                      {nextAction ? nextAction.label : "Delivery completed"}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {nextAction?.helper || "This order has no pending delivery-boy action."}
                    </p>
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
                      Customer se OTP lo aur yahan enter karo.
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
