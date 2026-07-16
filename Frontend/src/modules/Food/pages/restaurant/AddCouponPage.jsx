import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, CalendarDays, Sparkles, Info } from "lucide-react"
import { restaurantAPI } from "@food/api"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@food/components/ui/popover"
import { Calendar } from "@food/components/ui/calendar"
import { toast } from "sonner"

const createInitialForm = () => ({
  couponCode: "",
  discountType: "percentage",
  discountValue: "",
  maxDiscount: "",
  minOrderValue: "",
  usageLimit: "",
  perUserLimit: "",
  customerScope: "all",
  startDate: "",
  endDate: "",
  isFirstOrderOnly: false,
})

const randomCouponCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let out = ""
  for (let i = 0; i < 8; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}

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

const mapCouponToForm = (coupon) => ({
  couponCode: String(coupon?.couponCode || ""),
  discountType: coupon?.discountType === "flat-price" ? "flat-price" : "percentage",
  discountValue: coupon?.discountValue != null ? String(Number(coupon.discountValue)) : "",
  maxDiscount: coupon?.maxDiscount != null ? String(Number(coupon.maxDiscount)) : "",
  minOrderValue: coupon?.minOrderValue != null ? String(Number(coupon.minOrderValue)) : "",
  usageLimit: coupon?.usageLimit != null ? String(Number(coupon.usageLimit)) : "",
  perUserLimit: coupon?.perUserLimit != null ? String(Number(coupon.perUserLimit)) : "",
  customerScope: coupon?.customerScope === "first-time" ? "first-time" : "all",
  startDate: toInputDate(coupon?.startDate),
  endDate: toInputDate(coupon?.endDate),
  isFirstOrderOnly: Boolean(coupon?.isFirstOrderOnly),
})

const discountTypeOptions = [
  { value: "percentage", label: "Percentage (%)" },
  { value: "flat-price", label: "Flat Price" },
]

const customerScopeOptions = [
  { value: "all", label: "All Customers" },
  { value: "first-time", label: "First Time Only" },
]

