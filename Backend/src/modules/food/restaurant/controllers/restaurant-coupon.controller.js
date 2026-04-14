import { sendError, sendResponse } from '../../../../utils/response.js';
import {
    validateRestaurantCreateCouponDto,
    validateRestaurantUpdateCouponDto
} from '../validators/restaurant-coupon.validator.js';
import {
    createRestaurantCoupon,
    getMyRestaurantCoupons,
    updateMyRestaurantCoupon,
    deleteMyRestaurantCoupon
} from '../services/restaurant-coupon.service.js';

export const createRestaurantCouponController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const body = validateRestaurantCreateCouponDto(req.body || {});
        const coupon = await createRestaurantCoupon(restaurantId, body);
        return sendResponse(res, 201, 'Coupon submitted for approval', { coupon });
    } catch (error) {
        next(error);
    }
};

export const getMyRestaurantCouponsController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const data = await getMyRestaurantCoupons(restaurantId);
        return sendResponse(res, 200, 'Coupons fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

export const updateMyRestaurantCouponController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const body = validateRestaurantUpdateCouponDto(req.body || {});
        const coupon = await updateMyRestaurantCoupon(restaurantId, req.params.id, body);
        if (!coupon) return sendError(res, 404, 'Coupon not found');
        return sendResponse(res, 200, 'Coupon updated successfully', { coupon });
    } catch (error) {
        next(error);
    }
};

export const deleteMyRestaurantCouponController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const result = await deleteMyRestaurantCoupon(restaurantId, req.params.id);
        if (!result) return sendError(res, 404, 'Coupon not found');
        return sendResponse(res, 200, 'Coupon deleted successfully', result);
    } catch (error) {
        next(error);
    }
};
