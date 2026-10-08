import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

const api = axios.create({
    baseURL: '/api',
    headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
    },
});

// Request interceptor - attach token
api.interceptors.request.use(
    (config) => {
        const token = useAuthStore.getState().token;
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Proactive token refresh. JWTs expire after JWT_TTL (60 min) and the refresh endpoint
// requires a still-valid token, so renew shortly before expiry instead of logging
// staff out mid-shift. Impersonation tokens are left to expire on purpose.
const REFRESH_WINDOW_MS = 5 * 60 * 1000;
let refreshInFlight = null;

const tokenExpiryMs = (token) => {
    try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        return payload.exp ? payload.exp * 1000 : null;
    } catch {
        return null;
    }
};

const refreshTokenIfExpiring = () => {
    const { token, isImpersonating, setToken } = useAuthStore.getState();
    if (!token || refreshInFlight || isImpersonating()) return;

    const expiresAt = tokenExpiryMs(token);
    if (!expiresAt || expiresAt - Date.now() > REFRESH_WINDOW_MS || expiresAt <= Date.now()) return;

    refreshInFlight = api
        .post('/auth/refresh')
        .then(({ data }) => {
            // Ignore if the user logged out or switched accounts meanwhile
            if (useAuthStore.getState().token === token && data?.access_token) setToken(data.access_token);
        })
        .catch(() => {})
        .finally(() => {
            refreshInFlight = null;
        });
};

if (typeof window !== 'undefined') {
    setInterval(refreshTokenIfExpiring, 60 * 1000);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') refreshTokenIfExpiring();
    });
}

// Response interceptor - handle auth errors
api.interceptors.response.use(
    (response) => {
        const warning = response.headers?.['x-subscription-warning'];
        if (warning === 'grace_period') {
            sessionStorage.setItem('subscription_warning', warning);
        }
        return response;
    },
    (error) => {
        if (error.response?.status === 401 && !error.config?.skipAuthRedirect) {
            useAuthStore.getState().logout();
            window.location.href = '/login';
        }

        if (error.response?.status === 402) {
            // Subscription or trial expired
            const isTrialExpired = error.response?.data?.trial_expired === true;
            window.location.href = isTrialExpired
                ? '/dashboard/settings?trial=expired'
                : '/dashboard/settings?subscription=expired';
        }

        return Promise.reject(error);
    }
);

export default api;

// First validation error if present, else the server message
export const apiErrorMessage = (err, fallback = 'Something went wrong') => {
    const errors = err?.response?.data?.errors;
    if (errors && typeof errors === 'object') {
        const first = Object.values(errors)[0];
        if (Array.isArray(first) && first[0]) return first[0];
    }
    return err?.response?.data?.message || fallback;
};

// ==================== API Service Functions ====================

// Auth
export const authAPI = {
    login: (data) => api.post('/auth/login', data),
    register: (data) => api.post('/auth/register', data),
    verifyOtp: (data) => api.post('/auth/verify-otp', data),
    resendOtp: (data) => api.post('/auth/resend-otp', data),
    me: () => api.get('/auth/me'),
    // Capture the token now: callers clear the store right after, before the request interceptor runs
    logout: () => {
        const token = useAuthStore.getState().token;
        return api.post('/auth/logout', null, { headers: { Authorization: `Bearer ${token}` }, skipAuthRedirect: true });
    },
    refresh: () => api.post('/auth/refresh'),
};

// Dashboard
export const dashboardAPI = {
    get: () => api.get('/dashboard'),
};

