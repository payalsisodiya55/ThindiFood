import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { 
  GoogleMap, 
  useJsApiLoader, 
  OverlayView, 
  DirectionsService, 
  Polyline
} from '@react-google-maps/api';
import io from 'socket.io-client';
import { API_BASE_URL } from '@food/api/config';
import bikeLogo from '@food/assets/bikelogo.png';
import { subscribeOrderTracking } from '@food/realtimeTracking';
import { motion, AnimatePresence } from 'framer-motion';
import { Navigation } from 'lucide-react';

const LIBRARIES = ['geometry', 'places'];

const RIDER_BIKE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60">
  <circle cx="30" cy="30" r="28" fill="white" stroke="#ff8100" stroke-width="4" />
  <g transform="translate(15, 15) scale(1.2)">
    <path d="M19 7c0-1.1-.9-2-2-2h-3v2h3v2.65l-2.13 1.52c-.31.22-.5.57-.5.95V13h-4.4a2 2 0 00-1.92 1.45L6 20H2v2h4.5c1.07 0 1.97-.85 1.97-1.97V20l.4-1.2h3.13l.4 1.2c.4 1.2 1.5 2 2.77 2h.3c1.07 0 1.97-.85 1.97-1.97V20l-.4-1.2H14.1l-.33-1H18v-2h-2.17l-.67-2H18c1.1 0 2-.9 2-2V7h-1zM7 18h-.5C5.67 18 5 17.33 5 16.5S5.67 15 6.5 15H7v3zm8.5 0h-.5V15h.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z" fill="#ff8100" />
  </g>
</svg>`;

const RESTAURANT_PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="#FF6B35">
  <path d="M12 2C8.13 2 5 5.13 5 9c0 4.17 4.42 9.92 6.24 12.11.4.48 1.08.48 1.52 0C14.58 18.92 19 13.17 19 9c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5 14.5 7.62 14.5 9 13.38 11.5 12 11.5z"/>
  <circle cx="12" cy="9" r="3" fill="#FFFFFF"/>
</svg>`;

const CUSTOMER_PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="#10B981">
  <path d="M12 2C8.13 2 5 5.13 5 9c0 4.17 4.42 9.92 6.24 12.11.4.48 1.08.48 1.52 0C14.58 18.92 19 13.17 19 9c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5 14.5 7.62 14.5 9 13.38 11.5 12 11.5z"/>
  <circle cx="12" cy="9" r="3" fill="#FFFFFF"/>
