<?php

namespace App\Jobs;

use App\Models\Subscription;
use App\Services\SubscriptionService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class CheckSubscriptionExpiry implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(SubscriptionService $subscriptionService): void
    {
        Log::info('Running subscription expiry check...');

        // Step 1: Active subscriptions that reached expiry enter grace period.
        $toGrace = Subscription::withoutGlobalScopes()
            ->where('status', 'active')
            ->whereDate('expires_at', '<=', today())
            ->get();

        foreach ($toGrace as $subscription) {
            $subscriptionService->applyGracePeriod($subscription);
        }

        // Step 2: Grace subscriptions that passed grace_ends_at are hard-expired.
        $toExpire = Subscription::withoutGlobalScopes()
            ->where('status', 'grace')
            ->whereNotNull('grace_ends_at')
            ->whereDate('grace_ends_at', '<=', today())
            ->get();

        foreach ($toExpire as $subscription) {
            $subscriptionService->hardExpire($subscription);
        }

        Log::info("Processed {$toGrace->count()} subscriptions into grace period.");
        Log::info("Processed {$toExpire->count()} subscriptions into hard expiry.");
    }
}
