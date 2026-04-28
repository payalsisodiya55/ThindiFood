import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from '../../config/env.js';
import {
    ADMIN_TYPES,
    ADMIN_ZONE_ACCESS,
    normalizeAdminType,
    normalizeSidebarPermissions,
    normalizeZoneAccess,
    normalizeZoneIds
} from './adminAccess.constants.js';

const adminSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },
        password: {
            type: String,
            required: true
        },
        name: { type: String, trim: true, default: '' },
        phone: { type: String, trim: true, default: '' },
        profileImage: { type: String, trim: true, default: '' },
        fcmTokens: {
            type: [String],
            default: []
        },
        fcmTokenMobile: {
            type: [String],
            default: []
        },
        role: {
            type: String,
            default: 'ADMIN'
        },
        adminType: {
            type: String,
            enum: Object.values(ADMIN_TYPES),
            default: ADMIN_TYPES.SUPERADMIN
        },
        roleTitle: { type: String, trim: true, default: 'Super Admin' },
        isActive: {
            type: Boolean,
            default: true
        },
        sidebarPermissions: {
            type: [String],
            default: []
        },
        zoneAccess: {
            type: String,
            enum: Object.values(ADMIN_ZONE_ACCESS),
            default: ADMIN_ZONE_ACCESS.ALL
        },
        zoneIds: {
            type: [mongoose.Schema.Types.ObjectId],
            ref: 'FoodZone',
            default: []
        },
        servicesAccess: {
            type: [String],
            enum: ['food', 'quickCommerce', 'taxi'],
            default: ['food']
        }
    },
    {
        collection: 'food_admins',
        timestamps: true
    }
);

adminSchema.index({ servicesAccess: 1 });
adminSchema.index({ adminType: 1, isActive: 1 });

adminSchema.pre('save', async function (next) {
    this.adminType = normalizeAdminType(this.adminType);
    this.roleTitle = String(this.roleTitle || (this.adminType === ADMIN_TYPES.SUPERADMIN ? 'Super Admin' : 'Sub Admin')).trim();
    this.sidebarPermissions = this.adminType === ADMIN_TYPES.SUPERADMIN
        ? []
        : normalizeSidebarPermissions(this.sidebarPermissions);
    this.zoneAccess = this.adminType === ADMIN_TYPES.SUPERADMIN
        ? ADMIN_ZONE_ACCESS.ALL
        : normalizeZoneAccess(this.zoneAccess);
    this.zoneIds = this.zoneAccess === ADMIN_ZONE_ACCESS.CUSTOM
        ? normalizeZoneIds(this.zoneIds).map((id) => new mongoose.Types.ObjectId(id))
        : [];

    if (!this.isModified('password')) {
        return next();
    }

    const salt = await bcrypt.genSalt(config.bcryptSaltRounds);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

adminSchema.methods.comparePassword = function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

export const FoodAdmin = mongoose.model('FoodAdmin', adminSchema);

