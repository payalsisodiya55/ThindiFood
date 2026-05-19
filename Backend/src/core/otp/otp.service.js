import crypto from 'crypto';
import ms from 'ms';
import { FoodOtp } from './otp.model.js';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { ValidationError } from '../auth/errors.js';

const generateOtpCode = () => {
    const code = crypto.randomInt(1000, 9999);
    return String(code);
};

const normalizePhoneForOtp = (phone) => String(phone || '').replace(/\D/g, '');
const normalizeOtpCode = (otp) => String(otp || '').replace(/\D/g, '').slice(0, 6);
const FIXED_TEST_OTP_MAP = new Map([
    ['9998888777', '1234'],
    ['7223077890', '1234'],
]);

const getPhoneCandidates = (phone) => {
    const raw = String(phone || '').trim();
    const digits = normalizePhoneForOtp(phone);
    const last10 = digits.slice(-10);

    return Array.from(new Set([
        raw,
        digits,
        last10,
        digits ? `+${digits}` : '',
        last10 ? `+91 ${last10}` : '',
        last10 ? `+91${last10}` : '',
        last10 ? `91${last10}` : '',
    ].filter(Boolean)));
};

/**
 * Sends SMS via SMS India Hub API
 * @param {string} phone - 10-digit mobile number (will be prefixed with 91)
 * @param {string} otp
 */
const sendSmsViaIndiaHub = async (phone, otp) => {
    try {
        const digits = String(phone || '').replace(/\D/g, '');
        const msisdn = digits.startsWith('91') ? digits : `91${digits}`;

        const messageTemplate = String(config.smsOtpMessageTemplate || '').trim();
        const message = messageTemplate
            .replace(/{{\s*APP_NAME\s*}}/gi, String(config.smsAppName || 'ThindiFood'))
            .replace(/{{\s*OTP\s*}}/gi, String(otp));

        const url = new URL('http://cloud.smsindiahub.in/vendorsms/pushsms.aspx');
        url.searchParams.append('APIKey', config.smsApiKey);
        url.searchParams.append('sid', config.smsSenderId);
        url.searchParams.append('msisdn', msisdn);
        url.searchParams.append('msg', message);
        url.searchParams.append('gwid', '2');
        url.searchParams.append('fl', '0');

        if (config.smsIndiaHubUsername) {
            url.searchParams.append('uname', config.smsIndiaHubUsername);
        }
        if (config.smsDltTemplateId) {
            url.searchParams.append('DLT_TE_ID', config.smsDltTemplateId);
        }

        logger.info(`[SMS] Sending OTP to ${msisdn} via SMS India Hub...`);
        const response = await fetch(url.toString());
        const resultText = await response.text();
        logger.info(`[SMS] Raw response for ${msisdn}: ${resultText}`);

        let parsed = null;
        try {
            parsed = JSON.parse(resultText);
        } catch {
            parsed = null;
        }

        if (parsed && parsed.ErrorCode && parsed.ErrorCode !== '000') {
            const errMsg = `SMS India Hub ERROR for ${phone}: [${parsed.ErrorCode}] ${parsed.ErrorMessage || resultText}`;
            logger.error(errMsg);
            console.error(`[SMS ERROR] ${errMsg}`);
            if (parsed.ErrorCode === '006') {
                console.error('[SMS ERROR] ErrorCode 006 means your DLT template text does not exactly match the approved SMS India Hub template.');
            }
        } else if (!response.ok) {
            logger.error(`SMS API HTTP error for ${phone}: ${response.status} - ${resultText}`);
        } else {
            logger.info(`[SMS] OTP sent successfully to ${msisdn}`);
        }
    } catch (error) {
        logger.error(`Error sending SMS to ${phone}: ${error.message}`);
    }
};

