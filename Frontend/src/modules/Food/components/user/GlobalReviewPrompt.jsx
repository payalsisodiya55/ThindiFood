import { useEffect, useMemo, useRef, useState } from "react"
import { Star, X, Loader2 } from "lucide-react"
import { dineInAPI, orderAPI } from "@food/api"
import { RED } from "@food/constants/color"
import { toast } from "sonner"

const debugError = (...args) => {}

const ORDER_REVIEW_STORAGE_KEY = "shownRatingForOrders"
const DINING_REVIEW_STORAGE_KEY = "shownDiningReviewSessions"
const DINING_REVIEW_PENDING_STORAGE_KEY = "pendingDiningReviewSessions"
const ORDER_REVIEW_RECENT_WINDOW_MS = 6 * 60 * 60 * 1000

const normalizeStatus = (value) =>
  String(value || "").trim().toLowerCase().replace(/\s+/g, "_")

const isDeliveryOrder = (order) =>
  String(order?.fulfillmentType || order?.orderType || "delivery").toLowerCase() === "delivery"

const isTakeawayOrder = (order) =>
  String(order?.fulfillmentType || order?.orderType || "").toLowerCase() === "takeaway"

const isDeliveredDeliveryOrder = (order) => {
  if (!isDeliveryOrder(order)) return false

  const status = normalizeStatus(order?.status || order?.orderStatus || order?.originalStatus)
  const deliveryStateStatus = normalizeStatus(order?.deliveryState?.status)
  const deliveryPhase = normalizeStatus(order?.deliveryState?.currentPhase)
  const dropOtpVerified = Boolean(order?.deliveryVerification?.dropOtp?.verified)

  return (
    ["delivered", "completed", "delivered_self"].includes(status) ||
    ["delivered", "completed"].includes(deliveryStateStatus) ||
    ["delivered", "completed"].includes(deliveryPhase) ||
    Boolean(order?.deliveredAt || order?.completedAt || order?.deliveryState?.deliveredAt) ||
    dropOtpVerified
  )
}

const isCompletedOrder = (order) => {
  const normalizedStatus = normalizeStatus(
    order?.status || order?.orderStatus || order?.originalStatus,
  )

  if (isDeliveredDeliveryOrder(order)) return true

  if (["delivered", "completed", "delivered_self"].includes(normalizedStatus)) {
    return true
  }

  if (isTakeawayOrder(order) && normalizedStatus === "picked_up") {
    return true
  }

  return (
    Boolean(order?.deliveredAt || order?.completedAt || order?.deliveryState?.deliveredAt)
  )
}

const parseDateMs = (value) => {
  const timestamp = value ? new Date(value).getTime() : NaN
  return Number.isFinite(timestamp) ? timestamp : null
}

const getOrderCompletionTimestamp = (order) => {
  const directTimestamp =
    parseDateMs(order?.deliveredAt) ||
    parseDateMs(order?.completedAt) ||
    parseDateMs(order?.deliveryState?.deliveredAt) ||
    parseDateMs(order?.selfDelivery?.deliveredAt) ||
    parseDateMs(order?.tracking?.delivered?.timestamp) ||
    parseDateMs(order?.tracking?.completed?.timestamp)

  if (directTimestamp) return directTimestamp

  const completedStatuses = new Set(["delivered", "completed", "delivered_self", "picked_up"])
  const statusHistory = Array.isArray(order?.statusHistory) ? [...order.statusHistory].reverse() : []
  const completedHistory = statusHistory.find((entry) => {
    const toStatus = normalizeStatus(entry?.to || entry?.status || entry?.orderStatus)
    return completedStatuses.has(toStatus)
  })

  return (
    parseDateMs(completedHistory?.timestamp) ||
    parseDateMs(completedHistory?.createdAt) ||
    parseDateMs(completedHistory?.updatedAt) ||
    parseDateMs(completedHistory?.date) ||
    parseDateMs(completedHistory?.at) ||
    parseDateMs(order?.updatedAt)
  )
}

const isRecentlyCompletedOrder = (order) => {
  const completedAt = getOrderCompletionTimestamp(order)
  if (!completedAt) return false

  const ageMs = Date.now() - completedAt
  return ageMs >= 0 && ageMs <= ORDER_REVIEW_RECENT_WINDOW_MS
}

const readStoredSet = (key) => {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

const writeStoredSet = (key, valueSet) => {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(valueSet)))
  } catch {
    // ignore storage write failures
  }
}

