import { useState, useEffect, useRef } from "react"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { MapPin, Search, Save, Loader2, ArrowLeft } from "lucide-react"
import { toast } from "sonner"
import RestaurantNavbar from "@food/components/restaurant/RestaurantNavbar"
import { restaurantAPI, zoneAPI } from "@food/api"
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey"
import { Loader } from "@googlemaps/js-api-loader"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const GOOGLE_MAP_LIBRARIES = ["places", "geometry"]
const RESTAURANT_PIN_ICON_SVG = encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="36" height="56" viewBox="0 0 36 56">
    <rect x="16.5" y="28" width="3" height="20" rx="1.5" fill="#10b981"/>
    <circle cx="18" cy="18" r="12" fill="#10b981"/>
    <circle cx="18" cy="18" r="7" fill="#ffffff"/>
    <circle cx="18" cy="18" r="3.5" fill="#d1fae5"/>
  </svg>
`)

const parseCoordinate = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const normalizeZoneCoordinates = (zone) =>
  Array.isArray(zone?.coordinates)
    ? zone.coordinates
        .map((coord) => ({
          lat: Number(coord?.latitude),
          lng: Number(coord?.longitude),
        }))
        .filter((coord) => Number.isFinite(coord.lat) && Number.isFinite(coord.lng))
    : []

const isPointInPolygon = (lat, lng, polygon = []) => {
  if (!Array.isArray(polygon) || polygon.length < 3) return false

  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]?.lng
    const yi = polygon[i]?.lat
    const xj = polygon[j]?.lng
    const yj = polygon[j]?.lat

    if (![xi, yi, xj, yj].every(Number.isFinite)) continue

    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi

    if (intersect) inside = !inside
  }

  return inside
}

const getSavedLocationCoords = (location) => {
  if (!location) return null

  let lat = null
  let lng = null

  if (Array.isArray(location.coordinates) && location.coordinates.length >= 2) {
    lng = parseCoordinate(location.coordinates[0])
    lat = parseCoordinate(location.coordinates[1])
  }

  if (lat === null || lng === null) {
    lat = parseCoordinate(location.latitude)
    lng = parseCoordinate(location.longitude)
  }

  if (lat === null || lng === null) return null

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    const swappedLat = lng
    const swappedLng = lat

    if (
      swappedLat >= -90 && swappedLat <= 90 &&
      swappedLng >= -180 && swappedLng <= 180
    ) {
      return { lat: swappedLat, lng: swappedLng }
    }

    return null
  }

  return { lat, lng }
}

const isLocationReverificationPending = (restaurant) =>
  String(restaurant?.status || "").toLowerCase() === "pending" &&
  !!restaurant?.locationChangeRequest?.requestedAt

const getVerificationBannerMeta = (restaurant) => {
  if (!restaurant) return null

  if (isLocationReverificationPending(restaurant)) {
    return {
      title: "Re-verification pending",
      message:
        "Your re-verification request has been sent to the admin. Until your updated location is approved, your restaurant will not be visible to customers and you will not receive new orders.",
      className: "border-amber-200 bg-amber-50",
      titleClassName: "text-amber-900",
      messageClassName: "text-amber-800",
    }
  }

  if (String(restaurant?.status || "").toLowerCase() === "approved") {
    return {
      title: "Location verified",
      message:
        "Your restaurant location has been verified by the admin. Your restaurant is now visible to customers and you can receive new orders.",
      className: "border-emerald-200 bg-emerald-50",
      titleClassName: "text-emerald-900",
      messageClassName: "text-emerald-800",
    }
  }

  return null
}

export default function ZoneSetup() {
  const goBack = useRestaurantBackNavigation()
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markerRef = useRef(null)
  const zonePolygonsRef = useRef([])
  const zoneInfoWindowsRef = useRef([])
  const zoneMarkersRef = useRef([])
  const autocompleteInputRef = useRef(null)
  const autocompleteRef = useRef(null)
  
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState("")
  const [mapLoading, setMapLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [restaurantData, setRestaurantData] = useState(null)
  const [zones, setZones] = useState([])
  const [locationSearch, setLocationSearch] = useState("")
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [selectedAddress, setSelectedAddress] = useState("")
  const [selectedZoneLabel, setSelectedZoneLabel] = useState("")
  const verificationBanner = getVerificationBannerMeta(restaurantData)

  useEffect(() => {
    fetchRestaurantData()
    fetchZones()
    loadGoogleMaps()
  }, [])

  const renderZonePolygons = () => {
    if (!mapInstanceRef.current || !window.google) return

    zonePolygonsRef.current.forEach((polygon) => polygon.setMap(null))
    zoneInfoWindowsRef.current.forEach((infoWindow) => infoWindow.close())
    zoneMarkersRef.current.forEach((marker) => marker.setMap(null))
    zonePolygonsRef.current = []
    zoneInfoWindowsRef.current = []
    zoneMarkersRef.current = []

    const bounds = new window.google.maps.LatLngBounds()
    let hasZoneBounds = false

    zones.forEach((zone, index) => {
      const path = normalizeZoneCoordinates(zone)
      if (path.length < 3) return

      const polygon = new window.google.maps.Polygon({
        paths: path,
        map: mapInstanceRef.current,
        fillColor: index % 2 === 0 ? "#22c55e" : "#0ea5e9",
        fillOpacity: 0.22,
        strokeColor: index % 2 === 0 ? "#15803d" : "#0369a1",
        strokeOpacity: 1,
        strokeWeight: 3,
        clickable: true,
        editable: false,
      })

      path.forEach((point) => {
        bounds.extend(point)
        hasZoneBounds = true
      })

      const center = path.reduce(
        (acc, point) => ({
          lat: acc.lat + point.lat / path.length,
          lng: acc.lng + point.lng / path.length,
        }),
        { lat: 0, lng: 0 },
      )

      const zoneLabel = getZoneLabel(zone) || `Zone ${index + 1}`
      const marker = new window.google.maps.Marker({
        position: center,
        map: mapInstanceRef.current,
        label: {
          text: String(index + 1),
          color: "#ffffff",
          fontWeight: "700",
        },
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 14,
          fillColor: index % 2 === 0 ? "#15803d" : "#0369a1",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
        title: zoneLabel,
        zIndex: 1000,
      })

      const infoWindow = new window.google.maps.InfoWindow({
        content: `
          <div style="padding: 10px 12px; min-width: 160px;">
            <div style="font-size: 14px; font-weight: 700; color: #0f172a;">${zoneLabel}</div>
            <div style="font-size: 12px; color: #475569; margin-top: 4px;">Admin service zone</div>
          </div>
        `,
      })

      polygon.addListener("click", async (event) => {
        zoneInfoWindowsRef.current.forEach((currentInfoWindow) => currentInfoWindow.close())
        infoWindow.setPosition(center)
        infoWindow.open(mapInstanceRef.current)

        const clickedLat = event?.latLng?.lat?.()
        const clickedLng = event?.latLng?.lng?.()
        if (Number.isFinite(clickedLat) && Number.isFinite(clickedLng)) {
          const address = await reverseGeocodeLocation(clickedLat, clickedLng)
          setLocationSearch(address)
          setSelectedAddress(address)
          setSelectedZoneLabel(zoneLabel)
          setSelectedLocation({ lat: clickedLat, lng: clickedLng, address })
          updateMarker(clickedLat, clickedLng, address)
        }
      })

      polygon.__zoneData = zone

      marker.addListener("click", () => {
        zoneInfoWindowsRef.current.forEach((currentInfoWindow) => currentInfoWindow.close())
        infoWindow.open(mapInstanceRef.current, marker)
      })

      zonePolygonsRef.current.push(polygon)
      zoneMarkersRef.current.push(marker)
      zoneInfoWindowsRef.current.push(infoWindow)
    })

    const hasSelectedLocation = Boolean(selectedLocation || restaurantData?.location)
    if (hasZoneBounds && !hasSelectedLocation) {
      mapInstanceRef.current.fitBounds(bounds, 40)
    }
  }

  useEffect(() => {
    renderZonePolygons()
  }, [zones, selectedLocation, restaurantData])

  const findZoneFromRenderedPolygons = (lat, lng) => {
    if (!window.google?.maps?.geometry?.poly || zonePolygonsRef.current.length === 0) return null

    const point = new window.google.maps.LatLng(lat, lng)

    for (const polygon of zonePolygonsRef.current) {
      const isInside = window.google.maps.geometry.poly.containsLocation(point, polygon)
      const isOnEdge = window.google.maps.geometry.poly.isLocationOnEdge(point, polygon, 1e-6)
      if (isInside || isOnEdge) {
        return polygon.__zoneData || null
      }
    }

    return null
  }

  const getMatchingZone = (lat, lng) => {
    const renderedZoneMatch = findZoneFromRenderedPolygons(lat, lng)
    if (renderedZoneMatch) return renderedZoneMatch

    return zones.find((zone) => isPointInPolygon(lat, lng, normalizeZoneCoordinates(zone))) || null
  }

  const getZoneLabel = (zone) =>
    zone?.serviceLocation || zone?.zoneName || zone?.name || ""

  const validateLocationInZone = (lat, lng, options = {}) => {
    const matchingZone = getMatchingZone(lat, lng)
    if (!matchingZone) {
      if (options.showAlert !== false) {
        toast.error("You can select your restaurant location only inside the admin service zones.")
      }
      return null
    }
    return matchingZone
  }

  const fetchZones = async () => {
    try {
      const response = await zoneAPI.getPublicZones()
      const zoneList = response?.data?.data?.zones || response?.data?.zones || []
      setZones(Array.isArray(zoneList) ? zoneList : [])
    } catch (error) {
      debugError("Error fetching zones:", error)
      setZones([])
    }
  }

  const reverseGeocodeLocation = async (lat, lng) => {
    if (!window.google?.maps?.Geocoder || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
    }

    try {
      const geocoder = new window.google.maps.Geocoder()
      const result = await new Promise((resolve, reject) => {
        geocoder.geocode({ location: { lat, lng } }, (results, status) => {
          if (status === "OK" && Array.isArray(results) && results[0]) {
            resolve(results[0])
            return
          }

          reject(new Error(status || "GEOCODER_FAILED"))
        })
      })

      return result?.formatted_address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`
    } catch (error) {
      debugWarn("Reverse geocode failed:", error)
      return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
    }
  }

  // Initialize Places Autocomplete when map is loaded
  useEffect(() => {
    if (!mapLoading && mapInstanceRef.current && autocompleteInputRef.current && window.google?.maps?.places && !autocompleteRef.current) {
      const autocomplete = new window.google.maps.places.Autocomplete(autocompleteInputRef.current, {
        componentRestrictions: { country: 'in' } // Restrict to India
      })
      
      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace()
        if (place.geometry && place.geometry.location && mapInstanceRef.current) {
          const location = place.geometry.location
          const lat = location.lat()
          const lng = location.lng()
          const matchedZone = validateLocationInZone(lat, lng)
          if (!matchedZone) {
            return
          }
          
          // Center map on selected location
          mapInstanceRef.current.setCenter(location)
          mapInstanceRef.current.setZoom(17) // Zoom in when location is selected
          
          // Set the search input value
          const address = place.formatted_address || place.name || ""
          setLocationSearch(address)
          setSelectedAddress(address)
          setSelectedZoneLabel(getZoneLabel(matchedZone))
          
          // Update marker position
          updateMarker(lat, lng, address)
          
          // Set selected location
          setSelectedLocation({ lat, lng, address })
        }
      })
      
      autocompleteRef.current = autocomplete
    }
  }, [mapLoading, zones])

  // Load existing restaurant location when data is fetched
  useEffect(() => {
    if (restaurantData?.location && mapInstanceRef.current && !mapLoading && window.google) {
      const location = restaurantData.location
      const savedCoords = getSavedLocationCoords(location)

      if (savedCoords) {
        const { lat, lng } = savedCoords
        const locationObj = new window.google.maps.LatLng(lat, lng)
        mapInstanceRef.current.setCenter(locationObj)
        mapInstanceRef.current.setZoom(17)
        
        const address = location.formattedAddress || location.address || formatAddress(location) || ""
        setLocationSearch(address)
        setSelectedAddress(address)
        setSelectedLocation({ lat, lng, address })
        setSelectedZoneLabel(getZoneLabel(getMatchingZone(lat, lng)))
        
        updateMarker(lat, lng, address)
      }
    }
  }, [restaurantData, mapLoading, zones])

  const fetchRestaurantData = async () => {
    try {
      const response = await restaurantAPI.getCurrentRestaurant()
      const data = response?.data?.data?.restaurant || response?.data?.restaurant
      if (data) {
        setRestaurantData(data)
      }
    } catch (error) {
      debugError("Error fetching restaurant data:", error)
    }
  }

  const loadGoogleMaps = async () => {
    try {
      debugLog("?? Starting Google Maps load...")
      
      // Fetch API key from database
      let apiKey = null
      try {
        apiKey = await getGoogleMapsApiKey()
        debugLog("?? API Key received:", apiKey ? `Yes (${apiKey.substring(0, 10)}...)` : "No")
        
        if (!apiKey || apiKey.trim() === "") {
          debugError("? API key is empty or not found in database")
          setMapLoading(false)
          alert("Google Maps API key not found in database. Please contact administrator to add the API key in admin panel.")
          return
        }
      } catch (apiKeyError) {
        debugError("? Error fetching API key from database:", apiKeyError)
        setMapLoading(false)
        alert("Failed to fetch Google Maps API key from database. Please check your connection or contact administrator.")
        return
      }
      
      setGoogleMapsApiKey(apiKey)
      
      // Wait for Google Maps to be loaded from main.jsx if it's loading
      let retries = 0
      const maxRetries = 100 // Wait up to 10 seconds
      
      debugLog("?? Waiting for Google Maps to load from main.jsx...")
      while (!window.google && retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100))
        retries++
      }

      // Wait for mapRef to be available (retry mechanism)
      let refRetries = 0
      const maxRefRetries = 50 // Wait up to 5 seconds for ref
      while (!mapRef.current && refRetries < maxRefRetries) {
        await new Promise(resolve => setTimeout(resolve, 100))
        refRetries++
      }

      if (!mapRef.current) {
        debugError("? mapRef.current is still null after waiting")
        setMapLoading(false)
        alert("Failed to initialize map container. Please refresh the page.")
        return
      }

      // If Google Maps is already loaded with required libraries, use it directly
      if (window.google && window.google.maps && window.google.maps.geometry) {
        debugLog("? Google Maps already loaded from main.jsx, initializing map...")
        initializeMap(window.google)
        return
      }

      // If Google Maps is not loaded yet, or geometry library is missing, use Loader as fallback
      if (apiKey) {
        debugLog("?? Google Maps not loaded from main.jsx, loading with Loader...")
        const loader = new Loader({
          apiKey: apiKey,
          version: "weekly",
          libraries: GOOGLE_MAP_LIBRARIES
        })

        const google = await loader.load()
        debugLog("? Google Maps loaded via Loader, initializing map...")
        initializeMap(google)
      } else {
        debugError("? No API key available")
        setMapLoading(false)
        alert("Google Maps API key not found. Please contact administrator.")
      }
    } catch (error) {
      debugError("? Error loading Google Maps:", error)
      setMapLoading(false)
      alert(`Failed to load Google Maps: ${error.message}. Please refresh the page or contact administrator.`)
    }
  }

  const initializeMap = (google) => {
    try {
      if (!mapRef.current) {
        debugError("? mapRef.current is null in initializeMap")
        setMapLoading(false)
        return
      }

      debugLog("?? Initializing map...")
      // Initial location (India center)
      const initialLocation = { lat: 20.5937, lng: 78.9629 }

      // Create map
      const map = new google.maps.Map(mapRef.current, {
        center: initialLocation,
        zoom: 5,
        mapTypeControl: true,
        mapTypeControlOptions: {
          style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
          position: google.maps.ControlPosition.TOP_RIGHT,
          mapTypeIds: [google.maps.MapTypeId.ROADMAP, google.maps.MapTypeId.SATELLITE]
        },
        zoomControl: true,
        streetViewControl: false,
        fullscreenControl: true,
        scrollwheel: true,
        gestureHandling: 'greedy',
        disableDoubleClickZoom: false,
      })

      mapInstanceRef.current = map
      renderZonePolygons()
      debugLog("? Map initialized successfully")

      // Add click listener to place marker
      map.addListener('click', async (event) => {
        const lat = event.latLng.lat()
        const lng = event.latLng.lng()
        const matchedZone = validateLocationInZone(lat, lng)
        if (!matchedZone) {
          return
        }
        const address = await reverseGeocodeLocation(lat, lng)
        setLocationSearch(address)
        setSelectedAddress(address)
        setSelectedZoneLabel(getZoneLabel(matchedZone))
        setSelectedLocation({ lat, lng, address })
        updateMarker(lat, lng, address)
      })

      setMapLoading(false)
      debugLog("? Map loading complete")
    } catch (error) {
      debugError("? Error in initializeMap:", error)
      setMapLoading(false)
      alert("Failed to initialize map. Please refresh the page.")
    }
  }

  const updateMarker = (lat, lng, address) => {
    if (!mapInstanceRef.current || !window.google) return

    // Remove existing marker
    if (markerRef.current) {
      markerRef.current.setMap(null)
    }

    // Create new marker
    const marker = new window.google.maps.Marker({
      position: { lat, lng },
      map: mapInstanceRef.current,
      draggable: true,
      animation: window.google.maps.Animation.DROP,
      title: address || "Restaurant Location",
      icon: {
        url: `data:image/svg+xml;charset=UTF-8,${RESTAURANT_PIN_ICON_SVG}`,
        scaledSize: new window.google.maps.Size(36, 56),
        anchor: new window.google.maps.Point(18, 48),
      },
    })

    // Add info window
    const infoWindow = new window.google.maps.InfoWindow({
      content: `
        <div style="padding: 8px; max-width: 250px;">
          <strong>Restaurant Location</strong><br/>
          <small>${address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`}</small>
        </div>
      `
    })

    marker.addListener('click', () => {
      infoWindow.open(mapInstanceRef.current, marker)
    })

    // Update location when marker is dragged
    marker.addListener('dragend', async (event) => {
      const newLat = event.latLng.lat()
      const newLng = event.latLng.lng()
      const matchedZone = validateLocationInZone(newLat, newLng)
      if (!matchedZone) {
        marker.setPosition({ lat, lng })
        return
      }
      const newAddress = await reverseGeocodeLocation(newLat, newLng)
      setLocationSearch(newAddress)
      setSelectedAddress(newAddress)
      setSelectedZoneLabel(getZoneLabel(matchedZone))
      setSelectedLocation({ lat: newLat, lng: newLng, address: newAddress })
    })

    markerRef.current = marker
  }

  const formatAddress = (location) => {
    if (!location) return ""
    
    if (location.formattedAddress && location.formattedAddress.trim() !== "") {
      return location.formattedAddress.trim()
    }
    
    if (location.address && location.address.trim() !== "") {
      return location.address.trim()
    }
    
    const parts = []
    if (location.addressLine1) parts.push(location.addressLine1.trim())
    if (location.addressLine2) parts.push(location.addressLine2.trim())
    if (location.area) parts.push(location.area.trim())
    if (location.city) parts.push(location.city.trim())
    if (location.state) parts.push(location.state.trim())
    if (location.zipCode || location.pincode) parts.push((location.zipCode || location.pincode).trim())
    
    return parts.length > 0 ? parts.join(", ") : ""
  }

  const handleSaveLocation = async () => {
    if (!selectedLocation) {
      alert("Please select a location on the map first")
      return
    }

    const matchedZone = validateLocationInZone(selectedLocation.lat, selectedLocation.lng)
    if (!matchedZone) {
      return
    }

    try {
      setSaving(true)
      
      const { lat, lng, address } = selectedLocation
      
      // Update restaurant location
      const response = await restaurantAPI.updateProfile({
        location: {
          ...(restaurantData?.location || {}),
          latitude: lat,
          longitude: lng,
          coordinates: [lng, lat], // GeoJSON format: [longitude, latitude]
          formattedAddress: address
        }
      })

      if (response?.data?.data?.restaurant) {
        setRestaurantData(response.data.data.restaurant)
        toast.success("Location updated. Your re-verification request has been sent to the admin.")
      } else {
        throw new Error("Failed to save location")
      }
    } catch (error) {
      debugError("Error saving location:", error)
      alert(error.response?.data?.message || "Failed to save location. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <RestaurantNavbar
        restaurantName={restaurantData?.restaurantName || restaurantData?.name}
        location={selectedAddress || formatAddress(restaurantData?.location)}
      />
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div className="flex items-center gap-3 mb-4 md:mb-0">
            {/* Back Button */}
            <button
              onClick={goBack}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </button>
            <div className="w-10 h-10 rounded-lg bg-red-500 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Zone Setup</h1>
              <p className="text-sm text-gray-600">Set your restaurant location on the map</p>
            </div>
          </div>
        </div>

        {verificationBanner && (
          <div className={`mb-6 rounded-xl border px-4 py-3 ${verificationBanner.className}`}>
            <p className={`text-sm font-semibold mb-1 ${verificationBanner.titleClassName}`}>
              {verificationBanner.title}
            </p>
            <p className={`text-sm leading-6 ${verificationBanner.messageClassName}`}>
              {verificationBanner.message}
            </p>
          </div>
        )}

        {/* Search Bar */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                ref={autocompleteInputRef}
                type="text"
                value={locationSearch}
                onChange={(e) => setLocationSearch(e.target.value)}
                placeholder="Search for your restaurant location..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={handleSaveLocation}
              disabled={!selectedLocation || saving}
              className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  <span>Save Location</span>
                </>
              )}
            </button>
          </div>
          {selectedLocation && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-gray-700">
                <strong>Selected Location:</strong> {selectedAddress}
              </p>
              {selectedZoneLabel ? (
                <p className="text-xs text-emerald-700 mt-1">
                  Zone: {selectedZoneLabel}
                </p>
              ) : null}
              <p className="text-xs text-gray-500 mt-1">
                Coordinates: {selectedLocation.lat.toFixed(6)}, {selectedLocation.lng.toFixed(6)}
              </p>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">How to set your location:</h3>
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            <li>Search for your location using the search bar above, or</li>
            <li>Click anywhere inside the highlighted admin service zones to place a pin</li>
            <li>You can drag the pin, but only within the highlighted zones</li>
            <li>Click "Save Location" to save your restaurant location</li>
          </ul>
        </div>

        {zones.length > 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Admin Service Zones</h3>
            <div className="flex flex-wrap gap-2">
              {zones.map((zone, index) => (
                <span
                  key={zone?._id || zone?.id || `${getZoneLabel(zone)}-${index}`}
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium text-gray-700"
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: index % 2 === 0 ? "#15803d" : "#0369a1" }}
                  />
                  {getZoneLabel(zone) || `Zone ${index + 1}`}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {/* Map Container */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden relative">
          {/* Always render the map div, show loading overlay on top */}
          <div ref={mapRef} className="w-full h-[600px]" style={{ minHeight: '600px' }} />
          {mapLoading && (
            <div className="absolute inset-0 bg-white flex items-center justify-center z-10">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin text-red-600 mx-auto mb-2" />
                <p className="text-gray-600">Loading map...</p>
                <p className="text-xs text-gray-400 mt-2">If this takes too long, please refresh the page</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

