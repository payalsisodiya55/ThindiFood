import { confirmApp } from "@shared/lib/appDialog";import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Ticket, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { restaurantAPI } from "@food/api";
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation";
import { RESTAURANT_THEME } from "@food/constants/restaurantTheme";
import MenuOverlay from "@food/components/restaurant/MenuOverlay";

const STATUS_META = {
  pending: {
    label: "PENDING",
    className: "bg-amber-100 text-amber-700 border border-amber-200"
  },
  approved: {
    label: "APPROVED",
    className: ""
  },
  rejected: {
    label: "REJECTED",
    className: "bg-red-100 text-red-700 border border-red-200"
  }
};

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB");
};

const formatIndianNumber = (num) => {
  if (num == null || isNaN(num)) return "0";
  return Number(num).toLocaleString("en-IN");
};

const getDiscountLabel = (coupon) => {
  const type = String(coupon?.discountType || "percentage");
  const value = Number(coupon?.discountValue || 0);
  if (type === "flat-price") return `Rs ${formatIndianNumber(value)} OFF`;
  const maxDiscount = coupon?.maxDiscount != null ? Number(coupon.maxDiscount) : null;
  if (Number.isFinite(maxDiscount)) return `${value}% OFF (up to Rs ${formatIndianNumber(maxDiscount)})`;
  return `${value}% OFF`;
};

const getUsageText = (coupon) => {
  const used = Number(coupon?.usedCount || 0);
  const limit = Number(coupon?.usageLimit || 0);
  if (limit > 0) return `${formatIndianNumber(used)} / ${formatIndianNumber(limit)}`;
  return `${formatIndianNumber(used)} / Unlimited`;
};

