<?php

namespace App\Jobs;

use App\Mail\SubscriptionExpiryWarningMail;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class SendSubscriptionExpiryWarnings implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * Send warning emails for subscriptions expiring in 1, 3, and 7 days.
     */
    public function handle(): void
    {
        Log::info('Running subscription expiry warning emails...');

        $warningDays = (array) config('saas.subscription.expiry_warning_days', [7, 3, 1]);
        $sentCount = 0;

        foreach ($warningDays as $days) {
            $expiringSubscriptions = Subscription::withoutGlobalScopes()
                ->with('tenant')
                ->where('status', 'active')
                ->whereDate('expires_at', today()->addDays($days))
                ->get();

            foreach ($expiringSubscriptions as $subscription) {
                $tenant = $subscription->tenant;

                if (!$tenant || !$tenant->is_active) {
                    continue;
                }

                // Get the tenant admin email(s)
                $adminEmails = $this->getTenantAdminEmails($tenant->id);

                if (empty($adminEmails)) {
                    // Fall back to tenant email
                    $adminEmails = [$tenant->email];
                }

                foreach ($adminEmails as $email) {
                    try {
                        $cacheKey = sprintf(
                            'subscription-warning:%s:%s:%d:%s',
                            now()->toDateString(),
                            $subscription->id,
                            $days,
                            md5($email)
                        );

                        if (Cache::has($cacheKey)) {
                            continue;
                        }

                        Mail::to($email)->send(new SubscriptionExpiryWarningMail(
                            tenant: $tenant,
                            subscription: $subscription,
                            daysRemaining: $days,
                        ));

                        Cache::put($cacheKey, true, now()->endOfDay());
                        $sentCount++;
                    } catch (\Exception $e) {
                        Log::error("Failed to send expiry warning to {$email} for tenant {$tenant->id}: " . $e->getMessage());
                    }
                }
            }
        }

        Log::info("Subscription expiry warnings sent: {$sentCount} emails.");
    }

    /**
     * Get all restaurant_admin emails for a tenant.
     */
    protected function getTenantAdminEmails(int $tenantId): array
    {
        return User::where('tenant_id', $tenantId)
            ->where('role', User::ROLE_RESTAURANT_ADMIN)
            ->where('status', 'active')
            ->pluck('email')
            ->toArray();
    }
}
