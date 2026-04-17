import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
    Utensils, ArrowLeft, Search, ShoppingBag, Clock, 
    ChevronRight, Check, Loader2, AlertCircle, ShoppingCart, 
    Trash2, Plus, Minus, Info, X, Star, MapPin
} from "lucide-react";
import { Button } from "@food/components/ui/button";
import { Card, CardContent } from "@food/components/ui/card";
import { Badge } from "@food/components/ui/badge";
import { dineInAPI, restaurantAPI } from "@food/api";
import { useProfile } from "@food/context/ProfileContext";
import AnimatedPage from "@food/components/user/AnimatedPage";
import OptimizedImage from "@food/components/OptimizedImage";
import { toast } from "sonner";

const RUPEE_SYMBOL = "\u20B9";

const DineInMenu = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { userProfile } = useProfile();
    const user = userProfile;
    const [sessionId] = useState(searchParams.get("sessionId"));

    const [loading, setLoading] = useState(true);
    const [placingOrder, setPlacingOrder] = useState(false);
    const [error, setError] = useState(null);
    const [sessionData, setSessionData] = useState(null);
    const [restaurant, setRestaurant] = useState(null);
    const [menuSections, setMenuSections] = useState([]);
    
    // Draft Cart for the current round
    const [roundCart, setRoundCart] = useState({});
    const [showCartDrawer, setShowCartDrawer] = useState(false);

    // Filter states
    const [searchQuery, setSearchQuery] = useState("");
    const [vegOnly, setVegOnly] = useState(false);

    useEffect(() => {
        if (!sessionId) {
            navigate("/user/dining");
            return;
        }
        fetchSessionAndMenu();

        // 5-second polling for live status updates from kitchen
        const intervalId = setInterval(async () => {
            try {
                const sRes = await dineInAPI.getSession(sessionId);
                if (sRes.data?.success) {
                    setSessionData(sRes.data.data);
                }
            } catch (err) {
                console.warn("Polling failed", err);
            }
        }, 5000);

        return () => clearInterval(intervalId);
    }, [sessionId]);

    useEffect(() => {
        if (!sessionData) return;
        // If the session is completed/paid, this menu screen should not stay in "active ordering" mode.
        if (sessionData.status === "completed" || sessionData.isPaid) {
            toast.success("Session completed. Thanks for dining!");
            setTimeout(() => navigate("/food/user/dining"), 800);
        }
    }, [sessionData, navigate]);

    const fetchSessionAndMenu = async () => {
        try {
            setLoading(true);
            // 1. Fetch Session
            const sRes = await dineInAPI.getSession(sessionId);
            if (!sRes.data?.success) throw new Error("Session invalid");
            const session = sRes.data.data;
            setSessionData(session);

            // 2. Fetch Restaurant & Menu
            const rId = session.restaurantId._id || session.restaurantId;
            const [rRes, mRes] = await Promise.all([
                restaurantAPI.getRestaurantById(rId),
                restaurantAPI.getMenuByRestaurantId(rId)
            ]);

            if (rRes.data?.success) setRestaurant(rRes.data.data);
            if (mRes.data?.success) {
                const rawSections = mRes.data.data.menu?.sections || [];
                setMenuSections(Array.isArray(rawSections) ? rawSections : Object.values(rawSections));
            }

        } catch (err) {
            setError(err.message || "Failed to load session data");
        } finally {
            setLoading(false);
        }
    };

    const updateRoundCart = (item, delta) => {
        const itemId = item._id || item.id;
        setRoundCart(prev => {
            const currentQty = prev[itemId]?.quantity || 0;
            const newQty = Math.max(0, currentQty + delta);
            
            if (newQty === 0) {
                const next = { ...prev };
                delete next[itemId];
                return next;
            }

            return {
                ...prev,
                [itemId]: {
                    itemId,
                    name: item.name,
                    price: item.price || item.featuredPrice || 0,
                    quantity: newQty,
                    isVeg: item.isVeg || item.foodType === 'Veg',
                    itemTotal: (item.price || item.featuredPrice || 0) * newQty
                }
            };
        });
    };

    const cartItems = Object.values(roundCart);
    const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    const cartSubtotal = cartItems.reduce((sum, item) => sum + item.itemTotal, 0);

    const handlePlaceOrderRound = async () => {
        if (cartItems.length === 0) return;

        try {
            setPlacingOrder(true);
            const res = await dineInAPI.placeOrder(sessionId, {
                items: cartItems
            });

            if (res.data?.success) {
                toast.success("Order placed successfully!");
                setRoundCart({});
                setShowCartDrawer(false);
                // Refresh session to show running orders
                fetchSessionAndMenu();
            } else {
                toast.error(res.data?.message || "Failed to place order");
            }
        } catch (err) {
            toast.error("Something went wrong");
        } finally {
            setPlacingOrder(false);
        }
    };

    const filteredMenu = useMemo(() => {
        return menuSections.map(section => {
            const items = (section.items || []).filter(item => {
                const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
                const matchesVeg = !vegOnly || (item.isVeg || item.foodType === 'Veg');
                return matchesSearch && matchesVeg;
            });
            return { ...section, items };
        }).filter(section => section.items.length > 0);
    }, [menuSections, searchQuery, vegOnly]);

    if (loading) return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-white">
            <Loader2 className="w-12 h-12 text-[#00c87e] animate-spin" />
        </div>
    );

    if (error) return (
        <div className="p-10 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p>{error}</p>
            <Button onClick={() => navigate("/user/dining")} className="mt-4">Go Back</Button>
        </div>
    );

    return (
        <AnimatedPage className="min-h-screen bg-[#fafafa] pb-32">
            
            {/* Header Section */}
            <div className="sticky top-0 z-[50] bg-white border-b border-gray-100 shadow-sm">
                <div className="px-4 py-4 flex items-center justify-between">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-gray-100">
                        <ArrowLeft className="w-6 h-6 text-gray-700" />
                    </button>
                    <div className="flex-1 px-4">
                        <h1 className="text-lg font-bold text-gray-900 truncate">
                            {restaurant?.restaurantName || "Dine-In Menu"}
                        </h1>
                        <p className="text-[10px] text-[#00c87e] font-black uppercase tracking-widest flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> Live at Table {sessionData?.tableNumber}
                        </p>
                    </div>
                </div>

                {/* Search & Filter Bar */}
                <div className="px-4 pb-4 flex items-center gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Search dishes..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-gray-100 border-none rounded-xl py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#00c87e]/20"
                        />
                    </div>
                    <button 
                        onClick={() => setVegOnly(!vegOnly)}
                        className={`px-3 py-2 rounded-xl border text-xs font-bold transition-all ${
                            vegOnly 
                            ? 'bg-green-50 border-[#00c87e] text-[#00c87e]' 
                            : 'bg-white border-gray-200 text-gray-500'
                        }`}
                    >
                        Veg
                    </button>
                </div>
            </div>

            {/* Session Running Summary Card */}
            {sessionData && (
                <div className="px-4 mt-6">
                    <div className="bg-gradient-to-r from-[#00c87e] to-[#00b06f] rounded-[2rem] p-6 text-white shadow-xl shadow-green-100 mb-6">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest">Running Total</p>
                                <h3 className="text-3xl font-black">{RUPEE_SYMBOL}{sessionData.totalAmount || 0}</h3>
                            </div>
                            <Button 
                                onClick={() => navigate(`/user/dine-in/bill?sessionId=${sessionId}`)}
                                variant="ghost" 
                                className="bg-white/20 hover:bg-white/30 text-white rounded-2xl text-xs font-bold"
                            >
                                View Bill
                            </Button>
                        </div>
                        <div className="flex items-center gap-2">
                             <div className="h-1.5 flex-1 bg-white/20 rounded-full overflow-hidden">
                                <motion.div 
                                    className="h-full bg-white" 
                                    initial={{ width: 0 }}
                                    animate={{ width: sessionData.status === 'completed' ? '100%' : '60%' }}
                                />
                             </div>
                             <span className="text-[10px] font-bold uppercase tracking-wider">
                                {sessionData.status === 'active' ? 'Dining Active' : sessionData.status}
                             </span>
                        </div>
                    </div>

                    {/* LIVE ORDER STATUS SECTION */}
                    {sessionData.orders?.length > 0 && (
                        <div className="space-y-4">
                            <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest px-1">Current Orders Progress</h3>
                            <div className="bg-white rounded-[1.5rem] border border-gray-100 p-4 shadow-sm space-y-4">
                                {sessionData.orders.map((round, rIdx) => (
                                    <div key={round._id || rIdx} className="border-b border-gray-50 last:border-0 pb-3 last:pb-0">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Round {rIdx + 1}</span>
                                            <Badge variant="outline" className="text-[9px] font-black uppercase tracking-tighter">
                                                {new Date(round.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </Badge>
                                        </div>
                                        <div className="space-y-2">
                                            {round.items.map((item, iIdx) => (
                                                <div key={iIdx} className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-1.5 h-1.5 rounded-full ${item.isVeg ? 'bg-green-500' : 'bg-red-500'}`} />
                                                        <span className="text-xs font-bold text-gray-700">{item.quantity}x {item.name}</span>
                                                    </div>
                                                    <div className="flex flex-col items-end shrink-0">
                                                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${
                                                            item.status === 'received' ? 'bg-blue-50 text-blue-500' :
                                                            item.status === 'preparing' ? 'bg-orange-50 text-orange-500 animate-pulse' :
                                                            item.status === 'ready' ? 'bg-purple-50 text-purple-500' :
                                                            item.status === 'cancelled' ? 'bg-red-50 text-red-500' :
                                                            'bg-green-50 text-green-500'
                                                        }`}>
                                                            {item.status === "received"
                                                                ? "Waiting"
                                                                : item.status === "cancelled"
                                                                ? "Cancelled"
                                                                : (item.status || "Waiting")}
                                                        </span>
                                                        {item.status === 'cancelled' && round.reason && (
                                                            <span className="text-[8px] text-red-400 font-black mt-1 text-right max-w-[120px] leading-tight">
                                                                {round.reason}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Menu Sections */}
            <div className="px-4 mt-8 space-y-10">
                {filteredMenu.map((section, idx) => (
                    <div key={section.id || idx}>
                        <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                            {section.name}
                            <div className="h-px flex-1 bg-gray-100" />
                        </h2>
                        
                        <div className="space-y-6">
                            {(section.items || []).map((item) => {
                                const qty = roundCart[item._id || item.id]?.quantity || 0;
                                return (
                                    <div key={item._id || item.id} className="flex gap-4">
                                        <div className="flex-1 py-1">
                                            <div className="mb-1">
                                                {(item.isVeg || item.foodType === 'Veg') ? (
                                                    <div className="w-4 h-4 border-2 border-green-600 p-[2px] rounded-sm">
                                                        <div className="w-full h-full bg-green-600 rounded-full" />
                                                    </div>
                                                ) : (
                                                    <div className="w-4 h-4 border-2 border-red-600 p-[2px] rounded-sm">
                                                        <div className="w-full h-full bg-red-600 rounded-full" />
                                                    </div>
                                                )}
                                            </div>
                                            <h3 className="text-base font-bold text-gray-900 mb-1">{item.name}</h3>
                                            <p className="text-lg font-black text-[#00c87e] mb-2">{RUPEE_SYMBOL}{item.price || item.featuredPrice}</p>
                                            <p className="text-xs text-gray-500 line-clamp-2 pr-4">{item.description}</p>
                                        </div>
                                        
                                        <div className="shrink-0 relative">
                                            <div className="w-28 h-28 rounded-2xl overflow-hidden shadow-md ring-1 ring-gray-100">
                                                <OptimizedImage
                                                    src={item.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=200"}
                                                    alt={item.name}
                                                    className="w-full h-full"
                                                    objectFit="cover"
                                                />
                                            </div>
                                            
                                            {/* Counter UI */}
                                            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-[80%]">
                                                {qty > 0 ? (
                                                    <div className="bg-white border border-[#00c87e] shadow-lg rounded-xl flex items-center justify-between p-1">
                                                        <button 
                                                            onClick={() => updateRoundCart(item, -1)}
                                                            className="p-1 text-[#00c87e] hover:bg-green-50 rounded-lg"
                                                        >
                                                            <Minus className="w-4 h-4" />
                                                        </button>
                                                        <span className="font-bold text-[#00c87e] text-sm">{qty}</span>
                                                        <button 
                                                            onClick={() => updateRoundCart(item, 1)}
                                                            className="p-1 text-[#00c87e] hover:bg-green-50 rounded-lg"
                                                        >
                                                            <Plus className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <Button 
                                                        onClick={() => updateRoundCart(item, 1)}
                                                        className="w-full bg-white hover:bg-[#00c87e] hover:text-white border border-[#00c87e] text-[#00c87e] font-black text-xs py-2 shadow-lg rounded-xl uppercase tracking-wider transition-all"
                                                    >
                                                        Add
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {/* Floating Action Button (FAB) for Cart */}
            <AnimatePresence>
                {cartCount > 0 && (
                    <motion.div 
                        initial={{ y: 100 }}
                        animate={{ y: 0 }}
                        exit={{ y: 100 }}
                        className="fixed bottom-6 left-6 right-6 z-[60]"
                    >
                        <Button
                            onClick={() => setShowCartDrawer(true)}
                            className="w-full bg-black hover:bg-gray-800 text-white p-6 rounded-[2rem] flex items-center justify-between shadow-2xl h-16"
                        >
                            <div className="flex items-center gap-3">
                                <div className="bg-[#00c87e] text-white w-8 h-8 rounded-full flex items-center justify-center font-black text-sm">
                                    {cartCount}
                                </div>
                                <span className="font-bold uppercase tracking-widest text-xs">View Draft Order</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="font-black text-lg">{RUPEE_SYMBOL}{cartSubtotal}</span>
                                <ChevronRight className="w-5 h-5" />
                            </div>
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Cart Drawer (Simplified Overlay) */}
            <AnimatePresence>
                {showCartDrawer && (
                    <>
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowCartDrawer(false)}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
                        />
                        <motion.div 
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[3rem] z-[101] max-h-[85vh] overflow-y-auto"
                        >
                            <div className="p-8">
                                <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-8" />
                                
                                <div className="flex items-center justify-between mb-8">
                                    <h3 className="text-2xl font-black text-gray-900">Review Round</h3>
                                    <button onClick={() => setShowCartDrawer(false)} className="p-2 bg-gray-100 rounded-full leading-none">
                                        <X className="w-5 h-5 text-gray-500" />
                                    </button>
                                </div>

                                <div className="space-y-6 mb-10">
                                    {cartItems.map((item) => (
                                        <div key={item.itemId} className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-2 h-2 rounded-full ${item.isVeg ? 'bg-green-500' : 'bg-red-500'}`} />
                                                <div>
                                                    <p className="font-bold text-gray-900">{item.name}</p>
                                                    <p className="text-xs text-gray-400">{RUPEE_SYMBOL}{item.price} x {item.quantity}</p>
                                                </div>
                                            </div>
                                            <p className="font-black text-gray-900">{RUPEE_SYMBOL}{item.itemTotal}</p>
                                        </div>
                                    ))}
                                </div>

                                <div className="space-y-4 mb-10">
                                    <div className="p-4 bg-gray-50 rounded-2xl flex items-center gap-3">
                                        <Info className="w-5 h-5 text-gray-400" />
                                        <p className="text-xs text-gray-500 font-medium">This is a draft. Once you place the order, it will be sent to the kitchen for preparation.</p>
                                    </div>
                                </div>

                                <Button
                                    disabled={placingOrder}
                                    onClick={handlePlaceOrderRound}
                                    className="w-full py-8 rounded-3xl bg-[#00c87e] hover:bg-[#00b06f] text-white text-xl font-black shadow-xl shadow-green-100 flex items-center justify-center gap-3"
                                >
                                    {placingOrder ? (
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                    ) : (
                                        <>
                                            <Check className="w-6 h-6" />
                                            <span>Place Round</span>
                                        </>
                                    )}
                                </Button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

        </AnimatedPage>
    );
};

export default DineInMenu;
