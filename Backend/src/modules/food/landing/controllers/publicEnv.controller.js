import { config } from '../../../../config/env.js';

const sanitize = (value) => (value ? String(value).trim().replace(/^['"]|['"]$/g, '') : '');

/**
 * Public environment variables for frontend runtime.
 * IMPORTANT: Only expose non-secret keys safe for clients.
 */
export const getPublicEnvController = async (_req, res, next) => {
    try {
        const googleMapsKey =
            sanitize(process.env.VITE_GOOGLE_MAPS_API_KEY) ||
            sanitize(process.env.GOOGLE_MAPS_API_KEY);

        return res.status(200).json({
            success: true,
            message: 'Public environment variables fetched',
            data: {
                VITE_GOOGLE_MAPS_API_KEY: googleMapsKey || '',
                NODE_ENV: config.nodeEnv || 'development'
            }
        });
    } catch (error) {
        next(error);
    }
};

