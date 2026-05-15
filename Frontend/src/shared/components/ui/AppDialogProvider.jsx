import React, { useEffect, useMemo, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@food/components/ui/dialog"
import { Button } from "@food/components/ui/button"
import { cn } from "@/lib/utils"
import {
  alertApp,
  registerAppDialogHandlers,
} from "@shared/lib/appDialog"
import { Info, Trash2, CheckCircle2, AlertTriangle } from "lucide-react"

const toneStyles = {
  danger: {
    confirm: "bg-red-500 hover:bg-red-600 text-white shadow-red-100",
    icon: <Trash2 />,
    bg: "bg-red-50",
    strip: "bg-red-500"
  },
  success: {
    confirm: "bg-green-600 hover:bg-green-700 text-white shadow-green-100",
    icon: <CheckCircle2 />,
    bg: "bg-green-50",
    strip: "bg-green-600"
  },
  default: {
    confirm: "bg-[#FE5502] hover:bg-[#e54d00] text-white shadow-orange-100",
    icon: <Info />,
    bg: "bg-orange-50",
    strip: "bg-[#FE5502]"
  },
}

const createQueueItem = (type, options, resolve) => ({
  id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  type,
  options,
  resolve,
})

export default function AppDialogProvider({ children }) {
  const [activeDialog, setActiveDialog] = useState(null)
  const queueRef = useRef([])

  const flushQueue = () => {
    setActiveDialog((current) => {
      if (current || queueRef.current.length === 0) return current
      return queueRef.current.shift() || null
    })
  }

  const enqueueDialog = (type, options) =>
    new Promise((resolve) => {
      queueRef.current.push(createQueueItem(type, options, resolve))
      flushQueue()
    })

  useEffect(() => {
    registerAppDialogHandlers({
      alert: (options) => enqueueDialog("alert", options),
      confirm: (options) => enqueueDialog("confirm", options),
    })

    const nativeWindowAlert = window.alert.bind(window)
    window.alert = (message) => {
      void alertApp(message)
    }

    return () => {
      registerAppDialogHandlers(null)
      window.alert = nativeWindowAlert
    }
  }, [])

  const handleResolve = (result) => {
    setActiveDialog((current) => {
      current?.resolve?.(result)
      return null
    })

    window.setTimeout(flushQueue, 0)
  }

  const dialogOptions = activeDialog?.options || {}
  const isAlert = activeDialog?.type === "alert"
  const theme = toneStyles[dialogOptions.tone] || toneStyles.default

  return (
    <>
      {children}

      <Dialog
        open={Boolean(activeDialog)}
        onOpenChange={(open) => {
          if (!open) handleResolve(isAlert ? undefined : false)
        }}
      >
        <DialogContent
          className="w-[calc(100vw-2.5rem)] max-w-[360px] rounded-[32px] p-0 overflow-hidden border-0 shadow-[0_20px_50px_rgba(0,0,0,0.15)] sm:w-full bg-white"
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={() => handleResolve(isAlert ? undefined : false)}
        >
          {/* Top accent strip */}
          <div className={cn("h-1.5 w-full", theme.strip)} />

          <div className="p-8 space-y-6">
            {/* Icon + Content */}
            <div className="flex flex-col items-center text-center space-y-4">
              <div className={cn("w-16 h-16 rounded-full flex items-center justify-center shrink-0", theme.bg)}>
                {React.cloneElement(theme.icon, { className: "w-8 h-8", "strokeWidth": 2.5, "color": theme.strip === "bg-red-500" ? "#ef4444" : theme.strip === "bg-green-600" ? "#16a34a" : "#FE5502" })}
              </div>
              <div className="space-y-2">
                <DialogTitle className="text-xl font-black text-gray-900 tracking-tight leading-tight">
                  {dialogOptions.title || (isAlert ? "Notice" : "Confirm Action")}
                </DialogTitle>
                <DialogDescription className="text-sm font-medium text-gray-500 leading-relaxed">
                  {dialogOptions.description || dialogOptions.message || ""}
                </DialogDescription>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <Button
                type="button"
                onClick={() => handleResolve(isAlert ? undefined : true)}
                className={cn(
                  "w-full rounded-2xl h-14 text-base font-bold shadow-lg active:scale-[0.97] transition-all duration-200",
                  theme.confirm
                )}
              >
                {dialogOptions.confirmText || (isAlert ? "OK" : "Confirm")}
              </Button>
              {!dialogOptions.hideCancel && !isAlert && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleResolve(false)}
                  className="w-full rounded-2xl h-12 text-sm font-bold text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  {dialogOptions.cancelText || "Cancel"}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
