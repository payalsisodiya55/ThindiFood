import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Clock3, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react"
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
    className: "",
  },
  rejected: {
    label: "Rejected",
    className: "bg-red-100 text-red-700 border border-red-200",
  },
}

const formatDate = (value) => {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString("en-GB")
}

const getDiscountLabel = (coupon) => {
  const type = String(coupon?.discountType || "percentage")
  const value = Number(coupon?.discountValue || 0)
  if (type === "flat-price") return `Rs ${value} OFF`
  const maxDiscount = coupon?.maxDiscount != null ? Number(coupon.maxDiscount) : null
  if (Number.isFinite(maxDiscount)) return `${value}% OFF (up to Rs ${maxDiscount})`
  return `${value}% OFF`
}

const getUsageText = (coupon) => {
  const used = Number(coupon?.usedCount || 0)
  const limit = Number(coupon?.usageLimit || 0)
  if (limit > 0) return `${used} / ${limit}`
  return `${used} / unlimited`
}

export default function CouponListPage() {
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const [showMenu, setShowMenu] = useState(false)
  const [openMenuId, setOpenMenuId] = useState("")
  const [coupons, setCoupons] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [deletingId, setDeletingId] = useState("")

  const loadCoupons = async () => {
    try {
      setLoading(true)
      setError("")
      const response = await restaurantAPI.getMyCoupons()
      const list = response?.data?.data?.coupons || []
      setCoupons(Array.isArray(list) ? list : [])
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to fetch coupons")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCoupons()
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

  const normalizedCoupons = useMemo(
    () =>
      coupons.map((coupon) => {
        const approvalStatus = String(coupon?.approvalStatus || "pending").toLowerCase()
        return {
          ...coupon,
          id: String(coupon?._id || coupon?.id || ""),
          approvalStatus,
          canEdit: approvalStatus === "pending" || approvalStatus === "rejected",
        }
      }),
    [coupons],
  )

  const handleDelete = async (id) => {
    if (!id || deletingId) return
    if (!window.confirm("Delete this coupon?")) return
    try {
      setDeletingId(id)
      await restaurantAPI.deleteCoupon(id)
      setCoupons((prev) => prev.filter((coupon) => String(coupon?._id || coupon?.id || "") !== id))
      setOpenMenuId("")
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to delete coupon")
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
            <h1 className="text-3xl font-semibold text-slate-900">Coupon List</h1>
          </div>
        </header>

        <section className="space-y-3 px-3 py-3">
          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              Loading coupons...
            </div>
          )}

          {!!error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
          )}

          {!loading && !error && normalizedCoupons.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
              No coupons found
            </div>
          )}

          {!loading &&
            !error &&
            normalizedCoupons.map((coupon) => {
              const status = STATUS_META[coupon.approvalStatus] || STATUS_META.pending
              return (
                <motion.article
                  key={coupon.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
                >
                  <div className="grid grid-cols-[1.05fr_1fr] gap-2">
                    <div
                      className="rounded-xl p-3"
                      style={{
                        backgroundColor: RESTAURANT_THEME.softBackground,
                        border: `1px solid ${RESTAURANT_THEME.softBorder}`,
                      }}
                    >
                      <p className="text-xs uppercase tracking-wide text-slate-500">{coupon.couponCode}</p>
                      <p className="mt-1 text-[30px] font-semibold leading-tight text-slate-900">
                        {getDiscountLabel(coupon)}
                      </p>
                      <p className="mt-2 text-sm text-slate-600">For your restaurant</p>
                    </div>

                    <div className="relative rounded-xl bg-white px-2 py-1">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        {coupon.approvalStatus === "approved" ? (
                          <span
                            className="rounded-full border px-2 py-0.5 text-xs font-semibold"
                            style={{
                              color: RESTAURANT_THEME.brand,
                              borderColor: RESTAURANT_THEME.softBorder,
                              backgroundColor: RESTAURANT_THEME.softBackground,
                            }}
                          >
                            {status.label}
                          </span>
                        ) : (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${status.className}`}>
                            {status.label}
                          </span>
                        )}

                        <div className="relative">
                          <button
                            type="button"
                            data-menu-id={coupon.id}
                            onClick={() => setOpenMenuId((prev) => (prev === coupon.id ? "" : coupon.id))}
                            className="rounded-md bg-[#f8efe3] p-1.5 text-[#f59e0b] hover:bg-[#f4e6d1]"
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </button>

                          <AnimatePresence>
                            {openMenuId === coupon.id && (
                              <motion.div
                                initial={{ opacity: 0, y: -6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                data-menu-id={coupon.id}
                                className="absolute right-0 top-9 z-50 min-w-[155px] rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
                              >
                                {coupon.canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                    setOpenMenuId("")
                                    navigate(`/restaurant/coupons/${coupon.id}/edit`)
                                  }}
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                    Edit Coupon
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={deletingId === coupon.id}
                                  onClick={() => handleDelete(coupon.id)}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  {deletingId === coupon.id ? "Deleting..." : "Delete"}
                                </button>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>

                      <p className="truncate text-sm font-medium text-slate-900">{coupon.couponCode}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {formatDate(coupon.startDate)} to {formatDate(coupon.endDate)}
                      </p>
                      <p className="mt-1 text-xs text-slate-700">Min order: Rs {Number(coupon.minOrderValue || 0)}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-slate-700">
                        <Clock3 className="h-3.5 w-3.5" />
                        Usage: {getUsageText(coupon)}
                      </p>
                    </div>
                  </div>

                  {coupon.approvalStatus === "rejected" && coupon.rejectionReason && (
                    <div className="mt-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                      Reject reason: {coupon.rejectionReason}
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
        onClick={() => navigate("/restaurant/coupons/new")}
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
