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
              <div className="p-2 bg-blue-50 rounded-lg">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-600 border-blue-100">Total Revenue</Badge>
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">{currency(summary.totalRevenue)}</p>
            <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-wider text-right">Aggregated Sales</p>
          </Card>

          <Card className="p-4 bg-white shadow-sm border-slate-200">
            <div className="flex justify-between items-start mb-2">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <Wallet className="w-5 h-5 text-emerald-600" />
              </div>
              <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-600 border-emerald-100">Online Earnings</Badge>
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">{currency(summary.totalOnline)}</p>
            <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-wider text-right">Digital Payments</p>
          </Card>

          <Card className="p-4 bg-white shadow-sm border-slate-200">
            <div className="flex justify-between items-start mb-2">
              <div className="p-2 bg-amber-50 rounded-lg">
                <Receipt className="w-5 h-5 text-amber-600" />
              </div>
              <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-600 border-amber-100">COD Volume</Badge>
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">{summary.totalCodOrders}</p>
            <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-wider text-right">Cash On Delivery</p>
          </Card>

          <Card className="p-4 bg-white shadow-sm border-slate-200 border-l-4 border-l-rose-500">
            <div className="flex justify-between items-start mb-2">
              <div className="p-2 bg-rose-50 rounded-lg">
                <AlertCircle className="w-5 h-5 text-rose-600" />
              </div>
              <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-600 border-rose-100">Total COD Dues</Badge>
            </div>
            <p className="text-2xl font-bold text-rose-600 mt-2">{currency(summary.totalPendingCodDues)}</p>
            <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-wider text-right">Restaurant Owed</p>
          </Card>
        </div>
      )}

      {/* Main Content Table */}
      <Card className="bg-white shadow-sm border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <Store className="w-4 h-4 text-slate-400" />
            Restaurant Wise Breakdown
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
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider min-w-[200px]">Restaurant</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Payment Split</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider text-rose-600 bg-rose-50/30">COD Dues</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Charges</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-100/50">Total Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length > 0 ? (
                  rows.map((row) => (
                    <tr key={row.restaurantId} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                            <Store className="w-5 h-5" />
                          </div>
                          <span className="font-bold text-slate-900">{row.restaurant}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight flex items-center gap-1">
                              <CreditCard className="w-3 h-3" /> Online
                            </span>
                            <span className="text-xs font-bold text-emerald-600">{currency(row.onlineEarnings)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight flex items-center gap-1">
                              <Receipt className="w-3 h-3" /> COD Orders
                            </span>
                            <span className="text-xs font-bold text-slate-700">{row.codOrders} Orders</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 bg-rose-50/10">
                        <div className="flex flex-col">
                          <span className="text-sm font-black text-rose-600">{currency(row.pendingCodDues)}</span>
                          <span className="text-[9px] font-bold text-rose-400 uppercase">Pending Settlement</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                              <Percent className="w-3 h-3" /> Commission
                            </span>
                            <span className="text-xs font-bold text-slate-700">{currency(row.commission)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" /> GST + Fee
                            </span>
                            <span className="text-xs font-bold text-slate-700">{currency(Number(row.gst || 0) + Number(row.platformFee || 0))}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 bg-slate-100/30">
                        <div className="flex items-center justify-between">
                          <span className="text-base font-black text-slate-900">{currency(row.totalRevenue)}</span>
                          <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-20 text-center" colSpan={5}>
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
