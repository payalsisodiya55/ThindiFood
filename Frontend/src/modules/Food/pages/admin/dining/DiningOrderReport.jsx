import { useEffect, useState } from "react"
import { adminAPI } from "@food/api"
import { 
  Loader2, 
  FileText, 
  ShoppingBag, 
  Users, 
  CreditCard, 
  TrendingUp, 
  Percent, 
  ChevronRight,
  AlertCircle,
  IndianRupee,
  Calendar
} from "lucide-react"
import { Card } from "@food/components/ui/card"
import { Badge } from "@food/components/ui/badge"

const currency = (value) => `\u20B9 ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

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
      } catch (err) {
        console.error("Error loading dining order report:", err)
        setKpis(null)
        setRows([])
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
            <div className="p-2 bg-blue-600 rounded-lg">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dining Order Report</h1>
          </div>
          <p className="text-slate-500 text-sm">Detailed analysis of dining sales, revenue splits, and order distributions.</p>
        </div>
      </div>

      {/* KPI Section */}
      {kpis && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
          <Card className="p-4 bg-white shadow-sm border-slate-200">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Orders</p>
            <div className="flex items-end justify-between">
              <p className="text-2xl font-black text-slate-900">{kpis.totalOrders}</p>
              <div className="p-1.5 bg-blue-50 rounded-md">
                <ShoppingBag className="w-4 h-4 text-blue-600" />
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-white shadow-sm border-slate-200">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Walk-in</p>
            <div className="flex items-end justify-between">
              <p className="text-2xl font-black text-slate-900">{kpis.walkInOrders}</p>
              <div className="p-1.5 bg-indigo-50 rounded-md">
                <Users className="w-4 h-4 text-indigo-600" />
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-white shadow-sm border-slate-200">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Pre-book</p>
            <div className="flex items-end justify-between">
              <p className="text-2xl font-black text-slate-900">{kpis.preBookOrders}</p>
              <div className="p-1.5 bg-purple-50 rounded-md">
                <Calendar className="w-4 h-4 text-purple-600" />
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-white shadow-sm border-slate-200">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Online Paid</p>
            <div className="flex items-end justify-between">
              <p className="text-2xl font-black text-slate-900">{kpis.onlineOrders}</p>
              <div className="p-1.5 bg-emerald-50 rounded-md">
                <CreditCard className="w-4 h-4 text-emerald-600" />
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-white shadow-sm border-slate-200">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">COD Orders</p>
            <div className="flex items-end justify-between">
              <p className="text-2xl font-black text-slate-900">{kpis.codOrders}</p>
              <div className="p-1.5 bg-amber-50 rounded-md">
                <IndianRupee className="w-4 h-4 text-amber-600" />
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-slate-900 shadow-sm border-slate-800 xl:col-span-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Revenue</p>
            <div className="flex items-end justify-between">
              <p className="text-xl font-black text-white">{currency(kpis.revenue)}</p>
              <div className="p-1.5 bg-blue-500 rounded-md text-white">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Main Content Table */}
      <Card className="bg-white shadow-sm border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin mb-3 text-blue-600" />
              <p className="text-sm font-medium">Generating order report...</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider min-w-[120px]">Order ID</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Restaurant & User</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Type & Payment</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pricing Breakdown</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-100/50">Final Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length > 0 ? (
                  rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-4 py-4 align-top">
                        <span className="font-bold text-slate-900 tracking-tight block">#{row.orderId}</span>
                        {row.date && <span className="text-[10px] text-slate-400 mt-1 block">{new Date(row.date).toLocaleDateString()}</span>}
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-slate-700">{row.restaurant}</span>
                          <span className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Users className="w-2.5 h-2.5" /> {row.user || "Guest Customer"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="flex flex-col gap-1.5">
                          <Badge variant="outline" className={`text-[9px] font-bold w-fit px-1.5 h-4 ${row.type?.toLowerCase() === 'pre-book' ? 'bg-purple-50 text-purple-600 border-purple-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                            {row.type?.toUpperCase()}
                          </Badge>
                          <Badge variant="outline" className="text-[9px] font-bold w-fit px-1.5 h-4 bg-slate-50 border-slate-200">
                            {row.payment?.toUpperCase()}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 max-w-[280px]">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Subtotal</span>
                            <span className="text-xs text-slate-600">{currency(row.subtotal)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Offer</span>
                            <span className="text-xs text-rose-500 font-bold">-{currency(row.offer)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight flex items-center gap-0.5"><Percent className="w-2.5 h-2.5" /> Comm.</span>
                            <span className="text-xs text-slate-600">{currency(row.commission)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">GST</span>
                            <span className="text-xs text-slate-600">{currency(row.gst)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top bg-slate-100/30">
                        <div className="flex items-center justify-between">
                          <span className="text-base font-black text-slate-900">{currency(row.finalAmount)}</span>
                          <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-20 text-center" colSpan={5}>
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 text-slate-300">
                          <AlertCircle className="w-8 h-8" />
                        </div>
                        <p className="text-lg font-bold text-slate-400">No Report Data</p>
                        <p className="text-sm text-slate-400">Please refine your search or wait for new orders.</p>
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
