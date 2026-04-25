import { useState, useMemo, useEffect } from "react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@food/components/ui/dialog"
import { Button } from "@food/components/ui/button"
import OrdersTopbar from "@food/components/admin/orders/OrdersTopbar"
import OrdersTable from "@food/components/admin/orders/OrdersTable"
import FilterPanel from "@food/components/admin/orders/FilterPanel"
import ViewOrderDialog from "@food/components/admin/orders/ViewOrderDialog"
import SettingsDialog from "@food/components/admin/orders/SettingsDialog"
import { useGenericTableManagement } from "@food/components/admin/orders/useGenericTableManagement"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const toNumber = (value, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

const normalizeRefundOrder = (order = {}) => {
  const pricing = order.pricing || {}
  const createdAt = order.createdAt ? new Date(order.createdAt) : null
  const hasValidDate = createdAt && !Number.isNaN(createdAt.getTime())

  return {
    ...order,
    id: order.id || order._id || order.orderId || "",
    orderId: order.orderId || order.id || order._id || "N/A",
    date: order.date || (hasValidDate ? createdAt.toLocaleDateString() : "-"),
    time: order.time || (hasValidDate ? createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"),
    customerName: order.customerName || order.userId?.name || "N/A",
    customerPhone: order.customerPhone || order.userId?.phone || "N/A",
    restaurant: order.restaurant || order.restaurantName || order.restaurantId?.restaurantName || "N/A",
    totalAmount: toNumber(order.totalAmount ?? pricing.total, 0),
    paymentStatus: order.paymentStatus || order.payment?.status || "Pending",
    userRefundPreference: order.payment?.refund?.userPreference || "",
    refundMode: order.payment?.refund?.refundMode || "",
    isOverridden: order.payment?.refund?.isOverridden || false,
    refundStatus: order.refundStatus || order.payment?.refund?.status || "pending",
    cancellationReason: order.cancellationReason || "",
  }
}

const normalizeRefundOrders = (orders = []) => {
  if (!Array.isArray(orders)) return []
  return orders.map(normalizeRefundOrder)
}

const formatCurrency = (amount) => {
  const safeAmount = toNumber(amount, 0)
  return safeAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const getPreferenceLabel = (value) => {
  if (value === "wallet") return "Wallet"
  if (value === "original") return "Bank Account"
  return "Not Selected"
}

const getRefundModeLabel = (value) => {
  if (value === "wallet") return "Wallet"
  if (value === "razorpay") return "Bank Account"
  return "-"
}

export default function NewRefundRequests() {
  const [orders, setOrders] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [processingRefund, setProcessingRefund] = useState(null)
  const [refundDialogOrder, setRefundDialogOrder] = useState(null)
  const [selectedRefundMode, setSelectedRefundMode] = useState("wallet")
  const [overrideReason, setOverrideReason] = useState("")
  const [visibleColumns, setVisibleColumns] = useState({
    si: true,
    orderId: true,
    orderDate: true,
    customer: true,
    restaurant: true,
    totalAmount: true,
    orderStatus: true,
    actions: true,
  })

  // Fetch refund requests from backend
  useEffect(() => {
    const fetchRefundRequests = async () => {
      try {
        setIsLoading(true)
        const params = {
          page: 1,
          limit: 1000,
        }
        
        const response = await adminAPI.getRefundRequests(params)
        
        if (response.data?.success && response.data?.data?.orders) {
          const normalizedOrders = normalizeRefundOrders(response.data.data.orders)
          setOrders(normalizedOrders)
          setTotalCount(response.data.data.pagination?.total || normalizedOrders.length)
        } else {
          debugError("Failed to fetch refund requests:", response.data)
          toast.error("Failed to fetch refund requests")
          setOrders([])
        }
      } catch (error) {
        debugError("Error fetching refund requests:", error)
        debugError("Error details:", {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status,
          statusText: error.response?.statusText
        })
        const status = error?.response?.status
        if (status === 401) {
          toast.error("Unauthorized: admin session expired or missing. Please login again.")
        } else {
          toast.error(error.response?.data?.message || error.message || "Failed to fetch refund requests")
        }
        setOrders([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchRefundRequests()
  }, [])

  const {
    searchQuery,
    setSearchQuery,
    isFilterOpen,
    setIsFilterOpen,
    isSettingsOpen,
    setIsSettingsOpen,
    isViewOrderOpen,
    setIsViewOrderOpen,
    selectedOrder,
    filters,
    setFilters,
    filteredData,
    count,
    activeFiltersCount,
    handleApplyFilters,
    handleResetFilters,
    handleExport,
    handleViewOrder,
    handlePrintOrder,
    toggleColumn,
  } = useGenericTableManagement(
    orders,
    "New Refund Requests",
    ["orderId", "customerName", "restaurant", "customerPhone"]
  )

  const restaurants = useMemo(() => {
    return [...new Set(orders.map(o => o.restaurant))]
  }, [orders])

  const isOverrideSelection = useMemo(() => {
    const userPref = String(refundDialogOrder?.userRefundPreference || "").toLowerCase()
    if (!userPref) return false
    if (userPref === "wallet" && selectedRefundMode === "razorpay") return true
    if (userPref === "original" && selectedRefundMode === "wallet") return true
    return false
  }, [refundDialogOrder, selectedRefundMode])

  const openProcessRefundDialog = (order) => {
    const userPref = String(order?.userRefundPreference || "").toLowerCase()
    const defaultMode = userPref === "original" ? "razorpay" : "wallet"
    setRefundDialogOrder(order)
    setSelectedRefundMode(defaultMode)
    setOverrideReason("")
  }

  const handleProcessRefund = async () => {
    const order = refundDialogOrder
    if (!order) return

    try {
      const orderIdToUse = order.id || order._id || order.orderId
      if (!orderIdToUse) {
        toast.error("Order ID not found")
        return
      }

      setProcessingRefund(orderIdToUse)
      const response = await adminAPI.processRefund(orderIdToUse, {
        refundMode: selectedRefundMode,
        overrideReason: overrideReason.trim(),
      })

      if (response.data?.success) {
        toast.success(`Refund processed successfully for order ${order.orderId}`)
        setRefundDialogOrder(null)
        const params = { page: 1, limit: 1000 }
        const refreshResponse = await adminAPI.getRefundRequests(params)
        if (refreshResponse.data?.success && refreshResponse.data?.data?.orders) {
          const normalizedOrders = normalizeRefundOrders(refreshResponse.data.data.orders)
          setOrders(normalizedOrders)
          setTotalCount(refreshResponse.data.data.pagination?.total || normalizedOrders.length)
        }
      } else {
        toast.error(response.data?.message || "Failed to process refund")
      }
    } catch (error) {
      debugError("Error processing refund:", error)
      const status = error?.response?.status
      if (status === 401) {
        toast.error("Unauthorized: admin session expired or missing. Please login again.")
      } else {
        toast.error(error.response?.data?.message || "Failed to process refund")
      }
    } finally {
      setProcessingRefund(null)
    }
  }

  const resetColumns = () => {
    setVisibleColumns({
      si: true,
      orderId: true,
      orderDate: true,
      customer: true,
      restaurant: true,
      totalAmount: true,
      orderStatus: true,
      actions: true,
    })
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <OrdersTopbar 
        title="Requested Orders" 
        count={count} 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onFilterClick={() => setIsFilterOpen(true)}
        activeFiltersCount={activeFiltersCount}
        onExport={handleExport}
        onSettingsClick={() => setIsSettingsOpen(true)}
      />
      <FilterPanel
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        filters={filters}
        setFilters={setFilters}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
        restaurants={restaurants}
      />
      <SettingsDialog
        isOpen={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        visibleColumns={visibleColumns}
        toggleColumn={toggleColumn}
        resetColumns={resetColumns}
      />
      <ViewOrderDialog
        isOpen={isViewOrderOpen}
        onOpenChange={setIsViewOrderOpen}
        order={selectedOrder}
      />
      {isLoading ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-20">
          <div className="flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500 mb-4" />
            <p className="text-sm text-slate-600">Loading refund requests...</p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">SI</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Order ID</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Order Date</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Customer</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Restaurant</th>
                  <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-700 uppercase">Total Amount</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">User Preference</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Cancellation Reason</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Refund Status</th>
                  <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-20 text-center">
                      <p className="text-sm text-slate-500">No refund requests found</p>
                    </td>
                  </tr>
                ) : (
                  filteredData.map((order, index) => (
                    <tr key={order.id || order.orderId || index} className="hover:bg-slate-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-slate-700">{index + 1}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-slate-900">{order.orderId}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-slate-700">{order.date}, {order.time}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-slate-700">{order.customerName}</span>
                          <span className="text-xs text-slate-500 mt-0.5">{order.customerPhone}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-slate-700">{order.restaurant}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm font-medium text-slate-900">
                          {"\u20B9"}{formatCurrency(order.totalAmount)}
                        </div>
                        <div className="text-xs text-emerald-600 mt-0.5">{order.paymentStatus}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                          order.userRefundPreference === "wallet"
                            ? "bg-emerald-100 text-emerald-700"
                            : order.userRefundPreference === "original"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-slate-100 text-slate-700"
                        }`}>
                          {getPreferenceLabel(order.userRefundPreference)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-red-600 max-w-xs">
                          {order.cancellationReason || "Rejected by restaurant"}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                            order.refundStatus === 'processed'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            {order.refundStatus === 'processed' ? 'Processed' : 'Pending'}
                          </span>
                          {order.refundStatus === "processed" && order.refundMode ? (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                              {getRefundModeLabel(order.refundMode)}
                            </span>
                          ) : null}
                          {order.refundStatus === "processed" && order.isOverridden ? (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                              Overridden
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => handleViewOrder(order)}
                            className="p-1.5 rounded text-orange-600 hover:bg-orange-50 transition-colors"
                            title="View Details"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                          {order.refundStatus !== 'processed' && (
                            <button 
                              onClick={() => openProcessRefundDialog(order)}
                              disabled={processingRefund === (order.id || order._id || order.orderId)}
                              className="p-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                              title="Process Refund"
                            >
                              {processingRefund === (order.id || order._id || order.orderId) ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <span className="text-sm">?</span>
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={Boolean(refundDialogOrder)} onOpenChange={(open) => { if (!open) setRefundDialogOrder(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Process Refund {refundDialogOrder?.orderId ? `- ${refundDialogOrder.orderId}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm text-slate-600">
              Amount: <span className="font-semibold text-slate-900">₹{formatCurrency(refundDialogOrder?.totalAmount || 0)}</span>
            </div>
            <div className="text-sm text-slate-600">
              User Preference: <span className="font-semibold text-slate-900">{getPreferenceLabel(refundDialogOrder?.userRefundPreference)}</span>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-slate-900">Refund To</div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="refundMode"
                  value="wallet"
                  checked={selectedRefundMode === "wallet"}
                  onChange={() => setSelectedRefundMode("wallet")}
                />
                Wallet
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="refundMode"
                  value="razorpay"
                  checked={selectedRefundMode === "razorpay"}
                  onChange={() => setSelectedRefundMode("razorpay")}
                />
                Bank Account
              </label>
            </div>

            {isOverrideSelection ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs text-amber-800">
                  User selected {getPreferenceLabel(refundDialogOrder?.userRefundPreference)}. You are overriding to {getRefundModeLabel(selectedRefundMode)}.
                </p>
                <input
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Override reason (optional)"
                  className="mt-2 w-full rounded border border-amber-200 bg-white px-3 py-2 text-sm outline-none"
                />
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setRefundDialogOrder(null)} disabled={Boolean(processingRefund)}>
                Cancel
              </Button>
              <Button onClick={handleProcessRefund} disabled={Boolean(processingRefund)}>
                {processingRefund ? <Loader2 className="w-4 h-4 animate-spin" /> : "Process Refund"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

