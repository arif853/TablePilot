import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import { adminAPI, apiErrorMessage } from '../../services/api';

const toSubscriptionType = (slug) => (slug === 'monthly' || slug === 'yearly' ? slug : 'custom');
const formatDate = (date) => (date ? new Date(date).toLocaleDateString() : '—');

// Every view that shows subscription state
const SUBSCRIPTION_QUERY_KEYS = [['admin-subscriptions'], ['admin-expiring'], ['admin-tenants'], ['admin-tenant-stats']];

function useInvalidateSubscriptions() {
    const queryClient = useQueryClient();
    return () => SUBSCRIPTION_QUERY_KEYS.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
}

function PlanSelect({ plans, defaultValue }) {
    return (
        <select name="plan_id" className="input" defaultValue={defaultValue || ''} required>
            <option value="">Select a plan</option>
            {plans?.map((p) => (
                <option key={p.id} value={p.id}>
                    {p.name} — ৳{Number(p.price).toLocaleString()} / {p.duration_days} days{p.is_active ? '' : ' (inactive)'}
                </option>
            ))}
        </select>
    );
}

/**
 * Renew or change a tenant's plan. Renewal stacks onto the current expiry when it's still in the future.
 */
export function RenewSubscriptionModal({ tenant, subscription, isOpen, onClose }) {
    const invalidate = useInvalidateSubscriptions();

    const { data: plans } = useQuery({
        queryKey: ['admin-plans'],
        queryFn: () => adminAPI.plans.list().then((r) => r.data.data),
        enabled: isOpen,
    });

    const renewMutation = useMutation({
        mutationFn: (data) => adminAPI.subscriptions.renew(tenant.id, data),
        onSuccess: (res) => {
            invalidate();
            toast.success(`Renewed until ${formatDate(res.data.data?.expires_at)}`);
            onClose();
        },
        onError: (err) => toast.error(apiErrorMessage(err, 'Failed to renew subscription')),
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        const plan = plans?.find((p) => p.id === parseInt(d.plan_id));
        renewMutation.mutate({
            plan_id: plan?.id,
            plan_type: toSubscriptionType(plan?.slug),
            payment_method: d.payment_method || 'manual',
            payment_ref: d.payment_ref || null,
            notes: d.notes || null,
        });
    };

    if (!tenant) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Renew / Change Plan">
            <form key={`${tenant.id}-${plans ? 'loaded' : 'loading'}`} onSubmit={handleSubmit} className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-3 text-sm">
                    <p className="font-medium text-gray-900">{tenant.name}</p>
                    {subscription ? (
                        <p className="text-gray-500">
                            Current: {subscription.plan?.name || <span className="capitalize">{subscription.plan_type}</span>}
                            {subscription.is_trial ? ' (trial)' : ''} — expires {formatDate(subscription.expires_at)}
                        </p>
                    ) : (
                        <p className="text-gray-500">No active subscription. The new plan starts today.</p>
                    )}
                </div>
                <div>
                    <label className="label">Plan</label>
                    <PlanSelect plans={plans} defaultValue={subscription?.plan_id} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="label">Payment Method</label>
                        <select name="payment_method" className="input">
                            <option value="manual">Manual / Cash</option>
                            <option value="bkash">bKash</option>
                            <option value="bank">Bank Transfer</option>
                        </select>
                    </div>
                    <div>
                        <label className="label">Payment Ref</label>
                        <input name="payment_ref" className="input" placeholder="Transaction ID" />
                    </div>
                </div>
                <div>
                    <label className="label">Notes</label>
                    <input name="notes" className="input" placeholder="Optional notes" />
                </div>
                <div className="flex gap-3">
                    <button type="submit" className="btn-primary" disabled={renewMutation.isPending}>
                        {renewMutation.isPending ? 'Saving...' : 'Renew'}
                    </button>
                    <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
                </div>
            </form>
        </Modal>
    );
}

/**
 * Add free days to an existing subscription (goodwill, outage credit, payment delay).
 */
export function ExtendSubscriptionModal({ subscription, tenantName, isOpen, onClose }) {
    const invalidate = useInvalidateSubscriptions();

    const extendMutation = useMutation({
        mutationFn: (data) => adminAPI.subscriptions.extend(subscription.id, data),
        onSuccess: (res) => {
            invalidate();
            toast.success(`Extended until ${formatDate(res.data.data?.new_expiry)}`);
            onClose();
        },
        onError: (err) => toast.error(apiErrorMessage(err, 'Failed to extend subscription')),
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        extendMutation.mutate({ days: parseInt(d.days), reason: d.reason || null });
    };

    if (!subscription) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Extend Subscription" size="sm">
            <form key={subscription.id} onSubmit={handleSubmit} className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-3 text-sm">
                    <p className="font-medium text-gray-900">{tenantName || subscription.tenant?.name}</p>
                    <p className="text-gray-500">Currently expires {formatDate(subscription.expires_at)}</p>
                </div>
                <div>
                    <label className="label">Days to add</label>
                    <input name="days" type="number" min="1" max="365" defaultValue="7" className="input" required />
                </div>
                <div>
                    <label className="label">Reason</label>
                    <input name="reason" className="input" placeholder="e.g. Service outage credit" />
                </div>
                <div className="flex gap-3">
                    <button type="submit" className="btn-primary" disabled={extendMutation.isPending}>
                        {extendMutation.isPending ? 'Saving...' : 'Extend'}
                    </button>
                    <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
                </div>
            </form>
        </Modal>
    );
}

export function CancelSubscriptionModal({ subscription, tenantName, isOpen, onClose }) {
    const invalidate = useInvalidateSubscriptions();

    const cancelMutation = useMutation({
        mutationFn: (reason) => adminAPI.subscriptions.cancel(subscription.id, { reason }),
        onSuccess: () => {
            invalidate();
            toast.success('Subscription cancelled');
            onClose();
        },
        onError: (err) => toast.error(apiErrorMessage(err, 'Failed to cancel subscription')),
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        cancelMutation.mutate(new FormData(e.target).get('reason') || null);
    };

    if (!subscription) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Cancel Subscription" size="sm">
            <form key={subscription.id} onSubmit={handleSubmit} className="space-y-4">
                <p className="text-sm text-gray-600">
                    Cancel the subscription for <span className="font-medium text-gray-900">{tenantName || subscription.tenant?.name}</span>?
                    The restaurant loses access immediately unless it has another active subscription.
                </p>
                <div>
                    <label className="label">Reason</label>
                    <input name="reason" className="input" placeholder="Optional" />
                </div>
                <div className="flex gap-3">
                    <button type="submit" className="btn-danger" disabled={cancelMutation.isPending}>
                        {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Subscription'}
                    </button>
                    <button type="button" onClick={onClose} className="btn-secondary">Keep</button>
                </div>
            </form>
        </Modal>
    );
}
