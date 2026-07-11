import { useEffect, useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router-dom"
import { diningAPI, restaurantAPI } from "@food/api"
import { useProfile } from "@food/context/ProfileContext"
import { isModuleAuthenticated } from "@food/utils/auth"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import { RED } from "@food/constants/color"
import {
    ArrowLeft,
  Bookmark,
  CheckCircle2,
  IndianRupee,
  Loader2,
  MapPin,
  Percent,
  Share2,
  Ticket,
  UtensilsCrossed,
  X,
} from "lucide-react"
import { Button } from "@food/components/ui/button"
import { toast } from "sonner"
import { getRestaurantAvailabilityStatus } from "@food/utils/restaurantAvailability"

const BOOKING_GUESTS_PREF_KEY = "food_dining_selected_guests_v1"
const DINING_MEAL_LABELS = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
}

const normalizeDiningMealTypes = (mealTypes, isEnabled = true) => {
  if (isEnabled !== true) return []
  const normalized = Array.from(
    new Set(
      (Array.isArray(mealTypes) ? mealTypes : [mealTypes])
        .map((value) => String(value || "").trim().toLowerCase())
        .filter((value) => Object.prototype.hasOwnProperty.call(DINING_MEAL_LABELS, value))
    )
  )
  return normalized.length > 0 ? normalized : ["lunch", "dinner"]
}

const formatAddress = (restaurant) =>
  restaurant?.location?.formattedAddress ||
  restaurant?.location?.addressLine1 ||
  restaurant?.location?.address ||
  [restaurant?.location?.area || restaurant?.area, restaurant?.location?.city || restaurant?.city]
    .filter(Boolean)
    .join(", ")

const buildImageList = (restaurant) => {
  const candidates = [
    restaurant?.coverImage?.url,
    restaurant?.coverImage,
    ...(Array.isArray(restaurant?.coverImages) ? restaurant.coverImages.map((image) => image?.url || image) : []),
    // removed menuImages
    restaurant?.profileImage?.url,
    restaurant?.profileImage,
  ]
  return candidates
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
}

const normalizeImageEntries = (entries) =>
  (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      if (typeof entry === "string") return entry.trim()
      return String(entry?.url || "").trim()
    })
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)

const buildFacilities = (restaurant) => {
  const facilities = []
  const diningMeals = normalizeDiningMealTypes(
    restaurant?.diningSettings?.mealTypes,
    restaurant?.diningSettings?.isEnabled !== false
  )

  diningMeals.forEach((mealType) => {
    facilities.push(DINING_MEAL_LABELS[mealType])
  })
  if (restaurant?.diningSettings?.homeDeliveryAvailable || restaurant?.homeDeliveryAvailable) facilities.push("Home delivery")
  if (restaurant?.diningSettings?.takeawayAvailable || restaurant?.takeawayAvailable) facilities.push("Takeaway available")
  if (restaurant?.diningSettings?.vegOnly || restaurant?.vegOnly) facilities.push("Vegetarian only")
  if (restaurant?.diningSettings?.lessNoisy || restaurant?.ambience === "quiet") facilities.push("Less noisy")

  return facilities.length > 0
    ? facilities
    : ["Lunch", "Dinner", "Home delivery", "Takeaway available", "Vegetarian only", "Less noisy"]
}

const formatTimeLabel = (value) => {
  if (!value) return null
  if (/[ap]m/i.test(value)) return value.toUpperCase()
  const date = new Date(`2000-01-01T${String(value).padStart(5, "0")}`)
  if (Number.isNaN(date.getTime())) return value
  const formatted = date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })
  return formatted ? formatted.toUpperCase() : value
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

const getTodayOutletTiming = (outletTimings) => {
  const todayName = DAY_NAMES[new Date().getDay()]
  if (!todayName || !outletTimings || typeof outletTimings !== "object") {
    return { dayName: todayName, timing: null }
  }

  return {
    dayName: todayName,
    timing: outletTimings[todayName] && typeof outletTimings[todayName] === "object" ? outletTimings[todayName] : null,
  }
}

