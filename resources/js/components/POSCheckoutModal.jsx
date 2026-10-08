import React, { useState } from 'react';
import {
    HiOutlineCash,
    HiOutlineCreditCard,
    HiOutlineDeviceMobile,
    HiOutlinePrinter,
    HiOutlineX,
    HiOutlineCheckCircle,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import { posAPI } from '../services/api';
import { orderAPI } from '../services/api';
import POSInvoice from './POSInvoice';

const PAYMENT_METHODS = [
    {
        id: 'cash',
        label: 'Cash',
        icon: HiOutlineCash,
        color: 'blue',
    },
    {
        id: 'card',
        label: 'Card / POS Machine',
        icon: HiOutlineCreditCard,
        color: 'purple',
    },
    {
        id: 'mobile_banking',
        label: 'Mobile Banking',
        icon: HiOutlineDeviceMobile,
        color: 'green',
    },
];

const colorMap = {
    blue:   { ring: 'ring-blue-500',   bg: 'bg-blue-50',   text: 'text-blue-700',   icon: 'text-blue-500' },
    purple: { ring: 'ring-purple-500', bg: 'bg-purple-50', text: 'text-purple-700', icon: 'text-purple-500' },
    green:  { ring: 'ring-green-500',  bg: 'bg-green-50',  text: 'text-green-700',  icon: 'text-green-500' },
};

export default function POSCheckoutModal({ cart, totals, onSuccess, onClose }) {
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [tendered, setTendered]           = useState('');
    const [transactionId, setTransactionId] = useState('');
    const [loading, setLoading]             = useState(false);
    const [invoiceData, setInvoiceData]     = useState(null);

    const change = paymentMethod === 'cash'
        ? Math.max(0, parseFloat(tendered || 0) - totals.grandTotal)
        : 0;

    const canSubmit =
        cart.items.length > 0 &&
        !loading &&
        (paymentMethod !== 'cash' || parseFloat(tendered || 0) >= totals.grandTotal);

    async function placeOrder(payStatus) {
        setLoading(true);
        try {
            const payload = {
                type:            cart.orderType,
                table_id:        cart.tableId ?? undefined,
                customer_name:   cart.customerName || undefined,
                customer_phone:  cart.customerPhone || undefined,
                notes:           cart.notes || undefined,
                items: cart.items.map((i) => ({
                    menu_item_id:         i.menu_item_id,
                    qty:                  i.qty,
                    special_instructions: i.special_instructions || undefined,
                })),
                voucher_code:    cart.voucherCode || undefined,
                payment_method:  paymentMethod,
                payment_status:  payStatus,
                transaction_id:  transactionId || undefined,
            };

            const res = await posAPI.createOrder(payload);
            const order = res.data?.data;

            // Fetch invoice data (includes restaurant info)
            const invRes = await orderAPI.invoice(order.order_number);
            setInvoiceData(invRes.data?.data ?? { order, restaurant: null });

            toast.success('Order created!');
        } catch (err) {
            const msg = err.response?.data?.message ?? 'Failed to create order';
            toast.error(msg);
            setLoading(false);
        }
    }

    function handleInvoiceClose() {
        setInvoiceData(null);
        onSuccess();
    }

    if (invoiceData) {
        return (
            <POSInvoice
                data={invoiceData}
                onClose={handleInvoiceClose}
            />
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b">
                    <h2 className="text-lg font-semibold text-gray-900">Collect Payment</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <HiOutlineX className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {/* Grand Total */}
                    <div className="text-center py-3 bg-gray-50 rounded-xl">
                        <p className="text-sm text-gray-500 mb-1">Total Amount Due</p>
                        <p className="text-4xl font-bold text-gray-900">
                            ৳{totals.grandTotal.toFixed(2)}
                        </p>
                        {totals.discount > 0 && (
                            <p className="text-sm text-green-600 mt-1">
                                Voucher discount: -৳{totals.discount.toFixed(2)}
                            </p>
                        )}
                    </div>

                    {/* Payment method selector */}
                    <div>
                        <p className="text-sm font-medium text-gray-700 mb-2">Payment Method</p>
                        <div className="grid grid-cols-3 gap-2">
                            {PAYMENT_METHODS.map((m) => {
                                const c = colorMap[m.color];
                                const active = paymentMethod === m.id;
                                return (
                                    <button
                                        key={m.id}
                                        onClick={() => {
                                            setPaymentMethod(m.id);
                                            setTendered('');
                                            setTransactionId('');
                                        }}
                                        className={`flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all text-center ${
                                            active
                                                ? `${c.bg} ${c.ring} ring-2 border-transparent ${c.text}`
                                                : 'border-gray-200 text-gray-500 hover:border-gray-300'
                                        }`}
                                    >
                                        <m.icon className={`w-6 h-6 ${active ? c.icon : 'text-gray-400'}`} />
                                        <span className="text-xs font-medium leading-tight">{m.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Cash: tendered + change */}
                    {paymentMethod === 'cash' && (
                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Tendered Amount (৳)
                                </label>
                                <input
                                    type="number"
                                    min={totals.grandTotal}
                                    step="0.01"
                                    value={tendered}
                                    onChange={(e) => setTendered(e.target.value)}
                                    placeholder={`Min ৳${totals.grandTotal.toFixed(2)}`}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-lg font-semibold focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
                                    autoFocus
                                />
                            </div>
                            {parseFloat(tendered || 0) > 0 && (
                                <div className={`flex justify-between items-center px-4 py-2.5 rounded-lg ${change > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                                    <span className="font-medium">Change Due</span>
                                    <span className="text-xl font-bold">৳{change.toFixed(2)}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Card / Mobile banking: reference field */}
                    {(paymentMethod === 'card' || paymentMethod === 'mobile_banking') && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                {paymentMethod === 'card' ? 'Card / POS Reference No.' : 'bKash / Nagad Transaction ID'}
                                <span className="text-gray-400 font-normal ml-1">(optional)</span>
                            </label>
                            <input
                                type="text"
                                value={transactionId}
                                onChange={(e) => setTransactionId(e.target.value)}
                                placeholder="Enter reference number..."
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
                                autoFocus
                            />
                        </div>
                    )}

                    {/* Action buttons */}
                    <div className="space-y-2 pt-1">
                        <button
                            disabled={!canSubmit}
                            onClick={() => placeOrder('paid')}
                            className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
                        >
                            {loading ? (
                                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                </svg>
                            ) : (
                                <HiOutlineCheckCircle className="w-5 h-5" />
                            )}
                            Mark as Paid &amp; Print Receipt
                        </button>

                        <button
                            disabled={loading || cart.items.length === 0}
                            onClick={() => placeOrder('pending')}
                            className="w-full text-sm text-gray-500 hover:text-gray-700 py-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            Place Order — Pay Later
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
