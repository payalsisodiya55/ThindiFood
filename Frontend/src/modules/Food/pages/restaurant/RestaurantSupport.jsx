import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { ArrowLeft, Loader2, Send, Mail, Phone, MessageSquare, CheckCircle2, X, Headphones, MessageSquareOff, Paperclip, ChevronDown, Check, CheckCheck } from "lucide-react"

import { restaurantAPI, uploadAPI } from "@food/api"
import { getCachedSettings, loadBusinessSettings } from "@food/utils/businessSettings"
import BottomNavOrders from "@food/components/restaurant/BottomNavOrders"
import { toast } from "sonner"

const CATEGORY_OPTIONS = [
  { value: "orders", label: "Orders" },
  { value: "payments", label: "Payments & Payouts" },
  { value: "menu", label: "Menu & Pricing" },
  { value: "restaurant", label: "Profile & Settings" },
  { value: "technical", label: "App & Technical" },
  { value: "other", label: "Other" },
]

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low - General question, no rush" },
  { value: "medium", label: "Medium - Affecting my work but I can continue" },
  { value: "high", label: "High - Blocking me from operating right now" },
]

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "open", label: "Open" },
  { value: "in-progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
]

const getStatusStyle = (status) => {
  if (status === "resolved") return "bg-emerald-100 text-emerald-700 border-emerald-200"
  if (status === "in-progress") return "bg-blue-100 text-blue-700 border-blue-200"
  return "bg-amber-100 text-amber-700 border-amber-200"
}

