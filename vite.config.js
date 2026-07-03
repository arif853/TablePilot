import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.ico', 'robots.txt'],
            manifest: {
                name: 'InfyraSoft Smart Resturant SAAS',
                short_name: 'Smart Resturant',
                description: 'Multi-Tenant Restaurant Management Platform',
                theme_color: '#3B82F6',
                background_color: '#ffffff',
                display: 'standalone',
                start_url: '/',
                icons: [
                    {
                        src: '/assets/images/icon-192.png',
                        sizes: '192x192',
                        type: 'image/png',
                    },
                    {
                        src: '/assets/images/icon-512.png',
                        sizes: '512x512',
                        type: 'image/png',
                    },
                ],
            },
        }),
    ],
    root: 'resources/js',
    base: '/',
    build: {
        outDir: '../../public/build',
        emptyOutDir: true,
        manifest: true,
    },
    server: {
        host: '192.168.0.165',
        port: 3000,
        proxy: {
            '/api': {
                target: 'http://backend.test',
                changeOrigin: true,
            },
            '/storage': {
                target: 'http://backend.test',
                changeOrigin: true,
            },
            '/broadcasting': {
                target: 'http://backend.test',
                changeOrigin: true,
            },
        },
    },
});
