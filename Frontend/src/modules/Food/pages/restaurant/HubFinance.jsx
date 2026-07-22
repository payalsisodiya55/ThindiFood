import { useState, useMemo, useRef, useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { motion, AnimatePresence } from "framer-motion"
import { Bell, Menu, ChevronDown, Calendar, Download, ArrowRight, FileText, Wallet, X, ArrowLeft } from "lucide-react"
import BottomNavOrders from "@food/components/restaurant/BottomNavOrders"
import { restaurantAPI } from "@food/api"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}
const formatRoundedCurrency = (amount) => {
  const n = Number(amount) || 0
  return n.toFixed(2)
}

const getRestaurantItemAmount = (order) => {
  const pricing = order?.pricing || {}
  const candidates = [
    pricing?.subtotal,
    pricing?.itemsTotal,
    pricing?.itemSubtotal,
    order?.itemSubtotal,
    order?.subtotal,
    order?.commissionBaseAmount,
    pricing?.commissionBaseAmount,
    order?.restaurantGrossBeforeDiscount,
  ]

  for (const value of candidates) {
    const amount = Number(value)
    if (Number.isFinite(amount) && amount > 0) {
      return amount
    }
  }

  if (Array.isArray(order?.items)) {
    return order.items.reduce((sum, item) => {
      const price = Number(item?.price || 0)
      const quantity = Number(item?.quantity || 1)
      return sum + (Number.isFinite(price) ? price : 0) * (Number.isFinite(quantity) ? quantity : 1)
    }, 0)
  }

  return 0
}

const formatCurrencyByOrder = (order, amount) =>
  order?.sourceModule === "dining"
    ? formatRoundedCurrency(amount)
    : Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })


