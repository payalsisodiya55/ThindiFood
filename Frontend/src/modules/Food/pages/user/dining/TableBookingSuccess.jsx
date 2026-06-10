import { useLocation, useNavigate } from "react-router-dom"
import { CheckCircle2, Calendar, Clock, Users, MapPin, Home, List } from "lucide-react"
import { Button } from "@food/components/ui/button"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { motion } from "framer-motion"
import confetti from "canvas-confetti"
import { useEffect, useMemo, useRef, useState } from "react"
import { RED } from "@food/constants/color"
import { API_BASE_URL } from "@food/api/config"
import io from "socket.io-client"
import { toast } from "sonner"

const toImageUrl = (value) => {
    if (!value) return ""
    if (typeof value === "string") return value.trim()
    if (typeof value === "object") return String(value?.url || value?.secure_url || "").trim()
    return ""
}

const resolveRestaurant = (booking) => {
    const raw = booking?.restaurant && typeof booking.restaurant === "object" ? booking.restaurant : {}
    const image =
        toImageUrl(raw?.image) ||
        toImageUrl(raw?.profileImage) ||
        toImageUrl(raw?.coverImage) ||
        toImageUrl(raw?.coverImages?.[0]) ||
        toImageUrl(raw?.menuImages?.[0])

    return {
        name: String(raw?.name || raw?.restaurantName || booking?.restaurantName || "Restaurant").trim(),
        image,
        location: raw?.location || null,
    }
}

const normalizeStatus = (value) => String(value || "PENDING").trim().toUpperCase()

const getStatusCopy = (status) => {
    const normalized = normalizeStatus(status)
    if (normalized === "PENDING") {
        return {
            heading: "Booking Requested!",
            subheading: "Waiting for restaurant confirmation",
            badge: "PENDING",
            badgeClass: "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300",
            footer: "You will be notified once the restaurant confirms your booking",
        }
    }
    if (normalized === "DECLINED") {
        return {
            heading: "Booking Declined",
            subheading: "The restaurant could not accommodate your request",
            badge: "DECLINED",
            badgeClass: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300",
            footer: "Please try another slot or restaurant",
        }
    }
    if (normalized === "CANCELLED") {
        return {
            heading: "Reservation Cancelled",
            subheading: "Your reservation has been cancelled",
            badge: "CANCELLED",
            badgeClass: "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300",
            footer: "The table slot has been released",
        }
    }
    if (normalized === "LATE_CANCELLED") {
        return {
            heading: "Reservation Cancelled",
            subheading: "Late cancellations may affect future reservations",
            badge: "LATE CANCELLED",
            badgeClass: "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300",
            footer: "Late cancellations may affect future reservations",
        }
    }
    if (normalized === "NO_SHOW") {
        return {
            heading: "Reservation Marked No-show",
            subheading: "You did not arrive within the grace period",
            badge: "NO-SHOW",
            badgeClass: "bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300",
            footer: "This reservation was closed as a no-show after the grace period",
        }
    }
    if (normalized === "CHECKED_IN") {
        return {
            heading: "Seat Confirmed!",
            subheading: "Your table is ready for you",
            badge: "TABLE READY",
            badgeClass: "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300",
            footer: "Scan the QR code on your table to start ordering",
        }
    }
    if (normalized === "COMPLETED") {
        return {
            heading: "Reservation Completed",
            subheading: "Hope you had a great dining experience",
            badge: "COMPLETED",
            badgeClass: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
            footer: "Thanks for dining with us",
        }
    }

    return {
        heading: "Booking Confirmed!",
        subheading: "Your table has been confirmed",
        badge: "CONFIRMED",
        badgeClass: "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300",
        footer: "Show this ticket at the restaurant for a smooth entry",
    }
}

