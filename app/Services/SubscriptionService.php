<?php

namespace App\Services;

use App\Models\Subscription;
use App\Models\SubscriptionPlan;
use App\Models\Tenant;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class SubscriptionService
{
    public function __construct(
        protected ModulePermissionService $modulePermissionService
    ) {}

    public function createSubscription(
        Tenant $tenant,
        SubscriptionPlan $plan,
        array $paymentData,
        bool $isTrial = false,
        string $initiatedBy = 'super_admin'
    ): Subscription {
        return DB::transaction(function () use ($tenant, $plan, $paymentData, $isTrial, $initiatedBy) {
            $startsAt = $this->calculateStartDate($tenant);
            $expiresAt = (clone $startsAt)->addDays((int) $plan->duration_days);

            // End currently active/grace subscriptions when creating a fresh paid subscription now.
            Subscription::withoutGlobalScopes()
                ->where('tenant_id', $tenant->id)
                ->whereIn('status', ['active', 'grace'])
                ->update(['status' => 'expired']);

            $subscription = Subscription::withoutGlobalScopes()->create([
                'tenant_id' => $tenant->id,
                'plan_id' => $plan->id,
                'plan_type' => $plan->subscriptionType(),
                'is_trial' => $isTrial,
                'amount' => $paymentData['amount'] ?? $plan->price,
                'payment_method' => $paymentData['payment_method'] ?? null,
                'payment_ref' => $paymentData['payment_ref'] ?? null,
                'transaction_id' => $paymentData['transaction_id'] ?? null,
                'starts_at' => $startsAt,
                'expires_at' => $expiresAt,
                'grace_ends_at' => null,
                'status' => 'active',
                'initiated_by' => $initiatedBy,
                'notes' => $paymentData['notes'] ?? null,
            ]);

            $tenant->update([
                'is_active' => true,
                'max_users' => $plan->max_users,
            ]);

            AuditLogger::log('subscription_created', $subscription, null, [
                'tenant_id' => $tenant->id,
                'plan_id' => $plan->id,
                'is_trial' => $isTrial,
                'initiated_by' => $initiatedBy,
            ]);

            $this->modulePermissionService->invalidateCache($tenant);

            return $subscription;
        });
    }

    /**
     * Start a free trial on the given plan. The trial is an is_trial subscription so
     * EnsureActiveSubscription lets the tenant in; trial_ends_at mirrors its expiry.
     */
    public function createTrialSubscription(
        Tenant $tenant,
        SubscriptionPlan $plan,
        int $days,
        string $initiatedBy = 'super_admin'
    ): Subscription {
        return DB::transaction(function () use ($tenant, $plan, $days, $initiatedBy) {
            $expiresAt = now()->addDays($days);

            $subscription = Subscription::withoutGlobalScopes()->create([
                'tenant_id' => $tenant->id,
                'plan_id' => $plan->id,
                'plan_type' => $plan->subscriptionType(),
                'is_trial' => true,
                'amount' => 0,
                'payment_method' => 'manual',
                'starts_at' => now(),
                'expires_at' => $expiresAt,
                'status' => 'active',
                'initiated_by' => $initiatedBy,
                'notes' => "{$days}-day free trial",
            ]);

            $tenant->update([
                'is_active' => true,
                'max_users' => $plan->max_users,
                'trial_ends_at' => $expiresAt,
            ]);

            AuditLogger::log('subscription_created', $subscription, null, [
                'tenant_id' => $tenant->id,
                'plan_id' => $plan->id,
                'is_trial' => true,
                'initiated_by' => $initiatedBy,
            ]);

            $this->modulePermissionService->invalidateCache($tenant);

            return $subscription;
        });
    }

    /**
     * Activate the subscription for a gateway-verified payment exactly once.
     *
     * Success redirect and IPN usually arrive together; the lock plus the
     * transaction_id check make the second one a no-op that returns the
     * subscription created by the first.
     *
     * @param  array $pending  Cached pending-payment data (tenant_id, plan_id, amount)
     */
    public function activateFromGatewayPayment(string $tranId, array $pending, string $method, ?string $paymentRef = null, string $notes = 'Activated via payment gateway'): Subscription
    {
        return Cache::lock("subscription_activation:{$tranId}", 30)->block(10, function () use ($tranId, $pending, $method, $paymentRef, $notes) {
            $existing = Subscription::withoutGlobalScopes()
                ->where('transaction_id', $tranId)
                ->first();

            if ($existing) {
                return $existing;
            }

            $tenant = Tenant::findOrFail($pending['tenant_id']);
            $plan = SubscriptionPlan::findOrFail($pending['plan_id']);

            $subscription = $this->createSubscription(
                tenant: $tenant,
                plan: $plan,
                paymentData: [
                    'amount' => $pending['amount'] ?? $plan->price,
                    'payment_method' => $method,
                    'payment_ref' => $paymentRef,
                    'transaction_id' => $tranId,
                    'notes' => $notes,
                ],
                isTrial: false,
                initiatedBy: 'tenant'
            );

            Cache::forget("subscription_payment:{$tranId}");

            return $subscription;
        });
    }

    public function getAccessStatus(Tenant $tenant): string
    {
        $current = $this->getCurrentSubscription($tenant);

        if (!$current) {
            return 'none';
        }

        if ((bool) $current->is_trial && $current->status === 'active' && $current->expires_at->isFuture()) {
            return 'trial';
        }

        if ($current->status === 'active' && $current->expires_at->isFuture()) {
            return 'active';
        }

        if ($current->status === 'grace' && $current->grace_ends_at && $current->grace_ends_at->isFuture()) {
            return 'grace';
        }

        return 'expired';
    }

    public function applyGracePeriod(Subscription $subscription): void
    {
        if ($subscription->status !== 'active') {
            return;
        }

        $graceDays = (int) config('saas.subscription.grace_period_days', 3);

        $subscription->update([
            'status' => 'grace',
            'grace_ends_at' => Carbon::parse($subscription->expires_at)->addDays($graceDays),
        ]);

        AuditLogger::log('subscription_grace_started', $subscription);
    }

    public function hardExpire(Subscription $subscription): void
    {
        DB::transaction(function () use ($subscription) {
            $subscription->update([
                'status' => 'expired',
            ]);

            $hasAnotherActive = Subscription::withoutGlobalScopes()
                ->where('tenant_id', $subscription->tenant_id)
                ->where('id', '!=', $subscription->id)
                ->whereIn('status', ['active', 'grace'])
                ->where(function ($q) {
                    $q->whereDate('expires_at', '>=', today())
                        ->orWhereDate('grace_ends_at', '>=', today());
                })
                ->exists();

            if (!$hasAnotherActive) {
                Tenant::where('id', $subscription->tenant_id)->update(['is_active' => false]);
            }

            AuditLogger::log('subscription_hard_expired', $subscription);
        });
    }

    public function cancel(Subscription $subscription, ?string $reason = null): void
    {
        $subscription->update([
            'status' => 'cancelled',
            'notes' => $reason ? trim(($subscription->notes ?? '') . "\nCancellation reason: {$reason}") : $subscription->notes,
        ]);

        AuditLogger::log('subscription_cancelled', $subscription, null, [
            'reason' => $reason,
        ]);
    }

    public function getCurrentSubscription(Tenant $tenant): ?Subscription
    {
        return Subscription::withoutGlobalScopes()
            ->where('tenant_id', $tenant->id)
            ->orderByRaw("CASE WHEN status IN ('active','grace') THEN 0 ELSE 1 END")
            ->orderByDesc('expires_at')
            ->first();
    }

    private function calculateStartDate(Tenant $tenant): Carbon
    {
        $active = Subscription::withoutGlobalScopes()
            ->where('tenant_id', $tenant->id)
            ->where('status', 'active')
            ->whereDate('expires_at', '>=', today())
            ->orderByDesc('expires_at')
            ->first();

        if ($active) {
            return Carbon::parse($active->expires_at)->startOfDay();
        }

        return now()->startOfDay();
    }
}
