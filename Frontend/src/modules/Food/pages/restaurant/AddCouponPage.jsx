import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, CalendarDays, Sparkles } from "lucide-react"
import { restaurantAPI } from "@food/api"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"

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

export default function AddCouponPage(props = {}) {
  const { mode = "create", couponId = "" } = props
  const isEditMode = mode === "edit"

  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const [form, setForm] = useState(createInitialForm())
  const [submitting, setSubmitting] = useState(false)
  const [loadingCoupon, setLoadingCoupon] = useState(isEditMode)
  const [error, setError] = useState("")

  const isPercentage = form.discountType === "percentage"

  const validationError = useMemo(() => {
    if (!String(form.couponCode || "").trim()) return "Coupon code is required"
    if (!Number.isFinite(Number(form.discountValue)) || Number(form.discountValue) <= 0) {
      return "Discount value must be greater than 0"
    }
    if (isPercentage) {
      if (!Number.isFinite(Number(form.maxDiscount)) || Number(form.maxDiscount) < 0) {
        return "Max discount is required for percentage coupons"
      }
    }
    if (form.minOrderValue !== "" && (!Number.isFinite(Number(form.minOrderValue)) || Number(form.minOrderValue) < 0)) {
      return "Min order must be 0 or more"
    }
    if (form.usageLimit !== "" && (!Number.isFinite(Number(form.usageLimit)) || Number(form.usageLimit) < 0)) {
      return "Usage limit must be 0 or more"
    }
    if (form.perUserLimit !== "" && (!Number.isFinite(Number(form.perUserLimit)) || Number(form.perUserLimit) < 0)) {
      return "Per user limit must be 0 or more"
    }
    if (form.startDate && form.endDate && new Date(form.endDate).getTime() <= new Date(form.startDate).getTime()) {
      return "End date must be after start date"
    }
    return ""
  }, [form, isPercentage])

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

        const approvalStatus = String(found?.approvalStatus || "pending").toLowerCase()
        if (approvalStatus === "approved") {
          navigate("/restaurant/coupons", { replace: true })
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
    if (validationError || submitting || loadingCoupon) return
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
      } else {
        await restaurantAPI.createCoupon(payload)
      }

      navigate("/restaurant/coupons")
    } catch (err) {
      setError(err?.response?.data?.message || `Failed to ${isEditMode ? "update" : "submit"} coupon`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f6f8] pb-24">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex w-full max-w-md items-center gap-3">
          <button onClick={goBack} className="rounded-md p-1 text-slate-600 hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-2xl font-semibold text-slate-900">{isEditMode ? "Edit Coupon" : "Add Coupon"}</h1>
        </div>
      </header>

      <main className="px-3 py-4">
        <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {loadingCoupon ? (
            <div className="py-8 text-center text-sm text-slate-600">Loading coupon...</div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">Coupon Code *</label>
                <div className="flex gap-2">
                  <Input
                    value={form.couponCode}
                    onChange={(e) => setField("couponCode", e.target.value.toUpperCase())}
                    placeholder="e.g. SAVE50"
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
                <select
                  className="h-12 w-full rounded-xl border border-slate-200 px-3 text-slate-800 outline-none focus:border-[#00c87e]"
                  value={form.discountType}
                  onChange={(e) => setField("discountType", e.target.value)}
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="flat-price">Flat Price</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">Discount Value *</label>
                <Input
                  type="number"
                  min="0"
                  value={form.discountValue}
                  onChange={(e) => setField("discountValue", e.target.value)}
                  placeholder="e.g. 20"
                  className="h-12"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">
                  Max Discount {isPercentage ? "*" : "(optional)"}
                </label>
                <Input
                  type="number"
                  min="0"
                  value={form.maxDiscount}
                  onChange={(e) => setField("maxDiscount", e.target.value)}
                  placeholder="e.g. 150"
                  disabled={!isPercentage}
                  className="h-12 disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">Min Order (optional)</label>
                <Input
                  type="number"
                  min="0"
                  value={form.minOrderValue}
                  onChange={(e) => setField("minOrderValue", e.target.value)}
                  placeholder="e.g. 299"
                  className="h-12"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">Usage Limit (optional)</label>
                <Input
                  type="number"
                  min="0"
                  value={form.usageLimit}
                  onChange={(e) => setField("usageLimit", e.target.value)}
                  placeholder="e.g. 100"
                  className="h-12"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">Per User Limit (optional)</label>
                <Input
                  type="number"
                  min="0"
                  value={form.perUserLimit}
                  onChange={(e) => setField("perUserLimit", e.target.value)}
                  placeholder="e.g. 1"
                  className="h-12"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">Customer Scope</label>
                <select
                  className="h-12 w-full rounded-xl border border-slate-200 px-3 text-slate-800 outline-none focus:border-[#00c87e]"
                  value={form.customerScope}
                  onChange={(e) => setField("customerScope", e.target.value)}
                >
                  <option value="all">All customers</option>
                  <option value="first-time">First time only</option>
                </select>
              </div>

              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                This coupon will be treated as `restaurant-funded`. Its discount will reduce your payout in finance reports.
              </div>

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

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.isFirstOrderOnly}
                  onChange={(e) => setField("isFirstOrderOnly", e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[#00c87e] focus:ring-[#00c87e]"
                />
                Only for first order
              </label>
            </div>
          )}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white px-3 py-3">
        <div className="mx-auto w-full max-w-md">
          {!!(error || validationError) && (
            <p className="mb-2 text-xs font-medium text-red-600">{error || validationError}</p>
          )}
          <Button
            type="button"
            className="h-12 w-full bg-[#00c87e] text-white hover:bg-[#00b06f]"
            disabled={Boolean(validationError) || submitting || loadingCoupon}
            onClick={handleSubmit}
          >
            {submitting ? (isEditMode ? "Updating..." : "Submitting...") : isEditMode ? "Update Coupon" : "Submit for Approval"}
          </Button>
        </div>
      </div>

    </div>
  )
}
