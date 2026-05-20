import { useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { ArrowLeft, Calendar, Users, MapPin, ChevronRight, ShieldCheck, Info } from "lucide-react"
import { Button } from "@food/components/ui/button"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { diningAPI, authAPI, dineInAPI } from "@food/api"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import { useEffect } from "react"
import { toast } from "sonner"
import Loader from "@food/components/Loader"
import { RED } from "@food/constants/color"
import { isModuleAuthenticated } from "@food/utils/auth"

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const BOOKING_DRAFT_KEY = "food_dining_booking_draft_v1"

const toImageUrl = (value) => {
    if (!value) return ""
    if (typeof value === "string") return value.trim()
    if (typeof value === "object") {
        return String(value?.url || value?.secure_url || "").trim()
    }
    return ""
}

const buildRestaurantSnapshot = (primary, fallback) => {
    const base = (primary && typeof primary === "object" ? primary : null) ||
        (fallback && typeof fallback === "object" ? fallback : null) ||
        {}

    const resolvedImage =
        toImageUrl(base?.image) ||
        toImageUrl(base?.profileImage) ||
        toImageUrl(base?.coverImage) ||
        toImageUrl(base?.coverImages?.[0]) ||
        toImageUrl(base?.menuImages?.[0])

    return {
        _id: base?._id || base?.id || base?.restaurantId || null,
        id: base?.id || base?._id || base?.restaurantId || null,
        restaurantId: base?.restaurantId || base?._id || base?.id || null,
        name: base?.name || base?.restaurantName || "Restaurant",
        restaurantName: base?.restaurantName || base?.name || "Restaurant",
        image: resolvedImage,
        profileImage: base?.profileImage || null,
        location: base?.location || null,
        slug: base?.slug || "",
    }
}

export default function TableBookingConfirmation() {
  const location = useLocation()
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
    const fallbackDraft = useMemo(() => {
        try {
            const raw = sessionStorage.getItem(BOOKING_DRAFT_KEY)
            return raw ? JSON.parse(raw) : null
        } catch {
            return null
        }
    }, [])
    const resolvedState = location.state || fallbackDraft || {}
    const { restaurant, guests, date, timeSlot, mealType } = resolvedState

    const [specialRequest, setSpecialRequest] = useState(() => String(resolvedState?.specialRequest || "").trim())
    const [specialRequestDraft, setSpecialRequestDraft] = useState("")
    const [isSpecialRequestOpen, setIsSpecialRequestOpen] = useState(false)
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)
    const [bookingInProgress, setBookingInProgress] = useState(false)
    const [requiresLogin, setRequiresLogin] = useState(() => !isModuleAuthenticated("user"))

    const isAuthError = (error) => {
        const status = Number(error?.response?.status || 0)
        if (status === 401 || status === 403) return true
        const message = String(
            error?.response?.data?.message ||
            error?.response?.data?.error ||
            error?.message ||
            ""
        ).toLowerCase()
        return (
            message.includes("authentication token missing") ||
            message.includes("unauthorized") ||
            message.includes("token missing") ||
            message.includes("not authenticated")
        )
    }

    const redirectToLogin = () => {
        const nextPath = `${window.location.pathname}${window.location.search || ""}`
        navigate(`/user/auth/login?next=${encodeURIComponent(nextPath)}`, {
            state: { from: nextPath }
        })
    }

    useEffect(() => {
        if (!restaurant) {
            navigate("/food/user/dining")
            return
        }

        const fetchUser = async () => {
            try {
                const response = await authAPI.getCurrentUser()
                if (response.data.success) {
                    const userData =
                        response?.data?.data?.user ||
                        response?.data?.data ||
                        response?.data?.user ||
                        null
                    setUser(userData)
                    setRequiresLogin(false)
                }
            } catch (error) {
                debugError("Error fetching user:", error)
                if (isAuthError(error)) {
                    setRequiresLogin(true)
                }
            } finally {
                setLoading(false)
            }
        }
        fetchUser()
    }, [restaurant, navigate])

    const handleBooking = async () => {
        if (requiresLogin || !isModuleAuthenticated("user")) {
            toast.error("Please login to book your seat.")
            redirectToLogin()
            return
        }

        try {
            setBookingInProgress(true)
            const sanitizedSpecialRequest = String(specialRequest || "").trim()
            const restaurantId =
                restaurant?._id ||
                restaurant?.id ||
                restaurant?.restaurant?._id ||
                restaurant?.restaurant?.id ||
                restaurant?.restaurantId ||
                null

            if (!restaurantId) {
                toast.error("Unable to proceed. Restaurant ID is missing.")
                return
            }

            const response = await dineInAPI.createBooking({
                restaurant: restaurantId,
                restaurantRef: restaurant,
                userRef: user,
                guests,
                date,
                timeSlot,
                mealType,
                specialRequest: sanitizedSpecialRequest
            })

            if (response.data.success) {
                const bookingPayload = response?.data?.data || {}
                const snapshot = buildRestaurantSnapshot(restaurant, bookingPayload?.restaurant)
                const enrichedBooking = {
                    ...bookingPayload,
                    restaurant: snapshot,
                    specialRequest: bookingPayload?.specialRequest || sanitizedSpecialRequest || "",
                }

                toast.success("Table booked successfully!")
                try {
                    sessionStorage.removeItem(BOOKING_DRAFT_KEY)
                } catch {}
                try {
                    sessionStorage.setItem("latest_dining_booking", JSON.stringify(enrichedBooking))
                } catch {}
                navigate("/food/user/dining/book-success", { state: { booking: enrichedBooking } })
            }
        } catch (error) {
            debugError("Booking error:", error)
            if (isAuthError(error)) {
                setRequiresLogin(true)
                toast.error("Please login to book your seat.")
                redirectToLogin()
            } else {
                toast.error(error.response?.data?.message || "Failed to confirm booking")
            }
        } finally {
            setBookingInProgress(false)
        }
    }

    if (loading) return <Loader />

    const openSpecialRequestEditor = () => {
        setSpecialRequestDraft(String(specialRequest || ""))
        setIsSpecialRequestOpen(true)
    }

    const saveSpecialRequest = () => {
        const nextValue = String(specialRequestDraft || "").trim()
        setSpecialRequest(nextValue)
        try {
            const existingRaw = sessionStorage.getItem(BOOKING_DRAFT_KEY)
            if (existingRaw) {
                const existingDraft = JSON.parse(existingRaw)
                sessionStorage.setItem(
                    BOOKING_DRAFT_KEY,
                    JSON.stringify({
                        ...existingDraft,
                        specialRequest: nextValue,
                    }),
                )
            }
        } catch {}
        setIsSpecialRequestOpen(false)
    }


    const bookingDate = new Date(date)
    const formattedDate = Number.isNaN(bookingDate.getTime())
        ? "Today"
        : bookingDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })

    return (
        <>
            <AnimatedPage className="bg-slate-50 dark:bg-[#0a0a0a] min-h-screen pb-24">
                {/* Header */}
                <div className="text-white px-4 py-4 sticky top-0 z-50 shadow-md" style={{ backgroundColor: RED }}>
                    <div className="flex items-center gap-3">
                        <button onClick={goBack} className="p-1 hover:bg-white/10 rounded-full transition-colors">
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                        <p className="font-semibold text-sm">Reach the restaurant 15 minutes before your booking time for a hassle-free experience</p>
                    </div>
                </div>

                <div className="p-4 space-y-4">
                    {requiresLogin && (
                        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-4">
                            <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">Please login to book your seat.</p>
                            <button
                                onClick={redirectToLogin}
                                className="mt-2 text-sm font-bold underline underline-offset-2"
                                style={{ color: RED }}
                            >
                                Login now
                            </button>
                        </div>
                    )}

                    {/* Booking Summary Card */}
                    <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-sm border border-slate-100 dark:border-[#222222] overflow-hidden">
                        <div className="p-4 space-y-4">
                            <div className="flex items-start gap-3">
                                <div className="bg-red-50 dark:bg-[#2d1215] p-2 rounded-xl">
                                    <Calendar className="w-5 h-5" style={{ color: RED }} />
                                </div>
                                <div>
                                    <p className="font-bold text-gray-900 dark:text-white">{formattedDate} at {timeSlot}</p>
                                    <div className="flex items-center gap-2 text-gray-500 dark:text-[#a0a5b8] text-sm mt-0.5">
                                        <Users className="w-4 h-4" />
                                        <span>{guests} guests</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 pt-4 border-t border-dashed border-slate-100 dark:border-[#222222]">
                                <div className="bg-red-50 dark:bg-[#2d1215] p-2 rounded-xl">
                                    <MapPin className="w-5 h-5 text-red-500" />
                                </div>
                                <div>
                                    <p className="font-bold text-gray-900 dark:text-white">{restaurant.name}</p>
                                    <p className="text-gray-500 dark:text-[#a0a5b8] text-xs mt-0.5 line-clamp-1">
                                        {typeof restaurant.location === 'string'
                                            ? restaurant.location
                                            : (restaurant.location?.formattedAddress || restaurant.location?.address || `${restaurant.location?.city || ''}${restaurant.location?.area ? ', ' + restaurant.location.area : ''}`)}
                                    </p>
                                </div>
                            </div>

                        </div>
                    </div>

                    {/* Special Request */}
                    <button
                        onClick={openSpecialRequestEditor}
                        className="w-full bg-white dark:bg-[#1a1a1a] rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-[#222222] flex items-center justify-between group text-left"
                    >
                        <div className="flex items-center gap-3">
                            <div className="bg-slate-100 dark:bg-[#252525] p-2 rounded-xl group-hover:bg-slate-200 dark:group-hover:bg-[#333333] transition-colors">
                                <Info className="w-5 h-5 text-slate-600 dark:text-[#a0a0a0]" />
                            </div>
                            <div>
                                <span className="font-bold text-gray-700 dark:text-white">Add special request</span>
                                {specialRequest ? (
                                    <p className="mt-1 text-xs text-slate-500 dark:text-[#a0a5b8] line-clamp-2">{specialRequest}</p>
                                ) : (
                                    <p className="mt-1 text-xs text-slate-400 dark:text-[#808080]">Dietary notes, seating preference, birthday, etc.</p>
                                )}
                            </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-400" />
                    </button>

                    {/* Preferences Section */}
                    <div className="pt-4">
                        <div className="flex items-center gap-4 mb-3">
                            <div className="h-px bg-slate-200 dark:bg-[#222222] flex-1"></div>
                            <span className="text-[10px] font-bold text-slate-400 dark:text-[#808080] uppercase tracking-widest">Guest Preferences</span>
                            <div className="h-px bg-slate-200 dark:bg-[#222222] flex-1"></div>
                        </div>

                        <div className="space-y-2">
                            <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-[#222222] flex items-center justify-between">
                                <div className="flex items-start gap-3">
                                    <div className="text-red-400 mt-1">
                                        <ShieldCheck className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-gray-800 dark:text-white text-sm">Cancellation policy</p>
                                        <p className="text-xs text-slate-400 dark:text-[#a0a5b8]">Cancel anytime. Within 1 hour, it will be marked as late cancelled.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Your Details */}
                    <div className="pt-4">
                        <div className="flex items-center gap-4 mb-3">
                            <div className="h-px bg-slate-200 dark:bg-[#222222] flex-1"></div>
                            <span className="text-[10px] font-bold text-slate-400 dark:text-[#808080] uppercase tracking-widest">Your Details</span>
                            <div className="h-px bg-slate-200 dark:bg-[#222222] flex-1"></div>
                        </div>

                        <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-[#222222] flex items-center justify-between">
                            <div>
                                <p className="font-bold text-gray-900 dark:text-white">{user?.name || "Shailu"}</p>
                                <p className="text-sm text-slate-400 dark:text-[#a0a5b8] mt-1">{user?.phone || user?.email || "8090512291"}</p>
                            </div>
                            <button className="text-sm font-bold hover:underline" style={{ color: RED }}>Edit</button>
                        </div>
                    </div>

                    {/* Terms and Conditions */}
                    <div className="pt-4">
                        <div className="flex items-center gap-4 mb-3">
                            <div className="h-px bg-slate-200 dark:bg-[#222222] flex-1"></div>
                            <span className="text-[10px] font-bold text-slate-400 dark:text-[#808080] uppercase tracking-widest">Terms and Conditions</span>
                            <div className="h-px bg-slate-200 dark:bg-[#222222] flex-1"></div>
                        </div>

                        <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-[#222222]">
                            <ul className="space-y-4">
                                {[
                                    "Please arrive 15 minutes prior to your reservation time.",
                                    "Booking valid for the specified number of guests entered during reservation",
                                    "You can cancel anytime before the reservation.",
                                    "House rules are to be observed at all times",
                                    "Special requests will be accommodated at the restaurant's discretion",
                                    "Cancellations within 1 hour of reservation time will be marked as late cancelled.",
                                    "If the guest does not arrive within 30 minutes after reservation time, the booking may be marked as no-show.",
                                    "Additional service charges on the bill are at the restaurant's discretion"
                                ].map((term, i) => (
                                    <li key={i} className="flex gap-3">
                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-[#333333] mt-2 flex-shrink-0"></div>
                                        <p className="text-xs text-slate-600 dark:text-[#a0a5b8] leading-relaxed font-medium">{term}</p>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Sticky Action Button */}
                <div className="fixed bottom-0 left-0 w-full bg-white dark:bg-[#1a1a1a] border-t border-slate-100 dark:border-[#222222] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(0,0,0,0.05)] z-50">
                    <Button
                        onClick={handleBooking}
                        disabled={bookingInProgress}
                        className="w-full h-14 text-white font-bold text-lg rounded-2xl shadow-xl transition-all active:scale-[0.98]"
                        style={{ backgroundColor: RED }}
                    >
                        {bookingInProgress ? "Confirming..." : requiresLogin ? "Login to book seat" : "Confirm your seat"}
                    </Button>
                </div>
            </AnimatedPage>

            {/* Special Request Modal - Moved outside AnimatedPage to avoid transform-related positioning issues */}
            {isSpecialRequestOpen && (
                <div className="fixed inset-0 z-[100] flex items-end justify-center">
                    <style>{`
                        @keyframes slideUp {
                            from { transform: translateY(100%); opacity: 0; }
                            to { transform: translateY(0); opacity: 1; }
                        }
                        @keyframes fadeIn {
                            from { opacity: 0; }
                            to { opacity: 1; }
                        }
                    `}</style>
                    <div 
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
                        style={{ animation: 'fadeIn 0.3s ease-out forwards' }}
                        onClick={() => setIsSpecialRequestOpen(false)}
                    />
                    <div 
                        className="relative w-full max-w-lg rounded-t-[32px] bg-white dark:bg-[#1a1a1a] p-6 shadow-[0_-20px_50px_rgba(0,0,0,0.15)] dark:shadow-[0_-20px_50px_rgba(0,0,0,0.3)] z-10"
                        style={{ 
                            animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                            paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))'
                        }}
                    >
                        <div className="mx-auto mb-6 h-1.5 w-12 rounded-full bg-slate-100 dark:bg-[#333333]" />
                        
                        <div className="mb-6">
                            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">Special Request</h3>
                            <p className="mt-1 text-sm text-slate-500 dark:text-[#a0a5b8] font-medium">Add any specific requests for the restaurant</p>
                        </div>

                        <div className="relative">
                            <textarea
                                autoFocus
                                value={specialRequestDraft}
                                onChange={(event) => setSpecialRequestDraft(event.target.value.slice(0, 200))}
                                rows={4}
                                placeholder="e.g. Quiet corner table, birthday celebration, dietary preferences..."
                                className="w-full rounded-2xl border border-slate-100 dark:border-[#222222] bg-slate-50 dark:bg-[#252525] p-4 text-slate-800 dark:text-white outline-none focus:border-red-400 focus:bg-white dark:focus:bg-[#1a1a1a] transition-all text-base shadow-inner resize-none"
                            />
                            <div className="absolute bottom-3 right-4 px-2 py-1 rounded-full bg-white/80 dark:bg-[#1a1a1a]/80 backdrop-blur-sm border border-slate-100 dark:border-[#222222] text-[10px] font-bold text-slate-400 dark:text-[#808080]">
                                {String(specialRequestDraft || "").length}/200
                            </div>
                        </div>

                        <div className="mt-8 grid grid-cols-2 gap-4">
                            <Button
                                onClick={() => {
                                    setSpecialRequestDraft("")
                                    setSpecialRequest("")
                                    setIsSpecialRequestOpen(false)
                                }}
                                variant="outline"
                                className="h-14 rounded-2xl font-bold text-slate-600 dark:text-[#a0a0a0] border-slate-200 dark:border-[#333333] hover:bg-slate-50 dark:hover:bg-[#222222] active:scale-95 transition-all"
                            >
                                Clear
                            </Button>
                            <Button
                                onClick={saveSpecialRequest}
                                className="h-14 rounded-2xl font-bold text-white shadow-lg shadow-red-100 active:scale-95 transition-all"
                                style={{ backgroundColor: RED }}
                            >
                                Save Request
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
