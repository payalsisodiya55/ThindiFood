import { useEffect, useMemo, useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { ArrowLeft, Calendar, Clock, Users, MapPin, Utensils, Star, X, AlertTriangle } from "lucide-react"
import { diningAPI, dineInAPI } from "@food/api"
import Loader from "@food/components/Loader"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Badge } from "@food/components/ui/badge"
import { toast } from "sonner"
import { Button } from "@food/components/ui/button"
import { RED } from "@food/constants/color"

const debugError = (...args) => {}

const normalizeStatus = (status) => String(status || "").trim().toUpperCase()

const getStatusLabel = (status) => {
    const key = normalizeStatus(status)
    if (key === "PENDING") return "Pending"
    if (key === "CONFIRMED" || key === "ACCEPTED") return "Confirmed"
    if (key === "CHECKED_IN") return "Table Ready"
    if (key === "COMPLETED") return "Completed"
    if (key === "CANCELLED") return "Cancelled"
    if (key === "LATE_CANCELLED") return "Late Cancelled"
    if (key === "NO_SHOW") return "No-show"
    if (key === "DECLINED") return "Declined"
    return String(status || "Unknown")
}

const getStatusBadgeClass = (status) => {
    const key = normalizeStatus(status)
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

const getRestaurantAddress = (booking) =>
    typeof booking.restaurant?.location === "string"
        ? booking.restaurant.location
        : (booking.restaurant?.location?.formattedAddress || booking.restaurant?.location?.address || `${booking.restaurant?.location?.city || ""}${booking.restaurant?.location?.area ? ", " + booking.restaurant.location.area : ""}`)

const getReservationDateTime = (booking) => {
    const baseDate = new Date(booking?.date)
    if (Number.isNaN(baseDate.getTime())) return null

    const rawTime = String(booking?.timeSlot || "").trim().toLowerCase()
    const match = rawTime.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/)
    if (!match) return new Date(baseDate)

    let hours = Number(match[1])
    const minutes = Number(match[2] || 0)
    const meridiem = match[3]
    if (meridiem === "pm" && hours !== 12) hours += 12
    if (meridiem === "am" && hours === 12) hours = 0

    const dateTime = new Date(baseDate)
    dateTime.setHours(hours, minutes, 0, 0)
    return dateTime
}

const getCancellationPreview = (booking) => {
    const reservationDateTime = getReservationDateTime(booking)
    if (!reservationDateTime) {
        return {
            isLate: false,
            message: "Are you sure you want to cancel this reservation?",
        }
    }

    const hoursUntilReservation = (reservationDateTime.getTime() - Date.now()) / (60 * 60 * 1000)
    if (hoursUntilReservation < 1) {
        return {
            isLate: true,
            message: "This cancellation is within 1 hour of your reservation. It will be marked as Late Cancelled.",
        }
    }

    return {
        isLate: false,
        message: "Are you sure you want to cancel this reservation?",
    }
}

function ReviewModal({ booking, onClose, onSubmit }) {
    const [rating, setRating] = useState(5)
    const [comment, setComment] = useState("")
    const [submitting, setSubmitting] = useState(false)

    const handleSubmit = async () => {
        if (!comment.trim()) {
            toast.error("Please add a comment")
            return
        }
        setSubmitting(true)
        await onSubmit({ bookingId: booking._id, rating, comment })
        setSubmitting(false)
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-xl font-bold text-slate-900">Review your experience</h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <div className="flex flex-col items-center">
                        <p className="text-sm font-medium text-slate-500 mb-3">How was your visit to {booking.restaurant?.name}?</p>
                        <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    onClick={() => setRating(star)}
                                    className="p-1 transition-transform active:scale-90"
                                >
                                    <Star className={`w-10 h-10 ${star <= rating ? "fill-yellow-400 text-yellow-400" : "text-slate-200"}`} />
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">Share your feedback</label>
                        <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Write about the food, service, and atmosphere..."
                            className="w-full h-32 p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 transition-all text-sm resize-none"
                            style={{ "--tw-ring-color": RED }}
                        />
                    </div>

                    <Button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="w-full text-white font-bold h-12 rounded-2xl shadow-lg transition-opacity hover:opacity-90"
                        style={{ backgroundColor: RED, boxShadow: `0 10px 15px -3px ${RED}33` }}
                    >
                        {submitting ? "Submitting..." : "Submit Review"}
                    </Button>
                </div>
            </div>
        </div>
    )
}

