import { create } from 'zustand';

export const useBrandingStore = create((set) => ({
    branding: {
        platform_name: 'TablePilot',
        platform_logo: null,
        platform_logo_dark: null,
        platform_favicon: null,
        primary_color: '#ED802A',
        secondary_color: '#B8560E',
        footer_text: null,
        powered_by_text: 'Powered by TablePilot',
        powered_by_url: null,
    },
    loaded: false,

    setBranding: (data) =>
        set({
            branding: { ...data },
            loaded: true,
        }),
}));
