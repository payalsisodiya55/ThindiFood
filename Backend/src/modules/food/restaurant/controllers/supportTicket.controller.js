import mongoose from 'mongoose';
import { FoodRestaurantSupportTicket } from '../models/supportTicket.model.js';
import { sendError, sendResponse } from '../../../../utils/response.js';

const ALLOWED_CATEGORIES = ['orders', 'payments', 'menu', 'restaurant', 'technical', 'other'];
const ALLOWED_PRIORITIES = ['low', 'medium', 'high'];
const ALLOWED_STATUSES = ['open', 'in-progress', 'resolved'];

export const createRestaurantSupportTicketController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) {
            return sendError(res, 401, 'Unauthorized');
        }

        const body = req.body || {};
        const category = String(body.category || '').trim().toLowerCase();
        const issueType = String(body.issueType || '').trim();
        const subject = String(body.subject || '').trim();
        const description = String(body.description || '').trim();
        const orderRef = String(body.orderRef || body.orderId || '').trim();
        const priority = String(body.priority || 'medium').trim().toLowerCase();

        if (!ALLOWED_CATEGORIES.includes(category)) {
            return sendError(res, 400, 'Invalid category');
        }
        if (!issueType) {
            return sendError(res, 400, 'issueType required');
        }
        if (!ALLOWED_PRIORITIES.includes(priority)) {
            return sendError(res, 400, 'Invalid priority');
        }

        const created = await FoodRestaurantSupportTicket.create({
            restaurantId: new mongoose.Types.ObjectId(restaurantId),
            category,
            issueType,
            subject,
            description,
            orderRef,
            priority,
            messages: [
                {
                    sender: 'restaurant',
                    message: description,
                    timestamp: new Date()
                }
            ]
        });

        return sendResponse(res, 201, 'Support ticket created successfully', {
            ticket: created.toObject()
        });
    } catch (error) {
        next(error);
    }
};

export const listRestaurantSupportTicketsController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) {
            return sendError(res, 401, 'Unauthorized');
        }

        const limit = Math.min(Math.max(parseInt(req.query?.limit, 10) || 20, 1), 100);
        const page = Math.max(parseInt(req.query?.page, 10) || 1, 1);
        const skip = (page - 1) * limit;

        const filter = { restaurantId: new mongoose.Types.ObjectId(restaurantId) };
        const status = String(req.query?.status || '').trim().toLowerCase();
        if (ALLOWED_STATUSES.includes(status)) {
            filter.status = status;
        }

        const searchText = String(req.query?.search || '').trim();
        if (searchText) {
            const rx = new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            filter.$or = [
                { subject: rx },
                { issueType: rx },
                { description: rx },
                { orderRef: rx }
            ];
        }

        const [tickets, total] = await Promise.all([
            FoodRestaurantSupportTicket.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            FoodRestaurantSupportTicket.countDocuments(filter)
        ]);

        return sendResponse(res, 200, 'Support tickets fetched successfully', {
            tickets,
            total,
            page,
            limit
        });
    } catch (error) {
        next(error);
    }
};

export const replyToRestaurantSupportTicketController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) {
            return sendError(res, 401, 'Unauthorized');
        }

        const { id } = req.params;
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return sendError(res, 400, 'Invalid ticket id');
        }

        const ticket = await FoodRestaurantSupportTicket.findOne({
            _id: id,
            restaurantId: new mongoose.Types.ObjectId(restaurantId)
        });

        if (!ticket) {
            return sendError(res, 404, 'Ticket not found');
        }

        if (ticket.status === 'resolved') {
            return sendError(res, 400, 'Cannot reply to a resolved ticket');
        }

        const messageText = String(req.body?.message || '').trim();
        if (!messageText) {
            return sendError(res, 400, 'Message cannot be empty');
        }

        if (!ticket.messages) ticket.messages = [];
        ticket.messages.push({
            sender: 'restaurant',
            message: messageText,
            timestamp: new Date()
        });

        await ticket.save();

        return sendResponse(res, 200, 'Reply sent successfully', {
            ticket: ticket.toObject()
        });
    } catch (error) {
        next(error);
    }
};

export const resolveRestaurantSupportTicketController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) {
            return sendError(res, 401, 'Unauthorized');
        }

        const { id } = req.params;
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return sendError(res, 400, 'Invalid ticket id');
        }

        const ticket = await FoodRestaurantSupportTicket.findOne({
            _id: id,
            restaurantId: new mongoose.Types.ObjectId(restaurantId)
        });

        if (!ticket) {
            return sendError(res, 404, 'Ticket not found');
        }

        const hasAdminResponse = (ticket.messages && ticket.messages.some(m => m.sender === 'admin')) || (ticket.adminResponse && ticket.adminResponse.trim());
        if (!hasAdminResponse) {
            return sendError(res, 400, 'Cannot resolve a ticket without reviewing the admin response first');
        }

        ticket.status = 'resolved';
        await ticket.save();

        return sendResponse(res, 200, 'Ticket marked as resolved successfully', {
            ticket: ticket.toObject()
        });
    } catch (error) {
        next(error);
    }
};
