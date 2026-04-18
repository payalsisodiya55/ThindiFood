import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { Search, CheckCircle2, XCircle, Eye, Tag, Loader2, Calendar } from "lucide-react"
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
  const [rejectReason, setRejectReason] = useState("")
  const [processing, setProcessing] = useState(false)
  const isMountedRef = useRef(true)

  // Fetch pending offer approval requests
  const fetchOffers = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true)
      // We fetch all product offers, backend can filter for pending if needed or we show status
      const response = await adminAPI.getProductOffers({ status: 'pending' })
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
      offer.restaurantId?.toLowerCase().includes(query)
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

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Tag className="w-5 h-5 text-[#00c87e]" />
        <h1 className="text-lg sm:text-xl font-semibold text-gray-900">Offer Approvals</h1>
      </div>

      <Card className="border border-gray-200 shadow-sm">
        <div className="p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <h2 className="text-base font-semibold text-gray-900">Pending Product Offers</h2>
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
                      <td colSpan="7" className="px-3 py-8 text-center text-gray-500">No pending offers found.</td>
                    </tr>
                  ) : (
                    filteredOffers.map((offer, index) => (
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
                          <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-full text-xs font-bold capitalize">
                            {offer.approvalStatus || 'pending'}
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
                          </div>
                        </td>
                      </tr>
                    ))
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
            <button onClick={() => setShowRejectModal(true)} className="flex-1 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all">Reject</button>
            <button onClick={() => handleApprove(selectedOffer._id || selectedOffer.id)} className="flex-1 py-2 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all">Approve</button>
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
    </div>
  )
}
