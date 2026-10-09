<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\BaseApiController;
use App\Mail\WelcomeMail;
use App\Models\Subscription;
use App\Models\SubscriptionPlan;
use App\Models\Tenant;
use App\Models\User;
use App\Services\SslCommerzService;
use App\Services\SubscriptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class OnboardingController extends BaseApiController
{
    public function __construct(
        protected SubscriptionService $subscriptionService
    ) {}

    /**
     * Step 1: Setup restaurant (create tenant) for a registered user without a tenant.
     *
     * Requires authenticated user with role=restaurant_admin and no tenant_id.
     */
    public function setupRestaurant(Request $request): JsonResponse
    {
        /** @var \App\Models\User $user */
        $user = Auth::user();

        if ($user->tenant_id) {
            return $this->error('You already have a restaurant associated with your account.', 422);
        }

        if ($user->role !== User::ROLE_RESTAURANT_ADMIN) {
            return $this->error('Only restaurant administrators can set up a restaurant.', 403);
        }

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'phone' => 'required|string|max:20',
            'address' => 'nullable|string|max:500',
            'description' => 'nullable|string|max:1000',
        ]);

        return DB::transaction(function () use ($validated, $user) {
            // Generate a unique slug
            $baseSlug = Str::slug($validated['name']);
            $slug = $baseSlug . '-' . Str::random(5);

            $tenant = Tenant::create([
                'name' => $validated['name'],
                'slug' => $slug,
                'email' => $user->email,
                'phone' => $validated['phone'],
                'address' => $validated['address'] ?? null,
                'description' => $validated['description'] ?? null,
                'payment_mode' => 'seller', // Default: restaurant handles own payments
                'commission_rate' => config('saas.default_commission_rate', 5.00),
                'tax_rate' => 0,
                'max_users' => 5,
                'is_active' => true, // Active immediately on trial
                'trial_ends_at' => now()->addDays(config('saas.trial.default_days', 14)),
            ]);

            // Link the user to the new tenant
            $user->update([
                'tenant_id' => $tenant->id,
                'status' => 'active',
            ]);

            // Send welcome email
            try {
                Mail::to($user->email)->send(new WelcomeMail(
                    user: $user->fresh(),
                    tenantName: $tenant->name,
                ));
            } catch (\Exception $e) {
                Log::warning("Failed to send welcome email: " . $e->getMessage());
            }

            return $this->created([
                'tenant' => $tenant,
                'user' => $user->fresh()->load('tenant'),
                'next_step' => 'subscribe',
                'trial_ends_at' => $tenant->trial_ends_at,
                'trial_days_remaining' => $tenant->trialDaysRemaining(),
                'message' => 'Restaurant created. Free trial active for ' . config('saas.trial.default_days', 14) . ' days.',
            ], 'Restaurant setup completed. Your free trial is now active.');
        });
    }

    /**
     * Step 2: Initiate subscription payment via SSLCommerz.
     *
     * The tenant must exist but be inactive (no active subscription yet).
     */
    public function initiateSubscription(Request $request): JsonResponse
    {
        /** @var \App\Models\User $user */
        $user = Auth::user();

        if (!$user->tenant_id) {
            return $this->error('Please set up your restaurant first.', 422);
        }

        $tenant = Tenant::find($user->tenant_id);

        if (!$tenant) {
            return $this->error('Tenant not found.', 404);
        }

        // Check if already has active subscription
        if ($tenant->hasActiveSubscription()) {
            return $this->error('You already have an active subscription.', 422);
        }

        $validated = $request->validate([
            'plan_id' => 'required|exists:subscription_plans,id',
        ]);

        $plan = SubscriptionPlan::findOrFail($validated['plan_id']);

        if (!$plan->is_active) {
            return $this->error('This plan is not currently available.', 422);
        }

        // Generate a unique transaction ID
        $tranId = 'SUB-' . $tenant->id . '-' . time() . '-' . Str::random(6);

        // Store pending subscription info in session/cache for callback
        $subscriptionData = [
            'tenant_id' => $tenant->id,
            'plan_id' => $plan->id,
            'plan_type' => $plan->subscriptionType(),
            'amount' => $plan->price,
            'duration_days' => $plan->duration_days,
            'tran_id' => $tranId,
        ];

        // Store in cache for 30 minutes
        cache()->put("subscription_payment:{$tranId}", $subscriptionData, now()->addMinutes(30));

        $sslCommerz = new SslCommerzService();

        // Check if SSLCommerz is enabled
        if (!$sslCommerz->isEnabled()) {
            // Free activation is a local/testing convenience only; in production
            // an unconfigured gateway must never hand out subscriptions.
            if (!app()->environment(['local', 'testing'])) {
                cache()->forget("subscription_payment:{$tranId}");
                return $this->error('Online payment is not available at this time.', 503);
            }

            return $this->createSubscriptionDirectly($tenant, $plan, 'manual', $tranId);
        }

        $baseUrl = config('app.url');

        $paymentResult = $sslCommerz->initiatePayment([
            'amount' => $plan->price,
            'currency' => $tenant->currency ?? 'BDT',
            'tran_id' => $tranId,
            'success_url' => "{$baseUrl}/api/onboarding/payment/success",
            'fail_url' => "{$baseUrl}/api/onboarding/payment/fail",
            'cancel_url' => "{$baseUrl}/api/onboarding/payment/cancel",
            'ipn_url' => "{$baseUrl}/api/onboarding/payment/ipn",
            'customer_name' => $user->name,
            'customer_email' => $user->email,
            'customer_phone' => $tenant->phone ?? '01700000000',
            'product_name' => "Subscription: {$plan->name}",
            'num_items' => 1,
        ]);

        if (!$paymentResult['success']) {
            return $this->error('Payment initiation failed: ' . ($paymentResult['error'] ?? 'Unknown error'), 500);
        }

        return $this->success([
            'payment_url' => $paymentResult['gateway_url'],
            'tran_id' => $tranId,
            'plan' => $plan,
            'amount' => $plan->price,
        ], 'Payment session created. Redirect to payment gateway.');
    }

    /**
     * SSLCommerz success callback — creates the subscription.
     */
    public function paymentSuccess(Request $request): \Illuminate\Http\RedirectResponse
    {
        $tranId = (string) $request->input('tran_id');
        $frontendUrl = config('app.frontend_url', config('app.url'));

        $result = $this->settleGatewayPayment($request, $tranId);

        if ($result === 'ok') {
            return redirect("{$frontendUrl}/onboarding/payment?status=success&tran_id={$tranId}");
        }

        $message = $result === 'validation_failed' ? 'Payment+validation+failed' : 'Invalid+or+expired+payment+session';

        return redirect("{$frontendUrl}/onboarding/payment?status=failed&message={$message}");
    }

    /**
     * SSLCommerz failure callback.
     */
    public function paymentFail(Request $request): \Illuminate\Http\RedirectResponse
    {
        $frontendUrl = config('app.frontend_url', config('app.url'));
        $tranId = $request->input('tran_id', '');

        cache()->forget("subscription_payment:{$tranId}");

        return redirect("{$frontendUrl}/onboarding/payment?status=failed&tran_id={$tranId}");
    }

    /**
     * SSLCommerz cancel callback.
     */
    public function paymentCancel(Request $request): \Illuminate\Http\RedirectResponse
    {
        $frontendUrl = config('app.frontend_url', config('app.url'));
        $tranId = $request->input('tran_id', '');

        cache()->forget("subscription_payment:{$tranId}");

        return redirect("{$frontendUrl}/onboarding/payment?status=cancelled&tran_id={$tranId}");
    }

    /**
     * SSLCommerz IPN (server-to-server) callback.
     */
    public function paymentIpn(Request $request): JsonResponse
    {
        $tranId = (string) $request->input('tran_id');

        $result = $this->settleGatewayPayment($request, $tranId);

        if ($result !== 'ok') {
            Log::warning("Onboarding IPN {$result} for transaction: {$tranId}");
        }

        return response()->json(['status' => $result]);
    }

    /**
     * Verify a callback with the gateway and activate the subscription once.
     * Shared by the redirect and the IPN, which usually arrive together.
     *
     * @return 'ok'|'ignored'|'validation_failed'
     */
    protected function settleGatewayPayment(Request $request, string $tranId): string
    {
        $pending = cache()->get("subscription_payment:{$tranId}");

        if (!$pending) {
            // Already settled by the other callback?
            return $tranId !== '' && Subscription::withoutGlobalScopes()->where('transaction_id', $tranId)->exists()
                ? 'ok'
                : 'ignored';
        }

        if (!(new SslCommerzService())->validatePayment($request->all(), $tranId, $pending['amount'] ?? null)) {
            return 'validation_failed';
        }

        $this->subscriptionService->activateFromGatewayPayment(
            $tranId,
            $pending,
            (string) $request->input('card_type', 'online'),
            $request->input('val_id'),
            'Self-service onboarding subscription',
        );

        return 'ok';
    }

    /**
     * Create subscription and activate tenant.
     */
    protected function activateSubscription(array $data, string $paymentMethod, string $tranId, ?string $valId = null): Subscription
    {
        $tenant = Tenant::findOrFail($data['tenant_id']);
        $plan = SubscriptionPlan::findOrFail($data['plan_id']);

        $subscription = $this->subscriptionService->createSubscription(
            tenant: $tenant,
            plan: $plan,
            paymentData: [
                'amount' => $data['amount'],
                'payment_method' => $paymentMethod,
                'payment_ref' => $valId,
                'transaction_id' => $tranId,
                'notes' => 'Self-service onboarding subscription',
            ],
            isTrial: false,
            initiatedBy: 'tenant'
        );

        Log::info("Subscription activated for tenant {$data['tenant_id']} via onboarding. Transaction: {$tranId}");

        return $subscription;
    }

    /**
     * For dev/testing: create subscription directly without a payment gateway.
     */
    protected function createSubscriptionDirectly(Tenant $tenant, SubscriptionPlan $plan, string $method, string $tranId): JsonResponse
    {
        $subscription = $this->activateSubscription([
            'tenant_id' => $tenant->id,
            'plan_id' => $plan->id,
            'plan_type' => $plan->subscriptionType(),
            'amount' => $plan->price,
            'duration_days' => $plan->duration_days,
        ], $method, $tranId);

        return $this->created([
            'subscription' => $subscription->load('tenant:id,name'),
            'plan' => $plan,
            'message' => 'Subscription activated (payment gateway not configured — direct activation).',
        ], 'Subscription activated successfully.');
    }

    /**
     * Check the current onboarding status for the authenticated user.
     */
    public function status(): JsonResponse
    {
        /** @var \App\Models\User $user */
        $user = Auth::user();

        $status = [
            'has_account' => true,
            'has_restaurant' => (bool)$user->tenant_id,
            'has_subscription' => false,
            'is_active' => false,
            'current_step' => 'register',
        ];

        if ($user->tenant_id) {
            $tenant = Tenant::find($user->tenant_id);
            $status['restaurant'] = $tenant;
            $status['has_subscription'] = $tenant?->hasActiveSubscription() ?? false;
            $status['is_active'] = $tenant?->is_active ?? false;
            $status['is_on_trial'] = $tenant?->isOnTrial() ?? false;
            $status['trial_days_remaining'] = $tenant?->trialDaysRemaining() ?? 0;
            $status['trial_ends_at'] = $tenant?->trial_ends_at;

            if ($status['has_subscription']) {
                $status['current_step'] = 'complete';
                $status['subscription'] = $tenant->activeSubscription;
            } else {
                $status['current_step'] = 'subscribe';
            }
        } else {
            $status['current_step'] = 'setup_restaurant';
        }

        return $this->success($status);
    }
}
