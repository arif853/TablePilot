import React from 'react';
import { HiOutlineShoppingBag } from 'react-icons/hi';
import { MdOutlineTableRestaurant } from 'react-icons/md';
import { NEXT_ACTION, ORDER_TYPES, STATUS_PILL, ageTone, minutesSince, shortNumber, stationIcon } from './stations';

// The dish photo, or (when asked for) the station icon as a stand-in. Tickets skip the
// stand-in so a menu without photos doesn't fill the board with grey boxes.
export function ItemThumb({ item, size = 'w-10 h-10', placeholder = false }) {
    const src = item.menu_item?.image_url;
    if (src) return <img src={src} alt="" loading="lazy" className={`${size} shrink-0 rounded-lg object-cover bg-gray-100`} />;
    if (!placeholder) return null;
    const Icon = stationIcon(item.menu_item?.category?.name ?? '');
    return (
        <span className={`${size} shrink-0 rounded-lg bg-gray-100 text-gray-400 flex items-center justify-center`}>
            <Icon className="w-1/2 h-1/2" />
        </span>
    );
}

export function OrderWhere({ order, className = '' }) {
    const Icon = order.table ? MdOutlineTableRestaurant : HiOutlineShoppingBag;
    return (
        <span className={`inline-flex items-center gap-1 ${className}`}>
            <Icon className="w-3.5 h-3.5 shrink-0" />
            {order.table ? `Table ${order.table.table_number}` : ORDER_TYPES[order.type] ?? order.type}
        </span>
    );
}

/**
 * One order as a station sees it: only that station's items, the ticket age and a
 * one-tap next step. Tapping the card opens the full order.
 */
export default function TicketCard({ order, items, now, target, selected, onSelect, onAdvance, advancing, compact = false }) {
    const age = minutesSince(order.created_at, now);
    const pill = STATUS_PILL[order.status];
    const action = NEXT_ACTION[order.status];
    const isReady = order.status === 'ready';

    return (
        <article
            className={`rounded-xl bg-white border transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500
                ${selected ? 'border-brand-500 ring-2 ring-brand-500/20 shadow-md' : 'border-gray-200/80 hover:border-gray-300 hover:shadow-sm'}
                ${isReady ? 'opacity-80' : ''}`}
            onClick={() => onSelect(order)}
            onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(order); } }}
            role="button"
            tabIndex={0}
            aria-label={`Order ${shortNumber(order.order_number)}`}
        >
            <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className="font-bold text-gray-900 tabular-nums leading-tight">{shortNumber(order.order_number)}</p>
                        <OrderWhere order={order} className="mt-0.5 text-xs text-gray-500" />
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <span className={`badge tabular-nums ${isReady ? STATUS_PILL.ready.className : ageTone(age, target)}`}>
                            {age < 1 ? 'Now' : `${age} min`}
                        </span>
                        {pill && !isReady && <span className={`badge ${pill.className}`}>{pill.label}</span>}
                    </div>
                </div>

                <ul className={`mt-3 ${compact ? 'space-y-1.5' : 'space-y-2.5'}`}>
                    {items.map((item) => (
                        <li key={item.id} className="flex items-center gap-2.5">
                            {!compact && <ItemThumb item={item} />}
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-800 leading-snug truncate">{item.menu_item?.name ?? 'Item'}</p>
                                {item.special_instructions && (
                                    <p className="text-xs text-amber-700 truncate">• {item.special_instructions}</p>
                                )}
                            </div>
                            <span className="shrink-0 text-sm font-bold text-gray-700 tabular-nums">×{item.qty}</span>
                        </li>
                    ))}
                </ul>

                {order.notes && !compact && (
                    <p className="mt-2.5 text-xs text-amber-800 bg-amber-50 rounded-lg px-2 py-1 line-clamp-2">Note: {order.notes}</p>
                )}
            </div>

            {action && (
                <div className="px-3 pb-3">
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onAdvance(order); }}
                        disabled={advancing}
                        className={`w-full py-2 rounded-lg text-sm font-semibold transition active:scale-[0.98] disabled:opacity-60 ${action.className}`}
                    >
                        {advancing ? 'Updating…' : action.label}
                    </button>
                </div>
            )}
        </article>
    );
}
