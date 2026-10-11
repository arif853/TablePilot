<?php

namespace App\Http\Controllers\Api;

use App\Models\Order;
use App\Models\PosShift;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class PosShiftController extends BaseApiController
{
    public function current(): JsonResponse
    {
        $shift = PosShift::query()
            ->where('status', 'open')
            ->latest('opened_at')
            ->with(['opener:id,name', 'closer:id,name'])
            ->first();

        return $this->success($shift);
    }

    public function open(Request $request): JsonResponse
    {
        $data = $request->validate([
            'opening_cash' => 'required|numeric|min:0',
            'notes' => 'nullable|string|max:500',
        ]);

        $hasOpenShift = PosShift::query()->where('status', 'open')->exists();
        if ($hasOpenShift) {
            return $this->error('An open shift already exists', 422);
        }

        $shift = PosShift::create([
            'tenant_id' => Auth::user()->tenant_id,
            'opened_by' => Auth::id(),
            'opening_cash' => $data['opening_cash'],
            'expected_cash' => $data['opening_cash'],
            'opened_at' => now(),
            'status' => 'open',
            'notes' => $data['notes'] ?? null,
        ]);

        return $this->created($shift->load('opener:id,name'), 'Shift opened');
    }

    public function close(Request $request): JsonResponse
    {
        $data = $request->validate([
            'closing_cash' => 'required|numeric|min:0',
            'notes' => 'nullable|string|max:500',
        ]);

        $shift = PosShift::query()
            ->where('status', 'open')
            ->latest('opened_at')
            ->first();

        if (!$shift) {
            return $this->error('No open shift found', 422);
        }

        $paidPosOrders = fn () => Order::query()
            ->where('source', 'pos')
            ->where('payment_status', 'paid')
            ->whereBetween('created_at', [$shift->opened_at, now()]);

        $cashSales = (float) $paidPosOrders()->where('payment_method', 'cash')->sum('grand_total');

        // A split bill puts only some of its total in the drawer: the cash entries.
        $cashSales += $paidPosOrders()
            ->where('payment_method', 'split')
            ->pluck('split_payment_details')
            ->flatten(1)
            ->where('method', 'cash')
            ->sum('amount');

        $expectedCash = round((float) $shift->opening_cash + $cashSales, 2);
        $closingCash = round((float) $data['closing_cash'], 2);

        $shift->update([
            'expected_cash' => $expectedCash,
            'closing_cash' => $closingCash,
            'cash_variance' => round($closingCash - $expectedCash, 2),
            'closed_by' => Auth::id(),
            'closed_at' => now(),
            'status' => 'closed',
            'notes' => $data['notes'] ?? $shift->notes,
        ]);

        return $this->success($shift->fresh()->load(['opener:id,name', 'closer:id,name']), 'Shift closed');
    }

    public function index(Request $request): JsonResponse
    {
        $perPage = (int) $request->get('per_page', 20);

        $query = PosShift::query()->with(['opener:id,name', 'closer:id,name']);

        if ($status = $request->get('status')) {
            $query->where('status', $status);
        }

        return $this->paginated($query->latest('opened_at'), $perPage);
    }
}
