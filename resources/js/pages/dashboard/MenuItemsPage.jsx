import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { menuAPI, categoryAPI } from '../../services/api';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Modal from '../../components/ui/Modal';
import GenerateDescriptionButton from '../../components/ai/GenerateDescriptionButton';
import toast from 'react-hot-toast';
import { HiOutlinePhotograph } from 'react-icons/hi';

export default function MenuItemsPage() {
    const queryClient = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState(null);
    const [search, setSearch] = useState('');
    const [imagePreview, setImagePreview] = useState(null);
    const [imageFile, setImageFile] = useState(null);
    const [formDescription, setFormDescription] = useState('');
    const imageInputRef = useRef(null);
    const { data: items, isLoading } = useQuery({
        queryKey: ['menu-items', search],
        queryFn: () => menuAPI.list({ search, per_page: 100 }).then((r) => r.data.data),
    });

    const { data: categories } = useQuery({
        queryKey: ['categories'],
        queryFn: () => categoryAPI.list().then((r) => r.data.data),
    });

    const toggleMutation = useMutation({
        mutationFn: (id) => menuAPI.toggle(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['menu-items']);
            toast.success('Availability toggled');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => menuAPI.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['menu-items']);
            toast.success('Item deleted');
        },
    });

    const saveMutation = useMutation({
        mutationFn: (formData) => {
            if (editing) return menuAPI.update(editing.id, formData);
            return menuAPI.create(formData);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['menu-items']);
            closeForm();
            toast.success(editing ? 'Item updated' : 'Item created');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Error'),
    });

    const closeForm = () => {
        setShowForm(false);
        setEditing(null);
        setImagePreview(null);
        setImageFile(null);
        setFormDescription('');
    };

    const openForm = (item = null) => {
        setEditing(item);
        setImagePreview(item?.image_url || null);
        setImageFile(null);
        setFormDescription(item?.description || '');
        setShowForm(true);
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const fd = new FormData();
        const raw = Object.fromEntries(new FormData(e.target));

        fd.append('name', raw.name);
        fd.append('price', raw.price);
        if (raw.category_id) fd.append('category_id', raw.category_id);
        if (formDescription) fd.append('description', formDescription);
        fd.append('is_active', e.target.is_active.checked ? '1' : '0');

        if (imageFile) {
            fd.append('image', imageFile);
        }

        saveMutation.mutate(fd);
    };

    if (isLoading) return <LoadingSpinner />;

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <h2 className="page-title">Menu Items</h2>
                <button onClick={() => openForm()} className="btn-primary text-sm sm:text-base">
                    + Add Item
                </button>
            </div>

            {/* Search */}
            <div className="mb-4">
                <input
                    type="text"
                    className="input max-w-xs"
                    placeholder="Search items..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            {/* Items Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {items?.map((item) => (
                    <div key={item.id} className={`card ${!item.is_active ? 'opacity-60' : ''}`}>
                        {item.image_url ? (
                            <div className="w-full h-40 rounded-lg overflow-hidden mb-3 bg-gray-100">
                                <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                            </div>
                        ) : (
                            <div className="w-full h-40 rounded-lg mb-3 bg-gray-50 flex items-center justify-center">
                                <HiOutlinePhotograph className="w-10 h-10 text-gray-300" />
                            </div>
                        )}
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="font-semibold text-gray-900">{item.name}</h3>
                                <p className="text-sm text-gray-500 mt-1">{item.category?.name || 'Uncategorized'}</p>
                                <p className="text-lg font-bold text-brand-700 mt-2">৳{item.price}</p>
                            </div>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${item.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {item.is_active ? 'Active' : 'Inactive'}
                            </span>
                        </div>
                        {item.description && (
                            <p className="text-sm text-gray-400 mt-2 line-clamp-2">{item.description}</p>
                        )}
                        <div className="flex gap-2 mt-4 pt-4 border-t">
                            <button onClick={() => toggleMutation.mutate(item.id)} className="text-sm text-brand-700 hover:text-brand-900">
                                {item.is_active ? 'Disable' : 'Enable'}
                            </button>
                            <button onClick={() => openForm(item)} className="text-sm text-gray-600 hover:text-gray-800">
                                Edit
                            </button>
                            <button onClick={() => { if (confirm('Delete this item?')) deleteMutation.mutate(item.id); }} className="text-sm text-red-600 hover:text-red-800">
                                Delete
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Form Modal */}
            <Modal isOpen={showForm} onClose={closeForm} title={editing ? 'Edit Item' : 'Add Item'}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Image Upload */}
                    <div>
                        <label className="label">Image</label>
                        <div className="flex items-center gap-4">
                            <div
                                onClick={() => imageInputRef.current?.click()}
                                className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-gray-50 cursor-pointer hover:border-brand-400 transition"
                            >
                                {imagePreview ? (
                                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                ) : (
                                    <HiOutlinePhotograph className="w-8 h-8 text-gray-400" />
                                )}
                            </div>
                            <div className="flex flex-col gap-1">
                                <button type="button" onClick={() => imageInputRef.current?.click()} className="text-sm text-brand-700 hover:text-brand-900">
                                    {imagePreview ? 'Change Image' : 'Upload Image'}
                                </button>
                                {imagePreview && (
                                    <button type="button" onClick={() => { setImagePreview(null); setImageFile(null); }} className="text-sm text-red-600 hover:text-red-800">
                                        Remove
                                    </button>
                                )}
                                <p className="text-xs text-gray-400">JPG, PNG. Max 2MB</p>
                            </div>
                        </div>
                        <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                    </div>

                    <div>
                        <label className="label">Name</label>
                        <input name="name" className="input" defaultValue={editing?.name} required />
                    </div>
                    <div>
                        <label className="label">Category</label>
                        <select name="category_id" className="input" defaultValue={editing?.category_id || ''}>
                            <option value="">Uncategorized</option>
                            {categories?.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="label">Price (৳)</label>
                        <input name="price" type="number" step="0.01" className="input" defaultValue={editing?.price} required />
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="label mb-0">Description</label>
                            <GenerateDescriptionButton
                                itemName={document.querySelector('input[name="name"]')?.value || editing?.name || ''}
                                categoryName={categories?.find(c => c.id == document.querySelector('select[name="category_id"]')?.value)?.name || editing?.category?.name}
                                price={parseFloat(document.querySelector('input[name="price"]')?.value) || editing?.price}
                                currentDescription={formDescription}
                                onDescriptionGenerated={(desc) => setFormDescription(desc)}
                            />
                        </div>
                        <textarea
                            name="description"
                            className="input"
                            rows={2}
                            value={formDescription}
                            onChange={(e) => setFormDescription(e.target.value)}
                            placeholder="Enter description or click AI Generate..."
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <input name="is_active" type="checkbox" defaultChecked={editing?.is_active ?? true} className="rounded" />
                        <label className="text-sm">Available</label>
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>
                            {saveMutation.isPending ? 'Saving...' : 'Save'}
                        </button>
                        <button type="button" onClick={closeForm} className="btn-secondary">Cancel</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
