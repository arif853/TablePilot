import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    HiOutlineUsers, HiOutlineClock, HiOutlineUser, HiOutlineQrcode, HiOutlineSwitchHorizontal,
    HiOutlinePencil, HiOutlineTrash, HiOutlineCheckCircle, HiOutlineBookmark, HiOutlineBan,
    HiOutlinePlus, HiOutlineClipboardList, HiOutlineCursorClick,
} from 'react-icons/hi';
import { MdOutlineTableRestaurant } from 'react-icons/md';
import { tableAPI } from '../../services/api';
import StatusBadge from '../ui/StatusBadge';
import { TABLE_STATUS, formatMoney } from './tableStatus';
import { formatElapsed } from './FloorTable';
import { areaOf } from './floorLayout';

const ORDER_STEPS = ['placed', 'confirmed', 'preparing', 'ready', 'served'];

const formatTime = (value) =>
    value ? new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—';

function OrderProgress({ status }) {
    const current = ORDER_STEPS.indexOf(status);
    return (
        <div className="flex items-center gap-1" aria-label={`Order status: ${status}`}>
            {ORDER_STEPS.map((step, i) => (
                <span
                    key={step}
                    title={step}
                    className={`h-1.5 flex-1 rounded-full ${i <= current ? 'bg-brand-500' : 'bg-gray-200'}`}
                />
            ))}
        </div>
    );
}

