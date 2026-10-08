import React, { useEffect, useState } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { HiCheckCircle, HiOutlineUsers, HiOutlineViewGrid } from 'react-icons/hi';
import { useAuthStore } from '../../stores/authStore';
import { authAPI, plansAPI } from '../../services/api';
import AuthLayout, { AuthAlert } from '../../components/auth/AuthLayout';
import PasswordInput from '../../components/auth/PasswordInput';

const MIN_PASSWORD = 8;

const EMPTY_FORM = {
    restaurant_name: '',
    phone: '',
    address: '',
    name: '',
    email: '',
    password: '',
    password_confirmation: '',
    plan_id: '',
};

const homeFor = (role) => (role === 'super_admin' ? '/dashboard/admin' : role === 'kitchen' ? '/kitchen' : '/dashboard');

function Field({ id, label, optional, error, hint, children }) {
    return (
        <div>
            <label htmlFor={id} className="label">
                {label} {optional && <span className="font-normal text-gray-400">(optional)</span>}
            </label>
            {children}
            {error ? (
                <p id={`${id}-error`} className="mt-1 text-xs text-red-600">{error}</p>
            ) : (
                hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>
            )}
        </div>
    );
}

function Section({ number, title, children }) {
    return (
        <fieldset className="space-y-4">
            <legend className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-900">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">{number}</span>
                {title}
            </legend>
            {children}
        </fieldset>
    );
}

function PlanCard({ plan, selected, onSelect }) {
    return (
        <label
            className={`relative flex cursor-pointer flex-col rounded-xl border-2 p-4 transition ${
                selected ? 'border-brand-600 bg-brand-50' : 'border-gray-200 hover:border-brand-300'
            }`}
        >
            <input type="radio" name="plan_id" value={plan.id} checked={selected} onChange={onSelect} className="sr-only" />
            {selected && <HiCheckCircle className="absolute right-3 top-3 h-5 w-5 text-brand-600" aria-hidden="true" />}

            <span className="pr-6 font-semibold text-gray-900">{plan.name}</span>
            <span className="mt-1">
                <span className="text-2xl font-extrabold text-gray-900">৳{Number(plan.price).toLocaleString()}</span>
                <span className="text-sm text-gray-500"> / {plan.duration_days} days</span>
            </span>

            {plan.trial_days > 0 && (
                <span className="mt-2 w-fit rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                    {plan.trial_days}-day free trial
                </span>
            )}

            <span className="mt-3 space-y-1 text-xs text-gray-600">
                <span className="flex items-center gap-1.5"><HiOutlineUsers className="h-4 w-4 text-gray-400" /> Up to {plan.max_users} team members</span>
                {plan.modules_count > 0 && (
                    <span className="flex items-center gap-1.5"><HiOutlineViewGrid className="h-4 w-4 text-gray-400" /> {plan.modules_count} features included</span>
                )}
            </span>
        </label>
    );
}

