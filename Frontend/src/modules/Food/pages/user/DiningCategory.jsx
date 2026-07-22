import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, BadgePercent, Bookmark, Clock, MapPin, Star, UtensilsCrossed } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { Card, CardContent } from "@food/components/ui/card"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { useLocationSelector } from "@food/components/user/UserLayout"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import { useLocation as useLocationHook } from "@food/hooks/useLocation"
import { useProfile } from "@food/context/ProfileContext"
import { FaLocationDot } from "react-icons/fa6"
import { diningAPI, dineInAPI } from "@food/api"
import { getRestaurantAvailabilityStatus } from "@food/utils/restaurantAvailability"
import { RED } from "../../constants/color"
import { Calendar, Users, X, AlertTriangle, Eye, Phone } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@food/components/ui/badge"

const slugifyRestaurant = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")

const formatAddress = (restaurant) =>
  restaurant?.location?.addressLine1 ||
  restaurant?.addressLine1 ||
  restaurant?.location?.formattedAddress ||
  restaurant?.formattedAddress ||
  restaurant?.location?.address ||
  restaurant?.address ||
  [
    restaurant?.location?.area || restaurant?.area,
    restaurant?.location?.city || restaurant?.city
  ]
    .filter(Boolean)
    .join(", ") ||
  "Address unavailable"

const formatTimeValue = (value) => {
  if (!value) return null
  if (/[ap]m/i.test(value)) return value.toUpperCase()
  const date = new Date(`2000-01-01T${String(value).padStart(5, "0")}`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })
}

const formatTimingLabel = (status) => {
  if (!status?.openingTime || !status?.closingTime) return "Timings not updated"
  return `${formatTimeValue(status.openingTime)} - ${formatTimeValue(status.closingTime)}`
}

const formatCategoryHeading = (category) =>
  String(category || "dining")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")

const getStatusLabel = (status) => {
  const key = String(status || "").toUpperCase()
  if (key === "PENDING") return "Awaiting Restaurant Confirmation"
  if (key === "CONFIRMED" || key === "ACCEPTED") return "CONFIRMED"
  if (key === "CHECKED_IN") return "TABLE READY"
  if (key === "COMPLETED") return "COMPLETED"
  if (key === "CANCELLED") return "CANCELLED"
  if (key === "LATE_CANCELLED") return "LATE CANCELLED"
  if (key === "NO_SHOW" || key === "NO-SHOW") return "NO SHOW"
  if (key === "DECLINED") return "DECLINED"
  return String(status || "UNKNOWN").toUpperCase()
}

const getStatusBadgeClass = (status) => {
  const key = String(status || "").toUpperCase()
  if (key === "PENDING") return "bg-amber-100 text-amber-700"
  if (key === "CONFIRMED" || key === "ACCEPTED") return "bg-green-100 text-green-700"
  if (key === "CHECKED_IN") return "bg-orange-100 text-orange-700"
  if (key === "COMPLETED") return "bg-blue-100 text-blue-700"
  if (key === "CANCELLED") return "bg-slate-200 text-slate-700"
  if (key === "LATE_CANCELLED") return "bg-orange-100 text-orange-700"
  if (key === "NO_SHOW") return "bg-rose-100 text-rose-700"
  if (key === "DECLINED") return "bg-red-100 text-red-700"
  return "bg-slate-100 text-slate-700"
}

const getBookingGuestName = (booking) =>
  String(
    booking?.customerName ||
    booking?.user?.name ||
    booking?.userRef?.name ||
    ""
  ).trim() || "Guest"

const getBookingGuestPhone = (booking) =>
  String(
    booking?.customerPhone ||
    booking?.phone ||
    booking?.phoneNumber ||
    booking?.user?.phone ||
    booking?.userRef?.phone ||
    ""
  ).trim()

