<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\StoreSubscriptionRequest;
use App\Models\Subscription;
use App\Models\SubscriptionPlan;
use App\Models\Tenant;
use App\Services\AuditLogger;
use App\Services\SslCommerzService;
use App\Services\SubscriptionService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class SubscriptionController extends BaseApiController
{
    public function __construct(
        protected SubscriptionService $subscriptionService
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = Subscription::withoutGlobalScopes()->with(['tenant:id,name', 'plan:id,name,slug']);

        if ($tenantId = $request->get('tenant_id')) {
            $query->where('tenant_id', $tenantId);
        }

        if ($status = $request->get('status')) {
            $query->where('status', $status);
        }

        return $this->paginated($query->latest());
    }

    public function store(StoreSubscriptionRequest $request): JsonResponse
    {
        $tenant = Tenant::find($request->tenant_id);

        if (!$tenant) {
            return $this->notFound('Tenant not found');
        }

        $plan = null;

        if ($request->filled('plan_id')) {
            $plan = SubscriptionPlan::find($request->plan_id);
        }

        if (!$plan && $request->filled('plan_type')) {
            $plan = SubscriptionPlan::where('slug', $request->plan_type)->first();
        }

        if (!$plan) {
            return $this->error('Valid plan is required', 422);
        }

        $subscription = $this->subscriptionService->createSubscription(
            tenant: $tenant,
            plan: $plan,
            paymentData: [
                'amount' => $request->amount ?? $plan->price,
                'payment_method' => $request->payment_method,
                'payment_ref' => $request->payment_ref,
                'transaction_id' => $request->transaction_id,
                'notes' => $request->notes,
            ],
            isTrial: false,
            initiatedBy: 'super_admin'
        );

        return $this->created($subscription->load(['tenant:id,name', 'plan:id,name,slug']), 'Subscription created successfully');
    }

    public function show(int $id): JsonResponse
    {
        $subscription = Subscription::withoutGlobalScopes()
            ->with(['tenant:id,name,slug,email', 'plan:id,name,slug'])
            ->find($id);

        if (!$subscription) {
            return $this->notFound('Subscription not found');
        }

        return $this->success($subscription);
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $subscription = Subscription::withoutGlobalScopes()->find($id);

        if (!$subscription) {
            return $this->notFound('Subscription not found');
        }

        $this->subscriptionService->cancel($subscription, $request->input('reason'));

        return $this->success($subscription->fresh(), 'Subscription cancelled');
    }

    public function currentSubscription(): JsonResponse
    {
        $tenant = Auth::user()?->tenant;

        if (!$tenant) {
            return $this->error('No tenant found', 404);
        }

        $subscription = $this->subscriptionService->getCurrentSubscription($tenant);
        $status = $this->subscriptionService->getAccessStatus($tenant);

        return $this->success([
            'subscription' => $subscription?->load('plan:id,name,slug,price,duration_days,max_users'),
            'status' => $status,
            'expired' => in_array($status, ['expired', 'none'], true),
            'is_on_trial' => $status === 'trial',
            'trial_days_remaining' => $subscription?->is_trial ? ($subscription->expires_at?->diffInDays(today(), false) * -1) : 0,
            'trial_ends_at' => $subscription?->is_trial ? $subscription->expires_at : null,
            'days_remaining' => $subscription?->daysRemaining() ?? 0,
            'grace_ends_at' => $subscription?->grace_ends_at,
            'message' => !$subscription ? 'No subscription found' : null,
        ]);
    }

    public function plans(): JsonResponse
    {
        $plans = SubscriptionPlan::query()
            ->where('is_active', true)
            ->ordered()
            ->get();

        return $this->success($plans);
    }

    public function initiatePayment(Request $request): JsonResponse
    {
        $request->validate([
            'plan_id' => 'required|exists:subscription_plans,id',
            'payment_method' => 'nullable|in:sslcommerz,bkash,manual',
        ]);

        $user = Auth::user();
        $tenant = $user?->tenant;

        if (!$tenant) {
            return $this->error('No restaurant found. Please complete onboarding first.', 422);
        }

        $plan = SubscriptionPlan::findOrFail($request->plan_id);

        if (!$plan->is_active) {
            return $this->error('This plan is not currently available.', 422);
        }

        $paymentMethod = $request->payment_method ?? 'sslcommerz';

        if ($paymentMethod === 'bkash') {
            return $this->error('bKash payments are not available yet.', 422);
        }

        $tranId = 'SUB-' . $tenant->id . '-' . time() . '-' . Str::random(6);

        $paymentData = [
            'tenant_id' => $tenant->id,
            'plan_id' => $plan->id,
            'amount' => $plan->price,
            'payment_method' => $paymentMethod,
            'initiated_by' => 'tenant',
            'tran_id' => $tranId,
        ];

        cache()->put("subscription_payment:{$tranId}", $paymentData, now()->addMinutes(30));

        if ($paymentMethod === 'manual') {
            return $this->success([
                'tran_id' => $tranId,
                'message' => 'Manual payment selected. Submit verification after payment.',
                'verification_required' => true,
            ], 'Manual payment initiated');
        }

        $sslCommerz = new SslCommerzService();

        if (!$sslCommerz->isEnabled()) {
            // Free activation is a local/testing convenience only.
            if (!app()->environment(['local', 'testing'])) {
                cache()->forget("subscription_payment:{$tranId}");
                return $this->error('Online payment is not available at this time.', 503);
            }

            $subscription = $this->subscriptionService->createSubscription(
                tenant: $tenant,
                plan: $plan,
                paymentData: [
                    'amount' => $plan->price,
                    'payment_method' => 'manual',
                    'transaction_id' => $tranId,
                    'notes' => 'Direct activation: gateway disabled',
                ],
                isTrial: false,
                initiatedBy: 'tenant'
            );

            cache()->forget("subscription_payment:{$tranId}");

            return $this->created([
                'subscription' => $subscription->load('plan:id,name,slug'),
                'plan' => $plan,
            ], 'Subscription activated successfully.');
        }

        $baseUrl = rtrim(config('app.url'), '/');

        $paymentResult = $sslCommerz->initiatePayment([
            'amount' => $plan->price,
            'currency' => $tenant->currency ?? 'BDT',
            'tran_id' => $tranId,
            'success_url' => "{$baseUrl}/api/payment/sslcommerz/callback",
            'fail_url' => "{$baseUrl}/api/payment/sslcommerz/callback",
            'cancel_url' => "{$baseUrl}/api/payment/sslcommerz/callback",
            'ipn_url' => "{$baseUrl}/api/payment/sslcommerz/ipn",
            'customer_name' => $user->name,
            'customer_email' => $user->email,
            'customer_phone' => $tenant->phone ?? '01700000000',
            'product_name' => "Subscription: {$plan->name}",
            'num_items' => 1,
        ]);

        if (!$paymentResult['success']) {
            return $this->error('Payment initiation failed. Please try again.', 500);
        }

        return $this->success([
            'payment_url' => $paymentResult['gateway_url'],
            'tran_id' => $tranId,
            'plan' => $plan,
            'amount' => $plan->price,
        ], 'Redirect to payment gateway to complete renewal.');
    }

    // Backward-compatible alias.
    public function pay(Request $request): JsonResponse
    {
        return $this->initiatePayment($request);
    }

    public function verify(Request $request): JsonResponse
    {
        $request->validate([
            'tran_id' => 'required|string',
            'payment_ref' => 'required|string|max:255',
            'receipt' => 'nullable|file|mimes:jpg,jpeg,png,pdf|max:4096',
        ]);

        $pending = cache()->get("subscription_payment:{$request->tran_id}");

        if (!$pending) {
            return $this->error('Invalid or expired payment session.', 422);
        }

        $tenant = Tenant::find($pending['tenant_id']);
        $plan = SubscriptionPlan::find($pending['plan_id']);

        if (!$tenant || !$plan) {
            return $this->error('Invalid payment metadata.', 422);
        }

        // A tenant's own claim of payment must never activate a subscription.
        // Record it for a super admin, who activates it via the manual renewal
        // endpoint once the payment is confirmed.
        if (Auth::user()?->tenant_id !== $tenant->id) {
            return $this->error('Invalid payment session.', 403);
        }

        $receiptPath = null;
        if ($request->hasFile('receipt')) {
            $receiptPath = $request->file('receipt')->store('subscription-receipts', 'public');
        }

        AuditLogger::log('subscription_payment_verification_submitted', $tenant, null, [
            'tran_id' => $request->tran_id,
            'payment_ref' => $request->payment_ref,
            'plan_id' => $plan->id,
            'amount' => $pending['amount'] ?? $plan->price,
            'receipt' => $receiptPath,
        ]);

        return $this->success([
            'tran_id' => $request->tran_id,
            'status' => 'pending_review',
        ], 'Payment details submitted. Your subscription will be activated once an administrator confirms the payment.');
    }

    public function paymentCallback(Request $request): JsonResponse
    {
        $request->validate([
            'transaction_id' => 'required|string',
            'payment_ref' => 'required|string',
            'status' => 'required|in:success,failed',
        ]);

        if ($request->status !== 'success') {
            return $this->error('Payment failed');
        }

        $existing = Subscription::withoutGlobalScopes()
            ->where('transaction_id', $request->transaction_id)
            ->whereIn('status', ['active', 'grace'])
            ->first();

        if ($existing) {
            return $this->success([
                'subscription' => $existing->load(['tenant:id,name', 'plan:id,name,slug']),
            ], 'Subscription already active.');
        }

        return $this->error('Payment could not be verified. Please contact support.', 422);
    }

    public function expiringSoon(Request $request): JsonResponse
    {
        $now = Carbon::now();

        $critical = Subscription::withoutGlobalScopes()
            ->with(['tenant:id,name,slug,email', 'plan:id,name,slug'])
            ->whereIn('status', ['active', 'grace'])
            ->whereDate('expires_at', '<=', $now->copy()->addDays(7))
            ->orderBy('expires_at')
            ->get();

        $warning = Subscription::withoutGlobalScopes()
            ->with(['tenant:id,name,slug,email', 'plan:id,name,slug'])
            ->whereIn('status', ['active', 'grace'])
            ->whereDate('expires_at', '>', $now->copy()->addDays(7))
            ->whereDate('expires_at', '<=', $now->copy()->addDays(14))
            ->orderBy('expires_at')
            ->get();

        $upcoming = Subscription::withoutGlobalScopes()
            ->with(['tenant:id,name,slug,email', 'plan:id,name,slug'])
            ->whereIn('status', ['active', 'grace'])
            ->whereDate('expires_at', '>', $now->copy()->addDays(14))
            ->whereDate('expires_at', '<=', $now->copy()->addDays(30))
            ->orderBy('expires_at')
            ->get();

        return $this->success([
            'critical' => $critical,
            'warning' => $warning,
            'upcoming' => $upcoming,
            'counts' => [
                'critical' => $critical->count(),
                'warning' => $warning->count(),
                'upcoming' => $upcoming->count(),
                'total' => $critical->count() + $warning->count() + $upcoming->count(),
            ],
        ]);
    }

    public function extend(Request $request, int $id): JsonResponse
    {
        $subscription = Subscription::withoutGlobalScopes()->find($id);

        if (!$subscription) {
            return $this->notFound('Subscription not found');
        }

        $request->validate([
            'days' => 'required|integer|min:1|max:365',
            'reason' => 'nullable|string|max:500',
        ]);

        $original = $subscription->toArray();
        $oldExpiry = $subscription->expires_at->copy();

        $baseDate = $subscription->isExpired() ? now() : $subscription->expires_at;
        $newExpiry = $baseDate->copy()->addDays($request->days);

        $subscription->update([
            'expires_at' => $newExpiry,
            'status' => 'active',
            'grace_ends_at' => null,
            'notes' => $subscription->notes
                ? $subscription->notes . "\n[Extended on " . now()->format('Y-m-d') . ": +{$request->days} days. Reason: " . ($request->reason ?? 'N/A') . "]"
                : "[Extended on " . now()->format('Y-m-d') . ": +{$request->days} days. Reason: " . ($request->reason ?? 'N/A') . "]",
        ]);

        Tenant::where('id', $subscription->tenant_id)->update(['is_active' => true]);

        AuditLogger::logUpdated($subscription, $original);

        return $this->success([
            'subscription' => $subscription->fresh()->load(['tenant:id,name', 'plan:id,name,slug']),
            'old_expiry' => $oldExpiry->format('Y-m-d'),
            'new_expiry' => $newExpiry->format('Y-m-d'),
            'days_added' => $request->days,
        ], "Subscription extended by {$request->days} days");
    }

    public function renewManual(Request $request, int $tenantId): JsonResponse
    {
        $tenant = Tenant::find($tenantId);

        if (!$tenant) {
            return $this->notFound('Tenant not found');
        }

        $validator = Validator::make($request->all(), [
            'plan_id' => 'required_without:plan_type|exists:subscription_plans,id',
            'plan_type' => 'required_without:plan_id|in:monthly,yearly,custom',
            'custom_days' => 'nullable|integer|min:1',
            'custom_amount' => 'nullable|numeric|min:0',
            'payment_method' => 'nullable|string|max:50',
            'payment_ref' => 'nullable|string|max:255',
            'notes' => 'nullable|string|max:500',
        ]);

        $validator->sometimes('custom_days', 'required|integer|min:1', function ($input) {
            return empty($input->plan_id) && ($input->plan_type ?? null) === 'custom';
        });

        $validator->sometimes('custom_amount', 'required|numeric|min:0', function ($input) {
            return empty($input->plan_id) && ($input->plan_type ?? null) === 'custom';
        });

        $validated = $validator->validate();

        $currentSubscription = Subscription::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->where('status', 'active')
            ->latest('expires_at')
            ->first();

        $renewalBaseDate = $currentSubscription?->expires_at?->copy() ?? now();
        if ($renewalBaseDate->isPast()) {
            $renewalBaseDate = now();
        }

        if (!empty($validated['plan_id'])) {
            $plan = SubscriptionPlan::findOrFail($validated['plan_id']);
        } else {
            $plan = SubscriptionPlan::firstOrCreate(
                ['slug' => 'custom'],
                [
                    'name' => 'Custom',
                    'price' => (float) $validated['custom_amount'],
                    'duration_days' => (int) $validated['custom_days'],
                    'max_users' => $tenant->max_users ?? 5,
                    'is_active' => true,
                    'sort_order' => 999,
                ]
            );
        }

        $subscription = DB::transaction(function () use ($tenant, $plan, $validated, $renewalBaseDate) {
            Subscription::withoutGlobalScopes()
                ->where('tenant_id', $tenant->id)
                ->where('status', 'active')
                ->update(['status' => 'expired']);

            $duration = (int) $plan->duration_days;

            $created = Subscription::withoutGlobalScopes()->create([
                'tenant_id' => $tenant->id,
                'plan_id' => $plan->id,
                'plan_type' => $plan->subscriptionType(),
                'is_trial' => false,
                'amount' => $validated['custom_amount'] ?? $plan->price,
                'payment_method' => $validated['payment_method'] ?? 'manual',
                'payment_ref' => $validated['payment_ref'] ?? null,
                'starts_at' => now()->startOfDay(),
                'expires_at' => $renewalBaseDate->copy()->addDays($duration),
                'status' => 'active',
                'initiated_by' => 'super_admin',
                'notes' => $validated['notes'] ?? 'Manual renewal by super admin',
            ]);

            $tenant->update(['is_active' => true, 'max_users' => $plan->max_users]);

            AuditLogger::log('subscription_renewed', $created, null, [
                'tenant_id' => $tenant->id,
                'plan_id' => $plan->id,
                'renewal_base_date' => $renewalBaseDate->toDateString(),
            ]);

            return $created;
        });

        return $this->created([
            'subscription' => $subscription->load(['tenant:id,name', 'plan:id,name,slug']),
            'plan' => $plan,
            'renewal_base_date' => $renewalBaseDate->toDateString(),
            'expires_at' => $subscription->expires_at?->toDateString(),
        ], 'Subscription renewed successfully');
    }
}
