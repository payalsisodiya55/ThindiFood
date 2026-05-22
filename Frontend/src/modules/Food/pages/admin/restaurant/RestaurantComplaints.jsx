import { useState, useEffect } from "react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Edit,
  FileText,
  Mail,
  Phone,
  XCircle,
} from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@food/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@food/components/ui/dialog"

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const STATUS_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "rejected", label: "Rejected" },
]

const COMPLAINT_TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "food_quality", label: "Food Quality" },
  { value: "wrong_item", label: "Wrong Item" },
  { value: "missing_item", label: "Missing Item" },
  { value: "delivery_issue", label: "Delivery Issue" },
  { value: "packaging", label: "Packaging" },
  { value: "pricing", label: "Pricing" },
  { value: "service", label: "Service" },
  { value: "other", label: "Other" },
]

const getRestaurantPhone = (restaurant) =>
  restaurant?.ownerPhone ||
  restaurant?.phone ||
  restaurant?.contactNumber ||
  restaurant?.primaryContactNumber ||
  restaurant?.mobile ||
  restaurant?.restaurantPhone ||
  ""

const getRestaurantEmail = (restaurant) =>
  restaurant?.email ||
  restaurant?.ownerEmail ||
  restaurant?.restaurantEmail ||
  ""

const normalizeLookup = (value) => String(value || "").trim().toLowerCase()

const getRestaurantName = (restaurant) =>
  restaurant?.restaurantName ||
  restaurant?.name ||
  restaurant?.businessName ||
  "Restaurant"

const getRestaurantKeys = (restaurant) => {
  const keys = [
    restaurant?._id,
    restaurant?.id,
    restaurant?.restaurantId,
    getRestaurantName(restaurant),
  ]

  return [...new Set(keys.map(normalizeLookup).filter(Boolean))]
}

const buildRestaurantLookup = (restaurants = []) => {
  const lookup = new Map()
  restaurants.forEach((restaurant) => {
    getRestaurantKeys(restaurant).forEach((key) => lookup.set(key, restaurant))
  })
  return lookup
}

const getComplaintRestaurantKeys = (complaint) => {
  const restaurant = complaint?.restaurantId
  const orderRestaurant = complaint?.orderId?.restaurantId || complaint?.orderId?.restaurant
  const keys = [
    typeof restaurant === "object" ? restaurant?._id : restaurant,
    typeof restaurant === "object" ? restaurant?.id : "",
    typeof restaurant === "object" ? restaurant?.restaurantId : "",
    typeof restaurant === "object" ? getRestaurantName(restaurant) : restaurant,
    typeof orderRestaurant === "object" ? orderRestaurant?._id : orderRestaurant,
    typeof orderRestaurant === "object" ? orderRestaurant?.id : "",
    typeof orderRestaurant === "object" ? orderRestaurant?.restaurantId : "",
    typeof orderRestaurant === "object" ? getRestaurantName(orderRestaurant) : "",
    complaint?.restaurantName,
  ]

  return [...new Set(keys.map(normalizeLookup).filter(Boolean))]
}

const resolveComplaintRestaurant = (complaint, restaurantLookup) => {
  const populatedRestaurant = typeof complaint?.restaurantId === "object" ? complaint.restaurantId : {}

  for (const key of getComplaintRestaurantKeys(complaint)) {
    const match = restaurantLookup.get(key)
    if (match) return { ...match, ...populatedRestaurant }
  }

  return populatedRestaurant
}

