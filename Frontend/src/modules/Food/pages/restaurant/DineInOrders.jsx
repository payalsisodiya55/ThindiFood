import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
    Clock, CheckCircle2, ChevronRight, Loader2, 
    AlertCircle, RefreshCw, Utensils, Hash,
    Timer, Bell, Check, Flame, PackageCheck, Printer, ArrowLeft
} from "lucide-react";
import { Button } from "@food/components/ui/button";
import { Card, CardContent } from "@food/components/ui/card";
import { Badge } from "@food/components/ui/badge";
import { dineInAPI, restaurantAPI } from "@food/api";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

const DineInOrders = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [sessions, setSessions] = useState([]);
    const [restaurantId, setRestaurantId] = useState(null);

    useEffect(() => {
        fetchInitialData();
        // Auto-refresh every 30 seconds
        const interval = setInterval(fetchSessions, 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchInitialData = async () => {
        try {
            setLoading(true);
            
            // Try API first
            let rId = null;
            try {
                const profileRes = await restaurantAPI.getCurrentRestaurant();
                rId = profileRes.data?.data?.restaurant?._id || profileRes.data?.data?._id;
            } catch (e) {
                console.warn("API profile fetch failed, trying local storage");
            }

            // Fallback to local storage if API fails
            if (!rId) {
                const userStr = localStorage.getItem("restaurant_user");
                if (userStr) {
                    const userData = JSON.parse(userStr);
                    rId = userData._id || userData.id || userData.restaurantId;
                }
            }

            if (rId) {
                setRestaurantId(rId);
                await fetchSessions(rId);
            } else {
                toast.error("Could not identify restaurant. Please re-login.");
            }
        } catch (err) {
            toast.error("Failed to load restaurant info");
        } finally {
            setLoading(false);
        }
    };

    const fetchSessions = async (rId = restaurantId) => {
        if (!rId) return;
        setRefreshing(true);
        try {
            // In a better implementation, we'd have a specific "active-orders" endpoint
            // For now, we list tables and filter for those with active sessions
            const res = await dineInAPI.listTables(rId);
            if (res.data?.success) {
                const activeTables = res.data.data.filter(t => t.currentSessionId);
                
                // Fetch each active session detailed orders
                const sessionDetails = await Promise.all(
                    activeTables.map(async (table) => {
                        const sRes = await dineInAPI.getSession(table.currentSessionId);
                        return { 
                            ...sRes.data.data, 
                            tableLabel: table.tableLabel,
                            tableNumber: table.tableNumber 
                        };
                    })
                );
                
                // Sort by last order timestamp
                setSessions(sessionDetails.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)));
            }
        } catch (err) {
            console.error(err);
        } finally {
            setRefreshing(false);
        }
    };

    const updateStatus = async (orderId, newStatus) => {
        try {
            const res = await dineInAPI.updateOrderStatus(orderId, { status: newStatus });
            if (res.data?.success) {
                toast.success(`Order marked as ${newStatus}`);
                fetchSessions();
            }
        } catch (err) {
            toast.error("Failed to update status");
        }
    };

    const getStatusConfig = (status) => {
        switch(status) {
            case 'received': return { color: 'bg-blue-100 text-blue-600', icon: <Bell className="w-3 h-3" />, label: 'Received' };
            case 'preparing': return { color: 'bg-orange-100 text-orange-600', icon: <Flame className="w-3 h-3" />, label: 'Preparing' };
            case 'ready': return { color: 'bg-purple-100 text-purple-600', icon: <PackageCheck className="w-3 h-3" />, label: 'Ready' };
            case 'served': return { color: 'bg-green-100 text-green-600', icon: <CheckCircle2 className="w-3 h-3" />, label: 'Served' };
            default: return { color: 'bg-gray-100 text-gray-600', icon: <Clock className="w-3 h-3" />, label: status };
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center p-20">
            <Loader2 className="w-8 h-8 text-[#00c87e] animate-spin" />
        </div>
    );

    return (
        <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8 pb-32">
            
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-col">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate("/food/restaurant/explore")}
                            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer text-gray-900 shrink-0"
                            aria-label="Go back"
                        >
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                        <h1 className="text-2xl font-black text-gray-900">Live Dine-In Orders</h1>
                    </div>
                    <p className="text-gray-500 font-medium mt-1 pl-[48px]">Manage active orders across all tables in real-time.</p>
                </div>
                <Button 
                    variant="outline"
                    onClick={() => fetchSessions()}
                    className="rounded-2xl border-gray-200 px-6 flex items-center gap-2 group"
                >
                    <RefreshCw className={`w-4 h-4 text-gray-400 group-hover:text-[#00c87e] ${refreshing ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {/* Orders Feed */}
            <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-8">
                {sessions.map((session) => (
                    <motion.div
                        layout
                        key={session._id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-[2.5rem] shadow-xl shadow-gray-200/50 overflow-hidden border border-gray-50 flex flex-col"
                    >
                        {/* Table Header */}
                        <div className="bg-gray-50/50 p-6 flex justify-between items-center border-b border-gray-100">
                            <div>
                                <h3 className="text-xl font-black text-gray-900">Table {session.tableNumber}</h3>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{session.tableLabel || 'Ground Floor'}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Active Since</p>
                                <p className="text-xs font-bold text-gray-700">{new Date(session.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                        </div>

                        {/* Order Rounds */}
                        <div className="p-6 flex-1 space-y-8 overflow-y-auto">
                            {(session.orders || []).slice().reverse().map((order, oIdx) => (
                                <div key={order._id || oIdx} className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center">
                                                <Hash className="w-4 h-4 text-blue-500" />
                                            </div>
                                            <span className="text-xs font-black text-gray-900 uppercase">Round {session.orders.length - oIdx}</span>
                                        </div>
                                        <span className="text-[10px] font-bold text-gray-300">{new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>

                                    <div className="space-y-3 pl-2 border-l-2 border-gray-100">
                                        {(order.items || []).map((item, iIdx) => {
                                            const config = getStatusConfig(item.status);
                                            return (
                                                <div key={iIdx} className="flex items-center justify-between group">
                                                    <div className="flex-1">
                                                        <h4 className="text-sm font-bold text-gray-800">{item.name} <span className="text-[#00c87e]">x{item.quantity}</span></h4>
                                                        <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full mt-1 ${config.color}`}>
                                                            {config.icon}
                                                            <span className="text-[10px] font-bold uppercase tracking-tighter">{config.label}</span>
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Status Action Buttons */}
                                                    <div className="flex items-center gap-1">
                                                        {item.status === 'received' && (
                                                            <Button 
                                                                size="sm" 
                                                                onClick={() => updateStatus(order._id, 'preparing')}
                                                                className="h-8 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-[10px] px-2"
                                                            >
                                                                Cook
                                                            </Button>
                                                        )}
                                                        {item.status === 'preparing' && (
                                                            <Button 
                                                                size="sm" 
                                                                onClick={() => updateStatus(order._id, 'ready')}
                                                                className="h-8 rounded-lg bg-purple-500 hover:bg-purple-600 text-white font-bold text-[10px] px-2"
                                                            >
                                                                Ready
                                                            </Button>
                                                        )}
                                                        {item.status === 'ready' && (
                                                            <Button 
                                                                size="sm" 
                                                                onClick={() => updateStatus(order._id, 'served')}
                                                                className="h-8 rounded-lg bg-green-500 hover:bg-green-600 text-white font-bold text-[10px] px-2"
                                                            >
                                                                Serve
                                                            </Button>
                                                        )}
                                                        {item.status === 'served' && (
                                                            <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center">
                                                                <Check className="w-4 h-4 text-green-500" />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Footer Totals */}
                        <div className="p-6 bg-gray-50/50 border-t border-gray-100 flex justify-between items-center">
                            <div>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Grand Total</p>
                                <p className="text-lg font-black text-gray-900">₹{session.totalAmount || 0}</p>
                            </div>
                            <Button 
                                variant="outline"
                                className="rounded-xl border-gray-200 text-gray-500 font-bold text-xs flex items-center gap-2"
                                onClick={() => {
                                    const printWindow = window.open("", "_blank", "width=800,height=900");
                                    if (!printWindow) {
                                        toast.error("Popup blocked. Please allow popups to print.");
                                        return;
                                    }
                                    
                                    const itemsHtml = (session.orders || []).flatMap((order, oIdx) => 
                                        (order.items || []).map(item => `
                                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                                <div>${item.name} x${item.quantity} <span style="font-size: 10px; color: #666;">(Round ${session.orders.length - oIdx})</span></div>
                                                <div>₹${(item.price * item.quantity).toFixed(2)}</div>
                                            </div>
                                        `)
                                    ).join('');

                                    const subtotal = session.subtotal || session.orders?.reduce((sum, o) => sum + (o.subtotal || 0), 0) || 0;
                                    const taxAmount = session.taxAmount || session.billingSnapshot?.summary?.taxAmount || 0;
                                    const platformFee = session.billingSnapshot?.summary?.platformFee || 0;
                                    const gstRate = session.billingSnapshot?.summary?.gstRate || 5;

                                    printWindow.document.write(`
                                        <html>
                                            <head>
                                                <title>Bill - Table ${session.tableNumber}</title>
                                                <style>
                                                    body { font-family: monospace; padding: 40px; max-width: 400px; margin: 0 auto; color: #000; }
                                                    .header { text-align: center; margin-bottom: 30px; border-bottom: 1px dashed #000; padding-bottom: 20px; }
                                                    .total-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
                                                    .grand-total { display: flex; justify-content: space-between; font-weight: bold; font-size: 18px; border-top: 1px dashed #000; padding-top: 15px; margin-top: 15px; }
                                                    @media print { body { padding: 0; } }
                                                </style>
                                            </head>
                                            <body>
                                                <div class="header">
                                                    <h2>Table ${session.tableNumber}</h2>
                                                    <p>${session.tableLabel || 'Dine-In Order'}</p>
                                                    <p>Time: ${new Date().toLocaleTimeString()}</p>
                                                </div>
                                                <div style="margin-bottom: 20px; border-bottom: 1px dashed #000; padding-bottom: 20px;">
                                                    ${itemsHtml || '<div>No items ordered yet</div>'}
                                                </div>
                                                
                                                <div class="total-row">
                                                    <span>Subtotal</span>
                                                    <span>₹${subtotal}</span>
                                                </div>
                                                <div class="total-row">
                                                    <span>Platform Fee</span>
                                                    <span>₹${platformFee}</span>
                                                </div>
                                                <div class="total-row">
                                                    <span>Taxes & GST (${gstRate}%)</span>
                                                    <span>₹${taxAmount}</span>
                                                </div>
                                                
                                                <div class="grand-total">
                                                    <span>Grand Total</span>
                                                    <span>₹${session.totalAmount || 0}</span>
                                                </div>
                                                <div style="text-align: center; margin-top: 40px; font-size: 12px; color: #666;">
                                                    Thank you for dining with us!
                                                </div>
                                                <script>
                                                    window.onload = () => { window.print(); }
                                                </script>
                                            </body>
                                        </html>
                                    `);
                                    printWindow.document.close();
                                }}
                            >
                                <Printer className="w-3.5 h-3.5" />
                                Print Bill
                            </Button>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Empty State */}
            {sessions.length === 0 && (
                <div className="text-center py-32 bg-white rounded-[3rem] border border-dashed border-gray-200">
                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Utensils className="w-10 h-10 text-gray-200" />
                    </div>
                    <h3 className="text-2xl font-black text-gray-300">No active dine-in sessions</h3>
                    <p className="text-gray-400 mt-2 font-medium">Orders will appear here as customers scan and order.</p>
                </div>
            )}
        </div>
    );
};

export default DineInOrders;
