import React, { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { subscriptionAPI } from '../../services/api';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import toast from 'react-hot-toast';

export default function SubscriptionRenewPage() {
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [paymentMethod, setPaymentMethod] = useState('sslcommerz');

    const { data: currentData, isLoading: isCurrentLoading } = useQuery({
        queryKey: ['subscription-current'],
        queryFn: () => subscriptionAPI.current().then((r) => r.data.data),
    });

    const { data: plans, isLoading: isPlansLoading } = useQuery({
        queryKey: ['subscription-plans'],
        queryFn: () => subscriptionAPI.plans().then((r) => r.data.data),
    });

    const initiateMutation = useMutation({
        mutationFn: (payload) => subscriptionAPI.initiate(payload),
        onSuccess: ({ data }) => {
            const payload = data?.data || {};
            if (payload.payment_url) {
                window.location.href = payload.payment_url;
                return;
            }
            toast.success(payload.message || 'Payment initiated');
        },
        onError: (err) => {
            toast.error(err.response?.data?.message || 'Failed to initiate payment');
        },
    });

    const currentPlanId = useMemo(() => currentData?.subscription?.plan_id, [currentData]);

    if (isCurrentLoading || isPlansLoading) {
        return <LoadingSpinner />;
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-gray-900">Renew Subscription</h2>
                <p className="text-sm text-gray-500 mt-1">Choose a plan and continue with payment.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(plans || []).map((plan) => {
                    const isCurrent = currentPlanId === plan.id;
                    const isSelected = selectedPlan?.id === plan.id;

                    return (
                        <button
                            key={plan.id}
                            type="button"
                            onClick={() => setSelectedPlan(plan)}
                            className={`text-left rounded-xl border p-4 transition ${
                                isSelected ? 'border-brand-500 ring-2 ring-brand-200' : 'border-gray-200 hover:border-gray-300'
                            }`}
                        >
                            <div className="flex items-start justify-between">
                                <h3 className="font-semibold text-gray-900">{plan.name}</h3>
                                {isCurrent && (
                                    <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">Current</span>
                                )}
                            </div>
                            <p className="text-2xl font-bold mt-2 text-gray-900">BDT {Number(plan.price).toLocaleString()}</p>
                            <p className="text-sm text-gray-500">{plan.duration_days} days</p>
                            <p className="text-sm text-gray-600 mt-2">Max users: {plan.max_users}</p>
                            {Array.isArray(plan.features) && plan.features.length > 0 && (
                                <ul className="mt-3 space-y-1 text-xs text-gray-600">
                                    {plan.features.slice(0, 4).map((feature, idx) => (
                                        <li key={idx}>- {String(feature)}</li>
                                    ))}
                                </ul>
                            )}
                        </button>
                    );
                })}
            </div>

            <div className="card space-y-4">
                <div>
                    <label className="label">Payment Method</label>
                    <select
                        className="input"
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                    >
                        <option value="sslcommerz">SSLCommerz</option>
                        <option value="bkash">bKash</option>
                        <option value="manual">Manual</option>
                    </select>
                </div>

                <button
                    className="btn-primary"
                    disabled={!selectedPlan || initiateMutation.isPending}
                    onClick={() => initiateMutation.mutate({ plan_id: selectedPlan.id, payment_method: paymentMethod })}
                >
                    {initiateMutation.isPending ? 'Processing...' : 'Select Plan'}
                </button>
            </div>
        </div>
    );
}
