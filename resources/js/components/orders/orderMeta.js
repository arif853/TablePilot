import {
    HiOutlineBell, HiOutlineClipboardCheck, HiOutlineFire, HiOutlineCheckCircle, HiOutlineBadgeCheck,
    HiOutlineXCircle, HiOutlineExclamation, HiOutlineShoppingBag, HiOutlineTruck, HiOutlineLightningBolt,
} from 'react-icons/hi';
import { MdOutlineRoomService, MdOutlineTableRestaurant } from 'react-icons/md';

// Front-of-house view of each order status. Full class names so Tailwind keeps them.
export const ORDER_STATUS = {
    placed: { label: 'New', icon: HiOutlineBell, pill: 'bg-sky-50 text-sky-700 ring-sky-600/20' },
    confirmed: { label: 'Confirmed', icon: HiOutlineClipboardCheck, pill: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20' },
    preparing: { label: 'In progress', icon: HiOutlineFire, pill: 'bg-orange-50 text-orange-700 ring-orange-600/20' },
    ready: { label: 'Ready', icon: HiOutlineCheckCircle, pill: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
    served: { label: 'Served', icon: MdOutlineRoomService, pill: 'bg-violet-50 text-violet-700 ring-violet-600/20' },
    completed: { label: 'Completed', icon: HiOutlineBadgeCheck, pill: 'bg-gray-100 text-gray-600 ring-gray-500/20' },
    cancelled: { label: 'Cancelled', icon: HiOutlineXCircle, pill: 'bg-red-50 text-red-700 ring-red-600/20' },
};

export const DELAYED = { label: 'Delayed', icon: HiOutlineExclamation, pill: 'bg-red-50 text-red-700 ring-red-600/30' };

export const STATUS_FLOW = ['placed', 'confirmed', 'preparing', 'ready', 'served', 'completed'];

// The next step staff can take, as the button reads
export const NEXT_STEP = {
    placed: { status: 'confirmed', label: 'Confirm order' },
    confirmed: { status: 'preparing', label: 'Start preparing' },
    preparing: { status: 'ready', label: 'Mark ready' },
    ready: { status: 'served', label: 'Mark served' },
    served: { status: 'completed', label: 'Complete order' },
};

export const ORDER_TYPE = {
    dine: { label: 'Dine-in', icon: MdOutlineTableRestaurant },
    parcel: { label: 'Takeaway', icon: HiOutlineShoppingBag },
    delivery: { label: 'Delivery', icon: HiOutlineTruck },
    quick: { label: 'Quick sale', icon: HiOutlineLightningBolt },
};

/**
 * Tabs on the orders page. Live tabs follow every open order whatever day it was
 * placed; history tabs use the chosen date range.
 */
export const ORDER_TABS = [
    { key: 'all', label: 'All orders', live: false, params: {} },
    { key: 'in_progress', label: 'In progress', live: true, params: { status: 'placed,confirmed,preparing' } },
    { key: 'ready', label: 'Ready', live: true, params: { status: 'ready' } },
    { key: 'served', label: 'Served', live: true, params: { status: 'served' } },
    { key: 'delayed', label: 'Delayed', live: true, params: { delayed: 1 } },
    { key: 'completed', label: 'Completed', live: false, params: { status: 'completed' } },
    { key: 'cancelled', label: 'Cancelled', live: false, params: { status: 'cancelled' } },
];

const day = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return d.toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
};

export const DATE_RANGES = [
    { key: 'today', label: 'Today', range: () => ({ from: day(0), to: day(0) }) },
    { key: 'yesterday', label: 'Yesterday', range: () => ({ from: day(1), to: day(1) }) },
    { key: '7d', label: 'Last 7 days', range: () => ({ from: day(6), to: day(0) }) },
    { key: '30d', label: 'Last 30 days', range: () => ({ from: day(29), to: day(0) }) },
];

export const isOpen = (order) => !['completed', 'cancelled'].includes(order.status);

export const minutesSince = (date, now = Date.now()) => Math.max(0, Math.floor((now - new Date(date).getTime()) / 60000));

export const isDelayed = (order, target, now) =>
    ['confirmed', 'preparing'].includes(order.status) && minutesSince(order.created_at, now) >= target;

export const formatMoney = (value) =>
    `৳${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const formatClock = (value) => new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function formatWhen(value) {
    const d = new Date(value);
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay ? formatClock(value) : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${formatClock(value)}`;
}

export function formatElapsed(minutes) {
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

// "ORD-20261011-3-0012" reads as "#0012" in a busy list
export const shortNumber = (orderNumber = '') => `#${String(orderNumber).split('-').pop()}`;
