import React, { createContext, useContext, useState, useEffect } from 'react';
import axiosInstance from '@core/api/axios';
import { getWithDedupe } from '@core/api/dedupe';

const AuthContext = createContext(undefined);

const ROLE_STORAGE_KEYS = {
    customer: 'auth_customer',
    seller: 'auth_seller',
    admin: 'auth_admin',
    delivery: 'auth_delivery'
};

const LEGACY_ROLE_STORAGE_KEYS = {
    customer: ['user_accessToken', 'accessToken'],
    seller: ['seller_accessToken', 'accessToken'],
    admin: ['admin_accessToken', 'accessToken'],
    delivery: ['delivery_accessToken', 'accessToken']
};

const extractProfilePayload = (response) => {
    const raw = response?.data?.result ?? response?.data?.data ?? null;
    if (raw && typeof raw === 'object' && raw.user) {
        return raw.user;
    }
    return raw;
};

const syncAdminLocalProfile = (role, profile) => {
    if (role !== 'admin' || !profile || typeof window === 'undefined') return;
    try {
        localStorage.setItem('admin_user', JSON.stringify(profile));
        window.dispatchEvent(new Event('adminAuthChanged'));
    } catch (error) {
        console.error('Failed to sync admin profile to localStorage:', error);
    }
};

const getProfileEndpoint = (role) => {
    if (role === 'seller') return '/seller/profile';
    return '/auth/me';
};

export const AuthProvider = ({ children }) => {
    // Current role based on URL
    const getCurrentRoleFromUrl = () => {
        const path = window.location.pathname;
        if (path.startsWith('/seller')) return 'seller';
        if (path.startsWith('/admin')) return 'admin';
        if (path.startsWith('/delivery')) return 'delivery';
        return 'customer';
    };

    const getSafeToken = (key) => {
        const val = localStorage.getItem(ROLE_STORAGE_KEYS[key]);
        const fallbackVal =
            val ||
            LEGACY_ROLE_STORAGE_KEYS[key]?.map((storageKey) => localStorage.getItem(storageKey)).find(Boolean) ||
            null;
        if (!fallbackVal) return null;
        const normalizedVal = fallbackVal;
        if (normalizedVal.startsWith('{')) {
            try { return JSON.parse(normalizedVal).token; } catch { return normalizedVal; }
        }
        return normalizedVal;
    };

    const [authData, setAuthData] = useState({
        customer: getSafeToken('customer'),
        seller: getSafeToken('seller'),
        admin: getSafeToken('admin'),
        delivery: getSafeToken('delivery'),
    });

    const currentRole = getCurrentRoleFromUrl();
    const [user, setUser] = useState(null);
    const token = authData[currentRole];
    const [isLoading, setIsLoading] = useState(Boolean(authData[currentRole]));
    const isAuthenticated = !!token;

    // Fetch user profile on mount or token change
    useEffect(() => {
        const fetchProfile = async () => {
            if (token) {
                setIsLoading(true);
                try {
                    // Use deduplicated fetch to avoid multiple simultaneous profile calls
                    const response = await getWithDedupe(
                        getProfileEndpoint(currentRole),
                        {},
                        { ttl: 5000 }
                    );
                    const payload = extractProfilePayload(response);
                    setUser(payload);
                    syncAdminLocalProfile(currentRole, payload);
                } catch (error) {
                    if (error?.response?.status === 401) {
                        // Expired/invalid token or guest context:
                        // clear stale role token to avoid repeated /auth/me 401 calls.
                        const roleStorageKey = ROLE_STORAGE_KEYS[currentRole];
                        if (roleStorageKey) {
                            localStorage.removeItem(roleStorageKey);
                        }
                        if (currentRole === 'admin') {
                            localStorage.removeItem('admin_user');
                            window.dispatchEvent(new Event('adminAuthChanged'));
                        }
                        (LEGACY_ROLE_STORAGE_KEYS[currentRole] || []).forEach((storageKey) => {
                            localStorage.removeItem(storageKey);
                        });
                        setAuthData((prev) => ({ ...prev, [currentRole]: null }));
                        setUser(null);
                    } else {
                        console.error('Failed to fetch profile:', error);
                    }
                } finally {
                    setIsLoading(false);
                }
            } else {
                setUser(null);
                setIsLoading(false);
            }
        };

        fetchProfile();
    }, [token, currentRole]);

    const login = (userData) => {
        const role = userData.role?.toLowerCase() || 'customer';
        const storageKey = ROLE_STORAGE_KEYS[role];

        if (storageKey && userData.token) {
            // Save ONLY the token string as requested by the user
            localStorage.setItem(storageKey, userData.token);

            setAuthData(prev => ({ ...prev, [role]: userData.token }));
            setUser(userData); // Set full data initially
            syncAdminLocalProfile(role, userData);
        } else {
            console.error('Invalid role or missing token for login:', role);
        }
    };

    const logout = () => {
        // Clear all role-specific tokens from localStorage
        Object.values(ROLE_STORAGE_KEYS).forEach(key => {
            localStorage.removeItem(key);
        });

        const path = window.location.pathname;

        // Also clear common 'token' key if implemented
        localStorage.removeItem('token');
        localStorage.removeItem('admin_user');

        // Reset auth state for all roles to null
        setAuthData({
            customer: null,
            seller: null,
            admin: null,
            delivery: null,
        });

        // Clear the current user profile from memory
        setUser(null);

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('adminAuthChanged'));
        }

        // Final fallback: redirect based on current path if needed
        // (ProtectedRoute usually handles this, but explicit navigation is safer for some UI edge cases)
        if (path.startsWith('/admin')) window.location.href = '/admin/auth';
        else if (path.startsWith('/seller')) window.location.href = '/seller/auth';
        else if (path.startsWith('/delivery')) window.location.href = '/delivery/auth';
        else window.location.href = '/login';
    };

    const refreshUser = async () => {
        if (token) {
            try {
                const response = await axiosInstance.get(getProfileEndpoint(currentRole));
                const payload = extractProfilePayload(response);
                setUser(payload);
                syncAdminLocalProfile(currentRole, payload);
                return payload;
            } catch (error) {
                console.error('Failed to refresh profile:', error);
            }
        }
    };

    return (
        <AuthContext.Provider value={{
            user,
            token, // Added token to context
            role: currentRole,
            isAuthenticated,
            isLoading,
            authData,
            login,
            logout,
            refreshUser
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
