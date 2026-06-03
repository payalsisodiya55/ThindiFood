import { useMemo, useState, useEffect, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronLeft, ChevronRight, Plus, MapPin, MoreHorizontal, Navigation, Home, Building2, Briefcase, Phone, X, Crosshair, Search } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { Label } from "@food/components/ui/label"
import { Textarea } from "@food/components/ui/textarea"
import { useLocation as useGeoLocation } from "@food/hooks/useLocation"
import { useProfile } from "@food/context/ProfileContext"
import { toast } from "sonner"
import { locationAPI, userAPI } from "@food/api"
import { Loader } from '@googlemaps/js-api-loader'
import AnimatedPage from "@food/components/user/AnimatedPage"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}
const DEFAULT_MAP_POSITION = [20.5937, 78.9629]

// Enable Maps if API Key is available, otherwise fallback to coordinates-only mode
const MAPS_ENABLED = !!import.meta.env.VITE_GOOGLE_MAPS_API_KEY

// Calculate distance between two coordinates using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3 // Earth's radius in meters
  const lat1Rad = lat1 * Math.PI / 180
  const lat2Rad = lat2 * Math.PI / 180
  const deltaLat = (lat2 - lat1) * Math.PI / 180
  const deltaLon = (lon2 - lon1) * Math.PI / 180

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) *
    Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c // Distance in meters
}

// Get icon based on address type/label
const getAddressIcon = (address) => {
  const label = (address.label || address.additionalDetails || "").toLowerCase()
  if (label.includes("home")) return Home
  if (label.includes("work") || label.includes("office")) return Briefcase
  if (label.includes("building") || label.includes("apt")) return Building2
  return Home
}

const buildLocationPayloadFromAddress = (address) => {
  if (!address || typeof address !== "object") return null

  const coordinates = Array.isArray(address.location?.coordinates)
    ? address.location.coordinates
    : []
  const longitude = Number(
    coordinates[0] ?? address.longitude ?? address.lng ?? null,
  )
  const latitude = Number(
    coordinates[1] ?? address.latitude ?? address.lat ?? null,
  )

  const street = String(address.street || "").trim()
  const area = String(address.additionalDetails || address.area || "").trim()
  const city = String(address.city || "").trim()
  const state = String(address.state || "").trim()
  const zipCode = String(address.zipCode || address.postalCode || "").trim()
  const formattedAddress =
    String(address.formattedAddress || "").trim() ||
    [area, street, city, state, zipCode].filter(Boolean).join(", ") ||
    [street, city, state].filter(Boolean).join(", ")

  return {
    label: address.label || "Home",
    latitude: Number.isFinite(latitude) ? latitude : undefined,
    longitude: Number.isFinite(longitude) ? longitude : undefined,
    street,
    area,
    city,
    state,
    zipCode,
    postalCode: zipCode,
    address: [street, city].filter(Boolean).join(", ") || formattedAddress,
    formattedAddress,
  }
}

const persistSelectedLocation = (locationData) => {
  if (!locationData) return
  try {
    localStorage.setItem("userLocation", JSON.stringify(locationData))
    window.dispatchEvent(
      new CustomEvent("userLocationUpdated", {
        detail: { location: locationData },
      }),
    )
  } catch {
    // Ignore storage/event sync errors so selection still works.
  }
}

const normalizeAddressPart = (value) => String(value || "").trim()
const isAdministrativeAddressPart = (value) => {
  const normalized = normalizeAddressPart(value).toLowerCase()
  if (!normalized) return false
  return (
    normalized.includes("tahsil") ||
    normalized.includes("tehsil") ||
    normalized.includes("taluka") ||
    normalized.includes("district") ||
    normalized.includes("division") ||
    normalized.endsWith(" city")
  )
}

const getFreshSystemLocation = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported"))
      return
    }

    const preferredAccuracyInMeters = 5000 // Return instantly on first fix
    const minimumAcceptedAccuracyInMeters = 10000
    let bestPosition = null
    let settled = false
    let watchId = null

    const finish = (position) => {
      if (settled) return
      settled = true
      if (watchId !== null) navigator.geolocation.clearWatch(watchId)
      if (!position?.coords) {
        reject(new Error("Unable to get current location"))
        return
      }

      resolve({
        latitude: Number(position.coords.latitude),
        longitude: Number(position.coords.longitude),
        accuracy: Number(position.coords.accuracy) || null,
        city: "",
        state: "",
        area: "",
        address: "",
        formattedAddress: "",
      })
    }

    const fail = (error) => {
      if (settled) return
      settled = true
      if (watchId !== null) navigator.geolocation.clearWatch(watchId)
      reject(error || new Error("Unable to get current location"))
    }

    const timeoutId = setTimeout(() => {
      if (bestPosition) {
        finish(bestPosition)
        return
      }
      fail(new Error("Location request timed out"))
    }, 5000)

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const nextAccuracy = Number(position?.coords?.accuracy) || Number.POSITIVE_INFINITY
        const bestAccuracy =
          Number(bestPosition?.coords?.accuracy) || Number.POSITIVE_INFINITY

        if (!bestPosition || nextAccuracy < bestAccuracy) {
          bestPosition = position
        }

        if (nextAccuracy <= preferredAccuracyInMeters) {
          clearTimeout(timeoutId)
          finish(position)
        }
      },
      (error) => {
        clearTimeout(timeoutId)
        fail(error)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    )
  })

