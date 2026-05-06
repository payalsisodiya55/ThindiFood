import { useEffect, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { restaurantAPI } from "@food/api";
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation";

const EMPTY_FORM = {
  name: "",
  phone: "",
  username: "",
  password: "",
};

export default function DeliveryBoyManagement() {
  const goBack = useRestaurantBackNavigation();
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadDeliveryBoys = async () => {
    const response = await restaurantAPI.getDeliveryBoys();
    setDeliveryBoys(response?.data?.data?.deliveryBoys || []);
  };

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        await loadDeliveryBoys();
      } finally {
        if (active) setLoading(false);
      }
    };
    run();
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await restaurantAPI.createDeliveryBoy(form);
      setForm(EMPTY_FORM);
      await loadDeliveryBoys();
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (deliveryBoy) => {
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
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-gray-600" />
            <h2 className="font-semibold text-gray-900">Add Delivery Boy</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              ["name", "Name"],
              ["phone", "Phone"],
              ["username", "Username"],
              ["password", "Password"],
            ].map(([key, label]) => (
              <label key={key} className="block">
                <span className="text-sm text-gray-700">{label}</span>
                <input
                  type={key === "password" ? "password" : "text"}
                  value={form[key]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
                />
              </label>
            ))}
          </div>
          <button
            type="submit"
            disabled={submitting}
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
                  className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                    deliveryBoy.isActive
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-700"
                  }`}
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
