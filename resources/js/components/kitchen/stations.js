import {
    GiSteak, GiHamburger, GiFullPizza, GiNoodles, GiBowlOfRice, GiCookingPot, GiBroccoli, GiFrenchFries,
    GiSlicedBread, GiCroissant, GiCakeSlice, GiCoffeeCup, GiSodaCan, GiFishCooked, GiChickenLeg,
    GiCampCookingPot, GiSushis, GiDumpling, GiHotMeal,
} from 'react-icons/gi';

// Each menu category is a kitchen station. The icon is picked from the category name;
// the colour cycles through a palette so neighbouring stations look different.
const ICONS = [
    [/grill|kebab|bbq|barbecue|tandoor|steak|meat/i, GiSteak],
    [/burger|sandwich|wrap/i, GiHamburger],
    [/pizza/i, GiFullPizza],
    [/pasta|noodle|chow|ramen/i, GiNoodles],
    [/biryani|rice|pulao|khichuri/i, GiBowlOfRice],
    [/sea|fish|prawn|shrimp/i, GiFishCooked],
    [/chicken|wing/i, GiChickenLeg],
    [/curr|gravy|bhuna|masala/i, GiCookingPot],
    [/soup/i, GiCampCookingPot],
    [/salad|veg|green/i, GiBroccoli],
    [/sushi/i, GiSushis],
    [/dumpling|momo/i, GiDumpling],
    [/starter|appetizer|snack|fries|side/i, GiFrenchFries],
    [/bread|naan|paratha|roti|bakery/i, GiSlicedBread],
    [/breakfast|brunch/i, GiCroissant],
    [/dessert|sweet|cake|ice ?cream|pastry/i, GiCakeSlice],
    [/coffee|tea|espresso/i, GiCoffeeCup],
    [/drink|juice|shake|beverage|soda|lassi|mocktail|smoothie/i, GiSodaCan],
];

// Full class names so Tailwind keeps them: header tint, icon, count badge, column border
const PALETTE = [
    { head: 'bg-orange-50', icon: 'text-orange-500', badge: 'bg-orange-100 text-orange-700', ring: 'border-orange-200' },
    { head: 'bg-amber-50', icon: 'text-amber-500', badge: 'bg-amber-100 text-amber-700', ring: 'border-amber-200' },
    { head: 'bg-emerald-50', icon: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-700', ring: 'border-emerald-200' },
    { head: 'bg-pink-50', icon: 'text-pink-500', badge: 'bg-pink-100 text-pink-700', ring: 'border-pink-200' },
    { head: 'bg-sky-50', icon: 'text-sky-500', badge: 'bg-sky-100 text-sky-700', ring: 'border-sky-200' },
    { head: 'bg-violet-50', icon: 'text-violet-500', badge: 'bg-violet-100 text-violet-700', ring: 'border-violet-200' },
    { head: 'bg-teal-50', icon: 'text-teal-600', badge: 'bg-teal-100 text-teal-700', ring: 'border-teal-200' },
    { head: 'bg-rose-50', icon: 'text-rose-500', badge: 'bg-rose-100 text-rose-700', ring: 'border-rose-200' },
];

const OTHER = { id: 'other', name: 'Other', sort_order: Number.MAX_SAFE_INTEGER };

export function stationIcon(name) {
    return ICONS.find(([pattern]) => pattern.test(name))?.[1] ?? GiHotMeal;
}

/**
 * Split tickets by station. Each station gets the orders that contain at least one
 * of its items, with only those items, so every cook sees just their part.
 */
export function buildStations(orders) {
    const map = new Map();

    for (const order of orders) {
        for (const item of order.items ?? []) {
            const category = item.menu_item?.category ?? OTHER;
            const key = String(category.id);
            if (!map.has(key)) map.set(key, { key, name: category.name, sort: category.sort_order ?? 0, tickets: new Map() });
            const station = map.get(key);
            if (!station.tickets.has(order.id)) station.tickets.set(order.id, { order, items: [] });
            station.tickets.get(order.id).items.push(item);
        }
    }

    return [...map.values()]
        .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
        .map((station, i) => ({
            key: station.key,
            name: station.name,
            icon: stationIcon(station.name),
            tone: PALETTE[i % PALETTE.length],
            tickets: [...station.tickets.values()],
        }));
}

export const ORDER_TYPES = { dine: 'Dine-in', parcel: 'Takeaway', quick: 'Quick sale', delivery: 'Delivery' };

// "ORD-20261011-3-0012" reads as "#0012" on a busy screen
export const shortNumber = (orderNumber = '') => `#${String(orderNumber).split('-').pop()}`;

export const minutesSince = (date, now) => Math.max(0, Math.floor((now - new Date(date).getTime()) / 60000));

// Age chip colours: calm, getting long, past the target
export function ageTone(minutes, target) {
    if (minutes >= target) return 'bg-red-50 text-red-700 ring-red-600/20';
    if (minutes >= target / 2) return 'bg-amber-50 text-amber-800 ring-amber-600/20';
    return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
}

// What the kitchen does next with an order, and how the button reads
export const NEXT_ACTION = {
    confirmed: { label: 'Start cooking', className: 'bg-orange-500 hover:bg-orange-600 text-white' },
    preparing: { label: 'Mark as ready', className: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
    ready: { label: 'Mark served', className: 'bg-sky-600 hover:bg-sky-700 text-white' },
};

export const STATUS_PILL = {
    confirmed: { label: 'New', className: 'bg-sky-50 text-sky-700 ring-sky-600/20' },
    preparing: { label: 'Cooking', className: 'bg-orange-50 text-orange-700 ring-orange-600/20' },
    ready: { label: 'Ready', className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
};
