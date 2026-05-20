import { useState } from "react"
import { CloudOff, RotateCw, Info, X } from "lucide-react"
import { toast } from "sonner"

export default function OfflineScreen({ onRetry }) {
  const [isChecking, setIsChecking] = useState(false)

  const handleRetry = async () => {
    setIsChecking(true)
    
    // Simulate a brief network check delay to give user visual feedback
    await new Promise((resolve) => setTimeout(resolve, 800))
    
    if (navigator.onLine) {
      toast.success("Connection restored!")
      if (onRetry) onRetry()
    } else {
      toast.error("Still offline. Please check your internet connection.", {
        description: "Verify your Wi-Fi or mobile data settings and try again.",
        duration: 3000,
      })
    }
    
    setIsChecking(false)
  }

  const handleClose = () => {
    // Navigate back to the previous screen or fallback to home
    if (window.history.length > 1) {
      window.history.back()
    } else {
      window.location.href = "/"
    }
  }

  return (
    <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#0f0f12] text-white px-6 font-sans">
      {/* Cloud Offline Icon Container */}
      <div className="w-28 h-28 bg-[#231e3d] rounded-full flex items-center justify-center mb-8 shadow-lg shadow-purple-950/20">
        <CloudOff className="w-12 h-12 text-[#a78bfa]" />
      </div>

      {/* Heading */}
      <h1 className="text-xl font-bold tracking-wide text-zinc-100 mb-2 text-center">
        No Internet Connection
      </h1>

      {/* Subtitle */}
      <p className="text-zinc-400 text-sm text-center max-w-[280px] mb-8 leading-relaxed">
        Please check your internet connection and try again.
      </p>

      {/* Try Again Button */}
      <button
        onClick={handleRetry}
        disabled={isChecking}
        className="flex items-center justify-center gap-2 bg-[#5865F2] hover:bg-[#4752c4] disabled:bg-[#5865F2]/50 text-white font-semibold py-3 px-10 rounded-xl transition-all duration-200 active:scale-95 mb-10 w-full max-w-[260px] shadow-lg shadow-indigo-900/30 cursor-pointer"
      >
        <RotateCw className={`w-4 h-4 ${isChecking ? "animate-spin" : ""}`} />
        <span>{isChecking ? "Checking..." : "Try Again"}</span>
      </button>

      {/* Troubleshooting Tips Card */}
      <div className="bg-[#18181c] border border-zinc-800/40 p-5 rounded-2xl w-full max-w-[320px] shadow-xl">
        <h3 className="text-zinc-200 font-bold text-xs tracking-wider uppercase mb-3">
          Troubleshooting Tips:
        </h3>
        <div className="space-y-3">
          {/* Tip 1 */}
          <div className="flex items-start gap-2.5 text-xs text-zinc-400 leading-normal">
            <Info className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
            <span>
              <span className="text-[#a78bfa] font-semibold mr-1">✓</span>
              Check if WiFi or Mobile Data is enabled
            </span>
          </div>
          {/* Tip 2 */}
          <div className="flex items-start gap-2.5 text-xs text-zinc-400 leading-normal">
            <Info className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
            <span>
              <span className="text-[#a78bfa] font-semibold mr-1">✓</span>
              Turn on Airplane mode and turn it off
            </span>
          </div>
          {/* Tip 3 */}
          <div className="flex items-start gap-2.5 text-xs text-zinc-400 leading-normal">
            <Info className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
            <span>
              <span className="text-[#a78bfa] font-semibold mr-1">✓</span>
              Restart your router or modem
            </span>
          </div>
        </div>
      </div>

      {/* Red Close Button at bottom-right */}
      <button
        onClick={handleClose}
        className="fixed bottom-6 right-6 w-12 h-12 bg-[#ff3b30] hover:bg-[#e03126] active:scale-95 text-white rounded-2xl flex items-center justify-center transition shadow-lg shadow-red-950/40 cursor-pointer"
        aria-label="Close offline screen"
      >
        <X className="w-6 h-6 stroke-[2.5]" />
      </button>
    </div>
  )
}
