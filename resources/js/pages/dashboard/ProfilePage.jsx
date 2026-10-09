import React from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { profileAPI, apiErrorMessage } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

const ROLE_LABELS = {
    super_admin: 'Super Admin',
    restaurant_admin: 'Restaurant Admin',
    staff: 'Staff',
    kitchen: 'Kitchen',
};

export default function ProfilePage() {
    const updateUser = useAuthStore((s) => s.updateUser);

    const { data: profile, isLoading, refetch } = useQuery({
        queryKey: ['profile'],
        queryFn: () => profileAPI.get().then((r) => r.data.data),
    });

    const profileMutation = useMutation({
        mutationFn: (data) => profileAPI.update(data),
        onSuccess: (res) => {
            updateUser(res.data.data);
            refetch();
            toast.success('Profile updated');
        },
        onError: (err) => toast.error(apiErrorMessage(err, 'Failed to update profile')),
    });

    const passwordMutation = useMutation({
        mutationFn: (data) => profileAPI.changePassword(data),
        onError: (err) => toast.error(apiErrorMessage(err, 'Failed to change password')),
    });

    const handleProfileSubmit = (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        profileMutation.mutate({ name: d.name, phone: d.phone || null });
    };

    const handlePasswordSubmit = (e) => {
        e.preventDefault();
        const form = e.target;
        const d = Object.fromEntries(new FormData(form));
        if (d.password !== d.password_confirmation) {
            toast.error('New passwords do not match');
            return;
        }
        passwordMutation.mutate(d, {
            onSuccess: () => {
                form.reset();
                toast.success('Password changed');
            },
        });
    };

    if (isLoading) return <LoadingSpinner />;

    return (
        <div className="max-w-2xl space-y-6">
            <h2 className="page-title">My Profile</h2>

            <div className="card">
                <div className="flex items-center gap-4 mb-6">
                    <div className="w-14 h-14 bg-brand-600 rounded-full flex items-center justify-center text-white text-xl font-semibold">
                        {profile?.name?.[0]?.toUpperCase()}
                    </div>
                    <div>
                        <p className="font-semibold text-gray-900">{profile?.name}</p>
                        <p className="text-sm text-gray-500">
                            {ROLE_LABELS[profile?.role] || profile?.role}
                            {profile?.tenant?.name ? ` · ${profile.tenant.name}` : ''}
                        </p>
                    </div>
                </div>

                <form key={profile?.updated_at} onSubmit={handleProfileSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="label">Name</label>
                            <input name="name" className="input" defaultValue={profile?.name} required />
                        </div>
                        <div>
                            <label className="label">Phone</label>
                            <input name="phone" className="input" defaultValue={profile?.phone || ''} />
                        </div>
                    </div>
                    <div>
                        <label className="label">Email</label>
                        <input className="input bg-gray-50" value={profile?.email || ''} readOnly />
                        <p className="text-xs text-gray-400 mt-1">Ask your administrator to change your sign-in email.</p>
                    </div>
                    <button type="submit" className="btn-primary" disabled={profileMutation.isPending}>
                        {profileMutation.isPending ? 'Saving...' : 'Save Profile'}
                    </button>
                </form>
            </div>

            <div className="card">
                <h3 className="font-semibold text-gray-900 mb-4">Change Password</h3>
                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                    <div>
                        <label className="label">Current Password</label>
                        <input name="current_password" type="password" className="input" autoComplete="current-password" required />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="label">New Password</label>
                            <input name="password" type="password" className="input" minLength={8} autoComplete="new-password" required />
                        </div>
                        <div>
                            <label className="label">Confirm New Password</label>
                            <input name="password_confirmation" type="password" className="input" minLength={8} autoComplete="new-password" required />
                        </div>
                    </div>
                    <button type="submit" className="btn-primary" disabled={passwordMutation.isPending}>
                        {passwordMutation.isPending ? 'Updating...' : 'Change Password'}
                    </button>
                </form>
            </div>
        </div>
    );
}
