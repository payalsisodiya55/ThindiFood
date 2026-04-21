import { sendError, sendResponse } from '../../../../utils/response.js';
import {
    createRestaurantDiningOffer,
    getMyRestaurantDiningOffers,
    updateMyRestaurantDiningOffer,
    deleteMyRestaurantDiningOffer,
    getAllDiningOffersAdmin,
    createAdminDiningOffer,
    updateAdminDiningOffer,
    approveDiningOfferAdmin,
    rejectDiningOfferAdmin,
} from '../services/diningOffer.service.js';

export const createRestaurantDiningOfferController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const offer = await createRestaurantDiningOffer(restaurantId, req.body || {});
        return sendResponse(res, 201, 'Dining offer submitted for admin approval', { offer });
    } catch (error) {
        next(error);
    }
};

export const getMyRestaurantDiningOffersController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const data = await getMyRestaurantDiningOffers(restaurantId);
        return sendResponse(res, 200, 'Dining offers fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

export const updateMyRestaurantDiningOfferController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const offer = await updateMyRestaurantDiningOffer(restaurantId, req.params.id, req.body || {});
        if (!offer) return sendError(res, 404, 'Dining offer not found');
        return sendResponse(res, 200, 'Dining offer updated and re-submitted for approval', { offer });
    } catch (error) {
        next(error);
    }
};

export const deleteMyRestaurantDiningOfferController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const result = await deleteMyRestaurantDiningOffer(restaurantId, req.params.id);
        if (!result) return sendError(res, 404, 'Dining offer not found');
        return sendResponse(res, 200, 'Dining offer deleted successfully', result);
    } catch (error) {
        next(error);
    }
};

export const getAllDiningOffersAdminController = async (req, res, next) => {
    try {
        const data = await getAllDiningOffersAdmin(req.query || {});
        return sendResponse(res, 200, 'Dining offers fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

export const createAdminDiningOfferController = async (req, res, next) => {
    try {
        const adminId = req.user?.userId || req.user?.id;
        const offer = await createAdminDiningOffer(adminId, req.body || {});
        return sendResponse(res, 201, 'Dining offer created successfully', { offer });
    } catch (error) {
        next(error);
    }
};

export const updateAdminDiningOfferController = async (req, res, next) => {
    try {
        const offer = await updateAdminDiningOffer(req.params.id, req.body || {});
        if (!offer) return sendError(res, 404, 'Dining offer not found');
        return sendResponse(res, 200, 'Dining offer updated successfully', { offer });
    } catch (error) {
        next(error);
    }
};

export const approveDiningOfferAdminController = async (req, res, next) => {
    try {
        const offer = await approveDiningOfferAdmin(req.params.id);
        if (!offer) return sendError(res, 404, 'Dining offer not found');
        return sendResponse(res, 200, 'Dining offer approved successfully', { offer });
    } catch (error) {
        next(error);
    }
};

export const rejectDiningOfferAdminController = async (req, res, next) => {
    try {
        const offer = await rejectDiningOfferAdmin(req.params.id, req.body?.reason || '');
        if (!offer) return sendError(res, 404, 'Dining offer not found');
        return sendResponse(res, 200, 'Dining offer rejected', { offer });
    } catch (error) {
        next(error);
    }
};
