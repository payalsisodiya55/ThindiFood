import { useEffect, useState } from "react"
import { Save, Loader2, DollarSign } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { adminAPI } from "@food/api"
import { toast } from "sonner"

const debugError = () => {}

export default function DiningFeeSettings() {
  const [feeSettings, setFeeSettings] = useState({
    platformFee: "",
    gstRate: "",
  })
  const [loadingFeeSettings, setLoadingFeeSettings] = useState(false)
  const [savingFeeSettings, setSavingFeeSettings] = useState(false)

  const fetchFeeSettings = async () => {
    try {
      setLoadingFeeSettings(true)
      const response = await adminAPI.getDiningFeeSettings()
      const saved = response?.data?.data?.feeSettings

      if (response?.data?.success && saved) {
        setFeeSettings({
          platformFee: saved.platformFee ?? "",
          gstRate: saved.gstRate ?? "",
        })
      } else {
        setFeeSettings({
          platformFee: "",
          gstRate: "",
        })
      }
    } catch (error) {
      debugError("Error fetching dining fee settings:", error)
      toast.error("Failed to load dining fee settings")
    } finally {
      setLoadingFeeSettings(false)
    }
  }

  useEffect(() => {
    fetchFeeSettings()
  }, [])

  const handleSaveFeeSettings = async () => {
    try {
      setSavingFeeSettings(true)
      const response = await adminAPI.createOrUpdateDiningFeeSettings({
        platformFee:
          feeSettings.platformFee === ""
            ? undefined
            : Number(feeSettings.platformFee),
        gstRate:
          feeSettings.gstRate === "" ? undefined : Number(feeSettings.gstRate),
        isActive: true,
      })

      if (response?.data?.success) {
        toast.success("Dining fee settings saved successfully")
        const saved = response?.data?.data?.feeSettings
        if (saved) {
          setFeeSettings({
            platformFee: saved.platformFee ?? "",
            gstRate: saved.gstRate ?? "",
          })
        }
      } else {
        toast.error(response?.data?.message || "Failed to save dining fee settings")
      }
    } catch (error) {
      debugError("Error saving dining fee settings:", error)
      toast.error(error?.response?.data?.message || "Failed to save dining fee settings")
    } finally {
      setSavingFeeSettings(false)
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
            <DollarSign className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Dining Fee Settings</h1>
        </div>
        <p className="text-sm text-slate-600">
          Configure dining-only platform fee and GST settings
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Fee Configuration</h2>
              <p className="text-sm text-slate-500 mt-1">
                Set dining platform fee and GST charges
              </p>
            </div>
            <Button
              onClick={handleSaveFeeSettings}
              disabled={savingFeeSettings || loadingFeeSettings}
              className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
            >
              {savingFeeSettings ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Settings
                </>
              )}
            </Button>
          </div>

          {loadingFeeSettings ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-green-600" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">
                  Platform Fee (₹)
                </label>
                <input
                  type="number"
                  value={feeSettings.platformFee}
                  onChange={(e) =>
                    setFeeSettings({
                      ...feeSettings,
                      platformFee: e.target.value,
                    })
                  }
                  min="0"
                  step="1"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all"
                  placeholder="5"
                />
                <p className="text-xs text-slate-500">
                  Dining platform fee per order
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">
                  GST Rate (%)
                </label>
                <input
                  type="number"
                  value={feeSettings.gstRate}
                  onChange={(e) =>
                    setFeeSettings({ ...feeSettings, gstRate: e.target.value })
                  }
                  min="0"
                  max="100"
                  step="0.1"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all"
                  placeholder="5"
                />
                <p className="text-xs text-slate-500">
                  GST percentage applied on dining subtotal
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

