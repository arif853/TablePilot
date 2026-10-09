import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI, apiErrorMessage } from '../../services/api';
import AuthLayout, { AuthAlert } from '../../components/auth/AuthLayout';
import PasswordInput from '../../components/auth/PasswordInput';

const MIN_LENGTH = 8;

export default function ResetPasswordPage() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const token = params.get('token') || '';
    const email = params.get('email') || '';

    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const linkIsValid = token && email;
    const mismatch = confirmation.length > 0 && confirmation !== password;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (password !== confirmation) {
            setError('The two passwords don’t match.');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            await authAPI.resetPassword({ email, token, password, password_confirmation: confirmation });
            navigate('/login', { replace: true, state: { email, notice: 'Your password has been reset. Sign in with your new password.' } });
        } catch (err) {
            setError(apiErrorMessage(err, 'Could not reset your password. Please request a new link.'));
        } finally {
            setLoading(false);
        }
    };

    if (!linkIsValid) {
        return (
            <AuthLayout title="Link not valid" subtitle="This password reset link is incomplete or has been altered.">
                <Link to="/forgot-password" className="btn-primary w-full py-3 inline-flex justify-center">
                    Request a new link
                </Link>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout
            title="Set a new password"
            subtitle={<>For <strong className="text-gray-700">{email}</strong></>}
            footer={<Link to="/login" className="font-semibold text-brand-700 hover:text-brand-800">← Back to sign in</Link>}
        >
            {error && (
                <AuthAlert>
                    {error}{' '}
                    {/expired|invalid/i.test(error) && (
                        <Link to="/forgot-password" state={{ email }} className="font-semibold underline">Request a new link</Link>
                    )}
                </AuthAlert>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                    <label htmlFor="reset-password" className="label">New password</label>
                    <PasswordInput
                        id="reset-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        minLength={MIN_LENGTH}
                        autoComplete="new-password"
                        autoFocus
                        required
                    />
                    <p className={`mt-1 text-xs ${password.length >= MIN_LENGTH ? 'text-green-600' : 'text-gray-500'}`}>
                        At least {MIN_LENGTH} characters
                    </p>
                </div>
                <div>
                    <label htmlFor="reset-confirmation" className="label">Confirm new password</label>
                    <PasswordInput
                        id="reset-confirmation"
                        value={confirmation}
                        onChange={(e) => setConfirmation(e.target.value)}
                        autoComplete="new-password"
                        required
                        aria-invalid={mismatch}
                    />
                    {mismatch && <p className="mt-1 text-xs text-red-600">Passwords don’t match</p>}
                </div>
                <button type="submit" disabled={loading || mismatch} className="btn-primary w-full py-3">
                    {loading ? 'Saving…' : 'Reset password'}
                </button>
            </form>
        </AuthLayout>
    );
}