export default function HubFinance() {
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = searchParams.get("tab")
    return tabParam === "invoices" ? "invoices" : "payouts"
  })
  const [selectedDateRange, setSelectedDateRange] = useState("Last 30 days")
  const [selectedPresetLabel, setSelectedPresetLabel] = useState("Last 30 Days")
  const [showDownloadMenu, setShowDownloadMenu] = useState(false)
  const [showDateRangePicker, setShowDateRangePicker] = useState(false)
  const downloadMenuRef = useRef(null)
  const dateRangePickerRef = useRef(null)
  const [financeData, setFinanceData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pastCyclesData, setPastCyclesData] = useState(null)
  const [loadingPastCycles, setLoadingPastCycles] = useState(false)
  const [restaurantData, setRestaurantData] = useState(null)
  const [loadingRestaurant, setLoadingRestaurant] = useState(true)
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false)
  const [withdrawalAmount, setWithdrawalAmount] = useState('')
  const [submittingWithdrawal, setSubmittingWithdrawal] = useState(false)
  const [withdrawalRequests, setWithdrawalRequests] = useState([])
  const [loadingWithdrawals, setLoadingWithdrawals] = useState(false)

  // Custom Date Range Pickers
  const [customRangeActive, setCustomRangeActive] = useState(false)
  const [customStartDate, setCustomStartDate] = useState(null)  // Date object or null
  const [customEndDate, setCustomEndDate] = useState(null)        // Date object or null
  // Calendar navigation state
  const [calStartViewDate, setCalStartViewDate] = useState(new Date())
  const [calEndViewDate, setCalEndViewDate] = useState(new Date())
  const [calPickingEnd, setCalPickingEnd] = useState(false) // false = picking start, true = picking end

  const applyCustomRange = () => {
    if (!customStartDate || !customEndDate) {
      toast.error("Please select both start and end dates")
      return
    }
    const start = new Date(customStartDate)
    const end = new Date(customEndDate)
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
    if (start > end) {
      toast.error("Start date must be before end date")
      return
    }

    const formatDateForDisplay = (d) => {
      const day = d.getDate()
      const month = d.toLocaleString('en-US', { month: 'short' })
      const year = d.getFullYear().toString().slice(-2)
      return `${day} ${month}'${year}`
    }

    const displayStr = `${formatDateForDisplay(start)} - ${formatDateForDisplay(end)}`
    setSelectedDateRange(displayStr)
    setSelectedPresetLabel('Custom Range')
    setShowDateRangePicker(false)
    setCustomRangeActive(false)
    fetchPastCyclesData(start, end)
  }

  // Fetch finance data on mount
  useEffect(() => {
    const fetchFinanceData = async () => {
      try {
        setLoading(true)
        const response = await restaurantAPI.getFinance()
        console.log("[HubFinance] GET /food/restaurant/finance raw response:", response?.data)
        if (response.data?.success && response.data?.data) {
          const data = response.data.data
          setFinanceData(data)
          console.log("[HubFinance] finance payload:", data)
          console.log("[HubFinance] currentCycle:", data?.currentCycle)
          console.log("[HubFinance] currentCycle.orders:", data?.currentCycle?.orders)
          console.log("[HubFinance] invoiceSummary:", data?.invoiceSummary)
          debugLog('? Finance data fetched:', data)
        }
      } catch (error) {
        // Suppress 401 errors as they're handled by axios interceptor (token refresh/redirect)
        if (error.response?.status !== 401) {
          debugError('? Error fetching finance data:', error)
        }
      } finally {
        setLoading(false)
      }
    }

    fetchFinanceData()
  }, [])

  useEffect(() => {
    const fetchWithdrawals = async () => {
      try {
        setLoadingWithdrawals(true)
        const response = await restaurantAPI.getWithdrawalHistory()
        console.log("[HubFinance] GET /food/restaurant/withdrawals raw response:", response?.data)
        const payload = response?.data?.data
        const list = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.withdrawals)
            ? payload.withdrawals
            : []
        setWithdrawalRequests(list)
        console.log("[HubFinance] withdrawal list:", list)
      } catch (error) {
        if (error?.response?.status !== 401) {
          debugError('Error fetching withdrawal history:', error)
        }
        setWithdrawalRequests([])
      } finally {
        setLoadingWithdrawals(false)
      }
    }

    fetchWithdrawals()
  }, [])

  // Fetch restaurant data for header display
  useEffect(() => {
    // Use restaurant data from financeData if available, otherwise fetch separately
    if (financeData?.restaurant) {
      setRestaurantData(financeData.restaurant)
    } else {
      const fetchRestaurantData = async () => {
        try {
          const response = await restaurantAPI.getRestaurantByOwner()
          const data = response?.data?.data?.restaurant || response?.data?.restaurant || response?.data?.data
          if (data) {
            setRestaurantData({
              name: data.name,
              restaurantId: data.restaurantId || data._id,
              address: data.location?.address || data.location?.formattedAddress || data.address || ''
            })
          }
        } catch (error) {
          // Suppress 401 errors as they're handled by axios interceptor
          if (error.response?.status !== 401) {
            debugError('? Error fetching restaurant data:', error)
          }
        }
      }
      fetchRestaurantData()
    }
  }, [financeData])

  // Format Restaurant ID to REST format (e.g., REST10000)
  const formatRestaurantId = (restaurantId) => {
    if (!restaurantId) return "REST10000"

    const idString = String(restaurantId)
    
    // If it's already in the format "RESTxxxxx", extract the xxxxx part
    const restMatch = idString.match(/^#?REST(\d+)$/i)
    if (restMatch) {
      return `REST${restMatch[1]}`
    }

    // Generate a deterministic 5-digit sequence number starting from 10000 using a stable hash
    let hash = 0
    for (let i = 0; i < idString.length; i++) {
      hash = (hash << 5) - hash + idString.charCodeAt(i)
      hash = hash & hash // Convert to 32bit integer
    }
    
    const offset = Math.abs(hash) % 90000 // 0 to 89999
    const sequentialNum = 10000 + offset
    
    return `REST${sequentialNum}`
  }

  // Get current cycle dates from API response or use default
  const currentCycleDates = useMemo(() => {
    if (financeData?.currentCycle) {
      return {
        start: financeData.currentCycle.start.day,
        end: financeData.currentCycle.end.day,
        month: financeData.currentCycle.start.month,
        year: financeData.currentCycle.start.year
      }
    }
    return {
      start: "15",
      end: "21",
      month: "Dec",
      year: "25"
    }
  }, [financeData])

  const invoiceOrders = useMemo(() => {
    const allOrdersMap = new Map()
    
    // Add current cycle orders first
    const current = financeData?.currentCycle?.orders || []
    current.forEach(order => {
      const id = order.orderId || order._id || order.id
      if (id) {
        allOrdersMap.set(id, order)
      }
    })
    
    // Add past cycles orders, avoiding duplicates already in current map
    const past = pastCyclesData?.orders || []
    past.forEach(order => {
      const id = order.orderId || order._id || order.id
      if (id && !allOrdersMap.has(id)) {
        allOrdersMap.set(id, order)
      }
    })
    
    return Array.from(allOrdersMap.values())
  }, [financeData, pastCyclesData])

  const invoiceSummary = useMemo(() => {
    const earnings = invoiceOrders.reduce((sum, order) => sum + (order.payout || order.restaurantEarning || 0), 0)
    const commission = invoiceOrders.reduce((sum, order) => sum + (order.commission || 0), 0)
    const gross = invoiceOrders.reduce((sum, order) => sum + getRestaurantItemAmount(order), 0)
    return { earnings, commission, gross, count: invoiceOrders.length }
  }, [invoiceOrders])

  const diningFinanceInsight = useMemo(() => {
    const breakdown = financeData?.currentCycle?.diningBreakdown || {}
    const currentOrders = Array.isArray(financeData?.currentCycle?.orders)
      ? financeData.currentCycle.orders
      : []
    const diningCodOrders = currentOrders.filter(
      (order) => order?.sourceModule === "dining" && Boolean(order?.isCodLike)
    )
    const adminFundedOfferCompensation = diningCodOrders.reduce(
      (sum, order) => sum + Number(order?.platformDiscountCompensation || 0),
      0
    )

    return {
      commission: Number(breakdown?.commission ?? breakdown?.pendingCommission ?? 0),
      platformFee: Number(breakdown?.platformFee ?? breakdown?.pendingPlatformFee ?? 0),
      gst: Number(breakdown?.gst ?? breakdown?.pendingGst ?? 0),
      totalDeduction: Number(breakdown?.totalDeduction || 0),
      outstandingDue: Number(breakdown?.outstandingDue || 0),
      adjustedAmount: Number(breakdown?.adjustedAmount || 0),
      adjustedCommission: Number(breakdown?.adjustedCommission || 0),
      adjustedPlatformFee: Number(breakdown?.adjustedPlatformFee || 0),
      adjustedGst: Number(breakdown?.adjustedGst || 0),
      adminFundedOfferCompensation: Number(
        breakdown?.platformDiscountCompensation ?? adminFundedOfferCompensation
      ),
      ordersCount: Number(breakdown?.ordersCount || 0),
      hasDeductions:
        Boolean(breakdown?.hasDeductions) ||
        Number(adminFundedOfferCompensation || 0) > 0.009,
      isFullyAdjusted: Boolean(breakdown?.isFullyAdjusted),
      note: breakdown?.note || "Pending dining COD dues will be adjusted automatically in the next payout.",
    }
  }, [financeData])

  const codSettlementInsight = useMemo(() => {
    const currentOrders = Array.isArray(financeData?.currentCycle?.orders) ? financeData.currentCycle.orders : []
    const takeawayOrders = currentOrders.filter((order) => order?.sourceModule !== "dining")
    const codOrders = takeawayOrders.filter((order) => Boolean(order?.isCodLike))
    const onlineOrdersCount = takeawayOrders.filter((order) => !order?.isCodLike).length

    const adjustedCodOrders = codOrders.filter(
      (order) => Boolean(order?.settlementApplied) && Number(order?.walletNetAdjustment || 0) < -0.009
    )
    const totalAdjustedFromCod = Math.abs(
      adjustedCodOrders.reduce((sum, order) => sum + Number(order?.walletNetAdjustment || 0), 0)
    )
    const totalAdjustedAdminRecoverable = adjustedCodOrders.reduce(
      (sum, order) => sum + Number(order?.adminChargesRecoverable || 0),
      0
    )

    const settlement = financeData?.currentCycle?.settlementBreakdown || {}
    const pendingAdminRecoverable = Number(settlement?.adminChargesRecoverable || 0)
    const pendingPlatformComp = Number(settlement?.platformDiscountCompensation || 0)
    const pendingNetDue = Math.max(0, pendingAdminRecoverable - pendingPlatformComp)

    return {
      hasPendingDue: pendingNetDue > 0.009,
      pendingNetDue,
      pendingAdminRecoverable,
      pendingPlatformComp,
      hasAdjustedHistory: totalAdjustedFromCod > 0.009,
      totalAdjustedFromCod,
      totalAdjustedAdminRecoverable,
      adjustedOrdersCount: adjustedCodOrders.length,
      onlineOrdersCount,
    }
  }, [financeData])

  const payoutDeductionNote = useMemo(() => {
    const breakdown = financeData?.currentCycle?.discountBreakdown || {}
    const reasons = []

    const restaurantCoupons = Number(breakdown?.restaurantCoupons || 0)
    const restaurantOffers = Number(breakdown?.restaurantOffers || 0)

    if (restaurantCoupons > 0.009) {
      reasons.push({ key: "restaurant_coupon", label: "Your Coupon Discount", amount: restaurantCoupons })
    }
    if (restaurantOffers > 0.009) {
      reasons.push({ key: "restaurant_offer", label: "Your Offer Discount", amount: restaurantOffers })
    }

    const totalDeduction = reasons.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    return { reasons, totalDeduction, hasDeduction: totalDeduction > 0.009 }
  }, [financeData])

  const takeawayBreakdown = useMemo(() => {
    const breakdown = financeData?.currentCycle?.discountBreakdown || {}
    return {
      platformCoupons: Number(breakdown?.platformCoupons || 0),
      restaurantCoupons: Number(breakdown?.restaurantCoupons || 0),
      restaurantOffers: Number(breakdown?.restaurantOffers || 0),
      commissionPaid: Number(breakdown?.commissionPaid || 0),
      netPayout: Number(breakdown?.netPayout || 0),
      deliveryFee: Number(breakdown?.deliveryFee || 0),
    }
  }, [financeData])

  const handleViewDetails = () => {
    navigate("/restaurant/finance-details", { state: { financeData, restaurantData } })
  }

  const getWithdrawalStatusClass = (statusRaw) => {
    const status = String(statusRaw || '').trim().toLowerCase()
    if (status === 'approved') return 'bg-green-100 text-green-700'
    if (status === 'rejected') return 'bg-red-100 text-red-700'
    return 'bg-amber-100 text-amber-700'
  }

  const formatWithdrawalStatus = (statusRaw) => {
    const status = String(statusRaw || '').trim().toLowerCase()
    if (!status) return 'Pending'
    return status.charAt(0).toUpperCase() + status.slice(1)
  }

  const formatDateTime = (dateValue) => {
    if (!dateValue) return 'N/A'
    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) return 'N/A'
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
  }

  // Parse date range string to extract start and end dates
  const parseDateRange = (dateRangeStr) => {
    try {
      if (!dateRangeStr || typeof dateRangeStr !== 'string') return null;

      // Handle relative ranges
      const today = new Date();
      if (dateRangeStr === "Last 7 days") {
        const start = new Date();
        start.setDate(today.getDate() - 7);
        return { startDate: start.toISOString(), endDate: today.toISOString() };
      }
      if (dateRangeStr === "Last 30 days" || dateRangeStr === "Last 1 month") {
        const start = new Date();
        start.setDate(today.getDate() - 30);
        return { startDate: start.toISOString(), endDate: today.toISOString() };
      }
      if (dateRangeStr === "This week") {
        const start = new Date();
        const day = today.getDay();
        start.setDate(today.getDate() - day);
        return { startDate: start.toISOString(), endDate: today.toISOString() };
      }
      if (dateRangeStr === "This month") {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        return { startDate: start.toISOString(), endDate: today.toISOString() };
      }

      const parts = dateRangeStr.split(' - ')
      if (parts.length !== 2) return null
      
      const startStr = parts[0].trim() // "14 Nov"
      const endStr = parts[1].trim().replace("'", " ") // "14 Dec 25"
      
      const currentYear = new Date().getFullYear()
      const startParts = startStr.split(' ')
      const endParts = endStr.split(' ')
      
      if (startParts.length < 2 || endParts.length < 2) return null
      
      const monthMap = {
        'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
        'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
      }
      
      const startDay = parseInt(startParts[0])
      const startMonth = monthMap[startParts[1]]
      const endDay = parseInt(endParts[0])
      const endMonth = monthMap[endParts[1]]
      const year = endParts.length > 2 ? parseInt('20' + endParts[2]) : currentYear
      
      if (startMonth === undefined || endMonth === undefined || isNaN(startDay) || isNaN(endDay)) {
        return null
      }
      
      const start = new Date(year, startMonth, startDay)
      const end = new Date(year, endMonth, endDay)

      return {
        startDate: start.toISOString(),
        endDate: end.toISOString()
      }
    } catch (error) {
      debugError('Error parsing date range:', error)
      return null
    }
  }

  // Fetch past cycles data when date range changes
  const fetchPastCyclesData = async (startDate, endDate) => {
    if (!startDate || !endDate) {
      setPastCyclesData(null)
      return
    }

    try {
      setLoadingPastCycles(true)
      // Validate dates and format as ISO strings
      const startDateObj = startDate instanceof Date ? startDate : new Date(startDate)
      const endDateObj = endDate instanceof Date ? endDate : new Date(endDate)
      
      // Check if dates are valid
      if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
        debugError('Invalid date values:', { startDate, endDate })
        setPastCyclesData(null)
        return
      }
      
      const startDateISO = startDateObj.toISOString().split('T')[0]
      const endDateISO = endDateObj.toISOString().split('T')[0]
      
      const response = await restaurantAPI.getFinance({
        startDate: startDateISO,
        endDate: endDateISO
      })
      if (response.data?.success && response.data?.data?.pastCycles) {
        setPastCyclesData(response.data.data.pastCycles)
        debugLog('? Past cycles data fetched:', response.data.data.pastCycles)
        debugLog('?? Orders array:', response.data.data.pastCycles?.orders)
        debugLog('?? Total orders:', response.data.data.pastCycles?.totalOrders)
      } else {
        setPastCyclesData(null)
      }
    } catch (error) {
      // Suppress 401 errors as they're handled by axios interceptor (token refresh/redirect)
      if (error.response?.status !== 401) {
        debugError('? Error fetching past cycles data:', error)
      }
      setPastCyclesData(null)
    } finally {
      setLoadingPastCycles(false)
    }
  }

  // Fetch past cycles data on mount and when date range changes
  useEffect(() => {
    const dateRange = parseDateRange(selectedDateRange)
    if (dateRange && dateRange.startDate && dateRange.endDate) {
      fetchPastCyclesData(dateRange.startDate, dateRange.endDate)
    } else {
      // If date range is invalid, don't fetch
      setPastCyclesData(null)
    }
  }, [selectedDateRange])

  useEffect(() => {
    if (!financeData) return
    console.log("[HubFinance] rendered financeData state:", financeData)
    console.log("[HubFinance] rendered estimatedPayout:", financeData?.currentCycle?.estimatedPayout)
    console.log("[HubFinance] rendered totalOrders:", financeData?.currentCycle?.totalOrders)
  }, [financeData])

  useEffect(() => {
    console.log("[HubFinance] rendered withdrawalRequests state:", withdrawalRequests)
  }, [withdrawalRequests])


  // Prepare report data from real finance data
  const getReportData = () => {
    const restaurantName = financeData?.restaurant?.name || "Restaurant"
    const restaurantId = financeData?.restaurant?.restaurantId || "N/A"
    const currentCycle = financeData?.currentCycle || {}
    
    // Get all orders (current cycle + past cycles) - DEDUPLICATED
    const allOrdersMap = new Map()
    
    // Add current cycle orders first
    if (financeData?.currentCycle?.orders && Array.isArray(financeData.currentCycle.orders)) {
      financeData.currentCycle.orders.forEach(order => {
        if (order.orderId) {
          allOrdersMap.set(order.orderId, {
            ...order,
            cycle: 'Current Cycle'
          })
        }
      })
    }
    
    // Add past cycles orders (ignoring duplicates already in current map)
    if (pastCyclesData?.orders && Array.isArray(pastCyclesData.orders)) {
      pastCyclesData.orders.forEach(order => {
        if (order.orderId && !allOrdersMap.has(order.orderId)) {
          allOrdersMap.set(order.orderId, {
            ...order,
            cycle: 'Past Cycle'
          })
        }
      })
    }
    
    const allOrders = Array.from(allOrdersMap.values())
    
    return {
      restaurantName,
      restaurantId,
      dateRange: selectedDateRange,
      currentCycle: {
        start: currentCycleDates.start,
        end: currentCycleDates.end,
        month: currentCycleDates.month,
        year: currentCycleDates.year,
        estimatedPayout: `₹${(currentCycle.estimatedPayout || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        orders: currentCycle.totalOrders || 0,
        payoutDate: currentCycle.payoutDate ? new Date(currentCycle.payoutDate).toLocaleDateString('en-IN') : "Pending"
      },
      pastCycles: pastCyclesData,
      allOrders: allOrders
    }
  }

  // Generate HTML content for the report
  const generateHTMLContent = (reportData) => {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Finance Report - ${reportData.dateRange}</title>
        <meta charset="UTF-8">
        <style>
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            margin: 0; 
            padding: 40px;
            color: #333;
            background-color: #fff;
            width: 794px; /* A4 width at 96dpi */
            box-sizing: border-box;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #333;
            padding-bottom: 20px;
          }
          .header h1 {
            margin: 0;
            font-size: 28px;
            color: #000;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .header p {
            margin: 5px 0;
            font-size: 14px;
            color: #444;
          }
          .section {
            margin-bottom: 30px;
            clear: both;
          }
          .section-title {
            font-size: 20px;
            font-weight: bold;
            margin-bottom: 15px;
            color: #000;
            border-left: 4px solid #000;
            padding-left: 10px;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px dashed #ddd;
          }
          .current-cycle {
            background-color: #fcfcfc;
            padding: 25px;
            border: 1px solid #eee;
            border-radius: 12px;
            margin-bottom: 25px;
          }
          .payout-amount {
            font-size: 36px;
            font-weight: 800;
            color: #000;
            margin: 10px 0;
          }
          .orders-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            margin-top: 20px;
            border: 1px solid #000;
          }
          .orders-table th {
            background-color: #f2f2f2;
            padding: 12px 8px;
            text-align: left;
            border: 1px solid #000;
            font-weight: bold;
            font-size: 11px;
            text-transform: uppercase;
          }
          .orders-table td {
            padding: 10px 8px;
            border: 1px solid #000;
            font-size: 11px;
            word-wrap: break-word;
            vertical-align: top;
          }
          .footer {
            margin-top: 50px;
            padding-top: 25px;
            border-top: 1px solid #000;
            text-align: center;
            font-size: 12px;
            color: #555;
          }
          @media print {
            body { padding: 20px; width: auto; }
            .current-cycle { page-break-inside: avoid; }
            .orders-table tr { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Finance Report</h1>
          <p>${reportData.restaurantName}</p>
          <p>ID: ${reportData.restaurantId}</p>
          <p>Generated on: ${new Date().toLocaleString('en-IN')}</p>
        </div>

        <div class="section">
          <div class="section-title">Current Cycle</div>
          <div class="current-cycle">
            <p style="font-size: 12px; color: #666; margin: 0 0 5px 0;">
              Est. payout (${reportData.currentCycle.start} - ${reportData.currentCycle.end} ${reportData.currentCycle.month})
            </p>
            <div class="payout-amount">${reportData.currentCycle.estimatedPayout}</div>
            <p style="font-size: 14px; color: #666; margin: 5px 0;">${reportData.currentCycle.orders} orders</p>
            <div class="info-row">
              <div>
                <p class="info-label" style="font-size: 11px; margin: 5px 0;">Payout for</p>
                <p style="margin: 0; font-weight: 600;">${reportData.currentCycle.start} - ${reportData.currentCycle.end} ${reportData.currentCycle.month}'${reportData.currentCycle.year}</p>
              </div>
              <div style="text-align: right;">
                <p class="info-label" style="font-size: 11px; margin: 5px 0;">Payout date</p>
                <p style="margin: 0; font-weight: 600;">${reportData.currentCycle.payoutDate}</p>
              </div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Detailed Order-wise Report</div>
          ${reportData.allOrders && reportData.allOrders.length > 0 ? `
            <table class="orders-table">
              <thead>
                <tr>
                  <th style="width: 14%;">Cycle</th>
                  <th style="width: 15%;">Order ID</th>
                  <th style="width: 12%;">Date</th>
                  <th style="width: 28%;">Items</th>
                  <th style="width: 8%;">Qty</th>
                  <th style="width: 11%;">Amount</th>
                  <th style="width: 12%;">Earning</th>
                </tr>
              </thead>
              <tbody>
                ${reportData.allOrders.map(order => {
                  const orderDate = order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN') : (order.deliveredAt ? new Date(order.deliveredAt).toLocaleDateString('en-IN') : 'N/A')
                  const foodItems = order.items && order.items.length > 0
                    ? order.items.map(item => `<div style="margin-bottom: 2px;">${item.name}</div>`).join('')
                    : `<div style="margin-bottom: 2px;">${order.foodNames || 'N/A'}</div>`
                  const itemQuantities = order.items && order.items.length > 0
                    ? order.items.map(item => `<div style="margin-bottom: 2px; text-align: center;">${item.quantity || 1}</div>`).join('')
                    : `<div style="margin-bottom: 2px; text-align: center;">1</div>`
                  const orderAmount = order.totalAmount || order.orderTotal || order.amount || 0
                  const earning = order.payout || order.restaurantEarning || 0
                  
                  return `
                    <tr>
                      <td>${order.cycle || 'N/A'}</td>
                      <td>${order.orderId || 'N/A'}</td>
                      <td>${orderDate}</td>
                      <td>${foodItems}</td>
                      <td style="text-align: center; vertical-align: top;">${itemQuantities}</td>
                      <td>₹${orderAmount.toFixed(2)}</td>
                      <td>${earning < 0 ? `-₹${Math.abs(earning).toFixed(2)}` : `₹${earning.toFixed(2)}`}</td>
                    </tr>
                  `
                }).join('')}
              </tbody>
              <tfoot>
                <tr style="background-color: #e8f5e9; font-weight: bold;">
                  <td colspan="5" style="text-align: right;">Total Earnings:</td>
                  <td colspan="2">
                    ${(() => {
                      const totalEarnings = reportData.allOrders.reduce((sum, order) => sum + (order.payout || order.restaurantEarning || 0), 0)
                      return totalEarnings < 0 ? `-₹${Math.abs(totalEarnings).toFixed(2)}` : `₹${totalEarnings.toFixed(2)}`
                    })()}
                  </td>
                </tr>
              </tfoot>
            </table>
          ` : `
          <div class="info-row">
            <span class="info-label">Status:</span>
              <span class="info-value">No orders available</span>
          </div>
          `}
        </div>

        <div class="footer">
          <p>This is an auto-generated report. For detailed information, please visit the Finance section.</p>
          <p>Total Orders: ${reportData.allOrders?.length || 0} | Total Earnings: ₹${reportData.allOrders?.reduce((sum, order) => sum + (order.payout || order.restaurantEarning || 0), 0).toFixed(2) || '0.00'}</p>
        </div>
      </body>
      </html>
    `
  }

  // Download PDF report - Direct download without print dialog
  const downloadPDF = async () => {
    try {
      setShowDownloadMenu(false)
      
    const reportData = getReportData()
    const htmlContent = generateHTMLContent(reportData)
    
      debugLog('?? Generating PDF...')
      
      // Create a temporary hidden iframe to render HTML properly
      const iframe = document.createElement('iframe')
      iframe.style.position = 'absolute'
      iframe.style.left = '-9999px'
      iframe.style.top = '0'
      iframe.style.width = '210mm'
      iframe.style.height = '297mm'
      iframe.style.border = 'none'
      document.body.appendChild(iframe)
      
      // Write HTML to iframe
      iframe.contentDocument.open()
      iframe.contentDocument.write(htmlContent)
      iframe.contentDocument.close()
      
      // Wait for iframe content to load
      await new Promise((resolve) => {
        if (iframe.contentDocument.readyState === 'complete') {
          resolve()
        } else {
          iframe.contentWindow.onload = resolve
          setTimeout(resolve, 1000) // Fallback timeout
        }
      })
      
      // Wait a bit more for styles to apply
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Import html2canvas and jsPDF dynamically
      debugLog('?? Loading libraries...')
      const html2canvas = (await import('html2canvas')).default
      const { default: jsPDF } = await import('jspdf')
    
      // Get the body element from iframe
      const iframeBody = iframe.contentDocument.body
      
      debugLog('?? Converting to canvas...')
      // Convert HTML to canvas
      const canvas = await html2canvas(iframeBody, {
        scale: 2,
        useCORS: true,
        logging: false,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: iframeBody.scrollWidth,
        height: iframeBody.scrollHeight
      })
      
      debugLog('? Canvas created:', canvas.width, 'x', canvas.height)
      
      // Remove temporary iframe
      document.body.removeChild(iframe)
    
      // Calculate PDF dimensions with margins
      const margin = 10 // mm margin on each side
      const imgWidth = 210 - margin * 2 // A4 width in mm minus side margins
      const pageHeight = 297 // A4 height in mm
      const usableHeight = pageHeight - margin * 2 // usable height per page with top+bottom margins
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      
      debugLog('?? PDF dimensions:', imgWidth, 'x', imgHeight, 'mm')
      
      // Create PDF
      const pdf = new jsPDF('p', 'mm', 'a4')
      let heightLeft = imgHeight
      let position = 0
      
      // Add first page with margins
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, margin, imgWidth, imgHeight)
      heightLeft -= usableHeight
      
      // Add additional pages if content is longer than one page
      while (heightLeft > 0) {
        position -= usableHeight
        pdf.addPage()
        // Offset the image up so the next segment is shown, keeping margin at top
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, position + margin, imgWidth, imgHeight)
        heightLeft -= usableHeight
      }
      
      // Download PDF
      const fileName = `finance-report-${reportData.dateRange.replace(/\s+/g, '-').replace(/'/g, '')}_${new Date().toISOString().split("T")[0]}.pdf`
      debugLog('?? Downloading PDF:', fileName)
      pdf.save(fileName)
      debugLog('? PDF downloaded successfully!')
    } catch (error) {
      debugError('? Error downloading PDF:', error)
      debugError('Error details:', error.stack)
      alert(`Failed to download PDF: ${error.message}. Please check console for details.`)
    setShowDownloadMenu(false)
    }
  }

  // Close download menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(event.target)) {
        setShowDownloadMenu(false)
      }
    }
    
    if (showDownloadMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDownloadMenu])

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <div className="sticky bg-white top-0 z-40 px-3 py-2 border-b border-gray-200">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0 flex items-start gap-2">
            <button
              onClick={goBack}
              className="p-1 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer text-gray-900 shrink-0 mt-0.5"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="flex items-center gap-1 min-w-0">
                <h1 className="text-sm font-bold text-gray-900 truncate">
                  {restaurantData?.name || financeData?.restaurant?.name || "Restaurant"}
                </h1>
                <ChevronDown className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
              </div>
              <p className="text-[10px] font-bold text-gray-500 mt-0.5">
                {(() => {
                  const restaurantId = restaurantData?.restaurantId || financeData?.restaurant?.restaurantId
                  return restaurantId ? `ID: ${formatRestaurantId(restaurantId)}` : 'Loading ID...'
                })()}
              </p>
              <p className="text-[10px] text-gray-600 leading-normal mt-0.5 break-words">
                {restaurantData?.address || financeData?.restaurant?.address || ''}
              </p>
            </div>
          </div>
          <div className="flex items-center shrink-0">
            <button
              className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg transition-all duration-150 text-gray-800 cursor-pointer shadow-xs"
              onClick={() => navigate("/restaurant/withdrawal-history")}
              title="Withdrawal History"
            >
              <Wallet className="w-3.5 h-3.5 text-gray-700" />
              <span className="text-[10px] font-bold">Withdrawals</span>
            </button>
          </div>
        </div>
      </div>

      {/* Primary Navigation Tabs */}
      <div className="px-4 py-3">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("payouts")}
            className={`flex-1 py-3 px-4 rounded-full font-medium text-sm transition-colors ${
              activeTab === "payouts"
                ? "bg-black text-white"
                : "bg-white text-gray-600 border border-gray-300"
            }`}
          >
            Payouts
          </button>
          <button
            onClick={() => setActiveTab("invoices")}
            className={`flex-1 py-3 px-4 rounded-full font-medium text-sm transition-colors ${
              activeTab === "invoices"
                ? "bg-black text-white"
                : "bg-white text-gray-600 border border-gray-300"
            }`}
          >
            Invoices & Taxes
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-6 pb-28">
        {activeTab === "payouts" && (
          <div className="space-y-6">
            {/* Current cycle */}
            <div>
              <h2 className="text-base font-bold text-gray-900 mb-3">Current cycle</h2>
              <div className="bg-white rounded-lg p-4">
                {loading ? (
                  <div className="py-8 text-center text-gray-500">Loading...</div>
                ) : (
                  <>
                    <p className="text-4xl font-bold text-gray-900 mb-2">
                      ₹{(financeData?.currentCycle?.estimatedPayout || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-gray-600 mb-4 flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-gray-700">{financeData?.currentCycle?.totalOrders || 0} {financeData?.currentCycle?.totalOrders === 1 ? 'order' : 'orders'}</span>
                      <span className="text-gray-300">•</span>
                      <span>Period: {currentCycleDates.start} {currentCycleDates.month} - {currentCycleDates.end} {currentCycleDates.month} &apos;{currentCycleDates.year}</span>
                    </p>
                    <button
                      onClick={() => setShowWithdrawalModal(true)}
                      disabled={!(financeData?.currentCycle?.estimatedPayout > 0)}
                      className={`w-full py-3 px-4 rounded-lg font-semibold flex items-center justify-center gap-2 mt-4 transition-colors ${
                        financeData?.currentCycle?.estimatedPayout > 0
                          ? "bg-black text-white hover:bg-gray-800"
                          : "bg-gray-200 text-gray-500 cursor-not-allowed"
                      }`}
                    >
                      <Wallet className="h-5 w-5" />
                      Withdraw
                    </button>
                    <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 p-3">
                      <p className="text-xs font-bold text-emerald-800 mb-2">Takeaway Breakdown</p>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex items-center justify-between text-gray-700">
                          <span>Platform Coupons (platform-funded)</span>
                          <span className="font-medium text-gray-700">
                            ₹{takeawayBreakdown.platformCoupons.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-gray-700">
                          <span>Your Coupons</span>
                          <span className="font-medium text-red-600">
                            -₹{takeawayBreakdown.restaurantCoupons.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-gray-700">
                          <span>Your Offers</span>
                          <span className="font-medium text-red-600">
                            -₹{takeawayBreakdown.restaurantOffers.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-gray-700">
                          <span>Commission Paid</span>
                          <span className="font-medium text-red-600">
                            -₹{takeawayBreakdown.commissionPaid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        {takeawayBreakdown.deliveryFee > 0.009 && (
                          <div className="flex items-center justify-between text-gray-700">
                            <span>Delivery Fee (Self Delivery)</span>
                            <span className="font-medium text-emerald-600">
                              +₹{takeawayBreakdown.deliveryFee.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between border-t border-emerald-200 pt-1.5 text-gray-900">
                          <span className="font-semibold">Takeaway Net Payout</span>
                          <span className="font-semibold">
                            ₹{takeawayBreakdown.netPayout.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-slate-600">
                        Platform coupons don&apos;t reduce your payout. Your coupons and offers do.
                      </p>
                    </div>
                    {diningFinanceInsight.hasDeductions && (
                      <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 mb-2">Dining breakdown</p>
                        <div className="space-y-1.5 text-sm">
                          <div className="flex items-center justify-between text-gray-700">
                            <span>Dining Commission (Admin recoverable)</span>
                            <span className="font-medium text-red-600">
                              -₹{formatRoundedCurrency(diningFinanceInsight.commission)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-gray-700">
                            <span>Dining Platform Fee (Admin recoverable)</span>
                            <span className="font-medium text-red-600">
                              -₹{formatRoundedCurrency(diningFinanceInsight.platformFee)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-gray-700">
                            <span>Dining GST (Admin recoverable)</span>
                            <span className="font-medium text-red-600">
                              -₹{formatRoundedCurrency(diningFinanceInsight.gst)}
                            </span>
                          </div>
                          {diningFinanceInsight.adminFundedOfferCompensation > 0.009 && (
                            <div className="flex items-center justify-between text-emerald-700">
                              <span>Admin Funded Dining Offer</span>
                              <span className="font-medium">
                                +₹{formatRoundedCurrency(diningFinanceInsight.adminFundedOfferCompensation)}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center justify-between border-t border-amber-200 pt-1.5 text-gray-900">
                            <span className="font-semibold">Pending Dining Dues</span>
                            <span className="font-semibold text-red-600">
                              -₹{formatRoundedCurrency(diningFinanceInsight.outstandingDue)}
                            </span>
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-amber-900">
                          {diningFinanceInsight.note}
                        </p>
                        {diningFinanceInsight.outstandingDue > 0.009 && (
                          <p className="mt-2 text-xs font-medium text-amber-900">
                            Outstanding Dining Dues: ₹{formatRoundedCurrency(diningFinanceInsight.outstandingDue)}
                          </p>
                        )}
                        {diningFinanceInsight.outstandingDue <= 0.009 && diningFinanceInsight.adjustedAmount > 0.009 && (
                          <p className="mt-2 text-xs font-medium text-emerald-700">
                            Dining dues adjusted from takeaway earnings: commission ₹{formatRoundedCurrency(diningFinanceInsight.adjustedCommission)}, fee ₹{formatRoundedCurrency(diningFinanceInsight.adjustedPlatformFee)}, GST ₹{formatRoundedCurrency(diningFinanceInsight.adjustedGst)}
                          </p>
                        )}
                      </div>
                    )}
                    {payoutDeductionNote.hasDeduction && (
                      <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-rose-800 mb-1">
                          Why payout reduced
                        </p>
                        <p className="text-xs text-rose-900">
                          Total deduction this cycle:{" "}
                          <span className="font-semibold">
                            ₹{Number(payoutDeductionNote.totalDeduction || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </p>
                        <div className="mt-1 space-y-1">
                          {payoutDeductionNote.reasons.map((reason) => (
                            <p key={reason.key} className="text-xs text-rose-900">
                              {reason.label}:{" "}
                              <span className="font-semibold">
                                -₹{Number(reason.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                    {codSettlementInsight.hasPendingDue && (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 mb-1">COD / Counter note</p>
                        <p className="text-xs text-amber-900">
                          <span className="font-semibold">₹{Number(codSettlementInsight.pendingNetDue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> is pending to be paid to admin from COD orders. It will be adjusted in the next online payout.
                        </p>
                        <p className="text-xs text-amber-900">
                          Admin recoverable (commission + platform fee + tax):{" "}
                          <span className="font-semibold">
                            ₹{Number(codSettlementInsight.pendingAdminRecoverable || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </p>
                        <p className="text-xs text-amber-900 mt-1">
                          Platform discount compensation:{" "}
                          <span className="font-semibold">
                            ₹{Number(codSettlementInsight.pendingPlatformComp || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </p>
                        <p className="text-xs text-amber-900 mt-1">
                          Wallet net adjustment:{" "}
                          <span className="font-semibold">
                            ₹{Number(financeData?.currentCycle?.settlementBreakdown?.walletNetAdjustment || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </p>
                      </div>
                    )}
                    {!codSettlementInsight.hasPendingDue && codSettlementInsight.hasAdjustedHistory && (
                      <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-sky-800 mb-1">COD adjustment done</p>
                        <p className="text-xs text-sky-900">
                          Previous COD dues were adjusted, so{" "}
                          <span className="font-semibold">
                            ₹{Number(codSettlementInsight.totalAdjustedFromCod || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>{" "}
                          was deducted from payout.
                        </p>
                        <p className="text-xs text-sky-900 mt-1">
                          Adjusted COD orders:{" "}
                          <span className="font-semibold">{codSettlementInsight.adjustedOrdersCount}</span>
                          {codSettlementInsight.onlineOrdersCount > 0 ? ` • Current cycle online orders: ${codSettlementInsight.onlineOrdersCount}` : ""}
                        </p>
                        <p className="text-xs text-sky-900 mt-1">
                          Admin recoverable covered from COD orders:{" "}
                          <span className="font-semibold">
                            ₹{Number(codSettlementInsight.totalAdjustedAdminRecoverable || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Withdrawal Requests */}
            <div>
              <h2 className="text-base font-bold text-gray-900 mb-3">Withdrawal Requests</h2>
              <div className="bg-white rounded-lg p-4">
                {loadingWithdrawals ? (
                  <div className="py-6 text-center text-sm text-gray-500">Loading withdrawal requests...</div>
                ) : withdrawalRequests.length === 0 ? (
                  <div className="py-6 text-center text-sm text-gray-500">You haven&apos;t made any withdrawal requests yet.</div>
                ) : (
                  <div className="space-y-3">
                    {withdrawalRequests.slice(0, 8).map((request, index) => {
                      const status = formatWithdrawalStatus(request?.status)
                      return (
                        <div
                          key={request?._id || request?.id || index}
                          className="border border-gray-200 rounded-lg p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">
                                ₹{Number(request?.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                Requested: {formatDateTime(request?.createdAt || request?.requestedAt)}
                              </p>
                              {request?.processedAt ? (
                                <p className="text-xs text-gray-500 mt-0.5">
                                  Processed: {formatDateTime(request?.processedAt)}
                                </p>
                              ) : null}
                            </div>
                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getWithdrawalStatusClass(request?.status)}`}>
                              {status}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                    {withdrawalRequests.length > 8 ? (
                      <button
                        type="button"
                        onClick={() => navigate("/restaurant/withdrawal-history")}
                        className="w-full text-sm font-medium text-black hover:underline pt-1"
                      >
                        View all requests
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            {/* Past cycles */}
            <div>
              <h2 className="text-base font-bold text-gray-900 mb-3">Past Cycles</h2>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="flex-1 relative" ref={dateRangePickerRef}>
                    <button 
                      onClick={() => {
                        setShowDateRangePicker(!showDateRangePicker)
                        setShowDownloadMenu(false)
                      }}
                      className="w-full bg-white rounded-lg px-4 py-3 flex items-center justify-between border border-gray-200 hover:border-gray-300 transition-colors cursor-pointer"
                    >
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-600" />
                      <span className="text-sm font-medium text-gray-900">{selectedDateRange}</span>
                    </div>
                      <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform ${showDateRangePicker ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {/* Date Range Picker Dropdown */}
                    <AnimatePresence>
                      {showDateRangePicker && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-lg border border-gray-200 z-50"
                        >
                          <div className="p-4">
                            <h3 className="text-sm font-semibold text-gray-900 mb-3">Select Date Range</h3>
                            <div className="space-y-2">
                              {(() => {
                                const getDateRanges = () => {
                                  const today = new Date()
                                  today.setHours(23, 59, 59, 999)
                                  
                                  // Last 7 days
                                  const last7DaysStart = new Date(today)
                                  last7DaysStart.setDate(today.getDate() - 7)
                                  last7DaysStart.setHours(0, 0, 0, 0)
                                  
                                  // Last 30 days
                                  const last30DaysStart = new Date(today)
                                  last30DaysStart.setDate(today.getDate() - 30)
                                  last30DaysStart.setHours(0, 0, 0, 0)
                                  
                                  // This week (Monday to Sunday)
                                  const currentDay = today.getDay()
                                  const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1
                                  const thisWeekStart = new Date(today)
                                  thisWeekStart.setDate(today.getDate() - daysFromMonday)
                                  thisWeekStart.setHours(0, 0, 0, 0)
                                  const thisWeekEnd = new Date(thisWeekStart)
                                  thisWeekEnd.setDate(thisWeekStart.getDate() + 6)
                                  thisWeekEnd.setHours(23, 59, 59, 999)
                                  
                                  // Last week
                                  const lastWeekStart = new Date(thisWeekStart)
                                  lastWeekStart.setDate(thisWeekStart.getDate() - 7)
                                  const lastWeekEnd = new Date(thisWeekEnd)
                                  lastWeekEnd.setDate(thisWeekEnd.getDate() - 7)
                                  
                                  // This month
                                  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
                                  const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999)
                                  
                                  // Last month
                                  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
                                  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999)
                                  
                                  return {
                                    today,
                                    last7DaysStart,
                                    last30DaysStart,
                                    thisWeekStart,
                                    thisWeekEnd,
                                    lastWeekStart,
                                    lastWeekEnd,
                                    thisMonthStart,
                                    thisMonthEnd,
                                    lastMonthStart,
                                    lastMonthEnd
                                  }
                                }
                                
                                const formatDateForDisplay = (date) => {
                                  const day = date.getDate()
                                  const month = date.toLocaleString('en-US', { month: 'short' })
                                  const year = date.getFullYear().toString().slice(-2)
                                  return `${day} ${month}'${year}`
                                }
                                
                                const formatDateRange = (start, end) => {
                                  return `${formatDateForDisplay(start)} - ${formatDateForDisplay(end)}`
                                }
                                
                                const ranges = getDateRanges()
                                const dateOptions = [
                                  { 
                                    label: "Last 7 Days", 
                                    range: formatDateRange(ranges.last7DaysStart, ranges.today),
                                    startDate: ranges.last7DaysStart,
                                    endDate: ranges.today
                                  },
                                  { 
                                    label: "Last 30 Days", 
                                    range: formatDateRange(ranges.last30DaysStart, ranges.today),
                                    startDate: ranges.last30DaysStart,
                                    endDate: ranges.today
                                  },
                                  { 
                                    label: "This Week", 
                                    range: formatDateRange(ranges.thisWeekStart, ranges.thisWeekEnd),
                                    startDate: ranges.thisWeekStart,
                                    endDate: ranges.thisWeekEnd
                                  },
                                  { 
                                    label: "Last Week", 
                                    range: formatDateRange(ranges.lastWeekStart, ranges.lastWeekEnd),
                                    startDate: ranges.lastWeekStart,
                                    endDate: ranges.lastWeekEnd
                                  },
                                  { 
                                    label: "This Month", 
                                    range: formatDateRange(ranges.thisMonthStart, ranges.thisMonthEnd),
                                    startDate: ranges.thisMonthStart,
                                    endDate: ranges.thisMonthEnd
                                  },
                                  { 
                                    label: "Last Month", 
                                    range: formatDateRange(ranges.lastMonthStart, ranges.lastMonthEnd),
                                    startDate: ranges.lastMonthStart,
                                    endDate: ranges.lastMonthEnd
                                  }
                                ]
                                
                                return (
                                  <div className="space-y-1">
                                    {dateOptions.map((option, index) => {
                                      const isActive = selectedPresetLabel === option.label
                                      return (
                                        <button
                                          key={index}
                                          onClick={() => {
                                            setSelectedDateRange(option.range)
                                            setSelectedPresetLabel(option.label)
                                            setShowDateRangePicker(false)
                                            setCustomRangeActive(false)
                                            fetchPastCyclesData(option.startDate, option.endDate)
                                          }}
                                          className={`w-full text-left px-3 py-2.5 rounded-xl transition-all text-sm flex items-center justify-between ${
                                            isActive ? 'bg-emerald-50 border border-emerald-200' : 'hover:bg-gray-50'
                                          }`}
                                        >
                                          <div>
                                            <div className={`font-semibold ${isActive ? 'text-[#00c87e]' : 'text-gray-900'}`}>{option.label}</div>
                                            <div className="text-xs text-gray-400 mt-0.5">{option.range}</div>
                                          </div>
                                          {isActive && (
                                            <svg className="w-4 h-4 text-[#00c87e] shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                          )}
                                        </button>
                                      )
                                    })}
                                    <div className="border-t border-gray-100 pt-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setShowDateRangePicker(false)
                                          setCalStartViewDate(new Date())
                                          setCustomStartDate(null)
                                          setCustomEndDate(null)
                                          setCalPickingEnd(false)
                                          setCustomRangeActive(true)
                                        }}
                                        className={`w-full text-left px-3 py-2.5 rounded-xl transition-all text-sm font-semibold flex items-center justify-between ${
                                          selectedPresetLabel === 'Custom Range'
                                            ? 'bg-emerald-50 border border-emerald-200 text-[#00c87e]'
                                            : 'text-[#00c87e] hover:bg-emerald-50'
                                        }`}
                                      >
                                        <span>Custom Range</span>
                                        <div className="flex items-center gap-1">
                                          {selectedPresetLabel === 'Custom Range' && (
                                            <svg className="w-4 h-4 text-[#00c87e] shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                          )}
                                          <Calendar className="w-4 h-4" />
                                        </div>
                                      </button>
                                    </div>
                                  </div>
                                )
                              })()}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <button
                    onClick={downloadPDF}
                    className="bg-black text-white rounded-lg px-4 py-3 flex items-center justify-center gap-2 hover:bg-gray-800 active:scale-95 transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span className="text-sm font-semibold">Get Report</span>
                  </button>
                </div>
                {/* Fullscreen backdrop for date selector overlay */}
                {showDateRangePicker && (
                  <div 
                    className="fixed inset-0 bg-black/35 z-40 transition-opacity duration-150"
                    onClick={() => setShowDateRangePicker(false)}
                  />
                )}
                {loadingPastCycles ? (
                  <div className="bg-white rounded-lg p-4">
                    <p className="text-sm text-gray-600 text-center">Loading past cycles...</p>
                  </div>
                ) : (
                  <>
                    {/* Show past cycles orders if available */}
                    {pastCyclesData && pastCyclesData.orders && pastCyclesData.orders.length > 0 ? (
                      <div className="bg-white rounded-lg p-4 space-y-3">
                        {pastCyclesData.orders.map((order, index) => (
                          <div key={order.orderId || index} className="border-b border-gray-200 pb-3 last:border-b-0 last:pb-0">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-gray-900 mb-1">
                                  Order ID: {order.orderId || 'N/A'}
                                </p>
                                <p className="text-xs text-gray-600">
                                  {order.sourceLabel || 'Order'} • {order.foodNames || (order.items && order.items.map(item => item.name).join(', ')) || 'N/A'}
                                </p>
                              </div>
                              <div className="text-right ml-4">
                                <p className="text-sm font-bold text-gray-900">
                                  ₹{formatCurrencyByOrder(order, order.payout || 0)}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {["cash", "razorpay_qr", "counter"].includes(String(order?.paymentMethod || "").toLowerCase()) ? "Wallet Adjustment" : "Earning"}
                                </p>
                              </div>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-gray-500">
                              <p>Platform coupon: ₹{Number(order.platformCouponDiscount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                              <p>Your coupon: ₹{Number(order.restaurantCouponDiscount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                              <p>Your offer: ₹{Number(order.restaurantOfferDiscount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                              <p>Commission: ₹{formatCurrencyByOrder(order, order.commission || 0)}</p>
                            </div>
                            {["cash", "razorpay_qr", "counter"].includes(String(order?.paymentMethod || "").toLowerCase()) && (
                              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
                                <p>
                                  Admin recoverable: ₹{formatCurrencyByOrder(order, order?.adminChargesRecoverable || 0)} | Platform comp: ₹{formatCurrencyByOrder(order, order?.platformDiscountCompensation || 0)}
                                </p>
                                <p className="mt-0.5">
                                  Wallet adjustment: ₹{formatCurrencyByOrder(order, order?.walletNetAdjustment || 0)} | Settlement: {order?.settlementApplied ? (
                                    <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-800 font-bold text-[9px] ml-0.5">Applied</span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[9px] ml-0.5">Pending</span>
                                  )}
                                </p>
                                {order?.sourceModule === "dining" && Number(order?.diningBreakdown?.total || 0) > 0 && (
                                  <p className="mt-0.5">
                                    Dining deduction: ₹{formatRoundedCurrency(order?.diningBreakdown?.total || 0)}{Number(order?.diningBreakdown?.gst || 0) > 0 && ` | GST: ₹${formatRoundedCurrency(order?.diningBreakdown?.gst)}`}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (pastCyclesData && pastCyclesData.orders && pastCyclesData.orders.length === 0) ? (
                      <div className="bg-white rounded-lg p-8 text-center border border-dashed border-gray-300">
                        <p className="text-sm text-gray-500 italic">No orders found for this selected range.</p>
                      </div>
                    ) : null}

                    {/* Show current cycle orders if past cycles data is not requested or not being viewed */}
                    {(!pastCyclesData || !pastCyclesData.orders) && !loadingPastCycles && financeData?.currentCycle?.orders && financeData.currentCycle.orders.length > 0 && (
                      <div className="bg-white rounded-lg p-4 space-y-3">
                        {financeData.currentCycle.orders.map((order, index) => (
                          <div key={order.orderId || index} className="border-b border-gray-200 pb-3 last:border-b-0 last:pb-0">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-gray-900 mb-1">
                                  Order ID: {order.orderId || 'N/A'}
                                </p>
                                <p className="text-xs text-gray-600">
                                  {order.sourceLabel || 'Order'} • {order.foodNames || (order.items && order.items.map(item => item.name).join(', ')) || 'N/A'}
                                </p>
                              </div>
                              <div className="text-right ml-4">
                                <p className="text-sm font-bold text-gray-900">
                                  ₹{formatCurrencyByOrder(order, order.payout || 0)}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {["cash", "razorpay_qr", "counter"].includes(String(order?.paymentMethod || "").toLowerCase()) ? "Wallet Adjustment" : "Earning"}
                                </p>
                              </div>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-gray-500">
                              <p>Platform coupon: ₹{Number(order.platformCouponDiscount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                              <p>Your coupon: ₹{Number(order.restaurantCouponDiscount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                              <p>Your offer: ₹{Number(order.restaurantOfferDiscount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                              <p>Commission: ₹{formatCurrencyByOrder(order, order.commission || 0)}</p>
                            </div>
                            {["cash", "razorpay_qr", "counter"].includes(String(order?.paymentMethod || "").toLowerCase()) && (
                              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
                                <p>
                                  Admin recoverable: ₹{formatCurrencyByOrder(order, order?.adminChargesRecoverable || 0)} | Platform comp: ₹{formatCurrencyByOrder(order, order?.platformDiscountCompensation || 0)}
                                </p>
                                <p className="mt-0.5">
                                  Wallet adjustment: ₹{formatCurrencyByOrder(order, order?.walletNetAdjustment || 0)} | Settlement: {order?.settlementApplied ? (
                                    <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-800 font-bold text-[9px] ml-0.5">Applied</span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[9px] ml-0.5">Pending</span>
                                  )}
                                </p>
                                {order?.sourceModule === "dining" && Number(order?.diningBreakdown?.total || 0) > 0 && (
                                  <p className="mt-0.5">
                                    Dining deduction: ₹{formatRoundedCurrency(order?.diningBreakdown?.total || 0)}{Number(order?.diningBreakdown?.gst || 0) > 0 && ` | GST: ₹${formatRoundedCurrency(order?.diningBreakdown?.gst)}`}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {(!pastCyclesData || (!pastCyclesData.orders || pastCyclesData.orders.length === 0)) && 
                     (!financeData?.currentCycle?.orders || financeData.currentCycle.orders.length === 0) && 
                     !loadingPastCycles && !loading && (
                      <div className="bg-white rounded-lg p-12 text-center border border-gray-200">
                        <p className="text-gray-400 mb-2">No transaction history available</p>
                        <p className="text-xs text-gray-500">Your earnings and order payouts will appear here.</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "invoices" && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Invoices & Taxes Summary</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-md bg-gray-50 p-3">
                  <p className="text-xs text-gray-600">Orders</p>
                  <p className="text-base font-semibold text-gray-900">{invoiceSummary.count}</p>
                </div>
                <div className="rounded-md bg-gray-50 p-3">
                  <p className="text-xs text-gray-600">Earnings</p>
                  <p className="text-base font-semibold text-gray-900">₹{invoiceSummary.earnings.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="rounded-md bg-gray-50 p-3">
                  <p className="text-xs text-gray-600">Commission</p>
                  <p className="text-base font-semibold text-gray-900">₹{invoiceSummary.commission.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="rounded-md bg-gray-50 p-3">
                  <p className="text-xs text-gray-600">Gross amount</p>
                  <p className="text-base font-semibold text-gray-900">₹{invoiceSummary.gross.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Order invoice details</h3>
              {loading ? (
                <p className="text-sm text-gray-500">Loading invoice data...</p>
              ) : invoiceOrders.length === 0 ? (
                <p className="text-sm text-gray-500">No invoice data available for selected range.</p>
              ) : (
                <div className="space-y-2">
                  {invoiceOrders.map((order, index) => (
                    <div key={`${order.orderId || index}-invoice`} className="border border-gray-100 rounded-md p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">Order: {order.orderId || "N/A"}</p>
                          <p className="text-xs text-gray-600 mt-0.5">
                            {(order.sourceLabel || "Order")} | {order.paymentMethod || "N/A"} | {order.orderStatus || "N/A"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-gray-900">
                            ₹{getRestaurantItemAmount(order).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <p className="text-xs text-gray-500">Total</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Withdrawal Modal */}
      <AnimatePresence>
        {showWithdrawalModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50"
              onClick={() => setShowWithdrawalModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900">Withdraw Amount</h2>
                  <button
                    onClick={() => {
                      setShowWithdrawalModal(false)
                      setWithdrawalAmount('')
                    }}
                    className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
                
                <div className="mb-4">
                  <p className="text-sm text-gray-600 mb-2">
                    Available Balance: <span className="font-semibold text-gray-900">₹{(financeData?.currentCycle?.estimatedPayout || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </p>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Enter Amount to Withdraw
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    max={financeData?.currentCycle?.estimatedPayout || 0}
                    step="0.01"
                    value={withdrawalAmount}
                    onChange={(e) => setWithdrawalAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none"
                  />
                  {withdrawalAmount && parseFloat(withdrawalAmount) > (financeData?.currentCycle?.estimatedPayout || 0) && (
                    <p className="text-sm text-red-600 mt-1">Amount cannot exceed available balance</p>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowWithdrawalModal(false)
                      setWithdrawalAmount('')
                    }}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      const amount = parseFloat(withdrawalAmount)
                      if (!amount || amount <= 0) {
                        alert('Please enter a valid amount')
                        return
                      }
                      if (amount > (financeData?.currentCycle?.estimatedPayout || 0)) {
                        alert('Amount cannot exceed available balance')
                        return
                      }
                      
                      try {
                        setSubmittingWithdrawal(true)
                        const response = await restaurantAPI.createWithdrawalRequest(amount)
                        if (response.data?.success) {
                          alert('Withdrawal request submitted successfully!')
                          setShowWithdrawalModal(false)
                          setWithdrawalAmount('')
                          // Refresh finance data
                          const financeResponse = await restaurantAPI.getFinance()
                          if (financeResponse.data?.success && financeResponse.data?.data) {
                            setFinanceData(financeResponse.data.data)
                          }
                          const withdrawalResponse = await restaurantAPI.getWithdrawalHistory()
                          const withdrawalPayload = withdrawalResponse?.data?.data
                          const withdrawalList = Array.isArray(withdrawalPayload)
                            ? withdrawalPayload
                            : Array.isArray(withdrawalPayload?.withdrawals)
                              ? withdrawalPayload.withdrawals
                              : []
                          setWithdrawalRequests(withdrawalList)
                        } else {
                          alert(response.data?.message || 'Failed to submit withdrawal request')
                        }
                      } catch (error) {
                        debugError('Error submitting withdrawal request:', error)
                        alert(error.response?.data?.message || 'Failed to submit withdrawal request. Please try again.')
                      } finally {
                        setSubmittingWithdrawal(false)
                      }
                    }}
                    disabled={submittingWithdrawal || !withdrawalAmount || parseFloat(withdrawalAmount) <= 0 || parseFloat(withdrawalAmount) > (financeData?.currentCycle?.estimatedPayout || 0)}
                    className="flex-1 px-4 py-3 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {submittingWithdrawal ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Custom Range Calendar Popup Modal */}
      <AnimatePresence>
        {customRangeActive && (() => {
          const DAYS3 = ['Su','Mo','Tu','We','Th','Fr','Sa']
          const MONTHS3 = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
          const MONTHS3_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']
          const year3 = calStartViewDate.getFullYear()
          const month3 = calStartViewDate.getMonth()
          const firstDay3 = new Date(year3, month3, 1).getDay()
          const daysInMonth3 = new Date(year3, month3 + 1, 0).getDate()
          const today3 = new Date(); today3.setHours(0,0,0,0)
          const cells3 = []
          for (let i = 0; i < firstDay3; i++) cells3.push(null)
          for (let d = 1; d <= daysInMonth3; d++) cells3.push(d)
          const prevM3 = () => { const d = new Date(calStartViewDate); d.setDate(1); d.setMonth(d.getMonth() - 1); setCalStartViewDate(d) }
          const nextM3 = () => { const d = new Date(calStartViewDate); d.setDate(1); d.setMonth(d.getMonth() + 1); setCalStartViewDate(d) }
          const fmt3 = (d) => d ? `${d.getDate()} ${MONTHS3[d.getMonth()]} '${d.getFullYear().toString().slice(-2)}` : '—'
          const handleDayClick3 = (cellDate) => {
            if (!customStartDate || (customStartDate && customEndDate)) {
              setCustomStartDate(cellDate); setCustomEndDate(null); setCalPickingEnd(true)
            } else {
              if (cellDate < customStartDate) { setCustomStartDate(cellDate); setCustomEndDate(null) }
              else { setCustomEndDate(cellDate); setCalPickingEnd(false) }
            }
          }
          return (
            <>
              {/* Dimmed backdrop */}
              <motion.div
                key="cal-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-50"
                onClick={() => setCustomRangeActive(false)}
              />
              {/* Calendar card */}
              <motion.div
                key="cal-popup"
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[60] bg-white rounded-2xl shadow-2xl p-5 select-none"
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-gray-900">Select Date Range</h3>
                  <button type="button" onClick={() => setCustomRangeActive(false)} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                {/* Start → End pills */}
                <div className="flex gap-3 mb-4">
                  <div className={`flex-1 rounded-xl px-3 py-2 text-center border-2 transition-all ${
                    !customStartDate || (!customEndDate && !calPickingEnd) ? 'border-[#00c87e] bg-emerald-50' : 'border-gray-200 bg-gray-50'
                  }`}>
                    <p className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">Start</p>
                    <p className={`text-sm font-bold mt-0.5 ${customStartDate ? 'text-[#00c87e]' : 'text-gray-400'}`}>{fmt3(customStartDate)}</p>
                  </div>
                  <div className="flex items-center text-gray-300 text-xl">→</div>
                  <div className={`flex-1 rounded-xl px-3 py-2 text-center border-2 transition-all ${
                    calPickingEnd ? 'border-[#00c87e] bg-emerald-50' : 'border-gray-200 bg-gray-50'
                  }`}>
                    <p className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">End</p>
                    <p className={`text-sm font-bold mt-0.5 ${customEndDate ? 'text-[#00c87e]' : 'text-gray-400'}`}>{fmt3(customEndDate)}</p>
                  </div>
                </div>
                {/* Month nav */}
                <div className="flex items-center justify-between mb-3">
                  <button type="button" onClick={prevM3} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 text-xl leading-none font-light">‹</button>
                  <span className="text-base font-bold text-gray-900">{MONTHS3_FULL[month3]} {year3}</span>
                  <button type="button" onClick={nextM3} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 text-xl leading-none font-light">›</button>
                </div>
                {/* Day headers */}
                <div className="grid grid-cols-7 mb-1">
                  {DAYS3.map(d => <div key={d} className="text-center text-xs font-bold text-gray-400 py-1">{d}</div>)}
                </div>
                {/* Day cells */}
                <div className="grid grid-cols-7 gap-y-0.5">
                  {cells3.map((day, idx) => {
                    if (!day) return <div key={`e-${idx}`} />
                    const cellDate = new Date(year3, month3, day); cellDate.setHours(0,0,0,0)
                    const isStart = customStartDate && cellDate.getTime() === customStartDate.getTime()
                    const isEnd = customEndDate && cellDate.getTime() === customEndDate.getTime()
                    const inRange = customStartDate && customEndDate && cellDate > customStartDate && cellDate < customEndDate
                    const isToday3 = cellDate.getTime() === today3.getTime()
                    const isFuture = cellDate > today3
                    return (
                      <button key={day} type="button" disabled={isFuture} onClick={() => !isFuture && handleDayClick3(cellDate)}
                        className={`text-center text-sm py-2 font-medium transition-all
                          ${isStart || isEnd ? 'bg-[#00c87e] text-white rounded-full shadow-sm' : ''}
                          ${inRange ? 'bg-emerald-100 text-emerald-800' : ''}
                          ${!isStart && !isEnd && !inRange && isToday3 ? 'border-2 border-[#00c87e] text-[#00c87e] rounded-full' : ''}
                          ${!isStart && !isEnd && !inRange && !isToday3 && !isFuture ? 'text-gray-800 hover:bg-emerald-50 rounded-full' : ''}
                          ${isFuture ? 'text-gray-300 cursor-not-allowed rounded-full' : 'cursor-pointer'}
                        `}
                      >{day}</button>
                    )
                  })}
                </div>
                {/* Hint */}
                <p className="text-center text-xs text-gray-400 mt-3">
                  {!customStartDate ? 'Tap a date to set start' : calPickingEnd ? 'Now tap end date' : customEndDate ? 'Tap Apply to confirm' : ''}
                </p>
                {/* Action buttons */}
                <div className="flex gap-3 mt-4">
                  <button type="button"
                    onClick={() => { setCustomStartDate(null); setCustomEndDate(null); setCalPickingEnd(false) }}
                    className="flex-1 py-3 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors"
                  >Clear</button>
                  <button type="button" onClick={applyCustomRange} disabled={!customStartDate || !customEndDate}
                    className="flex-1 py-3 bg-[#00c87e] hover:bg-[#00b06f] disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl text-sm font-bold transition-colors"
                  >Apply</button>
                </div>
              </motion.div>
            </>
          )
        })()}
      </AnimatePresence>

      <BottomNavOrders />
    </div>
  )
}

