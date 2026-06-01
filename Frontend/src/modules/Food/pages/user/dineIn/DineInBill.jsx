import React, { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
    ChevronLeft, Receipt, CreditCard, ChevronRight, 
    CheckCircle2, Loader2, AlertCircle, Clock, Wallet,
    MapPin, ShieldCheck, Bell, Star, X
} from "lucide-react";
import { Button } from "@food/components/ui/button";
import { authAPI, dineInAPI } from "@food/api";
import AnimatedPage from "@food/components/user/AnimatedPage";
import { toast } from "sonner";
import { initRazorpayPayment } from "@food/utils/razorpay";
import { getCompanyNameAsync } from "@food/utils/businessSettings";

const RUPEE_SYMBOL = "\u20B9";
const DINING_REVIEW_STORAGE_KEY = "shownDiningReviewSessions";
const DINING_REVIEW_PENDING_STORAGE_KEY = "pendingDiningReviewSessions";

// Counter payment timeout in milliseconds (15 minutes)
const COUNTER_PAYMENT_TIMEOUT_MS = 15 * 60 * 1000;

const readStoredList = (key) => {
    try {
        const value = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(value) ? value : [];
    } catch {
        return [];
    }
};

const rememberPendingDiningReview = (sessionId) => {
    const sessionKey = String(sessionId || "").trim();
    if (!sessionKey) return;

    try {
        const pending = new Set(readStoredList(DINING_REVIEW_PENDING_STORAGE_KEY).map((id) => String(id || "").trim()).filter(Boolean));
        pending.add(sessionKey);
        localStorage.setItem(DINING_REVIEW_PENDING_STORAGE_KEY, JSON.stringify(Array.from(pending)));
    } catch {
        // ignore storage failures
    }
};

const removePendingDiningReview = (sessionId) => {
    const sessionKey = String(sessionId || "").trim();
    if (!sessionKey) return;

    try {
        const pending = readStoredList(DINING_REVIEW_PENDING_STORAGE_KEY)
            .filter((id) => String(id || "").trim() !== sessionKey);
        localStorage.setItem(DINING_REVIEW_PENDING_STORAGE_KEY, JSON.stringify(pending));
    } catch {
        // ignore storage failures
    }
};

const markDiningReviewPromptShown = (sessionId) => {
    const sessionKey = String(sessionId || "").trim();
    if (!sessionKey) return;

    try {
        const shown = new Set(readStoredList(DINING_REVIEW_STORAGE_KEY).map((id) => String(id || "").trim()).filter(Boolean));
        shown.add(sessionKey);
        localStorage.setItem(DINING_REVIEW_STORAGE_KEY, JSON.stringify(Array.from(shown)));
        removePendingDiningReview(sessionKey);
    } catch {
        // ignore storage failures
    }
};

const hasDiningReviewPromptShown = (sessionId) => {
    const sessionKey = String(sessionId || "").trim();
    if (!sessionKey) return false;

    return readStoredList(DINING_REVIEW_STORAGE_KEY)
        .some((id) => String(id || "").trim() === sessionKey);
};

