import { useEffect, useState } from "react"
import { adminAPI } from "@food/api"
import { 
  Loader2, 
  CalendarCheck, 
  Search, 
  Filter, 
  Users, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Hash,
  Store,
  ChevronRight,
  Calendar
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

export default function DiningBookings() {
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
        const res = await adminAPI.getDiningBookings(queryFilters)
        setRows(res?.data?.data?.bookings || [])
      } catch (err) {
        console.error("Error loading dining bookings:", err)
        setRows([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [filters])

  const getStatusColor = (status) => {
    const s = String(status || "").toUpperCase()
    switch (s) {
      case "ACCEPTED": return "bg-emerald-100 text-emerald-700 border-emerald-200"
      case "PENDING": return "bg-amber-100 text-amber-700 border-amber-200"
      case "DECLINED": return "bg-rose-100 text-rose-700 border-rose-200"
      case "CHECKED_IN": return "bg-blue-100 text-blue-700 border-blue-200"
      case "COMPLETED": return "bg-slate-100 text-slate-700 border-slate-200"
      case "CANCELLED": return "bg-slate-100 text-slate-400 border-slate-200"
      default: return "bg-slate-100 text-slate-700 border-slate-200"
    }
  }

  const getStatusIcon = (status) => {
    const s = String(status || "").toUpperCase()
    switch (s) {
      case "ACCEPTED": return <CheckCircle2 className="w-3 h-3" />
      case "PENDING": return <Clock className="w-3 h-3" />
      case "DECLINED": return <XCircle className="w-3 h-3" />
      case "CHECKED_IN": return <CheckCircle2 className="w-3 h-3" />
      default: return null
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 bg-emerald-600 rounded-lg">
              <CalendarCheck className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Table Bookings</h1>
          </div>
          <p className="text-slate-500 text-sm">Monitor table reservations, confirmations, and customer arrivals.</p>
        </div>
      </div>

      {/* Filters Section */}
      <Card className="p-4 mb-6 bg-white shadow-sm border-slate-200">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Search Booking</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                className="pl-9 text-sm h-10" 
                placeholder="Search by ID, User, Phone, Restaurant..." 
                value={filters.search} 
                onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))} 
              />
            </div>
          </div>

          <div className="w-full md:w-64 space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Status Filter</label>
            <Select value={filters.status} onValueChange={(v) => setFilters(p => ({ ...p, status: v }))}>
              <SelectTrigger className="h-10 text-sm">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="ACCEPTED">Accepted</SelectItem>
                <SelectItem value="DECLINED">Declined</SelectItem>
                <SelectItem value="CHECKED_IN">Checked In</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
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
              <Loader2 className="w-8 h-8 animate-spin mb-3 text-emerald-600" />
              <p className="text-sm font-medium">Loading bookings...</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Booking ID</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Restaurant</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Customer Details</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Schedule</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Linked Session</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length > 0 ? (
                  rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-4 py-3 font-bold text-slate-900">
                        #{row.bookingId}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-700">{row.restaurant}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                            <Users className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-slate-700 font-medium">{row.user?.name || "Guest User"}</span>
                            {row.user?.phone && <span className="text-[10px] text-slate-400">{row.user.phone}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            {row.date ? new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : "-"}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {row.time || "N/A"}
                            <span className="mx-1">•</span>
                            <Users className="w-2.5 h-2.5" />
                            {row.guests} Guests
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1.5">
                          <Badge className={`text-[10px] font-bold px-2 py-0.5 w-fit flex items-center gap-1 ${getStatusColor(row.status)}`}>
                            {getStatusIcon(row.status)}
                            {row.status?.toUpperCase()}
                          </Badge>
                          {row.checkInStatus && row.checkInStatus !== 'pending' && (
                            <span className="text-[10px] text-blue-600 font-semibold italic">
                              Check-in: {row.checkInStatus.toUpperCase()}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {row.linkedSessionId ? (
                          <div className="flex items-center gap-1.5 text-blue-600 group-hover:translate-x-1 transition-transform">
                            <Hash className="w-3.5 h-3.5" />
                            <span className="font-bold uppercase">{row.linkedSessionId.slice(-8)}</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs italic">No Session Yet</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-20 text-center" colSpan={6}>
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                          <CalendarCheck className="w-8 h-8 text-slate-300" />
                        </div>
                        <p className="text-lg font-bold text-slate-400">No Bookings Found</p>
                        <p className="text-sm text-slate-400">No reservations match your criteria.</p>
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
