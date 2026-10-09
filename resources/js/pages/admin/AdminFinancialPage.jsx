import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminAPI } from '../../services/api';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import toast from 'react-hot-toast';
import {
    HiOutlineCurrencyDollar,
    HiOutlineCash,
    HiOutlineReceiptTax,
    HiOutlineCalculator,
    HiOutlineCheck,
    HiOutlineX,
    HiOutlineFilter,
    HiOutlineEye,
    HiOutlineDownload,
    HiOutlineDocumentDownload,
} from 'react-icons/hi';

export default function AdminFinancialPage() {
    const queryClient = useQueryClient();
    const [filters, setFilters] = useState({ status: '', tenant_id: '', from_date: '', to_date: '' });
    const [page, setPage] = useState(1);
    const [selectedSettlement, setSelectedSettlement] = useState(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentData, setPaymentData] = useState({ amount: '', method: 'bank_transfer', note: '' });

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['admin-settlements', page, filters],
        queryFn: () => adminAPI.settlements.list({ page, per_page: 20, ...filters }).then(r => r.data),
    });

    const { data: stats } = useQuery({
        queryKey: ['admin-financial-stats'],
        queryFn: () => adminAPI.settlements.stats().then(r => r.data.data),
    });

    const recordPaymentMutation = useMutation({
        mutationFn: ({ settlementId, data }) => adminAPI.settlements.recordPayment(settlementId, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['admin-settlements']);
            queryClient.invalidateQueries(['admin-financial-stats']);
            toast.success('Payment recorded');
            setShowPaymentModal(false);
            setPaymentData({ amount: '', method: 'bank_transfer', note: '' });
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to record payment'),
    });

    const getStatusBadge = (status) => {
        const statusStyles = {
            pending: 'bg-yellow-100 text-yellow-700',
            partial: 'bg-blue-100 text-blue-700',
            paid: 'bg-green-100 text-green-700',
            overdue: 'bg-red-100 text-red-700',
        };
        return (
            <span className={`text-xs px-2 py-1 rounded-full ${statusStyles[status] || 'bg-gray-100 text-gray-700'}`}>
                {status?.charAt(0).toUpperCase() + status?.slice(1)}
            </span>
        );
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'BDT',
            minimumFractionDigits: 0,
        }).format(amount || 0);
    };

    if (isLoading) return <LoadingSpinner />;

    const settlements = data?.data || [];
    const pagination = data?.meta;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Financial Management</h1>
                <p className="text-gray-500 mt-1">Track settlements, commissions, and payments</p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-500">Total Revenue</p>
                            <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats?.total_revenue)}</p>
                        </div>
                        <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center">
                            <HiOutlineCurrencyDollar className="w-5 h-5 text-green-600" />
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-500">Commission Earned</p>
                            <p className="text-2xl font-bold text-brand-700">{formatCurrency(stats?.total_commission)}</p>
                        </div>
                        <div className="w-10 h-10 bg-brand-50 rounded-full flex items-center justify-center">
                            <HiOutlineReceiptTax className="w-5 h-5 text-brand-700" />
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-500">Pending Payouts</p>
                            <p className="text-2xl font-bold text-yellow-600">{formatCurrency(stats?.pending_payouts)}</p>
                        </div>
                        <div className="w-10 h-10 bg-yellow-50 rounded-full flex items-center justify-center">
                            <HiOutlineCash className="w-5 h-5 text-yellow-600" />
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-500">Completed Payouts</p>
                            <p className="text-2xl font-bold text-green-600">{formatCurrency(stats?.completed_payouts)}</p>
                        </div>
                        <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center">
                            <HiOutlineCheck className="w-5 h-5 text-green-600" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Commission Overview */}
            {stats?.commission_by_tenant?.length > 0 && (
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                    <h3 className="font-semibold text-gray-900 mb-4">Commission by Tenant (This Month)</h3>
                    <div className="space-y-3">
                        {stats.commission_by_tenant.slice(0, 5).map((tenant, i) => (
                            <div key={i} className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-sm font-medium">
                                        {i + 1}
                                    </div>
                                    <span className="text-gray-900">{tenant.name}</span>
                                </div>
                                <span className="font-semibold text-gray-700">{formatCurrency(tenant.commission)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center gap-4 flex-wrap">
                    <HiOutlineFilter className="w-5 h-5 text-gray-400" />
                    <select
                        value={filters.status}
                        onChange={(e) => {
                            setFilters(prev => ({ ...prev, status: e.target.value }));
                            setPage(1);
                        }}
                        className="input w-36"
                    >
                        <option value="">All Status</option>
                        <option value="pending">Pending</option>
                        <option value="partial">Partial</option>
                        <option value="paid">Paid</option>
                        <option value="overdue">Overdue</option>
                    </select>
                    <input
                        type="date"
                        value={filters.from_date}
                        onChange={(e) => {
                            setFilters(prev => ({ ...prev, from_date: e.target.value }));
                            setPage(1);
                        }}
                        className="input"
                        placeholder="From"
                    />
                    <input
                        type="date"
                        value={filters.to_date}
                        onChange={(e) => {
                            setFilters(prev => ({ ...prev, to_date: e.target.value }));
                            setPage(1);
                        }}
                        className="input"
                        placeholder="To"
                    />
                    <button
                        onClick={() => setFilters({ status: '', tenant_id: '', from_date: '', to_date: '' })}
                        className="text-sm text-gray-500 hover:text-gray-700"
                    >
                        Clear
                    </button>
                </div>
            </div>

            {/* Settlements Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Settlement Records</h3>
                    <button className="btn-secondary text-sm flex items-center gap-2">
                        <HiOutlineDownload className="w-4 h-4" />
                        Export
                    </button>
                </div>
                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">ID</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Tenant</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Period</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Gross Revenue</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Commission</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Net Payout</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Paid</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">Status</th>
                            <th className="px-4 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {settlements.length === 0 ? (
                            <tr>
                                <td colSpan="9" className="px-4 py-12 text-center text-gray-500">
                                    <HiOutlineCalculator className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                                    No settlements found
                                </td>
                            </tr>
                        ) : (
                            settlements.map((settlement) => (
                                <tr key={settlement.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm font-mono text-gray-500">
                                        #{settlement.id}
                                    </td>
                                    <td className="px-4 py-3">
                                        <p className="font-medium text-gray-900">{settlement.tenant?.name || '-'}</p>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600">
                                        {settlement.period_start && settlement.period_end ? (
                                            `${new Date(settlement.period_start).toLocaleDateString()} - ${new Date(settlement.period_end).toLocaleDateString()}`
                                        ) : (
                                            settlement.settlement_date
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-right text-gray-900">
                                        {formatCurrency(settlement.gross_revenue)}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-right text-brand-700">
                                        {formatCurrency(settlement.commission_amount)}
                                        {settlement.commission_rate && (
                                            <span className="text-xs text-gray-400 ml-1">
                                                ({settlement.commission_rate}%)
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                                        {formatCurrency(settlement.net_payout)}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-right text-green-600">
                                        {formatCurrency(settlement.amount_paid || 0)}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        {getStatusBadge(settlement.status)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2 justify-end">
                                            <button
                                                onClick={() => setSelectedSettlement(settlement)}
                                                className="text-gray-400 hover:text-gray-600"
                                                title="View Details"
                                            >
                                                <HiOutlineEye className="w-4 h-4" />
                                            </button>
                                            {settlement.status !== 'paid' && (
                                                <button
                                                    onClick={() => {
                                                        setSelectedSettlement(settlement);
                                                        setPaymentData({
                                                            amount: (settlement.net_payout - (settlement.amount_paid || 0)).toFixed(2),
                                                            method: 'bank_transfer',
                                                            note: ''
                                                        });
                                                        setShowPaymentModal(true);
                                                    }}
                                                    className="text-gray-400 hover:text-green-600"
                                                    title="Record Payment"
                                                >
                                                    <HiOutlineCash className="w-4 h-4" />
                                                </button>
                                            )}
                                            <button
                                                className="text-gray-400 hover:text-gray-600"
                                                title="Download Invoice"
                                            >
                                                <HiOutlineDocumentDownload className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>

                {/* Pagination */}
                {pagination && pagination.last_page > 1 && (
                    <div className="px-4 py-3 bg-gray-50 border-t flex items-center justify-between">
                        <p className="text-sm text-gray-500">
                            Showing {pagination.from} to {pagination.to} of {pagination.total}
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage(page - 1)}
                                disabled={page === 1}
                                className="btn-secondary py-1 px-3 text-sm disabled:opacity-50"
                            >
                                Previous
                            </button>
                            <button
                                onClick={() => setPage(page + 1)}
                                disabled={page >= pagination.last_page}
                                className="btn-secondary py-1 px-3 text-sm disabled:opacity-50"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Settlement Detail Modal */}
            {selectedSettlement && !showPaymentModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-gray-900">
                                Settlement #{selectedSettlement.id}
                            </h3>
                            <button onClick={() => setSelectedSettlement(null)} className="text-gray-400 hover:text-gray-600">
                                <HiOutlineX className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-6">
                            {/* Summary */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs text-gray-500">Tenant</p>
                                    <p className="font-semibold text-gray-900">{selectedSettlement.tenant?.name}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Status</p>
                                    {getStatusBadge(selectedSettlement.status)}
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Period</p>
                                    <p className="text-gray-900">
                                        {selectedSettlement.period_start} - {selectedSettlement.period_end}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Settlement Date</p>
                                    <p className="text-gray-900">{selectedSettlement.settlement_date}</p>
                                </div>
                            </div>

                            {/* Financial Details */}
                            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Gross Revenue</span>
                                    <span className="text-gray-900">{formatCurrency(selectedSettlement.gross_revenue)}</span>
                                </div>
                                <div className="flex justify-between text-brand-700">
                                    <span>Commission ({selectedSettlement.commission_rate}%)</span>
                                    <span>- {formatCurrency(selectedSettlement.commission_amount)}</span>
                                </div>
                                {selectedSettlement.vat_amount > 0 && (
                                    <div className="flex justify-between text-gray-600">
                                        <span>VAT</span>
                                        <span>- {formatCurrency(selectedSettlement.vat_amount)}</span>
                                    </div>
                                )}
                                <div className="border-t pt-2 flex justify-between font-semibold">
                                    <span className="text-gray-900">Net Payout</span>
                                    <span className="text-gray-900">{formatCurrency(selectedSettlement.net_payout)}</span>
                                </div>
                                {selectedSettlement.amount_paid > 0 && (
                                    <div className="flex justify-between text-green-600">
                                        <span>Amount Paid</span>
                                        <span>{formatCurrency(selectedSettlement.amount_paid)}</span>
                                    </div>
                                )}
                                {selectedSettlement.status !== 'paid' && (
                                    <div className="flex justify-between text-yellow-600">
                                        <span>Balance Due</span>
                                        <span>{formatCurrency(selectedSettlement.net_payout - (selectedSettlement.amount_paid || 0))}</span>
                                    </div>
                                )}
                            </div>

                            {/* Payment History */}
                            {selectedSettlement.payments?.length > 0 && (
                                <div>
                                    <h4 className="font-medium text-gray-900 mb-3">Payment History</h4>
                                    <div className="space-y-2">
                                        {selectedSettlement.payments.map((payment, i) => (
                                            <div key={i} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                                                <div>
                                                    <p className="text-sm text-gray-900">{formatCurrency(payment.amount)}</p>
                                                    <p className="text-xs text-gray-500">{payment.method} • {payment.date}</p>
                                                </div>
                                                <HiOutlineCheck className="w-5 h-5 text-green-500" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="p-6 border-t flex justify-end gap-3">
                            <button
                                onClick={() => setSelectedSettlement(null)}
                                className="btn-secondary"
                            >
                                Close
                            </button>
                            {selectedSettlement.status !== 'paid' && (
                                <button
                                    onClick={() => {
                                        setPaymentData({
                                            amount: (selectedSettlement.net_payout - (selectedSettlement.amount_paid || 0)).toFixed(2),
                                            method: 'bank_transfer',
                                            note: ''
                                        });
                                        setShowPaymentModal(true);
                                    }}
                                    className="btn-primary flex items-center gap-2"
                                >
                                    <HiOutlineCash className="w-4 h-4" />
                                    Record Payment
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Record Payment Modal */}
            {showPaymentModal && selectedSettlement && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl w-full max-w-md">
                        <div className="p-6 border-b">
                            <h3 className="text-lg font-semibold text-gray-900">Record Payment</h3>
                            <p className="text-sm text-gray-500">
                                Settlement #{selectedSettlement.id} • {selectedSettlement.tenant?.name}
                            </p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="bg-gray-50 rounded-lg p-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Balance Due:</span>
                                    <span className="font-semibold text-gray-900">
                                        {formatCurrency(selectedSettlement.net_payout - (selectedSettlement.amount_paid || 0))}
                                    </span>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                                <input
                                    type="number"
                                    value={paymentData.amount}
                                    onChange={(e) => setPaymentData(prev => ({ ...prev, amount: e.target.value }))}
                                    className="input w-full"
                                    step="0.01"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                                <select
                                    value={paymentData.method}
                                    onChange={(e) => setPaymentData(prev => ({ ...prev, method: e.target.value }))}
                                    className="input w-full"
                                >
                                    <option value="bank_transfer">Bank Transfer</option>
                                    <option value="cash">Cash</option>
                                    <option value="mobile_banking">Mobile Banking</option>
                                    <option value="check">Check</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Note (Optional)</label>
                                <textarea
                                    value={paymentData.note}
                                    onChange={(e) => setPaymentData(prev => ({ ...prev, note: e.target.value }))}
                                    className="input w-full"
                                    rows={3}
                                    placeholder="Transaction ID, reference number, etc."
                                />
                            </div>
                        </div>
                        <div className="p-6 border-t flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setShowPaymentModal(false);
                                    setPaymentData({ amount: '', method: 'bank_transfer', note: '' });
                                }}
                                className="btn-secondary"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => recordPaymentMutation.mutate({
                                    settlementId: selectedSettlement.id,
                                    data: paymentData
                                })}
                                disabled={!paymentData.amount || recordPaymentMutation.isPending}
                                className="btn-primary"
                            >
                                {recordPaymentMutation.isPending ? 'Recording...' : 'Record Payment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
