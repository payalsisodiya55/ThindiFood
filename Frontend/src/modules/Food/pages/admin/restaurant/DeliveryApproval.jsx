import { useState, useMemo, useEffect, useRef } from "react"
import { 
  Search, Filter, Eye, Check, X, Truck, ArrowUpDown, Loader2,
  Phone, Mail, MapPin, Clock, Info
} from "lucide-react"
import { adminAPI } from "@food/api"

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const normalizeApprovalStatus = (value) => String(value || "").trim().toLowerCase()

const getDeliveryStatusMeta = (request) => {
  const status = normalizeApprovalStatus(request?.selfDelivery?.approvalStatus || "pending")

  if (status === "approved") {
    return { label: "Approved", className: "bg-green-100 text-green-700" }
  }

  if (status === "rejected") {
    return { label: "Rejected", className: "bg-red-100 text-red-700" }
  }

  return {
    label: "Pending Approval",
    className: "bg-amber-100 text-amber-700",
  }
}

export default function DeliveryApproval() {
  const [activeTab, setActiveTab] = useState("pending")
  const [searchQuery, setSearchQuery] = useState("")
  const [pendingRequests, setPendingRequests] = useState([])
  const [rejectedRequests, setRejectedRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [sortConfig, setSortConfig] = useState({ key: "", direction: "" })

  const hasFetchedOnceRef = useRef(false)

  useEffect(() => {
    fetchRequests()
  }, [])

  const fetchRequests = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await adminAPI.getPendingDeliveryApprovals()
      const list = (response?.data?.data || [])
      
      setPendingRequests(list.filter(r => (r.selfDelivery?.approvalStatus || 'pending') === 'pending'))
      setRejectedRequests(list.filter(r => r.selfDelivery?.approvalStatus === 'rejected'))
      
    } catch (err) {
      debugError("Error fetching delivery requests:", err)
      setError(err.message || "Failed to fetch delivery requests")
    } finally {
      setLoading(false)
    }
  }

  const currentRequests = activeTab === "pending" ? pendingRequests : rejectedRequests

  const filteredRequests = useMemo(() => {
    let filtered = currentRequests

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(request =>
        request.restaurantName?.toLowerCase().includes(query) ||
        request.ownerName?.toLowerCase().includes(query) ||
        request.ownerPhone?.includes(query)
      )
    }

    if (sortConfig.key) {
      filtered = [...filtered].sort((a, b) => {
        let aValue = a[sortConfig.key] || ""
        let bValue = b[sortConfig.key] || ""
        if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1
        if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1
        return 0
      })
    }

    return filtered
  }, [currentRequests, searchQuery, sortConfig])

  const handleSort = (key) => {
    let direction = "asc"
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc"
    }
    setSortConfig({ key, direction })
  }

  const handleApprove = async (request) => {
    if (window.confirm(`Are you sure you want to approve delivery for "${request.restaurantName}"?`)) {
      try {
        setProcessing(true)
        await adminAPI.approveDeliveryConfig(request._id)
        await fetchRequests()
        alert(`Successfully approved ${request.restaurantName}'s delivery request!`)
      } catch (err) {
        debugError("Error approving request:", err)
        alert(err.response?.data?.message || "Failed to approve request. Please try again.")
      } finally {
        setProcessing(false)
      }
    }
  }

  const handleReject = (request) => {
    setSelectedRequest(request)
    setRejectionReason("")
    setShowRejectDialog(true)
  }

  const confirmReject = async () => {
    if (!selectedRequest || !rejectionReason.trim()) {
      alert("Please provide a rejection reason")
      return
    }

    try {
      setProcessing(true)
      await adminAPI.rejectDeliveryConfig(selectedRequest._id, rejectionReason)
      await fetchRequests()
      setShowRejectDialog(false)
      setSelectedRequest(null)
      alert(`Successfully rejected ${selectedRequest.restaurantName}'s delivery request!`)
    } catch (err) {
      debugError("Error rejecting request:", err)
      alert(err.response?.data?.message || "Failed to reject request. Please try again.")
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-orange-600 flex items-center justify-center">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Delivery Approval Requests</h1>
          </div>

          <div className="flex items-center gap-2 border-b border-slate-200 mb-6">
            <button
              onClick={() => setActiveTab("pending")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "pending"
                  ? "border-orange-600 text-orange-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              Pending Approval
            </button>
            <button
              onClick={() => setActiveTab("rejected")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "rejected"
                  ? "border-orange-600 text-orange-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              Rejected Requests
            </button>
          </div>

          <div className="mb-4">
            <div className="relative max-w-md">
              <input
                type="text"
                placeholder="Search by restaurant name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-orange-500 outline-none"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Restaurant</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Owner Info</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Delivery Details</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-slate-700 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-20 text-center">
                      <Loader2 className="w-8 h-8 animate-spin text-orange-600 mx-auto mb-3" />
                      <p className="text-slate-600 font-medium">Loading requests...</p>
                    </td>
                  </tr>
                ) : filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-20 text-center text-slate-500">
                      No delivery requests found
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map((request) => {
                    const statusMeta = getDeliveryStatusMeta(request)
                    return (
                      <tr key={request._id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <span className="text-sm font-bold text-slate-900">{request.restaurantName}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-slate-900">{request.ownerName}</span>
                            <span className="text-xs text-slate-500">{request.ownerPhone}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-xs text-slate-600 space-y-1">
                            <p><span className="font-semibold text-slate-800">Radius:</span> {request.selfDelivery?.radius} km</p>
                            <p><span className="font-semibold text-slate-800">Fee:</span> ₹{request.selfDelivery?.fee}</p>
                            <p><span className="font-semibold text-slate-800">Min Order:</span> ₹{request.selfDelivery?.minOrderAmount}</p>
                            <p><span className="font-semibold text-slate-800">Timings:</span> {request.selfDelivery?.timings?.start} - {request.selfDelivery?.timings?.end}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${statusMeta.className}`}>
                            {statusMeta.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {activeTab === "pending" && (
                              <>
                                <button
                                  onClick={() => handleApprove(request)}
                                  disabled={processing}
                                  className="p-2 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-all"
                                  title="Approve"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleReject(request)}
                                  disabled={processing}
                                  className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-all"
                                  title="Reject"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => {
                                setSelectedRequest(request)
                                setShowDetailsModal(true)
                              }}
                              className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all"
                              title="View Details"
                            >
                              <Info className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Reject Dialog */}
      {showRejectDialog && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <X className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Reject Delivery Request</h3>
                <p className="text-sm text-slate-500">Provide a reason for rejection</p>
              </div>
            </div>

            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter reason for rejection..."
              className="w-full h-32 p-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-red-500 outline-none resize-none text-sm mb-6"
            />

            <div className="flex gap-3">
              <button
                onClick={() => setShowRejectDialog(false)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmReject}
                disabled={processing || !rejectionReason.trim()}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold transition-all disabled:opacity-50"
              >
                {processing ? "Rejecting..." : "Reject Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {showDetailsModal && selectedRequest && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Truck className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">{selectedRequest.restaurantName}</h3>
              </div>
              <button onClick={() => setShowDetailsModal(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-8">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Owner Details</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Phone className="w-4 h-4" />
                      {selectedRequest.ownerPhone}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Mail className="w-4 h-4" />
                      {selectedRequest.ownerEmail || "N/A"}
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Delivery Configuration</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Radius</span>
                      <span className="font-bold text-slate-900">{selectedRequest.selfDelivery?.radius} km</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Delivery Fee</span>
                      <span className="font-bold text-slate-900">₹{selectedRequest.selfDelivery?.fee}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Min Order Amount</span>
                      <span className="font-bold text-slate-900">₹{selectedRequest.selfDelivery?.minOrderAmount}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Operational Timings</h4>
                <div className="bg-slate-50 rounded-xl p-4 flex items-center justify-around">
                  <div className="text-center">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Starts At</span>
                    <span className="text-lg font-bold text-slate-900">{selectedRequest.selfDelivery?.timings?.start}</span>
                  </div>
                  <div className="h-8 w-px bg-slate-200"></div>
                  <div className="text-center">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Ends At</span>
                    <span className="text-lg font-bold text-slate-900">{selectedRequest.selfDelivery?.timings?.end}</span>
                  </div>
                </div>
              </div>

              {selectedRequest.selfDelivery?.approvalStatus === 'rejected' && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-red-600 uppercase tracking-wider mb-2">Rejection Reason</h4>
                  <p className="text-sm text-red-700">{selectedRequest.selfDelivery?.rejectionReason || "No reason provided"}</p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-100 flex gap-3">
              {activeTab === "pending" ? (
                <>
                  <button
                    onClick={() => {
                      handleApprove(selectedRequest)
                      setShowDetailsModal(false)
                    }}
                    disabled={processing}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50"
                  >
                    Approve Delivery
                  </button>
                  <button
                    onClick={() => {
                      setShowDetailsModal(false)
                      handleReject(selectedRequest)
                    }}
                    disabled={processing}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50"
                  >
                    Reject Delivery
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="flex-1 bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800 transition-all"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
