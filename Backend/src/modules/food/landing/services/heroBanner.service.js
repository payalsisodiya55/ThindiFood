import { FoodHeroBanner } from '../models/heroBanner.model.js';
import { v2 as cloudinary } from 'cloudinary';
import mongoose from 'mongoose';

const normalizeHeroBanner = (banner, fallbackOrder = 0) => {
    if (!banner) return banner;
    const numericSortOrder = Number(banner.sortOrder);

    return {
        ...banner,
        order: Number.isFinite(numericSortOrder) ? numericSortOrder : fallbackOrder
    };
};

export const listHeroBanners = async () => {
    const banners = await FoodHeroBanner.find()
        .sort({ sortOrder: 1, createdAt: -1 })
        .populate('zoneId', 'name zoneName serviceLocation')
        .lean();

    return banners.map((banner, index) => normalizeHeroBanner(banner, index));
};

export const getHeroBannerById = async (id) => {
    const banner = await FoodHeroBanner.findById(id).lean();
    return normalizeHeroBanner(banner);
};

export const createHeroBannersFromFiles = async (files, meta = {}) => {
    if (!files || !files.length) {
        return [];
    }

    const results = [];
    const lastBanner = await FoodHeroBanner.findOne()
        .sort({ sortOrder: -1, createdAt: -1 })
        .select('sortOrder')
        .lean();
    let nextSortOrder = Number.isFinite(Number(lastBanner?.sortOrder))
        ? Number(lastBanner.sortOrder) + 1
        : 0;

    for (const file of files) {
        try {
            const uploadResult = await new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    { folder: 'food/hero-banners', resource_type: 'image' },
                    (error, result) => {
                        if (error) return reject(error);
                        return resolve(result);
                    }
                );
                stream.end(file.buffer);
            });

            const banner = await FoodHeroBanner.create({
                imageUrl: uploadResult.secure_url,
                publicId: uploadResult.public_id,
                title: meta.title,
                ctaText: meta.ctaText,
                ctaLink: meta.ctaLink,
                linkedRestaurantIds: meta.linkedRestaurantIds || [],
                zoneId:
                    meta.zoneId && mongoose.Types.ObjectId.isValid(meta.zoneId)
                        ? new mongoose.Types.ObjectId(meta.zoneId)
                        : undefined,
                sortOrder: meta.sortOrder ?? nextSortOrder,
                isActive: true
            });

            results.push({ success: true, banner: normalizeHeroBanner(banner.toObject(), nextSortOrder) });
            nextSortOrder += 1;
        } catch (error) {
            results.push({ success: false, error: error.message });
        }
    }

    return results;
};

export const deleteHeroBanner = async (id) => {
    const doc = await FoodHeroBanner.findById(id);
    if (!doc) {
        return { deleted: false };
    }

    if (doc.publicId) {
        try {
            await cloudinary.uploader.destroy(doc.publicId);
        } catch {
            // ignore cloudinary deletion errors to avoid blocking deletion
        }
    }

    await doc.deleteOne();
    return { deleted: true };
};

export const updateHeroBannerOrder = async (id, sortOrder) => {
    const updated = await FoodHeroBanner.findByIdAndUpdate(
        id,
        { sortOrder },
        { new: true }
    ).lean();
    return normalizeHeroBanner(updated, sortOrder);
};

export const toggleHeroBannerStatus = async (id, isActive) => {
    const updated = await FoodHeroBanner.findByIdAndUpdate(
        id,
        { isActive },
        { new: true }
    ).lean();
    return normalizeHeroBanner(updated);
};

export const linkHeroBannerRestaurants = async (id, restaurantIds = []) => {
    const updated = await FoodHeroBanner.findByIdAndUpdate(
        id,
        { linkedRestaurantIds: restaurantIds },
        { new: true }
    ).lean();
    return normalizeHeroBanner(updated);
};

export const updateHeroBannerZone = async (id, zoneId) => {
    const nextZoneId =
        zoneId && mongoose.Types.ObjectId.isValid(zoneId)
            ? new mongoose.Types.ObjectId(zoneId)
            : undefined;

    const updated = await FoodHeroBanner.findByIdAndUpdate(
        id,
        { zoneId: nextZoneId },
        { new: true }
    )
        .populate('zoneId', 'name zoneName serviceLocation')
        .lean();

    return normalizeHeroBanner(updated);
};

