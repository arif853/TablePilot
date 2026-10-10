<?php

namespace App\Jobs;

use App\Events\OrderStatusUpdated;
use App\Models\Order;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class AutoCancelStaleOrders implements ShouldQueue, ShouldBeUnique
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $tries = 3;

    public $timeout = 60;

    public $backoff = 60;

    // Don't stack up copies when the worker falls behind the 5-minute schedule
    public $uniqueFor = 600;

    public function handle(): void
    {
        $autoCancelMinutes = config('saas.order.auto_cancel_minutes', 30);

        Log::info("Running auto-cancel for orders older than {$autoCancelMinutes} minutes in 'placed' status...");

        $cancelledCount = 0;

        Order::withoutGlobalScopes()
            ->where('status', 'placed')
            ->where('created_at', '<', now()->subMinutes($autoCancelMinutes))
            ->chunkById(100, function ($orders) use ($autoCancelMinutes, &$cancelledCount) {
                foreach ($orders as $order) {
                    // Atomic guard: skip if staff advanced/cancelled it since the query ran
                    $claimed = Order::withoutGlobalScopes()
                        ->where('id', $order->id)
                        ->where('status', 'placed')
                        ->update([
                            'status' => 'cancelled',
                            'notes' => trim(($order->notes ?? '') . "
[Auto-cancelled: No confirmation after {$autoCancelMinutes} minutes]"),
                        ]);

                    if (!$claimed) {
                        continue;
                    }

                    $order->refresh();
                    $order->releaseResources(restoreVoucher: true);

                    try {
                        broadcast(new OrderStatusUpdated($order));
                    } catch (\Exception $e) {
                        Log::warning("Failed to broadcast auto-cancel for order {$order->order_number}: " . $e->getMessage());
                    }

                    $cancelledCount++;
                    Log::info("Auto-cancelled order {$order->order_number} (Tenant: {$order->tenant_id})");
                }
            });

        Log::info("Auto-cancel complete. Cancelled {$cancelledCount} stale orders.");
    }
}
