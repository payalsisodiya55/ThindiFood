import { useEffect, useMemo, useState } from "react"
import { Loader2, History, TrendingUp, Wallet, Banknote, AlertCircle } from "lucide-react"
import { adminAPI } from "@food/api"
import { Card } from "@food/components/ui/card"

const formatCurrency = (value) =>
  `\u20B9 ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const getStatusBadgeClasses = (status) => {
  const normalized = String(status || "").toLowerCase()
  if (["captured", "settled", "completed", "paid", "delivered"].includes(normalized)) {
    return "bg-green-100 text-green-700"
  }
  if (["pending", "created", "authorized", "cod_pending"].includes(normalized)) {
    return "bg-yellow-100 text-yellow-700"
  }
  if (["failed", "refunded", "cancelled", "cancelled_by_admin", "cancelled_by_user", "cancelled_by_restaurant"].includes(normalized)) {
    return "bg-red-100 text-red-700"
  }
  return "bg-slate-100 text-slate-700"
}

export default function DiningTransactionReport() {
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await adminAPI.getDiningTransactions({})
        setRows(res?.data?.data?.transactions || [])
        setSummary(res?.data?.data?.summary || null)
      } catch (error) {
        console.error("Error loading dining transactions:", error)
        setRows([])
        setSummary(null)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const normalizedSummary = useMemo(
    () => ({
      completedTransaction: Number(summary?.completedTransaction ?? 0),
      refundedTransaction: Number(summary?.refundedTransaction ?? 0),
      adminEarning: Number(summary?.adminEarning ?? summary?.adminEarnings ?? 0),
      restaurantEarning: Number(summary?.restaurantEarning ?? summary?.restaurantEarnings ?? 0),
      deliverymanEarning: Number(summary?.deliverymanEarning ?? 0),
      adminCouponDiscount: Number(summary?.adminCouponDiscount ?? 0),
      restaurantCouponDiscount: Number(summary?.restaurantCouponDiscount ?? 0),
      restaurantOfferDiscount: Number(summary?.restaurantOfferDiscount ?? 0),
      codDues: Number(summary?.codDues ?? 0),
      totalTransactions: Number(summary?.totalTransactions ?? 0),
    }),
    [summary]
  )

  const normalizedRows = useMemo(
    () =>
      (Array.isArray(rows) ? rows : []).map((row) => ({
        ...row,
        customerName: row?.customerName || row?.user || "Guest",
        totalItemAmount: Number(row?.totalItemAmount ?? row?.subtotal ?? 0),
        couponByAdmin: Number(row?.couponByAdmin ?? row?.platformCouponDiscount ?? 0),
        couponByRestaurant: Number(row?.couponByRestaurant ?? row?.restaurantCouponDiscount ?? 0),
        offerByRestaurant: Number(row?.offerByRestaurant ?? row?.restaurantOfferDiscount ?? 0),
        vatTax: Number(row?.vatTax ?? row?.gst ?? 0),
        platformFee: Number(row?.platformFee ?? 0),
        orderAmount: Number(row?.orderAmount ?? row?.amount ?? row?.finalAmount ?? 0),
      })),
    [rows]
  )

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 bg-slate-900 rounded-lg">
              <History className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dining Transaction Report</h1>
          </div>
          <p className="text-slate-500 text-sm">Takeaway parity view for dining settlements and admin earnings.</p>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <Card className="p-4 bg-white shadow-sm border-slate-200">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Volume</p>
                <p className="text-2xl font-black text-slate-900 mt-1">{normalizedSummary.totalTransactions}</p>
              </div>
              <div className="p-2 bg-blue-50 rounded-lg">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-white shadow-sm border-slate-200">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Admin Earnings</p>
                <p className="text-2xl font-black text-indigo-600 mt-1">{formatCurrency(normalizedSummary.adminEarning)}</p>
              </div>
              <div className="p-2 bg-indigo-50 rounded-lg">
                <Banknote className="w-5 h-5 text-indigo-600" />
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-white shadow-sm border-slate-200">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Restaurant Payout</p>
                <p className="text-2xl font-black text-emerald-600 mt-1">{formatCurrency(normalizedSummary.restaurantEarning)}</p>
              </div>
              <div className="p-2 bg-emerald-50 rounded-lg">
                <Wallet className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-white shadow-sm border-slate-200 border-b-4 border-b-amber-500">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pending COD</p>
                <p className="text-2xl font-black text-amber-600 mt-1">{formatCurrency(normalizedSummary.codDues)}</p>
              </div>
              <div className="p-2 bg-amber-50 rounded-lg">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </Card>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card className="p-3 bg-white border-slate-200">
            <p className="text-[11px] font-semibold text-slate-500">Coupon By Admin</p>
            <p className="mt-1 text-sm font-bold text-blue-600">{formatCurrency(normalizedSummary.adminCouponDiscount)}</p>
          </Card>
          <Card className="p-3 bg-white border-slate-200">
            <p className="text-[11px] font-semibold text-slate-500">Coupon By Restaurant</p>
            <p className="mt-1 text-sm font-bold text-amber-600">{formatCurrency(normalizedSummary.restaurantCouponDiscount)}</p>
          </Card>
          <Card className="p-3 bg-white border-slate-200">
            <p className="text-[11px] font-semibold text-slate-500">Offer By Restaurant</p>
            <p className="mt-1 text-sm font-bold text-emerald-600">{formatCurrency(normalizedSummary.restaurantOfferDiscount)}</p>
          </Card>
        </div>
      )}

      <Card className="bg-white shadow-sm border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin mb-3 text-slate-900" />
              <p className="text-sm font-medium">Fetching transaction logs...</p>
            </div>
          ) : (
            <table className="w-full min-w-[1350px] text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">SI</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Order ID</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Restaurant</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Customer Name</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Item Amount</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Coupon By Admin</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Coupon By Restaurant</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Offer By Restaurant</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">VAT / Tax</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Platform Fee</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Order Amount</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {normalizedRows.length ? (
                  normalizedRows.map((row, index) => (
                    <tr key={row.id || row.orderId || index} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">{index + 1}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{row.orderId}</td>
                      <td className="px-4 py-3 text-slate-700">{row.restaurant || "-"}</td>
                      <td className="px-4 py-3 text-slate-700">{row.customerName || "Guest"}</td>
                      <td className="px-4 py-3">{formatCurrency(row.totalItemAmount)}</td>
                      <td className="px-4 py-3">{formatCurrency(row.couponByAdmin)}</td>
                      <td className="px-4 py-3">{formatCurrency(row.couponByRestaurant)}</td>
                      <td className="px-4 py-3">{formatCurrency(row.offerByRestaurant)}</td>
                      <td className="px-4 py-3">{formatCurrency(row.vatTax)}</td>
                      <td className="px-4 py-3">{formatCurrency(row.platformFee)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{formatCurrency(row.orderAmount)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${getStatusBadgeClasses(row.status || row.orderStatus)}`}>
                          {row.status || row.orderStatus || "N/A"}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-6 py-20 text-center" colSpan={12}>
                      <div className="flex flex-col items-center justify-center">
                        <p className="text-lg font-semibold text-slate-700 mb-1">No Transactions Found</p>
                        <p className="text-sm text-slate-500">No dining transactions match the selected filters.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  )
}
