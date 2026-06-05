import { useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Input } from "@food/components/ui/input"
import { Button } from "@food/components/ui/button"
import { Label } from "@food/components/ui/label"
import { Image as ImageIcon, Upload, Clock, Calendar as CalendarIcon, Sparkles, X, LogOut, Eye, EyeOff } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@food/components/ui/popover"
import { Calendar } from "@food/components/ui/calendar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@food/components/ui/select"
import { Switch } from "@food/components/ui/switch"
import { restaurantAPI, zoneAPI, api } from "@food/api"
import { MobileTimePicker } from "@mui/x-date-pickers/MobileTimePicker"
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider"
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns"
import { determineStepToShow } from "@food/utils/onboardingUtils"
import { toast } from "sonner"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey"
import {
  clearModuleAuth,
  clearAuthData,
  getCurrentUser,
  getRestaurantPendingPhone,
  isModuleAuthenticated,
} from "@food/utils/auth"
import { ImageSourcePicker } from "@food/components/ImageSourcePicker"
import { isFlutterBridgeAvailable, openCamera } from "@food/utils/imageUploadUtils"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const ESTIMATED_DELIVERY_TIME_OPTIONS = [
  "10-15 mins",
  "15-20 mins",
  "20-25 mins",
  "25-30 mins",
  "30-35 mins",
  "35-40 mins",
  "40-45 mins",
  "45-50 mins",
  "50-60 mins",
]

const ONBOARDING_STORAGE_KEY = "restaurant_onboarding_data"
const PAN_NUMBER_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/
const GST_NUMBER_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const FSSAI_NUMBER_REGEX = /^\d{14}$/
const BANK_ACCOUNT_NUMBER_REGEX = /^\d{9,18}$/
const IFSC_CODE_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/
const ACCOUNT_HOLDER_NAME_REGEX = /^[A-Za-z ]+$/
const GST_LEGAL_NAME_REGEX = /^[A-Za-z ]+$/
const FEATURED_DISH_NAME_REGEX = /^[A-Za-z ]+$/
const LOCAL_IMAGE_FILE_ACCEPT = ".jpg,.jpeg,.png,.webp"
const GALLERY_IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 // 5MB
const MAX_MENU_IMAGES_COUNT = 10
const VALID_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
const INDIAN_PRIMARY_CONTACT_REGEX = /^(?:[6-9]\d{9}|0\d{10}|\d{10,11})$/
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,6}$/
const CITY_CENTER_PINCODES = {
  "indore|madhya pradesh": "452001",
}
const ONBOARDING_FILES_DB_NAME = "restaurant_onboarding_files"
const ONBOARDING_FILES_STORE_NAME = "drafts"
const ONBOARDING_FILES_RECORD_KEY = "current"

const normalizeAddressToken = (value = "") =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")

let onboardingFileCache = {
  step2: {
    menuImages: [],
    profileImage: null,
  },
  step3: {
    panImage: null,
    gstImage: null,
    fssaiImage: null,
  },
}

const isUploadableFile = (value) => {
  if (!value || typeof value !== "object") return false

  if (typeof File !== "undefined" && value instanceof File) return true
  if (typeof Blob !== "undefined" && value instanceof Blob) return true

  return (
    typeof value.size === "number" &&
    (typeof value.slice === "function" || typeof value.arrayBuffer === "function")
  )
}

const getPersistedImageUrl = (value) => {
  if (!value || isUploadableFile(value)) return ""
  if (typeof value === "string") {
    return value.startsWith("http") ? value : ""
  }
  const url = value.url || value.secure_url || value.path || ""
  return typeof url === "string" && url.startsWith("http") ? url : ""
}

const getPersistedImageUrls = (values = []) =>
  (Array.isArray(values) ? values : [])
    .map((value) => getPersistedImageUrl(value))
    .filter(Boolean)

const normalizePhoneDigits = (value) => String(value || "").replace(/\D/g, "").slice(-15)
const normalizePrimaryContactNumber = (value) =>
  String(value || "").replace(/\D/g, "").slice(0, 11)

const isValidIndianPrimaryContactNumber = (value) =>
  INDIAN_PRIMARY_CONTACT_REGEX.test(normalizePrimaryContactNumber(value))

const validateFile = (file) => {
  if (!file) return false
  if (!VALID_IMAGE_TYPES.includes(file.type.toLowerCase())) {
    toast.error(`${file.name} format is not supported. Please use JPG, PNG or WEBP.`)
    return false
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    toast.error(`${file.name} is too large (${(file.size / (1024 * 1024)).toFixed(2)}MB). Max size is 5MB.`)
    return false
  }
  return true
}

const getVerifiedPhoneFromStoredRestaurant = () => {
  try {
    const pending = localStorage.getItem("restaurant_pendingPhone")
    if (pending && pending.trim()) {
      return pending.trim()
    }

    const storedUser = localStorage.getItem("restaurant_user")
    if (!storedUser) return ""
    const user = JSON.parse(storedUser)
    const candidates = [
      user?.ownerPhone,
      user?.primaryContactNumber,
      user?.phone,
      user?.phoneNumber,
      user?.mobile,
      user?.contactNumber,
      user?.contact?.phone,
      user?.owner?.phone,
      user?.restaurant?.phone,
    ]
    const phone = candidates.find((value) => typeof value === "string" && value.trim())
    return phone ? phone.trim() : ""
  } catch {
    return ""
  }
}

const normalizeAccountTypeValue = (value) => {
  const normalized = String(value || "").trim().toLowerCase()
  if (normalized === "saving" || normalized === "savings") return "Saving"
  if (normalized === "current") return "Current"
  return ""
}

const normalizeZoneIdValue = (value) => {
  if (!value) return ""
  if (typeof value === "string") return value
  return String(value?._id || value?.id || value || "")
}

const FSSAI_VALIDITY_YEARS = 5
const getTodayLocalYMD = () => formatDateToLocalYMD(new Date())

// Helper functions for localStorage
const saveOnboardingToLocalStorage = (step1, step2, step3, step4, currentStep) => {
  try {
    // Persist only stable URL-based values. File/Blob objects are not serializable and
    // restoring metadata-only placeholders breaks preview/upload flows.
    const serializableStep2 = {
      ...step2,
      menuImages: (step2.menuImages || []).filter(
        (img) => !isUploadableFile(img) && (img?.url || (typeof img === "string" && img.startsWith("http")))
      ),
      profileImage:
        !isUploadableFile(step2.profileImage) &&
        (step2.profileImage?.url || (typeof step2.profileImage === "string" && step2.profileImage.startsWith("http")))
          ? step2.profileImage
          : null,
    }

    const serializableStep3 = {
      ...step3,
      panImage:
        !isUploadableFile(step3.panImage) &&
        (step3.panImage?.url || (typeof step3.panImage === "string" && step3.panImage.startsWith("http")))
          ? step3.panImage
          : null,
      gstImage:
        !isUploadableFile(step3.gstImage) &&
        (step3.gstImage?.url || (typeof step3.gstImage === "string" && step3.gstImage.startsWith("http")))
          ? step3.gstImage
          : null,
      fssaiImage:
        !isUploadableFile(step3.fssaiImage) &&
        (step3.fssaiImage?.url || (typeof step3.fssaiImage === "string" && step3.fssaiImage.startsWith("http")))
          ? step3.fssaiImage
          : null,
    }

    const dataToSave = {
      step1,
      step2: serializableStep2,
      step3: serializableStep3,
      step4: step4 || {},
      currentStep,
      timestamp: Date.now(),
    }
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(dataToSave))
  } catch (error) {
    debugError("Failed to save onboarding data to localStorage:", error)
  }
}

const loadOnboardingFromLocalStorage = () => {
  try {
    const stored = localStorage.getItem(ONBOARDING_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    debugError("Failed to load onboarding data from localStorage:", error)
  }
  return null
}

const clearOnboardingFromLocalStorage = () => {
  try {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY)
  } catch (error) {
    debugError("Failed to clear onboarding data from localStorage:", error)
  }
}

const openOnboardingFilesDb = () =>
  new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      resolve(null)
      return
    }

    const request = window.indexedDB.open(ONBOARDING_FILES_DB_NAME, 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(ONBOARDING_FILES_STORE_NAME)) {
        db.createObjectStore(ONBOARDING_FILES_STORE_NAME)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const withOnboardingFilesStore = async (mode, handler) => {
  const db = await openOnboardingFilesDb()
  if (!db) return null

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ONBOARDING_FILES_STORE_NAME, mode)
    const store = transaction.objectStore(ONBOARDING_FILES_STORE_NAME)
    const request = handler(store)

    transaction.oncomplete = () => {
      db.close()
    }

    transaction.onerror = () => {
      reject(transaction.error)
      db.close()
    }

    if (!request) {
      resolve(null)
      return
    }

    request.onsuccess = () => resolve(request.result ?? null)
    request.onerror = () => reject(request.error)
  })
}

const loadOnboardingFilesFromIndexedDb = async () => {
  try {
    return await withOnboardingFilesStore("readonly", (store) =>
      store.get(ONBOARDING_FILES_RECORD_KEY)
    )
  } catch (error) {
    debugError("Failed to load onboarding files from IndexedDB:", error)
    return null
  }
}

const saveOnboardingFilesToIndexedDb = async (step2, step3) => {
  try {
    const payload = {
      step2: {
        menuImages: (step2?.menuImages || []).filter((img) => isUploadableFile(img)),
        profileImage: isUploadableFile(step2?.profileImage) ? step2.profileImage : null,
      },
      step3: {
        panImage: isUploadableFile(step3?.panImage) ? step3.panImage : null,
        gstImage: isUploadableFile(step3?.gstImage) ? step3.gstImage : null,
        fssaiImage: isUploadableFile(step3?.fssaiImage) ? step3.fssaiImage : null,
      },
      updatedAt: Date.now(),
    }

    await withOnboardingFilesStore("readwrite", (store) =>
      store.put(payload, ONBOARDING_FILES_RECORD_KEY)
    )
  } catch (error) {
    debugError("Failed to save onboarding files to IndexedDB:", error)
  }
}

const clearOnboardingFilesFromIndexedDb = async () => {
  try {
    await withOnboardingFilesStore("readwrite", (store) =>
      store.delete(ONBOARDING_FILES_RECORD_KEY)
    )
  } catch (error) {
    debugError("Failed to clear onboarding files from IndexedDB:", error)
  }
}

const hasPersistedOnboardingDraft = (localData, draftFiles) => {
  if (localData?.step1) {
    const hasStep1Data =
      !!localData.step1.restaurantName ||
      typeof localData.step1.pureVegRestaurant === "boolean" ||
      !!localData.step1.ownerName ||
      !!localData.step1.ownerEmail ||
      !!localData.step1.primaryContactNumber ||
      !!localData.step1.zoneId ||
      !!localData.step1.location?.formattedAddress ||
      !!localData.step1.location?.area ||
      !!localData.step1.location?.city ||
      !!localData.step1.location?.state ||
      !!localData.step1.location?.pincode
    if (hasStep1Data) return true
  }

  if (localData?.step2) {
    const hasStep2Data =
      (localData.step2.menuImages || []).length > 0 ||
      !!localData.step2.profileImage ||
      (localData.step2.cuisines || []).length > 0 ||
      !!localData.step2.openingTime ||
      !!localData.step2.closingTime ||
      (localData.step2.openDays || []).length > 0
    if (hasStep2Data) return true
  }

  if (localData?.step3) {
    const hasStep3Data =
      !!localData.step3.panNumber ||
      !!localData.step3.nameOnPan ||
      !!localData.step3.panImage ||
      !!localData.step3.gstNumber ||
      !!localData.step3.gstImage ||
      !!localData.step3.fssaiNumber ||
      !!localData.step3.fssaiImage ||
      !!localData.step3.accountNumber ||
      !!localData.step3.ifscCode ||
      !!localData.step3.accountHolderName
    if (hasStep3Data) return true
  }

  if (localData?.step4) {
    const hasStep4Data =
      !!localData.step4.estimatedDeliveryTime ||
      !!localData.step4.featuredDish ||
      !!localData.step4.offer ||
      localData.step4.selfDeliveryEnabled === true
    if (hasStep4Data) return true
  }

  return (
    (draftFiles?.step2?.menuImages || []).length > 0 ||
    !!draftFiles?.step2?.profileImage ||
    !!draftFiles?.step3?.panImage ||
    !!draftFiles?.step3?.gstImage ||
    !!draftFiles?.step3?.fssaiImage
  )
}

const syncOnboardingFileCache = (step2, step3) => {
  onboardingFileCache = {
    step2: {
      menuImages: (step2?.menuImages || []).filter((img) => isUploadableFile(img)),
      profileImage: isUploadableFile(step2?.profileImage) ? step2.profileImage : null,
    },
    step3: {
      panImage: isUploadableFile(step3?.panImage) ? step3.panImage : null,
      gstImage: isUploadableFile(step3?.gstImage) ? step3.gstImage : null,
      fssaiImage: isUploadableFile(step3?.fssaiImage) ? step3.fssaiImage : null,
    },
  }
}

const clearOnboardingFileCache = () => {
  onboardingFileCache = {
    step2: {
      menuImages: [],
      profileImage: null,
    },
    step3: {
      panImage: null,
      gstImage: null,
      fssaiImage: null,
    },
  }
}

// Helper function to convert "HH:mm" string to Date object
const stringToTime = (timeString) => {
  const normalized = normalizeTimeValue(timeString)
  if (!normalized || !normalized.includes(":")) {
    return null
  }
  const [hours, minutes] = normalized.split(":").map(Number)
  return new Date(2000, 0, 1, hours || 0, minutes || 0)
}

// Helper function to convert Date object to "HH:mm" string
const timeToString = (date) => {
  if (!date) return ""
  const hours = date.getHours().toString().padStart(2, "0")
  const minutes = date.getMinutes().toString().padStart(2, "0")
  return `${hours}:${minutes}`
}

const normalizeTimeValue = (value) => {
  if (!value) return ""

  const raw = String(value).trim()
  if (!raw) return ""

  // Already in HH:mm format
  if (/^\d{2}:\d{2}$/.test(raw)) {
    return raw
  }

  // Handle H:mm by zero-padding hour
  if (/^\d{1}:\d{2}$/.test(raw)) {
    const [h, m] = raw.split(":")
    return `${h.padStart(2, "0")}:${m}`
  }

  // Fallback for ISO / Date-like strings
  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) {
    return timeToString(parsed)
  }

  return ""
}

