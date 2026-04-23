import { useEffect, useState } from "react"
import { adminAPI } from "@food/api"
import { 
  Loader2, 
  CreditCard, 
  History, 
  TrendingUp, 
  Wallet, 
  Banknote, 
  CheckCircle2, 
  AlertCircle, 
  Store, 
  Hash, 
  ArrowRight
} from "lucide-react"
import { Card } from "@food/components/ui/card"
import { Badge } from "@food/components/ui/badge"

const currency = (value) => `\u20B9 ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

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
      } catch (err) {
        console.error("Error loading dining transactions:", err)
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
              <History className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Transaction History</h1>
          </div>
          <p className="text-slate-500 text-sm">Review all dining-related financial movements and settlement logs.</p>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="p-4 bg-white shadow-sm border-slate-200">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Volume</p>
                <p className="text-2xl font-black text-slate-900 mt-1">{summary.totalTransactions}</p>
              </div>
              <div className="p-2 bg-blue-50 rounded-lg">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-1 text-[10px] text-emerald-600 font-bold">
              <CheckCircle2 className="w-3 h-3" />
              <span>Processed Successfully</span>
            </div>
          </Card>

          <Card className="p-4 bg-white shadow-sm border-slate-200">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Admin Earnings</p>
                <p className="text-2xl font-black text-indigo-600 mt-1">{currency(summary.adminEarnings)}</p>
              </div>
              <div className="p-2 bg-indigo-50 rounded-lg">
                <Banknote className="w-5 h-5 text-indigo-600" />
              </div>
            </div>
            <p className="mt-4 text-[10px] text-slate-400 font-medium italic">Net Platform Commission</p>
          </Card>

          <Card className="p-4 bg-white shadow-sm border-slate-200">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Restaurant Payout</p>
                <p className="text-2xl font-black text-emerald-600 mt-1">{currency(summary.restaurantEarnings)}</p>
              </div>
              <div className="p-2 bg-emerald-50 rounded-lg">
                <Wallet className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
            <p className="mt-4 text-[10px] text-slate-400 font-medium italic">Settled to Partners</p>
          </Card>

          <Card className="p-4 bg-white shadow-sm border-slate-200 border-b-4 border-b-amber-500">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pending COD</p>
                <p className="text-2xl font-black text-amber-600 mt-1">{currency(summary.codDues)}</p>
              </div>
              <div className="p-2 bg-amber-50 rounded-lg">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
            </div>
            <p className="mt-4 text-[10px] text-slate-400 font-medium italic">Awaiting Cash Collection</p>
          </Card>
        </div>
      )}

      {/* Transactions Table */}
      <Card className="bg-white shadow-sm border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin mb-3 text-slate-900" />
              <p className="text-sm font-medium">Fetching transaction logs...</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider min-w-[120px]">Order & Restaurant</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Transaction Value</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Admin Cut</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Payment Details</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length > 0 ? (
                  rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 font-bold text-slate-900">
                            <Hash className="w-3.5 h-3.5 text-slate-400" />
                            {row.orderId}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Store className="w-3.5 h-3.5" />
                            {row.restaurant}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-black text-slate-900">{currency(row.amount)}</span>
                          <span className="text-[10px] text-slate-400 italic">Gross Amount</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1 max-w-[160px]">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Commission</span>
                            <span className="text-xs font-bold text-indigo-600">{currency(row.commission)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-4 border-t border-slate-50 pt-1">
                            <span className="text-[9px] text-slate-400 uppercase">GST + Fee</span>
                            <span className="text-[10px] font-medium text-slate-600">{currency(Number(row.gst || 0) + Number(row.platformFee || 0))}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-1.5">
                          <Badge variant="outline" className={`text-[9px] font-bold w-fit px-1.5 h-4 flex items-center gap-1 ${row.paymentType?.toLowerCase() === 'online' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                            <CreditCard className="w-2.5 h-2.5" />
                            {row.paymentType?.toUpperCase()}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <Badge className={`text-[10px] font-bold px-2 py-0.5 ${row.status?.toLowerCase() === 'paid' || row.status?.toLowerCase() === 'completed' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                          {row.status?.toUpperCase()}
                        </Badge>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-20 text-center" colSpan={5}>
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                          <History className="w-8 h-8 text-slate-300" />
                        </div>
                        <p className="text-lg font-bold text-slate-400">No Transactions Found</p>
                        <p className="text-sm text-slate-400">No payment logs available for the selected period.</p>
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
