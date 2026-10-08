import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useOutletContext, useSearchParams, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useCartStore } from '../../stores/cartStore';
import { customerAPI } from '../../services/api';
import { restaurantColor, restaurantTheme } from '../../utils/restaurantTheme';
import toast from 'react-hot-toast';
import {
    HiOutlineCash,
    HiOutlineCreditCard,
    HiOutlineArrowLeft,
    HiOutlineShoppingBag,
    HiOutlineTag,
    HiOutlineUser,
    HiOutlinePhone,
    HiOutlineAnnotation,
    HiOutlineClock,
    HiOutlineDocumentText,
} from 'react-icons/hi';

// Helper: save recent orders to localStorage
function saveRecentOrder(slug, orderNumber, accessToken = null) {
    try {
        const key = `recent_orders_${slug}`;
        const orders = JSON.parse(localStorage.getItem(key) || '[]');
        const entry = { orderNumber, placedAt: new Date().toISOString(), accessToken };
        const updated = [entry, ...orders.filter(o => o.orderNumber !== orderNumber)].slice(0, 10);
        localStorage.setItem(key, JSON.stringify(updated));
        // Also save globally
        const globalKey = 'recent_orders';
        const globalOrders = JSON.parse(localStorage.getItem(globalKey) || '[]');
        const globalEntry = { orderNumber, slug, placedAt: new Date().toISOString(), accessToken };
        const globalUpdated = [globalEntry, ...globalOrders.filter(o => o.orderNumber !== orderNumber)].slice(0, 20);
        localStorage.setItem(globalKey, JSON.stringify(globalUpdated));
    } catch { /* ignore */ }
}