export default function RestaurantComplaints() {
  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    in_progress: 0,
    resolved: 0,
    rejected: 0,
  })
  const [filters, setFilters] = useState({
    status: "all",
    complaintType: "all",
    search: "",
    page: 1,
    limit: 50,
  })
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    pages: 1,
  })
  const [editingComplaint, setEditingComplaint] = useState(null)
  const [updateData, setUpdateData] = useState({ status: "", adminResponse: "" })

  useEffect(() => {
    fetchComplaints()
  }, [filters])

  const fetchComplaints = async () => {
    try {
      setLoading(true)
      const params = {
        page: filters.page,
        limit: filters.limit,
      }
      if (filters.status && filters.status !== "all") params.status = filters.status
      if (filters.complaintType && filters.complaintType !== "all") params.complaintType = filters.complaintType
      if (filters.search) params.search = filters.search

      const [response, restaurantsResponse] = await Promise.all([
        adminAPI.getRestaurantComplaints(params),
        adminAPI.getApprovedRestaurants({ limit: 1000 }).catch(() => null),
      ])
      if (response?.data?.success) {
        const restaurantPayload = restaurantsResponse?.data?.data
        const restaurants = Array.isArray(restaurantPayload?.restaurants)
          ? restaurantPayload.restaurants
          : Array.isArray(restaurantPayload)
            ? restaurantPayload
            : Array.isArray(restaurantsResponse?.data?.restaurants)
              ? restaurantsResponse.data.restaurants
              : []
        const restaurantLookup = buildRestaurantLookup(restaurants)
        const enrichedComplaints = (response.data.data.complaints || []).map((complaint) => ({
          ...complaint,
          resolvedRestaurant: resolveComplaintRestaurant(complaint, restaurantLookup),
        }))

        setComplaints(enrichedComplaints)
        setStats(response.data.data.stats || stats)
        setPagination({
          page: response.data.data.page || 1,
          limit: response.data.data.limit || 50,
          total: response.data.data.total || 0,
          pages: Math.ceil((response.data.data.total || 0) / (response.data.data.limit || 50)),
        })
      }
    } catch (error) {
      debugError("Error fetching complaints:", error)
      toast.error("Failed to fetch complaints")
    } finally {
      setLoading(false)
    }
  }

  const handleOpenModal = (complaint) => {
    setEditingComplaint(complaint)
    setUpdateData({ status: complaint.status, adminResponse: complaint.adminResponse || "" })
  }

  const handleUpdateComplaint = async () => {
    if (!editingComplaint) return
    try {
      const response = await adminAPI.updateRestaurantComplaint(editingComplaint._id, updateData)
      if (response?.data?.success) {
        toast.success("Complaint updated")
        setEditingComplaint(null)
        fetchComplaints()
      }
    } catch (error) {
      debugError("Error updating complaint:", error)
      toast.error("Failed to update complaint")
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case "pending":
        return <Clock className="w-4 h-4 text-yellow-600" />
      case "in_progress":
        return <AlertCircle className="w-4 h-4 text-blue-600" />
      case "resolved":
        return <CheckCircle className="w-4 h-4 text-green-600" />
      case "rejected":
        return <XCircle className="w-4 h-4 text-red-600" />
      default:
        return <FileText className="w-4 h-4 text-gray-600" />
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Restaurant Complaints</h1>
        <p className="text-sm text-gray-500 mt-1">Manage and track customer complaints</p>
      </div>

      <div className="bg-white rounded-lg p-4 border border-gray-200 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by order, customer, restaurant..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value.replace(/\s/g, ""), page: 1 })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <Select value={filters.status || "all"} onValueChange={(value) => setFilters({ ...filters, status: value, page: 1 })}>
            <SelectTrigger>
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.complaintType || "all"}
            onValueChange={(value) => setFilters({ ...filters, complaintType: value, page: 1 })}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              {COMPLAINT_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200">
        {loading ? (
          <div className="p-12 text-center">
            <p className="text-gray-500">Loading complaints...</p>
          </div>
        ) : complaints.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No complaints found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {complaints.map((complaint) => {
              const restaurantInfo = complaint.resolvedRestaurant || complaint.restaurantId || {}
              const restaurantPhone = getRestaurantPhone(restaurantInfo)
              const restaurantEmail = getRestaurantEmail(restaurantInfo)

              return (
                <div key={complaint._id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {getStatusIcon(complaint.status)}
                        <h3 className="font-semibold text-gray-900">
                          {complaint.subject || complaint.issueType?.replace("_", " ")}
                        </h3>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                        <div>
                          <p className="text-xs text-gray-500">Order</p>
                          <p className="font-medium">#{complaint.orderId?.orderId || "N/A"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Customer</p>
                          <p className="font-medium">{complaint.userId?.name || "Customer"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Restaurant</p>
                          <p className="font-medium text-slate-900">
                            {getRestaurantName(restaurantInfo)}
                          </p>
                          {restaurantPhone && (
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                              <Phone className="w-3 h-3" />
                              <span>{restaurantPhone}</span>
                            </div>
                          )}
                          {restaurantEmail && (
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 break-all">
                              <Mail className="w-3 h-3" />
                              <span>{restaurantEmail}</span>
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Type</p>
                          <p className="font-medium capitalize">{(complaint.issueType || "other").replace("_", " ")}</p>
                        </div>
                      </div>
                    </div>
                    <button onClick={() => handleOpenModal(complaint)} className="p-2 rounded-md hover:bg-gray-200">
                      <Edit className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>
                  <p className="text-sm text-gray-700 mb-3">{complaint.description}</p>
                  {complaint.restaurantResponse && (
                    <div className="bg-blue-50 rounded p-3 mb-3">
                      <p className="text-xs font-semibold text-blue-700 mb-1">Restaurant Response:</p>
                      <p className="text-sm text-blue-800">{complaint.restaurantResponse}</p>
                    </div>
                  )}
                  {complaint.adminResponse && (
                    <div className="bg-green-50 rounded p-3 mb-3">
                      <p className="text-xs font-semibold text-green-700 mb-1">Admin Response:</p>
                      <p className="text-sm text-green-800">{complaint.adminResponse}</p>
                    </div>
                  )}
                  <p className="text-xs text-gray-400">
                    {new Date(complaint.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {pagination.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} complaints
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
              disabled={filters.page === 1}
              className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
              disabled={filters.page >= pagination.pages}
              className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <Dialog open={!!editingComplaint} onOpenChange={(open) => !open && setEditingComplaint(null)}>
        <DialogContent className="sm:max-w-lg rounded-[28px] p-6 shadow-2xl border border-slate-100 bg-white">
          <DialogHeader className="border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div className="text-left">
                <DialogTitle className="text-xl font-bold text-slate-900">Update Complaint</DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-1">
                  Update the status and provide a response for this customer complaint.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5 py-5">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 block text-left">Status</label>
              <Select value={updateData.status} onValueChange={(val) => setUpdateData({ ...updateData, status: val })}>
                <SelectTrigger className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-300 focus:ring-4 focus:ring-orange-500/10 outline-none">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent className="bg-white border border-slate-200 rounded-xl shadow-lg z-[9999]">
                  {STATUS_OPTIONS.filter((o) => o.value !== "all").map((o) => (
                    <SelectItem key={o.value} value={o.value} className="cursor-pointer hover:bg-slate-50 focus:bg-slate-50 rounded-lg">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 block text-left">Admin Response</label>
              <textarea
                className="w-full min-h-[120px] p-4 border border-slate-200 rounded-xl bg-white text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition hover:border-slate-300 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 shadow-sm resize-none"
                placeholder="Describe the investigation findings, action taken, or resolution for the customer..."
                value={updateData.adminResponse}
                onChange={(e) => setUpdateData({ ...updateData, adminResponse: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter className="border-t border-slate-100 pt-4 flex gap-2 justify-end">
            <button
              onClick={() => setEditingComplaint(null)}
              className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 active:scale-95 cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleUpdateComplaint}
              className="rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-orange-600/10 transition hover:bg-orange-700 active:scale-95 cursor-pointer"
            >
              Save Changes
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
