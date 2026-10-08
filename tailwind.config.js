import defaultTheme from 'tailwindcss/defaultTheme';
import forms from '@tailwindcss/forms';

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './vendor/laravel/framework/src/Illuminate/Pagination/resources/views/*.blade.php',
        './storage/framework/views/*.php',
        './resources/views/**/*.blade.php',
        './resources/js/**/*.{js,jsx,ts,tsx}',
    ],

    theme: {
        extend: {
            fontFamily: {
                sans: ['Figtree', ...defaultTheme.fontFamily.sans],
            },
            colors: {
                // TablePilot orange. 500 is the logo colour; use 700+ for text on white (AA contrast).
                brand: {
                    50: '#FFF7ED',
                    100: '#FFEDD5',
                    200: '#FED7AA',
                    300: '#FDBA74',
                    400: '#F59E4C',
                    500: '#ED802A',
                    600: '#DD6B12',
                    700: '#B8560E',
                    800: '#924410',
                    900: '#763912',
                    950: '#401A07',
                },
                // A restaurant's own primary colour on customer-facing pages. Set by
                // restaurantThemeStyle() as RGB channels so opacity modifiers work
                // (bg-restaurant/10). Fallbacks match the default TablePilot orange.
                restaurant: {
                    DEFAULT: 'rgb(var(--restaurant-rgb, 237 128 42) / <alpha-value>)',
                    // The colour darkened to read as text on white (>= 4.5:1)
                    ink: 'rgb(var(--restaurant-ink-rgb, 178 96 32) / <alpha-value>)',
                },
                // Text placed on the restaurant colour: white, or dark on light colours
                'on-restaurant': 'rgb(var(--restaurant-on-rgb, 17 24 39) / <alpha-value>)',
            },
        },
    },

    plugins: [forms],
};
