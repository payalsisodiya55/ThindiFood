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
} from "lucide-react";
import { deliveryBoyAPI } from "@food/api";
import { clearModuleAuth, getCurrentUser } from "@food/utils/auth";

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
  const deliveryBoy = getCurrentUser("delivery");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await deliveryBoyAPI.getOrders();
        const nextOrders = response?.data?.data?.orders || [];
        if (active) setOrders(nextOrders);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => {
    const total = orders.length;
    const completed = orders.filter(
      (order) => String(order?.orderStatus || "").toLowerCase() === "delivered_self",
    ).length;
    const outForDelivery = orders.filter(
      (order) => String(order?.orderStatus || "").toLowerCase() === "out_for_delivery",
    ).length;
    const pending = Math.max(0, total - completed);
    return { total, completed, pending, outForDelivery };
  }, [orders]);

  const handleLogout = () => {
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
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-white/80">
                Delivery Boy Panel
              </p>
              <h1 className="mt-2 text-3xl font-black">
                {deliveryBoy?.name || "Delivery Partner"}
              </h1>
              <p className="mt-1 text-sm text-white/90">
                {deliveryBoy?.restaurantId?.restaurantName || "Self-delivery orders dashboard"}
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
          </div>
        </div>
      </div>

      <div className="-mt-5 rounded-t-[32px] bg-[#f8faf8] px-4 pb-8 pt-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-slate-900">Assigned Orders</h2>
              <p className="text-sm text-slate-500">
                Open an order to confirm pickup, start delivery, or enter OTP.
              </p>
            </div>
            <Link
              to="/food/restaurant/login?role=delivery"
              className="text-sm font-semibold text-[#00a86b]"
            >
              Login Page
            </Link>
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
              const meta = STATUS_META[normalizedStatus] || {
                label: order?.orderStatus || "Assigned",
                hint: "View order",
                badge: "bg-slate-100 text-slate-700",
              };
              const address = formatAddress(order?.deliveryAddress);
              return (
                <Link
                  key={order._id || order.orderId}
                  to={`/food/delivery-boy/orders/${order._id || order.orderId}`}
                  className="block rounded-[28px] border border-[#00c87e]/10 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold ${meta.badge}`}>
                        {meta.label}
                      </span>
                      <h3 className="mt-3 text-lg font-black text-slate-900">
                        Order #{order.orderId}
                      </h3>
                      <p className="mt-1 text-sm font-medium text-slate-600">
                        {order.restaurantId?.restaurantName || "Restaurant"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black text-slate-900">
                        {formatMoney(order?.pricing?.total)}
                      </p>
                      <p className="text-xs font-semibold text-[#00a86b]">
                        Fee {formatMoney(order?.pricing?.deliveryFee)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-[#00a86b]" />
                      <span>{Array.isArray(order.items) ? order.items.length : 0} item(s)</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-4 w-4 text-[#00a86b]" />
                      <span className="line-clamp-2">{address}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-[#00a86b]" />
                      <span>{order.userId?.phone || order.deliveryAddress?.phone || "No phone"}</span>
                    </div>
                  </div>

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
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
