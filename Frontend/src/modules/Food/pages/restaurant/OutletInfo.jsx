import { confirmApp } from "@shared/lib/appDialog";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation";
import { motion, AnimatePresence } from "framer-motion";
import Lenis from "lenis";
import {
  ArrowLeft,
  Edit,
  Pencil,
  Plus,
  MapPin,
  Clock,
  Star,
  ChevronRight,
  X,
  Trash2,
  AlertTriangle,
  Shield,
  FileText,
  Building2,
  User,
  Phone,
  Mail,
  Info,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@food/components/ui/dialog";
import { Button } from "@food/components/ui/button";
import { Input } from "@food/components/ui/input";
import { restaurantAPI } from "@food/api";
import { toast } from "sonner";
import { ImageSourcePicker } from "@food/components/ImageSourcePicker";
import { isFlutterBridgeAvailable, convertBase64ToFile } from "@food/utils/imageUploadUtils";

const debugLog = (...args) => {};
const debugWarn = (...args) => {};
const debugError = (...args) => {};

const CUISINES_STORAGE_KEY = "restaurant_cuisines";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const formatTime12Hour = (time24) => {
  if (!time24 || typeof time24 !== "string" || !time24.includes(":")) return "";
  const [hoursStr, minutesStr] = time24.split(":");
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  if (isNaN(hours) || isNaN(minutes)) return time24;
  const period = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;
  const minutesPad = minutes.toString().padStart(2, "0");
  const hoursPad = hours12.toString().padStart(2, "0");
  return `${hoursPad}:${minutesPad} ${period}`;
};


export default function OutletInfo() {
  const navigate = useNavigate();
  const goBack = useRestaurantBackNavigation();

  // State management
  const [restaurantData, setRestaurantData] = useState(null);
  const [outletTimings, setOutletTimings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [restaurantName, setRestaurantName] = useState("");
  const [cuisineTags, setCuisineTags] = useState("");
  const [address, setAddress] = useState("");
  const [mainImage, setMainImage] = useState("https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&h=400&fit=crop");
  const [thumbnailImage, setThumbnailImage] = useState("https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=200&h=200&fit=crop");
  const [coverImages, setCoverImages] = useState([]);
  const [showEditNameDialog, setShowEditNameDialog] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [restaurantId, setRestaurantId] = useState("");
  const [restaurantMongoId, setRestaurantMongoId] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageType, setImageType] = useState(null);
  const [uploadingCount, setUploadingCount] = useState(0);

  // Document edit state
  const [editDocDialog, setEditDocDialog] = useState(null); // { field, label, value }
  const [editDocValue, setEditDocValue] = useState("");
  const [savingDoc, setSavingDoc] = useState(false);

  const profileImageInputRef = useRef(null);
  const menuImageInputRef = useRef(null);
  const [activePicker, setActivePicker] = useState(null);

  // Format address from location object
  const formatAddress = (location) => {
    if (!location) return "";
    const parts = [];
    if (location.addressLine1) parts.push(location.addressLine1.trim());
    if (location.addressLine2) parts.push(location.addressLine2.trim());
    if (location.area) parts.push(location.area.trim());
    if (location.city) {
      const city = location.city.trim();
      if (!location.area || !location.area.includes(city)) {
        parts.push(city);
      }
    }
    if (location.state) {
      const state = location.state.trim();
      if (!parts.some((p) => p.includes(state))) {
        parts.push(state);
      }
    }
    if (location.zipCode || location.pincode || location.postalCode) {
      parts.push((location.zipCode || location.pincode || location.postalCode).trim());
    }
    if (location.landmark) parts.push(location.landmark.trim());
    return parts.join(", ") || "";
  };

  // Fetch restaurant data on mount
  useEffect(() => {
    const fetchRestaurantData = async () => {
      try {
        setLoading(true);
        const [response, timingsResponse] = await Promise.all([
          restaurantAPI.getCurrentRestaurant(),
          restaurantAPI.getOutletTimings()
        ]);
        const data = response?.data?.data?.restaurant || response?.data?.restaurant;
        if (data) {
          setRestaurantData(data);
          setRestaurantName(data.name || "");
          setRestaurantId(data.restaurantId || data.id || "");
          const mongoId = String(data.id || data._id || "");
          setRestaurantMongoId(mongoId);
          const formattedAddress = formatAddress(data.location);
          setAddress(formattedAddress);
          if (data.cuisines && Array.isArray(data.cuisines) && data.cuisines.length > 0) {
            setCuisineTags(data.cuisines.join(", "));
          }
          if (data.profileImage?.url) {
            setThumbnailImage(data.profileImage.url);
          }
          if (data.coverImages && Array.isArray(data.coverImages) && data.coverImages.length > 0) {
            setCoverImages(data.coverImages.map((img) => ({ url: img.url || img, publicId: img.publicId })));
            setMainImage(data.coverImages[0].url || data.coverImages[0]);
          } else if (data.menuImages && Array.isArray(data.menuImages) && data.menuImages.length > 0) {
            setCoverImages(data.menuImages.map((img) => ({ url: img.url, publicId: img.publicId })));
            setMainImage(data.menuImages[0].url);
          } else {
            setCoverImages([]);
          }
        }
        const timings = timingsResponse?.data?.data?.outletTimings || timingsResponse?.data?.outletTimings;
        if (timings) {
          setOutletTimings(timings);
        }
      } catch (error) {
        if (error.code !== 'ERR_NETWORK' && error.code !== 'ECONNABORTED' && !error.message?.includes('timeout')) {
          debugError("Error fetching restaurant data:", error);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchRestaurantData();

    const handleCuisinesUpdate = () => { fetchRestaurantData(); };
    const handleAddressUpdate = () => { fetchRestaurantData(); };
    const handleTimingsUpdate = () => { fetchRestaurantData(); };

    window.addEventListener("cuisinesUpdated", handleCuisinesUpdate);
    window.addEventListener("addressUpdated", handleAddressUpdate);
    window.addEventListener("outletTimingsUpdated", handleTimingsUpdate);

    return () => {
      window.removeEventListener("cuisinesUpdated", handleCuisinesUpdate);
      window.removeEventListener("addressUpdated", handleAddressUpdate);
      window.removeEventListener("outletTimingsUpdated", handleTimingsUpdate);
    };
  }, []);

  // Lenis smooth scrolling
  useEffect(() => {
    const lenis = new Lenis({ duration: 1.2, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
    function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);
    return () => { lenis.destroy(); };
  }, []);

  // Handle profile image replacement
  const handleProfileImageReplace = async (file) => {
    if (!file) return;
    try {
      setUploadingImage(true);
      setImageType('profile');
      const uploadResponse = await restaurantAPI.uploadProfileImage(file);
      const uploadedImage = uploadResponse?.data?.data?.profileImage;
      if (uploadedImage) {
        if (uploadedImage.url) setThumbnailImage(uploadedImage.url);
        const response = await restaurantAPI.getCurrentRestaurant();
        const data = response?.data?.data?.restaurant || response?.data?.restaurant;
        if (data) {
          setRestaurantData(data);
          if (data.profileImage?.url) setThumbnailImage(data.profileImage.url);
        }
      }
    } catch (error) {
      debugError("Error uploading profile image:", error);
      toast.error("Failed to upload image. Please try again.");
    } finally {
      setUploadingImage(false);
      setImageType(null);
    }
  };

  // Handle multiple cover images addition
  const handleCoverImageAdd = async (files) => {
    if (!files || Array.isArray(files) && files.length === 0) return;
    const fileArray = Array.isArray(files) ? files : [files];
    try {
      setUploadingImage(true);
      setImageType('menu');
      setUploadingCount(fileArray.length);
      const currentResponse = await restaurantAPI.getCurrentRestaurant();
      const currentData = currentResponse?.data?.data?.restaurant || currentResponse?.data?.restaurant;
      const existingImages = currentData?.menuImages && Array.isArray(currentData.menuImages)
        ? currentData.menuImages.map((img) => ({ url: img.url, publicId: img.publicId }))
        : [];
      const uploadedImageData = [];
      for (let i = 0; i < fileArray.length; i++) {
        try {
          const uploadResponse = await restaurantAPI.uploadMenuImage(fileArray[i]);
          const uploadedImage = uploadResponse?.data?.data?.menuImage;
          if (uploadedImage?.url) {
            uploadedImageData.push({ url: uploadedImage.url, publicId: uploadedImage.publicId || null });
          }
        } catch (error) { /* skip failed */ }
      }
      if (uploadedImageData.length > 0) {
        const allImages = [...existingImages];
        uploadedImageData.forEach((uploaded) => {
          if (!allImages.find((img) => img.url === uploaded.url)) allImages.push(uploaded);
        });
        try {
          await restaurantAPI.updateProfile({ menuImages: allImages });
          toast.success(`Successfully uploaded ${uploadedImageData.length} image(s)`);
        } catch (updateError) {
          toast.error("Images uploaded but failed to save.");
        }
        setCoverImages(allImages);
        if (allImages.length > 0) setMainImage(allImages[0].url);
      }
    } catch (error) {
      toast.error("Failed to upload images.");
    } finally {
      setUploadingImage(false);
      setImageType(null);
      setUploadingCount(0);
    }
  };

  const handleImageClick = (type, ref, title, multiple = false) => {
    if (isFlutterBridgeAvailable()) {
      setActivePicker({ type, ref, title, multiple });
    } else {
      ref.current?.click();
    }
  };

  // Handle cover image deletion
  const handleCoverImageDelete = async (indexToDelete) => {
    if (!(await confirmApp("Are you sure you want to delete this cover image?"))) return;
    try {
      setUploadingImage(true);
      setImageType('menu');
      const updatedImages = coverImages.filter((_, index) => index !== indexToDelete);
      const menuImagesForBackend = updatedImages.map((img) => ({ url: img.url, publicId: img.publicId || null }));
      await restaurantAPI.updateProfile({ menuImages: menuImagesForBackend });
      setCoverImages(updatedImages);
      if (indexToDelete === 0 && updatedImages.length > 0) {
        setMainImage(updatedImages[0].url);
      } else if (updatedImages.length === 0) {
        setMainImage("https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&h=400&fit=crop");
      }
      toast.success("Image deleted successfully");
    } catch (error) {
      toast.error("Failed to delete image.");
    } finally {
      setUploadingImage(false);
      setImageType(null);
    }
  };

  // Handle edit name dialog
  const handleOpenEditDialog = () => {
    setEditNameValue(restaurantName);
    setShowEditNameDialog(true);
  };

  const handleSaveName = async () => {
    const newName = editNameValue.trim();
    if (!newName) return;
    try {
      await restaurantAPI.updateProfile({ name: newName });
      setRestaurantName(newName);
      setShowEditNameDialog(false);
      toast.success("Name updated successfully");
    } catch (error) {
      toast.error("Failed to update name");
    }
  };

  // Helper to get image URL from various formats
  const getImageUrl = (img) => {
    if (!img) return null;
    if (typeof img === "string") return img.startsWith("http") ? img : null;
    return img.url || img.secure_url || null;
  };

  // Handle document field edit (triggers admin re-verification)
  const handleOpenDocEdit = (field, label, currentValue) => {
    setEditDocDialog({ field, label });
    setEditDocValue(currentValue || "");
  };

  const handleSaveDocField = async () => {
    if (!editDocDialog || !editDocValue.trim()) return;
    try {
      setSavingDoc(true);
      const payload = { [editDocDialog.field]: editDocValue.trim() };
      await restaurantAPI.updateProfile(payload);
      // Refresh data
      const response = await restaurantAPI.getCurrentRestaurant();
      const data = response?.data?.data?.restaurant || response?.data?.restaurant;
      if (data) setRestaurantData(data);
      setEditDocDialog(null);
      setEditDocValue("");
      toast.success(`${editDocDialog.label} updated. This change requires admin approval before it takes effect.`);
    } catch (error) {
      toast.error(error?.response?.data?.message || `Failed to update ${editDocDialog.label}`);
    } finally {
      setSavingDoc(false);
    }
  };

  // Info card component for read-only fields
  const InfoCard = ({ label, value, loading: isLoading }) => (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
      <p className="text-xs text-gray-500 font-normal mb-1">{label}</p>
      <p className="text-sm font-medium text-gray-900 break-words">{isLoading ? "Loading..." : value || "N/A"}</p>
    </div>
  );

  // Editable info card
  const EditableInfoCard = ({ label, value, onEdit, loading: isLoading }) => (
    <div className="bg-blue-50/50 rounded-lg p-4 border border-blue-200">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 font-normal mb-1">{label}</p>
          <p className="text-sm font-medium text-gray-900 break-words">{isLoading ? "Loading..." : value || "N/A"}</p>
        </div>
        {onEdit && (
          <button onClick={onEdit} className="text-blue-600 text-sm font-normal cursor-pointer ml-2 shrink-0">Edit</button>
        )}
      </div>
    </div>
  );

  // Admin-approval required info card (editable, triggers re-verification)
  const ApprovalInfoCard = ({ label, value, imageUrl, fieldKey, loading: isLoading }) => (
    <div className="bg-amber-50/50 rounded-lg p-4 border border-amber-200">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 font-normal mb-1">{label}</p>
          <p className="text-sm font-medium text-gray-900 break-words">{isLoading ? "Loading..." : value || "N/A"}</p>
        </div>
        <div className="flex items-center gap-2 ml-2 shrink-0">
          <button onClick={() => handleOpenDocEdit(fieldKey, label, value)} className="text-blue-600 text-sm font-normal cursor-pointer">Edit</button>
        </div>
      </div>
      {imageUrl && (
        <div className="mt-2">
          <img src={imageUrl} alt={label} className="w-20 h-14 object-cover rounded-md border border-gray-200" />
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="min-h-screen bg-white overflow-x-hidden pb-6">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
              <button onClick={goBack} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer">
                <ArrowLeft className="w-6 h-6 text-gray-900" />
              </button>
              <h1 className="text-lg font-bold text-gray-900">Outlet Info</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-900 font-normal">
                Restaurant ID: {loading ? "Loading..." : restaurantMongoId && restaurantMongoId.length >= 5 ? restaurantMongoId.slice(-5) : restaurantId || "N/A"}
              </span>
            </div>
          </div>
        </div>

        {/* Main Image Section */}
        <div className="relative w-full h-[200px] overflow-visible">
          <img src={mainImage} alt="Restaurant banner" className="w-full h-full object-cover" />
          <button
            onClick={() => handleImageClick('cover', menuImageInputRef, "Add Cover Image", true)}
            disabled={uploadingImage}
            className="absolute bottom-4 right-4 bg-black/90 hover:bg-black px-3.5 py-2.5 rounded-xl flex items-center gap-2 text-sm font-medium text-white transition-colors shadow-lg z-20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
            <Plus className="w-4 h-4" />
            <span>{uploadingImage && imageType === 'menu' ? `Uploading ${uploadingCount}...` : 'Add Image'}</span>
          </button>
          <input ref={menuImageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleCoverImageAdd(Array.from(e.target.files || []))} />

          {/* Cover Images Gallery */}
          {coverImages.length > 0 &&
          <div className="absolute bottom-16 right-4 flex gap-2.5 z-10">
              {coverImages.slice(0, 4).map((img, index) =>
            <div key={index} className={`relative w-14 h-14 rounded-xl border-2 overflow-hidden bg-gray-200 shadow-md transition-all ${mainImage === img.url ? "border-black scale-105" : "border-white"}`}>
                  <button type="button" onClick={() => setMainImage(img.url)} className="w-full h-full cursor-pointer">
                    <img src={img.url} alt={`Cover ${index + 1}`} className="w-full h-full object-cover" />
                  </button>
                  <button
                onClick={(e) => {e.preventDefault();e.stopPropagation();handleCoverImageDelete(index);}}
                disabled={uploadingImage}
                className="absolute top-1 right-1 bg-red-500/95 hover:bg-red-600 p-1 rounded-full transition-colors z-10 cursor-pointer disabled:cursor-not-allowed">
                    <Trash2 className="w-3 h-3 text-white" />
                  </button>
                </div>
            )}
              {coverImages.length > 4 &&
            <div className="w-14 h-14 rounded-xl border-2 border-white bg-black/70 flex items-center justify-center shadow-md">
                  <span className="text-white text-sm font-bold">+{coverImages.length - 4}</span>
                </div>
            }
            </div>
          }

          {/* Thumbnail Section */}
          <div className="absolute bottom-0 left-4 -mb-[45px] flex flex-col gap-2 shrink-0 z-10">
            <div className="relative w-[70px] h-[70px] rounded overflow-hidden">
              <img src={thumbnailImage} alt="Restaurant thumbnail" className="w-full h-full rounded-xl object-cover" />
            </div>
            <button
              onClick={() => handleImageClick('profile', profileImageInputRef, "Update Profile Photo")}
              disabled={uploadingImage}
              className="text-blue-600 text-sm font-semibold hover:text-blue-700 transition-colors text-left cursor-pointer disabled:cursor-not-allowed">
              {uploadingImage && imageType === 'profile' ? 'Uploading...' : 'Edit Logo'}
            </button>
            <input ref={profileImageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleProfileImageReplace(e.target.files?.[0])} />
          </div>
        </div>

        {/* Info Section */}
        <div className="px-4 pt-[50px] pb-4 bg-white">
          <div className="flex items-start gap-4">
            <div className="flex flex-col gap-2">
              <button onClick={() => navigate("/restaurant/ratings-reviews")} className="flex items-center gap-2 text-left w-full cursor-pointer">
                <div className="bg-green-700 px-2.5 py-1.5 rounded flex items-center gap-1 shrink-0">
                  <span className="text-white text-sm font-bold">{restaurantData?.rating?.toFixed(1) || "0.0"}</span>
                  <Star className="w-3.5 h-3.5 text-white fill-white" />
                </div>
                <span className="text-gray-800 text-sm font-normal">{restaurantData?.totalRatings || 0} DELIVERY REVIEWS</span>
                <ChevronRight className="w-4 h-4 text-gray-400 shrink-0 ml-auto" />
              </button>
            </div>
          </div>
        </div>

        {/* ===== RESTAURANT INFORMATION ===== */}
        <div className="px-4 py-3">
          <h2 className="text-base font-bold text-gray-900 text-center mb-4">Restaurant Information</h2>
          <div className="space-y-3">
            <EditableInfoCard label="Restaurant's Name" value={restaurantName} onEdit={handleOpenEditDialog} loading={loading} />
            <InfoCard label="Pure Veg" value={restaurantData?.pureVegRestaurant === true ? "Yes, Pure Veg" : restaurantData?.pureVegRestaurant === false ? "No, Mixed Menu" : null} loading={loading} />
            <EditableInfoCard
              label="Address"
              value={address || "Not set"}
              onEdit={() => navigate("/food/restaurant/zone-setup")}
              loading={loading}
            />
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200 mx-4 my-2" />

        {/* ===== OWNER DETAILS ===== */}
        <div className="px-4 py-3">
          <h2 className="text-base font-bold text-gray-900 text-center mb-4">Owner Details</h2>
          <div className="space-y-3">
            <EditableInfoCard
              label="Owner Name"
              value={restaurantData?.ownerName || restaurantData?.name || null}
              onEdit={() => navigate("/food/restaurant/edit-owner")}
              loading={loading}
            />
            <InfoCard label="Email" value={restaurantData?.ownerEmail || restaurantData?.email || null} loading={loading} />
            <InfoCard label="Phone" value={restaurantData?.ownerPhone || restaurantData?.primaryContactNumber || restaurantData?.phone || null} loading={loading} />
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200 mx-4 my-2" />

        {/* ===== DOCUMENTS (Admin Approval Required) ===== */}
        <div className="px-4 py-3">
          <h2 className="text-base font-bold text-gray-900 text-center mb-2">Documents & Compliance</h2>

          {/* Admin approval warning banner */}
          <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 mb-4 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 leading-relaxed">
              <span className="font-semibold">Note:</span> If you edit PAN, GST, or FSSAI details, admin approval will be required before changes take effect.
            </p>
          </div>

          <div className="space-y-3">
            {/* PAN Details */}
            <ApprovalInfoCard
              label="PAN Number"
              fieldKey="panNumber"
              value={restaurantData?.panNumber || null}
              imageUrl={getImageUrl(restaurantData?.panImage)}
              loading={loading}
            />
            <ApprovalInfoCard label="Name On PAN" fieldKey="nameOnPan" value={restaurantData?.nameOnPan || null} loading={loading} />

            {/* GST Details */}
            <ApprovalInfoCard
              label="GST Number"
              fieldKey="gstNumber"
              value={restaurantData?.gstNumber || null}
              imageUrl={getImageUrl(restaurantData?.gstImage)}
              loading={loading}
            />
            {restaurantData?.gstNumber && (
              <>
                <ApprovalInfoCard label="GST Legal Name" fieldKey="gstLegalName" value={restaurantData?.gstLegalName || null} loading={loading} />
                <ApprovalInfoCard label="GST Address" fieldKey="gstAddress" value={restaurantData?.gstAddress || null} loading={loading} />
              </>
            )}

            {/* FSSAI Details */}
            <ApprovalInfoCard
              label="FSSAI Number"
              fieldKey="fssaiNumber"
              value={restaurantData?.fssaiNumber || null}
              imageUrl={getImageUrl(restaurantData?.fssaiImage)}
              loading={loading}
            />
            <ApprovalInfoCard label="FSSAI Expiry" fieldKey="fssaiExpiry" value={restaurantData?.fssaiExpiry || null} loading={loading} />
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200 mx-4 my-2" />

        {/* ===== BANK DETAILS ===== */}
        <div className="px-4 py-3">
          <h2 className="text-base font-bold text-gray-900 text-center mb-4">Bank Details</h2>
          <div className="space-y-3">
            <EditableInfoCard
              label="Account Holder Name"
              value={restaurantData?.accountHolderName || null}
              onEdit={() => navigate("/food/restaurant/update-bank-details")}
              loading={loading}
            />
            <InfoCard
              label="Account Number"
              value={restaurantData?.accountNumber ? `****${String(restaurantData.accountNumber).slice(-4)}` : null}
              loading={loading}
            />
            <InfoCard label="IFSC Code" value={restaurantData?.ifscCode || null} loading={loading} />
            <InfoCard label="Account Type" value={restaurantData?.accountType || null} loading={loading} />
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200 mx-4 my-2" />

        {/* ===== OPERATIONAL DETAILS ===== */}
        <div className="px-4 py-3">
          <h2 className="text-base font-bold text-gray-900 text-center mb-4">Operational Details</h2>
          <div className="space-y-3">
            <InfoCard label="Estimated Preparation Time" value={restaurantData?.estimatedDeliveryTime || null} loading={loading} />
            {outletTimings ? (
              DAY_NAMES.map((day) => {
                const time = outletTimings[day];
                if (!time) return null;
                return (
                  <InfoCard
                    key={day}
                    label={day}
                    value={time.isOpen ? `${formatTime12Hour(time.openingTime)} - ${formatTime12Hour(time.closingTime)}` : "Closed"}
                    loading={loading}
                  />
                );
              })
            ) : (
              <>
                <InfoCard
                  label="Open Days"
                  value={restaurantData?.openDays && Array.isArray(restaurantData.openDays) ? restaurantData.openDays.join(", ") : null}
                  loading={loading}
                />
                <InfoCard
                  label="Opening Time"
                  value={restaurantData?.openingTime ? formatTime12Hour(restaurantData.openingTime) : null}
                  loading={loading}
                />
                <InfoCard
                  label="Closing Time"
                  value={restaurantData?.closingTime ? formatTime12Hour(restaurantData.closingTime) : null}
                  loading={loading}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Edit Name Dialog */}
      <Dialog open={showEditNameDialog} onOpenChange={setShowEditNameDialog}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-xl w-[90%]">
          <DialogHeader className="p-4 border-b border-gray-100"><DialogTitle className="text-lg font-bold">Edit Restaurant Name</DialogTitle></DialogHeader>
          <div className="p-4"><Input value={editNameValue} onChange={(e) => setEditNameValue(e.target.value)} placeholder="Enter Restaurant Name" className="w-full" maxLength={100} /></div>
          <DialogFooter className="p-4 bg-gray-50 flex flex-row gap-3">
            <Button variant="outline" onClick={() => setShowEditNameDialog(false)} className="cursor-pointer">Cancel</Button>
            <Button onClick={handleSaveName} disabled={!editNameValue.trim()} className="bg-blue-600 text-white cursor-pointer disabled:cursor-not-allowed">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Edit Dialog (triggers admin re-verification) */}
      <Dialog open={!!editDocDialog} onOpenChange={(open) => { if (!open) { setEditDocDialog(null); setEditDocValue(""); } }}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-xl w-[90%]">
          <DialogHeader className="p-4 border-b border-gray-100">
            <DialogTitle className="text-lg font-bold">Edit {editDocDialog?.label}</DialogTitle>
          </DialogHeader>
          <div className="p-4 space-y-3">
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">
                Editing this field will require admin approval. Your restaurant status may change to pending until approved.
              </p>
            </div>
            <Input value={editDocValue} onChange={(e) => setEditDocValue(e.target.value)} placeholder={`Enter ${editDocDialog?.label || ''}`} className="w-full" />
          </div>
          <DialogFooter className="p-4 bg-gray-50 flex flex-row gap-3">
            <Button variant="outline" onClick={() => { setEditDocDialog(null); setEditDocValue(""); }} disabled={savingDoc} className="cursor-pointer">Cancel</Button>
            <Button onClick={handleSaveDocField} disabled={!editDocValue.trim() || savingDoc} className="bg-amber-600 hover:bg-amber-700 text-white cursor-pointer disabled:cursor-not-allowed">{savingDoc ? "Saving..." : "Save & Submit for Approval"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImageSourcePicker
        isOpen={!!activePicker}
        onClose={() => setActivePicker(null)}
        onFileSelect={(file) => {
          if (activePicker?.type === 'profile') {
            handleProfileImageReplace(file);
          } else {
            handleCoverImageAdd(file);
          }
        }}
        title={activePicker?.title}
        description={`Choose how to upload your ${activePicker?.type} photo`}
        fileNamePrefix={`outlet-${activePicker?.type}`}
        galleryInputRef={activePicker?.ref} />
    </>
  );
}