<?php

namespace App\Http\Controllers;

use App\Models\Settlement;
use App\Models\SettlementPayment;
use App\Services\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdminSettlementController extends Controller
{
    /**
     * List all settlements (super admin)
     */
    public function index(Request $request)
    {
        $query = Settlement::withoutGlobalScopes()
            ->with(['tenant', 'payments'])
            ->orderBy('created_at', 'desc');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('tenant_id')) {
            $query->where('tenant_id', $request->tenant_id);
        }

        if ($request->filled('from_date')) {
            $query->whereDate('period_start', '>=', $request->from_date);
        }

        if ($request->filled('to_date')) {
            $query->whereDate('period_end', '<=', $request->to_date);
        }

        $settlements = $query->paginate($request->get('per_page', 20));

        // Transform to match frontend expectations
        $settlements->getCollection()->transform(function ($s) {
            return [
                'id' => $s->id,
                'tenant_id' => $s->tenant_id,
                'tenant' => $s->tenant,
                'period_start' => $s->period_start?->format('Y-m-d'),
                'period_end' => $s->period_end?->format('Y-m-d'),
                'settlement_date' => $s->period_end?->format('Y-m-d'),
                'gross_revenue' => (float) $s->total_sold,
                'commission_rate' => (float) $s->commission_rate,
                'commission_amount' => (float) $s->commission_amount,
                'vat_amount' => 0,
                'net_payout' => (float) ($s->total_sold - $s->commission_amount),
                'amount_paid' => (float) $s->total_paid,
                'status' => $s->status === 'settled' ? 'paid' : $s->status,
                'payments' => $s->payments,
                'created_at' => $s->created_at,
            ];
        });

        return response()->json($settlements);
    }

    /**
     * Get single settlement
     */
    public function show(Settlement $settlement)
    {
        $settlement->load(['tenant', 'payments']);

        $data = [
            'id' => $settlement->id,
            'tenant_id' => $settlement->tenant_id,
            'tenant' => $settlement->tenant,
            'period_start' => $settlement->period_start?->format('Y-m-d'),
            'period_end' => $settlement->period_end?->format('Y-m-d'),
            'settlement_date' => $settlement->period_end?->format('Y-m-d'),
            'gross_revenue' => (float) $settlement->total_sold,
            'commission_rate' => (float) $settlement->commission_rate,
            'commission_amount' => (float) $settlement->commission_amount,
            'vat_amount' => 0,
            'net_payout' => (float) ($settlement->total_sold - $settlement->commission_amount),
            'amount_paid' => (float) $settlement->total_paid,
            'status' => $settlement->status === 'settled' ? 'paid' : $settlement->status,
            'payments' => $settlement->payments->map(fn($p) => [
                'id' => $p->id,
                'amount' => (float) $p->amount,
                'method' => $p->payment_method,
                'date' => $p->paid_at?->format('Y-m-d'),
            ]),
        ];

        return response()->json(['data' => $data]);
    }

    /**
     * Get settlement statistics
     */
    public function stats(Request $request)
    {
        // Total revenue (all time)
        $totalRevenue = Settlement::withoutGlobalScopes()->sum('total_sold');

        // Total commission earned
        $totalCommission = Settlement::withoutGlobalScopes()->sum('commission_amount');

        // Pending payouts
        $pendingPayouts = Settlement::withoutGlobalScopes()
            ->whereIn('status', ['pending', 'partial'])
            ->sum('payable_balance');

        // Completed payouts
        $completedPayouts = Settlement::withoutGlobalScopes()
            ->where('status', 'settled')
            ->selectRaw('SUM(total_sold - commission_amount) as total')
            ->value('total') ?? 0;

        // Commission by tenant this month
        $commissionByTenant = Settlement::withoutGlobalScopes()
            ->with('tenant:id,name')
            ->whereNotNull('period_start')
            ->whereMonth('period_start', now()->month)
            ->whereYear('period_start', now()->year)
            ->select('tenant_id', DB::raw('SUM(commission_amount) as commission'))
            ->groupBy('tenant_id')
            ->orderByDesc('commission')
            ->limit(10)
            ->get()
            ->map(function ($item) {
                return [
                    'name' => $item->tenant->name ?? 'Unknown',
                    'commission' => (float) $item->commission,
                ];
            });

        return response()->json([
            'data' => [
                'total_revenue' => (float) $totalRevenue,
                'total_commission' => (float) $totalCommission,
                'pending_payouts' => (float) $pendingPayouts,
                'completed_payouts' => (float) $completedPayouts,
                'commission_by_tenant' => $commissionByTenant,
            ]
        ]);
    }

    /**
     * Record a payment for settlement
     */
    public function recordPayment(Request $request, Settlement $settlement)
    {
        $request->validate([
            'amount' => 'required|numeric|min:0.01',
            'method' => 'required|string|in:bank_transfer,cash,mobile_banking,check',
            'note' => 'nullable|string|max:500',
        ]);

        $balanceDue = $settlement->payable_balance;

        if ($request->amount > $balanceDue) {
            return response()->json([
                'message' => 'Payment amount exceeds balance due'
            ], 422);
        }

        DB::transaction(function () use ($request, $settlement) {
            // Record payment
            SettlementPayment::create([
                'settlement_id' => $settlement->id,
                'amount' => $request->amount,
                'payment_method' => $request->method,
                'notes' => $request->note,
                'paid_at' => now(),
            ]);

            // Recalculate settlement
            $settlement->recalculate();

            AuditLogger::logAction('settlement_payment_recorded', $settlement, null, [
                'amount' => $request->amount,
                'method' => $request->method,
                'new_status' => $settlement->status,
            ]);
        });

        return response()->json([
            'message' => 'Payment recorded successfully',
            'data' => $settlement->fresh(['tenant', 'payments'])
        ]);
    }

    /**
     * Export settlements
     */
    public function export(Request $request)
    {
        $query = Settlement::withoutGlobalScopes()
            ->with('tenant')
            ->orderBy('period_end', 'desc');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('from_date')) {
            $query->whereDate('period_start', '>=', $request->from_date);
        }

        if ($request->filled('to_date')) {
            $query->whereDate('period_end', '<=', $request->to_date);
        }

        $settlements = $query->get();

        $csv = "ID,Tenant,Period Start,Period End,Total Sold,Commission Rate,Commission Amount,Total Paid,Payable Balance,Status\n";

        foreach ($settlements as $s) {
            $tenantName = str_replace(',', ' ', $s->tenant->name ?? 'Unknown');
            $csv .= "{$s->id},{$tenantName},{$s->period_start},{$s->period_end},{$s->total_sold},{$s->commission_rate},{$s->commission_amount},{$s->total_paid},{$s->payable_balance},{$s->status}\n";        }

        return response($csv, 200, [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => 'attachment; filename="settlements-export.csv"',
        ]);
    }
}
