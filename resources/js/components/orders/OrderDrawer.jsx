import React, { useEffect } from 'react';
import {
    HiOutlineX, HiOutlineCheck, HiOutlineDocumentText, HiOutlineCash, HiOutlineCreditCard, HiOutlineDeviceMobile,
    HiOutlineDesktopComputer, HiOutlineUser, HiOutlinePhone, HiOutlineAnnotation, HiOutlineCheckCircle, HiOutlineBan,
} from 'react-icons/hi';
import { ItemThumb } from '../kitchen/TicketCard';
import {
    DELAYED, NEXT_STEP, ORDER_STATUS, ORDER_TYPE, STATUS_FLOW, formatElapsed, formatMoney, formatWhen, isDelayed,
    isOpen, minutesSince, shortNumber,
} from './orderMeta';

const PAYMENT_METHOD = {
    cash: { label: 'Cash', icon: HiOutlineCash },
    card: { label: 'Card', icon: HiOutlineCreditCard },
    mobile_banking: { label: 'Mobile banking', icon: HiOutlineDeviceMobile },
    online: { label: 'Online', icon: HiOutlineCreditCard },
};

const PAYMENT_STATUS = {
    paid: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    pending: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    failed: 'bg-red-50 text-red-700 ring-red-600/20',
    refunded: 'bg-violet-50 text-violet-700 ring-violet-600/20',
};

