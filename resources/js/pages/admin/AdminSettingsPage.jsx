import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminAPI, platformAPI } from '../../services/api';
import { useBrandingStore } from '../../stores/brandingStore';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import toast from 'react-hot-toast';
import { HiOutlinePhotograph, HiOutlineTrash, HiOutlineUpload } from 'react-icons/hi';

const STORAGE_URL = '/storage/';

function ImageUpload({ label, currentImage, fieldName, onFileSelect, onRemove }) {
    const inputRef = useRef(null);
    const [preview, setPreview] = useState(null);

    const handleSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setPreview(URL.createObjectURL(file));
            onFileSelect(fieldName, file);
        }
    };

    const imgSrc = preview || (currentImage ? STORAGE_URL + currentImage : null);

    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
            <div className="flex items-center gap-4">
                <div className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-gray-50">
                    {imgSrc ? (
                        <img src={imgSrc} alt={label} className="w-full h-full object-contain" />
                    ) : (
                        <HiOutlinePhotograph className="w-8 h-8 text-gray-400" />
                    )}
                </div>
                <div className="flex flex-col gap-2">
                    <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-brand-50 text-brand-800 rounded-lg hover:bg-brand-100"
                    >
                        <HiOutlineUpload className="w-4 h-4" /> Upload
                    </button>
                    {(imgSrc) && (
                        <button
                            type="button"
                            onClick={() => {
                                setPreview(null);
                                onRemove(fieldName);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 bg-red-50 rounded-lg hover:bg-red-100"
                        >
                            <HiOutlineTrash className="w-4 h-4" /> Remove
                        </button>
                    )}
                </div>
            </div>
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleSelect} />
        </div>
    );
}

