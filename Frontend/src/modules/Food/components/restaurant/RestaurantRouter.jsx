import { Suspense, lazy, useState, useEffect } from "react"
import { Routes, Route, Navigate } from "react-router-dom"
import ProtectedRoute from "@food/components/ProtectedRoute"
import Loader from "@food/components/Loader"
import { getCurrentUser } from "@food/utils/auth"
import OfflineScreen from "./OfflineScreen"

// Lazy Loading Components
const AllOrdersPage = lazy(() => import("@food/pages/restaurant/AllOrdersPage"))
const RestaurantNotifications = lazy(() => import("@food/pages/restaurant/Notifications"))
const OrderDetails = lazy(() => import("@food/pages/restaurant/OrderDetails"))
const OrdersMain = lazy(() => import("@food/pages/restaurant/OrdersMain"))
const RestaurantOnboarding = lazy(() => import("@food/pages/restaurant/Onboarding"))
const CouponListPage = lazy(() => import("@food/pages/restaurant/CouponListPage"))
const AddCouponPage = lazy(() => import("@food/pages/restaurant/AddCouponPage"))
const EditCouponPage = lazy(() => import("@food/pages/restaurant/EditCouponPage"))
const PrivacyPolicyPage = lazy(() => import("@food/pages/restaurant/PrivacyPolicyPage"))
const TermsAndConditionsPage = lazy(() => import("@food/pages/restaurant/TermsAndConditionsPage"))
const MenuCategoriesPage = lazy(() => import("@food/pages/restaurant/MenuCategoriesPage"))
const RestaurantStatus = lazy(() => import("@food/pages/restaurant/RestaurantStatus"))
const ExploreMore = lazy(() => import("@food/pages/restaurant/ExploreMore"))
const DeliverySettings = lazy(() => import("@food/pages/restaurant/DeliverySettings"))
const DeliveryBoyManagement = lazy(() => import("@food/pages/restaurant/DeliveryBoyManagement"))
const RushHour = lazy(() => import("@food/pages/restaurant/RushHour"))
const OutletTimings = lazy(() => import("@food/pages/restaurant/OutletTimings"))
const DaySlots = lazy(() => import("@food/pages/restaurant/DaySlots"))
const OutletInfo = lazy(() => import("@food/pages/restaurant/OutletInfo"))
const RatingsReviews = lazy(() => import("@food/pages/restaurant/RatingsReviews"))
const EditOwner = lazy(() => import("@food/pages/restaurant/EditOwner"))
const EditCuisines = lazy(() => import("@food/pages/restaurant/EditCuisines"))
const EditRestaurantAddress = lazy(() => import("@food/pages/restaurant/EditRestaurantAddress"))
const Inventory = lazy(() => import("@food/pages/restaurant/Inventory"))
const Feedback = lazy(() => import("@food/pages/restaurant/Feedback"))
const ShareFeedback = lazy(() => import("@food/pages/restaurant/ShareFeedback"))
const DishRatings = lazy(() => import("@food/pages/restaurant/DishRatings"))
const RestaurantSupport = lazy(() => import("@food/pages/restaurant/RestaurantSupport"))
const FssaiDetails = lazy(() => import("@food/pages/restaurant/FssaiDetails"))
const FssaiUpdate = lazy(() => import("@food/pages/restaurant/FssaiUpdate"))
const Hyperpure = lazy(() => import("@food/pages/restaurant/Hyperpure"))
const ItemDetailsPage = lazy(() => import("@food/pages/restaurant/ItemDetailsPage"))
const HubFinance = lazy(() => import("@food/pages/restaurant/HubFinance"))
const FinanceDetailsPage = lazy(() => import("@food/pages/restaurant/FinanceDetailsPage"))
const WithdrawalHistoryPage = lazy(() => import("@food/pages/restaurant/WithdrawalHistoryPage"))
const PhoneNumbersPage = lazy(() => import("@food/pages/restaurant/PhoneNumbersPage"))
const DownloadReport = lazy(() => import("@food/pages/restaurant/DownloadReport"))

const ManageOutlets = lazy(() => import("@food/pages/restaurant/ManageOutlets"))
const UpdateBankDetails = lazy(() => import("@food/pages/restaurant/UpdateBankDetails"))
const ZoneSetup = lazy(() => import("@food/pages/restaurant/ZoneSetup"))
const DiningReservations = lazy(() => import("@food/pages/restaurant/DiningReservations"))
const DineInTableManagement = lazy(() => import("@food/pages/restaurant/DineInTableManagement"))
const DineInOrders = lazy(() => import("@food/pages/restaurant/DineInOrders"))
const OfferListPage = lazy(() => import("@food/pages/restaurant/OfferListPage"))
const OfferFormPage = lazy(() => import("@food/pages/restaurant/OfferFormPage"))
const DiningOfferListPage = lazy(() => import("@food/pages/restaurant/DiningOfferListPage"))
const DiningOfferFormPage = lazy(() => import("@food/pages/restaurant/DiningOfferFormPage"))
const Welcome = lazy(() => import("@food/pages/restaurant/auth/Welcome"))
const Login = lazy(() => import("@food/pages/restaurant/auth/Login"))
const OTP = lazy(() => import("@food/pages/restaurant/auth/OTP"))
const Signup = lazy(() => import("@food/pages/restaurant/auth/Signup"))
const ForgotPassword = lazy(() => import("@food/pages/restaurant/auth/ForgotPassword"))
const VerificationPending = lazy(() => import("@food/pages/restaurant/auth/VerificationPending"))
const SupportPublic = lazy(() => import("@food/pages/user/SupportPublic"))

