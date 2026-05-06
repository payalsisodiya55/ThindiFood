import { useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, ChevronDown } from "lucide-react"
import { Button } from "@food/components/ui/button"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { diningAPI, restaurantAPI } from "@food/api"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import Loader from "@food/components/Loader"
import { toast } from "sonner"
import { RED } from "@food/constants/color"

const BOOKING_DRAFT_KEY = "food_dining_booking_draft_v1"
const BOOKING_GUESTS_PREF_KEY = "food_dining_selected_guests_v1"
const MEAL_WINDOWS = {
  lunch: { start: 12 * 60, end: 16 * 60, label: "Lunch" },
  dinner: { start: 18 * 60, end: 26 * 60, label: "Dinner" },
}

const readStoredGuestCount = (slug) => {
  try {
    const raw = sessionStorage.getItem(BOOKING_GUESTS_PREF_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const savedSlug = String(parsed?.slug || "").trim()
    const currentSlug = String(slug || "").trim()
    if (savedSlug && currentSlug && savedSlug !== currentSlug) return null
    const count = Number(parsed?.guestCount)
    if (!Number.isInteger(count) || count < 1) return null
    return count
  } catch {
    return null
  }
}

const buildDates = (count = 7) =>
  Array.from({ length: count }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() + index)
    return date
  })

const formatTimeValue = (value) => {
  if (!value) return null
  if (/[ap]m/i.test(value)) return String(value).trim().toLowerCase()
  const date = new Date(`2000-01-01T${String(value).padStart(5, "0")}`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase()
}

const parseTimeToMinutes = (value) => {
  if (!value) return null
  const raw = String(value).trim()

  const hhmmMatch = raw.match(/^(\d{1,2}):(\d{2})$/)
  if (hhmmMatch) {
    const hour = Number(hhmmMatch[1])
    const minute = Number(hhmmMatch[2])
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return null
    }
    return hour * 60 + minute
  }

  const meridiemMatch = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i)
  if (!meridiemMatch) return null

  let hour = Number(meridiemMatch[1])
  const minute = Number(meridiemMatch[2] || 0)
  const meridiem = meridiemMatch[3].toUpperCase()

  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 1 || hour > 12 || minute < 0 || minute > 59) {
    return null
  }

  if (meridiem === "PM" && hour !== 12) hour += 12
  if (meridiem === "AM" && hour === 12) hour = 0

  return hour * 60 + minute
}

const formatMinutesToLabel = (minutes) => {
  const normalizedMinutes = ((minutes % (24 * 60)) + (24 * 60)) % (24 * 60)
  const hours = Math.floor(normalizedMinutes / 60)
  const mins = normalizedMinutes % 60
  return formatTimeValue(`${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`)
}

const getDayName = (date) => date.toLocaleDateString("en-US", { weekday: "long" })

