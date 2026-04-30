import dotenv from 'dotenv';

dotenv.config();

const parseBooleanEnv = (value, defaultValue = false) => {
    if (value === undefined || value === null || value === '') return defaultValue;
    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
    return defaultValue;
};

const normalizeOrigin = (value) => {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim().replace(/^['"]|['"]$/g, '');
    if (!trimmed) return '';
    if (trimmed === '*') return '*';
    try {
        return new URL(trimmed).origin;
    } catch {
        return trimmed.replace(/\/+$/, '');
    }
};

const parseOriginList = (...values) => {
    const items = values
        .filter((value) => value !== undefined && value !== null)
        .flatMap((value) => String(value).split(','))
        .map((value) => normalizeOrigin(value))
        .filter(Boolean);
    return Array.from(new Set(items));
};

const socketCorsOrigins = parseOriginList(
    process.env.SOCKET_CORS_ORIGIN,
    process.env.FRONTEND_URL,
    'http://localhost:5173'
);

const isSocketOriginAllowed = (origin) => {
    if (!origin) return true;
    if (socketCorsOrigins.includes('*')) return true;
    const normalizedRequestOrigin = normalizeOrigin(origin);
    return socketCorsOrigins.includes(normalizedRequestOrigin);
};

export const config = {
    // Basic server config
    port: process.env.PORT || 5000,
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',

    // Database
    mongodbUri: process.env.MONGO_URI || process.env.MONGODB_URI,

    // JWT
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET,
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
    jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES || '7d',

    // OTP
    otpExpiry: process.env.OTP_EXPIRY || '5m',
    otpMaxAttempts: Number(process.env.OTP_MAX_ATTEMPTS || 5),
    otpExpiryMinutes: Number(process.env.OTP_EXPIRY_MINUTES || 10),
    otpExpirySeconds: Number(process.env.OTP_EXPIRY_SECONDS || 300),
    otpRateLimit: Number(process.env.OTP_RATE_LIMIT || 3),
    otpRateWindow: Number(process.env.OTP_RATE_WINDOW || 600),
    useDefaultOtp: parseBooleanEnv(process.env.USE_DEFAULT_OTP, false),

    // SMS India Hub
    smsIndiaHubUsername: process.env.SMS_INDIA_HUB_USERNAME,
    smsApiKey: process.env.SMS_INDIA_HUB_API_KEY,
    smsSenderId:
        process.env.SMS_INDIA_HUB_SENDER_ID ||
        process.env.SMS_INDIA_HUB_SID ||
        process.env.SMS_SENDER_ID,
    smsDltTemplateId:
        process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID ||
        process.env.SMS_DLT_TEMPLATE_ID,
    smsOtpMessageTemplate:
        process.env.SMS_OTP_MESSAGE_TEMPLATE ||
        'Welcome to the {{APP_NAME}} powered by SMSINDIAHUB. Your OTP for registration is {{OTP}}',
    smsAppName: process.env.SMS_APP_NAME || 'ThindiFood',

    // Rate limiting
    rateLimitWindowMinutes: Number(process.env.RATE_LIMIT_WINDOW || 15),
    rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX || 100),
    authRateLimitWindowMinutes: Number(process.env.AUTH_RATE_LIMIT_WINDOW || 15),
    authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX || 30),

    // Security
    bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS || 10),

    // Uploads
    uploadPath: process.env.UPLOAD_PATH || 'uploads/',

    // Redis
    redisEnabled: parseBooleanEnv(process.env.REDIS_ENABLED, false),
    redisUrl: process.env.REDIS_URL,

    // BullMQ
    bullmqEnabled: parseBooleanEnv(process.env.BULLMQ_ENABLED, false),

    // Cloudinary
    cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME,
    cloudinaryApiKey: process.env.CLOUDINARY_API_KEY,
    cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET,

    // Firebase / FCM
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID,
    firebaseDatabaseUrl: process.env.FIREBASE_DATABASE_URL,
    firebaseServiceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    firebaseServiceAccount: process.env.FIREBASE_SERVICE_ACCOUNT,

    // Socket.io
    socketCorsOrigin: process.env.SOCKET_CORS_ORIGIN || '*',
    socketCorsOrigins,
    isSocketOriginAllowed,

    // Razorpay (payments)
    razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET,
    razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET, // ✅ NEW

    // Email (SMTP) – for admin forgot password OTP etc.
    emailHost: process.env.EMAIL_HOST,
    emailPort: Number(process.env.EMAIL_PORT) || 587,
    emailUser: process.env.EMAIL_USER,
    emailPass: process.env.EMAIL_PASS ? String(process.env.EMAIL_PASS).replace(/\s/g, '') : '',
    emailFrom: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@example.com'
};
