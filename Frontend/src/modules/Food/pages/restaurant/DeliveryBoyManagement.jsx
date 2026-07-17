import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  AlertCircle,
  Eye,
  EyeOff,
  Trash2,
  X,
  Package,
  Loader2,
  Lock,
  Info,
} from "lucide-react";
import { restaurantAPI } from "@food/api";
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation";
import { confirmApp } from "@shared/lib/appDialog";
import { toast } from "sonner";
import { RESTAURANT_THEME } from "@food/constants/restaurantTheme";

const EMPTY_ADD_FORM = {
  name: "",
  phone: "",
  username: "",
  password: "",
};

const EMPTY_EDIT_FORM = {
  name: "",
  phone: "",
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

const formatOrderStatus = (status) => {
  if (!status) return "";
  return String(status)
    .toLowerCase()
    .replace(/_boy/g, "_partner")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

export default function DeliveryBoyManagement() {
  const goBack = useRestaurantBackNavigation();
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);
  const [addErrors, setAddErrors] = useState({});
  const [showAddPassword, setShowAddPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selfDeliveryApprovalStatus, setSelfDeliveryApprovalStatus] = useState("none");
  const [deletingId, setDeletingId] = useState("");

  // Edit modal state
  const [editModal, setEditModal] = useState({ open: false, deliveryBoy: null });
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [editErrors, setEditErrors] = useState({});
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const initialEditForm = useRef(EMPTY_EDIT_FORM);

  // Order details modal state
  const [detailsModal, setDetailsModal] = useState({ open: false, deliveryBoy: null });

  const canManageDeliveryBoys = selfDeliveryApprovalStatus === "approved";

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

  const editHasChanges = useMemo(() => {
    return (
      editForm.name !== (initialEditForm.current.name || "") ||
      editForm.phone !== (initialEditForm.current.phone || "") ||
      editForm.password !== ""
    );
  }, [editForm]);

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

  const resetAddForm = () => {
    setAddForm(EMPTY_ADD_FORM);
    setAddErrors({});
    setShowAddPassword(false);
  };

  const validateAddForm = () => {
    const newErrors = {};
    const normalizedPhone = String(addForm.phone || "").replace(/\D/g, "");
    const normalizedUsername = String(addForm.username || "").trim().toLowerCase();

    if (!addForm.name.trim()) {
      newErrors.name = "Name is required";
    } else if (!/^[a-zA-Z\s]+$/.test(addForm.name)) {
      newErrors.name = "Name should only contain alphabets and spaces";
    }

    if (!normalizedPhone) {
      newErrors.phone = "Phone number is required";
    } else if (!/^\d{10}$/.test(normalizedPhone)) {
      newErrors.phone = "Phone must be exactly 10 digits";
    } else {
      const duplicatePhone = deliveryBoys.some((db) =>
        normalizedPhoneMap.get(String(db?._id || "")) === normalizedPhone
      );
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
      const duplicateUsername = deliveryBoys.some(
        (db) => String(db?.username || "").trim().toLowerCase() === normalizedUsername
      );
      if (duplicateUsername) {
        newErrors.username = "This username is already taken";
      }
    }

    if (!addForm.password) {
      newErrors.password = "Password is required";
    } else if (addForm.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }

    setAddErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateEditForm = () => {
    const newErrors = {};
    const normalizedPhone = String(editForm.phone || "").replace(/\D/g, "");
    const editingId = String(editModal.deliveryBoy?._id || "");

    if (!editForm.name.trim()) {
      newErrors.name = "Name is required";
    } else if (!/^[a-zA-Z\s]+$/.test(editForm.name)) {
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

    if (editForm.password && editForm.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }

    setEditErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddSubmit = async (event) => {
    event.preventDefault();
    if (!canManageDeliveryBoys) return;
    if (!validateAddForm()) {
      toast.error("Please fix the errors in the form");
      return;
    }

    setSubmitting(true);
    try {
      await restaurantAPI.createDeliveryBoy({
        name: addForm.name.trim(),
        phone: addForm.phone.replace(/\D/g, ""),
        username: addForm.username.trim().toLowerCase(),
        password: addForm.password,
      });
      toast.success("Delivery partner created successfully");
      resetAddForm();
      await loadDeliveryBoys();
    } catch (error) {
      toast.error(error?.response?.data?.error || error?.response?.data?.message || "Failed to create delivery partner");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEdit = (deliveryBoy) => {
    const phone = String(deliveryBoy?.phone || "").replace(/\D/g, "").slice(0, 10);
    const base = {
      name: String(deliveryBoy?.name || ""),
      phone,
      password: "",
    };
    setEditForm(base);
    initialEditForm.current = { ...base };
    setEditErrors({});
    setShowEditPassword(false);
    setEditModal({ open: true, deliveryBoy });
  };

  const handleCloseEdit = () => {
    setEditModal({ open: false, deliveryBoy: null });
    setEditForm(EMPTY_EDIT_FORM);
    setEditErrors({});
    setShowEditPassword(false);
  };

  const handleEditSubmit = async (event) => {
    event.preventDefault();
    if (!canManageDeliveryBoys || !editModal.deliveryBoy) return;
    if (!validateEditForm()) {
      toast.error("Please fix the errors in the form");
      return;
    }

    const editingId = String(editModal.deliveryBoy._id || "");
    setEditSubmitting(true);
    try {
      const payload = {
        name: editForm.name.trim(),
        phone: editForm.phone.replace(/\D/g, ""),
      };
      if (editForm.password) {
        payload.password = editForm.password;
      }
      await restaurantAPI.updateDeliveryBoy(editingId, payload);
      toast.success("Delivery partner updated successfully");
      handleCloseEdit();
      await loadDeliveryBoys();
    } catch (error) {
      toast.error(error?.response?.data?.error || error?.response?.data?.message || "Failed to update delivery partner");
    } finally {
      setEditSubmitting(false);
    }
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
      toast.success("Delivery partner deleted successfully");
      await loadDeliveryBoys();
    } catch (error) {
      toast.error(error?.response?.data?.error || error?.response?.data?.message || "Failed to delete delivery partner");
    } finally {
      setDeletingId("");
    }
  };

  const inputCls = (hasError) =>
    `w-full rounded-xl border px-3 py-2.5 outline-none transition-all text-sm ${
      hasError
        ? "border-red-500 bg-red-50 focus:border-red-600 focus:ring-2 focus:ring-red-100"
        : "border-gray-300 focus:border-gray-900 focus:ring-2 focus:ring-gray-100"
    }`;

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-4">
      <div className="mx-auto max-w-4xl space-y-4">
        {/* Header */}
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
            Manage your delivery team
          </p>
        </div>

        {/* Add Delivery Partner Form */}
        <form onSubmit={handleAddSubmit} autoComplete="off" className="space-y-4 rounded-3xl border border-gray-200 bg-white p-5">
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

          <h2 className="font-semibold text-gray-900">Add Delivery Partner</h2>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                name="delivery-partner-name"
                autoComplete="off"
                maxLength={40}
                value={addForm.name}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^a-zA-Z\s]/g, "");
                  setAddForm((p) => ({ ...p, name: val }));
                  if (addErrors.name) setAddErrors((p) => ({ ...p, name: null }));
                }}
                disabled={!canManageDeliveryBoys}
                placeholder="E.g. Ravi Kumar"
                className={`${inputCls(addErrors.name)} disabled:bg-gray-50 disabled:text-gray-500`}
              />
              {addErrors.name && (
                <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-red-500">
                  <AlertCircle className="h-3 w-3" /> {addErrors.name}
                </p>
              )}
            </div>

            {/* Phone Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 font-medium select-none">
                  +91
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  name="delivery-partner-phone"
                  autoComplete="off"
                  maxLength={10}
                  value={addForm.phone}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                    setAddForm((p) => ({ ...p, phone: val }));
                    if (addErrors.phone) setAddErrors((p) => ({ ...p, phone: null }));
                  }}
                  disabled={!canManageDeliveryBoys}
                  placeholder="10-digit mobile number"
                  className={`${inputCls(addErrors.phone)} pl-10 disabled:bg-gray-50 disabled:text-gray-500`}
                />
              </div>
              {addErrors.phone && (
                <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-red-500">
                  <AlertCircle className="h-3 w-3" /> {addErrors.phone}
                </p>
              )}
            </div>

            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                type="text"
                name="delivery-partner-username"
                autoComplete="new-password"
                maxLength={20}
                value={addForm.username}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^a-zA-Z0-9_]/g, "");
                  setAddForm((p) => ({ ...p, username: val }));
                  if (addErrors.username) setAddErrors((p) => ({ ...p, username: null }));
                }}
                disabled={!canManageDeliveryBoys}
                placeholder="E.g. ravi_kumar"
                className={`${inputCls(addErrors.username)} disabled:bg-gray-50 disabled:text-gray-500`}
              />
              {addErrors.username && (
                <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-red-500">
                  <AlertCircle className="h-3 w-3" /> {addErrors.username}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showAddPassword ? "text" : "password"}
                  name="delivery-partner-password"
                  autoComplete="new-password"
                  maxLength={32}
                  value={addForm.password}
                  onChange={(e) => {
                    setAddForm((p) => ({ ...p, password: e.target.value }));
                    if (addErrors.password) setAddErrors((p) => ({ ...p, password: null }));
                  }}
                  disabled={!canManageDeliveryBoys}
                  placeholder="Enter password"
                  className={`${inputCls(addErrors.password)} pr-10 disabled:bg-gray-50 disabled:text-gray-500`}
                />
                <button
                  type="button"
                  onClick={() => setShowAddPassword((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showAddPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {addErrors.password && (
                <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-red-500">
                  <AlertCircle className="h-3 w-3" /> {addErrors.password}
                </p>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !canManageDeliveryBoys}
            className="rounded-xl px-5 py-3 font-semibold text-white disabled:opacity-60 hover:opacity-90 active:scale-95 transition-all text-sm"
            style={{ backgroundColor: RESTAURANT_THEME.brand }}
          >
            {submitting ? "Creating..." : "Create Delivery Partner"}
          </button>
        </form>

        {/* Delivery Partners List */}
        <div className="rounded-3xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 font-semibold text-gray-900">Delivery Partners</h2>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : null}
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
                  className="rounded-2xl border border-gray-200 px-4 py-3 space-y-2"
                >
                  {/* Top row: info + status */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900 break-all">{deliveryBoy.name}</p>
                      <p className="text-sm text-gray-500 break-all">
                        +91 {deliveryBoy.phone} · @{deliveryBoy.username}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold ${
                        isOnline ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {getAvailabilityLabel(deliveryBoy)}
                    </span>
                  </div>

                  {/* Actions row */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(deliveryBoy)}
                      disabled={!canManageDeliveryBoys || isDeleting}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailsModal({ open: true, deliveryBoy })}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      <Package className="h-3.5 w-3.5" />
                      Details
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(deliveryBoy)}
                      disabled={!canManageDeliveryBoys || isDeleting}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {isDeleting ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900 text-base">Edit Delivery Partner</h2>
              <button
                type="button"
                onClick={handleCloseEdit}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} autoComplete="off" className="px-6 py-5 space-y-4">
              {/* Dummy inputs to prevent browser autofill */}
              <input style={{ display: "none" }} type="text" autoComplete="new-password" />
              <input style={{ display: "none" }} type="password" autoComplete="new-password" />

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  autoComplete="off"
                  maxLength={40}
                  value={editForm.name}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^a-zA-Z\s]/g, "");
                    setEditForm((p) => ({ ...p, name: val }));
                    if (editErrors.name) setEditErrors((p) => ({ ...p, name: null }));
                  }}
                  placeholder="E.g. Ravi Kumar"
                  className={inputCls(editErrors.name)}
                />
                {editErrors.name && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-red-500">
                    <AlertCircle className="h-3 w-3" /> {editErrors.name}
                  </p>
                )}
              </div>

              {/* Phone Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 font-medium select-none">
                    +91
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={10}
                    value={editForm.phone}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                      setEditForm((p) => ({ ...p, phone: val }));
                      if (editErrors.phone) setEditErrors((p) => ({ ...p, phone: null }));
                    }}
                    placeholder="10-digit mobile number"
                    className={`${inputCls(editErrors.phone)} pl-10`}
                  />
                </div>
                {editErrors.phone && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-red-500">
                    <AlertCircle className="h-3 w-3" /> {editErrors.phone}
                  </p>
                )}
              </div>

              {/* Username – truly read-only, cannot be typed into */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <div className="relative">
                  <input
                    type="text"
                    readOnly
                    tabIndex={-1}
                    value={String(editModal.deliveryBoy?.username || "")}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-500 pr-10 cursor-not-allowed pointer-events-none select-none"
                  />
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                </div>
                <p className="mt-1 flex items-start gap-1.5 text-[11.5px] text-gray-400 italic">
                  <Info className="h-3.5 w-3.5 shrink-0 text-gray-400 mt-0.5" />
                  <span>Username Cannot Be Changed After Creation</span>
                </p>
              </div>

              {/* Reset Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reset Password</label>
                <div className="relative">
                  <input
                    type={showEditPassword ? "text" : "password"}
                    autoComplete="new-password"
                    maxLength={32}
                    value={editForm.password}
                    onChange={(e) => {
                      setEditForm((p) => ({ ...p, password: e.target.value }));
                      if (editErrors.password) setEditErrors((p) => ({ ...p, password: null }));
                    }}
                    placeholder="Leave blank to keep current password"
                    className={`${inputCls(editErrors.password)} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showEditPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {editErrors.password && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-red-500">
                    <AlertCircle className="h-3 w-3" /> {editErrors.password}
                  </p>
                )}
                {!editErrors.password && (
                <p className="mt-1 flex items-start gap-1.5 text-[11.5px] text-gray-400 italic">
                  <Info className="h-3.5 w-3.5 shrink-0 text-gray-400 mt-0.5" />
                  <span>If changed, the partner will need to use the new password to log in.</span>
                </p>
                )}
              </div>

              {/* Footer buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={editSubmitting || !editHasChanges}
                  className={`flex-1 rounded-xl px-4 py-3 font-semibold text-white text-sm transition-all active:scale-95 ${
                    editHasChanges && !editSubmitting
                      ? "bg-[#00c87e] hover:opacity-90 cursor-pointer"
                      : "bg-gray-300 cursor-not-allowed opacity-60"
                  }`}
                >
                  {editSubmitting ? "Saving..." : "Save Changes"}
                </button>
                <button
                  type="button"
                  onClick={handleCloseEdit}
                  className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Order Details Modal */}
      {detailsModal.open && detailsModal.deliveryBoy && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900 text-base">Order Details</h2>
              <button
                type="button"
                onClick={() => setDetailsModal({ open: false, deliveryBoy: null })}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Partner info */}
              <div className="rounded-xl bg-gray-50 px-4 py-3 space-y-1">
                <p className="text-sm font-semibold text-gray-900">{detailsModal.deliveryBoy.name}</p>
                <p className="text-xs text-gray-500">+91 {detailsModal.deliveryBoy.phone} · @{detailsModal.deliveryBoy.username}</p>
                <span
                  className={`inline-block mt-1 rounded-lg px-2.5 py-1 text-xs font-semibold ${
                    String(detailsModal.deliveryBoy?.availabilityStatus || "").toLowerCase() === "online"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {getAvailabilityLabel(detailsModal.deliveryBoy)}
                </span>
              </div>

              {/* Current Order */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Current Order</p>
                <div className="rounded-xl border border-gray-200 px-4 py-3">
                  {detailsModal.deliveryBoy.currentOrderId?.orderId ? (
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-gray-900">
                        Order ID: {detailsModal.deliveryBoy.currentOrderId.orderId}
                      </p>
                      {detailsModal.deliveryBoy.currentOrderId.orderStatus && (
                        <p className="text-xs text-gray-500">
                          Status: {formatOrderStatus(detailsModal.deliveryBoy.currentOrderId.orderStatus)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">No Active Order</p>
                  )}
                </div>
              </div>

              {/* Order Stats */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Order Stats</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Assigned", value: detailsModal.deliveryBoy?.orderStats?.assigned ?? 0, color: "bg-blue-100 text-blue-700" },
                    { label: "In Progress", value: detailsModal.deliveryBoy?.orderStats?.inProgress ?? 0, color: "bg-amber-100 text-amber-700" },
                    { label: "Delivered", value: detailsModal.deliveryBoy?.orderStats?.delivered ?? 0, color: "bg-emerald-100 text-emerald-700" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className={`rounded-xl px-3 py-3 text-center ${color}`}>
                      <p className="text-lg font-bold">{value}</p>
                      <p className="text-[10px] font-medium mt-0.5 leading-tight">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 pb-5">
              <button
                type="button"
                onClick={() => setDetailsModal({ open: false, deliveryBoy: null })}
                className="w-full rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
