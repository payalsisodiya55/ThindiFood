import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Camera, Loader2, QrCode, StopCircle } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@food/components/ui/button";
import AnimatedPage from "@food/components/user/AnimatedPage";

// ─── Parse QR payload ───────────────────────────────────────────────
function parseQrPayload(rawText) {
  const raw = String(rawText || "").trim();
  if (!raw) return null;

  // 1. Try JSON
  try {
    const json = JSON.parse(raw);
    const restaurantId = String(json.restaurantId || json.r || "").trim();
    const tableNumber = String(
      json.tableNumber || json.table || json.tableId || json.t || ""
    ).trim();
    if (restaurantId && tableNumber) return { restaurantId, tableNumber };
  } catch (_) {}

  // 2. Try URL with query params
  try {
    const url = new URL(raw);
    const restaurantId = String(
      url.searchParams.get("restaurantId") || url.searchParams.get("r") || ""
    ).trim();
    const tableNumber = String(
      url.searchParams.get("tableNumber") ||
        url.searchParams.get("table") ||
        url.searchParams.get("tableId") ||
        url.searchParams.get("t") ||
        ""
    ).trim();
    if (restaurantId && tableNumber) return { restaurantId, tableNumber };
  } catch (_) {}

  return null;
}

const SCANNER_ELEMENT_ID = "thindi-qr-reader";