export default function TableBookingSuccess() {
    const location = useLocation()
    const navigate = useNavigate()
    const socketRef = useRef(null)
    const booking = useMemo(() => {
        if (location.state?.booking) return location.state.booking
        try {
            const stored = sessionStorage.getItem("latest_dining_booking")
            return stored ? JSON.parse(stored) : null
        } catch {
            return null
        }
    }, [location.state])

    const [liveStatus, setLiveStatus] = useState(booking?.status || "PENDING")

    useEffect(() => {
        if (!booking?._id && !booking?.bookingId) return

        let socketOrigin = ""
        try {
            socketOrigin = new URL(API_BASE_URL).origin
        } catch {
            socketOrigin = String(API_BASE_URL || "").replace(/\/api.*$/, "")
        }
        if (!socketOrigin) return

        const token = localStorage.getItem("accessToken") || localStorage.getItem("user_accessToken")
        const socket = io(socketOrigin, {
            path: "/socket.io/",
            transports: ["polling"],
            reconnection: true,
            auth: { token },
        })
        socketRef.current = socket

        socket.on("booking_status_update", (payload) => {
            const matchId = String(booking._id || "")
            const payloadId = String(payload?._id || "")
            const matchBookingId = String(booking.bookingId || "")
            const payloadBookingId = String(payload?.bookingId || "")

            if ((matchId && matchId === payloadId) || (matchBookingId && matchBookingId === payloadBookingId)) {
                const newStatus = normalizeStatus(payload?.status || "CONFIRMED")
                setLiveStatus(newStatus)

                if (["CONFIRMED", "ACCEPTED"].includes(newStatus)) {
                    toast.success("Your booking has been confirmed by the restaurant!")
                } else if (newStatus === "DECLINED") {
                    toast.error("Your booking was declined by the restaurant.")
                } else if (newStatus === "LATE_CANCELLED") {
                    toast.message("Reservation cancelled", {
                        description: "Late cancellations may affect future reservations.",
                    })
                } else if (newStatus === "NO_SHOW") {
                    toast.error("Reservation marked as no-show.")
                }
            }
        })

        socket.on("table_ready", (payload) => {
            const matchId = String(booking._id || "")
            const payloadId = String(payload?._id || "")
            if (!matchId || matchId === payloadId) {
                setLiveStatus("CHECKED_IN")
                toast.success("Your table is ready! Scan the QR code to start ordering.")
            }
        })

        return () => {
            socket.disconnect()
            socketRef.current = null
        }
    }, [booking?._id, booking?.bookingId])

    useEffect(() => {
        if (!location.state?.booking) return
        try {
            sessionStorage.setItem("latest_dining_booking", JSON.stringify(location.state.booking))
        } catch {}
    }, [location.state])

    useEffect(() => {
        if (!booking) return

        const duration = 3 * 1000
        const animationEnd = Date.now() + duration
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 }
        const randomInRange = (min, max) => Math.random() * (max - min) + min

        const interval = setInterval(() => {
            const timeLeft = animationEnd - Date.now()
            if (timeLeft <= 0) return clearInterval(interval)

            const particleCount = 50 * (timeLeft / duration)
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } })
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } })
        }, 250)

        return () => clearInterval(interval)
    }, [booking])

    if (!booking) {
        return (
            <AnimatedPage className="bg-white dark:bg-[#0a0a0a] min-h-screen flex flex-col items-center justify-center p-6">
                <div className="w-full max-w-sm rounded-3xl border border-slate-200 dark:border-[#222222] bg-slate-50 dark:bg-[#1a1a1a] p-6 text-center shadow-sm">
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">Booking details not found</h1>
                    <p className="mt-2 text-sm text-gray-500 dark:text-[#a0a5b8]">
                        This page needs booking data. Please open it right after confirming your table.
                    </p>
                    <div className="mt-5 space-y-3">
                        <Button
                            onClick={() => navigate("/dining/my-bookings")}
                            className="w-full h-11 text-white font-semibold rounded-xl"
                            style={{ backgroundColor: RED }}
                        >
                            View My Bookings
                        </Button>
                        <Button
                            onClick={() => navigate("/food/user/dining")}
                            variant="outline"
                            className="w-full h-11 rounded-xl border-slate-200 dark:border-[#333333] text-slate-700 dark:text-white bg-transparent hover:bg-slate-50 dark:hover:bg-[#222222]"
                        >
                            Back to Dining
                        </Button>
                    </div>
                </div>
            </AnimatedPage>
        )
    }

    const restaurant = resolveRestaurant(booking)
    const formattedDate = new Date(booking.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    const statusCopy = getStatusCopy(liveStatus)
    const normalizedLiveStatus = normalizeStatus(liveStatus)

    return (
        <AnimatedPage className="bg-white dark:bg-[#0a0a0a] min-h-screen flex flex-col items-center justify-center p-6 pb-24">
            <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-20 h-20 bg-red-50 dark:bg-[#2d1215] rounded-full flex items-center justify-center mb-6"
            >
                <CheckCircle2 className="w-12 h-12" style={{ color: RED }} />
            </motion.div>

            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-center space-y-2 mb-10"
            >
                <h1 className="text-3xl font-black text-gray-900 dark:text-white">{statusCopy.heading}</h1>
                <p className="text-gray-500 dark:text-[#a0a5b8] font-medium tracking-wide italic">{statusCopy.subheading}</p>
                <div className="pt-2">
                    <span className="bg-red-50 dark:bg-[#2d1215] px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest border border-red-100 dark:border-red-900/50" style={{ color: RED }}>
                        BOOKING ID: {booking.bookingId}
                    </span>
                </div>
            </motion.div>

            <motion.div
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="w-full max-w-sm bg-slate-50 dark:bg-[#1a1a1a] rounded-3xl border border-slate-100 dark:border-[#222222] overflow-hidden shadow-xl shadow-slate-200 dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
            >
                <div className="p-6 space-y-6 relative">
                    <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-white dark:bg-[#0a0a0a] rounded-full border border-slate-100 dark:border-[#222222]"></div>
                    <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-white dark:bg-[#0a0a0a] rounded-full border border-slate-100 dark:border-[#222222]"></div>

                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-white dark:bg-[#222222] border border-slate-100 dark:border-[#333333] flex-shrink-0 p-1">
                            <img
                                src={restaurant.image || undefined}
                                className="w-full h-full object-cover rounded-xl"
                                alt="restaurant"
                                onError={(e) => {
                                    e.currentTarget.style.display = "none"
                                }}
                            />
                        </div>
                        <div className="min-w-0">
                            <h2 className="font-black text-lg text-gray-900 dark:text-white truncate">{restaurant.name}</h2>
                            <p className="text-xs text-gray-400 dark:text-[#a0a5b8] flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3 h-3" />
                                <span className="truncate">
                                    {typeof restaurant.location === "string"
                                        ? restaurant.location
                                        : (restaurant.location?.formattedAddress || restaurant.location?.address || `${restaurant.location?.city || ""}${restaurant.location?.area ? ", " + restaurant.location.area : ""}`)}
                                </span>
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 py-6 border-y border-dashed border-slate-200 dark:border-[#2b2b2b]">
                        <div className="space-y-1">
                            <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-[#808080] tracking-wider">Date</p>
                            <div className="flex items-center gap-2 font-bold text-gray-800 dark:text-white">
                                <Calendar className="w-4 h-4 text-red-500" />
                                <span>{formattedDate}</span>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-[#808080] tracking-wider">Time</p>
                            <div className="flex items-center gap-2 font-bold text-gray-800 dark:text-white">
                                <Clock className="w-4 h-4 text-red-500" />
                                <span>{booking.timeSlot}</span>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-[#808080] tracking-wider">Guests</p>
                            <div className="flex items-center gap-2 font-bold text-gray-800 dark:text-white">
                                <Users className="w-4 h-4 text-red-500" />
                                <span>{booking.guests} People</span>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-[#808080] tracking-wider">Status</p>
                            <div className={`px-2 py-0.5 rounded-lg text-xs font-bold w-fit ${statusCopy.badgeClass}`}>
                                {statusCopy.badge}
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="mt-12 w-full max-w-sm space-y-3"
            >
                {normalizedLiveStatus === "CHECKED_IN" && (
                    <Button
                        onClick={() => navigate("/food/user/dining")}
                        className="w-full h-14 text-white font-bold text-lg rounded-2xl flex items-center justify-center gap-2"
                        style={{ backgroundColor: "#00c87e" }}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                             <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m0 14v1M4 12h1m14 0h1M6.343 6.343l.707.707M16.95 16.95l.707.707M6.343 17.657l.707-.707M16.95 7.05l.707-.707" />
                             <rect x="3" y="3" width="7" height="7" rx="1" strokeWidth={2} />
                             <rect x="14" y="3" width="7" height="7" rx="1" strokeWidth={2} />
                             <rect x="3" y="14" width="7" height="7" rx="1" strokeWidth={2} />
                             <rect x="15" y="15" width="2" height="2" />
                             <rect x="19" y="15" width="2" height="2" />
                             <rect x="15" y="19" width="2" height="2" />
                             <rect x="19" y="19" width="2" height="2" />
                        </svg>
                        Scan QR & Start Ordering
                    </Button>
                )}
                <Button
                    onClick={() => navigate("/dining/my-bookings")}
                    className="w-full h-14 text-white font-bold text-lg rounded-2xl shadow-xl shadow-red-100 dark:shadow-[0_8px_24px_rgba(0,0,0,0.3)] flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
                    style={{ backgroundColor: RED }}
                >
                    <List className="w-5 h-5" />
                    View My Bookings
                </Button>
                <Button
                    onClick={() => navigate("/food/user")}
                    variant="outline"
                    className="w-full h-14 bg-white dark:bg-[#1a1a1a] border-2 border-slate-100 dark:border-[#2b2b2b] text-slate-600 dark:text-white font-bold text-lg rounded-2xl hover:bg-slate-50 dark:hover:bg-[#252525] flex items-center justify-center gap-2"
                >
                    <Home className="w-5 h-5" />
                    Go to Home
                </Button>
            </motion.div>

            <p className="mt-8 mb-8 text-[10px] font-bold text-slate-400 dark:text-[#808080] uppercase tracking-widest px-10 text-center">
                {statusCopy.footer}
            </p>
        </AnimatedPage>
    )
}
