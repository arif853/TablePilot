import React from 'react';
import { HiOutlineClock, HiOutlineCheck, HiOutlineAnnotation, HiOutlineX, HiOutlineCursorClick } from 'react-icons/hi';
import { GiChefToque, GiCookingPot, GiCheckMark } from 'react-icons/gi';
import { MdOutlineRoomService } from 'react-icons/md';
import { ItemThumb, OrderWhere } from './TicketCard';
import { NEXT_ACTION, ORDER_TYPES, STATUS_PILL, minutesSince, shortNumber, stationIcon } from './stations';

const STEPS = [
    { status: 'confirmed', label: 'New', icon: GiChefToque },
    { status: 'preparing', label: 'Cooking', icon: GiCookingPot },
    { status: 'ready', label: 'Ready', icon: GiCheckMark },
    { status: 'served', label: 'Served', icon: MdOutlineRoomService },
];

const formatTime = (value) => new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function Stepper({ status }) {
    const current = STEPS.findIndex((s) => s.status === status);
    return (
        <ol className="flex items-start">
            {STEPS.map((step, i) => {
                const done = i < current;
                const active = i === current;
                const Icon = step.icon;
                return (
                    <li key={step.status} className="flex-1 flex flex-col items-center relative">
                        {i > 0 && (
                            <span className={`absolute top-5 right-1/2 w-full h-0.5 -translate-y-1/2 ${i <= current ? 'bg-brand-400' : 'bg-gray-200'}`} />
                        )}
                        <span
                            className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center ring-4 ring-white transition
                                ${active ? 'bg-brand-500 text-white shadow-md shadow-brand-500/30' : done ? 'bg-brand-100 text-brand-600' : 'bg-gray-100 text-gray-400'}`}
                        >
                            {done ? <HiOutlineCheck className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                        </span>
                        <span className={`mt-1.5 text-xs font-medium ${active ? 'text-brand-700' : done ? 'text-gray-700' : 'text-gray-400'}`}>
                            {step.label}
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}

export default function OrderDetailPanel({ order, now, target, onAdvance, advancing, onClose }) {
    if (!order) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <span className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mb-4">
                    <HiOutlineCursorClick className="w-7 h-7" />
                </span>
                <p className="section-title">Select an order</p>
                <p className="page-subtitle max-w-[15rem]">Tap a ticket to see every item, notes and its progress.</p>
            </div>
        );
    }

    const age = minutesSince(order.created_at, now);
    const action = NEXT_ACTION[order.status];
    const pill = STATUS_PILL[order.status];
    const totalItems = order.items?.reduce((sum, item) => sum + item.qty, 0) ?? 0;
    const late = age >= target;
    const isReady = order.status === 'ready';
    const progress = Math.min(100, Math.round((age / target) * 100));

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="relative overflow-hidden bg-gradient-to-br from-brand-500 to-brand-600 text-white px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-xs font-medium text-white/80">Order</p>
                        <h3 className="text-2xl font-bold tracking-tight tabular-nums">{shortNumber(order.order_number)}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        {pill && <span className="rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-brand-700">{pill.label}</span>}
                        {onClose && (
                            <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/15" aria-label="Close">
                                <HiOutlineX className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/90">
                    <OrderWhere order={order} />
                    {order.table && <span>{ORDER_TYPES[order.type] ?? order.type}</span>}
                    <span className="inline-flex items-center gap-1"><HiOutlineClock className="w-3.5 h-3.5" />{age < 1 ? 'just now' : `${age} min ago`}</span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="px-5 py-5 border-b border-gray-100">
                    <Stepper status={order.status} />
                </div>

                {/* Items */}
                <div className="px-5 py-4 border-b border-gray-100">
                    <h4 className="section-title mb-3">Order items</h4>
                    <ul className="space-y-3">
                        {order.items?.map((item) => {
                            const station = item.menu_item?.category?.name;
                            const StationIcon = stationIcon(station ?? '');
                            return (
                                <li key={item.id} className="flex items-center gap-3">
                                    <ItemThumb item={item} size="w-12 h-12" placeholder />
                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium text-gray-900 leading-snug">{item.menu_item?.name ?? 'Item'}</p>
                                        {item.special_instructions && <p className="text-xs text-amber-700">• {item.special_instructions}</p>}
                                        {station && (
                                            <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-gray-400">
                                                <StationIcon className="w-3 h-3" /> {station}
                                            </p>
                                        )}
                                    </div>
                                    <span className="shrink-0 text-base font-bold text-gray-800 tabular-nums">×{item.qty}</span>
                                </li>
                            );
                        })}
                    </ul>
                    <div className="mt-4 pt-3 border-t border-dashed border-gray-200 flex items-center justify-between text-sm">
                        <span className="font-medium text-gray-600">Total items</span>
                        <span className="font-bold text-gray-900 tabular-nums">{totalItems}</span>
                    </div>
                </div>

                {/* Notes */}
                <div className="px-5 py-4 border-b border-gray-100">
                    <h4 className="section-title mb-2 flex items-center gap-2"><HiOutlineAnnotation className="w-4 h-4 text-gray-400" /> Special notes</h4>
                    {order.notes ? (
                        <p className="text-sm text-amber-900 bg-amber-50 ring-1 ring-amber-200 rounded-xl px-3 py-2 whitespace-pre-line">{order.notes}</p>
                    ) : (
                        <p className="text-sm text-gray-400">No special notes.</p>
                    )}
                </div>

                {/* Timing */}
                <div className="px-5 py-4">
                    <div className={`rounded-xl p-4 ring-1 ${isReady ? 'bg-emerald-50 ring-emerald-200' : late ? 'bg-red-50 ring-red-200' : 'bg-brand-50 ring-brand-200'}`}>
                        <div className="flex items-center gap-3">
                            <span className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-white ${isReady ? 'bg-emerald-500' : late ? 'bg-red-500' : 'bg-brand-500'}`}>
                                <HiOutlineClock className="w-6 h-6" />
                            </span>
                            <div className="min-w-0">
                                <p className={`text-sm font-medium ${isReady ? 'text-emerald-800' : late ? 'text-red-800' : 'text-brand-800'}`}>
                                    {isReady ? 'Waiting to be served' : late ? 'Past target time' : 'Ready within'}
                                </p>
                                <p className={`text-2xl font-bold tabular-nums ${isReady ? 'text-emerald-700' : late ? 'text-red-700' : 'text-brand-700'}`}>
                                    {isReady ? `${minutesSince(order.ready_at ?? order.updated_at, now)} min` : late ? `+${age - target} min` : `${target - age} min`}
                                </p>
                                <p className="text-xs text-gray-500">Placed {formatTime(order.created_at)} · target {target} min</p>
                            </div>
                        </div>
                        {!isReady && (
                            <div className="mt-3 h-1.5 rounded-full bg-white overflow-hidden">
                                <div className={`h-full rounded-full ${late ? 'bg-red-500' : 'bg-brand-500'}`} style={{ width: `${progress}%` }} />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {action && (
                <div className="p-4 border-t border-gray-100 bg-white">
                    <button
                        type="button"
                        onClick={() => onAdvance(order)}
                        disabled={advancing}
                        className={`w-full py-3 rounded-xl font-semibold shadow-sm transition active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2 ${action.className}`}
                    >
                        <HiOutlineCheck className="w-5 h-5" /> {advancing ? 'Updating…' : action.label}
                    </button>
                </div>
            )}
        </div>
    );
}
