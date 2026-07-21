import { confirmApp } from "@shared/lib/appDialog";import { useState, useEffect, useRef } from "react";
import { Upload, Trash2, Image as ImageIcon, Loader2, AlertCircle, CheckCircle2, ArrowUp, ArrowDown, Layout, Tag, UtensilsCrossed, Edit, X } from "lucide-react";
import api, { adminAPI, uploadAPI } from "@food/api";
import { getModuleToken } from "@food/utils/auth";
import { Input } from "@food/components/ui/input";
import { Label } from "@food/components/ui/label";
import { Button } from "@food/components/ui/button";
const debugLog = (...args) => {};
const debugWarn = (...args) => {};
const debugError = (...args) => {};


export default function DiningManagement() {
  const [activeTab, setActiveTab] = useState('categories');

  // Categories
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesUploading, setCategoriesUploading] = useState(false);
  const [categoriesDeleting, setCategoriesDeleting] = useState(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryFile, setCategoryFile] = useState(null);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingCategoryImageUrl, setEditingCategoryImageUrl] = useState("");
  const categoryFileInputRef = useRef(null);

  // Banners
  const [banners, setBanners] = useState([]);
  const [bannersLoading, setBannersLoading] = useState(true);
  const [bannersUploading, setBannersUploading] = useState(false);
  const [bannersDeleting, setBannersDeleting] = useState(null);
  const [bannerFile, setBannerFile] = useState(null);
  const [bannerPercentageOff, setBannerPercentageOff] = useState("");
  const [bannerTagline, setBannerTagline] = useState("");
  const [zones, setZones] = useState([]);
  const [selectedZoneId, setSelectedZoneId] = useState("all");
  const [bannerCity, setBannerCity] = useState("");
  const [bannerState, setBannerState] = useState("");
  const [editingBannerId, setEditingBannerId] = useState(null);
  const bannerFileInputRef = useRef(null);

  // Common
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const getAuthConfig = (additionalConfig = {}) => {
    const adminToken = getModuleToken('admin');
    if (!adminToken) return additionalConfig;
    return {
      ...additionalConfig,
      headers: {
        ...additionalConfig.headers,
        Authorization: `Bearer ${adminToken.trim()}`
      }
    };
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchZones = async () => {
    try {
      const response = await adminAPI.getZones({ limit: 1000 });
      const list = response?.data?.data?.zones || response?.data?.data?.data?.zones || response?.data?.data || [];
      setZones(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error("Failed to fetch zones:", err);
    }
  };

  useEffect(() => {
    setError(null);
    setSuccess(null);

    if (activeTab === 'banners') {
      fetchBanners();
      fetchZones();
    }
  }, [activeTab]);

  // ==================== CATEGORIES ====================
  const fetchCategories = async () => {
    try {
      setCategoriesLoading(true);
      const response = await adminAPI.getDiningCategories();
      if (response.data.success) setCategories(response.data.data.categories || []);
    } catch (err) {debugError(err);} finally {setCategoriesLoading(false);}
  };

  const resetCategoryForm = () => {
    setCategoryName("");
    setCategoryFile(null);
    setEditingCategoryId(null);
    setEditingCategoryImageUrl("");
    if (categoryFileInputRef.current) categoryFileInputRef.current.value = "";
  };

  const handleEditCategory = (category) => {
    setError(null);
    setSuccess(null);
    setEditingCategoryId(category._id);
    setCategoryName(category.name || "");
    setCategoryFile(null);
    setEditingCategoryImageUrl(category.imageUrl || "");
    if (categoryFileInputRef.current) categoryFileInputRef.current.value = "";
  };

  const handleSubmitCategory = async () => {
    const trimmedCategoryName = categoryName.trim();
    if (!trimmedCategoryName) return setError("Category name is required");
    if (trimmedCategoryName.length > 20) return setError("Category name cannot exceed 20 characters");
    if (!editingCategoryId && !categoryFile) return setError("Name and Image are required");

    try {
      setError(null);
      setSuccess(null);
      setCategoriesUploading(true);
      let imageUrl = editingCategoryImageUrl;

      if (categoryFile) {
        const uploadResponse = await uploadAPI.uploadMedia(categoryFile, { folder: "appzeto/dining/categories" });
        imageUrl = uploadResponse?.data?.data?.url || "";
      }

      const response = editingCategoryId ?
      await adminAPI.updateDiningCategory(editingCategoryId, {
        name: trimmedCategoryName,
        ...(imageUrl ? { imageUrl } : {})
      }) :
      await adminAPI.createDiningCategory({
        name: trimmedCategoryName,
        imageUrl
      });

      if (response.data.success) {
        setSuccess(editingCategoryId ? "Category updated successfully" : "Category created successfully");
        resetCategoryForm();
        fetchCategories();
      }
    } catch (err) {setError(err.response?.data?.message || (editingCategoryId ? "Failed to update category" : "Failed to create category"));} finally
    {setCategoriesUploading(false);}
  };

  const handleDeleteCategory = async (id) => {
    if (!(await confirmApp("Delete this category?"))) return;
    try {
      setCategoriesDeleting(id);
      await adminAPI.deleteDiningCategory(id);
      fetchCategories();
      setSuccess("Category deleted");
    } catch (err) {setError("Failed to delete category");} finally
    {setCategoriesDeleting(null);}
  };

  // ==================== BANNERS ====================
  const fetchBanners = async () => {
    try {
      setBannersLoading(true);
      const response = await api.get('/food/hero-banners/dining', getAuthConfig());
      if (response.data.success) {
        setBanners(response.data.data.banners || []);
      } else {
        setBanners([]);
      }
    } catch (err) {
      debugError(err);
      setBanners([]);
    } finally {setBannersLoading(false);}
  };

  const handleSubmitBanner = async () => {
    setError(null);
    setSuccess(null);
    if (!editingBannerId && !bannerFile) {
      return setError("Banner image is required");
    }

    const trimmedPromo = bannerPercentageOff.trim();
    const trimmedTagline = bannerTagline.trim();

    if (trimmedPromo.length > 20) {
      return setError("Promo Text cannot exceed 20 characters");
    }
    if (trimmedTagline.length > 20) {
      return setError("Tagline cannot exceed 20 characters");
    }

    try {
      setBannersUploading(true);
      const formData = new FormData();
      if (bannerFile) {
        formData.append('files', bannerFile);
      }
      if (trimmedTagline) formData.append('title', trimmedTagline);
      if (trimmedPromo) formData.append('ctaText', trimmedPromo);
      formData.append('zoneId', selectedZoneId === "all" ? "" : selectedZoneId);
      formData.append('city', bannerCity.trim());
      formData.append('state', bannerState.trim());

      const response = editingBannerId 
        ? await api.patch(`/food/hero-banners/dining/${editingBannerId}`, formData, getAuthConfig({
            headers: { 'Content-Type': 'multipart/form-data' }
          }))
        : await api.post('/food/hero-banners/dining/multiple', formData, getAuthConfig({
            headers: { 'Content-Type': 'multipart/form-data' }
          }));

      if (response.data.success) {
        setSuccess(editingBannerId ? "Dining page banner updated successfully" : "Dining page banner created successfully");
        resetBannerForm();
        fetchBanners();
      }
    } catch (err) {setError(err.response?.data?.message || (editingBannerId ? "Failed to update dining page banner" : "Failed to create dining page banner"));} finally
    {setBannersUploading(false);}
  };

  const resetBannerForm = () => {
    setBannerFile(null);
    setBannerPercentageOff("");
    setBannerTagline("");
    setSelectedZoneId("all");
    setBannerCity("");
    setBannerState("");
    setEditingBannerId(null);
    if (bannerFileInputRef.current) bannerFileInputRef.current.value = "";
  };

  const handleEditBanner = (banner) => {
    setError(null);
    setSuccess(null);
    setEditingBannerId(banner._id);
    setBannerPercentageOff(banner.ctaText || "");
    setBannerTagline(banner.title || "");
    setSelectedZoneId(banner.zoneId || "all");
    setBannerCity(banner.city || "");
    setBannerState(banner.state || "");
    setBannerFile(null);
    if (bannerFileInputRef.current) bannerFileInputRef.current.value = "";
  };

  const handleDeleteBanner = async (id) => {
    if (!(await confirmApp("Delete this banner?"))) return;
    try {
      setBannersDeleting(id);
      await api.delete(`/food/hero-banners/dining/${id}`, getAuthConfig());
      fetchBanners();
      setSuccess("Banner deleted");
    } catch (err) {setError("Failed to delete banner");} finally
    {setBannersDeleting(null);}
  };

  const tabs = [
  { id: 'categories', label: 'Dining Categories', icon: Layout },
  { id: 'banners', label: 'Dining Banners', icon: ImageIcon }];


  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center">
                            <UtensilsCrossed className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900">Dining Management</h1>
                            <p className="text-sm text-slate-600 mt-1">Manage dining categories, restaurant links, banners, and stories</p>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-2 mb-6">
                    <div className="flex gap-2">
                        {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === tab.id ? 'bg-blue-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`
                  }>
                  
                                    <Icon className="w-4 h-4" />
                                    {tab.label}
                                </button>);

            })}
                    </div>
                </div>

                {/* Messages */}
                {success && <div className="mb-6 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center gap-2 max-w-2xl"><CheckCircle2 className="w-5 h-5" />{success}</div>}
                {error && <div className="mb-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center gap-2 max-w-2xl"><AlertCircle className="w-5 h-5" />{error}</div>}

                {/* Content */}
                {activeTab === 'categories' &&
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-1">
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                                <div className="flex items-center justify-between gap-3 mb-4">
                                    <h2 className="text-lg font-bold text-slate-900">{editingCategoryId ? "Edit Category" : "Add Category"}</h2>
                                    {editingCategoryId &&
                <Button type="button" variant="outline" onClick={resetCategoryForm} className="gap-2">
                                            <X className="w-4 h-4" />
                                            Cancel
                                        </Button>
                }
                                </div>
                                <div className="space-y-4">
                                    <div>
                                        <Label>Name</Label>
                                        <Input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} maxLength={20} placeholder="Category Name" className="mt-1" />
                                    </div>
                                    <div>
                                        <Label>{editingCategoryId ? "Replace Image" : "Image"}</Label>
                                        <Input type="file" ref={categoryFileInputRef} onChange={(e) => setCategoryFile(e.target.files[0])} accept="image/*" className="mt-1" />
                                        {editingCategoryId && editingCategoryImageUrl && !categoryFile &&
                  <div className="mt-3">
                                                <img src={editingCategoryImageUrl} alt={categoryName || "Current category"} className="w-24 h-24 rounded-lg object-cover border border-slate-200" />
                                                <p className="text-xs text-slate-500 mt-2">Current image will be kept unless you select a new one.</p>
                                            </div>
                  }
                                    </div>
                                    <Button onClick={handleSubmitCategory} disabled={categoriesUploading} className="w-full bg-blue-600 hover:bg-blue-700">
                                        {categoriesUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : editingCategoryId ? "Update Category" : "Create Category"}
                                    </Button>
                                </div>
                            </div>
                        </div>
                        <div className="lg:col-span-2">
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                                <h2 className="text-lg font-bold text-slate-900 mb-4">Categories List</h2>
                                {categoriesLoading ? <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div> :
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {categories.map((cat) =>
                <div key={cat._id} className="border rounded-lg overflow-hidden group relative">
                                                <img src={cat.imageUrl} alt={cat.name} className="w-full h-32 object-cover" />
                                                <div className="p-3 bg-white">
                                                    <p className="font-medium text-slate-900">{cat.name}</p>
                                                </div>
                                                <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => handleEditCategory(cat)} className="p-1.5 bg-blue-100 text-blue-600 rounded-full">
                                                        <Edit className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => handleDeleteCategory(cat._id)} className="p-1.5 bg-red-100 text-red-600 rounded-full">
                                                        {categoriesDeleting === cat._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                            </div>
                )}
                                        {categories.length === 0 && <p className="text-slate-500 text-center col-span-full py-8">No categories found.</p>}
                                    </div>
              }
                            </div>
                        </div>
                    </div>
        }

                {activeTab === 'banners' &&
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-1">
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                                <div className="flex items-center justify-between gap-3 mb-2">
                                    <h2 className="text-lg font-bold text-slate-900">{editingBannerId ? "Edit Banner" : "Add Dining Page Banner"}</h2>
                                    {editingBannerId &&
                                        <Button type="button" variant="outline" onClick={resetBannerForm} className="gap-2 px-2 py-1 h-auto text-xs">
                                            <X className="w-3.5 h-3.5" />
                                            Cancel
                                        </Button>
                                    }
                                </div>
                                <p className="text-sm text-slate-500 mb-4">
                                    This banner shows on the user dining page and is not linked to any restaurant.
                                </p>
                                <div className="space-y-4">
                                    <div>
                                        <Label>{editingBannerId ? "Replace Image" : "Image"}</Label>
                                        <Input
                                            type="file"
                                            ref={bannerFileInputRef}
                                            onChange={(e) => {
                                                setBannerFile(e.target.files[0] || null);
                                                setError(null);
                                            }}
                                            accept="image/*"
                                            className="mt-1" />
                                        {editingBannerId && !bannerFile && (
                                            <div className="mt-3">
                                                <img src={banners.find(b => b._id === editingBannerId)?.imageUrl} alt="Current banner" className="w-full h-24 rounded-lg object-cover border border-slate-200" />
                                                <p className="text-xs text-slate-500 mt-2">Current image will be kept unless you select a new one.</p>
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <Label>Promo Text</Label>
                                        <Input value={bannerPercentageOff} onChange={(e) => {setBannerPercentageOff(e.target.value);setError(null);}} maxLength={20} placeholder="Optional, e.g. 50% OFF" className="mt-1" />
                                    </div>
                                    <div>
                                        <Label>Tagline</Label>
                                        <Input value={bannerTagline} onChange={(e) => {setBannerTagline(e.target.value);setError(null);}} maxLength={20} placeholder="Optional, e.g. Weekend dining specials" className="mt-1" />
                                    </div>
                                    <div>
                                        <Label>Zone</Label>
                                        <select 
                                            value={selectedZoneId} 
                                            onChange={(e) => setSelectedZoneId(e.target.value)}
                                            className="w-full mt-1 border border-slate-200 rounded-md bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="all">Global (all zones)</option>
                                            {zones.map((z) => (
                                                <option key={z._id} value={z._id}>
                                                    {z.zoneName || z.name || z.serviceLocation}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <Label>City</Label>
                                        <Input value={bannerCity} onChange={(e) => setBannerCity(e.target.value)} placeholder="Optional, e.g. Hyderabad" className="mt-1" />
                                    </div>
                                    <div>
                                        <Label>State</Label>
                                        <Input value={bannerState} onChange={(e) => setBannerState(e.target.value)} placeholder="Optional, e.g. Telangana" className="mt-1" />
                                    </div>
                                    <Button onClick={handleSubmitBanner} disabled={bannersUploading} className="w-full bg-blue-600 hover:bg-blue-700">
                                        {bannersUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : editingBannerId ? "Update Banner" : "Create Banner"}
                                    </Button>
                                </div>
                            </div>
                        </div>
                        <div className="lg:col-span-2">
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                                <h2 className="text-lg font-bold text-slate-900 mb-4">Dining Page Banners</h2>
                                {bannersLoading ? <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div> :
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {banners.map((banner) => (
                                            <div key={banner._id} className="border rounded-lg overflow-hidden group relative">
                                                <img src={banner.imageUrl} alt={banner.title || "Dining banner"} className="w-full h-32 object-cover" />
                                                <div className="p-3 bg-white">
                                                    {banner.ctaText && <p className="font-bold text-slate-900">{banner.ctaText}</p>}
                                                    {banner.title && <p className="text-sm text-slate-600">{banner.title}</p>}
                                                    {(banner.zoneId || banner.city || banner.state) && (
                                                         <div className="text-[9px] text-slate-500 font-semibold mt-1 flex flex-wrap gap-1">
                                                             {banner.zoneId && <span className="bg-slate-100 border border-slate-200 px-1 rounded">Zone: {zones.find(z => z._id === banner.zoneId)?.zoneName || "Zone"}</span>}
                                                             {banner.city && <span className="bg-slate-100 border border-slate-200 px-1 rounded">City: {banner.city}</span>}
                                                             {banner.state && <span className="bg-slate-100 border border-slate-200 px-1 rounded">State: {banner.state}</span>}
                                                         </div>
                                                    )}
                                                    <p className="text-xs text-slate-500 mt-1.5">
                                                        {banner.isActive === false ? "Inactive" : "Active on dining page"}
                                                    </p>
                                                </div>
                                                <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => handleEditBanner(banner)} className="p-1.5 bg-blue-100 text-blue-600 rounded-full">
                                                        <Edit className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => handleDeleteBanner(banner._id)} className="p-1.5 bg-red-100 text-red-600 rounded-full">
                                                        {bannersDeleting === banner._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                        {banners.length === 0 && <p className="text-slate-500 text-center col-span-full py-8">No banners found.</p>}
                                    </div>
              }
                            </div>
                        </div>
                    </div>
        }
            </div>
        </div>);
}