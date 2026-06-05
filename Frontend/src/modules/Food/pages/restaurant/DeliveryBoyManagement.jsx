import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  AlertCircle,
  Pencil,
  Eye,
  EyeOff,
  Trash2,
  X,
} from "lucide-react";
import { restaurantAPI } from "@food/api";
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation";
import { confirmApp } from "@shared/lib/appDialog";
import { toast } from "sonner";
import { RESTAURANT_THEME } from "@food/constants/restaurantTheme";

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

const getAvailabilityLabel = (deliveryBoy) =>
  String(deliveryBoy?.availabilityStatus || "").toLowerCase() === "online"
    ? "Active"
    : "Inactive";

export default function DeliveryBoyManagement() {
  const goBack = useRestaurantBackNavigation();
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selfDeliveryApprovalStatus, setSelfDeliveryApprovalStatus] = useState("none");
  const [editingId, setEditingId] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const canManageDeliveryBoys = selfDeliveryApprovalStatus === "approved";
  const isEditing = Boolean(editingId);

  const titleText = isEditing ? "Edit Delivery Partner" : "Add Delivery Partner";
  const submitText = isEditing ? "Save Changes" : "Create Delivery Partner";

  const normalizedPhoneMap = useMemo(
    () =>
      new Map(
        deliveryBoys.map((boy) => [
          String(boy?._id || ""),
          String(boy?.phone || "").replace(/\D/g, ""),
        ]),
      ),
    [deliveryBoys],
  );

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
        if (!active) return;
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

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setErrors({});
    setEditingId("");
    setShowPassword(false);
  };

  const validateForm = () => {
    const newErrors = {};
    const normalizedPhone = String(form.phone || "").replace(/\D/g, "");
    const normalizedUsername = String(form.username || "").trim().toLowerCase();

    if (!form.name.trim()) {
      newErrors.name = "Name is required";
    } else if (!/^[a-zA-Z\s]+$/.test(form.name)) {
      newErrors.name = "Name should only contain alphabets and spaces";
    }

    if (!normalizedPhone) {
      newErrors.phone = "Phone number is required";
    } else if (!/^\d{10}$/.test(normalizedPhone)) {
      newErrors.phone = "Phone must be exactly 10 digits";
    } else {
      const duplicatePhone = deliveryBoys.some((db) => {
        if (String(db?._id || "") === editingId) return false;
        return normalizedPhoneMap.get(String(db?._id || "")) === normalizedPhone;
      });
      if (duplicatePhone) {
        newErrors.phone = "This phone number is already registered";
      }
    }

    if (!normalizedUsername) {
      newErrors.username = "Username is required";
    } else if (!/^[a-zA-Z0-9_]+$/.test(normalizedUsername)) {
      newErrors.username = "Username can only contain letters, numbers, and underscores";
    } else if (normalizedUsername.length < 3) {
      newErrors.username = "Username must be at least 3 characters";
    } else {
      const duplicateUsername = deliveryBoys.some((db) => {
        if (String(db?._id || "") === editingId) return false;
        return String(db?.username || "").trim().toLowerCase() === normalizedUsername;
      });
      if (duplicateUsername) {
        newErrors.username = "This username is already registered";
      }
    }

    if (!isEditing && !form.password) {
      newErrors.password = "Password is required";
    } else if (form.password && form.password.length < 6) {
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
      const payload = {
        name: form.name.trim(),
        phone: form.phone.replace(/\D/g, ""),
        username: form.username.trim().toLowerCase(),
      };

      if (form.password) {
        payload.password = form.password;
      }

      if (isEditing) {
        await restaurantAPI.updateDeliveryBoy(editingId, payload);
        toast.success("Delivery partner updated successfully");
      } else {
        await restaurantAPI.createDeliveryBoy({ ...payload, password: form.password });
        toast.success("Delivery partner created successfully");
      }

      resetForm();
      await loadDeliveryBoys();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to save delivery partner");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (deliveryBoy) => {
    setEditingId(String(deliveryBoy?._id || ""));
    setForm({
      name: String(deliveryBoy?.name || ""),
      phone: String(deliveryBoy?.phone || "").replace(/\D/g, "").slice(0, 10),
      username: String(deliveryBoy?.username || ""),
      password: "",
    });
    setErrors({});
    setShowPassword(false);
  };

  const handleDelete = async (deliveryBoy) => {
    if (!canManageDeliveryBoys) return;

    const confirmed = await confirmApp(
      `Are you sure you want to delete ${deliveryBoy?.name || "this delivery partner"}? This action cannot be undone.`,
    );
    if (!confirmed) return;

    const targetId = String(deliveryBoy?._id || "");
    if (!targetId) return;

    setDeletingId(targetId);
    try {
      await restaurantAPI.deleteDeliveryBoy(targetId);
      if (editingId === targetId) {
        resetForm();
      }
      toast.success("Delivery partner deleted successfully");
      await loadDeliveryBoys();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to delete delivery partner");
    } finally {
      setDeletingId("");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-4">
      <div className="mx-auto max-w-4xl space-y-4">
        <div>
          <div className="flex items-center gap-3">
            <button
              onClick={goBack}
              className="p-1.5 hover:bg-gray-200/60 rounded-lg transition-colors shrink-0"
              aria-label="Go back"
            >
              <ArrowLeft className="h-6 w-6 text-gray-900" />
            </button>
            <h1 className="text-lg font-bold text-gray-900">Delivery Partner Management</h1>
          </div>
          <p className="text-sm text-gray-500 pl-[42px] mt-0.5">
            Create, edit and manage your self-delivery team
          </p>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4 rounded-3xl border border-gray-200 bg-white p-5">
          {/* Dummy inputs to prevent browser autofill */}
          <input style={{ display: "none" }} type="text" name="chrome-autofill-dummy-username" autoComplete="new-password" />
          <input style={{ display: "none" }} type="password" name="chrome-autofill-dummy-password" autoComplete="new-password" />

          {!canManageDeliveryBoys ? (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-sm text-amber-800">
                Delivery partners can be managed only after self-delivery is approved by admin.
              </p>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {isEditing && <Pencil className="h-4 w-4 text-gray-600" />}
              <h2 className="font-semibold text-gray-900">{titleText}</h2>
            </div>
            {isEditing ? (
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {[
              ["name", "Name", 40],
              ["phone", "Phone Number", 10],
              ["username", "Username", 20],
              ["password", isEditing ? "Password (optional)" : "Password", 32],
            ].map(([key, label, max]) => (
              <label key={key} className="block">
                <span className="text-sm font-medium text-gray-700">{label}</span>
                <div className="relative mt-1">
                  <input
                    type={key === "password" ? (showPassword ? "text" : "password") : "text"}
                    name={`delivery-partner-${key}`}
                    id={`delivery-partner-${key}`}
                    autoComplete={key === "password" || key === "username" ? "new-password" : "off"}
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
                    placeholder={`Enter ${String(label).toLowerCase()}`}
                    className={`w-full rounded-xl border px-3 py-2.5 outline-none transition-all ${
                      key === "password" ? "pr-10" : ""
                    } ${
                      errors[key]
                        ? "border-red-500 bg-red-50 focus:border-red-600 focus:ring-2 focus:ring-red-100"
                        : "border-gray-300 focus:border-gray-900 focus:ring-2 focus:ring-gray-100"
                    } disabled:bg-gray-50 disabled:text-gray-500`}
                  />
                  {key === "password" ? (
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  ) : null}
                </div>
                {errors[key] ? (
                  <p className="ml-1 mt-1 flex items-center gap-1 text-[10px] font-medium italic text-red-500">
                    <AlertCircle className="h-2.5 w-2.5" />
                    {errors[key]}
                  </p>
                ) : null}
              </label>
            ))}
          </div>

          <button
            type="submit"
            disabled={submitting || !canManageDeliveryBoys}
            className="rounded-xl px-4 py-3 font-semibold text-white disabled:opacity-60 hover:opacity-90 active:scale-95 transition-all"
            style={{ backgroundColor: RESTAURANT_THEME.brand }}
          >
            {submitting ? (isEditing ? "Saving..." : "Creating...") : submitText}
          </button>
        </form>

        <div className="rounded-3xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 font-semibold text-gray-900">Delivery Partners</h2>
          {loading ? <p className="text-sm text-gray-500">Loading...</p> : null}
          {!loading && deliveryBoys.length === 0 ? (
            <p className="text-sm text-gray-500">No delivery partners added yet.</p>
          ) : null}

          <div className="space-y-3">
            {deliveryBoys.map((deliveryBoy) => {
              const isOnline = String(deliveryBoy?.availabilityStatus || "").toLowerCase() === "online";
              const isDeleting = deletingId === String(deliveryBoy?._id || "");

              return (
                <div
                  key={deliveryBoy._id}
                  className="flex items-start justify-between gap-4 rounded-2xl border border-gray-200 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 break-all">{deliveryBoy.name}</p>
                    <p className="text-sm text-gray-500 break-all">
                      {deliveryBoy.phone} - @{deliveryBoy.username}
                    </p>
                    <p className="mt-1 text-xs text-gray-400 break-all">
                      Current Order: {deliveryBoy.currentOrderId?.orderId || "None"}
                    </p>
                  </div>

                  <div className="flex flex-col items-end justify-between self-stretch gap-2 min-h-[80px]">
                    <span
                      className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                        isOnline ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {getAvailabilityLabel(deliveryBoy)}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(deliveryBoy)}
                        disabled={!canManageDeliveryBoys || isDeleting}
                        className="inline-flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(deliveryBoy)}
                        disabled={!canManageDeliveryBoys || isDeleting}
                        className="inline-flex items-center gap-1 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {isDeleting ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
