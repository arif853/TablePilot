import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { orderAPI } from '../../services/api';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import StatusBadge from '../../components/ui/StatusBadge';
import Modal from '../../components/ui/Modal';
import POSInvoice from '../../components/POSInvoice';
import toast from 'react-hot-toast';
import { HiOutlineCash, HiOutlineCreditCard, HiOutlineDeviceMobile, HiOutlineDocumentText, HiOutlineCheckCircle, HiOutlineDesktopComputer } from 'react-icons/hi';

const STATUS_OPTIONS = ['placed', 'confirmed', 'preparing', 'ready', 'served', 'completed', 'cancelled'];

const PAYMENT_METHOD_MAP = {
    cash: { label: 'Cash', icon: HiOutlineCash },
    card: { label: 'Card', icon: HiOutlineCreditCard },
    mobile_banking: { label: 'mBanking', icon: HiOutlineDeviceMobile },
    online: { label: 'Online', icon: HiOutlineCreditCard },
};

const PaymentBadge = ({ status }) => {
    const colors = {
        paid: 'bg-green-100 text-green-700',
        pending: 'bg-amber-100 text-amber-700',
        failed: 'bg-red-100 text-red-700',
        refunded: 'bg-purple-100 text-purple-700',
    };
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
            {status === 'paid' && <HiOutlineCheckCircle className="w-3 h-3 mr-1" />}
            {(status || 'N/A').toUpperCase()}
        </span>
    );
};

