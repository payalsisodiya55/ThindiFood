import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { 
    ChevronLeft, Receipt, CreditCard, ChevronRight, 
    CheckCircle2, Loader2, AlertCircle, Clock, Wallet
} from "lucide-react";
import { Button } from "@food/components/ui/button";
import { dineInAPI } from "@food/api";
import AnimatedPage from "@food/components/user/AnimatedPage";
import { toast } from "sonner";

const RUPEE_SYMBOL = "\u20B9";

const DineInBill = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const sessionId = searchParams.get("sessionId");

    const [loading, setLoading] = useState(true);
    const [paying, setPaying] = useState(false);
    const [billData, setBillData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!sessionId) {
            navigate("/food/user/dining");
            return;
        }
        fetchBill();
    }, [sessionId]);

    const fetchBill = async () => {
        try {
            setLoading(true);
            const res = await dineInAPI.getSessionBill(sessionId);
            if (res.data?.success) {
                setBillData(res.data.data);
            } else {
                throw new Error(res.data?.message || "Failed to fetch bill");
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handlePayment = async (method) => {
        try {
            setPaying(true);
            const res = await dineInAPI.payBill(sessionId, {
                paymentMethod: method
            });

            if (res.data?.success) {
                toast.success("Payment successful! Reflecting on table status.");
                // Clear the active session since it's now completed
                localStorage.removeItem('activeDineInSessionId');
                // Redirect to a success state or home
                navigate("/food/user/dining");
            } else {
                toast.error(res.data?.message || "Payment failed");
            }
        } catch (err) {
            toast.error("Payment integration currently being finalized.");
        } finally {
            setPaying(false);
        }
    };

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

    const { itemized, summary, tableNumber } = billData;

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
                                            <p className="font-bold text-gray-800 leading-tight">{item.name}</p>
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
                                <span className="text-gray-500 font-medium">Taxes & GST (5%)</span>
                                <span className="text-gray-900 font-bold">{RUPEE_SYMBOL}{summary.taxAmount}</span>
                            </div>
                            <div className="flex justify-between text-lg pt-2">
                                <span className="text-gray-900 font-black">Grand Total</span>
                                <span className="text-[#00c87e] font-black">{RUPEE_SYMBOL}{summary.totalAmount}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Payment Methods */}
                <div className="mt-10 space-y-4">
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest px-2">Select Payment Method</p>
                    
                    <button 
                        disabled={paying}
                        onClick={() => handlePayment('online')}
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
                         onClick={() => handlePayment('cash')}
                         className="w-full bg-white p-5 rounded-3xl border border-gray-100 flex items-center justify-between shadow-md hover:border-[#00c87e] transition-all group active:scale-95"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center group-hover:bg-orange-100">
                                <Wallet className="w-6 h-6 text-orange-500" />
                            </div>
                            <div className="text-left">
                                <p className="font-bold text-gray-900">Pay at Counter</p>
                                <p className="text-[10px] text-gray-400 font-medium uppercase tracking-tight italic">Cash on completion</p>
                            </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-300" />
                    </button>
                </div>

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
                        <p className="font-bold text-gray-900">Processing Payment...</p>
                    </div>
                </div>
            )}
        </AnimatedPage>
    );
};

export default DineInBill;
