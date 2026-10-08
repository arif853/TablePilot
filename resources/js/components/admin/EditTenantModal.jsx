import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import { adminAPI, apiErrorMessage } from '../../services/api';

const TEXT_FIELDS = ['name', 'email', 'phone', 'address', 'payment_mode', 'commission_rate', 'tax_rate', 'max_users', 'authorized_wifi_ip'];
const CLEARABLE_FIELDS = ['phone', 'address', 'authorized_wifi_ip'];

export default function EditTenantModal({ tenant, isOpen, onClose }) {
    const queryClient = useQueryClient();

    const updateMutation = useMutation({
        mutationFn: (formData) => adminAPI.tenants.updateForm(tenant.id, formData),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
            queryClient.invalidateQueries({ queryKey: ['admin-tenant-stats'] });
            toast.success('Tenant updated');
            onClose();
        },
        onError: (err) => toast.error(apiErrorMessage(err, 'Failed to update tenant')),
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        const form = new FormData(e.target);
        const formData = new FormData();

        TEXT_FIELDS.forEach((field) => {
            const value = form.get(field) ?? '';
            // Blank optional text fields are sent so they can be cleared; blank numbers are skipped
            if (value !== '' || CLEARABLE_FIELDS.includes(field)) formData.append(field, value);
        });

        const logo = form.get('logo');
        if (logo && logo.size > 0) formData.append('logo', logo);

        updateMutation.mutate(formData);
    };

    if (!tenant) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Edit ${tenant.name}`} size="lg">
            <form key={tenant.id} onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><label className="label">Restaurant Name</label><input name="name" className="input" defaultValue={tenant.name} required /></div>
                    <div><label className="label">Email</label><input name="email" type="email" className="input" defaultValue={tenant.email} required /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><label className="label">Phone</label><input name="phone" className="input" defaultValue={tenant.phone || ''} /></div>
                    <div>
                        <label className="label">Payment Mode</label>
                        <select name="payment_mode" className="input" defaultValue={tenant.payment_mode || 'seller'}>
                            <option value="seller">Seller Collects</option>
                            <option value="platform">Platform Collects</option>
                        </select>
                    </div>
                </div>
                <div><label className="label">Address</label><textarea name="address" className="input" rows={2} defaultValue={tenant.address || ''} /></div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div><label className="label">Commission %</label><input name="commission_rate" type="number" step="0.01" min="0" max="100" className="input" defaultValue={tenant.commission_rate ?? 0} /></div>
                    <div><label className="label">Tax %</label><input name="tax_rate" type="number" step="0.01" min="0" max="100" className="input" defaultValue={tenant.tax_rate ?? 0} /></div>
                    <div><label className="label">Max Users</label><input name="max_users" type="number" min="1" max="999" className="input" defaultValue={tenant.max_users ?? 5} /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="label">Authorized WiFi IP</label>
                        <input name="authorized_wifi_ip" className="input" defaultValue={tenant.authorized_wifi_ip || ''} placeholder="Optional" />
                    </div>
                    <div>
                        <label className="label">Logo</label>
                        <input name="logo" type="file" accept="image/*" className="input" />
                    </div>
                </div>
                <div className="flex gap-3 pt-2">
                    <button type="submit" className="btn-primary" disabled={updateMutation.isPending}>
                        {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
                </div>
            </form>
        </Modal>
    );
}
