import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { categoryAPI } from '../../services/api';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Modal from '../../components/ui/Modal';
import toast from 'react-hot-toast';

export default function CategoriesPage() {
    const queryClient = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState(null);

    const { data: categories, isLoading } = useQuery({
        queryKey: ['categories'],
        queryFn: () => categoryAPI.list().then((r) => r.data.data),
    });

    const saveMutation = useMutation({
        mutationFn: (data) => editing ? categoryAPI.update(editing.id, data) : categoryAPI.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['categories']);
            setShowForm(false);
            setEditing(null);
            toast.success(editing ? 'Updated' : 'Created');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => categoryAPI.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['categories']);
            toast.success('Deleted');
        },
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target));
        data.is_active = e.target.is_active.checked;
        saveMutation.mutate(data);
    };

    if (isLoading) return <LoadingSpinner />;

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <h2 className="page-title">Categories</h2>
                <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary text-sm sm:text-base">+ Add Category</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {categories?.map((cat) => (
                    <div key={cat.id} className="card">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold">{cat.name}</h3>
                            <span className="text-xs text-gray-500">{cat.menu_items_count || 0} items</span>
                        </div>
                        {cat.description && <p className="text-sm text-gray-400 mt-1">{cat.description}</p>}
                        <div className="flex gap-3 mt-4 pt-3 border-t">
                            <button onClick={() => { setEditing(cat); setShowForm(true); }} className="text-sm text-brand-700">Edit</button>
                            <button onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(cat.id); }} className="text-sm text-red-600">Delete</button>
                        </div>
                    </div>
                ))}
            </div>

            <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Category' : 'Add Category'}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="label">Name</label>
                        <input name="name" className="input" defaultValue={editing?.name} required />
                    </div>
                    <div>
                        <label className="label">Description</label>
                        <input name="description" className="input" defaultValue={editing?.description} />
                    </div>
                    <div>
                        <label className="label">Sort Order</label>
                        <input name="sort_order" type="number" className="input" defaultValue={editing?.sort_order || 0} />
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
