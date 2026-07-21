import { useState, useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Calendar, Clock, Users, Search, MessageSquare, CheckCircle2, Clock4, UploadCloud, ImagePlus, ChevronDown, ChevronUp, Sparkles, MapPin, Phone, Info, X, ChevronLeft, Loader2, ArrowLeft } from "lucide-react"
import { diningAPI, restaurantAPI, dineInAPI } from "@food/api"
import Loader from "@food/components/Loader"
import { Badge } from "@food/components/ui/badge"
import { toast } from "sonner"
import { useRestaurantNotifications } from "@food/hooks/useRestaurantNotifications"
import { RESTAURANT_THEME } from "@food/constants/restaurantTheme"

const debugError = (...args) => {}

const getRestaurantFromResponse = (response) =>
    response?.data?.data?.restaurant ||
    response?.data?.restaurant ||
    response?.data?.data ||
    null

const getDiningCategoriesFromResponse = (response) => {
    const payload = response?.data?.data
    if (Array.isArray(payload)) return payload
    if (Array.isArray(payload?.categories)) return payload.categories
    return []
}

const getBookingsFromResponse = (response) => {
    const payload = response?.data?.data
    if (Array.isArray(payload)) return payload
    if (Array.isArray(payload?.bookings)) return payload.bookings
    return []
}

const normalizeImageEntry = (entry) => {
    if (!entry) return null
    if (typeof entry === "string") {
        const url = entry.trim()
        return url ? { url, publicId: null } : null
    }
    const url = String(entry?.url || "").trim()
    if (!url) return null
    return {
        url,
        publicId: entry?.publicId || null,
    }
}

const getProfilePhotoUrl = (restaurant) => {
    const candidate = restaurant?.profileImage
    if (!candidate) return ""
    if (typeof candidate === "string") return candidate.trim()
    return String(candidate?.url || "").trim()
}

const getCoverImages = (restaurant) => {
    const base = Array.isArray(restaurant?.coverImages) ? restaurant.coverImages : []
    return base
        .map(normalizeImageEntry)
        .filter(Boolean)
}

const getMenuImages = (restaurant) => {
    const base = Array.isArray(restaurant?.menuImages) ? restaurant.menuImages : []
    return base
        .map(normalizeImageEntry)
        .filter(Boolean)
}

const getBookerName = (booking) =>
    String(
        booking?.user?.name ||
        booking?.customerName ||
        booking?.bookedBy?.name ||
        booking?.name ||
        "Guest"
    ).trim()

const getBookerPhone = (booking) =>
    String(
        booking?.user?.phone ||
        booking?.phone ||
        booking?.phoneNumber ||
        booking?.mobile ||
        booking?.bookedBy?.phone ||
        ""
    ).trim()

const normalizeBookingStatus = (status) => String(status || "").trim().toUpperCase()

const isPendingReservationStatus = (status) => normalizeBookingStatus(status) === "PENDING"

const isConfirmedReservationStatus = (status) => ["CONFIRMED", "ACCEPTED"].includes(normalizeBookingStatus(status))

const isActiveReservationStatus = (status) => ["PENDING", "CONFIRMED", "ACCEPTED", "CHECKED_IN"].includes(normalizeBookingStatus(status))

const getStatusBadgeClass = (status) => {
    const normalized = normalizeBookingStatus(status)
    if (normalized === "PENDING") return "bg-amber-100 text-amber-700"
    if (["CONFIRMED", "ACCEPTED"].includes(normalized)) return "bg-emerald-100 text-emerald-700"
    if (normalized === "CHECKED_IN") return "bg-orange-100 text-orange-700"
    if (normalized === "COMPLETED") return "bg-blue-100 text-blue-700"
    if (normalized === "LATE_CANCELLED") return "bg-orange-100 text-orange-700"
    if (normalized === "NO_SHOW") return "bg-rose-100 text-rose-700"
    if (normalized === "CANCELLED") return "bg-slate-200 text-slate-700"
    if (normalized === "DECLINED") return "bg-red-100 text-red-700"
    return "bg-slate-100 text-slate-700"
}

const getDisplayStatus = (status) => {
    const normalized = normalizeBookingStatus(status)
    if (normalized === "CONFIRMED" || normalized === "ACCEPTED") return "Confirmed"
    if (normalized === "CHECKED_IN") return "Table Ready"
    if (normalized === "LATE_CANCELLED") return "Late Cancelled"
    if (normalized === "NO_SHOW") return "No-show"
    if (normalized === "CANCELLED") return "Cancelled"
    if (normalized === "COMPLETED") return "Completed"
    if (normalized === "DECLINED") return "Declined"
    if (normalized === "PENDING") return "Pending"
    return normalized.replaceAll("_", " ")
}

const DINING_MEAL_OPTIONS = [
    { id: "breakfast", label: "Breakfast" },
    { id: "lunch", label: "Lunch" },
    { id: "dinner", label: "Dinner" },
]

