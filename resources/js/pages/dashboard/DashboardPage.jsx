import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardAPI, subscriptionAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import StatusBadge from '../../components/ui/StatusBadge';
import ForecastWidget from '../../components/ai/ForecastWidget';
import SubscriptionStatusCard from '../../components/SubscriptionStatusCard';

export default function DashboardPage() {
    const { user } = useAuthStore();

    const { data, isLoading } = useQuery({
        queryKey: ['dashboard'],
        queryFn: () => dashboardAPI.get().then((r) => r.data.data),
        refetchInterval: 30000,
    });

    const { data: subscriptionData } = useQuery({
        queryKey: ['subscription-current'],
        queryFn: () => subscriptionAPI.current().then((r) => r.data.data),
        enabled: user?.role !== 'super_admin',
    });

    if (isLoading) return <LoadingSpinner />;

    return (
        <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-6">
                {user?.role === 'super_admin' ? 'Platform Dashboard' : 'Dashboard'}
            </h2>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {user?.role === 'super_admin' ? (
                    <>
                        <StatCard label="Total Tenants" value={data?.tenants?.total || 0} color="blue" />
                        <StatCard label="Active Tenants" value={data?.tenants?.active || 0} color="green" />
                        <StatCard label="Total Users" value={data?.users || 0} color="purple" />
                        <StatCard label="Revenue Today" value={`৳${data?.revenue_today || 0}`} color="yellow" />
                    </>
                ) : (
                    <>
                        <StatCard label="Orders Today" value={data?.orders?.today || 0} color="blue" />
                        <StatCard label="Revenue Today" value={`৳${data?.revenue?.today || 0}`} color="green" />
                        <StatCard label="Pending" value={data?.orders?.pending || 0} color="yellow" />
                        <StatCard label="Revenue Month" value={`৳${data?.revenue?.this_month || 0}`} color="purple" />
                    </>
                )}
            </div>

            {/* Recent Orders */}
            {data?.recent_orders && (
                <div className="card">
                    <h3 className="text-lg font-semibold mb-4">Recent Orders</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-gray-500 border-b">
                                    <th className="pb-3 pr-4">Order #</th>
                                    <th className="pb-3 pr-4">Type</th>
                                    <th className="pb-3 pr-4">Table</th>
                                    <th className="pb-3 pr-4">Total</th>
                                    <th className="pb-3">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.recent_orders.map((order) => (
                                    <tr key={order.id} className="border-b last:border-0">
                                        <td className="py-3 pr-4 font-medium">{order.order_number}</td>
                                        <td className="py-3 pr-4 capitalize">{order.type}</td>
                                        <td className="py-3 pr-4">{order.table?.table_number || '-'}</td>
                                        <td className="py-3 pr-4">৳{order.grand_total}</td>
                                        <td className="py-3"><StatusBadge status={order.status} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Top Items */}
            {data?.top_items?.length > 0 && (
                <div className="card mt-6">
                    <h3 className="text-lg font-semibold mb-4">Top Selling Items (This Month)</h3>
                    <div className="space-y-3">
                        {data.top_items.map((item, i) => (
                            <div key={i} className="flex items-center justify-between">
                                <div className="flex items-center">
                                    <span className="w-6 h-6 bg-brand-100 text-brand-800 rounded-full flex items-center justify-center text-xs font-bold mr-3">
                                        {i + 1}
                                    </span>
                                    <span className="font-medium">{item.name}</span>
                                </div>
                                <div className="text-right">
                                    <span className="text-sm text-gray-500">{item.total_qty} sold</span>
                                    <span className="ml-3 font-medium">৳{item.total_revenue}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* AI Sales Forecast (Restaurant Admin Only) */}
            {user?.role === 'restaurant_admin' && (
                <div className="mt-6">
                    <ForecastWidget />
                </div>
            )}

            {user?.role !== 'super_admin' && (
                <div className="mt-6">
                    <SubscriptionStatusCard data={subscriptionData} />
                </div>
            )}
        </div>
    );
}

function StatCard({ label, value, color }) {
    const colors = {
        blue: 'bg-blue-50 text-blue-700 border-blue-200',
        green: 'bg-green-50 text-green-700 border-green-200',
        yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
        purple: 'bg-purple-50 text-purple-700 border-purple-200',
        red: 'bg-red-50 text-red-700 border-red-200',
    };

    return (
        <div className={`rounded-xl border p-5 ${colors[color]}`}>
            <p className="text-sm opacity-80">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
    );
}
