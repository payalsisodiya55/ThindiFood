import { RestaurantFaq } from '../models/restaurantFaq.model.js';

/**
 * Get all FAQs (admin) sorted by displayOrder.
 */
export const getAllFaqsAdmin = async () => {
  return RestaurantFaq.find().sort({ displayOrder: 1, createdAt: 1 }).lean();
};

/**
 * Get active FAQs only (public / restaurant app).
 */
export const getActiveFaqs = async () => {
  return RestaurantFaq.find({ isActive: true }).sort({ displayOrder: 1, createdAt: 1 }).lean();
};

/**
 * Create a new FAQ.
 */
export const createFaq = async ({ question, answer, isActive = true }) => {
  const count = await RestaurantFaq.countDocuments();
  const faq = await RestaurantFaq.create({
    question: String(question || '').trim(),
    answer: String(answer || '').trim(),
    isActive: Boolean(isActive),
    displayOrder: count,
  });
  return faq.toObject();
};

/**
 * Update an existing FAQ by ID.
 */
export const updateFaq = async (id, updates = {}) => {
  const allowed = {};
  if (updates.question !== undefined) allowed.question = String(updates.question || '').trim();
  if (updates.answer !== undefined) allowed.answer = String(updates.answer || '').trim();
  if (updates.isActive !== undefined) allowed.isActive = Boolean(updates.isActive);
  if (updates.displayOrder !== undefined) allowed.displayOrder = Number(updates.displayOrder);

  const faq = await RestaurantFaq.findByIdAndUpdate(
    id,
    { $set: allowed },
    { new: true, runValidators: true }
  ).lean();

  return faq;
};

/**
 * Delete a FAQ by ID.
 */
export const deleteFaq = async (id) => {
  return RestaurantFaq.findByIdAndDelete(id).lean();
};

/**
 * Bulk reorder FAQs.
 * @param {Array<{id: string, displayOrder: number}>} items
 */
export const reorderFaqs = async (items) => {
  const ops = (items || []).map((item) => ({
    updateOne: {
      filter: { _id: item.id },
      update: { $set: { displayOrder: Number(item.displayOrder) } },
    },
  }));
  if (ops.length) {
    await RestaurantFaq.bulkWrite(ops);
  }
  return getAllFaqsAdmin();
};