export default function AdminSettingsPage() {
    const queryClient = useQueryClient();
    const { setBranding } = useBrandingStore();
    const [form, setForm] = useState({});
    const [files, setFiles] = useState({});
    const [removals, setRemovals] = useState({});

    const { data, isLoading } = useQuery({
        queryKey: ['admin-settings'],
        queryFn: () => adminAPI.settings.get().then((r) => r.data.data),
        onSuccess: (d) => setForm(d || {}),
    });

    // Sync form when data loads
    React.useEffect(() => {
        if (data && Object.keys(form).length === 0) {
            setForm(data);
        }
    }, [data]);

    const mutation = useMutation({
        mutationFn: (formData) => adminAPI.settings.update(formData),
        onSuccess: () => {
            queryClient.invalidateQueries(['admin-settings']);
            queryClient.invalidateQueries(['platform-branding']);
            setFiles({});
            setRemovals({});
            // Refresh branding store so sidebar/favicon/title update immediately
            platformAPI.branding().then((res) => {
                const d = res.data.data;
                setBranding(d);
                if (d.platform_name) document.title = d.platform_name;
                if (d.platform_favicon) {
                    let link = document.querySelector("link[rel~='icon']");
                    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
                    link.href = '/storage/' + d.platform_favicon;
                }
            });
            toast.success('Platform branding updated!');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to update'),
    });

    const handleChange = (field, value) => {
        setForm((prev) => ({ ...prev, [field]: value }));
    };

    const handleFileSelect = (field, file) => {
        setFiles((prev) => ({ ...prev, [field]: file }));
        setRemovals((prev) => {
            const copy = { ...prev };
            delete copy[field];
            return copy;
        });
    };

    const handleRemove = (field) => {
        setRemovals((prev) => ({ ...prev, [field]: true }));
        setFiles((prev) => {
            const copy = { ...prev };
            delete copy[field];
            return copy;
        });
        setForm((prev) => ({ ...prev, [field]: null }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const fd = new FormData();

        // Text fields
        ['platform_name', 'primary_color', 'secondary_color', 'footer_text', 'powered_by_text', 'powered_by_url'].forEach((key) => {
            if (form[key] !== undefined && form[key] !== null) {
                fd.append(key, form[key]);
            }
        });

        // File uploads
        Object.entries(files).forEach(([key, file]) => {
            fd.append(key, file);
        });

        // Removals
        Object.keys(removals).forEach((key) => {
            fd.append(`remove_${key}`, '1');
        });

        mutation.mutate(fd);
    };

    if (isLoading) return <LoadingSpinner />;

    return (
        <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Platform Settings</h2>

            <form onSubmit={handleSubmit} className="space-y-8">
                {/* Branding Logos */}
                <div className="card">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Platform Logo & Favicon</h3>
                    <p className="text-sm text-gray-500 mb-6">
                        These appear on the admin dashboard sidebar, login page, and as a small "powered by" branding on restaurant & customer panels.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <ImageUpload
                            label="Logo (Light Background)"
                            currentImage={form.platform_logo}
                            fieldName="platform_logo"
                            onFileSelect={handleFileSelect}
                            onRemove={handleRemove}
                        />
                        <ImageUpload
                            label="Logo (Dark Background)"
                            currentImage={form.platform_logo_dark}
                            fieldName="platform_logo_dark"
                            onFileSelect={handleFileSelect}
                            onRemove={handleRemove}
                        />
                        <ImageUpload
                            label="Favicon"
                            currentImage={form.platform_favicon}
                            fieldName="platform_favicon"
                            onFileSelect={handleFileSelect}
                            onRemove={handleRemove}
                        />
                    </div>
                </div>

                {/* Text settings */}
                <div className="card">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Platform Info</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="label">Platform Name</label>
                            <input
                                className="input"
                                value={form.platform_name || ''}
                                onChange={(e) => handleChange('platform_name', e.target.value)}
                                placeholder="TablePilot"
                            />
                        </div>
                        <div>
                            <label className="label">Footer Text</label>
                            <input
                                className="input"
                                value={form.footer_text || ''}
                                onChange={(e) => handleChange('footer_text', e.target.value)}
                                placeholder="© 2026 TablePilot. All rights reserved."
                            />
                        </div>
                        <div>
                            <label className="label">"Powered By" Text</label>
                            <input
                                className="input"
                                value={form.powered_by_text || ''}
                                onChange={(e) => handleChange('powered_by_text', e.target.value)}
                                placeholder="Powered by TablePilot"
                            />
                            <p className="text-xs text-gray-400 mt-1">Shown on restaurant & customer panels</p>
                        </div>
                        <div>
                            <label className="label">"Powered By" URL</label>
                            <input
                                className="input"
                                value={form.powered_by_url || ''}
                                onChange={(e) => handleChange('powered_by_url', e.target.value)}
                                placeholder="https://yourwebsite.com"
                            />
                        </div>
                    </div>
                </div>

                {/* Colors */}
                <div className="card">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Brand Colors</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="label">Primary Color</label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    value={form.primary_color || '#ED802A'}
                                    onChange={(e) => handleChange('primary_color', e.target.value)}
                                    className="w-12 h-10 rounded border cursor-pointer"
                                />
                                <input
                                    className="input flex-1"
                                    value={form.primary_color || '#ED802A'}
                                    onChange={(e) => handleChange('primary_color', e.target.value)}
                                    placeholder="#ED802A"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="label">Secondary Color</label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    value={form.secondary_color || '#B8560E'}
                                    onChange={(e) => handleChange('secondary_color', e.target.value)}
                                    className="w-12 h-10 rounded border cursor-pointer"
                                />
                                <input
                                    className="input flex-1"
                                    value={form.secondary_color || '#B8560E'}
                                    onChange={(e) => handleChange('secondary_color', e.target.value)}
                                    placeholder="#B8560E"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Preview */}
                    <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-500 mb-3">Live Preview:</p>
                        <div className="flex gap-4 items-center">
                            <div className="h-10 px-6 rounded-lg flex items-center justify-center text-white text-sm font-medium" style={{ backgroundColor: form.primary_color || '#ED802A' }}>
                                Primary Button
                            </div>
                            <div className="h-10 px-6 rounded-lg flex items-center justify-center text-white text-sm font-medium" style={{ backgroundColor: form.secondary_color || '#B8560E' }}>
                                Secondary
                            </div>
                        </div>
                    </div>
                </div>

                {/* Submit */}
                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={mutation.isPending}
                        className="btn-primary px-8"
                    >
                        {mutation.isPending ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </form>
        </div>
    );
}
