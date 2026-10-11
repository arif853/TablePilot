import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { orderAPI, tableAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { useModule } from '../../hooks/useModule';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Pagination from '../../components/ui/Pagination';
import POSInvoice from '../../components/POSInvoice';
import OrderDrawer from '../../components/orders/OrderDrawer';
import FloorPlan from '../../components/tables/FloorPlan';
import { ItemThumb } from '../../components/kitchen/TicketCard';
import { TABLE_STATUS, STATUS_ORDER } from '../../components/tables/tableStatus';
import { areaOf, resolvePositions } from '../../components/tables/floorLayout';
import {
    DATE_RANGES, DELAYED, NEXT_STEP, ORDER_STATUS, ORDER_TABS, ORDER_TYPE, formatElapsed, formatMoney, formatWhen,
    formatClock, isDelayed, isOpen, minutesSince, shortNumber,
} from '../../components/orders/orderMeta';
import {
    HiOutlineSearch, HiOutlineDotsVertical, HiOutlineEye, HiOutlineCheck, HiOutlineCheckCircle, HiOutlineDocumentText,
    HiOutlineBan, HiOutlinePlus, HiOutlineExclamation, HiOutlineArrowRight, HiOutlineChartBar, HiOutlineX,
    HiOutlineLocationMarker, HiOutlineDesktopComputer,
} from 'react-icons/hi';
import { MdOutlineTableRestaurant } from 'react-icons/md';
import { GiChefToque } from 'react-icons/gi';
import toast from 'react-hot-toast';

const PER_PAGE = 15;

function useDebounced(value, delay = 300) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const id = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(id);
    }, [value, delay]);
    return debounced;
}

function StatusPill({ order, target, now }) {
    const meta = isDelayed(order, target, now) ? DELAYED : (ORDER_STATUS[order.status] ?? ORDER_STATUS.placed);
    const Icon = meta.icon;
    return (
        <span className={`badge whitespace-nowrap ${meta.pill}`}>
            <Icon className="w-3.5 h-3.5" /> {meta.label}
        </span>
    );
}

function OrderBadge({ order }) {
    const type = ORDER_TYPE[order.type] ?? ORDER_TYPE.dine;
    const Icon = type.icon;
    return (
        <div className="flex items-center gap-3 min-w-0">
            <span className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${order.status === 'cancelled' ? 'bg-gray-100 text-gray-400' : 'bg-brand-500 text-white shadow-sm shadow-brand-500/30'}`}>
                <Icon className="w-5 h-5" />
            </span>
            <div className="min-w-0">
                <p className="font-bold text-gray-900 tabular-nums leading-tight flex items-center gap-1">
                    {shortNumber(order.order_number)}
                    {order.source === 'pos' && <HiOutlineDesktopComputer className="w-3.5 h-3.5 text-indigo-500" title="POS order" />}
                </p>
                <p className="text-xs text-gray-500">{type.label}</p>
            </div>
        </div>
    );
}

function WhereCell({ order }) {
    return order.table ? (
        <div className="min-w-0">
            <p className="font-semibold text-gray-800 inline-flex items-center gap-1"><MdOutlineTableRestaurant className="w-4 h-4 text-brand-500" />{order.table.table_number}</p>
            <p className="text-xs text-gray-500 truncate">{order.table.area ?? order.customer_name ?? ''}</p>
        </div>
    ) : (
        <div className="min-w-0">
            <p className="font-medium text-gray-800 truncate">{order.customer_name || 'Walk-in'}</p>
            <p className="text-xs text-gray-500 truncate">{order.customer_phone || (order.source === 'customer' ? 'Online' : 'Counter')}</p>
        </div>
    );
}

function ItemsCell({ order }) {
    const items = order.items ?? [];
    const extra = items.length - 2;
    return (
        <div className="flex items-center gap-3 min-w-0">
            {items[0] && <ItemThumb item={items[0]} size="w-10 h-10" placeholder />}
            <div className="min-w-0 text-sm">
                {items.slice(0, 2).map((item, i) => (
                    <p key={item.id} className={`truncate ${i === 0 ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>
                        {item.menu_item?.name ?? 'Item'} <span className="text-gray-400">×{item.qty}</span>
                    </p>
                ))}
                {extra > 0 && <p className="text-xs text-brand-700">+{extra} more</p>}
            </div>
        </div>
    );
}

