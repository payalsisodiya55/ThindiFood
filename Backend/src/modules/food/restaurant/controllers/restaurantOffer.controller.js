import { sendError, sendResponse } from '../../../../utils/response.js';
import {
    createRestaurantOffer,
    getMyRestaurantOffers,
    updateMyRestaurantOffer,
    deleteMyRestaurantOffer,
    getAllRestaurantOffersAdmin,
    approveRestaurantOfferAdmin,
    rejectRestaurantOfferAdmin,
} from '../services/restaurantOffer.service.js';

// Restaurant-side controllers
export const createRestaurantOfferController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const offer = await createRestaurantOffer(restaurantId, req.body || {});
        return sendResponse(res, 201, 'Offer submitted for admin approval', { offer });
    } catch (error) {
        next(error);
    }
};

export const getMyRestaurantOffersController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const data = await getMyRestaurantOffers(restaurantId);
        return sendResponse(res, 200, 'Offers fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

export const updateMyRestaurantOfferController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const offer = await updateMyRestaurantOffer(restaurantId, req.params.id, req.body || {});
        if (!offer) return sendError(res, 404, 'Offer not found');
        return sendResponse(res, 200, 'Offer updated and re-submitted for admin approval', { offer });
    } catch (error) {
        next(error);
    }
};

export const deleteMyRestaurantOfferController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const result = await deleteMyRestaurantOffer(restaurantId, req.params.id);
        if (!result) return sendError(res, 404, 'Offer not found');
        return sendResponse(res, 200, 'Offer deleted successfully', result);
    } catch (error) {
        next(error);
    }
};

// Admin-side controllers
export const getAllRestaurantOffersAdminController = async (req, res, next) => {
    try {
        const data = await getAllRestaurantOffersAdmin(req.query || {});
        return sendResponse(res, 200, 'Offers fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

export const approveRestaurantOfferAdminController = async (req, res, next) => {
    try {
        const offer = await approveRestaurantOfferAdmin(req.params.id);
        if (!offer) return sendError(res, 404, 'Offer not found');
        return sendResponse(res, 200, 'Offer approved successfully', { offer });
    } catch (error) {
        next(error);
    }
};

export const rejectRestaurantOfferAdminController = async (req, res, next) => {
    try {
        const { reason } = req.body || {};
        const offer = await rejectRestaurantOfferAdmin(req.params.id, reason || '');
        if (!offer) return sendError(res, 404, 'Offer not found');
        return sendResponse(res, 200, 'Offer rejected', { offer });
    } catch (error) {
        next(error);
    }
};