function QuickAction({ icon: Icon, label, onClick, tone = 'default', disabled }) {
    const tones = {
        default: 'text-brand-600 bg-brand-50',
        danger: 'text-red-600 bg-red-50',
    };
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-200 bg-white text-left text-sm font-medium text-gray-700
                hover:border-gray-300 hover:shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none"
        >
            <span className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center ${tones[tone]}`}>
                <Icon className="w-4 h-4" />
            </span>
            <span className="truncate">{label}</span>
        </button>
    );
}

export default function TableDetailPanel({
    table, isAdmin, canUsePos, now,
    onStartOrder, onViewOrders, onMove, onShowQr, onEdit, onDelete, onSetStatus, statusPending,
}) {
    const { data: detail, isLoading } = useQuery({
        queryKey: ['table', table?.id],
        queryFn: () => tableAPI.show(table.id).then((r) => r.data.data),
        enabled: !!table,
        refetchInterval: 30000,
    });

    if (!table) {
        return (
            <div className="card flex flex-col items-center justify-center text-center py-16">
                <span className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mb-4">
                    <HiOutlineCursorClick className="w-7 h-7" />
                </span>
                <p className="section-title">Select a table</p>
                <p className="page-subtitle max-w-[16rem]">Tap any table on the floor plan to see its guests, running order and actions.</p>
            </div>
        );
    }

    const tone = TABLE_STATUS[table.status] ?? TABLE_STATUS.inactive;
    const orders = detail?.active_orders ?? [];
    const hasOrders = table.active_orders_count > 0;
    const total = orders.reduce((sum, o) => sum + Number(o.grand_total || 0), 0);
    const waiter = orders.find((o) => o.served_by)?.served_by?.name;
    const since = table.active_orders_min_created_at;

    return (
        <div className="card p-0 sm:p-0 overflow-hidden">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-gray-100">
                <div className="flex items-center gap-3">
                    <span className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center ${tone.icon}`}>
                        <MdOutlineTableRestaurant className="w-6 h-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-bold tracking-tight text-gray-900 truncate">Table {table.table_number}</h3>
                        <div className="flex items-center gap-2 min-w-0">
                            <span className={`badge ${tone.soft}`}>{tone.label}</span>
                            <span className="text-xs text-gray-500 truncate">{areaOf(table)}</span>
                        </div>
                    </div>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-y-2 gap-x-3 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                        <HiOutlineUsers className="w-4 h-4 text-gray-400" />
                        <dt className="sr-only">Capacity</dt>
                        <dd>{table.capacity} seats</dd>
                    </div>
                    {since && (
                        <div className="flex items-center gap-2">
                            <HiOutlineClock className="w-4 h-4 text-gray-400" />
                            <dt className="sr-only">Seated since</dt>
                            <dd>Since {formatTime(since)} <span className="text-gray-400">({formatElapsed(since, now)})</span></dd>
                        </div>
                    )}
                    {waiter && (
                        <div className="flex items-center gap-2 col-span-2">
                            <HiOutlineUser className="w-4 h-4 text-gray-400" />
                            <dt className="sr-only">Served by</dt>
                            <dd>Served by <span className="font-medium text-gray-800">{waiter}</span></dd>
                        </div>
                    )}
                </dl>

                <div className="mt-4 grid grid-cols-2 gap-2">
                    {canUsePos && table.status !== 'inactive' && (
                        <button type="button" onClick={onStartOrder} className="btn-primary">
                            <HiOutlinePlus className="w-4 h-4" /> {hasOrders ? 'Add order' : 'Start order'}
                        </button>
                    )}
                    <button type="button" onClick={onViewOrders} className={`btn-secondary ${canUsePos && table.status !== 'inactive' ? '' : 'col-span-2'}`}>
                        <HiOutlineClipboardList className="w-4 h-4" /> View orders
                    </button>
                </div>
            </div>

            {/* Running orders */}
            <div className="p-4 sm:p-5 border-b border-gray-100">
                <div className="flex items-center justify-between mb-3">
                    <h4 className="section-title">Running orders</h4>
                    {hasOrders && <span className="text-xs text-gray-500">{table.active_orders_count} active</span>}
                </div>

                {isLoading ? (
                    <div className="space-y-2">
                        {[0, 1, 2].map((i) => <div key={i} className="h-8 rounded-lg bg-gray-100 animate-pulse" />)}
                    </div>
                ) : orders.length === 0 ? (
                    <p className="text-sm text-gray-500 py-4 text-center rounded-xl bg-gray-50">No running orders on this table.</p>
                ) : (
                    <div className="space-y-4">
                        {orders.map((order) => (
                            <div key={order.id} className="rounded-xl ring-1 ring-gray-100 p-3">
                                <div className="flex items-center justify-between gap-2 mb-2">
                                    <span className="text-xs font-semibold text-gray-500">#{order.order_number}</span>
                                    <StatusBadge status={order.status} />
                                </div>
                                <OrderProgress status={order.status} />
                                <ul className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
                                    {order.items?.map((item) => (
                                        <li key={item.id} className="flex items-center gap-2 text-sm">
                                            <span className="flex-1 min-w-0 truncate text-gray-800">{item.menu_item?.name ?? 'Item'}</span>
                                            <span className="text-xs text-gray-400 tabular-nums">×{item.qty}</span>
                                            <span className="w-20 text-right tabular-nums text-gray-700">{formatMoney(item.line_total)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                        <div className="flex items-center justify-between pt-1">
                            <span className="text-sm font-semibold text-gray-700">Total</span>
                            <span className="text-lg font-bold text-gray-900 tabular-nums">{formatMoney(total)}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Quick actions */}
            <div className="p-4 sm:p-5">
                <h4 className="section-title mb-3">Quick actions</h4>
                <div className="grid grid-cols-2 gap-2">
                    <QuickAction icon={HiOutlineSwitchHorizontal} label="Move table" onClick={onMove} disabled={!hasOrders} />
                    <QuickAction icon={HiOutlineQrcode} label="QR code" onClick={onShowQr} />
                    {isAdmin && (
                        <>
                            {table.status !== 'available' && (
                                <QuickAction icon={HiOutlineCheckCircle} label="Mark available" onClick={() => onSetStatus('available')} disabled={statusPending || hasOrders} />
                            )}
                            {table.status !== 'reserved' && (
                                <QuickAction icon={HiOutlineBookmark} label="Reserve" onClick={() => onSetStatus('reserved')} disabled={statusPending || hasOrders} />
                            )}
                            {table.status !== 'inactive' && (
                                <QuickAction icon={HiOutlineBan} label="Out of service" onClick={() => onSetStatus('inactive')} disabled={statusPending || hasOrders} />
                            )}
                            <QuickAction icon={HiOutlinePencil} label="Edit table" onClick={onEdit} />
                            <QuickAction icon={HiOutlineTrash} label="Delete" tone="danger" onClick={onDelete} disabled={hasOrders} />
                        </>
                    )}
                </div>
                {isAdmin && hasOrders && (
                    <p className="mt-3 text-xs text-gray-500">Status changes and delete unlock once this table's orders are completed.</p>
                )}
            </div>
        </div>
    );
}
