import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Store, Truck, MapPin, IndianRupee, Clock, Save, RefreshCw, ExternalLink } from "lucide-react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"

function ToggleSwitch({ enabled, onToggle, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`inline-flex items-center w-12 h-7 rounded-full border transition-all disabled:opacity-60 ${
        enabled
          ? "bg-blue-600 border-blue-600 justify-end"
          : "bg-slate-200 border-slate-300 justify-start"
      }`}
    >
      <span className="h-6 w-6 rounded-full bg-white shadow-sm" />
    </button>
  )
}

const normalizeRestaurant = (restaurant = {}) => ({
  id: restaurant?._id || restaurant?.id || restaurant?.restaurantId,
  restaurantId: restaurant?.restaurantId || "N/A",
  name: restaurant?.restaurantName || restaurant?.name || "Restaurant",
  address:
    restaurant?.address ||
    restaurant?.formattedAddress ||
    [restaurant?.addressLine1, restaurant?.area, restaurant?.city].filter(Boolean).join(", ") ||
    "Address unavailable",
  selfDelivery: {
    enabled: restaurant?.selfDelivery?.enabled === true,
    radius: Number(restaurant?.selfDelivery?.radius || 0),
    fee: Number(restaurant?.selfDelivery?.fee || 0),
    minOrderAmount: Number(restaurant?.selfDelivery?.minOrderAmount || 0),
    timings: {
      start: restaurant?.selfDelivery?.timings?.start || "10:00",
      end: restaurant?.selfDelivery?.timings?.end || "22:00",
    },
  },
})

