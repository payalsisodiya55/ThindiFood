import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Truck, KeyRound, User } from "lucide-react";
import { deliveryBoyAPI } from "@food/api";
import { setAuthData } from "@food/utils/auth";

export default function DeliveryBoyLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await deliveryBoyAPI.login(username, password);
      const data = response?.data?.data || response?.data || {};
      setAuthData("delivery", data.accessToken, data.user, data.refreshToken || null);
      const redirect = searchParams.get("redirect") || "/food/delivery-boy/orders";
      navigate(redirect, { replace: true });
    } catch (err) {
      setError(
        err?.response?.data?.message || err?.message || "Login failed",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-orange-500/15 flex items-center justify-center">
            <Truck className="w-6 h-6 text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Delivery Boy Login</h1>
            <p className="text-sm text-slate-400">Sign in to manage self-delivery orders</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm text-slate-300 mb-2 block">Username</span>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3">
              <User className="w-4 h-4 text-slate-500" />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-transparent outline-none text-white"
                placeholder="Enter username"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-sm text-slate-300 mb-2 block">Password</span>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3">
              <KeyRound className="w-4 h-4 text-slate-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent outline-none text-white"
                placeholder="Enter password"
              />
            </div>
          </label>

          {error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold py-3"
          >
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