export default function ScanAndDine() {
  const navigate = useNavigate();
  const scannerRef = useRef(null); // Html5Qrcode instance
  const isScanningRef = useRef(false);

  const [scannerStatus, setScannerStatus] = useState("idle"); // idle | starting | scanning | stopped | error
  const [rawInput, setRawInput] = useState("");
  const [error, setError] = useState("");
  const [cameras, setCameras] = useState([]); // available camera devices
  const [selectedCamera, setSelectedCamera] = useState("environment"); // "environment" | deviceId

  // ─── Cleanup on unmount ───────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Load cameras list ────────────────────────────────────────────
  useEffect(() => {
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (devices && devices.length) setCameras(devices);
      })
      .catch(() => {
        // Permission not yet granted — ignore until user clicks Start
      });
  }, []);

  // ─── Stop scanner ─────────────────────────────────────────────────
  const stopScanner = async () => {
    if (scannerRef.current && isScanningRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (_) {}
      isScanningRef.current = false;
    }
    setScannerStatus("stopped");
  };

  // ─── Navigate on successful scan ─────────────────────────────────
  const completeWithPayload = async (payload) => {
    if (!payload) return;
    await stopScanner();
    const q = new URLSearchParams({
      r: payload.restaurantId,
      t: payload.tableNumber,
    }).toString();
    navigate(`/food/user/dine-in/entry?${q}`, { replace: true });
  };

  // ─── Start camera scanner ─────────────────────────────────────────
  const startScanner = async () => {
    setError("");
    setScannerStatus("starting");

    // Re-fetch cameras now (to get permission prompt)
    let deviceList = cameras;
    if (!deviceList.length) {
      try {
        deviceList = await Html5Qrcode.getCameras();
        setCameras(deviceList);
      } catch (e) {
        setError("Camera permission denied. Please allow camera access and try again.");
        setScannerStatus("error");
        return;
      }
    }

    if (!deviceList.length) {
      setError("No camera detected on this device.");
      setScannerStatus("error");
      return;
    }

    // Prefer back camera
    const backCamera = deviceList.find((d) =>
      /back|rear|environment/i.test(d.label)
    );
    const cameraId =
      selectedCamera !== "environment"
        ? selectedCamera
        : backCamera?.id || deviceList[0]?.id;

    try {
      // Create a fresh instance every time
      if (scannerRef.current) {
        try { scannerRef.current.clear(); } catch (_) {}
      }
      scannerRef.current = new Html5Qrcode(SCANNER_ELEMENT_ID);

      await scannerRef.current.start(
        cameraId,
        {
          fps: 10,
          qrbox: { width: 240, height: 240 },
          aspectRatio: 1.0,
          disableFlip: false,
        },
        // onScanSuccess
        (decodedText) => {
          const payload = parseQrPayload(decodedText);
          if (payload) {
            completeWithPayload(payload);
          } else {
            setError("QR scanned but format is invalid. Use ThindiFood dine-in QR.");
          }
        },
        // onScanFailure — silent (fires on every frame without QR)
        () => {}
      );

      isScanningRef.current = true;
      setScannerStatus("scanning");
    } catch (e) {
      const msg = String(e?.message || e || "");
      if (/permission/i.test(msg)) {
        setError("Camera permission denied. Please allow access in your browser settings.");
      } else {
        setError("Could not start camera. Try the manual input below.");
      }
      setScannerStatus("error");
    }
  };

  // ─── Manual input continue ────────────────────────────────────────
  const handleManualContinue = () => {
    setError("");
    const payload = parseQrPayload(rawInput);
    if (!payload) {
      setError("Invalid QR input. Paste the full QR URL or JSON payload.");
      return;
    }
    completeWithPayload(payload);
  };

  const isScanning = scannerStatus === "scanning";

  return (
    <AnimatedPage className="min-h-screen bg-[#fafafa] px-4 py-6">
      <div className="mx-auto w-full max-w-xl space-y-5">

        {/* ── Scanner Card ── */}
        <div className="rounded-3xl bg-white p-6 shadow-sm border border-gray-100">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-green-50">
              <QrCode className="h-6 w-6 text-[#00c87e]" />
            </div>
            <div>
              <h1 className="text-xl font-black text-gray-900">Scan &amp; Dine</h1>
              <p className="text-xs text-gray-500">Scan your table QR to start a dine-in session.</p>
            </div>
          </div>

          {/* Camera feed — html5-qrcode renders into this div */}
          <div
            id={SCANNER_ELEMENT_ID}
            className="overflow-hidden rounded-2xl border border-gray-200 bg-black"
            style={{ minHeight: 280 }}
          />

          {/* Camera selector — show only when multiple cameras exist */}
          {cameras.length > 1 && (
            <div className="mt-3">
              <select
                value={selectedCamera}
                onChange={(e) => setSelectedCamera(e.target.value)}
                disabled={isScanning}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#00c87e]"
              >
                <option value="environment">Back Camera (Auto)</option>
                {cameras.map((cam) => (
                  <option key={cam.id} value={cam.id}>
                    {cam.label || cam.id}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Buttons */}
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            {!isScanning ? (
              <Button
                onClick={startScanner}
                disabled={scannerStatus === "starting"}
                className="bg-[#00c87e] hover:bg-[#00b06f] text-white"
              >
                {scannerStatus === "starting" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Starting Camera…
                  </>
                ) : (
                  <>
                    <Camera className="mr-2 h-4 w-4" />
                    Start Camera Scan
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={stopScanner}
                className="bg-red-500 hover:bg-red-600 text-white"
              >
                <StopCircle className="mr-2 h-4 w-4" />
                Stop Scanner
              </Button>
            )}

            {isScanning && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-[#00c87e]">
                <span className="inline-block h-2 w-2 rounded-full bg-[#00c87e] animate-pulse" />
                Scanning…
              </span>
            )}
          </div>

          {/* Browser support note */}
          <p className="mt-3 text-[11px] text-gray-400">
            Works on Chrome, Safari, Firefox &amp; all mobile browsers.
          </p>
        </div>

        {/* ── Manual Fallback Card ── */}
        <div className="rounded-3xl bg-white p-6 shadow-sm border border-gray-100">
          <p className="mb-1 text-sm font-bold text-gray-800">Manual QR Input (Fallback)</p>
          <p className="mb-3 text-xs text-gray-400">
            If camera doesn't work, paste the QR URL or JSON here.
          </p>
          <textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            rows={4}
            placeholder="Paste QR URL (example: .../dine-in?r=REST_ID&t=T1)"
            className="w-full rounded-2xl border border-gray-200 p-3 text-sm outline-none focus:border-[#00c87e]"
          />
          <Button
            onClick={handleManualContinue}
            className="mt-3 bg-black hover:bg-gray-800 text-white"
          >
            Continue
          </Button>
        </div>

        {/* ── Error Banner ── */}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </AnimatedPage>
  );
}
