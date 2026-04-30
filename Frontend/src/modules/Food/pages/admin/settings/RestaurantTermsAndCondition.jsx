import { useState, useEffect } from "react"
import { toast } from "sonner"
import api from "@food/api"
import { API_ENDPOINTS } from "@food/api/config"
import { Textarea } from "@food/components/ui/textarea"
import { legalHtmlToPlainText, plainTextToLegalHtml } from "@food/utils/legalContentFormat"

const debugError = (...args) => {}

export default function RestaurantTermsAndCondition() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [viewMode, setViewMode] = useState("edit")
  const [termsData, setTermsData] = useState({
    title: "Restaurant Terms and Conditions",
    content: ""
  })

  useEffect(() => {
    fetchTermsData()
  }, [])

  const fetchTermsData = async () => {
    try {
      setLoading(true)
      const response = await api.get(API_ENDPOINTS.ADMIN.RESTAURANT_TERMS, { contextModule: "admin" })
      if (response.data.success) {
        const content = response.data.data.content || ""
        const textContent = legalHtmlToPlainText(content)
        setTermsData({
          ...response.data.data,
          title: response.data.data.title || "Restaurant Terms and Conditions",
          content: textContent
        })
      }
    } catch (error) {
      debugError("Error fetching restaurant terms data:", error)
      toast.error("Failed to load restaurant terms and conditions")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      setSaving(true)
      const htmlContent = plainTextToLegalHtml(termsData.content)
      const response = await api.put(
        API_ENDPOINTS.ADMIN.RESTAURANT_TERMS,
        { title: termsData.title, content: htmlContent },
        { contextModule: "admin" }
      )
      if (response.data.success) {
        toast.success("Restaurant terms and conditions updated successfully")
        const content = response.data.data.content || ""
        const textContent = legalHtmlToPlainText(content)
        setTermsData({
          ...response.data.data,
          title: response.data.data.title || "Restaurant Terms and Conditions",
          content: textContent
        })
      }
    } catch (error) {
      debugError("Error saving restaurant terms:", error)
      toast.error(error.response?.data?.message || "Failed to save restaurant terms and conditions")
    } finally {
      setSaving(false)
    }
  }

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
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Restaurant Terms And Conditions</h1>
          <p className="text-sm text-slate-600 mt-1">Manage restaurant Terms and Conditions content</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="text-sm text-slate-600">
              Use headings like <span className="font-mono">#</span>, <span className="font-mono">##</span> and bold like <span className="font-mono">**text**</span>.
            </div>
            <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setViewMode("edit")}
                className={`px-3 py-1.5 text-sm font-medium ${viewMode === "edit" ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setViewMode("preview")}
                className={`px-3 py-1.5 text-sm font-medium ${viewMode === "preview" ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                Preview
              </button>
            </div>
          </div>

          {viewMode === "edit" ? (
            <Textarea
              value={termsData.content}
              onChange={(e) => setTermsData((prev) => ({ ...prev, content: e.target.value }))}
              placeholder="Enter restaurant terms and conditions content..."
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
                className="prose prose-slate max-w-none prose-headings:text-slate-900 prose-p:text-slate-700 prose-strong:text-slate-900 prose-ul:text-slate-700 prose-li:my-1 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: plainTextToLegalHtml(termsData.content) }}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end mt-6">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  )
}