function Stepper({ status }) {
    const current = STATUS_FLOW.indexOf(status);
    return (
        <ol className="flex items-start">
            {STATUS_FLOW.map((step, i) => {
                const meta = ORDER_STATUS[step];
                const Icon = meta.icon;
                const done = i < current;
                const active = i === current;
                return (
                    <li key={step} className="flex-1 flex flex-col items-center relative min-w-0">
                        {i > 0 && <span className={`absolute top-4 right-1/2 w-full h-0.5 -translate-y-1/2 ${i <= current ? 'bg-brand-400' : 'bg-gray-200'}`} />}
                        <span
                            className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center ring-4 ring-white
                                ${active ? 'bg-brand-500 text-white shadow-md shadow-brand-500/30' : done ? 'bg-brand-100 text-brand-600' : 'bg-gray-100 text-gray-400'}`}
                        >
                            {done ? <HiOutlineCheck className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                        </span>
                        <span className={`mt-1 text-[11px] font-medium text-center leading-tight ${active ? 'text-brand-700' : done ? 'text-gray-600' : 'text-gray-400'}`}>
                            {meta.label}
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}

function Row({ label, value, strong, tone = '' }) {
    return (
        <div className={`flex items-center justify-between ${strong ? 'text-base font-bold text-gray-900' : 'text-sm text-gray-600'} ${tone}`}>
            <span>{label}</span>
            <span className="tabular-nums">{value}</span>
        </div>
    );
}

/**
 * Slide-over with everything about one order: progress, items, bill, payment and the
 * actions staff take on it.
 */
export default function OrderDrawer({
    order, now, target, onClose, onAdvance, onCancel, onMarkPaid, onInvoice, busy = {},
}) {
    useEffect(() => {
        if (!order) return undefined;
        const onKey = (e) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [order, onClose]);

    if (!order) return null;

    const status = ORDER_STATUS[order.status] ?? ORDER_STATUS.placed;
    const late = isDelayed(order, target, now);
    const pill = late ? DELAYED : status;
    const type = ORDER_TYPE[order.type] ?? ORDER_TYPE.dine;
    const TypeIcon = type.icon;
    const next = NEXT_STEP[order.status];
    const payment = PAYMENT_METHOD[order.payment_method];
    const discount = parseFloat(order.discount || 0);
    const vat = parseFloat(order.vat_amount || order.tax || 0);
    const sd = parseFloat(order.sd_amount || 0);
    const canPay = order.payment_status !== 'paid' && order.status !== 'cancelled';

    return (
        <div className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-modal="true" aria-label={`Order ${order.order_number}`}>
            <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-[2px]" onClick={onClose} />
            <aside className="relative w-full max-w-md h-full bg-white shadow-2xl flex flex-col">
                {/* Header */}
                <div className="bg-gradient-to-br from-brand-500 to-brand-600 text-white px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-xs text-white/80 truncate">{order.order_number}</p>
                            <h3 className="text-2xl font-bold tracking-tight tabular-nums">{shortNumber(order.order_number)}</h3>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-brand-700">{pill.label}</span>
                            <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/15" aria-label="Close">
                                <HiOutlineX className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/90">
                        <span className="inline-flex items-center gap-1"><TypeIcon className="w-4 h-4" />{type.label}</span>
                        {order.table && <span>Table {order.table.table_number}{order.table.area ? ` · ${order.table.area}` : ''}</span>}
                        <span>{formatWhen(order.created_at)}</span>
                        {order.source === 'pos' && <span className="inline-flex items-center gap-1"><HiOutlineDesktopComputer className="w-4 h-4" />POS</span>}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {/* Progress */}
                    <div className="px-5 py-4 border-b border-gray-100">
                        {order.status === 'cancelled' ? (
                            <p className="flex items-center gap-2 text-sm font-medium text-red-700 bg-red-50 rounded-xl px-3 py-2">
                                <HiOutlineBan className="w-4 h-4" /> This order was cancelled.
                            </p>
                        ) : (
                            <Stepper status={order.status} />
                        )}
                        {isOpen(order) && (
                            <p className={`mt-3 text-xs text-center ${late ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                                Open for {formatElapsed(minutesSince(order.created_at, now))}
                                {late && ` · past the ${target} min kitchen target`}
                            </p>
                        )}
                    </div>

                    {/* Customer */}
                    {(order.customer_name || order.customer_phone || order.served_by) && (
                        <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600">
                            {order.customer_name && <span className="inline-flex items-center gap-1.5"><HiOutlineUser className="w-4 h-4 text-gray-400" />{order.customer_name}</span>}
                            {order.customer_phone && <span className="inline-flex items-center gap-1.5"><HiOutlinePhone className="w-4 h-4 text-gray-400" />{order.customer_phone}</span>}
                            {order.served_by?.name && <span className="text-gray-500">Served by <span className="font-medium text-gray-700">{order.served_by.name}</span></span>}
                        </div>
                    )}

                    {/* Items */}
                    <div className="px-5 py-4 border-b border-gray-100">
                        <h4 className="section-title mb-3">Items</h4>
                        <ul className="space-y-3">
                            {order.items?.map((item) => (
                                <li key={item.id} className="flex items-center gap-3">
                                    <ItemThumb item={item} size="w-11 h-11" placeholder />
                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium text-gray-900 leading-snug truncate">{item.menu_item?.name ?? 'Item'}</p>
                                        <p className="text-xs text-gray-500 tabular-nums">{item.qty} × {formatMoney(item.price_at_sale)}</p>
                                        {item.special_instructions && <p className="text-xs text-amber-700">• {item.special_instructions}</p>}
                                    </div>
                                    <span className="shrink-0 font-semibold text-gray-800 tabular-nums">{formatMoney(item.line_total)}</span>
                                </li>
                            ))}
                        </ul>
                        {order.notes && (
                            <p className="mt-4 flex gap-2 text-sm text-amber-900 bg-amber-50 ring-1 ring-amber-200 rounded-xl px-3 py-2">
                                <HiOutlineAnnotation className="w-4 h-4 mt-0.5 shrink-0" /> {order.notes}
                            </p>
                        )}
                    </div>

                    {/* Bill */}
                    <div className="px-5 py-4 border-b border-gray-100 space-y-1.5">
                        <Row label="Subtotal" value={formatMoney(order.subtotal)} />
                        {discount > 0 && <Row label={order.voucher?.code ? `Discount (${order.voucher.code})` : 'Discount'} value={`−${formatMoney(discount)}`} tone="text-emerald-700" />}
                        {vat > 0 && <Row label={`VAT (${Number(order.vat_rate ?? 0)}%)`} value={formatMoney(vat)} />}
                        {sd > 0 && <Row label={`SD (${Number(order.sd_rate ?? 0)}%)`} value={formatMoney(sd)} />}
                        <div className="pt-2 mt-1 border-t border-dashed border-gray-200">
                            <Row label="Total" value={formatMoney(order.grand_total)} strong />
                        </div>
                    </div>

                    {/* Payment */}
                    <div className="px-5 py-4">
                        <h4 className="section-title mb-3">Payment</h4>
                        <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 ring-1 ring-gray-200/70 p-3">
                            <div className="flex items-center gap-2 text-sm text-gray-700 min-w-0">
                                {payment ? <payment.icon className="w-5 h-5 text-brand-600 shrink-0" /> : <HiOutlineCash className="w-5 h-5 text-gray-400 shrink-0" />}
                                <span className="truncate">{payment ? `${payment.label}${order.payment_gateway ? ` (${order.payment_gateway})` : ''}` : 'Not chosen yet'}</span>
                            </div>
                            <span className={`badge capitalize ${PAYMENT_STATUS[order.payment_status] ?? 'bg-gray-100 text-gray-600 ring-gray-500/20'}`}>
                                {order.payment_status === 'paid' && <HiOutlineCheckCircle className="w-3 h-3" />}
                                {order.payment_status ?? 'unpaid'}
                            </span>
                        </div>
                        {order.paid_at && <p className="mt-2 text-xs text-emerald-700">Paid {formatWhen(order.paid_at)}</p>}
                        {order.transaction_id && <p className="mt-1 text-xs text-gray-500 break-all">TXN: {order.transaction_id}</p>}
                        <div className="mt-3 grid grid-cols-2 gap-2">
                            {canPay && (
                                <button type="button" onClick={() => onMarkPaid(order)} disabled={busy.paying} className="btn-success py-2">
                                    <HiOutlineCheckCircle className="w-4 h-4" /> {busy.paying ? 'Saving…' : 'Mark paid'}
                                </button>
                            )}
                            <button type="button" onClick={() => onInvoice(order)} disabled={busy.invoice} className={`btn-secondary py-2 ${canPay ? '' : 'col-span-2'}`}>
                                <HiOutlineDocumentText className="w-4 h-4" /> {busy.invoice ? 'Loading…' : 'Invoice'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                {isOpen(order) && (
                    <div className="p-4 border-t border-gray-100 flex gap-2">
                        {onCancel && (
                            <button type="button" onClick={() => onCancel(order)} disabled={busy.cancelling} className="btn-secondary text-red-600 hover:text-red-700 hover:border-red-300">
                                Cancel order
                            </button>
                        )}
                        {next && (
                            <button type="button" onClick={() => onAdvance(order, next.status)} disabled={busy.advancing} className="btn-primary flex-1 py-2.5">
                                <HiOutlineCheck className="w-5 h-5" /> {busy.advancing ? 'Updating…' : next.label}
                            </button>
                        )}
                    </div>
                )}
            </aside>
        </div>
    );
}
