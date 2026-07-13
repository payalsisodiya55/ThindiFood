import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import {
  ArrowLeft,
  ShoppingBag,
  Phone,
  Copy,
  Download,
  User,
  CreditCard,
  Calendar,
  MapPin,
  RotateCcw,
  FileText,
  ChevronRight,
} from "lucide-react"
import { orderAPI, restaurantAPI } from "@food/api"
import { useCart } from "@food/context/CartContext"
import { toast } from "sonner"
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import { getCompanyNameAsync } from "@food/utils/businessSettings"
import { RED } from "@food/constants/color"
import { buildReorderCartItems } from "@food/utils/reorderCart"
import {
  formatOrderItemLabel,
  formatOrderItemQuantityLabel,
} from "@food/utils/orderItemDisplay"

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const firstNonEmptyText = (...values) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

const getCleanPhone = (...values) => {
  for (const value of values) {
    const cleaned = String(value || "").replace(/[^\d+]/g, "")
    if (cleaned.length >= 5) return cleaned
  }
  return ""
}

const extractRestaurantId = (orderData) => {
  const candidates = [
    orderData?.restaurantId,
    orderData?.restaurant,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim()
    if (candidate && typeof candidate === "object") {
      const id = candidate._id || candidate.id
      if (typeof id === "string" && id.trim()) return id.trim()
    }
  }

  return ""
}

const hasUsableRestaurantPhone = (value) =>
  Boolean(
    getCleanPhone(
      value?.primaryContactNumber,
      value?.phone,
      value?.contactNumber,
      value?.ownerPhone,
      value?.contact?.phone,
      value?.location?.phone,
    ),
  )

const formatOrderStatusLabel = (status, isTakeawayOrder = false) => {
  const normalized = String(status || "").trim().toLowerCase()
  if (!normalized) return "Processing"
  if (normalized.includes("cancel")) return "Cancelled"
  if (normalized === "delivered" || normalized === "completed") {
    return isTakeawayOrder ? "Picked up" : "Delivered"
  }
  if (normalized === "out_for_delivery" || normalized === "outfordelivery") {
    return isTakeawayOrder ? "Ready for pickup" : "Out for delivery"
  }
  if (normalized === "ready_for_pickup" || normalized === "ready") {
    return isTakeawayOrder ? "Ready for pickup" : "Ready"
  }
  if (normalized === "preparing") return "Preparing"
  if (normalized === "confirmed" || normalized === "accepted") return "Confirmed"
  if (normalized === "created" || normalized === "placed" || normalized === "pending") return "Order placed"
  return normalized.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
}

