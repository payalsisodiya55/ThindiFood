import { useEffect, useState } from "react"
import { adminAPI } from "@food/api"
import { 
  Loader2, 
  Activity, 
  Search, 
  Filter, 
  User, 
  Clock, 
  Hash, 
  CreditCard, 
  ChevronRight,
  AlertCircle,
  Table as TableIcon,
  CheckCircle2
} from "lucide-react"
import { Card } from "@food/components/ui/card"
import { Badge } from "@food/components/ui/badge"
import { Input } from "@food/components/ui/input"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@food/components/ui/select"

const currency = (value) => `\u20B9 ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function DiningSessions() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: "all", search: "" })

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const queryFilters = {
          ...filters,
          status: filters.status === "all" ? "" : filters.status
        }
        const res = await adminAPI.getDiningSessions(queryFilters)
        setRows(res?.data?.data?.sessions || [])
      } catch (err) {
        console.error("Error loading dining sessions:", err)
        setRows([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [filters])

  const getStatusColor = (status) => {
    const s = String(status || "").toLowerCase()
    if (s === 'active' || s === 'bill_requested') return "bg-emerald-100 text-emerald-700 border-emerald-200"
    if (s === 'closed' || s === 'completed') return "bg-slate-100 text-slate-700 border-slate-200"
    if (s === 'expired') return "bg-rose-100 text-rose-700 border-rose-200"
    return "bg-slate-100 text-slate-700 border-slate-200"
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 bg-indigo-600 rounded-lg">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Live Dining Sessions</h1>
          </div>
          <p className="text-slate-500 text-sm">Monitor real-time table activity, running bills, and session durations.</p>
        </div>
      </div>

      {/* Filters Section */}
      <Card className="p-4 mb-6 bg-white shadow-sm border-slate-200">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Search Session</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                className="pl-9 text-sm h-10" 
                placeholder="Search by ID, Table, User, Restaurant..." 
                value={filters.search} 
                onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))} 
              />
            </div>
          </div>

          <div className="w-full md:w-64 space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Session Status</label>
            <Select value={filters.status} onValueChange={(v) => setFilters(p => ({ ...p, status: v }))}>
              <SelectTrigger className="h-10 text-sm">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Table Section */}
      <Card className="bg-white shadow-sm border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin mb-3 text-indigo-600" />
              <p className="text-sm font-medium">Refreshing sessions...</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Session ID</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Restaurant & Table</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Financials</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Timing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length > 0 ? (
                  rows.map((row) => (
                    <tr key={row.sessionId} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Hash className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-bold text-slate-900 uppercase">{row.sessionId?.slice(-8)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-700">{row.restaurant}</span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <TableIcon className="w-3 h-3 text-slate-400" />
                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
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
                            {row.bookingId && (
                              <span className="text-[9px] text-purple-600 font-bold flex items-center gap-0.5">
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                Pre-booked
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900">{currency(row.runningBill)}</span>
                          <div className="flex items-center gap-1 mt-0.5">
                            <CreditCard className="w-2.5 h-2.5 text-slate-400" />
                            <span className="text-[10px] text-slate-400 uppercase tracking-tighter">Current Bill</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <Badge className={`text-[10px] font-bold px-2 py-0.5 w-fit ${getStatusColor(row.status)}`}>
                            {row.status?.toUpperCase()}
                          </Badge>
                          {row.status === 'active' && (
                            <span className="flex items-center gap-1 text-[9px] text-emerald-500 font-bold animate-pulse">
                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                              LIVE
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col text-[11px] text-slate-500">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>Started: {row.startTime ? new Date(row.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "-"}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 ml-4.5">
                            {row.startTime ? new Date(row.startTime).toLocaleDateString() : ""}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-20 text-center" colSpan={6}>
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                          <Activity className="w-8 h-8 text-slate-300" />
                        </div>
                        <p className="text-lg font-bold text-slate-400">No Active Sessions</p>
                        <p className="text-sm text-slate-400">There are currently no dining sessions to display.</p>
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
