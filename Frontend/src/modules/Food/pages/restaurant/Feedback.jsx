import { useState, useEffect, useRef } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Bell, HelpCircle, Menu, Search, SlidersHorizontal, Calendar, ChevronLeft, ChevronDown, X, Loader2, ChevronRight, Star, RefreshCw } from "lucide-react"
import { DateRangeCalendar } from "@food/components/ui/date-range-calendar"
import BottomNavOrders from "@food/components/restaurant/BottomNavOrders"
import { restaurantAPI } from "@food/api"
import { RESTAURANT_THEME } from "@food/constants/restaurantTheme"
import BottomPopup from "@food/components/BottomPopup"

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const REVIEWS_STORAGE_KEY = "restaurant_reviews_data"

const tabs = [
  { id: "complaints", label: "Complaints" },
  { id: "reviews", label: "Reviews" },
]

const dateRangeLabels = {
  all: "All Time",
  today: "Today",
  yesterday: "Yesterday",
  thisWeek: "This Week",
  lastWeek: "Last Week",
  thisMonth: "This Month",
  lastMonth: "Last Month",
  last5days: "Last 5 Days",
  custom: "Custom Range"
}

const normalizeOrderStatus = (order) =>
  String(order?.status || order?.orderStatus || "").toLowerCase()

const normalizeRating = (value) => {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  if (parsed <= 0) return null
  return Math.min(5, Math.round(parsed * 10) / 10)
}

const extractReviewRating = (order) =>
  normalizeRating(
    order?.review?.rating ??
      order?.ratings?.restaurant?.rating ??
      order?.feedback?.rating ??
      order?.rating
  )

const extractReviewText = (order) => {
  const raw =
    order?.review?.comment ??
    order?.review?.text ??
    order?.ratings?.restaurant?.comment ??
    order?.feedback?.comment ??
    order?.feedback?.text ??
    ""
  const normalized = String(raw || "").trim()
  return normalized || "No review text"
}

const toComparableId = (value) =>
  String(value?._id || value || "").trim()

