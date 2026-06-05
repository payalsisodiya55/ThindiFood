import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { ArrowLeft, Loader2, Send, Mail, Phone, MessageSquare, CheckCircle2, X } from "lucide-react"

import { restaurantAPI } from "@food/api"
import { getCachedSettings, loadBusinessSettings } from "@food/utils/businessSettings"
import BottomNavOrders from "@food/components/restaurant/BottomNavOrders"
import { toast } from "sonner"

const CATEGORY_OPTIONS = [
  { value: "orders", label: "Orders" },
  { value: "payments", label: "Payments" },
  { value: "menu", label: "Menu" },
  { value: "restaurant", label: "Restaurant Profile" },
  { value: "technical", label: "Technical" },
  { value: "other", label: "Other" },
]

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
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
    category: "orders",
    issueType: "",
    subject: "",
    orderRef: "",
    priority: "",
    description: "",
  })

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

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.issueType.trim()) {
      toast.error("Issue type is required")
      return
    }
    if (!form.priority) {
      toast.error("Please select a priority level")
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
      })
      toast.success("Support ticket submitted")
      setForm((prev) => ({ ...prev, issueType: "", subject: "", orderRef: "", priority: "", description: "" }))
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
        })
      }
      if (ticket.adminResponse) {
        msgs.push({
          sender: "admin",
          message: ticket.adminResponse,
          timestamp: ticket.updatedAt || ticket.createdAt,
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
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={goBack}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            aria-label="Go back"
          >
            <ArrowLeft className="w-6 h-6 text-slate-900" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Support</h1>
            <p className="text-xs text-slate-500">Raise issue and track admin response</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-28">
        {supportContact?.name || supportContact?.email || supportContact?.number ? (
          <div className="rounded-2xl border border-[#00c87e]/20 bg-gradient-to-br from-white to-[#00c87e]/5 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-2 w-2 rounded-full bg-[#00c87e]" />
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#00c87e]">
                Support contact
              </p>
            </div>

            <div className="flex flex-col gap-4">
              {supportContact?.name && (
                <h3 className="text-lg font-bold text-slate-900 leading-none">
                  {supportContact.name}
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
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">Total</p>
            <p className="text-lg font-bold text-slate-900">{stats.total}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-700">Open</p>
            <p className="text-lg font-bold text-amber-800">{stats.open}</p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
            <p className="text-xs text-blue-700">In progress</p>
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
          <h2 className="text-sm font-bold text-slate-900">Raise support ticket</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select
              value={form.category}
              onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white text-slate-500"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={form.priority}
              onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white text-slate-500"
            >
              <option value="" disabled>
                Priority
              </option>
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <input
            value={form.issueType}
            onChange={(e) => setForm((prev) => ({ ...prev, issueType: e.target.value }))}
            placeholder="Issue type (required)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-500"
            maxLength={120}
          />
          <input
            value={form.subject}
            onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
            placeholder="Short subject"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-500"
            maxLength={180}
          />
          <input
            value={form.orderRef}
            onChange={(e) => setForm((prev) => ({ ...prev, orderRef: e.target.value }))}
            placeholder="Order ID (optional)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-500"
            maxLength={80}
          />
          <textarea
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="Describe your issue"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-24 resize-none text-slate-700 placeholder:text-slate-500"
            maxLength={1000}
          />
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
            <h2 className="text-sm font-bold text-slate-900">My tickets</h2>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs bg-white"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="py-8 text-center text-slate-500 text-sm flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading tickets...
            </div>
          ) : tickets.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-sm">No support tickets found.</div>
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
                      <p className="text-[10px] font-semibold text-slate-400">
                        #{String(ticket._id).slice(-6)} • {new Date(ticket.createdAt).toLocaleDateString()}
                      </p>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full border font-bold capitalize ${getStatusStyle(
                          ticket.status
                        )}`}
                      >
                        {ticket.status}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-slate-900 line-clamp-1 break-words">
                      {ticket.issueType}
                    </p>
                    {ticket.subject ? (
                      <p className="text-xs text-slate-600 mt-1 line-clamp-1 break-words">
                        Subject: {ticket.subject}
                      </p>
                    ) : null}
                    {ticket.orderRef ? (
                      <p className="text-xs text-slate-600 mt-0.5 line-clamp-1 break-words">
                        Order: {ticket.orderRef}
                      </p>
                    ) : null}
                    {ticket.description ? (
                      <p className="text-xs text-slate-500 mt-2 line-clamp-2 break-words">
                        {ticket.description}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold">
                    <span className="flex items-center gap-1 text-[#00c87e]">
                      <MessageSquare className="w-3.5 h-3.5" />
                      {ticket.messages?.length || (ticket.adminResponse ? 2 : 1)} Messages
                    </span>
                    <span className="text-slate-400 hover:text-slate-600 transition-colors">
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
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <div className="flex items-center gap-2">
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
                <h3 className="text-base font-bold text-slate-900 mt-1 break-words">
                  {selectedTicket.issueType}
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  Category: <span className="capitalize">{selectedTicket.category}</span> • Priority:{" "}
                  <span className="capitalize">{selectedTicket.priority}</span>
                </p>
              </div>
              <button
                onClick={() => setSelectedTicket(null)}
                className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors cursor-pointer"
                aria-label="Close panel"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages Thread (Chronological Order) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
              {getConversationMessages(selectedTicket).map((msg, index) => {
                const isAdmin = msg.sender === "admin"
                return (
                  <div key={index} className={`flex flex-col ${isAdmin ? "items-start" : "items-end"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 shadow-xs ${
                        isAdmin
                          ? "bg-white border border-slate-200 text-slate-800 rounded-tl-none"
                          : "bg-[#00c87e] text-white rounded-tr-none"
                      }`}
                    >
                      <p className={`text-[10px] font-extrabold uppercase tracking-wider mb-1 ${
                        isAdmin ? "text-blue-600" : "text-[#d1fae5]"
                      }`}>
                        {isAdmin ? "Admin Support" : "You"}
                      </p>
                      <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                        {msg.message}
                      </p>
                    </div>
                    <span className="text-[9px] text-slate-400 mt-1 px-1">
                      {new Date(msg.timestamp).toLocaleString(undefined, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
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
                      Mark Ticket as Resolved
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
                    This ticket has been resolved and closed.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <BottomNavOrders />
    </div>
  )
}
