import { useState, useEffect, useRef, useCallback } from "react"
import { RESTAURANT_THEME } from "@food/constants/restaurantTheme"
import { motion, AnimatePresence } from "framer-motion"
import { useNavigate } from "react-router-dom"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import {
  ArrowLeft,
  Search,
  Filter,
  ChevronDown,
  Calendar,
  Copy,
  ChevronRight,
  X,
} from "lucide-react"
import { DateRangeCalendar } from "@food/components/ui/date-range-calendar"
import { restaurantAPI } from "@food/api"
import { useRestaurantNotifications } from "@food/hooks/useRestaurantNotifications"
import { formatOrderItemQuantityLabel } from "@food/utils/orderItemDisplay"
const debugLog = (...args) => { }
const debugWarn = (...args) => { }
const debugError = (...args) => { }

const formatMoney = (value) => `₹${Number(value || 0).toFixed(2)}`

const getOrderCustomerPhone = (orderLike) =>
  String(
    orderLike?.customerPhone ||
    orderLike?.userId?.phone ||
    orderLike?.userId?.phoneNumber ||
    orderLike?.user?.phone ||
    orderLike?.user?.phoneNumber ||
    orderLike?.customer?.phone ||
    orderLike?.phone ||
    orderLike?.phoneNumber ||
    orderLike?.mobile ||
    "",
  ).trim();

// Initialize with current week if needed
const getCurrentWeek = () => {
  const today = new Date()
  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - today.getDay() + 1) // Monday
  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 6) // Sunday
  return { start: startOfWeek, end: endOfWeek }
}

const getLastWeek = () => {
  const today = new Date()
  const startOfLastWeek = new Date(today)
  startOfLastWeek.setDate(today.getDate() - today.getDay() - 6) // Monday of last week
  const endOfLastWeek = new Date(startOfLastWeek)
  endOfLastWeek.setDate(startOfLastWeek.getDate() + 6) // Sunday of last week
  return { start: startOfLastWeek, end: endOfLastWeek }
}

const getLast2Days = () => {
  const today = new Date()
  const twoDaysAgo = new Date(today)
  twoDaysAgo.setDate(today.getDate() - 2)
  return { start: twoDaysAgo, end: today }
}

const getLast30Days = () => {
  const today = new Date()
  const thirtyDaysAgo = new Date(today)
  thirtyDaysAgo.setDate(today.getDate() - 30)
  return { start: thirtyDaysAgo, end: today }
}

const currentWeekDates = getCurrentWeek()
const lastWeekDates = getLastWeek()

const dateRangeOptions = [
  { label: "last 2 days", getDates: getLast2Days },
  { label: "this week", getDates: getCurrentWeek },
  { label: "last week", getDates: getLastWeek },
  { label: "last 30 days", getDates: getLast30Days },
  { label: "custom date range", custom: true }
]

// Filter categories and options
const filterCategories = [
  { id: "Order status", label: "Order Status", key: "orderStatus" },
  { id: "Delivery timing", label: "Delivery Timing", key: "deliveryTiming" },
  { id: "Payment", label: "Payment", key: "payment" },
  { id: "Ratings", label: "Ratings", key: "ratings" },
  { id: "KPT delay", label: "Prep time delay", key: "kptDelay" },
  { id: "Complaints", label: "Complaints", key: "complaints" },
  { id: "Order type", label: "Order Type", key: "orderType" }
]

const filterOptions = {
  "Order status": [
    { id: "preparing", label: "Preparing", key: "orderStatus" },
    { id: "ready", label: "Ready", key: "orderStatus" },
    { id: "out-for-delivery", label: "Out for delivery", key: "orderStatus" },
    { id: "delivered", label: "Delivered", key: "orderStatus" },
    { id: "rejected-by-restaurant", label: "Rejected by restaurant", key: "orderStatus" },
    { id: "cancelled-by-restaurant", label: "Cancelled by Restaurant", key: "orderStatus" },
    { id: "cancelled-by-customer", label: "Cancelled by customer", key: "orderStatus" }
  ],
  "Delivery timing": [
    { id: "immediate", label: "Immediate / ASAP", key: "deliveryTiming" },
    { id: "scheduled", label: "Scheduled", key: "deliveryTiming" }
  ],
  "Payment": [
    { id: "cash", label: "Cash on Delivery", key: "payment" },
    { id: "online", label: "Online Payment", key: "payment" }
  ],
  "Ratings": [
    { id: "5-star", label: "5★ or less", key: "ratings", value: 5 },
    { id: "4-star", label: "4★ or less", key: "ratings", value: 4 },
    { id: "3-star", label: "3★ or less", key: "ratings", value: 3 },
    { id: "2-star", label: "2★ or less", key: "ratings", value: 2 },
    { id: "1-star", label: "1★", key: "ratings", value: 1 }
  ],
  "KPT delay": [
    { id: "under-10", label: "Under 10 min", key: "kptDelay" },
    { id: "10-20", label: "10–20 min", key: "kptDelay" },
    { id: "20-30", label: "20–30 min", key: "kptDelay" },
    { id: "over-30", label: "Over 30 min", key: "kptDelay" }
  ],
  "Complaints": [
    { id: "order-delayed", label: "Order delayed", key: "complaints" },
    { id: "wrong-items", label: "Wrong items delivered", key: "complaints" },
    { id: "missing-items", label: "Item missing or not delivered", key: "complaints" },
    { id: "poor-taste", label: "Poor taste or quality", key: "complaints" },
    { id: "poor-packaging", label: "Poor packaging or spillage", key: "complaints" },
    { id: "out-of-stock", label: "Item out of stock", key: "complaints" },
    { id: "not-delivered", label: "Order not delivered", key: "complaints" }
  ],
  "Order type": [
    { id: "self-delivery", label: "Self delivery", key: "orderType" },
    { id: "food-rescue", label: "Food rescue", key: "orderType" },
    { id: "large-order", label: "Large order", key: "orderType" },
    { id: "veg-only", label: "Veg only", key: "orderType" },
    { id: "irctc", label: "IRCTC", key: "orderType" },
    { id: "replacement", label: "Replacement", key: "orderType" },
    { id: "hospital", label: "Hospital", key: "orderType" }
  ]
}

