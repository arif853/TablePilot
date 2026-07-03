import React, { useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../../services/api';
import toast from 'react-hot-toast';

export default function OtpVerificationPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const [email, setEmail] = useState(location.state?.email || sessionStorage.getItem('tenant_onboarding_email') || '');
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);

    const handleVerify = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            await authAPI.verifyOtp({ email, code });
            toast.success('Email verified. Wait for admin approval.');
            navigate('/login');
        } catch (err) {
            toast.error(err.response?.data?.message || 'OTP verification failed');
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        setResending(true);

        try {
            await authAPI.resendOtp({ email });
            toast.success('OTP resent to your email.');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Unable to resend OTP');
        } finally {
            setResending(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-amber-50 px-4">
            <div className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-xl ring-1 ring-slate-200">
                <p className="text-sm font-medium uppercase tracking-[0.25em] text-amber-700">Email verification</p>
                <h1 className="mt-2 text-3xl font-semibold text-slate-900">Enter the OTP sent to your email</h1>
                <p className="mt-2 text-sm text-slate-500">Your application will remain pending until the email is verified and the admin approves it.</p>

                <form onSubmit={handleVerify} className="mt-6 space-y-5">
                    <div>
                        <label className="label">Email</label>
                        <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    </div>

                    <div>
                        <label className="label">OTP Code</label>
                        <input type="text" className="input tracking-[0.35em] text-center text-lg" value={code} onChange={(e) => setCode(e.target.value)} required minLength={4} maxLength={10} />
                    </div>

                    <button type="submit" disabled={loading || !email || !code} className="btn-primary w-full py-3">
                        {loading ? 'Verifying...' : 'Verify email'}
                    </button>
                </form>

                <div className="mt-6 flex items-center justify-between gap-4 text-sm">
                    <button type="button" onClick={handleResend} disabled={resending || !email} className="font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50">
                        {resending ? 'Resending...' : 'Resend OTP'}
                    </button>
                    <Link to="/register" className="text-slate-500 hover:text-slate-700">Back to registration</Link>
                </div>
            </div>
        </div>
    );
}
