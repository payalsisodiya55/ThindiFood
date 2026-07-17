import { useEffect, useMemo, useState } from "react"
import { adminAPI, supportAPI, uploadAPI } from "@food/api"
import { setCachedSettings } from "@food/utils/businessSettings"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Send, Paperclip, MessageSquare, Check, CheckCheck, X } from "lucide-react"

export default function SupportTickets() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [contactLoading, setContactLoading] = useState(true)
  const [contactSaving, setContactSaving] = useState(false)
  const [filters, setFilters] = useState({ status: "", type: "", source: "all" })
  const [editing, setEditing] = useState({})
  const [editingAttachments, setEditingAttachments] = useState({})
  const [uploadingAttachment, setUploadingAttachment] = useState({})

  // Admin Drawer Chat States
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [replyText, setReplyText] = useState("")
  const [replySubmitting, setReplySubmitting] = useState(false)
  const [replyAttachments, setReplyAttachments] = useState([])
  const [uploadingReplyAttachment, setUploadingReplyAttachment] = useState(false)

  // Keep selectedTicket in sync with the tickets list
  useEffect(() => {
    if (selectedTicket) {
      const updated = tickets.find(t => String(t._id) === String(selectedTicket._id))
      if (updated) {
        setSelectedTicket(updated)
      }
    }
  }, [tickets, selectedTicket])

  // Track ticket viewed timestamp to clear notification badges
  useEffect(() => {
    if (selectedTicket) {
      localStorage.setItem(`admin_ticket_viewed_${selectedTicket._id}`, Date.now().toString())
    }
  }, [selectedTicket])

  const getAdminUnreadCount = (ticket) => {
    if (ticket.status === 'resolved') return 0
    const msgs = ticket.messages || []
    const partnerMsgs = msgs.filter(m => m.sender === 'restaurant' || m.sender === 'user')
    if (partnerMsgs.length === 0) {
      return 0
    }
    const lastViewed = localStorage.getItem(`admin_ticket_viewed_${ticket._id}`)
    if (!lastViewed) return partnerMsgs.length
    const lastViewedTime = parseInt(lastViewed, 10)
    return partnerMsgs.filter(m => new Date(m.timestamp).getTime() > lastViewedTime).length
  }

  const handleSendAdminReply = async (e) => {
    if (e) e.preventDefault()
    if (!replyText.trim() || !selectedTicket) return

    try {
      setReplySubmitting(true)
      await supportAPI.updateSupportTicketAdmin(selectedTicket._id, {
        adminResponse: replyText.trim(),
        adminAttachments: replyAttachments,
        source: selectedTicket.source || "user"
      })
      toast.success("Reply sent successfully")
      setReplyText("")
      setReplyAttachments([])
      await load()
    } catch {
      toast.error("Failed to send reply")
    } finally {
      setReplySubmitting(false)
    }
  }

  const handleAdminReplyAttachmentUpload = async (file) => {
    if (!file) return
    try {
      setUploadingReplyAttachment(true)
      const res = await uploadAPI.uploadMedia(file, { folder: "food/admin/support-tickets" })
      const url = res?.data?.data?.url || res?.data?.url
      if (url) {
        setReplyAttachments(p => [...p, url])
        toast.success("Attachment uploaded")
      } else {
        toast.error("Upload failed")
      }
    } catch {
      toast.error("Upload failed")
    } finally {
      setUploadingReplyAttachment(false)
    }
  }

  const handleAdminAttachmentUpload = async (ticketId, file) => {
    if (!file) return
    try {
      setUploadingAttachment(p => ({ ...p, [ticketId]: true }))
      const res = await uploadAPI.uploadMedia(file, { folder: "food/admin/support-tickets" })
      const url = res?.data?.data?.url || res?.data?.url
      if (url) {
        setEditingAttachments(p => ({ ...p, [ticketId]: [...(p[ticketId] || []), url] }))
        toast.success("Attachment uploaded")
      } else {
        toast.error("Upload failed")
      }
    } catch {
      toast.error("Upload failed")
    } finally {
      setUploadingAttachment(p => ({ ...p, [ticketId]: false }))
    }
  }

  const removeAdminAttachment = (ticketId, idx) => {
    setEditingAttachments(p => ({ ...p, [ticketId]: (p[ticketId] || []).filter((_, i) => i !== idx) }))
  }

  const handleSaveResponse = async (id) => {
    const text = editing[id] ?? tickets.find(t => String(t._id) === String(id))?.adminResponse ?? ""
    const list = editingAttachments[id] || []
    await update(id, { adminResponse: text, adminAttachments: list })
    // Clear editing attachments
    setEditingAttachments(p => {
      const copy = { ...p }
      delete copy[id]
      return copy
    })
  }
  const [contactForm, setContactForm] = useState({
    companyName: "",
    email: "",
    phoneCountryCode: "+91",
    phoneNumber: "",
    address: "",
    state: "",
    pincode: "",
    region: "India",
    supportContactName: "",
    supportContactEmail: "",
    supportContactNumber: "",
  })

  const stats = useMemo(() => {
    const total = tickets.length
    const open = tickets.filter((t) => t.status === "open").length
    const inProgress = tickets.filter((t) => t.status === "in-progress").length
    const resolved = tickets.filter((t) => t.status === "resolved").length
    return { total, open, inProgress, resolved }
  }, [tickets])

  const getUserLabel = (ticket) => {
    if (ticket.source === "restaurant") return "Restaurant Panel"
    const user = ticket.user || {}
    const name = user.name || ticket.userName || ""
    const phone = user.phone || ticket.userPhone || ""
    if (name && phone) return `${name} (${phone})`
    if (name) return name
    if (phone) return phone
    const id = ticket.userId ? String(ticket.userId).slice(-6) : ""
    return id ? `#${id}` : "-"
  }

  const getRestaurantLabel = (ticket) => {
    const restaurant = ticket.restaurant || {}
    const name = restaurant.name || ticket.restaurantName || ""
    const city = restaurant.city || ""
    if (name && city) return `${name} (${city})`
    if (name) return name
    return "-"
  }

  const load = async () => {
    setLoading(true)
    try {
      const res = await supportAPI.getSupportTicketsAdmin(filters)
      const list = res?.data?.data?.tickets || res?.data?.tickets || []
      setTickets(list)
    } catch {
      toast.error("Failed to load tickets")
    } finally {
      setLoading(false)
    }
  }

  const loadSupportContact = async () => {
    setContactLoading(true)
    try {
      const response = await adminAPI.getBusinessSettings()
      const settings = response?.data?.data || response?.data || {}
      setContactForm({
        companyName: settings.companyName || "",
        email: settings.email || "",
        phoneCountryCode: settings.phone?.countryCode || "+91",
        phoneNumber: settings.phone?.number || "",
        address: settings.address || "",
        state: settings.state || "",
        pincode: settings.pincode || "",
        region: settings.region || "India",
        supportContactName: settings.supportContact?.name || "",
        supportContactEmail: settings.supportContact?.email || "",
        supportContactNumber: settings.supportContact?.number || "",
      })
    } catch {
      toast.error("Failed to load support contact details")
    } finally {
      setContactLoading(false)
    }
  }

  const silentLoad = async () => {
    try {
      const res = await supportAPI.getSupportTicketsAdmin(filters)
      const list = res?.data?.data?.tickets || res?.data?.tickets || []
      setTickets(list)
    } catch (error) {
      console.error("Failed to silently refresh tickets", error)
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(silentLoad, 3000)
    return () => clearInterval(interval)
  }, [filters.status, filters.type, filters.source])

  useEffect(() => {
    loadSupportContact()
  }, [])

  const update = async (id, patch) => {
    const ticket = tickets.find((t) => String(t._id) === String(id))
    try {
      await supportAPI.updateSupportTicketAdmin(id, { ...patch, source: ticket?.source || "user" })
      toast.success("Updated")
      setTickets((prev) => prev.map((t) => (String(t._id) === String(id) ? { ...t, ...patch } : t)))
    } catch {
      toast.error("Failed to update")
    }
  }

  const handleContactChange = (field, value) => {
    setContactForm((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const saveSupportContact = async () => {
    if (!contactForm.companyName.trim() || !contactForm.email.trim() || !contactForm.phoneNumber.trim()) {
      toast.error("Business setup fields are required to save support contact")
      return
    }

    try {
      setContactSaving(true)
      const response = await adminAPI.updateBusinessSettings({
        companyName: contactForm.companyName.trim(),
        email: contactForm.email.trim(),
        phoneCountryCode: contactForm.phoneCountryCode || "+91",
        phoneNumber: contactForm.phoneNumber.trim(),
        address: contactForm.address.trim(),
        state: contactForm.state.trim(),
        pincode: contactForm.pincode.trim(),
        region: contactForm.region || "India",
        supportContactName: contactForm.supportContactName.trim(),
        supportContactEmail: contactForm.supportContactEmail.trim(),
        supportContactNumber: contactForm.supportContactNumber.trim(),
      })
      const updatedSettings = response?.data?.data || response?.data
      if (updatedSettings) {
        setCachedSettings(updatedSettings)
        window.dispatchEvent(new CustomEvent("businessSettingsUpdated"))
      }
      toast.success("Support contact updated")
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update support contact")
    } finally {
      setContactSaving(false)
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Support Contact Details</h2>
              <p className="text-sm text-slate-500 mt-1">These details will appear at the top of both user and restaurant support pages.</p>
            </div>
            <button
              type="button"
              onClick={saveSupportContact}
              disabled={contactLoading || contactSaving}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium disabled:opacity-60"
            >
              {contactSaving ? "Saving..." : "Save Contact"}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Name</label>
              <input
                type="text"
                value={contactForm.supportContactName}
                onChange={(e) => handleContactChange("supportContactName", e.target.value)}
                placeholder="Support contact name"
                maxLength={80}
                disabled={contactLoading}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email</label>
              <input
                type="email"
                value={contactForm.supportContactEmail}
                onChange={(e) => handleContactChange("supportContactEmail", e.target.value)}
                placeholder="support@example.com"
                maxLength={100}
                disabled={contactLoading}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Number</label>
              <input
                type="text"
                value={contactForm.supportContactNumber}
                onChange={(e) => handleContactChange("supportContactNumber", e.target.value.replace(/\D/g, ""))}
                placeholder="Support contact number"
                maxLength={15}
                disabled={contactLoading}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Support Tickets</h1>
              <p className="text-sm text-slate-500 mt-1">Review and respond to user and restaurant support tickets.</p>
            </div>
            <div className="flex gap-2">
              <select
                value={filters.source}
                onChange={(e) => setFilters((p) => ({ ...p, source: e.target.value }))}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="all">All Sources</option>
                <option value="user">User</option>
                <option value="restaurant">Restaurant</option>
              </select>
              <select
                value={filters.status}
                onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">All Status</option>
                <option value="open">Open</option>
                <option value="in-progress">In Progress</option>
                <option value="resolved">Resolved</option>
              </select>
              <select
                value={filters.type}
                onChange={(e) => setFilters((p) => ({ ...p, type: e.target.value }))}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
                disabled={filters.source === "restaurant"}
              >
                <option value="">All Types</option>
                <option value="order">Order</option>
                <option value="restaurant">Restaurant</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-50 text-slate-700 border border-slate-200">
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              Total {stats.total}
            </span>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Open {stats.open}
            </span>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              In progress {stats.inProgress}
            </span>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Resolved {stats.resolved}
            </span>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-600">
                  <th className="px-4 py-3">Id</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Restaurant</th>
                  <th className="px-4 py-3">Type/Category</th>
                  <th className="px-4 py-3">Issue</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr><td colSpan={9} className="px-4 py-6 text-center text-slate-500">Loading...</td></tr>
                ) : tickets.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-6 text-center text-slate-500">No tickets</td></tr>
                ) : tickets.map((t) => (
                  <tr key={t._id}>
                    <td className="px-4 py-3">#{String(t._id).slice(-6)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 capitalize">
                        {t.source || "user"}
                      </span>
                    </td>
                    <td className="px-4 py-3">{getUserLabel(t)}</td>
                    <td className="px-4 py-3">{getRestaurantLabel(t)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 capitalize">
                        {t.source === "restaurant" ? (t.category || "other") : t.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-semibold">{t.issueType}</div>
                      {t.subject ? <div className="text-xs text-slate-500 mt-0.5">Subject: {t.subject}</div> : null}
                      {t.orderRef ? <div className="text-xs text-slate-500 mt-0.5">Order: {t.orderRef}</div> : null}
                      {t.description ? <div className="text-xs text-slate-400 mt-1 max-w-xs break-words">{t.description}</div> : null}
                      {t.attachments && t.attachments.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {t.attachments.map((url, idx) => (
                            <a 
                              key={idx} 
                              href={url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-100"
                            >
                              Attachment {idx + 1}
                            </a>
                          ))}
                        </div>
                      ) : null}
                      {t.adminAttachments && t.adminAttachments.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {t.adminAttachments.map((url, idx) => (
                            <a 
                              key={idx} 
                              href={url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 hover:text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100"
                            >
                              Admin Attachment {idx + 1}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className={`inline-flex px-2 py-0.5 rounded-full font-bold capitalize border ${
                        t.status === 'resolved' 
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                          : t.status === 'in-progress' 
                          ? 'bg-blue-50 border-blue-200 text-blue-700' 
                          : 'bg-amber-50 border-amber-200 text-amber-700'
                      }`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">{new Date(t.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedTicket(t)}
                          className="px-3 py-1.5 rounded-lg bg-[#00c87e] hover:bg-[#00b06f] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors whitespace-nowrap"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          Chat ({t.messages ? t.messages.length : 0})
                        </button>
                        {getAdminUnreadCount(t) > 0 && (
                          <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse whitespace-nowrap">
                            {getAdminUnreadCount(t)} New
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Admin Slide-over Chat Panel */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-200"
            onClick={() => setSelectedTicket(null)}
          />

          {/* Drawer Panel */}
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-250">
            {/* Header */}
            <div className="p-4 border-b border-slate-200 flex flex-col bg-slate-50">
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={() => setSelectedTicket(null)}
                  className="p-1 hover:bg-slate-200 rounded-lg text-slate-700 transition-colors cursor-pointer shrink-0"
                  aria-label="Close panel"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <span className="text-xs font-bold text-slate-400">
                  #{String(selectedTicket._id).toUpperCase()}
                </span>
                <select
                  value={selectedTicket.status}
                  onChange={(e) => update(selectedTicket._id, { status: e.target.value })}
                  className="border rounded px-2 py-0.5 text-[11px] bg-white font-bold text-slate-700 cursor-pointer"
                >
                  <option value="open">Open</option>
                  <option value="in-progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
              <div className="pl-8">
                <h3 className="text-base font-bold text-slate-900 break-words">
                  {selectedTicket.issueType}
                </h3>
                <p className="text-[11px] text-slate-500 font-medium capitalize">
                  Source: {selectedTicket.source || "user"} • Category: {selectedTicket.category || "other"}
                </p>
                <p className="text-[11px] text-slate-500 font-semibold mt-1">
                  Client: {getUserLabel(selectedTicket)}
                </p>
                {selectedTicket.source === "restaurant" && (
                  <p className="text-[11px] text-slate-500 font-semibold">
                    Store: {getRestaurantLabel(selectedTicket)}
                  </p>
                )}
              </div>
            </div>

            {/* Attachments Section */}
            {selectedTicket.attachments && selectedTicket.attachments.length > 0 && (
              <div className="px-4 py-2 bg-slate-100 border-b border-slate-200">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Attachments</p>
                <div className="flex flex-wrap gap-2">
                  {selectedTicket.attachments.map((url, idx) => (
                    <a
                      key={idx}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      Attachment {idx + 1}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Messages Thread (Chronological Order) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
              {(() => {
                const msgs = []
                // Initial description
                if (selectedTicket.description) {
                  msgs.push({
                    sender: selectedTicket.source === "restaurant" ? "restaurant" : "user",
                    message: selectedTicket.description,
                    timestamp: selectedTicket.createdAt,
                    attachments: selectedTicket.attachments || []
                  })
                }
                // Push database message thread
                if (selectedTicket.messages && selectedTicket.messages.length > 0) {
                  const hasInitial = selectedTicket.messages.some(m => m.message === selectedTicket.description)
                  if (hasInitial) {
                    msgs.length = 0
                  }
                  msgs.push(...selectedTicket.messages)
                }
                const sorted = msgs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                return sorted.map((msg, index) => {
                  const isUserSender = msg.sender === 'user' || msg.sender === 'restaurant'
                  return (
                    <div key={index} className={`flex flex-col ${isUserSender ? "items-start" : "items-end"}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 shadow-xs ${
                          isUserSender
                            ? "bg-white border border-slate-200 text-slate-800 rounded-tl-none"
                            : "bg-[#00c87e] text-white rounded-tr-none"
                        }`}
                      >
                        <p className={`text-[10px] font-black uppercase tracking-wider mb-1 ${
                          isUserSender ? "text-blue-600" : "text-white"
                        }`}>
                          {isUserSender 
                            ? (selectedTicket.source === "restaurant" ? "Restaurant Partner" : "User") 
                            : "You (Admin Support)"
                          }
                        </p>
                        <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                          {msg.message}
                        </p>
                        
                        {/* Attachments rendering */}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="flex flex-col gap-1.5 mt-2 border-t border-slate-100 pt-2">
                            {msg.attachments.map((url, idx) => (
                              <a
                                key={idx}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`inline-flex items-center gap-1 text-xs font-semibold hover:underline ${
                                  isUserSender ? "text-blue-600" : "text-white"
                                }`}
                              >
                                <Paperclip className="w-3.5 h-3.5" />
                                Attachment {idx + 1}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 px-1">
                        <span className="text-[9px] text-slate-400">
                          {new Date(msg.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )
                })
              })()}
            </div>

            {/* Chat Action Input */}
            <div className="p-4 border-t border-slate-200 bg-white space-y-3">
              {selectedTicket.status !== "resolved" ? (
                <>
                  <form onSubmit={handleSendAdminReply} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Type your reply here..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#00c87e]/20 focus:border-[#00c87e]"
                    />
                    <button
                      type="submit"
                      disabled={replySubmitting || !replyText.trim()}
                      className="p-2 rounded-lg bg-[#00c87e] hover:bg-[#00b06f] text-white disabled:opacity-60 transition-colors cursor-pointer"
                    >
                      {replySubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </form>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      id="admin-reply-file"
                      className="hidden"
                      onChange={(e) => handleAdminReplyAttachmentUpload(e.target.files?.[0])}
                      disabled={uploadingReplyAttachment}
                    />
                    <label
                      htmlFor="admin-reply-file"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      {uploadingReplyAttachment ? "Uploading..." : "Attach File"}
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {replyAttachments.map((url, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1 bg-slate-100 border text-[10px] px-1.5 py-0.5 rounded font-medium text-slate-600">
                          Att {idx + 1}
                          <button type="button" onClick={() => setReplyAttachments(p => p.filter((_, i) => i !== idx))} className="text-red-500 font-bold ml-1">×</button>
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                  <p className="text-xs text-emerald-800 font-semibold">
                    This ticket has been marked resolved.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
