import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ command }) => ({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.ico', 'robots.txt'],
            manifest: {
                name: 'TablePilot',
                short_name: 'TablePilot',
                description: 'The AI-powered restaurant platform',
                theme_color: '#ED802A',
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
    // Built assets are served from public/build; the dev server stays at the root so routes like /login work
    base: command === 'build' ? '/build/' : '/',
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
            // Static images live in Laravel's public/ (Vite's root is resources/js)
            '/assets': {
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
}));
