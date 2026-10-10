<?php

use App\Jobs\AutoCancelStaleOrders;
use App\Jobs\CalculateSettlement;
use App\Jobs\CheckSubscriptionExpiry;
use App\Jobs\SendSubscriptionExpiryWarnings;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Check subscription expiry daily at midnight
Schedule::job(new CheckSubscriptionExpiry)->daily()->at('00:05');

// Send subscription expiry warnings daily at 9 AM
Schedule::job(new SendSubscriptionExpiryWarnings)->daily()->at('09:00');

// Auto-cancel stale orders every 5 minutes
Schedule::job(new AutoCancelStaleOrders)->everyFiveMinutes();

// Calculate settlements monthly on the 1st
Schedule::job(new CalculateSettlement)->monthlyOn(1, '02:00');

// Keep the failed_jobs table from growing forever
Schedule::command('queue:prune-failed --hours=168')->daily()->at('03:00');

// Process queued jobs without Supervisor: one worker at a time, exits when the queue is empty
if (config('queue.scheduler_worker')) {
    Schedule::command('queue:work --stop-when-empty --max-time=50 --timeout=60 --tries=3 --memory=128')
        ->everyMinute()
        ->withoutOverlapping(10)
        ->runInBackground();
}
