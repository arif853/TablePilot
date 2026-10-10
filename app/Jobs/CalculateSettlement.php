<?php

namespace App\Jobs;

use App\Models\Order;
use App\Models\Settlement;
use App\Models\Tenant;
use Illuminate\Bus\Queueable;
use Illuminate\Support\Carbon;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class CalculateSettlement implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $tries = 3;

    public $timeout = 120;

    public $backoff = 60;

    public function __construct(
        public ?int $tenantId = null,
        public ?string $periodStart = null,
        public ?string $periodEnd = null
    ) {}

    public function handle(): void
    {
        // Scheduled on the 1st, so default to the month that just ended.
        $periodStart = $this->periodStart ?? now()->subMonthNoOverflow()->startOfMonth()->toDateString();
        $periodEnd = $this->periodEnd ?? now()->subMonthNoOverflow()->endOfMonth()->toDateString();

        $query = Tenant::where('payment_mode', 'platform')->where('is_active', true);

        if ($this->tenantId) {
            $query->where('id', $this->tenantId);
        }

        $tenants = $query->get();

        foreach ($tenants as $tenant) {
            $totalSold = Order::withoutGlobalScopes()
                ->where('tenant_id', $tenant->id)
                ->where('status', 'completed')
                ->whereBetween('created_at', [
                    Carbon::parse($periodStart)->startOfDay(),
                    Carbon::parse($periodEnd)->endOfDay(),
                ])
                ->sum('grand_total');

            if ($totalSold <= 0) continue;

            $commissionRate = $tenant->commission_rate;
            $commissionAmount = (float) bcdiv(bcmul((string) $totalSold, (string) $commissionRate, 4), '100', 2);

            // Check if settlement already exists for this period
            $settlement = Settlement::withoutGlobalScopes()
                ->where('tenant_id', $tenant->id)
                ->where('period_start', $periodStart)
                ->where('period_end', $periodEnd)
                ->first();

            if ($settlement) {
                $settlement->update([
                    'total_sold' => $totalSold,
                    'commission_rate' => $commissionRate,
                    'commission_amount' => $commissionAmount,
                    'payable_balance' => ($totalSold - $commissionAmount) - $settlement->total_paid,
                ]);
            } else {
                Settlement::create([
                    'tenant_id' => $tenant->id,
                    'total_sold' => $totalSold,
                    'commission_rate' => $commissionRate,
                    'commission_amount' => $commissionAmount,
                    'total_paid' => 0,
                    'payable_balance' => $totalSold - $commissionAmount,
                    'period_start' => $periodStart,
                    'period_end' => $periodEnd,
                    'status' => 'pending',
                ]);
            }

            Log::info("Settlement calculated for tenant {$tenant->id}: Total {$totalSold}, Commission {$commissionAmount}");
        }
    }
}