export default function CustomerCartPage() {
    const { slug } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { restaurant, tableId } = useOutletContext() || {};
    const { items, removeItem, updateQty, clearCart, getSubtotal, getOrderPayload, setNotes } = useCartStore();

    const primaryColor = restaurantColor(restaurant?.primary_color);
    const { on: onColor, ink: inkColor } = restaurantTheme(primaryColor);

    const [voucher, setVoucher] = useState('');
    const [voucherData, setVoucherData] = useState(null);
    const [voucherLoading, setVoucherLoading] = useState(false);
    const [orderType, setOrderType] = useState(tableId ? 'dine' : 'parcel');
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [notes, setLocalNotes] = useState('');
    const [payingOnline, setPayingOnline] = useState(false);

    // Persist customer info for repeat visits
    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(`customer_info_${slug}`) || '{}');
            if (saved.name) setCustomerName(saved.name);
            if (saved.phone) setCustomerPhone(saved.phone);
        } catch { /* ignore */ }
    }, [slug]);

    const subtotal = getSubtotal();
    const discount = voucherData
        ? voucherData.type === 'percentage'
            ? subtotal * (voucherData.discount_value / 100)
            : Math.min(voucherData.discount_value, subtotal)
        : 0;
    const taxRate = parseFloat(restaurant?.default_vat_rate ?? restaurant?.tax_rate ?? 0);
    const vatInclusive = restaurant?.vat_inclusive || false;
    const taxableAmount = Math.max(subtotal - discount, 0);
    const tax = vatInclusive
        ? taxableAmount * (taxRate / (100 + taxRate))
        : taxableAmount * (taxRate / 100);
    const total = vatInclusive ? taxableAmount : taxableAmount + tax;

    const validateVoucher = async () => {
        if (!voucher.trim()) return;
        setVoucherLoading(true);
        try {
            const { data } = await customerAPI.validateVoucher(slug, voucher, subtotal);
            setVoucherData(data.data.voucher);
            toast.success('Voucher applied!');
        } catch (err) {
            setVoucherData(null);
            toast.error(err.response?.data?.message || 'Invalid voucher');
        } finally {
            setVoucherLoading(false);
        }
    };

    const placeOrder = useMutation({
        mutationFn: (payload) => customerAPI.placeOrder(slug, payload),
        onSuccess: (res) => {
            const orderData = res.data.data;
            const orderNumber = orderData.order_number;
            const accessToken = orderData.access_token || null;

            // Save customer info for next time
            if (customerName || customerPhone) {
                try {
                    localStorage.setItem(`customer_info_${slug}`, JSON.stringify({ name: customerName, phone: customerPhone }));
                } catch { /* ignore */ }
            }

            // Save to recent orders
            saveRecentOrder(slug, orderNumber, accessToken);

            clearCart();

            // If online payment and we got a payment URL, redirect
            if (paymentMethod === 'online' && orderData.payment_url) {
                setPayingOnline(true);
                toast.success('Redirecting to payment...');
                window.location.href = orderData.payment_url;
                return;
            }

            toast.success('Order placed!');
            const trackingUrl = accessToken
                ? `/order/${orderNumber}?access_token=${encodeURIComponent(accessToken)}`
                : `/order/${orderNumber}`;
            navigate(trackingUrl);
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Order failed'),
    });

    const handlePlace = () => {
        if (items.length === 0) return toast.error('Cart is empty');
        if (orderType === 'parcel' && (!customerName || !customerPhone)) {
            return toast.error('Name and phone required for takeaway');
        }

        const payload = {
            ...getOrderPayload(),
            type: orderType,
            tenant_slug: slug,
            table_id: tableId || null,
            voucher_code: voucherData?.code || undefined,
            customer_name: customerName || undefined,
            customer_phone: customerPhone || undefined,
            payment_method: paymentMethod,
            notes: notes || undefined,
        };

        placeOrder.mutate(payload);
    };

    return (
        <div className="pb-32 px-3">
            {/* Back + Header */}
            <div className="flex items-center gap-3 py-4">
                <Link to={`/restaurant/${slug}?${searchParams.toString()}`} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition">
                    <HiOutlineArrowLeft className="w-5 h-5 text-gray-600" />
                </Link>
                <h2 className="text-lg font-bold text-gray-900">Your Cart ({items.length})</h2>
            </div>

            {items.length === 0 ? (
                <div className="text-center py-16">
                    <HiOutlineShoppingBag className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                    <p className="text-gray-400 text-lg font-medium">Your cart is empty</p>
                    <Link to={`/restaurant/${slug}?${searchParams.toString()}`} className="inline-block mt-3 px-6 py-2.5 rounded-full text-on-restaurant text-sm font-medium" style={{ backgroundColor: primaryColor }}>
                        Browse Menu
                    </Link>
                </div>
            ) : (
                <>
                    {/* Cart Items */}
                    <div className="space-y-2.5 mb-5">
                        {items.map((item) => (
                            <div key={item.menu_item_id} className="bg-white rounded-2xl p-3.5 shadow-sm border border-gray-100">
                                <div className="flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold text-gray-900 text-sm truncate">{item.name}</h3>
                                        <p className="text-xs font-bold mt-0.5" style={{ color: inkColor }}>৳{parseFloat(item.price).toFixed(2)}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => updateQty(item.menu_item_id, item.qty - 1)}
                                            className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-sm font-bold active:bg-red-100 active:text-red-600 transition"
                                        >
                                            −
                                        </button>
                                        <span className="w-6 text-center font-bold text-sm">{item.qty}</span>
                                        <button
                                            onClick={() => updateQty(item.menu_item_id, item.qty + 1)}
                                            className="w-7 h-7 rounded-full text-on-restaurant flex items-center justify-center text-sm font-bold active:scale-90 transition"
                                            style={{ backgroundColor: primaryColor }}
                                        >
                                            +
                                        </button>
                                    </div>
                                    <p className="text-sm font-bold text-gray-900 w-14 text-right">
                                        ৳{(item.price * item.qty).toFixed(0)}
                                    </p>
                                </div>
                                {/* Remove button */}
                                <div className="flex justify-end mt-1">
                                    <button onClick={() => removeItem(item.menu_item_id)} className="text-xs text-red-400 hover:text-red-600 transition">Remove</button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Order Type Selection */}
                    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-3">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2.5 block">Order Type</label>
                        <div className="flex gap-2">
                            {tableId && (
                                <button
                                    onClick={() => setOrderType('dine')}
                                    className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                                    style={orderType === 'dine' ? { backgroundColor: primaryColor, color: onColor } : { backgroundColor: '#f3f4f6', color: '#6b7280' }}
                                >
                                    🍽️ Dine-in
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    setOrderType('parcel');
                                    // Reset to cash if pay_later was selected (not available for parcel)
                                    if (paymentMethod === 'pay_later') setPaymentMethod('cash');
                                }}
                                className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                                style={orderType === 'parcel' ? { backgroundColor: primaryColor, color: onColor } : { backgroundColor: '#f3f4f6', color: '#6b7280' }}
                            >
                                📦 Takeaway
                            </button>
                        </div>
                    </div>

                    {/* Customer Info - always shown, required fields differ by type */}
                    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-3 space-y-3">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block">
                            Customer Info {orderType === 'dine' && <span className="text-gray-400 normal-case">(optional)</span>}
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="relative">
                                <HiOutlineUser className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <input
                                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-restaurant/20 focus:border-restaurant outline-none"
                                    placeholder={orderType === 'parcel' ? 'Name *' : 'Name'}
                                    value={customerName}
                                    onChange={(e) => setCustomerName(e.target.value)}
                                />
                            </div>
                            <div className="relative">
                                <HiOutlinePhone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <input
                                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-restaurant/20 focus:border-restaurant outline-none"
                                    placeholder={orderType === 'parcel' ? 'Phone *' : 'Phone'}
                                    value={customerPhone}
                                    onChange={(e) => setCustomerPhone(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Order Notes */}
                    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-3">
                        <div className="relative">
                            <HiOutlineAnnotation className="absolute left-3 top-3 text-gray-400 w-4 h-4" />
                            <textarea
                                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-restaurant/20 focus:border-restaurant outline-none resize-none"
                                placeholder="Special instructions or notes..."
                                rows={2}
                                value={notes}
                                onChange={(e) => { setLocalNotes(e.target.value); setNotes(e.target.value); }}
                            />
                        </div>
                    </div>

                    {/* Voucher */}
                    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-3">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2.5 block">Voucher Code</label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <HiOutlineTag className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <input
                                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-restaurant/20 focus:border-restaurant outline-none disabled:bg-gray-50"
                                    placeholder="Enter code"
                                    value={voucher}
                                    onChange={(e) => setVoucher(e.target.value.toUpperCase())}
                                    disabled={!!voucherData}
                                    onKeyDown={(e) => e.key === 'Enter' && validateVoucher()}
                                />
                            </div>
                            {voucherData ? (
                                <button onClick={() => { setVoucherData(null); setVoucher(''); }} className="px-4 py-2.5 text-xs text-red-600 border border-red-200 rounded-xl hover:bg-red-50 font-medium">
                                    Remove
                                </button>
                            ) : (
                                <button
                                    onClick={validateVoucher}
                                    className="px-5 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-40 transition"
                                    style={{ backgroundColor: '#1f2937' }}
                                    disabled={!voucher.trim() || voucherLoading}
                                >
                                    {voucherLoading ? '...' : 'Apply'}
                                </button>
                            )}
                        </div>
                        {voucherData && (
                            <div className="mt-2 flex items-center gap-1.5 text-green-600">
                                <span className="text-sm">✓</span>
                                <p className="text-sm font-medium">
                                    {voucherData.type === 'percentage' ? `${voucherData.discount_value}% off` : `৳${voucherData.discount_value} off`} applied!
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Payment Method */}
                    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-3">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 block">Payment Method</label>
                        <div className={`grid gap-3 ${orderType === 'dine' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                            <button
                                onClick={() => setPaymentMethod('cash')}
                                className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all ${
                                    paymentMethod === 'cash'
                                        ? 'border-restaurant bg-restaurant/10'
                                        : 'border-gray-200 bg-white hover:border-gray-300'
                                }`}
                            >
                                <HiOutlineCash className="w-6 h-6" style={{ color: paymentMethod === 'cash' ? inkColor : '#6b7280' }} />
                                <span className="text-xs font-medium" style={{ color: paymentMethod === 'cash' ? inkColor : '#6b7280' }}>Counter</span>
                            </button>
                            <button
                                onClick={() => setPaymentMethod('online')}
                                className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all ${
                                    paymentMethod === 'online'
                                        ? 'border-restaurant bg-restaurant/10'
                                        : 'border-gray-200 bg-white hover:border-gray-300'
                                }`}
                            >
                                <HiOutlineCreditCard className="w-6 h-6" style={{ color: paymentMethod === 'online' ? inkColor : '#6b7280' }} />
                                <span className="text-xs font-medium" style={{ color: paymentMethod === 'online' ? inkColor : '#6b7280' }}>Online</span>
                            </button>
                            {orderType === 'dine' && (
                                <button
                                    onClick={() => setPaymentMethod('pay_later')}
                                    className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all ${
                                        paymentMethod === 'pay_later'
                                            ? 'border-restaurant bg-restaurant/10'
                                            : 'border-gray-200 bg-white hover:border-gray-300'
                                    }`}
                                >
                                    <HiOutlineClock className="w-6 h-6" style={{ color: paymentMethod === 'pay_later' ? inkColor : '#6b7280' }} />
                                    <span className="text-xs font-medium" style={{ color: paymentMethod === 'pay_later' ? inkColor : '#6b7280' }}>Pay Later</span>
                                </button>
                            )}
                        </div>
                        {paymentMethod === 'online' && (
                            <div className="mt-3 p-3 bg-restaurant/10 border border-restaurant/30 rounded-xl">
                                <p className="text-xs text-gray-700">
                                    You will be redirected to SSLCommerz secure payment gateway.
                                </p>
                            </div>
                        )}
                        {paymentMethod === 'pay_later' && (
                            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                                <p className="text-xs text-amber-700">
                                    Pay at the end of your meal. A waiter will bring the bill to your table.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Invoice Preview */}
                    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-3">
                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                            <HiOutlineDocumentText className="w-5 h-5 text-gray-500" />
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Order Summary</span>
                        </div>

                        {/* Item details */}
                        <div className="space-y-1.5 mb-3 pb-3 border-b border-dashed border-gray-200">
                            {items.map((item) => (
                                <div key={item.menu_item_id} className="flex justify-between text-sm">
                                    <span className="text-gray-600">{item.qty}x {item.name}</span>
                                    <span className="text-gray-800">৳{(item.price * item.qty).toFixed(2)}</span>
                                </div>
                            ))}
                        </div>

                        {/* Billing details */}
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Subtotal</span>
                                <span className="font-medium">৳{subtotal.toFixed(2)}</span>
                            </div>
                            {discount > 0 && (
                                <div className="flex justify-between text-sm text-green-600">
                                    <span>Discount</span>
                                    <span className="font-medium">-৳{discount.toFixed(2)}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">VAT/Tax ({taxRate || 0}%)</span>
                                <span className="font-medium">৳{tax.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-200">
                                <span>Total Payable</span>
                                <span style={{ color: inkColor }}>৳{total.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Validation messages */}
                    {orderType === 'parcel' && (!customerName?.trim() || !customerPhone?.trim()) && (
                        <p className="text-xs text-center text-amber-600 mb-2 bg-amber-50 rounded-xl py-2">Customer name & phone required for takeaway orders</p>
                    )}
                </>
            )}

            {/* Fixed Place Order Button */}
            {items.length > 0 && (
                <div className="fixed bottom-0 left-0 right-0 p-3 bg-white border-t border-gray-100 max-w-lg mx-auto safe-area-bottom">
                    <button
                        onClick={handlePlace}
                        disabled={placeOrder.isPending || payingOnline}
                        className="w-full py-3.5 text-on-restaurant rounded-2xl text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-50 shadow-lg"
                        style={{ backgroundColor: primaryColor }}
                    >
                        {payingOnline
                            ? 'Redirecting to payment...'
                            : placeOrder.isPending
                                ? 'Placing order...'
                                : paymentMethod === 'online'
                                    ? `Place Order & Pay — ৳${total.toFixed(2)}`
                                    : paymentMethod === 'pay_later'
                                        ? `Place Order (Pay Later) — ৳${total.toFixed(2)}`
                                        : `Place Order — ৳${total.toFixed(2)}`}
                    </button>
                </div>
            )}
        </div>
    );
}