const normalizeDiningMealTypes = (mealTypes, isEnabled = true) => {
    if (isEnabled !== true) return []
    const normalized = Array.from(
        new Set(
            (Array.isArray(mealTypes) ? mealTypes : [mealTypes])
                .map((value) => String(value || "").trim().toLowerCase())
                .filter((value) => DINING_MEAL_OPTIONS.some((item) => item.id === value))
        )
    )
    return normalized.length > 0 ? normalized : ["lunch", "dinner"]
}

export default function DiningReservations() {
    const [bookings, setBookings] = useState([])
    const [loading, setLoading] = useState(true)
    const [restaurant, setRestaurant] = useState(null)
    const [searchTerm, setSearchTerm] = useState("")
    const [restaurantPhoto, setRestaurantPhoto] = useState("")
    const [restaurantPhotos, setRestaurantPhotos] = useState([])
    const [menuPhotos, setMenuPhotos] = useState([])
    const [uploadingRestaurantPhoto, setUploadingRestaurantPhoto] = useState(false)
    const [uploadingMenuPhotos, setUploadingMenuPhotos] = useState(false)
    const [removingRestaurantPhoto, setRemovingRestaurantPhoto] = useState(false)
    const [removingMenuPhoto, setRemovingMenuPhoto] = useState(false)
    const [uploadMessage, setUploadMessage] = useState("")
    const [uploadError, setUploadError] = useState("")
    const [activeSection, setActiveSection] = useState("reservations")
    const [activeView, setActiveView] = useState("priority")
    const [diningEnabled, setDiningEnabled] = useState(false)
    const [maxGuestsLimit, setMaxGuestsLimit] = useState(6)
    const [selectedMealTypes, setSelectedMealTypes] = useState(["lunch", "dinner"])
    const [selectedDiningCategoryIds, setSelectedDiningCategoryIds] = useState([])
    const [diningCategories, setDiningCategories] = useState([])
    const [savingDiningSettings, setSavingDiningSettings] = useState(false)
    const [diningSettingsMessage, setDiningSettingsMessage] = useState("")
    const [diningSettingsError, setDiningSettingsError] = useState("")

    const { newBooking, clearNewBooking } = useRestaurantNotifications()
    const navigate = useNavigate()

    const syncRestaurantMediaState = (restaurantData) => {
        setRestaurant(restaurantData || null)
        const coverImages = getCoverImages(restaurantData)
        const profileImage = getProfilePhotoUrl(restaurantData)
        setRestaurantPhotos(coverImages)
        setRestaurantPhoto(coverImages[0]?.url || profileImage)
        setMenuPhotos(getMenuImages(restaurantData))
        const draftDiningState = restaurantData?.pendingDiningRequest || restaurantData?.diningSettings || {}
        const isDiningOn = Boolean(draftDiningState?.isEnabled)
        setDiningEnabled(isDiningOn)
        setMaxGuestsLimit(
            isDiningOn
                ? Math.max(1, parseInt(draftDiningState?.maxGuests, 10) || 6)
                : 0
        )
        setSelectedMealTypes(normalizeDiningMealTypes(draftDiningState?.mealTypes, isDiningOn))
        setSelectedDiningCategoryIds(
            isDiningOn && Array.isArray(draftDiningState?.categoryIds) && draftDiningState.categoryIds.length > 0
                ? draftDiningState.categoryIds.map(String)
                : Array.isArray(restaurantData?.diningCategoryIds)
                    ? restaurantData.diningCategoryIds.map(String)
                    : []
        )
    }

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const resResponse = await restaurantAPI.getCurrentRestaurant()
                const diningCategoriesResponse = await diningAPI.getCategories()
                if (resResponse.data.success) {
                    const resData = getRestaurantFromResponse(resResponse)
                    setDiningCategories(getDiningCategoriesFromResponse(diningCategoriesResponse))
                    const restaurantId = resData?._id || resData?.id
                    if (restaurantId) {
                        syncRestaurantMediaState(resData)
                    }
                }
            } catch (error) {
                debugError("Error fetching reservations:", error)
            } finally {
                setLoading(false)
            }
        }
        fetchAll()
    }, [])

    useEffect(() => {
        let isMounted = true

        const fetchBookings = async () => {
            try {
                const bookingsResponse = await dineInAPI.getRestaurantBookings()
                if (!isMounted || bookingsResponse?.data?.success !== true) return
                setBookings(getBookingsFromResponse(bookingsResponse))
            } catch (error) {
                debugError("Error refreshing reservation queue:", error)
            }
        }

        fetchBookings()
        const intervalId = setInterval(fetchBookings, 10000)

        return () => {
            isMounted = false
            clearInterval(intervalId)
        }
    }, [])

    useEffect(() => {
        if (!newBooking) return
        setBookings((prev) => {
            const bookingKey = String(newBooking?._id || newBooking?.id || "")
            if (!bookingKey) return [newBooking, ...prev]
            const existingIndex = prev.findIndex((b) => String(b?._id || b?.id || "") === bookingKey)
            if (existingIndex === -1) return [newBooking, ...prev]
            return prev.map((booking, index) => (index === existingIndex ? { ...booking, ...newBooking } : booking))
        })
        toast.success("New table booking received")
        clearNewBooking()
    }, [newBooking, clearNewBooking])

    const handleRestaurantPhotoUpload = async (event) => {
        const files = Array.from(event.target.files || [])
        if (files.length === 0) return
        setUploadError("")
        setUploadMessage("")
        setUploadingRestaurantPhoto(true)
        try {
            await restaurantAPI.uploadCoverImages(files)
            const refreshedResponse = await restaurantAPI.getCurrentRestaurant()
            syncRestaurantMediaState(getRestaurantFromResponse(refreshedResponse))
            setUploadMessage(`Uploaded ${files.length} restaurant photo(s) successfully.`)
        } catch (error) {
            setUploadError(error?.response?.data?.message || "Failed to upload restaurant photos.")
        } finally {
            setUploadingRestaurantPhoto(false)
            event.target.value = ""
        }
    }

    const handleMenuPhotosUpload = async (event) => {
        const files = Array.from(event.target.files || [])
        if (files.length === 0) return
        setUploadError("")
        setUploadMessage("")
        setUploadingMenuPhotos(true)
        try {
            await restaurantAPI.uploadMenuImages(files)
            const refreshedResponse = await restaurantAPI.getCurrentRestaurant()
            syncRestaurantMediaState(getRestaurantFromResponse(refreshedResponse))
            setUploadMessage(`Uploaded ${files.length} menu photo(s) successfully.`)
        } catch (error) {
            setUploadError(error?.response?.data?.message || "Failed to upload menu photos.")
        } finally {
            setUploadingMenuPhotos(false)
            event.target.value = ""
        }
    }

    const handleRemoveRestaurantPhoto = async (photoUrl) => {
        if (!photoUrl || removingRestaurantPhoto) return
        setRemovingRestaurantPhoto(true)
        try {
            const nextCoverImages = restaurantPhotos.filter((photo) => photo.url !== photoUrl)
            const currentProfileImage = getProfilePhotoUrl(restaurant)
            const nextPrimaryPhoto = nextCoverImages[0]?.url || ""
            const shouldClearProfileImage = !nextPrimaryPhoto && currentProfileImage === photoUrl
            const response = await restaurantAPI.updateProfile({
                coverImages: nextCoverImages.map((photo) => ({
                    url: photo.url,
                    ...(photo.publicId ? { publicId: photo.publicId } : {}),
                })),
                ...(shouldClearProfileImage ? { profileImage: "" } : {}),
            })
            syncRestaurantMediaState(getRestaurantFromResponse(response))
            setUploadMessage("Restaurant photo removed successfully.")
        } catch (error) {
            setUploadError("Failed to remove restaurant photo.")
        } finally {
            setRemovingRestaurantPhoto(false)
        }
    }

    const handleRemoveMenuPhoto = async (photoUrl) => {
        if (!photoUrl || removingMenuPhoto) return
        setRemovingMenuPhoto(true)
        try {
            const nextMenuPhotos = menuPhotos.filter((photo) => photo.url !== photoUrl)
            const response = await restaurantAPI.updateProfile({
                menuImages: nextMenuPhotos.map((photo) => ({
                    url: photo.url,
                    ...(photo.publicId ? { publicId: photo.publicId } : {}),
                })),
            })
            syncRestaurantMediaState(getRestaurantFromResponse(response))
            setUploadMessage("Menu photo removed successfully.")
        } catch (error) {
            setUploadError("Failed to remove menu photo.")
        } finally {
            setRemovingMenuPhoto(false)
        }
    }

    const handleSaveDiningSettings = async () => {
        if (!restaurant || savingDiningSettings) return
        const parsedLimit = diningEnabled ? parseInt(maxGuestsLimit, 10) : 0
        if (diningEnabled && (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 99)) {
            setDiningSettingsError("Please enter a valid sitting capacity between 1 and 99")
            toast.error("Invalid sitting capacity")
            return
        }
        if (diningEnabled && selectedMealTypes.length === 0) {
            setDiningSettingsError("Select at least one dining session.")
            toast.error("Select at least one dining session")
            return
        }
        if (diningEnabled && selectedDiningCategoryIds.length === 0) {
            setDiningSettingsError("Select at least one dining category.")
            toast.error("Select at least one dining category")
            return
        }
        setSavingDiningSettings(true)
        setDiningSettingsError("")
        setDiningSettingsMessage("")
        try {
            const response = await restaurantAPI.updateDiningSettings({
                isEnabled: Boolean(diningEnabled),
                maxGuests: diningEnabled ? parsedLimit : 1,
                mealTypes: diningEnabled ? selectedMealTypes : [],
                categoryIds: diningEnabled ? selectedDiningCategoryIds : [],
                primaryCategoryId: diningEnabled ? selectedDiningCategoryIds[0] : null,
            })
            const updatedRestaurant = getRestaurantFromResponse(response)
            syncRestaurantMediaState(updatedRestaurant)
            if (updatedRestaurant?.isDiningApproved) {
                setDiningSettingsMessage("Your dining updates have been applied immediately.")
                toast.success("Dining settings updated successfully")
            } else {
                setDiningSettingsMessage("Your dining update request is awaiting admin approval.")
                toast.success("Dining request sent for approval")
            }
        } catch (error) {
            const message = error?.response?.data?.message || "Failed to submit dining request."
            setDiningSettingsError(message)
            toast.error(message)
        } finally {
            setSavingDiningSettings(false)
        }
    }

    const handleStatusUpdate = async (bookingId, newStatus) => {
        try {
            let res
            if (newStatus === 'CONFIRMED') res = await dineInAPI.acceptBooking(bookingId)
            else if (newStatus === 'DECLINED') res = await dineInAPI.declineBooking(bookingId)
            else if (newStatus === 'CHECKED_IN') res = await dineInAPI.checkInBooking(bookingId)
            if (res?.data?.success) {
                toast.success(newStatus === 'CHECKED_IN' ? 'Notification sent to guest ✓' : `Booking ${newStatus.toLowerCase()} successfully`)
                setBookings(prev => prev.map(b => (b._id === bookingId || String(b._id) === String(bookingId)) ? { ...b, status: newStatus } : b))
            }
        } catch (error) {
            toast.error('Failed to update booking')
        }
    }

    const getStatusPriority = (status) => {
        const key = normalizeBookingStatus(status)
        if (key === "PENDING") return 0
        if (key === "CONFIRMED" || key === "ACCEPTED") return 1
        if (key === "CHECKED_IN") return 2
        if (key === "COMPLETED") return 3
        if (key === "LATE_CANCELLED") return 4
        if (key === "NO_SHOW") return 5
        if (key === "CANCELLED" || key === "DECLINED") return 6
        return 5
    }

    const getBookingTimestamp = (booking) => {
        const ts = new Date(
            booking?.updatedAt ||
            booking?.createdAt ||
            booking?.bookedAt ||
            booking?.requestedAt ||
            booking?.date ||
            ""
        ).getTime()
        return isNaN(ts) ? 0 : ts
    }

    const isToday = (value) => new Date(value).toDateString() === new Date().toDateString()

    const isNewRequest = (booking) => isPendingReservationStatus(booking?.status)

    const sortedBookings = useMemo(() => {
        return [...bookings].sort((a, b) => {
            const p = getStatusPriority(a?.status) - getStatusPriority(b?.status)
            return p !== 0 ? p : getBookingTimestamp(b) - getBookingTimestamp(a)
        })
    }, [bookings])

    const filteredBookings = useMemo(() => {
        const term = searchTerm.trim().toLowerCase()
        return sortedBookings
            .filter(b => !term || getBookerName(b).toLowerCase().includes(term) || String(b?.bookingId || "").toLowerCase().includes(term) || getBookerPhone(b).toLowerCase().includes(term))
            .filter(b => {
                if (activeView === "today") return isToday(b?.date)
                if (activeView === "new") return isNewRequest(b)
                return true
            })
    }, [sortedBookings, searchTerm, activeView])

    const newRequestsCount = useMemo(() => bookings.filter(b => isNewRequest(b)).length, [bookings])

    const diningControlsSection = (
        <section className="bg-white p-5 sm:p-6 rounded-[28px] shadow-sm border border-slate-100">
            <div className="mb-4">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-300">Dining Controls</p>
                <h2 className="mt-1.5 max-w-xl text-lg sm:text-[23px] font-black text-slate-900 tracking-tight leading-snug sm:leading-7">Manage Dining Availability & Booking Limit</h2>
            </div>

            {restaurant?.diningRejectionNote && (
                <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-600">
                    <p className="font-black text-rose-800 uppercase tracking-wider mb-1">Request Rejected Note</p>
                    <p className="text-rose-700">{restaurant.diningRejectionNote}</p>
                </div>
            )}

            {(diningSettingsMessage || diningSettingsError || restaurant?.pendingDiningRequest?.requestedAt) && (
                <div className={`mb-4 rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${
                    diningSettingsError
                        ? "border-rose-100 bg-rose-50 text-rose-600"
                        : (restaurant?.pendingDiningRequest?.requestedAt
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700")
                }`}>
                    {diningSettingsError || (restaurant?.pendingDiningRequest?.requestedAt ? "Your dining update request is awaiting admin approval." : diningSettingsMessage)}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm">
                    <span className={`h-2.5 w-2.5 rounded-full ${diningEnabled ? "bg-emerald-500" : "bg-rose-500"}`} />
                    <span className="text-sm font-semibold text-slate-700">{diningEnabled ? "Dining enabled" : "Dining paused"}</span>
                </div>

                <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm">
                    <span className="text-sm font-semibold text-slate-700">Turn dining ON/OFF</span>
                    <button
                        onClick={() => {
                            setDiningEnabled((prev) => {
                                const nextValue = !prev
                                if (!nextValue) {
                                    setSelectedMealTypes([])
                                    setSelectedDiningCategoryIds([])
                                    setMaxGuestsLimit(0)
                                } else {
                                    setSelectedMealTypes((current) => normalizeDiningMealTypes(current, true))
                                    setMaxGuestsLimit((current) => Math.max(1, parseInt(current, 10) || 6))
                                }
                                return nextValue
                            })
                        }}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${diningEnabled ? "bg-emerald-500" : "bg-slate-300"}`}
                    >
                        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${diningEnabled ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                </div>

                <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm">
                    <span className="text-sm font-semibold text-slate-700">Max sitting capacity</span>
                    <div className="flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-1 shadow-inner">
                        <button
                            type="button"
                            disabled={!diningEnabled}
                            onClick={() => setMaxGuestsLimit((prev) => Math.max(1, (parseInt(prev, 10) || 1) - 1))}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                        <input
                            type="number"
                            value={maxGuestsLimit}
                            min={diningEnabled ? "1" : "0"}
                            disabled={!diningEnabled}
                            onInput={(e) => {
                                if (e.target.value.length > 2) {
                                    e.target.value = e.target.value.slice(0, 2)
                                }
                            }}
                            onChange={(e) => setMaxGuestsLimit(e.target.value)}
                            className={`w-14 bg-transparent text-center text-base font-black text-slate-900 outline-none ${!diningEnabled ? "cursor-not-allowed text-slate-400" : ""}`}
                        />
                        <button
                            type="button"
                            disabled={!diningEnabled}
                            onClick={() => setMaxGuestsLimit((prev) => Math.min(99, (parseInt(prev, 10) || 0) + 1))}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>
            </div>

            <p className={`mt-3 text-xs font-semibold flex items-start gap-1.5 transition-colors ${diningEnabled ? "text-slate-500" : "text-slate-400"}`}>
                <Info className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>Note: Max sitting capacity defines the maximum number of guests that can be accommodated at a single table.</span>
            </p>

            <div className="mt-5 rounded-[26px] border border-slate-200 bg-white p-4 sm:p-5">
                <div className="mb-4">
                    <h3 className="text-base font-black text-slate-900">Meal sessions</h3>
                    <p className="mt-1 text-xs font-medium text-slate-500">Select what you offer for table reservations.</p>
                </div>

                <div className="flex flex-wrap gap-3">
                    {DINING_MEAL_OPTIONS.map((meal) => {
                        const active = selectedMealTypes.includes(meal.id)
                        return (
                            <button
                                key={meal.id}
                                type="button"
                                disabled={!diningEnabled}
                                onClick={() => {
                                    if (!diningEnabled) return
                                    setSelectedMealTypes((prev) =>
                                        prev.includes(meal.id)
                                            ? prev.filter((item) => item !== meal.id)
                                            : [...prev, meal.id]
                                    )
                                }}
                                className={`rounded-full border px-4 py-2 text-sm font-semibold transition-all ${
                                    active
                                        ? "text-white"
                                        : "border-slate-200 bg-slate-50 text-slate-700"
                                } ${!diningEnabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                                style={active ? { backgroundColor: RESTAURANT_THEME.brand, borderColor: RESTAURANT_THEME.brand } : undefined}
                            >
                                {meal.label}
                            </button>
                        )
                    })}
                </div>
            </div>

            <div className="mt-5 rounded-[26px] border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
                <div className="mb-4">
                    <div className="flex items-center gap-2 text-slate-900">
                        <h3 className="text-base font-black">Dining categories</h3>
                    </div>
                    <p className="mt-1 text-xs font-medium text-slate-500">Choose one or multiple categories for this request.</p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {diningCategories.map((category) => {
                        const categoryId = String(category?._id || "")
                        const isSelected = selectedDiningCategoryIds.includes(categoryId)
                        const imageUrl = String(category?.imageUrl || "").trim()

                        return (
                            <button
                                key={categoryId}
                                type="button"
                                disabled={!diningEnabled}
                                onClick={() => {
                                    if (!diningEnabled) return
                                    setSelectedDiningCategoryIds((prev) =>
                                        prev.includes(categoryId)
                                            ? prev.filter((id) => id !== categoryId)
                                            : [...prev, categoryId]
                                    )
                                }}
                                className={`group relative overflow-hidden rounded-[24px] border text-left transition-all ${
                                    isSelected
                                        ? "text-white shadow-lg shadow-slate-200/50"
                                        : "border-slate-200 bg-white text-slate-900 shadow-sm"
                                } ${!diningEnabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:-translate-y-0.5 hover:shadow-md"}`}
                                style={isSelected ? { backgroundColor: RESTAURANT_THEME.brand, borderColor: RESTAURANT_THEME.brand } : undefined}
                            >
                                <div className={`relative ${imageUrl ? "h-28" : "h-24"} overflow-hidden ${isSelected ? "bg-black/20" : "bg-slate-100"}`}>
                                    {imageUrl ? (
                                        <img src={imageUrl} alt={category?.name || "Dining category"} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center">
                                            <Sparkles className={`h-8 w-8 ${isSelected ? "text-white/70" : "text-slate-300"}`} />
                                        </div>
                                    )}
                                    {isSelected && (
                                        <span className="absolute right-3 top-3 rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-900">
                                            Selected
                                        </span>
                                    )}
                                </div>

                                <div className="p-4">
                                    <p className={`text-base font-black ${isSelected ? "text-white" : "text-slate-900"}`}>{category?.name || "Category"}</p>
                                    <p className={`mt-1 text-xs font-medium ${isSelected ? "text-white/80" : "text-slate-500"}`}>
                                        {isSelected ? "Included in this request" : "Tap to include"}
                                    </p>
                                </div>
                            </button>
                        )
                    })}
                </div>

                {diningCategories.length === 0 && (
                    <p className="rounded-2xl bg-white px-4 py-6 text-center text-xs font-medium text-slate-500">No dining categories available right now.</p>
                )}
            </div>

            <div className="mt-5 flex justify-end">
                <button
                    onClick={handleSaveDiningSettings}
                    disabled={savingDiningSettings}
                    className="w-full rounded-full px-6 py-3 text-sm font-black text-white shadow-lg shadow-slate-200 transition-all hover:opacity-90 disabled:opacity-50 sm:w-auto sm:min-w-56 active:scale-95 cursor-pointer"
                    style={{ backgroundColor: RESTAURANT_THEME.brand }}
                >
                    {savingDiningSettings ? "Sending request..." : "Save settings"}
                </button>
            </div>
        </section>
    )

    if (loading) return <Loader />

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            <div className="bg-white/80 backdrop-blur-xl sticky top-0 z-30 border-b border-slate-100">
                <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => navigate("/food/restaurant/explore")}
                                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer shrink-0 text-gray-900"
                                aria-label="Go back"
                            >
                                <ArrowLeft className="w-6 h-6" />
                            </button>
                            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                                Dining Reservations <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            </h1>
                        </div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1 pl-[48px]">Live Queue Management</p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                        <div className="flex items-center gap-1 bg-slate-100/50 p-1 rounded-2xl border border-slate-200/50">
                            <button onClick={() => setActiveSection("reservations")} className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer ${activeSection === "reservations" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>Queue</button>
                            <button onClick={() => setActiveSection("media")} className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer ${activeSection === "media" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>Media</button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto p-6">
                {activeSection === "reservations" ? (
                    <div className="space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
                                <div className="flex items-center gap-4 relative">
                                    <div className="bg-blue-600 p-3 rounded-xl text-white"><Users className="w-6 h-6" /></div>
                                    <div>
                                        <p className="text-slate-500 text-sm font-semibold uppercase tracking-wider">Total Bookings</p>
                                        <p className="text-3xl font-black text-slate-900 mt-1">{bookings.length}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
                                <div className="flex items-center gap-4 relative">
                                    <div className="bg-emerald-600 p-3 rounded-xl text-white"><CheckCircle2 className="w-6 h-6" /></div>
                                    <div>
                                        <p className="text-slate-500 text-sm font-semibold uppercase tracking-wider">Active</p>
                                        <p className="text-3xl font-black text-slate-900 mt-1">{bookings.filter(b => isActiveReservationStatus(b.status)).length}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
                                <div className="flex items-center gap-4 relative">
                                    <div className="bg-amber-500 p-3 rounded-xl text-white"><Clock4 className="w-6 h-6" /></div>
                                    <div>
                                        <p className="text-slate-500 text-sm font-semibold uppercase tracking-wider">New Requests</p>
                                        <p className="text-3xl font-black text-slate-900 mt-1">{newRequestsCount}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {diningControlsSection}

                        <div className="space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <h2 className="text-lg font-black text-slate-900">Reservation Queue</h2>
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                                    <div className="relative group">
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                                        <input
                                            type="text"
                                            placeholder="Search guests..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="w-full sm:w-64 pl-11 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold placeholder:text-slate-400 focus:border-blue-500/20 focus:ring-4 focus:ring-blue-500/5 transition-all outline-none"
                                        />
                                    </div>
                                    <div className="flex items-center justify-between sm:justify-end gap-1.5 bg-white p-1 rounded-xl border border-slate-200">
                                        {["priority", "new", "today"].map(view => (
                                            <button
                                                key={view}
                                                onClick={() => setActiveView(view)}
                                                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${activeView === view ? "text-white" : "text-slate-500 hover:bg-slate-50"}`}
                                                style={activeView === view ? { backgroundColor: RESTAURANT_THEME.brand } : undefined}
                                            >
                                                {view.charAt(0).toUpperCase() + view.slice(1)} {view === 'new' ? `(${newRequestsCount})` : ''}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {newRequestsCount > 0 && (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 text-sm font-semibold flex items-center gap-2">
                                    <Sparkles className="w-4 h-4" /> {newRequestsCount} new reservation request{newRequestsCount > 1 ? "s" : ""} waiting for action.
                                </div>
                            )}

                            {filteredBookings.length > 0 ? (
                                <>
                                    <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                                        <table className="w-full text-left">
                                            <thead className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                                                <tr>
                                                    <th className="px-6 py-4 text-center">ID</th>
                                                    <th className="px-6 py-4">Guest Details</th>
                                                    <th className="px-6 py-4">Schedule</th>
                                                    <th className="px-6 py-4 text-center">Guests</th>
                                                    <th className="px-6 py-4">Status</th>
                                                    <th className="px-6 py-4 text-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                <AnimatePresence mode="popLayout">
                                                    {filteredBookings.map(booking => (
                                                        <motion.tr layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} key={booking._id} className="hover:bg-slate-50/50 transition-colors">
                                                            <td className="px-6 py-4 font-mono text-xs font-bold text-slate-400 text-center">#{booking.bookingId}</td>
                                                            <td className="px-6 py-4">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs">{getBookerName(booking).charAt(0)}</div>
                                                                    <div>
                                                                        <p className="font-bold text-slate-900">{getBookerName(booking)}</p>
                                                                        <p className="text-xs text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3" /> {getBookerPhone(booking)}</p>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 text-sm font-medium text-slate-700">
                                                                <div className="flex flex-col gap-0.5">
                                                                    <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-blue-500" /> {new Date(booking.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                                                                    <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-blue-500" /> {booking.timeSlot}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 text-center">
                                                                <span className="inline-flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-full text-xs font-bold text-slate-700"><Users className="w-3 h-3" /> {booking.guests}</span>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <Badge className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase ${getStatusBadgeClass(booking.status)}`}>{getDisplayStatus(booking.status)}</Badge>
                                                            </td>
                                                            <td className="px-6 py-4 text-right">
                                                                <div className="flex items-center justify-end gap-2">
                                                                    {isPendingReservationStatus(booking.status) && (
                                                                        <>
                                                                            <button 
                                                                                onClick={() => handleStatusUpdate(booking._id, 'CONFIRMED')} 
                                                                                className="px-3 py-1.5 text-white text-xs font-bold rounded-lg hover:opacity-90 transition-all cursor-pointer"
                                                                                style={{ backgroundColor: RESTAURANT_THEME.brand }}
                                                                            >
                                                                                Accept
                                                                            </button>
                                                                            <button 
                                                                                onClick={() => handleStatusUpdate(booking._id, 'DECLINED')} 
                                                                                className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                                                                            >
                                                                                Decline
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                    {isConfirmedReservationStatus(booking.status) && (
                                                                        <button 
                                                                            onClick={() => handleStatusUpdate(booking._id, 'CHECKED_IN')} 
                                                                            className="px-3 py-1.5 text-white text-xs font-bold rounded-lg hover:opacity-90 transition-all cursor-pointer"
                                                                            style={{ backgroundColor: RESTAURANT_THEME.brand }}
                                                                        >
                                                                            Check-in 🔔
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </motion.tr>
                                                    ))}
                                                </AnimatePresence>
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="md:hidden space-y-4">
                                        <AnimatePresence mode="popLayout">
                                            {filteredBookings.map(booking => (
                                                <motion.div layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} key={booking._id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                                                    <div className="flex items-start justify-between mb-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-full text-white flex items-center justify-center font-black" style={{ backgroundColor: RESTAURANT_THEME.brand }}>{getBookerName(booking).charAt(0)}</div>
                                                            <div>
                                                                <h3 className="font-black text-slate-900 leading-tight">{getBookerName(booking)}</h3>
                                                                <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">#{booking.bookingId}</p>
                                                            </div>
                                                        </div>
                                                        <Badge className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${getStatusBadgeClass(booking.status)}`}>{getDisplayStatus(booking.status)}</Badge>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl mb-4 text-[11px] font-bold text-slate-700">
                                                        <div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5 text-blue-500" /> {new Date(booking.date).toLocaleDateString('en-GB')}</div>
                                                        <div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5 text-blue-500" /> {booking.timeSlot}</div>
                                                        <div className="flex items-center gap-2"><Users className="w-3.5 h-3.5 text-blue-500" /> {booking.guests} Guests</div>
                                                        <div className="flex items-center gap-2 truncate"><Phone className="w-3.5 h-3.5 text-blue-500" /> {getBookerPhone(booking)}</div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        {isPendingReservationStatus(booking.status) && (
                                                            <>
                                                                <button 
                                                                    onClick={() => handleStatusUpdate(booking._id, 'CONFIRMED')} 
                                                                    className="flex-1 py-2 text-white text-xs font-black rounded-xl cursor-pointer uppercase hover:opacity-90 transition-all"
                                                                    style={{ backgroundColor: RESTAURANT_THEME.brand }}
                                                                >
                                                                    Accept
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleStatusUpdate(booking._id, 'DECLINED')} 
                                                                    className="flex-1 py-2 bg-slate-100 text-slate-600 text-xs font-black rounded-xl cursor-pointer uppercase transition-colors"
                                                                >
                                                                    Decline
                                                                </button>
                                                            </>
                                                        )}
                                                        {isConfirmedReservationStatus(booking.status) && (
                                                            <button 
                                                                onClick={() => handleStatusUpdate(booking._id, 'CHECKED_IN')} 
                                                                className="flex-1 py-2 text-white text-xs font-black rounded-xl cursor-pointer uppercase hover:opacity-90 transition-all"
                                                                style={{ backgroundColor: RESTAURANT_THEME.brand }}
                                                            >
                                                                Check-in 🔔
                                                            </button>
                                                        )}
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>
                                    </div>
                                </>
                            ) : (
                                <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm">
                                    <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"><Calendar className="w-8 h-8 text-slate-300" /></div>
                                    <h3 className="text-xl font-black text-slate-800">No reservations found</h3>
                                    <p className="text-slate-500 mt-1">Guests booking a table will appear here in your live queue.</p>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-8">
                        <section className="space-y-6">
                            <div className="flex items-end justify-between px-2">
                                <div>
                                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Restaurant Visuals</h2>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                                    <div className="flex items-center justify-between mb-6">
                                        <h3 className="font-black text-slate-800 flex items-center gap-2">
                                            <ImagePlus className="w-5 h-5" style={{ color: RESTAURANT_THEME.brand }} /> Ambiance Photos
                                        </h3>
                                        <label 
                                            className="px-4 py-2 text-xs font-black rounded-xl hover:opacity-90 transition-all cursor-pointer uppercase tracking-wider"
                                            style={{ backgroundColor: RESTAURANT_THEME.brand, color: '#ffffff' }}
                                        >
                                            Upload <input type="file" multiple accept="image/*" className="hidden" onChange={handleRestaurantPhotoUpload} disabled={uploadingRestaurantPhoto} />
                                        </label>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        {restaurantPhotos.map((photo, i) => (
                                            <div key={i} className="group relative aspect-square rounded-2xl overflow-hidden bg-slate-100 border border-slate-200">
                                                <img src={photo.url} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                                <button onClick={() => handleRemoveRestaurantPhoto(photo.url)} className="absolute top-1.5 right-1.5 p-1 bg-white text-rose-600 rounded-full cursor-pointer shadow-md hover:bg-slate-50 transition-colors z-10"><X className="w-3 h-3 stroke-[2.5]" /></button>
                                            </div>
                                        ))}
                                        {uploadingRestaurantPhoto && <div className="aspect-square rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div>}
                                        {restaurantPhotos.length === 0 && !uploadingRestaurantPhoto && <div className="col-span-3 py-12 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">No photos uploaded</div>}
                                    </div>
                                </div>

                                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                                    <div className="flex items-center justify-between mb-6">
                                        <h3 className="font-black text-slate-800 flex items-center gap-2">
                                            <UploadCloud className="w-5 h-5" style={{ color: RESTAURANT_THEME.brand }} /> Menu Cards
                                        </h3>
                                        <label 
                                            className="px-4 py-2 text-xs font-black rounded-xl hover:opacity-90 transition-all cursor-pointer uppercase tracking-wider"
                                            style={{ backgroundColor: RESTAURANT_THEME.brand, color: '#ffffff' }}
                                        >
                                            Upload <input type="file" multiple accept="image/*" className="hidden" onChange={handleMenuPhotosUpload} disabled={uploadingMenuPhotos} />
                                        </label>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        {menuPhotos.map((photo, i) => (
                                            <div key={i} className="group relative aspect-square rounded-2xl overflow-hidden bg-slate-100 border border-slate-200">
                                                <img src={photo.url} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                                <button onClick={() => handleRemoveMenuPhoto(photo.url)} className="absolute top-1.5 right-1.5 p-1 bg-white text-rose-600 rounded-full cursor-pointer shadow-md hover:bg-slate-50 transition-colors z-10"><X className="w-3 h-3 stroke-[2.5]" /></button>
                                            </div>
                                        ))}
                                        {uploadingMenuPhotos && <div className="aspect-square rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div>}
                                        {menuPhotos.length === 0 && !uploadingMenuPhotos && <div className="col-span-3 py-12 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">No menu cards uploaded</div>}
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                )}
            </div>
        </div>
    )
}
