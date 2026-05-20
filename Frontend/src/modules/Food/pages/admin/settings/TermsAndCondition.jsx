import { useState, useEffect } from "react"
import { toast } from "sonner"
import api from "@food/api"
import { API_ENDPOINTS } from "@food/api/config"
import { Textarea } from "@food/components/ui/textarea"
import { legalHtmlToPlainText, plainTextToLegalHtml } from "@food/utils/legalContentFormat"

const debugError = (...args) => {}

export default function TermsAndCondition({ defaultTab = "user" }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [viewMode, setViewMode] = useState("edit") // "edit" | "preview"
  const [activeTab, setActiveTab] = useState(defaultTab) // "user" | "restaurant" | "delivery"

  const [userTerms, setUserTerms] = useState({
    title: "Terms and Conditions",
    content: ""
  })

  const [restaurantTerms, setRestaurantTerms] = useState({
    title: "Restaurant Terms and Conditions",
    content: ""
  })

  const [deliveryTerms, setDeliveryTerms] = useState({
    title: "Delivery Terms and Conditions",
    content: ""
  })

  // Sync tab selection if defaultTab prop changes (e.g. via direct routing)
  useEffect(() => {
    setActiveTab(defaultTab)
  }, [defaultTab])

  useEffect(() => {
    fetchAllTerms()
  }, [])

  const fetchAllTerms = async () => {
    try {
      setLoading(true)
      const [userResult, restResult, delivResult] = await Promise.allSettled([
        api.get(API_ENDPOINTS.ADMIN.TERMS, { contextModule: "admin" }),
        api.get(API_ENDPOINTS.ADMIN.RESTAURANT_TERMS, { contextModule: "admin" }),
        api.get(API_ENDPOINTS.ADMIN.DELIVERY_TERMS, { contextModule: "admin" })
      ])

      if (userResult.status === "fulfilled" && userResult.value.data.success) {
        const data = userResult.value.data.data
        setUserTerms({
          ...data,
          content: legalHtmlToPlainText(data.content || "")
        })
      }
      if (restResult.status === "fulfilled" && restResult.value.data.success) {
        const data = restResult.value.data.data
        setRestaurantTerms({
          ...data,
          title: data.title || "Restaurant Terms and Conditions",
          content: legalHtmlToPlainText(data.content || "")
        })
      }
      if (delivResult.status === "fulfilled" && delivResult.value.data.success) {
        const data = delivResult.value.data.data
        setDeliveryTerms({
          ...data,
          title: data.title || "Delivery Terms and Conditions",
          content: legalHtmlToPlainText(data.content || "")
        })
      }
    } catch (error) {
      debugError("Error fetching terms data:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleContentChange = (val) => {
    if (activeTab === "user") {
      setUserTerms((prev) => ({ ...prev, content: val }))
    } else if (activeTab === "restaurant") {
      setRestaurantTerms((prev) => ({ ...prev, content: val }))
    } else {
      setDeliveryTerms((prev) => ({ ...prev, content: val }))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    let currentTerms, endpoint, updateState, label;
    if (activeTab === "user") {
      currentTerms = userTerms;
      endpoint = API_ENDPOINTS.ADMIN.TERMS;
      updateState = setUserTerms;
      label = "User";
    } else if (activeTab === "restaurant") {
      currentTerms = restaurantTerms;
      endpoint = API_ENDPOINTS.ADMIN.RESTAURANT_TERMS;
      updateState = setRestaurantTerms;
      label = "Restaurant";
    } else {
      currentTerms = deliveryTerms;
      endpoint = API_ENDPOINTS.ADMIN.DELIVERY_TERMS;
      updateState = setDeliveryTerms;
      label = "Delivery";
    }

    try {
      setSaving(true)
      const htmlContent = plainTextToLegalHtml(currentTerms.content)

      const response = await api.put(
        endpoint,
        { title: currentTerms.title, content: htmlContent },
        { contextModule: "admin" }
      )
      if (response.data.success) {
        toast.success(`${label} terms updated successfully`)
        const content = response.data.data.content || ""
        const textContent = legalHtmlToPlainText(content)
        updateState({
          ...response.data.data,
          title: response.data.data.title || `${label} Terms and Conditions`,
          content: textContent
        })
      }
    } catch (error) {
      debugError("Error saving terms:", error)
      toast.error(error.response?.data?.message || "Failed to save terms and conditions")
    } finally {
      setSaving(false)
    }
  }

  const activeData = activeTab === "user" ? userTerms : activeTab === "restaurant" ? restaurantTerms : deliveryTerms

  if (loading) {
    return (
      <div className="h-full overflow-y-auto bg-slate-50 p-4 lg:p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-4 lg:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Page Header */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Terms & Conditions</h1>
            <p className="text-sm text-slate-600 mt-1">Manage user, restaurant, and delivery Terms and Conditions content</p>
          </div>
        </div>

        {/* Unified Tab Switcher */}
        <div className="flex space-x-1 bg-slate-200/60 p-1 rounded-xl max-w-lg mb-6 border border-slate-200/30">
          <button
            type="button"
            onClick={() => setActiveTab("user")}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 cursor-pointer ${
              activeTab === "user"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/30"
            }`}
          >
            User Terms
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("restaurant")}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 cursor-pointer ${
              activeTab === "restaurant"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/30"
            }`}
          >
            Restaurant Terms
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("delivery")}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 cursor-pointer ${
              activeTab === "delivery"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/30"
            }`}
          >
            Delivery Terms
          </button>
        </div>

        {/* Text Area / Preview Card */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="text-sm text-slate-600">
              Use headings like <span className="font-mono">#</span>, <span className="font-mono">##</span> and bold like <span className="font-mono">**text**</span>.
            </div>
            <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setViewMode("edit")}
                className={`px-3 py-1.5 text-sm font-medium cursor-pointer ${viewMode === "edit" ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setViewMode("preview")}
                className={`px-3 py-1.5 text-sm font-medium cursor-pointer ${viewMode === "preview" ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                Preview
              </button>
            </div>
          </div>

          {viewMode === "edit" ? (
            <Textarea
              value={activeData.content}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder={`Enter ${activeTab === "user" ? "user" : activeTab === "restaurant" ? "restaurant" : "delivery"} terms and conditions content...`}
              className="min-h-[600px] w-full text-sm text-slate-700 leading-relaxed resize-y"
              dir="ltr"
              style={{
                direction: "ltr",
                textAlign: "left",
                unicodeBidi: "bidi-override",
                width: "100%",
                maxWidth: "100%"
              }}
            />
          ) : (
            <div className="min-h-[600px] w-full rounded-md border border-slate-200 bg-white p-4">
              <div
                className="prose prose-slate max-w-none
                  prose-headings:text-slate-900
                  prose-p:text-slate-700
                  prose-strong:text-slate-900
                  prose-ul:text-slate-700
                  prose-li:my-1
                  leading-relaxed"
                dangerouslySetInnerHTML={{ __html: plainTextToLegalHtml(activeData.content) }}
              />
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div className="flex justify-end mt-6">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  )
}