const getDiningReviewSessionCandidates = () => {
  if (typeof window === "undefined") return []

  const sessionIds = new Set()
  const activeSessionId = String(window.localStorage.getItem("activeDineInSessionId") || "").trim()
  if (activeSessionId) sessionIds.add(activeSessionId)

  try {
    const pendingIds = JSON.parse(window.localStorage.getItem(DINING_REVIEW_PENDING_STORAGE_KEY) || "[]")
    if (Array.isArray(pendingIds)) {
      pendingIds.forEach((sessionId) => {
        const normalized = String(sessionId || "").trim()
        if (normalized) sessionIds.add(normalized)
      })
    }
  } catch {
    // ignore invalid storage data
  }

  return Array.from(sessionIds)
}

const removePendingDiningReviewSession = (sessionId) => {
  if (typeof window === "undefined") return
  const sessionKey = String(sessionId || "").trim()
  if (!sessionKey) return

  try {
    const pendingIds = JSON.parse(window.localStorage.getItem(DINING_REVIEW_PENDING_STORAGE_KEY) || "[]")
    const nextPendingIds = Array.isArray(pendingIds)
      ? pendingIds.filter((id) => String(id || "").trim() !== sessionKey)
      : []
    window.localStorage.setItem(DINING_REVIEW_PENDING_STORAGE_KEY, JSON.stringify(nextPendingIds))
  } catch {
    // ignore storage write failures
  }
}

const collectOrderPromptKeys = (order) =>
  [
    order?._id,
    order?.id,
    order?.orderId,
    order?.mongoId,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)

const markOrderPromptHandled = (storeRef, order) => {
  const keys = collectOrderPromptKeys(order)
  if (keys.length === 0) return

  storeRef.current = new Set([...storeRef.current, ...keys])
  writeStoredSet(ORDER_REVIEW_STORAGE_KEY, storeRef.current)
}

const hasSeenOrderPrompt = (storeRef, order) =>
  collectOrderPromptKeys(order).some((key) => storeRef.current.has(key))

const shouldCheckOrderReviewsOnCurrentRoute = () => {
  if (typeof window === "undefined") return false

  const currentPath = String(window.location.pathname || "").toLowerCase()
  const currentSearch = new URLSearchParams(window.location.search || "")
  if (!currentPath) return false

  if (currentSearch.get("confirmed") === "true") return false

  if (
    currentPath.includes("/auth") ||
    currentPath.includes("address-selector") ||
    currentPath.includes("/cart") ||
    currentPath.includes("/checkout")
  ) {
    return false
  }

  return true
}

const buildOrderReviewPrompt = (order) => {
  const id =
    order?._id?.toString?.() ||
    order?.id ||
    order?.orderId ||
    order?.mongoId

  return {
    _id: order?._id,
    id,
    orderId: order?.orderId,
    mongoId: order?.mongoId,
    restaurant:
      order?.restaurantId?.restaurantName ||
      order?.restaurantId?.name ||
      order?.restaurantName ||
      "Restaurant",
    restaurantRating: order?.ratings?.restaurant?.rating || null,
    ratings: order?.ratings || {},
  }
}

