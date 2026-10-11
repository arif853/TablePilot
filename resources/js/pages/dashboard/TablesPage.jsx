import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useReactToPrint } from 'react-to-print';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tableAPI, authAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { usePosStore } from '../../stores/posStore';
import { useModule } from '../../hooks/useModule';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Modal from '../../components/ui/Modal';
import TableQRCard from '../../components/TableQRCard';
import QRCardFace, { QR_CARD_PAGE_STYLE } from '../../components/qr/QRCardFace';
import FloorPlan from '../../components/tables/FloorPlan';
import { DEFAULT_AREA, areaOf, resolvePositions } from '../../components/tables/floorLayout';
import TableDetailPanel from '../../components/tables/TableDetailPanel';
import { TABLE_STATUS, STATUS_ORDER, formatMoney } from '../../components/tables/tableStatus';
import {
    HiOutlinePrinter, HiOutlineShoppingBag, HiOutlineSearch, HiOutlineSwitchHorizontal,
    HiOutlinePlus, HiOutlineMinus, HiOutlineCheckCircle, HiOutlineBookmark, HiOutlineBan,
    HiOutlineArrowsExpand, HiOutlinePencil, HiOutlineViewGrid, HiOutlineX,
} from 'react-icons/hi';
import { MdOutlineTableRestaurant } from 'react-icons/md';
import toast from 'react-hot-toast';

const STAT_ICONS = {
    occupied: MdOutlineTableRestaurant,
    available: HiOutlineCheckCircle,
    reserved: HiOutlineBookmark,
    inactive: HiOutlineBan,
};

const ZOOM_LEVELS = [0.7, 0.85, 1, 1.2, 1.4];

