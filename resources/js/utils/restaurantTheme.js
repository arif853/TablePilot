// Fallback when a restaurant has no (valid) colour: TablePilot orange
export const DEFAULT_RESTAURANT_COLOR = '#ED802A';

const WHITE = '#FFFFFF';
const DARK_TEXT = '#111827'; // Tailwind gray-900

// WCAG thresholds: 3:1 for bold/large text and UI parts (buttons, chips), 4.5:1 for body text
const MIN_ON_COLOR_CONTRAST = 3;
const MIN_TEXT_CONTRAST = 4.5;

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Normalise a stored colour to #RRGGBB, or the default if it isn't a usable hex value. */
export function restaurantColor(hex) {
    const match = typeof hex === 'string' && hex.trim().match(HEX);
    if (!match) return DEFAULT_RESTAURANT_COLOR;

    const digits = match[1].length === 3 ? match[1].split('').map((c) => c + c).join('') : match[1];
    return `#${digits.toUpperCase()}`;
}

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

const toHex = (rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

function luminance(hex) {
    const [r, g, b] = channels(hex).map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

/** Text colour to put *on* the restaurant colour: white unless it's too light to read white on. */
export function onRestaurantColor(hex) {
    const color = restaurantColor(hex);
    if (contrastRatio(color, WHITE) >= MIN_ON_COLOR_CONTRAST) return WHITE;

    return contrastRatio(color, DARK_TEXT) > contrastRatio(color, WHITE) ? DARK_TEXT : WHITE;
}

/** The restaurant colour, darkened just enough to be readable as text on a white background. */
export function restaurantInkColor(hex) {
    const rgb = channels(restaurantColor(hex));

    for (let step = 0; step <= 20; step++) {
        const candidate = toHex(rgb.map((c) => c * (1 - step * 0.05)));
        if (contrastRatio(candidate, WHITE) >= MIN_TEXT_CONTRAST) return candidate;
    }

    return DARK_TEXT;
}

/** Everything a customer-facing component needs from the restaurant's colour. */
export function restaurantTheme(hex) {
    const color = restaurantColor(hex);
    return { color, on: onRestaurantColor(color), ink: restaurantInkColor(color) };
}

const rgbChannels = (hex) => channels(hex).join(' ');

/**
 * Inline style that themes everything below it with the restaurant's colour.
 * Tailwind reads these variables: `bg-restaurant`, `bg-restaurant/10`,
 * `text-on-restaurant` (text placed on the colour) and `text-restaurant-ink`
 * (the colour as readable text on white).
 */
export function restaurantThemeStyle(hex) {
    const theme = restaurantTheme(hex);

    return {
        '--restaurant-rgb': rgbChannels(theme.color),
        '--restaurant-on-rgb': rgbChannels(theme.on),
        '--restaurant-ink-rgb': rgbChannels(theme.ink),
    };
}
