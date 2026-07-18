import { confirmApp } from "@shared/lib/appDialog";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CalendarDays, Edit2, MoreVertical, Plus, Trash2, Ticket, Percent, Tag, Truck, Utensils } from "lucide-react";
import { restaurantAPI } from "@food/api";
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation";
import { RESTAURANT_THEME } from "@food/constants/restaurantTheme";
import MenuOverlay from "@food/components/restaurant/MenuOverlay";
import { toast } from "sonner";

const STATUS_META = {
  pending: {
    label: "Pending",
    className: "bg-amber-100 text-amber-700 border border-amber-200"
  },
  approved: {
    label: "Approved",
    className: "bg-green-100 text-green-700 border border-green-200"
  },
  rejected: {
    label: "Rejected",
    className: "bg-red-100 text-red-700 border border-red-200"
  }
};

const formatDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB");
};

const getDiscountLabel = (offer) => {
  const type = String(offer?.discountType || "percentage");
  const value = Number(offer?.discountValue || 0);
  if (type === "flat") return `₹${value.toLocaleString('en-IN')} OFF`;
  const maxDiscount = offer?.maxDiscount != null ? Number(offer.maxDiscount) : null;
  if (Number.isFinite(maxDiscount)) return `${value}% OFF (up to ₹${maxDiscount.toLocaleString('en-IN')})`;
  return `${value}% OFF`;
};

