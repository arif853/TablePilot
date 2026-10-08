import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { adminAPI, apiErrorMessage } from '../../services/api';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import StatusBadge from '../../components/ui/StatusBadge';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import EditTenantModal from '../../components/admin/EditTenantModal';
import { RenewSubscriptionModal } from '../../components/admin/SubscriptionModals';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

const toSubscriptionType = (slug) => (slug === 'monthly' || slug === 'yearly' ? slug : 'custom');

const daysUntil = (date) => Math.ceil((new Date(date) - new Date()) / 86400000);

function SubscriptionCell({ subscription }) {
    if (!subscription) {
        return <span className="text-xs font-medium text-red-600">No active plan</span>;
    }

    const days = daysUntil(subscription.expires_at);

    return (
        <div>
            <div className="flex items-center gap-1.5">
                <span className="font-medium text-gray-800">{subscription.plan?.name || subscription.plan_type}</span>
                {subscription.is_trial && <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-sky-100 text-sky-700">Trial</span>}
            </div>
            <p className={`text-xs ${days <= 7 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                {days <= 0 ? 'Expires today' : `${days} day${days === 1 ? '' : 's'} left`} · {new Date(subscription.expires_at).toLocaleDateString()}
            </p>
        </div>
    );
}

export default function TenantsPage() {
    const queryClient = useQueryClient();
    const [page, setPage] = useState(1);
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [selected, setSelected] = useState([]);
    const [showOnboard, setShowOnboard] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [startTrial, setStartTrial] = useState(false);
    const [editTenant, setEditTenant] = useState(null);
    const [renewTenant, setRenewTenant] = useState(null);

    // Debounce search so we don't query on every keystroke
    useEffect(() => {
        const t = setTimeout(() => {
            setSearch(searchInput.trim());
            setPage(1);
        }, 350);
        return () => clearTimeout(t);
    }, [searchInput]);

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['admin-tenants', page, search, status],
        queryFn: () => adminAPI.tenants.list({ page, search: search || undefined, status: status || undefined }).then((r) => r.data),
        placeholderData: keepPreviousData,
    });
    const tenants = data?.data || [];

    const { data: plans } = useQuery({
        queryKey: ['admin-plans'],
        queryFn: () => adminAPI.plans.list().then((r) => r.data.data),
    });

    const invalidateTenants = () => queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });

    const onboardMutation = useMutation({
        mutationFn: (payload) => adminAPI.tenants.create(payload),
        onSuccess: (res) => {
            invalidateTenants();
            queryClient.invalidateQueries({ queryKey: ['admin-tenant-options'] });
            closeOnboard();
            toast.success(res.data.message || 'Tenant onboarded!');
        },
        onError: (err) => toast.error(apiErrorMessage(err, 'Failed to onboard tenant')),
    });

    const toggleMutation = useMutation({
        mutationFn: ({ id, is_active }) => adminAPI.tenants.update(id, { is_active }),
        onSuccess: (_, { is_active }) => {
            invalidateTenants();
            toast.success(is_active ? 'Tenant activated' : 'Tenant deactivated');
        },
        onError: (err) => toast.error(apiErrorMessage(err, 'Failed to update tenant')),
    });

    const bulkMutation = useMutation({
        mutationFn: (action) => adminAPI.tenants.bulkAction({ action, tenant_ids: selected }),
        onSuccess: (res) => {
            invalidateTenants();
            setSelected([]);
            toast.success(res.data.message);
        },
        onError: (err) => toast.error(apiErrorMessage(err, 'Bulk action failed')),
    });

    const exportMutation = useMutation({
        mutationFn: () => adminAPI.tenants.export(),
        onSuccess: (res) => {
            const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `tenants-${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        },
        onError: () => toast.error('Export failed'),
    });

    const closeOnboard = () => {
        setShowOnboard(false);
        setSelectedPlan(null);
        setStartTrial(false);
    };

    const handleToggle = (tenant) => {
        if (tenant.is_active && !window.confirm(`Deactivate ${tenant.name}? Its staff will be locked out until reactivated.`)) return;
        toggleMutation.mutate({ id: tenant.id, is_active: !tenant.is_active });
    };

    const handleBulk = (action) => {
        if (action === 'deactivate' && !window.confirm(`Deactivate ${selected.length} tenant(s)?`)) return;
        bulkMutation.mutate(action);
    };

    const toggleSelected = (id) => {
        setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    const allOnPageSelected = tenants.length > 0 && tenants.every((t) => selected.includes(t.id));
    const toggleSelectPage = () => {
        const ids = tenants.map((t) => t.id);
        setSelected((prev) => (allOnPageSelected ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]));
    };

    const handleOnboard = (e) => {
        e.preventDefault();
        const formData = Object.fromEntries(new FormData(e.target));
        const plan = plans?.find((p) => p.id === parseInt(formData.plan_id));
        onboardMutation.mutate({
            name: formData.name,
            email: formData.email,
            phone: formData.phone || null,
            address: formData.address || null,
            payment_mode: formData.payment_mode,
            commission_rate: parseFloat(formData.commission_rate || 5),
            tax_rate: parseFloat(formData.tax_rate || 0),
            max_users: formData.max_users ? parseInt(formData.max_users) : null,
            admin_name: formData.admin_name,
            admin_email: formData.admin_email,
            admin_password: formData.admin_password,
            plan_id: plan ? plan.id : null,
            plan_type: toSubscriptionType(plan?.slug),
            custom_days: plan ? plan.duration_days : 30,
            subscription_amount: startTrial ? 0 : plan ? parseFloat(plan.price) : 0,
            payment_method: formData.payment_method || 'manual',
            payment_ref: formData.payment_ref || null,
            start_trial: startTrial,
            trial_days: startTrial ? parseInt(formData.trial_days) : null,
        });
    };

    if (isLoading) return <LoadingSpinner />;

    const activeSubscriptionPlans = plans?.filter((p) => p.is_active !== false);

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Tenants</h2>
                <div className="flex gap-2">
                    <button onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending} className="btn-secondary text-sm sm:text-base">
                        {exportMutation.isPending ? 'Exporting...' : 'Export CSV'}
                    </button>
                    <button onClick={() => setShowOnboard(true)} className="btn-primary text-sm sm:text-base">+ Onboard</button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <input
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search by name, email or slug"
                    className="input sm:max-w-sm"
                />
                <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="input sm:w-44">
                    <option value="">All statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                </select>
                {isFetching && <span className="self-center text-xs text-gray-400">Loading…</span>}
            </div>

            {/* Bulk actions */}
            {selected.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 mb-4 px-4 py-2.5 rounded-lg bg-brand-50 text-sm">
                    <span className="font-medium text-brand-950">{selected.length} selected</span>
                    <button onClick={() => handleBulk('activate')} disabled={bulkMutation.isPending} className="text-green-700 font-medium hover:underline">Activate</button>
                    <button onClick={() => handleBulk('deactivate')} disabled={bulkMutation.isPending} className="text-red-600 font-medium hover:underline">Deactivate</button>
                    <button onClick={() => setSelected([])} className="ml-auto text-gray-500 hover:underline">Clear</button>
                </div>
            )}

            {tenants.length === 0 ? (
                <div className="card text-center text-gray-500 py-10">
                    {search || status ? 'No tenants match these filters.' : 'No tenants yet. Onboard your first restaurant.'}
                </div>
            ) : (
                <>
                    {/* Desktop Table */}
                    <div className="hidden md:block card overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left border-b">
                                    <th className="pb-3 w-8">
                                        <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectPage} aria-label="Select all on page" />
                                    </th>
                                    <th className="pb-3">Restaurant</th>
                                    <th className="pb-3">Subscription</th>
                                    <th className="pb-3">Users</th>
                                    <th className="pb-3">Payment</th>
                                    <th className="pb-3">Status</th>
                                    <th className="pb-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tenants.map((t) => (
                                    <tr key={t.id} className="border-b last:border-0 align-top">
                                        <td className="py-3">
                                            <input type="checkbox" checked={selected.includes(t.id)} onChange={() => toggleSelected(t.id)} aria-label={`Select ${t.name}`} />
                                        </td>
                                        <td className="py-3">
                                            <Link to={`/dashboard/admin/tenants/${t.id}`} className="font-medium text-gray-900 hover:text-brand-700">
                                                {t.name}
                                            </Link>
                                            <p className="text-xs text-gray-400">{t.email}</p>
                                            <p className="text-xs text-gray-400 font-mono">{t.slug}</p>
                                        </td>
                                        <td className="py-3"><SubscriptionCell subscription={t.active_subscription} /></td>
                                        <td className="py-3">
                                            <Link to={`/dashboard/admin/users?tenant_id=${t.id}`} className="hover:text-brand-700">
                                                {t.users_count} / {t.max_users}
                                            </Link>
                                        </td>
                                        <td className="py-3">
                                            <span className="capitalize">{t.payment_mode}</span>
                                            <p className="text-xs text-gray-400">{t.commission_rate}% commission</p>
                                        </td>
                                        <td className="py-3"><StatusBadge status={t.is_active ? 'active' : 'inactive'} /></td>
                                        <td className="py-3">
                                            <div className="flex justify-end gap-3 whitespace-nowrap">
                                                <button onClick={() => setEditTenant(t)} className="text-brand-700 hover:underline">Edit</button>
                                                <button onClick={() => setRenewTenant(t)} className="text-brand-700 hover:underline">Renew</button>
                                                <button
                                                    onClick={() => handleToggle(t)}
                                                    className={t.is_active ? 'text-red-600 hover:underline' : 'text-green-600 hover:underline'}
                                                >
                                                    {t.is_active ? 'Deactivate' : 'Activate'}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Cards */}
                    <div className="md:hidden space-y-3">
                        {tenants.map((t) => (
                            <div key={t.id} className="card">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="flex items-start gap-2 min-w-0">
                                        <input type="checkbox" className="mt-1" checked={selected.includes(t.id)} onChange={() => toggleSelected(t.id)} aria-label={`Select ${t.name}`} />
                                        <div className="min-w-0">
                                            <Link to={`/dashboard/admin/tenants/${t.id}`} className="font-semibold text-gray-900 truncate block">{t.name}</Link>
                                            <p className="text-xs text-gray-500 truncate">{t.email}</p>
                                        </div>
                                    </div>
                                    <StatusBadge status={t.is_active ? 'active' : 'inactive'} />
                                </div>
                                <div className="text-sm"><SubscriptionCell subscription={t.active_subscription} /></div>
                                <div className="flex items-center justify-between mt-3 pt-3 border-t text-sm">
                                    <span className="text-gray-500">{t.users_count}/{t.max_users} users</span>
                                    <div className="flex gap-3">
                                        <button onClick={() => setEditTenant(t)} className="text-brand-700 font-medium">Edit</button>
                                        <button onClick={() => setRenewTenant(t)} className="text-brand-700 font-medium">Renew</button>
                                        <button onClick={() => handleToggle(t)} className={`font-medium ${t.is_active ? 'text-red-600' : 'text-green-600'}`}>
                                            {t.is_active ? 'Deactivate' : 'Activate'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            <Pagination meta={data?.meta} page={page} onPageChange={setPage} />

            <EditTenantModal tenant={editTenant} isOpen={!!editTenant} onClose={() => setEditTenant(null)} />
            <RenewSubscriptionModal
                tenant={renewTenant}
                subscription={renewTenant?.active_subscription}
                isOpen={!!renewTenant}
                onClose={() => setRenewTenant(null)}
            />

            {/* Onboard Modal */}
            <Modal isOpen={showOnboard} onClose={closeOnboard} title="Onboard Tenant" size="lg">
                <form onSubmit={handleOnboard} className="space-y-4">
                    <h4 className="font-medium text-gray-700">Restaurant Info</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div><label className="label">Restaurant Name</label><input name="name" className="input" required /></div>
                        <div><label className="label">Email</label><input name="email" type="email" className="input" required /></div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div><label className="label">Phone</label><input name="phone" className="input" /></div>
                        <div>
                            <label className="label">Payment Mode</label>
                            <select name="payment_mode" className="input">
                                <option value="seller">Seller Collects</option>
                                <option value="platform">Platform Collects</option>
                            </select>
                        </div>
                    </div>
                    <div><label className="label">Address</label><textarea name="address" className="input" rows={2} /></div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div><label className="label">Commission %</label><input name="commission_rate" type="number" step="0.01" min="0" max="100" className="input" defaultValue="5" /></div>
                        <div><label className="label">Tax %</label><input name="tax_rate" type="number" step="0.01" min="0" max="100" className="input" defaultValue="0" /></div>
                        <div>
                            <label className="label">Max Users</label>
                            <input name="max_users" type="number" min="1" max="999" className="input" placeholder={selectedPlan ? `Plan: ${selectedPlan.max_users}` : 'From plan'} />
                        </div>
                    </div>

                    <hr />
                    <h4 className="font-medium text-gray-700">Admin User</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div><label className="label">Admin Name</label><input name="admin_name" className="input" required /></div>
                        <div><label className="label">Admin Email</label><input name="admin_email" type="email" className="input" required /></div>
                    </div>
                    <div><label className="label">Admin Password</label><input name="admin_password" type="password" className="input" required minLength={8} autoComplete="new-password" /></div>

                    <hr />
                    <h4 className="font-medium text-gray-700">Subscription</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="label">Plan</label>
                            <select name="plan_id" className="input" required onChange={(e) => setSelectedPlan(plans?.find((p) => p.id === parseInt(e.target.value)))}>
                                <option value="">Select a plan</option>
                                {activeSubscriptionPlans?.map((p) => (
                                    <option key={p.id} value={p.id}>{p.name} — ৳{Number(p.price).toLocaleString()} / {p.duration_days} days</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="label">Amount</label>
                            <input className="input bg-gray-50" value={startTrial ? 0 : selectedPlan ? selectedPlan.price : ''} readOnly />
                        </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={startTrial} onChange={(e) => setStartTrial(e.target.checked)} />
                        Start on a free trial instead of a paid subscription
                    </label>
                    {startTrial ? (
                        <div className="sm:w-1/2">
                            <label className="label">Trial Days</label>
                            <input
                                key={selectedPlan?.id ?? 'none'}
                                name="trial_days"
                                type="number"
                                min="1"
                                max="365"
                                className="input"
                                defaultValue={selectedPlan?.trial_days || 14}
                                required
                            />
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="label">Payment Method</label>
                                <select name="payment_method" className="input">
                                    <option value="manual">Manual / Cash</option>
                                    <option value="bkash">bKash</option>
                                    <option value="bank">Bank Transfer</option>
                                </select>
                            </div>
                            <div><label className="label">Payment Ref</label><input name="payment_ref" className="input" placeholder="Transaction ID" /></div>
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button type="submit" className="btn-primary" disabled={onboardMutation.isPending}>
                            {onboardMutation.isPending ? 'Creating...' : 'Onboard'}
                        </button>
                        <button type="button" onClick={closeOnboard} className="btn-secondary">Cancel</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
