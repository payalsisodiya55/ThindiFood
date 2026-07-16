import { confirmApp } from "@shared/lib/appDialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2, Pencil, Plus, Search, Store, Trash2, XCircle } from "lucide-react";
import { adminAPI } from "@food/api";
import { toast } from "sonner";
import {
  DATE_RANGE_REQUIRED_MESSAGE,
  DINING_OFFER_SCHEDULE_OPTIONS,
  HAPPY_HOURS_DAYS_MESSAGE,
  WEEKDAYS,
  normalizeSchedule,
  validateDiningOfferSchedule,
} from "@food/utils/diningOfferSchedule";

const initialForm = {
  restaurantId: "",
  title: "",
  description: "",
  discountType: "percentage",
  discountValue: "",
  maxDiscount: "",
  minBillAmount: "",
  usageLimit: "",
  perUserLimit: "",
  startDate: "",
  endDate: "",
  schedule: {
    mode: "all_days",
    customDays: [],
    happyHoursEnabled: false,
    happyHours: []
  },
  termsAndConditions: ""
};

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB");
};

const getDiscountLabel = (offer) => {
  if (offer.discountType === "flat") return `Rs ${Number(offer.discountValue || 0)}`;
  const maxDiscount = offer.maxDiscount != null ? ` (up to Rs ${Number(offer.maxDiscount)})` : "";
  return `${Number(offer.discountValue || 0)}%${maxDiscount}`;
};

const getUsageLabel = (offer) => {
  const usedCount = Number(
    offer?.usedCount ??
    offer?.usageCount ??
    offer?.redeemedCount ??
    offer?.redemptionCount ??
    0
  );
  const usageLimit = offer?.usageLimit ?? offer?.maxUsage ?? offer?.redeemLimit;
  const normalizedLimit = Number(usageLimit || 0) > 0 ? Number(usageLimit) : "∞";
  return `${usedCount} / ${normalizedLimit}`;
};

const getScheduleDisplayLabel = (schedule) => {
  if (!schedule) return "All Days";
  let daysLabel = "All Days";
  if (schedule.mode === "weekdays") daysLabel = "Weekdays (Mon-Fri)";
  else if (schedule.mode === "weekends") daysLabel = "Weekends (Sat-Sun)";
  else if (schedule.mode === "custom") {
    const dayNames = (schedule.customDays || [])
      .map((d) => WEEKDAYS.find((wd) => wd.value === d)?.label || "")
      .filter(Boolean);
    daysLabel = dayNames.length > 0 ? dayNames.join(", ") : "Custom Days";
  }

  const happyHours = schedule.happyHours || [];
  if (happyHours.length > 0) {
    const timeSlots = happyHours.map((slot) => `${slot.start} to ${slot.end}`).join(", ");
    return `${daysLabel} (${timeSlots})`;
  }
  return daysLabel;
};

