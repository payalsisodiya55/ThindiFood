import axios from 'axios';

const axiosInstance = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1',
    headers: {
        'Content-Type': 'application/json',
    },
});

const getCustomerToken = () =>
    localStorage.getItem('auth_customer') ||
    localStorage.getItem('user_accessToken') ||
    localStorage.getItem('accessToken') ||
    null;

const getModuleToken = (module) => {
    if (module === 'admin') {
        return localStorage.getItem('admin_accessToken') || localStorage.getItem('auth_admin') || null;
    }
    if (module === 'seller') {
        return localStorage.getItem('seller_accessToken') || localStorage.getItem('auth_seller') || null;
    }
    if (module === 'delivery') {
        return localStorage.getItem('delivery_accessToken') || localStorage.getItem('auth_delivery') || null;
    }
    return getCustomerToken();
};

const detectRequestModule = (requestUrl = '') => {
    const url = String(requestUrl || '').toLowerCase();
    if (
        url.startsWith('/admin') ||
        url.includes('/food/admin/') ||
        url.includes('/auth/admin')
    ) return 'admin';
    if (
        url.startsWith('/seller') ||
        url.includes('/food/seller/') ||
        url.includes('/auth/seller')
    ) return 'seller';
    if (
        url.startsWith('/delivery') ||
        url.includes('/food/delivery/') ||
        url.includes('/auth/delivery')
    ) return 'delivery';
    if (
        url.startsWith('/user') ||
        url.startsWith('/customer') ||
        url.startsWith('/auth') ||
        url.includes('/food/user/')
    ) return 'customer';
    return null;
};

// Request interceptor for API calls
axiosInstance.interceptors.request.use(
    (config) => {
        let token = null;
        const url = String(config.url || '');
        const pagePath = window.location.pathname;

        // Determination strategy: 
        // 1. If we are on a module-specific page (e.g. /seller/dashboard), prioritize that module's token
        // This is crucial for shared APIs like /products or /admin/categories
        if (pagePath.startsWith('/seller')) {
            token = getModuleToken('seller');
        } else if (pagePath.startsWith('/admin')) {
            token = getModuleToken('admin');
        } else if (pagePath.startsWith('/delivery')) {
            token = getModuleToken('delivery');
        } else if (pagePath.startsWith('/customer')) {
            token = getCustomerToken();
        }

        // 2. Fallback to URL-based detection
        if (!token) {
            const requestModule = detectRequestModule(url);
            if (requestModule === 'seller') token = getModuleToken('seller');
            else if (requestModule === 'admin') token = getModuleToken('admin');
            else if (requestModule === 'delivery') token = getModuleToken('delivery');
            else if (url.startsWith('/customer') || url.startsWith('/cart') || url.startsWith('/wishlist') || url.startsWith('/categories') || url.startsWith('/products')) {
                token = getCustomerToken();
            }
        }

        // 3. Final default: if we are on a general page and STILL no token, try customer token
        if (!token && !pagePath.startsWith('/admin') && !pagePath.startsWith('/seller') && !pagePath.startsWith('/delivery')) {
            token = getCustomerToken();
        }

        // 3. Last fallback: Check common 'token' key if implemented
        if (!token) {
            token = localStorage.getItem('token');
        }

        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor for API calls
axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            // Only reload when we had a token that's now invalid (expired/logged out elsewhere).
            // If no token exists, skip reload to avoid infinite loop on public pages.
            const hasToken = ['auth_seller', 'seller_accessToken', 'auth_admin', 'admin_accessToken', 'auth_delivery', 'delivery_accessToken', 'auth_customer', 'user_accessToken', 'accessToken', 'token'].some(
                (key) => localStorage.getItem(key)
            );
            if (!hasToken) {
                return Promise.reject(error);
            }
            const path = window.location.pathname;
            const requestUrl = String(originalRequest?.url || '');
            const currentModule = path.startsWith('/seller')
                ? 'seller'
                : path.startsWith('/admin')
                    ? 'admin'
                    : path.startsWith('/delivery')
                        ? 'delivery'
                        : 'customer';
            const requestModule = detectRequestModule(requestUrl);

            // Prevent cross-module 401s from logging out the active session
            // (e.g. seller page accidentally calling an admin endpoint).
            if (requestModule && requestModule !== currentModule) {
                return Promise.reject(error);
            }

            const moduleStorageKeys = {
                seller: ['auth_seller', 'seller_accessToken', 'token'],
                admin: ['auth_admin', 'admin_accessToken', 'token'],
                delivery: ['auth_delivery', 'delivery_accessToken', 'token'],
                customer: ['auth_customer', 'user_accessToken', 'accessToken', 'token'],
            };
            const keysToClear = moduleStorageKeys[currentModule] || ['token'];
            keysToClear.forEach((key) => localStorage.removeItem(key));

            if (currentModule === 'seller') window.location.href = '/seller/auth';
            else if (currentModule === 'admin') window.location.href = '/admin/auth';
            else if (currentModule === 'delivery') window.location.href = '/delivery/auth';
            else window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export default axiosInstance;
