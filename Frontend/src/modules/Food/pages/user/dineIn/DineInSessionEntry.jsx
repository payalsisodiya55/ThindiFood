import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, Loader2, QrCode } from "lucide-react";
import { Button } from "@food/components/ui/button";
import AnimatedPage from "@food/components/user/AnimatedPage";
import { useProfile } from "@food/context/ProfileContext";
import { dineInAPI } from "@food/api";

export default function DineInSessionEntry() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { userProfile } = useProfile();
  const calledRef = useRef(false);

  const restaurantId = String(searchParams.get("r") || "").trim();
  const tableNumber = String(searchParams.get("t") || "").trim();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId || !tableNumber) {
      setLoading(false);
      setError("Invalid QR details. Please scan again.");
      return;
    }

    if (!userProfile) {
      const nextUrl = `/food/user/dine-in/entry?r=${encodeURIComponent(
        restaurantId
      )}&t=${encodeURIComponent(tableNumber)}`;
      navigate(`/user/auth/login?next=${encodeURIComponent(nextUrl)}`, {
        replace: true,
      });
      return;
    }

    if (calledRef.current) return;
    calledRef.current = true;

    const createSession = async () => {
      try {
        setLoading(true);
        const res = await dineInAPI.createSession({ restaurantId, tableNumber });
        if (!res.data?.success) {
          throw new Error(res.data?.message || "Unable to start table session");
        }

        const sessionId = res.data.data?._id;
        if (!sessionId) throw new Error("Session ID not found");

        localStorage.setItem("activeDineInSessionId", sessionId);
        navigate(`/user/dine-in/menu?sessionId=${sessionId}`, { replace: true });
      } catch (err) {
        setError(
          err?.response?.data?.message ||
            err?.message ||
            "Failed to start dine-in session."
        );
      } finally {
        setLoading(false);
      }
    };

    createSession();
  }, [navigate, restaurantId, tableNumber, userProfile]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white">
        <Loader2 className="mb-3 h-10 w-10 animate-spin text-[#00c87e]" />
        <p className="text-sm font-medium text-gray-500">Starting your table session...</p>
      </div>
    );
  }

  return (
    <AnimatedPage className="min-h-screen bg-[#fafafa] flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 border border-gray-100 shadow-sm text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
          <AlertCircle className="h-7 w-7 text-red-500" />
        </div>
        <h1 className="text-xl font-black text-gray-900">Could not start session</h1>
        <p className="mt-2 text-sm text-gray-600">{error || "Please scan again."}</p>
        <div className="mt-5 flex justify-center gap-3">
          <Button
            onClick={() => navigate("/user/dine-in/scan")}
            className="bg-[#00c87e] hover:bg-[#00b06f] text-white"
          >
            <QrCode className="mr-2 h-4 w-4" />
            Scan Again
          </Button>
          <Button variant="outline" onClick={() => navigate("/user/dining")}>
            Back
          </Button>
        </div>
      </div>
    </AnimatedPage>
  );
}

