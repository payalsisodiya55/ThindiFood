import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { ArrowLeft, AlertCircle, Upload, Loader2, Eye, EyeOff, X } from "lucide-react"
import { restaurantAPI, uploadAPI } from "@food/api"
import { ImageSourcePicker } from "@food/components/ImageSourcePicker"
import { isFlutterBridgeAvailable } from "@food/utils/imageUploadUtils"
import { toast } from "sonner"
import { RESTAURANT_THEME } from "@food/constants/restaurantTheme"

const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/
const UPI_REGEX = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/

const EMPTY_FORM = {
  accountHolderName: "",
  accountNumber: "",
  confirmAccountNumber: "",
  accountType: "",
  ifscCode: "",
  upiId: "",
  upiQrImage: "",
}

export default function UpdateBankDetails() {
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingQr, setUploadingQr] = useState(false)
  const [lastUpdated, setLastUpdated] = useState("")

  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [isQrPickerOpen, setIsQrPickerOpen] = useState(false)
  const qrInputRef = useRef(null)

  // Tracker for unsaved changes using state for React lifecycle safety
  const [initialForm, setInitialForm] = useState(EMPTY_FORM)

  // Confirm Account Number visibility toggle
  const [showConfirmAccountNumber, setShowConfirmAccountNumber] = useState(false)

  // Bank name auto-fetch states
  const [bankName, setBankName] = useState("")
  const [fetchingBank, setFetchingBank] = useState(false)

  // Discard changes modal state
  const [showDiscardModal, setShowDiscardModal] = useState(false)

  const formattedUpdatedAt = useMemo(() => {
    if (!lastUpdated) return ""
    const date = new Date(lastUpdated)
    if (Number.isNaN(date.getTime())) return ""
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
  }, [lastUpdated])

  const hasChanges = useMemo(() => {
    return (
      form.accountHolderName !== (initialForm.accountHolderName || "") ||
      form.accountNumber !== (initialForm.accountNumber || "") ||
      form.confirmAccountNumber !== (initialForm.confirmAccountNumber || "") ||
      form.accountType !== (initialForm.accountType || "") ||
      form.ifscCode !== (initialForm.ifscCode || "") ||
      form.upiId !== (initialForm.upiId || "") ||
      form.upiQrImage !== (initialForm.upiQrImage || "")
    )
  }, [form, initialForm])

  const validateField = (name, val) => {
    let errorMsg = ""
    const strVal = String(val || "")

    switch (name) {
      case "accountHolderName":
        if (!strVal.trim()) {
          errorMsg = "Account Holder Name is required"
        }
        break
      case "accountNumber":
        const cleanedNum = strVal.replace(/\s|-/g, "")
        if (!cleanedNum) {
          errorMsg = "Account Number is required"
        } else if (!/^\d{9,18}$/.test(cleanedNum)) {
          errorMsg = "Account number must be 9 to 18 digits"
        }
        break
      case "confirmAccountNumber":
        const cleanedConfirm = strVal.replace(/\s|-/g, "")
        const cleanedNumber = String(form.accountNumber || "").replace(/\s|-/g, "")
        if (!cleanedConfirm) {
          errorMsg = "Please confirm Account Number"
        } else if (cleanedConfirm !== cleanedNumber) {
          errorMsg = "Account numbers do not match"
        }
        break
      case "accountType":
        if (!strVal.trim()) {
          errorMsg = "Account Type is required"
        }
        break
      case "ifscCode":
        const code = strVal.trim().toUpperCase()
        if (!code) {
          errorMsg = "IFSC Code is required"
        } else if (!IFSC_REGEX.test(code)) {
          errorMsg = "Invalid IFSC format (e.g. SBIN0018764)"
        }
        break
      case "upiId":
        if (strVal && !UPI_REGEX.test(strVal.trim())) {
          errorMsg = "Invalid UPI ID format (e.g. name@bank)"
        }
        break
      default:
        break
    }

    setErrors((prev) => {
      if (errorMsg) {
        return { ...prev, [name]: errorMsg }
      } else {
        const next = { ...prev }
        delete next[name]
        return next
      }
    })
  }

  const validate = () => {
    const nextErrors = {}
    const accountHolderName = String(form.accountHolderName || "").trim()
    const accountNumber = String(form.accountNumber || "").replace(/\s|-/g, "")
    const confirmAccountNumber = String(form.confirmAccountNumber || "").replace(/\s|-/g, "")
    const accountType = String(form.accountType || "").trim()
    const ifscCode = String(form.ifscCode || "").trim().toUpperCase()
    const upiId = String(form.upiId || "").trim()

    if (!accountHolderName) {
      nextErrors.accountHolderName = "Account Holder Name is required"
    }
    if (!accountNumber) {
      nextErrors.accountNumber = "Account Number is required"
    } else if (!/^\d{9,18}$/.test(accountNumber)) {
      nextErrors.accountNumber = "Account number must be 9 to 18 digits"
    }
    if (!confirmAccountNumber) {
      nextErrors.confirmAccountNumber = "Please confirm Account Number"
    } else if (confirmAccountNumber !== accountNumber) {
      nextErrors.confirmAccountNumber = "Account numbers do not match"
    }
    if (!accountType) {
      nextErrors.accountType = "Account Type is required"
    }
    if (!ifscCode) {
      nextErrors.ifscCode = "IFSC Code is required"
    } else if (!IFSC_REGEX.test(ifscCode)) {
      nextErrors.ifscCode = "Invalid IFSC format (e.g. SBIN0018764)"
    }

    if (upiId && !UPI_REGEX.test(upiId)) {
      nextErrors.upiId = "Invalid UPI ID format (e.g. name@bank)"
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const fetchBankName = async (ifsc) => {
    try {
      setFetchingBank(true)
      const res = await fetch(`https://ifsc.razorpay.com/${ifsc}`)
      if (res.ok) {
        const data = await res.json()
        if (data && data.BANK) {
          setBankName(data.BANK)
        } else {
          setBankName("")
        }
      } else {
        setBankName("")
      }
    } catch (err) {
      setBankName("")
    } finally {
      setFetchingBank(false)
    }
  }

  // Effect to automatically fetch bank name on IFSC code input change
  useEffect(() => {
    const code = form.ifscCode.trim().toUpperCase()
    if (code.length === 11 && IFSC_REGEX.test(code)) {
      fetchBankName(code)
    } else {
      setBankName("")
    }
  }, [form.ifscCode])

  const loadProfile = async () => {
    try {
      setLoading(true)
      const response = await restaurantAPI.getCurrentRestaurant()
      const doc = response?.data?.data?.restaurant || response?.data?.restaurant || null
      if (!doc) return

      const accountNumber = String(doc.accountNumber || "").replace(/\s|-/g, "")
      const upiQrImage =
        typeof doc.upiQrImage === "string"
          ? doc.upiQrImage
          : String(doc.upiQrImage?.url || "")

      const loadedForm = {
        accountHolderName: String(doc.accountHolderName || ""),
        accountNumber,
        confirmAccountNumber: accountNumber,
        accountType: String(doc.accountType || ""),
        ifscCode: String(doc.ifscCode || "").toUpperCase(),
        upiId: String(doc.upiId || ""),
        upiQrImage,
      }

      setForm(loadedForm)
      setInitialForm(loadedForm)

      // Fetch bank name immediately on load if IFSC exists
      if (loadedForm.ifscCode.length === 11 && IFSC_REGEX.test(loadedForm.ifscCode)) {
        fetchBankName(loadedForm.ifscCode)
      }

      setLastUpdated(doc.updatedAt || "")
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load bank details")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProfile()
  }, [])

  const handleQrUpload = async (file) => {
    if (!file) return
    try {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image size too large. Max 5MB allowed.")
        return
      }
      setUploadingQr(true)
      const response = await uploadAPI.uploadMedia(file, { folder: "food/restaurants/upi-qr" })
      const url =
        response?.data?.data?.url ||
        response?.data?.url ||
        ""
      if (!url) throw new Error("Upload failed")
      setForm((prev) => ({ ...prev, upiQrImage: url }))
      toast.success("QR updated successfully")
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || "Failed to upload QR image")
    } finally {
      setUploadingQr(false)
    }
  }

  const handleQrClick = () => {
    if (isFlutterBridgeAvailable()) {
      setIsQrPickerOpen(true)
    } else {
      qrInputRef.current?.click()
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    const payload = {
      accountHolderName: String(form.accountHolderName || "").trim(),
      accountNumber: String(form.accountNumber || "").replace(/\s|-/g, ""),
      accountType: String(form.accountType || "").trim(),
      ifscCode: String(form.ifscCode || "").trim().toUpperCase(),
      upiId: String(form.upiId || "").trim(),
      upiQrImage: String(form.upiQrImage || "").trim(),
    }

    try {
      setSaving(true)
      await restaurantAPI.updateProfile(payload)
      await loadProfile()
      setErrors({})
      toast.success("Bank details updated successfully")
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update bank details")
    } finally {
      setSaving(false)
    }
  }

  const handleBackClick = () => {
    if (hasChanges) {
      setShowDiscardModal(true)
    } else {
      goBack()
    }
  }

  const inputClass = (key) =>
    `w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 text-base transition-colors ${
      errors[key]
        ? "border-red-500 focus:ring-red-500 focus:border-red-500"
        : "border-gray-300 focus:ring-blue-500 focus:border-transparent"
    }`

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="px-4 pt-4 pb-3 flex items-center gap-3 border-b border-gray-200">
        <button onClick={handleBackClick} className="p-2 rounded-full hover:bg-gray-100 cursor-pointer" aria-label="Back">
          <ArrowLeft className="w-5 h-5 text-gray-900" />
        </button>
        <h1 className="text-lg font-bold text-gray-900">Bank & UPI Details</h1>
      </div>

      <div className="flex-1 px-4 pt-4 pb-6">
        {loading ? (
          <div className="py-12 flex items-center justify-center gap-2 text-gray-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading details...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="mb-2">
              <h2 className="text-base font-bold text-gray-900">Account Details</h2>
              {formattedUpdatedAt ? (
                <p className="text-sm text-gray-500 mt-1">Last updated: {formattedUpdatedAt}</p>
              ) : null}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Account Holder Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                maxLength={50}
                value={form.accountHolderName}
                onChange={(e) => {
                  const val = e.target.value
                  setForm((p) => ({ ...p, accountHolderName: val }))
                  if (errors.accountHolderName) {
                    validateField("accountHolderName", val)
                  }
                }}
                onBlur={(e) => validateField("accountHolderName", e.target.value)}
                className={inputClass("accountHolderName")}
                placeholder="Enter account holder name"
              />
              <div className="flex justify-between items-start mt-1.5">
                <div>
                  {errors.accountHolderName ? (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {errors.accountHolderName}
                    </p>
                  ) : null}
                </div>
                <span className="text-xs text-gray-400">
                  {form.accountHolderName.length}/50
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Account Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={18}
                value={form.accountNumber}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^\d\s-]/g, "")
                  setForm((p) => ({ ...p, accountNumber: val }))
                  if (errors.accountNumber) {
                    validateField("accountNumber", val)
                  }
                }}
                onBlur={(e) => validateField("accountNumber", e.target.value)}
                className={inputClass("accountNumber")}
                placeholder="Enter account number"
              />
              <div className="flex justify-between items-start mt-1.5">
                <div>
                  {errors.accountNumber ? (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {errors.accountNumber}
                    </p>
                  ) : null}
                </div>
                <span className="text-xs text-gray-400">
                  {form.accountNumber.length}/18
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirm Account Number <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showConfirmAccountNumber ? "text" : "password"}
                  inputMode="numeric"
                  maxLength={18}
                  value={form.confirmAccountNumber}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^\d\s-]/g, "")
                    setForm((p) => ({ ...p, confirmAccountNumber: val }))
                    if (errors.confirmAccountNumber) {
                      validateField("confirmAccountNumber", val)
                    }
                  }}
                  onBlur={(e) => validateField("confirmAccountNumber", e.target.value)}
                  className={`${inputClass("confirmAccountNumber")} pr-12`}
                  placeholder="Re-enter account number"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmAccountNumber(!showConfirmAccountNumber)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-gray-100 rounded-full text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  {showConfirmAccountNumber ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <div className="flex justify-between items-start mt-1.5">
                <div>
                  {errors.confirmAccountNumber ? (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {errors.confirmAccountNumber}
                    </p>
                  ) : null}
                </div>
                <span className="text-xs text-gray-400">
                  {form.confirmAccountNumber.length}/18
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Account Type <span className="text-red-500">*</span>
              </label>
              <select
                value={form.accountType}
                onChange={(e) => {
                  const val = e.target.value
                  setForm((p) => ({ ...p, accountType: val }))
                  if (errors.accountType) {
                    validateField("accountType", val)
                  }
                }}
                onBlur={(e) => validateField("accountType", e.target.value)}
                className={inputClass("accountType")}
              >
                <option value="">Select Account Type</option>
                <option value="Savings">Savings</option>
                <option value="Current">Current</option>
              </select>
              {errors.accountType ? (
                <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {errors.accountType}
                </p>
              ) : null}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                IFSC Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                maxLength={11}
                value={form.ifscCode}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")
                  setForm((p) => ({ ...p, ifscCode: val }))
                  if (errors.ifscCode) {
                    validateField("ifscCode", val)
                  }
                }}
                onBlur={(e) => validateField("ifscCode", e.target.value)}
                className={inputClass("ifscCode")}
                placeholder="e.g. SBIN0018764"
              />
              <div className="flex justify-between items-start mt-1.5">
                <div>
                  {errors.ifscCode ? (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {errors.ifscCode}
                    </p>
                  ) : fetchingBank ? (
                    <p className="text-xs text-gray-500">Fetching bank name...</p>
                  ) : bankName ? (
                    <p className="text-xs text-green-600 font-medium">Bank: {bankName}</p>
                  ) : null}
                </div>
                <span className="text-xs text-gray-400">
                  {form.ifscCode.length}/11
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-200">
              <h2 className="text-base font-bold text-gray-900 mb-3">UPI Details</h2>

              <label className="block text-sm font-medium text-gray-700 mb-2">UPI ID</label>
              <input
                type="text"
                maxLength={64}
                value={form.upiId}
                onChange={(e) => {
                  const val = e.target.value.trim()
                  setForm((p) => ({ ...p, upiId: val }))
                  if (errors.upiId) {
                    validateField("upiId", val)
                  }
                }}
                onBlur={(e) => validateField("upiId", e.target.value)}
                className={inputClass("upiId")}
                placeholder="e.g. merchant@okaxis"
              />
              <div className="flex justify-between items-start mt-1.5">
                <div>
                  {errors.upiId ? (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {errors.upiId}
                    </p>
                  ) : null}
                </div>
                <span className="text-xs text-gray-400">
                  {form.upiId.length}/64
                </span>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">UPI QR Image</label>
                
                {/* Tappable preview box area */}
                <div 
                  className="w-40 h-40 border border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-xs text-gray-500 relative overflow-hidden bg-gray-50 transition-colors group"
                >
                  {form.upiQrImage ? (
                    <div className="relative w-full h-full">
                      {/* Clickable image area to change/upload */}
                      <div 
                        onClick={handleQrClick}
                        className="w-full h-full cursor-pointer"
                        title="Click to change QR image"
                      >
                        <img
                          src={form.upiQrImage}
                          alt="UPI QR"
                          className="w-full h-full object-contain bg-white"
                        />
                        {/* Hover overlay to change QR */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold gap-1.5">
                          <Upload className="w-4 h-4" />
                          Change QR
                        </div>
                      </div>
                      
                      {/* Cross/Remove button overlay on the image itself */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation() // Prevent triggering the file upload dialog
                          setForm((prev) => ({ ...prev, upiQrImage: "" }))
                          toast.success("QR image removed")
                        }}
                        className="absolute top-2 right-2 p-1 bg-red-600 hover:bg-red-700 text-white rounded-full shadow-md transition-transform active:scale-95 cursor-pointer z-10"
                        title="Remove QR Image"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div 
                      onClick={handleQrClick}
                      className="w-full h-full flex flex-col items-center justify-center gap-2 p-4 text-center cursor-pointer hover:bg-gray-100/50"
                    >
                      {uploadingQr ? (
                        <>
                          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                          <span>Uploading...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-6 h-6 text-gray-400" />
                          <span>Click anywhere on the box to upload</span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-3 flex gap-3 items-center">
                  <button
                    type="button"
                    onClick={handleQrClick}
                    disabled={uploadingQr}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium cursor-pointer hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed bg-white"
                  >
                    {uploadingQr ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        {form.upiQrImage ? "Change QR Image" : "Upload QR Image"}
                      </>
                    )}
                  </button>
                  
                  <input
                    ref={qrInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingQr}
                    onChange={(e) => handleQrUpload(e.target.files?.[0])}
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving || uploadingQr || !hasChanges}
              className={`w-full text-white font-bold py-4 rounded-lg text-base transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed ${
                hasChanges && !saving && !uploadingQr 
                  ? "bg-[#00c87e] hover:opacity-90 cursor-pointer" 
                  : "bg-gray-300 cursor-not-allowed"
              }`}
            >
              {saving ? "Saving..." : "Update Bank Details"}
            </button>
          </form>
        )}
      </div>

      <ImageSourcePicker
        isOpen={isQrPickerOpen}
        onClose={() => setIsQrPickerOpen(false)}
        onFileSelect={handleQrUpload}
        title="Upload UPI QR"
        description="Choose how to upload your bank UPI QR image"
        fileNamePrefix="upi-qr"
        galleryInputRef={qrInputRef}
      />

      {/* Unsaved changes discard confirmation modal */}
      {showDiscardModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Discard Changes?</h3>
            <p className="text-sm text-gray-500">
              You have unsaved changes. Are you sure you want to discard them and go back?
            </p>
            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowDiscardModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDiscardModal(false)
                  goBack()
                }}
                className="px-4 py-2 text-sm font-bold text-white rounded-lg hover:opacity-90 cursor-pointer"
                style={{ backgroundColor: RESTAURANT_THEME.brand }}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
