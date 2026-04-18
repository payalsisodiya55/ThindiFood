import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, CalendarDays, Edit2, MoreVertical, Package, Plus, Trash2 } from "lucide-react"
import { restaurantAPI } from "@food/api"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { RESTAURANT_THEME } from "@food/constants/restaurantTheme"
import BottomNavbar from "@food/components/restaurant/BottomNavbar"
import MenuOverlay from "@food/components/restaurant/MenuOverlay"

const STATUS_META = {
  pending: {
    label: "Pending",
    className: "bg-amber-100 text-amber-700 border border-amber-200",
  },
  approved: {
    label: "Approved",
    className: "bg-green-100 text-green-700 border border-green-200",
  },
  rejected: {
    label: "Rejected",
    className: "bg-red-100 text-red-700 border border-red-200",
  },
}

const formatDate = (value) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString("en-GB")
}

const getDiscountLabel = (offer) => {
  const type = String(offer?.discountType || "percentage")
  const value = Number(offer?.discountValue || 0)
  if (type === "flat") return `₹${value} OFF`
  const maxDiscount = offer?.maxDiscount != null ? Number(offer.maxDiscount) : null
  if (Number.isFinite(maxDiscount)) return `${value}% OFF (up to ₹${maxDiscount})`
  return `${value}% OFF`
}

export default function OfferListPage() {
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const [showMenu, setShowMenu] = useState(false)
  const [openMenuId, setOpenMenuId] = useState("")
  const [offers, setOffers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [deletingId, setDeletingId] = useState("")

  const loadOffers = async () => {
    try {
      setLoading(true)
      setError("")
      const response = await restaurantAPI.getMyOffers()
      const list = response?.data?.data?.offers || []
      setOffers(Array.isArray(list) ? list : [])
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to fetch offers")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOffers()
  }, [])

  useEffect(() => {
    const closeMenuOnOutside = (event) => {
      if (!openMenuId) return
      if (!event.target.closest(`[data-menu-id="${openMenuId}"]`)) {
        setOpenMenuId("")
      }
    }
    document.addEventListener("mousedown", closeMenuOnOutside)
    return () => document.removeEventListener("mousedown", closeMenuOnOutside)
  }, [openMenuId])

  const normalizedOffers = useMemo(
    () =>
      offers.map((offer) => {
        const approvalStatus = String(offer?.approvalStatus || "pending").toLowerCase()
        return {
          ...offer,
          id: String(offer?._id || offer?.id || ""),
          approvalStatus,
        }
      }),
    [offers],
  )

  const handleDelete = async (id) => {
    if (!id || deletingId) return
    if (!window.confirm("Delete this offer?")) return
    try {
      setDeletingId(id)
      await restaurantAPI.deleteOffer(id)
      setOffers((prev) => prev.filter((o) => String(o?._id || o?.id || "") !== id))
      setOpenMenuId("")
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to delete offer")
    } finally {
      setDeletingId("")
    }
  }

  return (
    <div className="min-h-screen bg-[#eef2f6] pb-24 md:pb-8">
      <div className="mx-auto max-w-md">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white px-4 py-4">
          <div className="flex items-center gap-3">
            <button onClick={goBack} className="rounded-md p-1 text-slate-600 hover:bg-slate-100">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-3xl font-semibold text-slate-900">Offers</h1>
          </div>
        </header>

        <section className="space-y-3 px-3 py-3">
          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              Loading offers...
            </div>
          )}

          {!!error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
          )}

          {!loading && !error && normalizedOffers.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                <Package className="h-7 w-7 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-700">No offers yet</p>
              <p className="mt-1 text-xs text-slate-500">Create your first offer using the + button below</p>
            </div>
          )}

          {!loading &&
            !error &&
            normalizedOffers.map((offer) => {
              const status = STATUS_META[offer.approvalStatus] || STATUS_META.pending
              const startDate = formatDate(offer.startDate)
              const endDate = formatDate(offer.endDate)
              const productNames = Array.isArray(offer.products)
                ? offer.products.map((p) => p.name || "Product").join(", ")
                : ""

              return (
                <motion.article
                  key={offer.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-semibold text-slate-900 truncate">{offer.title}</p>
                      <p className="mt-0.5 text-sm font-medium text-[#00c87e]">
                        {getDiscountLabel(offer)}
                      </p>
                      {productNames && (
                        <p className="mt-1 text-xs text-slate-500 line-clamp-1">
                          🎁 {productNames}
                        </p>
                      )}
                      {(startDate || endDate) && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                          <CalendarDays className="h-3 w-3" />
                          {startDate && endDate
                            ? `${startDate} → ${endDate}`
                            : startDate
                            ? `From ${startDate}`
                            : `Until ${endDate}`}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          offer.approvalStatus === "approved"
                            ? ""
                            : status.className
                        }`}
                        style={
                          offer.approvalStatus === "approved"
                            ? {
                                color: RESTAURANT_THEME.brand,
                                borderColor: RESTAURANT_THEME.softBorder,
                                backgroundColor: RESTAURANT_THEME.softBackground,
                                border: `1px solid ${RESTAURANT_THEME.softBorder}`,
                              }
                            : {}
                        }
                      >
                        {status.label}
                      </span>

                      <div className="relative" data-menu-id={offer.id}>
                        <button
                          type="button"
                          onClick={() => setOpenMenuId((prev) => (prev === offer.id ? "" : offer.id))}
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
                                  setOpenMenuId("")
                                  navigate(`/food/restaurant/offers/${offer.id}/edit`)
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
                    <div className="mt-2 text-xs text-slate-500 flex items-center gap-1">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500"></span>
                      Active – applied to products in user app
                    </div>
                  )}

                  {offer.approvalStatus === "pending" && (
                    <div className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400"></span>
                      Awaiting admin approval
                    </div>
                  )}
                </motion.article>
              )
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
        style={{ backgroundColor: RESTAURANT_THEME.brand }}
      >
        <Plus className="h-6 w-6" />
      </motion.button>

      <BottomNavbar onMenuClick={() => setShowMenu(true)} />
      <MenuOverlay showMenu={showMenu} setShowMenu={setShowMenu} />
    </div>
  )
}