function BookingDetailsModal({ booking, onClose, onCancel }) {
  const canCancel = ["PENDING", "CONFIRMED", "ACCEPTED"].includes(String(booking?.status || "").toUpperCase())
  const isCheckedIn = String(booking?.status || "").toUpperCase() === "CHECKED_IN"
  const rawRest = booking.restaurantId && typeof booking.restaurantId === 'object' ? booking.restaurantId : (booking.restaurantRef || booking.restaurant || {})
  const restaurantName = rawRest.restaurantName || rawRest.name || "Restaurant"
  const restaurantAddress = formatAddress(rawRest)
  const restaurantPhone = String(rawRest.primaryContactNumber || rawRest.ownerPhone || rawRest.phone || rawRest.contactNumber || booking.restaurantPhone || "").trim()
  const bookingDisplayId = booking.bookingId || (booking._id ? `TBK-${String(booking._id).slice(-6).toUpperCase()}` : "--")
  const guestName = getBookingGuestName(booking)
  const guestPhone = getBookingGuestPhone(booking)

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg max-h-[82dvh] flex flex-col rounded-[28px] bg-white shadow-2xl overflow-hidden dark:bg-[#1a1a1a]">
        <div className="p-5 border-b border-slate-100 flex items-start justify-between dark:border-gray-800 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Reservation Details</p>
            <h3 className="text-xl font-black text-slate-900 mt-1 dark:text-white break-words">{restaurantName}</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 transition-colors dark:hover:bg-gray-800 flex-shrink-0 ml-4">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-5 space-y-4 flex-1 overflow-y-auto">
          <div className="rounded-2xl bg-slate-50 dark:bg-gray-800/50 p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Status</p>
              <Badge className={getStatusBadgeClass(booking.status)}>{getStatusLabel(booking.status)}</Badge>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Booking ID</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white font-mono">{bookingDisplayId}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-gray-800/50">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Date</p>
              <p className="mt-2 text-sm font-bold text-slate-900 dark:text-white">{`${new Date(booking.date).toLocaleDateString('en-US', { weekday: 'short' })}, ${new Date(booking.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-gray-800/50">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Time</p>
              <p className="mt-2 text-sm font-bold text-slate-900 dark:text-white">{booking.timeSlot}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-gray-800/50">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Guests</p>
              <p className="mt-2 text-sm font-bold text-slate-900 dark:text-white">{booking.guests} Guests</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-gray-800/50">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Special Request</p>
              <p className="mt-2 text-sm font-bold text-slate-900 dark:text-white break-words">{booking.specialRequest || "No special request"}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 p-4 dark:border-gray-800">
            <p className="text-sm font-semibold text-slate-500">Booked by</p>
            <p className="mt-2 text-sm font-bold text-slate-900 dark:text-white">{guestName}</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-gray-300">{guestPhone || "Phone not available"}</p>
          </div>

          <div className="rounded-2xl border border-slate-100 p-4 dark:border-gray-800 space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-500">Restaurant address</p>
              <p className="mt-1 text-sm text-slate-700 dark:text-gray-300">{restaurantAddress}</p>
            </div>

            {restaurantPhone && (
              <div className="pt-2.5 border-t border-slate-100 dark:border-gray-800 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-slate-400 dark:text-gray-400">Restaurant Phone</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{restaurantPhone}</p>
                </div>
                <a
                  href={`tel:${restaurantPhone}`}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-[#00c87e] hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-xs font-bold transition-all active:scale-95 shadow-sm"
                >
                  <Phone className="h-3.5 w-3.5" />
                  <span>Call</span>
                </a>
              </div>
            )}
          </div>
        </div>

        <div className="p-5 pt-0 space-y-3 flex-shrink-0">
          {isCheckedIn && (
            <Button
              onClick={() => window.location.assign("/user/dine-in/scan")}
              className="w-full h-12 rounded-2xl text-white font-bold bg-blue-600 hover:bg-blue-700"
            >
              Scan QR
            </Button>
          )}
          {canCancel && (
            <Button
              onClick={() => onCancel(booking)}
              className="w-full h-12 rounded-2xl text-white font-bold"
              style={{ backgroundColor: RED }}
            >
              Cancel Reservation
            </Button>
          )}
          <Button onClick={onClose} variant="outline" className="w-full h-12 rounded-2xl border-slate-200 text-slate-700 dark:border-gray-800 dark:text-gray-300">
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}

function CancelConfirmationModal({ booking, onClose, onConfirm, loading }) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-[#1a1a1a]">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl p-3 bg-red-50 dark:bg-red-950/20">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-wide">CANCEL RESERVATION?</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-gray-400">Are you sure you want to cancel this booking? This action cannot be undone.</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button
            onClick={onClose}
            className="h-12 rounded-2xl text-white font-bold"
            style={{ backgroundColor: RED }}
          >
            No, Keep it
          </Button>
          <Button
            onClick={() => onConfirm(booking)}
            disabled={loading}
            variant="outline"
            className="h-12 rounded-2xl border-red-500 text-red-500 font-bold hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/20"
          >
            {loading ? "Cancelling..." : "Yes, Cancel"}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function DiningCategory() {
  const { category } = useParams()
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const { openLocationSelector } = useLocationSelector()
  const { location } = useLocationHook()
  const { addFavorite, removeFavorite, isFavorite } = useProfile()

  const [restaurants, setRestaurants] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [bookingDetails, setBookingDetails] = useState(null)
  const [bookingToCancel, setBookingToCancel] = useState(null)
  const [isCancelling, setIsCancelling] = useState(false)
  
  const isBookings = category === "my-bookings"

  useEffect(() => {
    const fetchRestaurants = async () => {
      try {
        setIsLoading(true)
        if (isBookings) {
          const response = await dineInAPI.getUserBookings()
          if (response?.data?.success) {
            const mapped = (Array.isArray(response.data.data) ? response.data.data : []).map((booking) => {
              const rawRest = booking.restaurantId && typeof booking.restaurantId === 'object' ? booking.restaurantId : (booking.restaurantRef || booking.restaurant || {})
              const restaurant = rawRest || {}
              return {
                id: booking._id,
                bookingId: booking.bookingId,
                slug: restaurant.restaurantNameNormalized || restaurant.slug || "",
                name: restaurant.name || restaurant.restaurantName || "Restaurant",
                image: (Array.isArray(restaurant.coverImages) ? restaurant.coverImages[0] : restaurant.coverImages) || 
                       restaurant.coverImage || 
                       (Array.isArray(restaurant.menuImages) ? restaurant.menuImages[0] : restaurant.menuImages?.[0]) || 
                       restaurant.profileImage?.url || 
                       restaurant.profileImage || 
                       restaurant.image || 
                       null,
                address: formatAddress(restaurant),
                cuisine: `${booking.guests} Guests`,
                status: booking.status,
                date: `${new Date(booking.date).toLocaleDateString('en-US', { weekday: 'short' })}, ${new Date(booking.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`,
                time: booking.timeSlot,
                price: `Booking ID: ${booking.bookingId || "N/A"}`,
                offer: `${booking.timeSlot} • ${new Date(booking.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`,
                rating: booking.status,
                contactNumber:
                  restaurant.primaryContactNumber ||
                  restaurant.ownerPhone ||
                  restaurant.phone ||
                  restaurant.phoneNumber ||
                  restaurant.contactNumber ||
                  booking.restaurant?.primaryContactNumber ||
                  booking.restaurant?.ownerPhone ||
                  booking.restaurant?.phone ||
                  booking.restaurant?.contactNumber ||
                  booking.restaurantId?.primaryContactNumber ||
                  booking.restaurantId?.ownerPhone ||
                  booking.restaurantId?.phone ||
                  "",
                isBooking: true,
                originalData: booking
              }
            })
            setRestaurants(mapped)
            setError(null)
          } else {
            setRestaurants([])
          }
          return
        }

        const response = await diningAPI.getRestaurants(
          category
            ? (location?.city ? { category, city: location.city } : { category })
            : (location?.city ? { city: location.city } : {})
        )

        if (response?.data?.success) {
          const mapped = (Array.isArray(response.data.data) ? response.data.data : []).map((restaurant) => {
            const availability = getRestaurantAvailabilityStatus(restaurant)
            return {
              id: restaurant._id || restaurant.id,
              slug: restaurant.restaurantNameNormalized || slugifyRestaurant(restaurant.restaurantName || restaurant.name),
              name: restaurant.restaurantName || restaurant.name || "Restaurant",
                image:
                  restaurant.coverImage ||
                  restaurant.menuImages?.[0] ||
                  restaurant.profileImage?.url ||
                  restaurant.profileImage ||
                  null,
              address: formatAddress(restaurant),
              cuisine:
                Array.isArray(restaurant.cuisines) && restaurant.cuisines.length > 0
                  ? restaurant.cuisines.join(" • ")
                  : "Multi-cuisine",
              price: restaurant.costForTwo ? `Rs ${restaurant.costForTwo} for two` : "Price on request",
              rating: Number(restaurant.rating || restaurant.avgRating || 0).toFixed(1),
              offer: restaurant.offer || "Pre-book tables and dining offers",
              featuredDish: restaurant.featuredDish || "Chef's special",
              featuredPrice: restaurant.featuredPrice || null,
              availability,
              isBooking: false
            }
          })
          setRestaurants(mapped)
          setError(null)
        } else {
          setRestaurants([])
        }
      } catch (fetchError) {
        setError(isBookings ? "Failed to load your bookings" : "Failed to load dining restaurants")
        setRestaurants([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchRestaurants()
  }, [category, location?.city])

  useEffect(() => {
    const shouldLockScroll = Boolean(bookingDetails || bookingToCancel)
    if (!shouldLockScroll) return undefined

    const previousOverflow = document.body.style.overflow
    const previousTouchAction = document.body.style.touchAction
    document.body.style.overflow = "hidden"
    document.body.style.touchAction = "none"

    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.touchAction = previousTouchAction
    }
  }, [bookingDetails, bookingToCancel])

  const cityName = location?.city || "Select location"
  const heading = useMemo(() => formatCategoryHeading(category), [category])

  const handleLocationClick = useCallback(() => {
    openLocationSelector()
  }, [openLocationSelector])

  const handleCancelBooking = async (booking) => {
    try {
      setIsCancelling(true)
      const response = await dineInAPI.cancelBooking(booking._id)
      if (response?.data?.success) {
        toast.success("Reservation cancelled successfully.")
        // Update local state
        setRestaurants(prev => prev.map(item => 
          item.id === booking._id ? { ...item, status: "CANCELLED", rating: "CANCELLED" } : item
        ))
        setBookingToCancel(null)
        setBookingDetails(null)
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to cancel reservation")
    } finally {
      setIsCancelling(false)
    }
  }

  const handleViewDetails = (event, restaurant) => {
    event.preventDefault()
    event.stopPropagation()
    // Find the original booking data from the mapping
    const originalBooking = restaurant.originalData
    setBookingDetails({
      ...originalBooking,
      restaurantId: originalBooking.restaurantId || originalBooking.restaurantRef // Ensure address logic works
    })
  }

  return (
    <AnimatedPage className="min-h-screen bg-[#fffaf4] pb-24 dark:bg-[#0a0a0a]">
      <div className="sticky top-0 z-30 border-b border-[#efe2d2] bg-[rgba(255,250,244,0.95)] backdrop-blur-xl dark:border-gray-800 dark:bg-[rgba(10,10,10,0.95)]">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={goBack}
            className="h-10 w-10 rounded-full border border-[#e7d8c5] bg-white text-[#2f2215] hover:bg-[#fff1df] dark:border-gray-700 dark:bg-[#1a1a1a] dark:text-white dark:hover:bg-gray-800"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            onClick={handleLocationClick}
            className="h-auto min-w-[135px] px-5 py-2 rounded-full border border-[#e7d8c5] bg-white text-left hover:bg-[#fff3e6] dark:border-gray-700 dark:bg-[#1a1a1a] dark:hover:bg-gray-800"
          >
            <div className="flex items-center gap-2">
              <FaLocationDot className="h-4 w-4 flex-shrink-0" style={{ color: RED }} />
              <div className="flex flex-col justify-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#aa8b68] dark:text-[#aa8b68] leading-tight">Dining In</p>
                <p className="text-xs font-bold text-[#2f2215] dark:text-white leading-tight mt-0.5">{cityName}</p>
              </div>
            </div>
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-6 rounded-[28px] border border-[#f0dfca] bg-gradient-to-br from-[#fff4e7] via-white to-[#fff9f3] p-6 shadow-[0_18px_60px_rgba(90,55,20,0.08)] dark:border-gray-800 dark:bg-gradient-to-br dark:from-[#161616] dark:via-[#101010] dark:to-[#1a1a1a] dark:shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.34em]" style={{ color: RED }}>{isBookings ? "Your Reservation" : "Dining Category"}</p>
              <h1 className="text-3xl font-black tracking-tight text-[#23180f] sm:text-4xl dark:text-white">{isBookings ? "My Bookings" : heading}</h1>
              <p className="mt-2 max-w-2xl text-sm text-[#6b5641] dark:text-gray-300">
                {isBookings 
                  ? "Explore your past and upcoming table reservations. Check status, view details, or manage your bookings."
                  : "Explore all restaurants linked to this dining category, check their timings, preview the menu, and jump straight into table booking."
                }
              </p>
            </div>
            <div className="inline-flex items-center gap-2 self-start rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#6b5641] shadow-sm dark:border dark:border-gray-700 dark:bg-[#1a1a1a] dark:text-gray-300">
              {isBookings ? (
                <Calendar className="h-4 w-4" style={{ color: RED }} />
              ) : (
                <MapPin className="h-4 w-4" style={{ color: RED }} />
              )}
              <span>{restaurants.length} {isBookings ? "bookings" : "places"} found</span>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="py-20 text-center text-[#7f6850] dark:text-gray-400">Loading dining restaurants...</div>
        ) : error ? (
          <div className="py-20 text-center text-red-600">{error}</div>
        ) : restaurants.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[#e8d9c5] bg-white px-6 py-16 text-center text-[#7f6850] dark:border-gray-800 dark:bg-[#141414] dark:text-gray-400">
            {isBookings ? "You have no table bookings yet." : "No restaurants are linked to this dining category yet."}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {restaurants.map((restaurant) => {
              const favorite = isFavorite(restaurant.slug)

              const toggleFavorite = (event) => {
                event.preventDefault()
                event.stopPropagation()

                if (favorite) {
                  removeFavorite(restaurant.slug)
                  return
                }

                addFavorite({
                  slug: restaurant.slug,
                  name: restaurant.name,
                  cuisine: restaurant.cuisine,
                  rating: restaurant.rating,
                  image: restaurant.image,
                })
              }

              const CardWrapper = isBookings ? "div" : Link
              const wrapperProps = isBookings 
                ? { onClick: (e) => handleViewDetails(e, restaurant), className: "cursor-pointer block" }
                : { to: `/food/user/dining/${category}/${restaurant.slug}`, state: { restaurant } }

              return (
                <CardWrapper
                  key={restaurant.id}
                  {...wrapperProps}
                >
                  <Card className="group overflow-hidden rounded-[30px] border border-[#f0dfca] bg-white py-0 shadow-[0_18px_60px_rgba(17,24,39,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_80px_rgba(17,24,39,0.14)] dark:border-gray-800 dark:bg-[#141414] dark:shadow-[0_18px_60px_rgba(0,0,0,0.35)] dark:hover:shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                    <div className="relative h-64 overflow-hidden">
                      <img
                        src={restaurant.image}
                        alt={restaurant.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        onError={(event) => {
                          event.currentTarget.style.display = "none"
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                      <div className="absolute left-4 right-4 top-4 flex items-start justify-between gap-3">
                        <div className="rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
                          {isBookings ? `Guests: ${restaurant.cuisine.split(" ")[0]}` : restaurant.featuredDish}
                          {!isBookings && restaurant.featuredPrice ? ` • ${"\u20B9"}${restaurant.featuredPrice}` : ""}
                        </div>
                        {!isBookings && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={toggleFavorite}
                            className="h-10 w-10 rounded-full bg-white/90 text-[#2f2215] backdrop-blur-sm hover:bg-white dark:bg-[#1f1f1f]/90 dark:text-white dark:hover:bg-[#2b2b2b]"
                          >
                            <Bookmark className={`h-5 w-5 ${favorite ? "fill-current" : ""}`} />
                          </Button>
                        )}
                      </div>

                      {!isBookings && (
                        <div className="absolute bottom-4 left-4 right-4">
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.32em] text-white/80">
                            Reserve Your Table
                          </p>
                          <p className="max-w-[85%] text-2xl font-black leading-tight text-white">{restaurant.offer}</p>
                        </div>
                      )}
                    </div>

                    <CardContent className="space-y-4 p-5">
                      {isBookings ? (
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <h2 className="text-[20px] md:text-[22px] font-black leading-tight text-[#23180f] dark:text-white break-words flex-1 min-w-0">{restaurant.name}</h2>
                            {restaurant.contactNumber && (
                              <a 
                                href={`tel:${restaurant.contactNumber}`}
                                onClick={(e) => e.stopPropagation()}
                                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors shadow-sm"
                              >
                                <Phone className="h-3.5 w-3.5" />
                                <span>Call</span>
                              </a>
                            )}
                          </div>
                          <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#6b5641] dark:text-gray-300">{restaurant.address}</p>
                          <div className="mt-3">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold text-white tracking-wider ${
                              restaurant.status === "PENDING" ? "bg-amber-500" :
                              restaurant.status === "CONFIRMED" || restaurant.status === "ACCEPTED" ? "bg-emerald-600" :
                              restaurant.status === "DECLINED" || restaurant.status === "CANCELLED" || restaurant.status === "LATE_CANCELLED" || restaurant.status === "NO_SHOW" || restaurant.status === "NO-SHOW" ? "bg-rose-600" :
                              "bg-blue-600"
                            }`}>
                              {getStatusLabel(restaurant.status).toUpperCase()}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <h2 className="truncate text-[22px] font-black leading-tight text-[#23180f] dark:text-white">{restaurant.name}</h2>
                            <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#6b5641] dark:text-gray-300">{restaurant.address}</p>
                          </div>
                          <div className="inline-flex flex-shrink-0 items-center gap-1 rounded-2xl px-2 py-1 text-xs font-bold text-white bg-emerald-600">
                            <span>{restaurant.rating}</span>
                            <Star className="h-3.5 w-3.5 fill-current" />
                          </div>
                        </div>
                      )}

                      {isBookings ? (
                        <div className="flex flex-wrap gap-3">
                           <div className="flex items-center gap-2 text-sm text-[#5f4c39] dark:text-gray-300 bg-slate-50 dark:bg-gray-800 px-3 py-1.5 rounded-xl">
                            <Calendar className="h-4 w-4" style={{ color: RED }} />
                            <span className="font-bold">{restaurant.date}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-[#5f4c39] dark:text-gray-300 bg-slate-50 dark:bg-gray-800 px-3 py-1.5 rounded-xl">
                            <Clock className="h-4 w-4" style={{ color: RED }} />
                            <span className="font-bold">{restaurant.time}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-[#5f4c39] dark:text-gray-300">
                          <UtensilsCrossed className="h-4 w-4" style={{ color: RED }} />
                          <span className="line-clamp-1">{restaurant.cuisine}</span>
                        </div>
                      )}

                      {!isBookings && (
                        <div className="flex flex-wrap gap-2">
                          <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${restaurant.availability?.isOpen ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"}`}>
                            <Clock className="h-3.5 w-3.5" />
                            <span>{restaurant.availability?.isOpen ? "Open now" : "Closed now"}</span>
                          </div>
                          <div className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                            {formatTimingLabel(restaurant.availability)}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between border-t border-dashed border-[#ead7c0] pt-4 dark:border-gray-700">
                        <div className="text-sm font-semibold text-[#4c3b2c] dark:text-gray-200">{restaurant.price}</div>
                        <div className="flex items-center gap-3">
                          {isBookings && String(restaurant.status || "").toUpperCase() === "CHECKED_IN" && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                navigate("/user/dine-in/scan")
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
                            >
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                                <rect x="14" y="14" width="2" height="2"/><rect x="19" y="14" width="2" height="2"/><rect x="14" y="19" width="2" height="2"/><rect x="19" y="19" width="2" height="2"/>
                              </svg>
                              <span>Scan QR</span>
                            </button>
                          )}
                          {isBookings ? (
                            <div 
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all hover:bg-slate-50 dark:hover:bg-gray-800 cursor-pointer" 
                              style={{ borderColor: RED, color: RED }}
                              onClick={(e) => handleViewDetails(e, restaurant)}
                            >
                              <Eye className="h-4 w-4" />
                              <span>View Details</span>
                            </div>
                          ) : (
                            <div 
                              className="inline-flex items-center gap-2 text-sm font-bold cursor-pointer hover:opacity-80" 
                              style={{ color: RED }}
                            >
                              <BadgePercent className="h-4 w-4" />
                              <span>Menu & booking</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </CardWrapper>
              )
            })}
          </div>
        )}
      </div>
      
      {bookingDetails && (
        <BookingDetailsModal
          booking={bookingDetails}
          onClose={() => setBookingDetails(null)}
          onCancel={(booking) => setBookingToCancel(booking)}
        />
      )}

      {bookingToCancel && (
        <CancelConfirmationModal
          booking={bookingToCancel}
          loading={isCancelling}
          onClose={() => setBookingToCancel(null)}
          onConfirm={handleCancelBooking}
        />
      )}
    </AnimatedPage>
  )
}