const getDateKey = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const isSameCalendarDate = (left, right) => {
  if (!(left instanceof Date) || Number.isNaN(left.getTime())) return false
  if (!(right instanceof Date) || Number.isNaN(right.getTime())) return false
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

const buildSlotsForMeal = (timing, mealType, selectedDate) => {
  if (!timing || timing.isOpen === false) return []
  const opening = parseTimeToMinutes(timing.openingTime)
  const closing = parseTimeToMinutes(timing.closingTime)
  if (opening === null || closing === null) return []

  const mealWindow = MEAL_WINDOWS[mealType]
  if (!mealWindow) return []

  const dayEnd = closing > opening ? closing : closing + 24 * 60
  let slotStart = Math.max(opening, mealWindow.start)
  const slotEnd = Math.min(dayEnd, mealWindow.end)
  if (slotStart > slotEnd) return []

  const now = new Date()
  if (isSameCalendarDate(selectedDate, now)) {
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const nextAllowedMinutes = Math.ceil(currentMinutes / 30) * 30
    slotStart = Math.max(slotStart, nextAllowedMinutes)
  }

  if (slotStart > slotEnd) return []

  const slots = []
  let cursor = slotStart
  while (cursor <= slotEnd && slots.length < 48) {
    slots.push(formatMinutesToLabel(cursor))
    cursor += 30
  }

  return slots
}

const buildFallbackTiming = (restaurant) => {
  const openingTime = String(
    restaurant?.openingTime ||
      restaurant?.diningSettings?.openingTime ||
      "12:00",
  ).trim()
  const closingTime = String(
    restaurant?.closingTime ||
      restaurant?.diningSettings?.closingTime ||
      "23:00",
  ).trim()

  return {
    isOpen: true,
    openingTime,
    closingTime,
  }
}

const getOfferLabel = (mealType) => MEAL_WINDOWS[mealType]?.label || "Dining"

const getNoSlotsReason = ({ selectedMealPeriod, selectedDate, selectedDayTiming, slotsByMeal, availableSlotsByMeal, availabilityLoading }) => {
  if (availabilityLoading) {
    return `Checking ${selectedMealPeriod} availability...`
  }

  if (!selectedDayTiming || selectedDayTiming.isOpen === false) {
    return "Restaurant is closed on the selected date."
  }

  const totalMealSlots = slotsByMeal[selectedMealPeriod] || []
  const availableMealSlots = availableSlotsByMeal[selectedMealPeriod] || []

  if (availableMealSlots.length > 0) {
    return ""
  }

  if (totalMealSlots.length === 0) {
    if (isSameCalendarDate(selectedDate, new Date())) {
      return `${MEAL_WINDOWS[selectedMealPeriod]?.label || "Selected"} time is over for today. Please choose Dinner or another date.`
    }
    return `${MEAL_WINDOWS[selectedMealPeriod]?.label || "Selected"} timings are not available for this date.`
  }

  return `All ${MEAL_WINDOWS[selectedMealPeriod]?.label?.toLowerCase() || "selected"} slots are booked for this date. Please try another time or date.`
}

export default function TableBooking() {
  const { slug } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()

  const [restaurant, setRestaurant] = useState(location.state?.restaurant || null)
  const [loading, setLoading] = useState(!location.state?.restaurant)
  const [outletTimings, setOutletTimings] = useState({})
  const [selectedGuests, setSelectedGuests] = useState(() => {
    const fromRoute = Number(location.state?.guestCount)
    if (Number.isInteger(fromRoute) && fromRoute > 0) return fromRoute
    return readStoredGuestCount(slug) || 2
  })
  const [selectedDate, setSelectedDate] = useState(() => {
    const initial = location.state?.selectedDate ? new Date(location.state.selectedDate) : new Date()
    return Number.isNaN(initial.getTime()) ? new Date() : initial
  })
  const [selectedSlot, setSelectedSlot] = useState(location.state?.selectedTime || null)
  const [selectedMealPeriod, setSelectedMealPeriod] = useState("lunch")
  const [unavailableSlots, setUnavailableSlots] = useState([])
  const [availabilityLoading, setAvailabilityLoading] = useState(false)

  useEffect(() => {
    const fetchRestaurant = async () => {
      try {
        setLoading(true)
        const response = await diningAPI.getRestaurantBySlug(slug)
        if (response?.data?.success) {
          const apiRestaurant = response?.data?.data?.restaurant || response?.data?.data
          setRestaurant(apiRestaurant || null)

          const restaurantId = apiRestaurant?._id || apiRestaurant?.id || slug
          const timingsResponse = await restaurantAPI.getOutletTimingsByRestaurantId(restaurantId)
          setOutletTimings(timingsResponse?.data?.data?.outletTimings || {})
        }
      } catch {
        setRestaurant(null)
      } finally {
        setLoading(false)
      }
    }

    if (location.state?.restaurant) {
      const restaurantId = location.state.restaurant?._id || location.state.restaurant?.id || slug
      restaurantAPI
        .getOutletTimingsByRestaurantId(restaurantId)
        .then((response) => setOutletTimings(response?.data?.data?.outletTimings || {}))
        .catch(() => setOutletTimings({}))
      setLoading(false)
      return
    }

    fetchRestaurant()
  }, [location.state?.restaurant, slug])

  useEffect(() => {
    const fromRoute = Number(location.state?.guestCount)
    if (Number.isInteger(fromRoute) && fromRoute > 0) {
      setSelectedGuests(fromRoute)
      return
    }
    const fromStorage = readStoredGuestCount(slug)
    if (fromStorage) {
      setSelectedGuests(fromStorage)
    }
  }, [location.state?.guestCount, slug])

  useEffect(() => {
    try {
      const guestPrefPayload = {
        slug: slug || restaurant?.slug || "",
        guestCount: selectedGuests,
      }
      sessionStorage.setItem(BOOKING_GUESTS_PREF_KEY, JSON.stringify(guestPrefPayload))
    } catch {}
  }, [selectedGuests, slug, restaurant?.slug])

  const dates = useMemo(() => buildDates(7), [])
  const selectedDayTiming = useMemo(() => {
    const fromOutletTimings = outletTimings?.[getDayName(selectedDate)] || null
    if (fromOutletTimings && fromOutletTimings.isOpen !== false) {
      return fromOutletTimings
    }
    return buildFallbackTiming(restaurant)
  }, [outletTimings, selectedDate, restaurant])

  const slotsByMeal = useMemo(
    () => ({
      lunch: buildSlotsForMeal(selectedDayTiming, "lunch", selectedDate),
      dinner: buildSlotsForMeal(selectedDayTiming, "dinner", selectedDate),
    }),
    [selectedDayTiming, selectedDate]
  )

  const unavailableSlotSet = useMemo(
    () => new Set((Array.isArray(unavailableSlots) ? unavailableSlots : []).map((slot) => String(slot || "").trim().toLowerCase())),
    [unavailableSlots]
  )

  const availableSlotsByMeal = useMemo(
    () => ({
      lunch: (slotsByMeal.lunch || []).filter((slot) => !unavailableSlotSet.has(String(slot || "").trim().toLowerCase())),
      dinner: (slotsByMeal.dinner || []).filter((slot) => !unavailableSlotSet.has(String(slot || "").trim().toLowerCase())),
    }),
    [slotsByMeal, unavailableSlotSet]
  )

  const filteredSlots = availableSlotsByMeal[selectedMealPeriod] || []

  useEffect(() => {
    const restaurantId =
      restaurant?._id ||
      restaurant?.id ||
      restaurant?.restaurant?._id ||
      restaurant?.restaurant?.id ||
      null

    if (!restaurantId || !selectedDate) {
      setUnavailableSlots([])
      setAvailabilityLoading(false)
      return
    }

    let isActive = true
    setAvailabilityLoading(true)
    setUnavailableSlots([])

    diningAPI
      .getBookingAvailability(restaurantId, {
        date: getDateKey(selectedDate),
        guests: selectedGuests,
      })
      .then((response) => {
        if (!isActive) return
        const nextUnavailableSlots = response?.data?.data?.unavailableSlots
        setUnavailableSlots(Array.isArray(nextUnavailableSlots) ? nextUnavailableSlots : [])
      })
      .catch(() => {
        if (!isActive) return
        setUnavailableSlots([])
      })
      .finally(() => {
        if (isActive) {
          setAvailabilityLoading(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [restaurant, selectedDate, selectedGuests])

  useEffect(() => {
    if (!selectedSlot && filteredSlots.length > 0) {
      setSelectedSlot(filteredSlots[0])
      return
    }

    if (selectedSlot && filteredSlots.length > 0 && !filteredSlots.includes(selectedSlot)) {
      setSelectedSlot(filteredSlots[0])
      return
    }

    if (filteredSlots.length === 0) {
      setSelectedSlot(null)
    }
  }, [filteredSlots, selectedSlot])

  if (loading) return <Loader />
  if (!restaurant) return <div className="p-6 text-center">Restaurant not found</div>

  const isDiningEnabled = restaurant?.diningSettings?.isEnabled !== false
  const canProceed = Boolean(isDiningEnabled && !availabilityLoading && restaurant && selectedSlot && selectedDate && selectedGuests)
  const noSlotsReason = getNoSlotsReason({
    selectedMealPeriod,
    selectedDate,
    selectedDayTiming,
    slotsByMeal,
    availableSlotsByMeal,
    availabilityLoading,
  })

  const handleProceed = () => {
    if (!isDiningEnabled) {
      toast.error("Dining bookings are currently paused for this restaurant.")
      return
    }
    if (!canProceed) {
      toast.error("Please select date, time, and guests to continue.")
      return
    }

    const bookingDraft = {
      restaurant: {
        _id: restaurant?._id || restaurant?.id || restaurant?.restaurant?._id || restaurant?.restaurant?.id || null,
        id: restaurant?.id || restaurant?._id || restaurant?.restaurant?.id || restaurant?.restaurant?._id || null,
        name: restaurant?.name || restaurant?.restaurantName || "Restaurant",
        restaurantName: restaurant?.restaurantName || restaurant?.name || "Restaurant",
        profileImage: restaurant?.profileImage || restaurant?.restaurant?.profileImage || null,
        image: restaurant?.image || restaurant?.restaurant?.image || restaurant?.profileImage?.url || "",
        location: restaurant?.location || restaurant?.restaurant?.location || null,
        slug: restaurant?.slug || slug || "",
        diningSettings: restaurant?.diningSettings || restaurant?.restaurant?.diningSettings || null,
      },
      guests: selectedGuests,
      date: selectedDate,
      timeSlot: selectedSlot,
      mealType: selectedMealPeriod,
      discount: selectedSlot,
    }

    try {
      sessionStorage.setItem(BOOKING_DRAFT_KEY, JSON.stringify(bookingDraft))
    } catch {}

    navigate("/food/user/dining/book-confirmation", { state: bookingDraft })
  }

  return (
    <AnimatedPage className="min-h-screen bg-[#f5f6fb] pb-40">
      <div className="relative overflow-hidden px-4 pb-10 pt-5" style={{ background: `linear-gradient(to b, ${RED}20, ${RED}10, #f5f6fb)` }}>
        <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.65),transparent_65%)]" />

        <div className="relative z-10">
          <button
            onClick={goBack}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#383838] shadow-sm"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="mt-6 text-center">
            <h1 className="text-[30px] font-black tracking-tight text-[#25314a]">Book a table</h1>
            <p className="mt-1 text-sm font-medium text-[#636363]">{restaurant.name || restaurant.restaurantName}</p>
          </div>
        </div>
      </div>

      <div className="mx-auto -mt-4 max-w-md space-y-4 px-4">
        {!isDiningEnabled && (
          <section className="rounded-[22px] border border-red-200 bg-red-50 px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <p className="text-sm font-semibold text-red-900">Dining bookings are paused by this restaurant.</p>
            <p className="mt-1 text-xs text-red-800">You can still view details, but new table bookings are disabled right now.</p>
          </section>
        )}

        <section className="rounded-[22px] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-[#2f3545]">Select number of guests</span>
            <div className="relative">
              <select
                value={selectedGuests}
                onChange={(event) => setSelectedGuests(parseInt(event.target.value, 10))}
                className="appearance-none rounded-full bg-[#f7f7fb] py-2 pl-4 pr-9 text-sm font-semibold text-[#404040] outline-none"
              >
                {Array.from({ length: restaurant.diningSettings?.maxGuests || 10 }, (_, index) => index + 1).map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#808080]" />
            </div>
          </div>
        </section>

        <section className="rounded-[22px] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          <h3 className="text-sm font-medium text-[#2f3545]">Select date</h3>

          <div className="mt-4 grid grid-cols-3 gap-3">
            {dates.slice(0, 3).map((date, index) => {
              const active = selectedDate.toDateString() === date.toDateString()
              return (
                <button
                  key={date.toISOString()}
                  onClick={() => setSelectedDate(date)}
                  className={`rounded-[18px] border px-3 py-4 text-center transition-colors ${
                    active
                      ? "bg-red-50"
                      : "border-[#ececf2] bg-white"
                  }`}
                  style={active ? { borderColor: RED } : {}}
                >
                  <span className="block text-sm font-medium text-[#444b5f]">
                    {index === 0 ? "Today" : index === 1 ? "Tomorrow" : date.toLocaleDateString("en-IN", { weekday: "long" })}
                  </span>
                  <span className="mt-1 block text-sm text-[#7b8191]">
                    {date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="rounded-[22px] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          <h3 className="text-sm font-medium text-[#2f3545]">Select time of day</h3>

          <div className="mt-4 flex gap-2">
            {[
              { id: "lunch", label: "Lunch" },
              { id: "dinner", label: "Dinner" },
            ].map((period) => {
              const active = selectedMealPeriod === period.id
              return (
                <button
                  key={period.id}
                  onClick={() => setSelectedMealPeriod(period.id)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-white"
                      : "border-[#ececf2] bg-[#fafafc] text-[#666f82]"
                  }`}
                  style={active ? { borderColor: RED, color: RED } : {}}
                >
                  {period.label}
                </button>
              )
            })}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            {availabilityLoading ? (
              <div className="col-span-3 rounded-[18px] border border-dashed border-[#e5e7ef] px-4 py-8 text-center text-sm text-[#7c8394]">
                Loading available slots...
              </div>
            ) : filteredSlots.length === 0 ? (
              <div className="col-span-3 rounded-[18px] border border-dashed border-[#e5e7ef] px-4 py-8 text-center text-sm text-[#7c8394]">
                {noSlotsReason || `No ${selectedMealPeriod} slots available for the selected date.`}
              </div>
            ) : (
              filteredSlots.map((slot) => {
                const active = selectedSlot === slot
                return (
                  <button
                    key={slot}
                    onClick={() => setSelectedSlot(slot)}
                    className={`rounded-[16px] border px-3 py-4 text-center transition-colors ${
                      active
                        ? "bg-red-50"
                        : "border-[#ececf2] bg-white"
                    }`}
                    style={active ? { borderColor: RED } : {}}
                  >
                    <span className="block text-sm font-medium text-[#334155]">{slot}</span>
                    <span className="mt-1 block text-xs font-medium" style={{ color: RED }}>
                      {getOfferLabel(selectedMealPeriod)}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </section>

        <section className="rounded-[18px] bg-white px-4 py-5 text-center shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
          <p className="text-sm text-[#6f7687]">
            Select your preferred time slot to view available booking options
          </p>
        </section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-[70] border-t border-[#e6e7ef] bg-[#f5f6fb]/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
        <div className="mx-auto max-w-md">
          <Button
            disabled={!canProceed}
            onClick={handleProceed}
            className={`h-14 w-full rounded-2xl text-lg font-bold transition-colors ${
              canProceed
                ? "text-white opacity-100 hover:opacity-90"
                : "bg-gray-300 text-white/95"
            }`}
            style={canProceed ? { backgroundColor: RED } : {}}
          >
            {!isDiningEnabled
              ? "Dining paused"
              : canProceed
                ? "Proceed to confirmation"
                : "Select a time slot to proceed"}
          </Button>
        </div>
      </div>
    </AnimatedPage>
  )
}