export default function DiningOfferManagement() {
  const [offers, setOffers] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingOfferId, setEditingOfferId] = useState("");
  const [editingOfferMeta, setEditingOfferMeta] = useState(null);
  const [processingId, setProcessingId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [rejectReasonById, setRejectReasonById] = useState({});
  const [formData, setFormData] = useState(initialForm);
  const isEditing = Boolean(editingOfferId);
  const formRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [offersResponse, restaurantsResponse] = await Promise.all([
        adminAPI.getDiningOffers(),
        adminAPI.getDiningRestaurants()
      ]);
      setOffers(offersResponse?.data?.data?.offers || []);
      const restaurantRows = restaurantsResponse?.data?.data?.restaurants || [];
      setRestaurants(Array.isArray(restaurantRows) ? restaurantRows : []);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load dining offers");
      setOffers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredOffers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return offers;
    return offers.filter((offer) =>
      String(offer?.title || "").toLowerCase().includes(query) ||
      String(offer?.restaurantName || "").toLowerCase().includes(query) ||
      String(offer?.fundedBy || "").toLowerCase().includes(query)
    );
  }, [offers, searchQuery]);

  const resetOfferForm = () => {
    setFormData(initialForm);
    setEditingOfferId("");
    setEditingOfferMeta(null);
  };

  const handleEdit = (offer) => {
    const offerId = offer?._id || offer?.id;
    if (!offerId) return;
    setEditingOfferId(offerId);
    setEditingOfferMeta(offer);
    const happyHours = offer?.schedule?.happyHours || [];
    setFormData({
      restaurantId: String(offer.restaurantId || ""),
      title: String(offer.title || ""),
      description: String(offer.description || ""),
      discountType: offer.discountType === "flat" ? "flat" : "percentage",
      discountValue: String(Number(offer.discountValue || 0)),
      maxDiscount: offer.maxDiscount != null ? String(Number(offer.maxDiscount || 0)) : "",
      minBillAmount: String(Number(offer.minBillAmount || 0)),
      usageLimit: offer.usageLimit != null ? String(Number(offer.usageLimit || 0)) : "",
      perUserLimit: offer.perUserLimit != null ? String(Number(offer.perUserLimit || 0)) : "",
      startDate: offer.startDate ? String(offer.startDate).slice(0, 10) : "",
      endDate: offer.endDate ? String(offer.endDate).slice(0, 10) : "",
      schedule: {
        mode: offer?.schedule?.mode || "all_days",
        customDays: offer?.schedule?.customDays || [],
        happyHoursEnabled: happyHours.length > 0,
        happyHours: happyHours.map((slot) => ({ start: slot.start || "", end: slot.end || "" }))
      },
      termsAndConditions: String(offer?.termsAndConditions || "")
    });
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const setScheduleField = (key, value) => {
    setFormData((prev) => ({
      ...prev,
      schedule: {
        ...prev.schedule,
        [key]: value
      }
    }));
  };

  const toggleCustomDay = (dayValue) => {
    const currentDays = formData.schedule.customDays;
    const newDays = currentDays.includes(dayValue)
      ? currentDays.filter((d) => d !== dayValue)
      : [...currentDays, dayValue];
    setScheduleField("customDays", newDays);
  };

  const addHappyHourSlot = () => {
    const currentSlots = formData.schedule.happyHours;
    setScheduleField("happyHours", [...currentSlots, { start: "12:00", end: "15:00" }]);
  };

  const removeHappyHourSlot = (index) => {
    const currentSlots = formData.schedule.happyHours;
    setScheduleField("happyHours", currentSlots.filter((_, i) => i !== index));
  };

  const updateHappyHourSlot = (index, key, value) => {
    const currentSlots = formData.schedule.happyHours;
    const updated = currentSlots.map((slot, i) => (i === index ? { ...slot, [key]: value } : slot));
    setScheduleField("happyHours", updated);
  };

  const handleHappyHoursToggle = (enabled) => {
    if (enabled) {
      const dependencyError = validateDiningOfferSchedule({
        startDate: formData.startDate,
        endDate: formData.endDate,
        schedule: formData.schedule,
        happyHoursEnabled: false,
      });
      if (dependencyError) {
        toast.error(dependencyError === DATE_RANGE_REQUIRED_MESSAGE ? "Select a valid start date and end date before enabling Happy Hours." : dependencyError);
        return;
      }
      setScheduleField("happyHoursEnabled", true);
      if (formData.schedule.happyHours.length === 0) {
        setScheduleField("happyHours", [{ start: "12:00", end: "15:00" }]);
      }
      return;
    }
    setScheduleField("happyHoursEnabled", false);
  };

  const normalizedSchedule = useMemo(() => normalizeSchedule(formData.schedule), [formData.schedule]);
  const scheduleValidationError = useMemo(
    () =>
      validateDiningOfferSchedule({
        startDate: formData.startDate,
        endDate: formData.endDate,
        schedule: normalizedSchedule,
        happyHoursEnabled: formData.schedule.happyHoursEnabled,
      }),
    [formData.startDate, formData.endDate, normalizedSchedule, formData.schedule.happyHoursEnabled]
  );
  const hasDateRangeError =
    scheduleValidationError === DATE_RANGE_REQUIRED_MESSAGE ||
    scheduleValidationError === "End date cannot be earlier than start date.";
  const hasScheduleError =
    scheduleValidationError &&
    !hasDateRangeError &&
    scheduleValidationError !== HAPPY_HOURS_DAYS_MESSAGE &&
    !scheduleValidationError.startsWith("Add at least one valid Happy Hour time slot.") &&
    !scheduleValidationError.startsWith("All Happy Hour slots must have a start and end time.") &&
    !scheduleValidationError.startsWith("Happy Hour slot ") &&
    !scheduleValidationError.startsWith("Happy Hour slots ");
  const hasHappyHoursError =
    formData.schedule.happyHoursEnabled &&
    Boolean(scheduleValidationError) &&
    !hasDateRangeError &&
    !hasScheduleError;

  const handleSaveOffer = async () => {
    if (!formData.restaurantId || !formData.title.trim() || !Number(formData.discountValue)) {
      toast.error("Restaurant, title and discount value are required");
      return;
    }
    if (formData.usageLimit !== "" && (!Number.isInteger(Number(formData.usageLimit)) || Number(formData.usageLimit) < 1)) {
      toast.error("Global usage limit must be at least 1");
      return;
    }
    if (formData.perUserLimit !== "" && (!Number.isInteger(Number(formData.perUserLimit)) || Number(formData.perUserLimit) < 1)) {
      toast.error("Per user limit must be at least 1");
      return;
    }
    if (scheduleValidationError) {
      toast.error(scheduleValidationError);
      return;
    }

    if (formData.termsAndConditions && formData.termsAndConditions.length > 1000) {
      toast.error("Terms and conditions cannot exceed 1000 characters");
      return;
    }

    try {
      setSaving(true);
      const applyToAllRestaurants = formData.restaurantId === "ALL_RESTAURANTS";
      const payload = {
        ...formData,
        restaurantId: formData.restaurantId,
        discountValue: Number(formData.discountValue),
        maxDiscount: formData.discountType === "percentage" && formData.maxDiscount !== "" ? Number(formData.maxDiscount) : null,
        minBillAmount: formData.minBillAmount !== "" ? Number(formData.minBillAmount) : 0,
        usageLimit: formData.usageLimit !== "" ? Number(formData.usageLimit) : null,
        perUserLimit: formData.perUserLimit !== "" ? Number(formData.perUserLimit) : null,
        schedule: {
          mode: normalizedSchedule.mode,
          customDays: normalizedSchedule.mode === "custom" ? normalizedSchedule.customDays : [],
          happyHours: formData.schedule.happyHoursEnabled ? formData.schedule.happyHours : []
        },
        termsAndConditions: String(formData.termsAndConditions || "").trim()
      };

      if (isEditing) {
        await adminAPI.updateDiningOffer(editingOfferId, {
          ...payload,
          fundedBy: editingOfferMeta?.fundedBy || undefined
        });
        toast.success("Dining offer updated");
      } else {
        await adminAPI.createDiningOffer({
          ...payload,
          restaurantId: applyToAllRestaurants ? "ALL_RESTAURANTS" : payload.restaurantId,
          applyToAllRestaurants,
          fundedBy: "platform"
        });
        toast.success(applyToAllRestaurants ? "Platform dining offer created for all restaurants" : "Platform-funded dining offer created");
      }
      resetOfferForm();
      fetchData();
    } catch (error) {
      toast.error(error?.response?.data?.message || (isEditing ? "Failed to update dining offer" : "Failed to create dining offer"));
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      setProcessingId(id);
      await adminAPI.approveDiningOffer(id);
      toast.success("Dining offer approved");
      fetchData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to approve dining offer");
    } finally {
      setProcessingId("");
    }
  };

  const handleReject = async (id) => {
    const reason = String(rejectReasonById[id] || "").trim();
    if (!reason) {
      toast.error("Please enter rejection reason");
      return;
    }
    try {
      setProcessingId(id);
      await adminAPI.rejectDiningOffer(id, reason);
      toast.success("Dining offer rejected");
      setRejectReasonById((prev) => ({ ...prev, [id]: "" }));
      fetchData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to reject dining offer");
    } finally {
      setProcessingId("");
    }
  };

  const handleToggleStatus = async (offer) => {
    try {
      setProcessingId(offer._id || offer.id);
      await adminAPI.updateDiningOffer(offer._id || offer.id, {
        ...offer,
        restaurantId: offer.restaurantId,
        status: offer.status === "active" ? "inactive" : "active"
      });
      toast.success("Dining offer status updated");
      fetchData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update dining offer");
    } finally {
      setProcessingId("");
    }
  };

  const handleDeleteOffer = async (offer) => {
    const offerId = offer?._id || offer?.id;
    if (!offerId) return;
    const confirmed = await confirmApp("Are you sure you want to delete this dining offer?");
    if (!confirmed) return;

    try {
      setProcessingId(offerId);
      await adminAPI.deleteDiningOffer(offerId);
      if (editingOfferId === offerId) {
        resetOfferForm();
      }
      toast.success("Dining offer deleted");
      fetchData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to delete dining offer");
    } finally {
      setProcessingId("");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Dining Overall Offers</h1>
        <p className="text-sm text-slate-500 mt-1">Create platform-funded dining offers and review restaurant requests.</p>
      </div>

      <div ref={formRef} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Plus className="w-4 h-4 text-[#00c87e]" />
          <h2 className="text-base font-semibold text-slate-900">{isEditing ? "Edit Dining Offer" : "Create Platform Dining Offer"}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 ml-1">Restaurant</label>
            <select
              value={formData.restaurantId}
              onChange={(e) => setFormData((prev) => ({ ...prev, restaurantId: e.target.value }))}
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#00c87e]">
              
              <option value="">Select restaurant</option>
              <option value="ALL_RESTAURANTS">All restaurants</option>
              {restaurants.map((restaurant) =>
                <option key={restaurant._id || restaurant.id} value={restaurant._id || restaurant.id}>
                  {restaurant.restaurantName || restaurant.name}
                </option>
              )}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 ml-1">Offer Title</label>
            <input
              value={formData.title}
              onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Offer title"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#00c87e]" />
          </div>
          <div className="md:col-span-2 flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 ml-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Description"
              className="w-full min-h-[90px] rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-[#00c87e]" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 ml-1">Discount Type</label>
            <select
              value={formData.discountType}
              onChange={(e) => setFormData((prev) => ({ ...prev, discountType: e.target.value }))}
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#00c87e]">
              
              <option value="percentage">Percentage</option>
              <option value="flat">Flat Amount</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 ml-1">Discount Value</label>
            <input
              type="number"
              min="0"
              value={formData.discountValue}
              onChange={(e) => setFormData((prev) => ({ ...prev, discountValue: e.target.value }))}
              placeholder="Discount value"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#00c87e]" />
          </div>
          {formData.discountType === "percentage" &&
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-700 ml-1">Max Discount</label>
              <input
                type="number"
                min="0"
                value={formData.maxDiscount}
                onChange={(e) => setFormData((prev) => ({ ...prev, maxDiscount: e.target.value }))}
                placeholder="Max discount"
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#00c87e]" />
            </div>
          }
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 ml-1">Minimum Bill Amount</label>
            <input
              type="number"
              min="0"
              value={formData.minBillAmount}
              onChange={(e) => setFormData((prev) => ({ ...prev, minBillAmount: e.target.value }))}
              placeholder="Minimum bill amount"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#00c87e]" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 ml-1">Usage Limit (global)</label>
            <input
              type="number"
              min="1"
              value={formData.usageLimit}
              onChange={(e) => setFormData((prev) => ({ ...prev, usageLimit: e.target.value }))}
              placeholder="Leave empty for unlimited"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#00c87e]" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 ml-1">Per User Limit</label>
            <input
              type="number"
              min="1"
              value={formData.perUserLimit}
              onChange={(e) => setFormData((prev) => ({ ...prev, perUserLimit: e.target.value }))}
              placeholder="Leave empty for unlimited"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#00c87e]" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 ml-1">Start Date</label>
            <input
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData((prev) => ({ ...prev, startDate: e.target.value }))}
              className={`h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-[#00c87e] ${
                hasDateRangeError ? "border-red-500 ring-1 ring-red-500 bg-red-50/10" : "border-slate-200"
              }`} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 ml-1">End Date</label>
            <input
              type="date"
              value={formData.endDate}
              onChange={(e) => setFormData((prev) => ({ ...prev, endDate: e.target.value }))}
              className={`h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-[#00c87e] ${
                hasDateRangeError ? "border-red-500 ring-1 ring-red-500 bg-red-50/10" : "border-slate-200"
              }`} />
          </div>
          {hasDateRangeError && (
            <div className="md:col-span-2 -mt-2">
              <p className="text-xs font-medium text-red-600">{scheduleValidationError}</p>
            </div>
          )}

          {/* Schedule Inputs for Admin */}
          <div className="md:col-span-2 border-t border-slate-100 pt-4 mt-2">
            <label className="text-xs font-bold text-slate-800 block mb-2">Offer Schedule</label>
            <p className="text-[11px] text-slate-500 mb-3">Applicable Days is optional. If nothing special is configured, the offer runs on all days inside the selected date range.</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {DINING_OFFER_SCHEDULE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setScheduleField("mode", opt.value)}
                  className={`rounded-xl px-4 py-2 text-xs font-semibold border cursor-pointer transition-all ${
                    formData.schedule.mode === opt.value
                      ? "bg-[#00c87e]/10 text-[#00c87e] border-[#00c87e]"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {hasScheduleError && (
              <p className="mb-3 text-xs font-medium text-red-600">{scheduleValidationError}</p>
            )}

            {formData.schedule.mode === "custom" && (
              <div className="mb-3 animate-in fade-in duration-100">
                <label className="text-[11px] font-semibold text-slate-600 block mb-1.5">Select custom days</label>
                <div className="flex gap-1.5">
                  {WEEKDAYS.map((day) => {
                    const isSelected = formData.schedule.customDays.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleCustomDay(day.value)}
                        className={`h-8 w-11 rounded-lg text-xs font-semibold border cursor-pointer transition-all ${
                          isSelected
                            ? "bg-[#00c87e] text-white border-[#00c87e]"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="border-t border-slate-100/80 pt-2 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-700 block">Happy Hours</span>
                  <span className="text-[10px] text-slate-400">Apply time window restrictions</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleHappyHoursToggle(!formData.schedule.happyHoursEnabled)}
                  className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors cursor-pointer ${
                    formData.schedule.happyHoursEnabled ? "bg-[#00c87e]" : "bg-slate-200"
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      formData.schedule.happyHoursEnabled ? "translate-x-5.5" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              {formData.schedule.happyHoursEnabled && (
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-2 max-w-md animate-in fade-in duration-150">
                  {formData.schedule.happyHours.map((slot, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-slate-500 w-12">Slot {index + 1}</span>
                      <input
                        type="time"
                        value={slot.start}
                        onChange={(e) => updateHappyHourSlot(index, "start", e.target.value)}
                        className="h-8 border border-slate-200 rounded-lg px-2 text-xs bg-white focus:border-[#00c87e] outline-none"
                      />
                      <span className="text-xs text-slate-400">to</span>
                      <input
                        type="time"
                        value={slot.end}
                        onChange={(e) => updateHappyHourSlot(index, "end", e.target.value)}
                        className="h-8 border border-slate-200 rounded-lg px-2 text-xs bg-white focus:border-[#00c87e] outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => removeHappyHourSlot(index)}
                        className="text-red-500 hover:text-red-600 p-1"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addHappyHourSlot}
                    className="text-[11px] font-bold text-[#00c87e] hover:text-[#00b06f] flex items-center gap-1 cursor-pointer pt-1"
                  >
                    <Plus className="h-3 w-3" />
                    Add Time Slot
                  </button>
                  {hasHappyHoursError && (
                    <p className="text-xs font-medium text-red-600">{scheduleValidationError}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Terms and Conditions for Admin */}
          <div className="md:col-span-2 border-t border-slate-100 pt-4">
            <label className="text-xs font-bold text-slate-800 block mb-1">Terms & Conditions</label>
            <p className="text-[10px] text-slate-400 mb-1.5">Offer-specific exclusions and terms shown to customers. Max 1000 characters.</p>
            <textarea
              value={formData.termsAndConditions}
              onChange={(e) => setFormData((prev) => ({ ...prev, termsAndConditions: e.target.value }))}
              placeholder="E.g. Valid for dine-in only. Cannot be combined with other offers."
              className="w-full min-h-[80px] rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#00c87e]"
              maxLength={1000}
            />
            <div className="text-right text-[9px] text-slate-400">
              {formData.termsAndConditions.length}/1000
            </div>
          </div>
        </div>

        <button
          onClick={handleSaveOffer}
          disabled={saving}
          className="rounded-xl bg-[#00c87e] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#00b06f] disabled:opacity-60 cursor-pointer">
          {saving ? isEditing ? "Saving..." : "Creating..." : isEditing ? "Save Changes" : "Create Dining Offer"}
        </button>
        {isEditing &&
          <button
            onClick={resetOfferForm}
            className="ml-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
            Cancel Edit
          </button>
        }
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <h2 className="text-base font-semibold text-slate-900">All Dining Offers</h2>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by restaurant or title"
              className="w-full h-11 rounded-xl border border-slate-200 pl-10 pr-3 text-sm outline-none focus:border-[#00c87e]" />
          </div>
        </div>

        {loading ?
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#00c87e]" />
          </div> :

          <div className="overflow-x-auto">
            <table className="min-w-[1300px] w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold text-slate-600">Restaurant</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-600">Offer Info</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-600">Schedule</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-600">Discount</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-600">Usage</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-600">Funding</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-600">Approval</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-600">Status</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-600">Dates</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredOffers.length === 0 ?
                  <tr>
                    <td colSpan="10" className="px-3 py-8 text-center text-slate-500">No dining offers found.</td>
                  </tr> :

                  filteredOffers.map((offer) => {
                    const offerId = offer._id || offer.id;
                    const isProcessing = processingId === offerId;
                    return (
                      <tr key={offerId} className="align-top">
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <Store className="w-4 h-4 text-slate-400 shrink-0" />
                            <span className="font-medium text-slate-900">{offer.restaurantName}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 max-w-[240px]">
                          <div className="font-semibold text-slate-900">{offer.title}</div>
                          {offer.description && <div className="text-xs text-slate-500 mt-0.5">{offer.description}</div>}
                          {offer.termsAndConditions && (
                            <div className="text-[10px] text-slate-400 bg-slate-50 border border-slate-100 rounded p-1.5 mt-1.5 italic max-w-full truncate hover:text-slate-600 cursor-help" title={offer.termsAndConditions}>
                              T&C: {offer.termsAndConditions}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 max-w-[200px] text-xs text-slate-700">
                          <span className="inline-block bg-slate-100 border border-slate-200 text-slate-800 rounded-lg px-2 py-1 text-[11px] font-medium leading-normal">
                            {getScheduleDisplayLabel(offer.schedule)}
                          </span>
                        </td>
                        <td className="px-3 py-3 font-medium">{getDiscountLabel(offer)}</td>
                        <td className="px-3 py-3 whitespace-nowrap text-slate-700">{getUsageLabel(offer)}</td>
                        <td className="px-3 py-3 capitalize text-xs">{offer.fundedBy} ({offer.createdByRole})</td>
                        <td className="px-3 py-3 capitalize text-xs">
                          <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                            offer.approvalStatus === "approved" ? "bg-green-100 text-green-700" :
                            offer.approvalStatus === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                          }`}>
                            {offer.approvalStatus}
                          </span>
                        </td>
                        <td className="px-3 py-3 capitalize text-xs">{offer.status}</td>
                        <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">
                          {formatDate(offer.startDate)} - {formatDate(offer.endDate)}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-2 min-w-[220px]">
                            {offer.approvalStatus === "pending" &&
                              <>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleApprove(offerId)}
                                    disabled={isProcessing}
                                    className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60 hover:bg-green-700 cursor-pointer transition-all">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleReject(offerId)}
                                    disabled={isProcessing}
                                    className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60 hover:bg-red-700 cursor-pointer transition-all">
                                    <XCircle className="w-3.5 h-3.5" />
                                    Reject
                                  </button>
                                </div>
                                <input
                                  value={rejectReasonById[offerId] || ""}
                                  onChange={(e) => setRejectReasonById((prev) => ({ ...prev, [offerId]: e.target.value }))}
                                  placeholder="Rejection reason"
                                  className="h-8 rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-[#00c87e]" />
                              </>
                            }
                            {offer.approvalStatus === "approved" &&
                              <button
                                onClick={() => handleToggleStatus(offer)}
                                disabled={isProcessing}
                                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60 hover:bg-slate-50 cursor-pointer transition-all">
                                {offer.status === "active" ? "Set Inactive" : "Set Active"}
                              </button>
                            }
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEdit(offer)}
                                disabled={isProcessing}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60 hover:bg-slate-900 hover:text-white hover:border-slate-900 active:scale-95 transition-all duration-200 cursor-pointer">
                                <Pencil className="w-3.5 h-3.5" />
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteOffer(offer)}
                                disabled={isProcessing}
                                className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 disabled:opacity-60 hover:bg-red-600 hover:text-white hover:border-red-600 active:scale-95 transition-all duration-200 cursor-pointer">
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete
                              </button>
                            </div>
                            {offer.approvalStatus === "rejected" && offer.rejectionReason &&
                              <div className="text-xs text-red-600">Reason: {offer.rejectionReason}</div>
                            }
                          </div>
                        </td>
                      </tr>
                    );
                  })
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </div>
  );
}
