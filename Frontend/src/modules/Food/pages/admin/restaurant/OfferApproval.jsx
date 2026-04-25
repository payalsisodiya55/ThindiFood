import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { Search, CheckCircle2, XCircle, Eye, Tag, Loader2, Calendar, Pencil } from "lucide-react"
import { Card } from "@food/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@food/components/ui/dialog"
import { adminAPI } from "@food/api"
import { toast } from "sonner"

export default function OfferApproval() {
  const [offers, setOffers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedOffer, setSelectedOffer] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [editError, setEditError] = useState("")
  const [editForm, setEditForm] = useState({
    id: "",
    title: "",
    discountType: "percentage",
    discountValue: "",
    maxDiscount: "",
    maxItemsPerOrder: "",
    perUserRedeemLimit: "",
    startDate: "",
    endDate: "",
  })
  const [processing, setProcessing] = useState(false)
  const isMountedRef = useRef(true)

  const getApprovalStatus = (offer) => String(offer?.approvalStatus || "pending").toLowerCase()
  const toInputDate = (value) => {
    if (!value) return ""
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ""
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${date.getFullYear()}-${month}-${day}`
  }
  const statusBadgeClass = (status) => {
    if (status === "approved") return "bg-green-100 text-green-700"
    if (status === "rejected") return "bg-red-100 text-red-700"
    return "bg-amber-100 text-amber-700"
  }

  // Fetch product offers for review + management
  const fetchOffers = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true)
      const response = await adminAPI.getProductOffers({})
      const data = response?.data?.data?.offers || response?.data?.offers || []
      if (!isMountedRef.current) return
      setOffers(data)
    } catch (error) {
      if (!isMountedRef.current) return
      if (!silent) toast.error('Failed to load offer requests')
      setOffers([])
    } finally {
      if (!silent && isMountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    fetchOffers()
    const intervalId = setInterval(() => {
      if (document.visibilityState === "visible") fetchOffers({ silent: true })
    }, 30000)
    return () => {
      isMountedRef.current = false
      clearInterval(intervalId)
    }
  }, [fetchOffers])

  // Filter offers based on search query
  const filteredOffers = useMemo(() => {
    if (!searchQuery.trim()) return offers
    const query = searchQuery.toLowerCase().trim()
    return offers.filter((offer) =>
      offer.title?.toLowerCase().includes(query) ||
      offer.restaurantName?.toLowerCase().includes(query) ||
      offer.restaurantId?.toLowerCase().includes(query) ||
      getApprovalStatus(offer).includes(query)
    )
  }, [offers, searchQuery])

  // Handle Approve
  const handleApprove = async (offerId) => {
    try {
      setProcessing(true)
      await adminAPI.approveProductOffer(offerId)
      toast.success('Offer approved successfully')
      await fetchOffers()
      setShowDetailModal(false)
      setSelectedOffer(null)
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to approve offer')
    } finally {
      setProcessing(false)
    }
  }

  // Handle Reject
  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error('Please provide a rejection reason')
      return
    }
    try {
      setProcessing(true)
      await adminAPI.rejectProductOffer(selectedOffer._id || selectedOffer.id, rejectReason)
      toast.success('Offer rejected')
      await fetchOffers()
      setShowRejectModal(false)
      setShowDetailModal(false)
      setSelectedOffer(null)
      setRejectReason("")
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to reject offer')
    } finally {
      setProcessing(false)
    }
  }

  const openEditModal = (offer) => {
    if (!offer) return
    setEditError("")
    setEditForm({
      id: String(offer?._id || offer?.id || ""),
      title: String(offer?.title || ""),
      discountType: offer?.discountType === "flat" ? "flat" : "percentage",
      discountValue: offer?.discountValue != null ? String(Number(offer.discountValue)) : "",
      maxDiscount: offer?.maxDiscount != null ? String(Number(offer.maxDiscount)) : "",
      maxItemsPerOrder: offer?.maxItemsPerOrder != null ? String(Number(offer.maxItemsPerOrder)) : "",
      perUserRedeemLimit: offer?.perUserRedeemLimit != null ? String(Number(offer.perUserRedeemLimit)) : "",
      startDate: toInputDate(offer?.startDate),
      endDate: toInputDate(offer?.endDate),
    })
    setShowEditModal(true)
  }

  const handleSaveEdit = async () => {
    const title = String(editForm.title || "").trim()
    const discountValue = Number(editForm.discountValue)
    const maxDiscountValue = Number(editForm.maxDiscount)
    const maxItemsValue = Number(editForm.maxItemsPerOrder)
    const perUserValue = Number(editForm.perUserRedeemLimit)

    if (!title) {
      setEditError("Title is required")
      return
    }
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      setEditError("Discount value must be greater than 0")
      return
    }
    if (editForm.discountType === "percentage" && (!Number.isFinite(maxDiscountValue) || maxDiscountValue < 0)) {
      setEditError("Max discount is required for percentage offers")
      return
    }
    if (editForm.maxItemsPerOrder !== "" && (!Number.isFinite(maxItemsValue) || maxItemsValue < 1)) {
      setEditError("Max items per order must be at least 1")
      return
    }
    if (editForm.perUserRedeemLimit !== "" && (!Number.isFinite(perUserValue) || perUserValue < 1)) {
      setEditError("Per user redeem limit must be at least 1")
      return
    }
    if (editForm.startDate && editForm.endDate && new Date(editForm.endDate).getTime() <= new Date(editForm.startDate).getTime()) {
      setEditError("End date must be after start date")
      return
    }

    try {
      setProcessing(true)
      setEditError("")
      await adminAPI.updateProductOffer(editForm.id, {
        title,
        discountType: editForm.discountType,
        discountValue,
        maxDiscount: editForm.discountType === "percentage" ? maxDiscountValue : null,
        maxItemsPerOrder: editForm.maxItemsPerOrder !== "" ? maxItemsValue : null,
        perUserRedeemLimit: editForm.perUserRedeemLimit !== "" ? perUserValue : null,
        startDate: editForm.startDate || null,
        endDate: editForm.endDate || null,
      })
      toast.success("Offer updated successfully")
      setShowEditModal(false)
      await fetchOffers()
    } catch (error) {
      setEditError(error?.response?.data?.message || "Failed to update offer")
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Tag className="w-5 h-5 text-[#00c87e]" />
        <h1 className="text-lg sm:text-xl font-semibold text-gray-900">Offer Approvals</h1>
      </div>

      <Card className="border border-gray-200 shadow-sm">
        <div className="p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <h2 className="text-base font-semibold text-gray-900">Product Offers</h2>
            <div className="relative w-full md:w-80">
              <span className="absolute inset-y-0 left-2.5 flex items-center text-gray-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Search by restaurant or title"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white py-1.5 pl-9 pr-3 text-sm focus:outline-none focus:border-[#006fbd] focus:ring-1 focus:ring-[#006fbd]"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#006fbd]" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase">S.No</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Restaurant</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Offer Title</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Discount</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Products</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredOffers.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-3 py-8 text-center text-gray-500">No offers found.</td>
                    </tr>
                  ) : (
                    filteredOffers.map((offer, index) => {
                      const approvalStatus = getApprovalStatus(offer)
                      return (
                      <tr key={offer._id || offer.id} className="hover:bg-gray-50">
                        <td className="px-3 py-3 font-semibold">{index + 1}</td>
                        <td className="px-3 py-3">
                          <div className="font-semibold text-gray-900">{offer.restaurantName}</div>
                          <div className="text-gray-500 text-xs">{offer.restaurantId}</div>
                        </td>
                        <td className="px-3 py-3 font-semibold">{offer.title}</td>
                        <td className="px-3 py-3">
                          {offer.discountType === 'percentage' ? `${offer.discountValue}% Off` : `₹${offer.discountValue} Off`}
                        </td>
                        <td className="px-3 py-3">
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] font-bold text-slate-600">
                            {offer.products?.length || 0} ITEMS
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold capitalize ${statusBadgeClass(approvalStatus)}`}>
                            {approvalStatus}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => { setSelectedOffer(offer); setShowDetailModal(true); }}
                              className="p-1.5 bg-[#006fbd] text-white rounded-md hover:opacity-90 transition-all"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => openEditModal(offer)}
                              className="p-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-all"
                              title="Edit offer"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            {approvalStatus === "pending" && (
                              <>
                                <button
                                  onClick={() => handleApprove(offer._id || offer.id)}
                                  className="p-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-all"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => { setSelectedOffer(offer); setShowRejectModal(true); }}
                                  className="p-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-all"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )})
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-xl bg-white rounded-2xl overflow-hidden p-0">
          <DialogHeader className="p-6 border-b bg-slate-50">
            <DialogTitle>Offer Details</DialogTitle>
          </DialogHeader>
          {selectedOffer && (
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Title</label>
                  <p className="font-semibold text-gray-900">{selectedOffer.title}</p>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Discount</label>
                  <p className="font-bold text-[#00c87e]">
                    {selectedOffer.discountType === 'percentage' ? `${selectedOffer.discountValue}%` : `₹${selectedOffer.discountValue}`} OFF
                  </p>
                </div>
                {selectedOffer.maxDiscount && selectedOffer.discountType === 'percentage' && (
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Max Discount</label>
                    <p className="font-semibold text-gray-900">₹{selectedOffer.maxDiscount}</p>
                  </div>
                )}
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Valid Thru</label>
                  <div className="flex items-center gap-1 text-sm text-gray-600">
                    <Calendar className="w-3 h-3" />
                    <span>{selectedOffer.startDate ? new Date(selectedOffer.startDate).toLocaleDateString() : 'N/A'} - {selectedOffer.endDate ? new Date(selectedOffer.endDate).toLocaleDateString() : 'N/A'}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Selected Products ({selectedOffer.products?.length || 0})</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedOffer.products?.map((p, i) => (
                    <span key={i} className="px-3 py-1 bg-slate-100 rounded-full text-xs font-medium text-slate-700">
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="p-6 border-t bg-slate-50 flex gap-2">
            {getApprovalStatus(selectedOffer) === "pending" ? (
              <>
                <button onClick={() => setShowRejectModal(true)} className="flex-1 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all">Reject</button>
                <button onClick={() => handleApprove(selectedOffer._id || selectedOffer.id)} className="flex-1 py-2 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all">Approve</button>
              </>
            ) : (
              <button onClick={() => setShowDetailModal(false)} className="flex-1 py-2 bg-slate-600 text-white rounded-xl font-bold hover:bg-slate-700 transition-all">Close</button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Modal */}
      <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
        <DialogContent className="max-w-md bg-white rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-red-700">Reject Offer</DialogTitle>
            <DialogDescription>Please provide a reason for rejection.</DialogDescription>
          </DialogHeader>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="w-full mt-4 p-3 border rounded-xl outline-none focus:border-red-500 min-h-[100px]"
            placeholder="Rejection reason..."
          />
          <DialogFooter className="mt-4">
            <button onClick={() => setShowRejectModal(false)} className="px-4 py-2 text-gray-500 font-bold">Cancel</button>
            <button onClick={handleReject} disabled={processing || !rejectReason.trim()} className="px-6 py-2 bg-red-600 text-white rounded-xl font-bold disabled:opacity-50">Confirm Reject</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-xl bg-white rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle>Edit Offer</DialogTitle>
            <DialogDescription>Update offer details and save changes.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">Title</label>
              <input
                value={editForm.title}
                onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#006fbd] focus:ring-1 focus:ring-[#006fbd]"
                placeholder="Offer title"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Discount Type</label>
              <select
                value={editForm.discountType}
                onChange={(e) => setEditForm((prev) => ({ ...prev, discountType: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#006fbd] focus:ring-1 focus:ring-[#006fbd]"
              >
                <option value="percentage">Percentage</option>
                <option value="flat">Flat Amount</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Discount Value</label>
              <input
                type="number"
                min="0"
                value={editForm.discountValue}
                onChange={(e) => setEditForm((prev) => ({ ...prev, discountValue: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#006fbd] focus:ring-1 focus:ring-[#006fbd]"
              />
            </div>

            {editForm.discountType === "percentage" && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Max Discount</label>
                <input
                  type="number"
                  min="0"
                  value={editForm.maxDiscount}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, maxDiscount: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#006fbd] focus:ring-1 focus:ring-[#006fbd]"
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Max Items Per Order</label>
              <input
                type="number"
                min="1"
                value={editForm.maxItemsPerOrder}
                onChange={(e) => setEditForm((prev) => ({ ...prev, maxItemsPerOrder: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#006fbd] focus:ring-1 focus:ring-[#006fbd]"
                placeholder="Leave empty for unlimited"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Per User Redeem Limit</label>
              <input
                type="number"
                min="1"
                value={editForm.perUserRedeemLimit}
                onChange={(e) => setEditForm((prev) => ({ ...prev, perUserRedeemLimit: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#006fbd] focus:ring-1 focus:ring-[#006fbd]"
                placeholder="Leave empty for unlimited"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Start Date</label>
              <input
                type="date"
                value={editForm.startDate}
                onChange={(e) => setEditForm((prev) => ({ ...prev, startDate: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#006fbd] focus:ring-1 focus:ring-[#006fbd]"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">End Date</label>
              <input
                type="date"
                value={editForm.endDate}
                onChange={(e) => setEditForm((prev) => ({ ...prev, endDate: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#006fbd] focus:ring-1 focus:ring-[#006fbd]"
              />
            </div>
          </div>

          {editError && <p className="text-sm text-red-600">{editError}</p>}

          <DialogFooter>
            <button
              onClick={() => setShowEditModal(false)}
              className="px-4 py-2 text-gray-600 font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={processing}
              className="px-5 py-2 bg-[#006fbd] text-white rounded-xl font-semibold hover:opacity-90 disabled:opacity-60"
            >
              {processing ? "Saving..." : "Save Changes"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
