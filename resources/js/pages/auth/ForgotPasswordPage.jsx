import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { authAPI, apiErrorMessage } from '../../services/api';
import AuthLayout, { AuthAlert } from '../../components/auth/AuthLayout';

export default function ForgotPasswordPage() {
    const location = useLocation();
    const [email, setEmail] = useState(location.state?.email || '');
    const [loading, setLoading] = useState(false);
    const [sentTo, setSentTo] = useState(null);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            await authAPI.forgotPassword(email.trim());
            // The API answers the same way whether or not the account exists (no email enumeration)
            setSentTo(email.trim());
        } catch (err) {
            setError(
                err.response?.status === 429
                    ? 'Too many requests. Please wait a minute and try again.'
                    : apiErrorMessage(err, 'Could not send the reset link. Please try again.')
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout
            title={sentTo ? 'Check your email' : 'Forgot your password?'}
            subtitle={sentTo ? null : 'Enter your account email and we’ll send you a link to set a new password.'}
            footer={
                <Link to="/login" state={{ email: sentTo || email.trim() }} className="font-semibold text-brand-700 hover:text-brand-800">
                    ← Back to sign in
                </Link>
            }
        >
            {sentTo ? (
                <div className="space-y-4 text-sm text-gray-600">
                    <AuthAlert tone="success">
                        If an account exists for <strong>{sentTo}</strong>, a password reset link is on its way.
                    </AuthAlert>
                    <p>The link expires in 60 minutes. Don’t see it? Check your spam folder.</p>
                    <button type="button" onClick={() => setSentTo(null)} className="font-medium text-brand-700 hover:text-brand-800">
                        Use a different email
                    </button>
                </div>
            ) : (
                <>
                    {error && <AuthAlert>{error}</AuthAlert>}
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label htmlFor="forgot-email" className="label">Email</label>
                            <input
                                id="forgot-email"
                                type="email"
                                className="input"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@restaurant.com"
                                autoComplete="email"
                                autoFocus
                                required
                            />
                        </div>
                        <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                            {loading ? 'Sending…' : 'Send reset link'}
                        </button>
                    </form>
                </>
            )}
        </AuthLayout>
    );
}
