import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { userAPI, apiErrorMessage } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Modal from '../../components/ui/Modal';
import StatusBadge from '../../components/ui/StatusBadge';
import Pagination from '../../components/ui/Pagination';
import toast from 'react-hot-toast';

const ROLE_LABELS = {
    restaurant_admin: 'Restaurant Admin',
    staff: 'Staff / Waiter',
    kitchen: 'Kitchen',
};

export default function UsersPage() {
    const queryClient = useQueryClient();
    const currentUser = useAuthStore((s) => s.user);
    const [page, setPage] = useState(1);
    const [editing, setEditing] = useState(undefined); // undefined = closed, null = create, object = edit

    const { data, isLoading } = useQuery({
        queryKey: ['users', page],
        queryFn: () => userAPI.list({ page }).then((r) => r.data),
        placeholderData: keepPreviousData,
    });
    const users = data?.data || [];
    const seats = data?.seats;
    const atLimit = seats && seats.used >= seats.max;

    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] });

    const saveMutation = useMutation({
        mutationFn: (payload) => (editing ? userAPI.update(editing.id, payload) : userAPI.create(payload)),
        onSuccess: () => {
            invalidate();
            toast.success(editing ? 'User updated' : 'User added');
            setEditing(undefined);
        },
        onError: (err) => toast.error(apiErrorMessage(err, 'Failed to save user')),
    });

    const statusMutation = useMutation({
        mutationFn: ({ user, status }) => userAPI.update(user.id, { status }),
        onSuccess: (_, { status }) => {
            invalidate();
            toast.success(status === 'active' ? 'User activated' : 'User deactivated');
        },
        onError: (err) => toast.error(apiErrorMessage(err, 'Failed to update user')),
    });

    const isSelf = (user) => user.id === currentUser?.id;
    // Restaurant admins manage staff and kitchen accounts; other admins are managed by the platform
    const canManage = (user) => user.role !== 'restaurant_admin' || isSelf(user);
    const canToggle = (user) => user.role !== 'restaurant_admin' && !isSelf(user);

    const handleToggle = (user) => {
        const status = user.status === 'active' ? 'inactive' : 'active';
        if (status === 'inactive' && !window.confirm(`Deactivate ${user.name}? They will be signed out and unable to log in.`)) return;
        statusMutation.mutate({ user, status });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        const payload = { name: d.name, email: d.email, phone: d.phone || null };
        if (d.password) payload.password = d.password;
        // Own role can't change; only send role for staff/kitchen accounts
        if (!editing || editing.role !== 'restaurant_admin') payload.role = d.role;
        saveMutation.mutate(payload);
    };

    if (isLoading) return <LoadingSpinner />;

    const editingAdmin = editing?.role === 'restaurant_admin';

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div>
                    <h2 className="page-title">Team Members</h2>
                    {seats && (
                        <p className={`text-sm ${atLimit ? 'text-red-600' : 'text-gray-500'}`}>
                            {seats.used} of {seats.max} active users{atLimit ? ' · plan limit reached' : ''}
                        </p>
                    )}
                </div>
                <button
                    onClick={() => setEditing(null)}
                    disabled={atLimit}
                    title={atLimit ? 'Your plan’s user limit is reached. Deactivate a user or upgrade your plan.' : undefined}
                    className="btn-primary text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    + Add User
                </button>
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block card overflow-x-auto">
                <table className="data-table">
                    <thead>
                        <tr className="text-left border-b">
                            <th className="pb-3">Name</th><th className="pb-3">Email</th><th className="pb-3">Phone</th>
                            <th className="pb-3">Role</th><th className="pb-3">Status</th><th className="pb-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((user) => (
                            <tr key={user.id} className="border-b last:border-0">
                                <td className="py-3 font-medium">
                                    {user.name}
                                    {isSelf(user) && <span className="ml-2 text-xs text-gray-400">(you)</span>}
                                </td>
                                <td className="py-3">{user.email}</td>
                                <td className="py-3 text-gray-500">{user.phone || '—'}</td>
                                <td className="py-3">{ROLE_LABELS[user.role] || user.role}</td>
                                <td className="py-3"><StatusBadge status={user.status} /></td>
                                <td className="py-3">
                                    <div className="flex justify-end gap-3 whitespace-nowrap">
                                        {canManage(user) && (
                                            <button onClick={() => setEditing(user)} className="text-brand-700 hover:underline">Edit</button>
                                        )}
                                        {canToggle(user) && (
                                            <button
                                                onClick={() => handleToggle(user)}
                                                disabled={statusMutation.isPending}
                                                className={user.status === 'active' ? 'text-red-600 hover:underline' : 'text-green-600 hover:underline'}
                                            >
                                                {user.status === 'active' ? 'Deactivate' : 'Activate'}
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
                {users.map((user) => (
                    <div key={user.id} className="card">
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-9 h-9 bg-brand-600 rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0">
                                    {user.name?.[0]?.toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                    <p className="font-medium text-gray-900 truncate">{user.name}{isSelf(user) ? ' (you)' : ''}</p>
                                    <p className="text-sm text-gray-500 truncate">{user.email}</p>
                                </div>
                            </div>
                            <StatusBadge status={user.status} />
                        </div>
                        <div className="flex items-center justify-between mt-3 pt-3 border-t">
                            <span className="text-sm text-gray-500">{ROLE_LABELS[user.role] || user.role}</span>
                            <div className="flex gap-4 text-sm font-medium">
                                {canManage(user) && <button onClick={() => setEditing(user)} className="text-brand-700">Edit</button>}
                                {canToggle(user) && (
                                    <button onClick={() => handleToggle(user)} className={user.status === 'active' ? 'text-red-600' : 'text-green-600'}>
                                        {user.status === 'active' ? 'Deactivate' : 'Activate'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <Pagination meta={data?.meta} page={page} onPageChange={setPage} />

            <Modal isOpen={editing !== undefined} onClose={() => setEditing(undefined)} title={editing ? 'Edit User' : 'Add User'}>
                <form key={editing?.id ?? 'new'} onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="label">Name</label>
                            <input name="name" className="input" defaultValue={editing?.name} required />
                        </div>
                        <div>
                            <label className="label">Phone</label>
                            <input name="phone" className="input" defaultValue={editing?.phone || ''} />
                        </div>
                    </div>
                    <div>
                        <label className="label">Email</label>
                        <input name="email" type="email" className="input" defaultValue={editing?.email} required />
                    </div>
                    <div>
                        <label className="label">{editing ? 'New Password' : 'Password'}</label>
                        <input
                            name="password"
                            type="password"
                            className="input"
                            minLength={8}
                            required={!editing}
                            autoComplete="new-password"
                            placeholder={editing ? 'Leave blank to keep current password' : 'Minimum 8 characters'}
                        />
                    </div>
                    <div>
                        <label className="label">Role</label>
                        {editingAdmin ? (
                            <input className="input bg-gray-50" value={ROLE_LABELS.restaurant_admin} readOnly />
                        ) : (
                            <select name="role" className="input" defaultValue={editing?.role || 'staff'}>
                                <option value="staff">{ROLE_LABELS.staff}</option>
                                <option value="kitchen">{ROLE_LABELS.kitchen}</option>
                            </select>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                            Staff use POS, orders and tables. Kitchen users only see the kitchen display.
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>
                            {saveMutation.isPending ? 'Saving...' : 'Save'}
                        </button>
                        <button type="button" onClick={() => setEditing(undefined)} className="btn-secondary">Cancel</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