function TimeCell({ order, now, target }) {
    if (!isOpen(order)) {
        return <p className="text-sm text-gray-600 whitespace-nowrap">{formatWhen(order.created_at)}</p>;
    }
    const age = minutesSince(order.created_at, now);
    return (
        <div className="whitespace-nowrap">
            <p className={`font-semibold tabular-nums ${isDelayed(order, target, now) ? 'text-red-600' : 'text-gray-800'}`}>{formatElapsed(age)}</p>
            <p className="text-xs text-gray-500">Since {formatClock(order.created_at)}</p>
        </div>
    );
}

function PayCell({ order }) {
    const paid = order.payment_status === 'paid';
    return (
        <div className="text-right whitespace-nowrap">
            <p className="font-bold text-gray-900 tabular-nums">{formatMoney(order.grand_total)}</p>
            <p className={`text-xs font-medium ${paid ? 'text-emerald-600' : order.status === 'cancelled' ? 'text-gray-400' : 'text-amber-600'}`}>
                {paid ? 'Paid' : order.status === 'cancelled' ? '—' : 'Unpaid'}
            </p>
        </div>
    );
}

// Row menu, positioned against the viewport so the table's scroll box can't clip it
function RowMenu({ order, onView, onAdvance, onMarkPaid, onInvoice, onCancel }) {
    const [pos, setPos] = useState(null);
    const btnRef = useRef(null);
    const next = NEXT_STEP[order.status];

    useEffect(() => {
        if (!pos) return undefined;
        const close = () => setPos(null);
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        return () => {
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
        };
    }, [pos]);

    const open = (e) => {
        e.stopPropagation();
        const r = btnRef.current.getBoundingClientRect();
        const below = window.innerHeight - r.bottom > 240;
        setPos({ right: window.innerWidth - r.right, ...(below ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }) });
    };

    const item = (Icon, label, onClick, className = 'text-gray-700') => (
        <button
            type="button"
            role="menuitem"
            onClick={(e) => { e.stopPropagation(); setPos(null); onClick(order); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-gray-50 ${className}`}
        >
            <Icon className="w-4 h-4" /> {label}
        </button>
    );

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                onClick={open}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                aria-label={`Actions for order ${shortNumber(order.order_number)}`}
                aria-haspopup="menu"
                aria-expanded={!!pos}
            >
                <HiOutlineDotsVertical className="w-5 h-5" />
            </button>
            {pos && (
                <>
                    <div className="fixed inset-0 z-[70]" onClick={(e) => { e.stopPropagation(); setPos(null); }} />
                    <div role="menu" className="fixed z-[80] w-52 py-1 rounded-xl bg-white shadow-lg ring-1 ring-gray-200" style={pos}>
                        {item(HiOutlineEye, 'View details', onView)}
                        {next && item(HiOutlineCheck, next.label, (o) => onAdvance(o, next.status), 'text-brand-700 font-medium')}
                        {order.payment_status !== 'paid' && order.status !== 'cancelled' && item(HiOutlineCheckCircle, 'Mark paid', onMarkPaid)}
                        {item(HiOutlineDocumentText, 'Invoice', onInvoice)}
                        {isOpen(order) && (
                            <div className="border-t border-gray-100 mt-1 pt-1">{item(HiOutlineBan, 'Cancel order', onCancel, 'text-red-600')}</div>
                        )}
                    </div>
                </>
            )}
        </>
    );
}

function FloorCard({ tables, area, areas, onArea, selectedTableId, onTable }) {
    const shownArea = area || areas[0];
    const areaTables = useMemo(() => tables.filter((t) => areaOf(t) === shownArea), [tables, shownArea]);
    const positions = useMemo(() => resolvePositions(areaTables), [areaTables]);
    const busy = tables.filter((t) => t.status === 'occupied').length;

    return (
        <div className="card p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="section-title">Restaurant floor</h3>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {busy}/{tables.length} seated
                </span>
            </div>
            {areas.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] mb-3">
                    {areas.map((a) => (
                        <button
                            key={a}
                            type="button"
                            onClick={() => onArea(a)}
                            className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium transition ${a === shownArea ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                            {a}
                        </button>
                    ))}
                </div>
            )}
            {areaTables.length ? (
                <FloorPlan
                    tables={areaTables}
                    positions={positions}
                    minScale={0.2}
                    selectedId={selectedTableId}
                    now={Date.now()}
                    onSelect={onTable}
                />
            ) : (
                <p className="py-10 text-center text-sm text-gray-400">No tables in this area.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-600">
                {STATUS_ORDER.map((s) => (
                    <span key={s} className="inline-flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${TABLE_STATUS[s].dot}`} /> {TABLE_STATUS[s].label}
                    </span>
                ))}
            </div>
            <p className="mt-2 text-[11px] text-gray-400">Tap a table to see only its orders.</p>
        </div>
    );
}

