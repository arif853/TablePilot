<?php

namespace App\Jobs;

use App\Models\Order;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class GenerateReport implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $tries = 3;

    public $timeout = 60;

    public $backoff = 60;

    public function __construct(
        public int $tenantId,
        public string $reportType,
        public string $from,
        public string $to
    ) {}

    public function handle(): void
    {
        $cacheKey = "report:{$this->tenantId}:{$this->reportType}:{$this->from}:{$this->to}";

        $data = match ($this->reportType) {
            'sales' => $this->generateSalesReport(),
            'revenue' => $this->generateRevenueReport(),
            default => null,
        };

        if ($data) {
            Cache::put($cacheKey, $data, now()->addHours(6));
            Log::info("Report generated: {$this->reportType} for tenant {$this->tenantId}");
        }
    }

    private function generateSalesReport(): array
    {
        $orders = Order::withoutGlobalScopes()
            ->where('tenant_id', $this->tenantId)
            ->where('status', 'completed')
            ->whereBetween('created_at', [$this->from, $this->to]);

        return [
            'total_sales' => (clone $orders)->sum('grand_total'),
            'total_orders' => (clone $orders)->count(),
            'total_tax' => (clone $orders)->sum('tax'),
            'total_discount' => (clone $orders)->sum('discount'),
            'dine_in_count' => (clone $orders)->where('type', 'dine')->count(),
            'parcel_count' => (clone $orders)->where('type', 'parcel')->count(),
            'generated_at' => now()->toIso8601String(),
        ];
    }

    private function generateRevenueReport(): array
    {
        return Order::withoutGlobalScopes()
            ->where('tenant_id', $this->tenantId)
            ->where('status', 'completed')
            ->whereBetween('created_at', [$this->from, $this->to])
            ->select(
                DB::raw('DATE(created_at) as date'),
                DB::raw('SUM(grand_total) as revenue'),
                DB::raw('COUNT(*) as orders')
            )
            ->groupBy('date')
            ->orderBy('date')
            ->get()
            ->toArray();
    }
}
