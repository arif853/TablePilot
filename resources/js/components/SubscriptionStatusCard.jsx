import React from 'react';
import { Link } from 'react-router-dom';

export default function SubscriptionStatusCard({ data }) {
    const subscription = data?.subscription;
    const status = data?.status || 'none';

    const statusStyles = {
        active: 'bg-green-100 text-green-700',
        trial: 'bg-blue-100 text-blue-700',
        grace: 'bg-amber-100 text-amber-700',
        expired: 'bg-red-100 text-red-700',
        cancelled: 'bg-gray-100 text-gray-700',
        none: 'bg-red-100 text-red-700',
    };

    const needsRenewal = status === 'grace' || status === 'expired' || status === 'none';

    return (
        <div className="card">
            <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900">Subscription Status</h3>
                    <p className="text-sm text-gray-500">Current plan and access health</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusStyles[status] || statusStyles.none}`}>
                    {String(status).toUpperCase()}
                </span>
            </div>

            {subscription ? (
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                        <span className="text-gray-500">Plan</span>
                        <span className="font-medium">{subscription?.plan?.name || subscription?.plan_type || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-500">Expiry Date</span>
                        <span className="font-medium">{new Date(subscription.expires_at).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-500">Days Remaining</span>
                        <span className={`font-semibold ${(data?.days_remaining ?? 0) <= 3 ? 'text-red-600' : 'text-gray-900'}`}>
                            {data?.days_remaining ?? 0}
                        </span>
                    </div>
                    {subscription.is_trial && (
                        <div className="pt-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-700">
                                Trial
                            </span>
                        </div>
                    )}
                </div>
            ) : (
                <p className="text-sm text-gray-500">No subscription found.</p>
            )}

            {status === 'grace' && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    Your subscription is in grace period.
                    {data?.grace_ends_at ? ` Grace ends on ${new Date(data.grace_ends_at).toLocaleDateString()}.` : ''}
                </div>
            )}

            {needsRenewal && (
                <div className="mt-4">
                    <Link to="/dashboard/subscription/renew" className="btn-primary inline-block">
                        Renew Now
                    </Link>
                </div>
            )}
        </div>
    );
}
