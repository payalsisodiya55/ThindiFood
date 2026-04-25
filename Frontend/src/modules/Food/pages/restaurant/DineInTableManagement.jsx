import React, { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";
import { 
    Plus, QrCode, Users, Trash2, Download, 
    Loader2, AlertCircle, CheckCircle2, MoreVertical, 
    Printer, Info, Search, Utensils
} from "lucide-react";
import { Button } from "@food/components/ui/button";
import { Card, CardContent } from "@food/components/ui/card";
import { Badge } from "@food/components/ui/badge";
import { dineInAPI, restaurantAPI } from "@food/api";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

const DineInTableManagement = () => {
    const [loading, setLoading] = useState(true);
    const [tables, setTables] = useState([]);
    const [restaurantId, setRestaurantId] = useState(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [addingTable, setAddingTable] = useState(false);
    
    // Form state
    const [newTable, setNewTable] = useState({
        tableNumber: "",
        tableLabel: "",
        capacity: 4
    });

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        try {
            setLoading(true);
            // 1. Get current restaurant context
            const profileRes = await restaurantAPI.getCurrentRestaurant();
            const payload = profileRes?.data?.data || {};
            const restaurant = payload?.restaurant || payload;
            const rId =
                restaurant?._id ||
                restaurant?.id ||
                restaurant?.restaurantId ||
                null;
            
            if (!rId) throw new Error("Could not find restaurant profile");
            setRestaurantId(rId);

            // 2. Fetch tables
            const tableRes = await dineInAPI.listTables(rId);
            if (tableRes.data?.success) {
                setTables(tableRes.data.data);
            }
        } catch (err) {
            toast.error("Failed to load table data");
        } finally {
            setLoading(false);
        }
    };

    const handleAddTable = async (e) => {
        e.preventDefault();
        if (!restaurantId) {
            toast.error("Restaurant profile not loaded. Please refresh and try again.");
            return;
        }

        const normalizedTableNumber = String(newTable.tableNumber || "").trim();
        if (!normalizedTableNumber) {
            toast.error("Table number is required");
            return;
        }

        try {
            setAddingTable(true);
            const res = await dineInAPI.addTable({
                restaurantId,
                ...newTable,
                tableNumber: normalizedTableNumber,
            });

            if (res.data?.success) {
                toast.success("Table added successfully!");
                setShowAddModal(false);
                setNewTable({ tableNumber: "", tableLabel: "", capacity: 4 });
                fetchInitialData();
            } else {
                toast.error(res.data?.message || "Failed to add table");
            }
        } catch (err) {
            toast.error(err.response?.data?.message || "Error adding table");
        } finally {
            setAddingTable(false);
        }
    };

    // Generate a QR data-URL from the qrCodeUrl string using local `qrcode` library
    const generateQrDataUrl = useCallback(async (url, size = 500) => {
        try {
            return await QRCode.toDataURL(url, {
                width: size,
                margin: 2,
                color: { dark: "#0f172a", light: "#ffffff" },
                errorCorrectionLevel: "H",
            });
        } catch {
            return "";
        }
    }, []);

    const toSafeText = (value) =>
        String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

    const triggerDownload = (href, fileName) => {
        const link = document.createElement("a");
        link.href = href;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const downloadQR = async (table) => {
        const fileName = `Table_${table.tableNumber}_QR.png`;
        try {
            const dataUrl = await generateQrDataUrl(table?.qrCodeUrl || "", 700);
            if (!dataUrl) throw new Error("QR generation failed");
            triggerDownload(dataUrl, fileName);
            toast.success(`Table ${table.tableNumber} QR downloaded`);
        } catch {
            toast.error("Failed to generate QR for download");
        }
    };

    const openQrPreview = async (table, autoPrint = false) => {
        const tableNumber = toSafeText(table?.tableNumber || "");
        const tableLabel = toSafeText(table?.tableLabel || "Table");
        const capacity = toSafeText(table?.capacity || "");
        const qrTarget = toSafeText(table?.qrCodeUrl || "");

        // Generate QR as inline data URL (no external API needed)
        const qrDataUrl = await generateQrDataUrl(table?.qrCodeUrl || "", 700);

        const previewWindow = window.open("", "_blank", "width=760,height=900");
        if (!previewWindow) {
            toast.error("Popup blocked. Please allow popups to preview/print QR.");
            return;
        }

        previewWindow.document.write(`
            <!doctype html>
            <html>
            <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>Table #${tableNumber} QR</title>
                <style>
                    body { margin: 0; font-family: Inter, Arial, sans-serif; background: #f5f7fb; color: #0f172a; }
                    .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
                    .card { width: min(520px, 100%); background: #fff; border-radius: 20px; padding: 24px; box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12); }
                    .title { font-size: 28px; font-weight: 800; margin: 0; }
                    .sub { margin: 6px 0 16px; color: #64748b; font-weight: 600; }
                    .qr-box { border: 1px solid #e2e8f0; border-radius: 16px; padding: 14px; background: #fff; }
                    .qr { width: 100%; height: auto; display: block; }
                    .meta { margin-top: 14px; font-size: 13px; color: #475569; line-height: 1.5; word-break: break-all; }
                    .actions { margin-top: 16px; display: flex; gap: 10px; }
                    .btn { border: 0; border-radius: 10px; padding: 10px 14px; font-size: 13px; font-weight: 700; cursor: pointer; }
                    .btn-print { background: #10b981; color: #fff; }
                    .btn-download { background: #e2e8f0; color: #0f172a; }
                    @media print {
                        body { background: #fff; }
                        .wrap { padding: 0; }
                        .card { box-shadow: none; border: 0; width: 100%; max-width: 100%; border-radius: 0; }
                        .actions { display: none !important; }
                    }
                </style>
            </head>
            <body>
                <div class="wrap">
                    <div class="card">
                        <h1 class="title">Table #${tableNumber}</h1>
                        <p class="sub">${tableLabel} ${capacity ? `| Capacity: ${capacity}` : ""}</p>
                        <div class="qr-box">
                            <img id="qrImage" class="qr" src="${qrDataUrl}" alt="Table QR" />
                        </div>
                        <div class="meta">Scan URL: ${qrTarget}</div>
                        <div class="actions">
                            <button class="btn btn-print" onclick="window.print()">Print</button>
                            <button class="btn btn-download" onclick="const a=document.createElement('a');a.href='${qrDataUrl}';a.download='Table_${tableNumber}_QR.png';a.click();">Download</button>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `);
        previewWindow.document.close();

        if (autoPrint) {
            previewWindow.onload = () => {
                previewWindow.focus();
                previewWindow.print();
            };
        }
    };

    const printQR = (table) => {
        openQrPreview(table, true);
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
                <div>
                    <h1 className="text-3xl font-black text-gray-900">Table Management</h1>
                    <p className="text-gray-500 font-medium">Create and manage QR codes for your restaurant tables.</p>
                </div>
                <Button 
                    onClick={() => setShowAddModal(true)}
                    className="bg-[#00c87e] hover:bg-[#00b06f] text-white px-6 py-6 rounded-2xl font-bold shadow-lg shadow-green-100 flex items-center gap-2"
                >
                    <Plus className="w-5 h-5" />
                    Add New Table
                </Button>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <Card className="bg-white border-none shadow-sm rounded-3xl overflow-hidden">
                    <CardContent className="p-6 flex items-center gap-4">
                        <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center">
                            <Utensils className="w-6 h-6 text-[#00c87e]" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Total Tables</p>
                            <h4 className="text-2xl font-black text-gray-900">{tables.length}</h4>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-white border-none shadow-sm rounded-3xl overflow-hidden">
                    <CardContent className="p-6 flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center">
                            <Users className="w-6 h-6 text-blue-500" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Active Sessions</p>
                            <h4 className="text-2xl font-black text-gray-900">
                                {tables.filter(t => t.currentSessionId).length}
                            </h4>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-white border-none shadow-sm rounded-3xl overflow-hidden">
                    <CardContent className="p-6 flex items-center gap-4">
                        <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center">
                            <QrCode className="w-6 h-6 text-purple-500" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">QR System</p>
                            <h4 className="text-2xl font-black text-gray-900">Active</h4>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Table Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                {tables.map((table) => (
                    <motion.div
                        layout
                        key={table._id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white rounded-[2rem] shadow-md border border-gray-50 overflow-hidden group hover:shadow-xl transition-all"
                    >
                        <div className="p-6">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h3 className="text-2xl font-black text-gray-900">#{table.tableNumber}</h3>
                                    <p className="text-sm text-gray-400 font-bold">{table.tableLabel}</p>
                                </div>
                                {table.currentSessionId ? (
                                    <Badge className="bg-green-100 text-green-600 border-none rounded-full px-3 py-1 text-[10px] font-black uppercase">Occupied</Badge>
                                ) : (
                                    <Badge className="bg-gray-100 text-gray-400 border-none rounded-full px-3 py-1 text-[10px] font-black uppercase">Vacant</Badge>
                                )}
                            </div>

                            {/* QR Section */}
                            <div className="bg-gray-50 rounded-3xl p-6 mb-6">
                                <QrCanvas url={table.qrCodeUrl} />
                                <div className="mt-4 pt-4 border-t border-gray-200/60">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Manual QR Data</p>
                                    <div 
                                        title="Click to copy"
                                        onClick={() => {
                                            navigator.clipboard.writeText(table.qrCodeUrl);
                                            toast.success(`Table ${table.tableNumber} QR URL copied!`);
                                        }}
                                        className="bg-white border border-gray-100 rounded-2xl p-4 text-[11px] font-mono text-gray-500 break-all cursor-copy hover:bg-white hover:border-[#00c87e]/30 transition-all active:scale-[0.98] shadow-sm select-all"
                                    >
                                        {table.qrCodeUrl}
                                    </div>
                                </div>
                            </div>

                            {/* Action Buttons - Always Visible */}
                            <div className="grid grid-cols-2 gap-3 mb-6">
                                <Button 
                                    onClick={() => downloadQR(table)}
                                    className="bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-2xl font-bold h-12 gap-2 text-xs"
                                >
                                    <Download className="w-4 h-4" /> Download
                                </Button>
                                <Button 
                                    onClick={() => printQR(table)}
                                    className="bg-white border border-[#00c87e]/30 text-[#00a86c] hover:bg-[#00c87e]/10 rounded-2xl font-bold h-12 gap-2 text-xs"
                                >
                                    <Printer className="w-4 h-4" /> Print
                                </Button>
                            </div>

                            <div className="flex items-center justify-between text-xs font-bold text-gray-400 uppercase tracking-widest pt-4 border-t border-gray-100">
                                <div className="flex items-center gap-1.5">
                                    <Users className="w-3.5 h-3.5" />
                                    <span>Cap: {table.capacity}</span>
                                </div>
                                <button className="p-2 text-red-100 hover:text-red-500 rounded-xl transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Empty State */}
            {tables.length === 0 && (
                <div className="text-center py-20 bg-white rounded-[3rem] border border-dashed border-gray-200">
                    <QrCode className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-gray-400">No tables added yet</h3>
                    <Button 
                        variant="link" 
                        onClick={() => setShowAddModal(true)}
                        className="text-[#00c87e] font-bold"
                    >
                        Click here to add your first table
                    </Button>
                </div>
            )}

            {/* Add Table Modal */}
            <AnimatePresence>
                {showAddModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowAddModal(false)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        />
                        <motion.div 
                            initial={{ opacity: 0, y: 50, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 50, scale: 0.95 }}
                            className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl relative z-10 overflow-hidden"
                        >
                            <form onSubmit={handleAddTable} className="p-10">
                                <div className="flex items-center justify-between mb-8">
                                    <h2 className="text-2xl font-black text-gray-900">New Table</h2>
                                    <button 
                                        type="button"
                                        onClick={() => setShowAddModal(false)}
                                        className="p-2 bg-gray-50 rounded-full text-gray-400 hover:text-gray-900 transition-colors"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="space-y-6">
                                    <div>
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2 mb-2 block">Table Number</label>
                                        <input 
                                            required
                                            type="number" 
                                            value={newTable.tableNumber}
                                            onChange={(e) => setNewTable({...newTable, tableNumber: e.target.value})}
                                            placeholder="e.g. 1, 5, 12"
                                            className="w-full bg-gray-100 border-none rounded-2xl py-4 px-6 text-lg font-bold focus:ring-2 focus:ring-[#00c87e]/20"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2 mb-2 block">Label (Optional)</label>
                                        <input 
                                            type="text" 
                                            value={newTable.tableLabel}
                                            onChange={(e) => setNewTable({...newTable, tableLabel: e.target.value})}
                                            placeholder="e.g. Window Side, Rooftop"
                                            className="w-full bg-gray-100 border-none rounded-2xl py-4 px-6 text-lg font-bold focus:ring-2 focus:ring-[#00c87e]/20"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2 mb-2 block">Seating Capacity</label>
                                        <input 
                                            required
                                            type="number" 
                                            value={newTable.capacity}
                                            onChange={(e) => setNewTable({...newTable, capacity: Number(e.target.value)})}
                                            className="w-full bg-gray-100 border-none rounded-2xl py-4 px-6 text-lg font-bold focus:ring-2 focus:ring-[#00c87e]/20"
                                        />
                                    </div>
                                </div>

                                <Button 
                                    disabled={addingTable}
                                    type="submit"
                                    className="w-full mt-10 py-8 rounded-3xl bg-[#00c87e] hover:bg-[#00b06f] text-white text-xl font-black shadow-xl shadow-green-100 flex items-center justify-center gap-3 transition-all active:scale-95"
                                >
                                    {addingTable ? <Loader2 className="w-6 h-6 animate-spin" /> : "Generate Table QR"}
                                </Button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

        </div>
    );
};


// --- Inline QR Canvas (uses local `qrcode` library - no external API) ---
function QrCanvas({ url }) {
    const canvasRef = useRef(null);
    useEffect(() => {
        if (!canvasRef.current || !url) return;
        QRCode.toCanvas(canvasRef.current, url, {
            width: 250,
            margin: 2,
            color: { dark: "#0f172a", light: "#ffffff" },
            errorCorrectionLevel: "H",
        }).catch(() => {});
    }, [url]);
    return React.createElement("canvas", { ref: canvasRef, className: "w-full h-auto rounded-xl" });
}
// Internal Close component
const X = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
);

export default DineInTableManagement;
