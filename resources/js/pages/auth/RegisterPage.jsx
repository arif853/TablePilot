import React, { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useBrandingStore } from '../../stores/brandingStore';
import { authAPI, plansAPI } from '../../services/api';
import toast from 'react-hot-toast';

export default function RegisterPage() {
    const [form, setForm] = useState({
        name: '',
        email: '',
        password: '',
        password_confirmation: '',
        restaurant_name: '',
        phone: '',
        address: '',
        plan_id: '',
    });
    const [loading, setLoading] = useState(false);
    const { branding } = useBrandingStore();
    const navigate = useNavigate();

    const logoSrc = branding.platform_logo ? `/storage/${branding.platform_logo}` : null;

    const { data: plans = [], isLoading: plansLoading } = useQuery({
        queryKey: ['public-plans'],
        queryFn: () => plansAPI.list().then((r) => r.data.data),
    });

    const selectedPlan = useMemo(
        () => plans.find((plan) => String(plan.id) === String(form.plan_id)),
        [plans, form.plan_id]
    );

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const { data } = await authAPI.register(form);

            sessionStorage.setItem('tenant_onboarding_email', form.email);
            sessionStorage.setItem('tenant_onboarding_application_id', String(data.data?.application_id || ''));

            toast.success('Registration created. Check your email for the OTP.');
            navigate('/verify-email', { state: { email: form.email } });
        } catch (err) {
            toast.error(err.response?.data?.message || 'Registration failed');
        } finally {
            setLoading(false);
        }
    };

    const updateForm = (field, value) => setForm((current) => ({ ...current, [field]: value }));

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-amber-50 px-4 py-10">
            <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="flex flex-col justify-center rounded-3xl bg-slate-950 p-8 text-white shadow-2xl shadow-slate-900/20 lg:p-12">
                    {logoSrc ? (
                        <img src={logoSrc} alt={branding.platform_name} className="h-12 w-auto mb-6" />
                    ) : (
                        <h1 className="text-3xl font-bold mb-6">{branding.platform_name || 'TablePilot'}</h1>
                    )}
                    <p className="text-sm uppercase tracking-[0.3em] text-amber-300">Tenant onboarding</p>
                    <h2 className="mt-4 text-4xl font-semibold leading-tight">Register your restaurant with a plan, verify by OTP, and wait for admin approval.</h2>
                    <p className="mt-4 max-w-xl text-slate-300">
                        Choose a subscription package, create your application, and we will guide you through email verification and approval.
                    </p>

                    {selectedPlan && (
                        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
                            <p className="text-sm text-slate-300">Selected package</p>
                            <div className="mt-2 flex items-end justify-between gap-4">
                                <div>
                                    <h3 className="text-2xl font-semibold">{selectedPlan.name}</h3>
                                    <p className="text-slate-300">{selectedPlan.trial_days > 0 ? `${selectedPlan.trial_days} days trial` : 'Direct access'}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-3xl font-bold">৳{Number(selectedPlan.price).toLocaleString()}</p>
                                    <p className="text-sm text-slate-400">/{selectedPlan.duration_days} days</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="rounded-3xl bg-white p-8 shadow-xl ring-1 ring-slate-200 lg:p-10">
                    <div className="mb-6">
                        <p className="text-sm font-medium uppercase tracking-[0.25em] text-amber-700">Create application</p>
                        <h3 className="mt-2 text-2xl font-semibold text-slate-900">Start your restaurant application</h3>
                        <p className="mt-2 text-sm text-slate-500">All fields are required unless marked optional.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="label">Your Name</label>
                                <input type="text" className="input" value={form.name} onChange={(e) => updateForm('name', e.target.value)} required />
                            </div>
                            <div>
                                <label className="label">Email</label>
                                <input type="email" className="input" value={form.email} onChange={(e) => updateForm('email', e.target.value)} required />
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="label">Password</label>
                                <input type="password" className="input" value={form.password} onChange={(e) => updateForm('password', e.target.value)} required minLength={8} />
                            </div>
                            <div>
                                <label className="label">Confirm Password</label>
                                <input type="password" className="input" value={form.password_confirmation} onChange={(e) => updateForm('password_confirmation', e.target.value)} required />
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="label">Restaurant Name</label>
                                <input type="text" className="input" value={form.restaurant_name} onChange={(e) => updateForm('restaurant_name', e.target.value)} required />
                            </div>
                            <div>
                                <label className="label">Phone</label>
                                <input type="text" className="input" value={form.phone} onChange={(e) => updateForm('phone', e.target.value)} required />
                            </div>
                        </div>

                        <div>
                            <label className="label">Address</label>
                            <textarea className="input min-h-24" value={form.address} onChange={(e) => updateForm('address', e.target.value)} />
                        </div>

                        <div>
                            <label className="label">Subscription Package</label>
                            <select
                                className="input"
                                value={form.plan_id}
                                onChange={(e) => updateForm('plan_id', e.target.value)}
                                required
                                disabled={plansLoading}
                            >
                                <option value="">Select a package</option>
                                {plans.map((plan) => (
                                    <option key={plan.id} value={plan.id}>
                                        {plan.name} — ৳{Number(plan.price).toLocaleString()} / {plan.duration_days} days
                                    </option>
                                ))}
                            </select>
                        </div>

                        {selectedPlan && (
                            <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
                                <div className="flex items-center justify-between gap-4">
                                    <span>{selectedPlan.trial_days > 0 ? 'Trial will start automatically after approval.' : 'Direct access will be activated after approval.'}</span>
                                    <span className="font-semibold">Max users: {selectedPlan.max_users}</span>
                                </div>
                            </div>
                        )}

                        <button type="submit" disabled={loading || !form.plan_id} className="btn-primary w-full py-3">
                            {loading ? 'Submitting...' : 'Submit application'}
                        </button>
                    </form>

                    <p className="mt-6 text-center text-sm text-gray-500">
                        Already have an account?{' '}
                        <Link to="/login" className="font-medium text-brand-700 hover:text-brand-800">Sign in</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
