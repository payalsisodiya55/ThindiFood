import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Camera, Loader2, QrCode } from "lucide-react";
import { Button } from "@food/components/ui/button";
import AnimatedPage from "@food/components/user/AnimatedPage";

function parseQrPayload(rawText) {
  const raw = String(rawText || "").trim();
  if (!raw) return null;

  try {
    const json = JSON.parse(raw);
    const restaurantId = String(json.restaurantId || json.r || "").trim();
    const tableNumber = String(
      json.tableNumber || json.table || json.tableId || json.t || ""
    ).trim();
    if (restaurantId && tableNumber) return { restaurantId, tableNumber };
  } catch (_) {}

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

export default function ScanAndDine() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const detectorRef = useRef(null);
  const scanningRef = useRef(false);
  const lastScanRef = useRef("");

  const [scannerStatus, setScannerStatus] = useState("idle");
  const [rawInput, setRawInput] = useState("");
  const [error, setError] = useState("");
  const [cameraEnabled, setCameraEnabled] = useState(false);

  const canUseBarcodeDetector = useMemo(() => {
    return typeof window !== "undefined" && "BarcodeDetector" in window;
  }, []);

  const cleanupScanner = () => {
    scanningRef.current = false;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const completeWithPayload = (payload) => {
    if (!payload) return;
    const q = new URLSearchParams({
      r: payload.restaurantId,
      t: payload.tableNumber,
    }).toString();
    cleanupScanner();
    navigate(`/food/user/dine-in/entry?${q}`, { replace: true });
  };

  const detectLoop = async () => {
    if (!scanningRef.current || !detectorRef.current || !videoRef.current) return;

    try {
      const codes = await detectorRef.current.detect(videoRef.current);
      if (Array.isArray(codes) && codes.length > 0) {
        const rawValue = String(codes[0]?.rawValue || "").trim();
        if (rawValue && rawValue !== lastScanRef.current) {
          lastScanRef.current = rawValue;
          const payload = parseQrPayload(rawValue);
          if (payload) {
            completeWithPayload(payload);
            return;
          }
          setError("QR scanned but format is invalid. Use ThindiFood dine-in QR.");
        }
      }
    } catch (_) {}

    rafRef.current = requestAnimationFrame(detectLoop);
  };

  const startCameraScanner = async () => {
    setError("");
    setScannerStatus("starting");
    cleanupScanner();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      detectorRef.current = new window.BarcodeDetector({
        formats: ["qr_code"],
      });
      scanningRef.current = true;
      setScannerStatus("scanning");
      detectLoop();
    } catch (e) {
      setScannerStatus("error");
      setError("Camera access failed. Allow camera permission or paste QR text below.");
      cleanupScanner();
    }
  };

  const handleManualContinue = () => {
    setError("");
    const payload = parseQrPayload(rawInput);
    if (!payload) {
      setError("Invalid QR input. Paste full QR URL or JSON payload.");
      return;
    }
    completeWithPayload(payload);
  };

  useEffect(() => {
    if (cameraEnabled && canUseBarcodeDetector) {
      startCameraScanner();
    }
    return () => cleanupScanner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraEnabled, canUseBarcodeDetector]);

  return (
    <AnimatedPage className="min-h-screen bg-[#fafafa] px-4 py-6">
      <div className="mx-auto w-full max-w-xl space-y-5">
        <div className="rounded-3xl bg-white p-6 shadow-sm border border-gray-100">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-green-50">
              <QrCode className="h-6 w-6 text-[#00c87e]" />
            </div>
            <div>
              <h1 className="text-xl font-black text-gray-900">Scan & Dine</h1>
              <p className="text-xs text-gray-500">Scan table QR to start dine-in session.</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-black">
            <video
              ref={videoRef}
              className="h-[280px] w-full object-cover"
              muted
              playsInline
              autoPlay
            />
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Button
              onClick={() => setCameraEnabled(true)}
              className="bg-[#00c87e] hover:bg-[#00b06f] text-white"
              disabled={cameraEnabled && scannerStatus === "scanning"}
            >
              {scannerStatus === "starting" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting Camera
                </>
              ) : (
                <>
                  <Camera className="mr-2 h-4 w-4" />
                  Start Camera Scan
                </>
              )}
            </Button>
          </div>

          {!canUseBarcodeDetector && (
            <p className="mt-3 text-xs text-amber-600">
              Camera QR decode is not supported on this browser. Use manual input below.
            </p>
          )}
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm border border-gray-100">
          <p className="mb-2 text-sm font-bold text-gray-800">Manual QR Input (Fallback)</p>
          <textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            rows={4}
            placeholder='Paste QR URL (example: .../dine-in?r=REST_ID&t=T1)'
            className="w-full rounded-2xl border border-gray-200 p-3 text-sm outline-none focus:border-[#00c87e]"
          />
          <Button
            onClick={handleManualContinue}
            className="mt-3 bg-black hover:bg-gray-800 text-white"
          >
            Continue
          </Button>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
      </div>
    </AnimatedPage>
  );
}

