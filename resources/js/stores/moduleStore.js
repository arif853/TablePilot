import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../services/api';

export const useModuleStore = create(
    persist(
        (set, get) => ({
            modules: [],
            isLoaded: false,
            isLoading: false,
            error: null,

            setModules: (modules) => set({
                modules: Array.isArray(modules) ? modules : [],
                isLoaded: true,
                isLoading: false,
                error: null,
            }),

            hasModule: (key) => get().modules.includes(key),

            fetchModules: async () => {
                try {
                    set({ isLoading: true, error: null });
                    const res = await api.get('/modules/my-access');
                    const modules = res?.data?.data?.modules ?? [];

                    set({
                        modules,
                        isLoaded: true,
                        isLoading: false,
                        error: null,
                    });

                    return modules;
                } catch (error) {
                    set({
                        modules: [],
                        isLoaded: true,
                        isLoading: false,
                        error: error?.response?.data?.message || 'Failed to load module access.',
                    });
                    return [];
                }
            },

            clear: () => set({
                modules: [],
                isLoaded: false,
                isLoading: false,
                error: null,
            }),
        }),
        {
            name: 'module-store',
            partialize: (state) => ({
                modules: state.modules,
                isLoaded: state.isLoaded,
            }),
        }
    )
);
