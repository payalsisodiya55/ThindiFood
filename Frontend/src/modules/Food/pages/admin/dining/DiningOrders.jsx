import { useEffect, useMemo, useState } from "react"
import { adminAPI } from "@food/api"
import { 
  Loader2, 
  Search, 
  Filter, 
  Calendar, 
  Utensils, 
  CreditCard, 
  Eye,
  Package,
  Phone,
  LayoutDashboard,
  Clock,
  User,
  Hash,
  Store,
  AlertCircle,
  Trash2
} from "lucide-react"
import { Card } from "@food/components/ui/card"
import { Badge } from "@food/components/ui/badge"
import { Input } from "@food/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@food/components/ui/dialog"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@food/components/ui/select"

const currency = (value) => `\u20B9 ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function DiningOrders() {
  const [rows, setRows] = useState([])
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [deletingId, setDeletingId] = useState("")
  const [filters, setFilters] = useState({
    fromDate: "",
    toDate: "",
    restaurantId: "all",
    paymentType: "all",
    orderType: "all",
    search: "",
  })

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const queryFilters = {
          ...filters,
          restaurantId: filters.restaurantId === "all" ? "" : filters.restaurantId,
          paymentType: filters.paymentType === "all" ? "" : filters.paymentType,
          orderType: filters.orderType === "all" ? "" : filters.orderType,
        }
        const [ordersRes, restaurantsRes] = await Promise.all([
          adminAPI.getDiningOrders(queryFilters),
          adminAPI.getDiningRestaurants(),
        ])
        setRows(ordersRes?.data?.data?.orders || [])
        setRestaurants(restaurantsRes?.data?.data?.restaurants || [])
      } catch (err) {
        console.error("Error loading dining orders:", err)
        setRows([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [filters])

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.orders += 1
        acc.amount += Number(row?.amount || 0)
        return acc
      },
      { orders: 0, amount: 0 }
    )
  }, [rows])

  const getStatusColor = (status) => {
    const s = String(status || "").toLowerCase()
    if (s.includes("complete") || s.includes("paid")) return "bg-emerald-100 text-emerald-700 border-emerald-200"
    if (s.includes("serve")) return "bg-teal-100 text-teal-700 border-teal-200"
    if (s.includes("prepare") || s.includes("active")) return "bg-blue-100 text-blue-700 border-blue-200"
    if (s.includes("cancel")) return "bg-rose-100 text-rose-700 border-rose-200"
    return "bg-slate-100 text-slate-700 border-slate-200"
  }

  const getPaymentBadge = (paymentType) => {
    const normalized = String(paymentType || "").toLowerCase()
    if (normalized === "online") return { label: "ONLINE", className: "bg-emerald-50 border-emerald-200 text-emerald-700" }
    if (normalized === "cod") return { label: "COD", className: "bg-amber-50 border-amber-200 text-amber-700" }
    return { label: "PENDING", className: "bg-slate-50 border-slate-200 text-slate-600" }
  }

  const getPaymentLabel = (paymentType) => {
    const normalized = String(paymentType || "").toLowerCase()
    if (normalized === "cod") return "Cash / Counter"
    if (normalized === "online") return "Online"
    return "Pending"
  }

  const getPaymentStatusLabel = (paymentType) => {
    const normalized = String(paymentType || "").toLowerCase()
    return normalized === "pending" ? "Pending" : "Paid"
  }

  const openOrderDetails = (row) => {
    setSelectedOrder(row)
    setIsDetailsOpen(true)
  }

  const handleDeleteOrder = async (row) => {
    const targetId = String(row?.id || "")
    if (!targetId) return

    const confirmed = window.confirm(
      `Delete ${row?.orderId || "this dining order"}?\n\nThis will permanently remove related session/order records from database.`
    )
    if (!confirmed) return

    setDeletingId(targetId)
    try {
      await adminAPI.deleteDiningOrder(targetId)
      setRows((prev) => prev.filter((entry) => String(entry?.id || "") !== targetId))
      if (String(selectedOrder?.id || "") === targetId) {
        setSelectedOrder(null)
        setIsDetailsOpen(false)
      }
    } catch (err) {
      console.error("Error deleting dining order:", err)
      const message = err?.response?.data?.message || "Failed to delete dining order"
      window.alert(message)
    } finally {
      setDeletingId("")
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Utensils className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dining Orders</h1>
          </div>
          <p className="text-slate-500 text-sm">Manage and track all walk-in and pre-booked dining experiences.</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="p-4 bg-white shadow-sm border-slate-200 flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-full">
            <LayoutDashboard className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Orders</p>
            <p className="text-2xl font-bold text-slate-900">{totals.orders}</p>
          </div>
        </Card>

        <Card className="p-4 bg-white shadow-sm border-slate-200 flex items-center gap-4">
          <div className="p-3 bg-emerald-50 rounded-full">
            <CreditCard className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Revenue</p>
            <p className="text-2xl font-bold text-slate-900">{currency(totals.amount)}</p>
          </div>
        </Card>

        <Card className="p-4 bg-white shadow-sm border-slate-200 flex items-center gap-4">
          <div className="p-3 bg-amber-50 rounded-full">
            <Clock className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Active Today</p>
            <p className="text-2xl font-bold text-slate-900">
              {rows.filter(r => {
                const status = String(r?.status || "").toLowerCase()
                return status === "active" || status === "preparing"
              }).length}
            </p>
          </div>
        </Card>

        <Card className="p-4 bg-white shadow-sm border-slate-200 flex items-center gap-4">
          <div className="p-3 bg-purple-50 rounded-full">
            <Store className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Top Restaurant</p>
            <p className="text-sm font-bold text-slate-900 truncate max-w-[120px]">
              {rows.length > 0 ? [...new Set(rows.map(r => r.restaurant))][0] : "N/A"}
            </p>
          </div>
        </Card>
      </div>

      {/* Filters Section */}
      <Card className="p-4 mb-6 bg-white shadow-sm border-slate-200">
        <div className="flex items-center gap-2 mb-4 text-slate-700">
          <Filter className="w-4 h-4" />
          <h2 className="font-semibold text-sm">Filter Results</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">From Date</label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <Input 
                className="pl-8 text-xs h-9" 
                type="date" 
                value={filters.fromDate} 
                onChange={(e) => setFilters((p) => ({ ...p, fromDate: e.target.value }))} 
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">To Date</label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <Input 
                className="pl-8 text-xs h-9" 
                type="date" 
                value={filters.toDate} 
                onChange={(e) => setFilters((p) => ({ ...p, toDate: e.target.value }))} 
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Restaurant</label>
            <Select value={filters.restaurantId} onValueChange={(v) => setFilters(p => ({ ...p, restaurantId: v }))}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All Restaurants" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Restaurants</SelectItem>
                {restaurants.map((restaurant) => (
                  <SelectItem key={restaurant._id} value={restaurant._id}>{restaurant.name || restaurant.restaurantName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Payment</label>
            <Select value={filters.paymentType} onValueChange={(v) => setFilters(p => ({ ...p, paymentType: v }))}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All Payments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Payments</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="cod">COD</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Order Type</label>
            <Select value={filters.orderType} onValueChange={(v) => setFilters(p => ({ ...p, orderType: v }))}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="walk-in">Walk-in</SelectItem>
                <SelectItem value="pre-book">Pre-book</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <Input 
                className="pl-8 text-xs h-9" 
                placeholder="ID, User..." 
                value={filters.search} 
                onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))} 
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Table Section */}
      <Card className="bg-white shadow-sm border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin mb-3 text-blue-600" />
              <p className="text-sm font-medium">Fetching dining orders...</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Order Details</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Restaurant & Table</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Payment & Type</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length > 0 ? (
                  rows.map((row) => {
                    const paymentBadge = getPaymentBadge(row.paymentType)
                    const items = Array.isArray(row.items) ? row.items : []
                    const visibleItems = items.slice(0, 2)
                    const remainingItems = Math.max(items.length - visibleItems.length, 0)
                    return (
                    <tr key={row.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => openOrderDetails(row)}
                            className="font-bold text-slate-900 text-left hover:text-blue-600 transition-colors"
                          >
                            #{row.orderId}
                          </button>
                          <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Hash className="w-2.5 h-2.5" />
                            Session: {row.sessionId?.slice(-8).toUpperCase()}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-700">{row.restaurant}</span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="bg-blue-50 text-blue-600 text-[10px] font-bold px-1.5 py-0.5 rounded border border-blue-100">
                              Table {row.tableNo || "N/A"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                            <User className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-slate-700 font-medium">{row.user?.name || "Guest User"}</span>
                            {row.user?.phone && <span className="text-[10px] text-slate-400">{row.user.phone}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900">{currency(row.amount)}</span>
                          <span className="text-[10px] text-slate-400">{row.itemCount || 0} Items</span>
                          {visibleItems.length > 0 && (
                            <div className="mt-1.5 flex flex-col gap-0.5">
                              {visibleItems.map((item, idx) => (
                                <span key={`${item.name}-${idx}`} className="text-[10px] text-slate-500">
                                  {Number(item?.quantity || 0)}x {item?.name || "Item"}
                                </span>
                              ))}
                              {remainingItems > 0 && (
                                <span className="text-[10px] text-slate-400">+{remainingItems} more</span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className={`w-fit text-[9px] font-bold py-0 h-4 ${paymentBadge.className}`}>
                            {paymentBadge.label}
                          </Badge>
                          <span className={`text-[10px] font-medium ${row.orderType === 'pre-book' ? 'text-purple-600' : 'text-blue-600'}`}>
                            {row.orderType?.charAt(0).toUpperCase() + row.orderType?.slice(1)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`text-[10px] font-bold px-2 ${getStatusColor(row.status)}`}>
                          {row.status?.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col text-[11px] text-slate-500">
                          <span>{row.date ? new Date(row.date).toLocaleDateString() : "-"}</span>
                          <span>{row.date ? new Date(row.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => openOrderDetails(row)}
                            className="w-8 h-8 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-blue-600 flex items-center justify-center transition-colors"
                            title="View Order Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteOrder(row)}
                            disabled={deletingId === String(row?.id || "")}
                            className="w-8 h-8 rounded-md border border-rose-200 hover:bg-rose-50 text-rose-600 hover:text-rose-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                            title="Delete Dining Order"
                          >
                            {deletingId === String(row?.id || "") ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )})
                ) : (
                  <tr>
                    <td className="px-4 py-20 text-center" colSpan={8}>
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                          <AlertCircle className="w-8 h-8 text-slate-300" />
                        </div>
                        <p className="text-lg font-bold text-slate-400">No Orders Found</p>
                        <p className="text-sm text-slate-400">Try adjusting your filters or search query.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] bg-white p-0 overflow-y-auto">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-200 sticky top-0 bg-white z-10">
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Eye className="w-5 h-5 text-blue-600" />
              Dining Order Details
            </DialogTitle>
            <DialogDescription>
              View complete information about this dining session order.
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="px-6 py-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Order ID</p>
                    <p className="text-sm font-semibold text-slate-900">{selectedOrder.orderId}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Session ID</p>
                    <p className="text-sm font-medium text-slate-900">{selectedOrder.sessionId || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Order Date</p>
                    <p className="text-sm font-medium text-slate-900">
                      {selectedOrder.date
                        ? `${new Date(selectedOrder.date).toLocaleDateString()}, ${new Date(selectedOrder.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                        : "-"}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Order Status</p>
                    <Badge className={`text-[10px] font-bold px-2 mt-1 ${getStatusColor(selectedOrder.status)}`}>
                      {String(selectedOrder.status || "").toUpperCase()}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                      <CreditCard className="w-4 h-4" />
                      Payment Type
                    </p>
                    <p className="text-sm font-medium text-slate-900">{getPaymentLabel(selectedOrder.paymentType)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Payment Status</p>
                    <p className={`text-sm font-semibold ${getPaymentStatusLabel(selectedOrder.paymentType) === "Paid" ? "text-emerald-600" : "text-amber-600"}`}>
                      {getPaymentStatusLabel(selectedOrder.paymentType)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Customer Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer Name</p>
                    <p className="text-sm font-medium text-slate-900">{selectedOrder.user?.name || "Guest"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      Phone
                    </p>
                    <p className="text-sm font-medium text-slate-900">{selectedOrder.user?.phone || "-"}</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                  <Store className="w-4 h-4" />
                  Restaurant Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Restaurant</p>
                    <p className="text-sm font-medium text-slate-900">{selectedOrder.restaurant || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Table</p>
                    <p className="text-sm font-medium text-slate-900">Table {selectedOrder.tableNo || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Order Type</p>
                    <p className="text-sm font-medium text-slate-900">
                      {selectedOrder.orderType === "pre-book" ? "Pre-book" : "Walk-in"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Order Items ({Array.isArray(selectedOrder.items) ? selectedOrder.items.length : 0})
                </h3>
                <div className="space-y-3">
                  {(Array.isArray(selectedOrder.items) ? selectedOrder.items : []).map((item, idx) => (
                    <div key={`${item?.name || "item"}-${idx}`} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-700 bg-white px-2 py-1 rounded">
                          {Number(item?.quantity || 0)}x
                        </span>
                        <p className="text-sm font-medium text-slate-900">{item?.name || "Item"}</p>
                      </div>
                      <p className="text-sm font-semibold text-slate-900">
                        {currency(Number(item?.price || 0) * Number(item?.quantity || 0))}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">Total Amount</p>
                  <p className="text-lg font-bold text-slate-900">{currency(selectedOrder.amount)}</p>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-4">Pricing Breakdown</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <p className="text-slate-600">Subtotal</p>
                    <p className="font-medium text-slate-900">
                      {currency(selectedOrder?.pricingBreakdown?.subtotal ?? selectedOrder?.amount ?? 0)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <p className="text-slate-600">Offer Discount</p>
                    <p className="font-medium text-emerald-600">
                      - {currency(selectedOrder?.pricingBreakdown?.offerDiscount ?? 0)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <p className="text-slate-600">Platform Fee</p>
                    <p className="font-medium text-slate-900">
                      {currency(selectedOrder?.pricingBreakdown?.platformFee ?? 0)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <p className="text-slate-600">Tax (GST)</p>
                    <p className="font-medium text-slate-900">
                      {currency(selectedOrder?.pricingBreakdown?.taxAmount ?? 0)}
                    </p>
                  </div>
                  <div className="border-t border-slate-200 pt-2 flex items-center justify-between">
                    <p className="text-base font-semibold text-slate-800">Total Amount</p>
                    <p className="text-lg font-bold text-emerald-600">
                      {currency(selectedOrder?.pricingBreakdown?.totalAmount ?? selectedOrder?.amount ?? 0)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
