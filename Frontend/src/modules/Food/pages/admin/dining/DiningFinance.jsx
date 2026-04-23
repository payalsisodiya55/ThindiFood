import { useEffect, useState } from "react"
import { adminAPI } from "@food/api"
import { 
  Loader2, 
  Banknote, 
  Wallet, 
  CreditCard, 
  TrendingUp, 
  AlertCircle, 
  Store, 
  Receipt, 
  Percent, 
  ShieldCheck,
  ChevronRight
} from "lucide-react"
import { Card } from "@food/components/ui/card"
import { Badge } from "@food/components/ui/badge"

const currency = (value) => `\u20B9 ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function DiningFinance() {
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await adminAPI.getDiningFinance({})
        setRows(res?.data?.data?.restaurants || [])
        setSummary(res?.data?.data?.summary || null)
      } catch (err) {
        console.error("Error loading dining finance:", err)
        setRows([])
        setSummary(null)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 bg-slate-900 rounded-lg">
              <Banknote className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dining Finance</h1>
          </div>
          <p className="text-slate-500 text-sm">Monitor restaurant earnings, platform commissions, and COD settlements.</p>
        </div>
      </div>

      {/* Summary Section */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="p-4 bg-white shadow-sm border-slate-200">
            <div className="flex justify-between items-start mb-2">
              <div className="p-2 bg-slate-100 rounded-lg">
                <Store className="w-5 h-5 text-slate-700" />
              </div>
              <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-700 border-slate-200">Total Orders</Badge>
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">{Number(summary.totalOrders || 0)}</p>
            <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-wider text-right">Completed Sessions</p>
          </Card>

          <Card className="p-4 bg-white shadow-sm border-slate-200">
            <div className="flex justify-between items-start mb-2">
              <div className="p-2 bg-blue-50 rounded-lg">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-600 border-blue-100">Gross Revenue</Badge>
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">{currency(summary.totalRevenue)}</p>
            <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-wider text-right">Order Amount Total</p>
          </Card>

          <Card className="p-4 bg-white shadow-sm border-slate-200">
            <div className="flex justify-between items-start mb-2">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <Wallet className="w-5 h-5 text-emerald-600" />
              </div>
              <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-600 border-emerald-100">Online Collected</Badge>
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">{currency(summary.totalOnline)}</p>
            <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-wider text-right">{Number(summary.totalOnlineOrders || 0)} Online Orders</p>
          </Card>

          <Card className="p-4 bg-white shadow-sm border-slate-200">
            <div className="flex justify-between items-start mb-2">
              <div className="p-2 bg-amber-50 rounded-lg">
                <Receipt className="w-5 h-5 text-amber-600" />
              </div>
              <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-600 border-amber-100">COD Volume</Badge>
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">{summary.totalCodOrders}</p>
            <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-wider text-right">Counter/Cash Orders</p>
          </Card>

          <Card className="p-4 bg-white shadow-sm border-slate-200 border-l-4 border-l-rose-500">
            <div className="flex justify-between items-start mb-2">
              <div className="p-2 bg-rose-50 rounded-lg">
                <AlertCircle className="w-5 h-5 text-rose-600" />
              </div>
              <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-600 border-rose-100">Total COD Dues</Badge>
            </div>
            <p className="text-2xl font-bold text-rose-600 mt-2">{currency(summary.totalPendingCodDues)}</p>
            <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-wider text-right">
              {Number(summary.totalPendingCodDues || 0) > 0 ? "Pending Recovery" : "All COD Settled"}
            </p>
          </Card>

          <Card className="p-4 bg-white shadow-sm border-slate-200">
            <div className="flex justify-between items-start mb-2">
              <div className="p-2 bg-indigo-50 rounded-lg">
                <Banknote className="w-5 h-5 text-indigo-600" />
              </div>
              <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-600 border-indigo-100">Admin Charges</Badge>
            </div>
            <p className="text-2xl font-bold text-indigo-600 mt-2">{currency(summary.totalAdminCharges)}</p>
            <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-wider text-right">Commission + GST + Platform Fee</p>
          </Card>

          <Card className="p-4 bg-white shadow-sm border-slate-200">
            <div className="flex justify-between items-start mb-2">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <CreditCard className="w-5 h-5 text-emerald-600" />
              </div>
              <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-600 border-emerald-100">Restaurant Payout</Badge>
            </div>
            <p className="text-2xl font-bold text-emerald-600 mt-2">{currency(summary.totalRestaurantPayout)}</p>
            <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-wider text-right">Net Restaurant Earning</p>
          </Card>
        </div>
      )}

      {/* Main Content Table */}
      <Card className="bg-white shadow-sm border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <Store className="w-4 h-4 text-slate-400" />
            Restaurant Finance Records
          </h2>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin mb-3 text-slate-900" />
              <p className="text-sm font-medium">Loading financial data...</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider min-w-[180px]">Restaurant</th>
                  <th className="px-4 py-4 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Online Earned</th>
                  <th className="px-4 py-4 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">COD Orders</th>
                  <th className="px-4 py-4 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider text-rose-600 bg-rose-50/20">COD Dues</th>
                  <th className="px-4 py-4 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Commission</th>
                  <th className="px-4 py-4 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Platform & GST</th>
                  <th className="px-4 py-4 text-right text-[10px] font-bold text-slate-900 uppercase tracking-wider bg-slate-100/50">Total Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length > 0 ? (
                  rows.map((row) => (
                    <tr key={row.restaurantId} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">
                            <Store className="w-4 h-4" />
                          </div>
                          <span className="font-bold text-slate-900">{row.restaurant}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right font-medium text-emerald-600">
                        {currency(row.onlineEarnings)}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <Badge variant="outline" className="text-[10px] font-bold px-2 py-0 h-5 bg-slate-50 border-slate-200">
                          {row.codOrders}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 text-right bg-rose-50/5">
                        <span className={`text-sm font-black ${Number(row.pendingCodDues) > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                          {currency(row.pendingCodDues)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right text-slate-600 font-medium">
                        {currency(row.commission)}
                      </td>
                      <td className="px-4 py-4 text-right text-slate-600 font-medium">
                        {currency(Number(row.gst || 0) + Number(row.platformFee || 0))}
                      </td>
                      <td className="px-4 py-4 text-right bg-slate-100/30">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-sm font-black text-slate-900">{currency(row.totalRevenue)}</span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-transform group-hover:translate-x-0.5" />
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-20 text-center" colSpan={7}>
                      <div className="flex flex-col items-center justify-center">
                        <AlertCircle className="w-12 h-12 text-slate-200 mb-4" />
                        <p className="text-lg font-bold text-slate-400">No Financial Records</p>
                        <p className="text-sm text-slate-400">Financial data will appear once orders are completed.</p>
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
