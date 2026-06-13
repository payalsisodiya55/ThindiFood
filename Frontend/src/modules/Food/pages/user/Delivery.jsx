import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Star, Clock, Bookmark, BadgePercent, IndianRupee, Timer, X, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "@food/hooks/useLocation";
import { useZone } from "@food/hooks/useZone";
import { restaurantAPI } from "@food/api";
import { API_BASE_URL } from "@food/api/config";
import { getRestaurantAvailabilityStatus } from "@food/utils/restaurantAvailability";
import { useProfile } from "@food/context/ProfileContext";
import { useSearchOverlay, useLocationSelector } from "@food/components/user/UserLayout";
import { Navigation, ChevronDown, Truck } from "lucide-react";
import { RestaurantGridSkeleton, LoadingSkeletonRegion } from "@food/components/ui/loading-skeletons";
import { getCachedSettings } from "@food/utils/businessSettings";

const BACKEND_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");
const WEBVIEW_KEY = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// ── Same image logic as Home.jsx ──────────────────────────────────────────────
function normalizeImageUrl(imageUrl) {
  if (typeof imageUrl !== "string") return "";
  const trimmed = imageUrl.trim();
  if (!trimmed) return "";
  if (/^data:/i.test(trimmed) || /^blob:/i.test(trimmed)) return trimmed;
  // If already a full URL, return as-is (cleaned up)
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const appProtocol = typeof window !== "undefined" ? window.location.protocol : "https:";
      const parsed = new URL(trimmed);
      if (appProtocol === "https:" && parsed.protocol === "http:") parsed.protocol = "https:";
      return parsed.toString();
    } catch { return trimmed; }
  }
  // Protocol-relative URL
  if (trimmed.startsWith("//")) {
    const proto = typeof window !== "undefined" ? window.location.protocol : "https:";
    return `${proto}${trimmed}`;
  }
  // Relative path - prepend backend origin
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed.replace(/^\.?\/+/, "")}`;
  return `${BACKEND_ORIGIN}${path}`;
}

function buildImageCandidates(value) {
  if (!value) return [];
  let url = "";
  if (typeof value === "string") url = normalizeImageUrl(value);
  else if (typeof value === "object") {
    const c = value.url || value.secure_url || value.imageUrl || value.imageURL || value.image || value.src || value.path || "";
    url = typeof c === "string" ? normalizeImageUrl(c) : "";
  }
  if (!url) return [];
  if (/res\.cloudinary\.com/i.test(url) && /\/image\/upload\//i.test(url) && !/\/image\/upload\/(?:f_|q_|w_|h_)/i.test(url)) {
    return Array.from(new Set([
      url.replace("/image/upload/", "/image/upload/f_jpg,q_auto,w_1080/"),
      url.replace("/image/upload/", "/image/upload/f_auto,q_auto,w_1080/"),
      url,
    ]));
  }
  return [url];
}

function extractImages(source) {
  if (!source) return [];
  if (Array.isArray(source)) return source.flatMap(buildImageCandidates).filter(Boolean);
  return buildImageCandidates(source);
}

function getDisplayName(r) {
  return r?.name || (typeof r?.restaurantName === "string" ? r.restaurantName : r?.restaurantName?.english) || r?.onboarding?.step1?.restaurantName || "Restaurant";
}

function calcDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const a = sinDLat * sinDLat +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Same ImageCarousel as Home.jsx ────────────────────────────────────────────
function ImgCarousel({ restaurant, priority = false }) {
  const keyRef = useRef(WEBVIEW_KEY);
  const imgRef = useRef(null);
  const coverImages = useMemo(() => {
    const candidates = [
      ...extractImages(restaurant.coverImages),
      ...extractImages(restaurant.coverImage),
      ...extractImages(restaurant.profileImage),
      ...extractImages(restaurant.images),
      ...buildImageCandidates(restaurant.image),
      ...buildImageCandidates(restaurant.imageUrl),
    ];
    return Array.from(new Set(candidates.filter(Boolean)));
  }, [restaurant]);

  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState({});
  const [unavailable, setUnavailable] = useState(false);
  const [shimmer, setShimmer] = useState(true);
  const [lastGood, setLastGood] = useState("");
  const touchStartX = useRef(0);

  useEffect(() => { setIdx(0); setLoaded({}); setUnavailable(images.length === 0); setShimmer(images.length > 0); }, [restaurant?.id, restaurant?.slug]);
  useEffect(() => { setLastGood(""); }, [restaurant?.id, restaurant?.slug]);

  const images = coverImages;
  const safe = images.length > 0 ? ((idx % images.length) + images.length) % images.length : 0;
  const src = images[safe] || "";
  const render = src || lastGood;
  const isLoaded = Boolean(loaded[render] || lastGood);

  useEffect(() => {
    if (!render) return;
    setShimmer(true);
    const t = setTimeout(() => setShimmer(false), 2500);
    const el = imgRef.current;
    if (el?.complete && el.naturalWidth > 0) { setLoaded(p => ({ ...p, [render]: true })); setLastGood(render); setShimmer(false); }
    return () => clearTimeout(t);
  }, [render]);

  return (
    <div className="relative h-full w-full overflow-hidden group"
      onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        const diff = touchStartX.current - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 50) setIdx(p => diff > 0 ? (p+1)%images.length : (p-1+images.length)%images.length);
      }}>
      {shimmer && !unavailable && Boolean(render) && (
        <div className="absolute inset-0 z-[1] bg-gray-200 animate-pulse" />
      )}
      <div className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-110">
        {render && (
          <img ref={imgRef} src={render} alt={restaurant.name}
            className="w-full h-full object-cover"
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
            onLoad={() => { setLoaded(p => ({ ...p, [render]: true })); setLastGood(render); setShimmer(false); }}
            onError={() => {
              if (images.length <= 1) setUnavailable(true);
              else setIdx(p => (p+1) % images.length);
            }}
          />
        )}
      </div>
      {unavailable && (
        <div className="absolute inset-0 z-[2] flex items-center justify-center bg-gray-100">
          <Truck className="h-10 w-10 text-gray-300" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function Delivery() {
  const { location: geolocatedLocation } = useLocation();
  const { vegMode, getDefaultAddress } = useProfile();

  const [deliveryAddressMode, setDeliveryAddressMode] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("deliveryAddressMode") || "saved";
    }
    return "saved";
  });

  useEffect(() => {
    const handleLocationUpdate = () => {
      if (typeof window !== "undefined") {
        setDeliveryAddressMode(localStorage.getItem("deliveryAddressMode") || "saved");
      }
    };
    window.addEventListener("userLocationUpdated", handleLocationUpdate);
    return () => {
      window.removeEventListener("userLocationUpdated", handleLocationUpdate);
    };
  }, []);

  const defaultSavedAddress = useMemo(
    () => getDefaultAddress?.() || null,
    [getDefaultAddress]
  );

  const defaultSavedAddressLocation = useMemo(() => {
    if (!defaultSavedAddress) return null;
    const coords = defaultSavedAddress?.location?.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      const lng = parseFloat(coords[0]);
      const lat = parseFloat(coords[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { latitude: lat, longitude: lng };
      }
    }

    const lat = parseFloat(
      defaultSavedAddress?.latitude || defaultSavedAddress?.lat
    );
    const lng = parseFloat(
      defaultSavedAddress?.longitude || defaultSavedAddress?.lng
    );
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { latitude: lat, longitude: lng };
    }

    return null;
  }, [defaultSavedAddress]);

  const savedAddressText = useMemo(() => {
    if (!defaultSavedAddress) return "";
    if (defaultSavedAddress.formattedAddress && defaultSavedAddress.formattedAddress !== "Select location") {
      return defaultSavedAddress.formattedAddress;
    }
    const parts = [];
    if (defaultSavedAddress.additionalDetails) parts.push(defaultSavedAddress.additionalDetails);
    if (defaultSavedAddress.street) parts.push(defaultSavedAddress.street);
    if (defaultSavedAddress.city) parts.push(defaultSavedAddress.city);
    if (defaultSavedAddress.state) parts.push(defaultSavedAddress.state);
    if (defaultSavedAddress.zipCode) parts.push(defaultSavedAddress.zipCode);
    if (parts.length > 0) return parts.join(", ");
    if (defaultSavedAddress.address && defaultSavedAddress.address !== "Select location") {
      return defaultSavedAddress.address;
    }
    return "";
  }, [defaultSavedAddress]);

  const shouldUseSavedAddress = deliveryAddressMode === "saved" && Boolean(defaultSavedAddressLocation);

  const activeLocation = useMemo(() => {
    if (shouldUseSavedAddress) {
      return {
        ...defaultSavedAddress,
        latitude: defaultSavedAddressLocation.latitude,
        longitude: defaultSavedAddressLocation.longitude,
        formattedAddress: savedAddressText,
        address: defaultSavedAddress.additionalDetails || defaultSavedAddress.street || defaultSavedAddress.city || "Select Location",
        area: defaultSavedAddress.additionalDetails || ""
      };
    }
    return geolocatedLocation;
  }, [shouldUseSavedAddress, defaultSavedAddress, defaultSavedAddressLocation, savedAddressText, geolocatedLocation]);

  const { zoneId, isOutOfService } = useZone(activeLocation);
  const settings = getCachedSettings();
  const disableBlackCards = settings?.disableBlackCardsWhenNoLocation === true;
  const shouldShowGrayscale = isOutOfService && !disableBlackCards;
  const { openLocationSelector } = useLocationSelector();
  const { openSearch } = useSearchOverlay();
  const [availabilityTick] = useState(Date.now());
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    localStorage.setItem("thindi_fulfillment_mode", "delivery");
    window.dispatchEvent(new CustomEvent("thindi:fulfillmentMode", { detail: { mode: "delivery" } }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      setLoading(true);
      try {
        const params = { limit: 100 };
        if (zoneId) params.zoneId = zoneId;
        const res = await restaurantAPI.getRestaurants(params);
        if (cancelled) return;
        const list = res.data?.data?.restaurants || [];
        const userLat = activeLocation?.latitude, userLng = activeLocation?.longitude;

        const mapped = list
          .map(r => {
            const loc = r.location;
            const rLat = loc?.latitude || loc?.coordinates?.[1];
            const rLng = loc?.longitude || loc?.coordinates?.[0];
            let distance = r.distance || "—", distanceInKm = null;
            if (userLat && userLng && rLat && rLng) {
              distanceInKm = calcDistance(userLat, userLng, rLat, rLng);
              distance = distanceInKm >= 1 ? `${distanceInKm.toFixed(1)} km` : `${Math.round(distanceInKm*1000)} m`;
            }
            return {
              id: r.restaurantId || r._id,
              mongoId: r._id,
              slug: r.slug,
              name: getDisplayName(r),
              cuisine: Array.isArray(r.cuisines) && r.cuisines.length ? r.cuisines[0] : "Multi-cuisine",
              cuisines: Array.isArray(r.cuisines) ? r.cuisines : [],
              rating: Number(r.rating) || 0,
              deliveryTime: r.estimatedDeliveryTime || "25-30 mins",
              distance, distanceInKm,
              image: (() => { const imgs = [...extractImages(r.coverImages), ...extractImages(r.coverImage), ...buildImageCandidates(r.profileImage), ...buildImageCandidates(r.image)]; return imgs[0] || ""; })(),
              images: (() => { const imgs = [...extractImages(r.coverImages), ...extractImages(r.coverImage), ...buildImageCandidates(r.profileImage), ...buildImageCandidates(r.image), ...buildImageCandidates(r.imageUrl)]; return Array.from(new Set(imgs.filter(Boolean))); })(),
              coverImages: r.coverImages, coverImage: r.coverImage, profileImage: r.profileImage, imageUrl: r.imageUrl,
              priceRange: r.priceRange || "$$",
              featuredDish: r.featuredDish || (r.cuisines?.[0] ? `${r.cuisines[0]} Special` : "Special Dish"),
              featuredPrice: r.featuredPrice || 249,
              offer: r.offer || null,
              pureVegRestaurant: r.pureVegRestaurant === true,
              selfDelivery: r.selfDelivery || {},
              isActive: r.isActive !== false,
              isAcceptingOrders: r.isAcceptingOrders !== false,
              openDays: Array.isArray(r.openDays) ? r.openDays : [],
              outletTimings: r.outletTimings || null,
              openingTime: r.openingTime || null,
              closingTime: r.closingTime || null,
            };
          })
          .filter((restaurant) => {
            const selfDelivery = restaurant?.selfDelivery || {}
            return (
              selfDelivery.enabled === true &&
              String(selfDelivery.approvalStatus || "none").toLowerCase() === "approved"
            )
          });

        const sortRestaurants = (listToSort) => {
          return [...listToSort].sort((a, b) => {
            const aOpen = getRestaurantAvailabilityStatus(a, new Date(), {
              preferSelfDeliveryTimings: true,
            })?.isOpen !== false;
            const bOpen = getRestaurantAvailabilityStatus(b, new Date(), {
              preferSelfDeliveryTimings: true,
            })?.isOpen !== false;
            if (aOpen !== bOpen) return aOpen ? -1 : 1;
            if (a.distanceInKm != null && b.distanceInKm != null) return a.distanceInKm - b.distanceInKm;
            return 0;
          });
        };

        setRestaurants(sortRestaurants(mapped));

        const restaurantsNeedingOutletTimings = mapped.filter(
          (restaurant) => restaurant.mongoId && !restaurant.outletTimings,
        );

        if (restaurantsNeedingOutletTimings.length > 0) {
          void (async () => {
            const resolvedOutletTimings = new Map();

            for (const restaurant of restaurantsNeedingOutletTimings) {
              try {
                const outletResponse = await restaurantAPI.getOutletTimingsByRestaurantId(
                  restaurant.mongoId,
                );
                const outletTimings =
                  outletResponse?.data?.data?.outletTimings ||
                  outletResponse?.data?.outletTimings ||
                  null;

                if (outletTimings) {
                  resolvedOutletTimings.set(restaurant.mongoId, outletTimings);
                }
              } catch (_) {}
            }

            if (cancelled || resolvedOutletTimings.size === 0) {
              return;
            }

            setRestaurants((currentRestaurants) => {
              let hasChanges = false;
              const nextRestaurants = currentRestaurants.map((restaurant) => {
                if (!restaurant.mongoId) return restaurant;
                const outletTimings = resolvedOutletTimings.get(
                  restaurant.mongoId,
                );
                if (!outletTimings) return restaurant;
                hasChanges = true;
                return { ...restaurant, outletTimings };
              });

              return hasChanges ? sortRestaurants(nextRestaurants) : currentRestaurants;
            });
          })();
        }
      } catch {}
      finally { if (!cancelled) setLoading(false); }
    };
    fetch();
    return () => { cancelled = true; };
  }, [activeLocation?.latitude, activeLocation?.longitude, zoneId]);

  const filtered = useMemo(() => {
    let list = restaurants;
    if (vegMode) list = list.filter(r => r.pureVegRestaurant);
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      list = list.filter(r => r.name.toLowerCase().includes(q) || r.cuisines.some(c => c.toLowerCase().includes(q)));
    }
    return list;
  }, [restaurants, vegMode, searchText]);

  const locationTitle = (deliveryAddressMode === "saved" && defaultSavedAddress)
    ? (defaultSavedAddress.additionalDetails || defaultSavedAddress.street || defaultSavedAddress.city || "Select Location")
    : (activeLocation?.area || activeLocation?.city || "Select Location");
  const locationSubtitle = activeLocation?.formattedAddress || activeLocation?.address || activeLocation?.city || "";

  return (
    <div className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a]">

      {/* Mobile header - green theme */}
      <div className="md:hidden sticky top-0 z-40 shadow-md bg-[#00c87e]">
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center justify-between mb-3">
            <button onClick={openLocationSelector} className="flex items-center gap-1.5 text-white flex-1 min-w-0">
              <Navigation className="h-3.5 w-3.5 flex-shrink-0" fill="white" strokeWidth={2.5} />
              <div className="flex flex-col items-start min-w-0 w-full max-w-[280px]">
                <div className="flex items-center gap-1 min-w-0 w-full">
                  <span className="font-extrabold text-sm truncate block max-w-[220px]">{locationTitle}</span>
                  <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 opacity-90" strokeWidth={3} />
                </div>
                {locationSubtitle && <span className="text-white/75 text-[10px] truncate w-full block max-w-[240px]">{locationSubtitle}</span>}
              </div>
            </button>
          </div>
          <div className="flex items-center bg-white rounded-xl px-3 h-11 cursor-pointer shadow-sm" onClick={openSearch}>
            <Search className="h-4 w-4 flex-shrink-0 mr-2 text-[#00c87e]" />
            <span className="text-gray-400 text-sm">Search restaurants, food...</span>
          </div>
        </div>
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-white" strokeWidth={2.5} />
            <span className="text-white font-extrabold text-lg tracking-tight">Delivery Restaurants</span>
          </div>
          <p className="text-white/80 text-xs mt-0.5">Order online, we deliver to your doorstep</p>
        </div>
      </div>

      {/* Page content */}
      <div className={`px-4 pb-28 md:pb-12 max-w-7xl mx-auto md:px-6 transition-all duration-300 ${shouldShowGrayscale ? "grayscale opacity-75" : ""}`}>

        {/* Desktop title + search */}
        <div className="hidden md:block pt-6 pb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-[#00c87e]/10">
              <Truck className="h-6 w-6 text-[#00c87e]" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">Delivery Restaurants</h1>
              <p className="text-sm text-gray-500">{loading ? "Finding restaurants..." : `${filtered.length} restaurants delivering near you`}</p>
            </div>
          </div>
          <div className="flex items-center bg-white dark:bg-[#1a1a1a] rounded-xl px-4 h-12 border border-gray-200 dark:border-gray-700 shadow-sm max-w-xl">
            <Search className="h-4 w-4 flex-shrink-0 mr-3 text-gray-400" />
            <input value={searchText} onChange={e => setSearchText(e.target.value)}
              placeholder="Search restaurants or cuisines..."
              className="flex-1 text-sm outline-none bg-transparent text-gray-800 dark:text-white placeholder-gray-400" />
            {searchText && <button onClick={() => setSearchText("")}><X className="h-4 w-4 text-gray-400" /></button>}
          </div>
        </div>

        {/* Mobile count label */}
        <div className="md:hidden pt-4 pb-2">
          <p className="text-xs font-semibold text-gray-400 tracking-widest uppercase">
            {loading ? "Loading..." : `${filtered.length} Restaurants Delivering Nearby`}
          </p>
          <span className="text-lg text-gray-500 font-normal">Featured</span>
        </div>

        {/* Loading */}
        {loading && (
          <div className="relative min-h-[360px]">
            <LoadingSkeletonRegion label="Loading restaurants" className="h-full p-1">
              <RestaurantGridSkeleton count={3} className="grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3" compact />
            </LoadingSkeletonRegion>
          </div>
        )}

        {/* Empty */}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Truck className="h-14 w-14 text-gray-200 mb-4" />
            <h3 className="text-gray-700 dark:text-gray-300 font-bold text-lg mb-1">
              {searchText ? "No matches found" : "No delivery restaurants nearby"}
            </h3>
            <p className="text-gray-400 text-sm max-w-xs">
              {searchText ? `No restaurants match "${searchText}"` : "No restaurants near you offer delivery yet. Try Takeaway!"}
            </p>
            {searchText && (
              <button onClick={() => setSearchText("")}
                className="mt-4 text-sm font-bold px-5 py-2 rounded-full text-white bg-[#00c87e]">
                Clear Search
              </button>
            )}
          </div>
        )}

        {/* ── Restaurant Grid — SAME card design as Home.jsx ── */}
        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-4 lg:gap-5 xl:gap-6 pt-1 items-stretch">
            {filtered.map((restaurant, index) => {
              const restaurantSlug = (typeof restaurant?.slug === "string" && restaurant.slug.trim()
                ? restaurant.slug.trim()
                : (restaurant.name || "restaurant")).toLowerCase().replace(/\s+/g, "-");
              const availability = getRestaurantAvailabilityStatus(
                restaurant,
                new Date(availabilityTick),
                {
                  ignoreOperationalStatus: true,
                  preferSelfDeliveryTimings: true,
                },
              );

              return (
                <div key={restaurant.id || restaurantSlug || index}
                  className="h-full transform transition-all duration-300 hover:-translate-y-3 hover:scale-[1.02]"
                  style={{ perspective: 1000, animation: index < 10 ? `fade-in-up 0.5s ease-out ${index * 0.05}s backwards` : "none" }}>
                  <div className="h-full group">
                    <Link to={`/user/restaurants/${restaurantSlug}`} className="h-full flex">
                      <div className={`relative w-full overflow-hidden rounded-2xl shadow-sm transition-all duration-300 hover:shadow-lg active:scale-[0.98] ${!availability.isOpen ? "grayscale opacity-70" : ""}`}>

                        {/* Image */}
                        <div className="relative w-full" style={{ aspectRatio: "4/3" }}>
                          <ImgCarousel restaurant={restaurant} priority={index < 3} />

                          {/* Featured dish badge */}
                          <div className="absolute left-2 top-2 z-10 max-w-[65%]">
                            <div className="truncate rounded-full bg-black/60 px-2.5 py-1 text-[9px] font-medium text-white backdrop-blur-sm">
                              {restaurant.featuredDish} • ₹{restaurant.featuredPrice}
                            </div>
                          </div>

                          {/* Dark bottom overlay */}
                          <div className={`absolute bottom-0 left-0 right-0 backdrop-blur-[2px] px-3 py-2.5 ${
                            !availability.isOpen ? "bg-black/80" : "bg-black/40"
                          }`}>
                            {/* Row 1: initial + name */}
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-white/25 bg-white/20 text-sm font-bold text-white">
                                {restaurant.name?.charAt(0) || "R"}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="line-clamp-1 text-[13px] font-bold leading-tight text-white">{restaurant.name}</p>
                                <p className={`line-clamp-1 text-[10px] ${
                                  !availability.isOpen ? "text-white font-bold" : "text-white/70"
                                }`}>{restaurant.cuisine}</p>
                              </div>
                              <svg className="h-4 w-4 flex-shrink-0 text-white/60" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                            </div>

                            {/* Row 2: open + rating */}
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${availability.isOpen ? "bg-emerald-500 text-white" : "bg-gray-500 text-white"}`}>
                                {availability.isOpen ? "Open" : "Closed"}
                              </span>
                              {availability.isOpen && availability.closingCountdownLabel && (
                                <span className="flex items-center gap-0.5 rounded-full border border-amber-400/30 bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-medium text-amber-300">
                                  <Timer className="h-2.5 w-2.5 flex-shrink-0" strokeWidth={2.5} />
                                  {availability.closingCountdownLabel}
                                </span>
                              )}
                              <div className={`ml-auto flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white ${Number(restaurant.rating) > 0 ? "bg-[#259539]" : "bg-gray-500"}`}>
                                <span>{Number(restaurant.rating) > 0 ? Number(restaurant.rating).toFixed(1) : "NEW"}</span>
                                {Number(restaurant.rating) > 0 && <Star className="ml-0.5 h-2.5 w-2.5 fill-white" strokeWidth={0} />}
                              </div>
                            </div>

                            {/* Row 3: time + distance + delivery fee */}
                            <div className={`mt-1 flex items-center gap-1 text-[10px] ${
                              !availability.isOpen ? "text-white font-medium" : "text-white/70"
                            }`}>
                              <Clock className="h-3 w-3 flex-shrink-0" strokeWidth={1.5} />
                              <span>{restaurant.deliveryTime}</span>
                              <span className={!availability.isOpen ? "text-white/60" : "text-white/40"}>|</span>
                              <span>{restaurant.distance}</span>
                              {Number(restaurant?.selfDelivery?.fee) >= 0 && (
                                <>
                                  <span className={!availability.isOpen ? "text-white/60" : "text-white/40"}>|</span>
                                  <IndianRupee className="h-3 w-3 flex-shrink-0" strokeWidth={2} />
                                  <span>Fee {Number(restaurant.selfDelivery.fee || 0).toFixed(0)}</span>
                                </>
                              )}
                              {restaurant.offer && (
                                <>
                                  <span className={!availability.isOpen ? "text-white/60" : "text-white/40"}>|</span>
                                  <BadgePercent className="h-3 w-3 flex-shrink-0" strokeWidth={2} />
                                  <span className="line-clamp-1 flex-1">{restaurant.offer}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                      </div>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
