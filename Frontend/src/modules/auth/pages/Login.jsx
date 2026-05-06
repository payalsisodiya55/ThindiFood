import React, { useEffect, useState, useRef } from "react"
import { motion } from "framer-motion"
import { Routes, Route, Navigate, Link, useNavigate } from "react-router-dom"
import { Phone, ShieldCheck, Loader2, User } from "lucide-react"
import { toast } from "sonner"
import { authAPI, userAPI } from "@food/api"
import { setAuthData } from "@food/utils/auth"
import logo from "@/assets/user_app-removebg-preview.png"





export default function UnifiedOTPFastLogin() {
  const RESEND_COOLDOWN_SECONDS = 60
  const [phoneNumber, setPhoneNumber] = useState("")
  const [otp, setOtp] = useState("")
  const [step, setStep] = useState(1)
  const [name, setName] = useState("")
  const [nameError, setNameError] = useState("")
  const [loading, setLoading] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)
  const navigate = useNavigate()
  const submitting = useRef(false)

  const normalizedPhone = () => {
    const digits = String(phoneNumber).replace(/\D/g, "").slice(0, 10)
    return digits.length === 10 ? digits : ""
  }

  const hasMeaningfulName = (user) => {
    const rawName = String(user?.name || user?.fullName || "").trim()
    if (!rawName) return false

    const normalizedName = rawName.toLowerCase()
    const normalizedPhone = String(phoneNumber || "").replace(/\D/g, "").slice(-10)
    const nameDigits = rawName.replace(/\D/g, "")

    if (
      normalizedName === "null" ||
      normalizedName === "undefined" ||
      normalizedName === "user" ||
      normalizedName === "customer" ||
      normalizedName === "guest" ||
      normalizedName === "new user"
    ) {
      return false
    }

    if (normalizedPhone && nameDigits && nameDigits === normalizedPhone) {
      return false
    }

    return rawName.length >= 2
  }

  const handleSendOTP = async (e) => {
    e.preventDefault()
    const phone = normalizedPhone()
    if (phone.length !== 10) {
      toast.error("Please enter a valid 10-digit phone number")
      return
    }
    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    try {
      await authAPI.sendOTP(phone, "login", null)
      setOtpSent(true)
      setOtp("")
      setStep(2)
      setResendTimer(RESEND_COOLDOWN_SECONDS)
      toast.success("OTP sent! Check your phone.")
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to send OTP."
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  const handleResendOTP = async () => {
    const phone = normalizedPhone()
    if (phone.length !== 10) {
      toast.error("Please enter a valid 10-digit phone number")
      return
    }
    if (resendTimer > 0 || submitting.current) return
    submitting.current = true
    setLoading(true)
    try {
      await authAPI.sendOTP(phone, "login", null)
      setOtp("")
      setOtpSent(true)
      setResendTimer(RESEND_COOLDOWN_SECONDS)
      toast.success("OTP resent successfully.")
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to resend OTP."
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  const handleEditNumber = () => {
    setStep(1)
    setOtp("")
    setName("")
    setNameError("")
    setResendTimer(0)
  }

  const handleVerifyOTP = async (e) => {
    e.preventDefault()
    const phone = normalizedPhone()
    const otpDigits = String(otp).replace(/\D/g, "").slice(0, 4)
    if (otpDigits.length !== 4) {
      toast.error("Please enter the 4-digit OTP")
      return
    }
    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    try {
      // Try to get FCM token before verifying OTP
      let fcmToken = null;
      let platform = "web";
      try {
        if (typeof window !== "undefined") {
          if (window.flutter_inappwebview) {
            platform = "mobile";
            const handlerNames = ["getFcmToken", "getFCMToken", "getPushToken", "getFirebaseToken"];
            for (const handlerName of handlerNames) {
              try {
                const t = await window.flutter_inappwebview.callHandler(handlerName, { module: "user" });
                if (t && typeof t === "string" && t.length > 20) {
                  fcmToken = t.trim();
                  break;
                }
              } catch (e) {}
            }
          } else {
            fcmToken = localStorage.getItem("fcm_web_registered_token_user") || null;
          }
        }
      } catch (e) {
        console.warn("Failed to get FCM token during login", e);
      }

      const response = await authAPI.verifyOTP(phone, otpDigits, "login", null, null, "user", null, null, fcmToken, platform)
      const data = response?.data?.data || response?.data || {}
      const accessToken = data.accessToken
      const refreshToken = data.refreshToken || null
      const user = data.user

      if (!accessToken || !user) {
        throw new Error("Invalid response from server")
      }

      const needsName = data.isNewUser === true || !hasMeaningfulName(user)

      if (needsName) {
        setAuthData("user", accessToken, user, refreshToken)
        window.dispatchEvent(new CustomEvent("userAuthChanged"))
        setStep(3)
        setLoading(false)
        submitting.current = false
        return
      }

      setAuthData("user", accessToken, user, refreshToken)
      // Dispatch event to notify ProfileContext to refresh
      window.dispatchEvent(new CustomEvent("userAuthChanged"));
      toast.success("Login successful!")
      
      // Check for redirect parameter in URL
      const params = new URLSearchParams(window.location.search);
      const redirectPath = params.get("redirect");
      
      if (redirectPath) {
        navigate(redirectPath, { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    } catch (err) {
      const status = err?.response?.status
      let msg = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Invalid OTP. Please try again."
      if (status === 401) {
        if (/deactivat(ed|e)/i.test(String(msg))) {
          msg = "Your account is deactivated. Please contact support."
        } else {
          msg = "Invalid or expired code, or account not active."
        }
      }
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  const handleSubmitName = async (e) => {
    e.preventDefault()

    const trimmedName = name.trim()
    if (!trimmedName) {
      setNameError("Name is required")
      return
    }

    if (trimmedName.length < 2) {
      setNameError("Name must be at least 2 characters")
      return
    }

    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    setNameError("")

    try {
      const response = await userAPI.updateProfile({ name: trimmedName })
      const updatedUser = response?.data?.data?.user || response?.data?.user || {}
      const accessToken = localStorage.getItem("user_accessToken")
      const refreshToken = localStorage.getItem("user_refreshToken") || null
      const existingUser = (() => {
        try {
          return JSON.parse(localStorage.getItem("user_user") || "null") || {}
        } catch {
          return {}
        }
      })()

      if (!accessToken) {
        throw new Error("Authentication expired. Please try again.")
      }

      setAuthData(
        "user",
        accessToken,
        {
          ...existingUser,
          ...updatedUser,
          name: updatedUser?.name || trimmedName,
          fullName: updatedUser?.fullName || trimmedName,
        },
        refreshToken,
      )
      window.dispatchEvent(new CustomEvent("userAuthChanged"))
      toast.success("Profile completed successfully!")

      const params = new URLSearchParams(window.location.search)
      const redirectPath = params.get("redirect")

      if (redirectPath) {
        navigate(redirectPath, { replace: true })
      } else {
        navigate("/", { replace: true })
      }
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to save your name."
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  useEffect(() => {
    if (step !== 2 || resendTimer <= 0) return
    const intervalId = setInterval(() => {
      setResendTimer((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(intervalId)
  }, [step, resendTimer])

  const formatResendTimer = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
  }

  // Service images (served from public folder)
  const foodIcon = "/super-app/food.png"
  const taxiIcon = "/super-app/taxi.png"
  const groceryIcon = "/super-app/grocery.png"
  const hotelIcon = "/super-app/hotel.png"

  const services = [
    { id: 'food', name: 'Food Delivery', icon: foodIcon, label: 'Zomato', color: 'bg-red-500', shadow: 'shadow-red-200' },
    { id: 'taxi', name: 'Taxi', icon: taxiIcon, label: 'Taxi', color: 'bg-yellow-400', shadow: 'shadow-yellow-200' },
    { id: 'grocery', name: 'Quick Commerce', icon: groceryIcon, label: 'Blinkit', color: 'bg-green-500', shadow: 'shadow-green-200' },
    { id: 'hotels', name: 'Hotels', icon: hotelIcon, label: 'Hotels', color: 'bg-blue-500', shadow: 'shadow-blue-200' },
  ]

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] flex flex-col pt-0 sm:pt-0">
      {/* Top Banner section - Thindi Green */}
      <div className="w-full bg-[#00c87e] dark:bg-[#00c87e] rounded-b-[2.5rem] p-6 text-center text-white relative overflow-hidden shadow-2xl">
        <div className="absolute inset-0 bg-white/5 opacity-50 blur-3xl rounded-full -top-1/2 -left-1/4 animate-pulse" />
        <div className="absolute right-0 bottom-0 w-32 h-32 md:w-48 md:h-48 opacity-10 pointer-events-none">
           <svg viewBox="0 0 200 200" fill="currentColor">
              <path d="M100 0C44.8 0 0 44.8 0 100s44.8 100 100 100 100-44.8 100-100S155.2 0 100 0zm0 180c-44.1 0-80-35.9-80-80s35.9-80 80-80 80 35.9 80 80-35.9 80-80 80z"/>
           </svg>
        </div>
        
        <div className="relative z-10 flex flex-col items-center">
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center mb-3 shadow-xl p-1.5"
          >
             <img src={logo} alt="Thindi Logo" className="w-full h-full object-contain" />
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl md:text-5xl font-black tracking-tight mb-1"
          >
            Thindi
          </motion.h1>
          <p className="text-xs md:text-base font-bold text-white/90 tracking-[0.2em] uppercase">
            Taste the best, forget the rest
          </p>
        </div>
      </div>

      <div className="flex-1 max-w-[480px] mx-auto w-full px-6 py-4 flex flex-col justify-center -mt-8 relative z-20">
        {/* Main Card */}
        <div className="bg-white dark:bg-[#1a1a1a] rounded-[2rem] p-6 sm:p-8 md:p-12 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.15)] dark:shadow-none border border-gray-50 dark:border-gray-800">
           <div className="text-center mb-6 space-y-2">
              <h2 className="text-2xl font-black text-gray-900 dark:text-white">Login or Signup</h2>
              <div className="h-1 w-12 bg-[#00c87e] mx-auto rounded-full" />
           </div>

          <form onSubmit={step === 1 ? handleSendOTP : step === 2 ? handleVerifyOTP : handleSubmitName} className="space-y-5">
            {step === 1 ? (
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-1 flex items-center pointer-events-none">
                      <Phone className="w-5 h-5 text-gray-400 group-focus-within:text-[#00c87e] transition-colors" />
                    </div>
                    <div className="absolute left-8 inset-y-0 flex items-center pointer-events-none">
                       <span className="text-sm font-bold text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-800 pr-3">+91</span>
                    </div>
                    <input
                      type="tel"
                      required
                      autoFocus
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      maxLength={10}
                      className="block w-full pl-20 pr-4 py-3 bg-transparent text-gray-900 dark:text-white border-b-2 border-gray-100 dark:border-gray-800 focus:border-[#00c87e] outline-none transition-all placeholder:text-gray-300 font-bold text-lg"
                      placeholder="Phone number"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 text-center leading-relaxed">
                  We will send success notifications and order updates via SMS
                </p>
              </div>
            ) : step === 2 ? (
              <div className="space-y-6">
                <div className="space-y-4">
                   <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900 p-4 rounded-2xl border border-dashed border-gray-200 dark:border-gray-800">
                      <div className="w-10 h-10 bg-[#00c87e]/10 rounded-full flex items-center justify-center">
                         <ShieldCheck className="w-5 h-5 text-[#00c87e]" />
                      </div>
                      <div className="flex-1">
                         <p className="text-[10px] uppercase font-black text-gray-400 tracking-widest leading-none mb-1">Sent to</p>
                         <p className="text-sm font-black text-gray-900 dark:text-white">+91 {phoneNumber}</p>
                      </div>
                      <button type="button" onClick={handleEditNumber} className="text-xs text-[#00c87e] font-black underline cursor-pointer">Edit</button>
                   </div>

                  <div className="flex justify-center gap-3 mt-4">
                    {[0, 1, 2, 3].map((index) => (
                      <input
                        key={index}
                        id={`otp-${index}`}
                        type="tel"
                        inputMode="numeric"
                        required
                        autoFocus={index === 0}
                        value={otp[index] || ""}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "").slice(-1);
                          if (!val) return;
                          const newOtp = otp.split("");
                          newOtp[index] = val;
                          const combined = newOtp.join("").slice(0, 4);
                          setOtp(combined);
                          
                          // Focus next
                          if (index < 3 && val) {
                            document.getElementById(`otp-${index + 1}`)?.focus();
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Backspace") {
                            if (!otp[index] && index > 0) {
                              document.getElementById(`otp-${index - 1}`)?.focus();
                            } else {
                              const newOtp = otp.split("");
                              newOtp[index] = "";
                              setOtp(newOtp.join(""));
                            }
                          }
                        }}
                        onPaste={(e) => {
                          e.preventDefault();
                          const pasteData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
                          if (pasteData) {
                            setOtp(pasteData);
                            document.getElementById(`otp-${Math.min(pasteData.length, 3)}`)?.focus();
                          }
                        }}
                        className="w-14 h-14 sm:w-16 sm:h-16 text-center text-xl sm:text-3xl font-black bg-gray-50 dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800 focus:border-[#00c87e] rounded-xl sm:rounded-2xl outline-none transition-all text-gray-900 dark:text-white"
                        placeholder="-"
                      />
                    ))}
                  </div>
                  <div className="text-center mt-4">
                    {resendTimer > 0 ? (
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                        Resend OTP in {formatResendTimer(resendTimer)}
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResendOTP}
                        disabled={loading}
                        className="text-xs font-black text-[#00c87e] underline disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        Resend OTP
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="space-y-4">
                   <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900 p-4 rounded-2xl border border-dashed border-gray-200 dark:border-gray-800">
                      <div className="w-10 h-10 bg-[#00c87e]/10 rounded-full flex items-center justify-center">
                         <ShieldCheck className="w-5 h-5 text-[#00c87e]" />
                      </div>
                      <div className="flex-1">
                         <p className="text-[10px] uppercase font-black text-gray-400 tracking-widest leading-none mb-1">Verified Number</p>
                         <p className="text-sm font-black text-gray-900 dark:text-white">+91 {phoneNumber}</p>
                      </div>
                      <button type="button" onClick={handleEditNumber} className="text-xs text-[#00c87e] font-black underline cursor-pointer">Change</button>
                   </div>

                  <div className="relative group mt-4">
                    <div className="absolute inset-y-0 left-0 pl-1 flex items-center pointer-events-none">
                      <User className="w-5 h-5 text-[#00c87e]" />
                    </div>
                    <input
                      type="text"
                      required
                      autoFocus
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value)
                        if (nameError) setNameError("")
                      }}
                      className="block w-full pl-8 pr-4 py-3 bg-transparent text-gray-900 dark:text-white border-b-2 border-gray-100 dark:border-gray-800 focus:border-[#00c87e] outline-none transition-all placeholder:text-gray-300 font-bold text-lg"
                      placeholder="Your name"
                    />
                  </div>

                  {nameError && (
                    <p className="text-xs text-red-500">{nameError}</p>
                  )}

                  <p className="text-[11px] text-gray-400 text-center leading-relaxed">
                    Please enter your name so we can save it to your profile.
                  </p>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-4 rounded-2xl font-black text-lg transition-all relative overflow-hidden shadow-xl ${
                loading
                  ? "bg-gray-100 dark:bg-gray-800 cursor-not-allowed opacity-50"
                  : "bg-[#00c87e] hover:bg-[#00b371] text-white hover:shadow-2xl hover:shadow-[#00c87e]/30 active:scale-[0.98] hover:-translate-y-0.5"
              }`}
            >
              {loading ? (
                <Loader2 className="w-7 h-7 animate-spin mx-auto text-white" />
              ) : (
                step === 1 ? "Get Verification Code" : step === 2 ? "Continue" : "Save Name & Continue"
              )}
            </button>
          </form>
        </div>

        <div className="mt-6 text-center space-y-2">
           <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] leading-relaxed">
             By continuing, you agree to our <br />
             <Link to="/food/user/profile/terms" className="text-gray-900 dark:text-white underline cursor-pointer hover:text-[#00c87e] transition-colors">Terms of Service</Link> & <Link to="/food/user/profile/privacy" className="text-gray-900 dark:text-white underline cursor-pointer hover:text-[#00c87e] transition-colors">Privacy Policy</Link>
           </p>
        </div>
      </div>
    </div>
  )
}