export const createOrUpdateOtp = async (phone, options = {}) => {
    const forceRandom = options?.forceRandom === true;
    const phoneCandidates = getPhoneCandidates(phone);
    const normalizedPhone = normalizePhoneForOtp(phone) || String(phone || '').trim();
    const normalizedLast10 = normalizedPhone.slice(-10);
    const existing = await FoodOtp.findOne({ phone: { $in: phoneCandidates } });
    const now = new Date();

    if (existing) {
        const windowMs = (config.otpRateWindow || 600) * 1000;
        const isInWindow = now - existing.lastRequestAt < windowMs;

        if (isInWindow) {
            if (existing.requestCount >= (config.otpRateLimit || 3)) {
                logger.warn(`Rate limit exceeded for phone ${phone}`);
                throw new ValidationError(`Too many OTP requests. Please try again after ${Math.ceil(windowMs / 60000)} minutes.`);
            }
            existing.requestCount += 1;
        } else {
            existing.requestCount = 1;
        }
    }

    const fixedTestOtp = !forceRandom ? FIXED_TEST_OTP_MAP.get(normalizedLast10) : null;
    const isFixedTestOtpPhone = Boolean(fixedTestOtp);
    const shouldUseDefaultOtp = (config.useDefaultOtp || isFixedTestOtpPhone) && !forceRandom;

    let otp;
    if (shouldUseDefaultOtp) {
        otp = normalizeOtpCode(isFixedTestOtpPhone ? fixedTestOtp : '1234');
        logger.info(
            isFixedTestOtpPhone
                ? `Fixed test OTP enabled. OTP is ${otp} for phone ${phone}`
                : `Default OTP mode enabled. OTP is ${otp} for phone ${phone}`
        );
    } else {
        otp = normalizeOtpCode(generateOtpCode());
        logger.info(`SMS OTP mode enabled. Generated OTP for phone ${phone} will be sent via SMS India Hub if credentials are configured.`);
    }

    let ttlMs;
    if (config.otpExpirySeconds) {
        ttlMs = config.otpExpirySeconds * 1000;
    } else if (config.otpExpiryMinutes) {
        ttlMs = config.otpExpiryMinutes * 60 * 1000;
    } else {
        ttlMs = ms(config.otpExpiry || '5m');
    }
    const expiresAt = new Date(now.getTime() + ttlMs);

    if (existing) {
        existing.phone = normalizedPhone;
        existing.otp = otp;
        existing.expiresAt = expiresAt;
        existing.attempts = 0;
        existing.lastRequestAt = now;
        await existing.save();
    } else {
        await FoodOtp.create({
            phone: normalizedPhone,
            otp,
            expiresAt,
            requestCount: 1,
            lastRequestAt: now,
        });
    }

    // Mode behavior:
    // - USE_DEFAULT_OTP=true  => fixed OTP "1234", no SMS send
    // - USE_DEFAULT_OTP=false => random OTP, send via SMS India Hub
    if (!shouldUseDefaultOtp && config.smsApiKey && config.smsSenderId) {
        await sendSmsViaIndiaHub(phone, otp);
    } else if (!shouldUseDefaultOtp) {
        logger.warn(`OTP generated for ${phone}, but SMS delivery is skipped because SMS India Hub credentials are missing.`);
    }

    return otp;
};

export const verifyOtp = async (phone, otp) => {
    const phoneCandidates = getPhoneCandidates(phone);
    const record = await FoodOtp.findOne({ phone: { $in: phoneCandidates } });
    const normalizedOtp = normalizeOtpCode(otp);
    if (!record) {
        return { valid: false, reason: 'OTP not found' };
    }

    if (record.expiresAt < new Date()) {
        return { valid: false, reason: 'OTP expired' };
    }

    if (record.attempts >= config.otpMaxAttempts) {
        return { valid: false, reason: 'Max attempts exceeded' };
    }

    if (!normalizedOtp) {
        return { valid: false, reason: 'Invalid OTP' };
    }

    if (normalizeOtpCode(record.otp) !== normalizedOtp) {
        record.attempts += 1;
        await record.save();
        return { valid: false, reason: 'Invalid OTP' };
    }

    await record.deleteOne();
    return { valid: true };
};