const CustomSelect = ({ value, onChange, options, className = "" }) => {
  const [isOpen, setIsOpen] = useState(false)
  const selectedOption = options.find((opt) => opt.value === value) || options[0]

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest(".custom-select-container")) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  return (
    <div className="relative custom-select-container w-full">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex h-12 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none hover:bg-slate-50 cursor-pointer focus:border-[#00c87e] focus:ring-1 focus:ring-[#00c87e] transition-all ${
          isOpen ? "border-[#00c87e] ring-1 ring-[#00c87e]" : ""
        } ${className}`}
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

      {isOpen && (
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

export default function AddCouponPage(props = {}) {
  const { mode = "create", couponId = "" } = props
  const isEditMode = mode === "edit"

  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const [form, setForm] = useState(createInitialForm())
  const [submitting, setSubmitting] = useState(false)
  const [loadingCoupon, setLoadingCoupon] = useState(isEditMode)
  const [error, setError] = useState("")
  const [showErrors, setShowErrors] = useState(false)
  const [isStartCalendarOpen, setIsStartCalendarOpen] = useState(false)
  const [isEndCalendarOpen, setIsEndCalendarOpen] = useState(false)
  const [showUsageLimitTooltip, setShowUsageLimitTooltip] = useState(false)
  const [showPerUserLimitTooltip, setShowPerUserLimitTooltip] = useState(false)

  const isPercentage = form.discountType === "percentage"

  const validationError = useMemo(() => {
    if (!String(form.couponCode || "").trim()) return "Coupon code is required"
    if (String(form.couponCode || "").trim().length > 15) {
      return "Coupon code cannot exceed 15 letters"
    }
    
    const discVal = Number(form.discountValue || 0)
    if (!Number.isFinite(discVal) || discVal <= 0) {
      return "Discount value must be greater than 0"
    }
    if (isPercentage && (discVal < 1 || discVal > 99)) {
      return "Percentage discount must be between 1% and 99%"
    }
    if (discVal > 100000000) {
      return "Discount value cannot exceed 100,000,000"
    }

    if (isPercentage) {
      if (!form.maxDiscount || String(form.maxDiscount).trim() === "") {
        return "Max discount is required for percentage coupons"
      }
      const maxD = Number(form.maxDiscount)
      if (Number.isNaN(maxD) || maxD <= 0) {
        return "Max discount must be greater than 0"
      }
      if (maxD > 100000000) {
        return "Max discount cannot exceed 100,000,000"
      }
    }

    if (form.minOrderValue !== "") {
      const minO = Number(form.minOrderValue)
      if (!Number.isFinite(minO) || minO < 0) {
        return "Min order must be 0 or more"
      }
      if (minO > 100000000) {
        return "Min order cannot exceed 100,000,000"
      }
    }

    if (form.usageLimit !== "") {
      const usageL = Number(form.usageLimit)
      if (!Number.isFinite(usageL) || usageL < 0) {
        return "Usage limit must be 0 or more"
      }
      if (usageL > 10000000) {
        return "Usage limit cannot exceed 10,000,000"
      }
    }

    if (form.perUserLimit !== "") {
      const perUserL = Number(form.perUserLimit)
      if (!Number.isFinite(perUserL) || perUserL < 0) {
        return "Per user limit must be 0 or more"
      }
      if (perUserL > 100000) {
        return "Per user limit cannot exceed 100,000"
      }
    }

    const todayStr = getTodayDateString()
    if (!isEditMode && form.startDate && form.startDate < todayStr) {
      return "Start date cannot be in the past"
    }
    if (!isEditMode && form.endDate && form.endDate < todayStr) {
      return "End date cannot be in the past"
    }
    if (form.startDate && form.endDate && new Date(form.startDate).getTime() > new Date(form.endDate).getTime()) {
      return "Start date cannot be later than the end date. Please select a valid date range."
    }
    return ""
  }, [form, isPercentage, isEditMode])

  useEffect(() => {
    if (!isEditMode) {
      setLoadingCoupon(false)
      return
    }

    let isActive = true
    const loadCoupon = async () => {
      try {
        setLoadingCoupon(true)
        setError("")
        const response = await restaurantAPI.getMyCoupons()
        const list = response?.data?.data?.coupons || []
        const found = (Array.isArray(list) ? list : []).find(
          (coupon) => String(coupon?._id || coupon?.id || "") === String(couponId || ""),
        )

        if (!found) {
          if (!isActive) return
          setError("Coupon not found")
          return
        }

        if (!isActive) return
        setForm(mapCouponToForm(found))
      } catch (err) {
        if (!isActive) return
        setError(err?.response?.data?.message || "Failed to load coupon")
      } finally {
        if (isActive) setLoadingCoupon(false)
      }
    }

    loadCoupon()
    return () => {
      isActive = false
    }
  }, [couponId, isEditMode, navigate])

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (error) setError("")
  }

  const handleGenerate = () => {
    setField("couponCode", randomCouponCode())
  }

  const handleSubmit = async () => {
    setShowErrors(true)
    if (validationError) {
      toast.error(validationError)
      return
    }
    if (submitting || loadingCoupon) return
    try {
      setSubmitting(true)
      setError("")
      const payload = {
        couponCode: String(form.couponCode || "").trim().toUpperCase(),
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        maxDiscount: isPercentage ? Number(form.maxDiscount) : null,
        minOrderValue: form.minOrderValue !== "" ? Number(form.minOrderValue) : undefined,
        usageLimit: form.usageLimit !== "" ? Number(form.usageLimit) : undefined,
        perUserLimit: form.perUserLimit !== "" ? Number(form.perUserLimit) : undefined,
        customerScope: form.customerScope,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        isFirstOrderOnly: Boolean(form.isFirstOrderOnly),
      }

      if (isEditMode) {
        await restaurantAPI.updateCoupon(String(couponId), payload)
        toast.success("Coupon updated successfully")
      } else {
        await restaurantAPI.createCoupon(payload)
        toast.success("Coupon submitted for approval")
      }

      navigate("/restaurant/coupons")
    } catch (err) {
      const msg = err?.response?.data?.message || `Failed to ${isEditMode ? "update" : "submit"} coupon`
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f6f8] pb-24">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex w-full max-w-md md:max-w-3xl items-center gap-3">
          <button onClick={goBack} className="rounded-md p-1 text-slate-600 hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-2xl font-semibold text-slate-900">{isEditMode ? "Edit Coupon" : "Add Coupon"}</h1>
        </div>
      </header>

      <main className="px-3 py-4">
        <div className="mx-auto w-full max-w-md md:max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {loadingCoupon ? (
            <div className="py-8 text-center text-sm text-slate-600">Loading coupon...</div>
          ) : (
            <div className="space-y-4 md:space-y-0 md:grid md:grid-cols-2 md:gap-4">
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-800">
                  Coupon Code <span className="text-red-500 font-bold">*</span>
                </label>
                <div className="flex gap-2">
                  <Input
                    value={form.couponCode}
                    onChange={(e) => setField("couponCode", e.target.value.slice(0, 15).toUpperCase())}
                    placeholder="E.g. SAVE50"
                    maxLength={15}
                    className="h-12"
                  />
                  <button
                    type="button"
                    onClick={handleGenerate}
                    className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#00c87e] text-white transition hover:bg-[#00b06f]"
                    title="Generate code"
                  >
                    <Sparkles className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">Discount Type</label>
                <CustomSelect
                  value={form.discountType}
                  onChange={(val) => {
                    setForm((prev) => {
                      const newDiscVal = val === "percentage" && prev.discountValue.length > 2
                        ? prev.discountValue.slice(0, 2)
                        : prev.discountValue
                      return {
                        ...prev,
                        discountType: val,
                        discountValue: newDiscVal,
                      }
                    })
                    if (error) setError("")
                  }}
                  options={discountTypeOptions}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">
                  Discount Value <span className="text-red-500 font-bold">*</span>
                </label>
                <Input
                  type="text"
                  value={form.discountValue}
                  maxLength={isPercentage ? 2 : 10}
                  onChange={(e) => {
                    const val = e.target.value
                    const sanitized = val.replace(/[^0-9.]/g, "")
                    const parts = sanitized.split(".")
                    const finalVal = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : sanitized
                    setField("discountValue", finalVal)
                  }}
                  placeholder="E.g. 20"
                  className="h-12"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">
                  Max Discount {isPercentage ? <span className="text-red-500 font-bold">*</span> : "(optional)"}
                </label>
                <Input
                  type="text"
                  value={form.maxDiscount}
                  maxLength={10}
                  onChange={(e) => {
                    const val = e.target.value
                    const sanitized = val.replace(/[^0-9.]/g, "")
                    const parts = sanitized.split(".")
                    const finalVal = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : sanitized
                    setField("maxDiscount", finalVal)
                  }}
                  placeholder="E.g. 150"
                  disabled={!isPercentage}
                  className="h-12 disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">Min Order (Optional)</label>
                <Input
                  type="text"
                  value={form.minOrderValue}
                  maxLength={9}
                  onChange={(e) => setField("minOrderValue", e.target.value.replace(/\D/g, ""))}
                  placeholder="E.g. 299"
                  className="h-12"
                />
              </div>

              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <label className="block text-sm font-medium text-slate-800">Usage Limit (Optional)</label>
                  <div 
                    className="group relative cursor-pointer"
                    onClick={() => setShowUsageLimitTooltip(!showUsageLimitTooltip)}
                  >
                    <Info className="h-4 w-4 text-slate-400 hover:text-slate-600 transition-colors" />
                    <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-slate-800 text-white text-[11px] p-2 rounded-lg shadow-lg z-50 text-center leading-normal ${showUsageLimitTooltip ? 'block' : 'hidden group-hover:block'}`}>
                      Total number of times this coupon can be used across all customers.
                    </div>
                  </div>
                </div>
                <Input
                  type="text"
                  value={form.usageLimit}
                  maxLength={9}
                  onChange={(e) => setField("usageLimit", e.target.value.replace(/\D/g, ""))}
                  placeholder="e.g. 100"
                  className="h-12"
                />
              </div>

              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <label className="block text-sm font-medium text-slate-800">Per User Limit (Optional)</label>
                  <div 
                    className="group relative cursor-pointer"
                    onClick={() => setShowPerUserLimitTooltip(!showPerUserLimitTooltip)}
                  >
                    <Info className="h-4 w-4 text-slate-400 hover:text-slate-600 transition-colors" />
                    <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-slate-800 text-white text-[11px] p-2 rounded-lg shadow-lg z-50 text-center leading-normal ${showPerUserLimitTooltip ? 'block' : 'hidden group-hover:block'}`}>
                      Maximum number of times a single customer can use this coupon.
                    </div>
                  </div>
                </div>
                <Input
                  type="text"
                  value={form.perUserLimit}
                  maxLength={6}
                  onChange={(e) => setField("perUserLimit", e.target.value.replace(/\D/g, ""))}
                  placeholder="e.g. 1"
                  className="h-12"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-800">Customer Scope</label>
                <CustomSelect
                  value={form.customerScope}
                  onChange={(val) => setField("customerScope", val)}
                  options={customerScopeOptions}
                />
              </div>

              <div className="md:col-span-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                This coupon will be treated as "restaurant-funded". Its discount will reduce your payout in finance reports.
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">Start Date (Optional)</label>
                <Popover open={isStartCalendarOpen} onOpenChange={setIsStartCalendarOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex h-12 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none hover:bg-slate-50 cursor-pointer focus:border-[#00c87e] transition-all"
                    >
                      <span className={form.startDate ? "text-slate-800" : "text-muted-foreground"}>
                        {form.startDate ? formatDisplayDate(form.startDate) : "Select Start Date"}
                      </span>
                      <CalendarDays className="h-5 w-5 text-slate-400" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-[100]" align="start">
                    <div className="bg-white rounded-md shadow-lg border border-gray-200">
                      <Calendar
                        mode="single"
                        captionLayout="dropdown"
                        startMonth={new Date()}
                        endMonth={new Date(new Date().getFullYear() + 5, 11)}
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

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">End Date (Optional)</label>
                <Popover open={isEndCalendarOpen} onOpenChange={setIsEndCalendarOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex h-12 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none hover:bg-slate-50 cursor-pointer focus:border-[#00c87e] transition-all"
                    >
                      <span className={form.endDate ? "text-slate-800" : "text-muted-foreground"}>
                        {form.endDate ? formatDisplayDate(form.endDate) : "Select End Date"}
                      </span>
                      <CalendarDays className="h-5 w-5 text-slate-400" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-[100]" align="start">
                    <div className="bg-white rounded-md shadow-lg border border-gray-200">
                      <Calendar
                        mode="single"
                        captionLayout="dropdown"
                        startMonth={parseLocalDate(form.startDate) || new Date()}
                        endMonth={new Date(new Date().getFullYear() + 5, 11)}
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

              <label className="md:col-span-2 flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.isFirstOrderOnly}
                  onChange={(e) => setField("isFirstOrderOnly", e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[#00c87e] focus:ring-[#00c87e]"
                />
                Only For First Order
              </label>
            </div>
          )}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white px-3 py-3">
        <div className="mx-auto w-full max-w-md md:max-w-3xl">
          <Button
            type="button"
            className="h-12 w-full bg-[#00c87e] text-white hover:bg-[#00b06f]"
            disabled={submitting || loadingCoupon}
            onClick={handleSubmit}
          >
            {submitting ? (isEditMode ? "Updating..." : "Submitting...") : isEditMode ? "Update Coupon" : "Submit for Approval"}
          </Button>
        </div>
      </div>

    </div>
  )
}