</svg>`;

const debugLog = (...args) => console.log('[DeliveryTrackingMap]', ...args);

const DeliveryTrackingMap = ({
  orderId,
  orderTrackingIds = [],
  restaurantCoords,
  customerCoords,
  userLiveCoords = null,
  order = null,
  onEtaUpdate = null
}) => {
  const [map, setMap] = useState(null);
  const [riderLocation, setRiderLocation] = useState(null);
  const [directions, setDirections] = useState(null);
  const [baselineDirections, setBaselineDirections] = useState(null);
  const [lastDirectionsAt, setLastDirectionsAt] = useState(0);
  const [currentEta, setCurrentEta] = useState(null);
  const [cloudPolyline, setCloudPolyline] = useState(null);
  const [smoothLocation, setSmoothLocation] = useState(null);
  const [routeFlowOffset, setRouteFlowOffset] = useState(0);
  const [browserUserCoords, setBrowserUserCoords] = useState(null);
  const socketRef = useRef(null);
  const interpStateRef = useRef({ lastPos: null, nextPos: null, startTime: 0 });
  const riderLocationRef = useRef(null);
  const smoothLocationRef = useRef(null);
  const lastSmoothFrameRef = useRef(0);
  const lastSmoothValueRef = useRef(null);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries: LIBRARIES,
  });

  const trackingIds = useMemo(() => {
    const ids = [orderId, ...(Array.isArray(orderTrackingIds) ? orderTrackingIds : [])]
      .map(id => String(id || '').trim())
      .filter(Boolean);
    return [...new Set(ids)];
  }, [orderId, orderTrackingIds]);

  const backendUrl = useMemo(() => {
    return (API_BASE_URL || '').replace(/\/api\/v1\/?$/i, '').replace(/\/api\/?$/i, '');
  }, []);

  const trackingIdsKey = useMemo(() => trackingIds.join('|'), [trackingIds]);
  const hasAssignedRider = useMemo(() => {
    const dispatchPartnerId =
      order?.dispatch?.deliveryPartnerId?._id ||
      order?.dispatch?.deliveryPartnerId ||
      order?.deliveryPartnerId?._id ||
      order?.deliveryPartnerId ||
      order?.deliveryPartner?._id;
    const dispatchStatus = String(
      order?.dispatch?.status || order?.assignmentInfo?.status || ''
    ).toLowerCase();
    const currentLocation = order?.deliveryState?.currentLocation;
    const hasCurrentLocation =
      Number.isFinite(Number(currentLocation?.lat)) ||
      Number.isFinite(Number(currentLocation?.lng)) ||
      (Array.isArray(currentLocation?.coordinates) && currentLocation.coordinates.length >= 2);

    return Boolean(dispatchPartnerId) || dispatchStatus === 'accepted' || hasCurrentLocation;
  }, [order]);

  useEffect(() => {
    riderLocationRef.current = riderLocation;
  }, [riderLocation]);

  useEffect(() => {
    smoothLocationRef.current = smoothLocation;
  }, [smoothLocation]);

  // 1. Initial State from Order Payload
  useEffect(() => {
    const loc = order?.deliveryState?.currentLocation;
    if (loc && !riderLocation) {
      const lat = typeof loc.lat === 'number' ? loc.lat : (Array.isArray(loc.coordinates) ? Number(loc.coordinates[1]) : null);
      const lng = typeof loc.lng === 'number' ? loc.lng : (Array.isArray(loc.coordinates) ? Number(loc.coordinates[0]) : null);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setRiderLocation({ lat, lng, heading: loc.bearing || loc.heading || 0 });
      }
    }
  }, [order, riderLocation]);

  // 2. Core Data Sync (Socket + Firebase)
  useEffect(() => {
    if (!trackingIds.length || !hasAssignedRider) return;

    // A. FIREBASE FALLBACK
    const unsubs = trackingIds.map(id => subscribeOrderTracking(id, (data) => {
      const lat = Number(data?.lat ?? data?.boy_lat);
      const lng = Number(data?.lng ?? data?.boy_lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setRiderLocation(prev => ({
          lat,
          lng,
          heading: Number(data?.heading ?? data?.bearing ?? prev?.heading ?? 0)
        }));
      }

      // Sync Cloud Polyline and ETA to eliminate Directions API usage on user side
      if (data?.polyline) {
        debugLog('?? Received Cloud Polyline for live path');
        setCloudPolyline(data.polyline);
      }
      if (data?.eta) {
        debugLog('?? Received real-time ETA:', data.eta);
        setCurrentEta(data.eta);
        if (onEtaUpdate) onEtaUpdate(data.eta);
      }
    }));

    // B. SOCKET.IO REALTIME
    const token = localStorage.getItem('user_accessToken') || localStorage.getItem('accessToken') || '';
    socketRef.current = io(backendUrl, {
      transports: ['websocket'],
      auth: { token }
    });

    socketRef.current.on('connect', () => {
      trackingIds.forEach(id => socketRef.current.emit('join-tracking', id));
    });

    socketRef.current.on('location-update', (data) => {
      // Ensure data belongs to one of our tracked orders
      const matchedId = trackingIds.find(id => String(id) === String(data.orderId));
      if (data && matchedId && typeof data.lat === 'number') {
        const nextPos = {
          lat: data.lat,
          lng: data.lng,
          heading: data.heading || data.bearing || 0
        };
        
        // Trigger Smooth Interpolation
        interpStateRef.current = {
           lastPos: smoothLocationRef.current || riderLocationRef.current || nextPos,
           nextPos: nextPos,
           startTime: Date.now()
        };
        
        setRiderLocation(nextPos);
      }
    });

    return () => {
      unsubs.forEach(u => u?.());
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [trackingIdsKey, backendUrl, onEtaUpdate, hasAssignedRider]);

  // 3. Smooth Animation Loop (60 FPS Glide)
  useEffect(() => {
    let frame;
    const update = () => {
      const { lastPos, nextPos, startTime } = interpStateRef.current;
      if (lastPos && nextPos) {
        const duration = 5000; // Expected update interval (match rider app throttle)
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Linear Interpolation (LERP)
        const lat = lastPos.lat + (nextPos.lat - lastPos.lat) * progress;
        const lng = lastPos.lng + (nextPos.lng - lastPos.lng) * progress;
        
        // Heading interpolation (shortest path)
        let lastHead = lastPos.heading || 0;
        let nextHead = nextPos.heading || 0;
        if (Math.abs(nextHead - lastHead) > 180) {
          if (nextHead > lastHead) lastHead += 360;
          else nextHead += 360;
        }
        const heading = lastHead + (nextHead - lastHead) * progress;
        const nextSmooth = { lat, lng, heading: heading % 360 };
        const now = performance.now();
        const previous = lastSmoothValueRef.current;
        const movedEnough =
          !previous ||
          Math.abs(previous.lat - nextSmooth.lat) > 0.00001 ||
          Math.abs(previous.lng - nextSmooth.lng) > 0.00001 ||
          Math.abs((previous.heading || 0) - (nextSmooth.heading || 0)) > 1;

        if (movedEnough && now - lastSmoothFrameRef.current >= 1000 / 24) {
          lastSmoothFrameRef.current = now;
          lastSmoothValueRef.current = nextSmooth;
          setSmoothLocation(nextSmooth);
        }
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Use smooth location for sync if available
  const displayRiderLocation = smoothLocation || riderLocation;

  const tripStatus = order?.status || order?.orderStatus || 'pending';
  const isOrderPickedUp = ['picked_up', 'out_for_delivery', 'delivered'].includes(tripStatus.toLowerCase());

  // 2. Pro Camera: Intelligent Frame Management (Throttled)
  const lastCameraUpdateRef = useRef({ time: 0, status: null });
  
  useEffect(() => {
    if (!map || !restaurantCoords || !customerCoords || !isLoaded) return;
    
    const now = Date.now();
    const statusChanged = lastCameraUpdateRef.current.status !== isOrderPickedUp;
    const timeSinceLastUpdate = now - lastCameraUpdateRef.current.time;

    // Only fitBounds if status changed OR every 15 seconds to avoid flickering
    if (!statusChanged && timeSinceLastUpdate < 15000) return;

    lastCameraUpdateRef.current = { time: now, status: isOrderPickedUp };

    const bounds = new window.google.maps.LatLngBounds();
    
    if (riderLocation) {
      if (isOrderPickedUp) {
        bounds.extend(riderLocation);
        bounds.extend(customerCoords);
      } else {
        bounds.extend(riderLocation);
        bounds.extend(restaurantCoords);
      }
    } else {
      // Takeaway/no-rider flow: always keep both points visible so user<->restaurant route is clear.
      bounds.extend(restaurantCoords);
      bounds.extend(customerCoords);
    }

    map.fitBounds(bounds, { 
      top: 100, 
      bottom: 120, 
      left: 60, 
      right: 60 
    });
    
    debugLog(`[Camera] Focusing on ${isOrderPickedUp ? 'Delivery' : 'Pickup'} leg`);
  }, [map, riderLocation, restaurantCoords, customerCoords, isOrderPickedUp, isLoaded]);

  // 3. Directions Management
  const directionsCallback = useCallback((result, status) => {
    if (status === 'OK' && result) {
      setDirections(result);
      setLastDirectionsAt(Date.now());
      
      // Extract ETA from directions
      const durationText = result?.routes?.[0]?.legs?.[0]?.duration?.text;
      if (durationText) {
        setCurrentEta(durationText);
        if (onEtaUpdate) {
          onEtaUpdate(durationText);
        }
      }
    }
  }, [onEtaUpdate]);

  const shouldUpdateRoute = useMemo(() => {
    if (!directions) return true;
    return Date.now() - lastDirectionsAt > 15000;
  }, [directions, lastDirectionsAt]);

  const directionsServiceOptions = useMemo(() => {
    if (!riderLocation) return null;
    const dest = isOrderPickedUp ? customerCoords : restaurantCoords;
    if (!dest) return null;
    return {
      origin: riderLocation,
      destination: dest,
      travelMode: 'DRIVING'
    };
  }, [riderLocation?.lat, riderLocation?.lng, isOrderPickedUp, restaurantCoords?.lat, restaurantCoords?.lng, customerCoords?.lat, customerCoords?.lng]);

  const center = useMemo(() => {
    // Highly stable center: use restaurant or customer as anchor, not the moving rider
    const indoreCenter = { lat: 22.7196, lng: 75.8577 };
    if (isOrderPickedUp) return customerCoords || restaurantCoords || indoreCenter;
    return restaurantCoords || customerCoords || indoreCenter;
  }, [isOrderPickedUp, restaurantCoords, customerCoords]);

  const zoom = useMemo(() => 15, []);

  const baselineDirectionsServiceOptions = useMemo(() => {
    if (!restaurantCoords || !customerCoords) return null;
    return {
      origin: restaurantCoords,
      destination: customerCoords,
      travelMode: 'DRIVING'
    };
  }, [restaurantCoords?.lat, restaurantCoords?.lng, customerCoords?.lat, customerCoords?.lng]);

  const baselinePath = useMemo(() => {
    if (!baselineDirections || !window.google?.maps?.geometry?.encoding) return [];
    const route = baselineDirections?.routes?.[0];
    if (!route) return [];
    if (Array.isArray(route.overview_path) && route.overview_path.length > 2) {
      return route.overview_path;
    }
    const encoded = route?.overview_polyline?.points;
    if (!encoded) return [];
    try {
      const decoded = window.google.maps.geometry.encoding.decodePath(encoded);
      return Array.isArray(decoded) ? decoded : [];
    } catch (error) {
      console.error('[DeliveryTrackingMap] Failed to decode baseline route polyline', error);
      return [];
    }
  }, [baselineDirections]);

  useEffect(() => {
    if (
      userLiveCoords &&
      Number.isFinite(userLiveCoords.lat) &&
      Number.isFinite(userLiveCoords.lng)
    ) {
      setBrowserUserCoords({ lat: userLiveCoords.lat, lng: userLiveCoords.lng });
      return;
    }

    if (!navigator?.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position?.coords?.latitude);
        const lng = Number(position?.coords?.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          setBrowserUserCoords({ lat, lng });
        }
      },
      () => {
        // Silent fail: user denied permission or device unavailable.
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }, [userLiveCoords]);

  const decodedCloudPath = useMemo(() => {
    if (!cloudPolyline || !window.google?.maps?.geometry?.encoding) return [];
    const encoded = typeof cloudPolyline === 'string' ? cloudPolyline : (cloudPolyline?.points || '');
    if (!encoded) return [];
    try {
      const decoded = window.google.maps.geometry.encoding.decodePath(encoded);
      debugLog(`?? Decoded Cloud Polyline with ${decoded?.length || 0} points`);
      return Array.isArray(decoded) ? decoded : [];
    } catch (error) {
      console.error('[DeliveryTrackingMap] Failed to decode cloud polyline', error);
      return [];
    }
  }, [cloudPolyline]);

  const useCloudPolyline = decodedCloudPath.length > 2;
  const directionsPath = useMemo(() => {
    if (!directions || !window.google?.maps?.geometry?.encoding) return [];
    const route = directions?.routes?.[0];
    if (!route) return [];
    if (Array.isArray(route.overview_path) && route.overview_path.length > 2) {
      return route.overview_path;
    }
    const encoded = route?.overview_polyline?.points;
    if (!encoded) return [];
    try {
      const decoded = window.google.maps.geometry.encoding.decodePath(encoded);
      return Array.isArray(decoded) ? decoded : [];
    } catch (error) {
      console.error('[DeliveryTrackingMap] Failed to decode directions route polyline', error);
      return [];
    }
  }, [directions]);
  const activeRoutePath = useMemo(() => {
    if (useCloudPolyline) return decodedCloudPath;
    if (directionsPath.length > 2) return directionsPath;
    return baselinePath;
  }, [useCloudPolyline, decodedCloudPath, directionsPath, baselinePath]);

  useEffect(() => {
    const timer = setInterval(() => {
      setRouteFlowOffset((prev) => (prev + 2) % 100);
    }, 240);
    return () => clearInterval(timer);
  }, []);

  const openGoogleMapsRoute = useCallback(() => {
    if (!restaurantCoords || !customerCoords) return;
    const originPoint = browserUserCoords || customerCoords;
    const destinationPoint = restaurantCoords;
    const origin = `${originPoint.lat},${originPoint.lng}`;
    const destination = `${destinationPoint.lat},${destinationPoint.lng}`;
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
    window.open(mapsUrl, '_blank', 'noopener,noreferrer');
  }, [browserUserCoords, restaurantCoords, customerCoords]);

  if (!isLoaded) return <div className="w-full h-full bg-gray-100 animate-pulse" />;

  return (
    <div className="relative w-full h-full overflow-hidden rounded-2xl shadow-inner border border-gray-100">
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={center}
        zoom={zoom}
        onLoad={setMap}
        options={{
          disableDefaultUI: false,
          zoomControl: true,
          mapTypeControl: false,
          scaleControl: true,
          streetViewControl: false,
          rotateControl: false,
          fullscreenControl: false,
          gestureHandling: 'greedy',
          styles: [
            { featureType: 'poi', stylers: [{ visibility: 'off' }] },
            { featureType: 'transit', stylers: [{ visibility: 'off' }] }
          ]
        }}
      >
        {/* 1. PERSISTENT BASELINE (Full journey: Restaurant -> Customer) */}
        {!baselineDirections && baselineDirectionsServiceOptions && (
           <DirectionsService
             options={baselineDirectionsServiceOptions}
             callback={(r, s) => { 
                debugLog('?? Baseline Directions Status:', s);

                if (s === 'OK' && r) {
                    const points = r.routes[0]?.overview_path?.length || 0;
                    debugLog(`? Baseline directions SET with ${points} points`);
                    setBaselineDirections(r); 
                } else if (s !== 'OK') {
                  console.error('[DeliveryTrackingMap] DirectionsService failed:', s);
                }
             }}
           />
        )}

        {/* 1. PERSISTENT BASELINE (Full journey: Restaurant -> Customer) */}
        {baselinePath.length > 2 && (
          <Polyline
            path={baselinePath}
            options={{
              strokeColor: '#94a3b8', 
              strokeOpacity: 0, // Dotted
              strokeWeight: 4,
              zIndex: 5,
              icons: [{
                icon: { 
                  path: 'M 0,-1 0,1', 
                  strokeOpacity: 0.5, 
                  scale: 3, 
                  strokeWeight: 4,
                  strokeColor: '#64748b'
                },
                offset: '0',
                repeat: '15px'
              }]
            }}
          />
        )}

        {/* 2. LIVE RIDER LEG (From Rider's App: Current Rider Pos -> Target) */}
        {!useCloudPolyline && directionsServiceOptions && (
          <DirectionsService
            options={directionsServiceOptions}
            callback={shouldUpdateRoute ? directionsCallback : undefined}
          />
        )}

        {activeRoutePath.length > 2 && (
          <>
            {/* Blue glow layer */}
            <Polyline
              path={activeRoutePath}
              options={{
                strokeColor: '#60a5fa',
                strokeWeight: 12,
                strokeOpacity: 0.35,
                zIndex: 9
              }}
            />
            {/* Main blue route */}
            <Polyline
              path={activeRoutePath}
              options={{
                strokeColor: '#2563eb',
                strokeWeight: 6,
                strokeOpacity: 0.95,
                zIndex: 10
              }}
            />
            {/* Flowing accent for live feel */}
            <Polyline
              path={activeRoutePath}
              options={{
                strokeOpacity: 0,
                zIndex: 11,
                icons: [{
                  icon: {
                    path: 'M 0,-1 0,1',
                    strokeOpacity: 1,
                    scale: 3,
                    strokeWeight: 2,
                    strokeColor: '#bfdbfe'
                  },
                  offset: `${routeFlowOffset}%`,
                  repeat: '26px'
                }]
              }}
            />
          </>
        )}

        {/* RESTAURANT PIN (OVERLAY VIEW FOR CUSTOM STLYE) */}
        {restaurantCoords && (
          <OverlayView
            position={restaurantCoords}
            mapPaneName={OverlayView.MARKER_LAYER}
          >
            <div className="relative -translate-x-1/2 -translate-y-full mb-1 group">
               {/* Pulsing ring if this is the active destination */}
               {!isOrderPickedUp && (
                 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                   <motion.div 
                     animate={{ scale: [1, 2], opacity: [0.5, 0] }}
                     transition={{ duration: 2, repeat: Infinity }}
                     className="w-16 h-16 rounded-full border-4 border-orange-500/50"
                   />
                 </div>
               )}
               <div className="relative w-11 h-11 rounded-full p-1 bg-white shadow-xl border-2 border-orange-500 overflow-hidden group-hover:scale-110 transition-transform">
                  <img 
                    src={order?.restaurantLogo || order?.restaurantId?.logo || order?.restaurantId?.profileImage || `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(RESTAURANT_PIN_SVG)}`}
                    alt="Restaurant"
                    className="w-full h-full object-contain rounded-full bg-gray-50"
                    onError={(e) => { e.target.src = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(RESTAURANT_PIN_SVG)}`; }}
                  />
               </div>
               {/* Pin Tip */}
               <div className="absolute top-[100%] left-1/2 -translate-x-1/2 w-3 h-3 bg-orange-500 clip-triangle rotate-180 -mt-1 shadow-sm" style={{ clipPath: 'polygon(50% 100%, 0 0, 100% 0)' }} />
            </div>
          </OverlayView>
        )}

        {/* CUSTOMER PIN (OVERLAY VIEW FOR CUSTOM STYLE) */}
        {customerCoords && (
          <OverlayView
            position={customerCoords}
            mapPaneName={OverlayView.MARKER_LAYER}
          >
            <div className="relative -translate-x-1/2 -translate-y-full mb-1 group">
               {/* Pulsing ring if this is the active destination */}
               {isOrderPickedUp && (
                 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                   <motion.div 
                     animate={{ scale: [1, 2], opacity: [0.5, 0] }}
                     transition={{ duration: 2, repeat: Infinity }}
                     className="w-16 h-16 rounded-full border-4 border-green-500/50"
                   />
                 </div>
               )}
               <div className="relative w-11 h-11 rounded-full p-1 bg-white shadow-xl border-2 border-green-500 overflow-hidden group-hover:scale-110 transition-transform">
                  <img 
                    src={order?.customerImage || order?.userId?.profileImage || order?.userId?.avatar || `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(CUSTOMER_PIN_SVG)}`}
                    alt="Me"
                    className="w-full h-full object-contain rounded-full bg-gray-50"
                    onError={(e) => { e.target.src = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(CUSTOMER_PIN_SVG)}`; }}
                  />
               </div>
               {/* Pin Tip */}
               <div className="absolute top-[100%] left-1/2 -translate-x-1/2 w-3 h-3 bg-green-500 clip-triangle rotate-180 -mt-1 shadow-sm" style={{ clipPath: 'polygon(50% 100%, 0 0, 100% 0)' }} />
            </div>
          </OverlayView>
        )}

        {/* PRO RIDER (OVERLAY VIEW FOR SMOOTH ROTATION / GLIDE) */}
        {displayRiderLocation && (
          <OverlayView
            position={displayRiderLocation}
            mapPaneName={OverlayView.MARKER_LAYER}
          >
            <div 
              style={{
                transform: `translate(-50%, -50%) rotate(${displayRiderLocation.heading || 0}deg)`,
                transition: 'all 0.1s linear', // Micro-damping for heading
              }}
              className="relative w-16 h-16"
            >
              <img 
                src="/MapRider.png" 
                alt="Rider" 
                className="w-full h-full object-contain drop-shadow-2xl"
                onError={(e) => {
                  e.target.src = bikeLogo;
                }}
              />
            </div>
          </OverlayView>
        )}
      </GoogleMap>

      {/* 4. LIVE ARRIVAL BADGE (Pro Orange) */}
      <AnimatePresence>
        {riderLocation && currentEta && (
          <motion.div 
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="absolute top-4 left-4 z-[150] pointer-events-none"
          >
            <div className="bg-orange-500/95 backdrop-blur-xl rounded-2xl p-3 shadow-[0_10px_30px_rgba(249,115,22,0.4)] border border-orange-400/50 flex flex-col min-w-[90px] group overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
              <div className="flex flex-col z-10">
                <span className="text-[9px] text-white/80 font-black uppercase tracking-[0.2em] mb-0.5">Arrival</span>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-black text-white leading-none tracking-tighter">
                    {currentEta}
                  </span>
                  <div className="flex items-center gap-1.5 opacity-80">
                     <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                     <Navigation className="w-3 h-3 text-white rotate-45" />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {(tripStatus.toLowerCase() === 'pending' || tripStatus.toLowerCase() === 'placed' || tripStatus.toLowerCase() === 'created') && (
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[150] pointer-events-none w-full max-w-[280px]"
          >
            <div className="bg-white/95 backdrop-blur-md rounded-2xl px-5 py-4 shadow-[0_10px_40px_rgba(0,0,0,0.15)] border border-white/50 flex flex-col items-center text-center">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />
                <span className="text-sm font-black text-gray-900 uppercase tracking-widest">Order Pending</span>
              </div>
              <p className="text-xs text-gray-500 font-medium leading-tight">We're waiting for the restaurant to confirm your delicious meal</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!!restaurantCoords && !!customerCoords && (
        <div className="absolute top-4 right-4 z-20 max-w-[calc(100%-2rem)]">
          <button
            type="button"
            onClick={openGoogleMapsRoute}
            className="inline-flex max-w-full items-center gap-2 rounded-xl bg-white/95 backdrop-blur px-3 py-2 text-sm font-semibold text-gray-800 shadow-lg border border-gray-200 hover:bg-white transition-colors"
          >
            <Navigation className="w-4 h-4 text-blue-600" />
            <span>Google Maps</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default DeliveryTrackingMap;