const formatDate = (dateString) => {
  if (!dateString) return ""
  const date = new Date(dateString)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

const formatDateTime = (dateString) => {
  if (!dateString) return ""
  const date = new Date(dateString)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  let hours = date.getHours()
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12
  hours = hours ? hours : 12
  const strTime = `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`
  return `${day}/${month}/${year}, ${strTime}`
}

export default function RestaurantSupport() {
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [statusFilter, setStatusFilter] = useState("")
  const [supportContact, setSupportContact] = useState(() => getCachedSettings()?.supportContact || null)
  
  // Interactive Ticket Conversation States
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [replyText, setReplyText] = useState("")
  const [replySubmitting, setReplySubmitting] = useState(false)
  const [resolveSubmitting, setResolveSubmitting] = useState(false)

  const [form, setForm] = useState({
    category: "",
    issueType: "",
    subject: "",
    orderRef: "",
    priority: "",
    description: "",
  })
  
  const [attachments, setAttachments] = useState([])
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [statusFilterOpen, setStatusFilterOpen] = useState(false)
  const [showResolveModal, setShowResolveModal] = useState(false)

  // Polling for live chat updates
  useEffect(() => {
    if (!selectedTicket?._id) return
    const poll = async () => {
      try {
        const response = await restaurantAPI.getSupportTickets({
          limit: 100,
          page: 1,
        })
        const list = response?.data?.data?.tickets || []
        setTickets(list)
        const updated = list.find(t => t._id === selectedTicket._id)
        if (updated) {
          setSelectedTicket(updated)
        }
      } catch (error) {
        console.error("Failed to poll ticket details", error)
      }
    }
    const interval = setInterval(poll, 3000)
    return () => clearInterval(interval)
  }, [selectedTicket?._id])

  // Track ticket viewed timestamp to clear unread badge
  useEffect(() => {
    if (selectedTicket) {
      localStorage.setItem(`ticket_viewed_${selectedTicket._id}`, Date.now().toString())
    }
  }, [selectedTicket])

  const getUnreadCount = (ticket) => {
    if (ticket.status === 'resolved') return 0
    const msgs = ticket.messages || []
    const adminMsgs = msgs.filter(m => m.sender === 'admin')
    if (adminMsgs.length === 0) {
      return ticket.adminResponse ? 1 : 0
    }
    const lastViewed = localStorage.getItem(`ticket_viewed_${ticket._id}`)
    if (!lastViewed) return adminMsgs.length
    const lastViewedTime = parseInt(lastViewed, 10)
    return adminMsgs.filter(m => new Date(m.timestamp).getTime() > lastViewedTime).length
  }

  const isMessageDelivered = (msg, ticket) => {
    if (ticket.status === 'resolved') return true
    const msgs = ticket.messages || []
    const currentMsgTime = new Date(msg.timestamp).getTime()
    return msgs.some(m => m.sender === 'admin' && new Date(m.timestamp).getTime() > currentMsgTime)
  }

  const hasUnread = (ticket) => {
    return getUnreadCount(ticket) > 0
  }

  const stats = useMemo(() => {
    const total = tickets.length
    const open = tickets.filter((t) => t.status === "open").length
    const inProgress = tickets.filter((t) => t.status === "in-progress").length
    const resolved = tickets.filter((t) => t.status === "resolved").length
    return { total, open, inProgress, resolved }
  }, [tickets])

  const loadTickets = async () => {
    try {
      setLoading(true)
      const response = await restaurantAPI.getSupportTickets({
        status: statusFilter || undefined,
        limit: 100,
        page: 1,
      })
      const list = response?.data?.data?.tickets || []
      setTickets(list)

      // If a ticket is currently open in the sidebar, update its data as well
      if (selectedTicket) {
        const updated = list.find(t => t._id === selectedTicket._id)
        if (updated) {
          setSelectedTicket(updated)
        }
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load support tickets")
      setTickets([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTickets()
  }, [statusFilter])

  useEffect(() => {
    let active = true
    loadBusinessSettings()
      .then((settings) => {
        if (!active) return
        setSupportContact(settings?.supportContact || null)
      })
      .catch(() => null)
    return () => {
      active = false
    }
  }, [])

  const handleAttachmentUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setUploadingAttachment(true)
      const res = await uploadAPI.uploadMedia(file, { folder: "food/restaurants/support-tickets" })
      const url = res?.data?.data?.url || res?.data?.url
      if (url) {
        setAttachments(prev => [...prev, url])
        toast.success("Attachment uploaded successfully")
      } else {
        toast.error("Failed to get attachment URL")
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to upload attachment")
    } finally {
      setUploadingAttachment(false)
    }
  }

  const removeAttachment = (idx) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.category) {
      toast.error("Please select an issue category")
      return
    }
    if (!form.issueType.trim()) {
      toast.error("Issue type is required")
      return
    }
    if (!form.priority) {
      toast.error("Please select a priority level")
      return
    }
    if (!form.description.trim()) {
      toast.error("Description is required")
      return
    }
    try {
      setSubmitting(true)
      await restaurantAPI.createSupportTicket({
        category: form.category,
        issueType: form.issueType.trim(),
        subject: form.subject.trim(),
        orderRef: form.orderRef.trim(),
        priority: form.priority,
        description: form.description.trim(),
        attachments: attachments,
      })
      toast.success("Support ticket submitted")
      setForm((prev) => ({ ...prev, category: "", issueType: "", subject: "", orderRef: "", priority: "", description: "" }))
      setAttachments([])
      await loadTickets()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to submit support ticket")
    } finally {
      setSubmitting(false)
    }
  }

  // Conversation helper to build chronological message list
  const getConversationMessages = (ticket) => {
    if (!ticket) return []
    const msgs = []

    // If there is no messages thread in DB yet, adapt old format
    if (!ticket.messages || ticket.messages.length === 0) {
      if (ticket.description) {
        msgs.push({
          sender: "restaurant",
          message: ticket.description,
          timestamp: ticket.createdAt,
          attachments: ticket.attachments || []
        })
      }
      if (ticket.adminResponse) {
        msgs.push({
          sender: "admin",
          message: ticket.adminResponse,
          timestamp: ticket.updatedAt || ticket.createdAt,
          attachments: ticket.adminAttachments || []
        })
      }
    } else {
      // Ensure description is the starting point of the conversation
      const hasInitialDesc = ticket.messages.some(
        (m) => m.sender === "restaurant" && m.message === ticket.description
      )
      if (!hasInitialDesc && ticket.description) {
        msgs.push({
          sender: "restaurant",
          message: ticket.description,
          timestamp: ticket.createdAt,
          attachments: ticket.attachments || []
        })
      }
      msgs.push(...ticket.messages)
    }

    return msgs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  }

  // Check if restaurant can mark ticket as resolved (requires admin response)
  const hasReviewedAdminResponse = (ticket) => {
    if (!ticket) return false
    return (ticket.messages && ticket.messages.some((m) => m.sender === "admin")) || !!ticket.adminResponse
  }

  const handleSendReply = async (e) => {
    e.preventDefault()
    if (!replyText.trim() || !selectedTicket) return

    try {
      setReplySubmitting(true)
      const res = await restaurantAPI.replyToSupportTicket(selectedTicket._id, {
        message: replyText.trim(),
      })
      const updatedTicket = res?.data?.data?.ticket || res?.data?.ticket || selectedTicket
      setSelectedTicket(updatedTicket)
      setReplyText("")
      toast.success("Reply sent successfully")
      // Update locally in the list
      setTickets((prev) =>
        prev.map((t) => (t._id === selectedTicket._id ? { ...t, ...updatedTicket } : t))
      )
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to send reply")
    } finally {
      setReplySubmitting(false)
    }
  }

  const handleResolveTicket = async () => {
    setShowResolveModal(true)
  }

  const triggerResolve = async () => {
    if (!selectedTicket) return

    try {
      setResolveSubmitting(true)
      const res = await restaurantAPI.resolveSupportTicket(selectedTicket._id)
      const updatedTicket = res?.data?.data?.ticket || res?.data?.ticket || selectedTicket
      setSelectedTicket(updatedTicket)
      toast.success("Ticket marked as resolved successfully")
      // Update locally in the list
      setTickets((prev) =>
        prev.map((t) => (t._id === selectedTicket._id ? { ...t, ...updatedTicket } : t))
      )
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to resolve ticket")
    } finally {
      setResolveSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col relative overflow-hidden">
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200">
        <div className="px-4 py-3 flex flex-col">
          <div className="flex items-center gap-3">
            <button
              onClick={goBack}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer text-slate-900 shrink-0"
              aria-label="Go back"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-lg font-bold text-slate-900">Support</h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 pl-[48px]">Raise an issue and track its status</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-28">
        {supportContact?.name || supportContact?.email || supportContact?.number ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4 text-slate-500">
              <Headphones className="h-4.5 w-4.5 text-slate-400" />
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Support Contact
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {supportContact?.name && (
                <h3 className="text-lg font-bold text-slate-900 leading-none">
                  {supportContact.name === "Taamio Partner" ? "Taamio Support" : supportContact.name}
                </h3>
              )}

              <div className="flex flex-wrap gap-3">
                {supportContact?.email && (
                  <a
                    href={`mailto:${supportContact.email}`}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-100 hover:border-[#00c87e]/30 hover:bg-[#00c87e]/5 transition-all group"
                  >
                    <div className="h-8 w-8 rounded-lg bg-slate-50 flex items-center justify-center group-hover:bg-[#00c87e]/10 transition-colors">
                      <Mail className="h-4 w-4 text-slate-500 group-hover:text-[#00c87e]" />
                    </div>
                    <span className="text-sm font-medium text-slate-600 group-hover:text-slate-900">
                      {supportContact.email}
                    </span>
                  </a>
                )}

                {supportContact?.number && (
                  <a
                    href={`tel:${supportContact.number}`}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-100 hover:border-[#00c87e]/30 hover:bg-[#00c87e]/5 transition-all group"
                  >
                    <div className="h-8 w-8 rounded-lg bg-slate-50 flex items-center justify-center group-hover:bg-[#00c87e]/10 transition-colors">
                      <Phone className="h-4 w-4 text-slate-500 group-hover:text-[#00c87e]" />
                    </div>
                    <span className="text-sm font-medium text-slate-600 group-hover:text-slate-900">
                      {supportContact.number}
                    </span>
                  </a>
                )}
              </div>
              <p className="text-[10.5px] text-slate-500 italic mt-1">Available Mon–Sat, 9 AM to 9 PM</p>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">Total Tickets</p>
            <p className="text-lg font-bold text-slate-900">{stats.total}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-700">Open</p>
            <p className="text-lg font-bold text-amber-800">{stats.open}</p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
            <p className="text-xs text-blue-700">In Progress</p>
            <p className="text-lg font-bold text-blue-800">{stats.inProgress}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs text-emerald-700">Resolved</p>
            <p className="text-lg font-bold text-emerald-800">{stats.resolved}</p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3"
        >
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-slate-900">Raise Support Ticket</h2>
            <p className="text-xs text-slate-500">Tell us what went wrong and we'll get back to you.</p>
          </div>

          {/* Persistent labels for all fields with custom selects */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1 relative">
              <label className="block text-xs font-semibold text-slate-700">Category *</label>
              <button
                type="button"
                onClick={() => {
                  setCategoryOpen(!categoryOpen)
                  setPriorityOpen(false)
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white text-slate-700 flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#00c87e]/20 focus:border-[#00c87e] transition-all cursor-pointer"
              >
                <span>
                  {CATEGORY_OPTIONS.find(o => o.value === form.category)?.label || "Select Issue Category"}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-500" />
              </button>
              {categoryOpen && (
                <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1">
                  {CATEGORY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setForm(p => ({ ...p, category: option.value }))
                        setCategoryOpen(false)
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#00c87e]/10 text-slate-700 hover:text-slate-900 transition-colors font-medium"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1 relative">
              <label className="block text-xs font-semibold text-slate-700">Priority *</label>
              <button
                type="button"
                onClick={() => {
                  setPriorityOpen(!priorityOpen)
                  setCategoryOpen(false)
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white text-slate-700 flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#00c87e]/20 focus:border-[#00c87e] transition-all cursor-pointer"
              >
                <span className="truncate max-w-[200px]">
                  {PRIORITY_OPTIONS.find(o => o.value === form.priority)?.label || "Select Priority"}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-500" />
              </button>
              {priorityOpen && (
                <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1 max-h-48 overflow-y-auto">
                  {PRIORITY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setForm(p => ({ ...p, priority: option.value }))
                        setPriorityOpen(false)
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#00c87e]/10 text-slate-700 hover:text-slate-900 transition-colors font-medium"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700">Issue Type *</label>
            <input
              value={form.issueType}
              onChange={(e) => setForm((prev) => ({ ...prev, issueType: e.target.value }))}
              placeholder="E.g. Delivery delay, payment issue etc."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#00c87e]/20 focus:border-[#00c87e]"
              maxLength={120}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700">Subject *</label>
            <input
              value={form.subject}
              onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
              placeholder="Brief summary of your issue"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#00c87e]/20 focus:border-[#00c87e]"
              maxLength={180}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700">Order ID (Optional)</label>
            <input
              value={form.orderRef}
              onChange={(e) => setForm((prev) => ({ ...prev, orderRef: e.target.value }))}
              placeholder="Enter Order ID if applicable"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#00c87e]/20 focus:border-[#00c87e]"
              maxLength={80}
            />
            <p className="text-[10px] text-slate-400">Add the Order ID if this is about a specific order</p>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700">Description *</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Describe your issue"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-24 resize-none text-slate-700 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#00c87e]/20 focus:border-[#00c87e]"
              maxLength={1000}
            />
            <p className="text-right text-[10px] text-slate-400 font-semibold">{form.description.length}/1000</p>
          </div>

          {/* Attachments Section */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700">Attachments (Optional)</label>
            <div className="flex items-center gap-3">
              <input
                type="file"
                id="ticket-attachment"
                className="hidden"
                accept="image/*,.pdf,.doc,.docx"
                onChange={handleAttachmentUpload}
                disabled={uploadingAttachment}
              />
              <label
                htmlFor="ticket-attachment"
                className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
              >
                {uploadingAttachment ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                    Attach File
                  </>
                )}
              </label>
            </div>
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {attachments.map((url, idx) => (
                  <div key={idx} className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600">
                    <span className="truncate max-w-[150px]">Attachment {idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(idx)}
                      className="text-red-500 hover:text-red-700 font-bold ml-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-[#00c87e] hover:bg-[#00b06f] text-white py-2.5 text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2 transition-colors duration-150 cursor-pointer"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Submit Ticket
          </button>
        </form>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-slate-900">My Tickets</h2>
            <div className="relative">
              <button
                type="button"
                onClick={() => setStatusFilterOpen(!statusFilterOpen)}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold bg-white text-slate-700 flex items-center gap-1.5 outline-none focus:ring-2 focus:ring-[#00c87e]/20 focus:border-[#00c87e] transition-all cursor-pointer"
              >
                <span>
                  {STATUS_OPTIONS.find(o => o.value === statusFilter)?.label || "All"}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-500" />
              </button>
              {statusFilterOpen && (
                <div className="absolute right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1 min-w-[100px]">
                  {STATUS_OPTIONS.map((option) => (
                    <button
                      key={option.value || "all"}
                      type="button"
                      onClick={() => {
                        setStatusFilter(option.value)
                        setStatusFilterOpen(false)
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#00c87e]/10 text-slate-700 hover:text-slate-900 transition-colors font-semibold"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <div className="py-8 text-center text-slate-500 text-sm flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading tickets...
            </div>
          ) : tickets.length === 0 ? (
            <div className="py-12 text-center flex flex-col items-center justify-center gap-3">
              <MessageSquareOff className="w-12 h-12 text-slate-300" />
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-800">You haven't raised any tickets yet</p>
                <p className="text-xs text-slate-500 max-w-[280px]">Submit one above and track it here.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {tickets.map((ticket) => (
                <div
                  key={ticket._id}
                  onClick={() => setSelectedTicket(ticket)}
                  className="rounded-xl border border-slate-200 p-4 hover:border-[#00c87e]/60 hover:shadow-sm cursor-pointer transition-all duration-200 bg-white flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-[10px] font-semibold text-slate-400">
                          #{String(ticket._id).slice(-6)} • {formatDate(ticket.createdAt)}
                        </p>
                      </div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full border font-bold capitalize ${getStatusStyle(
                          ticket.status
                        )}`}
                      >
                        {ticket.status}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-slate-900 break-words">
                      {ticket.issueType}
                    </p>
                    {ticket.subject ? (
                      <p className="text-xs text-slate-600 mt-1 break-words">
                        Subject: {ticket.subject}
                      </p>
                    ) : null}
                    {ticket.orderRef ? (
                      <p className="text-xs text-slate-600 mt-0.5 break-words">
                        Order: {ticket.orderRef}
                      </p>
                    ) : null}
                    {ticket.description ? (
                      <p className="text-xs text-slate-500 mt-2 break-words">
                        {ticket.description}
                      </p>
                    ) : null}

                    {/* Timeline creation/resolution info */}
                    <div className="mt-3 space-y-0.5 border-t border-slate-100 pt-2 text-[10px] text-slate-400 font-medium">
                      <p>Opened: {formatDateTime(ticket.createdAt)}</p>
                      {ticket.status === 'resolved' && (
                        <>
                          <p>Closed: {formatDateTime(ticket.updatedAt)}</p>
                          <p className="text-[#00c87e] font-semibold">
                            Resolved by: {ticket.statusChangedBy === 'admin' ? 'Taamio Support' : 'Restaurant Partner'}
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-[#00c87e]">
                        <MessageSquare className="w-3.5 h-3.5" />
                        {(() => {
                          const count = ticket.messages?.length || (ticket.adminResponse ? 2 : 1)
                          return count === 1 ? "1 Message" : `${count} Messages`
                        })()}
                      </span>
                      {getUnreadCount(ticket) > 0 && (
                        <span className="bg-red-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full animate-pulse flex items-center justify-center gap-1 shrink-0">
                          {getUnreadCount(ticket)} New
                        </span>
                      )}
                    </div>
                    <span className="text-[#00c87e] hover:text-[#00b06f] font-bold transition-colors">
                      View thread →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Slide-over Ticket Details & Chat Panel */}
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
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full border font-bold capitalize ${getStatusStyle(
                    selectedTicket.status
                  )}`}
                >
                  {selectedTicket.status}
                </span>
              </div>
              <div className="pl-8">
                <h3 className="text-base font-bold text-slate-900 break-words">
                  {selectedTicket.issueType}
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  Category: <span className="capitalize">{selectedTicket.category === "payments" ? "Payments & Payouts" : selectedTicket.category}</span> • Priority:{" "}
                  <span className="capitalize">{selectedTicket.priority}</span>
                </p>
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
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-[#00c87e] hover:bg-[#00c87e]/5 transition-colors"
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
              {getConversationMessages(selectedTicket).map((msg, index) => {
                const isAdmin = msg.sender === "admin"
                const isDelivered = isMessageDelivered(msg, selectedTicket)
                return (
                  <div key={index} className={`flex flex-col ${isAdmin ? "items-start" : "items-end"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 shadow-xs ${
                        isAdmin
                          ? "bg-white border border-slate-200 text-slate-800 rounded-tl-none"
                          : "bg-[#00c87e] text-white rounded-tr-none"
                      }`}
                    >
                      <p className={`text-[10px] font-black uppercase tracking-wider mb-1 ${
                        isAdmin ? "text-blue-600" : "text-white"
                      }`}>
                        {isAdmin ? "Admin Support" : "You"}
                      </p>
                      <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                        {msg.message}
                      </p>
                      
                      {/* Message level attachments sync */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex flex-col gap-1.5 mt-2 border-t border-slate-100 pt-2">
                          {msg.attachments.map((url, idx) => (
                            <a
                              key={idx}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`inline-flex items-center gap-1 text-xs font-semibold hover:underline ${
                                isAdmin ? "text-[#00c87e]" : "text-white"
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
                        {formatDateTime(msg.timestamp)}
                      </span>
                      {!isAdmin && (
                        <div className="inline-flex items-center">
                          {isDelivered ? (
                            <CheckCheck className="w-3.5 h-3.5 text-[#00c87e]" />
                          ) : (
                            <Check className="w-3.5 h-3.5 text-slate-400" />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Chat Action Input & Resolve Panel */}
            <div className="p-4 border-t border-slate-200 bg-white space-y-3">
              {selectedTicket.status !== "resolved" ? (
                <>
                  <form onSubmit={handleSendReply} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Type your reply here..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#00c87e]/20 focus:border-[#00c87e]"
                      maxLength={1000}
                    />
                    <button
                      type="submit"
                      disabled={replySubmitting || !replyText.trim()}
                      className="bg-[#00c87e] hover:bg-[#00b06f] text-white p-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40 flex items-center justify-center cursor-pointer"
                      aria-label="Send message"
                    >
                      {replySubmitting ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Send className="w-5 h-5" />
                      )}
                    </button>
                  </form>

                  {hasReviewedAdminResponse(selectedTicket) ? (
                    <button
                      type="button"
                      onClick={handleResolveTicket}
                      disabled={resolveSubmitting}
                      className="w-full flex items-center justify-center gap-2 py-2 border border-[#00c87e] text-[#00c87e] hover:bg-[#00c87e]/5 rounded-lg text-xs font-bold transition-all cursor-pointer"
                    >
                      {resolveSubmitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      Confirm Resolution (as Restaurant Partner)
                    </button>
                  ) : (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-center">
                      <p className="text-[10px] text-slate-500 font-medium">
                        Resolution will become available after receiving an Admin Response.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                  <p className="text-xs text-emerald-800 font-semibold flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    This ticket has been resolved by {selectedTicket.statusChangedBy === 'admin' ? 'Taamio Support' : 'Restaurant Partner'}.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showResolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4 animate-in fade-in zoom-in duration-200">
            <h3 className="text-base font-bold text-slate-900">Mark this ticket as resolved?</h3>
            <p className="text-xs text-slate-500">
              Are you sure you want to mark this support ticket as resolved? This will close the conversation thread.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowResolveModal(false)}
                className="flex-1 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowResolveModal(false)
                  triggerResolve()
                }}
                className="flex-1 py-2.5 text-xs font-bold text-white bg-[#00c87e] hover:bg-[#00b06f] rounded-lg cursor-pointer"
              >
                Yes, Resolve
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNavOrders />
    </div>
  )
}
