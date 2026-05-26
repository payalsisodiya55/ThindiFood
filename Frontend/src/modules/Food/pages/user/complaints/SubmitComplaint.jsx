import { useState, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { 
  ArrowLeft, 
  AlertCircle, 
  FileText, 
  ChevronDown, 
  Check, 
  Utensils, 
  ShoppingBag, 
  Truck, 
  Package, 
  Tag, 
  User, 
  HelpCircle, 
  X 
} from "lucide-react"
import { orderAPI } from "@food/api"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import { toast } from "sonner"

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const COMPLAINT_TYPES = [
  { value: 'food_quality', label: 'Food Quality Issue' },
  { value: 'wrong_item', label: 'Wrong Item Received' },
  { value: 'missing_item', label: 'Missing Item' },
  { value: 'delivery_issue', label: 'Delivery Issue' },
  { value: 'packaging', label: 'Packaging Problem' },
  { value: 'pricing', label: 'Pricing Issue' },
  { value: 'service', label: 'Service Issue' },
  { value: 'other', label: 'Other' },
]

const getComplaintTypeIcon = (value, className) => {
  switch (value) {
    case 'food_quality': return <Utensils className={className} />
    case 'wrong_item': return <ShoppingBag className={className} />
    case 'missing_item': return <AlertCircle className={className} />
    case 'delivery_issue': return <Truck className={className} />
    case 'packaging': return <Package className={className} />
    case 'pricing': return <Tag className={className} />
    case 'service': return <User className={className} />
    default: return <HelpCircle className={className} />
  }
}

const getComplaintTypeColors = (value) => {
  switch (value) {
    case 'food_quality': return 'bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400'
    case 'wrong_item': return 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400'
    case 'missing_item': return 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400'
    case 'delivery_issue': return 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400'
    case 'packaging': return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400'
    case 'pricing': return 'bg-purple-50 text-purple-600 dark:bg-purple-950/30 dark:text-purple-400'
    case 'service': return 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-400'
    default: return 'bg-slate-50 text-slate-600 dark:bg-slate-900/30 dark:text-slate-400'
  }
}

export default function SubmitComplaint() {
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const { orderId } = useParams()

  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [isSelectOpen, setIsSelectOpen] = useState(false)

  const [formData, setFormData] = useState({
    complaintType: '',
    subject: '',
    description: '',
  })

  useEffect(() => {
    if (!orderId) {
      debugError("Order ID missing from URL params")
      toast.error("Order ID is required")
      setTimeout(() => {
        navigate("/user/orders")
      }, 2000)
      return
    }

    const fetchOrder = async () => {
      try {
        setLoading(true)
        debugLog("Fetching order details for orderId:", orderId)
        const response = await orderAPI.getOrderDetails(orderId)

        let orderData = null
        if (response?.data?.success && response.data.data?.order) {
          orderData = response.data.data.order
        } else if (response?.data?.order) {
          orderData = response.data.order
        } else {
          debugError("Order not found in response:", response?.data)
          toast.error("Order not found")
          setTimeout(() => {
            navigate("/user/orders")
          }, 2000)
          return
        }

        debugLog("Order fetched successfully:", {
          _id: orderData._id,
          orderId: orderData.orderId,
          restaurantName: orderData.restaurantName
        })
        setOrder(orderData)
      } catch (error) {
        debugError("Error fetching order:", error)
        toast.error(error?.response?.data?.message || "Failed to load order details")
        setTimeout(() => {
          navigate("/user/orders")
        }, 2000)
      } finally {
        setLoading(false)
      }
    }

    fetchOrder()
  }, [orderId, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.complaintType) {
      toast.error("Please select a complaint type")
      return
    }
    if (!formData.subject.trim()) {
      toast.error("Please enter a subject")
      return
    }
    if (!formData.description.trim()) {
      toast.error("Please enter a description")
      return
    }

    try {
      setSubmitting(true)
      const orderMongoId = order?._id || orderId
      if (!orderMongoId) {
        toast.error("Order ID not available")
        setSubmitting(false)
        return
      }

      const orderIdString = typeof orderMongoId === 'object' && orderMongoId.toString
        ? orderMongoId.toString()
        : String(orderMongoId)

      debugLog("Submitting complaint for orderId:", orderIdString)
      const response = await orderAPI.submitComplaint({
        orderId: orderIdString,
        complaintType: formData.complaintType,
        subject: formData.subject,
        description: formData.description,
      })

      if (response?.data?.success) {
        toast.success("Complaint submitted successfully")
        const orderIdForNav = order?._id || orderId
        navigate(`/user/orders/${orderIdForNav}/details`)
      } else {
        toast.error(response?.data?.message || "Failed to submit complaint")
      }
    } catch (error) {
      debugError("Error submitting complaint:", error)
      toast.error(error?.response?.data?.message || "Failed to submit complaint")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] flex items-center justify-center transition-colors">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-[#EB590E] border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Loading details...</p>
        </div>
      </div>
    )
  }

  if (!order) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] pb-28 transition-colors relative">
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-slide-up {
          animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-fade-in {
          animation: fadeIn 0.2s ease-out forwards;
        }
      `}</style>

      {/* Header */}
      <div className="bg-white dark:bg-[#111111] px-4 py-4 flex items-center sticky top-0 z-20 shadow-sm border-b border-gray-100 dark:border-white/5 transition-colors">
        <button
          type="button"
          onClick={goBack}
          className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-gray-700 dark:text-white transition-colors active:scale-95"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-bold text-gray-800 dark:text-white ml-3">Submit Complaint</h1>
      </div>

      {/* Order Info Card */}
      <div className="bg-white dark:bg-[#111111] mx-4 mt-4 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-white/5 transition-all">
        <div className="flex items-center gap-3 mb-3 pb-3 border-b border-gray-50 dark:border-white/5">
          <div className="w-10 h-10 bg-orange-50 dark:bg-orange-950/20 rounded-xl flex items-center justify-center transition-colors">
            <FileText className="w-5 h-5 text-[#EB590E]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-gray-900 dark:text-white break-all text-sm sm:text-base leading-tight">
              Order #{order.orderId || order._id}
            </p>
            <p className="text-xs font-semibold text-[#EB590E] mt-0.5">
              {order.restaurantName || 'Restaurant'}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>Placed on</span>
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {new Date(order.createdAt).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit'
            })}
          </span>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="mx-4 mt-4 space-y-4">
        {/* Complaint Type */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
            Complaint Type <span className="text-red-500">*</span>
          </label>
          <button
            type="button"
            onClick={() => setIsSelectOpen(true)}
            className="w-full flex items-center justify-between px-4 py-3 border border-gray-300 dark:border-white/10 bg-white dark:bg-[#111111] text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-[#EB590E] focus:border-transparent transition-all hover:bg-gray-50 dark:hover:bg-[#181818] active:scale-[0.99] text-left shadow-sm"
          >
            {formData.complaintType ? (
              <div className="flex items-center gap-3">
                <div className={`p-1.5 rounded-md ${getComplaintTypeColors(formData.complaintType)}`}>
                  {getComplaintTypeIcon(formData.complaintType, "w-4 h-4")}
                </div>
                <span className="font-semibold text-sm">
                  {COMPLAINT_TYPES.find(t => t.value === formData.complaintType)?.label}
                </span>
              </div>
            ) : (
              <span className="text-gray-400 dark:text-gray-500 font-medium text-sm">Select complaint type</span>
            )}
            <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${isSelectOpen ? 'rotate-180 text-[#EB590E]' : ''}`} />
          </button>
        </div>

        {/* Subject */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
            Subject <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.subject}
            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
            placeholder="Brief description of your complaint"
            className="w-full px-4 py-3 border border-gray-300 dark:border-white/10 bg-white dark:bg-[#111111] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 rounded-lg focus:ring-2 focus:ring-[#EB590E] focus:border-transparent transition-all shadow-sm text-sm"
            required
            maxLength={200}
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
            Description <span className="text-red-500">*</span>
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Please provide detailed information about your complaint..."
            rows={5}
            className="w-full px-4 py-3 border border-gray-300 dark:border-white/10 bg-white dark:bg-[#111111] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 rounded-lg focus:ring-2 focus:ring-[#EB590E] focus:border-transparent resize-none transition-all shadow-sm text-sm leading-relaxed"
            required
            maxLength={1000}
          />
          <div className="flex justify-end mt-1">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 transition-colors">
              {formData.description.length}/1000 characters
            </span>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50/70 dark:bg-[#0f2138]/60 backdrop-blur-sm border border-blue-100 dark:border-blue-500/20 rounded-xl p-4 flex gap-3 transition-colors">
          <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm text-blue-900 dark:text-blue-100">
            <p className="font-bold mb-0.5">What happens next?</p>
            <p className="text-blue-700 dark:text-blue-300 leading-relaxed font-medium">
              Your complaint will be sent to the restaurant. They will review and respond to your complaint. You can track the status in your complaints section.
            </p>
          </div>
        </div>

        {/* Submit Button Container (Fixed at bottom) */}
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[#111111] border-t border-gray-100 dark:border-white/5 p-4 z-20 transition-colors shadow-[0_-4px_24px_rgba(0,0,0,0.04)]">
          <div className="max-w-md mx-auto">
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#EB590E] text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#D94F0C] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-orange-500/10 text-sm"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Complaint"
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Custom Premium Bottom Sheet for Complaint Type Selection */}
      {isSelectOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center animate-fade-in">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsSelectOpen(false)}
          />
          
          {/* Sheet */}
          <div className="relative w-full max-w-md bg-white dark:bg-[#151515] rounded-t-2xl shadow-2xl border-t border-gray-100 dark:border-white/5 p-6 animate-slide-up z-10 max-h-[85vh] overflow-y-auto">
            {/* Grabber handle */}
            <div className="w-12 h-1.5 bg-gray-200 dark:bg-white/10 rounded-full mx-auto mb-5" />
            
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-gray-900 dark:text-white">Select Complaint Type</h3>
              <button 
                type="button"
                onClick={() => setIsSelectOpen(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-2 mt-2 pb-4">
              {COMPLAINT_TYPES.map((type) => {
                const isSelected = formData.complaintType === type.value
                return (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => {
                      setFormData({ ...formData, complaintType: type.value })
                      setIsSelectOpen(false)
                    }}
                    className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all ${
                      isSelected 
                        ? 'border-[#EB590E] bg-orange-50/50 dark:bg-orange-950/10 text-gray-900 dark:text-white font-bold' 
                        : 'border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/[0.02] hover:bg-gray-50 dark:hover:bg-white/[0.04] text-gray-700 dark:text-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <div className={`p-2 rounded-lg ${getComplaintTypeColors(type.value)}`}>
                        {getComplaintTypeIcon(type.value, "w-5 h-5")}
                      </div>
                      <span className="text-sm font-semibold">{type.label}</span>
                    </div>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-[#EB590E] flex items-center justify-center">
                        <Check className="w-3 h-3 text-white stroke-[3.5px]" />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
