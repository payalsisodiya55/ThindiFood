import { useEffect, useState } from "react";
import { ArrowLeft, AlertCircle, Plus, Eye, EyeOff } from "lucide-react";
import { restaurantAPI } from "@food/api";
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation";
import { toast } from "sonner";

const EMPTY_FORM = {
  name: "",
  phone: "",
  username: "",
  password: "",
};

const normalizeSelfDeliveryApprovalStatus = (restaurant) => {
  const selfDelivery = restaurant?.selfDelivery || {};
  const rawStatus = String(selfDelivery?.approvalStatus || "none").toLowerCase();

  if (
    selfDelivery?.enabled === true &&
    !["pending", "rejected", "approved"].includes(rawStatus)
  ) {
    return "approved";
  }

  return rawStatus;
};

export default function DeliveryBoyManagement() {
  const goBack = useRestaurantBackNavigation();
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selfDeliveryApprovalStatus, setSelfDeliveryApprovalStatus] = useState("none");

  const canManageDeliveryBoys =
    selfDeliveryApprovalStatus === "approved";

  const loadDeliveryBoys = async () => {
    const response = await restaurantAPI.getDeliveryBoys();
    setDeliveryBoys(response?.data?.data?.deliveryBoys || []);
  };

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const [deliveryBoyResponse, restaurantResponse] = await Promise.all([
          restaurantAPI.getDeliveryBoys(),
          restaurantAPI.getCurrentRestaurant(),
        ]);
        const restaurant =
          restaurantResponse?.data?.data?.restaurant ||
          restaurantResponse?.data?.restaurant ||
          null;
        setDeliveryBoys(deliveryBoyResponse?.data?.data?.deliveryBoys || []);
        setSelfDeliveryApprovalStatus(normalizeSelfDeliveryApprovalStatus(restaurant));
      } finally {
        if (active) setLoading(false);
      }
    };
    run();
    return () => {
      active = false;
    };
  }, []);

  const validateForm = () => {
    const newErrors = {};

    if (!form.name.trim()) {
      newErrors.name = "Name is required";
    } else if (!/^[a-zA-Z\s]+$/.test(form.name)) {
      newErrors.name = "Name should only contain alphabets and spaces";
    }

    if (!form.phone) {
      newErrors.phone = "Phone number is required";
    } else if (!/^\d{10}$/.test(form.phone)) {
      newErrors.phone = "Phone must be exactly 10 digits";
    }

    if (!form.username.trim()) {
      newErrors.username = "Username is required";
    } else if (!/^[a-zA-Z0-9_]+$/.test(form.username)) {
      newErrors.username = "Username can only contain letters, numbers, and underscores";
    } else if (form.username.length < 3) {
      newErrors.username = "Username must be at least 3 characters";
    }

    if (!form.password) {
      newErrors.password = "Password is required";
    } else if (form.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canManageDeliveryBoys) return;

    if (!validateForm()) {
      toast.error("Please fix the errors in the form");
      return;
    }

    setSubmitting(true);
    try {
      await restaurantAPI.createDeliveryBoy(form);
      setForm(EMPTY_FORM);
      setErrors({});
      toast.success("Delivery boy created successfully");
      await loadDeliveryBoys();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to create delivery boy");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (deliveryBoy) => {
    if (!canManageDeliveryBoys) return;
    await restaurantAPI.updateDeliveryBoy(deliveryBoy._id, {
      isActive: deliveryBoy.isActive !== true,
    });
    await loadDeliveryBoys();
  };

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={goBack} className="p-2 rounded-xl bg-white border border-gray-200">
            <ArrowLeft className="w-5 h-5 text-gray-900" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Delivery Boy Management</h1>
            <p className="text-sm text-gray-500">Create and manage your self-delivery team</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="rounded-3xl bg-white border border-gray-200 p-5 space-y-4">
          {!canManageDeliveryBoys ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800">
                Delivery boys can be managed only after self-delivery is approved by admin.
              </p>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-gray-600" />
            <h2 className="font-semibold text-gray-900">Add Delivery Boy</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              ["name", "Name", 40],
              ["phone", "Phone", 10],
              ["username", "Username", 20],
              ["password", "Password", 32],
            ].map(([key, label, max]) => (
              <label key={key} className="block">
                <span className="text-sm font-medium text-gray-700">{label}</span>
                <div className="relative mt-1">
                  <input
                    type={key === "password" ? (showPassword ? "text" : "password") : "text"}
                    value={form[key]}
                    maxLength={max}
                    onChange={(e) => {
                      let val = e.target.value;
                      if (key === "phone") val = val.replace(/\D/g, "").slice(0, 10);
                      if (key === "name") val = val.replace(/[^a-zA-Z\s]/g, "");
                      if (key === "username") val = val.replace(/[^a-zA-Z0-9_]/g, "");
                      
                      setForm((prev) => ({ ...prev, [key]: val }));
                      if (errors[key]) setErrors((prev) => ({ ...prev, [key]: null }));
                    }}
                    disabled={!canManageDeliveryBoys}
                    placeholder={`Enter ${label.toLowerCase()}`}
                    className={`w-full rounded-xl border px-3 py-2.5 outline-none transition-all ${
                      key === "password" ? "pr-10" : ""
                    } ${
                      errors[key] 
                        ? "border-red-500 bg-red-50 focus:border-red-600 focus:ring-2 focus:ring-red-100" 
                        : "border-gray-300 focus:border-gray-900 focus:ring-2 focus:ring-gray-100"
                    } disabled:bg-gray-50 disabled:text-gray-500`}
                  />
                  {key === "password" && (
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                </div>
                {errors[key] && (
                  <p className="mt-1 text-[10px] font-medium text-red-500 ml-1 italic flex items-center gap-1">
                    <AlertCircle className="w-2.5 h-2.5" />
                    {errors[key]}
                  </p>
                )}
              </label>
            ))}
          </div>
          <button
            type="submit"
            disabled={submitting || !canManageDeliveryBoys}
            className="rounded-xl bg-gray-900 text-white px-4 py-3 font-semibold disabled:opacity-60"
          >
            {submitting ? "Creating..." : "Create Delivery Boy"}
          </button>
        </form>

        <div className="rounded-3xl bg-white border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Delivery Boys</h2>
          {loading ? <p className="text-sm text-gray-500">Loading...</p> : null}
          {!loading && deliveryBoys.length === 0 ? (
            <p className="text-sm text-gray-500">No delivery boys added yet.</p>
          ) : null}
          <div className="space-y-3">
            {deliveryBoys.map((deliveryBoy) => (
              <div
                key={deliveryBoy._id}
                className="rounded-2xl border border-gray-200 px-4 py-3 flex items-center justify-between gap-4"
              >
                <div>
                  <p className="font-semibold text-gray-900">{deliveryBoy.name}</p>
                  <p className="text-sm text-gray-500">
                    {deliveryBoy.phone} · @{deliveryBoy.username}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Current Order: {deliveryBoy.currentOrderId?.orderId || "None"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle(deliveryBoy)}
                  disabled={!canManageDeliveryBoys}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                    deliveryBoy.isActive
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-700"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {deliveryBoy.isActive ? "Active" : "Inactive"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
