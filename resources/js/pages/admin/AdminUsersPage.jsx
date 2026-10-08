import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { adminAPI, apiErrorMessage } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import StatusBadge from '../../components/ui/StatusBadge';
import Pagination from '../../components/ui/Pagination';
import UserFormModal, { ROLE_OPTIONS } from '../../components/admin/UserFormModal';

const ROLE_LABELS = {
    super_admin: 'Super Admin',
    ...Object.fromEntries(ROLE_OPTIONS.map((r) => [r.value, r.label])),
};

export default function AdminUsersPage() {
    const queryClient = useQueryClient();
    const currentUser = useAuthStore((s) => s.user);
    const [searchParams, setSearchParams] = useSearchParams();
    const [page, setPage] = useState(1);
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [formUser, setFormUser] = useState(undefined); // undefined = closed, null = create, object = edit

    const tenantId = searchParams.get('tenant_id') || '';
    const role = searchParams.get('role') || '';
    const status = searchParams.get('status') || '';

    const setFilter = (key, value) => {
        const next = new URLSearchParams(searchParams);
        if (value) next.set(key, value);
        else next.delete(key);
        setSearchParams(next, { replace: true });
        setPage(1);
    };

    useEffect(() => {
        const t = setTimeout(() => {
            setSearch(searchInput.trim());
            setPage(1);
        }, 350);
        return () => clearTimeout(t);
    }, [searchInput]);

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['admin-users', page, search, tenantId, role, status],
        queryFn: () =>
            adminAPI.users
                .list({
                    page,
                    search: search || undefined,
                    tenant_id: tenantId || undefined,
                    role: role || undefined,
                    status: status || undefined,
                })
                .then((r) => r.data),
        placeholderData: keepPreviousData,
    });
    const users = data?.data || [];

    const { data: tenants } = useQuery({
        queryKey: ['admin-tenant-options'],
        queryFn: () => adminAPI.tenants.options().then((r) => r.data.data),
    });
    const filteredTenant = tenants?.find((t) => String(t.id) === tenantId);

    const statusMutation = useMutation({
        mutationFn: ({ user, status: nextStatus }) => adminAPI.users.update(user.id, { status: nextStatus }),
        onSuccess: (_, { status: nextStatus }) => {
            queryClient.invalidateQueries({ queryKey: ['admin-users'] });
            toast.success(nextStatus === 'active' ? 'User activated' : 'User deactivated');
        },
        onError: (err) => toast.error(apiErrorMessage(err, 'Failed to update user')),
    });

    const handleToggleStatus = (user) => {
        const nextStatus = user.status === 'active' ? 'inactive' : 'active';
        if (nextStatus === 'inactive' && !window.confirm(`Deactivate ${user.name}? They will no longer be able to sign in.`)) return;
        statusMutation.mutate({ user, status: nextStatus });
    };

    // Pending users are applicants; they get activated through the Applications approval flow
    const canToggle = (user) => user.role !== 'super_admin' && user.id !== currentUser?.id && user.status !== 'pending';

    if (isLoading) return <LoadingSpinner />;

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Users</h2>
                    {filteredTenant && (
                        <p className="text-sm text-gray-500">
                            Showing users of{' '}
                            <Link to={`/dashboard/admin/tenants/${filteredTenant.id}`} className="text-brand-700 hover:underline">
                                {filteredTenant.name}
                            </Link>
                        </p>
                    )}
                </div>
                <button onClick={() => setFormUser(null)} className="btn-primary text-sm sm:text-base">+ Add User</button>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <input
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search name or email"
                    className="input"
                />
                <select value={tenantId} onChange={(e) => setFilter('tenant_id', e.target.value)} className="input">
                    <option value="">All restaurants</option>
                    {tenants?.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                </select>
                <select value={role} onChange={(e) => setFilter('role', e.target.value)} className="input">
                    <option value="">All roles</option>
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                    ))}
                </select>
                <select value={status} onChange={(e) => setFilter('status', e.target.value)} className="input">
                    <option value="">All statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="pending">Pending approval</option>
                </select>
            </div>
            {isFetching && <p className="text-xs text-gray-400 mb-2">Loading…</p>}

            {users.length === 0 ? (
                <div className="card text-center text-gray-500 py-10">No users match these filters.</div>
            ) : (
                <>
                    {/* Desktop Table */}
                    <div className="hidden md:block card overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left border-b">
                                    <th className="pb-3">User</th>
                                    <th className="pb-3">Restaurant</th>
                                    <th className="pb-3">Role</th>
                                    <th className="pb-3">Status</th>
                                    <th className="pb-3">Joined</th>
                                    <th className="pb-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((u) => (
                                    <tr key={u.id} className="border-b last:border-0">
                                        <td className="py-3">
                                            <p className="font-medium text-gray-900">{u.name}</p>
                                            <p className="text-xs text-gray-400">{u.email}</p>
                                        </td>
                                        <td className="py-3">
                                            {u.tenant ? (
                                                <Link to={`/dashboard/admin/tenants/${u.tenant.id}`} className="hover:text-brand-700">{u.tenant.name}</Link>
                                            ) : (
                                                <span className="text-gray-400">—</span>
                                            )}
                                        </td>
                                        <td className="py-3">{ROLE_LABELS[u.role] || u.role}</td>
                                        <td className="py-3"><StatusBadge status={u.status} /></td>
                                        <td className="py-3 text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
                                        <td className="py-3">
                                            <div className="flex justify-end gap-3 whitespace-nowrap">
                                                <button onClick={() => setFormUser(u)} className="text-brand-700 hover:underline">Edit</button>
                                                {canToggle(u) && (
                                                    <button
                                                        onClick={() => handleToggleStatus(u)}
                                                        className={u.status === 'active' ? 'text-red-600 hover:underline' : 'text-green-600 hover:underline'}
                                                    >
                                                        {u.status === 'active' ? 'Deactivate' : 'Activate'}
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Cards */}
                    <div className="md:hidden space-y-3">
                        {users.map((u) => (
                            <div key={u.id} className="card">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="font-semibold text-gray-900 truncate">{u.name}</p>
                                        <p className="text-xs text-gray-500 truncate">{u.email}</p>
                                    </div>
                                    <StatusBadge status={u.status} />
                                </div>
                                <p className="text-sm text-gray-500 mt-2">
                                    {ROLE_LABELS[u.role] || u.role}{u.tenant ? ` · ${u.tenant.name}` : ''}
                                </p>
                                <div className="flex justify-end gap-4 mt-3 pt-3 border-t text-sm">
                                    <button onClick={() => setFormUser(u)} className="text-brand-700 font-medium">Edit</button>
                                    {canToggle(u) && (
                                        <button onClick={() => handleToggleStatus(u)} className={`font-medium ${u.status === 'active' ? 'text-red-600' : 'text-green-600'}`}>
                                            {u.status === 'active' ? 'Deactivate' : 'Activate'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            <Pagination meta={data?.meta} page={page} onPageChange={setPage} />

            <UserFormModal
                user={formUser}
                fixedTenant={formUser === null && filteredTenant ? filteredTenant : undefined}
                isOpen={formUser !== undefined}
                onClose={() => setFormUser(undefined)}
            />
        </div>
    );
}
