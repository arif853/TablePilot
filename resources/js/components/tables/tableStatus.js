// Colours for each table status on the floor plan, stat cards and legend.
// Full class names are spelled out so Tailwind keeps them in the build.
export const TABLE_STATUS = {
    occupied: {
        label: 'Occupied',
        table: 'bg-brand-500',
        chair: 'bg-brand-200',
        dot: 'bg-brand-500',
        bar: 'bg-brand-500',
        icon: 'bg-brand-500 text-white',
        soft: 'bg-brand-50 text-brand-700 ring-brand-600/20',
    },
    available: {
        label: 'Available',
        table: 'bg-emerald-600',
        chair: 'bg-emerald-200',
        dot: 'bg-emerald-600',
        bar: 'bg-emerald-500',
        icon: 'bg-emerald-600 text-white',
        soft: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    },
    reserved: {
        label: 'Reserved',
        table: 'bg-violet-500',
        chair: 'bg-violet-200',
        dot: 'bg-violet-500',
        bar: 'bg-violet-500',
        icon: 'bg-violet-500 text-white',
        soft: 'bg-violet-50 text-violet-700 ring-violet-600/20',
    },
    inactive: {
        label: 'Out of service',
        table: 'bg-gray-400',
        chair: 'bg-gray-200',
        dot: 'bg-gray-400',
        bar: 'bg-gray-400',
        icon: 'bg-gray-500 text-white',
        soft: 'bg-gray-50 text-gray-600 ring-gray-500/20',
    },
};

export const STATUS_ORDER = ['occupied', 'available', 'reserved', 'inactive'];

export const formatMoney = (value) =>
    `৳${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
