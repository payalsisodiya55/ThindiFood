import { sendResponse } from '../../../../utils/response.js';
import { ValidationError } from '../../../../core/auth/errors.js';
import {
  getAllFaqsAdmin,
  getActiveFaqs,
  createFaq,
  updateFaq,
  deleteFaq,
  reorderFaqs,
} from '../services/restaurantFaq.service.js';

/** GET /food/admin/restaurant-faqs - Admin: list all FAQs */
export const listFaqsAdminController = async (req, res, next) => {
  try {
    const faqs = await getAllFaqsAdmin();
    return sendResponse(res, 200, 'FAQs fetched successfully', faqs);
  } catch (error) {
    next(error);
  }
};

/** GET /food/restaurant/rating-faqs - Public: list active FAQs for restaurant app */
export const listActiveFaqsController = async (req, res, next) => {
  try {
    const faqs = await getActiveFaqs();
    return sendResponse(res, 200, 'FAQs fetched successfully', faqs);
  } catch (error) {
    next(error);
  }
};

/** POST /food/admin/restaurant-faqs - Admin: create a new FAQ */
export const createFaqController = async (req, res, next) => {
  try {
    const { question, answer, isActive } = req.body ?? {};
    if (!String(question || '').trim()) throw new ValidationError('Question is required');
    if (!String(answer || '').trim()) throw new ValidationError('Answer is required');
    const faq = await createFaq({ question, answer, isActive });
    return sendResponse(res, 201, 'FAQ created successfully', faq);
  } catch (error) {
    next(error);
  }
};

/** PUT /food/admin/restaurant-faqs/reorder - Admin: bulk reorder FAQs */
export const reorderFaqsController = async (req, res, next) => {
  try {
    const { items } = req.body ?? {};
    if (!Array.isArray(items)) throw new ValidationError('items must be an array');
    const faqs = await reorderFaqs(items);
    return sendResponse(res, 200, 'FAQs reordered successfully', faqs);
  } catch (error) {
    next(error);
  }
};

/** PUT /food/admin/restaurant-faqs/:id - Admin: update a FAQ */
export const updateFaqController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const faq = await updateFaq(id, req.body ?? {});
    if (!faq) throw new ValidationError('FAQ not found');
    return sendResponse(res, 200, 'FAQ updated successfully', faq);
  } catch (error) {
    next(error);
  }
};

/** DELETE /food/admin/restaurant-faqs/:id - Admin: delete a FAQ */
export const deleteFaqController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const faq = await deleteFaq(id);
    if (!faq) throw new ValidationError('FAQ not found');
    return sendResponse(res, 200, 'FAQ deleted successfully', null);
  } catch (error) {
    next(error);
  }
};
