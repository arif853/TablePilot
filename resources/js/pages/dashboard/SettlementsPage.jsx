import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportAPI } from '../../services/api';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import StatusBadge from '../../components/ui/StatusBadge';

export default function SettlementsPage() {
    const { data, isLoading } = useQuery({
        queryKey: ['settlement-report'],
        queryFn: () => reportAPI.settlements().then((r) => r.data.data),
    });

    if (isLoading) return <LoadingSpinner />;

    return (
        <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-6">Financial Settlements</h2>

            {data?.summary && (
                <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 mb-6">
                    <div className="card"><p className="text-xs sm:text-sm text-gray-500">Total Sold</p><p className="text-lg sm:text-2xl font-bold">৳{data.summary.total_sold}</p></div>
                    <div className="card"><p className="text-xs sm:text-sm text-gray-500">Commission</p><p className="text-lg sm:text-2xl font-bold text-red-600">৳{data.summary.total_commission}</p></div>
                    <div className="card"><p className="text-xs sm:text-sm text-gray-500">Total Paid</p><p className="text-lg sm:text-2xl font-bold text-green-600">৳{data.summary.total_paid}</p></div>
                    <div className="card"><p className="text-xs sm:text-sm text-gray-500">Payable Balance</p><p className="text-lg sm:text-2xl font-bold text-brand-700">৳{data.summary.total_payable}</p></div>
                </div>
            )}

            <div className="card">
                <h3 className="font-semibold mb-4">Settlement History</h3>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left border-b">
                                <th className="pb-3">Period</th><th className="pb-3">Sold</th><th className="pb-3">Commission</th><th className="pb-3">Paid</th><th className="pb-3">Payable</th><th className="pb-3">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data?.settlements?.map((s) => (
                                <tr key={s.id} className="border-b last:border-0">
                                    <td className="py-3">{s.period_start} - {s.period_end}</td>
                                    <td>৳{s.total_sold}</td>
                                    <td>৳{s.commission_amount}</td>
                                    <td className="text-green-600">৳{s.total_paid}</td>
                                    <td className="font-bold">৳{s.payable_balance}</td>
                                    <td><StatusBadge status={s.status} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {/* Mobile List */}
                <div className="md:hidden space-y-3">
                    {data?.settlements?.map((s) => (
                        <div key={s.id} className="py-3 border-b last:border-0">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-gray-500">{s.period_start} - {s.period_end}</span>
                                <StatusBadge status={s.status} />
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <div><span className="text-gray-500">Sold:</span> <span className="font-medium">৳{s.total_sold}</span></div>
                                <div><span className="text-gray-500">Comm:</span> <span className="font-medium">৳{s.commission_amount}</span></div>
                                <div><span className="text-gray-500">Paid:</span> <span className="font-medium text-green-600">৳{s.total_paid}</span></div>
                                <div><span className="text-gray-500">Payable:</span> <span className="font-bold">৳{s.payable_balance}</span></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