function RestaurantApprovedRoute({ children }) {
  const restaurant = getCurrentUser("restaurant")
  const status = String(restaurant?.status || "").toLowerCase()

  if (status === "rejected") {
    return <Navigate to="/food/restaurant/onboarding?step=1" replace />
  }

  if (status === "pending") {
    return <Navigate to="/food/restaurant/pending-verification" replace />
  }

  return children
}

const restaurantRoute = (element) => (
  <ProtectedRoute requiredRole="restaurant" loginPath="/food/restaurant/login">
    <RestaurantApprovedRoute>{element}</RestaurantApprovedRoute>
  </ProtectedRoute>
)

export default function RestaurantRouter() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  if (isOffline) {
    return <OfflineScreen onRetry={() => setIsOffline(false)} />
  }

  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        {/* Auth Routes */}
        <Route path="welcome" element={<Welcome />} />
        <Route path="login" element={<Login />} />
        <Route path="otp" element={<OTP />} />
        <Route path="signup" element={<Signup />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="pending-verification" element={<VerificationPending />} />
        <Route path="support" element={<SupportPublic />} />

        {/* Protected Routes */}
        <Route element={restaurantRoute(<OrdersMain />)} path="" />
        <Route path="onboarding" element={<RestaurantOnboarding />} />
        <Route element={restaurantRoute(<RestaurantNotifications />)} path="notifications" />
        <Route element={restaurantRoute(<AllOrdersPage />)} path="orders/all" />
        <Route element={restaurantRoute(<OrderDetails />)} path="orders/:orderId" />
        <Route element={restaurantRoute(<CouponListPage />)} path="coupons" />
        <Route element={restaurantRoute(<AddCouponPage />)} path="coupons/new" />
        <Route element={restaurantRoute(<EditCouponPage />)} path="coupons/:id/edit" />
        <Route element={restaurantRoute(<CouponListPage />)} path="coupon" />
        <Route element={restaurantRoute(<AddCouponPage />)} path="coupon/new" />
        <Route element={restaurantRoute(<EditCouponPage />)} path="coupon/:id/edit" />
        <Route element={restaurantRoute(<DeliverySettings />)} path="delivery-settings" />
        <Route element={restaurantRoute(<DeliveryBoyManagement />)} path="delivery-boys" />
        <Route element={restaurantRoute(<RushHour />)} path="rush-hour" />
        <Route path="privacy" element={<PrivacyPolicyPage />} />
        <Route path="terms" element={<TermsAndConditionsPage />} />
        <Route element={restaurantRoute(<MenuCategoriesPage />)} path="menu-categories" />
        <Route element={restaurantRoute(<RestaurantStatus />)} path="status" />
        <Route element={restaurantRoute(<ExploreMore />)} path="explore" />
        <Route element={restaurantRoute(<OutletTimings />)} path="outlet-timings" />
        <Route element={restaurantRoute(<DaySlots />)} path="outlet-timings/:day" />
        <Route element={restaurantRoute(<OutletInfo />)} path="outlet-info" />
        <Route element={restaurantRoute(<RatingsReviews />)} path="ratings-reviews" />
        <Route element={restaurantRoute(<EditOwner />)} path="edit-owner" />
        <Route element={restaurantRoute(<EditCuisines />)} path="edit-cuisines" />
        <Route element={restaurantRoute(<EditRestaurantAddress />)} path="edit-address" />
        <Route element={restaurantRoute(<Inventory />)} path="inventory" />
        <Route element={restaurantRoute(<Feedback />)} path="feedback" />
        <Route element={restaurantRoute(<ShareFeedback />)} path="share-feedback" />
        <Route element={restaurantRoute(<DishRatings />)} path="dish-ratings" />
        <Route element={restaurantRoute(<RestaurantSupport />)} path="help-centre/support" />
        <Route element={restaurantRoute(<FssaiDetails />)} path="fssai" />
        <Route element={restaurantRoute(<FssaiUpdate />)} path="fssai/update" />
        <Route element={restaurantRoute(<Hyperpure />)} path="hyperpure" />
        <Route element={restaurantRoute(<ItemDetailsPage />)} path="hub-menu/item/:id" />
        <Route element={restaurantRoute(<HubFinance />)} path="hub-finance" />
        <Route element={restaurantRoute(<WithdrawalHistoryPage />)} path="withdrawal-history" />
        <Route element={restaurantRoute(<FinanceDetailsPage />)} path="finance-details" />
        <Route element={restaurantRoute(<PhoneNumbersPage />)} path="phone" />
        <Route element={restaurantRoute(<DownloadReport />)} path="download-report" />
        <Route element={restaurantRoute(<ManageOutlets />)} path="manage-outlets" />
        <Route element={restaurantRoute(<UpdateBankDetails />)} path="update-bank-details" />
        <Route element={restaurantRoute(<DiningReservations />)} path="reservations" />
        <Route element={restaurantRoute(<DineInTableManagement />)} path="dine-in/tables" />
        <Route element={restaurantRoute(<DineInOrders />)} path="dine-in/orders" />
        <Route element={restaurantRoute(<ZoneSetup />)} path="zone-setup" />
        <Route element={restaurantRoute(<OfferListPage />)} path="offers" />
        <Route element={restaurantRoute(<OfferFormPage mode="create" />)} path="offers/new" />
        <Route element={restaurantRoute(<OfferFormPage mode="edit" />)} path="offers/:id/edit" />
        <Route element={restaurantRoute(<DiningOfferListPage />)} path="dining-offers" />
        <Route element={restaurantRoute(<DiningOfferFormPage mode="create" />)} path="dining-offers/new" />
        <Route element={restaurantRoute(<DiningOfferFormPage mode="edit" />)} path="dining-offers/:id/edit" />
        <Route path="*" element={<Navigate to="/food/restaurant" replace />} />
      </Routes>
    </Suspense>
  )
}
