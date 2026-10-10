<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\BaseApiController;
use App\Models\Order;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class KitchenController extends BaseApiController
{
    /**
     * Get active orders for kitchen display
     */
    public function activeOrders(Request $request): JsonResponse
    {
        $orders = Order::with(['items.menuItem', 'table'])
            ->whereIn('status', ['confirmed', 'preparing', 'ready'])
            ->orderByRaw("FIELD(status, 'confirmed', 'preparing', 'ready')")
            ->latest()
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

        $orders = Order::with(['items.menuItem', 'table'])
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

        return $this->success($order->fresh()->load(['items.menuItem', 'table']), 'Order advanced');
    }

    /**
     * Kitchen dashboard stats
     */
    public function stats(): JsonResponse
    {
        $today = now()->startOfDay();

        return $this->success([
            'pending' => Order::where('status', 'placed')->count(),
            'confirmed' => Order::where('status', 'confirmed')->count(),
            'preparing' => Order::where('status', 'preparing')->count(),
            'ready' => Order::where('status', 'ready')->count(),
            'completed_today' => Order::where('status', 'completed')
                ->where('created_at', '>=', $today)
                ->count(),
            'total_today' => Order::where('created_at', '>=', $today)->count(),
        ]);
    }
}
