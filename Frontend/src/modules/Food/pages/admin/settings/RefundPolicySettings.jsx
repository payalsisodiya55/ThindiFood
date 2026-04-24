import { useEffect, useState } from "react"
import { Save, Loader2, BadgeIndianRupee } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { adminAPI } from "@food/api"
import { toast } from "sonner"

const debugError = (...args) => {}

const DEFAULT_SETTINGS = {
  cancelledByRestaurant: "automatic",
  cancelledByUser: "manual",
}

const MODE_OPTIONS = [
  {
    value: "automatic",
    title: "Automatic",
    description: "Refund triggers immediately after cancellation.",
  },
  {
    value: "manual",
    title: "Manual",
    description: "Admin reviews and processes the refund manually.",
  },
]

function RefundModeCard({ title, value, onChange }) {
  return (
    <div className="border border-slate-200 rounded-xl p-5">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <div className="mt-4 space-y-3">
        {MODE_OPTIONS.map((option) => {
          const checked = value === option.value
          return (
            <label
              key={option.value}
              className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${
                checked
                  ? "border-orange-500 bg-orange-50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <input
                type="radio"
                name={title}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="mt-1 h-4 w-4 text-orange-600"
              />
              <div>
                <p className="text-sm font-semibold text-slate-900">{option.title}</p>
                <p className="text-sm text-slate-600 mt-1">{option.description}</p>
              </div>
            </label>
          )
        })}
      </div>
    </div>
  )
}

export default function RefundPolicySettings() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true)
        const res = await adminAPI.getRefundPolicy()
        const nextSettings =
          res?.data?.data?.refundPolicySettings ||
          res?.data?.data ||
          DEFAULT_SETTINGS

        setSettings({
          cancelledByRestaurant:
            nextSettings?.cancelledByRestaurant || DEFAULT_SETTINGS.cancelledByRestaurant,
          cancelledByUser:
            nextSettings?.cancelledByUser || DEFAULT_SETTINGS.cancelledByUser,
        })
      } catch (error) {
        debugError("Error fetching refund policy settings:", error)
        toast.error(error?.response?.data?.message || "Failed to load refund policy settings")
      } finally {
        setLoading(false)
      }
    }

    fetchSettings()
  }, [])

  const handleSave = async () => {
    try {
      setSaving(true)
      const body = {
        cancelledByRestaurant: settings.cancelledByRestaurant,
        cancelledByUser: settings.cancelledByUser,
        isActive: true,
      }
      const res = await adminAPI.saveRefundPolicy(body)
      if (res?.data?.success) {
        const saved = res?.data?.data?.refundPolicySettings || body
        setSettings({
          cancelledByRestaurant: saved.cancelledByRestaurant || DEFAULT_SETTINGS.cancelledByRestaurant,
          cancelledByUser: saved.cancelledByUser || DEFAULT_SETTINGS.cancelledByUser,
        })
        toast.success("Refund policy settings saved successfully")
      } else {
        toast.error(res?.data?.message || "Failed to save refund policy settings")
      }
    } catch (error) {
      debugError("Error saving refund policy settings:", error)
      toast.error(error?.response?.data?.message || "Failed to save refund policy settings")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
            <BadgeIndianRupee className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Refund Policy Settings</h1>
        </div>
        <p className="text-sm text-slate-600">
          Configure how cancelled food orders should be refunded across the platform.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Global Refund Rules</h2>
              <p className="text-sm text-slate-500 mt-1">
                These settings apply to all new cancellation refunds.
              </p>
            </div>
            <Button
              onClick={handleSave}
              disabled={loading || saving}
              className="bg-orange-600 hover:bg-orange-700 text-white flex items-center gap-2"
            >
              {saving ? (
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

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-orange-600" />
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <RefundModeCard
                title="Cancelled by Restaurant"
                value={settings.cancelledByRestaurant}
                onChange={(value) =>
                  setSettings((prev) => ({ ...prev, cancelledByRestaurant: value }))
                }
              />
              <RefundModeCard
                title="Cancelled by User"
                value={settings.cancelledByUser}
                onChange={(value) =>
                  setSettings((prev) => ({ ...prev, cancelledByUser: value }))
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
