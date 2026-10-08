import React, { useState } from 'react';
import { useNavigate, useLocation, Link, Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';
import { useModuleStore } from '../../stores/moduleStore';
import { authAPI } from '../../services/api';
import AuthLayout, { AuthAlert } from '../../components/auth/AuthLayout';
import PasswordInput from '../../components/auth/PasswordInput';

const homeFor = (role) => (role === 'super_admin' ? '/dashboard/admin' : role === 'kitchen' ? '/kitchen' : '/dashboard');

// Turn the API's failure into something a person can act on
function describeLoginError(err) {
    const status = err.response?.status;
    const data = err.response?.data || {};

    if (!err.response) return { tone: 'error', text: 'Can’t reach the server. Check your connection and try again.' };
    if (status === 429) {
        const wait = Number(err.response.headers?.['retry-after']) || 60;
        return { tone: 'error', text: `Too many sign-in attempts. Please wait ${wait} seconds and try again.` };
    }
    if (data.errors?.next_step === 'await_approval') {
        return { tone: 'info', text: 'Your restaurant application is being reviewed. We’ll email you as soon as it’s approved.' };
    }
    if (status === 401) return { tone: 'error', text: 'That email and password don’t match. Please try again.' };

    return { tone: 'error', text: data.message || 'Sign in failed. Please try again.' };
}

export default function LoginPage() {
    const { user, token, setAuth } = useAuthStore();
    const fetchModules = useModuleStore((s) => s.fetchModules);
    const clearModules = useModuleStore((s) => s.clear);
    const navigate = useNavigate();
    const location = useLocation();

    const [email, setEmail] = useState(location.state?.email || '');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    // Arriving from a password reset shows a confirmation
    const [message, setMessage] = useState(location.state?.notice ? { tone: 'success', text: location.state.notice } : null);

    // Already signed in: go straight to the right home page
    if (token && user) return <Navigate to={homeFor(user.role)} replace />;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        try {
            const { data } = await authAPI.login({ email: email.trim(), password });
            setAuth(data.user, data.access_token);

            if (data.user.role === 'super_admin') clearModules();
            else await fetchModules();

            toast.success(`Welcome back, ${data.user.name?.split(' ')[0] || 'there'}!`);
            navigate(homeFor(data.user.role), { replace: true });
        } catch (err) {
            if (err.response?.data?.errors?.next_step === 'verify_email') {
                toast('Verify your email to finish setting up your account.');
                navigate('/verify-email', { state: { email: email.trim() } });
                return;
            }
            setMessage(describeLoginError(err));
            setPassword('');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout
            title="Welcome back"
            subtitle="Sign in to manage your restaurant."
            footer={
                <>
                    New here?{' '}
                    <Link to="/register" className="font-semibold text-brand-700 hover:text-brand-800">
                        Register your restaurant
                    </Link>
                </>
            }
        >
            {message && <AuthAlert tone={message.tone}>{message.text}</AuthAlert>}

            <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                    <label htmlFor="login-email" className="label">Email</label>
                    <input
                        id="login-email"
                        type="email"
                        className="input"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@restaurant.com"
                        autoComplete="email"
                        autoFocus={!email}
                        required
                    />
                </div>

                <div>
                    <div className="flex items-center justify-between mb-1">
                        <label htmlFor="login-password" className="block text-sm font-medium text-gray-700">Password</label>
                        <Link
                            to="/forgot-password"
                            state={{ email: email.trim() }}
                            className="text-sm font-medium text-brand-700 hover:text-brand-800"
                        >
                            Forgot password?
                        </Link>
                    </div>
                    <PasswordInput
                        id="login-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Your password"
                        autoComplete="current-password"
                        autoFocus={!!email}
                        required
                    />
                </div>

                <button type="submit" disabled={loading} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                    {loading && <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden="true" />}
                    {loading ? 'Signing in…' : 'Sign in'}
                </button>
            </form>
        </AuthLayout>
    );
}
