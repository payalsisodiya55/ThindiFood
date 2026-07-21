import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import api from "@food/api";
import { API_ENDPOINTS } from "@food/api/config";
import {
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  Save,
  X,
  HelpCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";

export default function RestaurantRatingFAQ() {
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState("");

  // Preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(null);

  // Drag state
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const fetchFaqs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get(API_ENDPOINTS.ADMIN.RESTAURANT_FAQS, {
        contextModule: "admin",
      });
      if (res.data?.success) {
        setFaqs(res.data.data || []);
      }
    } catch (err) {
      toast.error("Failed to load FAQs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFaqs();
  }, [fetchFaqs]);

  const openCreate = () => {
    setEditId(null);
    setQuestion("");
    setAnswer("");
    setIsActive(true);
    setFormError("");
    setFormOpen(true);
  };

  const openEdit = (faq) => {
    setEditId(faq._id);
    setQuestion(faq.question);
    setAnswer(faq.answer);
    setIsActive(faq.isActive);
    setFormError("");
    setFormOpen(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    const q = question.trim();
    const a = answer.trim();
    if (!q) return setFormError("Question is required");
    if (!a) return setFormError("Answer is required");
    setFormError("");

    try {
      setSaving(true);
      if (editId) {
        const res = await api.put(
          `${API_ENDPOINTS.ADMIN.RESTAURANT_FAQS}/${editId}`,
          { question: q, answer: a, isActive },
          { contextModule: "admin" }
        );
        if (res.data?.success) {
          setFaqs((prev) =>
            prev.map((f) => (f._id === editId ? res.data.data : f))
          );
          toast.success("FAQ updated");
        }
      } else {
        const res = await api.post(
          API_ENDPOINTS.ADMIN.RESTAURANT_FAQS,
          { question: q, answer: a, isActive },
          { contextModule: "admin" }
        );
        if (res.data?.success) {
          setFaqs((prev) => [...prev, res.data.data]);
          toast.success("FAQ created");
        }
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save FAQ");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this FAQ?")) return;
    try {
      const res = await api.delete(
        `${API_ENDPOINTS.ADMIN.RESTAURANT_FAQS}/${id}`,
        { contextModule: "admin" }
      );
      if (res.data?.success) {
        setFaqs((prev) => prev.filter((f) => f._id !== id));
        toast.success("FAQ deleted");
      }
    } catch (err) {
      toast.error("Failed to delete FAQ");
    }
  };

  const handleToggleActive = async (faq) => {
    try {
      const res = await api.put(
        `${API_ENDPOINTS.ADMIN.RESTAURANT_FAQS}/${faq._id}`,
        { isActive: !faq.isActive },
        { contextModule: "admin" }
      );
      if (res.data?.success) {
        setFaqs((prev) =>
          prev.map((f) => (f._id === faq._id ? res.data.data : f))
        );
        toast.success(res.data.data.isActive ? "FAQ enabled" : "FAQ disabled");
      }
    } catch {
      toast.error("Failed to update status");
    }
  };

  const moveItem = async (index, direction) => {
    const newFaqs = [...faqs];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newFaqs.length) return;
    [newFaqs[index], newFaqs[targetIndex]] = [
      newFaqs[targetIndex],
      newFaqs[index],
    ];
    const reordered = newFaqs.map((f, i) => ({ ...f, displayOrder: i }));
    setFaqs(reordered);
    await saveOrder(reordered);
  };

  const saveOrder = async (ordered) => {
    try {
      const items = ordered.map((f, i) => ({ id: f._id, displayOrder: i }));
      await api.put(
        API_ENDPOINTS.ADMIN.RESTAURANT_FAQS_REORDER,
        { items },
        { contextModule: "admin" }
      );
    } catch {
      toast.error("Failed to save order");
    }
  };

  // Drag-and-drop handlers
  const onDragStart = (index) => setDragging(index);
  const onDragEnter = (index) => setDragOver(index);
  const onDragEnd = async () => {
    if (dragging === null || dragOver === null || dragging === dragOver) {
      setDragging(null);
      setDragOver(null);
      return;
    }
    const newFaqs = [...faqs];
    const [moved] = newFaqs.splice(dragging, 1);
    newFaqs.splice(dragOver, 0, moved);
    const reordered = newFaqs.map((f, i) => ({ ...f, displayOrder: i }));
    setFaqs(reordered);
    setDragging(null);
    setDragOver(null);
    await saveOrder(reordered);
  };

  const activeFaqs = faqs.filter((f) => f.isActive);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <HelpCircle className="text-orange-500" size={26} />
                Restaurant Rating FAQ
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Manage the FAQ displayed to customers in the Restaurant Rating
                section.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setPreviewOpen((p) => !p)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition"
              >
                <Eye size={16} />
                {previewOpen ? "Close Preview" : "Preview"}
              </button>
              <button
                onClick={fetchFaqs}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition"
              >
                <RefreshCw size={16} />
                Refresh
              </button>
              <button
                onClick={openCreate}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition shadow"
              >
                <Plus size={16} />
                Add FAQ
              </button>
            </div>
          </div>
        </div>

        {/* Preview Panel */}
        {previewOpen && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <h2 className="text-lg font-semibold text-slate-700 mb-4">
              Preview (Active FAQs – {activeFaqs.length})
            </h2>
            {activeFaqs.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-8">
                No active FAQs to preview.
              </p>
            ) : (
              <div className="space-y-3">
                {activeFaqs.map((faq) => (
                  <div
                    key={faq._id}
                    className="border border-slate-200 rounded-xl overflow-hidden"
                  >
                    <button
                      onClick={() =>
                        setPreviewExpanded((p) =>
                          p === faq._id ? null : faq._id
                        )
                      }
                      className="w-full flex items-center justify-between px-5 py-4 text-left bg-slate-50 hover:bg-slate-100 transition"
                    >
                      <span className="text-sm font-semibold text-slate-700">
                        {faq.question}
                      </span>
                      {previewExpanded === faq._id ? (
                        <ChevronUp size={16} className="text-slate-400 shrink-0" />
                      ) : (
                        <ChevronDown size={16} className="text-slate-400 shrink-0" />
                      )}
                    </button>
                    {previewExpanded === faq._id && (
                      <div className="px-5 py-4 text-sm text-slate-600 leading-relaxed">
                        {faq.answer}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* FAQ Form */}
        {formOpen && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-slate-700">
                {editId ? "Edit FAQ" : "New FAQ"}
              </h2>
              <button
                onClick={() => setFormOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Question <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Enter the FAQ question..."
                  className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Answer <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Enter the answer..."
                  rows={4}
                  className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 transition resize-none"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsActive((p) => !p)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    isActive ? "bg-orange-500" : "bg-slate-200"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      isActive ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
                <span className="text-sm text-slate-600">
                  {isActive ? "Active (visible to users)" : "Inactive (hidden)"}
                </span>
              </div>
              {formError && (
                <p className="text-red-500 text-xs">{formError}</p>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Save size={16} />
                  )}
                  {editId ? "Update FAQ" : "Save FAQ"}
                </button>
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="px-5 py-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* FAQ List */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-700">
              All FAQs{" "}
              <span className="text-sm font-normal text-slate-400">
                ({faqs.length})
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Drag rows to reorder • Green = Active
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="animate-spin text-orange-400" size={32} />
            </div>
          ) : faqs.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <HelpCircle size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No FAQs yet. Click "Add FAQ" to create one.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {faqs.map((faq, index) => (
                <div
                  key={faq._id}
                  draggable
                  onDragStart={() => onDragStart(index)}
                  onDragEnter={() => onDragEnter(index)}
                  onDragEnd={onDragEnd}
                  onDragOver={(e) => e.preventDefault()}
                  className={`flex items-start gap-3 p-4 rounded-xl border transition-all ${
                    dragging === index
                      ? "opacity-40"
                      : dragOver === index
                      ? "border-orange-400 bg-orange-50"
                      : faq.isActive
                      ? "border-green-100 bg-green-50/30 hover:border-green-200"
                      : "border-slate-100 bg-slate-50/50 hover:border-slate-200"
                  }`}
                >
                  {/* Drag Handle */}
                  <div className="mt-1 cursor-grab text-slate-300 hover:text-slate-500 select-none">
                    <GripVertical size={18} />
                  </div>

                  {/* Index badge */}
                  <div className="mt-1 min-w-[26px] h-6 flex items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                    {index + 1}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 break-words">
                      {faq.question}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2 break-words">
                      {faq.answer}
                    </p>
                  </div>

                  {/* Status badge */}
                  <div className="mt-1">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        faq.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {faq.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 mt-0.5 shrink-0">
                    <button
                      onClick={() => moveItem(index, -1)}
                      disabled={index === 0}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 disabled:opacity-30 transition"
                      title="Move up"
                    >
                      <ChevronUp size={15} />
                    </button>
                    <button
                      onClick={() => moveItem(index, 1)}
                      disabled={index === faqs.length - 1}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 disabled:opacity-30 transition"
                      title="Move down"
                    >
                      <ChevronDown size={15} />
                    </button>
                    <button
                      onClick={() => handleToggleActive(faq)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
                      title={faq.isActive ? "Disable" : "Enable"}
                    >
                      {faq.isActive ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                    <button
                      onClick={() => openEdit(faq)}
                      className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition"
                      title="Edit"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => handleDelete(faq._id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition"
                      title="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
