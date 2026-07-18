import { useState } from "react"
import { useNavigate } from "react-router-dom"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { motion, AnimatePresence } from "framer-motion"
import { CheckCircle2, X, ArrowLeft, AlertCircle } from "lucide-react"
import { adminAPI } from "@food/api"
import { API_ENDPOINTS } from "@food/api/config"
import api from "@food/api"
import { toast } from "sonner"
import { useCompanyName } from "@food/hooks/useCompanyName"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


export default function ShareFeedback() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const [rating, setRating] = useState(null)
  const [comment, setComment] = useState("")
  const [showThanks, setShowThanks] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const numbers = Array.from({ length: 11 }, (_, i) => i)

  const handleClose = () => {
    goBack()
  }

  const handleContinue = async () => {
    if (rating === null) return
    
    try {
      setIsSubmitting(true)
      // Save feedback experience to backend
      const response = await api.post(API_ENDPOINTS.ADMIN.FEEDBACK_EXPERIENCE_CREATE, {
        rating: Math.ceil(rating / 2) || 1, // Convert 0-10 to 1-5 for backend
        module: 'restaurant',
        comment: comment ? `[User rated ${rating}/10] ${comment}` : `User rated ${rating}/10 overall experience`
      })
      
      if (response.data?.success) {
        setShowThanks(true)
      } else {
        throw new Error(response.data?.message || 'Failed to submit')
      }
    } catch (error) {
      debugError('Error submitting feedback:', error)
      toast.error(error.message || 'Failed to save feedback')
    } finally {
      setIsSubmitting(false)
    }
  }

  const getRatingEmoji = (r) => {
    if (r === null) return { emoji: "🤔", label: "Select your rating", color: "text-slate-400" }
    if (r <= 2) return { emoji: "😡", label: "Very Bad", color: "text-red-500" }
    if (r <= 4) return { emoji: "🙁", label: "Bad", color: "text-orange-500" }
    if (r <= 6) return { emoji: "😐", label: "Okay", color: "text-amber-500" }
    if (r <= 8) return { emoji: "🙂", label: "Good", color: "text-lime-600" }
    return { emoji: "😍", label: "Excellent", color: "text-emerald-500" }
  }

  const ratingDetails = getRatingEmoji(rating)

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <button
          onClick={handleClose}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
          aria-label="Go back"
        >
          <ArrowLeft className="w-6 h-6 text-gray-900" />
        </button>
        <h1 className="text-xl font-semibold text-gray-900 flex-1">
          Share Your Feedback
        </h1>
      </div>

      <div className="flex-1 px-4">
        {/* Question */}
        <div className="mt-6 mb-6">
          <p className="text-sm text-gray-700 mb-1">How was your overall experience with Taamio?</p>
          <p className="text-lg font-semibold text-gray-900">
            Overall Experience with Taamio
          </p>
        </div>

        {/* Rating scale */}
        <div className="mb-3">
          <div className="grid grid-cols-11 gap-1 rounded-xl border border-gray-300 bg-white overflow-hidden">
            {numbers.map((num) => {
              const isActive = rating === num
              const intensity =
                rating === null ? 0 : Math.abs(num - rating)
              const scale = isActive ? 1.05 : intensity === 1 ? 1.02 : 1

              return (
                <motion.button
                  key={num}
                  type="button"
                  onClick={() => setRating(num)}
                  whileTap={{ scale: 0.96 }}
                  animate={{ scale }}
                  transition={{ type: "spring", stiffness: 260, damping: 20 }}
                  className={`py-2 text-xs font-medium border-l border-gray-200 first:border-l-0 focus:outline-none transition-colors duration-150 ${
                    isActive
                      ? "bg-[#00c87e] text-white"
                      : "bg-white text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  {num}
                </motion.button>
              )
            })}
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-red-500">Very Bad</span>
            <span className="text-xs text-green-600">Very Good</span>
          </div>
          {rating !== null && (
            <motion.p
              className="mt-3 text-xs text-gray-600"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              key={rating}
            >
              You rated your experience{" "}
              <span className="font-semibold text-gray-900">
                {rating}/10
              </span>
              .
            </motion.p>
          )}
        </div>

        {/* Animated Emoji display instead of static bar chart */}
        <div className="mt-8 flex flex-col items-center justify-center">
          <div className="w-full max-w-xs h-36 rounded-3xl bg-slate-50 border border-slate-100 flex flex-col items-center justify-center p-4 shadow-sm">
            <AnimatePresence mode="wait">
              <motion.div
                key={rating !== null ? rating : "none"}
                initial={{ scale: 0.3, rotate: -20, opacity: 0 }}
                animate={{ 
                  scale: [0.3, 1.2, 1], 
                  rotate: [0, -10, 10, 0], 
                  opacity: 1 
                }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ 
                  duration: 0.5,
                  type: "spring",
                  stiffness: 200,
                  damping: 12
                }}
                className="text-5xl mb-1 select-none"
              >
                {ratingDetails.emoji}
              </motion.div>
            </AnimatePresence>
            <motion.span 
              key={ratingDetails.label}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className={`text-xs font-bold ${ratingDetails.color}`}
            >
              {ratingDetails.label}
            </motion.span>
          </div>
        </div>

        {/* Tell us more (optional) text area */}
        <div className="mt-6">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Tell us more (optional)
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Please share details about your experience..."
            rows={3}
            className="w-full rounded-2xl border border-gray-200 p-3.5 text-sm outline-none focus:border-[#00c87e] focus:ring-1 focus:ring-[#00c87e] transition-all resize-none placeholder-gray-400"
          />
        </div>
      </div>

      {/* Bottom button */}
      <div className="px-4 pb-6 pt-2">
        <motion.button
          type="button"
          onClick={handleContinue}
          disabled={rating === null || isSubmitting}
          className={`w-full py-3 rounded-full text-sm font-medium transition-colors ${
            rating === null
              ? "bg-gray-200 text-gray-500"
              : "bg-[#00c87e] text-white hover:bg-[#00b06f]"
          }`}
          whileTap={rating !== null ? { scale: 0.98 } : undefined}
        >
          {isSubmitting ? "Submitting..." : "Submit"}
        </motion.button>
      </div>

      {/* Thank you popup */}
      <AnimatePresence>
        {showThanks && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setShowThanks(false)
              goBack()
            }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 10, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 10, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-sm rounded-3xl bg-white px-5 pt-5 pb-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col items-center text-center">
                <div className="mb-3 h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-green-600" />
                </div>
                <h2 className="text-base font-semibold text-gray-900 mb-1">
                  Thanks for your feedback
                </h2>
                <p className="text-xs text-gray-600 mb-4">
                  This helps us make Taamio better for you.
                </p>
                <button
                  type="button"
                  className="w-full py-2.5 rounded-full bg-[#00c87e] hover:bg-[#00b06f] text-white text-sm font-medium transition-colors cursor-pointer"
                  onClick={() => {
                    setShowThanks(false)
                    goBack()
                  }}
                >
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

