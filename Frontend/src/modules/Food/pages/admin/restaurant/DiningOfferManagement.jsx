import { useCallback, useEffect, useMemo, useState } from "react"
import { CheckCircle2, Loader2, Pencil, Plus, Search, Store, Trash2, XCircle } from "lucide-react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"

const initialForm = {
  restaurantId: "",
  title: "",
  description: "",
  discountType: "percentage",
  discountValue: "",
  maxDiscount: "",
  minBillAmount: "",
  startDate: "",
  endDate: "",
}

const formatDate = (value) => {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString("en-GB")
}

const getDiscountLabel = (offer) => {
  if (offer.discountType === "flat") return `Rs ${Number(offer.discountValue || 0)}`
  const maxDiscount = offer.maxDiscount != null ? ` (up to Rs ${Number(offer.maxDiscount)})` : ""
  return `${Number(offer.discountValue || 0)}%${maxDiscount}`
}

export default function DiningOfferManagement() {
  const [offers, setOffers] = useState([])
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingOfferId, setEditingOfferId] = useState("")
  const [editingOfferMeta, setEditingOfferMeta] = useState(null)
  const [processingId, setProcessingId] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [rejectReasonById, setRejectReasonById] = useState({})
  const [formData, setFormData] = useState(initialForm)
  const isEditing = Boolean(editingOfferId)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [offersResponse, restaurantsResponse] = await Promise.all([
        adminAPI.getDiningOffers(),
        adminAPI.getDiningRestaurants(),
      ])
      setOffers(offersResponse?.data?.data?.offers || [])
      const restaurantRows = restaurantsResponse?.data?.data?.restaurants || []
      setRestaurants(Array.isArray(restaurantRows) ? restaurantRows : [])
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load dining offers")
      setOffers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const filteredOffers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return offers
    return offers.filter((offer) =>
      String(offer?.title || "").toLowerCase().includes(query) ||
      String(offer?.restaurantName || "").toLowerCase().includes(query) ||
      String(offer?.fundedBy || "").toLowerCase().includes(query),
    )
  }, [offers, searchQuery])

  const resetOfferForm = () => {
    setFormData(initialForm)
    setEditingOfferId("")
    setEditingOfferMeta(null)
  }

  const handleEdit = (offer) => {
    const offerId = offer?._id || offer?.id
    if (!offerId) return
    setEditingOfferId(offerId)
    setEditingOfferMeta(offer)
    setFormData({
      restaurantId: String(offer.restaurantId || ""),
      title: String(offer.title || ""),
      description: String(offer.description || ""),
      discountType: offer.discountType === "flat" ? "flat" : "percentage",
      discountValue: String(Number(offer.discountValue || 0)),
      maxDiscount: offer.maxDiscount != null ? String(Number(offer.maxDiscount || 0)) : "",
      minBillAmount: String(Number(offer.minBillAmount || 0)),
      startDate: offer.startDate ? String(offer.startDate).slice(0, 10) : "",
      endDate: offer.endDate ? String(offer.endDate).slice(0, 10) : "",
    })
  }

  const handleSaveOffer = async () => {
    if (!formData.restaurantId || !formData.title.trim() || !Number(formData.discountValue)) {
      toast.error("Restaurant, title and discount value are required")
      return
    }
    try {
      setSaving(true)
      const applyToAllRestaurants = formData.restaurantId === "ALL_RESTAURANTS"
      const payload = {
        ...formData,
        restaurantId: formData.restaurantId,
        discountValue: Number(formData.discountValue),
        maxDiscount: formData.discountType === "percentage" && formData.maxDiscount !== "" ? Number(formData.maxDiscount) : null,
        minBillAmount: formData.minBillAmount !== "" ? Number(formData.minBillAmount) : 0,
      }

      if (isEditing) {
        await adminAPI.updateDiningOffer(editingOfferId, {
          ...payload,
          fundedBy: editingOfferMeta?.fundedBy || undefined,
        })
        toast.success("Dining offer updated")
      } else {
        await adminAPI.createDiningOffer({
          ...payload,
          restaurantId: applyToAllRestaurants ? "ALL_RESTAURANTS" : payload.restaurantId,
          applyToAllRestaurants,
          fundedBy: "platform",
        })
        toast.success(applyToAllRestaurants ? "Platform dining offer created for all restaurants" : "Platform-funded dining offer created")
      }
      resetOfferForm()
      fetchData()
    } catch (error) {
      toast.error(error?.response?.data?.message || (isEditing ? "Failed to update dining offer" : "Failed to create dining offer"))
    } finally {
      setSaving(false)
    }
  }

  const handleApprove = async (id) => {
    try {
      setProcessingId(id)
      await adminAPI.approveDiningOffer(id)
      toast.success("Dining offer approved")
      fetchData()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to approve dining offer")
    } finally {
      setProcessingId("")
    }
  }

  const handleReject = async (id) => {
    const reason = String(rejectReasonById[id] || "").trim()
    if (!reason) {
      toast.error("Please enter rejection reason")
      return
    }
    try {
      setProcessingId(id)
      await adminAPI.rejectDiningOffer(id, reason)
      toast.success("Dining offer rejected")
      setRejectReasonById((prev) => ({ ...prev, [id]: "" }))
      fetchData()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to reject dining offer")
    } finally {
      setProcessingId("")
    }
  }

  const handleToggleStatus = async (offer) => {
    try {
      setProcessingId(offer._id || offer.id)
      await adminAPI.updateDiningOffer(offer._id || offer.id, {
        ...offer,
        restaurantId: offer.restaurantId,
        status: offer.status === "active" ? "inactive" : "active",
      })
      toast.success("Dining offer status updated")
      fetchData()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update dining offer")
    } finally {
      setProcessingId("")
    }
  }

  const handleDeleteOffer = async (offer) => {
    const offerId = offer?._id || offer?.id
    if (!offerId) return
    const confirmed = window.confirm("Are you sure you want to delete this dining offer?")
    if (!confirmed) return

    try {
      setProcessingId(offerId)
      await adminAPI.deleteDiningOffer(offerId)
      if (editingOfferId === offerId) {
        resetOfferForm()
      }
      toast.success("Dining offer deleted")
      fetchData()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to delete dining offer")
    } finally {
      setProcessingId("")
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Dining Overall Offers</h1>
        <p className="text-sm text-slate-500 mt-1">Create platform-funded dining offers and review restaurant requests.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Plus className="w-4 h-4 text-[#00c87e]" />
          <h2 className="text-base font-semibold text-slate-900">{isEditing ? "Edit Dining Offer" : "Create Platform Dining Offer"}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 ml-1">Restaurant</label>
            <select
              value={formData.restaurantId}
              onChange={(e) => setFormData((prev) => ({ ...prev, restaurantId: e.target.value }))}
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#00c87e]"
            >
              <option value="">Select restaurant</option>
              <option value="ALL_RESTAURANTS">All restaurants</option>
              {restaurants.map((restaurant) => (
                <option key={restaurant._id || restaurant.id} value={restaurant._id || restaurant.id}>
                  {restaurant.restaurantName || restaurant.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 ml-1">Offer Title</label>
            <input
              value={formData.title}
              onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Offer title"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#00c87e]"
            />
          </div>
          <div className="md:col-span-2 flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 ml-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Description"
              className="w-full min-h-[90px] rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-[#00c87e]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 ml-1">Discount Type</label>
            <select
              value={formData.discountType}
              onChange={(e) => setFormData((prev) => ({ ...prev, discountType: e.target.value }))}
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#00c87e]"
            >
              <option value="percentage">Percentage</option>
              <option value="flat">Flat Amount</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 ml-1">Discount Value</label>
            <input
              type="number"
              min="0"
              value={formData.discountValue}
              onChange={(e) => setFormData((prev) => ({ ...prev, discountValue: e.target.value }))}
              placeholder="Discount value"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#00c87e]"
            />
          </div>
          {formData.discountType === "percentage" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-700 ml-1">Max Discount</label>
              <input
                type="number"
                min="0"
                value={formData.maxDiscount}
                onChange={(e) => setFormData((prev) => ({ ...prev, maxDiscount: e.target.value }))}
                placeholder="Max discount"
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#00c87e]"
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 ml-1">Minimum Bill Amount</label>
            <input
              type="number"
              min="0"
              value={formData.minBillAmount}
              onChange={(e) => setFormData((prev) => ({ ...prev, minBillAmount: e.target.value }))}
              placeholder="Minimum bill amount"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#00c87e]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 ml-1">Start Date</label>
            <input
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData((prev) => ({ ...prev, startDate: e.target.value }))}
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#00c87e]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 ml-1">End Date</label>
            <input
              type="date"
              value={formData.endDate}
              onChange={(e) => setFormData((prev) => ({ ...prev, endDate: e.target.value }))}
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#00c87e]"
            />
          </div>
        </div>

        <button
          onClick={handleSaveOffer}
          disabled={saving}
          className="rounded-xl bg-[#00c87e] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#00b06f] disabled:opacity-60"
        >
          {saving ? (isEditing ? "Saving..." : "Creating...") : (isEditing ? "Save Changes" : "Create Dining Offer")}
        </button>
        {isEditing && (
          <button
            onClick={resetOfferForm}
            className="ml-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel Edit
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <h2 className="text-base font-semibold text-slate-900">All Dining Offers</h2>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by restaurant or title"
              className="w-full h-11 rounded-xl border border-slate-200 pl-10 pr-3 text-sm outline-none focus:border-[#00c87e]"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#00c87e]" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold text-slate-600">Restaurant</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-600">Offer</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-600">Discount</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-600">Funding</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-600">Created By</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-600">Approval</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-600">Status</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-600">Dates</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredOffers.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="px-3 py-8 text-center text-slate-500">No dining offers found.</td>
                  </tr>
                ) : (
                  filteredOffers.map((offer) => {
                    const offerId = offer._id || offer.id
                    const isProcessing = processingId === offerId
                    return (
                      <tr key={offerId}>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <Store className="w-4 h-4 text-slate-400" />
                            <span className="font-medium text-slate-900">{offer.restaurantName}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-semibold text-slate-900">{offer.title}</div>
                          {offer.description && <div className="text-xs text-slate-500">{offer.description}</div>}
                        </td>
                        <td className="px-3 py-3">{getDiscountLabel(offer)}</td>
                        <td className="px-3 py-3 capitalize">{offer.fundedBy}</td>
                        <td className="px-3 py-3 capitalize">{offer.createdByRole}</td>
                        <td className="px-3 py-3 capitalize">{offer.approvalStatus}</td>
                        <td className="px-3 py-3 capitalize">{offer.status}</td>
                        <td className="px-3 py-3 text-xs text-slate-500">
                          {formatDate(offer.startDate)} - {formatDate(offer.endDate)}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-2 min-w-[250px]">
                            {offer.approvalStatus === "pending" && (
                              <>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleApprove(offerId)}
                                    disabled={isProcessing}
                                    className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleReject(offerId)}
                                    disabled={isProcessing}
                                    className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                    Reject
                                  </button>
                                </div>
                                <input
                                  value={rejectReasonById[offerId] || ""}
                                  onChange={(e) => setRejectReasonById((prev) => ({ ...prev, [offerId]: e.target.value }))}
                                  placeholder="Rejection reason"
                                  className="h-9 rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-[#00c87e]"
                                />
                              </>
                            )}
                            {offer.approvalStatus === "approved" && (
                              <button
                                onClick={() => handleToggleStatus(offer)}
                                disabled={isProcessing}
                                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60"
                              >
                                {offer.status === "active" ? "Set Inactive" : "Set Active"}
                              </button>
                            )}
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEdit(offer)}
                                disabled={isProcessing}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60 hover:bg-slate-900 hover:text-white hover:border-slate-900 active:scale-95 transition-all duration-200"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteOffer(offer)}
                                disabled={isProcessing}
                                className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 disabled:opacity-60 hover:bg-red-600 hover:text-white hover:border-red-600 active:scale-95 transition-all duration-200"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete
                              </button>
                            </div>
                            {offer.approvalStatus === "rejected" && offer.rejectionReason && (
                              <div className="text-xs text-red-600">{offer.rejectionReason}</div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