export default function OfferListPage() {
  const navigate = useNavigate();
  const goBack = useRestaurantBackNavigation();
  const [showMenu, setShowMenu] = useState(false);
  const [openMenuId, setOpenMenuId] = useState("");
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [togglingId, setTogglingId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadOffers = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await restaurantAPI.getMyOffers();
      const list = response?.data?.data?.offers || [];
      setOffers(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to fetch offers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOffers();
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

  const normalizedOffers = useMemo(
    () =>
    offers.map((offer) => {
      const approvalStatus = String(offer?.approvalStatus || "pending").toLowerCase();
      return {
        ...offer,
        id: String(offer?._id || offer?.id || ""),
        approvalStatus
      };
    }),
    [offers]
  );

  const filteredOffers = useMemo(() => {
    let result = normalizedOffers;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter((o) => String(o.title || "").toLowerCase().includes(q));
    }
    if (statusFilter !== "all") {
      const todayStr = new Date().toISOString().split("T")[0];
      if (statusFilter === "expired") {
        result = result.filter((o) => o.endDate && o.endDate < todayStr);
      } else if (statusFilter === "active") {
        result = result.filter((o) => o.approvalStatus === "approved" && o.status === "active" && (!o.endDate || o.endDate >= todayStr));
      } else if (statusFilter === "pending") {
        result = result.filter((o) => o.approvalStatus === "pending");
      } else if (statusFilter === "rejected") {
        result = result.filter((o) => o.approvalStatus === "rejected");
      }
    }
    return result;
  }, [normalizedOffers, searchTerm, statusFilter]);

  const handleToggleStatus = async (id, currentStatus) => {
    if (!id || togglingId) return;
    try {
      setTogglingId(id);
      const nextStatus = currentStatus === "active" ? "inactive" : "active";
      await restaurantAPI.updateOffer(id, { status: nextStatus });
      setOffers((prev) =>
        prev.map((o) => {
          const offerIdStr = String(o?._id || o?.id || "");
          return offerIdStr === id ? { ...o, status: nextStatus } : o;
        })
      );
      toast.success(`Offer ${nextStatus === "active" ? "activated" : "deactivated"} successfully`);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to update status");
    } finally {
      setTogglingId("");
    }
  };

  const handleDelete = async (id) => {
    if (!id || deletingId) return;
    if (!(await confirmApp("Delete this offer?"))) return;
    try {
      setDeletingId(id);
      await restaurantAPI.deleteOffer(id);
      setOffers((prev) => prev.filter((o) => String(o?._id || o?.id || "") !== id));
      setOpenMenuId("");
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to delete offer");
    } finally {
      setDeletingId("");
    }
  };

  return (
    <div className="min-h-screen bg-[#eef2f6] pb-24 md:pb-8">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white px-4 py-3 w-full">
        <div className="mx-auto max-w-md md:max-w-6xl flex items-center gap-3">
          <button
            onClick={goBack}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer text-slate-900 shrink-0"
            aria-label="Go back"
          >
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-slate-900">Offers</h1>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-md md:max-w-6xl px-4 py-3">
        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex-1 relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search offers by title..."
              className="w-full h-11 pl-4 pr-10 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#00c87e] focus:ring-1 focus:ring-[#00c87e] bg-white"
            />
          </div>
          <div className="w-full sm:w-48">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#00c87e] focus:ring-1 focus:ring-[#00c87e] bg-white cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
            </select>
          </div>
        </div>

        <section className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-4">
          {loading &&
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 md:col-span-2 lg:col-span-3">
              Loading offers...
            </div>
          }

          {!!error &&
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 md:col-span-2 lg:col-span-3">{error}</div>
          }

          {!loading && !error && filteredOffers.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center md:col-span-2 lg:col-span-3 max-w-lg mx-auto w-full shadow-sm">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 border border-emerald-100">
                <Ticket className="h-8 w-8 text-[#00c87e]" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">No offers found</h3>
              <p className="mt-1 text-sm text-slate-500">
                {searchTerm || statusFilter !== "all" 
                  ? "Try adjusting your search query or status filter." 
                  : "Tap the + button to create your first offer."}
              </p>
              {!searchTerm && statusFilter === "all" && (
                <p className="text-xs text-emerald-600 font-medium mt-1">Offers help attract new customers and increase order volume.</p>
              )}
              
              {!searchTerm && statusFilter === "all" && (
                <div className="mt-6 border-t border-slate-100 pt-6 text-left">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                    What types of offers can you create?
                  </p>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 rounded-xl p-3 hover:bg-slate-50 transition-colors">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-[#00c87e]">
                        <Percent className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">Percentage discounts</p>
                        <p className="text-xs text-slate-500 mt-0.5">Offer percentage-based discounts with custom maximum cap limits.</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 rounded-xl p-3 hover:bg-slate-50 transition-colors">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                        <Tag className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">Flat-off deals</p>
                        <p className="text-xs text-slate-500 mt-0.5">Apply fixed flat-amount discounts directly on customer purchases.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {!loading &&
          !error &&
          filteredOffers.map((offer) => {
            const status = STATUS_META[offer.approvalStatus] || STATUS_META.pending;
            const startDate = formatDate(offer.startDate);
            const endDate = formatDate(offer.endDate);
            const productNames = Array.isArray(offer.products) ?
            offer.products.map((p) => p.name || "Product").join(", ") :
            "";

            return (
              <motion.article
                key={offer.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-semibold text-slate-900 truncate">{offer.title}</p>
                      <p className="mt-0.5 text-sm font-medium text-[#00c87e]">
                        {getDiscountLabel(offer)}
                      </p>
                      {productNames && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 line-clamp-1">
                          <Utensils className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{productNames}</span>
                        </p>
                      )}
                      {(startDate || endDate) && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                          <CalendarDays className="h-3 w-3" />
                          {startDate && endDate ?
                            `${startDate} → ${endDate}` :
                            startDate ?
                            `From ${startDate}` :
                            `Until ${endDate}`}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          offer.approvalStatus === "approved" ?
                          "" :
                          status.className
                        }`}
                        style={
                          offer.approvalStatus === "approved" ?
                          {
                            color: RESTAURANT_THEME.brand,
                            borderColor: RESTAURANT_THEME.softBorder,
                            backgroundColor: RESTAURANT_THEME.softBackground,
                            border: `1px solid ${RESTAURANT_THEME.softBorder}`
                          } :
                          {}
                        }
                      >
                        {status.label}
                      </span>

                      {offer.approvalStatus === "approved" && (
                        <button
                          type="button"
                          disabled={togglingId === offer.id}
                          onClick={() => handleToggleStatus(offer.id, offer.status)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${
                            offer.status === "active" ? "bg-[#00c87e]" : "bg-slate-200"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                              offer.status === "active" ? "translate-x-4" : "translate-x-0"
                            }`}
                          />
                        </button>
                      )}

                      <div className="relative" data-menu-id={offer.id}>
                        <button
                          type="button"
                          onClick={() => setOpenMenuId((prev) => prev === offer.id ? "" : offer.id)}
                          className="rounded-md bg-slate-100 p-1.5 text-slate-500 hover:bg-slate-200"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>

                        <AnimatePresence>
                          {openMenuId === offer.id && (
                            <motion.div
                              initial={{ opacity: 0, y: -6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -6 }}
                              data-menu-id={offer.id}
                              className="absolute right-0 top-9 z-50 min-w-[155px] rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId("");
                                  navigate(`/food/restaurant/offers/${offer.id}/edit`);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                                Edit Offer
                              </button>
                              <button
                                type="button"
                                disabled={deletingId === offer.id}
                                onClick={() => handleDelete(offer.id)}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                {deletingId === offer.id ? "Deleting..." : "Delete"}
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>

                  {offer.approvalStatus === "rejected" && offer.rejectionReason && (
                    <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                      Rejected: {offer.rejectionReason}
                    </div>
                  )}

                  {offer.approvalStatus === "approved" && (
                    <div className="mt-2 text-xs text-slate-500 flex items-start gap-1.5">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 mt-1 shrink-0"></span>
                      <span>{offer.status === "active" ? "Active – applied to products in user app" : "Inactive – disabled"}</span>
                    </div>
                  )}

                  {offer.approvalStatus === "pending" && (
                    <div className="mt-2 text-xs text-amber-600 flex items-start gap-1.5">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 mt-1 shrink-0"></span>
                      <span>Awaiting admin approval (typically within 1 business day)</span>
                    </div>
                  )}
                </motion.article>);

          })}
        </section>
      </div>

      <motion.button
        type="button"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 16 }}
        onClick={() => navigate("/food/restaurant/offers/new")}
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg md:bottom-6 md:right-6"
        style={{ backgroundColor: RESTAURANT_THEME.brand }}>
        
        <Plus className="h-6 w-6" />
      </motion.button>

      <MenuOverlay showMenu={showMenu} setShowMenu={setShowMenu} />
    </div>);

}