const dedupeAddressParts = (parts = []) =>
  Array.from(
    new Set(
      parts
        .map((part) => normalizeAddressPart(part))
        .filter(Boolean),
    ),
  )

const buildPrimaryAddressFromParts = (addr = {}, formattedAddress = "") => {
  const city = normalizeAddressPart(
    addr.city || addr.town || addr.village || addr.municipality || addr.county,
  )
  const state = normalizeAddressPart(addr.state)
  const postcode = normalizeAddressPart(addr.postcode || addr.postalCode || addr.zipCode)
  const country = normalizeAddressPart(addr.country)

  const genericParts = new Set(
    [
      city,
      state,
      postcode,
      country,
      addr.county,
      addr.municipality,
      addr.city_district,
      addr.state_district,
      "india",
    ]
      .map((part) => normalizeAddressPart(part).toLowerCase())
      .filter(Boolean),
  )

  const houseRoad = [addr.house_number, addr.road].filter(Boolean).join(" ").trim()
  const priorityParts = dedupeAddressParts([
    addr.amenity,
    addr.shop,
    addr.building,
    addr.office,
    addr.house_name,
    addr.premise,
    houseRoad,
    addr.road,
    addr.suburb,
    addr.neighbourhood,
    addr.residential,
    addr.city_district,
    addr.quarter,
    addr.hamlet,
  ]).filter((part) => !genericParts.has(part.toLowerCase()))

  const formattedParts = dedupeAddressParts(
    String(formattedAddress || "")
      .split(",")
      .map((part) => part.trim()),
  ).filter((part) => {
    const normalized = part.toLowerCase()
    return (
      !genericParts.has(normalized) &&
      !isAdministrativeAddressPart(part) &&
      !/^\d{5,6}$/.test(part) &&
      normalized !== "india"
    )
  })

  const combined = dedupeAddressParts([...priorityParts, ...formattedParts]).filter(
    (part) => !isAdministrativeAddressPart(part),
  )
  return combined.slice(0, 3).join(", ") || formattedParts[0] || priorityParts[0] || ""
}

const extractGoogleAddressComponent = (components = [], types = []) => {
  const match = components.find((component) =>
    types.every((type) => component.types?.includes(type)),
  )
  return normalizeAddressPart(match?.long_name || match?.short_name)
}

const buildLocationFromGoogleResult = (result, latitude, longitude) => {
  const components = Array.isArray(result?.address_components) ? result.address_components : []
  const streetNumber = extractGoogleAddressComponent(components, ["street_number"])
  const road =
    extractGoogleAddressComponent(components, ["route"]) ||
    extractGoogleAddressComponent(components, ["premise"])
  const suburb =
    extractGoogleAddressComponent(components, ["sublocality_level_1"]) ||
    extractGoogleAddressComponent(components, ["sublocality"]) ||
    extractGoogleAddressComponent(components, ["neighborhood"]) ||
    extractGoogleAddressComponent(components, ["locality"])
  const city =
    extractGoogleAddressComponent(components, ["locality"]) ||
    extractGoogleAddressComponent(components, ["administrative_area_level_3"]) ||
    extractGoogleAddressComponent(components, ["administrative_area_level_2"])
  const state = extractGoogleAddressComponent(components, ["administrative_area_level_1"])
  const postalCode = extractGoogleAddressComponent(components, ["postal_code"])
  const country = extractGoogleAddressComponent(components, ["country"])
  const formattedAddress = normalizeAddressPart(result?.formatted_address)
  const street = buildPrimaryAddressFromParts(
    {
      house_number: streetNumber,
      road,
      suburb,
      neighbourhood: suburb,
      city,
      state,
      postcode: postalCode,
      country,
      premise: extractGoogleAddressComponent(components, ["premise"]),
      building: extractGoogleAddressComponent(components, ["establishment"]),
    },
    formattedAddress,
  )

  return {
    latitude,
    longitude,
    street,
    streetNumber,
    area: suburb,
    city,
    state,
    postalCode,
    zipCode: postalCode,
    country,
    address: street || formattedAddress,
    formattedAddress: formattedAddress || street,
  }
}

const countAddressSegments = (value) =>
  String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean).length

const chooseBetterResolvedLocation = (currentValue, nextValue) => {
  if (!nextValue) return currentValue
  if (!currentValue) return nextValue

  const currentScore =
    countAddressSegments(currentValue.formattedAddress) +
    (normalizeAddressPart(currentValue.street) ? 2 : 0) +
    (normalizeAddressPart(currentValue.streetNumber) ? 1 : 0)
  const nextScore =
    countAddressSegments(nextValue.formattedAddress) +
    (normalizeAddressPart(nextValue.street) ? 2 : 0) +
    (normalizeAddressPart(nextValue.streetNumber) ? 1 : 0)

  return nextScore >= currentScore ? nextValue : currentValue
}