export default function GlobalReviewPrompt() {
  const [orderReviewState, setOrderReviewState] = useState({
    open: false,
    order: null,
    rating: null,
    feedback: "",
    submitting: false,
  })
  const [diningReviewState, setDiningReviewState] = useState({
    open: false,
    sessionId: null,
    restaurantName: "",
    rating: null,
    feedback: "",
    submitting: false,
  })
  const shownOrderRatingsRef = useRef(readStoredSet(ORDER_REVIEW_STORAGE_KEY))
  const shownDiningRatingsRef = useRef(readStoredSet(DINING_REVIEW_STORAGE_KEY))
  const mountedRef = useRef(true)
  const reviewCheckTimeoutRef = useRef(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (reviewCheckTimeoutRef.current) {
        window.clearTimeout(reviewCheckTimeoutRef.current)
      }
    }
  }, [])

  const activeModalType = orderReviewState.open
    ? "order"
    : diningReviewState.open
      ? "dining"
      : null

  const scheduleOpenOrderReview = (order) => {
    if (collectOrderPromptKeys(order).length === 0) return
    markOrderPromptHandled(shownOrderRatingsRef, order)

    if (reviewCheckTimeoutRef.current) {
      window.clearTimeout(reviewCheckTimeoutRef.current)
    }

    reviewCheckTimeoutRef.current = window.setTimeout(() => {
      if (!mountedRef.current) return
      if (!shouldCheckOrderReviewsOnCurrentRoute()) return
      setOrderReviewState({
        open: true,
        order,
        rating: null,
        feedback: "",
        submitting: false,
      })
    }, 500)
  }

  const scheduleOpenDiningReview = ({ sessionId, restaurantName }) => {
    const sessionKey = String(sessionId || "").trim()
    if (!sessionKey) return

    shownDiningRatingsRef.current = new Set([...shownDiningRatingsRef.current, sessionKey])
    writeStoredSet(DINING_REVIEW_STORAGE_KEY, shownDiningRatingsRef.current)
    removePendingDiningReviewSession(sessionKey)

    if (reviewCheckTimeoutRef.current) {
      window.clearTimeout(reviewCheckTimeoutRef.current)
    }

    reviewCheckTimeoutRef.current = window.setTimeout(() => {
      if (!mountedRef.current) return
      setDiningReviewState({
        open: true,
        sessionId: sessionKey,
        restaurantName: restaurantName || "Restaurant",
        rating: null,
        feedback: "",
        submitting: false,
      })
    }, 500)
  }

  useEffect(() => {
    const checkPendingReviews = async () => {
      if (orderReviewState.open || diningReviewState.open) return

      // Don't show dining review popup while user is on the dine-in bill page
      // (let them see the Payment Successful screen first)
      const currentPath = window.location.pathname || ""
      if (currentPath.includes("dine-in/bill")) return

      try {
        const diningSessionIds = getDiningReviewSessionCandidates()
        for (const sessionId of diningSessionIds) {
          if (shownDiningRatingsRef.current.has(sessionId)) {
            removePendingDiningReviewSession(sessionId)
            continue
          }

          try {
            const sessionResponse = await dineInAPI.getSessionBill(sessionId)
            const sessionData = sessionResponse?.data?.data || {}
            const hasDiningReview = sessionData?.review?.rating != null && Number.isFinite(Number(sessionData.review.rating)) && Number(sessionData.review.rating) >= 1
            const isDiningCompleted =
              sessionData?.isPaid === true &&
              String(sessionData?.status || "").toLowerCase() === "completed"

            if (isDiningCompleted && !hasDiningReview) {
              scheduleOpenDiningReview({
                sessionId,
                restaurantName: sessionData?.restaurant?.name || sessionData?.restaurant?.restaurantName || "Restaurant",
              })
              return
            }

            if (isDiningCompleted && typeof window !== "undefined") {
              removePendingDiningReviewSession(sessionId)
              if (window.localStorage.getItem("activeDineInSessionId") === sessionId) {
                window.localStorage.removeItem("activeDineInSessionId")
              }
            }
          } catch {
            // silent for global poll
          }
        }

        const ordersResponse = await orderAPI.getOrders({ page: 1, limit: 20 })
        const orders =
          ordersResponse?.data?.data?.orders ||
          ordersResponse?.data?.orders ||
          (Array.isArray(ordersResponse?.data?.data) ? ordersResponse.data.data : [])

        if (!shouldCheckOrderReviewsOnCurrentRoute()) return

        const pendingOrderReview = (Array.isArray(orders) ? orders : []).find((order) => {
          if (collectOrderPromptKeys(order).length === 0 || hasSeenOrderPrompt(shownOrderRatingsRef, order)) {
            return false
          }

          const hasRestaurantRating = Number.isFinite(Number(order?.ratings?.restaurant?.rating))
          return isCompletedOrder(order) && isRecentlyCompletedOrder(order) && !hasRestaurantRating
        })

        if (!pendingOrderReview) return

        scheduleOpenOrderReview(buildOrderReviewPrompt(pendingOrderReview))
      } catch (error) {
        debugError("Global review check failed:", error)
      }
    }

    checkPendingReviews()
    const intervalId = window.setInterval(checkPendingReviews, 8000)
    return () => window.clearInterval(intervalId)
  }, [diningReviewState.open, orderReviewState.open])

  const closeOrderReview = () => {
    if (orderReviewState.order) {
      markOrderPromptHandled(shownOrderRatingsRef, orderReviewState.order)
    }
    setOrderReviewState({
      open: false,
      order: null,
      rating: null,
      feedback: "",
      submitting: false,
    })
  }

  const closeDiningReview = () => {
    if (diningReviewState.sessionId) {
      shownDiningRatingsRef.current = new Set([
        ...shownDiningRatingsRef.current,
        String(diningReviewState.sessionId || "").trim(),
      ])
      writeStoredSet(DINING_REVIEW_STORAGE_KEY, shownDiningRatingsRef.current)
      removePendingDiningReviewSession(diningReviewState.sessionId)
    }
    setDiningReviewState({
      open: false,
      sessionId: null,
      restaurantName: "",
      rating: null,
      feedback: "",
      submitting: false,
    })
  }

  const handleSubmitOrderReview = async () => {
    if (!orderReviewState.order || orderReviewState.rating === null) {
      toast.error("Please select required rating first")
      return
    }

    try {
      setOrderReviewState((prev) => ({ ...prev, submitting: true }))
      await orderAPI.submitOrderRatings(orderReviewState.order.id, {
        restaurantRating: orderReviewState.rating,
        restaurantComment: orderReviewState.feedback || undefined,
      })
      toast.success("Thanks for rating your order!")
      closeOrderReview()
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
        "Failed to submit ratings. Please try again.",
      )
      setOrderReviewState((prev) => ({ ...prev, submitting: false }))
    }
  }

  const handleSubmitDiningReview = async () => {
    if (!diningReviewState.sessionId || diningReviewState.rating === null) {
      toast.error("Please select rating first")
      return
    }

    try {
      setDiningReviewState((prev) => ({ ...prev, submitting: true }))
      await dineInAPI.submitSessionReview(diningReviewState.sessionId, {
        rating: diningReviewState.rating,
        comment: diningReviewState.feedback || undefined,
      })
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("activeDineInSessionId")
      }
      removePendingDiningReviewSession(diningReviewState.sessionId)
      toast.success("Thanks for rating your dining experience!")
      closeDiningReview()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to submit dining review")
      setDiningReviewState((prev) => ({ ...prev, submitting: false }))
    }
  }

  const orderSubmitDisabled = orderReviewState.rating === null || orderReviewState.submitting
  const diningSubmitDisabled = diningReviewState.rating === null || diningReviewState.submitting

  const stars = useMemo(() => Array.from({ length: 5 }, (_, i) => i + 1), [])

  if (!activeModalType) return null

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-[#1a1a1a]">
        <div
          style={{ background: `linear-gradient(to right, ${RED}, #00b06f)` }}
          className="px-6 py-5"
        >
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-xl font-bold text-white">
              <Star className="h-5 w-5 fill-white" />
              {activeModalType === "order" ? "Rate Your Restaurant" : "Rate Your Dining"}
            </h2>
            <button
              type="button"
              onClick={activeModalType === "order" ? closeOrderReview : closeDiningReview}
              className="rounded-full p-1 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="text-sm text-white/90">
            {activeModalType === "order"
              ? orderReviewState.order?.restaurant || "Restaurant"
              : diningReviewState.restaurantName || "Restaurant"}
          </p>
        </div>

        <div className="px-6 py-6">
          <p className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
            {activeModalType === "order" ? "Restaurant rating (out of 5)" : "Dining rating (out of 5)"}
          </p>

          <div className="mb-4 flex items-center justify-center gap-2">
            {stars.map((num) => {
              const selectedValue =
                activeModalType === "order" ? orderReviewState.rating : diningReviewState.rating
              const isActive = (selectedValue || 0) >= num
              return (
                <button
                  key={`${activeModalType}-${num}`}
                  type="button"
                  onClick={() => {
                    if (activeModalType === "order") {
                      setOrderReviewState((prev) => ({ ...prev, rating: num }))
                    } else {
                      setDiningReviewState((prev) => ({ ...prev, rating: num }))
                    }
                  }}
                  className="p-2 transition-transform hover:scale-125 active:scale-95"
                >
                  <Star
                    className={`h-10 w-10 transition-all ${
                      isActive
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-gray-300 dark:text-gray-600"
                    }`}
                  />
                </button>
              )
            })}
          </div>

          <textarea
            rows={3}
            value={activeModalType === "order" ? orderReviewState.feedback : diningReviewState.feedback}
            onChange={(event) => {
              const value = event.target.value
              if (activeModalType === "order") {
                setOrderReviewState((prev) => ({ ...prev, feedback: value }))
              } else {
                setDiningReviewState((prev) => ({ ...prev, feedback: value }))
              }
            }}
            className="w-full resize-none rounded-xl border-2 border-gray-200 bg-transparent px-4 py-3 text-sm text-gray-800 outline-none transition-all focus:border-[#00c87e] focus:ring-2 focus:ring-[#00c87e]/20 dark:border-gray-800 dark:bg-[#0a0a0a] dark:text-gray-200"
            placeholder={activeModalType === "order" ? "Restaurant feedback (optional)" : "Dining feedback (optional)"}
          />

          <button
            type="button"
            disabled={activeModalType === "order" ? orderSubmitDisabled : diningSubmitDisabled}
            onClick={activeModalType === "order" ? handleSubmitOrderReview : handleSubmitDiningReview}
            style={{ background: `linear-gradient(to right, ${RED}, #00b06f)` }}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {(activeModalType === "order" ? orderReviewState.submitting : diningReviewState.submitting) ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Star className="h-5 w-5 fill-white" />
                {activeModalType === "order" ? "Submit Ratings" : "Submit Dining Rating"}
              </>
            )}
          </button>

          {(activeModalType === "order" ? orderSubmitDisabled : diningSubmitDisabled) && (
            <p className="mt-2 text-center text-xs font-medium text-[#00c87e]">
              Please select required rating to continue
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
