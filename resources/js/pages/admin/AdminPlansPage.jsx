import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminAPI } from '../../services/api';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Modal from '../../components/ui/Modal';
import toast from 'react-hot-toast';
import { HiOutlineTicket, HiOutlineTrash, HiOutlinePencil } from 'react-icons/hi';

export default function AdminPlansPage() {
    const queryClient = useQueryClient();
    const [showModal, setShowModal] = useState(false);
    const [showModuleModal, setShowModuleModal] = useState(false);
    const [editingPlan, setEditingPlan] = useState(null);
    const [modulePlan, setModulePlan] = useState(null);
    const [moduleGroups, setModuleGroups] = useState({});
    const [selectedModuleKeys, setSelectedModuleKeys] = useState([]);
    const [moduleLoading, setModuleLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        slug: '',
        price: '',
        annual_price: '',
        trial_days: 14,
        duration_days: 30,
        features: [],
        max_users: 5,
        is_active: true,
        sort_order: 0,
    });
    const [newFeature, setNewFeature] = useState('');

    const { data: plans, isLoading } = useQuery({
        queryKey: ['admin-plans'],
        queryFn: () => adminAPI.plans.list().then(r => r.data.data),
    });

    const createMutation = useMutation({
        mutationFn: (data) => adminAPI.plans.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['admin-plans']);
            closeModal();
            toast.success('Plan created successfully');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to create plan'),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => adminAPI.plans.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['admin-plans']);
            closeModal();
            toast.success('Plan updated successfully');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to update plan'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => adminAPI.plans.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['admin-plans']);
            toast.success('Plan deleted successfully');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete plan'),
    });

    const toggleMutation = useMutation({
        mutationFn: (id) => adminAPI.plans.toggle(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['admin-plans']);
            toast.success('Plan status updated');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to update plan status'),
    });

    const syncModulesMutation = useMutation({
        mutationFn: ({ planId, moduleKeys }) => adminAPI.plans.syncModules(planId, moduleKeys),
        onSuccess: () => {
            queryClient.invalidateQueries(['admin-plans']);
            setShowModuleModal(false);
            setModulePlan(null);
            toast.success('Plan modules updated successfully');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to sync plan modules'),
    });

    const closeModal = () => {
        setShowModal(false);
        setEditingPlan(null);
        setFormData({
            name: '',
            slug: '',
            price: '',
            annual_price: '',
            trial_days: 14,
            duration_days: 30,
            features: [],
            max_users: 5,
            is_active: true,
            sort_order: 0,
        });
        setNewFeature('');
    };

    const openEdit = (plan) => {
        setEditingPlan(plan);
        setFormData({
            name: plan.name,
            slug: plan.slug,
            price: plan.price,
            annual_price: plan.annual_price || '',
            trial_days: plan.trial_days ?? 0,
            duration_days: plan.duration_days,
            features: plan.features || [],
            max_users: plan.max_users,
            is_active: plan.is_active,
            sort_order: plan.sort_order,
        });
        setShowModal(true);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const data = {
            ...formData,
            price: parseFloat(formData.price),
            annual_price: formData.annual_price === '' ? null : parseFloat(formData.annual_price),
            trial_days: parseInt(formData.trial_days) || 0,
            duration_days: parseInt(formData.duration_days),
            max_users: parseInt(formData.max_users),
            sort_order: parseInt(formData.sort_order),
        };

        if (editingPlan) {
            updateMutation.mutate({ id: editingPlan.id, data });
        } else {
            createMutation.mutate(data);
        }
    };

    const addFeature = () => {
        if (newFeature.trim()) {
            setFormData({ ...formData, features: [...formData.features, newFeature.trim()] });
            setNewFeature('');
        }
    };

    const removeFeature = (index) => {
        setFormData({
            ...formData,
            features: formData.features.filter((_, i) => i !== index),
        });
    };

    const openModuleManager = async (plan) => {
        try {
            setModuleLoading(true);
            setModulePlan(plan);

            const res = await adminAPI.plans.modules(plan.id);
            const groups = res.data?.data?.modules ?? {};

            setModuleGroups(groups);

            const included = [];
            Object.values(groups).forEach((items) => {
                (items || []).forEach((item) => {
                    if (item.included) {
                        included.push(item.key);
                    }
                });
            });

            setSelectedModuleKeys(included);
            setShowModuleModal(true);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Failed to load plan modules');
        } finally {
            setModuleLoading(false);
        }
    };

    const toggleModuleSelection = (moduleKey, isCore) => {
        if (isCore) {
            return;
        }

        setSelectedModuleKeys((prev) => (
            prev.includes(moduleKey)
                ? prev.filter((k) => k !== moduleKey)
                : [...prev, moduleKey]
        ));
    };

    const saveModuleConfiguration = () => {
        if (!modulePlan) {
            return;
        }

        syncModulesMutation.mutate({
            planId: modulePlan.id,
            moduleKeys: selectedModuleKeys,
        });
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-BD', {
            style: 'currency',
            currency: 'BDT',
            minimumFractionDigits: 0,
        }).format(amount || 0);
    };

    if (isLoading) return <LoadingSpinner />;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Subscription Plans</h1>
                    <p className="text-gray-500 mt-1">Manage subscription plans and pricing</p>
                </div>
                <button onClick={() => setShowModal(true)} className="btn-primary">
                    + Create Plan
                </button>
            </div>

            {/* Plans Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {plans?.map((plan) => (
                    <div
                        key={plan.id}
                        className={`bg-white rounded-xl p-6 shadow-sm border-2 transition-all ${
                            plan.is_active ? 'border-brand-200' : 'border-gray-200 opacity-60'
                        }`}
                    >
                        {/* Header */}
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <HiOutlineTicket className="w-5 h-5 text-brand-700" />
                                    <h3 className="font-bold text-lg text-gray-900">{plan.name}</h3>
                                </div>
                                <p className="text-xs text-gray-400 font-mono">{plan.slug}</p>
                            </div>
                            {!plan.is_active && (
                                <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
                                    Inactive
                                </span>
                            )}
                        </div>

                        {/* Pricing */}
                        <div className="mb-4">
                            <p className="text-3xl font-bold text-gray-900">
                                {formatCurrency(plan.price)}
                            </p>
                            <p className="text-sm text-gray-500">
                                for {plan.duration_days} days
                            </p>
                            {plan.annual_price && (
                                <p className="text-sm text-brand-700 mt-1">
                                    Annual: {formatCurrency(plan.annual_price)}
                                </p>
                            )}
                            {plan.trial_days > 0 && (
                                <p className="text-sm text-green-600 mt-1 font-medium">
                                    {plan.trial_days}-day free trial
                                </p>
                            )}
                        </div>

                        {/* Features */}
                        <ul className="space-y-2 mb-4">
                            {plan.features?.map((feature, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                                    <span className="text-green-500 mt-0.5">✓</span>
                                    {feature}
                                </li>
                            ))}
                            <li className="flex items-start gap-2 text-sm text-gray-600">
                                <span className="text-green-500 mt-0.5">✓</span>
                                Up to {plan.max_users} users
                            </li>
                        </ul>

                        {/* Stats */}
                        <div className="pt-4 border-t border-gray-100 mb-4">
                            <p className="text-sm text-gray-500">
                                <span className="font-semibold text-gray-900">
                                    {plan.active_subscriptions_count || 0}
                                </span>{' '}
                                active subscriptions
                            </p>
                            <p className="text-sm text-gray-500 mt-1">
                                <span className="font-semibold text-gray-900">{plan.module_count ?? '—'}</span> modules included
                            </p>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                            <button
                                onClick={() => toggleMutation.mutate(plan.id)}
                                className="btn-secondary text-sm"
                            >
                                {plan.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                                onClick={() => openEdit(plan)}
                                className="flex-1 btn-secondary flex items-center justify-center gap-2 text-sm"
                            >
                                <HiOutlinePencil className="w-4 h-4" />
                                Edit
                            </button>
                            <button
                                onClick={() => openModuleManager(plan)}
                                className="btn-secondary text-sm"
                                disabled={moduleLoading}
                            >
                                Modules
                            </button>
                            <button
                                onClick={() => {
                                    if (confirm('Are you sure you want to delete this plan?')) {
                                        deleteMutation.mutate(plan.id);
                                    }
                                }}
                                disabled={plan.active_subscriptions_count > 0}
                                className="btn text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                title={plan.active_subscriptions_count > 0 ? 'Cannot delete plan with active subscriptions' : ''}
                            >
                                <HiOutlineTrash className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Create/Edit Modal */}
            <Modal
                isOpen={showModal}
                onClose={closeModal}
                title={editingPlan ? 'Edit Plan' : 'Create Plan'}
                size="lg"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label">Plan Name</label>
                            <input
                                type="text"
                                className="input"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </div>
                        <div>
                            <label className="label">Slug (optional)</label>
                            <input
                                type="text"
                                className="input"
                                value={formData.slug}
                                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                                placeholder="auto-generated if empty"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label">Price (BDT)</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                className="input"
                                value={formData.price}
                                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                                required
                            />
                        </div>
                        <div>
                            <label className="label">Annual Price (BDT)</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                className="input"
                                value={formData.annual_price}
                                onChange={(e) => setFormData({ ...formData, annual_price: e.target.value })}
                                placeholder="Optional"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label">Duration (Days)</label>
                            <input
                                type="number"
                                min="1"
                                className="input"
                                value={formData.duration_days}
                                onChange={(e) => setFormData({ ...formData, duration_days: e.target.value })}
                                required
                            />
                        </div>
                        <div>
                            <label className="label">Free Trial Days</label>
                            <input
                                type="number"
                                min="0"
                                max="90"
                                className="input"
                                value={formData.trial_days}
                                onChange={(e) => setFormData({ ...formData, trial_days: e.target.value })}
                                placeholder="0 = no trial"
                            />
                        </div>
                        <div>
                            <label className="label">Max Users</label>
                            <input
                                type="number"
                                min="1"
                                className="input"
                                value={formData.max_users}
                                onChange={(e) => setFormData({ ...formData, max_users: e.target.value })}
                                required
                            />
                        </div>
                        <div>
                            <label className="label">Sort Order</label>
                            <input
                                type="number"
                                min="0"
                                className="input"
                                value={formData.sort_order}
                                onChange={(e) => setFormData({ ...formData, sort_order: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* Features */}
                    <div>
                        <label className="label">Features</label>
                        <div className="flex gap-2 mb-2">
                            <input
                                type="text"
                                className="input flex-1"
                                value={newFeature}
                                onChange={(e) => setNewFeature(e.target.value)}
                                placeholder="Add a feature..."
                                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addFeature())}
                            />
                            <button type="button" onClick={addFeature} className="btn-secondary">
                                Add
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {formData.features.map((feature, i) => (
                                <span
                                    key={i}
                                    className="inline-flex items-center gap-1 px-3 py-1 bg-brand-50 text-brand-800 rounded-full text-sm"
                                >
                                    {feature}
                                    <button
                                        type="button"
                                        onClick={() => removeFeature(i)}
                                        className="hover:text-red-600"
                                    >
                                        ×
                                    </button>
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Active Toggle */}
                    <div className="flex items-center gap-3">
                        <input
                            type="checkbox"
                            id="is_active"
                            checked={formData.is_active}
                            onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                            className="w-4 h-4 text-brand-700 rounded"
                        />
                        <label htmlFor="is_active" className="text-sm text-gray-700">
                            Plan is active and visible to users
                        </label>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={createMutation.isPending || updateMutation.isPending}
                        >
                            {createMutation.isPending || updateMutation.isPending
                                ? 'Saving...'
                                : editingPlan
                                ? 'Update Plan'
                                : 'Create Plan'}
                        </button>
                        <button type="button" onClick={closeModal} className="btn-secondary">
                            Cancel
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal
                isOpen={showModuleModal}
                onClose={() => setShowModuleModal(false)}
                title={`Plan Modules: ${modulePlan?.name || ''}`}
                size="xl"
            >
                <div className="space-y-5">
                    {Object.entries(moduleGroups).map(([group, modules]) => (
                        <div key={group} className="border border-gray-200 rounded-xl p-4">
                            <h4 className="font-semibold text-gray-900 capitalize mb-3">{group.replace('_', ' ')}</h4>
                            <div className="space-y-2">
                                {(modules || []).map((module) => {
                                    const checked = selectedModuleKeys.includes(module.key) || module.is_core;

                                    return (
                                        <label key={module.key} className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50">
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                disabled={module.is_core}
                                                onChange={() => toggleModuleSelection(module.key, module.is_core)}
                                                className="mt-1"
                                            />
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-gray-900">{module.label}</span>
                                                    {module.is_core && <span className="text-xs px-2 py-0.5 bg-brand-100 text-brand-800 rounded-full">Core</span>}
                                                    {!module.is_active && <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">Platform Disabled</span>}
                                                </div>
                                                <p className="text-xs text-gray-500 mt-0.5">{module.description}</p>
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    <div className="flex gap-3 pt-2">
                        <button className="btn-primary" onClick={saveModuleConfiguration} disabled={syncModulesMutation.isPending}>
                            {syncModulesMutation.isPending ? 'Saving...' : 'Save Module Configuration'}
                        </button>
                        <button className="btn-secondary" onClick={() => setShowModuleModal(false)}>
                            Cancel
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
