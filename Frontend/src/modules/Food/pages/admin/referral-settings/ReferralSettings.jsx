import { useEffect, useState } from "react"
import { Save, Loader2, Gift, Users, IndianRupee, Hash } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { adminAPI } from "@food/api"
import { toast } from "sonner"

const debugError = (...args) => {}

export default function ReferralSettings() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState({
    referralRewardUser: "",
    refereeRewardUser: "",
    referralLimitUser: "",
  })

  const fetchSettings = async () => {
    try {
      setLoading(true)
      const res = await adminAPI.getReferralSettings()
      const s = res?.data?.data?.referralSettings
      if (res?.data?.success && s) {
        setSettings({
          referralRewardUser: s.referralRewardUser ?? "",
          refereeRewardUser: s.refereeRewardUser ?? "",
          referralLimitUser: s.referralLimitUser ?? "",
        })
      } else {
        setSettings({
          referralRewardUser: "",
          refereeRewardUser: "",
          referralLimitUser: "",
        })
      }
    } catch (e) {
      debugError("Error fetching referral settings:", e)
      toast.error("Failed to load referral settings")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  const handleSave = async () => {
    try {
      setSaving(true)
      const body = {
        referralRewardUser: settings.referralRewardUser === "" ? 0 : Number(settings.referralRewardUser),
        refereeRewardUser: settings.refereeRewardUser === "" ? 0 : Number(settings.refereeRewardUser),
        referralLimitUser: settings.referralLimitUser === "" ? 0 : Number(settings.referralLimitUser),
        isActive: true,
      }
      const res = await adminAPI.createOrUpdateReferralSettings(body)
      if (res?.data?.success) {
        toast.success("Referral settings saved successfully")
        const saved = res?.data?.data?.referralSettings
        if (saved) {
          setSettings({
            referralRewardUser: saved.referralRewardUser ?? "",
            refereeRewardUser: saved.refereeRewardUser ?? "",
            referralLimitUser: saved.referralLimitUser ?? "",
          })
        }
      } else {
        toast.error(res?.data?.message || "Failed to save referral settings")
      }
    } catch (e) {
      debugError("Error saving referral settings:", e)
      toast.error(e?.response?.data?.message || "Failed to save referral settings")
    } finally {
      setSaving(false)
    }
  }

  const onChange = (key) => (e) => {
    const v = String(e.target.value ?? "")
      .replace(/[^\d.]/g, "")
      .replace(/^0+(\d)/, "$1")
    setSettings((prev) => ({ ...prev, [key]: v }))
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600">
            <Gift className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-3xl font-black text-slate-900">Referral Settings</h1>
        </div>
        <p className="text-base text-slate-600">
          Configure referral reward amounts and maximum credits per referrer.
        </p>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="p-6 lg:p-8">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-black text-slate-900">Configuration</h2>
              <p className="mt-2 text-base text-slate-500">
                These values apply instantly to new referrals.
              </p>
            </div>
            <Button
              onClick={handleSave}
              disabled={saving || loading}
              className="flex items-center gap-2 self-start rounded-xl bg-orange-600 px-5 py-2.5 text-white hover:bg-orange-700"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Settings
                </>
              )}
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-orange-600" />
            </div>
          ) : (
            <div className="max-w-md rounded-2xl border border-slate-200 bg-slate-50/50 p-6 shadow-sm">
              <div className="mb-6 flex items-center gap-3 border-b border-slate-200 pb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                  <Users className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  User Referral
                </h3>
              </div>

              <div className="mb-5">
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Referrer Reward
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <IndianRupee className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    value={settings.referralRewardUser}
                    onChange={onChange("referralRewardUser")}
                    inputMode="numeric"
                    className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition hover:border-slate-300 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
                    placeholder="e.g. 250"
                  />
                </div>
                <p className="mt-1.5 text-xs font-medium text-slate-500">Amount the person who shares gets</p>
              </div>

              <div className="mb-5">
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Referee Reward
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <IndianRupee className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    value={settings.refereeRewardUser}
                    onChange={onChange("refereeRewardUser")}
                    inputMode="numeric"
                    className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition hover:border-slate-300 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
                    placeholder="e.g. 70"
                  />
                </div>
                <p className="mt-1.5 text-xs font-medium text-slate-500">Amount the new user gets</p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Max Referrals Per User
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <Hash className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    value={settings.referralLimitUser}
                    onChange={onChange("referralLimitUser")}
                    inputMode="numeric"
                    className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition hover:border-slate-300 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
                    placeholder="e.g. 10"
                  />
                </div>
                <p className="mt-1.5 text-xs font-medium text-slate-500">Maximum times a user can refer others</p>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}
