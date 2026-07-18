import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, CalendarDays, X, ChevronDown, AlertCircle } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
import { restaurantAPI } from "@food/api"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@food/components/ui/popover"
import { Calendar } from "@food/components/ui/calendar"
import { flattenMenuItems, getMenuFromResponse } from "@food/utils/menuItems"
import { toast } from "sonner"
import { confirmApp } from "@shared/lib/appDialog"

const toInputDate = (value) => {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

const getTodayDateString = () => {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, "0")
  const day = String(today.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const parseLocalDate = (value) => {
  if (!value) return undefined
  const parts = value.split("-").map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return undefined
  const [year, month, day] = parts
  return new Date(year, month - 1, day)
}

const formatDisplayDate = (value) => {
  if (!value) return "Select date"
  const date = parseLocalDate(value)
  if (!date) return "Select date"
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
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

const discountTypeOptions = [
  { value: "percentage", label: "Percentage" },
  { value: "flat", label: "Flat Amount" },
]

const CustomSelect = ({ value, onChange, options, className = "", disabled }) => {
  const [isOpen, setIsOpen] = useState(false)
  const selectedOption = options.find((opt) => opt.value === value) || options[0]

  useEffect(() => {
    if (disabled) return
    const handleClickOutside = (event) => {
      if (!event.target.closest(".custom-select-container")) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [disabled])

  return (
    <div className="relative custom-select-container w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`flex h-12 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none hover:bg-slate-50 transition-all ${
          isOpen ? "border-[#00c87e] ring-1 ring-[#00c87e]" : ""
        } ${disabled ? "opacity-60 cursor-not-allowed bg-slate-50 pointer-events-none" : "cursor-pointer"} ${className}`}
      >
        <span className="text-slate-800">{selectedOption?.label}</span>
        <svg
          className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && !disabled && (
        <div className="absolute left-0 right-0 top-[52px] z-50 rounded-xl border border-slate-200 bg-white py-1 shadow-lg animate-in fade-in slide-in-from-top-1 duration-100">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value)
                setIsOpen(false)
              }}
              className={`flex w-full items-center px-3 py-2.5 text-left text-sm hover:bg-[#00c87e]/10 hover:text-[#00c87e] transition-colors cursor-pointer ${
                opt.value === value ? "bg-[#00c87e]/5 text-[#00c87e] font-semibold" : "text-slate-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function OfferFormPage({ mode = "create" }) {
  const isEditMode = mode === "edit"
  const { id: offerId } = useParams()
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()

  const [form, setForm] = useState(createInitialForm())
  const [initialForm, setInitialForm] = useState(null)
  const [offerData, setOfferData] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [loadingOffer, setLoadingOffer] = useState(isEditMode)
  const [error, setError] = useState("")
  const [showErrors, setShowErrors] = useState(false)
  const [isStartCalendarOpen, setIsStartCalendarOpen] = useState(false)
  const [isEndCalendarOpen, setIsEndCalendarOpen] = useState(false)

  // Product list from restaurant menu (for product multi-select)
  const [menuItems, setMenuItems] = useState([])
  const [loadingMenu, setLoadingMenu] = useState(true)
  const [productSearch, setProductSearch] = useState("")
  const [showProductDropdown, setShowProductDropdown] = useState(false)

  const isPercentage = form.discountType === "percentage"

  const isFieldModified = (fieldName) => {
    if (!isEditMode || !initialForm) return false
    if (fieldName === "products") {
      const initialIds = (initialForm.products || []).map(p => String(p.productId)).sort()
      const currentIds = (form.products || []).map(p => String(p.productId)).sort()
      return JSON.stringify(initialIds) !== JSON.stringify(currentIds)
    }
    if (fieldName === "maxDiscount") {
      return Number(form.maxDiscount || 0) !== Number(initialForm.maxDiscount || 0)
    }
    if (fieldName === "discountValue") {
      return Number(form.discountValue || 0) !== Number(initialForm.discountValue || 0)
    }
    return form[fieldName] !== initialForm[fieldName]
  }

  const maxSelectedPrice = useMemo(() => {
    if (menuItems.length === 0) return 0
    if (form.products.length === 0) {
      return menuItems.reduce((max, item) => Math.max(max, Number(item.price || 0)), 0)
    }
    return form.products.reduce((max, prod) => {
      const menuItem = menuItems.find(m => String(m._id || m.id) === String(prod.productId))
      return Math.max(max, menuItem ? Number(menuItem.price || 0) : 0)
    }, 0)
  }, [form.products, menuItems])

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
        const mapped = mapOfferToForm(found)
        setForm(mapped)
        setInitialForm(mapped)
        setOfferData(found)
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
    if (!productSearch.trim()) return menuItems
    const q = productSearch.toLowerCase()
    return menuItems.filter((i) => 
      (i.name || "").toLowerCase().includes(q) || 
      (i.category || "").toLowerCase().includes(q)
    )
  }, [menuItems, productSearch])

  const groupedAndSortedMenuItems = useMemo(() => {
    const groups = {}
    filteredMenuItems.forEach((item) => {
      const catName = String(item.category || item.categoryName || "General").trim()
      if (!groups[catName]) groups[catName] = []
      groups[catName].push(item)
    })

    // Sort items inside each category alphabetically
    Object.keys(groups).forEach((cat) => {
      groups[cat].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
    })

    // Sort categories alphabetically
    const sortedCategories = Object.keys(groups).sort((a, b) => a.localeCompare(b))

    return { sortedCategories, groups }
  }, [filteredMenuItems])

  const validationError = useMemo(() => {
    const titleVal = String(form.title || "").trim()
    if (!titleVal) return "Enter a title for this offer"
    if (titleVal.length < 5) return "Enter a title with at least 5 characters"
    if (titleVal.length > 30) return "Enter a title under 30 characters"
    
    const discVal = Number(form.discountValue || 0)
    if (!Number.isFinite(discVal) || discVal <= 0) {
      return "Enter a discount value greater than 0"
    }
    if (isPercentage && (discVal < 1 || discVal > 99)) {
      return "Enter a discount percentage between 1 and 99"
    }
    if (!isPercentage && discVal > 999) {
      return "Limit the discount amount to ₹999"
    }
    if (!isPercentage && maxSelectedPrice > 0 && discVal > maxSelectedPrice) {
      return `Limit flat discount to the maximum item price (₹${maxSelectedPrice})`
    }

    if (isPercentage) {
      const maxD = Number(form.maxDiscount || 0)
      if (form.maxDiscount === "" || !Number.isFinite(maxD) || maxD < 0) {
        return "Enter a maximum discount value for percentage offers"
      }
      if (maxD > 9999) {
        return "Limit the max discount to ₹9,999"
      }
    }

    if (form.maxItemsPerOrder !== "") {
      const maxItems = Number(form.maxItemsPerOrder)
      if (!Number.isFinite(maxItems) || maxItems < 1) {
        return "Enter a max items per order of at least 1"
      }
      if (maxItems > 999) {
        return "Limit max items per order to 999"
      }
    }

    if (form.perUserRedeemLimit !== "") {
      const perUserL = Number(form.perUserRedeemLimit)
      if (!Number.isFinite(perUserL) || perUserL < 1) {
        return "Enter uses per customer of at least 1"
      }
      if (perUserL > 999) {
        return "Limit uses per customer to 999"
      }
    }

    const todayStr = getTodayDateString()
    
    if (form.startDate) {
      const parsedStart = new Date(form.startDate)
      if (Number.isNaN(parsedStart.getTime())) {
        return "Enter a valid start date"
      }
      if (!isEditMode && form.startDate < todayStr) {
        return "Select a start date in the present or future"
      }
    }
    
    if (form.endDate) {
      const parsedEnd = new Date(form.endDate)
      if (Number.isNaN(parsedEnd.getTime())) {
        return "Enter a valid end date"
      }
      if (!isEditMode && form.endDate < todayStr) {
        return "Select an end date in the present or future"
      }
    }

    if (form.startDate && form.endDate) {
      const startT = new Date(form.startDate).getTime()
      const endT = new Date(form.endDate).getTime()
      if (startT > endT) {
        return "Select a start date that is before or equal to the end date"
      }
    }
    return ""
  }, [form, isPercentage, isEditMode, maxSelectedPrice])

  const handleSubmit = async () => {
    setShowErrors(true)
    if (validationError) {
      toast.error(validationError)
      return
    }
    if (submitting || loadingOffer) return
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
        toast.success("Offer updated successfully")
      } else {
        await restaurantAPI.createOffer(payload)
        toast.success("Offer created successfully")
      }

      navigate("/food/restaurant/offers")
    } catch (err) {
      const errMsg = err?.response?.data?.message || `Failed to ${isEditMode ? "update" : "create"} offer`
      setError(errMsg)
      toast.error(errMsg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f6f8] pb-36">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex w-full max-w-md md:max-w-3xl items-center gap-3">
          <button
            onClick={async () => {
              const msg = isEditMode 
                ? "Discard changes? Your offer will remain unchanged." 
                : "Discard changes? Your new offer progress will be lost."
              if (await confirmApp(msg)) {
                goBack()
              }
            }}
            disabled={submitting}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer text-slate-900 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Go back"
          >
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-slate-900">
              {isEditMode ? "Edit Offer" : "Create Offer"}
            </h1>
          </div>
        </div>
      </header>

      <main className="px-3 py-4 space-y-4">
        {error && (
          <div className="mx-auto w-full max-w-md md:max-w-3xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2 text-red-700 text-xs font-semibold">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {isEditMode && offerData?.approvalStatus === "rejected" && offerData?.rejectionReason && (
          <div className="mx-auto w-full max-w-md md:max-w-3xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2 text-red-700 text-xs font-semibold">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Rejection Reason: {offerData.rejectionReason}</span>
          </div>
        )}

        {isEditMode && (
          <div className="mx-auto w-full max-w-md md:max-w-3xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs text-amber-700 font-medium">
              ⚠️ Editing this offer will reset it to Pending status. Admin will need to re-approve it before it applies to products in the user app. Re-approval typically takes 24-48 hours.
            </p>
          </div>
        )}
        {isEditMode && offerData?.createdAt && (
          <div className="mx-auto w-full max-w-md md:max-w-3xl flex justify-between items-center px-1 text-xs text-slate-500">
            <span>Created: {new Date(offerData.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
        )}
        <div className="mx-auto w-full max-w-md md:max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {loadingOffer ? (
            <div className="py-8 text-center text-sm text-slate-600">Loading offer...</div>
          ) : (
            <div className="space-y-4 md:space-y-0 md:grid md:grid-cols-2 md:gap-4">
              {/* Title */}
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-800">
                  Title <span className="text-red-500 font-bold">*</span>
                  {isFieldModified("title") && <span className="ml-1.5 text-[10px] font-bold text-amber-500 uppercase tracking-wider">(Modified)</span>}
                </label>
                <Input
                  value={form.title}
                  onChange={(e) => setField("title", e.target.value)}
                  placeholder="E.g., Combo Saver"
                  className={`h-12 ${isFieldModified("title") ? "border-amber-400 focus-visible:ring-amber-400" : ""}`}
                  disabled={submitting}
                  maxLength={30}
                />
                <p className="mt-1 text-xs text-slate-500">Give your offer a catchy name customers will see, E.g., 'Summer Combo Deal'.</p>
              </div>

              {/* Food/Dishes Selection */}
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-800">
                  Select Food/Dishes
                  {isFieldModified("products") && <span className="ml-1.5 text-[10px] font-bold text-amber-500 uppercase tracking-wider">(Modified)</span>}
                </label>
                <div className="relative">
                  <div
                    className={`min-h-12 w-full rounded-xl border px-3 py-2 flex items-center justify-between bg-white ${
                      isFieldModified("products") ? "border-amber-400" : "border-slate-200"
                    } ${
                      submitting ? "opacity-60 cursor-not-allowed bg-slate-50" : "cursor-pointer"
                    }`}
                    onClick={() => !submitting && setShowProductDropdown(true)}
                  >
                    <div className="flex flex-wrap gap-1.5 items-center flex-1">
                      {form.products.length === 0 ? (
                        <span className="text-sm text-slate-400">Select Food Items</span>
                      ) : (
                        form.products.map((p) => (
                          <span
                            key={String(p.productId)}
                            className="inline-flex items-center gap-1 rounded-full bg-[#00c87e]/10 px-2.5 py-0.5 text-xs font-medium text-[#00c87e]"
                          >
                            {p.name}
                            <button
                              type="button"
                              disabled={submitting}
                              className="text-[#00c87e] hover:text-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (submitting) return
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
                    <ChevronDown className="h-4 w-4 text-slate-400 shrink-0 ml-2" />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Leave blank to apply to all items.</p>

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
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 pr-8">
                                <h2 className="text-xl font-bold text-slate-900">Select Food Items</h2>
                                <p className="text-sm text-slate-500 mt-1">Choose one or more food items for this offer.</p>
                              </div>
                              <button
                                onClick={() => setShowProductDropdown(false)}
                                className="rounded-full bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200 shrink-0"
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
                            <div className="mt-3 flex items-center justify-between text-xs px-1">
                              <span className="text-slate-500 font-semibold">
                                {form.products.length} item{form.products.length !== 1 ? "s" : ""} selected
                              </span>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setForm((prev) => {
                                      const nextProducts = [...prev.products]
                                      filteredMenuItems.forEach((item) => {
                                        const itemId = String(item._id || item.id || "")
                                        if (!nextProducts.some((p) => String(p.productId) === itemId)) {
                                          nextProducts.push({ productId: itemId, name: item.name || "" })
                                        }
                                      })
                                      return { ...prev, products: nextProducts }
                                    })
                                  }}
                                  className="text-[#00c87e] font-bold hover:underline cursor-pointer"
                                >
                                  Select All
                                </button>
                                <span className="text-slate-350 font-light">|</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setForm((prev) => {
                                      const filteredIds = filteredMenuItems.map((item) => String(item._id || item.id || ""))
                                      return {
                                        ...prev,
                                        products: prev.products.filter((p) => !filteredIds.includes(String(p.productId))),
                                      }
                                    })
                                  }}
                                  className="text-red-500 font-bold hover:underline cursor-pointer"
                                >
                                  Deselect All
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="max-h-[50vh] overflow-y-auto p-4">
                            <div className="space-y-4">
                              {loadingMenu ? (
                                <p className="py-8 text-center text-sm text-slate-500">Loading dishes...</p>
                              ) : groupedAndSortedMenuItems.sortedCategories.length === 0 ? (
                                <p className="py-8 text-center text-sm text-slate-500">No dishes found</p>
                              ) : (
                                groupedAndSortedMenuItems.sortedCategories.map((categoryName) => (
                                  <div key={categoryName} className="space-y-2">
                                    <h3 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider pl-1 mt-3">
                                      {categoryName}
                                    </h3>
                                    {groupedAndSortedMenuItems.groups[categoryName].map((item) => {
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
                                    })}
                                  </div>
                                ))
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
                <label className="mb-1 block text-sm font-medium text-slate-800">
                  Discount Type
                  {isFieldModified("discountType") && <span className="ml-1.5 text-[10px] font-bold text-amber-500 uppercase tracking-wider">(Modified)</span>}
                </label>
                <CustomSelect
                  value={form.discountType}
                  onChange={(val) => setField("discountType", val)}
                  options={discountTypeOptions}
                  disabled={submitting}
                />
              </div>

               {/* Discount Value */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">
                  {isPercentage ? (
                    <>Discount (%) <span className="text-red-500 font-bold">*</span></>
                  ) : (
                    <>Discount Amount <span className="text-red-500 font-bold">*</span></>
                  )}
                  {isFieldModified("discountValue") && <span className="ml-1.5 text-[10px] font-bold text-amber-500 uppercase tracking-wider">(Modified)</span>}
                </label>
                <Input
                  type="text"
                  value={form.discountValue}
                  maxLength={3}
                  disabled={submitting}
                  onChange={(e) => {
                    const val = e.target.value
                    const sanitized = val.replace(/[^0-9.]/g, "")
                    const parts = sanitized.split(".")
                    let finalVal = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : sanitized
                    if (isPercentage && Number(finalVal) > 99) {
                      finalVal = "99"
                    } else if (!isPercentage && Number(finalVal) > 999) {
                      finalVal = "999"
                    }
                    setField("discountValue", finalVal)
                  }}
                  placeholder={isPercentage ? "Enter a value between 1–99" : "E.g., 50"}
                  className={`h-12 ${isFieldModified("discountValue") ? "border-amber-400 focus-visible:ring-amber-400" : ""}`}
                />
              </div>

              {isPercentage ? (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-800">
                    Max Discount <span className="text-red-500 font-bold">*</span>
                    {isFieldModified("maxDiscount") && <span className="ml-1.5 text-[10px] font-bold text-amber-500 uppercase tracking-wider">(Modified)</span>}
                  </label>
                  <Input
                    type="text"
                    value={form.maxDiscount}
                    maxLength={6}
                    disabled={submitting}
                    onChange={(e) => {
                      const val = e.target.value
                      const sanitized = val.replace(/[^0-9.]/g, "")
                      const parts = sanitized.split(".")
                      let finalVal = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : sanitized
                      if (Number(finalVal) > 9999) {
                        finalVal = "9999"
                      }
                      setField("maxDiscount", finalVal)
                    }}
                    placeholder="E.g., 100"
                    className={`h-12 ${isFieldModified("maxDiscount") ? "border-amber-400 focus-visible:ring-amber-400" : ""}`}
                  />
                  <p className="mt-1 text-xs text-slate-500">Maximum discount amount in ₹ (caps the percentage savings).</p>
                </div>
              ) : (
                <div className="hidden md:block"></div>
              )}

              {/* Max Items Per Order */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">
                  Max Items Per Order
                  {isFieldModified("maxItemsPerOrder") && <span className="ml-1.5 text-[10px] font-bold text-amber-500 uppercase tracking-wider">(Modified)</span>}
                </label>
                <Input
                  type="text"
                  value={form.maxItemsPerOrder}
                  maxLength={3}
                  disabled={submitting}
                  onChange={(e) => {
                    let val = e.target.value.replace(/\D/g, "")
                    if (Number(val) > 999) {
                      val = "999"
                    }
                    setField("maxItemsPerOrder", val)
                  }}
                  placeholder="E.g., 5"
                  className={`h-12 ${isFieldModified("maxItemsPerOrder") ? "border-amber-400 focus-visible:ring-amber-400" : ""}`}
                />
                <p className="mt-1 text-xs text-slate-500">Leave blank for no limit. Must be at least 1 if specified.</p>
              </div>

              {/* Uses Per Customer */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">
                  Uses Per Customer
                  {isFieldModified("perUserRedeemLimit") && <span className="ml-1.5 text-[10px] font-bold text-amber-500 uppercase tracking-wider">(Modified)</span>}
                </label>
                <Input
                  type="text"
                  value={form.perUserRedeemLimit}
                  maxLength={3}
                  disabled={submitting}
                  onChange={(e) => {
                    let val = e.target.value.replace(/\D/g, "")
                    if (Number(val) > 999) {
                      val = "999"
                    }
                    setField("perUserRedeemLimit", val)
                  }}
                  placeholder="E.g., 2"
                  className={`h-12 ${isFieldModified("perUserRedeemLimit") ? "border-amber-400 focus-visible:ring-amber-400" : ""}`}
                />
                <p className="mt-1 text-xs text-slate-500">Leave blank for no limit. Must be at least 1 if specified.</p>
              </div>

              {/* Start Date */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">
                  Start Date (Optional)
                  {isFieldModified("startDate") && <span className="ml-1.5 text-[10px] font-bold text-amber-500 uppercase tracking-wider">(Modified)</span>}
                </label>
                <Popover open={!submitting && isStartCalendarOpen} onOpenChange={(open) => !submitting && setIsStartCalendarOpen(open)}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      disabled={submitting}
                      className={`flex h-12 w-full items-center justify-between rounded-xl border px-3 text-sm outline-none hover:bg-slate-50 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-slate-50 cursor-pointer ${
                        isFieldModified("startDate") ? "border-amber-400" : "border-slate-200"
                      }`}
                    >
                      <span className={form.startDate ? "text-slate-800" : "text-muted-foreground"}>
                        {form.startDate ? formatDisplayDate(form.startDate) : "Select start date"}
                      </span>
                      <CalendarDays className="h-5 w-5 text-slate-400" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-[100]" align="start">
                    <div className="bg-white rounded-md shadow-lg border border-gray-200">
                      <Calendar
                        mode="single"
                        selected={parseLocalDate(form.startDate)}
                        onSelect={(date) => {
                          if (!date) return
                          setField("startDate", toInputDate(date))
                          setIsStartCalendarOpen(false)
                        }}
                        disabled={(date) => {
                          const today = new Date()
                          today.setHours(0, 0, 0, 0)
                          return date < today
                        }}
                        initialFocus
                      />
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* End Date */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">
                  End Date (Optional)
                  {isFieldModified("endDate") && <span className="ml-1.5 text-[10px] font-bold text-amber-500 uppercase tracking-wider">(Modified)</span>}
                </label>
                <Popover open={!submitting && isEndCalendarOpen} onOpenChange={(open) => !submitting && setIsEndCalendarOpen(open)}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      disabled={submitting}
                      className={`flex h-12 w-full items-center justify-between rounded-xl border px-3 text-sm outline-none hover:bg-slate-50 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-slate-50 cursor-pointer ${
                        isFieldModified("endDate") ? "border-amber-400" : "border-slate-200"
                      }`}
                    >
                      <span className={form.endDate ? "text-slate-800" : "text-muted-foreground"}>
                        {form.endDate ? formatDisplayDate(form.endDate) : "Select end date"}
                      </span>
                      <CalendarDays className="h-5 w-5 text-slate-400" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-[100]" align="start">
                    <div className="bg-white rounded-md shadow-lg border border-gray-200">
                      <Calendar
                        mode="single"
                        selected={parseLocalDate(form.endDate)}
                        onSelect={(date) => {
                          if (!date) return
                          setField("endDate", toInputDate(date))
                          setIsEndCalendarOpen(false)
                        }}
                        disabled={(date) => {
                          const limitDate = parseLocalDate(form.startDate) || new Date()
                          limitDate.setHours(0, 0, 0, 0)
                          return date < limitDate
                        }}
                        initialFocus
                      />
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <p className="mt-2 text-xs text-slate-500 md:col-span-2">
                Leave blank for an indefinite offer with no expiry.
              </p>

              {/* Live Preview */}
              <div className="md:col-span-2 mt-6 border-t border-slate-100 pt-6">
                <h3 className="text-sm font-bold text-slate-900 mb-3">Live Preview</h3>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">How customers will see this offer</p>
                  
                  {/* Mock Dish Card */}
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs max-w-sm flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Veg</span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-800 truncate">
                        {form.products.length > 0 ? form.products.map(p => p.name).join(", ") : "Sample Dish Name"}
                      </h4>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-1">Delicious freshly prepared house specialty.</p>
                      
                      <div className="flex items-baseline gap-2 mt-3">
                        <span className="text-sm font-extrabold text-slate-900">
                          {form.discountType === "flat"
                            ? `₹${Math.max(0, 150 - Number(form.discountValue || 0))}`
                            : `₹${Math.max(0, 150 - Math.min(Number(form.maxDiscount || 150), Math.round(150 * (Number(form.discountValue || 0) / 100))))}`
                          }
                        </span>
                        <span className="text-xs text-slate-400 line-through">₹150</span>
                        
                        <span className="inline-flex items-center rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-[#00c87e] border border-emerald-100">
                          {form.discountType === "flat"
                            ? `₹${Number(form.discountValue || 0).toLocaleString('en-IN')} OFF`
                            : `${form.discountValue || "0"}% OFF${form.maxDiscount ? ` (up to ₹${Number(form.maxDiscount).toLocaleString('en-IN')})` : ""}`
                          }
                        </span>
                      </div>
                    </div>
                    <div className="h-16 w-16 rounded-xl bg-slate-100 flex-shrink-0 flex items-center justify-center text-slate-300 text-xs font-medium border border-slate-100">
                      Dish Image
                    </div>
                  </div>
                  
                  <div className="mt-4 flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#00c87e]"></span>
                    <span>
                      {form.products.length === 0 
                        ? "Offer applies to all items in your menu." 
                        : `Offer applies to ${form.products.length} selected item${form.products.length > 1 ? "s" : ""}.`
                      }
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

      </main>

      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white px-3 py-3">
        <div className="mx-auto w-full max-w-md md:max-w-3xl flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-12 flex-1 border-slate-200 text-slate-700 hover:bg-slate-50"
            disabled={submitting}
            onClick={async () => {
              const msg = isEditMode 
                ? "Discard changes? Your offer will remain unchanged." 
                : "Discard changes? Your new offer progress will be lost."
              if (await confirmApp(msg)) {
                goBack()
              }
            }}
          >
            Discard Changes
          </Button>
          <Button
            type="button"
            className="h-12 flex-1 bg-[#00c87e] text-white hover:bg-[#00b06f]"
            disabled={submitting || loadingOffer || !!validationError}
            onClick={handleSubmit}
          >
            {submitting
              ? isEditMode
                ? "Updating..."
                : "Submitting..."
              : isEditMode
              ? "Update & Submit for Approval"
              : "Create Offer"}
          </Button>
        </div>
      </div>

    </div>
  )
}
