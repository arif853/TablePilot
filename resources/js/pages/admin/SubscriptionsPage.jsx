import React, { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { adminAPI, apiErrorMessage } from '../../services/api';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import StatusBadge from '../../components/ui/StatusBadge';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import { RenewSubscriptionModal, ExtendSubscriptionModal, CancelSubscriptionModal } from '../../components/admin/SubscriptionModals';
import toast from 'react-hot-toast';

const toSubscriptionType = (slug) => (slug === 'monthly' || slug === 'yearly' ? slug : 'custom');
const formatDate = (date) => (date ? new Date(date).toLocaleDateString() : '-');
const isLive = (s) => s.status === 'active' || s.status === 'grace';

const EXPIRING_GROUPS = [
    { key: 'critical', label: 'Within 7 days', className: 'text-red-700 bg-red-50' },
    { key: 'warning', label: '8–14 days', className: 'text-amber-800 bg-amber-50' },
    { key: 'upcoming', label: '15–30 days', className: 'text-blue-800 bg-blue-50' },
];

function RowActions({ subscription, onAction }) {
    return (
        <div className="flex justify-end gap-3 whitespace-nowrap text-sm">
            <button onClick={() => onAction('renew', subscription)} className="text-blue-600 hover:underline font-medium">Renew</button>
            {isLive(subscription) && (
                <>
                    <button onClick={() => onAction('extend', subscription)} className="text-blue-600 hover:underline font-medium">Extend</button>
                    <button onClick={() => onAction('cancel', subscription)} className="text-red-600 hover:underline font-medium">Cancel</button>
                </>
            )}
        </div>
    );
}

export default function SubscriptionsPage() {
    const queryClient = useQueryClient();
    const [searchParams, setSearchParams] = useSearchParams();
    const [page, setPage] = useState(1);
    const [showForm, setShowForm] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [action, setAction] = useState(null); // { type: 'renew' | 'extend' | 'cancel', subscription }

    const tab = searchParams.get('tab') === 'expiring' ? 'expiring' : 'all';
    const tenantId = searchParams.get('tenant_id') || '';
    const status = searchParams.get('status') || '';

    const setParam = (key, value) => {
        const next = new URLSearchParams(searchParams);
        if (value) next.set(key, value);
        else next.delete(key);
        setSearchParams(next, { replace: true });
        setPage(1);
    };

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['admin-subscriptions', page, tenantId, status],
        queryFn: () =>
            adminAPI.subscriptions
                .list({ page, tenant_id: tenantId || undefined, status: status || undefined })
                .then((r) => r.data),
        placeholderData: keepPreviousData,
        enabled: tab === 'all',
    });
    const subscriptions = data?.data || [];

    const { data: expiring, isLoading: expiringLoading } = useQuery({
        queryKey: ['admin-expiring'],
        queryFn: () => adminAPI.subscriptions.expiringSoon().then((r) => r.data.data),
    });

    const { data: tenants } = useQuery({
        queryKey: ['admin-tenant-options'],
        queryFn: () => adminAPI.tenants.options().then((r) => r.data.data),
    });

    const { data: plans } = useQuery({
        queryKey: ['admin-plans'],
        queryFn: () => adminAPI.plans.list().then((r) => r.data.data),
    });

    const filteredTenant = tenants?.find((t) => String(t.id) === tenantId);

    const createMutation = useMutation({
        mutationFn: (payload) => adminAPI.subscriptions.create(payload),
        onSuccess: () => {
            ['admin-subscriptions', 'admin-expiring', 'admin-tenants', 'admin-tenant-stats'].forEach((key) =>
                queryClient.invalidateQueries({ queryKey: [key] })
            );
            closeForm();
            toast.success('Subscription created');
        },
        onError: (err) => toast.error(apiErrorMessage(err, 'Failed to create subscription')),
    });

    const closeForm = () => {
        setShowForm(false);
        setSelectedPlan(null);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        const plan = plans?.find((p) => p.id === parseInt(d.plan_id));
        createMutation.mutate({
            tenant_id: parseInt(d.tenant_id),
            plan_id: plan?.id,
            plan_type: toSubscriptionType(plan?.slug),
            amount: plan ? parseFloat(plan.price) : 0,
            payment_method: d.payment_method || 'manual',
            payment_ref: d.payment_ref || null,
            notes: d.notes || null,
        });
    };

    const openAction = (type, subscription) => setAction({ type, subscription });
    const closeAction = () => setAction(null);

    if (isLoading || expiringLoading) return <LoadingSpinner />;

    const expiringCount = expiring?.counts?.total || 0;

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Subscriptions</h2>
                <button onClick={() => setShowForm(true)} className="btn-primary text-sm sm:text-base">+ Add Subscription</button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-4 border-b">
                {[
                    { key: 'all', label: 'All subscriptions' },
                    { key: 'expiring', label: `Expiring soon${expiringCount ? ` (${expiringCount})` : ''}` },
                ].map((t) => (
                    <button
                        key={t.key}
                        onClick={() => setParam('tab', t.key === 'all' ? '' : t.key)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                            tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === 'expiring' ? (
                <div className="space-y-6">
                    {expiringCount === 0 && <div className="card text-center text-gray-500 py-10">No subscriptions expire in the next 30 days.</div>}
                    {EXPIRING_GROUPS.map((group) => {
                        const rows = expiring?.[group.key] || [];
                        if (rows.length === 0) return null;
                        return (
                            <div key={group.key} className="card">
                                <h3 className={`inline-block text-sm font-semibold px-2.5 py-1 rounded-md mb-3 ${group.className}`}>
                                    {group.label} · {rows.length}
                                </h3>
                                <div className="divide-y">
                                    {rows.map((s) => (
                                        <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                                            <div className="min-w-0">
                                                <Link to={`/dashboard/admin/tenants/${s.tenant_id}`} className="font-medium text-gray-900 hover:text-blue-600">
                                                    {s.tenant?.name}
                                                </Link>
                                                <p className="text-xs text-gray-500">
                                                    {s.plan?.name || s.plan_type}{s.is_trial ? ' (trial)' : ''} · expires {formatDate(s.expires_at)} · {s.tenant?.email}
                                                </p>
                                            </div>
                                            <RowActions subscription={s} onAction={openAction} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <>
                    {/* Filters */}
                    <div className="flex flex-col sm:flex-row gap-3 mb-4">
                        <select value={tenantId} onChange={(e) => setParam('tenant_id', e.target.value)} className="input sm:max-w-xs">
                            <option value="">All restaurants</option>
                            {tenants?.map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                        <select value={status} onChange={(e) => setParam('status', e.target.value)} className="input sm:w-44">
                            <option value="">All statuses</option>
                            <option value="active">Active</option>
                            <option value="grace">Grace</option>
                            <option value="expired">Expired</option>
                            <option value="cancelled">Cancelled</option>
                            <option value="pending_review">Pending review</option>
                        </select>
                        {filteredTenant && (
                            <Link to={`/dashboard/admin/tenants/${filteredTenant.id}`} className="self-center text-sm text-blue-600 hover:underline">
                                Open {filteredTenant.name} →
                            </Link>
                        )}
                        {isFetching && <span className="self-center text-xs text-gray-400">Loading…</span>}
                    </div>

                    {subscriptions.length === 0 ? (
                        <div className="card text-center text-gray-500 py-10">No subscriptions match these filters.</div>
                    ) : (
                        <>
                            {/* Desktop Table */}
                            <div className="hidden md:block card overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left border-b">
                                            <th className="pb-3">Tenant</th><th className="pb-3">Plan</th><th className="pb-3">Amount</th>
                                            <th className="pb-3">Start</th><th className="pb-3">Expires</th><th className="pb-3">Grace Ends</th><th className="pb-3">Status</th>
                                            <th className="pb-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {subscriptions.map((s) => (
                                            <tr key={s.id} className="border-b last:border-0">
                                                <td className="py-3 font-medium">
                                                    <Link to={`/dashboard/admin/tenants/${s.tenant_id}`} className="hover:text-blue-600">{s.tenant?.name}</Link>
                                                </td>
                                                <td className="py-3 capitalize">
                                                    {s.plan?.name || s.plan_type}
                                                    {s.is_trial && <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-sky-100 text-sky-700">Trial</span>}
                                                </td>
                                                <td className="py-3">৳{s.amount}</td>
                                                <td className="py-3">{formatDate(s.starts_at)}</td>
                                                <td className="py-3">{formatDate(s.expires_at)}</td>
                                                <td className="py-3">{s.status === 'grace' ? formatDate(s.grace_ends_at) : '-'}</td>
                                                <td className="py-3"><StatusBadge status={s.status} /></td>
                                                <td className="py-3"><RowActions subscription={s} onAction={openAction} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile Cards */}
                            <div className="md:hidden space-y-3">
                                {subscriptions.map((s) => (
                                    <div key={s.id} className="card">
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                            <p className="font-semibold text-gray-900">{s.tenant?.name}</p>
                                            <StatusBadge status={s.status} />
                                        </div>
                                        <div className="flex items-center gap-3 text-sm text-gray-500 mb-2">
                                            <span className="capitalize">{s.plan?.name || s.plan_type}</span>
                                            <span className="font-medium text-gray-900">৳{s.amount}</span>
                                            {s.is_trial && <span className="px-2 py-0.5 text-xs rounded-full bg-sky-100 text-sky-700">Trial</span>}
                                        </div>
                                        <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t">
                                            <span>Start: {formatDate(s.starts_at)}</span>
                                            <span>Expires: {formatDate(s.expires_at)}</span>
                                        </div>
                                        <div className="mt-2 pt-2 border-t">
                                            <RowActions subscription={s} onAction={openAction} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    <Pagination meta={data?.meta} page={page} onPageChange={setPage} />
                </>
            )}

            <RenewSubscriptionModal
                tenant={action?.type === 'renew' ? { id: action.subscription.tenant_id, name: action.subscription.tenant?.name } : null}
                subscription={action?.type === 'renew' && isLive(action.subscription) ? action.subscription : null}
                isOpen={action?.type === 'renew'}
                onClose={closeAction}
            />
            <ExtendSubscriptionModal
                subscription={action?.type === 'extend' ? action.subscription : null}
                isOpen={action?.type === 'extend'}
                onClose={closeAction}
            />
            <CancelSubscriptionModal
                subscription={action?.type === 'cancel' ? action.subscription : null}
                isOpen={action?.type === 'cancel'}
                onClose={closeAction}
            />

            {/* Add Subscription Modal */}
            <Modal isOpen={showForm} onClose={closeForm} title="Add Subscription">
                <form key={tenants ? 'loaded' : 'loading'} onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="label">Tenant</label>
                        <select name="tenant_id" className="input" defaultValue={tenantId} required>
                            <option value="">Select a tenant</option>
                            {tenants?.map((t) => (
                                <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="label">Plan</label>
                        <select name="plan_id" className="input" required onChange={(e) => setSelectedPlan(plans?.find((p) => p.id === parseInt(e.target.value)))}>
                            <option value="">Select a plan</option>
                            {plans?.map((p) => (
                                <option key={p.id} value={p.id}>{p.name} — ৳{Number(p.price).toLocaleString()} / {p.duration_days} days</option>
                            ))}
                        </select>
                    </div>
                    {selectedPlan && (
                        <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                            <p><span className="font-medium text-gray-900">Amount:</span> ৳{Number(selectedPlan.price).toLocaleString()}</p>
                            <p><span className="font-medium text-gray-900">Duration:</span> {selectedPlan.duration_days} days</p>
                            <p className="text-xs text-gray-400 mt-1">Starts today, or when the tenant's current subscription ends.</p>
                        </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="label">Payment Method</label>
                            <select name="payment_method" className="input">
                                <option value="manual">Manual / Cash</option>
                                <option value="bkash">bKash</option>
                                <option value="bank">Bank Transfer</option>
                            </select>
                        </div>
                        <div>
                            <label className="label">Payment Ref</label>
                            <input name="payment_ref" className="input" placeholder="Transaction ID" />
                        </div>
                    </div>
                    <div>
                        <label className="label">Notes</label>
                        <input name="notes" className="input" placeholder="Optional notes" />
                    </div>
                    <div className="flex gap-3">
                        <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
                            {createMutation.isPending ? 'Saving...' : 'Save'}
                        </button>
                        <button type="button" onClick={closeForm} className="btn-secondary">Cancel</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
