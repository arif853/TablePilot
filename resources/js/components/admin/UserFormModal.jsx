import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import { adminAPI, apiErrorMessage } from '../../services/api';

export const ROLE_OPTIONS = [
    { value: 'restaurant_admin', label: 'Restaurant Admin' },
    { value: 'staff', label: 'Staff' },
    { value: 'kitchen', label: 'Kitchen' },
];

/**
 * Create a user (user = null) or edit one. Pass fixedTenant to lock the tenant
 * (e.g. when adding a user from a tenant's detail page).
 */
export default function UserFormModal({ user, fixedTenant, isOpen, onClose }) {
    const queryClient = useQueryClient();
    const isEdit = !!user;
    const isSuperAdminTarget = user?.role === 'super_admin';

    const { data: tenants } = useQuery({
        queryKey: ['admin-tenant-options'],
        queryFn: () => adminAPI.tenants.options().then((r) => r.data.data),
        enabled: isOpen && !fixedTenant && !isSuperAdminTarget,
    });

    const saveMutation = useMutation({
        mutationFn: (data) => (isEdit ? adminAPI.users.update(user.id, data) : adminAPI.users.create(data)),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-users'] });
            queryClient.invalidateQueries({ queryKey: ['admin-tenant-stats'] });
            toast.success(isEdit ? 'User updated' : 'User created');
            onClose();
        },
        onError: (err) => toast.error(apiErrorMessage(err, 'Failed to save user')),
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        const form = Object.fromEntries(new FormData(e.target));
        const data = {
            name: form.name,
            email: form.email,
            phone: form.phone || null,
        };

        if (!isSuperAdminTarget) {
            data.role = form.role;
            const tenantId = fixedTenant ? fixedTenant.id : parseInt(form.tenant_id);
            if (tenantId) data.tenant_id = tenantId;
            if (isEdit && form.status !== user.status) data.status = form.status;
        }

        if (!isEdit || form.password) data.password = form.password;

        saveMutation.mutate(data);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? `Edit ${user.name}` : 'Add User'}>
            <form key={user?.id ?? 'new'} onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><label className="label">Name</label><input name="name" className="input" defaultValue={user?.name || ''} required /></div>
                    <div><label className="label">Email</label><input name="email" type="email" className="input" defaultValue={user?.email || ''} required /></div>
                </div>
                <div><label className="label">Phone</label><input name="phone" className="input" defaultValue={user?.phone || ''} /></div>

                {!isSuperAdminTarget && (
                    <>
                        <div>
                            <label className="label">Restaurant</label>
                            {fixedTenant ? (
                                <input className="input bg-gray-50" value={fixedTenant.name} readOnly />
                            ) : (
                                <select key={tenants ? 'loaded' : 'loading'} name="tenant_id" className="input" defaultValue={user?.tenant_id || ''} required={!isEdit || !!user.tenant_id}>
                                    <option value="">Select a restaurant</option>
                                    {tenants?.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.name}{t.is_active ? '' : ' (inactive)'}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="label">Role</label>
                                <select name="role" className="input" defaultValue={user?.role || 'staff'}>
                                    {ROLE_OPTIONS.map((r) => (
                                        <option key={r.value} value={r.value}>{r.label}</option>
                                    ))}
                                </select>
                            </div>
                            {isEdit && (
                                <div>
                                    <label className="label">Status</label>
                                    <select name="status" className="input" defaultValue={user.status}>
                                        {user.status === 'pending' && <option value="pending">Pending approval</option>}
                                        <option value="active">Active</option>
                                        <option value="inactive">Inactive</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    </>
                )}

                <div>
                    <label className="label">{isEdit ? 'New Password' : 'Password'}</label>
                    <input
                        name="password"
                        type="password"
                        className="input"
                        minLength={8}
                        required={!isEdit}
                        autoComplete="new-password"
                        placeholder={isEdit ? 'Leave blank to keep current password' : 'Minimum 8 characters'}
                    />
                </div>

                <div className="flex gap-3 pt-2">
                    <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>
                        {saveMutation.isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create User'}
                    </button>
                    <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
                </div>
            </form>
        </Modal>
    );
}
