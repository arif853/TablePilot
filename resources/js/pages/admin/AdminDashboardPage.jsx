import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { dashboardAPI } from '../../services/api';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import {
    HiOutlineCurrencyDollar,
    HiOutlineOfficeBuilding,
    HiOutlineShoppingCart,
    HiOutlineTrendingDown,
    HiOutlineCreditCard,
    HiOutlineExclamation,
} from 'react-icons/hi';

// Simple chart components using CSS
const MiniBarChart = ({ data, color = 'blue' }) => {
    if (!data || data.length === 0) return <div className="text-gray-400 text-sm">No data</div>;
    const max = Math.max(...data.map(d => d.count || d.revenue || 0));
    return (
        <div className="flex items-end gap-1 h-16">
            {data.slice(-12).map((item, i) => {
                const value = item.count || item.revenue || 0;
                const height = max > 0 ? (value / max) * 100 : 0;
                return (
                    <div
                        key={i}
                        className={`flex-1 bg-${color}-500 rounded-t opacity-80 hover:opacity-100 transition-opacity`}
                        style={{ height: `${Math.max(height, 4)}%` }}
                        title={`${item.month}: ${value}`}
                    />
                );
            })}
        </div>
    );
};

const StatCard = ({ icon: Icon, label, value, subValue, color = 'blue', trend }) => (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-start justify-between">
            <div>
                <p className="text-sm text-gray-500">{label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
                {subValue && <p className="text-xs text-gray-400 mt-1">{subValue}</p>}
            </div>
            <div className={`p-3 rounded-xl bg-${color}-50`}>
                <Icon className={`w-6 h-6 text-${color}-600`} />
            </div>
        </div>
        {trend !== undefined && (
            <div className={`flex items-center mt-3 text-sm ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% from last month
            </div>
        )}
    </div>
);

export default function AdminDashboardPage() {
    const { data, isLoading, error } = useQuery({
        queryKey: ['admin-dashboard'],
        queryFn: () => dashboardAPI.get().then(r => r.data.data),
        refetchInterval: 60000, // Refresh every minute
    });

    if (isLoading) return <LoadingSpinner />;
    if (error) return <div className="text-red-500">Error loading dashboard</div>;

    const { kpi, charts, top_tenants, recent_tenants, recent_subscriptions } = data || {};

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-BD', {
            style: 'currency',
            currency: 'BDT',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount || 0);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Super Admin Dashboard</h1>
                <p className="text-gray-500 mt-1">Platform overview and analytics</p>
            </div>

            {/* Expiring Soon Alert */}
            {kpi?.expiring_soon > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-center gap-3">
                    <HiOutlineExclamation className="w-6 h-6 text-yellow-600 shrink-0" />
                    <div>
                        <p className="font-medium text-yellow-800">
                            {kpi.expiring_soon} subscription{kpi.expiring_soon > 1 ? 's' : ''} expiring soon
                        </p>
                        <Link to="/dashboard/admin/subscriptions" className="text-sm text-yellow-700 underline">
                            View expiring subscriptions →
                        </Link>
                    </div>
                </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                <StatCard
                    icon={HiOutlineCurrencyDollar}
                    label="MRR"
                    value={formatCurrency(kpi?.mrr)}
                    color="green"
                />
                <StatCard
                    icon={HiOutlineCurrencyDollar}
                    label="ARR"
                    value={formatCurrency(kpi?.arr)}
                    color="green"
                />
                <StatCard
                    icon={HiOutlineOfficeBuilding}
                    label="Active Tenants"
                    value={kpi?.active_tenants || 0}
                    subValue={`${kpi?.inactive_tenants || 0} inactive`}
                    color="blue"
                />
                <StatCard
                    icon={HiOutlineTrendingDown}
                    label="Churn Rate"
                    value={`${kpi?.churn_rate || 0}%`}
                    color="red"
                />
                <StatCard
                    icon={HiOutlineShoppingCart}
                    label="Orders Today"
                    value={kpi?.orders_today || 0}
                    subValue={`${kpi?.orders_this_month || 0} this month`}
                    color="purple"
                />
                <StatCard
                    icon={HiOutlineCreditCard}
                    label="Revenue Today"
                    value={formatCurrency(kpi?.revenue_today)}
                    subValue={`${formatCurrency(kpi?.revenue_this_month)} this month`}
                    color="indigo"
                />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* New Tenants Chart */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                    <h3 className="font-semibold text-gray-900 mb-4">New Tenants (Last 12 Months)</h3>
                    <MiniBarChart data={charts?.new_tenants_per_month} color="blue" />
                    <div className="flex justify-between text-xs text-gray-400 mt-2">
                        {charts?.new_tenants_per_month?.slice(-6).map((item, i) => (
                            <span key={i}>{item.month?.split('-')[1]}</span>
                        ))}
                    </div>
                </div>

                {/* Revenue Trend Chart */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                    <h3 className="font-semibold text-gray-900 mb-4">Revenue Trend (Last 12 Months)</h3>
                    <MiniBarChart data={charts?.revenue_trend} color="green" />
                    <div className="flex justify-between text-xs text-gray-400 mt-2">
                        {charts?.revenue_trend?.slice(-6).map((item, i) => (
                            <span key={i}>{item.month?.split('-')[1]}</span>
                        ))}
                    </div>
                </div>
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Tenants */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                    <h3 className="font-semibold text-gray-900 mb-4">Top Tenants (This Month)</h3>
                    <div className="space-y-3">
                        {top_tenants?.length > 0 ? top_tenants.map((tenant, i) => (
                            <div key={tenant.id} className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <span className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-medium text-gray-600">
                                        {i + 1}
                                    </span>
                                    <div>
                                        <Link
                                            to={`/dashboard/admin/tenants/${tenant.id}`}
                                            className="font-medium text-gray-900 hover:text-brand-700"
                                        >
                                            {tenant.name}
                                        </Link>
                                        <p className="text-xs text-gray-400">{tenant.order_count} orders</p>
                                    </div>
                                </div>
                                <span className="font-semibold text-gray-900">{formatCurrency(tenant.total_revenue)}</span>
                            </div>
                        )) : (
                            <p className="text-gray-400 text-sm">No data available</p>
                        )}
                    </div>
                </div>

                {/* Plan Distribution */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                    <h3 className="font-semibold text-gray-900 mb-4">Plan Distribution</h3>
                    <div className="space-y-3">
                        {charts?.plan_distribution?.map((plan) => {
                            const total = charts.plan_distribution.reduce((sum, p) => sum + p.count, 0);
                            const percentage = total > 0 ? (plan.count / total) * 100 : 0;
                            return (
                                <div key={plan.plan_type}>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="capitalize text-gray-700">{plan.plan_type}</span>
                                        <span className="text-gray-500">{plan.count} ({percentage.toFixed(0)}%)</span>
                                    </div>
                                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-brand-500 rounded-full"
                                            style={{ width: `${percentage}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Tenants */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-gray-900">Recent Tenants</h3>
                        <Link to="/dashboard/admin/tenants" className="text-sm text-brand-700 hover:underline">
                            View all →
                        </Link>
                    </div>
                    <div className="space-y-3">
                        {recent_tenants?.map((tenant) => (
                            <div key={tenant.id} className="flex items-center justify-between">
                                <div>
                                    <Link
                                        to={`/dashboard/admin/tenants/${tenant.id}`}
                                        className="font-medium text-gray-900 hover:text-brand-700"
                                    >
                                        {tenant.name}
                                    </Link>
                                    <p className="text-xs text-gray-400">
                                        {new Date(tenant.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                                <span className={`text-xs px-2 py-1 rounded-full ${
                                    tenant.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                                }`}>
                                    {tenant.is_active ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Recent Subscriptions */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-gray-900">Recent Subscriptions</h3>
                        <Link to="/dashboard/admin/subscriptions" className="text-sm text-brand-700 hover:underline">
                            View all →
                        </Link>
                    </div>
                    <div className="space-y-3">
                        {recent_subscriptions?.map((sub) => (
                            <div key={sub.id} className="flex items-center justify-between">
                                <div>
                                    <p className="font-medium text-gray-900">{sub.tenant?.name}</p>
                                    <p className="text-xs text-gray-400 capitalize">
                                        {sub.plan_type} • Expires {new Date(sub.expires_at).toLocaleDateString()}
                                    </p>
                                </div>
                                <span className={`text-xs px-2 py-1 rounded-full ${
                                    sub.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                                }`}>
                                    {sub.status}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Financial Summary */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 className="font-semibold text-gray-900 mb-4">Financial Summary</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div>
                        <p className="text-sm text-gray-500">Pending Commission</p>
                        <p className="text-xl font-bold text-yellow-600">{formatCurrency(kpi?.pending_commission)}</p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Total Collected</p>
                        <p className="text-xl font-bold text-green-600">{formatCurrency(kpi?.total_collected)}</p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Total Users</p>
                        <p className="text-xl font-bold text-gray-900">{data?.users_count || 0}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