export default function Feedback() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = searchParams.get("tab")
  const [activeTab, setActiveTab] = useState(tabFromUrl === "complaints" ? "complaints" : "reviews")
  const navigate = useNavigate()
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  
  // Update active tab when URL param changes
  useEffect(() => {
    if (tabFromUrl === "complaints") {
      setActiveTab("complaints")
    } else {
      setActiveTab("reviews")
    }
  }, [tabFromUrl])
  
  // Swipe gesture refs
  const touchStartX = useRef(0)
  const touchEndX = useRef(0)
  const touchStartY = useRef(0)
  const isSwiping = useRef(false)
  
  const feedbackTabs = ["complaints", "reviews"]
  const [reviews, setReviews] = useState([])
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [selectedFilterCategory, setSelectedFilterCategory] = useState("duration")
  const [filterValues, setFilterValues] = useState({
    duration: null,
    sortBy: "newest",
    reviewType: []
  })
  const [isFilterLoading, setIsFilterLoading] = useState(false)
  const [displayedReviews, setDisplayedReviews] = useState([])
  
  const [isComplaintsFilterOpen, setIsComplaintsFilterOpen] = useState(false)
  const [selectedComplaintsFilterCategory, setSelectedComplaintsFilterCategory] = useState("issueType")
  const [complaintsFilterValues, setComplaintsFilterValues] = useState({
    issueType: [],
    reasons: []
  })
  const [complaintsSearchQuery, setComplaintsSearchQuery] = useState("")
  const [reviewsSearchQuery, setReviewsSearchQuery] = useState("")
  
  const [isDateSelectorOpen, setIsDateSelectorOpen] = useState(false)
  const [selectedDateRange, setSelectedDateRange] = useState("all") 
  const [customDateRange, setCustomDateRange] = useState({ start: null, end: null })
  const [isCustomDateOpen, setIsCustomDateOpen] = useState(false)
  const [isComplaintsLoading, setIsComplaintsLoading] = useState(false)
  const [complaints, setComplaints] = useState([])

  const [restaurantData, setRestaurantData] = useState(null)
  const [isLoadingRestaurant, setIsLoadingRestaurant] = useState(true)
  const [isLoadingReviews, setIsLoadingReviews] = useState(true)
  const [ratingSummary, setRatingSummary] = useState({
    averageRating: 0,
    totalRatings: 0,
    totalReviews: 0
  })

  useEffect(() => {
    const fetchRestaurantData = async () => {
      try {
        setIsLoadingRestaurant(true)
        const response = await restaurantAPI.getCurrentRestaurant()
        if (response.data?.success && response.data.data?.restaurant) {
          setRestaurantData(response.data.data.restaurant)
        }
      } catch (error) {
        debugError("Error fetching restaurant data:", error)
      } finally {
        setIsLoadingRestaurant(false)
      }
    }
    fetchRestaurantData()
  }, [])

  useEffect(() => {
    const fetchComplaints = async () => {
      if (activeTab !== 'complaints') return
      
      try {
        setIsComplaintsLoading(true)
        const dateRanges = getDateRanges()
        let fromDate = null
        let toDate = null

        switch (selectedDateRange) {
          case 'today':
            fromDate = dateRanges.today
            toDate = new Date()
            break
          case 'yesterday':
            fromDate = dateRanges.yesterday
            toDate = new Date(dateRanges.yesterday)
            toDate.setHours(23, 59, 59, 999)
            break
          case 'thisWeek':
            fromDate = dateRanges.thisWeekStart
            toDate = new Date()
            toDate.setHours(23, 59, 59, 999)
            break
          case 'lastWeek':
            fromDate = dateRanges.lastWeekStart
            toDate = dateRanges.lastWeekEnd
            break
          case 'thisMonth':
            fromDate = dateRanges.thisMonthStart
            toDate = new Date()
            toDate.setHours(23, 59, 59, 999)
            break
          case 'lastMonth':
            fromDate = dateRanges.lastMonthStart
            toDate = dateRanges.lastMonthEnd
            break
          case 'last5days':
            fromDate = dateRanges.last5DaysStart
            toDate = new Date()
            toDate.setHours(23, 59, 59, 999)
            break
          case 'custom':
            if (customDateRange.start && customDateRange.end) {
              fromDate = new Date(customDateRange.start)
              fromDate.setHours(0, 0, 0, 0)
              toDate = new Date(customDateRange.end)
              toDate.setHours(23, 59, 59, 999)
            }
            break;
          case 'all':
            fromDate = null
            toDate = null
            break
        }

        const params = {}
        if (fromDate) params.fromDate = fromDate.toISOString()
        if (toDate) params.toDate = toDate.toISOString()
        if (complaintsFilterValues.issueType?.length > 0) {
          params.complaintType = complaintsFilterValues.issueType[0]
        }
        if (complaintsSearchQuery) params.search = complaintsSearchQuery

        const response = await restaurantAPI.getComplaints(params)
        if (response?.data?.success && response.data.data?.complaints) {
          setComplaints(response.data.data.complaints)
        } else {
          setComplaints([])
        }
      } catch (error) {
        debugError('Error fetching complaints:', error)
        setComplaints([])
      } finally {
        setIsComplaintsLoading(false)
      }
    }

    fetchComplaints()
  }, [activeTab, selectedDateRange, customDateRange, complaintsFilterValues, complaintsSearchQuery, refreshTrigger])

  useEffect(() => {
    const fetchReviews = async () => {
      try {
        setIsLoadingReviews(true)
        let allOrders = []
        let page = 1
        let hasMore = true
        const limit = 1000
        const maxPages = 50

        while (hasMore && page <= maxPages) {
          try {
            const response = await restaurantAPI.getOrders({ 
              page, 
              limit,
              status: 'delivered'
            })
            
            if (response.data?.success && response.data.data?.orders) {
              const orders = response.data.data.orders
              allOrders = [...allOrders, ...orders]
              const totalPages = response.data.data.pagination?.totalPages || response.data.data.totalPages || 1
              if (orders.length < limit || (totalPages > 0 && page >= totalPages)) {
                hasMore = false
              } else {
                page++
              }
            } else {
              hasMore = false
            }
          } catch (pageError) {
            hasMore = false
          }
        }

        const transformedReviews = allOrders
          .filter(order => normalizeOrderStatus(order) === 'delivered')
          .map((order, index) => {
            const orderDate = new Date(order.createdAt || order.deliveredAt || Date.now())
            const day = orderDate.getDate()
            const month = orderDate.toLocaleDateString('en-GB', { month: 'short' })
            const year = orderDate.getFullYear()
            const formattedDate = `${day} ${month}, ${year}`

            const userName = order.userId?.name || order.customerName || 'Customer'
            const userImage = order.userId?.profileImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=random`
            const outlet = order.restaurantName || (restaurantData?.name) || 'Restaurant'

            const rating = extractReviewRating(order)
            const reviewText = extractReviewText(order)

            const userOrdersCount = allOrders.filter(o => toComparableId(o.userId) === toComparableId(order.userId)).length

            return {
              id: order._id || order.orderId || `review-${index}`,
              orderNumber: order.orderId || order.orderNumber || String(index),
              outlet: outlet,
              userName: userName,
              userImage: userImage,
              ordersCount: userOrdersCount,
              rating: rating,
              date: formattedDate,
              rawDate: orderDate,
              reviewText: reviewText,
              orderData: order
            }
          })
          .filter(review => review.rating !== null || (review.reviewText && review.reviewText !== 'No review text'))

        const ratings = transformedReviews.map(r => r.rating).filter(r => r !== null)
        const averageRating = ratings.length > 0 ? (ratings.reduce((sum, r) => sum + r, 0) / ratings.length).toFixed(1) : 0
        
        setRatingSummary({
          averageRating: parseFloat(averageRating),
          totalRatings: ratings.length,
          totalReviews: transformedReviews.length
        })
        setReviews(transformedReviews)
      } catch (error) {
        debugError("Error fetching reviews:", error)
      } finally {
        setIsLoadingReviews(false)
      }
    }

    if (!isLoadingRestaurant) fetchReviews()
  }, [isLoadingRestaurant, restaurantData, refreshTrigger])

  useEffect(() => {
    let filtered = [...reviews]
    
    // Date Filtering
    const dateRanges = getDateRanges()
    let fromDate = null
    let toDate = null

    const endOfToday = new Date()
    endOfToday.setHours(23, 59, 59, 999)

    switch (selectedDateRange) {
      case 'today': fromDate = dateRanges.today; toDate = endOfToday; break
      case 'yesterday': fromDate = dateRanges.yesterday; toDate = new Date(dateRanges.yesterday); toDate.setHours(23, 59, 59, 999); break
      case 'thisWeek': fromDate = dateRanges.thisWeekStart; toDate = endOfToday; break
      case 'lastWeek': fromDate = dateRanges.lastWeekStart; toDate = dateRanges.lastWeekEnd; break
      case 'thisMonth': fromDate = dateRanges.thisMonthStart; toDate = endOfToday; break
      case 'lastMonth': fromDate = dateRanges.lastMonthStart; toDate = dateRanges.lastMonthEnd; break
      case 'last5days': fromDate = dateRanges.last5DaysStart; toDate = endOfToday; break
      case 'custom': 
        if (customDateRange.start && customDateRange.end) { 
          fromDate = new Date(customDateRange.start)
          fromDate.setHours(0, 0, 0, 0)
          toDate = new Date(customDateRange.end)
          toDate.setHours(23, 59, 59, 999)
        }; 
        break;
      case 'all': fromDate = null; toDate = null; break
    }

    if (fromDate && toDate) {
      filtered = filtered.filter(review => {
        if (!review.rawDate) return true
        const d = new Date(review.rawDate)
        if (isNaN(d.getTime())) return true
        return d >= fromDate && d <= toDate
      })
    }

    if (reviewsSearchQuery) {
      const query = reviewsSearchQuery.toLowerCase()
      filtered = filtered.filter(review => 
        review.userName.toLowerCase().includes(query) || 
        review.reviewText.toLowerCase().includes(query) ||
        review.orderNumber.toLowerCase().includes(query)
      )
    }

    if (filterValues.sortBy) {
      filtered.sort((a, b) => {
        const dateA = new Date(a.rawDate); const dateB = new Date(b.rawDate)
        if (filterValues.sortBy === "newest") return dateB - dateA
        if (filterValues.sortBy === "oldest") return dateA - dateB
        if (filterValues.sortBy === "bestRated") return (b.rating ?? 0) - (a.rating ?? 0)
        if (filterValues.sortBy === "worstRated") return (a.rating ?? 0) - (b.rating ?? 0)
        return 0
      })
    }
    setDisplayedReviews(filtered)
  }, [reviews, filterValues, reviewsSearchQuery, selectedDateRange, customDateRange])

  const handleFilterReset = () => { setFilterValues({ duration: null, sortBy: "newest", reviewType: [] }); setIsFilterOpen(false) }
  const handleFilterApply = () => { setIsFilterOpen(false) }

  const formatDate = (date) => {
    const day = date.getDate()
    const month = date.toLocaleString('en-US', { month: 'short' })
    const year = date.getFullYear()
    return `${day} ${month} ${year}`
  }
  const formatDateShort = (date) => {
    const day = date.getDate()
    const month = date.toLocaleString('en-US', { month: 'short' })
    return `${day} ${month}`
  }

  const getDateRanges = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    
    const last5DaysStart = new Date(today)
    last5DaysStart.setDate(last5DaysStart.getDate() - 4)
    
    const thisWeekStart = new Date(today)
    const day = today.getDay()
    const diff = today.getDate() - day + (day === 0 ? -6 : 1)
    thisWeekStart.setDate(diff)
    
    const lastWeekStart = new Date(thisWeekStart)
    lastWeekStart.setDate(lastWeekStart.getDate() - 7)
    const lastWeekEnd = new Date(thisWeekStart)
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 1)
    lastWeekEnd.setHours(23, 59, 59, 999)
    
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
    lastMonthEnd.setHours(23, 59, 59, 999)
    
    return { 
      today, 
      yesterday, 
      thisWeekStart, 
      thisWeekEnd: new Date(), 
      lastWeekStart, 
      lastWeekEnd, 
      thisMonthStart, 
      thisMonthEnd: new Date(), 
      lastMonthStart, 
      lastMonthEnd, 
      last5DaysStart, 
      last5DaysEnd: new Date() 
    }
  }

  const handleComplaintsFilterApply = () => { setIsComplaintsFilterOpen(false) }
  const handleComplaintsFilterReset = () => { setComplaintsFilterValues({ issueType: [], reasons: [] }); setComplaintsSearchQuery("") }

  const handleDateRangeSelect = (range) => {
    setSelectedDateRange(range)
    if (range === "custom") setIsCustomDateOpen(true)
    else { 
      setIsDateSelectorOpen(false); 
    }
  }

  const handleCustomDateApply = () => { 
    setIsCustomDateOpen(false); 
    setIsDateSelectorOpen(false); 
  }

  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; touchStartY.current = e.touches[0].clientY; isSwiping.current = false }
  const handleTouchMove = (e) => {
    const deltaX = Math.abs(e.touches[0].clientX - touchStartX.current)
    const deltaY = Math.abs(e.touches[0].clientY - touchStartY.current)
    if (deltaX > deltaY && deltaX > 10) isSwiping.current = true
    if (isSwiping.current) touchEndX.current = e.touches[0].clientX
  }
  const handleTouchEnd = () => {
    if (!isSwiping.current) return
    const swipeDistance = touchStartX.current - touchEndX.current
    if (Math.abs(swipeDistance) > 50) {
      if (swipeDistance > 0) setActiveTab("reviews")
      else setActiveTab("complaints")
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      <div className="sticky bg-white top-0 z-40 px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/food/restaurant/explore")}
              className="p-2 rounded-xl hover:bg-gray-100 active:scale-95 transition-all cursor-pointer border border-gray-100 shadow-sm"
              aria-label="Back to explore"
            >
              <ChevronLeft className="w-5 h-5 text-gray-700" />
            </button>
            <div>
              <p className="text-[10px] tracking-wider text-gray-500 uppercase">Showing data for</p>
              <p className="text-md font-bold text-gray-900">{restaurantData?.name || "Restaurant"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setRefreshTrigger(prev => prev + 1);
                toast.success("Refreshing feedback data...");
              }}
              className={`p-1 rounded-full hover:bg-gray-100 active:scale-95 transition-all cursor-pointer ${
                (isComplaintsLoading || isLoadingReviews) ? "animate-spin" : ""
              }`}
              aria-label="Refresh feedback"
            >
              <RefreshCw className="w-6 h-6 text-gray-700 cursor-pointer" />
            </button>
            <button
              type="button"
              onClick={() => navigate("/food/restaurant/notifications")}
              className="p-1 rounded-full hover:bg-gray-100 active:scale-95 transition-all cursor-pointer"
              aria-label="Open notifications"
            >
              <Bell className="w-6 h-6 text-gray-700 cursor-pointer" />
            </button>
            <button
              type="button"
              onClick={() => navigate("/food/restaurant/help-centre/support")}
              className="p-1 rounded-full hover:bg-gray-100 active:scale-95 transition-all cursor-pointer"
              aria-label="Open support"
            >
              <HelpCircle className="w-6 h-6 text-gray-700 cursor-pointer" />
            </button>
            <button
              type="button"
              onClick={() => navigate("/food/restaurant/explore")}
              className="p-1 rounded-full hover:bg-gray-100 active:scale-95 transition-all cursor-pointer"
              aria-label="Open explore"
            >
              <Menu className="w-6 h-6 text-gray-700 cursor-pointer" />
            </button>
          </div>
        </div>
        
        <div className="flex gap-2 mt-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-2 rounded-full text-sm font-bold transition-all cursor-pointer ${
                activeTab === tab.id ? "text-white" : "bg-white text-gray-600 border border-gray-200"
              }`}
              style={activeTab === tab.id ? { backgroundColor: RESTAURANT_THEME.brand } : undefined}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-4">
        {activeTab === "complaints" ? (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
              {/* Search Bar */}
              <div className="flex-1 bg-white h-20 sm:h-12 px-6 sm:px-4 rounded-full border border-gray-200 flex items-center gap-4 sm:gap-2 shadow-md sm:shadow-sm transition-all focus-within:border-[#00c87e] focus-within:ring-4 focus-within:ring-[#00c87e]/10">
                <Search className="w-6 h-6 sm:w-4 sm:h-4 text-gray-400 shrink-0" />
                <input 
                  type="text" 
                  value={complaintsSearchQuery}
                  onChange={(e) => setComplaintsSearchQuery(e.target.value)}
                  placeholder="Search complaints..." 
                  className="flex-1 text-lg sm:text-xs bg-transparent focus:outline-none placeholder:text-gray-400 min-w-0 font-medium sm:font-normal" 
                />
              </div>

              <div className="flex items-center gap-2">
                {/* Date Selector */}
                <button 
                  onClick={() => setIsDateSelectorOpen(true)} 
                  className="flex-1 sm:flex-none sm:w-56 bg-white h-12 px-3 rounded-xl border border-gray-200 flex items-center justify-between gap-2 shadow-sm cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Calendar className="w-4 h-4 text-gray-500 shrink-0" />
                    <span className="text-[10px] font-black text-gray-900 truncate uppercase tracking-tight">
                      {dateRangeLabels[selectedDateRange] || selectedDateRange}
                    </span>
                  </div>
                  <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />
                </button>

                {/* Filter Button */}
                <button 
                  onClick={() => setIsComplaintsFilterOpen(true)} 
                  className="bg-white w-12 h-12 rounded-xl border border-gray-200 flex items-center justify-center shadow-sm shrink-0 cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <SlidersHorizontal className="w-5 h-5 text-gray-900" />
                </button>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {isComplaintsLoading ? (
                <div className="flex justify-center p-10"><Loader2 className="animate-spin text-gray-400" /></div>
              ) : complaints.length === 0 ? (
                <div className="text-center py-20 bg-gray-50 rounded-3xl border border-dashed border-gray-200">
                  <p className="text-sm text-gray-500 font-medium">No recent complaints</p>
                </div>
              ) : (
                <div className="space-y-4 pb-20">
                  {complaints.map((complaint) => (
                    <div key={complaint._id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3">
                      <div className="flex justify-between items-center">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${
                          complaint.status === 'open' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'
                        }`}>{complaint.status || 'open'}</span>
                        <span className="text-[10px] text-gray-400 font-bold">{new Date(complaint.createdAt).toLocaleDateString()}</span>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-400">
                          {complaint.userId?.name?.[0] || 'U'}
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 text-sm break-all whitespace-normal">{complaint.userId?.name || 'Customer'}</p>
                          <p className="text-[10px] text-gray-500 font-bold uppercase">Order #{complaint.orderId?.orderId || 'N/A'}</p>
                        </div>
                      </div>

                      <div className="bg-gray-50 rounded-xl p-3 relative">
                        <p className="text-[10px] font-black text-red-500 uppercase mb-1">{complaint.issueType}</p>
                        <p className="text-sm text-gray-800 font-semibold leading-relaxed break-all whitespace-normal">{complaint.description}</p>
                      </div>

                      {complaint.adminResponse && (
                        <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                          <p className="text-[9px] font-black text-blue-600 uppercase mb-1">Admin Response</p>
                          <p className="text-sm text-blue-900 font-medium break-all whitespace-normal">{complaint.adminResponse}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
              {/* Search Bar */}
              <div className="flex-1 bg-white h-20 sm:h-12 px-6 sm:px-4 rounded-full border border-gray-200 flex items-center gap-4 sm:gap-2 shadow-md sm:shadow-sm transition-all focus-within:border-[#00c87e] focus-within:ring-4 focus-within:ring-[#00c87e]/10">
                <Search className="w-6 h-6 sm:w-4 sm:h-4 text-gray-400 shrink-0" />
                <input 
                  type="text" 
                  value={reviewsSearchQuery}
                  onChange={(e) => setReviewsSearchQuery(e.target.value)}
                  placeholder="Search reviews..." 
                  className="flex-1 text-lg sm:text-xs bg-transparent focus:outline-none placeholder:text-gray-400 min-w-0 font-medium sm:font-normal" 
                />
              </div>

              <div className="flex items-center gap-2">
                {/* Date Selector */}
                <button 
                  onClick={() => setIsDateSelectorOpen(true)} 
                  className="flex-1 sm:flex-none sm:w-56 bg-white h-12 px-3 rounded-xl border border-gray-200 flex items-center justify-between gap-2 shadow-sm cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Calendar className="w-4 h-4 text-gray-500 shrink-0" />
                    <span className="text-[10px] font-black text-gray-900 truncate uppercase tracking-tight">
                      {dateRangeLabels[selectedDateRange] || selectedDateRange}
                    </span>
                  </div>
                  <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />
                </button>

                {/* Filter Button */}
                <button 
                  onClick={() => setIsFilterOpen(true)} 
                  className="bg-white w-12 h-12 rounded-xl border border-gray-200 flex items-center justify-center shadow-sm shrink-0 cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <SlidersHorizontal className="w-5 h-5 text-gray-900" />
                </button>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {isLoadingReviews ? (
                <div className="flex justify-center p-10"><Loader2 className="animate-spin text-gray-400" /></div>
              ) : displayedReviews.length === 0 ? (
                <div className="text-center py-20 bg-gray-50 rounded-3xl border border-dashed border-gray-200">
                  <p className="text-sm text-gray-500 font-medium">No recent reviews</p>
                </div>
              ) : (
                <div className="space-y-4 pb-20">
                  {displayedReviews.map((review) => (
                    <div key={review.id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3">
                      <div className="flex items-center justify-between text-[10px] text-gray-400 font-bold uppercase">
                        <span>Order #{review.orderNumber}</span>
                        <span>{review.date}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <img src={review.userImage} className="w-8 h-8 rounded-full border border-gray-100" />
                        <p className="font-bold text-gray-900 text-sm break-all whitespace-normal">{review.userName}</p>
                        <div
                          className="ml-auto flex items-center gap-1 text-white px-1.5 py-0.5 rounded text-[10px] font-bold"
                          style={{ backgroundColor: RESTAURANT_THEME.brand }}
                        >
                          {review.rating} <Star className="w-2 h-2 fill-current" />
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-sm text-gray-800 font-medium italic break-all whitespace-normal">"{review.reviewText}"</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
      <BottomNavOrders />

      {/* Date Range Selector Popup */}
      <BottomPopup isOpen={isDateSelectorOpen} onClose={() => setIsDateSelectorOpen(false)} title="Select date range">
        <div className="p-4 space-y-1">
          {Object.entries(dateRangeLabels).map(([key, label]) => (
            <button
              key={key}
              onClick={() => handleDateRangeSelect(key)}
              className={`w-full text-left p-3 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                selectedDateRange === key ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </BottomPopup>

      {/* Custom Date Selector */}
      <BottomPopup isOpen={isCustomDateOpen} onClose={() => setIsCustomDateOpen(false)} title="Select custom range">
        <div className="p-4 flex flex-col gap-4">
          <DateRangeCalendar
            startDate={customDateRange.start}
            endDate={customDateRange.end}
            onDateRangeChange={(start, end) => setCustomDateRange({ start, end })}
          />
          <button
            onClick={handleCustomDateApply}
            className="w-full bg-black text-white py-4 rounded-2xl text-sm font-bold active:scale-95 transition-all cursor-pointer"
          >
            Apply Range
          </button>
        </div>
      </BottomPopup>

      {/* Complaints Filter Popup */}
      <BottomPopup isOpen={isComplaintsFilterOpen} onClose={() => setIsComplaintsFilterOpen(false)} title="Filter complaints">
        <div className="p-4 space-y-6">
          <div>
            <p className="text-xs font-black text-gray-400 uppercase mb-3">Issue Type</p>
            <div className="flex flex-wrap gap-2">
              {['Item missing', 'Wrong item', 'Not delivered', 'Payment issue'].map((type) => (
                <button
                  key={type}
                  onClick={() => setComplaintsFilterValues(prev => ({
                    ...prev,
                    issueType: prev.issueType.includes(type) ? [] : [type]
                  }))}
                  className={`px-4 py-2 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                    complaintsFilterValues.issueType.includes(type)
                      ? "bg-black text-white border-black"
                      : "bg-white text-gray-600 border-gray-200"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleComplaintsFilterReset}
              className="flex-1 py-4 rounded-2xl text-sm font-bold text-gray-500 hover:bg-gray-50 cursor-pointer"
            >
              Reset
            </button>
            <button
              onClick={handleComplaintsFilterApply}
              className="flex-1 bg-black text-white py-4 rounded-2xl text-sm font-bold active:scale-95 transition-all cursor-pointer"
            >
              Apply Filter
            </button>
          </div>
        </div>
      </BottomPopup>

      {/* Reviews Filter Popup */}
      <BottomPopup isOpen={isFilterOpen} onClose={() => setIsFilterOpen(false)} title="Filter reviews">
        <div className="p-4 space-y-6">
          <div>
            <p className="text-xs font-black text-gray-400 uppercase mb-3">Sort By</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'newest', label: 'Newest first' },
                { id: 'oldest', label: 'Oldest first' },
                { id: 'bestRated', label: 'Best rated' },
                { id: 'worstRated', label: 'Worst rated' }
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() => setFilterValues(prev => ({ ...prev, sortBy: option.id }))}
                  className={`p-3 rounded-xl text-xs font-bold border text-center transition-all cursor-pointer ${
                    filterValues.sortBy === option.id
                      ? "bg-black text-white border-black"
                      : "bg-white text-gray-600 border-gray-200"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleFilterReset}
              className="flex-1 py-4 rounded-2xl text-sm font-bold text-gray-500 hover:bg-gray-50 cursor-pointer"
            >
              Reset
            </button>
            <button
              onClick={handleFilterApply}
              className="flex-1 bg-black text-white py-4 rounded-2xl text-sm font-bold active:scale-95 transition-all cursor-pointer"
            >
              Apply
            </button>
          </div>
        </div>
      </BottomPopup>
    </div>
  )
}
