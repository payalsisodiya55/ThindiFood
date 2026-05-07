import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

const errorHandler = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Server Error';
    const requestId = req.requestId || '-';

    logger.error(
        `[${requestId}] ${req.method} ${req.originalUrl} ${statusCode} - ${err.name || 'Error'} - ${message}`
    );
    if (config.nodeEnv === 'development' && err.stack) {
        logger.error(`[${requestId}] ${err.stack}`);
    }

    let finalStatusCode = statusCode;
    let finalMessage = message;

    // Handle Multer specific errors
    if (err.code === 'LIMIT_FILE_SIZE') {
        finalStatusCode = 400;
        finalMessage = 'File size is too large. Max limit is 10MB per file.';
    } else if (err.code === 'LIMIT_FILE_COUNT') {
        finalStatusCode = 400;
        finalMessage = 'Too many files uploaded at once.';
    } else if (err.message === 'Invalid file type. Only JPG, PNG and WEBP are allowed.') {
        finalStatusCode = 400;
    }

    res.status(finalStatusCode).json({
        success: false,
        error: finalMessage
    });
};

export default errorHandler;
