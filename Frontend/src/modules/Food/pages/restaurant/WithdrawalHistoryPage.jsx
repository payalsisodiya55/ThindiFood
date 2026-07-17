import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Wallet } from "lucide-react"
import BottomNavOrders from "@food/components/restaurant/BottomNavOrders"
import { restaurantAPI } from "@food/api"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


export default function WithdrawalHistoryPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('pending')
  const [withdrawalRequests, setWithdrawalRequests] = useState([])
  const [loadingWithdrawalRequests, setLoadingWithdrawalRequests] = useState(false)

  useEffect(() => {
    const fetchWithdrawalRequests = async () => {
      try {
        setLoadingWithdrawalRequests(true)
        const response = await restaurantAPI.getWithdrawalHistory()
        const history = response?.data?.data || []

        const mapped = history.map(h => ({
          id: h._id,
          amount: h.amount,
          status: (() => {
            const s = String(h.status || '').toLowerCase()
            if (s === 'approved' || s === 'processed') return 'Approved'
            if (s === 'rejected' || s === 'failed') return 'Rejected'
            return 'Pending'
          })(),
          requestedAt: h.createdAt,
          processedAt: h.processedAt,
          note: h.note || h.adminNote || ''
        }))

        setWithdrawalRequests(mapped)
      } catch (error) {
        if (error.response?.status !== 401) {
          debugError('Error fetching withdrawal requests:', error)
        }
      } finally {
        setLoadingWithdrawalRequests(false)
      }
    }

    fetchWithdrawalRequests()
  }, [])

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A'
    return new Date(dateStr).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const TABS = [
    { key: 'pending',    label: 'Pending' },
    { key: 'successful', label: 'Successful' },
    { key: 'failed',     label: 'Failed' },
  ]

  const filtered = withdrawalRequests.filter(req => {
    if (activeTab === 'pending')    return req.status === 'Pending'
    if (activeTab === 'successful') return req.status === 'Approved'
    if (activeTab === 'failed')     return req.status === 'Rejected'
    return true
  })

  const emptyMessages = {
    pending:    'No pending withdrawal requests',
    successful: 'No successful withdrawals',
    failed:     'No failed or rejected withdrawals',
  }

  const statusChip = (status) => {
    if (status === 'Approved') return (
      <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">Approved</span>
    )
    if (status === 'Rejected') return (
      <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold">Rejected</span>
    )
    return (
      <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-semibold">Pending</span>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="sticky bg-white top-0 z-40 px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/restaurant/hub-finance")}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            aria-label="Go back"
          >
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-900">Withdrawal History</h1>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white px-4 pt-4 pb-3 border-b border-gray-200">
        <div className="flex gap-2">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 px-3 py-2.5 rounded-full font-semibold text-sm transition-all duration-150 ${
                activeTab === tab.key
                  ? "bg-[#00c87e] text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {loadingWithdrawalRequests ? (
          <div className="py-8 text-center text-gray-500">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Wallet className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">{emptyMessages[activeTab]}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(request => (
              <div
                key={request.id}
                className="bg-white rounded-xl p-4 border border-gray-200 shadow-xs"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="text-lg font-bold text-gray-900 mb-1">
                      ₹{Number(request.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-gray-500">
                      Requested: {formatDate(request.requestedAt)}
                    </p>
                    {request.processedAt && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Processed: {formatDate(request.processedAt)}
                      </p>
                    )}
                    {request.note && (
                      <p className="text-xs text-red-600 mt-1 font-medium">
                        Note: {request.note}
                      </p>
                    )}
                  </div>
                  <div className="ml-3">{statusChip(request.status)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNavOrders />
    </div>
  )
}