export default function AddressSelectorPage() {
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const { location } = useGeoLocation()
  const { addresses = [], addAddress, updateAddress, setDefaultAddress, userProfile } = useProfile()
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [mapPosition, setMapPosition] = useState(DEFAULT_MAP_POSITION)
  const [addressFormData, setAddressFormData] = useState({
    street: "",
    city: "",
    state: "",
    zipCode: "",
    additionalDetails: "",
    label: "Home",
    phone: "",
  })
  const [loadingAddress, setLoadingAddress] = useState(false)
  const [mapLoading, setMapLoading] = useState(false)
  const mapContainerRef = useRef(null)
  const googleMapRef = useRef(null) // Google Maps instance
  const redMarkerRef = useRef(null) // Green marker for address selection
  const userLocationMarkerRef = useRef(null) // Blue dot marker for user location
  const blueDotCircleRef = useRef(null) // Accuracy circle for Google Maps
  const [currentAddress, setCurrentAddress] = useState("")
  const [showDetectedCurrentAddress, setShowDetectedCurrentAddress] = useState(() => {
    try {
      return localStorage.getItem("deliveryAddressMode") === "current"
    } catch {
      return false
    }
  })
  const [addressAutocompleteValue, setAddressAutocompleteValue] = useState("")
  const [keywordAddressSuggestions, setKeywordAddressSuggestions] = useState([])
  const [isKeywordSearching, setIsKeywordSearching] = useState(false)
  const [lockMapToAutocomplete, setLockMapToAutocomplete] = useState(true)
  const [GOOGLE_MAPS_API_KEY, setGOOGLE_MAPS_API_KEY] = useState(null)
  const [formScrollTop, setFormScrollTop] = useState(0)
  const [keyboardInset, setKeyboardInset] = useState(0)
  const [baseMapHeight, setBaseMapHeight] = useState(320)
  const formBodyRef = useRef(null)
  const manualFieldRefs = useRef({})
  const reverseGeocodeRequestIdRef = useRef(0)
  const googleMapsApiRef = useRef(null)
  const skipIdleReverseGeocodeRef = useRef(false)
  
  const ENABLE_LOCATION_REVERSE_GEOCODE = import.meta.env.VITE_ENABLE_LOCATION_REVERSE_GEOCODE !== "false"
  const ENABLE_NOMINATIM_SEARCH = import.meta.env.VITE_ENABLE_NOMINATIM_SEARCH !== "false"
  const getAddressId = (address) => address?.id || address?._id || null

  const handleBack = () => {
    goBack()
  }

  const addressAutocompleteSuggestions = useMemo(() => {
    const q = String(addressAutocompleteValue || "").trim().toLowerCase()
    if (!q) return []
    const list = Array.isArray(addresses) ? addresses : []
    return list
      .map((addr) => {
        const text = [
          addr?.label,
          addr?.additionalDetails,
          addr?.street,
          addr?.city,
          addr?.state,
          addr?.zipCode,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return { addr, text }
      })
      .filter((x) => x.text.includes(q))
      .slice(0, 6)
      .map((x) => x.addr)
  }, [addresses, addressAutocompleteValue])

  // Load Google Maps API key
  useEffect(() => {
    if (!MAPS_ENABLED) return
    import('@food/utils/googleMapsApiKey.js').then(({ getGoogleMapsApiKey }) => {
      getGoogleMapsApiKey().then(key => {
        setGOOGLE_MAPS_API_KEY(key)
      })
    })
  }, [])

  // Nominatim search
  useEffect(() => {
    if (!showAddressForm) return
    const q = String(addressAutocompleteValue || "").trim()
    if (!ENABLE_NOMINATIM_SEARCH || q.length < 3) {
      setKeywordAddressSuggestions([])
      setIsKeywordSearching(false)
      return
    }

    const t = setTimeout(async () => {
      try {
        setIsKeywordSearching(true)
        const refLat = location?.latitude ?? DEFAULT_MAP_POSITION[0]
        const refLng = location?.longitude ?? DEFAULT_MAP_POSITION[1]
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=10&q=${encodeURIComponent(q)}`
        const res = await fetch(url, { headers: { Accept: "application/json" } })
        const json = await res.json()
        const mapped = (Array.isArray(json) ? json : []).map(r => ({
          id: r.place_id || r.osm_id,
          display: r.display_name || "",
          lat: Number(r.lat),
          lng: Number(r.lon),
          address: r.address || {},
        }))
        const withDistance = mapped
          .filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lng))
          .map(x => ({ ...x, distanceMeters: calculateDistance(refLat, refLng, x.lat, x.lng) }))
          .sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity))
          .slice(0, 4)
        setKeywordAddressSuggestions(withDistance)
      } catch (e) {
        setKeywordAddressSuggestions([])
      } finally {
        setIsKeywordSearching(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [addressAutocompleteValue, showAddressForm, location, ENABLE_NOMINATIM_SEARCH])

  // Map Initialization logic
  useEffect(() => {
    if (!MAPS_ENABLED || !showAddressForm || !mapContainerRef.current || !GOOGLE_MAPS_API_KEY) return

    let isMounted = true
    setMapLoading(true)

    const initializeGoogleMap = async () => {
      try {
        const loader = new Loader({ apiKey: GOOGLE_MAPS_API_KEY, version: "weekly" })
        const google = await loader.load()
        googleMapsApiRef.current = google
        if (!isMounted || !mapContainerRef.current) return

        const initialLat = Number(location?.latitude)
        const initialLng = Number(location?.longitude)
        const initialPos = {
          lat: Number.isFinite(initialLat) ? initialLat : mapPosition[0],
          lng: Number.isFinite(initialLng) ? initialLng : mapPosition[1],
        }
        skipIdleReverseGeocodeRef.current = true
         
        const map = new google.maps.Map(mapContainerRef.current, {
          center: initialPos,
          zoom: 16,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          styles: [
            { featureType: "poi", stylers: [{ visibility: "off" }] },
            { featureType: "transit", stylers: [{ visibility: "off" }] }
          ]
        })
        googleMapRef.current = map

        // Update coordinates on map idle (center of the map is the chosen location)
        map.addListener("idle", () => {
          if (skipIdleReverseGeocodeRef.current) {
            skipIdleReverseGeocodeRef.current = false
            return
          }
          const center = map.getCenter()
          const lat = center.lat()
          const lng = center.lng()
          setMapPosition([lat, lng])
          handleMapMoveEnd(lat, lng)
        })

        setMapLoading(false)
      } catch (err) {
        debugError("Map init error:", err)
        setMapLoading(false)
      }
    }
    initializeGoogleMap()
    return () => { isMounted = false }
  }, [showAddressForm, GOOGLE_MAPS_API_KEY, location?.latitude, location?.longitude])

  useEffect(() => {
    if (!showAddressForm || !location?.latitude || !location?.longitude) return
    reverseGeocodeRequestIdRef.current += 1
    setMapPosition([location.latitude, location.longitude])
    skipIdleReverseGeocodeRef.current = true
    if (showDetectedCurrentAddress) {
      setCurrentAddress(location.formattedAddress || location.address || "")
    }
    setAddressFormData((prev) => ({
      ...prev,
      street:
        buildPrimaryAddressFromParts(
          {
            house_number: location.streetNumber,
            road: location.street,
            suburb: location.area,
            neighbourhood: location.area,
            city: location.city,
            state: location.state,
            postcode: location.postalCode || location.zipCode,
          },
          location.formattedAddress || location.address || "",
        ) || prev.street,
      city: normalizeAddressPart(location.city) || prev.city,
      state: normalizeAddressPart(location.state) || prev.state,
      zipCode: normalizeAddressPart(location.postalCode || location.zipCode) || prev.zipCode,
    }))
    if (googleMapRef.current) {
      googleMapRef.current.setCenter({ lat: location.latitude, lng: location.longitude })
      googleMapRef.current.setZoom(17)
    }
  }, [showAddressForm, location, showDetectedCurrentAddress])

  const applyResolvedLocationToForm = useCallback((resolvedLocation) => {
    if (!resolvedLocation) return
    setCurrentAddress(resolvedLocation.formattedAddress || resolvedLocation.address || "")
    setAddressFormData((prev) => ({
      ...prev,
      street:
        buildPrimaryAddressFromParts(
          {
            house_number: resolvedLocation.streetNumber,
            road: resolvedLocation.street,
            suburb: resolvedLocation.area,
            neighbourhood: resolvedLocation.area,
            city: resolvedLocation.city,
            state: resolvedLocation.state,
            postcode: resolvedLocation.postalCode || resolvedLocation.zipCode,
            country: resolvedLocation.country,
          },
          resolvedLocation.formattedAddress || resolvedLocation.address || "",
        ) || prev.street,
      city: normalizeAddressPart(resolvedLocation.city) || prev.city,
      state: normalizeAddressPart(resolvedLocation.state) || prev.state,
      zipCode:
        normalizeAddressPart(resolvedLocation.postalCode || resolvedLocation.zipCode) || prev.zipCode,
    }))
  }, [])

  const reverseGeocodeCoordinate = useCallback(async (lat, lng, baseLocation = null) => {
    let bestLocation = baseLocation

    const google = googleMapsApiRef.current
    if (google?.maps?.Geocoder) {
      try {
        const geocoder = new google.maps.Geocoder()
        const response = await geocoder.geocode({ location: { lat, lng } })
        const googleResult = Array.isArray(response?.results) ? response.results[0] : null
        if (googleResult) {
          bestLocation = chooseBetterResolvedLocation(
            bestLocation,
            buildLocationFromGoogleResult(googleResult, lat, lng),
          )
        }
      } catch (error) {
        debugWarn("Google reverse geocode failed, falling back:", error)
      }
    }



    if (bestLocation?.formattedAddress && countAddressSegments(bestLocation.formattedAddress) >= 4) {
      return bestLocation
    }

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1`
      const response = await fetch(url, {
        headers: {
          "Accept-Language": "en",
        }
      })
      const json = await response.json()
      if (json && json.address) {
        const addr = json.address
        const rawFormattedAddress = normalizeAddressPart(json.display_name)
        
        // Build primary street address using the deduplication logic
        const street = buildPrimaryAddressFromParts(addr, rawFormattedAddress)
        const streetNumber = normalizeAddressPart(addr.house_number)
        
        // Clean and resolve the area/locality name beautifully
        const cleanAreaName = (val) => {
          if (!val) return ""
          return val.replace(/\s*(tahsil|tehsil|taluka|district|division)\b/gi, "").trim()
        }
        
        let area = ""
        if (addr.suburb) area = normalizeAddressPart(addr.suburb)
        else if (addr.neighbourhood) area = normalizeAddressPart(addr.neighbourhood)
        else if (addr.residential) area = normalizeAddressPart(addr.residential)
        else if (addr.county) area = cleanAreaName(addr.county)
        else if (addr.city_district) area = cleanAreaName(addr.city_district)
        
        const city = normalizeAddressPart(addr.city || addr.town || addr.village || addr.municipality || addr.county || "")
        const state = normalizeAddressPart(addr.state || "")
        const postalCode = normalizeAddressPart(addr.postcode)
        const country = normalizeAddressPart(addr.country || "")
        
        // Construct a clean, elegant, non-repetitive formatted address
        const formattedAddress = [street, area, city, state, postalCode].filter(Boolean).join(", ") || rawFormattedAddress
        
        const fallbackLocation = {
          latitude: lat,
          longitude: lng,
          street,
          streetNumber,
          area,
          city,
          state,
          postalCode,
          zipCode: postalCode,
          country,
          address: street || formattedAddress,
          formattedAddress,
        }
        bestLocation = chooseBetterResolvedLocation(bestLocation, fallbackLocation)
      }
    } catch (error) {
      debugWarn("Nominatim reverse geocode failed, trying BigDataCloud:", error)
    }

    if (bestLocation?.formattedAddress && countAddressSegments(bestLocation.formattedAddress) >= 4) {
      return bestLocation
    }

    try {
      const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
      const response = await fetch(url)
      const json = await response.json()
      if (json && (json.city || json.locality)) {
        const city = normalizeAddressPart(json.city || json.locality)
        const principalSubdivision = normalizeAddressPart(json.principalSubdivision)
        const fallbackLocation = {
          latitude: lat,
          longitude: lng,
          street: normalizeAddressPart(json.locality),
          streetNumber: "",
          area: normalizeAddressPart(json.locality),
          city: city,
          state: principalSubdivision,
          postalCode: "",
          zipCode: "",
          country: normalizeAddressPart(json.countryName),
          address: city,
          formattedAddress: `${city}, ${principalSubdivision}`,
        }
        bestLocation = chooseBetterResolvedLocation(bestLocation, fallbackLocation)
      }
    } catch (error) {
      debugError("Reverse geocode error:", error)
    }

    return bestLocation
  }, [])

  const handleUseCurrentLocation = async (e) => {
    if (e && e.preventDefault) e.preventDefault()
    try {
      toast.loading("Getting location...", { id: "geo" })
      setShowDetectedCurrentAddress(true)
      setCurrentAddress("")
      try {
        localStorage.removeItem("userLocation")
      } catch {
        // Ignore storage clear errors.
      }

      const loc = await getFreshSystemLocation()

      if (loc?.latitude) {
        reverseGeocodeRequestIdRef.current += 1
        const newPos = [loc.latitude, loc.longitude]
        setMapPosition(newPos)
         
        // Explicitly pan the map to center the user location
        if (googleMapRef.current) {
          skipIdleReverseGeocodeRef.current = true
          googleMapRef.current.panTo({ lat: loc.latitude, lng: loc.longitude })
          googleMapRef.current.setZoom(17)
        }

        try {
          // Wait for reverse geocoding so the user sees the loading state
          const resolvedLocation = await reverseGeocodeCoordinate(loc.latitude, loc.longitude, loc)
          const finalLocation = chooseBetterResolvedLocation(loc, resolvedLocation) || loc
          persistSelectedLocation(finalLocation)
        } catch (error) {
          debugWarn("Reverse geocode failed:", error)
          persistSelectedLocation(loc)
        }

        try { localStorage.setItem("deliveryAddressMode", "current") } catch {}
        toast.success("Location updated", { id: "geo" })
        navigate("/food/user", { replace: true })
        return
      }
      toast.error("Failed to get location", { id: "geo" })
    } catch (e) {
      toast.error(e?.message || "Failed to get location", { id: "geo" })
    }
  }

  const handleSelectSavedAddress = async (address) => {
    const id = getAddressId(address)
    if (id) {
      await setDefaultAddress(id)
      persistSelectedLocation(buildLocationPayloadFromAddress(address))
      try { localStorage.setItem("deliveryAddressMode", "saved") } catch {}
      toast.success("Address selected")
      handleBack()
    }
  }

  const handleAddAddressClick = () => {
    setShowAddressForm(true)
  }

  const handleCancelAddressForm = () => {
    setShowAddressForm(false)
  }

  const scrollFieldIntoView = useCallback((fieldName) => {
    const el = manualFieldRefs.current?.[fieldName]
    if (!el) return
    setTimeout(() => {
      try {
        const scrollHost = formBodyRef.current
        if (!scrollHost) {
          el.scrollIntoView({ behavior: "smooth", block: "center" })
          return
        }
        const hostRect = scrollHost.getBoundingClientRect()
        const elRect = el.getBoundingClientRect()
        const viewportHeight =
          typeof window !== "undefined" && window.visualViewport
            ? window.visualViewport.height
            : window.innerHeight
        const safeBottom = viewportHeight - keyboardInset - 90
        const overBy = elRect.bottom - safeBottom
        if (overBy > 0) {
          scrollHost.scrollTo({
            top: scrollHost.scrollTop + overBy + 24,
            behavior: "smooth",
          })
          return
        }
        if (elRect.top < hostRect.top + 70) {
          const upBy = hostRect.top + 70 - elRect.top
          scrollHost.scrollTo({
            top: Math.max(0, scrollHost.scrollTop - upBy - 12),
            behavior: "smooth",
          })
          return
        }
        el.scrollIntoView({ behavior: "smooth", block: "center" })
      } catch {
        // Ignore scrolling errors.
      }
    }, 120)
  }, [keyboardInset])

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

  const handleMapMoveEnd = async (lat, lng) => {
    if (!ENABLE_LOCATION_REVERSE_GEOCODE) return
    const requestId = ++reverseGeocodeRequestIdRef.current
    try {
      const json = await reverseGeocodeCoordinate(lat, lng)
      if (requestId !== reverseGeocodeRequestIdRef.current) return
      
      if (json) {
        applyResolvedLocationToForm(json)
      }
    } catch (e) {
      if (requestId !== reverseGeocodeRequestIdRef.current) return
      debugError("Reverse geocode error:", e)
    }
  }

  const handleAddressFormSubmit = async (e) => {
    e.preventDefault()
    if (!addressFormData.street || !addressFormData.city) {
      toast.error("Please fill required fields")
      return
    }
    setLoadingAddress(true)
    try {
      const payload = {
        ...addressFormData,
        label: addressFormData.label === "Work" ? "Office" : addressFormData.label,
        location: { type: "Point", coordinates: [mapPosition[1], mapPosition[0]] },
        latitude: mapPosition[0],
        longitude: mapPosition[1]
      }
      const created = await addAddress(payload)
      if (created) {
        const id = getAddressId(created)
        if (id) await setDefaultAddress(id)
        persistSelectedLocation(buildLocationPayloadFromAddress(created || payload))
        try { localStorage.setItem("deliveryAddressMode", "saved") } catch {}
        toast.success("Address saved")
        handleBack()
      }
    } catch (error) {
      toast.error("Failed to save address")
    } finally {
      setLoadingAddress(false)
    }
  }

  useEffect(() => {
    if (!showAddressForm) return
    const updateBaseMapHeight = () => {
      const vh = typeof window !== "undefined" ? window.innerHeight : 800
      const target = Math.round(vh * 0.45)
      setBaseMapHeight(Math.max(260, Math.min(420, target)))
    }
    updateBaseMapHeight()
    window.addEventListener("resize", updateBaseMapHeight)
    return () => window.removeEventListener("resize", updateBaseMapHeight)
  }, [showAddressForm])

  useEffect(() => {
    if (!showAddressForm) return
    setFormScrollTop(0)
  }, [showAddressForm])

  useEffect(() => {
    if (!showAddressForm || typeof window === "undefined" || !window.visualViewport) return
    const viewport = window.visualViewport
    const updateKeyboardInset = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      setKeyboardInset(inset > 0 ? inset : 0)
    }
    updateKeyboardInset()
    viewport.addEventListener("resize", updateKeyboardInset)
    viewport.addEventListener("scroll", updateKeyboardInset)
    return () => {
      viewport.removeEventListener("resize", updateKeyboardInset)
      viewport.removeEventListener("scroll", updateKeyboardInset)
    }
  }, [showAddressForm])

  if (showAddressForm) {
    const mapHeight = baseMapHeight 
    return (
      <AnimatedPage
        className="fixed inset-0 z-50 bg-white dark:bg-[#0a0a0a] flex flex-col h-screen overflow-hidden"
      >
        <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={handleCancelAddressForm} className="rounded-full">
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <h1 className="text-lg font-bold">Add Address</h1>
        </div>

        <div
          ref={formBodyRef}
          onScroll={(e) => {
            setFormScrollTop(e.currentTarget.scrollTop)
          }}
          className="flex-1 overflow-y-auto"
          style={{ paddingBottom: `${96 + keyboardInset}px` }}
        >
          {/* Map Section - Parallax enabled */}
          <div
            className="flex-shrink-0 relative z-0"
            style={{ 
              height: `${mapHeight}px`,
              transform: `translateY(${formScrollTop * 0.4}px)`,
              opacity: clamp(1 - (formScrollTop / 500), 0.4, 1)
            }}
          >
            <div className="absolute top-4 left-4 right-4 z-20">
              <div className="relative group shadow-2xl">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <Input
                  value={addressAutocompleteValue}
                  onChange={(e) => setAddressAutocompleteValue(e.target.value)}
                  placeholder="Search area, street, landmark..."
                  className="pl-10 h-12 bg-white/95 dark:bg-[#1a1a1a]/95 backdrop-blur-md border-none rounded-xl shadow-lg focus:ring-2 focus:ring-[#00c87e] transition-all"
                />
                {isKeywordSearching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                     <div className="animate-spin rounded-full h-4 w-4 border-2 border-[#00c87e] border-t-transparent" />
                  </div>
                )}

                {keywordAddressSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-[#1a1a1a] rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden z-30 animate-in fade-in slide-in-from-top-2 duration-200">
                    <p className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-50 dark:bg-gray-800/50">Suggestions</p>
                    {keywordAddressSuggestions.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          const { lat, lng, display, address: a } = s
                          setMapPosition([lat, lng])
                          if (googleMapRef.current) {
                            googleMapRef.current.panTo({ lat, lng })
                            googleMapRef.current.setZoom(17)
                          }
                          setAddressAutocompleteValue(display)
                          const city = a.city || a.town || a.village || a.county || ""
                          const state = a.state || ""
                          const zipCode = a.postcode || ""
                          setAddressFormData((prev) => ({
                            ...prev,
                            street: display || prev.street,
                            city: city || prev.city,
                            state: state || prev.state,
                            zipCode: zipCode || prev.zipCode,
                          }))
                          setKeywordAddressSuggestions([])
                        }}
                        className="w-full px-4 py-3 flex items-start gap-3 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-colors text-left border-b border-gray-50 dark:border-gray-800 last:border-none"
                      >
                        <MapPin className="h-4 w-4 text-gray-400 mt-1 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{s.display}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{s.address?.city || s.address?.state}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div ref={mapContainerRef} className="w-full h-full bg-gray-100 dark:bg-gray-800" />
            
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
               <div className="relative mb-8 flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center p-2 mb-[-6px] shadow-sm animate-bounce-short">
                     <div className="w-6 h-6 rounded-full bg-[#00c87e] flex items-center justify-center border-2 border-white">
                        <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                     </div>
                  </div>
                  <div className="w-1.5 h-6 bg-[#00c87e] border-x border-white shadow-xl rounded-b-full shadow-emerald-900/40" />
                  <div className="w-3 h-1.5 bg-black/20 rounded-full blur-[1px] transform scale-x-150 absolute bottom-[-4px]" />
               </div>
            </div>

            {mapLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00c87e]" />
              </div>
            )}
            
            <div className="absolute bottom-10 right-4 z-10">
              <Button 
                  onClick={handleUseCurrentLocation} 
                  className="bg-white text-black hover:bg-gray-100 shadow-xl border border-gray-200 rounded-full h-12 px-6"
              >
                <Navigation className="h-4 w-4 mr-2 text-[#00c87e]" /> Use My Location
              </Button>
            </div>
          </div>

          <div className="relative bg-white dark:bg-[#0a0a0a] rounded-t-[32px] -mt-8 z-10 p-4 space-y-6 shadow-[0_-12px_24px_-10px_rgba(0,0,0,0.1)]">
            <div className="bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/20 rounded-xl p-4 flex gap-3">
               <MapPin className="h-5 w-5 text-[#00c87e] mt-0.5" />
               <div className="min-w-0">
                  <p className="text-xs font-bold text-emerald-800 dark:text-emerald-200 uppercase mb-1">Pinned Location</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">{currentAddress || "Select a location on map"}</p>
               </div>
            </div>

            <div>
              <Label className="text-sm font-bold text-gray-900 mb-2 block">Primary Address (Street / Area / Landmark)</Label>
              <Input 
                placeholder="Search or drag to update street/area" 
                value={addressFormData.street} 
                onChange={e => setAddressFormData({...addressFormData, street: e.target.value})}
                onFocus={() => scrollFieldIntoView("street")}
                ref={(el) => { manualFieldRefs.current.street = el }}
                className="mb-4 h-12 rounded-xl border border-gray-200 bg-white dark:bg-gray-900 placeholder:text-gray-400 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                required
              />

              <Label className="text-sm font-bold text-gray-900 mb-2 block">Secondary Address (House No. / Flat / Floor)</Label>
              <Input 
                placeholder="E.g. Flat 402, 4th Floor" 
                value={addressFormData.additionalDetails} 
                onChange={e => setAddressFormData({...addressFormData, additionalDetails: e.target.value})}
                onFocus={() => scrollFieldIntoView("additionalDetails")}
                ref={(el) => { manualFieldRefs.current.additionalDetails = el }}
                className="h-12 rounded-xl border border-gray-200 bg-white dark:bg-gray-900 placeholder:text-gray-400 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-bold text-gray-900 mb-2 block">City</Label>
                <Input 
                  placeholder="Enter city"
                  value={addressFormData.city} 
                  onChange={e => setAddressFormData({...addressFormData, city: e.target.value})} 
                  onFocus={() => scrollFieldIntoView("city")}
                  ref={(el) => { manualFieldRefs.current.city = el }}
                  className="h-12 rounded-xl border border-gray-200 bg-white dark:bg-gray-900 placeholder:text-gray-400 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                  required 
                />
              </div>
              <div>
                <Label className="text-sm font-bold text-gray-900 mb-2 block">State</Label>
                <Input 
                  placeholder="Enter state"
                  value={addressFormData.state} 
                  onChange={e => setAddressFormData({...addressFormData, state: e.target.value})} 
                  onFocus={() => scrollFieldIntoView("state")}
                  ref={(el) => { manualFieldRefs.current.state = el }}
                  className="h-12 rounded-xl border border-gray-200 bg-white dark:bg-gray-900 placeholder:text-gray-400 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                  required 
                />
              </div>
            </div>

            <div>
              <Label className="text-sm font-bold text-gray-900 mb-2 block">Pincode / ZIP</Label>
              <Input 
                placeholder="Enter pincode" 
                value={addressFormData.zipCode || ""} 
                onChange={e => setAddressFormData({...addressFormData, zipCode: e.target.value})} 
                onFocus={() => scrollFieldIntoView("zipCode")}
                ref={(el) => { manualFieldRefs.current.zipCode = el }}
                className="h-12 rounded-xl border border-gray-200 bg-white dark:bg-gray-900 placeholder:text-gray-400 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>

            <div>
               <Label className="text-sm font-bold text-gray-900 mb-2 block">Save Address As</Label>
               <div className="flex gap-2">
                 {["Home", "Work", "Other"].map(l => (
                   <Button 
                     key={l}
                     variant={addressFormData.label === l ? "default" : "outline"}
                     onClick={() => setAddressFormData({...addressFormData, label: l})}
                     className="flex-1"
                     style={addressFormData.label === l ? {backgroundColor: '#00c87e', color: 'white'} : {}}
                   >
                     {l}
                   </Button>
                 ))}
               </div>
            </div>
          </div>
        </div>

        <div
          className="fixed left-0 right-0 px-4 pt-4 bg-white dark:bg-[#1a1a1a] border-t dark:border-gray-800 transition-[bottom] duration-150"
          style={{ 
            bottom: `${keyboardInset}px`,
            paddingBottom: `calc(1.5rem + env(safe-area-inset-bottom))`
          }}
        >
          <Button 
            className="w-full h-12 text-white font-bold text-lg" 
            style={{backgroundColor: '#00c87e'}}
            onClick={handleAddressFormSubmit}
            disabled={loadingAddress}
          >
            {loadingAddress ? "Saving..." : "Save Address \u0026 Proceed"}
          </Button>
        </div>
      </AnimatedPage>
    )
  }

  return (
    <AnimatedPage className="min-h-screen bg-white dark:bg-[#0a0a0a] flex flex-col">
      <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800 px-4 py-4 flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={handleBack} className="rounded-full">
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <h1 className="text-xl font-bold">Select Location</h1>
      </div>

      <div className="flex-1 overflow-y-auto pb-10">
        <div className="p-4 bg-gray-50 dark:bg-gray-900 border-b dark:border-gray-800">
          <button 
            onClick={handleUseCurrentLocation}
            className="w-full flex items-center gap-4 p-4 bg-white dark:bg-[#1a1a1a] rounded-xl shadow-sm hover:shadow-md transition-all group"
          >
            <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <Navigation className="h-5 w-5 text-[#00c87e]" />
            </div>
            <div className="text-left flex-1">
              <p className="font-bold text-[#00c87e]">Use Current Location</p>
              <p className="text-xs text-gray-500 line-clamp-1">{currentAddress || "Enable GPS for accuracy"}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">Saved Addresses</h2>
            <Button variant="ghost" className="text-[#00c87e] hover:text-[#00c87e]/80 p-0 h-auto font-bold" onClick={handleAddAddressClick}>
              <Plus className="h-4 w-4 mr-1" /> Add New
            </Button>
          </div>

          <div className="space-y-4">
            {addresses.length === 0 ? (
              <div className="text-center py-10 opacity-50">
                <MapPin className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                <p>No addresses saved yet</p>
              </div>
            ) : (
              addresses.map((addr, idx) => {
                const Icon = getAddressIcon(addr)
                return (
                  <button
                    key={getAddressId(addr) || idx}
                    onClick={() => handleSelectSavedAddress(addr)}
                    className="w-full flex items-start gap-4 p-4 bg-slate-50 dark:bg-[#1a1a1a] rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-colors text-left group"
                  >
                    <div className="h-10 w-10 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center shadow-sm">
                      <Icon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 dark:text-white capitalize">{addr.label || "Address"}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">
                        {[addr.additionalDetails, addr.street, addr.city, addr.state].filter(Boolean).join(", ")}
                      </p>
                    </div>
                    <div className="h-6 w-6 rounded-full border border-gray-200 dark:border-gray-700 mt-2 flex items-center justify-center group-hover:border-[#00c87e]">
                       <ChevronRight className="h-3 w-3 text-gray-400 group-hover:text-[#00c87e]" />
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>
      <style>{`
        @keyframes bounce-short {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        .animate-bounce-short {
          animation: bounce-short 1s infinite ease-in-out;
        }
      `}</style>
    </AnimatedPage>
  )
}