// Menu Items
export const menuAPI = {
    list: (params) => api.get('/menu-items', { params }),
    create: (data) => api.post('/menu-items', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
    }),
    show: (id) => api.get(`/menu-items/${id}`),
    update: (id, data) => {
        data.append('_method', 'PUT');
        return api.post(`/menu-items/${id}`, data, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
    delete: (id) => api.delete(`/menu-items/${id}`),
    toggle: (id) => api.patch(`/menu-items/${id}/toggle`),
    restore: (id) => api.post(`/menu-items/${id}/restore`),
};

// Categories
export const categoryAPI = {
    list: (params) => api.get('/categories', { params }),
    create: (data) => api.post('/categories', data),
    update: (id, data) => api.put(`/categories/${id}`, data),
    delete: (id) => api.delete(`/categories/${id}`),
};

// Tables
export const tableAPI = {
    list: (params) => api.get('/tables', { params }),
    create: (data) => api.post('/tables', data),
    update: (id, data) => api.put(`/tables/${id}`, data),
    delete: (id) => api.delete(`/tables/${id}`),
    transfer: (data) => api.post('/tables/transfer', data),
    qrCode: (id) => api.get(`/tables/${id}/qr`),
    parcelQr: () => api.get('/tables/parcel-qr'),
    qrCodes: () => api.get('/tables/qr-codes'),
};

// Vouchers
export const voucherAPI = {
    list: (params) => api.get('/vouchers', { params }),
    create: (data) => api.post('/vouchers', data),
    update: (id, data) => api.put(`/vouchers/${id}`, data),
    delete: (id) => api.delete(`/vouchers/${id}`),
    validate: (data) => api.post('/customer/voucher/validate', data),
};

// Orders
export const orderAPI = {
    list: (params) => api.get('/orders', { params }),
    show: (id) => api.get(`/orders/${id}`),
    updateStatus: (id, status) => api.patch(`/orders/${id}/status`, { status }),
    cancel: (id) => api.post(`/orders/${id}/cancel`),
    markPaid: (id, data = {}) => api.post(`/orders/${id}/mark-paid`, data),
    track: (orderNumber, accessToken) => api.get(`/customer/order/track/${orderNumber}`, {
        params: accessToken ? { access_token: accessToken } : undefined,
    }),
    invoice: (orderNumber, accessToken) => api.get(`/customer/order/${orderNumber}/invoice`, {
        params: accessToken ? { access_token: accessToken } : undefined,
    }),
};

// Kitchen
export const kitchenAPI = {
    activeOrders: () => api.get('/kitchen/orders'),
    ordersByStatus: (status) => api.get(`/kitchen/orders/${status}`),
    advanceOrder: (id) => api.post(`/kitchen/orders/${id}/advance`),
    stats: () => api.get('/kitchen/stats'),
};

// Reports
export const reportAPI = {
    sales: (params) => api.get('/reports/sales', { params }),
    vouchers: (params) => api.get('/reports/vouchers', { params }),
    tables: (params) => api.get('/reports/tables', { params }),
    trends: (params) => api.get('/reports/trends', { params }),
    topItems: (params) => api.get('/reports/top-items', { params }),
    revenueComparison: () => api.get('/reports/revenue-comparison'),
    settlements: () => api.get('/reports/settlements'),
    vatDaily: (params) => api.get('/reports/vat/daily', { params }),
    vatMonthly: (params) => api.get('/reports/vat/monthly', { params }),
};

// Settlements
export const settlementAPI = {
    list: (params) => api.get('/settlements', { params }),
    show: (id) => api.get(`/settlements/${id}`),
};

// Users
export const profileAPI = {
    get: () => api.get('/profile'),
    update: (data) => api.put('/profile', data),
    changePassword: (data) => api.put('/profile/password', data),
};

export const userAPI = {
    list: (params) => api.get('/users', { params }),
    create: (data) => api.post('/users', data),
    update: (id, data) => api.put(`/users/${id}`, data),
    delete: (id) => api.delete(`/users/${id}`),
};

// Subscription
export const subscriptionAPI = {
    current: () => api.get('/subscription/current'),
    plans: () => api.get('/subscription/plans'),
    initiate: (data) => api.post('/subscription/initiate', data),
    verify: (data) => api.post('/subscription/verify', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
    }),
    pay: (data) => api.post('/subscription/pay', data),
};

// Module Access (tenant-facing)
export const moduleAPI = {
    myAccess: () => api.get('/modules/my-access'),
};