export default function RegisterPage() {
    const { user, token } = useAuthStore();
    const navigate = useNavigate();
    const [form, setForm] = useState(EMPTY_FORM);
    const [errors, setErrors] = useState({});
    const [formError, setFormError] = useState(null);
    const [loading, setLoading] = useState(false);

    const { data: plans = [], isLoading: plansLoading, isError: plansFailed } = useQuery({
        queryKey: ['public-plans'],
        queryFn: () => plansAPI.list().then((r) => r.data.data),
    });

    // With a single plan there's nothing to choose
    useEffect(() => {
        if (plans.length === 1 && !form.plan_id) setForm((f) => ({ ...f, plan_id: String(plans[0].id) }));
    }, [plans, form.plan_id]);

    if (token && user) return <Navigate to={homeFor(user.role)} replace />;

    const update = (field) => (e) => {
        setForm((f) => ({ ...f, [field]: e.target.value }));
        if (errors[field]) setErrors((errs) => ({ ...errs, [field]: undefined }));
    };

    const passwordMismatch = form.password_confirmation.length > 0 && form.password !== form.password_confirmation;
    const selectedPlan = plans.find((p) => String(p.id) === String(form.plan_id));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.plan_id) {
            setErrors((errs) => ({ ...errs, plan_id: 'Choose a plan to continue.' }));
            return;
        }
        if (passwordMismatch) return;

        setLoading(true);
        setErrors({});
        setFormError(null);

        const payload = { ...form, email: form.email.trim(), address: form.address.trim() || null };

        try {
            await authAPI.register(payload);
            sessionStorage.setItem('tenant_onboarding_email', payload.email);
            navigate('/verify-email', { state: { email: payload.email, codeJustSent: true } });
        } catch (err) {
            const fieldErrors = err.response?.data?.errors;
            if (err.response?.status === 422 && fieldErrors) {
                // Show each validation message next to its field
                setErrors(Object.fromEntries(Object.entries(fieldErrors).map(([field, msgs]) => [field, msgs[0]])));
                setFormError('Please fix the highlighted fields.');
            } else if (err.response?.status === 429) {
                setFormError('Too many attempts. Please wait a minute and try again.');
            } else {
                setFormError(err.response?.data?.message || 'We couldn’t create your application. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    const inputProps = (field) => ({
        id: `register-${field}`,
        value: form[field],
        onChange: update(field),
        'aria-invalid': !!errors[field],
        'aria-describedby': errors[field] ? `register-${field}-error` : undefined,
    });
    const INVALID = 'border-red-400 focus:ring-red-200 focus:border-red-400';
    const inputClass = (field, invalid = !!errors[field]) => `input ${invalid ? INVALID : ''}`;

    return (
        <AuthLayout
            wide
            step={0}
            title="Register your restaurant"
            subtitle="Create your application. It takes about two minutes."
            footer={
                <>
                    Already have an account?{' '}
                    <Link to="/login" className="font-semibold text-brand-700 hover:text-brand-800">Sign in</Link>
                </>
            }
        >
            {formError && <AuthAlert>{formError}</AuthAlert>}

            <form onSubmit={handleSubmit} className="space-y-8">
                <Section number={1} title="Your restaurant">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field id="register-restaurant_name" label="Restaurant name" error={errors.restaurant_name}>
                            <input type="text" className={inputClass('restaurant_name')} {...inputProps('restaurant_name')} autoComplete="organization" autoFocus required />
                        </Field>
                        <Field id="register-phone" label="Phone" error={errors.phone}>
                            <input type="tel" className={inputClass('phone')} {...inputProps('phone')} autoComplete="tel" placeholder="01XXXXXXXXX" required />
                        </Field>
                    </div>
                    <Field id="register-address" label="Address" optional error={errors.address}>
                        <textarea className={`${inputClass('address')} min-h-[72px]`} rows={2} {...inputProps('address')} autoComplete="street-address" />
                    </Field>
                </Section>

                <Section number={2} title="Your account">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field id="register-name" label="Your name" error={errors.name}>
                            <input type="text" className={inputClass('name')} {...inputProps('name')} autoComplete="name" required />
                        </Field>
                        <Field id="register-email" label="Email" error={errors.email} hint="We’ll send a verification code here.">
                            <input type="email" className={inputClass('email')} {...inputProps('email')} autoComplete="email" placeholder="you@restaurant.com" required />
                        </Field>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                            id="register-password"
                            label="Password"
                            error={errors.password}
                            hint={
                                <span className={form.password.length >= MIN_PASSWORD ? 'text-green-600' : undefined}>
                                    At least {MIN_PASSWORD} characters
                                </span>
                            }
                        >
                            <PasswordInput className={inputClass('password')} {...inputProps('password')} minLength={MIN_PASSWORD} autoComplete="new-password" required />
                        </Field>
                        <Field
                            id="register-password_confirmation"
                            label="Confirm password"
                            error={errors.password_confirmation || (passwordMismatch ? 'Passwords don’t match' : null)}
                        >
                            <PasswordInput
                                className={inputClass('password_confirmation', passwordMismatch || !!errors.password_confirmation)}
                                {...inputProps('password_confirmation')}
                                aria-invalid={passwordMismatch || !!errors.password_confirmation}
                                autoComplete="new-password"
                                required
                            />
                        </Field>
                    </div>
                </Section>

                <Section number={3} title="Choose a plan">
                    {plansLoading ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                            {[0, 1].map((i) => <div key={i} className="h-36 animate-pulse rounded-xl bg-gray-100" />)}
                        </div>
                    ) : plansFailed ? (
                        <AuthAlert>Plans couldn’t be loaded. Refresh the page to try again.</AuthAlert>
                    ) : plans.length === 0 ? (
                        <AuthAlert tone="info">No plans are available right now. Please contact us.</AuthAlert>
                    ) : (
                        <div role="radiogroup" aria-label="Subscription plan" className="grid gap-3 sm:grid-cols-2">
                            {plans.map((plan) => (
                                <PlanCard
                                    key={plan.id}
                                    plan={plan}
                                    selected={String(plan.id) === String(form.plan_id)}
                                    onSelect={update('plan_id')}
                                />
                            ))}
                        </div>
                    )}
                    {errors.plan_id && <p className="text-xs text-red-600">{errors.plan_id}</p>}
                    {selectedPlan && (
                        <p className="text-xs text-gray-500">
                            {selectedPlan.trial_days > 0
                                ? `Your ${selectedPlan.trial_days}-day free trial starts when your application is approved.`
                                : 'Your plan is activated when your application is approved.'}
                        </p>
                    )}
                </Section>

                <button type="submit" disabled={loading || plansLoading || passwordMismatch} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                    {loading && <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden="true" />}
                    {loading ? 'Creating your application…' : 'Create application'}
                </button>
            </form>
        </AuthLayout>
    );
}
