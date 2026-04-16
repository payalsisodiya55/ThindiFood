import { v2 as cloudinary } from 'cloudinary';
import { uploadBufferDetailed } from '../../../../services/cloudinary.service.js';
import { FoodLandingSettings } from '../models/landingSettings.model.js';

export const getLandingSettings = async () => {
    let doc = await FoodLandingSettings.findOne().lean();
    if (!doc) {
        doc = (await FoodLandingSettings.create({})).toObject();
    }
    return doc;
};

export const updateLandingSettings = async (payload) => {
    const doc = await FoodLandingSettings.findOneAndUpdate({}, payload, {
        new: true,
        upsert: true
    }).lean();
    return doc;
};

export const uploadLandingHeaderVideo = async (file) => {
    if (!file?.buffer) {
        throw new Error('Video file is required');
    }

    const uploaded = await uploadBufferDetailed(file.buffer, {
        folder: 'food/landing/header-video',
        resourceType: 'video'
    });

    const existing = await getLandingSettings();
    const existingUrls = Array.isArray(existing?.headerVideoUrls) ? existing.headerVideoUrls : (existing?.headerVideoUrl ? [existing.headerVideoUrl] : []);
    const existingIds = Array.isArray(existing?.headerVideoPublicIds) ? existing.headerVideoPublicIds : (existing?.headerVideoPublicId ? [existing.headerVideoPublicId] : []);

    return updateLandingSettings({
        headerVideoUrls: [...existingUrls, uploaded?.secure_url || ''],
        headerVideoPublicIds: [...existingIds, uploaded?.public_id || ''],
        headerVideoUrl: uploaded?.secure_url || '',
        headerVideoPublicId: uploaded?.public_id || ''
    });
};

export const deleteLandingHeaderVideo = async (publicId) => {
    const existing = await getLandingSettings();
    const existingUrls = Array.isArray(existing?.headerVideoUrls) ? existing.headerVideoUrls : (existing?.headerVideoUrl ? [existing.headerVideoUrl] : []);
    const existingIds = Array.isArray(existing?.headerVideoPublicIds) ? existing.headerVideoPublicIds : (existing?.headerVideoPublicId ? [existing.headerVideoPublicId] : []);

    if (publicId) {
        // Delete specific video
        const idx = existingIds.indexOf(publicId);
        await cloudinary.uploader.destroy(publicId, { resource_type: 'video' }).catch(() => {});
        const newUrls = existingUrls.filter((_, i) => i !== idx);
        const newIds = existingIds.filter((id) => id !== publicId);
        return updateLandingSettings({
            headerVideoUrls: newUrls,
            headerVideoPublicIds: newIds,
            headerVideoUrl: newUrls[0] || '',
            headerVideoPublicId: newIds[0] || ''
        });
    }

    // Delete all (legacy)
    for (const id of existingIds) {
        if (id) await cloudinary.uploader.destroy(id, { resource_type: 'video' }).catch(() => {});
    }
    return updateLandingSettings({
        headerVideoUrl: '',
        headerVideoPublicId: '',
        headerVideoUrls: [],
        headerVideoPublicIds: []
    });
};

