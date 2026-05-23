import { Link, useLocation } from "react-router-dom"
import { ShoppingBag, User, UtensilsCrossed, Truck } from "lucide-react"
import { useCart } from "@food/context/CartContext"
import { useState, useEffect } from "react"

export default function BottomNavigation() {
  const { itemCount } = useCart()
  const location = useLocation()
  const pathname = location.pathname

  const [fulfillmentMode, setFulfillmentModeLocal] = useState(
    () => localStorage.getItem("thindi_fulfillment_mode") || "pickup"
  )

  // Sync with Home.jsx via CustomEvent
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.mode) setFulfillmentModeLocal(e.detail.mode)
    }
    window.addEventListener("thindi:fulfillmentMode", handler)
    return () => window.removeEventListener("thindi:fulfillmentMode", handler)
  }, [])

  // Check active routes
  const isDining = pathname === "/dining" || pathname.startsWith("/dining/") || pathname === "/food/dining" || pathname.startsWith("/food/user/dining")
  const isProfile = pathname.startsWith("/profile") || pathname.startsWith("/food/profile") || pathname.startsWith("/food/user/profile")
  const isDelivery = pathname === "/food/user/delivery" || pathname === "/food/delivery" || pathname === "/delivery"
  const isTakeaway = !isDining && !isProfile && !isDelivery && (
    pathname === "/" ||
    pathname === "" ||
    pathname === "/food" ||
    pathname === "/food/" ||
    pathname === "/food/user" ||
    (pathname.startsWith("/food/user") &&
      !pathname.includes("/dining") &&
      !pathname.includes("/profile") &&
      !pathname.includes("/delivery"))
  )

  return (
    <div
      className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-[#1a1a1a] border-t border-gray-200 dark:border-gray-800 z-50 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] px-4 pt-2"
      style={{ paddingBottom: "calc(8px + env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-center h-14">
        <div className="flex flex-1 items-center">

          {/* Takeaway Tab */}
          <Link
            to="/food/user"
            onClick={() => {
              const mode = "pickup"
              setFulfillmentModeLocal(mode)
              localStorage.setItem("thindi_fulfillment_mode", mode)
              window.dispatchEvent(new CustomEvent("thindi:fulfillmentMode", { detail: { mode } }))
            }}
            className={`flex flex-1 flex-col items-center gap-1 transition-all duration-200 ${isTakeaway ? "text-[#00c87e]" : "text-gray-500"}`}
          >
            <div className={`p-1 rounded-xl ${isTakeaway ? "bg-[#00c87e]/10" : ""}`}>
              <ShoppingBag className="h-5 w-5" strokeWidth={isTakeaway ? 2.5 : 2} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Takeaway</span>
          </Link>

          {/* Divider */}
          <div className="h-6 w-px bg-gray-200 dark:bg-gray-800" />

          {/* Delivery Tab */}
          <Link
            to="/food/user/delivery"
            className={`flex flex-1 flex-col items-center gap-1 transition-all duration-200 ${isDelivery ? "text-[#00c87e]" : "text-gray-500"}`}
          >
            <div className={`p-1 rounded-xl ${isDelivery ? "bg-[#00c87e]/10" : ""}`}>
              <Truck className="h-5 w-5" strokeWidth={isDelivery ? 2.5 : 2} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Delivery</span>
          </Link>

          {/* Divider */}
          <div className="h-6 w-px bg-gray-200 dark:bg-gray-800" />

          {/* Dining Tab */}
          <Link
            to="/food/user/dining"
            className={`flex flex-1 flex-col items-center gap-1 transition-all duration-200 ${isDining ? "text-[#00c87e]" : "text-gray-500"}`}
          >
            <div className={`p-1 rounded-xl ${isDining ? "bg-[#00c87e]/10" : ""}`}>
              <UtensilsCrossed className="h-5 w-5" strokeWidth={isDining ? 2.5 : 2} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Dining</span>
          </Link>

          {/* Divider */}
          <div className="h-6 w-px bg-gray-200 dark:bg-gray-800" />

          {/* Profile Tab */}
          <Link
            to="/food/user/profile"
            className={`flex flex-1 flex-col items-center gap-1 transition-all duration-200 ${isProfile ? "text-[#00c87e]" : "text-gray-500"}`}
          >
            <div className={`p-1 rounded-xl ${isProfile ? "bg-[#00c87e]/10" : ""}`}>
              <User className="h-5 w-5" strokeWidth={isProfile ? 2.5 : 2} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Profile</span>
          </Link>

        </div>
      </div>
    </div>
  )
}
