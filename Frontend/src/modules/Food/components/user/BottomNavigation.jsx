import { Link, useLocation } from "react-router-dom"
import { ShoppingBag, User, UtensilsCrossed, ShoppingCart, ChevronRight } from "lucide-react"
import { useCart } from "@food/context/CartContext"

export default function BottomNavigation() {
  const { itemCount, total } = useCart()
  const location = useLocation()
  const pathname = location.pathname

  // Check active routes - support both /user/* and /* paths
  const isDining = pathname === "/dining" || pathname.startsWith("/dining/") || pathname === "/food/dining" || pathname.startsWith("/food/user/dining")
  const isProfile = pathname.startsWith("/profile") || pathname.startsWith("/food/profile") || pathname.startsWith("/food/user/profile")
  const isDelivery =
    !isDining &&
    !isProfile &&
    (pathname === "/" ||
      pathname === "" ||
      pathname === "/food" ||
      pathname === "/food/" ||
      pathname === "/food/user" ||
      (pathname.startsWith("/food/user") &&
        !pathname.includes("/dining") &&
        !pathname.includes("/profile")))

  return (
    <div
      className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-[#1a1a1a] border-t border-gray-200 dark:border-gray-800 z-50 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] px-4 py-2"
    >
      <div className="flex items-center gap-3 h-14">
        {/* Compact Tabs Group */}
        <div className="flex flex-1 items-center">
          {/* Takeaway Tab */}
          <Link
            to="/food/user"
            className={`flex flex-1 flex-col items-center gap-1 transition-all duration-200 ${isDelivery ? "text-[#00c87e]" : "text-gray-500"}`}
          >
            <div className={`p-1 rounded-xl ${isDelivery ? "bg-[#00c87e]/10" : ""}`}>
              <ShoppingBag className="h-5 w-5" strokeWidth={isDelivery ? 2.5 : 2} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Takeaway</span>
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

        {/* Compact View Cart Button on Right */}
        {itemCount > 0 && (
          <>
            {/* Divider */}
            <div className="h-8 w-px bg-gray-200 dark:bg-gray-800 mx-1" />
            <Link
              to="/food/user/cart"
              className="flex flex-[0.45] items-center justify-between bg-[#00c87e] text-white h-full px-3 rounded-2xl shadow-[0_4px_15px_rgba(0,200,126,0.25)] active:scale-[0.96] transition-all duration-200"
            >
              <div className="flex items-center gap-1.5">
                <div className="relative">
                  <ShoppingCart className="h-4.5 w-4.5 stroke-[3]" />
                  <span className="absolute -top-1.5 -right-1.5 bg-black text-[#00c87e] text-[8px] font-bold h-3.5 w-3.5 rounded-full flex items-center justify-center border border-[#00c87e]">
                    {itemCount}
                  </span>
                </div>
                <span className="font-extrabold text-[12px] whitespace-nowrap">View Cart</span>
              </div>
              <ChevronRight className="h-4 w-4 stroke-[3]" />
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
