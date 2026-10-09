import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { dashboardAPI, subscriptionAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import StatusBadge from '../../components/ui/StatusBadge';
import ForecastWidget from '../../components/ai/ForecastWidget';
import SubscriptionStatusCard from '../../components/SubscriptionStatusCard';
import {
    HiOutlineShoppingCart,
    HiOutlineCash,
    HiOutlineClock,
    HiOutlineTrendingUp,
    HiOutlineOfficeBuilding,
    HiOutlineBadgeCheck,
    HiOutlineUsers,
    HiOutlineArrowRight,
    HiOutlineClipboardList,
} from 'react-icons/hi';

const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
};

const formatMoney = (value) => `৳${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function DashboardPage() {
    const { user } = useAuthStore();
    const isSuperAdmin = user?.role === 'super_admin';

    const { data, isLoading } = useQuery({
        queryKey: ['dashboard'],
        queryFn: () => dashboardAPI.get().then((r) => r.data.data),
        refetchInterval: 30000,
    });

    const { data: subscriptionData } = useQuery({
        queryKey: ['subscription-current'],
        queryFn: () => subscriptionAPI.current().then((r) => r.data.data),
        enabled: !isSuperAdmin,
    });

    if (isLoading) return <LoadingSpinner />;

    const topItems = data?.top_items || [];
    const maxQty = Math.max(1, ...topItems.map((item) => Number(item.total_qty) || 0));

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                    <h2 className="page-title">
                        {isSuperAdmin ? 'Platform Dashboard' : `${greeting()}, ${user?.name?.split(' ')[0] || 'there'}`}
                    </h2>
                    <p className="page-subtitle">
                        {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                        {!isSuperAdmin && " · Here's how service is going today."}
                    </p>
                </div>
                {!isSuperAdmin && (
                    <Link to="/dashboard/orders" className="btn-secondary self-start sm:self-auto">
                        <HiOutlineClipboardList className="w-4 h-4" />
                        View all orders
                    </Link>
                )}
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {isSuperAdmin ? (
                    <>
                        <StatCard label="Total Tenants" value={data?.tenants?.total || 0} icon={HiOutlineOfficeBuilding} color="blue" />
                        <StatCard label="Active Tenants" value={data?.tenants?.active || 0} icon={HiOutlineBadgeCheck} color="green" />
                        <StatCard label="Total Users" value={data?.users || 0} icon={HiOutlineUsers} color="purple" />
                        <StatCard label="Revenue Today" value={formatMoney(data?.revenue_today)} icon={HiOutlineCash} color="brand" />
                    </>
                ) : (
                    <>
                        <StatCard label="Orders Today" value={data?.orders?.today || 0} icon={HiOutlineShoppingCart} color="blue" />
                        <StatCard label="Revenue Today" value={formatMoney(data?.revenue?.today)} icon={HiOutlineCash} color="green" />
                        <StatCard
                            label="Pending Orders"
                            value={data?.orders?.pending || 0}
                            icon={HiOutlineClock}
                            color="amber"
                            highlight={(data?.orders?.pending || 0) > 0}
                        />
                        <StatCard label="Revenue This Month" value={formatMoney(data?.revenue?.this_month)} icon={HiOutlineTrendingUp} color="purple" />
                    </>
                )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Recent Orders */}
                {data?.recent_orders && (
                    <div className={`card p-0 sm:p-0 overflow-hidden ${topItems.length > 0 ? 'xl:col-span-2' : 'xl:col-span-3'}`}>
                        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-100">
                            <div>
                                <h3 className="section-title">Recent Orders</h3>
                                <p className="text-xs text-gray-500 mt-0.5">Latest activity, refreshed every 30 seconds</p>
                            </div>
                            {!isSuperAdmin && (
                                <Link to="/dashboard/orders" className="hidden sm:inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800">
                                    See all <HiOutlineArrowRight className="w-4 h-4" />
                                </Link>
                            )}
                        </div>
                        {data.recent_orders.length === 0 ? (
                            <div className="px-6 py-12 text-center">
                                <HiOutlineShoppingCart className="w-10 h-10 mx-auto text-gray-300" />
                                <p className="mt-2 text-sm font-medium text-gray-500">No orders yet</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th className="px-4 sm:px-6 py-3">Order #</th>
                                            <th className="px-4 py-3">Type</th>
                                            <th className="px-4 py-3">Table</th>
                                            <th className="px-4 py-3 text-right">Total</th>
                                            <th className="px-4 sm:px-6 py-3">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.recent_orders.map((order) => (
                                            <tr key={order.id}>
                                                <td className="px-4 sm:px-6 py-3 font-semibold text-gray-900">{order.order_number}</td>
                                                <td className="px-4 py-3 capitalize">{order.type}</td>
                                                <td className="px-4 py-3">{order.table?.table_number || <span className="text-gray-300">—</span>}</td>
                                                <td className="px-4 py-3 text-right font-medium tabular">{formatMoney(order.grand_total)}</td>
                                                <td className="px-4 sm:px-6 py-3"><StatusBadge status={order.status} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* Top Items */}
                {topItems.length > 0 && (
                    <div className={`card ${data?.recent_orders ? '' : 'xl:col-span-3'}`}>
                        <h3 className="section-title">Top Sellers</h3>
                        <p className="text-xs text-gray-500 mt-0.5 mb-5">This month, by quantity sold</p>
                        <div className="space-y-4">
                            {topItems.map((item, i) => (
                                <div key={i}>
                                    <div className="flex items-center justify-between gap-3 text-sm">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                                                i === 0 ? 'bg-brand-500 text-white' : 'bg-brand-50 text-brand-800'
                                            }`}>
                                                {i + 1}
                                            </span>
                                            <span className="font-medium text-gray-800 truncate">{item.name}</span>
                                        </div>
                                        <span className="font-semibold text-gray-900 tabular shrink-0">{formatMoney(item.total_revenue)}</span>
                                    </div>
                                    <div className="mt-2 ml-9 flex items-center gap-2">
                                        <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600"
                                                style={{ width: `${((Number(item.total_qty) || 0) / maxQty) * 100}%` }}
                                            />
                                        </div>
                                        <span className="text-xs text-gray-500 tabular w-14 text-right">{item.total_qty} sold</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* AI Sales Forecast (Restaurant Admin Only) */}
            {user?.role === 'restaurant_admin' && <ForecastWidget />}

            {!isSuperAdmin && <SubscriptionStatusCard data={subscriptionData} />}
        </div>
    );
}

function StatCard({ label, value, icon: Icon, color, highlight = false }) {
    const colors = {
        blue: 'bg-sky-50 text-sky-600 ring-sky-100',
        green: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
        amber: 'bg-amber-50 text-amber-600 ring-amber-100',
        purple: 'bg-violet-50 text-violet-600 ring-violet-100',
        brand: 'bg-brand-50 text-brand-600 ring-brand-100',
    };

    return (
        <div className={`card p-4 sm:p-5 ${highlight ? 'ring-2 ring-amber-200 border-amber-200' : ''}`}>
            <div className="flex items-start justify-between gap-2">
                <p className="text-xs sm:text-sm font-medium text-gray-500">{label}</p>
                <span className={`w-9 h-9 rounded-xl ring-1 flex items-center justify-center shrink-0 ${colors[color]}`}>
                    <Icon className="w-5 h-5" />
                </span>
            </div>
            <p className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-gray-900 tabular truncate">{value}</p>
        </div>
    );
}
