import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { orderAPI } from '../../services/api';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import StatusBadge from '../../components/ui/StatusBadge';
import POSInvoice from '../../components/POSInvoice';
import { restaurantThemeStyle } from '../../utils/restaurantTheme';
import {
    HiOutlineDocumentText,
    HiOutlineCash,
    HiOutlineCreditCard,
    HiOutlineClock,
    HiOutlineClipboardList,
    HiOutlineRefresh,
} from 'react-icons/hi';

const STATUS_STEPS = ['placed', 'confirmed', 'preparing', 'ready', 'served', 'completed'];
const STATUS_EMOJIS = { placed: '📋', confirmed: '✅', preparing: '👨‍🍳', ready: '🔔', served: '🍽️', completed: '🎉' };

// Get recent orders from localStorage
function getRecentOrders() {
    try {
        return JSON.parse(localStorage.getItem('recent_orders') || '[]');
    } catch { return []; }
}

function getStoredAccessToken(orderNumber) {
    try {
        const orders = JSON.parse(localStorage.getItem('recent_orders') || '[]');
        const match = orders.find((o) => o.orderNumber === orderNumber && o.accessToken);
        return match?.accessToken || '';
    } catch {
        return '';
    }
}

export default function OrderTrackingPage() {
    const { orderNumber } = useParams();
    const [searchParams] = useSearchParams();
    const [showInvoice, setShowInvoice] = useState(false);
    const [invoiceData, setInvoiceData] = useState(null);
    const [recentOrders, setRecentOrders] = useState([]);
    const urlAccessToken = searchParams.get('access_token') || '';
    const accessToken = urlAccessToken || getStoredAccessToken(orderNumber);

    useEffect(() => {
        setRecentOrders(getRecentOrders());
    }, []);

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['track-order', orderNumber, accessToken],
        queryFn: () => orderAPI.track(orderNumber, accessToken || undefined).then((r) => r.data.data),
        refetchInterval: 5000,
        enabled: !!orderNumber,
    });

    useEffect(() => {
        if (!orderNumber || !urlAccessToken) return;

        try {
            const globalKey = 'recent_orders';
            const globalOrders = JSON.parse(localStorage.getItem(globalKey) || '[]');
            const globalUpdated = globalOrders.map((order) => (
                order.orderNumber === orderNumber
                    ? { ...order, accessToken: urlAccessToken }
                    : order
            ));
            localStorage.setItem(globalKey, JSON.stringify(globalUpdated));
        } catch {
            // Ignore storage errors
        }
    }, [orderNumber, urlAccessToken]);

    const handleViewInvoice = async () => {
        try {
            const res = await orderAPI.invoice(orderNumber, accessToken || undefined);
            setInvoiceData(res.data.data);
            setShowInvoice(true);
        } catch {
            setInvoiceData({ order: data, restaurant: null });
            setShowInvoice(true);
        }
    };

    if (isLoading) return <LoadingSpinner fullScreen />;

    if (!data) {
        return (
            <div className="min-h-screen bg-gray-50 py-8 px-4">
                <div className="max-w-md mx-auto">
                    <div className="text-center py-12">
                        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <HiOutlineClipboardList className="w-10 h-10 text-gray-400" />
                        </div>
                        <p className="text-xl font-bold text-gray-800">Order Not Found</p>
                        <p className="text-gray-500 mt-2 text-sm">Check the order number and try again</p>
                    </div>

                    {/* Recent Orders from localStorage */}
                    {recentOrders.length > 0 && (
                        <div className="mt-8">
                            <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                                <HiOutlineClock className="w-4 h-4" /> Your Recent Orders
                            </h3>
                            <div className="space-y-2">
                                {recentOrders.map((order, i) => (
                                    <Link
                                        key={i}
                                        to={order.accessToken
                                            ? `/order/${order.orderNumber}?access_token=${encodeURIComponent(order.accessToken)}`
                                            : `/order/${order.orderNumber}`}
                                        className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-gray-100 hover:border-restaurant/40 transition"
                                    >
                                        <div>
                                            <p className="font-semibold text-sm text-gray-900">#{order.orderNumber}</p>
                                            <p className="text-xs text-gray-400 mt-0.5">
                                                {new Date(order.placedAt).toLocaleDateString()} at {new Date(order.placedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                        <span className="text-restaurant-ink text-xs font-medium">Track →</span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    const currentIdx = STATUS_STEPS.indexOf(data.status);
    const isPaid = data.payment_status === 'paid';
    const isActive = !['completed', 'cancelled'].includes(data.status);

    return (
        <div className="min-h-screen bg-gray-50 py-6 px-4" style={restaurantThemeStyle(data.restaurant?.primary_color)}>
            <div className="max-w-md mx-auto">
                {/* Header with refresh */}
                <div className="text-center mb-6">
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <h1 className="text-xl font-bold text-gray-900">Order #{data.order_number}</h1>
                        {isActive && (
                            <button onClick={() => refetch()} className="p-1.5 rounded-full hover:bg-gray-100 transition text-gray-400">
                                <HiOutlineRefresh className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                        <StatusBadge status={data.status} />
                        <span className="text-xs text-gray-400 px-2 py-1 bg-gray-100 rounded-full capitalize">
                            {data.type === 'dine' ? '🍽️ Dine-in' : '📦 Takeaway'}
                        </span>
                    </div>
                    {isActive && (
                        <p className="text-xs text-gray-400 mt-2 animate-pulse">Auto-refreshing every 5s</p>
                    )}
                </div>

                {/* Large Status Display for active orders */}
                {isActive && (
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 mb-5 text-center">
                        <div className="text-5xl mb-3">{STATUS_EMOJIS[data.status] || '📋'}</div>
                        <p className="text-lg font-bold text-gray-900 capitalize">{data.status}</p>
                        <p className="text-sm text-gray-500 mt-1">
                            {data.status === 'placed' && 'Waiting for the restaurant to confirm your order'}
                            {data.status === 'confirmed' && 'Your order has been confirmed'}
                            {data.status === 'preparing' && 'The kitchen is preparing your food'}
                            {data.status === 'ready' && 'Your food is ready for pickup!'}
                            {data.status === 'served' && 'Your food has been served'}
                        </p>
                    </div>
                )}

                {/* Payment Status Card */}
                <div className={`rounded-2xl p-4 shadow-sm mb-4 ${isPaid ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            {data.payment_method === 'cash' ? (
                                <div className="w-10 h-10 rounded-full bg-restaurant/15 flex items-center justify-center">
                                    <HiOutlineCash className="w-5 h-5 text-restaurant-ink" />
                                </div>
                            ) : (
                                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                                    <HiOutlineCreditCard className="w-5 h-5 text-purple-600" />
                                </div>
                            )}
                            <div>
                                <p className="font-semibold text-gray-900 text-sm">
                                    {data.payment_method === 'cash' ? 'Pay at Counter' : 'Online Payment'}
                                </p>
                                <p className={`text-xs font-medium ${isPaid ? 'text-green-600' : 'text-amber-600'}`}>
                                    {isPaid ? '✓ Payment Received' : '⏳ Payment Pending'}
                                </p>
                            </div>
                        </div>
                        <p className="text-lg font-bold text-gray-900">৳{parseFloat(data.grand_total).toFixed(2)}</p>
                    </div>
                    {data.payment_method === 'cash' && !isPaid && (
                        <p className="text-xs text-amber-700 mt-3 bg-amber-100 rounded-xl p-2 text-center">
                            Please pay <strong>৳{parseFloat(data.grand_total).toFixed(2)}</strong> at the counter
                        </p>
                    )}
                    {data.payment_method === 'online' && !isPaid && data.payment_url && (
                        <a href={data.payment_url} className="block mt-3 text-center bg-restaurant text-on-restaurant text-sm font-medium py-2.5 rounded-xl hover:opacity-90 transition">
                            Complete Payment
                        </a>
                    )}
                    {data.transaction_id && (
                        <p className="text-xs text-gray-500 mt-2">Transaction: {data.transaction_id}</p>
                    )}
                </div>

                {/* Invoice Button */}
                <button
                    onClick={handleViewInvoice}
                    className="w-full mb-4 flex items-center justify-center gap-2 py-3 bg-white border border-gray-200 rounded-2xl text-gray-700 font-medium text-sm hover:bg-gray-50 shadow-sm transition active:scale-[0.98]"
                >
                    <HiOutlineDocumentText className="w-5 h-5" />
                    View & Download Invoice
                </button>

                {/* Progress Steps - compact */}
                {data.status !== 'cancelled' && (
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
                        <h3 className="font-semibold text-sm mb-4">Order Progress</h3>
                        <div className="space-y-3">
                            {STATUS_STEPS.map((step, i) => {
                                const isCompleted = i <= currentIdx;
                                const isCurrent = i === currentIdx;
                                return (
                                    <div key={step} className="flex items-center gap-3">
                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                                            isCompleted ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'
                                        } ${isCurrent ? 'ring-3 ring-green-200' : ''}`}>
                                            {isCompleted ? '✓' : i + 1}
                                        </div>
                                        <p className={`text-sm font-medium capitalize flex-1 ${isCompleted ? 'text-green-700' : 'text-gray-400'}`}>
                                            {step}
                                        </p>
                                        {isCurrent && (
                                            <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full animate-pulse font-medium">Current</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {data.status === 'cancelled' && (
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center mb-4">
                        <p className="text-red-600 font-bold">❌ Order Cancelled</p>
                    </div>
                )}

                {/* Order Items */}
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
                    <h3 className="font-semibold text-sm mb-3">Items ({data.items?.length})</h3>
                    <div className="space-y-2.5">
                        {data.items?.map((item) => (
                            <div key={item.id} className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-full bg-gray-100 text-xs font-bold flex items-center justify-center text-gray-600">{item.qty}</span>
                                    <span className="text-sm text-gray-800">{item.menu_item?.name}</span>
                                </div>
                                <span className="text-sm font-medium text-gray-700">৳{parseFloat(item.line_total).toFixed(2)}</span>
                            </div>
                        ))}
                    </div>
                    <div className="border-t mt-3 pt-3 space-y-1.5">
                        <div className="flex justify-between text-xs">
                            <span className="text-gray-500">Subtotal</span><span>৳{parseFloat(data.subtotal).toFixed(2)}</span>
                        </div>
                        {parseFloat(data.discount) > 0 && (
                            <div className="flex justify-between text-xs text-green-600">
                                <span>Discount</span><span>-৳{parseFloat(data.discount).toFixed(2)}</span>
                            </div>
                        )}
                        {parseFloat(data.tax) > 0 && (
                            <div className="flex justify-between text-xs">
                                <span className="text-gray-500">Tax</span><span>৳{parseFloat(data.tax).toFixed(2)}</span>
                            </div>
                        )}
                        <div className="flex justify-between font-bold text-base pt-2 border-t border-gray-100">
                            <span>Total</span><span>৳{parseFloat(data.grand_total).toFixed(2)}</span>
                        </div>
                    </div>
                </div>

                {/* Customer Details */}
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
                    <h3 className="font-semibold text-sm mb-3">Details</h3>
                    <div className="text-xs space-y-2 text-gray-600">
                        {data.table && <p>🪑 Table: <strong>{data.table.table_number}</strong></p>}
                        {data.customer_name && <p>👤 Name: <strong>{data.customer_name}</strong></p>}
                        {data.customer_phone && <p>📞 Phone: <strong>{data.customer_phone}</strong></p>}
                        <p>🕐 Placed: {new Date(data.created_at).toLocaleString()}</p>
                        {data.paid_at && <p>💰 Paid: {new Date(data.paid_at).toLocaleString()}</p>}
                    </div>
                </div>

                {/* Recent orders link */}
                {recentOrders.length > 1 && (
                    <div className="mb-4">
                        <h3 className="font-semibold text-sm text-gray-700 mb-2 flex items-center gap-2">
                            <HiOutlineClock className="w-4 h-4" /> Your Other Orders
                        </h3>
                        <div className="space-y-1.5">
                            {recentOrders
                                .filter(o => o.orderNumber !== orderNumber)
                                .slice(0, 5)
                                .map((order, i) => (
                                    <Link
                                        key={i}
                                        to={order.accessToken
                                            ? `/order/${order.orderNumber}?access_token=${encodeURIComponent(order.accessToken)}`
                                            : `/order/${order.orderNumber}`}
                                        className="flex items-center justify-between bg-white p-3 rounded-xl shadow-sm border border-gray-100 text-sm hover:border-restaurant/40 transition"
                                    >
                                        <span className="font-medium text-gray-700">#{order.orderNumber}</span>
                                        <span className="text-xs text-gray-400">{new Date(order.placedAt).toLocaleDateString()}</span>
                                    </Link>
                                ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Invoice Modal */}
            {showInvoice && invoiceData && (
                <POSInvoice
                    data={invoiceData}
                    onClose={() => setShowInvoice(false)}
                />
            )}
        </div>
    );
}
