import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { voucherAPI } from '../../services/api';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Modal from '../../components/ui/Modal';
import toast from 'react-hot-toast';

export default function VouchersPage() {
    const queryClient = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState(null);

    const { data, isLoading } = useQuery({
        queryKey: ['vouchers'],
        queryFn: () => voucherAPI.list().then((r) => r.data.data),
    });

    const saveMutation = useMutation({
        mutationFn: (data) => editing ? voucherAPI.update(editing.id, data) : voucherAPI.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['vouchers']);
            setShowForm(false);
            setEditing(null);
            toast.success(editing ? 'Updated' : 'Created');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Error'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => voucherAPI.delete(id),
        onSuccess: () => { queryClient.invalidateQueries(['vouchers']); toast.success('Deleted'); },
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        d.is_active = e.target.is_active.checked;
        d.discount_value = parseFloat(d.discount_value);
        d.min_purchase = parseFloat(d.min_purchase || 0);
        if (d.max_uses) d.max_uses = parseInt(d.max_uses);
        saveMutation.mutate(d);
    };

    if (isLoading) return <LoadingSpinner />;

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <h2 className="page-title">Vouchers</h2>
                <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary text-sm sm:text-base">+ Add Voucher</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {data?.map((v) => (
                    <div key={v.id} className={`card ${!v.is_active ? 'opacity-60' : ''}`}>
                        <div className="flex justify-between">
                            <code className="text-lg font-bold text-brand-700">{v.code}</code>
                            <span className={`text-xs font-medium px-2 py-1 rounded ${v.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                {v.is_active ? 'Active' : 'Inactive'}
                            </span>
                        </div>
                        <p className="text-2xl font-bold mt-2">
                            {v.type === 'percentage' ? `${v.discount_value}%` : `৳${v.discount_value}`}
                        </p>
                        <div className="text-sm text-gray-500 mt-2 space-y-1">
                            <p>Min purchase: ৳{v.min_purchase}</p>
                            <p>Expires: {new Date(v.expiry_date).toLocaleDateString()}</p>
                            {v.max_uses && <p>Uses: {v.used_count}/{v.max_uses}</p>}
                        </div>
                        <div className="flex gap-3 mt-4 pt-3 border-t">
                            <button onClick={() => { setEditing(v); setShowForm(true); }} className="text-sm text-brand-700">Edit</button>
                            <button onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(v.id); }} className="text-sm text-red-600">Delete</button>
                        </div>
                    </div>
                ))}
            </div>

            <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Voucher' : 'Add Voucher'}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="label">Code</label>
                        <input name="code" className="input uppercase" defaultValue={editing?.code} required />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="label">Type</label>
                            <select name="type" className="input" defaultValue={editing?.type || 'fixed'}>
                                <option value="fixed">Fixed (৳)</option>
                                <option value="percentage">Percentage (%)</option>
                            </select>
                        </div>
                        <div>
                            <label className="label">Discount Value</label>
                            <input name="discount_value" type="number" step="0.01" className="input" defaultValue={editing?.discount_value} required />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="label">Min Purchase</label>
                            <input name="min_purchase" type="number" className="input" defaultValue={editing?.min_purchase || 0} />
                        </div>
                        <div>
                            <label className="label">Max Uses</label>
                            <input name="max_uses" type="number" className="input" defaultValue={editing?.max_uses} placeholder="Unlimited" />
                        </div>
                    </div>
                    <div>
                        <label className="label">Expiry Date</label>
                        <input name="expiry_date" type="date" className="input" defaultValue={editing?.expiry_date?.split('T')[0]} required />
                    </div>
                    <div className="flex items-center gap-2">
                        <input name="is_active" type="checkbox" defaultChecked={editing?.is_active ?? true} className="rounded" />
                        <label className="text-sm">Active</label>
                    </div>
                    <div className="flex gap-3">
                        <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>Save</button>
                        <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
