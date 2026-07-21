import { FoodDiningBanner } from '../models/diningBanner.model.js';
import { v2 as cloudinary } from 'cloudinary';

export const listDiningBanners = async () => {
    return FoodDiningBanner.find().sort({ sortOrder: 1, createdAt: -1 }).lean();
};

export const createDiningBannersFromFiles = async (files, meta = {}) => {
    if (!files || !files.length) {
        return [];
    }

    const results = [];

    for (const file of files) {
        try {
            const uploadResult = await new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    { folder: 'food/dining-banners', resource_type: 'image' },
                    (error, result) => {
                        if (error) return reject(error);
                        return resolve(result);
                    }
                );
                stream.end(file.buffer);
            });

            const banner = await FoodDiningBanner.create({
                imageUrl: uploadResult.secure_url,
                publicId: uploadResult.public_id,
                title: meta.title,
                ctaText: meta.ctaText,
                ctaLink: meta.ctaLink,
                diningType: meta.diningType,
                zoneId: meta.zoneId || undefined,
                city: String(meta.city || '').trim(),
                state: String(meta.state || '').trim(),
                sortOrder: meta.sortOrder ?? 0,
                isActive: true,
            });

            results.push({ success: true, banner: banner.toObject() });
        } catch (error) {
            results.push({ success: false, error: error.message });
        }
    }

    return results;
};

export const deleteDiningBanner = async (id) => {
    const doc = await FoodDiningBanner.findById(id);
    if (!doc) {
        return { deleted: false };
    }

    if (doc.publicId) {
        try {
            await cloudinary.uploader.destroy(doc.publicId);
        } catch {
            // ignore cloudinary deletion errors
        }
    }

    await doc.deleteOne();
    return { deleted: true };
};

export const updateDiningBannerOrder = async (id, sortOrder) => {
    const updated = await FoodDiningBanner.findByIdAndUpdate(
        id,
        { sortOrder },
        { new: true }
    ).lean();
    return updated;
};

export const toggleDiningBannerStatus = async (id, isActive) => {
    const updated = await FoodDiningBanner.findByIdAndUpdate(
        id,
        { isActive },
        { new: true }
    ).lean();
    return updated;
};

export const updateDiningBanner = async (id, file, meta = {}) => {
    const doc = await FoodDiningBanner.findById(id);
    if (!doc) {
        throw new Error('Dining banner not found');
    }

    if (file) {
        const uploadResult = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                { folder: 'food/dining-banners', resource_type: 'image' },
                (error, result) => {
                    if (error) return reject(error);
                    return resolve(result);
                }
            );
            stream.end(file.buffer);
        });

        if (doc.publicId) {
            try {
                await cloudinary.uploader.destroy(doc.publicId);
            } catch {
                // ignore
            }
        }

        doc.imageUrl = uploadResult.secure_url;
        doc.publicId = uploadResult.public_id;
    }

    if (meta.title !== undefined) doc.title = meta.title;
    if (meta.ctaText !== undefined) doc.ctaText = meta.ctaText;
    if (meta.ctaLink !== undefined) doc.ctaLink = meta.ctaLink;
    if (meta.diningType !== undefined) doc.diningType = meta.diningType;
    if (meta.zoneId !== undefined) doc.zoneId = meta.zoneId || undefined;
    if (meta.city !== undefined) doc.city = String(meta.city || '').trim();
    if (meta.state !== undefined) doc.state = String(meta.state || '').trim();

    await doc.save();
    return doc.toObject();
};