const formatHistoryTimestamp = (value) => {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export default function UserOrderDetails() {
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const { replaceCart } = useCart()
  const { orderId } = useParams()
  const [order, setOrder] = useState(null)
  const [restaurant, setRestaurant] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchOrderDetails = async () => {
      try {
        setLoading(true)
        // Fetch using the ID from params (which will now be the MongoDB _id)
        const response = await orderAPI.getOrderDetails(orderId)

        let orderData = null
        if (response?.data?.success && response.data.data?.order) {
          orderData = response.data.data.order
        } else if (response?.data?.order && typeof response.data.order === 'object') {
          orderData = response.data.order
        } else {
          toast.error("Order not found")
          navigate("/user/orders")
          return
        }

        setOrder(orderData)

        const inlineRestaurant = orderData.restaurantId || orderData.restaurant || null
        const restaurantId = extractRestaurantId(orderData)
        const needsRestaurantFetch =
          Boolean(restaurantId) && !hasUsableRestaurantPhone(inlineRestaurant)

        if (needsRestaurantFetch) {
          try {
            const restaurantResponse = await restaurantAPI.getRestaurantById(restaurantId)
            if (restaurantResponse?.data?.success && restaurantResponse.data.data?.restaurant) {
              setRestaurant(restaurantResponse.data.data.restaurant)
            } else if (restaurantResponse?.data?.data && typeof restaurantResponse.data.data === "object") {
              setRestaurant(restaurantResponse.data.data)
            } else if (restaurantResponse?.data?.restaurant) {
              setRestaurant(restaurantResponse.data.restaurant)
            }
          } catch (restaurantError) {
            debugWarn("Failed to fetch restaurant details:", restaurantError)
            // Don't show error toast, just log it - order details can still be shown
          }
        } else {
          setRestaurant(null)
        }
      } catch (error) {
        debugError("Error fetching order details:", error)
        toast.error(
          error?.response?.data?.message || "Failed to load order details"
        )
        navigate("/user/orders")
      } finally {
        setLoading(false)
      }
    }

    fetchOrderDetails()
  }, [orderId, navigate])

  const handleCopyOrderId = async () => {
    if (!order) return
    const id = order.orderId || order._id || orderId
    try {
      await navigator.clipboard.writeText(String(id))
      toast.success("Order ID copied")
    } catch {
      toast.error("Failed to copy Order ID")
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-gray-600 dark:text-gray-400 text-sm">Loading order details...</p>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-gray-700 dark:text-gray-300 text-sm font-medium">Order not found</p>
          <button
            onClick={() => navigate("/user/orders")}
            className="px-4 py-2 rounded-lg text-white text-sm font-semibold"
            style={{ backgroundColor: RED }}
          >
            Back to Orders
          </button>
        </div>
      </div>
    )
  }

  const orderIdDisplay = order.orderId || order._id || orderId
  // Use fetched restaurant data if available, otherwise use order.restaurantId or order.restaurant
  const restaurantObj = restaurant || order.restaurantId || order.restaurant || {}
  const restaurantName = firstNonEmptyText(
    restaurantObj.restaurantName,
    restaurantObj.name,
    typeof order.restaurant === "string" ? order.restaurant : "",
    order.restaurant?.restaurantName,
    order.restaurant?.name,
    order.restaurantId?.restaurantName,
    order.restaurantId?.name,
    order.restaurantName,
  ) || "Restaurant"

  // Build restaurant address (try restaurant fields first, then fall back)
  const restaurantLocation = (() => {
    const loc = restaurantObj.location || {}

    // Priority 1: direct address on restaurant object
    if (restaurantObj.address) return restaurantObj.address

    // Priority 2: formattedAddress from location
    if (loc.formattedAddress) return loc.formattedAddress

    // Priority 3: generic address / street-style fields
    if (loc.address) return loc.address

    if (loc.street || loc.city) {
      const parts = [
        loc.street,
        loc.area,
        loc.city,
        loc.state,
        loc.zipCode || loc.pincode || loc.postalCode,
      ].filter(Boolean)
      if (parts.length) return parts.join(", ")
    }

    // Priority 4: addressLine1 / addressLine2 style
    if (loc.addressLine1) {
      const parts = [
        loc.addressLine1,
        loc.addressLine2,
        loc.city,
        loc.state,
      ].filter(Boolean)
      if (parts.length) return parts.join(", ")
    }

    // Priority 5: order-level restaurantAddress if present
    if (order.restaurantAddress) return order.restaurantAddress

    // Don't fallback to user delivery address - show empty or "Address not available"
    return "Address not available"
  })()

  const items = Array.isArray(order.items) ? order.items : []
  const pricing = order.pricing || {}
  const sendsCutlery = order.sendCutlery !== false

  const userName = firstNonEmptyText(
    order.customerName,
    order.user?.name,
    order.user?.fullName,
    order.userId?.name,
    order.userId?.fullName,
    order.userName,
    order.deliveryAddress?.fullName,
    order.address?.fullName,
  ) || "Customer"
  const userPhone = order.user?.phone || order.userPhone || ""
  const paymentMethod = order.payment?.method || "Online"
  const isTakeawayOrder = String(order.fulfillmentType || "").toLowerCase() === "takeaway"
  const normalizedOrderStatus = String(order.status || "").trim().toLowerCase()
  const normalizedOrderWorkflowStatus = String(order.orderStatus || "").trim().toLowerCase()
  const isCancelledOrder =
    normalizedOrderStatus.includes("cancel") ||
    normalizedOrderWorkflowStatus.includes("cancel")
  const completedOrderStatuses = new Set([
    "delivered",
    "completed",
    "delivered_self",
    "delivered self",
    "completed_self",
    "completed self",
    "picked_up",
    "picked up",
  ])
  const isCompletedOrder =
    completedOrderStatuses.has(normalizedOrderStatus) ||
    completedOrderStatuses.has(normalizedOrderWorkflowStatus)
  const showTrackOrder = !isCancelledOrder && !isCompletedOrder
  const showCutleryPreference = !isTakeawayOrder
  const showDeliveryFee = !isTakeawayOrder
  const orderStatusLabel = formatOrderStatusLabel(order.status, isTakeawayOrder)
  const paymentMethodLabel =
    paymentMethod.toLowerCase() === "cash" || paymentMethod.toLowerCase() === "cod"
      ? isTakeawayOrder
        ? "Payment at restaurant"
        : "COD"
      : paymentMethod.toUpperCase()
  const deliveryAddress = order.address || order.deliveryAddress || {}
  const complaintEligibleStatuses = new Set([
    "delivered",
    "completed",
    "delivered_self",
    "delivered self",
    "completed_self",
    "completed self",
  ])
  const canShowRestaurantComplaint =
    complaintEligibleStatuses.has(normalizedOrderStatus) ||
    complaintEligibleStatuses.has(normalizedOrderWorkflowStatus)
  const paymentDate = order.createdAt
    ? new Date(order.createdAt).toLocaleString("en-IN", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
    : ""

  const addressText =
    deliveryAddress?.formattedAddress ||
    [
      deliveryAddress?.street,
      deliveryAddress?.additionalDetails,
      deliveryAddress?.city,
      deliveryAddress?.state,
      deliveryAddress?.zipCode,
    ]
      .filter(Boolean)
      .join(", ")

  const savings =
    (pricing.discount || 0) +
    (pricing.originalItemTotal || 0) -
    (pricing.subtotal || 0)
  const amountCellClassName = "min-w-[92px] text-right tabular-nums"

  // Restaurant phone (multiple fallbacks) - use fetched restaurant data first
  const restaurantPhone = getCleanPhone(
    restaurantObj.primaryContactNumber,
    restaurantObj.phone,
    restaurantObj.contactNumber,
    restaurantObj.ownerPhone,
    restaurantObj.contact?.phone,
    restaurantObj.location?.phone,
    order.restaurantPhone,
    order.restaurantId?.primaryContactNumber,
    order.restaurantId?.phone,
    order.restaurantId?.contactNumber,
    order.restaurantId?.ownerPhone,
    order.restaurantId?.contact?.phone,
    order.restaurantId?.location?.phone,
    order.restaurant?.primaryContactNumber,
    order.restaurant?.phone,
    order.restaurant?.contactNumber,
    order.restaurant?.ownerPhone,
    order.restaurant?.contact?.phone,
    order.restaurant?.location?.phone,
  )

  const handleCallRestaurant = () => {
    if (!restaurantPhone) {
      toast.error("Restaurant phone number not available")
      return
    }
    try {
      const link = document.createElement("a")
      link.href = `tel:${restaurantPhone}`
      link.setAttribute("target", "_self")
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch {
      window.location.assign(`tel:${restaurantPhone}`)
    }
  }

  const handleDownloadSummary = async () => {
    try {
      const companyName = await getCompanyNameAsync()
      // Create new PDF document
      const doc = new jsPDF()

      // Title
      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      doc.text(`${companyName} Order Summary and Receipt`, 105, 20, { align: 'center' })

      // Order details section
      let yPos = 35
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')

      // Order ID
      doc.setFont('helvetica', 'bold')
      doc.text('Order ID:', 20, yPos)
      doc.setFont('helvetica', 'normal')
      doc.text(orderIdDisplay, 60, yPos)
      yPos += 7

      // Order Time
      doc.setFont('helvetica', 'bold')
      doc.text('Order Time:', 20, yPos)
      doc.setFont('helvetica', 'normal')
      const orderTimeLines = doc.splitTextToSize(paymentDate || 'N/A', 130)
      doc.text(orderTimeLines, 60, yPos)
      yPos += orderTimeLines.length * 7

      // Customer Name
      doc.setFont('helvetica', 'bold')
      doc.text('Customer Name:', 20, yPos)
      doc.setFont('helvetica', 'normal')
      doc.text(userName || 'Customer', 60, yPos)
      yPos += 7

      // Delivery Address
      doc.setFont('helvetica', 'bold')
      doc.text('Delivery Address:', 20, yPos)
      doc.setFont('helvetica', 'normal')
      const addressLines = doc.splitTextToSize(addressText || 'N/A', 130)
      doc.text(addressLines, 60, yPos)
      yPos += addressLines.length * 7

      // Restaurant Name
      doc.setFont('helvetica', 'bold')
      doc.text('Restaurant Name:', 20, yPos)
      doc.setFont('helvetica', 'normal')
      const restaurantNameLines = doc.splitTextToSize(restaurantName || 'N/A', 130)
      doc.text(restaurantNameLines, 60, yPos)
      yPos += restaurantNameLines.length * 7

      // Restaurant Address
      doc.setFont('helvetica', 'bold')
      doc.text('Restaurant Address:', 20, yPos)
      doc.setFont('helvetica', 'normal')
      const restaurantAddressLines = doc.splitTextToSize(restaurantLocation || 'N/A', 130)
      doc.text(restaurantAddressLines, 60, yPos)
      yPos += restaurantAddressLines.length * 7 + 5

      // Items table
      const tableData = items.map(item => [
        formatOrderItemLabel(item),
        String(item.quantity || item.qty || 1),
        `Rs. ${Number(item.price || 0).toFixed(2)}`,
        `Rs. ${Number((item.price || 0) * (item.quantity || item.qty || 1)).toFixed(2)}`
      ])

      const pushSummaryRow = (label, value, styles = {}) => {
        tableData.push([
          "",
          "",
          { content: label, styles: { halign: "right", ...styles } },
          { content: value, styles: { halign: "right", ...styles } },
        ])
      }

      // Keep summary labels in the third column and amounts in the last column.
      pushSummaryRow(
        'Item Total',
        `Rs. ${Number(pricing.subtotal || pricing.itemTotal || 0).toFixed(2)}`,
        { fontStyle: 'bold' },
      )

      // Add tax and other fees
      if (pricing.tax > 0) {
        pushSummaryRow('GST (govt. taxes)', `Rs. ${Number(pricing.tax).toFixed(2)}`)
      }
      if (showDeliveryFee && pricing.deliveryFee > 0) {
        pushSummaryRow('Delivery Fee', `Rs. ${Number(pricing.deliveryFee).toFixed(2)}`)
      }
      if (pricing.platformFee > 0) {
        pushSummaryRow('Platform Fee', `Rs. ${Number(pricing.platformFee).toFixed(2)}`)
      }
      if (pricing.subscriptionFee > 0) {
        pushSummaryRow('Subscription / Other Fees', `Rs. ${Number(pricing.subscriptionFee).toFixed(2)}`)
      }
      if (pricing.discount > 0) {
        pushSummaryRow(
          'Discount',
          `-Rs. ${Number(pricing.discount).toFixed(2)}`,
          { textColor: [0, 150, 0] },
        )
      }

      pushSummaryRow(
        'Total Amount Paid:',
        `Rs. ${Number(pricing.total || 0).toFixed(2)}`,
        {
          fontStyle: 'bold',
          fillColor: [240, 240, 240],
          textColor: [0, 0, 0],
          fontSize: 10,
        },
      )

      autoTable(doc, {
        startY: yPos,
        head: [['Item', 'Quantity', 'Unit Price', 'Total Price']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [0, 0, 0], textColor: 255, fontStyle: 'bold', fontSize: 10 },
        styles: { fontSize: 9, cellPadding: { top: 4, right: 4, bottom: 4, left: 4 }, valign: 'middle', overflow: 'linebreak' },
        margin: { left: 20, right: 20 },
        tableWidth: 170,
        columnStyles: {
          0: { cellWidth: 72, halign: 'left' },
          1: { cellWidth: 24, halign: 'center' },
          2: { cellWidth: 34, halign: 'right' },
          3: { cellWidth: 40, halign: 'right', fontStyle: 'bold' }
        },
        bodyStyles: { textColor: [55, 65, 81] },
        didParseCell: (data) => {
          if (data.section === 'head') {
            if (data.column.index === 1) {
              data.cell.styles.halign = 'center'
            }
            if (data.column.index === 2 || data.column.index === 3) {
              data.cell.styles.halign = 'right'
            }
          }
        },
      })

      // Save PDF instantly
      const fileName = `Order_Summary_${orderIdDisplay}_${Date.now()}.pdf`
      doc.save(fileName)

      toast.success("Summary downloaded successfully!")
    } catch (error) {
      debugError("Error generating PDF:", error)
      toast.error("Failed to download summary")
    }
  }

  const handleTrackOrder = () => {
    navigate(`/user/orders/${orderIdDisplay}`)
  }

  const orderHistory = [
    order.createdAt
      ? {
          id: "placed",
          title: "Order placed",
          timestamp: formatHistoryTimestamp(order.createdAt),
        }
      : null,
    order.tracking?.confirmed?.timestamp || order.tracking?.confirmed?.status
      ? {
          id: "confirmed",
          title: "Confirmed",
          timestamp: formatHistoryTimestamp(order.tracking?.confirmed?.timestamp),
        }
      : null,
    order.tracking?.preparing?.timestamp || order.tracking?.preparing?.status
      ? {
          id: "preparing",
          title: "Preparing",
          timestamp: formatHistoryTimestamp(order.tracking?.preparing?.timestamp),
        }
      : null,
    order.tracking?.ready?.timestamp || order.tracking?.ready?.status || order.tracking?.ready_for_pickup?.timestamp
      ? {
          id: "ready",
          title: isTakeawayOrder ? "Ready for pickup" : "Ready",
          timestamp: formatHistoryTimestamp(order.tracking?.ready?.timestamp || order.tracking?.ready_for_pickup?.timestamp),
        }
      : null,
    order.tracking?.outForDelivery?.timestamp || order.tracking?.outForDelivery?.status
      ? {
          id: "out-for-delivery",
          title: isTakeawayOrder ? "Ready for pickup" : "Out for delivery",
          timestamp: formatHistoryTimestamp(order.tracking?.outForDelivery?.timestamp),
        }
      : null,
    order.deliveredAt || order.tracking?.delivered?.timestamp || order.tracking?.delivered?.status
      ? {
          id: "delivered",
          title: isTakeawayOrder ? "Picked up" : "Delivered",
          timestamp: formatHistoryTimestamp(order.deliveredAt || order.tracking?.delivered?.timestamp),
        }
      : null,
    String(order.status || "").toLowerCase().includes("cancel")
      ? {
          id: "cancelled",
          title: "Cancelled",
          timestamp: formatHistoryTimestamp(order.updatedAt || order.cancelledAt),
        }
      : null,
  ].filter((entry, index, list) => entry && list.findIndex((item) => item?.id === entry.id) === index)

  const handleReorder = async (currentOrder) => {
    const restaurantTarget =
      restaurantObj.slug ||
      restaurantObj._id ||
      restaurantObj.restaurantId ||
      (typeof currentOrder?.restaurantId === "string" ? currentOrder.restaurantId : currentOrder?.restaurantId?._id)

    if (!restaurantTarget || !items.length) {
      toast.error("Order items or restaurant information not available")
      return
    }

    const reorderItems = await buildReorderCartItems({
      items,
      restaurantName,
      restaurantId:
        restaurantObj._id ||
        restaurantObj.restaurantId ||
        currentOrder?.restaurantId?._id ||
        currentOrder?.restaurantId ||
        null,
      restaurantLookupId: restaurantTarget,
    })

    if (!reorderItems.length) {
      toast.error("No reorderable items found in this order")
      return
    }

    replaceCart(reorderItems)
    toast.success("Items added to cart")
    navigate("/user/cart")
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] pb-24 font-sans relative">
      {/* Header */}
      <div className="bg-white dark:bg-[#1a1a1a] p-4 flex items-center sticky top-0 z-20 shadow-sm border-b dark:border-gray-800">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={goBack}
            className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <ArrowLeft className="w-6 h-6 text-gray-700 dark:text-gray-300 cursor-pointer" />
          </button>
          <h1 className="text-lg font-semibold text-gray-800 dark:text-white">Order Details</h1>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="p-4 space-y-4">
        {/* Status Card */}
        <div className="bg-white dark:bg-[#1a1a1a] p-4 rounded-xl flex items-center gap-3 shadow-sm border border-transparent dark:border-gray-800">
          <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded-lg">
            <ShoppingBag className="w-6 h-6 text-gray-600 dark:text-gray-400" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-gray-800 dark:text-white">
              {isCompletedOrder
                ? isTakeawayOrder
                  ? "Order picked up"
                  : "Order was delivered"
                : "Order status: " + orderStatusLabel}
            </h2>
          </div>
          {showTrackOrder && (
            <button
              type="button"
              onClick={handleTrackOrder}
              className="flex items-center gap-1 text-sm font-semibold whitespace-nowrap"
              style={{ color: RED }}
            >
              Track Order
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Restaurant Info Card */}
        <div className="bg-white dark:bg-[#1a1a1a] p-4 rounded-xl shadow-sm border border-transparent dark:border-gray-800">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <img
                src={
                  // Prefer the food image from the first ordered item
                  (Array.isArray(items) && items[0]?.image) ||
                  restaurantObj.profileImage?.url ||
                  restaurantObj.profileImage ||
                  order.restaurantImage ||
                  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=100&q=80"
                }
                alt={restaurantName}
                className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
              />
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-gray-800 dark:text-white break-words break-all">{restaurantName}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 break-words break-all">{restaurantLocation}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCallRestaurant}
              className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-800 flex items-center justify-center transition-colors hover:bg-red-50 dark:hover:bg-red-950/20"
              style={{ color: RED }}
            >
              <Phone className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium">
              Order ID: #{orderIdDisplay}
            </span>
            <button type="button" onClick={handleCopyOrderId}>
              <Copy className="w-3 h-3 text-gray-400 dark:text-gray-500 cursor-pointer" />
            </button>
          </div>

          {showCutleryPreference && (
            <div className="flex items-center gap-2 mb-4">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${sendsCutlery
                    ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                    : "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800"
                  }`}
              >
                {sendsCutlery ? "Send cutlery" : "Don't send cutlery"}
              </span>
            </div>
          )}

          <div className="border-t border-dashed border-gray-200 dark:border-gray-800 my-3" />

          {/* Items */}
          {items.map((item, idx) => (
            <div key={idx} className="flex justify-between items-start mt-2">
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 border ${item.isVeg ? "border-green-600" : "border-red-600"
                    } flex items-center justify-center p-[1px]`}
                >
                  <div
                    className={`w-full h-full rounded-full ${item.isVeg ? "bg-green-600" : "bg-red-600"
                      }`}
                  />
                </div>
                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                  {formatOrderItemQuantityLabel(item)}
                </span>
              </div>
              <span className="text-sm text-gray-800 dark:text-white font-medium">
                ₹{(item.price || 0).toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        {/* Bill Summary Card */}
        <div className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-sm overflow-hidden border border-transparent dark:border-gray-800">
          <div className="p-4 flex justify-between items-center border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <h3 className="font-semibold text-gray-800 dark:text-white">Bill Summary</h3>
            </div>
            <button
              type="button"
              onClick={handleDownloadSummary}
              className="w-7 h-7 rounded-full bg-red-50 dark:bg-red-950/20 flex items-center justify-center transition-colors hover:bg-red-100 dark:hover:bg-red-900/20"
              style={{ color: RED }}
            >
              <Download className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-2 text-sm">
            <div className="flex items-start justify-between gap-4">
              <span className="text-gray-500 dark:text-gray-400">Item total</span>
              <div className={amountCellClassName}>
                {pricing.originalItemTotal && (
                  <span className="text-gray-400 line-through mr-1">
                    ₹{Number(pricing.originalItemTotal).toFixed(2)}
                  </span>
                )}
                <span className="text-gray-800 dark:text-white">
                  ₹{Number(pricing.subtotal || pricing.total || 0).toFixed(2)}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-gray-500 dark:text-gray-400">GST (govt. taxes)</span>
              <span className={`text-gray-800 dark:text-white ${amountCellClassName}`}>
                ₹{Number(pricing.tax || 0).toFixed(2)}
              </span>
            </div>
            {showDeliveryFee && (
              <div className="flex items-center justify-between gap-4">
              <div className="flex items-center">
                <span className="text-gray-500 dark:text-gray-400">Delivery fee</span>
                {pricing.deliveryFee === 0 && (
                  <span className="text-[10px] font-bold border px-1 rounded ml-1.5" style={{ color: RED, borderColor: RED }}>
                    FREE
                  </span>
                )}
              </div>
              <span className={`font-medium uppercase ${amountCellClassName}`} style={{ color: RED }}>
                {pricing.deliveryFee ? `₹${Number(pricing.deliveryFee).toFixed(2)}` : "Free"}
              </span>
              </div>
            )}

            <div className="flex items-center justify-between gap-4">
              <span className="text-gray-500 dark:text-gray-400">Platform fee</span>
              <span className={`text-gray-800 dark:text-white ${amountCellClassName}`}>
                ₹{Number(pricing.platformFee || 0).toFixed(2)}
              </span>
            </div>


            <div className="border-t border-gray-100 dark:border-gray-800 my-2 pt-2 flex items-center justify-between gap-4">
              <span className="font-bold text-gray-800 dark:text-white">Paid</span>
              <span className={`font-bold text-gray-800 dark:text-white ${amountCellClassName}`}>
                ₹{Number(pricing.total || 0).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Savings Banner */}
          {savings > 0 && (
            <div className="relative bg-red-50 dark:bg-red-950/20 p-3 pb-4 mt-2">
              <div className="absolute -top-1.5 left-0 w-full overflow-hidden leading-none">
                <svg
                  className="relative block w-[calc(100%+1.3px)] h-[8px]"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 1200 120"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M0,0V46.29c47,0,47,69.5,94,69.5s47-69.5,94-69.5,47,69.5,94,69.5,47-69.5,94-69.5,47,69.5,94,69.5,47-69.5,94-69.5,47,69.5,94,69.5,47-69.5,94-69.5,47,69.5,94,69.5V0Z"
                    fill="#ffffff"
                    className="fill-white dark:fill-[#1a1a1a]"
                  />
                </svg>
              </div>

              <div className="flex items-center justify-center gap-2 pt-1 font-bold text-sm" style={{ color: RED }}>
                <span>??</span>
                <span>
                  You saved ₹{Number(savings).toFixed(2)} on this order!
                </span>
              </div>
            </div>
          )}
        </div>

        {/* User & Delivery Details */}
        <div className="bg-white dark:bg-[#1a1a1a] p-4 rounded-xl shadow-sm space-y-5 border border-transparent dark:border-gray-800">
          {/* User */}
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
              <User className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-800 dark:text-white text-sm">
                {userName || "Customer"}
              </h4>
              <p className="text-gray-500 dark:text-gray-400 text-xs">{userPhone}</p>
            </div>
          </div>

          {/* Payment */}
          <div className="flex gap-3">
            <div className="mt-0.5">
              <CreditCard className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-800 dark:text-white text-sm">
                Payment method
              </h4>
              <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">
                Paid via: {paymentMethodLabel}
              </p>
            </div>
          </div>

          {/* Date */}
          <div className="flex gap-3">
            <div className="mt-0.5">
              <Calendar className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-800 dark:text-white text-sm">
                Payment date
              </h4>
              <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">{paymentDate}</p>
            </div>
          </div>

          {!isTakeawayOrder && (
            <div className="flex gap-3">
              <div className="mt-0.5">
                <MapPin className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-800 dark:text-white text-sm">
                  Delivery address
                </h4>
                <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5 leading-relaxed">
                  {addressText || "Address not available"}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-[#1a1a1a] p-4 rounded-xl shadow-sm border border-transparent dark:border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800 dark:text-white">Order status & history</h3>
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ backgroundColor: `${RED}12`, color: RED }}
            >
              {orderStatusLabel}
            </span>
          </div>
          <div className="space-y-3">
            {orderHistory.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3">
                <div className="mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: RED }} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-white">{entry.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {entry.timestamp || "Status updated"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Fixed Bottom Buttons */}
      <div className="fixed bottom-0 w-full bg-white dark:bg-[#1a1a1a] border-t border-gray-200 dark:border-gray-800 p-4 flex gap-3 z-20">
        <button
          type="button"
          onClick={() => handleReorder(order)}
          className="flex-1 text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
          style={{ backgroundColor: RED }}
        >
          <RotateCcw className="w-4 h-4" />
          Reorder
        </button>
        <button
          type="button"
          onClick={handleDownloadSummary}
          className="flex-1 bg-white dark:bg-[#1a1a1a] border py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors hover:bg-red-50 dark:hover:bg-red-950/20"
          style={{ borderColor: RED, color: RED }}
        >
          <Download className="w-4 h-4" />
          Invoice
        </button>
      </div>

      {/* Restaurant Complaint Button - show only after successful delivery/completion */}
      {order && canShowRestaurantComplaint && (
        <div className="p-4 pb-24">
          <button
            type="button"
            onClick={() => {
              // Use MongoDB _id (ObjectId) for the API call - backend complaint controller expects ObjectId
              // Priority: order._id (MongoDB ObjectId) > orderId from route params
              const orderMongoId = order._id || orderId

              if (!orderMongoId) {
                debugError("Order ID not available:", {
                  order: order ? { _id: order._id, orderId: order.orderId } : null,
                  routeOrderId: orderId
                })
                toast.error("Order ID not available. Please refresh the page.")
                return
              }

              // Convert to string if it's an ObjectId object
              const orderIdString = typeof orderMongoId === 'object' && orderMongoId.toString
                ? orderMongoId.toString()
                : String(orderMongoId)

              debugLog("Navigating to complaint page with orderId:", orderIdString)
              navigate(`/user/complaints/submit/${encodeURIComponent(orderIdString)}`)
            }}
            className="w-full bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
          >
            <FileText className="w-4 h-4" />
            Restaurant Complaint
          </button>
        </div>
      )}
    </div>
  )
}
