import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, CalendarDays, Plus, Trash2, Sparkles } from "lucide-react"
import { restaurantAPI } from "@food/api"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@food/components/ui/popover"
import { Calendar } from "@food/components/ui/calendar"
import {
  DATE_RANGE_REQUIRED_MESSAGE,
  DINING_OFFER_SCHEDULE_OPTIONS,
  HAPPY_HOURS_DAYS_MESSAGE,
  WEEKDAYS,
  normalizeSchedule,
  parseLocalDate,
  validateDiningOfferSchedule,
} from "@food/utils/diningOfferSchedule"
import { toast } from "sonner"

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

const randomDiningOfferCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let out = ""
  for (let i = 0; i < 15; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
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
  schedule: {
    mode: "all_days",
    customDays: [],
    happyHoursEnabled: false,
    happyHours: [],
  },
  termsAndConditions: "",
})

const mapOfferToForm = (offer) => {
  const happyHours = offer?.schedule?.happyHours || []
  return {
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
    schedule: {
      mode: offer?.schedule?.mode || "all_days",
      customDays: offer?.schedule?.customDays || [],
      happyHoursEnabled: happyHours.length > 0,
      happyHours: happyHours.map((slot) => ({ start: slot.start || "", end: slot.end || "" })),
    },
    termsAndConditions: String(offer?.termsAndConditions || ""),
  }
}

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
  const currentYear = new Date().getFullYear()

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

  const setScheduleField = (key, value) => {
    setForm((prev) => ({
      ...prev,
      schedule: {
        ...prev.schedule,
        [key]: value,
      },
    }))
    if (error) setError("")
  }

  const toggleCustomDay = (dayValue) => {
    const currentDays = form.schedule.customDays
    const newDays = currentDays.includes(dayValue)
      ? currentDays.filter((d) => d !== dayValue)
      : [...currentDays, dayValue]
    setScheduleField("customDays", newDays)
  }

  const addHappyHourSlot = () => {
    const currentSlots = form.schedule.happyHours
    setScheduleField("happyHours", [...currentSlots, { start: "12:00", end: "15:00" }])
  }

  const removeHappyHourSlot = (index) => {
    const currentSlots = form.schedule.happyHours
    setScheduleField("happyHours", currentSlots.filter((_, i) => i !== index))
  }

  const updateHappyHourSlot = (index, key, value) => {
    const currentSlots = form.schedule.happyHours
    const updated = currentSlots.map((slot, i) => (i === index ? { ...slot, [key]: value } : slot))
    setScheduleField("happyHours", updated)
  }

  const handleHappyHoursToggle = (enabled) => {
    if (enabled) {
      const dependencyError = validateDiningOfferSchedule({
        startDate: form.startDate,
        endDate: form.endDate,
        schedule: form.schedule,
        happyHoursEnabled: false,
        requireFutureDates: !isEditMode,
        todayDateString: getTodayDateString(),
      })
      if (dependencyError) {
        toast.error(dependencyError === DATE_RANGE_REQUIRED_MESSAGE ? "Select a valid start date and end date before enabling Happy Hours." : dependencyError)
        return
      }

      setScheduleField("happyHoursEnabled", true)
      if (form.schedule.happyHours.length === 0) {
        setScheduleField("happyHours", [{ start: "12:00", end: "15:00" }])
      }
      return
    }
    setScheduleField("happyHoursEnabled", false)
  }

  const normalizedSchedule = useMemo(() => normalizeSchedule(form.schedule), [form.schedule])
  const scheduleValidationError = useMemo(
    () =>
      validateDiningOfferSchedule({
        startDate: form.startDate,
        endDate: form.endDate,
        schedule: normalizedSchedule,
        happyHoursEnabled: form.schedule.happyHoursEnabled,
        requireFutureDates: !isEditMode,
        todayDateString: getTodayDateString(),
      }),
    [form.startDate, form.endDate, normalizedSchedule, form.schedule.happyHoursEnabled, isEditMode]
  )
  const hasDateRangeError =
    scheduleValidationError === DATE_RANGE_REQUIRED_MESSAGE ||
    scheduleValidationError === "Start date cannot be in the past." ||
    scheduleValidationError === "End date cannot be in the past." ||
    scheduleValidationError === "End date cannot be earlier than start date."
  const hasScheduleError =
    scheduleValidationError &&
    !hasDateRangeError &&
    scheduleValidationError !== HAPPY_HOURS_DAYS_MESSAGE &&
    !scheduleValidationError.startsWith("Add at least one valid Happy Hour time slot.") &&
    !scheduleValidationError.startsWith("All Happy Hour slots must have a start and end time.") &&
    !scheduleValidationError.startsWith("Happy Hour slot ") &&
    !scheduleValidationError.startsWith("Happy Hour slots ")
  const hasHappyHoursError =
    form.schedule.happyHoursEnabled &&
    Boolean(scheduleValidationError) &&
    !hasDateRangeError &&
    !hasScheduleError

  const validationError = useMemo(() => {
    if (!String(form.title || "").trim()) return "Title is required"
    if (String(form.title || "").trim().length > 50) {
      return "Title cannot exceed 50 characters"
    }
    
    if (form.description && String(form.description).trim().length > 80) {
      return "Description cannot exceed 80 characters"
    }

    const discVal = Number(form.discountValue || 0)
    if (!Number.isFinite(discVal) || discVal <= 0) {
      return "Discount value must be greater than 0"
    }
    if (isPercentage && (discVal < 1 || discVal > 99)) {
      return "Percentage discount must be between 1% and 99%"
    }
    if (!isPercentage && discVal > 9999) {
      return "Discount amount cannot exceed ₹9,999"
    }

    if (isPercentage) {
      if (form.maxDiscount === "") {
        return "Max discount is required for percentage offers"
      }
      const maxD = Number(form.maxDiscount)
      if (!Number.isFinite(maxD) || maxD <= 0) {
        return "Max discount must be greater than 0"
      }
      if (maxD > 9999) {
        return "Max discount cannot exceed ₹9,999"
      }
    }

    if (form.minBillAmount !== "") {
      const minB = Number(form.minBillAmount)
      if (!Number.isFinite(minB) || minB < 0) {
        return "Minimum bill amount must be 0 or more"
      }
      if (minB > 100000) {
        return "Minimum bill amount cannot exceed ₹100,000"
      }
    }

    if (form.usageLimit !== "") {
      const usageL = Number(form.usageLimit)
      if (!Number.isInteger(usageL) || usageL < 1) {
        return "Total redemptions limit must be at least 1"
      }
      if (usageL > 9999) {
        return "Total redemptions limit cannot exceed 9,999"
      }
    }

    if (form.perUserLimit !== "") {
      const perUserL = Number(form.perUserLimit)
      if (!Number.isInteger(perUserL) || perUserL < 1) {
        return "Uses per customer limit must be at least 1"
      }
      if (perUserL > 99) {
        return "Uses per customer limit cannot exceed 99"
      }
      if (form.usageLimit !== "" && perUserL > Number(form.usageLimit)) {
        return "Uses per customer cannot exceed total redemptions allowed"
      }
    }

    // Terms and conditions length limit
    if (form.termsAndConditions && form.termsAndConditions.length > 1000) {
      return "Terms and conditions cannot exceed 1000 characters"
    }

    const todayStr = getTodayDateString()
    if (scheduleValidationError) return scheduleValidationError
    return ""
  }, [form, isPercentage, isEditMode, scheduleValidationError])

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
        description: String(form.description || "").trim(),
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        maxDiscount: isPercentage && form.maxDiscount !== "" ? Number(form.maxDiscount) : null,
        minBillAmount: form.minBillAmount !== "" ? Number(form.minBillAmount) : 0,
        usageLimit: form.usageLimit !== "" ? Number(form.usageLimit) : null,
        perUserLimit: form.perUserLimit !== "" ? Number(form.perUserLimit) : null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        schedule: {
          mode: normalizedSchedule.mode,
          customDays: normalizedSchedule.mode === "custom" ? normalizedSchedule.customDays : [],
          happyHours: form.schedule.happyHoursEnabled ? form.schedule.happyHours : [],
        },
        termsAndConditions: String(form.termsAndConditions || "").trim(),
      }

      if (isEditMode) {
        await restaurantAPI.updateDiningOffer(String(offerId), payload)
      } else {
        await restaurantAPI.createDiningOffer(payload)
      }

      navigate("/food/restaurant/dining-offers")
    } catch (err) {
      const message = err?.response?.data?.message || `Failed to ${isEditMode ? "update" : "create"} dining offer`
      setError(message)
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f6f8] pb-36">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex w-full max-w-md md:max-w-3xl items-center gap-3">
          <button onClick={goBack} className="rounded-md p-1 text-slate-600 hover:bg-slate-100 animate-in cursor-pointer">
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
                <p className="mb-1.5 text-xs text-slate-500">Visible to customers. Keep it short and catchy</p>
                <div className="flex gap-2">
                  <Input value={form.title} maxLength={50} onChange={(e) => setField("title", e.target.value)} placeholder="E.g. Weekend Dining Special" className="h-12 flex-1" />
                  <button
                    type="button"
                    onClick={() => setField("title", randomDiningOfferCode())}
                    className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#00c87e] text-white transition hover:bg-[#00b06f] shrink-0"
                    title="Generate code"
                  >
                    <Sparkles className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-800">Description</label>
                <p className="mb-1.5 text-xs text-slate-500">Add a brief note about the offer details.</p>
                <div className="relative">
                  <textarea
                    value={form.description}
                    onChange={(e) => setField("description", e.target.value)}
                    placeholder="E.g. Valid on all main courses during lunch hour"
                    className="min-h-[90px] w-full rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-800 outline-none focus:border-[#00c87e]"
                    maxLength={80}
                  />
                  <div className="text-right text-[10px] text-slate-400 mt-1">
                    {form.description.length}/80
                  </div>
                </div>
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
                <div className="relative flex items-center">
                  {!isPercentage && (
                    <span className="absolute left-3 text-sm font-medium text-slate-500">₹</span>
                  )}
                  <Input
                    type="text"
                    value={form.discountValue}
                    maxLength={isPercentage ? 2 : 4}
                    onChange={(e) => {
                      const val = e.target.value
                      const sanitized = val.replace(/[^0-9]/g, "")
                      setField("discountValue", sanitized)
                    }}
                    placeholder={isPercentage ? "E.g. 10" : "E.g. 50"}
                    className={`h-12 w-full ${!isPercentage ? "pl-7" : ""} ${isPercentage ? "pr-7" : ""}`}
                  />
                  {isPercentage && (
                    <span className="absolute right-3 text-sm font-medium text-slate-500">%</span>
                  )}
                </div>
              </div>

              {isPercentage ? (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-800">Max Discount</label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-sm font-medium text-slate-500">₹</span>
                    <Input
                      type="text"
                      value={form.maxDiscount}
                      maxLength={4}
                      onChange={(e) => {
                        const val = e.target.value
                        const sanitized = val.replace(/[^0-9]/g, "")
                        setField("maxDiscount", sanitized)
                      }}
                      placeholder="E.g. 100"
                      className="h-12 w-full pl-7"
                    />
                  </div>
                </div>
              ) : (
                <div className="hidden md:block"></div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">Minimum Bill Amount</label>
                <p className="mb-1.5 text-xs text-slate-500">Offer applies only when the bill exceeds this amount. Set 0 for no minimum.</p>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-sm font-medium text-slate-500">₹</span>
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
                    placeholder="E.g. 500"
                    className="h-12 w-full pl-7"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">Total Redemptions Allowed</label>
                <p className="mb-1.5 text-xs text-slate-500">How many times can this offer be used in total across all customers? Leave blank for unlimited</p>
                <Input
                  type="text"
                  value={form.usageLimit}
                  maxLength={4}
                  onChange={(e) => setField("usageLimit", e.target.value.replace(/\D/g, ""))}
                  placeholder="E.g. 100"
                  className="h-12"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">Uses Per Customer</label>
                <p className="mb-1.5 text-xs text-slate-500">How many times can a single customer use this offer? E.g. 1 = one-time only</p>
                <Input
                  type="text"
                  value={form.perUserLimit}
                  maxLength={2}
                  onChange={(e) => setField("perUserLimit", e.target.value.replace(/\D/g, ""))}
                  placeholder="E.g. 1"
                  className="h-12"
                />
              </div>

              {/* Scheduling Section */}
              <div className="md:col-span-2 border-t border-slate-100 pt-4 mt-2">
                <h3 className="text-base font-semibold text-slate-900 mb-3">Offer Schedule</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-800">Applicable Days</label>
                    <p className="mb-2 text-xs text-slate-500">Optional. If you do not configure a schedule, this offer will run on all days within the selected date range.</p>
                    <div className="flex flex-wrap gap-2">
                      {DINING_OFFER_SCHEDULE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setScheduleField("mode", opt.value)}
                          className={`rounded-xl px-4 py-2.5 text-sm font-medium border cursor-pointer transition-all ${
                            form.schedule.mode === opt.value
                              ? "bg-[#00c87e]/10 text-[#00c87e] border-[#00c87e] font-semibold"
                              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                      </div>
                      {showErrors && hasScheduleError && (
                        <p className="mt-2 text-xs font-medium text-red-600">{scheduleValidationError}</p>
                      )}
                    </div>

                    {form.schedule.mode === "custom" && (
                    <div className="animate-in fade-in slide-in-from-top-1 duration-100">
                      <label className="mb-1.5 block text-sm font-medium text-slate-800">Select Days</label>
                      <div className="flex flex-wrap gap-2">
                        {WEEKDAYS.map((day) => {
                          const isSelected = form.schedule.customDays.includes(day.value)
                          return (
                            <button
                              key={day.value}
                              type="button"
                              onClick={() => toggleCustomDay(day.value)}
                              className={`h-10 w-12 rounded-xl text-sm font-semibold border cursor-pointer transition-all ${
                                isSelected
                                  ? "bg-[#00c87e] text-white border-[#00c87e]"
                                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                              }`}
                            >
                              {day.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <div className="border-t border-slate-100 pt-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="block text-sm font-medium text-slate-800">Happy Hours</label>
                        <p className="text-xs text-slate-500">Limit this offer to specific hours of the day</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleHappyHoursToggle(!form.schedule.happyHoursEnabled)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                          form.schedule.happyHoursEnabled ? "bg-[#00c87e]" : "bg-slate-200"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            form.schedule.happyHoursEnabled ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>

                    {form.schedule.happyHoursEnabled && (
                      <div className="mt-3 space-y-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/60 animate-in fade-in slide-in-from-top-1 duration-100">
                        {form.schedule.happyHours.map((slot, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-500 w-12">Slot {index + 1}</span>
                            <div className="flex items-center gap-1.5 flex-1">
                              <input
                                type="time"
                                value={slot.start}
                                onChange={(e) => updateHappyHourSlot(index, "start", e.target.value)}
                                className="h-10 rounded-lg border border-slate-200 px-2 text-sm bg-white outline-none focus:border-[#00c87e] w-full"
                              />
                              <span className="text-slate-400">to</span>
                              <input
                                type="time"
                                value={slot.end}
                                onChange={(e) => updateHappyHourSlot(index, "end", e.target.value)}
                                className="h-10 rounded-lg border border-slate-200 px-2 text-sm bg-white outline-none focus:border-[#00c87e] w-full"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeHappyHourSlot(index)}
                              className="text-red-500 hover:text-red-600 p-1.5 cursor-pointer"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={addHappyHourSlot}
                          className="text-xs font-semibold text-[#00c87e] hover:text-[#00b06f] flex items-center gap-1 cursor-pointer pt-1 animate-in"
                        >
                          <Plus className="h-4 w-4" />
                          Add Time Slot
                        </button>
                        {showErrors && hasHappyHoursError && (
                          <p className="text-xs font-medium text-red-600">{scheduleValidationError}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Terms and Conditions Section */}
              <div className="md:col-span-2 border-t border-slate-100 pt-4 mt-2">
                <label className="mb-1 block text-sm font-medium text-slate-800 font-semibold">Terms & Conditions</label>
                <p className="mb-1.5 text-xs text-slate-500">Provide any specific conditions (e.g. valid for dine-in only, exclusions, etc.). Max 1000 characters.</p>
                <div className="relative">
                  <textarea
                    value={form.termsAndConditions}
                    onChange={(e) => setField("termsAndConditions", e.target.value)}
                    placeholder="E.g. Valid for dine-in only. Cannot be combined with any other offer or discount. Not valid on blackout dates."
                    className="min-h-[100px] w-full rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-800 outline-none focus:border-[#00c87e]"
                    maxLength={1000}
                  />
                  <div className="text-right text-[10px] text-slate-400 mt-1">
                    {form.termsAndConditions.length}/1000
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">Start Date</label>
                <Popover open={isStartCalendarOpen} onOpenChange={setIsStartCalendarOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={`flex h-12 w-full items-center justify-between rounded-xl border px-3 text-sm text-slate-800 outline-none hover:bg-slate-50 cursor-pointer focus:border-[#00c87e] transition-all ${
                        showErrors && hasDateRangeError
                          ? "border-red-500 ring-1 ring-red-500 bg-red-50/10"
                          : "border-slate-200"
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
                        captionLayout="dropdown"
                        fromYear={currentYear}
                        toYear={currentYear + 5}
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
                      className={`flex h-12 w-full items-center justify-between rounded-xl border px-3 text-sm text-slate-800 outline-none hover:bg-slate-50 cursor-pointer focus:border-[#00c87e] transition-all ${
                        showErrors && hasDateRangeError
                          ? "border-red-500 ring-1 ring-red-500 bg-red-50/10"
                          : "border-slate-200"
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
                        captionLayout="dropdown"
                        fromYear={currentYear}
                        toYear={currentYear + 5}
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
