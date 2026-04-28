import { useEffect, useMemo, useState } from "react"
import { Shield, Plus, Pencil, Trash2, Loader2 } from "lucide-react"
import { adminAPI } from "@food/api"
import { useAuth } from "@/core/context/AuthContext"
import { ADMIN_SIDEBAR_ACCESS_OPTIONS, ADMIN_ACCESS_LABEL_MAP } from "@food/utils/adminAccessConfig"

const initialForm = {
  name: "",
  email: "",
  phone: "",
  password: "",
  roleTitle: "",
  adminType: "SUBADMIN",
  zoneAccess: "all",
  zoneIds: [],
  sidebarPermissions: [],
  isActive: true,
}

const normalizeZoneId = (zone) => String(zone?._id || zone?.id || zone || "")

const getFormValidationError = (form, editingId = "") => {
  const adminType = String(form?.adminType || "").toUpperCase()
  const zoneAccess = String(form?.zoneAccess || "").toLowerCase()
  const password = String(form?.password || "")
  const email = String(form?.email || "").trim()

  if (!email) return "Email is required."
  if (!editingId && !password) return "Password is required."
  if (password && password.length < 6) return "Password must be at least 6 characters."

  if (adminType === "SUBADMIN") {
    if (!Array.isArray(form?.sidebarPermissions) || form.sidebarPermissions.length === 0) {
      return "Select at least one sidebar access for sub admin."
    }
    if (zoneAccess === "custom" && (!Array.isArray(form?.zoneIds) || form.zoneIds.length === 0)) {
      return "Select at least one zone for custom zone access."
    }
  }

  return ""
}

