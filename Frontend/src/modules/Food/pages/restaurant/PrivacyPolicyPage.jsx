import { motion } from "framer-motion"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { useEffect, useState } from "react"
import { ArrowLeft } from "lucide-react"
import api, { API_ENDPOINTS } from "@food/api"

export default function PrivacyPolicyPage() {
  const goBack = useRestaurantBackNavigation()
  const [loading, setLoading] = useState(true)
  const [privacyData, setPrivacyData] = useState({ title: "Privacy Policy", content: "", updatedAt: "" })

  useEffect(() => {
    const fetchPrivacy = async () => {
      try {
        const response = await api.get(API_ENDPOINTS.ADMIN.RESTAURANT_PRIVACY_PUBLIC)
        if (response?.data?.success) {
          const payload = response?.data?.data || {}
          setPrivacyData({
            title: payload?.title || "Restaurant Privacy Policy",
            content: payload?.content || "",
            updatedAt: payload?.updatedAt || ""
          })
        }
      } catch (_) {
      } finally {
        setLoading(false)
      }
    }

    fetchPrivacy()
  }, [])

  return (
    <div className="min-h-screen bg-[#f8fafc] overflow-x-hidden pb-10">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 bg-[#00c87e] border-b border-[#00c87e] px-4 py-3 z-50 flex items-center gap-3">
        <button 
          onClick={goBack}
          className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <h1 className="text-lg font-bold text-white flex-1">Privacy Policy</h1>
      </div>

      {/* Content */}
      <div className="px-4 py-6 pt-[4.5rem]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6"
        >
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-gray-900">{privacyData.title || "Restaurant Privacy Policy"}</h2>
            <p className="text-sm text-gray-600">
              Last updated: {(privacyData.updatedAt ? new Date(privacyData.updatedAt) : new Date()).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>

          {loading ? (
            <p className="text-sm text-gray-500">Loading privacy policy...</p>
          ) : privacyData.content ? (
            <div
              className="prose prose-sm max-w-none text-sm text-gray-700 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: privacyData.content }}
            />
          ) : (
            <p className="text-sm text-gray-500">No privacy policy content available.</p>
          )}
        </motion.div>
      </div>
    </div>
  )
}
