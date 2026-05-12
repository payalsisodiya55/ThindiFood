import { useState, useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Calendar, Clock, Users, Search, MessageSquare, CheckCircle2, Clock4, UploadCloud, ImagePlus, ChevronDown, ChevronUp, Sparkles, MapPin, Phone, Info, X, ChevronLeft } from "lucide-react"
import { diningAPI, restaurantAPI, dineInAPI } from "@food/api"
import Loader from "@food/components/Loader"
import { Badge } from "@food/components/ui/badge"
import { toast } from "sonner"
import { useRestaurantNotifications } from "@food/hooks/useRestaurantNotifications"

const debugError = (...args) => {}

const getRestaurantFromResponse = (response) =>
    response?.data?.data?.restaurant ||
    response?.data?.restaurant ||
    response?.data?.data ||
    null

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
        setDiningEnabled(Boolean(restaurantData?.diningSettings?.isEnabled))
        setMaxGuestsLimit(parseInt(restaurantData?.diningSettings?.maxGuests, 10) || 6)
    }

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const resResponse = await restaurantAPI.getCurrentRestaurant()
                if (resResponse.data.success) {
                    const resData = getRestaurantFromResponse(resResponse)
                    const restaurantId = resData?._id || resData?.id
                    if (restaurantId) {
                        syncRestaurantMediaState(resData)
                        const bookingsResponse = await dineInAPI.getRestaurantBookings()
                        if (bookingsResponse.data?.success) {
                            setBookings(Array.isArray(bookingsResponse.data.data) ? bookingsResponse.data.data : [])
                        }
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
        if (!newBooking) return
        setBookings((prev) => {
            const existing = prev.some((b) => String(b?._id || b?.id || "") === String(newBooking?._id || newBooking?.id || ""))
            if (existing) return prev
            return [newBooking, ...prev]
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
        const parsedLimit = parseInt(maxGuestsLimit, 10)
        if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 20) {
            setDiningSettingsError("Please enter a guest limit between 1 and 20")
            toast.error("Invalid guest limit (Min: 1, Max: 20)")
            return
        }
        setSavingDiningSettings(true)
        try {
            const response = await restaurantAPI.updateDiningSettings({
                ...(restaurant?.diningSettings || {}),
                isEnabled: Boolean(diningEnabled),
                maxGuests: parsedLimit,
            })
            syncRestaurantMediaState(getRestaurantFromResponse(response))
            setDiningSettingsMessage("Dining settings saved successfully.")
            toast.success("Dining settings updated")
        } catch (error) {
            setDiningSettingsError("Failed to save dining settings.")
            toast.error("Failed to save dining settings")
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
        const ts = new Date(booking?.createdAt || booking?.date || "").getTime()
        return isNaN(ts) ? 0 : ts
    }

    const isToday = (value) => new Date(value).toDateString() === new Date().toDateString()

    const isNewRequest = (booking) => {
        if (!isPendingReservationStatus(booking?.status)) return false
        const ts = getBookingTimestamp(booking)
        return Date.now() - ts <= 2 * 60 * 60 * 1000
    }

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

    if (loading) return <Loader />

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            <div className="bg-white/80 backdrop-blur-xl sticky top-0 z-30 border-b border-slate-100">
                <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate("/food/restaurant/explore")} className="p-2 rounded-xl hover:bg-slate-100 transition-all cursor-pointer border border-slate-200">
                            <ChevronLeft className="w-6 h-6 text-slate-700" />
                        </button>
                        <div>
                            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                                Table Reservations <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            </h1>
                            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Live Queue Management</p>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                        <div className="relative group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                            <input
                                type="text"
                                placeholder="Search guests..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full sm:w-64 pl-11 pr-4 py-2.5 bg-slate-100/50 border-2 border-transparent rounded-2xl text-sm font-bold focus:bg-white focus:border-blue-500/20 focus:ring-4 focus:ring-blue-500/5 transition-all outline-none"
                            />
                        </div>
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

                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h2 className="font-bold text-slate-800">Reservation Queue</h2>
                                <div className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 p-1">
                                    {["priority", "new", "today"].map(view => (
                                        <button
                                            key={view}
                                            onClick={() => setActiveView(view)}
                                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${activeView === view ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}
                                        >
                                            {view.charAt(0).toUpperCase() + view.slice(1)} {view === 'new' ? `(${newRequestsCount})` : ''}
                                        </button>
                                    ))}
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
                                                                            <button onClick={() => handleStatusUpdate(booking._id, 'CONFIRMED')} className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 cursor-pointer">Accept</button>
                                                                            <button onClick={() => handleStatusUpdate(booking._id, 'DECLINED')} className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-200 cursor-pointer">Decline</button>
                                                                        </>
                                                                    )}
                                                                    {isConfirmedReservationStatus(booking.status) && (
                                                                        <button onClick={() => handleStatusUpdate(booking._id, 'CHECKED_IN')} className="px-3 py-1.5 bg-orange-600 text-white text-xs font-bold rounded-lg hover:bg-orange-700 cursor-pointer">Check-in 🔔</button>
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
                                                            <div className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center font-black">{getBookerName(booking).charAt(0)}</div>
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
                                                                <button onClick={() => handleStatusUpdate(booking._id, 'CONFIRMED')} className="flex-1 py-2 bg-emerald-600 text-white text-xs font-black rounded-xl cursor-pointer uppercase">Accept</button>
                                                                <button onClick={() => handleStatusUpdate(booking._id, 'DECLINED')} className="flex-1 py-2 bg-slate-100 text-slate-600 text-xs font-black rounded-xl cursor-pointer uppercase">Decline</button>
                                                            </>
                                                        )}
                                                        {isConfirmedReservationStatus(booking.status) && (
                                                            <button onClick={() => handleStatusUpdate(booking._id, 'CHECKED_IN')} className="flex-1 py-2 bg-orange-600 text-white text-xs font-black rounded-xl cursor-pointer uppercase">Check-in 🔔</button>
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
                        <section className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                            <div className="flex items-center justify-between mb-8">
                                <div>
                                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Dining Settings</h2>
                                    <p className="text-slate-500 font-medium mt-1">Configure how guests book tables at your restaurant</p>
                                </div>
                                <button
                                    onClick={handleSaveDiningSettings}
                                    disabled={savingDiningSettings}
                                    className="px-6 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 disabled:opacity-50 cursor-pointer"
                                >
                                    {savingDiningSettings ? "Saving..." : "Save Changes"}
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                        <div className="flex items-center gap-3">
                                            <div className="bg-blue-600 p-2 rounded-lg text-white"><Calendar className="w-4 h-4" /></div>
                                            <div>
                                                <p className="font-bold text-slate-900 text-sm">Accept Reservations</p>
                                                <p className="text-[11px] text-slate-500 font-medium">Enable/disable online table bookings</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setDiningEnabled(!diningEnabled)}
                                            className={`w-12 h-6 rounded-full transition-all relative cursor-pointer ${diningEnabled ? "bg-emerald-500" : "bg-slate-200"}`}
                                        >
                                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${diningEnabled ? "right-1" : "left-1"}`} />
                                        </button>
                                    </div>

                                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="bg-orange-500 p-2 rounded-lg text-white"><Users className="w-4 h-4" /></div>
                                            <div>
                                                <p className="font-bold text-slate-900 text-sm">Customer Limit</p>
                                                <p className="text-[11px] text-slate-500 font-medium">Maximum guests per reservation (Max: 20)</p>
                                            </div>
                                        </div>
                                        <div className="relative group">
                                            <input
                                                type="number"
                                                value={maxGuestsLimit}
                                                onInput={(e) => {
                                                    if (e.target.value.length > 2) {
                                                        e.target.value = e.target.value.slice(0, 2);
                                                    }
                                                }}
                                                onChange={(e) => setMaxGuestsLimit(e.target.value)}
                                                className={`w-full pl-4 pr-12 py-3 bg-white border-2 rounded-xl text-lg font-black focus:ring-4 transition-all outline-none ${
                                                    (parseInt(maxGuestsLimit, 10) > 20 || parseInt(maxGuestsLimit, 10) < 1) 
                                                    ? "border-rose-500 focus:border-rose-600 focus:ring-rose-500/10" 
                                                    : "border-slate-100 focus:border-blue-500/20 focus:ring-blue-500/5"
                                                }`}
                                            />
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-0.5">
                                                <button onClick={() => setMaxGuestsLimit(prev => Math.min(20, (parseInt(prev, 10) || 0) + 1))} className="p-1 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"><ChevronUp className="w-3 h-3" /></button>
                                                <button onClick={() => setMaxGuestsLimit(prev => Math.max(1, (parseInt(prev, 10) || 0) - 1))} className="p-1 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"><ChevronDown className="w-3 h-3" /></button>
                                            </div>
                                        </div>
                                        {parseInt(maxGuestsLimit, 10) > 20 && <p className="text-[10px] text-rose-500 font-black uppercase mt-2 ml-1">Limit cannot exceed 20 guests</p>}
                                    </div>
                                </div>
                                <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100 flex items-start gap-4">
                                    <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                                    <div>
                                        <h4 className="font-bold text-blue-900 text-sm">Why this limit matters?</h4>
                                        <p className="text-xs text-blue-700/70 font-medium mt-1 leading-relaxed">Setting a realistic guest limit helps manage your floor space effectively and prevents large unmanaged groups from disrupting your service flow.</p>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="space-y-6">
                            <div className="flex items-end justify-between px-2">
                                <div>
                                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Restaurant Visuals</h2>
                                    <p className="text-slate-500 font-medium mt-1">Showcase your ambiance and menu to potential guests</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                                    <div className="flex items-center justify-between mb-6">
                                        <h3 className="font-black text-slate-800 flex items-center gap-2"><ImagePlus className="w-5 h-5 text-blue-600" /> Ambiance Photos</h3>
                                        <label className="px-4 py-2 bg-blue-50 text-blue-600 text-xs font-black rounded-xl hover:bg-blue-100 transition-colors cursor-pointer uppercase tracking-wider">
                                            Upload <input type="file" multiple accept="image/*" className="hidden" onChange={handleRestaurantPhotoUpload} disabled={uploadingRestaurantPhoto} />
                                        </label>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        {restaurantPhotos.map((photo, i) => (
                                            <div key={i} className="group relative aspect-square rounded-2xl overflow-hidden bg-slate-100 border border-slate-200">
                                                <img src={photo.url} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                                <button onClick={() => handleRemoveRestaurantPhoto(photo.url)} className="absolute top-2 right-2 p-1.5 bg-white/90 backdrop-blur text-rose-600 rounded-lg opacity-0 group-hover:opacity-100 transition-all cursor-pointer shadow-sm"><X className="w-3.5 h-3.5" /></button>
                                            </div>
                                        ))}
                                        {uploadingRestaurantPhoto && <div className="aspect-square rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center"><Loader /></div>}
                                        {restaurantPhotos.length === 0 && !uploadingRestaurantPhoto && <div className="col-span-3 py-12 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">No photos uploaded</div>}
                                    </div>
                                </div>

                                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                                    <div className="flex items-center justify-between mb-6">
                                        <h3 className="font-black text-slate-800 flex items-center gap-2"><UploadCloud className="w-5 h-5 text-emerald-600" /> Menu Cards</h3>
                                        <label className="px-4 py-2 bg-emerald-50 text-emerald-600 text-xs font-black rounded-xl hover:bg-emerald-100 transition-colors cursor-pointer uppercase tracking-wider">
                                            Upload <input type="file" multiple accept="image/*" className="hidden" onChange={handleMenuPhotosUpload} disabled={uploadingMenuPhotos} />
                                        </label>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        {menuPhotos.map((photo, i) => (
                                            <div key={i} className="group relative aspect-square rounded-2xl overflow-hidden bg-slate-100 border border-slate-200">
                                                <img src={photo.url} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                                <button onClick={() => handleRemoveMenuPhoto(photo.url)} className="absolute top-2 right-2 p-1.5 bg-white/90 backdrop-blur text-rose-600 rounded-lg opacity-0 group-hover:opacity-100 transition-all cursor-pointer shadow-sm"><X className="w-3.5 h-3.5" /></button>
                                            </div>
                                        ))}
                                        {uploadingMenuPhotos && <div className="aspect-square rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center"><Loader /></div>}
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
