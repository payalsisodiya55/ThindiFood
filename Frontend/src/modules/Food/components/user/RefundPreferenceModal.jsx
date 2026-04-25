import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@food/components/ui/dialog"
import { Button } from "@food/components/ui/button"

export default function RefundPreferenceModal({
  open = false,
  onSelect,
  onClose,
  amount = 0,
  defaultPreference = "wallet",
  isSubmitting = false,
}) {
  const [selected, setSelected] = useState(defaultPreference || "wallet")

  useEffect(() => {
    if (!open) return
    setSelected(defaultPreference || "wallet")
  }, [open, defaultPreference])

  const safeAmount = Number(amount || 0)

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !isSubmitting) onClose?.() }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-white">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="text-xl font-bold text-slate-900 text-center sm:text-left">
            Where do you want your refund?
          </DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-6">
          <div className="flex items-center justify-between py-3 mb-5 border-b border-slate-100">
            <span className="text-sm font-medium text-slate-500">Refund amount</span>
            <span className="text-lg font-bold text-slate-900">₹{safeAmount.toFixed(2)}</span>
          </div>
          
          <div className="space-y-3">
            <label className={`flex items-start gap-4 rounded-xl border-[1.5px] p-4 cursor-pointer transition-all duration-200 ${
              selected === "wallet" 
                ? "border-blue-500 bg-blue-50/50 shadow-sm" 
                : "border-slate-200 hover:border-slate-300 bg-white"
            }`}>
              <div className="mt-0.5 relative flex-shrink-0 flex items-center justify-center">
                <input
                  type="radio"
                  name="refundPreference"
                  value="wallet"
                  checked={selected === "wallet"}
                  onChange={() => setSelected("wallet")}
                  disabled={isSubmitting}
                  className="sr-only"
                />
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                  selected === "wallet" ? "border-blue-500" : "border-slate-300"
                }`}>
                  {selected === "wallet" && <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />}
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-base font-bold text-slate-900">Wallet</div>
                  <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    Instant
                  </span>
                </div>
                <div className="text-sm text-slate-500 leading-snug pr-2">
                  Funds will be credited to your Thindi Wallet immediately.
                </div>
              </div>
            </label>

            <label className={`flex items-start gap-4 rounded-xl border-[1.5px] p-4 cursor-pointer transition-all duration-200 ${
              selected === "original" 
                ? "border-blue-500 bg-blue-50/50 shadow-sm" 
                : "border-slate-200 hover:border-slate-300 bg-white"
            }`}>
              <div className="mt-0.5 relative flex-shrink-0 flex items-center justify-center">
                <input
                  type="radio"
                  name="refundPreference"
                  value="original"
                  checked={selected === "original"}
                  onChange={() => setSelected("original")}
                  disabled={isSubmitting}
                  className="sr-only"
                />
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                  selected === "original" ? "border-blue-500" : "border-slate-300"
                }`}>
                  {selected === "original" && <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />}
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-base font-bold text-slate-900">Bank Account</div>
                  <span className="text-[10px] uppercase tracking-wider font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                    5-7 Days
                  </span>
                </div>
                <div className="text-sm text-slate-500 leading-snug pr-2">
                  Processed to original payment method. Subject to bank processing times.
                </div>
              </div>
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-6 mt-2">
            <Button 
              variant="outline" 
              className="px-6 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900" 
              onClick={() => onClose?.()} 
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button 
              className="px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm" 
              onClick={() => onSelect?.(selected)} 
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Confirm"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