export default function AllOrdersPage() {
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const [searchQuery, setSearchQuery] = useState("")
  const [showCalendar, setShowCalendar] = useState(false)
  const [showDateRangePopup, setShowDateRangePopup] = useState(false)
  const [selectedDateRange, setSelectedDateRange] = useState(dateRangeOptions[1]) // Default to "this week"
  const [startDate, setStartDate] = useState(currentWeekDates.start)
  const [endDate, setEndDate] = useState(currentWeekDates.end)
  const calendarRef = useRef(null)

  // Filter states
  const [showFilterPopup, setShowFilterPopup] = useState(false)
  const [activeFilterCategory, setActiveFilterCategory] = useState("Order status")
  const [filterSearch, setFilterSearch] = useState("")
  const [isApplyingFilters, setIsApplyingFilters] = useState(false)
  const [filters, setFilters] = useState({
    orderStatus: [],
    deliveryTiming: [],
    payment: [],
    ratings: [1, 5],
    kptDelay: [],
    complaints: [],
    orderType: []
  })

  // Toast state
  const [showToast, setShowToast] = useState(false)

  // Real data states
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [restaurantData, setRestaurantData] = useState(null)
  const { newOrder } = useRestaurantNotifications()

  // Fetch restaurant data
  useEffect(() => {
    const fetchRestaurantData = async () => {
      try {
        const response = await restaurantAPI.getCurrentRestaurant()
        const data = response?.data?.data?.restaurant || response?.data?.restaurant
        if (data) {
          setRestaurantData(data)
        }
      } catch (err) {
        // Suppress 401 errors as they're handled by axios interceptor
        if (err.response?.status !== 401) {
          debugError('Error fetching restaurant data:', err)
        }
      }
    }
    fetchRestaurantData()
  }, [])

  // Transform API order to component format
  const transformOrder = useCallback((order) => {
    const createdAt = new Date(order.createdAt)
    const date = createdAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    const time = createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })

    // Format address (backend: deliveryAddress)
    const addr = order.deliveryAddress || order.address || null
    const address =
      addr?.formattedAddress ||
      addr?.address ||
      (addr?.street ? `${addr.street}, ${addr.city || ""}`.trim() : "") ||
      "Address not available"

    // Get restaurant name
    const restaurantName = restaurantData?.name || order.restaurantId?.name || 'Restaurant'

    // Get customer name
    const customerName = order.userId?.name || order.customerName || 'Customer'

    // Format items
    const items = (order.items || []).map(item => ({
      name: item.name || 'Item',
      variantName: item.variantName || item.variant?.name || '',
      quantity: item.quantity || 1,
      price: item.price || 0
    }))

    // Determine status (backend: orderStatus)
    let status = (order.orderStatus || order.status || "created").toUpperCase()
    if (status === 'CANCELLED') status = 'CANCELLED'
    else if (status === 'REJECTED') status = 'REJECTED'
    else if (status === 'DELIVERED') status = 'DELIVERED'
    else if (status === 'PREPARING') status = 'PREPARING'
    else if (status === 'READY') status = 'READY'
    else if (status === 'OUT_FOR_DELIVERY' || status === 'OUT FOR DELIVERY') status = 'OUT FOR DELIVERY'

    // Get rejection/cancellation reason
    // Uses statusHistory note first, then falls back to order fields
    let reason = null
    const statusUpper = status.toUpperCase()
    const isCancelled = statusUpper.includes('CANCEL')
    const isRejected = statusUpper.includes('REJECT')

    if (isCancelled || isRejected) {
      // Try to extract a meaningful note from statusHistory
      const cancelEntry = (order.statusHistory || []).slice().reverse().find(h =>
        String(h.to || '').toUpperCase().includes('CANCEL') ||
        String(h.to || '').toUpperCase().includes('REJECT')
      )
      if (cancelEntry?.note) {
        const note = String(cancelEntry.note)
        reason = note.toLowerCase().startsWith('reason') ? note : `Reason: ${note}`
      }

      // Fallback to explicit fields
      if (!reason) {
        if (isRejected && order.rejectionReason) {
          reason = `Rejected by Restaurant: ${order.rejectionReason}`
        } else if (isCancelled && order.cancellationReason) {
          const who = statusUpper.includes('CUSTOMER') ? 'customer' : 'restaurant'
          reason = `Cancelled by ${who}: ${order.cancellationReason}`
        } else if (isRejected) {
          reason = 'Rejected by Restaurant'
        } else if (isCancelled) {
          const who = statusUpper.includes('CUSTOMER') ? 'customer' : 'restaurant'
          reason = `Cancelled by ${who}`
        }
      }
    }

    const fulfillmentType = String(order.fulfillmentType || "").trim().toLowerCase()
    const deliveryType = String(order.deliveryType || "").trim().toLowerCase()
    const isTakeawayOrDining = deliveryType.includes("dine") || deliveryType.includes("take") || deliveryType.includes("pickup") || fulfillmentType === "takeaway" || Boolean(order.pickupAt)
    const isDelivery = !isTakeawayOrDining

    // Determine tags based on order properties
    const tags = []
    if (order.scheduledAt) tags.push('SCHEDULED')
    if (order.sendCutlery) tags.push('CUTLERY')
    if (isDelivery) {
      tags.push('HOME DELIVERY')
    } else if (deliveryType.includes("dine")) {
      tags.push('DINE IN')
    } else {
      tags.push('TAKEAWAY')
    }
    // Check if all items are veg — only show VEG ONLY tag when NOT a pure-veg restaurant
    // (pure-veg restaurants already advertise this; adding the tag per-order is redundant)
    const allVeg = items.every(item => item.isVeg !== false)
    if (allVeg && items.length > 0 && !restaurantData?.pureVegRestaurant) {
      tags.push('VEG ONLY')
    }

    // Delivery assignment info (for non-cancelled delivery orders)
    const deliveryFleetType = String(order.deliveryFleet || '').toLowerCase()
    const selfDeliveryStatus = order.selfDelivery?.status || null
    const selfDeliveryBoyId = order.selfDelivery?.deliveryBoyId
    const dispatchStatus = order.dispatch?.status || null
    const dispatchPartnerId = order.dispatch?.deliveryPartnerId
    const hasDeliveryPartner = !!(selfDeliveryBoyId || dispatchPartnerId)
    // Use selfDelivery status for self-fleet, dispatch status otherwise
    const deliveryAssignmentStatus = (deliveryFleetType === 'self' || selfDeliveryStatus)
      ? selfDeliveryStatus
      : dispatchStatus

    const paymentMethodRaw = String(order.payment?.method || "").toLowerCase()
    const paymentCategory = paymentMethodRaw === "cash" ? "cash" : (paymentMethodRaw ? "online" : "unknown")
    const deliveryTiming = order.scheduledAt ? "scheduled" : "immediate"
    const rating = order.ratings?.restaurant?.rating || order.rating || null
    const prepTime = Number(order.prep_time || 0)

    return {
      id: order.orderId || order._id?.toString() || '',
      status,
      date,
      time,
      restaurant: restaurantName,
      address,
      customer: customerName,
      customerPhone: getOrderCustomerPhone(order),
      isDelivery,
      items,
      totalPrice: order.pricing?.total || 0,
      reason,
      tags: tags.length > 0 ? tags : undefined,
      createdAt: order.createdAt,
      mongoId: order._id?.toString(),
      deliveryAssignmentStatus,
      hasDeliveryPartner,
      paymentCategory,
      deliveryTiming,
      rating,
      prepTime
    }
  }, [restaurantData])

  // Fetch orders from backend
  useEffect(() => {
    const fetchOrders = async () => {
      try {
        setLoading(true)
        setError(null)

        // Build query params
        const params = {
          page: 1,
          limit: 1000 // Get all orders, we'll filter by date on frontend
        }

        // Fetch all orders (we'll filter by date range on frontend)
        const response = await restaurantAPI.getOrders(params)

        if (response.data?.success && response.data.data?.orders) {
          // Transform orders
          const transformedOrders = response.data.data.orders.map(transformOrder)

          // Filter by date range
          const filteredByDate = transformedOrders.filter(order => {
            if (!order.createdAt) return false
            const orderDate = new Date(order.createdAt)
            const start = new Date(startDate)
            start.setHours(0, 0, 0, 0)
            const end = new Date(endDate)
            end.setHours(23, 59, 59, 999)
            return orderDate >= start && orderDate <= end
          })

          setOrders(filteredByDate)
        } else {
          setOrders([])
        }
      } catch (err) {
        // Suppress 401 errors as they're handled by axios interceptor
        if (err.response?.status !== 401) {
          debugError('Error fetching orders:', err)
          setError(err.message || 'Failed to fetch orders')
        }
        setOrders([])
      } finally {
        setLoading(false)
      }
    }

    fetchOrders()
  }, [startDate, endDate, transformOrder])

  // Realtime: instantly prepend new orders (no refresh)
  useEffect(() => {
    if (!newOrder) return
    // Transform & prepend if not already present.
    setOrders((prev) => {
      const id = String(newOrder?.orderId || newOrder?._id || "")
      if (!id) return prev
      if (prev.some((o) => String(o.id) === id || String(o.mongoId) === String(newOrder?._id))) {
        return prev
      }
      const transformed = transformOrder(newOrder)
      return [transformed, ...prev]
    })
  }, [newOrder, transformOrder])

  // Close calendar when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target)) {
        setShowCalendar(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Prevent body scroll when popup is open
  useEffect(() => {
    if (showDateRangePopup || showCalendar || showFilterPopup) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [showDateRangePopup, showCalendar, showFilterPopup])

  const handleDateRangeChange = (start, end) => {
    setStartDate(start)
    setEndDate(end)
    setSelectedDateRange({ label: "custom date range", start, end, custom: true })
    setShowCalendar(false)
  }

  const handleDateRangeSelect = (option) => {
    if (option.custom) {
      setShowDateRangePopup(false)
      setShowCalendar(true)
    } else {
      const dates = option.getDates()
      setSelectedDateRange(option)
      setStartDate(dates.start)
      setEndDate(dates.end)
      setShowDateRangePopup(false)
    }
  }

  const formatDateRange = () => {
    if (!startDate || !endDate) return "Select date range"
    const startMonth = startDate.toLocaleString('en-US', { month: 'short' })
    const endMonth = endDate.toLocaleString('en-US', { month: 'short' })
    const startDay = startDate.getDate()
    const endDay = endDate.getDate()
    const startYear = startDate.getFullYear()
    const endYear = endDate.getFullYear()

    if (startYear !== endYear) {
      return `${startMonth} ${startDay}, ${startYear} – ${endMonth} ${endDay}, ${endYear}`
    }
    if (startMonth !== endMonth) {
      return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${startYear}`
    }
    return `${startMonth} ${startDay} – ${endDay}, ${startYear}`
  }

  const handleCopyOrderId = (orderId, e) => {
    e.stopPropagation()
    navigator.clipboard.writeText(orderId)
    setShowToast(true)
    setTimeout(() => setShowToast(false), 2000)
  }

  const handleFilterToggle = (option) => {
    const key = option.key
    const value = option.id

    // For ratings, do nothing as we use custom range inputs now
    if (key === "ratings") {
      return
    } else {
      // For other filters, allow multiple selections (checkbox behavior)
      setFilters(prev => ({
        ...prev,
        [key]: prev[key].includes(value)
          ? prev[key].filter(v => v !== value)
          : [...prev[key], value]
      }))
    }
  }

  const handleClearFilters = () => {
    setFilters({
      orderStatus: [],
      deliveryTiming: [],
      payment: [],
      ratings: [1, 5],
      kptDelay: [],
      complaints: [],
      orderType: []
    })
    setFilterSearch("")
  }

  const handleApplyFilters = async () => {
    setIsApplyingFilters(true)
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 800))
    setIsApplyingFilters(false)
    setShowFilterPopup(false)
  }

  const isFilterChecked = (option) => {
    return filters[option.key]?.includes(option.id) || false
  }

  const hasActiveFilters = () => {
    return Object.entries(filters).some(([key, val]) => {
      if (key === "ratings") {
        return val && (val[0] > 1 || val[1] < 5)
      }
      return val && val.length > 0
    })
  }

  const getOptionCount = useCallback((option) => {
    const key = option.key
    const value = option.id

    return orders.filter(order => {
      if (key === "orderStatus") {
        const s = order.status
        if (value === 'preparing') return s === 'PREPARING'
        if (value === 'ready') return s === 'READY' || s.includes('READY')
        if (value === 'out-for-delivery') return s.includes('DELIVERY') || s.includes('PICKUP') || s === 'PICKED_UP'
        if (value === 'delivered') return s.includes('DELIVER')
        if (value === 'rejected-by-restaurant') return s.includes('REJECT')
        if (value === 'cancelled-by-restaurant') return s === 'CANCELLED_BY_RESTAURANT'
        if (value === 'cancelled-by-customer') return s === 'CANCELLED_BY_USER' || s === 'CANCELLED_BY_CUSTOMER'
        return false
      }
      if (key === "deliveryTiming") {
        return order.deliveryTiming === value
      }
      if (key === "payment") {
        return order.paymentCategory === value
      }
      if (key === "ratings") {
        return false
      }
      if (key === "kptDelay") {
        const pt = order.prepTime || 0
        if (value === 'under-10') return pt < 10
        if (value === '10-20') return pt >= 10 && pt <= 20
        if (value === '20-30') return pt >= 20 && pt <= 30
        if (value === 'over-30') return pt > 30
        return false
      }
      if (key === "complaints") {
        const orderComplaints = order.complaints || []
        return orderComplaints.includes(value)
      }
      if (key === "orderType") {
        const tagLower = value.toLowerCase().replace(/\s+/g, '-')
        return order.tags?.some(tag => tag.toLowerCase().replace(/\s+/g, '-') === tagLower)
      }
      return false
    }).length
  }, [orders])

  const formatStatusText = (status) => {
    if (!status) return ""
    const normalized = status.toUpperCase().replace(/_/g, " ")
    if (normalized === "CANCELLED BY RESTAURANT") {
      return "Cancelled by Restaurant"
    }
    if (normalized === "CANCELLED BY CUSTOMER") {
      return "Cancelled by Customer"
    }
    return normalized.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
  }

  const getStatusColor = (status) => {
    const normalized = String(status || "").toUpperCase()
    if (normalized.includes("CANCEL") || normalized.includes("REJECT")) {
      return "bg-red-50 text-red-700 border border-red-200"
    }
    if (normalized === "DELIVERED") {
      return "bg-emerald-50 text-emerald-700 border border-emerald-200"
    }
    if (normalized === "PREPARING" || normalized === "READY" || normalized === "PENDING" || normalized === "CREATED") {
      return "bg-amber-50 text-amber-700 border border-amber-200"
    }
    return "bg-gray-50 text-gray-700 border border-gray-200"
  }

  const getTagStyle = (tag) => {
    const normalized = String(tag || "").toUpperCase().trim()

    // Dietary -> green/orange
    if (normalized === "VEG ONLY" || normalized === "VEG") {
      return "bg-emerald-50 text-emerald-700 border border-emerald-200"
    }
    if (normalized === "NON-VEG" || normalized === "NON-VEG ONLY") {
      return "bg-orange-50 text-orange-700 border border-orange-200"
    }

    // Order type -> blue
    if (normalized.includes("DELIVERY") || normalized === "TAKEAWAY" || normalized === "DINE-IN" || normalized === "DINE IN") {
      return "bg-blue-50 text-blue-700 border border-blue-200"
    }

    // Special/Others -> gray/neutral
    return "bg-slate-100 text-slate-600 border border-slate-200"
  }

  const filteredOrders = orders.filter(order => {
    // Search filter - search in order ID, customer, or items
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase().trim()
      const orderIdLower = order.id.toLowerCase()
      const numericPart = order.id.replace(/\D/g, '')
      const customerLower = (order.customer || "").toLowerCase()
      const hasMatchingItem = (order.items || []).some(item =>
        (item.name || "").toLowerCase().includes(searchLower)
      )
      if (!orderIdLower.includes(searchLower) &&
        !numericPart.includes(searchLower) &&
        !customerLower.includes(searchLower) &&
        !hasMatchingItem) {
        return false
      }
    }

    // Order status filter — use includes() because real statuses are e.g. CANCELLED_BY_RESTAURANT
    if (filters.orderStatus.length > 0) {
      const matchesStatus = filters.orderStatus.some(statusId => {
        const s = order.status
        if (statusId === 'preparing') return s === 'PREPARING'
        if (statusId === 'ready') return s === 'READY' || s.includes('READY')
        if (statusId === 'out-for-delivery') return s.includes('DELIVERY') || s.includes('PICKUP') || s === 'PICKED_UP'
        if (statusId === 'delivered') return s.includes('DELIVER')
        if (statusId === 'rejected-by-restaurant') return s.includes('REJECT')
        if (statusId === 'cancelled-by-restaurant') return s === 'CANCELLED_BY_RESTAURANT'
        if (statusId === 'cancelled-by-customer') return s === 'CANCELLED_BY_USER' || s === 'CANCELLED_BY_CUSTOMER'
        return false
      })
      if (!matchesStatus) return false
    }

    // Delivery timing filter
    if (filters.deliveryTiming && filters.deliveryTiming.length > 0) {
      if (!filters.deliveryTiming.includes(order.deliveryTiming)) return false
    }

    // Payment filter
    if (filters.payment && filters.payment.length > 0) {
      if (!filters.payment.includes(order.paymentCategory)) return false
    }

    // Ratings filter range
    if (filters.ratings) {
      const min = filters.ratings[0] || 1
      const max = filters.ratings[1] || 5
      const ratingActive = min > 1 || max < 5
      if (ratingActive) {
        if (!order.rating || order.rating < min || order.rating > max) {
          return false
        }
      }
    }

    // Prep time delay filter
    if (filters.kptDelay && filters.kptDelay.length > 0) {
      const matchesKpt = filters.kptDelay.some(delayId => {
        const pt = order.prepTime || 0
        if (delayId === 'under-10') return pt < 10
        if (delayId === '10-20') return pt >= 10 && pt <= 20
        if (delayId === '20-30') return pt >= 20 && pt <= 30
        if (delayId === 'over-30') return pt > 30
        return false
      })
      if (!matchesKpt) return false
    }

    // Order type filter
    if (filters.orderType.length > 0) {
      const hasMatchingTag = order.tags?.some(tag => {
        const tagLower = tag.toLowerCase().replace(/\s+/g, '-')
        return filters.orderType.includes(tagLower)
      })
      if (!hasMatchingTag) return false
    }

    return true
  })

  return (
    <div className="min-h-screen bg-gray-100 overflow-x-hidden">
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-50">
        <div className="flex flex-col">
          <div className="flex items-start gap-3 w-full min-w-0">
            <button
              onClick={goBack}
              className="p-1 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer text-gray-900 shrink-0 mt-0.5"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold text-gray-900 break-all flex-1 min-w-0 pr-2">
              {restaurantData?.name || 'Restaurant'}
            </h1>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 pl-[48px]">
            Showing order history for
          </p>
        </div>
      </div>

      {/* Search and Filter Section */}
      <div className="px-4 py-4 space-y-3">
        {/* Search Bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by order ID, customer, or item"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={() => setShowFilterPopup(true)}
            className="p-2.5 bg-gray-50 border border-gray-200 hover:bg-gray-100 rounded-lg transition-colors relative"
            aria-label="Filter"
          >
            <Filter className="w-5 h-5 text-gray-900" />
            {hasActiveFilters() && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-white text-xs flex items-center justify-center font-bold" style={{ backgroundColor: RESTAURANT_THEME.brand }}>
                {Object.values(filters).flat().length}
              </span>
            )}
          </button>
        </div>

        {/* Date Range Selector */}
        <button
          onClick={() => setShowDateRangePopup(true)}
          className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <div className="text-left">
            <p className="text-sm font-medium text-gray-900 capitalize">{selectedDateRange.label}</p>
            <p className="text-xs text-gray-500 mt-0.5">{formatDateRange()}</p>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </div>
        </button>
      </div>

      {/* Active Filter Chips */}
      {hasActiveFilters() && (
        <div className="px-4 pb-2">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap items-center gap-2"
          >
            <span className="text-xs text-gray-500 flex items-center gap-1 shrink-0">
              <Filter className="w-3 h-3" />
              Filters:
            </span>
            {Object.values(filterOptions).flat().filter(opt =>
              opt.key !== "ratings" && filters[opt.key]?.includes(opt.id)
            ).map(opt => (
              <button
                key={`${opt.key}-${opt.id}`}
                onClick={() => handleFilterToggle(opt)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-white shrink-0"
                style={{ backgroundColor: RESTAURANT_THEME.brand }}
              >
                {opt.label}
                <X className="w-3 h-3" />
              </button>
            ))}
            {filters.ratings && (filters.ratings[0] > 1 || filters.ratings[1] < 5) && (
              <button
                onClick={() => setFilters(prev => ({ ...prev, ratings: [1, 5] }))}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-white shrink-0"
                style={{ backgroundColor: RESTAURANT_THEME.brand }}
              >
                Rating: {filters.ratings[0]}★ - {filters.ratings[1]}★
                <X className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={handleClearFilters}
              className="ml-auto flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 hover:border-gray-400 transition-colors shrink-0"
            >
              Clear all
            </button>
          </motion.div>
        </div>
      )}

      {/* Orders List */}
      <div className="px-4 pb-24 space-y-3">
        {loading && (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderLeftColor: RESTAURANT_THEME.brand, borderRightColor: RESTAURANT_THEME.brand, borderBottomColor: RESTAURANT_THEME.brand }}></div>
              <p className="text-gray-600 text-sm">Loading orders...</p>
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <div className="flex flex-col items-center gap-3">
              <p className="text-red-600 font-medium text-sm">Error loading orders</p>
              <p className="text-gray-500 text-xs">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && (
          <AnimatePresence mode="popLayout">
            {filteredOrders.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                <div className="flex flex-col items-center gap-3">
                  <p className="text-gray-900 font-medium text-sm">
                    {hasActiveFilters() || searchQuery ? 'No orders match your filters' : 'No orders found'}
                  </p>
                  <p className="text-gray-500 text-xs">
                    {hasActiveFilters() || searchQuery ? 'Try changing or clearing your filters.' : 'Try changing the date range.'}
                  </p>
                </div>
              </div>
            ) : filteredOrders.map((order, index) => (
              <motion.div
                key={order.id}
                layout
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -20 }}
                transition={{
                  duration: 0.3,
                  delay: Math.min(index * 0.05, 0.3),
                  layout: { duration: 0.3 }
                }}
                onClick={() => navigate(`/restaurant/orders/${order.id}`)}
                className="bg-white border border-gray-200 rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow"
              >
                {/* Status and Order ID Row */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2.5 py-1 rounded text-xs font-bold ${getStatusColor(order.status)}`}>
                      {formatStatusText(order.status)}
                    </span>
                    {order.tags && order.tags.map((tag, idx) => (
                      <span key={idx} className={`px-2.5 py-1 rounded text-xs font-bold ${getTagStyle(tag)}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{order.date}, {order.time}</span>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </div>

                {/* Order ID */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base font-bold text-gray-900">{order.id}</span>
                  <button
                    onClick={(e) => handleCopyOrderId(order.id, e)}
                    className="p-1 hover:bg-gray-100 rounded transition-colors"
                    aria-label="Copy order ID"
                  >
                    <Copy className="w-4 h-4 text-gray-500" />
                  </button>
                </div>

                {/* Customer Details */}
                <div className="text-sm text-gray-700 space-y-1 mb-3">
                  <div className="flex items-center gap-1.5 font-medium text-gray-900">
                    <span className="text-gray-500">Customer:</span>
                    <span>{order.customer}</span>
                  </div>
                  {order.customerPhone && (
                    <div className="flex items-center gap-1.5 text-gray-600">
                      <span className="text-gray-500">Phone:</span>
                      <span>{order.customerPhone}</span>
                    </div>
                  )}
                  {order.isDelivery && order.address && (
                    <div className="flex items-start gap-1.5 text-gray-600 mt-1">
                      <span className="text-gray-500 shrink-0">Delivery Address:</span>
                      <span className="break-words font-normal">{order.address}</span>
                    </div>
                  )}
                  {order.isDelivery && !order.status.includes('CANCEL') && !order.status.includes('REJECT') && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-gray-500 text-sm shrink-0">Delivery:</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        order.hasDeliveryPartner
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}>
                        {order.hasDeliveryPartner ? 'Partner assigned' : 'Unassigned'}
                      </span>
                      {order.deliveryAssignmentStatus && (
                        <span className="text-xs text-gray-400 capitalize">
                          · {order.deliveryAssignmentStatus.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="border-t border-dashed border-gray-300 my-3"></div>

                {/* Order Items */}
                <div className="space-y-2">
                  {order.items.slice(0, 1).map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <span className="text-sm text-gray-900">
                        {formatOrderItemQuantityLabel(item)}
                      </span>
                      <span className="text-sm font-medium text-gray-900">{formatMoney(item.price)}</span>
                    </div>
                  ))}
                  {order.items.length > 1 && (
                    <p className="text-sm text-gray-500">+{order.items.length - 1} more items</p>
                  )}
                </div>

                {/* Reason/Status Message */}
                {order.reason && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-sm text-red-600">{order.reason}</p>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Date Range Popup */}
      <AnimatePresence>
        {showDateRangePopup && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/50 z-50"
              onClick={() => setShowDateRangePopup(false)}
            />

            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{
                type: "spring",
                damping: 30,
                stiffness: 300
              }}
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl z-50"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center pt-2 pb-1">
                <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
              </div>

              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                <h2 className="text-lg font-bold text-gray-900">Select date range</h2>
                <button
                  onClick={() => setShowDateRangePopup(false)}
                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 text-gray-900" />
                </button>
              </div>

              <div className="px-4 py-3 pb-6 space-y-2">
                {dateRangeOptions.map((option) => {
                  const isSelected =
                    selectedDateRange?.label?.toLowerCase() === option.label.toLowerCase()

                  return (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => handleDateRangeSelect(option)}
                      className={`w-full flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${isSelected
                          ? ""
                          : "border-gray-200 bg-white hover:bg-gray-50"
                        }`}
                      style={isSelected ? { borderColor: RESTAURANT_THEME.brand, backgroundColor: RESTAURANT_THEME.softBackground } : undefined}
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-900 capitalize">{option.label}</p>
                        {!option.custom && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {(() => {
                              const dates = option.getDates()
                              const start = dates.start.toLocaleDateString("en-US", { day: "numeric", month: "short" })
                              const end = dates.end.toLocaleDateString("en-US", { day: "numeric", month: "short" })
                              return `${start} - ${end}`
                            })()}
                          </p>
                        )}
                      </div>
                      {isSelected && <span className="text-xs font-semibold" style={{ color: RESTAURANT_THEME.brand }}>Selected</span>}
                    </button>
                  )
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Calendar Popup */}
      <AnimatePresence>
        {showCalendar && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/50 z-[60]"
              onClick={() => setShowCalendar(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[60] flex items-center justify-center p-4"
              onClick={() => setShowCalendar(false)}
            >
              <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm">
                <DateRangeCalendar
                  startDate={startDate}
                  endDate={endDate}
                  onDateRangeChange={handleDateRangeChange}
                  onClose={() => setShowCalendar(false)}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Filter Popup */}
      <AnimatePresence>
        {showFilterPopup && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/50 z-50"
              onClick={() => setShowFilterPopup(false)}
            />

            {/* Filter Sheet */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{
                type: "spring",
                damping: 30,
                stiffness: 300
              }}
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl z-50 flex flex-col"
              style={{ height: '65vh' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drag Handle */}
              <div className="flex justify-center pt-2 pb-1">
                <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                <h2 className="text-lg font-bold text-gray-900">Filters</h2>
                <button
                  onClick={() => setShowFilterPopup(false)}
                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 text-gray-900" />
                </button>
              </div>

              {/* Main Content */}
              <div className="flex flex-1 overflow-hidden">
                {/* Sidebar Categories */}
                <div className="w-28 bg-gray-50 border-r border-gray-200 overflow-y-auto">
                  {filterCategories.map((category) => {
                    let count = 0
                    if (category.key === "ratings") {
                      count = (filters.ratings && (filters.ratings[0] > 1 || filters.ratings[1] < 5)) ? 1 : 0
                    } else {
                      count = filters[category.key]?.length || 0
                    }
                    return (
                      <button
                        key={category.id}
                        onClick={() => {
                          setActiveFilterCategory(category.id)
                          setFilterSearch("")
                        }}
                        className={`w-full px-2 py-3 text-left text-xs transition-colors border-b border-gray-200 flex items-center justify-between gap-1 ${activeFilterCategory === category.id
                            ? 'bg-white text-gray-900 font-semibold'
                            : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        style={activeFilterCategory === category.id ? { borderLeft: `3px solid ${RESTAURANT_THEME.brand}` } : undefined}
                      >
                        <span className="leading-tight">{category.label}</span>
                        {count > 0 && (
                          <span className="shrink-0 w-4 h-4 rounded-full text-white text-[10px] flex items-center justify-center font-bold" style={{ backgroundColor: RESTAURANT_THEME.brand }}>
                            {count}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>

                {/* Filter Options */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Options List */}
                  <div className="flex-1 overflow-y-auto px-3 py-2">
                    {activeFilterCategory === "Ratings" ? (
                      <div className="py-4 px-2 space-y-4">
                        <div className="text-sm font-semibold text-gray-700">Filter by Rating Range</div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <label className="text-xs text-gray-500 block mb-1">Minimum Rating</label>
                            <select
                              value={filters.ratings?.[0] || 1}
                              onChange={(e) => {
                                const minVal = Number(e.target.value)
                                const maxVal = filters.ratings?.[1] || 5
                                setFilters(prev => ({
                                  ...prev,
                                  ratings: [minVal, Math.max(minVal, maxVal)]
                                }))
                              }}
                              className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                            >
                              {[1, 2, 3, 4, 5].map(num => (
                                <option key={num} value={num}>{num} ★</option>
                              ))}
                            </select>
                          </div>
                          <span className="text-gray-400 mt-5">to</span>
                          <div className="flex-1">
                            <label className="text-xs text-gray-500 block mb-1">Maximum Rating</label>
                            <select
                              value={filters.ratings?.[1] || 5}
                              onChange={(e) => {
                                const maxVal = Number(e.target.value)
                                const minVal = filters.ratings?.[0] || 1
                                setFilters(prev => ({
                                  ...prev,
                                  ratings: [Math.min(minVal, maxVal), maxVal]
                                }))
                              }}
                              className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                            >
                              {[1, 2, 3, 4, 5].map(num => (
                                <option key={num} value={num}>{num} ★</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500">
                          Showing orders with ratings between {filters.ratings?.[0] || 1}★ and {filters.ratings?.[1] || 5}★.
                        </p>
                      </div>
                    ) : (
                      filterOptions[activeFilterCategory]
                        ?.map((option) => {
                          const isChecked = isFilterChecked(option)

                          return (
                            <label
                              key={option.id}
                              className="flex items-center py-2.5 cursor-pointer hover:bg-gray-50 rounded-lg px-2 transition-colors"
                            >
                              <div className="relative flex items-center justify-center">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleFilterToggle(option)}
                                  className="w-5 h-5 border-2 border-gray-300 rounded cursor-pointer transition-all appearance-none focus:ring-2 focus:ring-offset-2 relative"
                                  style={{
                                    backgroundColor: isChecked ? RESTAURANT_THEME.brand : 'white',
                                    borderColor: isChecked ? RESTAURANT_THEME.brand : '#d1d5db',
                                    backgroundImage: isChecked ? `url("data:image/svg+xml,%3csvg viewBox='0 0 16 16' fill='white' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3e%3c/svg%3e")` : 'none',
                                    backgroundSize: '100% 100%',
                                    backgroundPosition: '50%',
                                    backgroundRepeat: 'no-repeat'
                                  }}
                                />
                              </div>
                              <span className="ml-3 text-sm text-gray-900 flex-1 flex justify-between items-center">
                                <span>{option.label}</span>
                                <span className="text-xs text-gray-400 font-medium bg-gray-100 px-2 py-0.5 rounded-full">({getOptionCount(option)})</span>
                              </span>
                            </label>
                          )
                        })
                    )}
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center gap-3 px-4 py-3 border-t border-gray-200 bg-white">
                <button
                  onClick={handleClearFilters}
                  className="flex-1 px-4 py-2.5 border-2 border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:border-gray-400 active:scale-95 transition-all"
                >
                  Clear all
                </button>
                <button
                  onClick={handleApplyFilters}
                  disabled={isApplyingFilters}
                  className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ backgroundColor: RESTAURANT_THEME.brand }}
                >
                  {isApplyingFilters ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Applying...
                    </>
                  ) : (
                    'Apply'
                  )}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Loading Overlay */}
      <AnimatePresence>
        {isApplyingFilters && !showFilterPopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center"
          >
            <div className="flex flex-col items-center gap-3">
              <svg className="animate-spin h-10 w-10" style={{ color: RESTAURANT_THEME.brand }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="text-sm font-medium text-gray-900">Applying filters...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notification - single line, brand background */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            transition={{ duration: 0.25 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-60 text-white px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2 whitespace-nowrap"
            style={{ backgroundColor: RESTAURANT_THEME.brand }}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm font-medium">Order ID copied to clipboard</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
