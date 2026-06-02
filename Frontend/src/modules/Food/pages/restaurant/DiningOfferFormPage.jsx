import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, CalendarDays } from "lucide-react"
import { restaurantAPI } from "@food/api"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@food/components/ui/popover"
import { Calendar } from "@food/components/ui/calendar"

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
  description: "",
  discountType: "percentage",
  discountValue: "",
  maxDiscount: "",
  minBillAmount: "",
  usageLimit: "",
  perUserLimit: "",
  startDate: "",
  endDate: "",
})

const mapOfferToForm = (offer) => ({
  title: String(offer?.title || ""),
  description: String(offer?.description || ""),
  discountType: offer?.discountType === "flat" ? "flat" : "percentage",
  discountValue: offer?.discountValue != null ? String(Number(offer.discountValue)) : "",
  maxDiscount: offer?.maxDiscount != null ? String(Number(offer.maxDiscount)) : "",
  minBillAmount: offer?.minBillAmount != null ? String(Number(offer.minBillAmount)) : "",
  usageLimit: offer?.usageLimit != null ? String(Number(offer.usageLimit)) : "",
  perUserLimit: (offer?.perUserLimit ?? offer?.perUserRedeemLimit) != null ? String(Number(offer?.perUserLimit ?? offer?.perUserRedeemLimit)) : "",
  startDate: toInputDate(offer?.startDate),
  endDate: toInputDate(offer?.endDate),
})

