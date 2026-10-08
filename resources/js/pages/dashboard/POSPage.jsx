import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
    HiOutlinePlus,
    HiOutlineX,
    HiOutlineSearch,
    HiOutlineTrash,
    HiOutlineMinusSm,
    HiOutlinePlusSm,
    HiOutlineTable,
    HiOutlineUser,
    HiOutlineTag,
    HiOutlineLightningBolt,
    HiOutlineShoppingBag,
    HiOutlineCash,
    HiOutlineCheckCircle,
    HiOutlineRefresh,
    HiOutlinePencil,
    HiOutlineTruck,
    HiOutlineClock,
} from 'react-icons/hi';
import { categoryAPI, menuAPI, posAPI, tableAPI, voucherAPI } from '../../services/api';
import { usePosStore } from '../../stores/posStore';
import { useAuthStore } from '../../stores/authStore';
import POSCheckoutModal from '../../components/POSCheckoutModal';
import { cachePosData, getCachedPosData, syncQueuedOrders } from '../../services/posOffline';

// ─── Order type config ────────────────────────────────────────────────────────
const ORDER_TYPES = [
    { id: 'dine',   label: 'Dine-In',   icon: HiOutlineTable },
    { id: 'parcel', label: 'Takeaway',  icon: HiOutlineShoppingBag },
    { id: 'delivery', label: 'Delivery', icon: HiOutlineTruck },
    { id: 'quick',  label: 'Quick Sale', icon: HiOutlineLightningBolt },
];

