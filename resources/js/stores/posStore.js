import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const TAX_RATE_DEFAULT = 0; // will be overridden per tenant at render time

function emptyCart(label = 'Order 1') {
    return {
        id: Date.now().toString(),
        label,
        orderType: 'dine',   // dine | parcel | quick | delivery
        tableId: null,
        tableName: null,
        customerName: '',
        customerPhone: '',
        deliveryAddress: '',
        notes: '',
        items: [],
        voucherCode: '',
        voucherDiscount: 0,
        voucherId: null,
    };
}

export const usePosStore = create(
    persist(
        (set, get) => ({
            carts: [emptyCart('Order 1')],
            activeCartId: null, // null = use first cart

            // ── Active cart helpers ────────────────────────────────────
            getActiveCart() {
                const { carts, activeCartId } = get();
                if (!carts.length) return null;
                return carts.find((c) => c.id === activeCartId) ?? carts[0];
            },

            setActiveCart(id) {
                set({ activeCartId: id });
            },

            // ── Cart creation / deletion ───────────────────────────────
            createCart() {
                const { carts } = get();
                const label = `Order ${carts.length + 1}`;
                const newCart = emptyCart(label);
                set({ carts: [...carts, newCart], activeCartId: newCart.id });
            },

            deleteCart(id) {
                const { carts, activeCartId } = get();
                const remaining = carts.filter((c) => c.id !== id);
                if (!remaining.length) {
                    const fresh = emptyCart('Order 1');
                    set({ carts: [fresh], activeCartId: fresh.id });
                    return;
                }
                const newActiveId =
                    activeCartId === id ? remaining[remaining.length - 1].id : activeCartId;
                set({ carts: remaining, activeCartId: newActiveId });
            },

            clearActiveCart() {
                const { carts, activeCartId } = get();
                const fresh = emptyCart('Order 1');
                if (carts.length === 1) {
                    set({ carts: [fresh], activeCartId: fresh.id });
                } else {
                    set({
                        carts: carts.filter((c) => c.id !== (activeCartId ?? carts[0].id)),
                        activeCartId: null,
                    });
                }
            },

            // ── Cart field setters ─────────────────────────────────────
            _updateActive(updater) {
                const { carts, activeCartId } = get();
                const targetId = activeCartId ?? carts[0]?.id;
                set({
                    carts: carts.map((c) => (c.id === targetId ? { ...c, ...updater(c) } : c)),
                });
            },

            setOrderType(type) {
                get()._updateActive((cart) => ({
                    orderType: type,
                    tableId: type !== 'dine' ? null : undefined,
                    tableName: type !== 'dine' ? null : undefined,
                    deliveryAddress: type === 'delivery' ? (cart.deliveryAddress ?? '') : '',
                }));
            },

            setTable(tableId, tableName) {
                get()._updateActive(() => ({ tableId, tableName }));
            },

            setCustomer(name, phone) {
                get()._updateActive(() => ({ customerName: name, customerPhone: phone }));
            },

            setDeliveryAddress(deliveryAddress) {
                get()._updateActive(() => ({ deliveryAddress }));
            },

            setNotes(notes) {
                get()._updateActive(() => ({ notes }));
            },

            setVoucher(code, discount, voucherId) {
                get()._updateActive(() => ({
                    voucherCode: code,
                    voucherDiscount: discount,
                    voucherId,
                }));
            },

            clearVoucher() {
                get()._updateActive(() => ({
                    voucherCode: '',
                    voucherDiscount: 0,
                    voucherId: null,
                }));
            },

            updateCartLabel(id, label) {
                const { carts } = get();
                set({ carts: carts.map((c) => (c.id === id ? { ...c, label } : c)) });
            },

            // ── Items ──────────────────────────────────────────────────
            addItem(menuItem) {
                get()._updateActive((cart) => {
                    const existing = cart.items.find((i) => i.menu_item_id === menuItem.id);
                    if (existing) {
                        return {
                            items: cart.items.map((i) =>
                                i.menu_item_id === menuItem.id ? { ...i, qty: i.qty + 1 } : i
                            ),
                        };
                    }
                    return {
                        items: [
                            ...cart.items,
                            {
                                menu_item_id: menuItem.id,
                                name: menuItem.name,
                                price: parseFloat(menuItem.price),
                                qty: 1,
                                special_instructions: '',
                            },
                        ],
                    };
                });
            },

            updateQty(menuItemId, qty) {
                if (qty <= 0) {
                    get().removeItem(menuItemId);
                    return;
                }
                get()._updateActive((cart) => ({
                    items: cart.items.map((i) =>
                        i.menu_item_id === menuItemId ? { ...i, qty } : i
                    ),
                }));
            },

            updateInstructions(menuItemId, instructions) {
                get()._updateActive((cart) => ({
                    items: cart.items.map((i) =>
                        i.menu_item_id === menuItemId
                            ? { ...i, special_instructions: instructions }
                            : i
                    ),
                }));
            },

            removeItem(menuItemId) {
                get()._updateActive((cart) => ({
                    items: cart.items.filter((i) => i.menu_item_id !== menuItemId),
                }));
            },

            // ── Totals ─────────────────────────────────────────────────
            getCartTotals(vatRate = TAX_RATE_DEFAULT, vatInclusive = false, sdRate = 0) {
                const cart = get().getActiveCart();
                if (!cart) {
                    return {
                        subtotal: 0,
                        discount: 0,
                        netAmount: 0,
                        vat: 0,
                        sd: 0,
                        grandTotal: 0,
                    };
                }

                const subtotal = cart.items.reduce((s, i) => s + i.price * i.qty, 0);
                const discount = cart.voucherDiscount ?? 0;
                const afterDiscount = Math.max(0, subtotal - discount);

                let vat;
                let sd;
                let netAmount;
                let grandTotal;

                if (vatInclusive) {
                    // VAT and SD are already included in prices.
                    const combinedRate = vatRate + sdRate;
                    const taxTotal = combinedRate > 0
                        ? Math.round(afterDiscount * (combinedRate / (100 + combinedRate)) * 100) / 100
                        : 0;

                    vat = combinedRate > 0
                        ? Math.round(taxTotal * (vatRate / combinedRate) * 100) / 100
                        : 0;
                    sd = Math.round((taxTotal - vat) * 100) / 100;
                    netAmount = Math.round((afterDiscount - taxTotal) * 100) / 100;
                    grandTotal = afterDiscount;
                } else {
                    // VAT/SD exclusive — add on top
                    netAmount = afterDiscount;
                    vat = Math.round(afterDiscount * (vatRate / 100) * 100) / 100;
                    sd = Math.round(afterDiscount * (sdRate / 100) * 100) / 100;
                    grandTotal = afterDiscount + vat + sd;
                }

                return { subtotal, discount, netAmount, vat, sd, grandTotal };
            },

            getTotalItems() {
                const cart = get().getActiveCart();
                if (!cart) return 0;
                return cart.items.reduce((s, i) => s + i.qty, 0);
            },
        }),
        {
            name: 'pos-store',
            partialize: (state) => ({ carts: state.carts, activeCartId: state.activeCartId }),
        }
    )
);
