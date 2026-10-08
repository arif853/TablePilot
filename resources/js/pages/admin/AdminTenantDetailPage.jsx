import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { useModuleStore } from '../../stores/moduleStore';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Modal from '../../components/ui/Modal';
import StatusBadge from '../../components/ui/StatusBadge';
import toast from 'react-hot-toast';
import {
    HiOutlineArrowLeft,
    HiOutlineMail,
    HiOutlineUserCircle,
    HiOutlineShoppingCart,
    HiOutlineCurrencyDollar,
    HiOutlineUsers,
    HiOutlineCash,
} from 'react-icons/hi';

export default function AdminTenantDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const startImpersonation = useAuthStore((s) => s.startImpersonation);
    const clearModules = useModuleStore((s) => s.clear);

    const [showEmailModal, setShowEmailModal] = useState(false);
    const [showOverrideModal, setShowOverrideModal] = useState(false);
    const [overrideAction, setOverrideAction] = useState('grant');
    const [targetModule, setTargetModule] = useState(null);
    const [emailData, setEmailData] = useState({ subject: '', message: '' });
    const [overrideData, setOverrideData] = useState({ reason: '', expires_at: '' });

    const { data, isLoading, error } = useQuery({
        queryKey: ['admin-tenant-stats', id],
        queryFn: () => adminAPI.tenants.stats(id).then(r => r.data.data),
    });

    const { data: moduleMatrix, isLoading: moduleLoading } = useQuery({
        queryKey: ['admin-tenant-modules', id],
        queryFn: () => adminAPI.tenantModules.matrix(id).then(r => r.data.data),
    });

    const impersonateMutation = useMutation({
        mutationFn: () => adminAPI.tenants.impersonate(id),
        onSuccess: (response) => {
            const { token, user, tenant } = response.data.data;
            startImpersonation(user, token);
            clearModules();
            toast.success(`Now impersonating ${tenant.name}`);
            navigate('/dashboard');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to impersonate'),
    });

    const sendEmailMutation = useMutation({
        mutationFn: (data) => adminAPI.tenants.sendEmail(id, data),
        onSuccess: () => {
            setShowEmailModal(false);
            setEmailData({ subject: '', message: '' });
            toast.success('Email sent successfully');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to send email'),
    });

    const toggleMutation = useMutation({
        mutationFn: ({ is_active }) => adminAPI.tenants.update(id, { is_active }),
        onSuccess: () => {
            queryClient.invalidateQueries(['admin-tenant-stats', id]);
            toast.success('Tenant status updated');
        },
    });

    const grantMutation = useMutation({
        mutationFn: (payload) => adminAPI.tenantModules.grant(id, payload),
        onSuccess: () => {
            queryClient.invalidateQueries(['admin-tenant-modules', id]);
            setShowOverrideModal(false);
            setOverrideData({ reason: '', expires_at: '' });
            toast.success('Module granted successfully');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to grant module'),
    });

    const revokeMutation = useMutation({
        mutationFn: (payload) => adminAPI.tenantModules.revoke(id, payload),
        onSuccess: () => {
            queryClient.invalidateQueries(['admin-tenant-modules', id]);
            setShowOverrideModal(false);
            setOverrideData({ reason: '', expires_at: '' });
            toast.success('Module revoked successfully');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to revoke module'),
    });

    const removeOverrideMutation = useMutation({
        mutationFn: (moduleKey) => adminAPI.tenantModules.removeOverride(id, moduleKey),
        onSuccess: () => {
            queryClient.invalidateQueries(['admin-tenant-modules', id]);
            toast.success('Override removed');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to remove override'),
    });

    if (isLoading) return <LoadingSpinner />;
    if (error) return <div className="text-red-500">Error loading tenant details</div>;

    const { tenant, stats, subscriptions, revenue_trend } = data || {};

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-BD', {
            style: 'currency',
            currency: 'BDT',
            minimumFractionDigits: 0,
        }).format(amount || 0);
    };

    const handleSendEmail = (e) => {
        e.preventDefault();
        sendEmailMutation.mutate(emailData);
    };

    const groupedModules = (moduleMatrix?.modules || []).reduce((acc, module) => {
        const group = module.group || 'other';
        if (!acc[group]) {
            acc[group] = [];
        }
        acc[group].push(module);
        return acc;
    }, {});

    const getModuleStatusBadge = (module) => {
        if (module.has_access && module.override_type === 'grant') {
            return <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">Active (Granted)</span>;
        }
        if (module.has_access && module.plan_includes) {
            return <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">Active (Plan)</span>;
        }
        if (!module.has_access && module.override_type === 'revoke') {
            return <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">Revoked</span>;
        }
        return <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">Not in Plan</span>;
    };

    const openOverrideModal = (module, action) => {
        setTargetModule(module);
        setOverrideAction(action);
        setShowOverrideModal(true);
    };

    const handleOverrideSubmit = (e) => {
        e.preventDefault();
        if (!targetModule) {
            return;
        }

        const payload = {
            module_key: targetModule.key,
            reason: overrideData.reason || null,
            expires_at: overrideAction === 'grant' ? (overrideData.expires_at || null) : null,
        };

        if (overrideAction === 'grant') {
            grantMutation.mutate(payload);
        } else {
            revokeMutation.mutate(payload);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/dashboard/admin/tenants')}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <HiOutlineArrowLeft className="w-5 h-5 text-gray-600" />
                    </button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold text-gray-900">{tenant?.name}</h1>
                            <StatusBadge status={tenant?.is_active ? 'active' : 'inactive'} />
                        </div>
                        <p className="text-gray-500 text-sm">
                            {tenant?.slug} • {tenant?.email}
                        </p>
                    </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button
                        onClick={() => setShowEmailModal(true)}
                        className="btn-secondary flex items-center gap-2"
                    >
                        <HiOutlineMail className="w-4 h-4" />
                        Send Email
                    </button>
                    <button
                        onClick={() => impersonateMutation.mutate()}
                        disabled={impersonateMutation.isPending}
                        className="btn-secondary flex items-center gap-2"
                    >
                        <HiOutlineUserCircle className="w-4 h-4" />
                        {impersonateMutation.isPending ? 'Loading...' : 'Impersonate'}
                    </button>
                    <button
                        onClick={() => toggleMutation.mutate({ is_active: !tenant?.is_active })}
                        className={`btn ${tenant?.is_active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}
                    >
                        {tenant?.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                </div>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-blue-50 rounded-xl">
                            <HiOutlineShoppingCart className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Total Orders</p>
                            <p className="text-2xl font-bold text-gray-900">{stats?.total_orders || 0}</p>
                            <p className="text-xs text-gray-400">{stats?.orders_this_month || 0} this month</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-green-50 rounded-xl">
                            <HiOutlineCurrencyDollar className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Total Revenue</p>
                            <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats?.total_revenue)}</p>
                            <p className="text-xs text-gray-400">{formatCurrency(stats?.revenue_this_month)} this month</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-purple-50 rounded-xl">
                            <HiOutlineUsers className="w-6 h-6 text-purple-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Active Users</p>
                            <p className="text-2xl font-bold text-gray-900">{stats?.active_users || 0}</p>
                            <p className="text-xs text-gray-400">{stats?.total_users || 0} total</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-yellow-50 rounded-xl">
                            <HiOutlineCash className="w-6 h-6 text-yellow-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Balance Due</p>
                            <p className="text-2xl font-bold text-yellow-600">{formatCurrency(stats?.balance_due)}</p>
                            <p className="text-xs text-gray-400">{formatCurrency(stats?.total_paid)} paid</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Revenue Trend */}
            {revenue_trend?.length > 0 && (
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                    <h3 className="font-semibold text-gray-900 mb-4">Revenue Trend (Last 6 Months)</h3>
                    <div className="space-y-3">
                        {revenue_trend.map((item) => (
                            <div key={item.month} className="flex items-center gap-4">
                                <span className="w-16 text-sm text-gray-500">{item.month}</span>
                                <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-green-500 rounded-full"
                                        style={{
                                            width: `${Math.min((item.revenue / Math.max(...revenue_trend.map(r => r.revenue), 1)) * 100, 100)}%`
                                        }}
                                    />
                                </div>
                                <span className="w-28 text-sm text-gray-700 text-right">{formatCurrency(item.revenue)}</span>
                                <span className="w-16 text-xs text-gray-400">{item.orders} orders</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Subscriptions History */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-900">Subscription History</h3>
                    <Link
                        to={`/dashboard/admin/subscriptions?tenant_id=${id}`}
                        className="text-sm text-blue-600 hover:underline"
                    >
                        View all →
                    </Link>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left border-b">
                                <th className="pb-3">Plan</th>
                                <th className="pb-3">Amount</th>
                                <th className="pb-3">Start Date</th>
                                <th className="pb-3">Expiry Date</th>
                                <th className="pb-3">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {subscriptions?.map((sub) => (
                                <tr key={sub.id} className="border-b last:border-0">
                                    <td className="py-3 capitalize">{sub.plan_type}</td>
                                    <td className="py-3">{formatCurrency(sub.amount)}</td>
                                    <td className="py-3">{new Date(sub.starts_at).toLocaleDateString()}</td>
                                    <td className="py-3">{new Date(sub.expires_at).toLocaleDateString()}</td>
                                    <td className="py-3">
                                        <StatusBadge status={sub.status} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {(!subscriptions || subscriptions.length === 0) && (
                        <p className="text-gray-400 text-center py-4">No subscriptions found</p>
                    )}
                </div>
            </div>

            {/* Users */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 className="font-semibold text-gray-900 mb-4">Users</h3>
                <div className="space-y-3">
                    {tenant?.users?.map((user) => (
                        <div key={user.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-medium">
                                    {user.name?.[0]?.toUpperCase()}
                                </div>
                                <div>
                                    <p className="font-medium text-gray-900">{user.name}</p>
                                    <p className="text-sm text-gray-500">{user.email}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded-full capitalize">
                                    {user.role?.replace('_', ' ')}
                                </span>
                                <p className="text-xs text-gray-400 mt-1">{user.status}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Module Access Matrix */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 className="font-semibold text-gray-900 mb-4">
                    Module Access (Plan: {moduleMatrix?.plan || 'N/A'})
                </h3>

                {moduleLoading ? (
                    <LoadingSpinner />
                ) : (
                    <div className="space-y-5">
                        {Object.entries(groupedModules).map(([group, modules]) => (
                            <div key={group} className="border border-gray-100 rounded-lg p-4">
                                <h4 className="font-medium text-gray-800 capitalize mb-3">{group.replace('_', ' ')}</h4>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left border-b">
                                                <th className="pb-2">Module</th>
                                                <th className="pb-2">Plan</th>
                                                <th className="pb-2">Override</th>
                                                <th className="pb-2">Status</th>
                                                <th className="pb-2">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {modules.map((module) => (
                                                <tr key={module.key} className="border-b last:border-0">
                                                    <td className="py-2">
                                                        <div className="font-medium text-gray-900">{module.label}</div>
                                                        <div className="text-xs text-gray-500">{module.key}</div>
                                                    </td>
                                                    <td className="py-2">{module.plan_includes ? 'Yes' : 'No'}</td>
                                                    <td className="py-2 capitalize">{module.override_type || '—'}</td>
                                                    <td className="py-2">{getModuleStatusBadge(module)}</td>
                                                    <td className="py-2">
                                                        {module.override_type ? (
                                                            <button
                                                                onClick={() => removeOverrideMutation.mutate(module.key)}
                                                                className="text-sm text-blue-600 hover:underline"
                                                            >
                                                                Remove Override
                                                            </button>
                                                        ) : module.has_access ? (
                                                            <button
                                                                onClick={() => openOverrideModal(module, 'revoke')}
                                                                disabled={module.is_core}
                                                                className="text-sm text-red-600 hover:underline disabled:opacity-40"
                                                            >
                                                                Revoke
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => openOverrideModal(module, 'grant')}
                                                                className="text-sm text-green-600 hover:underline"
                                                            >
                                                                Grant
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Send Email Modal */}
            <Modal isOpen={showEmailModal} onClose={() => setShowEmailModal(false)} title="Send Email to Tenant">
                <form onSubmit={handleSendEmail} className="space-y-4">
                    <div>
                        <label className="label">Subject</label>
                        <input
                            type="text"
                            className="input"
                            value={emailData.subject}
                            onChange={(e) => setEmailData({ ...emailData, subject: e.target.value })}
                            required
                        />
                    </div>
                    <div>
                        <label className="label">Message</label>
                        <textarea
                            className="input min-h-[150px]"
                            value={emailData.message}
                            onChange={(e) => setEmailData({ ...emailData, message: e.target.value })}
                            required
                        />
                    </div>
                    <div className="flex gap-3">
                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={sendEmailMutation.isPending}
                        >
                            {sendEmailMutation.isPending ? 'Sending...' : 'Send Email'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowEmailModal(false)}
                            className="btn-secondary"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal
                isOpen={showOverrideModal}
                onClose={() => setShowOverrideModal(false)}
                title={`${overrideAction === 'grant' ? 'Grant' : 'Revoke'} Module`}
            >
                <form onSubmit={handleOverrideSubmit} className="space-y-4">
                    <div>
                        <label className="label">Module</label>
                        <input className="input" value={targetModule?.label || ''} readOnly />
                    </div>
                    <div>
                        <label className="label">Reason</label>
                        <textarea
                            className="input min-h-[90px]"
                            value={overrideData.reason}
                            onChange={(e) => setOverrideData((prev) => ({ ...prev, reason: e.target.value }))}
                            placeholder="Optional admin note"
                        />
                    </div>
                    {overrideAction === 'grant' && (
                        <div>
                            <label className="label">Expires At (Optional)</label>
                            <input
                                type="datetime-local"
                                className="input"
                                value={overrideData.expires_at}
                                onChange={(e) => setOverrideData((prev) => ({ ...prev, expires_at: e.target.value }))}
                            />
                        </div>
                    )}
                    <div className="flex gap-3">
                        <button type="submit" className="btn-primary" disabled={grantMutation.isPending || revokeMutation.isPending}>
                            {grantMutation.isPending || revokeMutation.isPending ? 'Saving...' : overrideAction === 'grant' ? 'Confirm Grant' : 'Confirm Revoke'}
                        </button>
                        <button type="button" className="btn-secondary" onClick={() => setShowOverrideModal(false)}>
                            Cancel
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
