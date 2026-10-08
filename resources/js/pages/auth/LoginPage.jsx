import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useBrandingStore } from '../../stores/brandingStore';
import { useModuleStore } from '../../stores/moduleStore';
import { authAPI } from '../../services/api';
import toast from 'react-hot-toast';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { setAuth } = useAuthStore();
    const fetchModules = useModuleStore((s) => s.fetchModules);
    const clearModules = useModuleStore((s) => s.clear);
    const { branding } = useBrandingStore();
    const navigate = useNavigate();

    const logoSrc = branding.platform_logo ? `/storage/${branding.platform_logo}` : null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const { data } = await authAPI.login({ email, password });
            setAuth(data.user, data.access_token);

            if (data.user.role === 'super_admin') {
                clearModules();
            } else {
                await fetchModules();
            }

            if (data.user.role === 'kitchen') {
                navigate('/kitchen');
            } else if (data.user.role === 'super_admin') {
                navigate('/dashboard/admin');
            } else {
                navigate('/dashboard');
            }

            toast.success('Welcome back!');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100 px-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    {logoSrc ? (
                        <img src={logoSrc} alt={branding.platform_name} className="h-12 mx-auto mb-3" />
                    ) : (
                        <h1 className="text-3xl font-bold text-brand-700">{branding.platform_name || 'TablePilot'}</h1>
                    )}
                    <p className="text-gray-500 mt-2">Sign in to your account</p>
                </div>

                <div className="bg-white rounded-2xl shadow-lg p-8">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="label">Email</label>
                            <input
                                type="email"
                                className="input"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                required
                            />
                        </div>

                        <div>
                            <label className="label">Password</label>
                            <input
                                type="password"
                                className="input"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="btn-primary w-full py-3"
                        >
                            {loading ? 'Signing in...' : 'Sign In'}
                        </button>
                    </form>

                    <p className="text-center text-sm text-gray-500 mt-6">
                        Need an account?{' '}
                        <Link to="/register" className="text-brand-700 hover:text-brand-800 font-medium">Register</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