export default function ManageAdmins() {
  const { user } = useAuth()
  const [admins, setAdmins] = useState([])
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState("")
  const [error, setError] = useState("")
  const [form, setForm] = useState(initialForm)

  const isSuperAdmin = String(user?.adminType || "").toUpperCase() !== "SUBADMIN"

  const loadData = async () => {
    setLoading(true)
    setError("")
    try {
      const [adminsRes, zonesRes] = await Promise.all([
        adminAPI.getAdmins(),
        adminAPI.getZones({ limit: 1000, isActive: true }),
      ])
      setAdmins(adminsRes?.data?.data?.admins || [])
      setZones(zonesRes?.data?.data?.zones || [])
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load admins")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isSuperAdmin) {
      loadData()
    } else {
      setLoading(false)
    }
  }, [isSuperAdmin])

  const resetForm = () => {
    setForm(initialForm)
    setEditingId("")
  }

  const visiblePermissions = useMemo(() => {
    if (form.adminType === "SUPERADMIN") return []
    return ADMIN_SIDEBAR_ACCESS_OPTIONS
  }, [form.adminType])

  const togglePermission = (key) => {
    setForm((prev) => ({
      ...prev,
      sidebarPermissions: prev.sidebarPermissions.includes(key)
        ? prev.sidebarPermissions.filter((item) => item !== key)
        : [...prev.sidebarPermissions, key],
    }))
  }

  const toggleZone = (zoneId) => {
    setForm((prev) => ({
      ...prev,
      zoneIds: prev.zoneIds.includes(zoneId)
        ? prev.zoneIds.filter((item) => item !== zoneId)
        : [...prev.zoneIds, zoneId],
    }))
  }

  const startEdit = (admin) => {
    setEditingId(String(admin?._id || admin?.id || ""))
    setForm({
      name: admin?.name || "",
      email: admin?.email || "",
      phone: admin?.phone || "",
      password: "",
      roleTitle: admin?.roleTitle || "",
      adminType: admin?.adminType || "SUBADMIN",
      zoneAccess: admin?.zoneAccess || "all",
      zoneIds: Array.isArray(admin?.zoneIds) ? admin.zoneIds.map(normalizeZoneId).filter(Boolean) : [],
      sidebarPermissions: Array.isArray(admin?.sidebarPermissions) ? admin.sidebarPermissions : [],
      isActive: admin?.isActive !== false,
    })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError("")
    const validationError = getFormValidationError(form, editingId)
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    try {
      const payload = {
        ...form,
        roleTitle: form.roleTitle.trim() || (form.adminType === "SUPERADMIN" ? "Super Admin" : "Sub Admin"),
        sidebarPermissions: form.adminType === "SUPERADMIN" ? [] : form.sidebarPermissions,
        zoneAccess: form.adminType === "SUPERADMIN" ? "all" : form.zoneAccess,
        zoneIds: form.adminType === "SUPERADMIN" || form.zoneAccess === "all" ? [] : form.zoneIds,
      }
      if (editingId) {
        if (!payload.password) delete payload.password
        await adminAPI.updateManagedAdmin(editingId, payload)
      } else {
        await adminAPI.createAdmin(payload)
      }
      resetForm()
      await loadData()
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save admin")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this admin account?")) return
    try {
      await adminAPI.deleteManagedAdmin(id)
      if (editingId === id) resetForm()
      await loadData()
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to delete admin")
    }
  }

  if (!isSuperAdmin) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          This section is available only for super admins.
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Manage Admins</h1>
              <p className="text-sm text-slate-600">Create sub admins, assign sidebar access, and restrict them by zone.</p>
            </div>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        ) : null}

        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{editingId ? "Edit Admin" : "Create Admin"}</h2>
              <p className="text-sm text-slate-500">Super admins always get full access. Sub admins can be restricted by sidebar and zone.</p>
            </div>
            {editingId ? (
              <button type="button" onClick={resetForm} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
                Cancel Edit
              </button>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <input className="rounded-xl border border-slate-300 px-4 py-3 text-sm" placeholder="Full name" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
            <input className="rounded-xl border border-slate-300 px-4 py-3 text-sm" placeholder="Email" type="email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} required />
            <input className="rounded-xl border border-slate-300 px-4 py-3 text-sm" placeholder="Phone" value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} />
            <input className="rounded-xl border border-slate-300 px-4 py-3 text-sm" placeholder={editingId ? "New password (optional)" : "Password"} type="password" value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} required={!editingId} />
            <input className="rounded-xl border border-slate-300 px-4 py-3 text-sm" placeholder="Role title" value={form.roleTitle} onChange={(e) => setForm((prev) => ({ ...prev, roleTitle: e.target.value }))} />
            <select className="rounded-xl border border-slate-300 px-4 py-3 text-sm" value={form.adminType} onChange={(e) => setForm((prev) => ({ ...prev, adminType: e.target.value }))}>
              <option value="SUPERADMIN">Super Admin</option>
              <option value="SUBADMIN">Sub Admin</option>
            </select>
            <select className="rounded-xl border border-slate-300 px-4 py-3 text-sm" value={form.zoneAccess} disabled={form.adminType === "SUPERADMIN"} onChange={(e) => setForm((prev) => ({ ...prev, zoneAccess: e.target.value }))}>
              <option value="all">All zones</option>
              <option value="custom">Selected zones only</option>
            </select>
            <label className="flex items-center gap-3 rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))} />
              Active account
            </label>
          </div>

          {form.adminType === "SUBADMIN" && form.zoneAccess === "custom" ? (
            <div className="mt-6">
              <p className="mb-3 text-sm font-semibold text-slate-900">Zone access</p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {zones.map((zone) => {
                  const zoneId = normalizeZoneId(zone)
                  const label = zone?.serviceLocation || zone?.zoneName || zone?.name || zoneId
                  return (
                    <label key={zoneId} className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                      <input type="checkbox" checked={form.zoneIds.includes(zoneId)} onChange={() => toggleZone(zoneId)} />
                      <span>{label}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          ) : null}

          {form.adminType === "SUBADMIN" ? (
            <div className="mt-6">
              <p className="mb-3 text-sm font-semibold text-slate-900">Sidebar access</p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visiblePermissions.map((permission) => (
                  <label key={permission.key} className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                    <input type="checkbox" checked={form.sidebarPermissions.includes(permission.key)} onChange={() => togglePermission(permission.key)} />
                    <span>{permission.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Super admins get full sidebar and all-zone access automatically.
            </div>
          )}

          <div className="mt-6 flex items-center gap-3">
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-70">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {editingId ? "Update Admin" : "Create Admin"}
            </button>
            <button type="button" onClick={resetForm} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700">
              Reset
            </button>
          </div>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Admin Accounts</h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{admins.length}</span>
          </div>

          {loading ? (
            <div className="flex items-center gap-3 py-10 text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading admins...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-3">Admin</th>
                    <th className="py-3">Role</th>
                    <th className="py-3">Status</th>
                    <th className="py-3">Zones</th>
                    <th className="py-3">Access</th>
                    <th className="py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map((admin) => {
                    const adminId = String(admin?._id || admin?.id || "")
                    const zoneText = admin?.adminType === "SUPERADMIN" || admin?.zoneAccess === "all"
                      ? "All zones"
                      : (admin?.zoneIds || []).map((zone) => zone?.serviceLocation || zone?.zoneName || zone?.name || normalizeZoneId(zone)).join(", ")
                    const accessText = admin?.adminType === "SUPERADMIN"
                      ? "Full access"
                      : (admin?.sidebarPermissions || []).map((key) => ADMIN_ACCESS_LABEL_MAP[key] || key).join(", ")
                    return (
                      <tr key={adminId} className="border-b border-slate-100 align-top text-sm text-slate-700">
                        <td className="py-4">
                          <div className="font-semibold text-slate-900">{admin?.name || "Unnamed Admin"}</div>
                          <div className="text-xs text-slate-500">{admin?.email}</div>
                        </td>
                        <td className="py-4">
                          <div>{admin?.roleTitle || "-"}</div>
                          <div className="text-xs text-slate-500">{admin?.adminType === "SUPERADMIN" ? "Super Admin" : "Sub Admin"}</div>
                        </td>
                        <td className="py-4">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${admin?.isActive !== false ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                            {admin?.isActive !== false ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="py-4 text-slate-600">{zoneText || "-"}</td>
                        <td className="py-4 text-slate-600">{accessText || "-"}</td>
                        <td className="py-4">
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => startEdit(admin)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </button>
                            <button type="button" onClick={() => handleDelete(adminId)} className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700">
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