function StatCard({ status, count, total, active, onClick }) {
    const tone = TABLE_STATUS[status];
    const Icon = STAT_ICONS[status];
    const pct = total ? Math.round((count / total) * 100) : 0;

    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`card p-4 sm:p-4 text-left transition hover:shadow-md ${active ? 'ring-2 ring-brand-500 border-transparent' : ''}`}
        >
            <div className="flex items-center gap-3">
                <span className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${tone.icon}`}>
                    <Icon className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                    <p className="text-xs sm:text-sm text-gray-500 truncate">{tone.label}</p>
                    <p className="text-xl font-bold text-gray-900 tabular-nums">
                        {count}
                        {status === 'occupied' && <span className="text-sm font-medium text-gray-400"> / {total}</span>}
                    </p>
                </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${tone.bar}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[11px] font-medium text-gray-500 tabular-nums w-8 text-right">{pct}%</span>
            </div>
        </button>
    );
}

export default function TablesPage() {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const canUsePos = useModule('pos');
    const [showForm, setShowForm] = useState(false);
    const [transferFrom, setTransferFrom] = useState(null); // null = closed, '' = open with no preset
    const [qrCard, setQrCard] = useState(null);
    const [bulkCards, setBulkCards] = useState(null);
    const [bulkLoading, setBulkLoading] = useState(false);
    const bulkPrintRef = useRef(null);
    const detailRef = useRef(null);
    const [editing, setEditing] = useState(null);
    const [selectedId, setSelectedId] = useState(null);
    const [statusFilter, setStatusFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [zoomIndex, setZoomIndex] = useState(2);
    const [activeArea, setActiveArea] = useState(null);
    const [newAreas, setNewAreas] = useState([]); // added this session, no tables yet
    const [areaModal, setAreaModal] = useState(null); // { mode: 'add' } | { mode: 'rename', from }
    const [arranging, setArranging] = useState(false);
    const [drafts, setDrafts] = useState({}); // unsaved positions: { [tableId]: { x, y } }
    const [now, setNow] = useState(() => Date.now());
    const { user } = useAuthStore();
    // Staff can view, transfer and print QR codes; only admins change the floor plan
    const isAdmin = user?.role === 'restaurant_admin';

    const { data: tables, isLoading } = useQuery({
        queryKey: ['tables'],
        queryFn: () => tableAPI.list().then((r) => r.data.data),
        refetchInterval: 30000,
    });

    const { data: profileData, isLoading: profileLoading } = useQuery({
        queryKey: ['profile'],
        queryFn: () => authAPI.me().then((r) => r.data.data),
    });

    // Keep the "seated for" timers moving between refetches
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 30000);
        return () => clearInterval(id);
    }, []);

    const refreshTables = () => {
        queryClient.invalidateQueries({ queryKey: ['tables'] });
        queryClient.invalidateQueries({ queryKey: ['table'] });
    };

    const saveMutation = useMutation({
        mutationFn: (data) => editing ? tableAPI.update(editing.id, data) : tableAPI.create(data),
        onSuccess: (res) => {
            refreshTables();
            setShowForm(false);
            setEditing(null);
            if (!editing && res?.data?.data?.id) setSelectedId(res.data.data.id);
            toast.success(editing ? 'Updated' : 'Table created');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Error'),
    });

    const statusMutation = useMutation({
        mutationFn: ({ table, status }) => tableAPI.update(table.id, {
            table_number: table.table_number,
            capacity: table.capacity,
            status,
        }),
        onSuccess: (_, { status }) => {
            refreshTables();
            toast.success(`Marked ${TABLE_STATUS[status].label.toLowerCase()}`);
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Could not change the status'),
    });

    const transferMutation = useMutation({
        mutationFn: (data) => tableAPI.transfer(data),
        onSuccess: (_, data) => {
            refreshTables();
            setTransferFrom(null);
            setSelectedId(Number(data.to_table_id));
            toast.success('Table transferred!');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Transfer failed'),
    });

    const layoutMutation = useMutation({
        mutationFn: (positions) => tableAPI.saveLayout(positions),
        onSuccess: () => {
            refreshTables();
            setArranging(false);
            setDrafts({});
            toast.success('Floor plan saved');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Could not save the floor plan'),
    });

    const renameAreaMutation = useMutation({
        mutationFn: ({ from, to }) => tableAPI.renameArea(from, to),
        onSuccess: (_, { to }) => {
            refreshTables();
            setActiveArea(to);
            setAreaModal(null);
            toast.success('Area renamed');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Could not rename the area'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => tableAPI.delete(id),
        onSuccess: () => {
            refreshTables();
            setSelectedId(null);
            toast.success('Table deleted');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Error'),
    });

    // /auth/me returns { user: { tenant } }; the card needs the restaurant's name, logo, colours and contact
    const tenant = profileData?.user?.tenant;

    const counts = useMemo(() => {
        const c = { occupied: 0, available: 0, reserved: 0, inactive: 0 };
        tables?.forEach((t) => { if (c[t.status] !== undefined) c[t.status] += 1; });
        return c;
    }, [tables]);

    const runningTotal = useMemo(
        () => tables?.reduce((sum, t) => sum + Number(t.active_orders_sum_grand_total || 0), 0) ?? 0,
        [tables],
    );

    // Areas with tables first (in natural order), then any just added and still empty
    const areas = useMemo(() => {
        const names = [...new Set((tables ?? []).map(areaOf))]
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        return [...names, ...newAreas.filter((a) => !names.includes(a))];
    }, [tables, newAreas]);

    const currentArea = areas.includes(activeArea) ? activeArea : (areas[0] ?? DEFAULT_AREA);
    const areaTables = useMemo(() => (tables ?? []).filter((t) => areaOf(t) === currentArea), [tables, currentArea]);
    const positions = useMemo(() => resolvePositions(areaTables, drafts), [areaTables, drafts]);

    const query = search.trim().toLowerCase();
    const isMatch = (t) => (statusFilter === 'all' || t.status === statusFilter)
        && (!query || String(t.table_number).toLowerCase().includes(query));

    // Searching for a table on another floor jumps to that floor
    useEffect(() => {
        if (!query || areaTables.some(isMatch)) return;
        const hit = tables?.find((t) => String(t.table_number).toLowerCase().includes(query));
        if (hit) setActiveArea(areaOf(hit));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query]);

    const selected = tables?.find((t) => t.id === selectedId) ?? null;
    const totalTables = tables?.length ?? 0;
    const hasDrafts = Object.keys(drafts).length > 0;

    const selectTable = (table) => {
        setSelectedId(table.id);
        // The detail panel sits under the floor plan on smaller screens
        if (!arranging && window.matchMedia('(max-width: 1279px)').matches) {
            setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
        }
    };

    const moveTable = (id, spot) => setDrafts((d) => ({ ...d, [id]: spot }));

    // Lay this area out on a fresh grid (still unsaved until "Save layout")
    const autoArrange = () => {
        const fresh = resolvePositions(areaTables, {}, { ignoreSaved: true });
        setDrafts((d) => ({ ...d, ...fresh }));
    };

    const cancelArranging = () => {
        if (hasDrafts && !confirm('Discard your unsaved layout changes?')) return;
        setDrafts({});
        setArranging(false);
    };

    // Save every table's spot, including ones that were only auto-placed, so the
    // floor looks the same for everyone afterwards
    const saveLayout = () => {
        const byArea = {};
        tables.forEach((t) => { (byArea[areaOf(t)] ??= []).push(t); });
        const payload = Object.values(byArea).flatMap((list) => {
            const spots = resolvePositions(list, drafts);
            return list.map((t) => ({ id: t.id, pos_x: Math.round(spots[t.id].x), pos_y: Math.round(spots[t.id].y) }));
        });
        layoutMutation.mutate(payload);
    };

    const submitArea = (name) => {
        const clean = name.trim();
        if (!clean) return;
        if (areaModal.mode === 'rename') {
            if (clean === areaModal.from) return setAreaModal(null);
            if (areas.includes(clean)) return toast.error('An area with that name already exists');
            if (newAreas.includes(areaModal.from)) {
                // Not saved anywhere yet, so just rename it here
                setNewAreas((list) => list.map((a) => (a === areaModal.from ? clean : a)));
                setActiveArea(clean);
                setAreaModal(null);
            } else {
                renameAreaMutation.mutate({ from: areaModal.from, to: clean });
            }
            return;
        }
        if (!areas.includes(clean)) setNewAreas((list) => [...list, clean]);
        setActiveArea(clean);
        setAreaModal(null);
    };

    const handleShowQr = async (table) => {
        try {
            const { data } = await tableAPI.qrCode(table.id);
            setQrCard({ label: 'Table', title: table.table_number, qrUrl: data.data.qr_url, fileName: `table-${table.table_number}` });
        } catch {
            toast.error('Failed to load the QR code');
        }
    };

    const handleShowTakeawayQr = async () => {
        try {
            const { data } = await tableAPI.parcelQr();
            setQrCard({ label: 'Takeaway', title: 'Order to go', qrUrl: data.data.qr_url, fileName: 'takeaway' });
        } catch {
            toast.error('Failed to load the takeaway QR code');
        }
    };

    // Open the POS on a dine-in cart for this table. A fresh cart is used when the
    // current one already has items, so nobody's half-built order gets re-tabled.
    const handleStartOrder = (table) => {
        const posStore = usePosStore.getState();
        if (posStore.getActiveCart()?.items?.length) posStore.createCart();
        posStore.setOrderType('dine');
        posStore.setTable(table.id, table.table_number);
        navigate('/dashboard/pos');
    };

    const printAllCards = useReactToPrint({
        contentRef: bulkPrintRef,
        documentTitle: 'table-qr-cards',
        pageStyle: QR_CARD_PAGE_STYLE,
        onAfterPrint: () => setBulkCards(null),
        onPrintError: () => {
            setBulkCards(null);
            toast.error('Could not open the print dialog');
        },
    });

    const handlePrintAll = async () => {
        setBulkLoading(true);
        try {
            const { data } = await tableAPI.qrCodes();
            if (!data.data.length) {
                toast.error('Add a table first');
                return;
            }
            setBulkCards(data.data);
        } catch {
            toast.error('Failed to prepare the QR cards');
        } finally {
            setBulkLoading(false);
        }
    };

    // Print once the off-screen sheet has rendered every card. Keyed on the card set only:
    // printAllCards is a new function each render, and re-running would reopen the dialog.
    useEffect(() => {
        if (bulkCards?.length) printAllCards();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bulkCards]);

    if (isLoading || profileLoading) return <LoadingSpinner />;

    return (
        <div>
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-6">
                <div>
                    <h2 className="page-title">Tables</h2>
                    <p className="page-subtitle">
                        Live floor view · {counts.occupied} seated
                        {runningTotal > 0 && <> · <span className="font-medium text-gray-700">{formatMoney(runningTotal)}</span> running</>}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button onClick={handleShowTakeawayQr} className="btn-secondary">
                        <HiOutlineShoppingBag className="w-4 h-4" /> Takeaway QR
                    </button>
                    {totalTables > 0 && (
                        <button onClick={handlePrintAll} disabled={bulkLoading} className="btn-secondary">
                            <HiOutlinePrinter className="w-4 h-4" /> {bulkLoading ? 'Preparing…' : 'Print all QR'}
                        </button>
                    )}
                    <button onClick={() => setTransferFrom('')} className="btn-secondary">
                        <HiOutlineSwitchHorizontal className="w-4 h-4" /> Transfer
                    </button>
                    {isAdmin && (
                        <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary">
                            <HiOutlinePlus className="w-4 h-4" /> Add Table
                        </button>
                    )}
                </div>
            </div>

            {totalTables === 0 ? (
                <div className="card flex flex-col items-center text-center py-16">
                    <span className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mb-4">
                        <MdOutlineTableRestaurant className="w-7 h-7" />
                    </span>
                    <p className="section-title">No tables yet</p>
                    <p className="page-subtitle max-w-xs">
                        {isAdmin ? 'Add your first table to start seating guests and taking dine-in orders.' : 'Ask an admin to set up the tables.'}
                    </p>
                    {isAdmin && (
                        <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary mt-5">
                            <HiOutlinePlus className="w-4 h-4" /> Add Table
                        </button>
                    )}
                </div>
            ) : (
                <>
                    {/* Status summary */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                        {STATUS_ORDER.map((status) => (
                            <StatCard
                                key={status}
                                status={status}
                                count={counts[status]}
                                total={totalTables}
                                active={statusFilter === status}
                                onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
                            />
                        ))}
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
                        <div className="min-w-0">
                            {/* Floor plan */}
                            <div className="card p-0 sm:p-0 overflow-hidden">
                                {/* Area tabs + tools */}
                                <div className="flex flex-col 2xl:flex-row 2xl:items-center gap-3 p-3 sm:p-4 border-b border-gray-100">
                                    <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden flex-1 min-w-0" role="tablist" aria-label="Floor areas">
                                        {areas.map((area) => {
                                            const active = area === currentArea;
                                            const count = tables.filter((t) => areaOf(t) === area).length;
                                            return (
                                                <button
                                                    key={area}
                                                    type="button"
                                                    role="tab"
                                                    aria-selected={active}
                                                    onClick={() => setActiveArea(area)}
                                                    className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition
                                                        ${active ? 'bg-brand-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                                >
                                                    {area}
                                                    <span className={`text-xs tabular-nums ${active ? 'text-white/80' : 'text-gray-400'}`}>{count}</span>
                                                </button>
                                            );
                                        })}
                                        {isAdmin && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => setAreaModal({ mode: 'rename', from: currentArea })}
                                                    className="shrink-0 p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                                                    aria-label={`Rename ${currentArea}`}
                                                    title="Rename this area"
                                                >
                                                    <HiOutlinePencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setAreaModal({ mode: 'add' })}
                                                    className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm font-medium text-brand-700 border border-dashed border-brand-300 hover:bg-brand-50"
                                                >
                                                    <HiOutlinePlus className="w-3.5 h-3.5" /> Area
                                                </button>
                                            </>
                                        )}
                                    </div>

                                    {arranging ? (
                                        <div className="flex flex-wrap items-center gap-2">
                                            <button type="button" onClick={autoArrange} className="btn-ghost px-3 py-1.5">
                                                <HiOutlineViewGrid className="w-4 h-4" /> Auto-arrange
                                            </button>
                                            <button type="button" onClick={cancelArranging} className="btn-secondary px-3 py-1.5">Cancel</button>
                                            <button type="button" onClick={saveLayout} disabled={layoutMutation.isPending} className="btn-primary px-3 py-1.5">
                                                {layoutMutation.isPending ? 'Saving…' : 'Save layout'}
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            {statusFilter !== 'all' && (
                                                <button
                                                    type="button"
                                                    onClick={() => setStatusFilter('all')}
                                                    className={`shrink-0 badge ${TABLE_STATUS[statusFilter].soft}`}
                                                    aria-label="Clear status filter"
                                                >
                                                    {TABLE_STATUS[statusFilter].label} <HiOutlineX className="w-3 h-3" />
                                                </button>
                                            )}
                                            <div className="relative flex-1 2xl:w-40">
                                                <HiOutlineSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                <input
                                                    value={search}
                                                    onChange={(e) => setSearch(e.target.value)}
                                                    placeholder="Find table…"
                                                    className="input pl-8 py-1.5"
                                                    aria-label="Find table"
                                                />
                                            </div>
                                            <div className="flex rounded-lg border border-gray-300 bg-white shadow-sm overflow-hidden">
                                                <button
                                                    type="button"
                                                    onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
                                                    disabled={zoomIndex === 0}
                                                    className="p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                                                    aria-label="Zoom out"
                                                >
                                                    <HiOutlineMinus className="w-4 h-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setZoomIndex((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
                                                    disabled={zoomIndex === ZOOM_LEVELS.length - 1}
                                                    className="p-2 text-gray-600 hover:bg-gray-50 border-l border-gray-200 disabled:opacity-40"
                                                    aria-label="Zoom in"
                                                >
                                                    <HiOutlinePlus className="w-4 h-4" />
                                                </button>
                                            </div>
                                            {isAdmin && areaTables.length > 0 && (
                                                <button type="button" onClick={() => setArranging(true)} className="btn-secondary px-3 py-1.5 shrink-0">
                                                    <HiOutlineArrowsExpand className="w-4 h-4" /> <span className="hidden sm:inline">Arrange</span>
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {arranging && (
                                    <div className="px-4 py-2 bg-brand-50 border-b border-brand-100 text-xs sm:text-sm text-brand-800">
                                        Drag tables to where they sit in <span className="font-semibold">{currentArea}</span>. Select one and use the arrow keys to nudge it.
                                        {hasDrafts && <span className="ml-1 font-medium">· Unsaved changes</span>}
                                    </div>
                                )}

                                <div className="p-2 sm:p-4 bg-[#FBF8F4]">
                                    {areaTables.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center text-center h-[320px] rounded-2xl border-[6px] border-[#E7E0D6] bg-[#FDFBF8] text-sm text-gray-500 px-4">
                                            No tables in {currentArea} yet.
                                            {isAdmin && (
                                                <button type="button" onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary mt-4">
                                                    <HiOutlinePlus className="w-4 h-4" /> Add a table here
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <FloorPlan
                                            tables={areaTables}
                                            positions={positions}
                                            editing={arranging}
                                            zoom={ZOOM_LEVELS[zoomIndex]}
                                            selectedId={selectedId}
                                            isMatch={isMatch}
                                            now={now}
                                            onSelect={selectTable}
                                            onMove={moveTable}
                                        />
                                    )}
                                </div>

                                {/* Legend */}
                                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 border-t border-gray-100 text-xs text-gray-600">
                                    {STATUS_ORDER.map((status) => (
                                        <span key={status} className="inline-flex items-center gap-1.5">
                                            <span className={`w-2.5 h-2.5 rounded-full ${TABLE_STATUS[status].dot}`} />
                                            {TABLE_STATUS[status].label}
                                        </span>
                                    ))}
                                    <span className="inline-flex items-center gap-1.5 sm:ml-auto text-gray-400">
                                        <span className="w-4 h-4 rounded-full bg-white ring-1 ring-gray-200 text-[9px] font-bold text-gray-700 flex items-center justify-center">2</span>
                                        running orders
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Selected table */}
                        <div ref={detailRef} className="xl:sticky xl:top-4 scroll-mt-4">
                            <TableDetailPanel
                                table={selected}
                                isAdmin={isAdmin}
                                canUsePos={canUsePos}
                                now={now}
                                statusPending={statusMutation.isPending}
                                onStartOrder={() => handleStartOrder(selected)}
                                onViewOrders={() => navigate('/dashboard/orders')}
                                onMove={() => setTransferFrom(String(selected.id))}
                                onShowQr={() => handleShowQr(selected)}
                                onEdit={() => { setEditing(selected); setShowForm(true); }}
                                onDelete={() => { if (confirm(`Delete table ${selected.table_number}?`)) deleteMutation.mutate(selected.id); }}
                                onSetStatus={(status) => statusMutation.mutate({ table: selected, status })}
                            />
                        </div>
                    </div>
                </>
            )}

            {/* Create/Edit Form */}
            <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Table' : 'Add Table'}>
                <form key={editing?.id ?? 'new'} onSubmit={(e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); saveMutation.mutate(d); }} className="space-y-4">
                    <div>
                        <label className="label">Table Number</label>
                        <input name="table_number" className="input" defaultValue={editing?.table_number} required />
                    </div>
                    <div>
                        <label className="label">Capacity</label>
                        <input name="capacity" type="number" className="input" defaultValue={editing?.capacity || 4} min={1} max={50} />
                    </div>
                    <div>
                        <label className="label">Area</label>
                        <input name="area" list="table-areas" className="input" defaultValue={editing ? areaOf(editing) : currentArea} maxLength={50} placeholder="e.g. Ground Floor, Terrace" />
                        <datalist id="table-areas">
                            {areas.map((a) => <option key={a} value={a} />)}
                        </datalist>
                        {editing && <p className="mt-1 text-xs text-gray-500">Moving it to another area places it there automatically; arrange it afterwards.</p>}
                    </div>
                    <div className="flex gap-3">
                        <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>Save</button>
                        <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
                    </div>
                </form>
            </Modal>

            {/* Add / rename area */}
            <Modal isOpen={!!areaModal} onClose={() => setAreaModal(null)} title={areaModal?.mode === 'rename' ? 'Rename Area' : 'Add Area'} size="sm">
                <form key={areaModal?.from ?? 'add'} onSubmit={(e) => { e.preventDefault(); submitArea(new FormData(e.target).get('name') || ''); }} className="space-y-4">
                    <div>
                        <label className="label">Area name</label>
                        <input name="name" className="input" defaultValue={areaModal?.from ?? ''} maxLength={50} required autoFocus placeholder="e.g. Rooftop" />
                        {areaModal?.mode === 'add' && <p className="mt-1 text-xs text-gray-500">The area is saved once you add a table to it.</p>}
                    </div>
                    <div className="flex gap-3">
                        <button type="submit" className="btn-primary" disabled={renameAreaMutation.isPending}>Save</button>
                        <button type="button" onClick={() => setAreaModal(null)} className="btn-secondary">Cancel</button>
                    </div>
                </form>
            </Modal>

            {/* Transfer Modal */}
            <Modal isOpen={transferFrom !== null} onClose={() => setTransferFrom(null)} title="Transfer Table">
                <form key={transferFrom ?? 'closed'} onSubmit={(e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); transferMutation.mutate(d); }} className="space-y-4">
                    <div>
                        <label className="label">From Table</label>
                        <select name="from_table_id" className="input" defaultValue={transferFrom ?? ''} required>
                            <option value="">Select...</option>
                            {tables?.filter((t) => t.active_orders_count > 0 || t.status === 'occupied').map((t) => (
                                <option key={t.id} value={t.id}>{t.table_number} · {areaOf(t)}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="label">To Table</label>
                        <select name="to_table_id" className="input" required>
                            <option value="">Select...</option>
                            {tables?.filter((t) => t.status === 'available').map((t) => (
                                <option key={t.id} value={t.id}>{t.table_number} · {areaOf(t)} · {t.capacity} seats</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex gap-3">
                        <button type="submit" className="btn-primary" disabled={transferMutation.isPending}>Transfer</button>
                        <button type="button" onClick={() => setTransferFrom(null)} className="btn-secondary">Cancel</button>
                    </div>
                </form>
            </Modal>

            {/* QR Code Card Modal */}
            <TableQRCard isOpen={!!qrCard} onClose={() => setQrCard(null)} tenant={tenant} card={qrCard} />

            {/* Off-screen sheet for "Print all QR": one 4x6 card per page */}
            {bulkCards && (
                <div aria-hidden="true" style={{ position: 'fixed', left: -10000, top: 0 }}>
                    <div ref={bulkPrintRef}>
                        {bulkCards.map(({ table, qr_url }) => (
                            <div key={table.id} className="qr-print-page">
                                <QRCardFace tenant={tenant} label="Table" title={table.table_number} qrUrl={qr_url} />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