// ─── Held-order tab strip ─────────────────────────────────────────────────────
function CartTabs({ carts, activeCartId, onSelect, onCreate, onDelete }) {
    const activeId = activeCartId ?? carts[0]?.id;
    return (
        <div className="flex items-center gap-1 overflow-x-auto pb-1 min-h-[38px]">
            {carts.map((cart) => {
                const isActive = cart.id === activeId;
                const total = cart.items.reduce((s, i) => s + i.price * i.qty, 0);
                return (
                    <div
                        key={cart.id}
                        onClick={() => onSelect(cart.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer whitespace-nowrap select-none transition-colors ${
                            isActive
                                ? 'bg-brand-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                    >
                        <span>{cart.label}</span>
                        {total > 0 && (
                            <span className={`text-xs ${isActive ? 'text-brand-200' : 'text-gray-400'}`}>
                                ৳{total.toFixed(0)}
                            </span>
                        )}
                        {carts.length > 1 && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete(cart.id);
                                }}
                                className={`ml-0.5 rounded hover:bg-white/20 p-0.5 ${isActive ? 'text-brand-200 hover:text-white' : 'text-gray-400 hover:text-red-500'}`}
                            >
                                <HiOutlineX className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                );
            })}
            {carts.length < 5 && (
                <button
                    onClick={onCreate}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 border border-dashed border-gray-300 whitespace-nowrap"
                >
                    <HiOutlinePlus className="w-3.5 h-3.5" />
                    New
                </button>
            )}
        </div>
    );
}

// ─── Main POSPage ─────────────────────────────────────────────────────────────
export default function POSPage() {
    const { user } = useAuthStore();
    const store = usePosStore();
    const cart = store.getActiveCart();

    const [search, setSearch]             = useState('');
    const [activeCategory, setActiveCategory] = useState(null);
    const [voucherInput, setVoucherInput] = useState(cart?.voucherCode ?? '');
    const [voucherLoading, setVoucherLoading] = useState(false);
    const [showCheckout, setShowCheckout] = useState(false);
    const [currentShift, setCurrentShift] = useState(null);

    // Tenant VAT config from authenticated user's tenant
    const vatRate = parseFloat(user?.tenant?.default_vat_rate ?? 15);
    const sdRate = parseFloat(user?.tenant?.default_sd_rate ?? 0);
    const vatInclusive = !!user?.tenant?.vat_inclusive;

    // ── Queries ────────────────────────────────────────────────────────────────
    const { data: categoriesData } = useQuery({
        queryKey: ['pos-categories'],
        queryFn: async () => {
            try {
                const res = await categoryAPI.list({ per_page: 100 });
                await cachePosData('categories', res.data);
                return res;
            } catch (err) {
                const cached = await getCachedPosData('categories');
                if (cached) return { data: cached };
                throw err;
            }
        },
        staleTime: 30000,
    });

    const { data: menuData, refetch: refetchMenu } = useQuery({
        queryKey: ['pos-menu'],
        queryFn: async () => {
            try {
                const res = await menuAPI.list({ per_page: 200 });
                await cachePosData('menu', res.data);
                return res;
            } catch (err) {
                const cached = await getCachedPosData('menu');
                if (cached) return { data: cached };
                throw err;
            }
        },
        staleTime: 30000,
    });

    const { data: tablesData, refetch: refetchTables } = useQuery({
        queryKey: ['pos-tables'],
        queryFn: async () => {
            try {
                const res = await tableAPI.list({ per_page: 100 });
                await cachePosData('tables', res.data);
                return res;
            } catch (err) {
                const cached = await getCachedPosData('tables');
                if (cached) return { data: cached };
                throw err;
            }
        },
        staleTime: 10000,
    });

    const categories = categoriesData?.data?.data?.data ?? categoriesData?.data?.data ?? [];
    const allItems   = menuData?.data?.data?.data ?? menuData?.data?.data ?? [];
    const tables     = tablesData?.data?.data?.data ?? tablesData?.data?.data ?? [];

    // ── Filtered items ─────────────────────────────────────────────────────────
    const filteredItems = allItems.filter((item) => {
        if (!item.is_active) return false;
        if (activeCategory && item.category_id !== activeCategory) return false;
        if (search) return item.name.toLowerCase().includes(search.toLowerCase());
        return true;
    });

    // ── Sync voucher input with active cart ────────────────────────────────────
    useEffect(() => {
        setVoucherInput(cart?.voucherCode ?? '');
    }, [cart?.id]);

    useEffect(() => {
        async function loadShift() {
            try {
                const res = await posAPI.currentShift();
                setCurrentShift(res.data?.data ?? null);
            } catch {
                setCurrentShift(null);
            }
        }

        loadShift();
    }, []);

    useEffect(() => {
        const syncNow = async () => {
            const { synced } = await syncQueuedOrders((payload) => posAPI.createOrder(payload));
            if (synced > 0) {
                toast.success(`Synced ${synced} offline order(s)`);
                refetchTables();
            }
        };

        syncNow();
        window.addEventListener('online', syncNow);
        return () => window.removeEventListener('online', syncNow);
    }, [refetchTables]);

    async function handleOpenShift() {
        const input = window.prompt('Opening cash amount (BDT)');
        if (!input) return;
        const amount = parseFloat(input);
        if (Number.isNaN(amount) || amount < 0) {
            toast.error('Enter a valid opening cash amount');
            return;
        }

        try {
            const res = await posAPI.openShift({ opening_cash: amount });
            setCurrentShift(res.data?.data ?? null);
            toast.success('Shift opened');
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'Failed to open shift');
        }
    }

    async function handleCloseShift() {
        const input = window.prompt('Closing cash amount (BDT)');
        if (!input) return;
        const amount = parseFloat(input);
        if (Number.isNaN(amount) || amount < 0) {
            toast.error('Enter a valid closing cash amount');
            return;
        }

        try {
            await posAPI.closeShift({ closing_cash: amount });
            setCurrentShift(null);
            toast.success('Shift closed');
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'Failed to close shift');
        }
    }

    // ── Cart totals ────────────────────────────────────────────────────────────
    const totals = store.getCartTotals(vatRate, vatInclusive, sdRate);

    // ── Apply voucher ──────────────────────────────────────────────────────────
    async function applyVoucher() {
        if (!voucherInput.trim()) return;
        setVoucherLoading(true);
        try {
            const res = await voucherAPI.validate({
                code: voucherInput.trim(),
                subtotal: totals.subtotal,
                tenant_id: user?.tenant?.id,
            });
            const v = res.data?.data;
            store.setVoucher(voucherInput.trim(), v?.discount ?? 0, v?.voucher?.id ?? null);
            toast.success(`Voucher applied! -৳${(v?.discount ?? 0).toFixed(2)}`);
        } catch {
            toast.error('Invalid or expired voucher code');
            store.clearVoucher();
        } finally {
            setVoucherLoading(false);
        }
    }

    function removeVoucher() {
        store.clearVoucher();
        setVoucherInput('');
    }

    // ── Checkout success ───────────────────────────────────────────────────────
    function handleOrderSuccess() {
        setShowCheckout(false);
        store.clearActiveCart();
        refetchTables();
        toast.success('Cart cleared — ready for next order');
    }

    if (!cart) return null;

    return (
        <div className="flex h-[calc(100vh-64px)] bg-gray-100 overflow-hidden">

            {/* ════════════════════════════════════════════════════
                LEFT PANEL — Menu Browser
            ════════════════════════════════════════════════════ */}
            <div className="flex flex-col w-[58%] bg-white border-r border-gray-200 overflow-hidden">

                {/* Top bar */}
                <div className="px-4 pt-4 pb-3 border-b border-gray-100 space-y-2">
                    <div className="flex items-center justify-between">
                        <h1 className="text-base font-semibold text-gray-800">POS Terminal</h1>
                        <div className="flex items-center gap-2">
                            <div className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${currentShift ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                                <HiOutlineClock className="w-3.5 h-3.5" />
                                {currentShift ? 'Shift Open' : 'Shift Closed'}
                            </div>
                            {currentShift ? (
                                <button
                                    onClick={handleCloseShift}
                                    className="text-xs px-2 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                                >
                                    Close Shift
                                </button>
                            ) : (
                                <button
                                    onClick={handleOpenShift}
                                    className="text-xs px-2 py-1 rounded-md border border-green-200 text-green-700 hover:bg-green-50"
                                >
                                    Open Shift
                                </button>
                            )}
                            <button
                                onClick={() => { refetchMenu(); refetchTables(); }}
                                className="text-gray-400 hover:text-blue-500 p-1 rounded"
                                title="Refresh menu & tables"
                            >
                                <HiOutlineRefresh className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Held order tabs */}
                    <CartTabs
                        carts={store.carts}
                        activeCartId={store.activeCartId}
                        onSelect={store.setActiveCart.bind(store)}
                        onCreate={store.createCart.bind(store)}
                        onDelete={(id) => {
                            const c = store.carts.find((x) => x.id === id);
                            if (c?.items?.length > 0 && !window.confirm('Delete this order cart?')) return;
                            store.deleteCart(id);
                        }}
                    />

                    {/* Search */}
                    <div className="relative">
                        <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search menu items…"
                            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
                        />
                    </div>
                </div>

                {/* Category tabs */}
                <div className="flex gap-2 px-4 py-2 overflow-x-auto border-b border-gray-100 shrink-0">
                    <button
                        onClick={() => setActiveCategory(null)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                            activeCategory === null
                                ? 'bg-brand-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                    >
                        All
                    </button>
                    {categories.map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => setActiveCategory(cat.id)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                                activeCategory === cat.id
                                    ? 'bg-brand-600 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                            {cat.name}
                        </button>
                    ))}
                </div>

                {/* Item grid */}
                <div className="flex-1 overflow-y-auto p-3">
                    {filteredItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                            <HiOutlineSearch className="w-8 h-8 mb-2" />
                            <p className="text-sm">No items found</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 xl:grid-cols-4 gap-2.5">
                            {filteredItems.map((item) => {
                                const inCart = cart.items.find((i) => i.menu_item_id === item.id);
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => store.addItem(item)}
                                        className={`relative flex flex-col rounded-xl border text-left transition-all hover:shadow-md active:scale-[0.97] overflow-hidden ${
                                            inCart
                                                ? 'border-brand-400 ring-2 ring-brand-100'
                                                : 'border-gray-200 hover:border-brand-300'
                                        }`}
                                    >
                                        {/* Image */}
                                        <div className="h-24 bg-gray-100 overflow-hidden">
                                            {item.image_url ? (
                                                <img
                                                    src={item.image_url}
                                                    alt={item.name}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-gray-300 text-2xl">
                                                    🍽
                                                </div>
                                            )}
                                        </div>

                                        {/* Info */}
                                        <div className="p-2 flex-1 flex flex-col">
                                            <p className="text-xs font-semibold text-gray-800 leading-tight line-clamp-2">{item.name}</p>
                                            <p className="text-sm font-bold text-brand-700 mt-auto pt-1">৳{parseFloat(item.price).toFixed(2)}</p>
                                        </div>

                                        {/* Qty badge */}
                                        {inCart && (
                                            <div className="absolute top-1.5 right-1.5 bg-brand-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                                                {inCart.qty}
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* ════════════════════════════════════════════════════
                RIGHT PANEL — Active Cart
            ════════════════════════════════════════════════════ */}
            <div className="flex flex-col w-[42%] bg-white overflow-hidden">

                {/* Order type + context */}
                <div className="px-4 pt-4 pb-3 border-b border-gray-100 space-y-3">
                    {/* Order type segmented control */}
                    <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                        {ORDER_TYPES.map((t) => {
                            const active = cart.orderType === t.id;
                            return (
                                <button
                                    key={t.id}
                                    onClick={() => store.setOrderType(t.id)}
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                                        active
                                            ? 'bg-white text-brand-800 shadow-sm'
                                            : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    <t.icon className="w-3.5 h-3.5" />
                                    {t.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Dine-in: table picker */}
                    {cart.orderType === 'dine' && (
                        <div>
                            <p className="text-xs font-medium text-gray-500 mb-2">Select Table</p>
                            <div className="grid grid-cols-4 gap-1.5 max-h-28 overflow-y-auto">
                                {tables.filter((t) => t.status !== 'inactive').map((t) => {
                                    const sel = cart.tableId === t.id;
                                    const occ = t.status === 'occupied';
                                    return (
                                        <button
                                            key={t.id}
                                            onClick={() => store.setTable(t.id, t.table_number)}
                                            className={`py-2 rounded-lg text-xs font-semibold border transition-all ${
                                                sel
                                                    ? 'bg-brand-600 text-white border-brand-600'
                                                    : occ
                                                    ? 'bg-orange-50 text-orange-600 border-orange-200 hover:border-orange-400'
                                                    : 'bg-green-50 text-green-700 border-green-200 hover:border-green-400'
                                            }`}
                                        >
                                            {t.table_number}
                                            {occ && !sel && <span className="block text-[9px] leading-none text-orange-400">busy</span>}
                                        </button>
                                    );
                                })}
                            </div>
                            {cart.tableId && (
                                <p className="mt-1 text-xs text-brand-700 font-medium">
                                    ✓ Table {cart.tableName} selected
                                </p>
                            )}
                        </div>
                    )}

                    {/* Takeaway: customer info */}
                    {cart.orderType === 'parcel' && (
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-xs text-gray-500 mb-1 font-medium">Customer Name *</label>
                                <input
                                    value={cart.customerName}
                                    onChange={(e) => store.setCustomer(e.target.value, cart.customerPhone)}
                                    placeholder="Name"
                                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1 font-medium">Phone</label>
                                <input
                                    value={cart.customerPhone}
                                    onChange={(e) => store.setCustomer(cart.customerName, e.target.value)}
                                    placeholder="01XXXXXXXXX"
                                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                                />
                            </div>
                        </div>
                    )}

                    {/* Delivery: customer + address */}
                    {cart.orderType === 'delivery' && (
                        <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1 font-medium">Customer Name *</label>
                                    <input
                                        value={cart.customerName}
                                        onChange={(e) => store.setCustomer(e.target.value, cart.customerPhone)}
                                        placeholder="Name"
                                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1 font-medium">Phone *</label>
                                    <input
                                        value={cart.customerPhone}
                                        onChange={(e) => store.setCustomer(cart.customerName, e.target.value)}
                                        placeholder="01XXXXXXXXX"
                                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1 font-medium">Delivery Address *</label>
                                <textarea
                                    value={cart.deliveryAddress ?? ''}
                                    onChange={(e) => store.setDeliveryAddress(e.target.value)}
                                    placeholder="House, road, area"
                                    rows={2}
                                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Cart items */}
                <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5">
                    {cart.items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-32 text-gray-300">
                            <HiOutlineShoppingBag className="w-10 h-10 mb-2" />
                            <p className="text-sm font-medium">Cart is empty</p>
                            <p className="text-xs">Tap items on the left to add</p>
                        </div>
                    ) : (
                        cart.items.map((item) => (
                            <div key={item.menu_item_id} className="p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                                <div className="flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-800 truncate">{item.name}</p>
                                        <p className="text-xs text-gray-500">৳{item.price.toFixed(2)} each</p>
                                    </div>

                                    {/* Qty stepper */}
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => store.updateQty(item.menu_item_id, item.qty - 1)}
                                            className="w-6 h-6 rounded-full bg-gray-200 hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition-colors"
                                        >
                                            <HiOutlineMinusSm className="w-4 h-4" />
                                        </button>
                                        <span className="w-7 text-center text-sm font-bold">{item.qty}</span>
                                        <button
                                            onClick={() => store.updateQty(item.menu_item_id, item.qty + 1)}
                                            className="w-6 h-6 rounded-full bg-gray-200 hover:bg-green-100 hover:text-green-600 flex items-center justify-center transition-colors"
                                        >
                                            <HiOutlinePlusSm className="w-4 h-4" />
                                        </button>
                                    </div>

                                    <p className="text-sm font-bold text-gray-800 w-16 text-right">
                                        ৳{(item.price * item.qty).toFixed(2)}
                                    </p>

                                    <button
                                        onClick={() => store.removeItem(item.menu_item_id)}
                                        className="text-gray-300 hover:text-red-500 transition-colors"
                                    >
                                        <HiOutlineTrash className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Special instructions */}
                                <div className="mt-1.5">
                                    <input
                                        value={item.special_instructions ?? ''}
                                        onChange={(e) => store.updateInstructions(item.menu_item_id, e.target.value)}
                                        placeholder="Special instructions…"
                                        className="w-full text-[11px] text-gray-500 bg-transparent border-0 border-b border-dashed border-gray-200 focus:border-brand-400 px-0 py-0.5 outline-none placeholder:text-gray-300"
                                    />
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Voucher + notes + totals + CTA */}
                <div className="border-t border-gray-100 px-4 py-3 space-y-3">
                    {/* Notes */}
                    <input
                        value={cart.notes}
                        onChange={(e) => store.setNotes(e.target.value)}
                        placeholder="Order notes (optional)…"
                        className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 outline-none resize-none"
                    />

                    {/* Voucher */}
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <HiOutlineTag className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                            <input
                                value={voucherInput}
                                onChange={(e) => setVoucherInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && applyVoucher()}
                                placeholder="Voucher code"
                                disabled={!!cart.voucherCode}
                                className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-gray-50 disabled:text-gray-400"
                            />
                        </div>
                        {cart.voucherCode ? (
                            <button
                                onClick={removeVoucher}
                                className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                            >
                                Remove
                            </button>
                        ) : (
                            <button
                                onClick={applyVoucher}
                                disabled={!voucherInput.trim() || voucherLoading}
                                className="px-3 py-1.5 text-xs bg-gray-800 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                            >
                                {voucherLoading ? '…' : 'Apply'}
                            </button>
                        )}
                    </div>

                    {/* Totals */}
                    <div className="space-y-1 text-sm">
                        <div className="flex justify-between text-gray-500">
                            <span>Subtotal</span>
                            <span>৳{totals.subtotal.toFixed(2)}</span>
                        </div>
                        {totals.discount > 0 && (
                            <div className="flex justify-between text-green-600">
                                <span>Voucher Discount</span>
                                <span>-৳{totals.discount.toFixed(2)}</span>
                            </div>
                        )}
                        {totals.netAmount !== totals.subtotal - totals.discount && (
                            <div className="flex justify-between text-gray-500">
                                <span>Net Amount</span>
                                <span>৳{totals.netAmount.toFixed(2)}</span>
                            </div>
                        )}
                        {totals.vat > 0 && (
                            <div className="flex justify-between text-gray-500">
                                <span>VAT ({vatRate}%){vatInclusive ? ' (incl.)' : ''}</span>
                                <span>৳{totals.vat.toFixed(2)}</span>
                            </div>
                        )}
                        {totals.sd > 0 && (
                            <div className="flex justify-between text-gray-500">
                                <span>SD ({sdRate}%){vatInclusive ? ' (incl.)' : ''}</span>
                                <span>৳{totals.sd.toFixed(2)}</span>
                            </div>
                        )}
                        <div className="flex justify-between font-bold text-gray-900 text-base pt-1 border-t border-gray-200">
                            <span>Grand Total</span>
                            <span>৳{totals.grandTotal.toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Collect Payment CTA */}
                    <button
                        disabled={
                            !currentShift ||
                            cart.items.length === 0 ||
                            (cart.orderType === 'dine' && !cart.tableId) ||
                            (cart.orderType === 'parcel' && !cart.customerName?.trim()) ||
                            (cart.orderType === 'delivery' && (!cart.customerName?.trim() || !cart.customerPhone?.trim() || !cart.deliveryAddress?.trim()))
                        }
                        onClick={() => setShowCheckout(true)}
                        className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors text-sm"
                    >
                        <HiOutlineCash className="w-5 h-5" />
                        Collect Payment — ৳{totals.grandTotal.toFixed(2)}
                    </button>

                    {cart.orderType === 'dine' && !cart.tableId && cart.items.length > 0 && (
                        <p className="text-xs text-center text-amber-600">Please select a table to proceed</p>
                    )}
                    {cart.orderType === 'parcel' && !cart.customerName?.trim() && cart.items.length > 0 && (
                        <p className="text-xs text-center text-amber-600">Customer name is required for takeaway</p>
                    )}
                    {cart.orderType === 'delivery' && (!cart.customerName?.trim() || !cart.customerPhone?.trim() || !cart.deliveryAddress?.trim()) && cart.items.length > 0 && (
                        <p className="text-xs text-center text-amber-600">Delivery orders require name, phone, and address</p>
                    )}
                    {!currentShift && cart.items.length > 0 && (
                        <p className="text-xs text-center text-amber-600">Open a shift before collecting payment</p>
                    )}
                </div>
            </div>

            {/* Checkout modal */}
            {showCheckout && (
                <POSCheckoutModal
                    cart={cart}
                    totals={totals}
                    onSuccess={handleOrderSuccess}
                    onClose={() => setShowCheckout(false)}
                />
            )}
        </div>
    );
}
