import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { subscriptionAPI, brandingAPI, plansAPI } from '../../services/api';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import toast from 'react-hot-toast';
import { HiOutlinePhotograph, HiOutlineTrash, HiOutlineUpload } from 'react-icons/hi';
import SubscriptionStatusCard from '../../components/SubscriptionStatusCard';

const STORAGE_URL = '/storage/';

function ImageUpload({ label, currentImage, fieldName, onFileSelect, onRemove, hint }) {
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
                <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-gray-50">
                    {imgSrc ? (
                        <img src={imgSrc} alt={label} className="w-full h-full object-contain" />
                    ) : (
                        <HiOutlinePhotograph className="w-7 h-7 text-gray-400" />
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
                    {imgSrc && (
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
            {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleSelect} />
        </div>
    );
}

function BrandingTab() {
    const queryClient = useQueryClient();
    const [form, setForm] = useState({});
    const [files, setFiles] = useState({});
    const [removals, setRemovals] = useState({});

    const { data, isLoading } = useQuery({
        queryKey: ['tenant-branding'],
        queryFn: () => brandingAPI.get().then((r) => r.data.data),
    });

    useEffect(() => {
        if (data && Object.keys(form).length === 0) {
            setForm(data);
        }
    }, [data]);

    const mutation = useMutation({
        mutationFn: (fd) => brandingAPI.update(fd),
        onSuccess: () => {
            queryClient.invalidateQueries(['tenant-branding']);
            setFiles({});
            setRemovals({});
            toast.success('Branding updated!');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to update'),
    });

    const handleChange = (field, value) => setForm((p) => ({ ...p, [field]: value }));

    const handleFileSelect = (field, file) => {
        setFiles((p) => ({ ...p, [field]: file }));
        setRemovals((p) => { const c = { ...p }; delete c[field]; return c; });
    };

    const handleRemove = (field) => {
        setRemovals((p) => ({ ...p, [field]: true }));
        setFiles((p) => { const c = { ...p }; delete c[field]; return c; });
        setForm((p) => ({ ...p, [field]: null }));
    };

    const handleSocial = (platform, url) => {
        setForm((p) => ({
            ...p,
            social_links: { ...(p.social_links || {}), [platform]: url },
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const fd = new FormData();

        ['name', 'description', 'primary_color', 'secondary_color', 'accent_color'].forEach((k) => {
            if (form[k] !== undefined && form[k] !== null) fd.append(k, form[k]);
        });

        if (form.social_links) {
            Object.entries(form.social_links).forEach(([k, v]) => {
                fd.append(`social_links[${k}]`, v || '');
            });
        }

        Object.entries(files).forEach(([k, f]) => fd.append(k, f));
        Object.keys(removals).forEach((k) => fd.append(`remove_${k}`, '1'));

        mutation.mutate(fd);
    };

    if (isLoading) return <LoadingSpinner />;

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Logo & Images */}
            <div className="card">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Restaurant Logo & Images</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <ImageUpload label="Logo" currentImage={form.logo} fieldName="logo" onFileSelect={handleFileSelect} onRemove={handleRemove} hint="Shown in header & customer menu" />
                    <ImageUpload label="Logo (Dark)" currentImage={form.logo_dark} fieldName="logo_dark" onFileSelect={handleFileSelect} onRemove={handleRemove} hint="For dark backgrounds" />
                    <ImageUpload label="Favicon" currentImage={form.favicon} fieldName="favicon" onFileSelect={handleFileSelect} onRemove={handleRemove} hint="Browser tab icon" />
                    <ImageUpload label="Banner" currentImage={form.banner_image} fieldName="banner_image" onFileSelect={handleFileSelect} onRemove={handleRemove} hint="Customer menu page banner" />
                </div>
            </div>

            {/* Restaurant Info */}
            <div className="card">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Restaurant Info</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="label">Restaurant Name</label>
                        <input className="input" value={form.name || ''} onChange={(e) => handleChange('name', e.target.value)} />
                    </div>
                    <div className="md:col-span-2">
                        <label className="label">Description</label>
                        <textarea className="input" rows={3} value={form.description || ''} onChange={(e) => handleChange('description', e.target.value)} placeholder="A short description of your restaurant..." />
                    </div>
                </div>
            </div>

            {/* Brand Colors */}
            <div className="card">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Brand Colors</h3>
                <p className="text-sm text-gray-500 mb-4">These colors are used on the customer ordering page.</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[
                        { key: 'primary_color', label: 'Primary', default: '#ED802A' },
                        { key: 'secondary_color', label: 'Secondary', default: '#B8560E' },
                        { key: 'accent_color', label: 'Accent', default: '#F59E0B' },
                    ].map((c) => (
                        <div key={c.key}>
                            <label className="label">{c.label} Color</label>
                            <div className="flex items-center gap-3">
                                <input type="color" value={form[c.key] || c.default} onChange={(e) => handleChange(c.key, e.target.value)} className="w-12 h-10 rounded border cursor-pointer" />
                                <input className="input flex-1" value={form[c.key] || c.default} onChange={(e) => handleChange(c.key, e.target.value)} />
                            </div>
                        </div>
                    ))}
                </div>
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500 mb-3">Customer Panel Preview:</p>
                    <div className="flex gap-3 items-center flex-wrap">
                        <div className="h-9 px-5 rounded-full flex items-center justify-center text-white text-sm font-medium" style={{ backgroundColor: form.primary_color || '#ED802A' }}>Add to Cart</div>
                        <div className="h-9 px-5 rounded-full flex items-center justify-center text-white text-sm font-medium" style={{ backgroundColor: form.secondary_color || '#B8560E' }}>View Cart</div>
                        <div className="h-9 px-5 rounded-full flex items-center justify-center text-white text-sm font-medium" style={{ backgroundColor: form.accent_color || '#F59E0B' }}>Special Offer</div>
                    </div>
                </div>
            </div>

            {/* Social Links */}
            <div className="card">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Social Links</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label className="label">Facebook</label>
                        <input className="input" value={form.social_links?.facebook || ''} onChange={(e) => handleSocial('facebook', e.target.value)} placeholder="https://facebook.com/..." />
                    </div>
                    <div>
                        <label className="label">Instagram</label>
                        <input className="input" value={form.social_links?.instagram || ''} onChange={(e) => handleSocial('instagram', e.target.value)} placeholder="https://instagram.com/..." />
                    </div>
                    <div>
                        <label className="label">Website</label>
                        <input className="input" value={form.social_links?.website || ''} onChange={(e) => handleSocial('website', e.target.value)} placeholder="https://yourwebsite.com" />
                    </div>
                </div>
            </div>

            <div className="flex justify-end">
                <button type="submit" disabled={mutation.isPending} className="btn-primary px-8">
                    {mutation.isPending ? 'Saving...' : 'Save Branding'}
                </button>
            </div>
        </form>
    );
}

function SubscriptionTab() {
    const queryClient = useQueryClient();
    const [selectedPlanId, setSelectedPlanId] = useState('');

    const { data, isLoading } = useQuery({
        queryKey: ['subscription-current'],
        queryFn: () => subscriptionAPI.current().then((r) => r.data.data),
    });

    const { data: plansData } = useQuery({
        queryKey: ['public-plans-for-renewal'],
        queryFn: () => plansAPI.list().then((r) => r.data.data || r.data),
    });

    const plans = Array.isArray(plansData) ? plansData : [];

    useEffect(() => {
        if (!selectedPlanId && plans.length > 0) {
            setSelectedPlanId(String(plans[0].id));
        }
    }, [plans, selectedPlanId]);

    const renewMutation = useMutation({
        mutationFn: () => subscriptionAPI.pay({ plan_id: Number(selectedPlanId) }),
        onSuccess: (res) => {
            const payload = res.data?.data || {};
            if (payload.payment_url) {
                window.location.href = payload.payment_url;
                return;
            }

            queryClient.invalidateQueries(['subscription-current']);
            toast.success('Subscription renewed successfully');
        },
        onError: (err) => {
            toast.error(err.response?.data?.message || 'Failed to start renewal');
        },
    });

    if (isLoading) return <LoadingSpinner />;

    const needsRenewal = !data?.subscription || data?.expired;

    return (
        <div className="space-y-4">
            <SubscriptionStatusCard data={data} />

            <div className="card">
                <h3 className="text-lg font-semibold mb-4">Quick Renewal</h3>
                <div className="flex flex-col sm:flex-row gap-2">
                    <select
                        className="input"
                        value={selectedPlanId}
                        onChange={(e) => setSelectedPlanId(e.target.value)}
                    >
                        {plans.map((plan) => (
                            <option key={plan.id} value={plan.id}>
                                {plan.name} - ৳{plan.price}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        disabled={!selectedPlanId || renewMutation.isPending}
                        onClick={() => renewMutation.mutate()}
                        className="btn-primary whitespace-nowrap"
                    >
                        {renewMutation.isPending ? 'Starting...' : 'Renew Now'}
                    </button>
                </div>

                {needsRenewal && data?.is_on_trial && (
                    <p className="text-xs text-amber-600 mt-3">
                        Trial ends in {data.trial_days_remaining ?? 0} day(s).
                    </p>
                )}
            </div>
        </div>
    );
}

function VatSettingsTab() {
    const queryClient = useQueryClient();
    const [form, setForm] = useState({
        vat_registered: false,
        vat_number: '',
        default_vat_rate: '5.00',
        vat_inclusive: false,
    });

    const { data, isLoading } = useQuery({
        queryKey: ['tenant-branding'],
        queryFn: () => brandingAPI.get().then((r) => r.data.data),
    });

    useEffect(() => {
        if (data) {
            setForm({
                vat_registered: !!data.vat_registered,
                vat_number: data.vat_number || '',
                default_vat_rate: data.default_vat_rate ?? '5.00',
                vat_inclusive: !!data.vat_inclusive,
            });
        }
    }, [data]);

    const mutation = useMutation({
        mutationFn: (fd) => brandingAPI.update(fd),
        onSuccess: () => {
            queryClient.invalidateQueries(['tenant-branding']);
            toast.success('VAT settings updated!');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to update'),
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        const fd = new FormData();
        fd.append('vat_registered', form.vat_registered ? '1' : '0');
        fd.append('vat_number', form.vat_number);
        fd.append('default_vat_rate', form.default_vat_rate);
        fd.append('vat_inclusive', form.vat_inclusive ? '1' : '0');
        mutation.mutate(fd);
    };

    if (isLoading) return <LoadingSpinner />;

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="card">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">VAT / BIN Configuration</h3>
                <p className="text-sm text-gray-500 mb-6">
                    Configure your VAT settings for Bangladesh NBR compliance. These settings affect how invoices are generated and VAT is calculated.
                </p>

                <div className="space-y-5">
                    {/* VAT Registered toggle */}
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                            <p className="font-medium text-gray-800">VAT Registered</p>
                            <p className="text-sm text-gray-500">Enable if your restaurant is registered for VAT with NBR</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setForm((p) => ({ ...p, vat_registered: !p.vat_registered }))}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.vat_registered ? 'bg-brand-600' : 'bg-gray-300'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.vat_registered ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    {/* BIN Number */}
                    <div>
                        <label className="label">BIN / VAT Registration Number</label>
                        <input
                            className="input"
                            value={form.vat_number}
                            onChange={(e) => setForm((p) => ({ ...p, vat_number: e.target.value }))}
                            placeholder="Enter your 13-digit BIN number"
                            maxLength={20}
                        />
                        <p className="text-xs text-gray-400 mt-1">Business Identification Number issued by NBR. Printed on invoices.</p>
                    </div>

                    {/* Default VAT Rate */}
                    <div>
                        <label className="label">Default VAT Rate (%)</label>
                        <input
                            type="number"
                            className="input"
                            value={form.default_vat_rate}
                            onChange={(e) => setForm((p) => ({ ...p, default_vat_rate: e.target.value }))}
                            step="0.01"
                            min="0"
                            max="100"
                            placeholder="5.00"
                        />
                        <p className="text-xs text-gray-400 mt-1">Standard rate for restaurants in Bangladesh is 5%. Set to 0 to disable VAT.</p>
                    </div>

                    {/* VAT Inclusive toggle */}
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                            <p className="font-medium text-gray-800">VAT Inclusive Pricing</p>
                            <p className="text-sm text-gray-500">When enabled, menu prices already include VAT. When disabled, VAT is added on top.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setForm((p) => ({ ...p, vat_inclusive: !p.vat_inclusive }))}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.vat_inclusive ? 'bg-brand-600' : 'bg-gray-300'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.vat_inclusive ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    {/* Preview */}
                    <div className="p-4 bg-brand-50 border border-brand-200 rounded-lg">
                        <p className="text-sm font-medium text-brand-900 mb-2">Calculation Preview (item priced ৳100)</p>
                        {form.vat_inclusive ? (
                            <div className="text-sm text-brand-800 space-y-0.5">
                                <p>Price shown: ৳100.00 (VAT included)</p>
                                <p>VAT ({form.default_vat_rate}%): ৳{(100 * parseFloat(form.default_vat_rate || 0) / (100 + parseFloat(form.default_vat_rate || 0))).toFixed(2)}</p>
                                <p>Net: ৳{(100 - 100 * parseFloat(form.default_vat_rate || 0) / (100 + parseFloat(form.default_vat_rate || 0))).toFixed(2)}</p>
                                <p className="font-bold">Customer pays: ৳100.00</p>
                            </div>
                        ) : (
                            <div className="text-sm text-brand-800 space-y-0.5">
                                <p>Price shown: ৳100.00 (excl. VAT)</p>
                                <p>VAT ({form.default_vat_rate}%): ৳{(100 * parseFloat(form.default_vat_rate || 0) / 100).toFixed(2)}</p>
                                <p className="font-bold">Customer pays: ৳{(100 + 100 * parseFloat(form.default_vat_rate || 0) / 100).toFixed(2)}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex justify-end">
                <button type="submit" disabled={mutation.isPending} className="btn-primary px-8">
                    {mutation.isPending ? 'Saving...' : 'Save VAT Settings'}
                </button>
            </div>
        </form>
    );
}

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState('branding');

    const tabs = [
        { id: 'branding', label: 'Branding' },
        { id: 'vat', label: 'VAT Settings' },
        { id: 'subscription', label: 'Subscription' },
    ];

    return (
        <div>
            <h2 className="page-title mb-6">Settings</h2>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                            activeTab === tab.id
                                ? 'bg-white text-brand-800 shadow-sm'
                                : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'branding' && <BrandingTab />}
            {activeTab === 'vat' && <VatSettingsTab />}
            {activeTab === 'subscription' && <SubscriptionTab />}
        </div>
    );
}