function BookingDetailsModal({ booking, onClose, onCancel, onReview }) {
    const cancellationPreview = useMemo(() => getCancellationPreview(booking), [booking])
    const canCancel = ["PENDING", "CONFIRMED", "ACCEPTED"].includes(normalizeStatus(booking?.status))

    return (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-[28px] bg-white shadow-2xl overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Reservation Details</p>
                        <h3 className="text-xl font-black text-slate-900 mt-1">{booking.restaurant?.name}</h3>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-sm font-semibold text-slate-500">Status</p>
                            <Badge className={getStatusBadgeClass(booking.status)}>{getStatusLabel(booking.status)}</Badge>
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-semibold text-slate-500">Booking ID</p>
                            <p className="text-sm font-bold text-slate-900">{booking.bookingId || "--"}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-slate-50 p-4">
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Date</p>
                            <p className="mt-2 text-sm font-bold text-slate-900">{new Date(booking.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4">
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Time</p>
                            <p className="mt-2 text-sm font-bold text-slate-900">{booking.timeSlot}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4">
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Guests</p>
                            <p className="mt-2 text-sm font-bold text-slate-900">{booking.guests} Guests</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4">
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Special Request</p>
                            <p className="mt-2 text-sm font-bold text-slate-900">{booking.specialRequest || "No special request"}</p>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-100 p-4">
                        <p className="text-sm font-semibold text-slate-500">Restaurant address</p>
                        <p className="mt-2 text-sm text-slate-700">{getRestaurantAddress(booking) || "Address not available"}</p>
                    </div>

                    {canCancel && (
                        <div className={`rounded-2xl border p-4 ${cancellationPreview.isLate ? "border-orange-200 bg-orange-50" : "border-slate-100 bg-slate-50"}`}>
                            <div className="flex items-start gap-3">
                                <AlertTriangle className={`w-5 h-5 mt-0.5 ${cancellationPreview.isLate ? "text-orange-500" : "text-slate-400"}`} />
                                <div>
                                    <p className="text-sm font-bold text-slate-900">Cancellation</p>
                                    <p className="mt-1 text-xs text-slate-600">{cancellationPreview.message}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-5 pt-0 space-y-3">
                    {canCancel && (
                        <Button
                            onClick={() => onCancel(booking)}
                            className="w-full h-12 rounded-2xl text-white font-bold"
                            style={{ backgroundColor: RED }}
                        >
                            Cancel Reservation
                        </Button>
                    )}
                    {normalizeStatus(booking?.status) === "COMPLETED" && (
                        <Button
                            onClick={() => onReview(booking)}
                            variant="outline"
                            className="w-full h-12 rounded-2xl border-red-200 text-red-600"
                        >
                            Rate & Review
                        </Button>
                    )}
                    <Button onClick={onClose} variant="outline" className="w-full h-12 rounded-2xl border-slate-200 text-slate-700">
                        Close
                    </Button>
                </div>
            </div>
        </div>
    )
}

function CancelConfirmationModal({ booking, onClose, onConfirm, loading }) {
    const preview = useMemo(() => getCancellationPreview(booking), [booking])

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
                <div className="flex items-start gap-3">
                    <div className={`rounded-2xl p-3 ${preview.isLate ? "bg-orange-100" : "bg-red-50"}`}>
                        <AlertTriangle className={`w-5 h-5 ${preview.isLate ? "text-orange-600" : "text-red-500"}`} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-slate-900">Cancel reservation?</h3>
                        <p className="mt-2 text-sm text-slate-600">{preview.message}</p>
                    </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3">
                    <Button onClick={onClose} variant="outline" className="h-12 rounded-2xl border-slate-200 text-slate-700">
                        Keep Booking
                    </Button>
                    <Button
                        onClick={() => onConfirm(booking)}
                        disabled={loading}
                        className="h-12 rounded-2xl text-white font-bold"
                        style={{ backgroundColor: RED }}
                    >
                        {loading ? "Cancelling..." : "Yes, Cancel"}
                    </Button>
                </div>
            </div>
        </div>
    )
}

export default function MyBookings() {
    const navigate = useNavigate()
    const [bookings, setBookings] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedBooking, setSelectedBooking] = useState(null)
    const [bookingDetails, setBookingDetails] = useState(null)
    const [bookingToCancel, setBookingToCancel] = useState(null)
    const [cancellingBookingId, setCancellingBookingId] = useState("")

    useEffect(() => {
        const fetchBookings = async () => {
            try {
                const response = await dineInAPI.getUserBookings()
                if (response.data.success) {
                    setBookings(Array.isArray(response.data.data) ? response.data.data : [])
                }
            } catch (error) {
                debugError("Error fetching bookings:", error)
                try {
                    const fallbackResponse = await diningAPI.getBookings()
                    if (fallbackResponse.data.success) {
                        setBookings(Array.isArray(fallbackResponse.data.data) ? fallbackResponse.data.data : [])
                    }
                } catch (fallbackError) {
                    debugError("Fallback booking fetch failed:", fallbackError)
                }
            } finally {
                setLoading(false)
            }
        }
        fetchBookings()
    }, [])

    const handleReviewSubmit = async (reviewData) => {
        try {
            const response = await diningAPI.createReview(reviewData)
            if (response.data.success) {
                toast.success("Review submitted! Thank you for your feedback.")
                setSelectedBooking(null)
            }
        } catch (error) {
            debugError("Error submitting review:", error)
            toast.error(error.response?.data?.message || "Failed to submit review")
        }
    }

    const handleCancelBooking = async (booking) => {
        try {
            setCancellingBookingId(String(booking?._id || ""))
            const response = await dineInAPI.cancelBooking(booking._id)
            const updatedBooking = response?.data?.data || null
            const warning = response?.data?.meta?.warning || response?.data?.message || ""

            if (updatedBooking) {
                setBookings((prev) => prev.map((item) => String(item._id) === String(updatedBooking._id) ? { ...item, ...updatedBooking } : item))
                setBookingDetails((prev) => (prev && String(prev._id) === String(updatedBooking._id) ? { ...prev, ...updatedBooking } : prev))
            }

            if (warning === "Late cancellations may affect future reservations.") {
                toast.message("Reservation cancelled", { description: warning })
            } else {
                toast.success("Reservation cancelled successfully.")
            }
            setBookingToCancel(null)
        } catch (error) {
            debugError("Error cancelling booking:", error)
            toast.error(error?.response?.data?.message || "Failed to cancel reservation")
        } finally {
            setCancellingBookingId("")
        }
    }

    if (loading) return <Loader />

    return (
        <AnimatedPage className="bg-slate-50 min-h-screen pb-10">
            <div className="bg-white p-4 flex items-center shadow-sm sticky top-0 z-10">
                <button onClick={() => navigate("/")}>
                    <ArrowLeft className="w-6 h-6 text-gray-700 cursor-pointer" />
                </button>
                <h1 className="ml-4 text-xl font-semibold text-gray-800">My Table Bookings</h1>
            </div>

            <div className="p-4 space-y-4">
                {bookings.length > 0 ? (
                    bookings.map((booking) => (
                        <button
                            key={booking._id}
                            type="button"
                            onClick={() => setBookingDetails(booking)}
                            className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-start gap-4"
                        >
                            <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100">
                                <img
                                    src={booking.restaurant?.image || booking.restaurant?.profileImage?.url || undefined}
                                    className="w-full h-full object-cover"
                                    alt={booking.restaurant?.name}
                                    onError={(e) => {
                                        e.currentTarget.style.display = "none"
                                    }}
                                />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start gap-3">
                                    <h3 className="font-bold text-gray-900 truncate">{booking.restaurant?.name}</h3>
                                    <Badge className={getStatusBadgeClass(booking.status)}>
                                        {getStatusLabel(booking.status)}
                                    </Badge>
                                </div>
                                <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                    <MapPin className="w-3 h-3" />
                                    <span className="truncate">{getRestaurantAddress(booking)}</span>
                                </p>

                                <div className="flex items-center gap-4 mt-3 flex-wrap">
                                    <div className="flex items-center gap-1 text-[11px] font-bold text-gray-600 bg-slate-100 px-2 py-0.5 rounded-lg">
                                        <Calendar className="w-3 h-3" />
                                        {new Date(booking.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                                    </div>
                                    <div className="flex items-center gap-1 text-[11px] font-bold text-gray-600 bg-slate-100 px-2 py-0.5 rounded-lg">
                                        <Clock className="w-3 h-3" />
                                        {booking.timeSlot}
                                    </div>
                                    <div className="flex items-center gap-1 text-[11px] font-bold text-gray-600 bg-slate-100 px-2 py-0.5 rounded-lg">
                                        <Users className="w-3 h-3" />
                                        {booking.guests} Guests
                                    </div>
                                </div>

                                {normalizeStatus(booking.status) === "COMPLETED" && (
                                    <div className="mt-3">
                                        <span className="inline-flex py-2 px-3 bg-red-50 text-[11px] font-bold rounded-lg border border-red-100" style={{ color: RED }}>
                                            Tap to rate and review
                                        </span>
                                    </div>
                                )}
                            </div>
                        </button>
                    ))
                ) : (
                    <div className="text-center py-20">
                        <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Utensils className="w-8 h-8 text-slate-300" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-800">No bookings yet</h3>
                        <p className="text-gray-500 text-sm mt-2">Book your favorite restaurant for a great dining experience!</p>
                        <Link to="/dining">
                            <button className="mt-6 text-white font-bold px-6 py-2.5 rounded-xl shadow-lg transition-opacity hover:opacity-90" style={{ backgroundColor: RED, boxShadow: `0 10px 15px -3px ${RED}33` }}>
                                Book a table
                            </button>
                        </Link>
                    </div>
                )}
            </div>

            {selectedBooking && (
                <ReviewModal
                    booking={selectedBooking}
                    onClose={() => setSelectedBooking(null)}
                    onSubmit={handleReviewSubmit}
                />
            )}

            {bookingDetails && (
                <BookingDetailsModal
                    booking={bookingDetails}
                    onClose={() => setBookingDetails(null)}
                    onCancel={(booking) => setBookingToCancel(booking)}
                    onReview={(booking) => {
                        setBookingDetails(null)
                        setSelectedBooking(booking)
                    }}
                />
            )}

            {bookingToCancel && (
                <CancelConfirmationModal
                    booking={bookingToCancel}
                    loading={cancellingBookingId === String(bookingToCancel._id || "")}
                    onClose={() => setBookingToCancel(null)}
                    onConfirm={handleCancelBooking}
                />
            )}
        </AnimatedPage>
    )
}
