import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, CalendarDays, X } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
import { restaurantAPI } from "@food/api"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { flattenMenuItems, getMenuFromResponse } from "@food/utils/menuItems"

const toInputDate = (value) => {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

const createInitialForm = () => ({
  title: "",
  products: [],
  discountType: "percentage",
  discountValue: "",
  maxDiscount: "",
  maxItemsPerOrder: "",
  perUserRedeemLimit: "",
  startDate: "",
  endDate: "",
})

const mapOfferToForm = (offer) => ({
  title: String(offer?.title || ""),
  products: Array.isArray(offer?.products) ? offer.products : [],
  discountType: offer?.discountType === "flat" ? "flat" : "percentage",
  discountValue: offer?.discountValue != null ? String(Number(offer.discountValue)) : "",
  maxDiscount: offer?.maxDiscount != null ? String(Number(offer.maxDiscount)) : "",
  maxItemsPerOrder: offer?.maxItemsPerOrder != null ? String(Number(offer.maxItemsPerOrder)) : "",
  perUserRedeemLimit: offer?.perUserRedeemLimit != null ? String(Number(offer.perUserRedeemLimit)) : "",
  startDate: toInputDate(offer?.startDate),
  endDate: toInputDate(offer?.endDate),
})

export default function OfferFormPage({ mode = "create" }) {
  const isEditMode = mode === "edit"
  const { id: offerId } = useParams()
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()

  const [form, setForm] = useState(createInitialForm())
  const [submitting, setSubmitting] = useState(false)
  const [loadingOffer, setLoadingOffer] = useState(isEditMode)
  const [error, setError] = useState("")

  // Product list from restaurant menu (for product multi-select)
  const [menuItems, setMenuItems] = useState([])
  const [loadingMenu, setLoadingMenu] = useState(true)
  const [productSearch, setProductSearch] = useState("")
  const [showProductDropdown, setShowProductDropdown] = useState(false)

  const isPercentage = form.discountType === "percentage"

  // Load menu items for product selection
  useEffect(() => {
    const fetchMenu = async () => {
      try {
        setLoadingMenu(true)
        const response = await restaurantAPI.getMenu()
        const menu = getMenuFromResponse(response)
        let items = flattenMenuItems(menu)

        // Fallback: handle unusual payloads where menu arrives as a flat items list.
        if (!items.length) {
          const rawItems =
            response?.data?.data?.items ||
            response?.data?.items ||
            menu?.items ||
            []
          items = Array.isArray(rawItems) ? rawItems : []
        }

        // Remove duplicates and invalid rows.
        const uniqueItems = items.filter((item, index, self) => {
          const id = String(item?._id || item?.id || "").trim()
          return Boolean(id) && self.findIndex((t) => String(t?._id || t?.id || "").trim() === id) === index
        })

        setMenuItems(uniqueItems)
      } catch (error) {
        console.error("Error fetching menu:", error)
        setMenuItems([])
      } finally {
        setLoadingMenu(false)
      }
    }
    fetchMenu()
  }, [])

  // Load offer for edit mode
  useEffect(() => {
    if (!isEditMode) {
      setLoadingOffer(false)
      return
    }
    let isActive = true
    const loadOffer = async () => {
      try {
        setLoadingOffer(true)
        setError("")
        const response = await restaurantAPI.getMyOffers()
        const list = response?.data?.data?.offers || []
        const found = (Array.isArray(list) ? list : []).find(
          (o) => String(o?._id || o?.id || "") === String(offerId || ""),
        )
        if (!found) {
          if (!isActive) return
          setError("Offer not found")
          return
        }
        if (!isActive) return
        setForm(mapOfferToForm(found))
      } catch (err) {
        if (!isActive) return
        setError(err?.response?.data?.message || "Failed to load offer")
      } finally {
        if (isActive) setLoadingOffer(false)
      }
    }
    loadOffer()
    return () => {
      isActive = false
    }
  }, [offerId, isEditMode])

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (error) setError("")
  }

  const toggleProduct = (item) => {
    const productId = String(item._id || item.id || "")
    setForm((prev) => {
      const already = prev.products.some((p) => String(p.productId) === productId)
      if (already) {
        return { ...prev, products: prev.products.filter((p) => String(p.productId) !== productId) }
      }
      return {
        ...prev,
        products: [
          ...prev.products,
          { productId, name: item.name || "" },
        ],
      }
    })
  }

  const filteredMenuItems = useMemo(() => {
    if (!productSearch.trim()) return menuItems.slice(0, 30)
    const q = productSearch.toLowerCase()
    return menuItems.filter((i) => (i.name || "").toLowerCase().includes(q)).slice(0, 30)
  }, [menuItems, productSearch])

  const validationError = useMemo(() => {
    if (!String(form.title || "").trim()) return "Title is required"
    if (!Number.isFinite(Number(form.discountValue)) || Number(form.discountValue) <= 0) {
      return "Discount value must be greater than 0"
    }
    if (isPercentage && (form.maxDiscount === "" || !Number.isFinite(Number(form.maxDiscount)) || Number(form.maxDiscount) < 0)) {
      return "Max Discount is required for percentage offers"
    }
    if (form.maxItemsPerOrder !== "" && (!Number.isFinite(Number(form.maxItemsPerOrder)) || Number(form.maxItemsPerOrder) < 1)) {
      return "Max Items Per Order must be at least 1"
    }
    if (form.perUserRedeemLimit !== "" && (!Number.isFinite(Number(form.perUserRedeemLimit)) || Number(form.perUserRedeemLimit) < 1)) {
      return "Per User Redeem Limit must be at least 1"
    }
    if (form.startDate && form.endDate && new Date(form.endDate).getTime() <= new Date(form.startDate).getTime()) {
      return "End date must be after start date"
    }
    return ""
  }, [form, isPercentage])

  const handleSubmit = async () => {
    if (validationError || submitting || loadingOffer) return
    try {
      setSubmitting(true)
      setError("")
      const payload = {
        title: String(form.title || "").trim(),
        products: form.products,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        maxDiscount: isPercentage ? Number(form.maxDiscount || 0) : null,
        maxItemsPerOrder: form.maxItemsPerOrder !== "" ? Number(form.maxItemsPerOrder) : null,
        perUserRedeemLimit: form.perUserRedeemLimit !== "" ? Number(form.perUserRedeemLimit) : null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
      }

      if (isEditMode) {
        await restaurantAPI.updateOffer(String(offerId), payload)
      } else {
        await restaurantAPI.createOffer(payload)
      }

      navigate("/food/restaurant/offers")
    } catch (err) {
      setError(err?.response?.data?.message || `Failed to ${isEditMode ? "update" : "create"} offer`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f6f8] pb-36">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex w-full max-w-md items-center gap-3">
          <button onClick={goBack} className="rounded-md p-1 text-slate-600 hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-2xl font-semibold text-slate-900">
            {isEditMode ? "Edit Offer" : "Create Offer"}
          </h1>
        </div>
      </header>

      <main className="px-3 py-4">
        <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {loadingOffer ? (
            <div className="py-8 text-center text-sm text-slate-600">Loading offer...</div>
          ) : (
            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">Title *</label>
                <Input
                  value={form.title}
                  onChange={(e) => setField("title", e.target.value)}
                  placeholder="e.g. Combo Saver"
                  className="h-12"
                />
              </div>

              {/* Food/Dishes Selection */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">Select Food/Dishes</label>
                <div className="relative">
                  <div
                    className="min-h-12 w-full rounded-xl border border-slate-200 px-3 py-2 cursor-pointer flex flex-wrap gap-1.5 items-center bg-white"
                    onClick={() => setShowProductDropdown(true)}
                  >
                    {form.products.length === 0 ? (
                      <span className="text-sm text-slate-400">Select food items</span>
                    ) : (
                      form.products.map((p) => (
                        <span
                          key={String(p.productId)}
                          className="inline-flex items-center gap-1 rounded-full bg-[#00c87e]/10 px-2.5 py-0.5 text-xs font-medium text-[#00c87e]"
                        >
                          {p.name}
                          <button
                            type="button"
                            className="text-[#00c87e] hover:text-red-500"
                            onClick={(e) => {
                              e.stopPropagation()
                              setForm((prev) => ({
                                ...prev,
                                products: prev.products.filter((pp) => String(pp.productId) !== String(p.productId)),
                              }))
                            }}
                          >
                            ×
                          </button>
                        </span>
                      ))
                    )}
                  </div>

                  {/* Food Selection Modal */}
                  <AnimatePresence>
                    {showProductDropdown && (
                      <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          onClick={() => setShowProductDropdown(false)}
                          className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                        />
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9, y: 20 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: 20 }}
                          className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl"
                        >
                          <div className="border-b border-slate-100 p-5">
                            <div className="flex items-center justify-between">
                              <div>
                                <h2 className="text-xl font-bold text-slate-900">Select food</h2>
                                <p className="text-sm text-slate-500">Choose one or more food items for this offer.</p>
                              </div>
                              <button
                                onClick={() => setShowProductDropdown(false)}
                                className="rounded-full bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200"
                              >
                                <X className="h-5 w-5" />
                              </button>
                            </div>
                            <div className="mt-4">
                              <input
                                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-[#00c87e] focus:ring-1 focus:ring-[#00c87e]"
                                placeholder="Search dishes..."
                                value={productSearch}
                                onChange={(e) => setProductSearch(e.target.value)}
                                autoFocus
                              />
                            </div>
                          </div>

                          <div className="max-h-[60vh] overflow-y-auto p-4">
                            <div className="space-y-2">
                              {loadingMenu ? (
                                <p className="py-8 text-center text-sm text-slate-500">Loading dishes...</p>
                              ) : filteredMenuItems.length === 0 ? (
                                <p className="py-8 text-center text-sm text-slate-500">No dishes found</p>
                              ) : (
                                filteredMenuItems.map((item) => {
                                  const itemId = String(item._id || item.id || "")
                                  const selected = form.products.some((p) => String(p.productId) === itemId)
                                  return (
                                    <label
                                      key={itemId}
                                      className="flex cursor-pointer items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/50 p-4 transition hover:bg-slate-50"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        toggleProduct(item)
                                      }}
                                    >
                                      <span className="font-medium text-slate-800">{item.name}</span>
                                      <div
                                        className={`flex h-6 w-6 items-center justify-center rounded-md border-2 transition-all ${
                                          selected ? "bg-[#00c87e] border-[#00c87e]" : "border-slate-300 bg-white"
                                        }`}
                                      >
                                        {selected && (
                                          <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12" />
                                          </svg>
                                        )}
                                      </div>
                                    </label>
                                  )
                                })
                              )}
                            </div>
                          </div>

                          <div className="p-4 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => setShowProductDropdown(false)}
                              className="w-full rounded-2xl bg-[#00c87e] py-4 text-center font-bold text-white shadow-lg shadow-[#00c87e]/20 transition active:scale-[0.98]"
                            >
                              Done
                            </button>
                          </div>
                        </motion.div>
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Discount Type */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">Discount Type</label>
                <select
                  className="h-12 w-full rounded-xl border border-slate-200 px-3 text-slate-800 outline-none focus:border-[#00c87e]"
                  value={form.discountType}
                  onChange={(e) => setField("discountType", e.target.value)}
                >
                  <option value="percentage">Percentage</option>
                  <option value="flat">Flat Amount</option>
                </select>
              </div>

              {/* Discount Value */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">
                  {isPercentage ? "Discount (%) *" : "Discount Amount *"}
                </label>
                <Input
                  type="number"
                  min="0"
                  value={form.discountValue}
                  onChange={(e) => setField("discountValue", e.target.value)}
                  placeholder={isPercentage ? "e.g. 10" : "e.g. 50"}
                  className="h-12"
                />
              </div>

              {/* Max Discount (Only for Percentage) */}
              {isPercentage && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-800">
                    Max Discount *
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={form.maxDiscount}
                    onChange={(e) => setField("maxDiscount", e.target.value)}
                    placeholder="e.g. 100"
                    className="h-12"
                  />
                </div>
              )}

              {/* Max Items Per Order */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">Max Items Per Order</label>
                <Input
                  type="number"
                  min="1"
                  value={form.maxItemsPerOrder}
                  onChange={(e) => setField("maxItemsPerOrder", e.target.value)}
                  placeholder="e.g. 5"
                  className="h-12"
                />
                <p className="mt-1 text-xs text-slate-500">Leave empty for unlimited. Minimum 1 if set.</p>
              </div>

              {/* Per User Redeem Limit */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">Per User Redeem Limit</label>
                <Input
                  type="number"
                  min="1"
                  value={form.perUserRedeemLimit}
                  onChange={(e) => setField("perUserRedeemLimit", e.target.value)}
                  placeholder="e.g. 2"
                  className="h-12"
                />
                <p className="mt-1 text-xs text-slate-500">Leave empty for unlimited. Minimum 1 if set.</p>
              </div>

              {/* Start Date */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">Start Date (optional)</label>
                <div className="relative">
                  <Input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setField("startDate", e.target.value)}
                    className="h-12 pr-10"
                  />
                  <CalendarDays className="pointer-events-none absolute right-3 top-3.5 h-5 w-5 text-slate-400" />
                </div>
              </div>

              {/* End Date */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">End Date (optional)</label>
                <div className="relative">
                  <Input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setField("endDate", e.target.value)}
                    className="h-12 pr-10"
                  />
                  <CalendarDays className="pointer-events-none absolute right-3 top-3.5 h-5 w-5 text-slate-400" />
                </div>
              </div>
            </div>
          )}
        </div>

        {isEditMode && (
          <div className="mx-auto mt-3 w-full max-w-md rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs text-amber-700 font-medium">
              ⚠️ Editing this offer will reset it to Pending status. Admin will need to re-approve it before it applies to products in the user app.
            </p>
          </div>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white px-3 py-3">
        <div className="mx-auto w-full max-w-md">
          {!!(error || validationError) && (
            <p className="mb-2 text-xs font-medium text-red-600">{error || validationError}</p>
          )}
          <Button
            type="button"
            className="h-12 w-full bg-[#00c87e] text-white hover:bg-[#00b06f]"
            disabled={Boolean(validationError) || submitting || loadingOffer}
            onClick={handleSubmit}
          >
            {submitting
              ? isEditMode
                ? "Updating..."
                : "Submitting..."
              : isEditMode
              ? "Update Offer (sends for re-approval)"
              : "Create Offer"}
          </Button>
        </div>
      </div>

    </div>
  )
}