const formatDateToLocalYMD = (date) => {
  if (!date || Number.isNaN(date.getTime?.())) return ""
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const parseLocalYMDDate = (value) => {
  if (!value || typeof value !== "string") return undefined
  const parts = value.split("-").map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return undefined
  const [year, month, day] = parts
  return new Date(year, month - 1, day)
}

const getLocalDateYearsFromToday = (yearsToAdd) => {
  const today = new Date()
  return new Date(today.getFullYear() + yearsToAdd, today.getMonth(), today.getDate())
}

const getMaxFssaiExpiryLocalYMD = () =>
  formatDateToLocalYMD(getLocalDateYearsFromToday(FSSAI_VALIDITY_YEARS))

const isFssaiExpiryOutsideAllowedRange = (value) => {
  if (!value || typeof value !== "string") return false
  const today = getTodayLocalYMD()
  const maxExpiry = getMaxFssaiExpiryLocalYMD()
  return value < today || value > maxExpiry
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

function TimeSelector({ label, value, onChange }) {
  const timeValue = stringToTime(value)

  const handleTimeChange = (newValue) => {
    if (!newValue) {
      onChange("")
      return
    }
    const timeString = timeToString(newValue)
    onChange(timeString)
  }

  return (
    <div className="border border-gray-200 rounded-md px-3 py-2 bg-gray-50/60">
      <div className="flex items-center gap-2 mb-2">
        <Clock className="w-4 h-4 text-gray-800" />
        <span className="text-xs font-bold text-gray-700">
          {typeof label === "string" && label.endsWith("*") ? (
            <>
              {label.slice(0, -1)}
              <span className="text-rose-500 ml-0.5">*</span>
            </>
          ) : (
            label
          )}
        </span>
      </div>
      <MobileTimePicker
        value={timeValue}
        onChange={handleTimeChange}
        onAccept={handleTimeChange}
        slotProps={{
          textField: {
            variant: "outlined",
            size: "small",
            inputProps: {
              placeholder: "Select time",
            },
            sx: {
              "& .MuiOutlinedInput-root": {
                height: "36px",
                fontSize: "9.5px",
                backgroundColor: "white",
                paddingLeft: "4px",
                paddingRight: "2px",
                "& fieldset": {
                  borderColor: "#e5e7eb",
                },
                "&:hover fieldset": {
                  borderColor: "#d1d5db",
                },
                "&.Mui-focused fieldset": {
                  borderColor: "#00c87e",
                },
              },
              "& .MuiInputBase-input": {
                padding: "8px 0px 8px 2px",
                fontSize: "9.5px",
                letterSpacing: "-0.03em",
                cursor: "pointer",
              },
              "& .MuiInputAdornment-root": {
                marginLeft: "0px",
                marginRight: "0px",
              },
              "& .MuiIconButton-root": {
                padding: "1px",
              },
              "& .MuiSvgIcon-root": {
                fontSize: "14px",
              },
            },
            onBlur: (event) => {
              const normalized = normalizeTimeValue(event?.target?.value)
              if (normalized) {
                onChange(normalized)
              }
            },
          },
        }}
        format="hh:mm a"
      />
    </div>
  )
}

export default function RestaurantOnboarding() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [step, setStep] = useState(() => {
    if (typeof window === "undefined") return 1
    const stepParam = new URLSearchParams(window.location.search).get("step")
    const stepNum = Number.parseInt(stepParam || "", 10)
    return stepNum >= 1 && stepNum <= 4 ? stepNum : 1
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [accountNumberError, setAccountNumberError] = useState("")
  const [fieldErrors, setFieldErrors] = useState({})
  const [fieldTouched, setFieldTouched] = useState({})
  const [showConfirmAccountNumber, setShowConfirmAccountNumber] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleLogout = async () => {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    try {
      await restaurantAPI.logout()
      clearModuleAuth("restaurant")
      clearAuthData()
      clearOnboardingFromLocalStorage()
      clearOnboardingFileCache()
      await clearOnboardingFilesFromIndexedDb()
      localStorage.removeItem("restaurant_onboarding")
      window.dispatchEvent(new Event("restaurantAuthChanged"))
      navigate("/food/restaurant/login", { replace: true })
    } catch (error) {
      debugError("Logout failed:", error)
      clearModuleAuth("restaurant")
      navigate("/food/restaurant/login", { replace: true })
    } finally {
      setIsLoggingOut(false)
    }
  }

  const [verifiedPhoneNumber, setVerifiedPhoneNumber] = useState("")
  const [keyboardInset, setKeyboardInset] = useState(0)
  const [isEditing, setIsEditing] = useState(false)
  const [currentRestaurantStatus, setCurrentRestaurantStatus] = useState("")
  const [isFssaiCalendarOpen, setIsFssaiCalendarOpen] = useState(false)
  const [zones, setZones] = useState([])
  const [zonesLoading, setZonesLoading] = useState(false)
  const [currentRestaurantRejectionReason, setCurrentRestaurantRejectionReason] = useState("")

  const [step1, setStep1] = useState({
    restaurantName: "",
    pureVegRestaurant: null,
    ownerName: "",
    ownerEmail: "",
    ownerPhone: "",
    primaryContactNumber: "",
    zoneId: "",
    location: {
      formattedAddress: "",
      addressLine1: "",
      addressLine2: "",
      area: "",
      city: "",
      state: "",
      pincode: "",
      landmark: "",
      latitude: "",
      longitude: "",
    },
  })

  const [step2, setStep2] = useState({
    menuImages: [],
    profileImage: null,
    cuisines: [],
    openingTime: "",
    closingTime: "",
    openDays: [],
  })

  const [step3, setStep3] = useState({
    panNumber: "",
    nameOnPan: "",
    panImage: null,
    gstRegistered: false,
    gstNumber: "",
    gstLegalName: "",
    gstAddress: "",
    gstImage: null,
    fssaiNumber: "",
    fssaiExpiry: "",
    fssaiImage: null,
    accountNumber: "",
    confirmAccountNumber: "",
    ifscCode: "",
    accountHolderName: "",
    accountType: "",
  })

  const [step4, setStep4] = useState({
    estimatedDeliveryTime: "",
    featuredDish: "",
    featuredPrice: "",
    offer: "",
    selfDeliveryEnabled: false,
    selfDeliveryRadius: "",
    selfDeliveryFee: "",
    selfDeliveryMinOrderAmount: "",
    selfDeliveryStart: "",
    selfDeliveryEnd: "",
  })
  const previewUrlCacheRef = useRef(new Map())
  const prevStepRef = useRef(step)
  const hasHydratedDraftRef = useRef(false)
  const hasPersistedDraftRef = useRef(false)
  const hasServerProfileHydratedRef = useRef(false)
  const locationSearchInputRef = useRef(null)
  const placesAutocompleteRef = useRef(null)
  const mapsScriptLoadedRef = useRef(false)
  const menuImagesInputRef = useRef(null)
  const profileImageInputRef = useRef(null)
  const panImageInputRef = useRef(null)
  const gstImageInputRef = useRef(null)
  const fssaiImageInputRef = useRef(null)
  const [sourcePicker, setSourcePicker] = useState({
    isOpen: false,
    title: "",
    onSelectFile: null,
    fileNamePrefix: "camera-image",
    fallbackInputRef: null,
  })

  const getFieldValue = (fieldName, overrides = {}) => {
    const step1Data = overrides.step1 || step1
    const step3Data = overrides.step3 || step3
    const step4Data = overrides.step4 || step4

    switch (fieldName) {
      case "restaurantName":
        return step1Data.restaurantName
      case "ownerName":
        return step1Data.ownerName
      case "ownerEmail":
        return step1Data.ownerEmail
      case "ownerPhone":
        return step1Data.ownerPhone
      case "primaryContactNumber":
        return step1Data.primaryContactNumber
      case "zoneId":
        return step1Data.zoneId
      case "location.area":
        return step1Data.location?.area
      case "location.city":
        return step1Data.location?.city
      case "location.state":
        return step1Data.location?.state
      case "location.pincode":
        return step1Data.location?.pincode
      case "panNumber":
        return step3Data.panNumber
      case "nameOnPan":
        return step3Data.nameOnPan
      case "gstNumber":
        return step3Data.gstNumber
      case "gstLegalName":
        return step3Data.gstLegalName
      case "gstAddress":
        return step3Data.gstAddress
      case "fssaiNumber":
        return step3Data.fssaiNumber
      case "fssaiExpiry":
        return step3Data.fssaiExpiry
      case "accountNumber":
        return step3Data.accountNumber
      case "confirmAccountNumber":
        return step3Data.confirmAccountNumber
      case "ifscCode":
        return step3Data.ifscCode
      case "accountHolderName":
        return step3Data.accountHolderName
      case "accountType":
        return step3Data.accountType
      case "estimatedDeliveryTime":
        return step4Data.estimatedDeliveryTime
      case "featuredDish":
        return step4Data.featuredDish
      default:
        return ""
    }
  }

  const validateSingleField = (fieldName, overrides = {}) => {
    const step1Data = overrides.step1 || step1
    const step3Data = overrides.step3 || step3
    const step4Data = overrides.step4 || step4

    switch (fieldName) {
      case "restaurantName":
        return step1Data.restaurantName?.trim() ? "" : "Restaurant name is required"
      case "ownerName":
        return step1Data.ownerName?.trim() ? "" : "Owner name is required"
      case "ownerEmail":
        if (!step1Data.ownerEmail?.trim()) return "Owner email is required"
        return EMAIL_REGEX.test(step1Data.ownerEmail.trim()) ? "" : "Please enter a valid email address"
      case "ownerPhone": {
        const digits = normalizePhoneDigits(step1Data.ownerPhone)
        if (!digits) return "Owner phone number is required"
        return digits.length >= 10 ? "" : "Please enter a valid phone number"
      }
      case "primaryContactNumber":
        if (!step1Data.primaryContactNumber?.trim()) return "Primary contact number is required"
        return isValidIndianPrimaryContactNumber(step1Data.primaryContactNumber)
          ? ""
          : "Please enter a valid Indian mobile or landline number"
      case "zoneId":
        return step1Data.zoneId?.trim() ? "" : "Service zone is required"
      case "location.area":
        return step1Data.location?.area?.trim() ? "" : "Area/Sector/Locality is required"
      case "location.city":
        if (!step1Data.location?.city?.trim()) return "City is required"
        return /^[a-zA-Z\s]+$/.test(step1Data.location.city.trim()) ? "" : "City must contain only alphabets"
      case "location.state":
        if (!step1Data.location?.state?.trim()) return "State is required"
        return /^[a-zA-Z\s]+$/.test(step1Data.location.state.trim()) ? "" : "State must contain only alphabets"
      case "location.pincode":
        if (!step1Data.location?.pincode?.trim()) return "Pincode is required"
        return /^\d{6}$/.test(step1Data.location.pincode.trim()) ? "" : "Pincode must be exactly 6 digits"
      case "panNumber":
        if (!step3Data.panNumber?.trim()) return "PAN number is required"
        return PAN_NUMBER_REGEX.test(step3Data.panNumber.trim().toUpperCase())
          ? ""
          : "PAN number must be valid (e.g., ABCDE1234F)"
      case "nameOnPan":
        return step3Data.nameOnPan?.trim() ? "" : "Name on PAN is required"
      case "gstNumber":
        if (!step3Data.gstRegistered) return ""
        if (!step3Data.gstNumber?.trim()) return "GST number is required when GST registered"
        return GST_NUMBER_REGEX.test(step3Data.gstNumber.trim().toUpperCase())
          ? ""
          : "GST number must be a valid 15-character GSTIN"
      case "gstLegalName":
        if (!step3Data.gstRegistered) return ""
        if (!step3Data.gstLegalName?.trim()) return "GST legal name is required when GST registered"
        return GST_LEGAL_NAME_REGEX.test(step3Data.gstLegalName.trim())
          ? ""
          : "GST legal name must contain only letters"
      case "gstAddress":
        if (!step3Data.gstRegistered) return ""
        return step3Data.gstAddress?.trim() ? "" : "GST registered address is required when GST registered"
      case "fssaiNumber":
        if (!step3Data.fssaiNumber?.trim()) return "FSSAI number is required"
        return FSSAI_NUMBER_REGEX.test(step3Data.fssaiNumber.trim())
          ? ""
          : "FSSAI number must contain exactly 14 digits"
      case "fssaiExpiry":
        if (!step3Data.fssaiExpiry?.trim()) return "FSSAI expiry date is required"
        if (step3Data.fssaiExpiry < getTodayLocalYMD()) return "FSSAI expiry date cannot be in the past"
        if (step3Data.fssaiExpiry > getMaxFssaiExpiryLocalYMD()) {
          return `FSSAI expiry date cannot be more than ${FSSAI_VALIDITY_YEARS} years from today`
        }
        return ""
      case "accountNumber":
        if (!step3Data.accountNumber?.trim()) return "Account number is required"
        return BANK_ACCOUNT_NUMBER_REGEX.test(step3Data.accountNumber.trim())
          ? ""
          : "Account number must contain 9 to 18 digits only"
      case "confirmAccountNumber":
        if (!step3Data.confirmAccountNumber?.trim()) return "Please confirm your account number"
        if (!BANK_ACCOUNT_NUMBER_REGEX.test(step3Data.confirmAccountNumber.trim())) {
          return "Confirm account number must contain 9 to 18 digits only"
        }
        if (
          step3Data.accountNumber &&
          step3Data.confirmAccountNumber &&
          step3Data.accountNumber !== step3Data.confirmAccountNumber
        ) {
          return "Account numbers do not match"
        }
        return ""
      case "ifscCode":
        if (!step3Data.ifscCode?.trim()) return "IFSC code is required"
        return IFSC_CODE_REGEX.test(step3Data.ifscCode.trim().toUpperCase())
          ? ""
          : "Invalid IFSC code format (e.g., SBIN0001234)"
      case "accountHolderName":
        if (!step3Data.accountHolderName?.trim()) return "Account holder name is required"
        return ACCOUNT_HOLDER_NAME_REGEX.test(step3Data.accountHolderName.trim())
          ? ""
          : "Account holder name must contain only letters"
      case "accountType":
        if (!step3Data.accountType?.trim()) return "Account type is required"
        return ["Saving", "Current"].includes(step3Data.accountType.trim())
          ? ""
          : "Account type must be either Saving or Current"
      case "estimatedDeliveryTime":
        return step4Data.estimatedDeliveryTime?.trim() ? "" : "Estimated preparation time is required"
      case "featuredDish":
        if (!step4Data.featuredDish?.trim()) return "Featured dish name is required"
        return FEATURED_DISH_NAME_REGEX.test(step4Data.featuredDish.trim())
          ? ""
          : "Featured dish name must contain only letters"
      case "selfDeliveryRadius":
        if (!step4Data.selfDeliveryEnabled) return ""
        return step4Data.selfDeliveryRadius?.trim() ? "" : "Self delivery radius is required"
      case "selfDeliveryFee":
        if (!step4Data.selfDeliveryEnabled) return ""
        return step4Data.selfDeliveryFee?.trim() ? "" : "Delivery fee is required"
      case "selfDeliveryMinOrderAmount":
        if (!step4Data.selfDeliveryEnabled) return ""
        return step4Data.selfDeliveryMinOrderAmount?.trim() ? "" : "Minimum order amount is required"
      case "selfDeliveryStart":
        if (!step4Data.selfDeliveryEnabled) return ""
        return step4Data.selfDeliveryStart?.trim() ? "" : "Start time is required"
      case "selfDeliveryEnd":
        if (!step4Data.selfDeliveryEnabled) return ""
        return step4Data.selfDeliveryEnd?.trim() ? "" : "End time is required"
      default:
        return ""
    }
  }

  const setFieldValidation = (fieldName, overrides = {}) => {
    const message = validateSingleField(fieldName, overrides)
    setFieldErrors((prev) => {
      if (!message && !prev[fieldName]) return prev
      if (!message) {
        const next = { ...prev }
        delete next[fieldName]
        return next
      }
      if (prev[fieldName] === message) return prev
      return { ...prev, [fieldName]: message }
    })

    if (fieldName === "accountNumber" || fieldName === "confirmAccountNumber") {
      setAccountNumberError(message.includes("Account number") ? message : "")
    }

    return !message
  }

  const handleFieldBlur = (fieldName, overrides = {}) => {
    setFieldTouched((prev) => ({ ...prev, [fieldName]: true }))
    return setFieldValidation(fieldName, overrides)
  }

  const revalidateTouchedField = (fieldName, overrides = {}) => {
    if (!fieldTouched[fieldName] && !fieldErrors[fieldName]) return
    setFieldValidation(fieldName, overrides)
  }

  const getFieldStatus = (fieldName, overrides = {}) => {
    if (!fieldTouched[fieldName]) return "idle"
    if (fieldErrors[fieldName]) return "error"
    const value = getFieldValue(fieldName, overrides)
    const hasValue = typeof value === "string" ? Boolean(value.trim()) : Boolean(value)
    return hasValue ? "success" : "idle"
  }

  const getFieldClassName = (fieldName, baseClassName, overrides = {}) => {
    const status = getFieldStatus(fieldName, overrides)
    if (status === "error") {
      return `${baseClassName} border-red-500 focus-visible:ring-red-500`
    }
    if (status === "success") {
      return `${baseClassName} border-emerald-500 focus-visible:ring-emerald-500`
    }
    return baseClassName
  }

  const renderFieldMessage = (fieldName, overrides = {}) => {
    const status = getFieldStatus(fieldName, overrides)
    if (status === "error") {
      return <p className="mt-1 text-[10px] font-medium text-red-500">{fieldErrors[fieldName]}</p>
    }
    if (status === "success") {
      if (fieldName === "accountNumber" || fieldName === "confirmAccountNumber") {
        const step3Data = overrides.step3 || step3
        if (
          step3Data.accountNumber &&
          step3Data.confirmAccountNumber &&
          step3Data.accountNumber === step3Data.confirmAccountNumber
        ) {
          return <p className="mt-1 text-[10px] font-medium text-emerald-600">Account number matched</p>
        }
      }
      return null
    }
    return null
  }

  const validateFieldsForStep = (stepNumber) => {
    const stepFieldMap = {
      1: [
        "restaurantName",
        "ownerName",
        "ownerEmail",
        "ownerPhone",
        "primaryContactNumber",
        "zoneId",
        "location.area",
        "location.city",
        "location.state",
        "location.pincode",
      ],
      3: [
        "panNumber",
        "nameOnPan",
        "fssaiNumber",
        "fssaiExpiry",
        "accountNumber",
        "confirmAccountNumber",
        "ifscCode",
        "accountHolderName",
        "accountType",
        ...(step3.gstRegistered ? ["gstNumber", "gstLegalName", "gstAddress"] : []),
      ],
      4: [
        "estimatedDeliveryTime",
        "featuredDish",
        ...(step4.selfDeliveryEnabled
          ? ["selfDeliveryRadius", "selfDeliveryFee", "selfDeliveryMinOrderAmount", "selfDeliveryStart", "selfDeliveryEnd"]
          : [])
      ],
    }

    const fields = stepFieldMap[stepNumber] || []
    if (!fields.length) return

    setFieldTouched((prev) => ({
      ...prev,
      ...Object.fromEntries(fields.map((field) => [field, true])),
    }))

    fields.forEach((field) => {
      setFieldValidation(field)
    })
  }

  const getPreviewImageUrl = (value) => {
    if (!value) return null
    if (typeof value === "string") return value
    if (value?.url && typeof value.url === "string") return value.url

    if (isUploadableFile(value)) {
      const cache = previewUrlCacheRef.current
      const cached = cache.get(value)
      if (cached) return cached
      try {
        const objectUrl = URL.createObjectURL(value)
        cache.set(value, objectUrl)
        return objectUrl
      } catch {
        return null
      }
    }

    return null
  }

  const openBrowserCameraFallback = ({ onSelectFile }) => {
    try {
      const input = document.createElement("input")
      input.type = "file"
      input.accept = "image/*"
      input.capture = "environment"
      input.onchange = (event) => {
        const file = event?.target?.files?.[0] || null
        if (file) onSelectFile(file)
      }
      input.click()
    } catch (error) {
      debugError("Browser camera fallback failed:", error)
    }
  }

  const openImageSourcePicker = ({ title, onSelectFile, fileNamePrefix, fallbackInputRef }) => {
    setSourcePicker({
      isOpen: true,
      title: title || "Select image source",
      onSelectFile,
      fileNamePrefix: fileNamePrefix || "camera-image",
      fallbackInputRef: fallbackInputRef || null,
    })
  }

  const closeImageSourcePicker = () => {
    setSourcePicker((prev) => ({ ...prev, isOpen: false }))
  }

  const handlePickFromDevice = () => {
    const fallbackRef = sourcePicker.fallbackInputRef
    closeImageSourcePicker()
    fallbackRef?.current?.click()
  }

  const handlePickFromCamera = async () => {
    const pickerConfig = {
      onSelectFile: sourcePicker.onSelectFile,
      fileNamePrefix: sourcePicker.fileNamePrefix,
    }
    closeImageSourcePicker()
    await openCamera(pickerConfig)
  }

  const isReverificationFlow = currentRestaurantStatus === "rejected"
  const isPendingReviewFlow = currentRestaurantStatus === "pending"

  const handleCloseOnboarding = () => {
    if (isReverificationFlow) {
      toast.error("Please submit your restaurant details again for re-verification.")
      return
    }

    if (isPendingReviewFlow) {
      navigate("/food/restaurant/pending-verification", { replace: true })
      return
    }

    navigate("/food/restaurant/explore")
  }


  // Load from localStorage on mount and check URL parameter
  useEffect(() => {
    let isCancelled = false

    const restoreDraft = async () => {
      try {
        setVerifiedPhoneNumber(getVerifiedPhoneFromStoredRestaurant())

        const stepParam = searchParams.get("step")
        const localData = loadOnboardingFromLocalStorage()
        const draftFiles = (await loadOnboardingFilesFromIndexedDb()) || onboardingFileCache
        const hasPersistedDraft = hasPersistedOnboardingDraft(localData, draftFiles)
        const storedRestaurantStatus = String(getCurrentUser("restaurant")?.status || "").toLowerCase()
        const shouldRestoreLocalDraft = hasPersistedDraft && storedRestaurantStatus !== "rejected"

        if (isCancelled) return

        hasPersistedDraftRef.current = shouldRestoreLocalDraft

        if (!shouldRestoreLocalDraft || hasServerProfileHydratedRef.current) {
          if (!stepParam && localData?.currentStep && shouldRestoreLocalDraft) {
            setStep(localData.currentStep)
            prevStepRef.current = localData.currentStep
          }
          return
        }

        if (localData?.step1) {
          setStep1({
            restaurantName: localData.step1.restaurantName || "",
            pureVegRestaurant:
              typeof localData.step1.pureVegRestaurant === "boolean"
                ? localData.step1.pureVegRestaurant
                : null,
            ownerName: localData.step1.ownerName || "",
            ownerEmail: localData.step1.ownerEmail || "",
            ownerPhone: localData.step1.ownerPhone || "",
            primaryContactNumber: localData.step1.primaryContactNumber || "",
            zoneId: normalizeZoneIdValue(localData.step1.zoneId),
            location: {
              formattedAddress: localData.step1.location?.formattedAddress || "",
              addressLine1: localData.step1.location?.addressLine1 || "",
              addressLine2: localData.step1.location?.addressLine2 || "",
              area: localData.step1.location?.area || "",
              city: localData.step1.location?.city || "",
              state: localData.step1.location?.state || "",
              pincode: localData.step1.location?.pincode || "",
              landmark: localData.step1.location?.landmark || "",
              latitude: localData.step1.location?.latitude ?? "",
              longitude: localData.step1.location?.longitude ?? "",
            },
          })
        }
        if (localData?.step2 || draftFiles?.step2) {
          const restoredMenuImages = (localData?.step2?.menuImages || []).filter(
            (img) => img?.url || (typeof img === "string" && img.startsWith("http"))
          )
          const cachedMenuImages = draftFiles?.step2?.menuImages || onboardingFileCache.step2.menuImages || []
          const serializedProfileImage = localData?.step2?.profileImage
          const restoredProfileImage =
            serializedProfileImage?.url ||
            (typeof serializedProfileImage === "string" && serializedProfileImage.startsWith("http"))
              ? serializedProfileImage
              : null
          const cachedProfileImage =
            draftFiles?.step2?.profileImage || onboardingFileCache.step2.profileImage || null

          setStep2({
            menuImages: [...restoredMenuImages, ...cachedMenuImages],
            profileImage: cachedProfileImage || restoredProfileImage,
            cuisines: localData?.step2?.cuisines || [],
            openingTime: normalizeTimeValue(localData?.step2?.openingTime),
            closingTime: normalizeTimeValue(localData?.step2?.closingTime),
            openDays: localData?.step2?.openDays || [],
          })
        }
        if (localData?.step3 || draftFiles?.step3) {
          setStep3({
            panNumber: localData?.step3?.panNumber || "",
            nameOnPan: localData?.step3?.nameOnPan || "",
            panImage: draftFiles?.step3?.panImage || onboardingFileCache.step3.panImage || localData?.step3?.panImage || null,
            gstRegistered: localData?.step3?.gstRegistered || false,
            gstNumber: localData?.step3?.gstNumber || "",
            gstLegalName: localData?.step3?.gstLegalName || "",
            gstAddress: localData?.step3?.gstAddress || "",
            gstImage: draftFiles?.step3?.gstImage || onboardingFileCache.step3.gstImage || localData?.step3?.gstImage || null,
            fssaiNumber: localData?.step3?.fssaiNumber || "",
            fssaiExpiry: localData?.step3?.fssaiExpiry || "",
            fssaiImage: draftFiles?.step3?.fssaiImage || onboardingFileCache.step3.fssaiImage || localData?.step3?.fssaiImage || null,
            accountNumber: localData?.step3?.accountNumber || "",
            confirmAccountNumber: localData?.step3?.confirmAccountNumber || "",
            ifscCode: (localData?.step3?.ifscCode || "").toUpperCase(),
            accountHolderName: localData?.step3?.accountHolderName || "",
            accountType: normalizeAccountTypeValue(localData?.step3?.accountType || ""),
          })
        }
        if (localData?.step4) {
          setStep4({
            estimatedDeliveryTime: localData.step4.estimatedDeliveryTime || "",
            featuredDish: localData.step4.featuredDish || "",
            featuredPrice: localData.step4.featuredPrice || "",
            offer: localData.step4.offer || "",
            selfDeliveryEnabled: localData.step4.selfDeliveryEnabled === true,
            selfDeliveryRadius: localData.step4.selfDeliveryRadius === "3" ? "" : (localData.step4.selfDeliveryRadius || ""),
            selfDeliveryFee: localData.step4.selfDeliveryFee === "0" ? "" : (localData.step4.selfDeliveryFee || ""),
            selfDeliveryMinOrderAmount: localData.step4.selfDeliveryMinOrderAmount === "0" ? "" : (localData.step4.selfDeliveryMinOrderAmount || ""),
            selfDeliveryStart: localData.step4.selfDeliveryStart === "10:00" ? "" : (localData.step4.selfDeliveryStart || ""),
            selfDeliveryEnd: localData.step4.selfDeliveryEnd === "22:00" ? "" : (localData.step4.selfDeliveryEnd || ""),
          })
        }
        if (!stepParam && localData?.currentStep) {
          setStep(localData.currentStep)
          prevStepRef.current = localData.currentStep
        }
      } finally {
        if (!isCancelled) {
          hasHydratedDraftRef.current = true
        }
      }
    }

    restoreDraft()

    return () => {
      isCancelled = true
    }
  }, [])

  // Sync URL step -> React step (for browser Back/Forward navigation)
  useEffect(() => {
    const stepParam = searchParams.get("step")
    if (stepParam) {
      const stepNum = parseInt(stepParam, 10)
      if (stepNum >= 1 && stepNum <= 4 && stepNum !== step) {
        setStep(stepNum)
      }
    }
  }, [searchParams, step])

  // Sync React step -> URL step (for on-screen Continue/Back navigation)
  useEffect(() => {
    if (!hasHydratedDraftRef.current) return
    const currentStepParam = searchParams.get("step")
    if (currentStepParam !== String(step)) {
      const isInitial = !currentStepParam
      const isBackward = step < prevStepRef.current
      navigate(`?step=${step}`, { replace: isInitial || isBackward })
    }
    prevStepRef.current = step
  }, [step, navigate])

  useEffect(() => {
    if (!verifiedPhoneNumber) return
    setStep1((prev) => ({
      ...prev,
      ownerPhone: verifiedPhoneNumber,
    }))
  }, [verifiedPhoneNumber])

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return undefined

    const updateInset = () => {
      const vv = window.visualViewport
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height))
      setKeyboardInset(inset > 120 ? inset : 0)
    }

    updateInset()
    window.visualViewport.addEventListener("resize", updateInset)
    window.visualViewport.addEventListener("scroll", updateInset)
    return () => {
      window.visualViewport.removeEventListener("resize", updateInset)
      window.visualViewport.removeEventListener("scroll", updateInset)
    }
  }, [])

  // Save to localStorage whenever step data changes
  useEffect(() => {
    if (!hasHydratedDraftRef.current) return
    saveOnboardingToLocalStorage(step1, step2, step3, step4, step)
  }, [step1, step2, step3, step4, step])

  useEffect(() => {
    if (!hasHydratedDraftRef.current) return
    syncOnboardingFileCache(step2, step3)
    saveOnboardingFilesToIndexedDb(step2, step3)
  }, [step2, step3])

  useEffect(() => {
    return () => {
      previewUrlCacheRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url)
        } catch {
          // Ignore revoke errors
        }
      })
      previewUrlCacheRef.current.clear()
    }
  }, [])

  useEffect(() => {
    const fetchData = async () => {
      const hasRestaurantSession =
        isModuleAuthenticated("restaurant") && Boolean(getCurrentUser("restaurant"))

      if (!hasRestaurantSession) {
        const pendingPhone = getRestaurantPendingPhone()
        setCurrentRestaurantStatus("")
        setCurrentRestaurantRejectionReason("")
        setIsEditing(true)
        if (pendingPhone) {
          setVerifiedPhoneNumber(pendingPhone)
        }
        return
      }

      try {
        setLoading(true)
        // Use restaurantAPI.getCurrentRestaurant() to fetch real data
        const res = await restaurantAPI.getCurrentRestaurant()
        const data = res?.data?.data?.restaurant || res?.data?.restaurant
        
        if (data) {
          const normalizedStatus = String(data.status || "").toLowerCase()
          setCurrentRestaurantStatus(normalizedStatus)
          setCurrentRestaurantRejectionReason(String(data.rejectionReason || "").trim())
          setIsEditing(normalizedStatus === "rejected")
          if (hasPersistedDraftRef.current && normalizedStatus !== "rejected") {
            return
          }
          hasServerProfileHydratedRef.current = true
          // Map Step 1
          setStep1((prev) => ({
            restaurantName: data.name || data.restaurantName || "",
            pureVegRestaurant: typeof data.pureVegRestaurant === "boolean" ? data.pureVegRestaurant : null,
            ownerName: data.ownerName || "",
            ownerEmail: data.ownerEmail || "",
            ownerPhone: data.ownerPhone || "",
            zoneId: normalizeZoneIdValue(data.zoneId) || prev.zoneId || "",
            primaryContactNumber: data.primaryContactNumber || "",
            location: {
              formattedAddress: data.location?.formattedAddress || data.location?.address || "",
              addressLine1: data.location?.addressLine1 || data.addressLine1 || "",
              addressLine2: data.location?.addressLine2 || data.addressLine2 || "",
              area: data.location?.area || data.area || "",
              city: data.location?.city || data.city || "",
              state: data.location?.state || data.state || "",
              pincode: data.location?.pincode || data.pincode || "",
              landmark: data.location?.landmark || data.landmark || "",
              latitude: data.location?.latitude ?? "",
              longitude: data.location?.longitude ?? "",
            },
          }))

          // Map Step 2
          setStep2({
            menuImages: data.menuImages || [],
            profileImage: data.profileImage || null,
            cuisines: data.cuisines || [],
            openingTime: normalizeTimeValue(data.openingTime),
            closingTime: normalizeTimeValue(data.closingTime),
            openDays: data.openDays || [],
          })

          // Map Step 3
          setStep3({
            panNumber: data.panNumber || "",
            nameOnPan: data.nameOnPan || "",
            panImage: data.panImage || null,
            gstRegistered: !!data.gstRegistered,
            gstNumber: data.gstNumber || "",
            gstLegalName: data.gstLegalName || "",
            gstAddress: data.gstAddress || "",
            gstImage: data.gstImage || null,
            fssaiNumber: data.fssaiNumber || "",
            fssaiExpiry: data.fssaiExpiry ? String(data.fssaiExpiry).split('T')[0] : "",
            fssaiImage: data.fssaiImage || null,
            accountNumber: data.accountNumber || "",
            confirmAccountNumber: data.accountNumber || "",
            ifscCode: (data.ifscCode || "").toUpperCase(),
            accountHolderName: data.accountHolderName || "",
            accountType: normalizeAccountTypeValue(data.accountType || ""),
          })

          // Map Step 4
          setStep4({
            estimatedDeliveryTime: data.estimatedDeliveryTime || "",
            featuredDish: data.featuredDish || "",
            featuredPrice: data.featuredPrice || "",
            offer: data.offer || "",
            selfDeliveryEnabled: data?.selfDelivery?.enabled === true,
            selfDeliveryRadius: data?.selfDelivery?.radius !== undefined && data?.selfDelivery?.radius !== null ? String(data.selfDelivery.radius) : "",
            selfDeliveryFee: data?.selfDelivery?.fee !== undefined && data?.selfDelivery?.fee !== null ? String(data.selfDelivery.fee) : "",
            selfDeliveryMinOrderAmount: data?.selfDelivery?.minOrderAmount !== undefined && data?.selfDelivery?.minOrderAmount !== null ? String(data.selfDelivery.minOrderAmount) : "",
            selfDeliveryStart: data?.selfDelivery?.timings?.start || "",
            selfDeliveryEnd: data?.selfDelivery?.timings?.end || "",
          })

          // Only determine step automatically if not specified in URL
          const stepParam = searchParams.get("step")
          if (!stepParam) {
            // If already registered/pending, stay on step 1 for editing
            if (data.status === "approved" || data.status === "pending") {
               setStep(1)
            } else {
               const stepToShow = determineStepToShow({ step1: data, step2: data, step3: data, step4: data })
               setStep(stepToShow)
            }
          }
        } else {
          setCurrentRestaurantStatus("")
          setCurrentRestaurantRejectionReason("")
          setIsEditing(true)
        }
      } catch (err) {
        setCurrentRestaurantStatus("")
        setCurrentRestaurantRejectionReason("")
        setIsEditing(true)
        if (err?.response?.status === 401) {
          debugError("Authentication error fetching onboarding:", err)
        } else {
          debugError("Error fetching onboarding data:", err)
        }
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const handleUpload = async (file, folder) => {
    try {
      // Uploading is done on final registration submit (multipart /register).
      // Keep this method for backward compatibility in case other flows call it.
      throw new Error("Image uploads are submitted during registration")
    } catch (err) {
      // Provide more informative error message for upload failures
      const errorMsg = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Failed to upload image"
      debugError("Upload error:", errorMsg, err)
      throw new Error(`Image upload failed: ${errorMsg}`)
    }
  }

  // Validation functions for each step
  const validateStep1 = () => {
    const errors = []

    if (!step1.restaurantName?.trim()) {
      errors.push("Restaurant name is required")
    }
    if (typeof step1.pureVegRestaurant !== "boolean") {
      errors.push("Please select whether your restaurant is pure veg")
    }
    if (!step1.ownerName?.trim()) {
      errors.push("Owner name is required")
    }
    if (!step1.ownerEmail?.trim()) {
      errors.push("Owner email is required")
    } else if (!EMAIL_REGEX.test(step1.ownerEmail.trim())) {
      errors.push("Please enter a valid email address")
    }
    if (!step1.ownerPhone?.trim()) {
      errors.push("Owner phone number is required")
    }
    if (!step1.primaryContactNumber?.trim()) {
      errors.push("Primary contact number is required")
    } else if (!isValidIndianPrimaryContactNumber(step1.primaryContactNumber)) {
      errors.push("Please enter a valid Indian mobile or landline number")
    }
    if (!step1.zoneId?.trim()) {
      errors.push("Service zone is required")
    }
    if (!step1.location?.area?.trim()) {
      errors.push("Area/Sector/Locality is required")
    }
    if (!step1.location?.city?.trim()) {
      errors.push("City is required")
    } else if (!/^[a-zA-Z\s]+$/.test(step1.location.city.trim())) {
      errors.push("City must contain only alphabets")
    }

    if (!step1.location?.state?.trim()) {
      errors.push("State is required")
    } else if (!/^[a-zA-Z\s]+$/.test(step1.location.state.trim())) {
      errors.push("State must contain only alphabets")
    }

    if (!step1.location?.pincode?.trim()) {
      errors.push("Pincode is required")
    } else if (!/^\d{6}$/.test(step1.location.pincode.trim())) {
      errors.push("Pincode must be exactly 6 digits")
    }

    if (!step1.location?.latitude || !step1.location?.longitude) {
      errors.push("Please search and select your restaurant address from the suggestions to verify it's within the service zone")
    } else if (step1.zoneId) {
      const selectedZone = zones.find((z) => String(z?._id || z?.id || "") === String(step1.zoneId))
      if (selectedZone) {
        const polygon = normalizeZoneCoordinates(selectedZone)
        if (!isPointInPolygon(Number(step1.location.latitude), Number(step1.location.longitude), polygon)) {
          errors.push("The selected address is outside the selected service zone")
        }
      }
    }

    return errors
  }

  const validateStep2 = () => {
    const errors = []

    // Check menu images - must have at least one File or existing URL
    const hasMenuImages = step2.menuImages && step2.menuImages.length > 0
    if (!hasMenuImages) {
      errors.push("At least one menu image is required")
    } else {
      // Verify that menu images are either File objects or have valid URLs
      const validMenuImages = step2.menuImages.filter(img => {
        if (isUploadableFile(img)) return true
        if (img?.url && typeof img.url === 'string') return true
        if (typeof img === 'string' && img.startsWith('http')) return true
        return false
      })
      if (validMenuImages.length === 0) {
        errors.push("Please upload at least one valid menu image")
      }
    }

    // Check profile image - must be a File or existing URL
    if (!step2.profileImage) {
      errors.push("Restaurant profile image is required")
    } else {
      // Verify profile image is either a File or has a valid URL
      const isValidProfileImage =
        isUploadableFile(step2.profileImage) ||
        (step2.profileImage?.url && typeof step2.profileImage.url === 'string') ||
        (typeof step2.profileImage === 'string' && step2.profileImage.startsWith('http'))
      if (!isValidProfileImage) {
        errors.push("Please upload a valid restaurant profile image")
      }
    }

    if (!step2.openingTime?.trim()) {
      errors.push("Opening time is required")
    }
    if (!step2.closingTime?.trim()) {
      errors.push("Closing time is required")
    }
    const normalizedOpeningTime = normalizeTimeValue(step2.openingTime)
    const normalizedClosingTime = normalizeTimeValue(step2.closingTime)
    if (normalizedOpeningTime && normalizedClosingTime) {
      if (normalizedOpeningTime === normalizedClosingTime) {
        errors.push("Opening time and closing time cannot be the same")
      }
    }
    if (!step2.openDays || step2.openDays.length === 0) {
      errors.push("Please select at least one open day")
    }

    return errors
  }

  const validateStep4 = () => {
    const errors = []
    if (!step4.estimatedDeliveryTime || !step4.estimatedDeliveryTime.trim()) {
      errors.push("Estimated preparation time is required")
    }
    if (!step4.featuredDish || !step4.featuredDish.trim()) {
      errors.push("Featured dish name is required")
    } else if (!FEATURED_DISH_NAME_REGEX.test(step4.featuredDish.trim())) {
      errors.push("Featured dish name must contain only letters")
    }

    if (step4.selfDeliveryEnabled) {
      if (!step4.selfDeliveryRadius || !String(step4.selfDeliveryRadius).trim()) {
        errors.push("Self delivery radius is required")
      }
      if (!step4.selfDeliveryFee || !String(step4.selfDeliveryFee).trim()) {
        errors.push("Delivery fee is required")
      }
      if (!step4.selfDeliveryMinOrderAmount || !String(step4.selfDeliveryMinOrderAmount).trim()) {
        errors.push("Minimum order amount is required")
      }
      const start = normalizeTimeValue(step4.selfDeliveryStart)
      const end = normalizeTimeValue(step4.selfDeliveryEnd)
      if (!start) {
        errors.push("Self delivery start time is required")
      }
      if (!end) {
        errors.push("Self delivery end time is required")
      }
      if (start && end) {
        if (start === end) {
          errors.push("Self delivery start and end time cannot be the same")
        }
      }
    }

    return errors
  }

  const validateStep3 = () => {
    const errors = []

    if (!step3.panNumber?.trim()) {
      errors.push("PAN number is required")
    } else if (!PAN_NUMBER_REGEX.test(step3.panNumber.trim().toUpperCase())) {
      errors.push("PAN number must be valid (e.g., ABCDE1234F)")
    }
    if (!step3.nameOnPan?.trim()) {
      errors.push("Name on PAN is required")
    }
    // Validate PAN image - must be a File or existing URL
    if (!step3.panImage) {
      errors.push("PAN image is required")
    } else {
      const isValidPanImage =
        isUploadableFile(step3.panImage) ||
        (step3.panImage?.url && typeof step3.panImage.url === 'string') ||
        (typeof step3.panImage === 'string' && step3.panImage.startsWith('http'))
      if (!isValidPanImage) {
        errors.push("Please upload a valid PAN image")
      }
    }

    if (!step3.fssaiNumber?.trim()) {
      errors.push("FSSAI number is required")
    } else if (!FSSAI_NUMBER_REGEX.test(step3.fssaiNumber.trim())) {
      errors.push("FSSAI number must contain exactly 14 digits")
    }
    if (!step3.fssaiExpiry?.trim()) {
      errors.push("FSSAI expiry date is required")
    } else if (step3.fssaiExpiry < getTodayLocalYMD()) {
      errors.push("FSSAI expiry date cannot be in the past")
    } else if (step3.fssaiExpiry > getMaxFssaiExpiryLocalYMD()) {
      errors.push(`FSSAI expiry date cannot be more than ${FSSAI_VALIDITY_YEARS} years from today`)
    }
    // Validate FSSAI image - must be a File or existing URL
    if (!step3.fssaiImage) {
      errors.push("FSSAI image is required")
    } else {
      const isValidFssaiImage =
        isUploadableFile(step3.fssaiImage) ||
        (step3.fssaiImage?.url && typeof step3.fssaiImage.url === 'string') ||
        (typeof step3.fssaiImage === 'string' && step3.fssaiImage.startsWith('http'))
      if (!isValidFssaiImage) {
        errors.push("Please upload a valid FSSAI image")
      }
    }

    // Validate GST details if GST registered
    if (step3.gstRegistered) {
      if (!step3.gstNumber?.trim()) {
        errors.push("GST number is required when GST registered")
      } else if (!GST_NUMBER_REGEX.test(step3.gstNumber.trim().toUpperCase())) {
        errors.push("GST number must be a valid 15-character GSTIN")
      }
      if (!step3.gstLegalName?.trim()) {
        errors.push("GST legal name is required when GST registered")
      } else if (!GST_LEGAL_NAME_REGEX.test(step3.gstLegalName.trim())) {
        errors.push("GST legal name must contain only letters")
      }
      if (!step3.gstAddress?.trim()) {
        errors.push("GST registered address is required when GST registered")
      }
      // Validate GST image if GST registered
      if (!step3.gstImage) {
        errors.push("GST image is required when GST registered")
      } else {
        const isValidGstImage =
          isUploadableFile(step3.gstImage) ||
          (step3.gstImage?.url && typeof step3.gstImage.url === 'string') ||
          (typeof step3.gstImage === 'string' && step3.gstImage.startsWith('http'))
        if (!isValidGstImage) {
          errors.push("Please upload a valid GST image")
        }
      }
    }

    if (!step3.accountNumber?.trim()) {
      errors.push("Account number is required")
    } else if (!BANK_ACCOUNT_NUMBER_REGEX.test(step3.accountNumber.trim())) {
      errors.push("Account number must contain 9 to 18 digits only")
    }
    if (!step3.confirmAccountNumber?.trim()) {
      errors.push("Please confirm your account number")
    } else if (!BANK_ACCOUNT_NUMBER_REGEX.test(step3.confirmAccountNumber.trim())) {
      errors.push("Confirm account number must contain 9 to 18 digits only")
    }
    if (step3.accountNumber && step3.confirmAccountNumber && step3.accountNumber !== step3.confirmAccountNumber) {
      errors.push("Account number and confirmation do not match")
      setAccountNumberError("Account numbers do not match")
    } else {
      setAccountNumberError("")
    }
    if (!step3.ifscCode?.trim()) {
      errors.push("IFSC code is required")
    } else if (!IFSC_CODE_REGEX.test(step3.ifscCode.trim().toUpperCase())) {
      errors.push("Invalid IFSC code format (e.g., SBIN0001234)")
    }
    if (!step3.accountHolderName?.trim()) {
      errors.push("Account holder name is required")
    } else if (!ACCOUNT_HOLDER_NAME_REGEX.test(step3.accountHolderName.trim())) {
      errors.push("Account holder name must contain only letters")
    }
    if (!step3.accountType?.trim()) {
      errors.push("Account type is required")
    } else if (!["Saving", "Current"].includes(step3.accountType.trim())) {
      errors.push("Account type must be either Saving or Current")
    }

    return errors
  }

  // Fill dummy data for testing (development mode only)




  const handleNext = async () => {
    setError("")
    validateFieldsForStep(step)

    // Validate current step before proceeding
    let validationErrors = []
    if (step === 1) {
      validationErrors = validateStep1()
    } else if (step === 2) {
      validationErrors = validateStep2()
    } else if (step === 3) {
      validationErrors = validateStep3()
    } else if (step === 4) {
      validationErrors = validateStep4()
      debugLog('?? Step 4 validation:', {
        step4,
        errors: validationErrors,
        estimatedDeliveryTime: step4.estimatedDeliveryTime,
        featuredDish: step4.featuredDish,
        featuredPrice: step4.featuredPrice,
        offer: step4.offer
      })
    }

    if (validationErrors.length > 0) {
      // Show error toast for each validation error
      validationErrors.forEach((error, index) => {
        setTimeout(() => {
          toast.error(error, {
            duration: 4000,
          })
        }, index * 100)
      })
      debugLog('? Validation failed:', validationErrors)
      return
    }

    setSaving(true)
    try {
      if (step === 1) {
        setStep(2)
        window.scrollTo({ top: 0, behavior: "instant" })
      } else if (step === 2) {
        setStep(3)
        window.scrollTo({ top: 0, behavior: "instant" })
      } else if (step === 3) {
        setStep(4)
        window.scrollTo({ top: 0, behavior: "instant" })
      } else if (step === 4) {
        // Final submit: create restaurant in DB using backend multipart endpoint.
        const formData = new FormData()

        // Step 1
        formData.append("restaurantName", step1.restaurantName || "")
        formData.append(
          "pureVegRestaurant",
          step1.pureVegRestaurant === true ? "true" : "false",
        )
        formData.append("ownerName", step1.ownerName || "")
        formData.append("ownerEmail", (step1.ownerEmail || "").trim())
        formData.append("ownerPhone", normalizePhoneDigits(step1.ownerPhone))
        formData.append("primaryContactNumber", normalizePhoneDigits(step1.primaryContactNumber))
        formData.append("zoneId", step1.zoneId || "")
        formData.append("addressLine1", step1.location?.addressLine1 || "")
        formData.append("addressLine2", step1.location?.addressLine2 || "")
        formData.append("area", step1.location?.area || "")
        formData.append("city", step1.location?.city || "")
        formData.append("state", step1.location?.state || "")
        formData.append("pincode", step1.location?.pincode || "")
        formData.append("landmark", step1.location?.landmark || "")
        formData.append("formattedAddress", step1.location?.formattedAddress || "")
        formData.append("latitude", String(step1.location?.latitude || ""))
        formData.append("longitude", String(step1.location?.longitude || ""))

        // Step 2
        formData.append("cuisines", (step2.cuisines || []).join(","))
        formData.append("openingTime", normalizeTimeValue(step2.openingTime) || "")
        formData.append("closingTime", normalizeTimeValue(step2.closingTime) || "")
        formData.append("openDays", (step2.openDays || []).join(","))

        const isReverificationSubmit = currentRestaurantStatus === "rejected"
        const menuFiles = (step2.menuImages || []).filter((f) => isUploadableFile(f))
        const existingMenuImageUrls = getPersistedImageUrls(step2.menuImages)
        if (menuFiles.length === 0 && existingMenuImageUrls.length === 0) {
          throw new Error("At least one menu image must be uploaded")
        }
        menuFiles.forEach((file) => formData.append("menuImages", file))
        if (isReverificationSubmit && existingMenuImageUrls.length > 0) {
          formData.append("existingMenuImages", JSON.stringify(existingMenuImageUrls))
        }

        const existingProfileImageUrl = getPersistedImageUrl(step2.profileImage)
        if (isUploadableFile(step2.profileImage)) {
          formData.append("profileImage", step2.profileImage)
        } else if (isReverificationSubmit && existingProfileImageUrl) {
          formData.append("existingProfileImage", existingProfileImageUrl)
        } else {
          throw new Error("Restaurant profile image is required")
        }

        // Step 3
        formData.append("panNumber", step3.panNumber || "")
        formData.append("nameOnPan", step3.nameOnPan || "")
        const existingPanImageUrl = getPersistedImageUrl(step3.panImage)
        if (isUploadableFile(step3.panImage)) {
          formData.append("panImage", step3.panImage)
        } else if (isReverificationSubmit && existingPanImageUrl) {
          formData.append("existingPanImage", existingPanImageUrl)
        } else {
          throw new Error("PAN image is required")
        }

        formData.append("gstRegistered", step3.gstRegistered ? "true" : "false")
        if (step3.gstRegistered) {
          formData.append("gstNumber", step3.gstNumber || "")
          formData.append("gstLegalName", step3.gstLegalName || "")
          formData.append("gstAddress", step3.gstAddress || "")
          const existingGstImageUrl = getPersistedImageUrl(step3.gstImage)
          if (isUploadableFile(step3.gstImage)) {
            formData.append("gstImage", step3.gstImage)
          } else if (isReverificationSubmit && existingGstImageUrl) {
            formData.append("existingGstImage", existingGstImageUrl)
          } else {
            throw new Error("GST image is required when GST registered")
          }
        }

        formData.append("fssaiNumber", step3.fssaiNumber || "")
        formData.append("fssaiExpiry", step3.fssaiExpiry || "")
        const existingFssaiImageUrl = getPersistedImageUrl(step3.fssaiImage)
        if (isUploadableFile(step3.fssaiImage)) {
          formData.append("fssaiImage", step3.fssaiImage)
        } else if (isReverificationSubmit && existingFssaiImageUrl) {
          formData.append("existingFssaiImage", existingFssaiImageUrl)
        } else {
          throw new Error("FSSAI image is required")
        }

        formData.append("accountNumber", step3.accountNumber || "")
        formData.append("ifscCode", (step3.ifscCode || "").toUpperCase())
        formData.append("accountHolderName", step3.accountHolderName || "")
        formData.append("accountType", step3.accountType || "")

        // Step 4
        formData.append("estimatedDeliveryTime", step4.estimatedDeliveryTime || "")
        formData.append("featuredDish", step4.featuredDish || "")
        formData.append("offer", step4.offer || "")
        formData.append("selfDeliveryEnabled", step4.selfDeliveryEnabled ? "true" : "false")
        formData.append("selfDeliveryRadius", step4.selfDeliveryRadius || "3")
        formData.append("selfDeliveryFee", step4.selfDeliveryFee || "0")
        formData.append("selfDeliveryMinOrderAmount", step4.selfDeliveryMinOrderAmount || "0")
        formData.append("selfDeliveryStart", step4.selfDeliveryStart || "10:00")
        formData.append("selfDeliveryEnd", step4.selfDeliveryEnd || "22:00")

        if (isReverificationSubmit) {
          const response = await restaurantAPI.resubmitRegistration(formData)
          const restaurant =
            response?.data?.data?.restaurant ||
            response?.data?.restaurant ||
            null
          if (restaurant) {
            try {
              localStorage.setItem("restaurant_user", JSON.stringify(restaurant))
              window.dispatchEvent(new Event("restaurantAuthChanged"))
            } catch {}
          }
        } else {
          await restaurantAPI.register(formData)
        }

        // Clear localStorage when onboarding is complete
        clearOnboardingFromLocalStorage()
        clearOnboardingFileCache()
        await clearOnboardingFilesFromIndexedDb()
        try {
          localStorage.setItem("restaurant_pendingPhone", normalizePhoneDigits(step1.ownerPhone))
        } catch {}

        toast.success(
          currentRestaurantStatus === "rejected"
            ? "Re-verification submitted. Awaiting admin approval."
            : "Registration submitted. Awaiting admin approval.",
          { duration: 4000 }
        )
        navigate("/food/restaurant/pending-verification", {
          replace: true,
          state: {
            phone: normalizePhoneDigits(step1.ownerPhone),
          },
        })
      }
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to save onboarding data"
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }



  const toggleDay = (day) => {
    setStep2((prev) => {
      const exists = prev.openDays.includes(day)
      if (exists) {
        return { ...prev, openDays: prev.openDays.filter((d) => d !== day) }
      }
      return { ...prev, openDays: [...prev.openDays, day] }
    })
  }

  const renderStep1 = () => (
    <div className="space-y-6">
      <section className="bg-white p-4 sm:p-6 rounded-md">
        <h2 className="text-xl font-extrabold text-black mb-4">Restaurant Information</h2>
        <div className="space-y-3">
          <div>
            <Label className="text-xs font-bold text-gray-700 block mb-1">Restaurant Name<span className="text-rose-500 ml-0.5">*</span></Label>
            <Input
              value={step1.restaurantName || ""}
              onChange={(e) => {
                const nextStep1 = { ...step1, restaurantName: e.target.value }
                setStep1(nextStep1)
                revalidateTouchedField("restaurantName", { step1: nextStep1 })
              }}
              onBlur={() => handleFieldBlur("restaurantName")}
              className={getFieldClassName("restaurantName", "mt-1 bg-white text-sm text-gray-900 placeholder:text-gray-400")}
              placeholder="Customers will see this name"
              maxLength={100}
              disabled={!isEditing}
            />
            {renderFieldMessage("restaurantName")}
          </div>
          <div>
            <Label className="text-xs font-bold text-gray-700 block mb-1">Pure Veg Restaurant?<span className="text-rose-500 ml-0.5">*</span></Label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => isEditing && setStep1({ ...step1, pureVegRestaurant: true })}
                className={`px-3 py-1.5 text-xs rounded-full border cursor-pointer ${
                  step1.pureVegRestaurant === true
                    ? "bg-[#00c87e] text-white border-[#00c87e]"
                    : "bg-white text-gray-700 border-gray-200"
                } ${!isEditing ? "opacity-70 !cursor-not-allowed" : ""}`}
              >
                Yes, Pure Veg
              </button>
              <button
                type="button"
                onClick={() => isEditing && setStep1({ ...step1, pureVegRestaurant: false })}
                className={`px-3 py-1.5 text-xs rounded-full border cursor-pointer ${
                  step1.pureVegRestaurant === false
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-700 border-gray-200"
                } ${!isEditing ? "opacity-70 !cursor-not-allowed" : ""}`}
              >
                No, Mixed Menu
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              This helps users filter restaurants by dietary preference.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md">
        <h2 className="text-xl font-extrabold text-black mb-4">Owner Details</h2>
        <p className="text-sm text-gray-600 mb-4">
          These details will be used for all business communications and updates.
        </p>
        <div className="space-y-4">
          <div>
            <Label className="text-xs font-bold text-gray-700 block mb-1">Full Name<span className="text-rose-500 ml-0.5">*</span></Label>
            <Input
              value={step1.ownerName || ""}
              onChange={(e) => {
                const nextStep1 = { ...step1, ownerName: e.target.value }
                setStep1(nextStep1)
                revalidateTouchedField("ownerName", { step1: nextStep1 })
              }}
              onBlur={() => handleFieldBlur("ownerName")}
              className={getFieldClassName("ownerName", "mt-1 bg-white text-sm text-gray-900 placeholder:text-gray-400")}
              placeholder="Owner full name"
              maxLength={50}
              disabled={!isEditing}
            />
            {renderFieldMessage("ownerName")}
          </div>
          <div>
            <Label className="text-xs font-bold text-gray-700 block mb-1">Email Address<span className="text-rose-500 ml-0.5">*</span></Label>
            <Input
              type="email"
              value={step1.ownerEmail || ""}
              onChange={(e) => {
                const nextStep1 = { ...step1, ownerEmail: e.target.value }
                setStep1(nextStep1)
                revalidateTouchedField("ownerEmail", { step1: nextStep1 })
              }}
              onBlur={() => handleFieldBlur("ownerEmail")}
              className={getFieldClassName("ownerEmail", "mt-1 bg-white text-sm text-gray-900 placeholder:text-gray-400")}
              placeholder="owner@example.com"
              disabled={!isEditing}
            />
            {renderFieldMessage("ownerEmail")}
          </div>
          <div>
            <Label className="text-xs font-bold text-gray-700 block mb-1">Phone Number<span className="text-rose-500 ml-0.5">*</span></Label>
            <Input
              value={step1.ownerPhone || ""}
              onChange={(e) => {
                const nextStep1 = { ...step1, ownerPhone: e.target.value }
                setStep1(nextStep1)
                revalidateTouchedField("ownerPhone", { step1: nextStep1 })
              }}
              onBlur={() => handleFieldBlur("ownerPhone")}
              readOnly={Boolean(verifiedPhoneNumber)}
              className={getFieldClassName("ownerPhone", "mt-1 bg-white text-sm text-gray-900 placeholder:text-gray-400")}
              placeholder="+91 98XXXXXX"
              disabled={!isEditing}
            />
            {renderFieldMessage("ownerPhone")}
          </div>
        </div>
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-xl font-extrabold text-black mb-4">Restaurant Contact & Location</h2>
        <div>
          <Label className="text-xs font-bold text-gray-700 block mb-1">Primary Contact Number<span className="text-rose-500 ml-0.5">*</span></Label>
          <Input
            value={step1.primaryContactNumber || ""}
            onChange={(e) => {
              const val = normalizePrimaryContactNumber(e.target.value)
              const nextStep1 = { ...step1, primaryContactNumber: val }
              setStep1(nextStep1)
              revalidateTouchedField("primaryContactNumber", { step1: nextStep1 })
            }}
            onKeyDown={(e) => {
              const allowed = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Enter"]
              if (!allowed.includes(e.key) && !/^\d$/.test(e.key)) e.preventDefault()
              if (/^\d$/.test(e.key) && (step1.primaryContactNumber || "").length >= 11) e.preventDefault()
            }}
            onPaste={(e) => {
              e.preventDefault()
              const pasted = normalizePrimaryContactNumber(e.clipboardData.getData("text"))
              const nextStep1 = { ...step1, primaryContactNumber: pasted }
              setStep1(nextStep1)
              revalidateTouchedField("primaryContactNumber", { step1: nextStep1 })
            }}
            onBlur={() => handleFieldBlur("primaryContactNumber")}
            inputMode="numeric"
            className={getFieldClassName("primaryContactNumber", "mt-1 bg-white text-sm text-gray-900 placeholder:text-gray-400")}
            placeholder="Restaurant's primary contact number"
            disabled={!isEditing}
          />
          {renderFieldMessage("primaryContactNumber")}
          <p className="text-[11px] text-gray-500 mt-1">
            Customers, delivery partners and {companyName} may call on this number for order
            support.
          </p>
        </div>
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Add your restaurant's location for order pick-up.
          </p>
          <div>
            <Label className="text-xs font-bold text-gray-700 block mb-1">Service Zone<span className="text-rose-500 ml-0.5">*</span></Label>
            <select
              value={step1.zoneId || ""}
              onChange={(e) => {
                const newZoneId = e.target.value
                setStep1((prev) => {
                  const newState = { ...prev, zoneId: newZoneId }
                  if (newZoneId && prev.location?.latitude && prev.location?.longitude) {
                    const selectedZone = zones.find((z) => String(z?._id || z?.id || "") === String(newZoneId))
                    if (selectedZone) {
                      const polygon = normalizeZoneCoordinates(selectedZone)
                      if (!isPointInPolygon(Number(prev.location.latitude), Number(prev.location.longitude), polygon)) {
                        toast.warning("The current address is outside the newly selected zone. Please search for an address within this zone.")
                      }
                    }
                  }
                  return newState
                })
                revalidateTouchedField("zoneId", { step1: { ...step1, zoneId: newZoneId } })
              }}
              onBlur={() => handleFieldBlur("zoneId")}
              className={getFieldClassName("zoneId", `mt-1 w-full h-9 rounded-md border border-input bg-white px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#00c87e] cursor-pointer ${
                step1.zoneId ? "text-gray-900" : "text-gray-400"
              }`)}
              disabled={zonesLoading || !isEditing}
            >
              <option value="" className="text-gray-400">{zonesLoading ? "Loading zones..." : "Select a zone"}</option>
              {zones.map((z) => {
                const id = String(z?._id || z?.id || "")
                const label = z?.name || z?.zoneName || z?.serviceLocation || id
                return (
                  <option key={id} value={id} className="text-gray-900">
                    {label}
                  </option>
                )
              })}
            </select>
            {renderFieldMessage("zoneId")}
            <p className="text-[11px] text-gray-500 mt-1">
              Choose the service zone where your restaurant will be available.
            </p>
          </div>
          <div>
            <Label className="text-xs font-bold text-gray-700 block mb-1">Search Location</Label>
            <Input
              ref={locationSearchInputRef}
              className="mt-1 bg-white text-sm text-gray-900 placeholder:text-gray-400"
              placeholder="Start typing your restaurant address..."
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Select a suggestion to auto-fill area/city/state/pincode and coordinates.
            </p>
          </div>
          <Input
            value={step1.location?.addressLine1 || ""}
            onChange={(e) =>
              setStep1({
                ...step1,
                location: { ...step1.location, addressLine1: e.target.value },
              })
            }
              className="mt-1 bg-white text-sm text-gray-900 placeholder:text-gray-400"
            placeholder="Shop no. / building no. (optional)"
          />
          <Input
            value={step1.location?.addressLine2 || ""}
            onChange={(e) =>
              setStep1({
                ...step1,
                location: { ...step1.location, addressLine2: e.target.value.slice(0, 50) },
              })
            }
              className="mt-1 bg-white text-sm text-gray-900 placeholder:text-gray-400"
            placeholder="Floor / tower (optional)"
            maxLength={50}
          />
          <Input
            value={step1.location?.landmark || ""}
            onChange={(e) =>
              setStep1({
                ...step1,
                location: { ...step1.location, landmark: e.target.value.slice(0, 100) },
              })
            }
              className="mt-1 bg-white text-sm text-gray-900 placeholder:text-gray-400"
            placeholder="Nearby landmark (optional)"
            maxLength={100}
          />
            <Input
              value={step1.location?.area || ""}
              onChange={(e) => {
                const nextStep1 = {
                  ...step1,
                  location: { ...step1.location, area: e.target.value },
                }
                setStep1(nextStep1)
                revalidateTouchedField("location.area", { step1: nextStep1 })
              }}
            onBlur={() => handleFieldBlur("location.area")}
            readOnly={Boolean(step1.location?.latitude && step1.location?.longitude && step1.location?.area?.trim())}
            className={getFieldClassName("location.area", `bg-white text-sm text-gray-900 placeholder:text-gray-400 ${step1.location?.latitude && step1.location?.longitude && step1.location?.area?.trim() ? "bg-gray-100 cursor-not-allowed" : ""}`)}
            placeholder="Area / Sector / Locality*"
          />
          {renderFieldMessage("location.area")}
          <Input
            value={step1.location?.city || ""}
            onChange={(e) => {
              const val = e.target.value.replace(/[^a-zA-Z\s]/g, "")
                const nextStep1 = {
                  ...step1,
                  location: { ...step1.location, city: val },
                }
                setStep1(nextStep1)
                revalidateTouchedField("location.city", { step1: nextStep1 })
              }}
            onBlur={() => handleFieldBlur("location.city")}
            readOnly={Boolean(step1.location?.latitude && step1.location?.longitude && step1.location?.city?.trim())}
            className={getFieldClassName("location.city", `bg-white text-sm text-gray-900 placeholder:text-gray-400 ${step1.location?.latitude && step1.location?.longitude && step1.location?.city?.trim() ? "bg-gray-100 cursor-not-allowed" : ""}`)}
            placeholder="City"
          />
          {renderFieldMessage("location.city")}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              value={step1.location?.state || ""}
              onChange={(e) => {
                const val = e.target.value.replace(/[^a-zA-Z\s]/g, "")
                const nextStep1 = {
                  ...step1,
                  location: { ...step1.location, state: val },
                }
                setStep1(nextStep1)
                revalidateTouchedField("location.state", { step1: nextStep1 })
              }}
              onBlur={() => handleFieldBlur("location.state")}
              readOnly={Boolean(step1.location?.latitude && step1.location?.longitude && step1.location?.state?.trim())}
              className={getFieldClassName("location.state", `bg-white text-sm text-gray-900 placeholder:text-gray-400 ${step1.location?.latitude && step1.location?.longitude && step1.location?.state?.trim() ? "bg-gray-100 cursor-not-allowed" : ""}`)}
              placeholder="State"
            />
            {renderFieldMessage("location.state")}
            <Input
              value={step1.location?.pincode || ""}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 6)
                const nextStep1 = {
                  ...step1,
                  location: { ...step1.location, pincode: val },
                }
                setStep1(nextStep1)
                revalidateTouchedField("location.pincode", { step1: nextStep1 })
              }}
              onBlur={() => handleFieldBlur("location.pincode")}
              readOnly={Boolean(step1.location?.latitude && step1.location?.longitude && step1.location?.pincode?.trim())}
              className={getFieldClassName("location.pincode", `bg-white text-sm text-gray-900 placeholder:text-gray-400 ${step1.location?.latitude && step1.location?.longitude && step1.location?.pincode?.trim() ? "bg-gray-100 cursor-not-allowed" : ""}`)}
              placeholder="Pincode"
            />
            {renderFieldMessage("location.pincode")}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            Please ensure that this address is the same as mentioned on your FSSAI license.
          </p>
        </div>
      </section>
    </div>
  )

  // Initialize Google Places Autocomplete for Step 1 location search.
  useEffect(() => {
    if (step !== 1) return

    let cancelled = false

    const init = async () => {
      // Wait for the ref to be attached (up to 1s)
      for (let i = 0; i < 20; i++) {
        if (locationSearchInputRef.current) break
        await new Promise((r) => setTimeout(r, 50))
      }
      if (!locationSearchInputRef.current || cancelled) return

      const loadMaps = async () => {
        if (mapsScriptLoadedRef.current && window.google?.maps?.places?.Autocomplete) return true
        if (window.google?.maps?.places?.Autocomplete) {
          mapsScriptLoadedRef.current = true
          return true
        }
        const apiKey = await getGoogleMapsApiKey()
        if (!apiKey) return false

        const existing = document.getElementById("restaurant-onboarding-maps-script")
        if (existing) {
          for (let i = 0; i < 30; i += 1) {
            if (window.google?.maps?.places?.Autocomplete) {
              mapsScriptLoadedRef.current = true
              return true
            }
            await new Promise((r) => setTimeout(r, 100))
          }
          return false
        }

        await new Promise((resolve, reject) => {
          const script = document.createElement("script")
          script.id = "restaurant-onboarding-maps-script"
          script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry&v=weekly`
          script.async = true
          script.defer = true
          script.onload = resolve
          script.onerror = reject
          document.head.appendChild(script)
        })
        mapsScriptLoadedRef.current = true
        return !!window.google?.maps?.places?.Autocomplete
      }

      const getParsedAddressParts = (components = []) => {
        const comps = Array.isArray(components) ? components : []
        const get = (types, key = "long_name") =>
          comps.find((c) => types.some((t) => c.types?.includes(t)))?.[key] || ""
        const area =
          get(["sublocality_level_1", "sublocality", "neighborhood"]) ||
          get(["locality"]) ||
          get(["administrative_area_level_2"])
        const city =
          get(["locality"]) ||
          get(["administrative_area_level_2"])
        const state = get(["administrative_area_level_1"])
        const pincode = get(["postal_code"])
        return { area, city, state, pincode }
      }

      const parsePlace = (place) => {
        const formattedAddress = place?.formatted_address || ""
        const { area, city, state, pincode } = getParsedAddressParts(place?.address_components)
        const lat = place?.geometry?.location?.lat?.()
        const lng = place?.geometry?.location?.lng?.()
        return {
          formattedAddress,
          area,
          city,
          state,
          pincode,
          latitude: Number.isFinite(lat) ? Number(lat.toFixed(6)) : "",
          longitude: Number.isFinite(lng) ? Number(lng.toFixed(6)) : "",
        }
      }

      const getCityCenterPincode = (parsed, place) => {
        const placeTypes = Array.isArray(place?.types) ? place.types : []
        const isCitySelection = placeTypes.some((type) =>
          ["locality", "postal_town", "administrative_area_level_2"].includes(type)
        )

        if (!isCitySelection) return ""

        const city = normalizeAddressToken(parsed?.city)
        const area = normalizeAddressToken(parsed?.area)
        const state = normalizeAddressToken(parsed?.state)
        const formattedAddress = normalizeAddressToken(parsed?.formattedAddress)
        const looksLikeWholeCity = city && area === city && formattedAddress.startsWith(`${city},`)

        if (!looksLikeWholeCity) return ""

        return CITY_CENTER_PINCODES[`${city}|${state}`] || ""
      }

      const geocodePlace = async (place) => {
        const geocoder = new window.google.maps.Geocoder()
        const placeId = place?.place_id
        const placeTypes = Array.isArray(place?.types) ? place.types : []
        const formattedAddress = String(place?.formatted_address || "").trim()
        const lat = place?.geometry?.location?.lat?.()
        const lng = place?.geometry?.location?.lng?.()
        const isBroadLocationSelection = placeTypes.some((type) =>
          [
            "locality",
            "administrative_area_level_1",
            "administrative_area_level_2",
            "administrative_area_level_3",
            "postal_town",
          ].includes(type)
        )

        const requests = [
          placeId ? { source: "placeId", request: { placeId } } : null,
          Number.isFinite(lat) && Number.isFinite(lng)
            ? { source: "location", request: { location: { lat, lng } } }
            : null,
          formattedAddress ? { source: "address", request: { address: formattedAddress } } : null,
        ].filter(Boolean)

        if (!requests.length) return null

        const geocodeRequest = ({ source, request }) =>
          new Promise((resolve) => {
            geocoder.geocode(request, (results, status) => {
              if (status !== "OK" || !Array.isArray(results) || !results.length) {
                resolve({ source, results: [] })
                return
              }
              resolve({ source, results })
            })
          })

        const resultGroups = await Promise.all(requests.map(geocodeRequest))
        const addressResults = resultGroups.find((group) => group.source === "address")?.results || []
        const orderedResults = [
          ...(isBroadLocationSelection ? addressResults : []),
          ...resultGroups.flatMap((group) => group.results),
        ]
        const seenResults = new Set()
        const results = orderedResults.filter((result) => {
          const key = `${result?.place_id || ""}::${result?.formatted_address || ""}`
          if (seenResults.has(key)) return false
          seenResults.add(key)
          return true
        })

        if (!results.length) return null

        const [primaryResult, ...fallbackResults] = results
        const primaryParsed = getParsedAddressParts(primaryResult?.address_components)

        return fallbackResults.reduce(
          (acc, result) => {
            const parsed = getParsedAddressParts(result?.address_components)
            return {
              formattedAddress: acc.formattedAddress || result?.formatted_address || "",
              area: acc.area || parsed.area || "",
              city: acc.city || parsed.city || "",
              state: acc.state || parsed.state || "",
              pincode: acc.pincode || parsed.pincode || "",
              geometry: acc.geometry || result?.geometry || null,
            }
          },
          {
            formattedAddress: primaryResult?.formatted_address || "",
            area: primaryParsed.area || "",
            city: primaryParsed.city || "",
            state: primaryParsed.state || "",
            pincode: primaryParsed.pincode || "",
            geometry: primaryResult?.geometry || null,
          }
        )
      }

      const ok = await loadMaps()
      if (!ok || cancelled || !locationSearchInputRef.current) return
      if (placesAutocompleteRef.current) return

      placesAutocompleteRef.current = new window.google.maps.places.Autocomplete(
        locationSearchInputRef.current,
        {
          fields: ["formatted_address", "address_components", "geometry", "place_id", "types"],
          componentRestrictions: { country: "in" },
        }
      )

      placesAutocompleteRef.current.addListener("place_changed", async () => {
        const place = placesAutocompleteRef.current.getPlace()
        let parsed = parsePlace(place)

        if (!parsed.pincode || !parsed.area || !parsed.city || !parsed.state) {
          const geocodedPlace = await geocodePlace(place)
          if (geocodedPlace) {
            parsed = {
              ...parsed,
              formattedAddress: parsed.formattedAddress || geocodedPlace.formattedAddress || "",
              area: parsed.area || geocodedPlace.area || "",
              city: parsed.city || geocodedPlace.city || "",
              state: parsed.state || geocodedPlace.state || "",
              pincode: parsed.pincode || geocodedPlace.pincode || "",
            }
          }
        }

        const cityCenterPincode = getCityCenterPincode(parsed, place)
        if (cityCenterPincode) {
          parsed = {
            ...parsed,
            pincode: cityCenterPincode,
          }
        }

        // Validation: Ensure selected location is within the chosen zone
        if (step1.zoneId && parsed.latitude && parsed.longitude) {
          const selectedZone = zones.find((z) => String(z?._id || z?.id || "") === String(step1.zoneId))
          if (selectedZone) {
            const polygon = normalizeZoneCoordinates(selectedZone)
            if (!isPointInPolygon(parsed.latitude, parsed.longitude, polygon)) {
              toast.error("The selected location is outside your chosen service zone. Please select a location within the zone.")
              if (locationSearchInputRef.current) {
                locationSearchInputRef.current.value = ""
              }
              return
            }
          }
        }

        if (locationSearchInputRef.current) {
          locationSearchInputRef.current.value = parsed.formattedAddress || ""
        }

        setStep1((prev) => {
          const previousAutoAddress = String(prev.location.formattedAddress || "").trim()
          const currentAddressLine1 = String(prev.location.addressLine1 || "").trim()
          const shouldReplaceAddressLine1 =
            !currentAddressLine1 || currentAddressLine1 === previousAutoAddress

          return {
            ...prev,
            location: {
              ...prev.location,
              formattedAddress: parsed.formattedAddress || "",
              addressLine1: shouldReplaceAddressLine1
                ? (parsed.formattedAddress || "")
                : prev.location.addressLine1,
              area: parsed.area || "",
              city: parsed.city || "",
              state: parsed.state || "",
              pincode: parsed.pincode || "",
              latitude: parsed.latitude !== "" ? parsed.latitude : "",
              longitude: parsed.longitude !== "" ? parsed.longitude : "",
            },
          }
        })
      })
    }

    init().catch((err) => {
      debugWarn("Failed to load Google Places for onboarding:", err)
    })

    return () => {
      cancelled = true
      placesAutocompleteRef.current = null
    }
  }, [step, step1.zoneId, zones])

  // Load zones for onboarding dropdown (public endpoint).
  useEffect(() => {
    if (step !== 1) return
    let cancelled = false
    setZonesLoading(true)
    zoneAPI.getPublicZones()
      .then((res) => {
        const list = res?.data?.data?.zones || res?.data?.zones || []
        if (!cancelled) setZones(Array.isArray(list) ? list : [])
      })
      .catch(() => {
        if (!cancelled) setZones([])
      })
      .finally(() => {
        if (!cancelled) setZonesLoading(false)
      })
    return () => { cancelled = true }
  }, [step])

  const renderStep2 = () => (
    <div className="space-y-6">
      {/* Images section */}
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-5">
        <h2 className="text-xl font-extrabold text-black mb-4">Menu & Photos</h2>
        <p className="text-xs text-gray-500">
          Add clear photos of your printed menu and a primary profile image. This helps customers
          understand what you serve.
        </p>

        {/* Menu images */}
        <div className="space-y-2">
          <Label className="text-base font-extrabold text-gray-900 block mb-1">Menu Images<span className="text-rose-500 ml-0.5">*</span></Label>
          <div className="mt-1 border border-dashed border-gray-300 rounded-md bg-gray-50/50 p-4 space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-white border border-gray-100 flex items-center justify-center flex-shrink-0 shadow-sm">
                <ImageIcon className="w-6 h-6 text-gray-600" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-gray-900">Upload Menu Images</span>
                <span className="text-[11px] text-gray-500">
                  JPG, PNG, WebP (Max size 5MB). You can select multiple files (Max {MAX_MENU_IMAGES_COUNT})
                </span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full text-xs h-9 cursor-pointer"
              onClick={() => menuImagesInputRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-1.5" />
              Upload
            </Button>
          </div>
          <input
            id="menuImagesInput"
            type="file"
            multiple
            accept={LOCAL_IMAGE_FILE_ACCEPT}
            className="hidden"
            ref={menuImagesInputRef}
            onChange={(e) => {
                const files = Array.from(e.target.files || [])
                if (!files.length) return
                
                const currentCount = step2.menuImages.length
                const validFiles = []
                
                for (const file of files) {
                  if (validateFile(file)) {
                    validFiles.push(file)
                  }
                }
                
                if (validFiles.length + currentCount > MAX_MENU_IMAGES_COUNT) {
                  toast.error("Cannot upload more than 10 menu images.")
                  const remaining = MAX_MENU_IMAGES_COUNT - currentCount
                  if (remaining <= 0) {
                    e.target.value = ''
                    return
                  }
                  validFiles.splice(remaining)
                }
                
                if (validFiles.length > 0) {
                  debugLog('?? Valid menu images selected:', validFiles.length)
                  setStep2((prev) => ({
                    ...prev,
                    menuImages: [...(prev.menuImages || []), ...validFiles],
                  }))
                }
                // Reset input to allow selecting same file again
                e.target.value = ''
              }}
            />
          
          {/* Menu image previews */}
          {!!step2.menuImages.length && (
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {step2.menuImages.map((file, idx) => {
                // Handle both File objects and URL objects
                let imageUrl = null
                let imageName = `Image ${idx + 1}`

                if (isUploadableFile(file)) {
                  imageUrl = getPreviewImageUrl(file)
                  imageName = file.name || imageName
                } else if (file?.url) {
                  // If it's an object with url property (from backend)
                  imageUrl = file.url
                  imageName = file.name || `Image ${idx + 1}`
                } else if (typeof file === 'string') {
                  // If it's a direct URL string
                  imageUrl = file
                }

                return (
                  <div
                    key={idx}
                    className="relative w-full h-32 sm:h-48 rounded-md overflow-hidden bg-gray-100 border border-gray-200"
                  >
                    <div className="absolute top-1 right-1 z-30">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setStep2((prev) => ({
                            ...prev,
                            menuImages: prev.menuImages.filter((_, i) => i !== idx),
                          }));
                        }}
                        className="bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={`Menu ${idx + 1}`}
                        className="w-full h-full object-contain bg-gray-50"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[11px] text-gray-500 px-2 text-center">
                        Preview unavailable
                      </div>
                    )}
                    <div className="absolute bottom-0 inset-x-0 bg-black/60 px-2 py-1">
                      <p className="text-[10px] text-white truncate">
                        {imageName}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Profile image */}
        <div className="space-y-2">
          <Label className="text-base font-extrabold text-gray-900 block mb-1">Restaurant Profile Image<span className="text-rose-500 ml-0.5">*</span></Label>
          <div className="mt-1 border border-dashed border-gray-300 rounded-md bg-gray-50/50 p-4 space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-shrink-0">
                <div className="h-16 w-16 rounded-full bg-white flex items-center justify-center overflow-hidden border border-gray-100 shadow-sm">
                  {step2.profileImage ? (
                    (() => {
                      const imageSrc = getPreviewImageUrl(step2.profileImage)

                      return imageSrc ? (
                        <img
                          src={imageSrc}
                          alt="Restaurant profile"
                          className="w-full h-full object-contain bg-gray-50"
                        />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-gray-500" />
                      );
                    })()
                  ) : (
                    <ImageIcon className="w-5 h-5 text-gray-500" />
                  )}
                </div>
                {step2.profileImage && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setStep2((prev) => ({
                        ...prev,
                        profileImage: null,
                      }));
                    }}
                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors z-10 cursor-pointer"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-gray-900">Upload Profile Image</span>
                <span className="text-[11px] text-gray-500">
                  JPG, PNG, WebP (Max size 5MB). This will be shown on your listing card and restaurant page.
                </span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full text-xs h-9 cursor-pointer"
              onClick={() => profileImageInputRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-1.5" />
              Upload
            </Button>
          </div>
          <input
            id="profileImageInput"
            type="file"
            accept={LOCAL_IMAGE_FILE_ACCEPT}
            className="hidden"
            ref={profileImageInputRef}
            onChange={(e) => {
              const file = e.target.files?.[0] || null
              if (file && validateFile(file)) {
                debugLog('?? Profile image selected:', file.name)
                setStep2((prev) => ({
                  ...prev,
                  profileImage: file,
                }))
              }
              // Reset input to allow selecting same file again
              e.target.value = ''
            }}
          />
        </div>
      </section>

      {/* Operational details */}
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-5">
        {/* Timings with popover time selectors */}
        <div className="space-y-3">
          <Label className="text-xs font-bold text-gray-700 block mb-1">Restaurant Timings<span className="text-rose-500 ml-0.5">*</span></Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TimeSelector
              label="Opening Time*"
              value={step2.openingTime || ""}
              onChange={(val) =>
                setStep2((prev) => ({ ...prev, openingTime: normalizeTimeValue(val) || "" }))
              }
            />
            <TimeSelector
              label="Closing Time*"
              value={step2.closingTime || ""}
              onChange={(val) =>
                setStep2((prev) => ({ ...prev, closingTime: normalizeTimeValue(val) || "" }))
              }
            />
          </div>
        </div>

        {/* Open days in a calendar-like grid */}
        <div className="space-y-2">
          <Label className="text-xs font-bold text-gray-700 flex items-center gap-1.5 mb-1">
            <CalendarIcon className="w-3.5 h-3.5 text-gray-800" />
            <span>Open Days<span className="text-rose-500 ml-0.5">*</span></span>
          </Label>
          <p className="text-[11px] text-gray-500">
            Select the days your restaurant accepts orders.
          </p>
          <div className="mt-1 grid grid-cols-7 gap-1.5 sm:gap-2">
            {daysOfWeek.map((day) => {
              const active = step2.openDays.includes(day)
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`flex h-10 items-center justify-center rounded-md px-1 text-[10px] font-medium leading-none sm:h-11 sm:text-xs cursor-pointer ${active ? "bg-[#00c87e] text-white" : "bg-gray-100 text-gray-800"
                    }`}

                >
                  {day}
                </button>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )

  const renderStep3 = () => (
    <div className="space-y-6">
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-xl font-extrabold text-black mb-4">PAN Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs font-bold text-gray-700 block mb-1">PAN Number<span className="text-rose-500 ml-0.5">*</span></Label>
            <Input
              value={step3.panNumber || ""}
              onChange={(e) => {
                const normalized = e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "")
                  .slice(0, 10)
                const nextStep3 = { ...step3, panNumber: normalized }
                setStep3(nextStep3)
                revalidateTouchedField("panNumber", { step3: nextStep3 })
              }}
              onBlur={() => handleFieldBlur("panNumber")}
              className={getFieldClassName("panNumber", "mt-1 bg-white text-sm text-gray-900 placeholder:text-gray-400")}
              placeholder="ABCDE1234F"
            />
            {renderFieldMessage("panNumber")}
          </div>
          <div>
            <Label className="text-xs font-bold text-gray-700 block mb-1">PAN Card Holder Name<span className="text-rose-500 ml-0.5">*</span></Label>
            <Input
              value={step3.nameOnPan || ""}
              onChange={(e) => {
                const nextStep3 = {
                  ...step3,
                  nameOnPan: e.target.value.replace(/[^A-Za-z ]/g, ""),
                }
                setStep3(nextStep3)
                revalidateTouchedField("nameOnPan", { step3: nextStep3 })
              }}
              onBlur={() => handleFieldBlur("nameOnPan")}
              className={getFieldClassName("nameOnPan", "mt-1 bg-white text-sm text-gray-900 placeholder:text-gray-400")}
              placeholder="Name on PAN card"
              maxLength={50}
            />
            {renderFieldMessage("nameOnPan")}
          </div>
        </div>
        <div>
          <Label className="text-xs font-bold text-gray-700 block mb-1">PAN Image<span className="text-rose-500 ml-0.5">*</span></Label>
          <p className="text-[11px] text-gray-500 mt-1">JPG, PNG, WebP (Max size 5MB)</p>
          <Button
            type="button"
            variant="outline"
            className="mt-2 w-full text-xs cursor-pointer"
            onClick={() => panImageInputRef.current?.click()}
          >
            <Upload className="w-4 h-4 mr-1.5" />
            Upload
          </Button>
          <input
            type="file"
            accept={GALLERY_IMAGE_ACCEPT}
            className="hidden"
            ref={panImageInputRef}
            onChange={(e) => {
              const file = e.target.files?.[0] || null
              if (file && validateFile(file)) {
                setStep3((prev) => ({ ...prev, panImage: file }))
              }
              e.target.value = ''
            }}
          />
          {step3.panImage && (
            <div className="mt-3 relative w-full max-w-sm h-32 sm:h-40 rounded-md overflow-hidden bg-gray-100 border border-gray-200">
              {getPreviewImageUrl(step3.panImage) ? (
                <img
                  src={getPreviewImageUrl(step3.panImage)}
                  alt="PAN document"
                  className="w-full h-full object-contain bg-gray-50"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                  Preview unavailable
                </div>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setStep3((prev) => ({ ...prev, panImage: null }))
                }}
                className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-xl font-extrabold text-black mb-4">GST Details</h2>
        <div className="flex gap-4 items-center text-sm">
          <span className="text-gray-700">GST Registered?</span>
          <button
            type="button"
            onClick={() => setStep3({ ...step3, gstRegistered: true })}
            className={`px-3 py-1.5 text-xs rounded-full cursor-pointer ${step3.gstRegistered ? "bg-[#00c87e] text-white" : "bg-gray-100 text-gray-800"
              }`}
          >

            Yes
          </button>
          <button
            type="button"
            onClick={() => setStep3({ ...step3, gstRegistered: false })}
            className={`px-3 py-1.5 text-xs rounded-full cursor-pointer ${!step3.gstRegistered ? "bg-[#00c87e] text-white" : "bg-gray-100 text-gray-800"
              }`}
          >

            No
          </button>
        </div>
        {step3.gstRegistered && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-bold text-gray-700 block mb-1">GST Number<span className="text-rose-500 ml-0.5">*</span></Label>
              <Input
                value={step3.gstNumber || ""}
                onChange={(e) => {
                  const nextStep3 = {
                    ...step3,
                    gstNumber: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 15),
                  }
                  setStep3(nextStep3)
                  revalidateTouchedField("gstNumber", { step3: nextStep3 })
                }}
                onBlur={() => handleFieldBlur("gstNumber")}
              className={getFieldClassName("gstNumber", "mt-1 bg-white text-sm text-gray-900 placeholder:text-gray-400")}
                placeholder="GST number (15 characters)"
              />
              {renderFieldMessage("gstNumber")}
            </div>
            <div>
              <Label className="text-xs font-bold text-gray-700 block mb-1">GST Legal Name<span className="text-rose-500 ml-0.5">*</span></Label>
              <Input
                value={step3.gstLegalName || ""}
                onChange={(e) => {
                  const nextStep3 = {
                    ...step3,
                    gstLegalName: e.target.value.replace(/[^A-Za-z ]/g, ""),
                  }
                  setStep3(nextStep3)
                  revalidateTouchedField("gstLegalName", { step3: nextStep3 })
                }}
                onBlur={() => handleFieldBlur("gstLegalName")}
              className={getFieldClassName("gstLegalName", "mt-1 bg-white text-sm text-gray-900 placeholder:text-gray-400")}
                placeholder="GST legal name"
              />
              {renderFieldMessage("gstLegalName")}
            </div>
            <div>
              <Label className="text-xs font-bold text-gray-700 block mb-1">GST Registered Address<span className="text-rose-500 ml-0.5">*</span></Label>
              <Input
                value={step3.gstAddress || ""}
                onChange={(e) => {
                  const nextStep3 = { ...step3, gstAddress: e.target.value }
                  setStep3(nextStep3)
                  revalidateTouchedField("gstAddress", { step3: nextStep3 })
                }}
                onBlur={() => handleFieldBlur("gstAddress")}
              className={getFieldClassName("gstAddress", "mt-1 bg-white text-sm text-gray-900 placeholder:text-gray-400")}
                placeholder="GST registered address"
              />
              {renderFieldMessage("gstAddress")}
            </div>
            <div>
              <Label className="text-xs font-bold text-gray-700 block mb-1">GST Image<span className="text-rose-500 ml-0.5">*</span></Label>
              <p className="text-[11px] text-gray-500 mt-1">JPG, PNG, WebP (Max size 5MB)</p>
              <Button
                type="button"
                variant="outline"
                className="mt-2 w-full text-xs cursor-pointer"
                onClick={() => gstImageInputRef.current?.click()}
              >
                <Upload className="w-4 h-4 mr-1.5" />
                Upload
              </Button>
            </div>
            <input
              type="file"
              accept={GALLERY_IMAGE_ACCEPT}
              className="hidden"
              ref={gstImageInputRef}
              onChange={(e) => {
                const file = e.target.files?.[0] || null
                if (file && validateFile(file)) {
                  setStep3((prev) => ({ ...prev, gstImage: file }))
                }
                e.target.value = ''
              }}
            />
            {step3.gstImage && (
              <div className="mt-3 relative w-full max-w-sm h-32 sm:h-40 rounded-md overflow-hidden bg-gray-100 border border-gray-200">
                {getPreviewImageUrl(step3.gstImage) ? (
                  <img
                    src={getPreviewImageUrl(step3.gstImage)}
                    alt="GST document"
                    className="w-full h-full object-contain bg-gray-50"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                    Preview unavailable
                  </div>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setStep3((prev) => ({ ...prev, gstImage: null }))
                  }}
                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-xl font-extrabold text-black mb-4">FSSAI Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs font-bold text-gray-700 block mb-1">FSSAI Number<span className="text-rose-500 ml-0.5">*</span></Label>
            <Input
              value={step3.fssaiNumber || ""}
              onChange={(e) => {
                const nextStep3 = { ...step3, fssaiNumber: e.target.value.replace(/\D/g, "").slice(0, 14) }
                setStep3(nextStep3)
                revalidateTouchedField("fssaiNumber", { step3: nextStep3 })
              }}
              onBlur={() => handleFieldBlur("fssaiNumber")}
              className={getFieldClassName("fssaiNumber", "mt-1 bg-white text-sm text-gray-900 placeholder:text-gray-400")}
              placeholder="FSSAI number (14 digits)"
            />
            {renderFieldMessage("fssaiNumber")}
          </div>
          <div>
            <Label className="text-xs font-bold text-gray-700 mb-1 block">FSSAI Expiry Date<span className="text-rose-500 ml-0.5">*</span></Label>
            <Popover
              open={isFssaiCalendarOpen}
              onOpenChange={(open) => {
                setIsFssaiCalendarOpen(open)
                if (!open) handleFieldBlur("fssaiExpiry")
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  onClick={() => setIsFssaiCalendarOpen(true)}
                  className={getFieldClassName("fssaiExpiry", "w-full px-3 py-2 border border-gray-200 rounded-md bg-white text-sm text-left flex items-center justify-between hover:bg-gray-50 cursor-pointer")}
                >
                  <span className={step3.fssaiExpiry ? "text-gray-900" : "text-gray-400"}>
                    {step3.fssaiExpiry
                      ? parseLocalYMDDate(step3.fssaiExpiry)?.toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                      : "Select expiry date"}
                  </span>
                  <CalendarIcon className="w-4 h-4 text-gray-500" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-100" align="start">
                <div className="bg-white rounded-md shadow-lg border border-gray-200">
                  <Calendar
                    mode="single"
                    captionLayout="dropdown"
                    fromYear={new Date().getFullYear()}
                    toYear={getLocalDateYearsFromToday(FSSAI_VALIDITY_YEARS).getFullYear()}
                    selected={parseLocalYMDDate(step3.fssaiExpiry)}
                    defaultMonth={parseLocalYMDDate(step3.fssaiExpiry)}
                    disabled={(date) => {
                      const formattedDate = formatDateToLocalYMD(date)
                      return isFssaiExpiryOutsideAllowedRange(formattedDate)
                    }}
                    onSelect={(date) => {
                      if (!date) return

                      const formattedDate = formatDateToLocalYMD(date)
                      if (!isFssaiExpiryOutsideAllowedRange(formattedDate)) {
                        const nextStep3 = { ...step3, fssaiExpiry: formattedDate }
                        setStep3(nextStep3)
                        revalidateTouchedField("fssaiExpiry", { step3: nextStep3 })
                        setIsFssaiCalendarOpen(false)
                        return
                      }

                      toast.error(`Please select an FSSAI expiry date within ${FSSAI_VALIDITY_YEARS} years from today`, {
                        duration: 4000,
                      })
                    }}
                    initialFocus
                    classNames={{
                      today: "bg-transparent text-foreground border-none", // Remove today highlight
                    }}
                  />
                </div>
              </PopoverContent>
            </Popover>
            {renderFieldMessage("fssaiExpiry")}
          </div>
        </div>
        <div>
          <Label className="text-xs font-bold text-gray-700 block mb-1">FSSAI Image<span className="text-rose-500 ml-0.5">*</span></Label>
          <p className="text-[11px] text-gray-500 mt-1">JPG, PNG, WebP (Max size 5MB)</p>
          <Button
            type="button"
            variant="outline"
            className="mt-2 w-full text-xs cursor-pointer"
            onClick={() => fssaiImageInputRef.current?.click()}
          >
            <Upload className="w-4 h-4 mr-1.5" />
            Upload
          </Button>
        </div>
        <input
          type="file"
          accept={GALLERY_IMAGE_ACCEPT}
          className="hidden"
          ref={fssaiImageInputRef}
          onChange={(e) => {
            const file = e.target.files?.[0] || null
            if (file && validateFile(file)) {
              setStep3((prev) => ({ ...prev, fssaiImage: file }))
            }
            e.target.value = ''
          }}
        />
        {step3.fssaiImage && (
          <div className="mt-3 relative w-full max-w-sm h-32 sm:h-40 rounded-md overflow-hidden bg-gray-100 border border-gray-200">
            {getPreviewImageUrl(step3.fssaiImage) ? (
              <img
                src={getPreviewImageUrl(step3.fssaiImage)}
                alt="FSSAI document"
                className="w-full h-full object-contain bg-gray-50"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                Preview unavailable
              </div>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setStep3((prev) => ({ ...prev, fssaiImage: null }))
              }}
              className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-xl font-extrabold text-black mb-4">Bank Account Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs font-bold text-gray-700 block mb-1">Account Number<span className="text-rose-500 ml-0.5">*</span></Label>
            <Input
              value={step3.accountNumber || ""}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 18)
                const nextStep3 = { ...step3, accountNumber: val }
                setStep3(nextStep3)
                revalidateTouchedField("accountNumber", { step3: nextStep3 })
                revalidateTouchedField("confirmAccountNumber", { step3: nextStep3 })
              }}
              onBlur={() => handleFieldBlur("accountNumber")}
              className={getFieldClassName("accountNumber", "mt-1 bg-white text-sm text-gray-900 placeholder:text-gray-400")}
              placeholder="Account number"
            />
            {renderFieldMessage("accountNumber")}
          </div>
          <div>
            <Label className="text-xs font-bold text-gray-700 block mb-1">Confirm Account Number<span className="text-rose-500 ml-0.5">*</span></Label>
            <div className="relative mt-1">
              <Input
                type={showConfirmAccountNumber ? "text" : "password"}
                value={step3.confirmAccountNumber || ""}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 18)
                  const nextStep3 = { ...step3, confirmAccountNumber: val }
                  setStep3(nextStep3)
                  revalidateTouchedField("confirmAccountNumber", { step3: nextStep3 })
                }}
                onPaste={(e) => e.preventDefault()}
                onBlur={() => handleFieldBlur("confirmAccountNumber")}
                className={getFieldClassName("confirmAccountNumber", "bg-white text-sm text-gray-900 placeholder:text-gray-400 pr-10")}
                placeholder="Re-enter account number"
              />
              <button
                type="button"
                onClick={() => setShowConfirmAccountNumber(!showConfirmAccountNumber)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
                aria-label={showConfirmAccountNumber ? "Hide account number" : "Show account number"}
              >
                {showConfirmAccountNumber ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            {renderFieldMessage("confirmAccountNumber")}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs font-bold text-gray-700 block mb-1">IFSC Code<span className="text-rose-500 ml-0.5">*</span></Label>
            <Input
              value={step3.ifscCode || ""}
              onChange={(e) => {
                const nextStep3 = {
                  ...step3,
                  ifscCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11),
                }
                setStep3(nextStep3)
                revalidateTouchedField("ifscCode", { step3: nextStep3 })
              }}
              onBlur={() => handleFieldBlur("ifscCode")}
              className={getFieldClassName("ifscCode", "mt-1 bg-white text-sm text-gray-900 placeholder:text-gray-400")}
              placeholder="e.g. SBIN0001234"
            />
            {renderFieldMessage("ifscCode")}
          </div>
          <div>
            <Label className="text-xs font-bold text-gray-700 block mb-1">Account Type<span className="text-rose-500 ml-0.5">*</span></Label>
            <Select
              value={step3.accountType || ""}
              onValueChange={(value) => {
                const nextStep3 = { ...step3, accountType: value }
                setStep3(nextStep3)
                setFieldTouched((prev) => ({ ...prev, accountType: true }))
                setFieldValidation("accountType", { step3: nextStep3 })
              }}
            >
              <SelectTrigger className={getFieldClassName("accountType", "mt-1 bg-white text-sm text-gray-900 data-[placeholder]:text-gray-400 cursor-pointer")}>
                <SelectValue placeholder="Select account type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Saving">Saving</SelectItem>
                <SelectItem value="Current">Current</SelectItem>
              </SelectContent>
            </Select>
            {renderFieldMessage("accountType")}
          </div>
        </div>
        <div>
          <Label className="text-xs font-bold text-gray-700 block mb-1">Account Holder Name<span className="text-rose-500 ml-0.5">*</span></Label>
          <Input
            value={step3.accountHolderName || ""}
            onChange={(e) => {
              const nextStep3 = {
                ...step3,
                accountHolderName: e.target.value.replace(/[^A-Za-z ]/g, "").slice(0, 50),
              }
              setStep3(nextStep3)
              revalidateTouchedField("accountHolderName", { step3: nextStep3 })
            }}
            onBlur={() => handleFieldBlur("accountHolderName")}
            className={getFieldClassName("accountHolderName", "mt-1 bg-white text-sm text-gray-900 placeholder:text-gray-400")}
            placeholder="Account holder name"
          />
          {renderFieldMessage("accountHolderName")}
        </div>
      </section>
    </div>
  )

  const renderStep4 = () => (
    <div className="space-y-6">
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-xl font-extrabold text-black mb-4">Restaurant Display Information</h2>
        <p className="text-sm text-gray-600">
          Add information that will be displayed to customers on the home page
        </p>

        <div>
          <Label className="text-xs font-bold text-gray-700 block mb-1">Estimated Preparation Time<span className="text-rose-500 ml-0.5">*</span></Label>
          <Select
            value={step4.estimatedDeliveryTime || ""}
            onValueChange={(value) => {
              const nextStep4 = { ...step4, estimatedDeliveryTime: value }
              setStep4(nextStep4)
              setFieldTouched((prev) => ({ ...prev, estimatedDeliveryTime: true }))
              setFieldValidation("estimatedDeliveryTime", { step4: nextStep4 })
            }}
          >
            <SelectTrigger className={getFieldClassName("estimatedDeliveryTime", "mt-1 bg-white text-sm text-gray-900 data-[placeholder]:text-gray-400 cursor-pointer")}>
              <SelectValue placeholder="Select estimated timing" />
            </SelectTrigger>
            <SelectContent>
              {[
                ...ESTIMATED_DELIVERY_TIME_OPTIONS,
                ...(step4.estimatedDeliveryTime &&
                !ESTIMATED_DELIVERY_TIME_OPTIONS.includes(step4.estimatedDeliveryTime)
                  ? [step4.estimatedDeliveryTime]
                  : []),
              ].map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {renderFieldMessage("estimatedDeliveryTime")}
        </div>

        <div>
          <Label className="text-xs font-bold text-gray-700 block mb-1">Featured Dish Name<span className="text-rose-500 ml-0.5">*</span></Label>
          <Input
            value={step4.featuredDish || ""}
            onChange={(e) => {
              const nextStep4 = {
                ...step4,
                featuredDish: e.target.value.replace(/[^A-Za-z ]/g, "").slice(0, 30),
              }
              setStep4(nextStep4)
              revalidateTouchedField("featuredDish", { step4: nextStep4 })
            }}
            onBlur={() => handleFieldBlur("featuredDish")}
            className={getFieldClassName("featuredDish", "mt-1 bg-white text-sm text-gray-900 placeholder:text-gray-400")}
            placeholder="e.g., Butter Chicken Special"
            maxLength={30}
          />
          {renderFieldMessage("featuredDish")}
          <p className="text-[11px] text-gray-500 mt-1">Maximum 30 characters allowed</p>
        </div>

        <div>
          <Label className="text-xs font-bold text-gray-700 block mb-1">Special Offer/Promotion (Optional)</Label>
          <Input
            value={step4.offer || ""}
            onChange={(e) => setStep4({ ...step4, offer: e.target.value.slice(0, 80) })}
            className="mt-1 bg-white text-sm text-gray-900 placeholder:text-gray-400"
            placeholder="e.g., Flat 50 Rs. OFF on Order Above Rs.199"
            maxLength={80}
          />
          <p className="text-[11px] text-gray-500 mt-1">
            Maximum 80 characters allowed. Optional. Leave this blank if you do not want to highlight an offer.
          </p>
        </div>

        <div className="border-t border-gray-200 pt-4 space-y-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <Label className="text-xs font-bold text-gray-700 block mb-1">Enable Self Delivery</Label>
              <Switch
                checked={step4.selfDeliveryEnabled === true}
                onCheckedChange={(checked) => {
                  setStep4((prev) => {
                    const radius = prev.selfDeliveryRadius === "3" ? "" : (prev.selfDeliveryRadius || "")
                    const fee = prev.selfDeliveryFee === "0" ? "" : (prev.selfDeliveryFee || "")
                    const minAmount = prev.selfDeliveryMinOrderAmount === "0" ? "" : (prev.selfDeliveryMinOrderAmount || "")
                    const start = prev.selfDeliveryStart === "10:00" ? "" : (prev.selfDeliveryStart || "")
                    const end = prev.selfDeliveryEnd === "22:00" ? "" : (prev.selfDeliveryEnd || "")
                    return {
                      ...prev,
                      selfDeliveryEnabled: checked,
                      selfDeliveryRadius: radius,
                      selfDeliveryFee: fee,
                      selfDeliveryMinOrderAmount: minAmount,
                      selfDeliveryStart: start,
                      selfDeliveryEnd: end,
                    }
                  })
                }}
                className="data-[state=checked]:bg-[#00c87e] cursor-pointer"
              />
            </div>
            <p className="text-[11px] text-gray-500">
              Turn this on if your restaurant uses its own delivery partners.
            </p>
          </div>

          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 transition-opacity ${!step4.selfDeliveryEnabled ? "opacity-40 pointer-events-none" : ""}`}>
            <div>
              <Label className="text-xs font-bold text-gray-700 block mb-1">
                Self Delivery Radius (km)
                {step4.selfDeliveryEnabled && <span className="text-rose-500 ml-0.5">*</span>}
              </Label>
              <Input
                type="number"
                min="0"
                value={step4.selfDeliveryRadius || ""}
                onChange={(e) => {
                  const val = e.target.value.slice(0, 2);
                  const nextStep4 = {
                    ...step4,
                    selfDeliveryRadius: val,
                  }
                  setStep4(nextStep4);
                  revalidateTouchedField("selfDeliveryRadius", { step4: nextStep4 })
                }}
                onBlur={() => handleFieldBlur("selfDeliveryRadius")}
                disabled={!step4.selfDeliveryEnabled}
                className={getFieldClassName("selfDeliveryRadius", "mt-1 bg-white text-sm text-gray-900 placeholder:text-gray-400 disabled:bg-gray-50 disabled:cursor-not-allowed")}
                placeholder="Enter delivery radius (e.g. 5)"
              />
              {renderFieldMessage("selfDeliveryRadius")}
              <p className="text-[11px] text-gray-500 mt-1">Maximum 2 digits allowed</p>
            </div>

            <div>
              <Label className="text-xs font-bold text-gray-700 block mb-1">
                Delivery Fee
                {step4.selfDeliveryEnabled && <span className="text-rose-500 ml-0.5">*</span>}
              </Label>
              <Input
                type="number"
                min="0"
                value={step4.selfDeliveryFee || ""}
                onChange={(e) => {
                  let val = e.target.value;
                  if (val.startsWith("0") && val.length > 1) {
                    val = val.replace(/^0+/, "");
                  }
                  val = val.slice(0, 4);
                  const nextStep4 = {
                    ...step4,
                    selfDeliveryFee: val,
                  }
                  setStep4(nextStep4);
                  revalidateTouchedField("selfDeliveryFee", { step4: nextStep4 })
                }}
                onBlur={() => handleFieldBlur("selfDeliveryFee")}
                disabled={!step4.selfDeliveryEnabled}
                className={getFieldClassName("selfDeliveryFee", "mt-1 bg-white text-sm text-gray-900 placeholder:text-gray-400 disabled:bg-gray-50 disabled:cursor-not-allowed")}
                placeholder="Enter delivery fee (e.g. 10)"
              />
              {renderFieldMessage("selfDeliveryFee")}
              <p className="text-[11px] text-gray-500 mt-1">Maximum 4 digits allowed</p>
            </div>

            <div>
              <Label className="text-xs font-bold text-gray-700 block mb-1">
                Minimum Order Amount
                {step4.selfDeliveryEnabled && <span className="text-rose-500 ml-0.5">*</span>}
              </Label>
              <Input
                type="number"
                min="0"
                value={step4.selfDeliveryMinOrderAmount || ""}
                onChange={(e) => {
                  let val = e.target.value;
                  if (val.startsWith("0") && val.length > 1) {
                    val = val.replace(/^0+/, "");
                  }
                  val = val.slice(0, 5);
                  const nextStep4 = {
                    ...step4,
                    selfDeliveryMinOrderAmount: val,
                  }
                  setStep4(nextStep4);
                  revalidateTouchedField("selfDeliveryMinOrderAmount", { step4: nextStep4 })
                }}
                onBlur={() => handleFieldBlur("selfDeliveryMinOrderAmount")}
                disabled={!step4.selfDeliveryEnabled}
                className={getFieldClassName("selfDeliveryMinOrderAmount", "mt-1 bg-white text-sm text-gray-900 placeholder:text-gray-400 disabled:bg-gray-50 disabled:cursor-not-allowed")}
                placeholder="Enter minimum order amount (e.g. 100)"
              />
              {renderFieldMessage("selfDeliveryMinOrderAmount")}
              <p className="text-[11px] text-gray-500 mt-1">Maximum 5 digits allowed</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <TimeSelector
                label="Start Time*"
                value={step4.selfDeliveryStart || ""}
                onChange={(val) => {
                  const nextStep4 = { ...step4, selfDeliveryStart: normalizeTimeValue(val) || "" }
                  setStep4(nextStep4)
                  revalidateTouchedField("selfDeliveryStart", { step4: nextStep4 })
                }}
              />
              <TimeSelector
                label="End Time*"
                value={step4.selfDeliveryEnd || ""}
                onChange={(val) => {
                  const nextStep4 = { ...step4, selfDeliveryEnd: normalizeTimeValue(val) || "" }
                  setStep4(nextStep4)
                  revalidateTouchedField("selfDeliveryEnd", { step4: nextStep4 })
                }}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  )

  const renderStep = () => {
    if (step === 1) return renderStep1()
    if (step === 2) return renderStep2()
    if (step === 3) return renderStep3()
    return renderStep4()
  }

  return (
    <LocalizationProvider 
      dateAdapter={AdapterDateFns}
      localeText={{
        fieldMeridiemPlaceholder: () => "AM",
        fieldHoursPlaceholder: () => "HH",
        fieldMinutesPlaceholder: () => "MM",
      }}
    >
      <div className="flex flex-col bg-gray-100 overflow-hidden" style={{ height: "100dvh" }}>
        <header className="px-3 py-3 sm:px-6 sm:py-5 bg-white flex items-center justify-between border-b">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={handleCloseOnboarding}
              className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors cursor-pointer text-gray-600 hover:text-gray-700"
              aria-label="Close onboarding"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="text-base sm:text-lg font-extrabold text-black h-9 flex items-center whitespace-nowrap">Restaurant Onboarding</div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {!loading && !isEditing && (
              <Button
                onClick={() => setIsEditing(true)}
                variant="outline"
                size="sm"
                className="text-xs bg-[#00c87e]/10 border-[#00c87e]/20 text-[#00c87e] hover:bg-[#00c87e]/20 flex items-center gap-1.5 cursor-pointer h-9 px-3"
                title="Edit Details"
              >
                <Sparkles className="w-3 h-3" />
                Edit Details
              </Button>
            )}
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider text-right h-9 flex items-center justify-end whitespace-nowrap">
                Step {step} of 4
              </div>
              <Button
                onClick={handleLogout}
                disabled={isLoggingOut}
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-red-600 hover:text-red-700 hover:bg-red-50 cursor-pointer flex items-center justify-center"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>

        </header>

        <main
          className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4"
          style={{ paddingBottom: keyboardInset ? `${keyboardInset + 20}px` : undefined }}
          onFocusCapture={(e) => {
            const target = e.target
            if (!(target instanceof HTMLElement)) return
            if (!target.matches("input, textarea, select")) return
            window.setTimeout(() => {
              target.scrollIntoView({ behavior: "smooth", block: "center" })
            }, 250)
          }}
        >
          {isReverificationFlow && (
            <section className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <p className="font-semibold text-rose-900">Your restaurant was rejected</p>
              {currentRestaurantRejectionReason ? (
                <p className="mt-1">Reason: {currentRestaurantRejectionReason}</p>
              ) : null}
              <p className="mt-1">
                Please update your details and submit again for re-verification.
              </p>
            </section>
          )}
          {isPendingReviewFlow && (
            <section className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="font-semibold text-amber-900">Re-verification is pending</p>
              <p className="mt-1">
                Your updated details are with the admin team. You can access the restaurant dashboard after approval.
              </p>
            </section>
          )}
          {loading ? (
            <p className="text-sm text-gray-600">Loading...</p>
          ) : (
            <div className={!isEditing ? "pointer-events-none select-none" : ""}>
              {renderStep()}
            </div>
          )}
        </main>

        <ImageSourcePicker
          isOpen={sourcePicker.isOpen}
          onClose={closeImageSourcePicker}
          onFileSelect={sourcePicker.onSelectFile}
          title={sourcePicker.title}
          fileNamePrefix={sourcePicker.fileNamePrefix}
          galleryInputRef={sourcePicker.fallbackInputRef}
        />



        <footer className={`px-4 sm:px-6 py-3 bg-white ${keyboardInset ? "hidden" : ""}`}>
          <div className="flex justify-between items-center">
            <Button
              variant="outline"
              disabled={step === 1 || saving}
              onClick={() => { setStep((s) => Math.max(1, s - 1)); window.scrollTo({ top: 0, behavior: "instant" }) }}
              className="text-sm border-[#00c87e] text-[#00c87e] hover:bg-[#00c87e] hover:text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Back
            </Button>
            <Button
              onClick={handleNext}
              disabled={saving || (step === 4 && !isEditing)}
              className={`text-sm bg-[#00c87e] hover:bg-[#00b06f] text-white px-6 cursor-pointer ${(step === 4 && !isEditing) ? "opacity-50 cursor-not-allowed" : ""}`}
            >

              {step === 4 ? (saving ? "Saving..." : "Finish") : saving ? "Saving..." : "Continue"}
            </Button>
          </div>
        </footer>
      </div>
    </LocalizationProvider>
  )
}