export default function SelfDeliverySettings() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [savingGlobal, setSavingGlobal] = useState(false)
  const [savingRestaurantId, setSavingRestaurantId] = useState("")
  const [globalEnabled, setGlobalEnabled] = useState(false)
  const [restaurants, setRestaurants] = useState([])
  const [search, setSearch] = useState("")
  const [selectedRestaurantId, setSelectedRestaurantId] = useState("")
  const [form, setForm] = useState({
    enabled: false,
    radius: "3",
    fee: "0",
    minOrderAmount: "0",
    start: "10:00",
    end: "22:00",
  })

  const loadData = async ({ silent = false } = {}) => {
    try {
      if (silent) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      const [settingsResponse, restaurantsResponse] = await Promise.all([
        adminAPI.getSelfDeliveryGlobalSettings(),
        adminAPI.getRestaurants({ limit: 1000 }),
      ])

      const settingsData = settingsResponse?.data?.data || settingsResponse?.data || {}
      const restaurantsData =
        restaurantsResponse?.data?.data?.restaurants ||
        restaurantsResponse?.data?.restaurants ||
        []

      setGlobalEnabled(settingsData?.globalEnabled === true)

      const normalizedRestaurants = restaurantsData.map(normalizeRestaurant)
      setRestaurants(normalizedRestaurants)

      setSelectedRestaurantId((currentId) => {
        if (currentId && normalizedRestaurants.some((restaurant) => restaurant.id === currentId)) {
          return currentId
        }
        return normalizedRestaurants[0]?.id || ""
      })
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load self-delivery settings")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const filteredRestaurants = useMemo(() => {
    const query = String(search || "").trim().toLowerCase()
    if (!query) return restaurants
    return restaurants.filter((restaurant) =>
      [restaurant.name, restaurant.restaurantId, restaurant.address]
        .join(" ")
        .toLowerCase()
        .includes(query),
    )
  }, [restaurants, search])

  const selectedRestaurant = useMemo(
    () => restaurants.find((restaurant) => restaurant.id === selectedRestaurantId) || null,
    [restaurants, selectedRestaurantId],
  )

  useEffect(() => {
    if (!selectedRestaurant) return
    setForm({
      enabled: selectedRestaurant.selfDelivery.enabled === true,
      radius: String(selectedRestaurant.selfDelivery.radius ?? 0),
      fee: String(selectedRestaurant.selfDelivery.fee ?? 0),
      minOrderAmount: String(selectedRestaurant.selfDelivery.minOrderAmount ?? 0),
      start: selectedRestaurant.selfDelivery.timings.start || "10:00",
      end: selectedRestaurant.selfDelivery.timings.end || "22:00",
    })
  }, [selectedRestaurant])

  const enabledCount = restaurants.filter((restaurant) => restaurant.selfDelivery.enabled === true).length

  const handleSaveGlobal = async () => {
    try {
      setSavingGlobal(true)
      await adminAPI.updateSelfDeliveryGlobalSettings({ globalEnabled: globalEnabled === true })
      toast.success("Global self-delivery setting saved")
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to save global self-delivery setting")
    } finally {
      setSavingGlobal(false)
    }
  }

  const handleSaveRestaurant = async () => {
    if (!selectedRestaurant?.id) return

    try {
      setSavingRestaurantId(selectedRestaurant.id)
      await adminAPI.updateRestaurantSelfDeliveryConfig(selectedRestaurant.id, {
        enabled: form.enabled === true,
        radius: Number(form.radius || 0),
        fee: Number(form.fee || 0),
        minOrderAmount: Number(form.minOrderAmount || 0),
        timings: {
          start: form.start || "10:00",
          end: form.end || "22:00",
        },
      })
      toast.success("Restaurant self-delivery setting saved")
      await loadData({ silent: true })
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to save restaurant self-delivery setting")
    } finally {
      setSavingRestaurantId("")
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-3">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white">
                  <Truck className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Self Delivery Settings</h1>
                  <p className="text-sm text-slate-500">
                    Dedicated admin control for platform-wide and restaurant-wise self-delivery setup.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => loadData({ silent: true })}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </button>
              <Link
                to="/admin/food/restaurants"
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Restaurant List
                <ExternalLink className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Global Module Control</p>
                <p className="mt-1 text-xs text-slate-500">
                  Turn self-delivery order placement on or off for the full platform.
                </p>
              </div>
              <ToggleSwitch
                enabled={globalEnabled}
                onToggle={() => setGlobalEnabled((value) => !value)}
                disabled={loading}
              />
            </div>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              {globalEnabled
                ? "Self-delivery is enabled globally."
                : "Self-delivery is disabled globally."}
            </div>
            <button
              type="button"
              onClick={handleSaveGlobal}
              disabled={loading || savingGlobal}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {savingGlobal ? "Saving..." : "Save Global Setting"}
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-emerald-100 p-2 text-emerald-700">
                <Store className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Restaurants Enabled</p>
                <p className="text-2xl font-bold text-slate-900">{enabledCount}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Out of {restaurants.length} restaurants currently loaded in admin.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-amber-100 p-2 text-amber-700">
                <IndianRupee className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Quick Admin Use</p>
                <p className="text-sm text-slate-500">
                  Global toggle, restaurant config, and live status all in one place.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Restaurant Self-Delivery Overview</h2>
                <p className="text-sm text-slate-500">See all restaurant self-delivery configurations in one list.</p>
              </div>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search restaurant"
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:max-w-xs"
              />
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-3">Restaurant</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Radius</th>
                    <th className="px-3 py-3">Fee</th>
                    <th className="px-3 py-3">Min Order</th>
                    <th className="px-3 py-3">Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRestaurants.map((restaurant) => {
                    const isActive = selectedRestaurantId === restaurant.id
                    return (
                      <tr
                        key={restaurant.id}
                        onClick={() => setSelectedRestaurantId(restaurant.id)}
                        className={`cursor-pointer transition-colors hover:bg-slate-50 ${isActive ? "bg-blue-50/60" : ""}`}
                      >
                        <td className="px-3 py-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{restaurant.name}</p>
                            <p className="text-xs text-slate-500">{restaurant.restaurantId}</p>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${restaurant.selfDelivery.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                            {restaurant.selfDelivery.enabled ? "Enabled" : "Disabled"}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-sm text-slate-700">{restaurant.selfDelivery.radius} km</td>
                        <td className="px-3 py-3 text-sm text-slate-700">₹{restaurant.selfDelivery.fee}</td>
                        <td className="px-3 py-3 text-sm text-slate-700">₹{restaurant.selfDelivery.minOrderAmount}</td>
                        <td className="px-3 py-3 text-sm text-slate-700">
                          {restaurant.selfDelivery.timings.start} - {restaurant.selfDelivery.timings.end}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Restaurant Config Editor</h2>
                <p className="text-sm text-slate-500">Update the selected restaurant without opening a different page.</p>
              </div>
              {selectedRestaurant ? (
                <Link
                  to="/admin/food/restaurants"
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  Open details
                </Link>
              ) : null}
            </div>

            {!selectedRestaurant ? (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                Select a restaurant from the left table to edit self-delivery settings.
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-base font-semibold text-slate-900">{selectedRestaurant.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{selectedRestaurant.address}</p>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Enable Self Delivery</p>
                    <p className="text-xs text-slate-500">This restaurant can accept self-delivery orders.</p>
                  </div>
                  <ToggleSwitch
                    enabled={form.enabled}
                    onToggle={() => setForm((current) => ({ ...current, enabled: !current.enabled }))}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <MapPin className="h-3.5 w-3.5" />
                      Radius
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={form.radius}
                      onChange={(event) => setForm((current) => ({ ...current, radius: event.target.value }))}
                      className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <IndianRupee className="h-3.5 w-3.5" />
                      Delivery Fee
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={form.fee}
                      onChange={(event) => setForm((current) => ({ ...current, fee: event.target.value }))}
                      className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <IndianRupee className="h-3.5 w-3.5" />
                      Minimum Order
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={form.minOrderAmount}
                      onChange={(event) => setForm((current) => ({ ...current, minOrderAmount: event.target.value }))}
                      className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        <Clock className="h-3.5 w-3.5" />
                        Start
                      </span>
                      <input
                        type="time"
                        value={form.start}
                        onChange={(event) => setForm((current) => ({ ...current, start: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">End</span>
                      <input
                        type="time"
                        value={form.end}
                        onChange={(event) => setForm((current) => ({ ...current, end: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSaveRestaurant}
                  disabled={!selectedRestaurant || savingRestaurantId === selectedRestaurant.id}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {savingRestaurantId === selectedRestaurant.id ? "Saving..." : "Save Restaurant Config"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