export default function CouponListPage() {
  const navigate = useNavigate();
  const goBack = useRestaurantBackNavigation();
  const [showMenu, setShowMenu] = useState(false);
  const [openMenuId, setOpenMenuId] = useState("");
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const loadCoupons = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await restaurantAPI.getMyCoupons();
      const list = response?.data?.data?.coupons || [];
      setCoupons(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to fetch coupons");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCoupons();
  }, []);

  useEffect(() => {
    const closeMenuOnOutside = (event) => {
      if (!openMenuId) return;
      if (!event.target.closest(`[data-menu-id="${openMenuId}"]`)) {
        setOpenMenuId("");
      }
    };
    document.addEventListener("mousedown", closeMenuOnOutside);
    return () => document.removeEventListener("mousedown", closeMenuOnOutside);
  }, [openMenuId]);

  const normalizedCoupons = useMemo(
    () =>
    coupons.map((coupon) => {
      const approvalStatus = String(coupon?.approvalStatus || "pending").toLowerCase();
      return {
        ...coupon,
        id: String(coupon?._id || coupon?.id || ""),
        approvalStatus,
        canEdit: approvalStatus === "pending" || approvalStatus === "rejected" || approvalStatus === "approved"
      };
    }),
    [coupons]
  );

  const handleDelete = async (id) => {
    if (!id || deletingId) return;
    if (!(await confirmApp("Delete this coupon?"))) return;
    try {
      setDeletingId(id);
      await restaurantAPI.deleteCoupon(id);
      setCoupons((prev) => prev.filter((coupon) => String(coupon?._id || coupon?.id || "") !== id));
      setOpenMenuId("");
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to delete coupon");
    } finally {
      setDeletingId("");
    }
  };

  return (
    <div className="min-h-screen bg-[#eef2f6] pb-24 md:pb-8">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white px-4 py-4 w-full">
        <div className="mx-auto max-w-md md:max-w-6xl flex items-start gap-3">
          <button onClick={goBack} className="rounded-md p-1 text-slate-600 hover:bg-slate-100 mt-1">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Manage Coupons</h1>
            <p className="text-xs text-slate-500 mt-0.5 font-medium leading-normal">
              Create discount codes to attract new customers and boost order volumes.
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-md md:max-w-6xl px-4 py-3">
        <section className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-4">
          {loading &&
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 md:col-span-2 lg:col-span-3">
              Loading coupons...
            </div>
          }

          {!!error &&
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 md:col-span-2 lg:col-span-3">{error}</div>
          }

          {!loading && !error && normalizedCoupons.length === 0 &&
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-600 md:col-span-2 lg:col-span-3">
              <p className="text-sm font-semibold text-slate-800">No Active Coupons</p>
              <p className="text-xs text-slate-500 mt-1 font-medium">Tap the + button to create a new discount.</p>
            </div>
          }

          {!loading &&
          !error &&
          normalizedCoupons.map((coupon) => {
            const status = STATUS_META[coupon.approvalStatus] || STATUS_META.pending;
            return (
              <motion.article
                key={coupon.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
                
                  <div className="grid grid-cols-[1.15fr_1fr] gap-3">
                    <div
                    className="rounded-xl p-3 flex flex-col justify-between"
                    style={{
                      backgroundColor: RESTAURANT_THEME.softBackground,
                      border: `1px solid ${RESTAURANT_THEME.softBorder}`
                    }}>
                    
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 break-all">{coupon.couponCode}</p>
                        <div className="mt-2 flex flex-col">
                          <span className="text-2xl font-black text-slate-900 leading-tight">
                            {coupon?.discountType === "flat-price" ? `Rs ${formatIndianNumber(coupon?.discountValue)}` : `${coupon?.discountValue}%`}
                          </span>
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-600 mt-0.5 leading-none">
                            OFF
                          </span>
                          {coupon?.discountType === "percentage" && coupon?.maxDiscount != null && Number(coupon.maxDiscount) > 0 && (
                            <span className="text-[9px] font-bold text-slate-500 mt-1 leading-normal break-words">
                              Up to Rs {formatIndianNumber(coupon.maxDiscount)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-3">
                        <p className="text-[10px] font-semibold text-slate-500 leading-tight">For Your Restaurant</p>
                        <p className="mt-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                          {coupon.fundedBy === "restaurant" ? "Restaurant-funded" : "Platform-funded"}
                        </p>
                      </div>
                    </div>

                    <div className="relative rounded-xl bg-white px-1 py-1 flex flex-col justify-between">
                      <div>
                        <div className="mb-2 flex items-center justify-between gap-1">
                          {coupon.approvalStatus === "approved" ?
                          <span
                            className="rounded-full border px-2 py-0.5 text-[10px] font-bold"
                            style={{
                              color: RESTAURANT_THEME.brand,
                              borderColor: RESTAURANT_THEME.softBorder,
                              backgroundColor: RESTAURANT_THEME.softBackground
                            }}>
                            
                                {status.label}
                              </span> :

                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status.className}`}>
                                {status.label}
                              </span>
                          }

                          <div className="relative">
                            <button
                              type="button"
                              data-menu-id={coupon.id}
                              onClick={() => setOpenMenuId((prev) => prev === coupon.id ? "" : coupon.id)}
                              className="rounded-md bg-[#f8efe3] p-1 text-[#f59e0b] hover:bg-[#f4e6d1] transition-colors cursor-pointer">
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>

                            <AnimatePresence>
                              {openMenuId === coupon.id &&
                              <motion.div
                                initial={{ opacity: 0, y: -6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                data-menu-id={coupon.id}
                                className="absolute right-0 top-9 z-50 min-w-[140px] rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                                
                                    {coupon.canEdit &&
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuId("");
                                    navigate(`/restaurant/coupons/${coupon.id}/edit`);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 cursor-pointer">
                                  
                                        <Pencil className="h-3 w-3" />
                                        Edit Coupon
                                      </button>
                                }
                                    <button
                                  type="button"
                                  disabled={deletingId === coupon.id}
                                  onClick={() => handleDelete(coupon.id)}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 disabled:opacity-60 cursor-pointer">
                                  
                                      <Trash2 className="h-3 w-3" />
                                      {deletingId === coupon.id ? "Deleting..." : "Delete"}
                                    </button>
                                  </motion.div>
                              }
                            </AnimatePresence>
                          </div>
                        </div>

                        {/* Validity Dates */}
                        <div className="mt-2 space-y-1">
                          <p className="text-[10px] font-bold text-slate-400 tracking-wider">Validity</p>
                          <div className="text-xs font-semibold text-slate-700 leading-tight space-y-0.5">
                            <p>From: {formatDate(coupon.startDate)}</p>
                            <p>To: {formatDate(coupon.endDate)}</p>
                            {(() => {
                              if (!coupon.endDate) return null;
                              const today = new Date();
                              today.setHours(0, 0, 0, 0);
                              const end = new Date(coupon.endDate);
                              end.setHours(0, 0, 0, 0);
                              const diffTime = end.getTime() - today.getTime();
                              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                              if (diffDays < 0) {
                                return <p className="text-[10px] font-bold text-red-500 mt-1 uppercase">Expired</p>;
                              } else if (diffDays === 0) {
                                return <p className="text-[10px] font-bold text-amber-600 mt-1 uppercase">Expires Today</p>;
                              } else {
                                return <p className="text-[10px] font-bold text-emerald-600 mt-1 uppercase">{diffDays} {diffDays === 1 ? "Day" : "Days"} Left</p>;
                              }
                            })()}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-100 space-y-1">
                        <p className="text-xs font-medium text-slate-700">Min order: <span className="font-bold text-slate-900">Rs {formatIndianNumber(coupon.minOrderValue || 0)}</span></p>
                        <p className="flex items-center gap-1 text-xs text-slate-700">
                          <Ticket className="h-3.5 w-3.5 text-slate-400" />
                          <span>Usage: <span className="font-bold text-slate-900">{getUsageText(coupon)}</span></span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {coupon.approvalStatus === "rejected" && coupon.rejectionReason &&
                <div className="mt-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                      Reject reason: {coupon.rejectionReason}
                    </div>
                }
                </motion.article>);

          })}
        </section>
      </div>

      <motion.button
        type="button"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 16 }}
        onClick={() => navigate("/restaurant/coupons/new")}
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg md:bottom-6 md:right-6"
        style={{ backgroundColor: RESTAURANT_THEME.brand }}>
        
        <Plus className="h-6 w-6" />
      </motion.button>

      <MenuOverlay showMenu={showMenu} setShowMenu={setShowMenu} />
    </div>);

}