export default function OrdersPage() {
    const queryClient = useQueryClient();
    const [filter, setFilter] = useState('');
    const [viewOrder, setViewOrder] = useState(null);
    const [invoiceData, setInvoiceData] = useState(null);
    const [loadingInvoice, setLoadingInvoice] = useState(false);

    const { data, isLoading } = useQuery({
        queryKey: ['orders', filter],
        queryFn: () => orderAPI.list({ status: filter || undefined, today: !filter ? true : undefined }).then((r) => r.data),
        refetchInterval: 10000,
    });

    const statusMutation = useMutation({
        mutationFn: ({ id, status }) => orderAPI.updateStatus(id, status),
        onSuccess: () => {
            queryClient.invalidateQueries(['orders']);
            toast.success('Status updated');
        },
    });

    const cancelMutation = useMutation({
        mutationFn: (id) => orderAPI.cancel(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['orders']);
            setViewOrder(null);
            toast.success('Order cancelled');
        },
    });

    const markPaidMutation = useMutation({
        mutationFn: (id) => orderAPI.markPaid(id),
        onSuccess: (res) => {
            queryClient.invalidateQueries(['orders']);
            const updated = res.data?.data;
            if (updated) setViewOrder(updated);
            toast.success('Payment marked as paid');
        },
    });

    const handleViewInvoice = async (orderNumber) => {
        setLoadingInvoice(true);
        try {
            const res = await orderAPI.invoice(orderNumber);
            setInvoiceData(res.data?.data || res.data);
        } catch {
            toast.error('Failed to load invoice');
        } finally {
            setLoadingInvoice(false);
        }
    };

    if (isLoading) return <LoadingSpinner />;

    const orders = data?.data || [];

    return (
        <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Orders</h2>

            {/* Filter tabs */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                <button onClick={() => setFilter('')} className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap ${!filter ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    Today
                </button>
                {STATUS_OPTIONS.map((s) => (
                    <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-full text-sm font-medium capitalize whitespace-nowrap ${filter === s ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                        {s}
                    </button>
                ))}
            </div>

            {/* Orders List */}
            <div className="space-y-3">
                {orders.map((order) => (
                    <div key={order.id} className="card cursor-pointer hover:shadow-md" onClick={() => setViewOrder(order)}>
                        <div className="flex items-start sm:items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold">{order.order_number}</span>
                                    <StatusBadge status={order.status} />
                                    <span className="text-xs text-gray-400 capitalize">{order.type === 'quick' ? 'Quick Sale' : order.type}</span>
                                    {order.source === 'pos' && (
                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700">
                                            <HiOutlineDesktopComputer className="w-3 h-3" /> POS
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <p className="text-sm text-gray-500 truncate">
                                        {order.table?.table_number ? `Table ${order.table.table_number}` : order.customer_name || 'Walk-in'} &middot; {order.items?.length || 0} items
                                    </p>
                                    {order.payment_method && (() => {
                                        const pm = PAYMENT_METHOD_MAP[order.payment_method] || { label: order.payment_method, icon: HiOutlineCash };
                                        return (
                                            <span className="inline-flex items-center text-xs text-gray-400">
                                                <pm.icon className="w-3.5 h-3.5 mr-0.5" />
                                                {pm.label}
                                            </span>
                                        );
                                    })()}
                                    {order.payment_status && <PaymentBadge status={order.payment_status} />}
                                </div>
                            </div>
                            <div className="text-right shrink-0">
                                <p className="font-bold text-lg">৳{order.grand_total}</p>
                                <p className="text-xs text-gray-400">{new Date(order.created_at).toLocaleTimeString()}</p>
                            </div>
                        </div>
                    </div>
                ))}
                {orders.length === 0 && <p className="text-center text-gray-400 py-8">No orders found</p>}
            </div>

            {/* Order Detail Modal */}
            <Modal isOpen={!!viewOrder} onClose={() => setViewOrder(null)} title={`Order ${viewOrder?.order_number}`} size="lg">
                {viewOrder && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-4 flex-wrap">
                            <StatusBadge status={viewOrder.status} />
                            <span className="capitalize text-sm">{viewOrder.type}</span>
                            {viewOrder.table && <span className="text-sm">Table: {viewOrder.table.table_number}</span>}
                        </div>

                        {/* Payment Info */}
                        <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5 text-sm">
                                    {(() => {
                                        const pm = PAYMENT_METHOD_MAP[viewOrder.payment_method];
                                        if (pm) {
                                            return <><pm.icon className="w-5 h-5 text-brand-700" /> <span>{pm.label}{viewOrder.payment_gateway ? ` (${viewOrder.payment_gateway})` : ''}</span></>;
                                        }
                                        return <span className="text-gray-400">No payment method</span>;
                                    })()}
                                </div>
                                <PaymentBadge status={viewOrder.payment_status} />
                                {viewOrder.source === 'pos' && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700">
                                        <HiOutlineDesktopComputer className="w-3 h-3" /> POS
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {viewOrder.payment_status !== 'paid' && (
                                    <button
                                        onClick={() => markPaidMutation.mutate(viewOrder.id)}
                                        disabled={markPaidMutation.isPending}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
                                    >
                                        <HiOutlineCheckCircle className="w-4 h-4" />
                                        {markPaidMutation.isPending ? 'Saving...' : 'Mark Paid'}
                                    </button>
                                )}
                                <button
                                    onClick={() => handleViewInvoice(viewOrder.order_number)}
                                    disabled={loadingInvoice}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700 disabled:opacity-50"
                                >
                                    <HiOutlineDocumentText className="w-4 h-4" />
                                    {loadingInvoice ? 'Loading...' : 'Invoice'}
                                </button>
                            </div>
                        </div>

                        {viewOrder.paid_at && (
                            <p className="text-xs text-green-600">Paid at: {new Date(viewOrder.paid_at).toLocaleString()}</p>
                        )}
                        {viewOrder.transaction_id && (
                            <p className="text-xs text-gray-500">TXN: {viewOrder.transaction_id}</p>
                        )}

                        {/* Items */}
                        <div className="border rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="text-left px-4 py-2">Item</th>
                                        <th className="text-center px-4 py-2">Qty</th>
                                        <th className="text-right px-4 py-2">Price</th>
                                        <th className="text-right px-4 py-2">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {viewOrder.items?.map((item) => (
                                        <tr key={item.id} className="border-t">
                                            <td className="px-4 py-2">{item.menu_item?.name}</td>
                                            <td className="text-center px-4 py-2">{item.qty}</td>
                                            <td className="text-right px-4 py-2">৳{item.price_at_sale}</td>
                                            <td className="text-right px-4 py-2">৳{item.line_total}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Totals */}
                        <div className="text-right space-y-1">
                            <p>Subtotal: ৳{viewOrder.subtotal}</p>
                            {parseFloat(viewOrder.discount) > 0 && <p className="text-green-600">Discount: -৳{viewOrder.discount}</p>}
                            {parseFloat(viewOrder.net_amount) > 0 && parseFloat(viewOrder.net_amount) !== parseFloat(viewOrder.subtotal) - parseFloat(viewOrder.discount) && (
                                <p>Net Amount: ৳{viewOrder.net_amount}</p>
                            )}
                            {parseFloat(viewOrder.vat_amount || viewOrder.tax || 0) > 0 && (
                                <p>VAT ({viewOrder.vat_rate ?? 0}%): ৳{viewOrder.vat_amount || viewOrder.tax}</p>
                            )}
                            <p className="text-xl font-bold">Total: ৳{viewOrder.grand_total}</p>
                        </div>

                        {/* Status Actions */}
                        {!['completed', 'cancelled'].includes(viewOrder.status) && (
                            <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t">
                                <select
                                    className="input sm:max-w-xs"
                                    value={viewOrder.status}
                                    onChange={(e) => statusMutation.mutate({ id: viewOrder.id, status: e.target.value })}
                                >
                                    {STATUS_OPTIONS.map((s) => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                                {/* <button onClick={() => cancelMutation.mutate(viewOrder.id)} className="btn-danger">Cancel</button> */}
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            {/* POS Invoice Overlay */}
            {invoiceData && (
                <POSInvoice
                    data={invoiceData}
                    onClose={() => setInvoiceData(null)}
                />
            )}
        </div>
    );
}