const discountTypeOptions = [
  { value: "percentage", label: "Percentage" },
  { value: "flat", label: "Flat Amount" },
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

export default function DiningOfferFormPage({ mode = "create" }) {
  const isEditMode = mode === "edit"
  const { id: offerId } = useParams()
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const [form, setForm] = useState(createInitialForm())
  const [submitting, setSubmitting] = useState(false)
  const [loadingOffer, setLoadingOffer] = useState(isEditMode)
  const [error, setError] = useState("")
  const [showErrors, setShowErrors] = useState(false)
  const [isStartCalendarOpen, setIsStartCalendarOpen] = useState(false)
  const [isEndCalendarOpen, setIsEndCalendarOpen] = useState(false)
  const isPercentage = form.discountType === "percentage"

  useEffect(() => {
    if (!isEditMode) {
      setLoadingOffer(false)
      return
    }

    let isActive = true
    const loadOffer = async () => {
      try {
        setLoadingOffer(true)
        const response = await restaurantAPI.getMyDiningOffers()
        const list = response?.data?.data?.offers || []
        const found = (Array.isArray(list) ? list : []).find((offer) => String(offer?._id || offer?.id || "") === String(offerId || ""))
        if (!found) {
          if (isActive) setError("Dining offer not found")
          return
        }
        if (isActive) setForm(mapOfferToForm(found))
      } catch (err) {
        if (isActive) setError(err?.response?.data?.message || "Failed to load dining offer")
      } finally {
        if (isActive) setLoadingOffer(false)
      }
    }

    loadOffer()
    return () => {
      isActive = false
    }
  }, [isEditMode, offerId])

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (error) setError("")
  }

  const validationError = useMemo(() => {
    if (!String(form.title || "").trim()) return "Title is required"
    
    const discVal = Number(form.discountValue || 0)
    if (!Number.isFinite(discVal) || discVal <= 0) {
      return "Discount value must be greater than 0"
    }
    if (isPercentage && discVal > 1000) {
      return "Percentage discount cannot exceed 1,000%"
    }
    if (discVal > 100000000) {
      return "Discount value cannot exceed 100,000,000"
    }

    if (isPercentage && form.maxDiscount !== "") {
      const maxD = Number(form.maxDiscount)
      if (!Number.isFinite(maxD) || maxD < 0) {
        return "Max discount must be 0 or more"
      }
      if (maxD > 100000000) {
        return "Max discount cannot exceed 100,000,000"
      }
    }

    if (form.minBillAmount !== "") {
      const minB = Number(form.minBillAmount)
      if (!Number.isFinite(minB) || minB < 0) {
        return "Minimum bill amount must be 0 or more"
      }
      if (minB > 100000000) {
        return "Minimum bill amount cannot exceed 100,000,000"
      }
    }

    if (form.usageLimit !== "") {
      const usageL = Number(form.usageLimit)
      if (!Number.isInteger(usageL) || usageL < 1) {
        return "Usage limit must be at least 1"
      }
      if (usageL > 10000000) {
        return "Usage limit cannot exceed 10,000,000"
      }
    }

    if (form.perUserLimit !== "") {
      const perUserL = Number(form.perUserLimit)
      if (!Number.isInteger(perUserL) || perUserL < 1) {
        return "Per user redeem limit must be at least 1"
      }
      if (perUserL > 100000) {
        return "Per user redeem limit cannot exceed 100,000"
      }
    }

    const todayStr = getTodayDateString()
    if (!isEditMode && form.startDate && form.startDate < todayStr) {
      return "Start date cannot be in the past"
    }
    if (!isEditMode && form.endDate && form.endDate < todayStr) {
      return "End date cannot be in the past"
    }
    if (form.startDate && form.endDate && new Date(form.endDate).getTime() <= new Date(form.startDate).getTime()) {
      return "End date must be after start date"
    }
    return ""
  }, [form, isPercentage, isEditMode])

  const handleSubmit = async () => {
    setShowErrors(true)
    if (validationError || submitting || loadingOffer) return
    try {
      setSubmitting(true)
      setError("")
      const payload = {
        title: String(form.title || "").trim(),
        description: String(form.description || "").trim(),
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        maxDiscount: isPercentage && form.maxDiscount !== "" ? Number(form.maxDiscount) : null,
        minBillAmount: form.minBillAmount !== "" ? Number(form.minBillAmount) : 0,
        usageLimit: form.usageLimit !== "" ? Number(form.usageLimit) : null,
        perUserLimit: form.perUserLimit !== "" ? Number(form.perUserLimit) : null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
      }

      if (isEditMode) {
        await restaurantAPI.updateDiningOffer(String(offerId), payload)
      } else {
        await restaurantAPI.createDiningOffer(payload)
      }

      navigate("/food/restaurant/dining-offers")
    } catch (err) {
      setError(err?.response?.data?.message || `Failed to ${isEditMode ? "update" : "create"} dining offer`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f6f8] pb-36">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex w-full max-w-md md:max-w-3xl items-center gap-3">
          <button onClick={goBack} className="rounded-md p-1 text-slate-600 hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-2xl font-semibold text-slate-900">
            {isEditMode ? "Edit Dining Offer" : "Create Dining Offer"}
          </h1>
        </div>
      </header>

      <main className="px-3 py-4">
        <div className="mx-auto w-full max-w-md md:max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {loadingOffer ? (
            <div className="py-8 text-center text-sm text-slate-600">Loading dining offer...</div>
          ) : (
            <div className="space-y-4 md:space-y-0 md:grid md:grid-cols-2 md:gap-4">
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-800">
                  Title <span className="text-red-500 font-bold">*</span>
                </label>
                <Input value={form.title} onChange={(e) => setField("title", e.target.value)} placeholder="e.g. Weekend Dining Special" className="h-12" />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-800">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setField("description", e.target.value)}
                  placeholder="Optional short note for this dining offer"
                  className="min-h-[90px] w-full rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-800 outline-none focus:border-[#00c87e]"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">Discount Type</label>
                <CustomSelect
                  value={form.discountType}
                  onChange={(val) => setField("discountType", val)}
                  options={discountTypeOptions}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">
                  {isPercentage ? (
                    <>Discount (%) <span className="text-red-500 font-bold">*</span></>
                  ) : (
                    <>Discount Amount <span className="text-red-500 font-bold">*</span></>
                  )}
                </label>
                <Input
                  type="text"
                  value={form.discountValue}
                  maxLength={isPercentage ? 6 : 10}
                  onChange={(e) => {
                    const val = e.target.value
                    const sanitized = val.replace(/[^0-9.]/g, "")
                    const parts = sanitized.split(".")
                    const finalVal = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : sanitized
                    setField("discountValue", finalVal)
                  }}
                  placeholder={isPercentage ? "e.g. 10" : "e.g. 50"}
                  className="h-12"
                />
              </div>

              {isPercentage ? (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-800">Max Discount</label>
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
                    placeholder="e.g. 100"
                    className="h-12"
                  />
                </div>
              ) : (
                <div className="hidden md:block"></div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">Minimum Bill Amount</label>
                <Input
                  type="text"
                  value={form.minBillAmount}
                  maxLength={10}
                  onChange={(e) => {
                    const val = e.target.value
                    const sanitized = val.replace(/[^0-9.]/g, "")
                    const parts = sanitized.split(".")
                    const finalVal = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : sanitized
                    setField("minBillAmount", finalVal)
                  }}
                  placeholder="e.g. 500"
                  className="h-12"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">Usage Limit (global)</label>
                <Input
                  type="text"
                  value={form.usageLimit}
                  maxLength={8}
                  onChange={(e) => setField("usageLimit", e.target.value.replace(/\D/g, ""))}
                  placeholder="Leave empty for unlimited"
                  className="h-12"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">Per User Redeem Limit</label>
                <Input
                  type="text"
                  value={form.perUserLimit}
                  maxLength={6}
                  onChange={(e) => setField("perUserLimit", e.target.value.replace(/\D/g, ""))}
                  placeholder="Leave empty for unlimited"
                  className="h-12"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-800">Funding</label>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-700">
                  Restaurant-funded overall dining offer
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">Start Date</label>
                <Popover open={isStartCalendarOpen} onOpenChange={setIsStartCalendarOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex h-12 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none hover:bg-slate-50 cursor-pointer focus:border-[#00c87e] transition-all"
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

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">End Date</label>
                <Popover open={isEndCalendarOpen} onOpenChange={setIsEndCalendarOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex h-12 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none hover:bg-slate-50 cursor-pointer focus:border-[#00c87e] transition-all"
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
            </div>
          )}
        </div>

        {isEditMode && (
          <div className="mx-auto mt-3 w-full max-w-md md:max-w-3xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs text-amber-700 font-medium">
              Editing this dining offer will send it back for admin approval.
            </p>
          </div>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white px-3 py-3">
        <div className="mx-auto w-full max-w-md md:max-w-3xl">
          {!!(error || (showErrors && validationError)) && (
            <p className="mb-2 text-xs font-medium text-red-600">{error || validationError}</p>
          )}
          <Button
            type="button"
            className="h-12 w-full bg-[#00c87e] text-white hover:bg-[#00b06f]"
            disabled={submitting || loadingOffer}
            onClick={handleSubmit}
          >
            {submitting ? (isEditMode ? "Updating..." : "Submitting...") : isEditMode ? "Update Dining Offer" : "Create Dining Offer"}
          </Button>
        </div>
      </div>
    </div>
  )
}
