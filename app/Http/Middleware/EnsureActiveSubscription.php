<?php

namespace App\Http\Middleware;

use App\Services\SubscriptionService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureActiveSubscription
{
    public function __construct(
        protected SubscriptionService $subscriptionService
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (!$user || $user->isSuperAdmin()) {
            return $next($request);
        }

        $tenant = $user->tenant;

        if (!$tenant) {
            return response()->json(['message' => 'No tenant found.'], 403);
        }

        $status = $this->subscriptionService->getAccessStatus($tenant);

        if ($status === 'expired' || $status === 'none') {
            return response()->json([
                'success' => false,
                'message' => 'Subscription expired. Please renew to continue.',
                'subscription_expired' => true,
                'trial_expired' => $status === 'expired' && $tenant->trial_ends_at && $tenant->trial_ends_at->isPast(),
                'error_code' => 'SUBSCRIPTION_EXPIRED',
                'redirect' => '/dashboard/subscription/renew',
            ], 402);
        }

        if ($status === 'grace') {
            $response = $next($request);
            $response->headers->set('X-Subscription-Warning', 'grace_period');
            return $response;
        }

        return $next($request);
    }
}
