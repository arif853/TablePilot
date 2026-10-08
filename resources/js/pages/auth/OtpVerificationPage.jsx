import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { HiOutlineMailOpen, HiOutlineClock } from 'react-icons/hi';
import { authAPI } from '../../services/api';
import AuthLayout, { AuthAlert } from '../../components/auth/AuthLayout';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 60; // seconds; the auth endpoints allow 5 requests a minute

export default function OtpVerificationPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const initialEmail = location.state?.email || sessionStorage.getItem('tenant_onboarding_email') || '';

    const [email, setEmail] = useState(initialEmail);
    const [editingEmail, setEditingEmail] = useState(!initialEmail);
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const [message, setMessage] = useState(
        location.state?.codeJustSent ? { tone: 'success', text: `We sent a ${CODE_LENGTH}-digit code to your email.` } : null
    );
    const [cooldown, setCooldown] = useState(location.state?.codeJustSent ? RESEND_COOLDOWN : 0);
    const [verified, setVerified] = useState(false);

    useEffect(() => {
        if (cooldown <= 0) return undefined;
        const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
        return () => clearTimeout(t);
    }, [cooldown]);

    const handleVerify = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        try {
            const { data } = await authAPI.verifyOtp({ email: email.trim(), code });
            sessionStorage.removeItem('tenant_onboarding_email');
            if (/already been approved/i.test(data?.message || '')) {
                navigate('/login', { replace: true, state: { email: email.trim(), notice: 'Your restaurant is already approved. Sign in to get started.' } });
                return;
            }
            setVerified(true);
        } catch (err) {
            const status = err.response?.status;
            const text = err.response?.data?.message;
            setCode('');
            if (status === 404) {
                setMessage({ tone: 'error', text: 'We couldn’t find an application for that email. Check the address or register first.' });
                setEditingEmail(true);
            } else if (status === 429 && /attempts/i.test(text || '')) {
                setMessage({ tone: 'error', text: 'Too many incorrect codes. Request a new code to try again.', offerResend: true });
            } else if (status === 429) {
                setMessage({ tone: 'error', text: 'Too many requests. Please wait a minute and try again.' });
            } else if (/expired/i.test(text || '')) {
                setMessage({ tone: 'error', text: 'That code has expired. Request a new one below.', offerResend: true });
            } else {
                setMessage({ tone: 'error', text: text || 'That code didn’t work. Please try again.' });
            }
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        setResending(true);
        setMessage(null);

        try {
            await authAPI.resendOtp({ email: email.trim() });
            setMessage({ tone: 'success', text: `A new code is on its way to ${email.trim()}.` });
            setCooldown(RESEND_COOLDOWN);
            setEditingEmail(false);
        } catch (err) {
            setMessage({
                tone: 'error',
                text:
                    err.response?.status === 429
                        ? 'Too many requests. Please wait a minute and try again.'
                        : err.response?.data?.message || 'We couldn’t send a new code. Please try again.',
            });
        } finally {
            setResending(false);
        }
    };

    if (verified) {
        return (
            <AuthLayout step={2} title="Email verified" subtitle="Your application is now with our team.">
                <div className="space-y-5 text-sm text-gray-600">
                    <div className="flex gap-3 rounded-xl bg-brand-50 p-4 ring-1 ring-brand-100">
                        <HiOutlineClock className="h-6 w-6 shrink-0 text-brand-700" />
                        <p>
                            We review new restaurants quickly. You’ll get an email at <strong className="text-gray-900">{email.trim()}</strong> as
                            soon as your application is approved, and then you can sign in.
                        </p>
                    </div>
                    <Link to="/login" state={{ email: email.trim() }} className="btn-primary w-full py-3 inline-flex justify-center">
                        Go to sign in
                    </Link>
                </div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout
            step={1}
            title="Verify your email"
            subtitle={`Enter the ${CODE_LENGTH}-digit code we emailed you. It’s valid for 10 minutes.`}
            footer={
                <>
                    Wrong details?{' '}
                    <Link to="/register" className="font-semibold text-brand-700 hover:text-brand-800">Back to registration</Link>
                </>
            }
        >
            {message && (
                <AuthAlert tone={message.tone}>
                    {message.text}
                    {message.offerResend && cooldown === 0 && (
                        <>
                            {' '}
                            <button type="button" onClick={handleResend} className="font-semibold underline">Send a new code</button>
                        </>
                    )}
                </AuthAlert>
            )}

            <form onSubmit={handleVerify} className="space-y-5">
                {editingEmail ? (
                    <div>
                        <label htmlFor="otp-email" className="label">Email</label>
                        <input
                            id="otp-email"
                            type="email"
                            className="input"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                            placeholder="you@restaurant.com"
                            autoFocus
                            required
                        />
                    </div>
                ) : (
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-4 py-3 text-sm ring-1 ring-gray-200">
                        <span className="flex min-w-0 items-center gap-2 text-gray-600">
                            <HiOutlineMailOpen className="h-5 w-5 shrink-0 text-gray-400" />
                            <span className="truncate font-medium text-gray-900">{email}</span>
                        </span>
                        <button type="button" onClick={() => setEditingEmail(true)} className="shrink-0 font-medium text-brand-700 hover:text-brand-800">
                            Change
                        </button>
                    </div>
                )}

                <div>
                    <label htmlFor="otp-code" className="label">Verification code</label>
                    <input
                        id="otp-code"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern={`\\d{${CODE_LENGTH}}`}
                        maxLength={CODE_LENGTH}
                        className="input text-center text-2xl font-semibold tracking-[0.6em] py-3"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
                        placeholder={'•'.repeat(CODE_LENGTH)}
                        autoFocus={!editingEmail}
                        required
                    />
                </div>

                <button type="submit" disabled={loading || !email.trim() || code.length !== CODE_LENGTH} className="btn-primary w-full py-3">
                    {loading ? 'Verifying…' : 'Verify email'}
                </button>
            </form>

            <p className="mt-6 text-center text-sm text-gray-500">
                Didn’t get the code? Check your spam folder, or{' '}
                {cooldown > 0 ? (
                    <span className="text-gray-400">resend in {cooldown}s</span>
                ) : (
                    <button type="button" onClick={handleResend} disabled={resending || !email.trim()} className="font-semibold text-brand-700 hover:text-brand-800 disabled:opacity-50">
                        {resending ? 'sending…' : 'send a new code'}
                    </button>
                )}
            </p>
        </AuthLayout>
    );
}
