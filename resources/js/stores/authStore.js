import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
    persist(
        (set, get) => ({
            user: null,
            token: null,
            isAuthenticated: false,

            setAuth: (user, token) => {
                set({
                    user,
                    token,
                    isAuthenticated: true,
                });
            },

            updateUser: (userData) => {
                set((state) => ({
                    user: { ...state.user, ...userData },
                }));
            },

            // Super admin "login as" a tenant admin; keeps the admin session so it can be restored
            startImpersonation: (user, token) => {
                const { user: adminUser, token: adminToken } = get();
                localStorage.setItem('admin_original_token', adminToken);
                localStorage.setItem('admin_original_user', JSON.stringify(adminUser));
                localStorage.removeItem('module-store');
                set({ user, token, isAuthenticated: true });
            },

            stopImpersonation: () => {
                const adminToken = localStorage.getItem('admin_original_token');
                const adminUser = JSON.parse(localStorage.getItem('admin_original_user') || 'null');
                localStorage.removeItem('admin_original_token');
                localStorage.removeItem('admin_original_user');
                localStorage.removeItem('module-store');
                set({ user: adminUser, token: adminToken, isAuthenticated: !!adminToken });
            },

            isImpersonating: () => !!localStorage.getItem('admin_original_token'),

            logout: () => {
                localStorage.removeItem('module-store');
                localStorage.removeItem('admin_original_token');
                localStorage.removeItem('admin_original_user');
                set({
                    user: null,
                    token: null,
                    isAuthenticated: false,
                });
            },

            isSuperAdmin: () => get().user?.role === 'super_admin',
            isRestaurantAdmin: () => get().user?.role === 'restaurant_admin',
            isStaff: () => get().user?.role === 'staff',
            isKitchen: () => get().user?.role === 'kitchen',
            hasRole: (...roles) => roles.includes(get().user?.role),
        }),
        {
            name: 'auth-storage',
            partialize: (state) => ({
                user: state.user,
                token: state.token,
                isAuthenticated: state.isAuthenticated,
            }),
        }
    )
);
