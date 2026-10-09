import React from 'react';

// [badge colours, dot colour]
const tones = {
    yellow: ['bg-amber-50 text-amber-800 ring-amber-600/20', 'bg-amber-500'],
    blue: ['bg-sky-50 text-sky-700 ring-sky-600/20', 'bg-sky-500'],
    orange: ['bg-orange-50 text-orange-700 ring-orange-600/20', 'bg-orange-500'],
    green: ['bg-emerald-50 text-emerald-700 ring-emerald-600/20', 'bg-emerald-500'],
    purple: ['bg-violet-50 text-violet-700 ring-violet-600/20', 'bg-violet-500'],
    red: ['bg-red-50 text-red-700 ring-red-600/20', 'bg-red-500'],
    gray: ['bg-gray-50 text-gray-600 ring-gray-500/20', 'bg-gray-400'],
};

const statusTones = {
    placed: 'yellow',
    confirmed: 'blue',
    preparing: 'orange',
    ready: 'green',
    served: 'purple',
    completed: 'gray',
    cancelled: 'red',
    active: 'green',
    grace: 'yellow',
    expired: 'red',
    pending: 'yellow',
    submitted: 'yellow',
    verified: 'blue',
    approved: 'green',
    rejected: 'red',
    available: 'green',
    occupied: 'red',
    reserved: 'blue',
    inactive: 'gray',
};

export default function StatusBadge({ status }) {
    const [colorClass, dotClass] = tones[statusTones[status] || 'gray'];

    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium capitalize ring-1 ring-inset whitespace-nowrap ${colorClass}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
            {status?.replace(/_/g, ' ')}
        </span>
    );
}
