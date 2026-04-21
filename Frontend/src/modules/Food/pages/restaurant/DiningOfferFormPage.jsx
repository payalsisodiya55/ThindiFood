import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, CalendarDays } from "lucide-react"
import { restaurantAPI } from "@food/api"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"

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
  description: "",
  discountType: "percentage",
  discountValue: "",
  maxDiscount: "",
  minBillAmount: "",
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
  startDate: toInputDate(offer?.startDate),
  endDate: toInputDate(offer?.endDate),
})

export default function DiningOfferFormPage({ mode = "create" }) {
  const isEditMode = mode === "edit"
  const { id: offerId } = useParams()
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const [form, setForm] = useState(createInitialForm())
  const [submitting, setSubmitting] = useState(false)
  const [loadingOffer, setLoadingOffer] = useState(isEditMode)
  const [error, setError] = useState("")
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
    if (!Number.isFinite(Number(form.discountValue)) || Number(form.discountValue) <= 0) {
      return "Discount value must be greater than 0"
    }
    if (isPercentage && form.maxDiscount !== "" && (!Number.isFinite(Number(form.maxDiscount)) || Number(form.maxDiscount) < 0)) {
      return "Max discount must be 0 or more"
    }
    if (form.minBillAmount !== "" && (!Number.isFinite(Number(form.minBillAmount)) || Number(form.minBillAmount) < 0)) {
      return "Minimum bill amount must be 0 or more"
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
        description: String(form.description || "").trim(),
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        maxDiscount: isPercentage && form.maxDiscount !== "" ? Number(form.maxDiscount) : null,
        minBillAmount: form.minBillAmount !== "" ? Number(form.minBillAmount) : 0,
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
        <div className="mx-auto flex w-full max-w-md items-center gap-3">
          <button onClick={goBack} className="rounded-md p-1 text-slate-600 hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-2xl font-semibold text-slate-900">
            {isEditMode ? "Edit Dining Offer" : "Create Dining Offer"}
          </h1>
        </div>
      </header>

      <main className="px-3 py-4">
        <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {loadingOffer ? (
            <div className="py-8 text-center text-sm text-slate-600">Loading dining offer...</div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">Title *</label>
                <Input value={form.title} onChange={(e) => setField("title", e.target.value)} placeholder="e.g. Weekend Dining Special" className="h-12" />
              </div>

              <div>
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
                <select
                  className="h-12 w-full rounded-xl border border-slate-200 px-3 text-slate-800 outline-none focus:border-[#00c87e]"
                  value={form.discountType}
                  onChange={(e) => setField("discountType", e.target.value)}
                >
                  <option value="percentage">Percentage</option>
                  <option value="flat">Flat Amount</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">
                  {isPercentage ? "Discount (%) *" : "Discount Amount *"}
                </label>
                <Input type="number" min="0" value={form.discountValue} onChange={(e) => setField("discountValue", e.target.value)} className="h-12" />
              </div>

              {isPercentage && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-800">Max Discount</label>
                  <Input type="number" min="0" value={form.maxDiscount} onChange={(e) => setField("maxDiscount", e.target.value)} className="h-12" />
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">Minimum Bill Amount</label>
                <Input type="number" min="0" value={form.minBillAmount} onChange={(e) => setField("minBillAmount", e.target.value)} placeholder="e.g. 500" className="h-12" />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">Funding</label>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-700">
                  Restaurant-funded overall dining offer
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">Start Date</label>
                <div className="relative">
                  <Input type="date" value={form.startDate} onChange={(e) => setField("startDate", e.target.value)} className="h-12 pr-10" />
                  <CalendarDays className="pointer-events-none absolute right-3 top-3.5 h-5 w-5 text-slate-400" />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">End Date</label>
                <div className="relative">
                  <Input type="date" value={form.endDate} onChange={(e) => setField("endDate", e.target.value)} className="h-12 pr-10" />
                  <CalendarDays className="pointer-events-none absolute right-3 top-3.5 h-5 w-5 text-slate-400" />
                </div>
              </div>
            </div>
          )}
        </div>

        {isEditMode && (
          <div className="mx-auto mt-3 w-full max-w-md rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs text-amber-700 font-medium">
              Editing this dining offer will send it back for admin approval.
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
            {submitting ? (isEditMode ? "Updating..." : "Submitting...") : isEditMode ? "Update Dining Offer" : "Create Dining Offer"}
          </Button>
        </div>
      </div>
    </div>
  )
}
