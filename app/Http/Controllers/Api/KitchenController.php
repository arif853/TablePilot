<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\BaseApiController;
use App\Models\Order;
use App\Models\Tenant;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class KitchenController extends BaseApiController
{
    /**
     * Minutes a ticket may run before it counts as delayed, until the restaurant sets its own.
     */
    public const DEFAULT_TARGET_MINUTES = 20;
    public const MIN_TARGET_MINUTES = 5;
    public const MAX_TARGET_MINUTES = 120;

    // Items carry their category so the screen can split tickets into stations
    private const TICKET_RELATIONS = ['items.menuItem.category:id,name,sort_order', 'table:id,table_number,area'];

    /**
     * Get active orders for kitchen display, oldest first within each status
     */
    public function activeOrders(Request $request): JsonResponse
    {
        $orders = Order::with(self::TICKET_RELATIONS)
            ->whereIn('status', ['confirmed', 'preparing', 'ready'])
            ->orderByRaw("CASE status WHEN 'preparing' THEN 1 WHEN 'confirmed' THEN 2 ELSE 3 END")
            ->oldest()
            ->get();

        return $this->success($orders);
    }

    /**
     * Get orders by status
     */
    public function ordersByStatus(string $status, Request $request): JsonResponse
    {
        $validStatuses = ['confirmed', 'preparing', 'ready', 'served'];

        if (!in_array($status, $validStatuses)) {
            return $this->error('Invalid status', 422);
        }

        $orders = Order::with(self::TICKET_RELATIONS)
            ->where('status', $status)
            ->latest()
            ->get();

        return $this->success($orders);
    }

    /**
     * Quick advance order to next status
     */
    public function advanceOrder(int $id): JsonResponse
    {
        $order = Order::find($id);

        if (!$order) {
            return $this->notFound('Order not found');
        }

        if (!$order->canAdvanceStatus()) {
            return $this->error('Order cannot be advanced further', 422);
        }

        $order->advanceStatus();

        try {
            broadcast(new \App\Events\OrderStatusUpdated($order->fresh()))->toOthers();
        } catch (\Throwable $e) {
            report($e);
        }

        return $this->success($order->fresh()->load(self::TICKET_RELATIONS), 'Order advanced');
    }

    /**
     * Kitchen dashboard stats
     */
    public function stats(): JsonResponse
    {
        $today = now()->startOfDay();
        $target = $this->targetMinutes();

        // Ticket time (placed -> ready) for everything the kitchen finished today
        $prepMinutes = Order::whereNotNull('ready_at')
            ->where('ready_at', '>=', $today)
            ->get(['created_at', 'ready_at'])
            ->map(fn (Order $order) => $order->created_at->diffInSeconds($order->ready_at) / 60);

        return $this->success([
            'pending' => Order::where('status', 'placed')->count(),
            'confirmed' => Order::where('status', 'confirmed')->count(),
            'preparing' => Order::where('status', 'preparing')->count(),
            'ready' => Order::where('status', 'ready')->count(),
            'completed_today' => Order::where('status', 'completed')
                ->where('created_at', '>=', $today)
                ->count(),
            'total_today' => Order::where('created_at', '>=', $today)->count(),
            'target_minutes' => $target,
            'ready_today' => $prepMinutes->count(),
            'avg_prep_minutes' => $prepMinutes->isEmpty() ? null : round($prepMinutes->avg(), 1),
            'on_time_rate' => $prepMinutes->isEmpty()
                ? null
                : (int) round($prepMinutes->filter(fn ($m) => $m <= $target)->count() / $prepMinutes->count() * 100),
            'delayed' => Order::whereIn('status', ['confirmed', 'preparing'])
                ->where('created_at', '<', now()->subMinutes($target))
                ->count(),
        ]);
    }

    /**
     * Kitchen preferences for the settings page
     */
    public function settings(): JsonResponse
    {
        return $this->success(['target_minutes' => $this->targetMinutes()]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'target_minutes' => 'required|integer|min:' . self::MIN_TARGET_MINUTES . '|max:' . self::MAX_TARGET_MINUTES,
        ]);

        $tenant = Tenant::find(auth()->user()->tenant_id);

        if (!$tenant) {
            return $this->notFound('Tenant not found');
        }

        $original = $tenant->toArray();
        $tenant->update(['kitchen_target_minutes' => $validated['target_minutes']]);

        AuditLogger::logUpdated($tenant, $original);

        return $this->success(['target_minutes' => $tenant->kitchen_target_minutes], 'Kitchen settings saved');
    }

    private function targetMinutes(): int
    {
        return Tenant::whereKey(auth()->user()->tenant_id)->value('kitchen_target_minutes')
            ?? self::DEFAULT_TARGET_MINUTES;
    }
}
