import { useEffect, useMemo, useState } from "react"
import { Loader2, FileText, ShoppingBag, Users, CreditCard, TrendingUp, IndianRupee, Calendar, AlertCircle } from "lucide-react"
import { adminAPI } from "@food/api"
import { Card } from "@food/components/ui/card"

const formatCurrency = (value) =>
  `\u20B9 ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

export default function DiningOrderReport() {
  const [kpis, setKpis] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await adminAPI.getDiningReports({})
        setKpis(res?.data?.data?.kpis || null)
        setRows(res?.data?.data?.rows || [])
      } catch (error) {
        console.error("Error loading dining order report:", error)
        setKpis(null)
        setRows([])
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const normalizedRows = useMemo(
    () =>
      (Array.isArray(rows) ? rows : []).map((row) => ({
        ...row,
        customerName: row?.customerName || row?.user || "Guest",
        orderAmount: Number(row?.orderAmount ?? row?.totalAmount ?? row?.finalAmount ?? 0),
        totalItemAmount: Number(row?.totalItemAmount ?? row?.subtotal ?? 0),
        couponByAdmin: Number(row?.couponByAdmin ?? row?.platformCouponDiscount ?? 0),
        couponByRestaurant: Number(row?.couponByRestaurant ?? row?.restaurantCouponDiscount ?? 0),
        offerByRestaurant: Number(row?.offerByRestaurant ?? row?.restaurantOfferDiscount ?? 0),
        restaurantEarning: Number(row?.restaurantEarning ?? 0),
        adminCommission: Number(row?.adminCommission ?? row?.commission ?? 0),
        vatTax: Number(row?.vatTax ?? row?.gst ?? 0),
        platformFee: Number(row?.platformFee ?? 0),
        orderStatus: String(row?.orderStatus || row?.status || "paid"),
      })),
    [rows]
  )

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 bg-blue-600 rounded-lg">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dining Order Report</h1>
          </div>
          <p className="text-slate-500 text-sm">Takeaway parity view for dining order analytics and revenue splits.</p>
        </div>
      </div>

      {kpis && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
          <Card className="p-4 bg-white shadow-sm border-slate-200">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Orders</p>
            <div className="flex items-end justify-between">
              <p className="text-2xl font-black text-slate-900">{kpis.totalOrders || 0}</p>
              <div className="p-1.5 bg-blue-50 rounded-md">
                <ShoppingBag className="w-4 h-4 text-blue-600" />
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-white shadow-sm border-slate-200">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Walk-in</p>
            <div className="flex items-end justify-between">
              <p className="text-2xl font-black text-slate-900">{kpis.walkInOrders || 0}</p>
              <div className="p-1.5 bg-indigo-50 rounded-md">
                <Users className="w-4 h-4 text-indigo-600" />
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-white shadow-sm border-slate-200">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Pre-book</p>
            <div className="flex items-end justify-between">
              <p className="text-2xl font-black text-slate-900">{kpis.preBookOrders || 0}</p>
              <div className="p-1.5 bg-purple-50 rounded-md">
                <Calendar className="w-4 h-4 text-purple-600" />
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-white shadow-sm border-slate-200">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Online Paid</p>
            <div className="flex items-end justify-between">
              <p className="text-2xl font-black text-slate-900">{kpis.onlineOrders || 0}</p>
              <div className="p-1.5 bg-emerald-50 rounded-md">
                <CreditCard className="w-4 h-4 text-emerald-600" />
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-white shadow-sm border-slate-200">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">COD Orders</p>
            <div className="flex items-end justify-between">
              <p className="text-2xl font-black text-slate-900">{kpis.codOrders || 0}</p>
              <div className="p-1.5 bg-amber-50 rounded-md">
                <IndianRupee className="w-4 h-4 text-amber-600" />
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-slate-900 shadow-sm border-slate-800">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Revenue</p>
            <div className="flex items-end justify-between">
              <p className="text-xl font-black text-white">{formatCurrency(kpis.revenue)}</p>
              <div className="p-1.5 bg-blue-500 rounded-md text-white">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
          </Card>
        </div>
      )}

      <Card className="bg-white shadow-sm border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin mb-3 text-blue-600" />
              <p className="text-sm font-medium">Generating dining order report...</p>
            </div>
          ) : (
            <table className="w-full min-w-[1500px] text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Order ID</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Restaurant</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Type / Payment</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Item Amount</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Coupon by Admin</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Coupon by Restaurant</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Offer by Restaurant</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Restaurant Earning</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Admin Commission</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">VAT / Tax</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Platform Fee</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Order Amount</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {normalizedRows.length ? (
                  normalizedRows.map((row) => (
                    <tr key={row.id || row.orderId} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{row.orderId}</div>
                        {row.date ? <div className="text-[10px] text-slate-400">{new Date(row.date).toLocaleDateString()}</div> : null}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{row.restaurant || "-"}</td>
                      <td className="px-4 py-3 text-slate-700">{row.customerName || "Guest"}</td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-semibold text-blue-600 uppercase">{String(row.type || row.orderType || "walk-in")}</div>
                        <div className="text-xs font-semibold text-amber-600 uppercase">{String(row.payment || row.paymentType || "online")}</div>
                      </td>
                      <td className="px-4 py-3">{formatCurrency(row.totalItemAmount)}</td>
                      <td className="px-4 py-3">{formatCurrency(row.couponByAdmin)}</td>
                      <td className="px-4 py-3">{formatCurrency(row.couponByRestaurant)}</td>
                      <td className="px-4 py-3">{formatCurrency(row.offerByRestaurant)}</td>
                      <td className="px-4 py-3 text-emerald-600 font-semibold">{formatCurrency(row.restaurantEarning)}</td>
                      <td className="px-4 py-3 text-blue-600 font-semibold">{formatCurrency(row.adminCommission)}</td>
                      <td className="px-4 py-3">{formatCurrency(row.vatTax)}</td>
                      <td className="px-4 py-3">{formatCurrency(row.platformFee)}</td>
                      <td className="px-4 py-3 font-bold text-slate-900">{formatCurrency(row.orderAmount)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700">
                          {String(row.orderStatus || "paid")}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-20 text-center" colSpan={14}>
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 text-slate-300">
                          <AlertCircle className="w-8 h-8" />
                        </div>
                        <p className="text-lg font-bold text-slate-400">No Report Data</p>
                        <p className="text-sm text-slate-400">Dining orders will appear here once captured.</p>
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