const isRestaurantOpenForTiming = (timing) => {
  if (!timing || timing.isOpen === false) return false
  const openingTime = String(timing.openingTime || "").trim()
  const closingTime = String(timing.closingTime || "").trim()
  if (!openingTime || !closingTime) return false

  const now = new Date()
  const [openingHour, openingMinute] = openingTime.split(":").map(Number)
  const [closingHour, closingMinute] = closingTime.split(":").map(Number)

  if (
    [openingHour, openingMinute, closingHour, closingMinute].some((value) => !Number.isFinite(value))
  ) {
    return false
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const openingMinutes = openingHour * 60 + openingMinute
  const closingMinutes = closingHour * 60 + closingMinute

  if (closingMinutes >= openingMinutes) {
    return currentMinutes >= openingMinutes && currentMinutes <= closingMinutes
  }

  return currentMinutes >= openingMinutes || currentMinutes <= closingMinutes
}

const scrollToSection = (id) => {
  const element = document.getElementById(id)
  if (element) {
    element.scrollIntoView({ behavior: "smooth", block: "start" })
  }
}

const getOfferHeadline = (offer) => {
  if (!offer) return ""
  const discountType = String(offer.discountType || "").toLowerCase()
  const discountValue = Number(offer.discountValue || 0)
  if (discountType === "flat") return `Flat ${"\u20B9"}${discountValue} OFF`
  return `${discountValue}% OFF`
}

const getRestaurantFromResponse = (response) =>
  response?.data?.data?.restaurant ||
  response?.data?.restaurant ||
  response?.data?.data ||
  null

const isMongoObjectId = (value) => /^[a-f\d]{24}$/i.test(String(value || "").trim())

const normalizeRestaurantLookupValue = (value) => String(value || "").trim()

const shouldTryDirectRestaurantLookup = (value) => {
  const normalized = normalizeRestaurantLookupValue(value)
  if (!normalized) return false
  if (isMongoObjectId(normalized)) return true
  return !/\s/.test(normalized)
}

const slugifyRestaurantValue = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")

export default function DiningRestaurantDetails() {
  const { diningType, slug } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const { addFavorite, removeFavorite, isFavorite } = useProfile()

  const [restaurant, setRestaurant] = useState(location.state?.restaurant || null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedGuests, setSelectedGuests] = useState(2)
  const [isBookingSheetOpen, setIsBookingSheetOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("prebook")
  const [diningOffer, setDiningOffer] = useState(null)
  const [outletTimings, setOutletTimings] = useState(location.state?.restaurant?.outletTimings || null)

  useEffect(() => {
    const fetchRestaurantData = async () => {
      try {
        setLoading(true)
        setError(null)

        const routeRestaurant = location.state?.restaurant || null
        const preferredRestaurantLookup =
          routeRestaurant?._id ||
          routeRestaurant?.restaurantId ||
          routeRestaurant?.id ||
          slug

        let resolvedRestaurant =
          routeRestaurant && (routeRestaurant?._id || routeRestaurant?.restaurantId || routeRestaurant?.id)
            ? routeRestaurant
            : null

        if (!resolvedRestaurant && shouldTryDirectRestaurantLookup(preferredRestaurantLookup)) {
          try {
            const normalizedLookup = normalizeRestaurantLookupValue(preferredRestaurantLookup).replace(/\s+/g, "-")
            const restaurantResponse = await restaurantAPI.getRestaurantById(normalizedLookup)
            if (restaurantResponse?.data?.success) {
              resolvedRestaurant = getRestaurantFromResponse(restaurantResponse)
            }
          } catch {}
        }

        if (!resolvedRestaurant && slug) {
          const normalizedSlug = String(slug).trim().toLowerCase()
          const normalizedSlugWithHyphen = slugifyRestaurantValue(normalizedSlug)
          const diningSearchResponse = await diningAPI
            .getRestaurants(diningType ? { category: diningType } : {})
            .catch(() => null)
          const diningRestaurants = Array.isArray(diningSearchResponse?.data?.data) ? diningSearchResponse.data.data : []

          const matchedDiningRestaurant = diningRestaurants.find((item) => {
            const itemSlug = slugifyRestaurantValue(item?.restaurantNameNormalized || item?.slug || "")
            const itemNameSlug = slugifyRestaurantValue(item?.restaurantName || item?.name || "")
            return (
              itemSlug === normalizedSlugWithHyphen ||
              itemNameSlug === normalizedSlugWithHyphen ||
              itemSlug === normalizedSlug ||
              itemNameSlug === normalizedSlug
            )
          })

          if (matchedDiningRestaurant) {
            resolvedRestaurant = matchedDiningRestaurant
          }

          const searchVariants = [{ limit: 100, _ts: Date.now() }]

          for (const searchParams of resolvedRestaurant ? [] : searchVariants) {
            const searchResponse = await restaurantAPI.getRestaurants(searchParams, { noCache: true }).catch(() => null)
            const restaurants = searchResponse?.data?.data?.restaurants || searchResponse?.data?.data || []

            const matchingRestaurant = restaurants.find((item) => {
              const itemSlug = slugifyRestaurantValue(item?.slug || "")
              const itemName = String(item?.name || item?.restaurantName || "").trim().toLowerCase()
              const itemNameSlug = slugifyRestaurantValue(itemName)

              return (
                itemSlug === normalizedSlug ||
                itemSlug === normalizedSlugWithHyphen ||
                itemName === normalizedSlug ||
                itemNameSlug === normalizedSlug ||
                itemNameSlug === normalizedSlugWithHyphen
              )
            })

            if (!matchingRestaurant) continue

            const lookupId =
              matchingRestaurant?._id ||
              matchingRestaurant?.restaurantId ||
              matchingRestaurant?.id

            if (!lookupId) {
              resolvedRestaurant = matchingRestaurant
              break
            }

            const fullRestaurantResponse = await restaurantAPI.getRestaurantById(lookupId).catch(() => null)
            const fullRestaurant = getRestaurantFromResponse(fullRestaurantResponse)
            resolvedRestaurant = fullRestaurant || matchingRestaurant
            if (resolvedRestaurant) break
          }
        }

        if (!resolvedRestaurant) {
          setError("Restaurant not found")
          setRestaurant(null)
          return
        }

        const restaurantId = resolvedRestaurant?._id || resolvedRestaurant?.id || slug
        const offerResponse = await diningAPI.getRestaurantOverallOffer(restaurantId).catch(() => null)
        const resolvedOffer =
          offerResponse?.data?.data?.offer ||
          offerResponse?.data?.offer ||
          null

        const outletTimingResponse = await restaurantAPI.getOutletTimingsByRestaurantId(restaurantId, { noCache: true }).catch(() => null)
        const resolvedOutletTimings =
          outletTimingResponse?.data?.data?.outletTimings ||
          outletTimingResponse?.data?.outletTimings ||
          resolvedRestaurant?.outletTimings ||
          null

        setRestaurant(resolvedRestaurant)
        setDiningOffer(resolvedOffer)
        setOutletTimings(resolvedOutletTimings)
      } catch {
        setError("Failed to load restaurant")
        setRestaurant(null)
        setDiningOffer(null)
        setOutletTimings(null)
      } finally {
        setLoading(false)
      }
    }

    fetchRestaurantData()
  }, [diningType, location.state?.restaurant, slug])

  useEffect(() => {
    const maxGuestCount = Math.max(1, Number(restaurant?.diningSettings?.maxGuests) || 6)
    if (selectedGuests > maxGuestCount) {
      setSelectedGuests(maxGuestCount)
    }
  }, [restaurant, selectedGuests])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f7fb] dark:bg-[#0a0a0a]">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: RED }} />
      </div>
    )
  }

  if (error || !restaurant) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#f6f7fb] dark:bg-[#0a0a0a] px-4 text-center">
        <h2 className="text-2xl font-bold text-[#23180f] dark:text-white">Restaurant not found</h2>
        <Button onClick={goBack} variant="outline" style={{ borderColor: RED, color: RED }}>
          Go Back
        </Button>
      </div>
    )
  }

  const restaurantName = restaurant.name || restaurant.restaurantName || "Restaurant"
  const address = formatAddress(restaurant) || "Address unavailable"
  const imageGallery = buildImageList(restaurant)
  const heroImage = imageGallery[0] || ""
  const rawMenuImages = normalizeImageEntries(restaurant?.menuImages)
  const restaurantPhotos = normalizeImageEntries(restaurant?.coverImages)
  const menuPreviewImages = rawMenuImages.length > 0 ? rawMenuImages : []
  const cuisines =
    Array.isArray(restaurant?.cuisines) && restaurant.cuisines.length > 0
      ? restaurant.cuisines.join(", ")
      : ""
  const costForTwo = restaurant?.costForTwo ? `${"\u20B9"}${restaurant.costForTwo} for two` : ""
  const facilities = buildFacilities(restaurant)
  const rating = Number(restaurant?.rating || restaurant?.avgRating || 0).toFixed(1)
  const reviewCount = restaurant?.totalRatings || restaurant?.reviewCount || restaurant?.reviewsCount || 0
  const { timing: todayOutletTiming } = getTodayOutletTiming(outletTimings)
  const openingTime = formatTimeLabel(todayOutletTiming?.openingTime || restaurant?.openingTime || restaurant?.diningSettings?.openingTime || "")
  const closingTime = formatTimeLabel(todayOutletTiming?.closingTime || restaurant?.closingTime || restaurant?.diningSettings?.closingTime || "")
  const availabilityStatus = getRestaurantAvailabilityStatus(
    {
      ...restaurant,
      outletTimings,
    },
    new Date(),
  )
  const isOpenNow = availabilityStatus.isOpen === true
  const timingLabel =
    todayOutletTiming?.isOpen === false
      ? "Closed today"
      : openingTime && closingTime
        ? `${openingTime} to ${closingTime}`
        : "Timing unavailable"
  const isDiningEnabled = restaurant?.diningSettings?.isEnabled !== false
  const isDiningAvailable = isDiningEnabled && isOpenNow
  const maxGuestCount = Math.max(1, Number(restaurant?.diningSettings?.maxGuests) || 6)
  const offerHeadline = getOfferHeadline(diningOffer)
  const offerDescription = String(diningOffer?.description || "").trim()
  const offerMinBillAmount = Number(diningOffer?.minBillAmount || 0)
  const topTabs = [
    { id: "prebook", label: "Pre-Book Offers", target: "restaurant-prebook" },
    { id: "walkin", label: "Walk-In Offers", target: "restaurant-prebook" },
    { id: "menu", label: "Menu", target: "restaurant-menu" },
    { id: "photos", label: "Photos", target: "restaurant-photos" },
    { id: "about", label: "About The Restaurant", target: "restaurant-about" },
  ]

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: restaurantName,
          text: `Check out ${restaurantName}`,
          url: window.location.href,
        })
      }
    } catch {}
  }

  const restaurantFavoriteSlug =
    restaurant?.restaurantNameNormalized ||
    restaurant?.slug ||
    slug

  const favorite = isFavorite(restaurantFavoriteSlug)

  const handleBack = () => {
    if (window.history.length > 1) {
      goBack()
      return
    }

    if (diningType) {
      navigate(`/food/user/dining/${diningType}`)
      return
    }

    navigate("/food/user/dining")
  }

  const handleToggleFavorite = () => {
    if (favorite) {
      removeFavorite(restaurantFavoriteSlug)
      return
    }

    addFavorite({
      slug: restaurantFavoriteSlug,
      name: restaurantName,
      cuisine: cuisines,
      rating,
      image: heroImage,
    })
  }

  const handleContinueBooking = () => {
    if (!isDiningAvailable) return
    setIsBookingSheetOpen(false)

    try {
      const guestPrefPayload = {
        slug: slug || restaurant?.slug || "",
        guestCount: selectedGuests,
      }
      sessionStorage.setItem(BOOKING_GUESTS_PREF_KEY, JSON.stringify(guestPrefPayload))
    } catch {}

    navigate(`/food/user/dining/book/${slug}`, {
      state: {
        guestCount: selectedGuests,
        restaurant,
      },
    })
  }

  const handleOpenBookingSheet = () => {
    if (!isDiningAvailable) {
      toast.error(
        !isDiningEnabled
          ? "Dining is paused for this restaurant."
          : "Restaurant is currently closed or offline.",
      )
      return
    }

    if (!isModuleAuthenticated("user")) {
      toast.error("Please login to book your seat.")
      const nextPath = `${window.location.pathname}${window.location.search || ""}`
      navigate(`/user/auth/login?next=${encodeURIComponent(nextPath)}`, {
        state: { from: nextPath },
      })
      return
    }

    setIsBookingSheetOpen(true)
  }

  return (
    <div className="min-h-screen bg-[#f6f7fb] dark:bg-[#0a0a0a] pb-28">
      <section className="mx-auto max-w-md md:max-w-5xl bg-[#f6f7fb] dark:bg-[#0a0a0a]">
        <div className="relative h-[392px] overflow-hidden">
          {heroImage ? (
            <img src={heroImage} alt={restaurantName} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-[radial-gradient(circle_at_top,#eadcc7,#a09279_58%,#655749)]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/78 via-black/18 to-black/0" />

          <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-3 pt-3">
            <button
              onClick={handleBack}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#51586a]/75 text-white backdrop-blur-md"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleFavorite}
                className={`flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-md transition-colors ${
                  favorite
                    ? "bg-[#e2281b] text-white"
                    : "bg-[#51586a]/75 text-white"
                }`}
              >
                <Bookmark className={`h-4 w-4 ${favorite ? "fill-white" : ""}`} />
              </button>
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 px-3 pb-4 text-white">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="text-[32px] md:text-[36px] font-black leading-tight tracking-[-0.03em] break-all line-clamp-2">{restaurantName}</h1>
                <p className="mt-2 max-w-[94%] text-[14px] leading-5 text-white/92 break-words">{address}</p>
                <p className={`mt-2 text-[14px] text-white/90 ${!(costForTwo || cuisines) ? "hidden" : ""}`}>
                  {costForTwo}
                  <span className="mx-1.5 text-white/65">•</span>
                  {cuisines}
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-black/28 px-2.5 py-1 text-[13px] font-semibold backdrop-blur-sm whitespace-nowrap overflow-hidden max-w-full">
                  <CheckCircle2 className="h-4 w-4 text-[#48d597] shrink-0" />
                  <span className="shrink-0">{isOpenNow ? "OPEN" : "CLOSED"}</span>
                  <span className="text-white/70 shrink-0">|</span>
                  <span className="shrink-0">{timingLabel}</span>
                </div>
              </div>

              <div className="mb-1 shrink-0 rounded-[18px] bg-white dark:bg-[#1a1a1a] px-3 py-2 text-center text-[#1f2328] dark:text-white shadow-xl">
                <div className="flex items-center justify-center gap-1 text-[31px] font-black leading-none">
                  <span>{rating}</span>
                  <span className="text-[18px] text-[#18b54f]">★</span>
                </div>
                <div className="mt-1 flex items-center justify-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-[#18b54f]">
                  <UtensilsCrossed className="h-3 w-3" />
                  Dining
                </div>
                <p className="mt-1 text-[13px] leading-4 text-[#6e7481] dark:text-[#a0a5b1]">{reviewCount} Reviews</p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-3 pb-1 pt-3">
          <div className="grid grid-cols-1 gap-2.5">
            <button
              onClick={handleOpenBookingSheet}
              disabled={!isDiningAvailable}
              className={`flex h-[52px] items-center justify-center gap-2 rounded-full border text-[16px] font-bold transition-all active:scale-[0.98] ${
                isDiningAvailable
                  ? "border-[#e2281b]/35 bg-[#e2281b]/6 hover:bg-[#e2281b]/12 text-[#e2281b] shadow-[0_8px_24px_rgba(226,40,27,0.06)]"
                  : "cursor-not-allowed border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-[#1a1a1a] text-gray-400 dark:text-gray-600"
              }`}
            >
              <UtensilsCrossed className="h-[16px] w-[16px]" style={{ color: isDiningAvailable ? '#e2281b' : undefined }} />
              <span>{isDiningAvailable ? "Book a Table" : isDiningEnabled ? "Closed" : "Dining paused"}</span>
            </button>
          </div>

          {!isDiningAvailable && (
            <div className="mt-3 rounded-[18px] border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-800 dark:text-red-300">
              {isDiningEnabled
                ? "This restaurant is currently closed or offline. Dining bookings are unavailable right now."
                : "Dining bookings are currently turned off by the restaurant."}
            </div>
          )}

          {diningOffer && (
            <div className="mt-4 overflow-hidden rounded-[18px] px-4 py-4 shadow-[0_8px_24px_rgba(226,40,27,0.12)] dark:border dark:border-red-950/50" style={{ background: `linear-gradient(180deg, ${RED}15, ${RED}05)` }}>
              <div className="flex items-center justify-between gap-3">
                <div className="rounded-full bg-red-100 dark:bg-red-950/40 p-2 text-red-600 dark:text-red-400">
                  <Percent className="h-5 w-5" />
                </div>
                <div className="flex-1 text-center">
                  <p className="text-[33px] font-black leading-none tracking-[-0.04em] text-red-900 dark:text-red-300">{offerHeadline}</p>
                  <p className="mt-1 text-[14px] font-medium text-red-800 dark:text-red-400">
                    {offerDescription || (offerMinBillAmount > 0 ? `on bills above ${"\u20B9"}${offerMinBillAmount}` : "on your dining bill")}
                  </p>
                </div>
                <div className="rounded-full bg-red-100 dark:bg-red-950/40 p-2 text-red-600 dark:text-red-400">
                  <Percent className="h-5 w-5" />
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="sticky top-0 z-30 border-b border-[#ececf3] dark:border-[#222222] bg-white/95 dark:bg-[#0a0a0a]/95 backdrop-blur-xl">
        <div className="mx-auto max-w-md md:max-w-5xl px-3 pb-3 pt-3">
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {topTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id)
                  scrollToSection(tab.target)
                }}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm transition-colors ${
                  activeTab === tab.id
                    ? "bg-white dark:bg-[#1a1a1a] text-[#2a2018] dark:text-white"
                    : "border-[#ece9e1] dark:border-[#222222] bg-[#fafafa] dark:bg-[#151515] text-[#8b8881] dark:text-[#a0a0a0]"
                }`}
                style={activeTab === tab.id ? { borderColor: RED } : {}}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-md md:max-w-5xl px-4 pt-4">
        <section id="restaurant-prebook">
          <div>
            <h2 className="text-[29px] font-black leading-none text-[#23180f] dark:text-white">Pre-Book Offers</h2>
            <p className="mt-1 text-[15px]" style={{ color: RED }}>Limited slots with extra offers</p>
          </div>

          {diningOffer ? (
            <div className="mt-3 overflow-hidden rounded-[18px] text-white shadow-[0_10px_26px_rgba(226,40,27,0.2)]" style={{ background: `linear-gradient(135deg, ${RED}, #b31d14)` }}>
              <div className="flex items-start justify-between px-4 pb-3 pt-4">
                <div>
                  <p className="text-[28px] font-black leading-none">{offerHeadline}</p>
                  <p className="mt-2 text-[14px] text-white/80">{offerDescription || diningOffer?.title || "Dining offer"}</p>
                </div>
                <button
                  onClick={handleOpenBookingSheet}
                  disabled={!isDiningAvailable}
                  className="rounded-full bg-black/45 px-4 py-2 text-[13px] font-semibold text-white backdrop-blur-sm disabled:opacity-60"
                >
                  Book now
                </button>
              </div>
              <div className="border-t border-white/10 px-4 py-2 text-center text-[12px] text-white/75">
                {offerMinBillAmount > 0 ? `Valid on bills above ${"\u20B9"}${offerMinBillAmount}` : "Valid on your dining bill"}
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-[18px] border border-[#efe4dc] dark:border-[#222222] bg-white dark:bg-[#1a1a1a] px-4 py-4 text-[14px] text-[#7f6f63] dark:text-[#a0a0a0]">
              No active dining offers right now.
            </div>
          )}
        </section>

        <section id="restaurant-menu" className="mt-5 border-t border-[#e8e8ef] dark:border-[#222222] pt-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-[28px] font-black leading-none text-[#23180f] dark:text-white">Menu</h2>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {(menuPreviewImages.length > 0 ? menuPreviewImages.slice(0, 8) : [""]).map((image, index) => (
              <div key={`${image || "menu-placeholder"}-${index}`} className="overflow-hidden rounded-[18px] border border-[#ede8dd] dark:border-[#222222] bg-white dark:bg-[#1a1a1a]">
                <div className="aspect-[0.88] bg-[#f7f1e7] dark:bg-[#202020]">
                  {image ? (
                    <img src={image} alt={`${restaurantName} menu ${index + 1}`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,#fff3e0,#f3eadf)] dark:bg-none text-sm font-medium text-[#a28868] dark:text-[#8a7050]">
                      Menu preview
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="restaurant-photos" className="mt-5 border-t border-[#e8e8ef] dark:border-[#222222] pt-4">
          <h2 className="text-[28px] font-black leading-none text-[#23180f] dark:text-white">Photos</h2>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {(restaurantPhotos.length > 0 ? restaurantPhotos.slice(0, 8) : [""]).map((image, index) => (
              <div
                key={`${image || "placeholder"}-${index}`}
                className={`overflow-hidden rounded-[18px] bg-[#f6efe4] dark:bg-[#222222] ${
                  index === 0 ? "col-span-2 md:col-span-1 aspect-[1.72] md:aspect-[1.08]" : "aspect-[1.08]"
                }`}
              >
                {image ? (
                  <img src={image} alt={`${restaurantName} ${index + 1}`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-[#a28868] dark:text-[#8a7050]">Photo coming soon</div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section id="restaurant-about" className="mt-5 border-t border-[#e8e8ef] dark:border-[#222222] pt-4">
          <h2 className="text-[28px] font-black leading-none text-[#23180f] dark:text-white">About The Restaurant</h2>

          <div className="mt-4 rounded-[18px] border border-[#ececf4] dark:border-[#222222] bg-[#fafbff] dark:bg-[#121212] p-4">
            <div className="space-y-4 text-[14px] text-[#5f6474] dark:text-[#a0a5b8]">
              {costForTwo ? (
                <div className="flex items-start gap-3">
                  <IndianRupee className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <p>{costForTwo}</p>
                </div>
              ) : null}

              {cuisines ? (
                <div className="flex items-start gap-3">
                  <div className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-[#8a8f9d] dark:bg-[#5a5f6d]" />
                  <p>{cuisines}</p>
                </div>
              ) : null}

              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{ color: RED }} />
                <p>{address}</p>
              </div>
            </div>



            <div className="mt-5 border-t border-[#e8e8ef] dark:border-[#222222] pt-4">
              <h3 className="text-[20px] font-semibold text-[#23180f] dark:text-white">Facilities</h3>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                {facilities.slice(0, 6).map((facility) => (
                  <div key={facility} className="flex items-center gap-2 text-[14px] text-[#5f6474] dark:text-[#a0a5b8] font-sans font-normal">
                    <span className="inline-block h-[7px] w-[7px] rounded-full border border-[#8a8f9d] dark:border-[#5a5f6d]" />
                    <span>{facility}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#ebe5da] dark:border-[#222222] bg-white/95 dark:bg-[#0a0a0a]/95 p-4 backdrop-blur-xl">
        <div className="mx-auto max-w-md md:max-w-5xl">
          <Button
            onClick={handleOpenBookingSheet}
            disabled={!isDiningAvailable}
            className={`h-12 w-full rounded-2xl border text-[17px] font-bold transition-all active:scale-[0.98] ${
              isDiningAvailable
                ? "border-[#e2281b]/35 bg-[#e2281b]/6 hover:bg-[#e2281b]/12 text-[#e2281b]"
                : "cursor-not-allowed border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-[#1a1a1a] text-gray-400 dark:text-gray-600"
            }`}
          >
            {isDiningAvailable ? "Book a Table" : isDiningEnabled ? "Closed" : "Dining paused"}
          </Button>
        </div>
      </div>

      {isBookingSheetOpen && (
        <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center">
          <button
            aria-label="Close booking sheet"
            className="absolute inset-0 bg-black/35"
            onClick={() => setIsBookingSheetOpen(false)}
          />

          <div className="relative w-full max-w-md rounded-t-[28px] md:rounded-[28px] bg-white dark:bg-[#1a1a1a] px-4 pb-6 pt-4 shadow-[0_-20px_60px_rgba(15,23,42,0.18)] md:shadow-[0_20px_60px_rgba(15,23,42,0.25)] z-50 md:mx-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-black text-[#23180f] dark:text-white">Select number of guests</h3>
                <p className="mt-1 text-sm text-[#7b6651] dark:text-[#a09080]">Choose how many people will be joining.</p>
              </div>
              <button
                onClick={() => setIsBookingSheetOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f5f5f5] dark:bg-[#2b2b2b] text-[#5b5b5b] dark:text-[#a0a0a0]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-3">
              {Array.from({ length: maxGuestCount }, (_, index) => index + 1).map((count) => (
                <button
                  key={`sheet-${count}`}
                  onClick={() => setSelectedGuests(count)}
                  className={`rounded-2xl border px-3 py-4 text-sm font-bold transition-colors ${
                    selectedGuests === count
                      ? "bg-red-50 dark:bg-[#2d1215]"
                      : "border-[#ece7de] dark:border-[#2b2b2b] bg-white dark:bg-[#252525] text-[#23180f] dark:text-white"
                  }`}
                  style={selectedGuests === count ? { borderColor: RED, color: RED } : {}}
                >
                  {count}
                </button>
              ))}
            </div>

            <Button
              onClick={handleContinueBooking}
              className="mt-6 h-12 w-full rounded-2xl text-base font-bold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: RED }}
            >
              Continue
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
