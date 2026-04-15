import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Utensils, QrCode, ArrowRight, Loader2, AlertCircle, LogIn } from "lucide-react";
import { Button } from "@food/components/ui/button";
import { dineInAPI } from "@food/api";
import { useProfile } from "@food/context/ProfileContext";
import AnimatedPage from "@food/components/user/AnimatedPage";
import OptimizedImage from "@food/components/OptimizedImage";

const QRLanding = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { userProfile } = useProfile();
    const user = userProfile;
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [tableInfo, setTableInfo] = useState(null);

    const restaurantId = searchParams.get("r");
    const tableNumber = searchParams.get("t");

    useEffect(() => {
        if (!restaurantId || !tableNumber) {
            setError("Invalid QR Code. Please scan a valid table QR.");
            setLoading(false);
            return;
        }

        const fetchTableInfo = async () => {
            try {
                const res = await dineInAPI.getTableInfo(restaurantId, tableNumber);
                if (res.data?.success) {
                    setTableInfo(res.data.data);
                } else {
                    setError(res.data?.message || "Table not found");
                }
            } catch (err) {
                setError("Failed to fetch table information. Please try again.");
            } finally {
                setLoading(false);
            }
        };

        fetchTableInfo();
    }, [restaurantId, tableNumber]);

    const handleStartSession = async () => {
        const entryPath = `/food/user/dine-in/entry?r=${encodeURIComponent(restaurantId)}&t=${encodeURIComponent(tableNumber)}`;
        if (!user) {
            navigate(`/user/auth/login?next=${encodeURIComponent(entryPath)}`);
            return;
        }
        navigate(`/user/dine-in/entry?r=${encodeURIComponent(restaurantId)}&t=${encodeURIComponent(tableNumber)}`);
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-white">
                <Loader2 className="w-12 h-12 text-[#00c87e] animate-spin mb-4" />
                <p className="text-gray-500 font-medium anim-pulse">Checking table status...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen px-6 bg-white text-center">
                <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6">
                    <AlertCircle className="w-10 h-10 text-red-500" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Oops!</h1>
                <p className="text-gray-600 mb-8 max-w-xs">{error}</p>
                <Button onClick={() => navigate("/user/dining")} className="bg-[#00c87e] hover:bg-[#00b06f] text-white px-8 py-6 rounded-2xl text-lg font-bold shadow-lg shadow-green-100">
                    Back to Dining
                </Button>
            </div>
        );
    }

    return (
        <AnimatedPage className="min-h-screen bg-[#fafafa]">
            {/* Hero Image Section */}
            <div className="relative h-[40vh] w-full overflow-hidden">
                <OptimizedImage
                    src={tableInfo?.restaurantId?.coverImages?.[0]?.url || "https://images.unsplash.com/photo-1517248135467-4c7ed9d42c7b?auto=format&fit=crop&q=80&w=1000"}
                    alt={tableInfo?.restaurantId?.restaurantName}
                    className="w-full h-full"
                    objectFit="cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                
                <div className="absolute bottom-0 left-0 right-0 p-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-4"
                    >
                        <div className="w-16 h-16 rounded-2xl bg-white p-1 shadow-xl overflow-hidden">
                            <OptimizedImage
                                src={tableInfo?.restaurantId?.profileImage?.url}
                                className="w-full h-full rounded-xl"
                                objectFit="cover"
                            />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white leading-tight">
                                {tableInfo?.restaurantId?.restaurantName}
                            </h1>
                            <p className="text-white/80 text-sm flex items-center gap-1">
                                <Utensils className="w-3 h-3" />
                                {tableInfo?.restaurantId?.cuisines?.slice(0, 2).join(", ") || "Multi-cuisine"}
                            </p>
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* Check-in Card */}
            <div className="px-6 -mt-10 relative z-10 pb-10">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white rounded-[2.5rem] shadow-2xl shadow-gray-200/50 p-8 text-center"
                >
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-green-50 rounded-full mb-6">
                        <QrCode className="w-10 h-10 text-[#00c87e]" />
                    </div>

                    <h2 className="text-3xl font-black text-gray-900 mb-2">
                        Table {tableNumber}
                    </h2>
                    <p className="text-gray-500 mb-8 font-medium">
                        Welcome! Ready to order your favorites?
                    </p>

                    <div className="space-y-4">
                        <Button
                            onClick={handleStartSession}
                            size="lg"
                            className="w-full py-8 rounded-3xl bg-[#00c87e] hover:bg-[#00b06f] text-white text-xl font-black shadow-xl shadow-green-100 transition-all active:scale-95 flex items-center justify-center gap-3"
                        >
                            {!user ? <LogIn className="w-6 h-6" /> : <Utensils className="w-6 h-6" />}
                            {!user ? "Login to Order" : "Start Ordering"}
                            <ArrowRight className="w-6 h-6" />
                        </Button>
                        
                        <p className="text-xs text-gray-400 font-medium">
                            By continuing, you agree to our terms and conditions.
                        </p>
                    </div>
                </motion.div>

                {/* Info Section */}
                <div className="mt-8 grid grid-cols-2 gap-4">
                    <div className="bg-white/60 backdrop-blur-md p-4 rounded-3xl border border-white flex flex-col items-center">
                        <div className="w-10 h-10 bg-blue-50 rounded-2xl flex items-center justify-center mb-2">
                            <Utensils className="w-5 h-5 text-blue-500" />
                        </div>
                        <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Order Loop</span>
                        <span className="text-sm font-bold text-gray-700">Multi-rounds</span>
                    </div>
                    <div className="bg-white/60 backdrop-blur-md p-4 rounded-3xl border border-white flex flex-col items-center">
                        <div className="w-10 h-10 bg-purple-50 rounded-2xl flex items-center justify-center mb-2">
                            <QrCode className="w-5 h-5 text-purple-500" />
                        </div>
                        <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Payment</span>
                        <span className="text-sm font-bold text-gray-700">Settle at End</span>
                    </div>
                </div>
            </div>
        </AnimatedPage>
    );
};

export default QRLanding;