export default function OrdersPage() {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const isAdmin = user?.role === 'restaurant_admin';
    const hasPos = useModule('pos');
    const hasKitchen = useModule('kitchen_display');
    const hasReports = useModule('reports_analytics');

    const [tab, setTab] = useState('all');
    const [rangeKey, setRangeKey] = useState('today');
    const [area, setArea] = useState('');
    const [tableFilter, setTableFilter] = useState(null); // { id, table_number }
    const [searchInput, setSearchInput] = useState('');
    const search = useDebounced(searchInput.trim());
    const [page, setPage] = useState(1);
    const [drawerId, setDrawerId] = useState(null);
    const [drawerSeed, setDrawerSeed] = useState(null);
    const [invoiceData, setInvoiceData] = useState(null);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 30000);
        return () => clearInterval(id);
    }, []);

    // Any filter change starts again from the first page
    useEffect(() => setPage(1), [tab, rangeKey, area, tableFilter, search]);

    const activeTab = ORDER_TABS.find((t) => t.key === tab);
    const range = DATE_RANGES.find((r) => r.key === rangeKey).range();

    const listParams = {
        ...activeTab.params,
        ...(activeTab.live ? {} : range),
        area: area || undefined,
        table_id: tableFilter?.id,
        search: search || undefined,
        page,
        per_page: PER_PAGE,
    };

    const { data: list, isLoading, isFetching } = useQuery({
        queryKey: ['orders', listParams],
        queryFn: () => orderAPI.list(listParams).then((r) => r.data),
        placeholderData: keepPreviousData,
        refetchInterval: 10000,
    });

    const { data: summary } = useQuery({
        queryKey: ['orders-summary', range.from, range.to, area],
        queryFn: () => orderAPI.summary({ ...range, area: area || undefined }).then((r) => r.data.data),
        refetchInterval: 15000,
    });

    const { data: tables = [] } = useQuery({
        queryKey: ['tables'],
        queryFn: () => tableAPI.list().then((r) => r.data.data),
        refetchInterval: 30000,
    });

    const { data: drawerOrder } = useQuery({
        queryKey: ['order', drawerId],
        queryFn: () => orderAPI.show(drawerId).then((r) => r.data.data),
        enabled: !!drawerId,
        initialData: drawerSeed?.id === drawerId ? drawerSeed : undefined,
        refetchInterval: 10000,
    });

    const areas = useMemo(
        () => [...new Set(tables.map(areaOf))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
        [tables],
    );

    const refresh = (id) => {
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        queryClient.invalidateQueries({ queryKey: ['orders-summary'] });
        queryClient.invalidateQueries({ queryKey: ['tables'] });
        if (id) queryClient.invalidateQueries({ queryKey: ['order', id] });
    };

    const advanceMutation = useMutation({
        mutationFn: ({ order, status }) => orderAPI.updateStatus(order.id, status),
        onSuccess: (_, { order, status }) => {
            refresh(order.id);
            toast.success(`${shortNumber(order.order_number)} → ${ORDER_STATUS[status].label}`);
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Could not update the order'),
    });

    const cancelMutation = useMutation({
        mutationFn: (order) => orderAPI.cancel(order.id),
        onSuccess: (_, order) => {
            refresh(order.id);
            toast.success(`${shortNumber(order.order_number)} cancelled`);
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Could not cancel the order'),
    });

    const markPaidMutation = useMutation({
        mutationFn: (order) => orderAPI.markPaid(order.id),
        onSuccess: (_, order) => {
            refresh(order.id);
            toast.success('Payment marked as paid');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Could not mark as paid'),
    });

    const [invoiceLoading, setInvoiceLoading] = useState(false);
    const openInvoice = async (order) => {
        setInvoiceLoading(true);
        try {
            const res = await orderAPI.invoice(order.order_number);
            setInvoiceData(res.data?.data || res.data);
        } catch {
            toast.error('Failed to load invoice');
        } finally {
            setInvoiceLoading(false);
        }
    };

    const openOrder = (order) => {
        setDrawerSeed(order);
        setDrawerId(order.id);
    };

    const actions = {
        onView: openOrder,
        onAdvance: (order, status) => advanceMutation.mutate({ order, status }),
        onMarkPaid: (order) => markPaidMutation.mutate(order),
        onInvoice: openInvoice,
        onCancel: (order) => {
            if (confirm(`Cancel order ${shortNumber(order.order_number)}? This frees its table and voucher.`)) cancelMutation.mutate(order);
        },
    };

    if (isLoading && !list) return <LoadingSpinner />;

    const orders = list?.data ?? [];
    const counts = summary?.counts ?? {};
    const target = summary?.target_minutes ?? 20;
    const delayedCount = counts.delayed ?? 0;
    const rangeLabel = DATE_RANGES.find((r) => r.key === rangeKey).label;

    const delayAlert = delayedCount > 0 && (
        <div className="rounded-2xl bg-red-50 ring-1 ring-red-200 p-4 flex gap-3">
            <span className="w-10 h-10 shrink-0 rounded-full bg-red-500 text-white flex items-center justify-center">
                <HiOutlineExclamation className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="font-semibold text-red-800">Kitchen delay</p>
                <p className="text-sm text-red-700">
                    {delayedCount} {delayedCount === 1 ? 'order has' : 'orders have'} passed the {target} min preparation target.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => setTab('delayed')} className="btn-danger px-3 py-1.5">Show delayed</button>
                    {isAdmin && hasKitchen && (
                        <Link to="/kitchen" className="btn-secondary px-3 py-1.5">Open kitchen <HiOutlineArrowRight className="w-4 h-4" /></Link>
                    )}
                </div>
            </div>
        </div>
    );

    const quickActions = [
        hasPos && { label: 'New order', icon: HiOutlinePlus, to: '/dashboard/pos' },
        { label: 'View tables', icon: MdOutlineTableRestaurant, to: '/dashboard/tables' },
        isAdmin && hasKitchen && { label: 'Kitchen view', icon: GiChefToque, to: '/kitchen' },
        isAdmin && hasReports && { label: 'Reports', icon: HiOutlineChartBar, to: '/dashboard/reports' },
    ].filter(Boolean);

    return (
        <div>
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-5">
                <div>
                    <h2 className="page-title">Orders</h2>
                    <p className="page-subtitle">
                        Track and manage every order in real time
                        {summary && <> · <span className="font-medium text-gray-700">{rangeLabel}: {counts.all} orders, {formatMoney(summary.sales)}</span></>}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[12rem] lg:w-64 lg:flex-none">
                        <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder="Order #, customer, table…"
                            className="input pl-9"
                            aria-label="Search orders"
                        />
                    </div>
                    <select
                        value={rangeKey}
                        onChange={(e) => setRangeKey(e.target.value)}
                        disabled={activeTab.live}
                        title={activeTab.live ? 'This tab shows every open order, whatever day it was placed' : undefined}
                        className="input w-auto disabled:opacity-60"
                        aria-label="Date range"
                    >
                        {DATE_RANGES.map((r) => <option key={r.key} value={r.key}>{activeTab.live ? 'All open' : r.label}</option>)}
                    </select>
                    {areas.length > 1 && (
                        <div className="relative">
                            <HiOutlineLocationMarker className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                            <select value={area} onChange={(e) => { setArea(e.target.value); setTableFilter(null); }} className="input pl-9 pr-8 w-auto" aria-label="Floor area">
                                <option value="">All areas</option>
                                {areas.map((a) => <option key={a} value={a}>{a}</option>)}
                            </select>
                        </div>
                    )}
                    {hasPos && (
                        <button type="button" onClick={() => navigate('/dashboard/pos')} className="btn-primary">
                            <HiOutlinePlus className="w-4 h-4" /> New order
                        </button>
                    )}
                </div>
            </div>

            <div className="2xl:hidden mb-5">{delayAlert}</div>

            <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
                <div className="min-w-0 space-y-4">
                    {/* Tabs */}
                    <div className="card p-2">
                        <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden flex-1 min-w-0" role="tablist">
                            {ORDER_TABS.map((t) => {
                                const active = t.key === tab;
                                const count = counts[t.key];
                                return (
                                    <button
                                        key={t.key}
                                        type="button"
                                        role="tab"
                                        aria-selected={active}
                                        onClick={() => setTab(t.key)}
                                        className={`shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition
                                            ${active ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/30' : t.key === 'delayed' && count ? 'text-red-600 hover:bg-red-50' : 'text-gray-600 hover:bg-gray-100'}`}
                                    >
                                        {t.label}
                                        {count != null && (
                                            <span className={`min-w-[1.5rem] h-5 px-1.5 rounded-full text-xs font-bold flex items-center justify-center tabular-nums
                                                ${active ? 'bg-white/25 text-white' : t.key === 'delayed' && count ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}
                                            >
                                                {count}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {tableFilter && (
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-gray-500">Showing orders for</span>
                            <button type="button" onClick={() => setTableFilter(null)} className="badge bg-brand-50 text-brand-700 ring-brand-600/20">
                                Table {tableFilter.table_number} <HiOutlineX className="w-3 h-3" />
                            </button>
                        </div>
                    )}

                    {/* Orders */}
                    <div className={`card p-0 sm:p-0 overflow-hidden transition-opacity ${isFetching && !isLoading ? 'opacity-90' : ''}`}>
                        {orders.length === 0 ? (
                            <div className="text-center py-16 px-4">
                                <div className="w-12 h-12 mx-auto rounded-full bg-gray-100 flex items-center justify-center">
                                    <HiOutlineDocumentText className="w-6 h-6 text-gray-400" />
                                </div>
                                <p className="mt-3 text-sm font-semibold text-gray-700">No orders here</p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    {search ? `Nothing matches “${search}”.` : activeTab.live ? 'Nothing open in this group right now.' : `No orders for ${rangeLabel.toLowerCase()}.`}
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* Wide screens: table */}
                                <div className="hidden lg:block overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100">
                                                <th className="px-5 py-3">Order</th>
                                                <th className="px-3 py-3">Table</th>
                                                <th className="px-3 py-3">Items</th>
                                                <th className="px-3 py-3">Status</th>
                                                <th className="px-3 py-3">Time</th>
                                                <th className="px-3 py-3 text-right">Total</th>
                                                <th className="px-3 py-3 w-12"><span className="sr-only">Actions</span></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {orders.map((order) => (
                                                <tr
                                                    key={order.id}
                                                    onClick={() => openOrder(order)}
                                                    onKeyDown={(e) => { if (e.target === e.currentTarget && e.key === 'Enter') openOrder(order); }}
                                                    tabIndex={0}
                                                    className={`cursor-pointer transition hover:bg-brand-50/40 focus:outline-none focus-visible:bg-brand-50/60 ${order.id === drawerId ? 'bg-brand-50/60' : ''} ${order.status === 'cancelled' ? 'opacity-60' : ''}`}
                                                >
                                                    <td className="px-5 py-3"><OrderBadge order={order} /></td>
                                                    <td className="px-3 py-3 max-w-[9rem]"><WhereCell order={order} /></td>
                                                    <td className="px-3 py-3 max-w-[16rem]"><ItemsCell order={order} /></td>
                                                    <td className="px-3 py-3"><StatusPill order={order} target={target} now={now} /></td>
                                                    <td className="px-3 py-3"><TimeCell order={order} now={now} target={target} /></td>
                                                    <td className="px-3 py-3"><PayCell order={order} /></td>
                                                    <td className="px-3 py-3 text-right"><RowMenu order={order} {...actions} /></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Narrow screens: cards */}
                                <ul className="lg:hidden divide-y divide-gray-100">
                                    {orders.map((order) => (
                                        <li key={order.id} onClick={() => openOrder(order)} onKeyDown={(e) => { if (e.target === e.currentTarget && e.key === 'Enter') openOrder(order); }} tabIndex={0} className={`p-4 cursor-pointer focus:outline-none focus-visible:bg-brand-50/60 ${order.status === 'cancelled' ? 'opacity-60' : ''}`}>
                                            <div className="flex items-start justify-between gap-2">
                                                <OrderBadge order={order} />
                                                <div className="flex items-center gap-1">
                                                    <StatusPill order={order} target={target} now={now} />
                                                    <RowMenu order={order} {...actions} />
                                                </div>
                                            </div>
                                            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
                                                <div className="min-w-0 space-y-2">
                                                    <WhereCell order={order} />
                                                    <ItemsCell order={order} />
                                                </div>
                                                <div className="text-right space-y-1">
                                                    <PayCell order={order} />
                                                    <TimeCell order={order} now={now} target={target} />
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </div>

                    <Pagination meta={list?.meta} page={page} onPageChange={setPage} />
                </div>

                {/* Side column */}
                <aside className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-1 gap-5 2xl:sticky 2xl:top-4">
                    {tables.length > 0 && (
                        <FloorCard
                            tables={tables}
                            area={area}
                            areas={areas}
                            onArea={(a) => { setArea(a); setTableFilter(null); }}
                            selectedTableId={tableFilter?.id}
                            onTable={(t) => setTableFilter((cur) => (cur?.id === t.id ? null : { id: t.id, table_number: t.table_number }))}
                        />
                    )}
                    <div className="space-y-5">
                        <div className="card p-4">
                            <h3 className="section-title mb-3">Quick actions</h3>
                            <div className="grid grid-cols-2 gap-2">
                                {quickActions.map(({ label, icon: Icon, to }) => (
                                    <Link key={label} to={to} className="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:border-brand-300 hover:bg-brand-50/50 transition">
                                        <span className="w-8 h-8 shrink-0 rounded-full bg-brand-500 text-white flex items-center justify-center"><Icon className="w-4 h-4" /></span>
                                        <span className="truncate">{label}</span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                        <div className="hidden 2xl:block">{delayAlert}</div>
                    </div>
                </aside>
            </div>

            <OrderDrawer
                order={drawerId ? drawerOrder : null}
                now={now}
                target={target}
                onClose={() => setDrawerId(null)}
                onAdvance={actions.onAdvance}
                onCancel={actions.onCancel}
                onMarkPaid={actions.onMarkPaid}
                onInvoice={openInvoice}
                busy={{
                    advancing: advanceMutation.isPending,
                    cancelling: cancelMutation.isPending,
                    paying: markPaidMutation.isPending,
                    invoice: invoiceLoading,
                }}
            />

            {invoiceData && <POSInvoice data={invoiceData} onClose={() => setInvoiceData(null)} />}
        </div>
    );
}