const DineInBill = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const sessionId = searchParams.get("sessionId");

    const [loading, setLoading] = useState(true);
    const [paying, setPaying] = useState(false);
    const [billData, setBillData] = useState(null);
    const [error, setError] = useState(null);
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [selectedDiningRating, setSelectedDiningRating] = useState(null);
    const [diningFeedbackText, setDiningFeedbackText] = useState("");
    const [submittingReview, setSubmittingReview] = useState(false);

    // Pay at Counter states
    const [counterPaymentRequested, setCounterPaymentRequested] = useState(false);
    const [counterPaymentCompleted, setCounterPaymentCompleted] = useState(false);
    const [timeoutRemaining, setTimeoutRemaining] = useState(null); // seconds
    const counterRequestedAtRef = useRef(null);
    const pollIntervalRef = useRef(null);
    const countdownIntervalRef = useRef(null);

    useEffect(() => {
        if (!sessionId) {
            navigate("/food/user/dining");
            return;
        }
        fetchBill();
    }, [sessionId]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            clearInterval(pollIntervalRef.current);
            clearInterval(countdownIntervalRef.current);
        };
    }, []);

    const fetchBill = async ({ openReview = false, showSuccessState = false } = {}) => {
        try {
            setLoading(true);
            const res = await dineInAPI.getSessionBill(sessionId);
            if (res.data?.success) {
                const data = res.data.data;
                setBillData(data);
                if (showSuccessState) {
                    setCounterPaymentRequested(false);
                }

                const hasReview = data?.review?.rating != null && Number.isFinite(Number(data.review.rating)) && Number(data.review.rating) >= 1;
                const isPaidAndCompleted =
                    data?.isPaid === true &&
                    String(data?.status || "").toLowerCase() === "completed";
                const shouldRequestReview = isPaidAndCompleted && !hasReview;
                // Always defer the rating popup to GlobalReviewPrompt so the
                // Payment Successful screen can be seen first without interruption.
                if (shouldRequestReview && !hasDiningReviewPromptShown(sessionId)) {
                    rememberPendingDiningReview(sessionId);
                }

                // Restore state if counter payment was already requested
                const sessionData = res.data.data?.session || res.data.data;
                if (sessionData?.paymentMode === "COUNTER" && sessionData?.paymentStatus === "PENDING") {
                    setCounterPaymentRequested(true);
                    startPollingForPaymentCompletion();
                    startCountdown();
                } else if (sessionData?.paymentStatus === "PAID") {
                    setCounterPaymentCompleted(true);
                }
            } else {
                throw new Error(res.data?.message || "Failed to fetch bill");
            }
        } catch (err) {
            const statusCode = err?.response?.status;
            const message = err?.response?.data?.message || err.message || "Failed to fetch bill";
            if (statusCode === 400 || statusCode === 404) {
                localStorage.removeItem("activeDineInSessionId");
                clearInterval(pollIntervalRef.current);
                clearInterval(countdownIntervalRef.current);
            }
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    // ─── Online Payment ──────────────────────────────────────────────────────
    const handleOnlinePayment = async () => {
        if (counterPaymentRequested) {
            toast.error("You have already selected Pay at Counter. Please proceed to the cash counter.");
            return;
        }
        try {
            setPaying(true);
            const res = await dineInAPI.initiateOnlinePayment(sessionId);
            const payload = res?.data?.data || {};
            const razorpay = payload?.razorpay;

            if (!razorpay?.orderId || !razorpay?.key) {
                throw new Error("Failed to initialize online payment");
            }

            let userName = "";
            let userEmail = "";
            let formattedPhone = "";
            try {
                const me = await authAPI.getCurrentUser();
                const user = me?.data?.data?.user || me?.data?.user || me?.data?.data || {};
                userName = String(user?.name || "").trim();
                userEmail = String(user?.email || "").trim();
                formattedPhone = String(user?.phone || "").replace(/\D/g, "").slice(-10);
            } catch {
                // non-blocking
            }

            const companyName = await getCompanyNameAsync();

            await initRazorpayPayment({
                key: razorpay.key,
                amount: razorpay.amount,
                currency: razorpay.currency || "INR",
                order_id: razorpay.orderId,
                name: companyName,
                description: `Dining session ${sessionId} - ${RUPEE_SYMBOL}${(Number(razorpay.amount || 0) / 100).toFixed(2)}`,
                prefill: {
                    name: userName,
                    email: userEmail,
                    contact: formattedPhone,
                },
                notes: {
                    sessionId,
                    module: "dine-in",
                },
                handler: async (response) => {
                    try {
                        const verifyRes = await dineInAPI.verifyOnlinePayment(sessionId, {
                            razorpayOrderId: response.razorpay_order_id,
                            razorpayPaymentId: response.razorpay_payment_id,
                            razorpaySignature: response.razorpay_signature,
                        });

                        if (verifyRes?.data?.success) {
                            toast.success("Payment successful!");
                            rememberPendingDiningReview(sessionId);
                            localStorage.removeItem("activeDineInSessionId");
                            await fetchBill({ showSuccessState: true });
                            return;
                        }
                        throw new Error(verifyRes?.data?.message || "Payment verification failed");
                    } catch (error) {
                        toast.error(error?.response?.data?.message || error?.message || "Payment verification failed");
                    } finally {
                        setPaying(false);
                    }
                },
                onError: (error) => {
                    toast.error(error?.description || error?.message || "Online payment failed");
                    setPaying(false);
                },
                onClose: () => {
                    setPaying(false);
                },
            });
        } catch (err) {
            toast.error(err?.response?.data?.message || err?.message || "Payment integration currently being finalized.");
            setPaying(false);
        }
    };

    // ─── Pay at Counter ──────────────────────────────────────────────────────
    const handlePayAtCounter = async () => {
        if (counterPaymentRequested) return;
        try {
            setPaying(true);
            const res = await dineInAPI.requestCounterPayment(sessionId);
            if (res?.data?.success) {
                setCounterPaymentRequested(true);
                counterRequestedAtRef.current = Date.now();
                toast.success("Restaurant notified! Please proceed to the counter.");
                startPollingForPaymentCompletion();
                startCountdown();
            } else {
                toast.error("Failed to notify restaurant. Please try again.");
            }
        } catch (err) {
            console.error("requestCounterPayment error:", err?.response?.status, err?.response?.data);
            toast.error(err?.response?.data?.message || "Could not reach server. Please try again.");
        } finally {
            setPaying(false);
        }
    };

    // ─── Poll for payment completion ─────────────────────────────────────────
    const startPollingForPaymentCompletion = () => {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = setInterval(async () => {
            try {
                const res = await dineInAPI.getSessionBill(sessionId);
                const sessionData = res.data?.data?.session || res.data?.data;
                if (
                    sessionData?.paymentStatus === "PAID" ||
                    String(sessionData?.status || "").toLowerCase() === "completed" ||
                    sessionData?.isPaid === true
                ) {
                    clearInterval(pollIntervalRef.current);
                    clearInterval(countdownIntervalRef.current);
                    setCounterPaymentCompleted(true);
                    toast.success("Payment confirmed! Thank you for dining with us. 🎉");
                    rememberPendingDiningReview(sessionId);
                    localStorage.removeItem("activeDineInSessionId");
                    await fetchBill({ showSuccessState: true });
                }
            } catch (err) {
                const statusCode = err?.response?.status;
                if (statusCode === 400 || statusCode === 404) {
                    localStorage.removeItem("activeDineInSessionId");
                    clearInterval(pollIntervalRef.current);
                    clearInterval(countdownIntervalRef.current);
                    setError(err?.response?.data?.message || "Session not found");
                }
            }
        }, 8000); // Poll every 8 seconds
    };

    // ─── Countdown timer (15 min) ────────────────────────────────────────────
    const startCountdown = () => {
        counterRequestedAtRef.current = counterRequestedAtRef.current || Date.now();
        setTimeoutRemaining(COUNTER_PAYMENT_TIMEOUT_MS / 1000);

        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = setInterval(() => {
            const elapsed = Date.now() - counterRequestedAtRef.current;
            const remaining = Math.max(0, Math.floor((COUNTER_PAYMENT_TIMEOUT_MS - elapsed) / 1000));
            setTimeoutRemaining(remaining);

            if (remaining === 0) {
                clearInterval(countdownIntervalRef.current);
                toast.error("Payment timeout. Please contact a staff member.");
            }
        }, 1000);
    };

    const formatTime = (seconds) => {
        if (seconds == null) return "";
        const m = Math.floor(seconds / 60).toString().padStart(2, "0");
        const s = (seconds % 60).toString().padStart(2, "0");
        return `${m}:${s}`;
    };

    const handleCloseReviewModal = () => {
        setShowReviewModal(false);
        setSelectedDiningRating(null);
        setDiningFeedbackText("");
    };

    const handleSubmitDiningReview = async () => {
        if (selectedDiningRating === null) {
            toast.error("Please select rating first");
            return;
        }

        try {
            setSubmittingReview(true);
            const res = await dineInAPI.submitSessionReview(sessionId, {
                rating: selectedDiningRating,
                comment: diningFeedbackText || undefined,
            });
            const updatedSession = res?.data?.data || {};
            setBillData((prev) => ({
                ...(prev || {}),
                review: updatedSession?.review || {
                    rating: selectedDiningRating,
                    comment: diningFeedbackText || "",
                },
                restaurant: {
                    ...(prev?.restaurant || {}),
                    rating: Number(updatedSession?.restaurantId?.rating ?? prev?.restaurant?.rating ?? 0),
                    totalRatings: Number(updatedSession?.restaurantId?.totalRatings ?? prev?.restaurant?.totalRatings ?? 0),
                },
            }));
            toast.success("Thanks for rating your dining experience!");
            removePendingDiningReview(sessionId);
            markDiningReviewPromptShown(sessionId);
            handleCloseReviewModal();
        } catch (err) {
            const statusCode = err?.response?.status;
            if (statusCode === 409) {
                // Review already submitted — close modal gracefully
                toast.success("Your dining review is already recorded!");
                removePendingDiningReview(sessionId);
                markDiningReviewPromptShown(sessionId);
                handleCloseReviewModal();
            } else {
                toast.error(err?.response?.data?.message || "Failed to submit dining review");
            }
        } finally {
            setSubmittingReview(false);
        }
    };

    const renderReviewModal = () => (
        showReviewModal ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
                <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
                    <div className="bg-gradient-to-r from-[#00c87e] to-[#00b06f] px-6 py-5">
                        <div className="mb-2 flex items-center justify-between">
                            <h2 className="flex items-center gap-2 text-xl font-bold text-white">
                                <Star className="h-5 w-5 fill-white" />
                                Rate Your Dining
                            </h2>
                            <button type="button" onClick={handleCloseReviewModal} className="rounded-full p-1 text-white/80 hover:bg-white/20 hover:text-white">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <p className="text-sm text-white/90">{billData?.restaurant?.name || "Restaurant"}</p>
                    </div>

                    <div className="px-6 py-6">
                        <p className="mb-3 text-sm font-semibold text-gray-900">Dining rating (out of 5)</p>
                        <div className="mb-4 flex items-center justify-center gap-2">
                            {Array.from({ length: 5 }, (_, index) => index + 1).map((num) => {
                                const isActive = (selectedDiningRating || 0) >= num;
                                return (
                                    <button
                                        key={`dining-review-${num}`}
                                        type="button"
                                        onClick={() => setSelectedDiningRating(num)}
                                        className="p-2 transition-transform hover:scale-125 active:scale-95"
                                    >
                                        <Star className={`h-10 w-10 ${isActive ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
                                    </button>
                                );
                            })}
                        </div>
                        <textarea
                            rows={3}
                            value={diningFeedbackText}
                            onChange={(event) => setDiningFeedbackText(event.target.value)}
                            className="w-full resize-none rounded-xl border-2 border-gray-200 px-4 py-3 text-sm text-gray-800 outline-none transition-all focus:border-[#00c87e] focus:ring-2 focus:ring-[#00c87e]/20"
                            placeholder="Dining feedback (optional)"
                        />
                        <button
                            type="button"
                            disabled={submittingReview || selectedDiningRating === null}
                            onClick={handleSubmitDiningReview}
                            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#00c87e] to-[#00b06f] py-3.5 text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {submittingReview ? (
                                <>
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    Submitting...
                                </>
                            ) : (
                                <>
                                    <Star className="h-5 w-5 fill-white" />
                                    Submit Dining Rating
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        ) : null
    );

    // ─── Render states ───────────────────────────────────────────────────────
    if (loading) return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-white">
            <Loader2 className="w-12 h-12 text-[#00c87e] animate-spin" />
        </div>
    );

    if (error) return (
        <div className="p-10 text-center flex flex-col items-center justify-center min-h-screen">
            <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
            <p className="text-gray-600 font-medium">{error}</p>
            <Button onClick={() => navigate(-1)} className="mt-6">Go Back</Button>
        </div>
    );

    const { itemized, summary, tableNumber, appliedOffer } = billData;

    // ─── Payment completed screen ────────────────────────────────────────────
    if (counterPaymentCompleted) {
        return (
            <AnimatedPage className="min-h-screen bg-[#fafafa] flex flex-col items-center justify-center p-8">
                <motion.div
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", damping: 15 }}
                    className="text-center"
                >
                    <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <ShieldCheck className="w-14 h-14 text-[#00c87e]" />
                    </div>
                    <h1 className="text-3xl font-black text-gray-900 mb-2">Payment Successful!</h1>
                    <p className="text-gray-500 font-medium mb-1">Thank you for dining with us 🙏</p>
                    <p className="text-sm text-gray-400">Your session has been closed successfully.</p>
                    <div className="mt-8 bg-green-50 rounded-2xl p-4 text-left">
                        <p className="text-[11px] font-bold text-green-700 uppercase tracking-wider">Amount Paid</p>
                        <p className="text-3xl font-black text-green-700 mt-1">{RUPEE_SYMBOL}{summary.totalAmount}</p>
                    </div>
                    {!showReviewModal && (
                        <button
                            type="button"
                            onClick={() => navigate("/food/user/dining")}
                            className="mt-6 rounded-2xl bg-gray-900 px-5 py-3 text-sm font-bold text-white"
                        >
                            Continue
                        </button>
                    )}
                </motion.div>
                {renderReviewModal()}
            </AnimatedPage>
        );
    }

    return (
        <AnimatedPage className="min-h-screen bg-[#fafafa] pb-10">
            {/* Header */}
            <div className="bg-white px-6 py-6 border-b border-gray-100 sticky top-0 z-10">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-gray-100">
                        <ChevronLeft className="w-6 h-6 text-gray-700" />
                    </button>
                    <div>
                        <h1 className="text-xl font-black text-gray-900 leading-none">Final Bill</h1>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Table {tableNumber} • Session Summary</p>
                    </div>
                </div>
            </div>

            <div className="max-w-md mx-auto px-6 mt-8">
                {/* Bill Receipt Card */}
                <div className="bg-white rounded-[2.5rem] shadow-xl shadow-gray-200/50 overflow-hidden relative">
                    {/* Decorative Cutout */}
                    <div className="absolute top-[25%] -left-3 w-6 h-6 bg-[#fafafa] rounded-full" />
                    <div className="absolute top-[25%] -right-3 w-6 h-6 bg-[#fafafa] rounded-full" />
                    
                    <div className="p-8">
                        <div className="flex items-center justify-center mb-6">
                            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center">
                                <Receipt className="w-8 h-8 text-[#00c87e]" />
                            </div>
                        </div>

                        <div className="text-center mb-8">
                            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-1">Total Payable</h2>
                            <p className="text-4xl font-black text-gray-900">{RUPEE_SYMBOL}{summary.totalAmount}</p>
                        </div>

                        <div className="space-y-4 mb-8">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Order Summary</p>
                            <div className="space-y-3">
                                {itemized.map((item, idx) => (
                                    <div key={idx} className="flex justify-between items-start text-sm">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className="font-bold text-gray-800 leading-tight">{item.name}</p>
                                                {item.isAddon && (
                                                    <span className="px-2 py-0.5 rounded-full bg-green-50 text-[#00c87e] text-[10px] font-black uppercase tracking-wider">
                                                        Add-on
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-400">Qty: {item.quantity}</p>
                                        </div>
                                        <p className="font-bold text-gray-900">{RUPEE_SYMBOL}{item.itemTotal}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Divider Line */}
                        <div className="border-t-2 border-dashed border-gray-100 my-6" />

                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500 font-medium">Subtotal</span>
                                <span className="text-gray-900 font-bold">{RUPEE_SYMBOL}{summary.subtotal}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500 font-medium">Platform Fee</span>
                                <span className="text-gray-900 font-bold">{RUPEE_SYMBOL}{summary.platformFee || 0}</span>
                            </div>
                            {summary.offerDiscount > 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-[#00c87e] font-medium">
                                        {appliedOffer?.title || "Dining Offer"}
                                    </span>
                                    <span className="text-[#00c87e] font-bold">-{RUPEE_SYMBOL}{summary.offerDiscount}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500 font-medium">Taxes &amp; GST (5%)</span>
                                <span className="text-gray-900 font-bold">{RUPEE_SYMBOL}{summary.taxAmount}</span>
                            </div>
                            {summary.offerDiscount > 0 && summary.grossTotalAmount != null && (
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-400 font-medium">Original bill total</span>
                                    <span className="text-gray-500 font-semibold">{RUPEE_SYMBOL}{summary.grossTotalAmount}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-lg pt-2">
                                <span className="text-gray-900 font-black">Grand Total</span>
                                <span className="text-[#00c87e] font-black">{RUPEE_SYMBOL}{summary.totalAmount}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Counter Payment Requested State ── */}
                <AnimatePresence>
                {counterPaymentRequested && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-8"
                    >
                        {/* Status Banner */}
                        <div className="bg-orange-50 border-2 border-orange-200 rounded-3xl p-6 mb-4">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                                    <Bell className="w-5 h-5 text-orange-500" />
                                </div>
                                <div>
                                    <p className="font-black text-orange-800 text-base leading-tight">Restaurant Notified!</p>
                                    <p className="text-xs text-orange-500 font-medium mt-0.5">Staff is preparing your receipt</p>
                                </div>
                            </div>

                            <div className="bg-orange-100/60 rounded-2xl p-4 mb-4">
                                <p className="text-sm font-black text-orange-900 text-center">
                                    Please proceed to the counter to complete your payment.
                                </p>
                            </div>

                            {/* Steps */}
                            <div className="space-y-3">
                                {[
                                    { icon: MapPin, text: "Walk to the cash counter", done: true },
                                    { icon: Wallet, text: `Pay ${RUPEE_SYMBOL}${summary.totalAmount} (cash/card)`, done: false },
                                    { icon: ShieldCheck, text: "Session closes automatically", done: false },
                                ].map(({ icon: Icon, text, done }, i) => (
                                    <div key={i} className="flex items-center gap-3">
                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${done ? "bg-orange-500" : "bg-orange-200"}`}>
                                            <Icon className={`w-3.5 h-3.5 ${done ? "text-white" : "text-orange-500"}`} />
                                        </div>
                                        <span className={`text-sm font-semibold ${done ? "text-orange-800" : "text-orange-600"}`}>{text}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Countdown timer */}
                        {timeoutRemaining != null && timeoutRemaining > 0 && (
                            <div className="flex items-center justify-center gap-2 py-3 bg-white rounded-2xl border border-gray-100 shadow-sm">
                                <Clock className="w-4 h-4 text-gray-400" />
                                <span className="text-sm text-gray-500 font-medium">
                                    Time remaining: <span className={`font-black ${timeoutRemaining < 120 ? "text-red-500" : "text-gray-800"}`}>{formatTime(timeoutRemaining)}</span>
                                </span>
                            </div>
                        )}
                        {timeoutRemaining === 0 && (
                            <div className="flex items-center justify-center gap-2 py-3 bg-red-50 rounded-2xl border border-red-100">
                                <AlertCircle className="w-4 h-4 text-red-500" />
                                <span className="text-sm text-red-600 font-medium">Time expired. Please speak to a staff member.</span>
                            </div>
                        )}

                        <div className="mt-4 p-4 bg-green-50 rounded-2xl flex items-center gap-3">
                            <Loader2 className="w-4 h-4 text-[#00c87e] animate-spin flex-shrink-0" />
                            <p className="text-[10px] text-[#00c87e] font-bold leading-tight">
                                Waiting for payment confirmation from restaurant staff...
                            </p>
                        </div>
                    </motion.div>
                )}
                </AnimatePresence>

                {/* ── Normal Payment Methods (hidden after counter selected) ── */}
                {!counterPaymentRequested && (
                    <div className="mt-10 space-y-4">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest px-2">Select Payment Method</p>
                        
                        <button 
                            disabled={paying}
                            onClick={handleOnlinePayment}
                            className="w-full bg-white p-5 rounded-3xl border border-gray-100 flex items-center justify-between shadow-md hover:border-[#00c87e] transition-all group active:scale-95"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center group-hover:bg-blue-100">
                                    <CreditCard className="w-6 h-6 text-blue-500" />
                                </div>
                                <div className="text-left">
                                    <p className="font-bold text-gray-900">Online Payment</p>
                                    <p className="text-[10px] text-gray-400 font-medium uppercase tracking-tight italic">UPI, Cards, Netbanking</p>
                                </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-gray-300" />
                        </button>

                        <button 
                             disabled={paying}
                             onClick={handlePayAtCounter}
                             className="w-full bg-white p-5 rounded-3xl border border-gray-100 flex items-center justify-between shadow-md hover:border-orange-400 transition-all group active:scale-95"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center group-hover:bg-orange-100">
                                    <Wallet className="w-6 h-6 text-orange-500" />
                                </div>
                                <div className="text-left">
                                    <p className="font-bold text-gray-900">Pay at Counter</p>
                                    <p className="text-[10px] text-gray-400 font-medium uppercase tracking-tight italic">Cash or Card on completion</p>
                                </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-gray-300" />
                        </button>
                    </div>
                )}

                <div className="mt-8 p-4 bg-green-50 rounded-2xl flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-[#00c87e]" />
                    <p className="text-[10px] text-[#00c87e] font-bold leading-tight">
                        Your session will be closed automatically after payment confirmation.
                    </p>
                </div>
            </div>

            {paying && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center">
                    <div className="bg-white p-8 rounded-3xl flex flex-col items-center">
                        <Loader2 className="w-12 h-12 text-[#00c87e] animate-spin mb-4" />
                        <p className="font-bold text-gray-900">Opening payment gateway...</p>
                    </div>
                </div>
            )}
            {renderReviewModal()}
        </AnimatedPage>
    );
};

export default DineInBill;