// Branding (restaurant admin)
export const brandingAPI = {
    get: () => api.get('/branding'),
    update: (data) => api.post('/branding', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

// Platform Branding (public + admin)
export const platformAPI = {
    branding: () => api.get('/platform/branding'),
};

// Customer (public)
export const customerAPI = {
    restaurant: (slug) => api.get(`/customer/restaurant/${slug}`),
    menu: (slug) => api.get(`/customer/restaurant/${slug}/menu`),
    table: (slug, tableId) => api.get(`/customer/restaurant/${slug}/table/${tableId}`),
    placeOrder: (slug, data) => api.post(`/customer/restaurant/${slug}/order`, data),
    validateVoucher: (slug, code, subtotal = 0) => api.post('/customer/voucher/validate', { tenant_slug: slug, code, subtotal }),
    initiatePayment: (orderNumber) => api.post('/payment/sslcommerz/initiate', { order_number: orderNumber }),
};

// POS Terminal
export const posAPI = {
    createOrder: (data) => api.post('/pos/orders', data),
};

// Contact (public)
export const contactAPI = {
    submit: (data) => api.post('/contact', data),
};

// Admin
export const adminAPI = {
    tenants: {
        list: (params) => api.get('/admin/tenants', { params }),
        options: () => api.get('/admin/tenants', { params: { all: 1 } }),
        create: (data) => api.post('/admin/tenants', data),
        show: (id) => api.get(`/admin/tenants/${id}`),
        update: (id, data) => api.put(`/admin/tenants/${id}`, data),
        // Multipart (logo upload): PHP only parses file bodies on POST, so spoof the PUT
        updateForm: (id, formData) => {
            formData.append('_method', 'PUT');
            return api.post(`/admin/tenants/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        },
        delete: (id) => api.delete(`/admin/tenants/${id}`),
        dashboard: () => api.get('/admin/tenants-dashboard'),
        stats: (id) => api.get(`/admin/tenants/${id}/stats`),
        impersonate: (id) => api.post(`/admin/tenants/${id}/impersonate`),
        sendEmail: (id, data) => api.post(`/admin/tenants/${id}/send-email`, data),
        bulkAction: (data) => api.post('/admin/tenants/bulk-action', data),
        export: () => api.get('/admin/tenants/export', { responseType: 'blob' }),
    },
    users: {
        list: (params) => api.get('/admin/users', { params }),
        create: (data) => api.post('/admin/users', data),
        update: (id, data) => api.put(`/admin/users/${id}`, data),
        deactivate: (id) => api.delete(`/admin/users/${id}`),
    },
    subscriptions: {
        list: (params) => api.get('/admin/subscriptions', { params }),
        create: (data) => api.post('/admin/subscriptions', data),
        show: (id) => api.get(`/admin/subscriptions/${id}`),
        cancel: (id, data) => api.post(`/admin/subscriptions/${id}/cancel`, data),
        expiringSoon: () => api.get('/admin/subscriptions/expiring-soon'),
        extend: (id, data) => api.post(`/admin/subscriptions/${id}/extend`, data),
        renew: (tenantId, data) => api.post(`/admin/subscriptions/${tenantId}/renew`, data),
    },
    plans: {
        list: () => api.get('/admin/plans'),
        create: (data) => api.post('/admin/plans', data),
        show: (id) => api.get(`/admin/plans/${id}`),
        update: (id, data) => api.put(`/admin/plans/${id}`, data),
        toggle: (id) => api.patch(`/admin/plans/${id}/toggle`),
        delete: (id) => api.delete(`/admin/plans/${id}`),
        modules: (planId) => api.get(`/admin/plans/${planId}/modules`),
        syncModules: (planId, moduleKeys) => api.post(`/admin/plans/${planId}/modules/sync`, { module_keys: moduleKeys }),
    },
    modules: {
        list: () => api.get('/admin/modules'),
        toggle: (key) => api.patch(`/admin/modules/${key}/toggle`),
    },
    tenantModules: {
        matrix: (tenantId) => api.get(`/admin/tenants/${tenantId}/modules`),
        grant: (tenantId, data) => api.post(`/admin/tenants/${tenantId}/modules/grant`, data),
        revoke: (tenantId, data) => api.post(`/admin/tenants/${tenantId}/modules/revoke`, data),
        removeOverride: (tenantId, moduleKey) => api.delete(`/admin/tenants/${tenantId}/modules/${moduleKey}`),
    },
    tenantApplications: {
        list: (params) => api.get('/admin/tenant-applications', { params }),
        show: (id) => api.get(`/admin/tenant-applications/${id}`),
        approve: (id, data) => api.post(`/admin/tenant-applications/${id}/approve`, data),
        reject: (id, data) => api.post(`/admin/tenant-applications/${id}/reject`, data),
    },
    settlements: {
        list: (params) => api.get('/admin/settlements', { params }),
        show: (id) => api.get(`/admin/settlements/${id}`),
        stats: () => api.get('/admin/settlements/stats'),
        recordPayment: (id, data) => api.post(`/admin/settlements/${id}/payment`, data),
    },
    settings: {
        get: () => api.get('/admin/settings'),
        update: (data) => api.post('/admin/settings', data, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }),
    },
    enquiries: {
        list: (params) => api.get('/admin/enquiries', { params }),
        show: (id) => api.get(`/admin/enquiries/${id}`),
        markRead: (id) => api.patch(`/admin/enquiries/${id}/read`),
        reply: (id, data) => api.post(`/admin/enquiries/${id}/reply`, data),
        updateStatus: (id, status) => api.patch(`/admin/enquiries/${id}/status`, { status }),
        delete: (id) => api.delete(`/admin/enquiries/${id}`),
    },
    announcements: {
        list: (params) => api.get('/admin/announcements', { params }),
        create: (data) => api.post('/admin/announcements', data),
        show: (id) => api.get(`/admin/announcements/${id}`),
        update: (id, data) => api.put(`/admin/announcements/${id}`, data),
        delete: (id) => api.delete(`/admin/announcements/${id}`),
        send: (id) => api.post(`/admin/announcements/${id}/send`),
    },
    system: {
        health: () => api.get('/admin/system/health'),
        info: () => api.get('/admin/system/info'),
        queueStats: () => api.get('/admin/system/queue-stats'),
        retryFailedJobs: () => api.post('/admin/system/retry-failed-jobs'),
        clearCache: (type) => api.post('/admin/system/clear-cache', { type }),
        storageLink: () => api.post('/admin/system/storage-link'),
        logs: (lines = 100) => api.get('/admin/system/logs', { params: { lines } }),
    },
    auditLogs: {
        list: (params) => api.get('/admin/audit-logs', { params }),
        show: (id) => api.get(`/admin/audit-logs/${id}`),
        actions: () => api.get('/admin/audit-logs/actions'),
        stats: (days = 30) => api.get('/admin/audit-logs/stats', { params: { days } }),
        export: (params) => api.get('/admin/audit-logs/export', { params, responseType: 'blob' }),
    },
};

// Announcements for tenant users
export const announcementAPI = {
    active: () => api.get('/announcements/active'),
    markAsRead: (id) => api.post(`/announcements/${id}/read`),
};

// Public Plans
export const plansAPI = {
    list: () => api.get('/plans'),
};

// AI Analytics Assistant
export const aiAPI = {
    // Ask a question
    ask: (question, conversationId = null) =>
        api.post('/ai/analytics/ask', { question, conversation_id: conversationId }),

    // Get proactive insights
    insights: () => api.get('/ai/analytics/insights'),

    // Get suggested questions
    suggestions: () => api.get('/ai/analytics/suggestions'),

    // Get AI usage stats
    usage: () => api.get('/ai/analytics/usage'),

    // Conversation history
    conversations: () => api.get('/ai/analytics/conversations'),
    conversation: (id) => api.get(`/ai/analytics/conversations/${id}`),
    deleteConversation: (id) => api.delete(`/ai/analytics/conversations/${id}`),
};

// AI Sales Forecasting
export const forecastAPI = {
    // Get 7-day sales forecast
    getForecast: (days = 7) => api.get('/ai/forecast', { params: { days } }),

    // Get busy hours analysis
    getBusyHours: () => api.get('/ai/forecast/busy-hours'),

    // Get staffing recommendations
    getStaffing: () => api.get('/ai/forecast/staffing'),
};

// Customer Chatbot (public, no auth)
export const customerChatAPI = {
    // Send a message to the chatbot
    chat: (tenantSlug, message, sessionId = null) =>
        api.post(`/customer/restaurant/${tenantSlug}/chat`, { message, session_id: sessionId }),

    // Get initial suggestions
    getSuggestions: (tenantSlug) =>
        api.get(`/customer/restaurant/${tenantSlug}/chat/suggestions`),
};

// Smart Recommendations (public)
export const recommendationAPI = {
    // Get recommendations based on cart
    get: (tenantSlug, cartItems = [], limit = 6) =>
        api.post(`/customer/restaurant/${tenantSlug}/recommendations`, { cart: cartItems, limit }),

    // Get frequently bought together items
    getFrequentlyBoughtTogether: (tenantSlug, itemId, limit = 3) =>
        api.get(`/customer/restaurant/${tenantSlug}/recommendations/${itemId}/fbt`, { params: { limit } }),
};

// AI Menu Description Generator
export const menuDescriptionAPI = {
    // Generate a description for a menu item
    generate: (name, category = null, price = null, options = {}) =>
        api.post('/ai/description/generate', { name, category, price, ...options }),

    // Generate multiple alternatives
    alternatives: (name, category = null, price = null, count = 3) =>
        api.post('/ai/description/alternatives', { name, category, price, count }),

    // Improve an existing description
    improve: (name, description, category = null) =>
        api.post('/ai/description/improve', { name, description, category }),

    // Batch generate descriptions
    batch: (items) =>
        api.post('/ai/description/batch', { items }),

    // Generate and optionally apply to menu item
    generateForItem: (itemId, options = {}) =>
        api.post(`/ai/description/menu-items/${itemId}`, options),
};
// AI Sentiment Analysis
export const sentimentAPI = {
    // Get sentiment overview for a period (7d, 14d, 30d, 90d)
    getOverview: (period = '30d') =>
        api.get('/ai/sentiment/overview', { params: { period } }),

    // Get sentiment trends over time
    getTrends: (days = 14) =>
        api.get('/ai/sentiment/trends', { params: { days } }),

    // Get negative feedback requiring attention
    getNegativeFeedback: (limit = 10) =>
        api.get('/ai/sentiment/negative', { params: { limit } }),

    // Analyze a single text
    analyze: (text) =>
        api.post('/ai/sentiment/analyze', { text }),
};
