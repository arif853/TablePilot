import React from 'react';
import { HiOutlineClock } from 'react-icons/hi';
import { TABLE_STATUS } from './tableStatus';
import { seatLayout, tableWidth } from './floorLayout';

function Chairs({ count, className, chairClass, vertical = false }) {
    if (!count) return null;
    return (
        <div className={`absolute flex justify-center items-center gap-1.5 ${vertical ? 'flex-col' : ''} ${className}`}>
            {Array.from({ length: count }).map((_, i) => (
                <span key={i} className={`block rounded-md ${vertical ? 'w-2.5 h-5' : 'w-5 h-2.5'} ${chairClass}`} />
            ))}
        </div>
    );
}

export function formatElapsed(since, now = Date.now()) {
    if (!since) return null;
    const mins = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60000));
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// One table on the floor plan. Extra props (style, pointer handlers) go to the button
// so the floor plan can position and drag it.
export default function FloorTable({ table, selected, dimmed, editing, dragging, now, className = '', ...props }) {
    const tone = TABLE_STATUS[table.status] ?? TABLE_STATUS.inactive;
    const seats = seatLayout(table.capacity);
    const hasOrders = table.active_orders_count > 0;
    const elapsed = hasOrders ? formatElapsed(table.active_orders_min_created_at, now) : null;

    return (
        <button
            type="button"
            aria-pressed={selected}
            aria-label={`Table ${table.table_number}, ${tone.label}, ${table.capacity} seats`}
            className={`group flex flex-col items-center justify-center rounded-2xl p-2 transition-[opacity,box-shadow,background-color]
                focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500
                ${editing ? 'cursor-grab touch-none select-none outline-dashed outline-1 outline-gray-300 bg-white/50' : ''}
                ${dragging ? 'z-20 cursor-grabbing shadow-xl bg-white ring-2 ring-brand-400' : ''}
                ${selected && !dragging ? 'z-10 bg-white/80 ring-2 ring-brand-500 shadow-lg shadow-brand-500/10' : ''}
                ${!editing && !selected ? 'hover:bg-white/60' : ''}
                ${dimmed ? 'opacity-25' : ''} ${className}`}
            {...props}
        >
            <div className="relative p-3.5 pointer-events-none">
                <Chairs count={seats.top} chairClass={tone.chair} className="top-0 inset-x-0" />
                <Chairs count={seats.bottom} chairClass={tone.chair} className="bottom-0 inset-x-0" />
                <Chairs count={seats.left} chairClass={tone.chair} vertical className="left-0 inset-y-0" />
                <Chairs count={seats.right} chairClass={tone.chair} vertical className="right-0 inset-y-0" />

                <div
                    className={`relative flex items-center justify-center rounded-xl text-white font-bold shadow-sm transition-transform
                        ${editing ? '' : 'group-hover:scale-[1.04]'} ${tone.table} ${selected ? 'scale-[1.04]' : ''}`}
                    style={{ width: tableWidth(table.capacity), height: 56 }}
                >
                    <span className="text-lg leading-none tabular-nums truncate px-1">{table.table_number}</span>
                    {hasOrders && (
                        <span className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1 rounded-full bg-white text-[11px] font-bold text-gray-800 ring-1 ring-gray-200 shadow flex items-center justify-center">
                            {table.active_orders_count}
                        </span>
                    )}
                </div>
            </div>

            <div className="h-4 mt-0.5 text-[11px] font-medium text-gray-500 tabular-nums pointer-events-none">
                {elapsed ? (
                    <span className="inline-flex items-center gap-0.5 text-brand-700"><HiOutlineClock className="w-3 h-3" />{elapsed}</span>
                ) : (
                    <span>{table.capacity} seats</span>
                )}
            </div>
        </button>
    );
}
