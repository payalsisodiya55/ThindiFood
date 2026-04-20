import {
    listHeroBanners,
    createHeroBannersFromFiles,
    deleteHeroBanner,
    updateHeroBannerOrder,
    toggleHeroBannerStatus,
    getHeroBannerById,
    linkHeroBannerRestaurants,
    updateHeroBannerZone
} from '../services/heroBanner.service.js';
import { sendResponse } from '../../../../utils/response.js';
import { ValidationError } from '../../../../core/auth/errors.js';

export const listHeroBannersController = async (req, res, next) => {
    try {
        const data = await listHeroBanners();
        // Wrap in { banners } to match LandingPageManagement.jsx expectations
        return sendResponse(res, 200, 'Hero banners fetched successfully', { banners: data });
    } catch (error) {
        next(error);
    }
};

export const uploadHeroBannersController = async (req, res, next) => {
    try {
        if (!req.files || !req.files.length) {
            throw new ValidationError('No files uploaded');
        }

        const meta = {
            title: req.body.title,
            ctaText: req.body.ctaText,
            ctaLink: req.body.ctaLink,
            zoneId: req.body.zoneId
        };

        const results = await createHeroBannersFromFiles(req.files, meta);
        return sendResponse(res, 201, 'Hero banners uploaded', { results });
    } catch (error) {
        next(error);
    }
};

export const deleteHeroBannerController = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id) {
            throw new ValidationError('Banner id is required');
        }
        const result = await deleteHeroBanner(id);
        return sendResponse(res, 200, result.deleted ? 'Hero banner deleted' : 'Hero banner not found', result);
    } catch (error) {
        next(error);
    }
};

export const updateHeroBannerOrderController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const value = req.body?.order ?? req.body?.sortOrder;
        const sortOrder = Number(value);
        if (!id || Number.isNaN(sortOrder)) {
            throw new ValidationError('id and numeric order are required');
        }
        const updated = await updateHeroBannerOrder(id, sortOrder);
        return sendResponse(res, 200, 'Hero banner order updated', updated);
    } catch (error) {
        next(error);
    }
};

export const toggleHeroBannerStatusController = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id) {
            throw new ValidationError('Banner id is required');
        }
        let { isActive } = req.body || {};
        if (typeof isActive !== 'boolean') {
            const banner = await getHeroBannerById(id);
            if (!banner) {
                throw new ValidationError('Hero banner not found');
            }
            isActive = !banner.isActive;
        }
        const updated = await toggleHeroBannerStatus(id, isActive);
        return sendResponse(res, 200, 'Hero banner status updated', updated);
    } catch (error) {
        next(error);
    }
};

export const linkHeroBannerRestaurantsController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { restaurantIds } = req.body || {};
        if (!id) {
            throw new ValidationError('Banner id is required');
        }
        if (!Array.isArray(restaurantIds)) {
            throw new ValidationError('restaurantIds must be an array');
        }

        const updated = await linkHeroBannerRestaurants(id, restaurantIds);
        if (!updated) {
            throw new ValidationError('Hero banner not found');
        }
        return sendResponse(res, 200, 'Restaurants linked to hero banner', updated);
    } catch (error) {
        next(error);
    }
};

export const updateHeroBannerZoneController = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id) {
            throw new ValidationError('Banner id is required');
        }

        const zoneIdRaw = String(req.body?.zoneId || '').trim();
        const updated = await updateHeroBannerZone(id, zoneIdRaw || undefined);
        if (!updated) {
            throw new ValidationError('Hero banner not found');
        }

        return sendResponse(res, 200, 'Hero banner zone updated', updated);
    } catch (error) {
        next(error);
    }
};

