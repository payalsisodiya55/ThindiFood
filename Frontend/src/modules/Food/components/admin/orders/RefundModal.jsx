import { useState, useEffect } from "react"
import { Wallet } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@food/components/ui/dialog"
import { Button } from "@food/components/ui/button"

export default function RefundModal({
  isOpen,
  onOpenChange,
  order,
  onConfirm,
  isProcessing,
  selectedRefundMode = "",
  onRefundModeChange,
  overrideReason = "",
  onOverrideReasonChange,
}) {
  const [refundAmount, setRefundAmount] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (order && isOpen) {
      const defaultAmount = Number(order.totalAmount || 0)
      setRefundAmount(defaultAmount.toString())
      setError("")
    }
  }, [order, isOpen])

  const handleAmountChange = (e) => {
    const value = e.target.value
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setRefundAmount(value)
      setError("")
    }
  }

  const handleConfirm = () => {
    const amount = parseFloat(refundAmount)
    const maxAmount = Number(order?.totalAmount || 0)
    const userPreference = String(order?.userRefundPreference || "").toLowerCase()
    const effectiveMode = selectedRefundMode || (userPreference === "original" ? "razorpay" : "wallet")

    if (!refundAmount || refundAmount.trim() === "") {
      setError("Refund amount required")
      return
    }
    if (Number.isNaN(amount) || amount <= 0) {
      setError("Please enter a valid amount")
      return
    }
    if (amount > maxAmount) {
      setError(`Refund amount cannot exceed ₹${maxAmount.toFixed(2)}`)
      return
    }

    onConfirm(amount, effectiveMode, overrideReason)
  }

  const handleClose = (nextOpen) => {
    if (!isProcessing) {
      if (nextOpen === false) {
        setRefundAmount("")
        setError("")
      }
      onOpenChange(nextOpen)
    }
  }

  if (!order) return null

  const maxAmount = Number(order.totalAmount || 0)
  const userPreference = String(order?.userRefundPreference || "").toLowerCase()
  const preferenceLabel =
    userPreference === "wallet" ? "Wallet" : userPreference === "original" ? "Bank Account" : "Not set"
  const effectiveMode = selectedRefundMode || (userPreference === "original" ? "razorpay" : "wallet")
  const isOverride = Boolean(
    userPreference &&
      ((userPreference === "wallet" && effectiveMode === "razorpay") ||
        (userPreference === "original" && effectiveMode === "wallet"))
  )

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-white rounded-2xl shadow-2xl">
        <DialogHeader className="px-6 pt-6 pb-2 border-b border-slate-50">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-purple-50 rounded-lg">
              <Wallet className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-slate-900">
                Process Refund
              </DialogTitle>
              <DialogDescription className="text-slate-500 text-xs">
                Order ID: <span className="font-semibold text-slate-700">{order.orderId}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-5 space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50/80 rounded-xl border border-slate-100/50">
              <span className="text-sm font-medium text-slate-500">User Preference</span>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                userPreference === 'wallet' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {preferenceLabel}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className={`group relative flex flex-col items-center justify-center gap-2 rounded-2xl border-2 p-4 cursor-pointer transition-all duration-300 ${
                effectiveMode === "wallet" 
                  ? "border-purple-600 bg-purple-50/50 shadow-sm" 
                  : "border-slate-100 bg-slate-50/30 text-slate-600 hover:border-slate-200 hover:bg-slate-50"
              }`}>
                <input
                  type="radio"
                  name="refundMode"
                  checked={effectiveMode === "wallet"}
                  onChange={() => onRefundModeChange?.("wallet")}
                  disabled={isProcessing}
                  className="sr-only"
                />
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                  effectiveMode === "wallet" ? "border-purple-600 scale-110" : "border-slate-300 group-hover:border-slate-400"
                }`}>
                  {effectiveMode === "wallet" && <div className="w-2.5 h-2.5 rounded-full bg-purple-600" />}
                </div>
                <span className={`font-bold text-sm transition-colors ${effectiveMode === "wallet" ? "text-purple-900" : "text-slate-600"}`}>Wallet</span>
                <span className="text-[10px] text-slate-400 font-medium -mt-1">Instant Credit</span>
              </label>

              <label className={`group relative flex flex-col items-center justify-center gap-2 rounded-2xl border-2 p-4 cursor-pointer transition-all duration-300 ${
                effectiveMode === "razorpay" 
                  ? "border-purple-600 bg-purple-50/50 shadow-sm" 
                  : "border-slate-100 bg-slate-50/30 text-slate-600 hover:border-slate-200 hover:bg-slate-50"
              }`}>
                <input
                  type="radio"
                  name="refundMode"
                  checked={effectiveMode === "razorpay"}
                  onChange={() => onRefundModeChange?.("razorpay")}
                  disabled={isProcessing}
                  className="sr-only"
                />
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                  effectiveMode === "razorpay" ? "border-purple-600 scale-110" : "border-slate-300 group-hover:border-slate-400"
                }`}>
                  {effectiveMode === "razorpay" && <div className="w-2.5 h-2.5 rounded-full bg-purple-600" />}
                </div>
                <span className={`font-bold text-sm transition-colors ${effectiveMode === "razorpay" ? "text-purple-900" : "text-slate-600"}`}>Bank Account</span>
                <span className="text-[10px] text-slate-400 font-medium -mt-1">5-7 working days</span>
              </label>
            </div>

            {isOverride && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 shadow-sm animate-in fade-in slide-in-from-top-2">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 text-amber-600">⚠️</div>
                  <div className="flex-1">
                    <p className="text-[11px] font-bold text-amber-800 uppercase tracking-tight mb-2">
                      Admin Override Active
                    </p>
                    <input
                      value={overrideReason}
                      onChange={(e) => onOverrideReasonChange?.(e.target.value)}
                      placeholder="Enter reason for override..."
                      disabled={isProcessing}
                      className="w-full rounded-lg border border-amber-200/60 bg-white/80 px-3 py-2 text-sm text-amber-900 outline-none transition-all focus:border-amber-400 focus:bg-white placeholder:text-amber-700/40"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 p-4 bg-slate-50/50 rounded-2xl border border-slate-100/50">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Refund Amount</label>
              <span className="text-[10px] font-bold text-slate-400">Max: ₹{maxAmount.toFixed(2)}</span>
            </div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">
                ₹
              </span>
              <input
                type="text"
                value={refundAmount}
                onChange={handleAmountChange}
                placeholder="0.00"
                disabled={isProcessing}
                className={`w-full pl-9 pr-4 py-3 bg-white border-2 rounded-xl text-lg font-bold text-slate-900 transition-all focus:outline-none ${
                  error
                    ? "border-red-200 focus:border-red-400"
                    : "border-slate-100 focus:border-purple-500"
                } ${isProcessing ? "opacity-50 cursor-not-allowed" : ""}`}
              />
            </div>
            {error && <p className="text-xs font-medium text-red-500 animate-in fade-in translate-y-1">{error}</p>}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50/50 border-t border-slate-100">
          <Button
            variant="ghost"
            onClick={() => handleClose(false)}
            disabled={isProcessing}
            className="px-6 h-11 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-all"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isProcessing || !refundAmount || parseFloat(refundAmount) <= 0}
            className="px-8 h-11 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-lg shadow-purple-200 transition-all active:scale-95"
          >
            {isProcessing ? "Processing..." : "Issue Refund"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
