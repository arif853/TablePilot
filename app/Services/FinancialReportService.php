<?php

namespace App\Services;

use App\Models\Order;
use App\Models\PosShift;
use App\Models\Tenant;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Support\Facades\DB;

/**
 * Restaurant financial statement for a date range.
 *
 * Revenue is recognised on completed orders only, using the amounts stored
 * on each order (VAT/SD are never recalculated). Cancelled orders are
 * reported separately as lost sales.
 *
 *   Gross sales (menu prices)            SUM(subtotal)
 * − Discounts                            SUM(discount)
 * − VAT & SD included in prices          gross − discount − net (0 when VAT-exclusive)
 * = Net sales (excl. VAT/SD)             SUM(net_amount)
 * + VAT collected + SD collected
 * = Total billed                         SUM(grand_total)
 */
class FinancialReportService
{
    public const PAYMENT_METHOD_LABELS = [
        'cash' => 'Cash',
        'card' => 'Card',
        'mobile_banking' => 'Mobile Banking',
        'bkash' => 'bKash',
        'nagad' => 'Nagad',
        'rocket' => 'Rocket',
        'online' => 'Online',
        'split' => 'Split',
    ];

    public const ORDER_TYPE_LABELS = [
        'dine' => 'Dine-in',
        'parcel' => 'Takeaway',
        'quick' => 'Quick Sale',
        'delivery' => 'Delivery',
    ];

    public function statement(Tenant $tenant, string $from, string $to): array
    {
        [$start, $end] = $this->bounds($from, $to);

        $days = $start->diffInDays($end->copy()->startOfDay()) + 1;
        $prevEnd = $start->copy()->subDay()->endOfDay();
        $prevStart = $prevEnd->copy()->subDays($days - 1)->startOfDay();

        $summary = $this->summary($tenant, $start, $end);
        $previous = $this->summary($tenant, $prevStart, $prevEnd);

        return [
            'restaurant' => [
                'name' => $tenant->name,
                'address' => $tenant->address,
                'phone' => $tenant->phone,
                'email' => $tenant->email,
                'vat_number' => $tenant->vat_number,
                'currency' => $tenant->currency ?: 'BDT',
            ],
            'period' => [
                'from' => $start->toDateString(),
                'to' => $end->toDateString(),
                'days' => $days,
            ],
            'previous_period' => [
                'from' => $prevStart->toDateString(),
                'to' => $prevEnd->toDateString(),
            ],
            'generated_at' => now()->toDateTimeString(),
            'summary' => $summary,
            'previous_summary' => $previous,
            'changes' => $this->changes($summary, $previous),
            'collections' => $this->collections($tenant, $start, $end),
            'payment_methods' => $this->paymentMethods($tenant, $start, $end),
            'order_types' => $this->orderTypes($tenant, $start, $end),
            'sources' => $this->sources($tenant, $start, $end),
            'daily' => $this->daily($tenant, $start, $end),
            'categories' => $this->categories($tenant, $start, $end),
            'top_items' => $this->topItems($tenant, $start, $end),
            'staff' => $this->staff($tenant, $start, $end),
            'cash_drawer' => $this->cashDrawer($tenant, $start, $end),
        ];
    }

    /**
     * Inclusive day bounds for a Y-m-d range.
     *
     * @return array{0: Carbon, 1: Carbon}
     */
    public function bounds(string $from, string $to): array
    {
        return [Carbon::parse($from)->startOfDay(), Carbon::parse($to)->endOfDay()];
    }

    public function ordersQuery(Tenant $tenant, Carbon $start, Carbon $end)
    {
        return Order::withoutGlobalScopes()
            ->where('orders.tenant_id', $tenant->id)
            ->whereBetween('orders.created_at', [$start, $end]);
    }

    private function summary(Tenant $tenant, Carbon $start, Carbon $end): array
    {
        $completed = $this->ordersQuery($tenant, $start, $end)
            ->where('status', 'completed')
            ->selectRaw('COUNT(*) as orders')
            ->selectRaw('COALESCE(SUM(subtotal), 0) as gross_sales')
            ->selectRaw('COALESCE(SUM(discount), 0) as discounts')
            ->selectRaw('COALESCE(SUM(net_amount), 0) as net_sales')
            ->selectRaw('COALESCE(SUM(vat_amount), 0) as vat')
            ->selectRaw('COALESCE(SUM(sd_amount), 0) as sd')
            ->selectRaw('COALESCE(SUM(grand_total), 0) as total_billed')
            ->first();

        $cancelled = $this->ordersQuery($tenant, $start, $end)
            ->where('status', 'cancelled')
            ->selectRaw('COUNT(*) as orders, COALESCE(SUM(grand_total), 0) as amount')
            ->first();

        $open = $this->ordersQuery($tenant, $start, $end)
            ->whereNotIn('status', ['completed', 'cancelled'])
            ->selectRaw('COUNT(*) as orders, COALESCE(SUM(grand_total), 0) as amount')
            ->first();

        $orders = (int) $completed->orders;
        $gross = (float) $completed->gross_sales;
        $discounts = (float) $completed->discounts;
        $netSales = (float) $completed->net_sales;
        $vat = (float) $completed->vat;
        $sd = (float) $completed->sd;
        $totalBilled = (float) $completed->total_billed;

        $commissionRate = $tenant->isPlatformCollection() ? (float) $tenant->commission_rate : 0.0;
        $commission = round($totalBilled * $commissionRate / 100, 2);

        $allOrders = $orders + (int) $cancelled->orders + (int) $open->orders;

        return [
            'completed_orders' => $orders,
            'cancelled_orders' => (int) $cancelled->orders,
            'open_orders' => (int) $open->orders,
            'gross_sales' => $this->money($gross),
            'discounts' => $this->money($discounts),
            'inclusive_tax' => $this->money(max(0, $gross - $discounts - $netSales)),
            'net_sales' => $this->money($netSales),
            'vat' => $this->money($vat),
            'sd' => $this->money($sd),
            'tax_liability' => $this->money($vat + $sd),
            'total_billed' => $this->money($totalBilled),
            'commission_rate' => $commissionRate,
            'commission' => $this->money($commission),
            'net_earnings' => $this->money($netSales - $commission),
            'avg_order_value' => $this->money($orders > 0 ? $totalBilled / $orders : 0),
            'discount_rate' => $gross > 0 ? round($discounts / $gross * 100, 2) : 0,
            'cancelled_amount' => $this->money((float) $cancelled->amount),
            'cancellation_rate' => $allOrders > 0 ? round((int) $cancelled->orders / $allOrders * 100, 2) : 0,
            'open_amount' => $this->money((float) $open->amount),
        ];
    }

    /** Percentage change of headline metrics against the previous period. */
    private function changes(array $current, array $previous): array
    {
        $keys = [
            'gross_sales', 'discounts', 'inclusive_tax', 'net_sales', 'vat', 'sd', 'total_billed',
            'commission', 'net_earnings', 'tax_liability', 'completed_orders', 'avg_order_value',
        ];

        $changes = [];
        foreach ($keys as $key) {
            $prev = (float) $previous[$key];
            $cur = (float) $current[$key];
            $changes[$key] = $prev == 0.0 ? null : round(($cur - $prev) / abs($prev) * 100, 1);
        }

        return $changes;
    }

    /** Completed orders by payment status: what was actually collected vs still owed. */
    private function collections(Tenant $tenant, Carbon $start, Carbon $end): array
    {
        $rows = $this->ordersQuery($tenant, $start, $end)
            ->where('status', 'completed')
            ->select('payment_status')
            ->selectRaw('COUNT(*) as orders, COALESCE(SUM(grand_total), 0) as amount')
            ->groupBy('payment_status')
            ->get()
            ->keyBy('payment_status');

        $get = fn (string $status) => [
            'orders' => (int) ($rows[$status]->orders ?? 0),
            'amount' => $this->money((float) ($rows[$status]->amount ?? 0)),
        ];

        $paid = $get('paid');
        $refunded = $get('refunded');
        $pending = $get('pending');
        $failed = $get('failed');

        return [
            'paid' => $paid,
            'pending' => $pending,
            'failed' => $failed,
            'refunded' => $refunded,
            'outstanding' => $this->money((float) $pending['amount'] + (float) $failed['amount']),
        ];
    }

    /**
     * Money received per tender on paid, completed orders. Split payments are
     * broken out into their component methods.
     */
    private function paymentMethods(Tenant $tenant, Carbon $start, Carbon $end): array
    {
        $base = fn () => $this->ordersQuery($tenant, $start, $end)
            ->where('status', 'completed')
            ->where('payment_status', 'paid');

        $totals = [];
        $add = function (string $method, float $amount, int $orders) use (&$totals) {
            $totals[$method] ??= ['orders' => 0, 'amount' => 0.0];
            $totals[$method]['orders'] += $orders;
            $totals[$method]['amount'] += $amount;
        };

        $base()->where('payment_method', '!=', 'split')
            ->select('payment_method')
            ->selectRaw('COUNT(*) as orders, COALESCE(SUM(grand_total), 0) as amount')
            ->groupBy('payment_method')
            ->get()
            ->each(fn ($row) => $add($row->payment_method ?? 'cash', (float) $row->amount, (int) $row->orders));

        $base()->where('payment_method', 'split')
            ->select(['id', 'grand_total', 'split_payment_details'])
            ->lazyById(500)
            ->each(function (Order $order) use ($add) {
                $parts = collect($order->split_payment_details ?? []);
                if ($parts->isEmpty()) {
                    $add('split', (float) $order->grand_total, 1);

                    return;
                }
                foreach ($parts->groupBy('method') as $method => $entries) {
                    $add((string) $method, (float) $entries->sum('amount'), 1);
                }
            });

        $grand = array_sum(array_column($totals, 'amount'));

        return collect($totals)
            ->map(fn ($row, $method) => [
                'method' => $method,
                'label' => self::PAYMENT_METHOD_LABELS[$method] ?? ucfirst(str_replace('_', ' ', $method)),
                'orders' => $row['orders'],
                'amount' => $this->money($row['amount']),
                'share' => $grand > 0 ? round($row['amount'] / $grand * 100, 1) : 0,
            ])
            ->sortByDesc(fn ($row) => (float) $row['amount'])
            ->values()
            ->all();
    }

    private function orderTypes(Tenant $tenant, Carbon $start, Carbon $end): array
    {
        return $this->groupedTotals($tenant, $start, $end, 'type', self::ORDER_TYPE_LABELS);
    }

    private function sources(Tenant $tenant, Carbon $start, Carbon $end): array
    {
        return $this->groupedTotals($tenant, $start, $end, 'source', [
            'customer' => 'QR Self-order',
            'pos' => 'POS / Staff',
        ]);
    }

    private function groupedTotals(Tenant $tenant, Carbon $start, Carbon $end, string $column, array $labels): array
    {
        $rows = $this->ordersQuery($tenant, $start, $end)
            ->where('status', 'completed')
            ->select($column)
            ->selectRaw('COUNT(*) as orders')
            ->selectRaw('COALESCE(SUM(net_amount), 0) as net_sales')
            ->selectRaw('COALESCE(SUM(vat_amount + sd_amount), 0) as tax')
            ->selectRaw('COALESCE(SUM(grand_total), 0) as total')
            ->groupBy($column)
            ->get();

        $grand = (float) $rows->sum('total');

        return $rows
            ->map(fn ($row) => [
                'key' => $row->{$column},
                'label' => $labels[$row->{$column}] ?? ucfirst((string) $row->{$column}),
                'orders' => (int) $row->orders,
                'net_sales' => $this->money((float) $row->net_sales),
                'tax' => $this->money((float) $row->tax),
                'total' => $this->money((float) $row->total),
                'avg_order_value' => $this->money($row->orders > 0 ? $row->total / $row->orders : 0),
                'share' => $grand > 0 ? round($row->total / $grand * 100, 1) : 0,
            ])
            ->sortByDesc(fn ($row) => (float) $row['total'])
            ->values()
            ->all();
    }

    /** One row per calendar day in the range, including days with no sales. */
    private function daily(Tenant $tenant, Carbon $start, Carbon $end): array
    {
        $completed = $this->ordersQuery($tenant, $start, $end)
            ->where('status', 'completed')
            ->selectRaw('DATE(created_at) as date')
            ->selectRaw('COUNT(*) as orders')
            ->selectRaw('COALESCE(SUM(subtotal), 0) as gross_sales')
            ->selectRaw('COALESCE(SUM(discount), 0) as discounts')
            ->selectRaw('COALESCE(SUM(net_amount), 0) as net_sales')
            ->selectRaw('COALESCE(SUM(vat_amount), 0) as vat')
            ->selectRaw('COALESCE(SUM(sd_amount), 0) as sd')
            ->selectRaw('COALESCE(SUM(grand_total), 0) as total_billed')
            ->groupBy('date')
            ->get()
            ->keyBy('date');

        $cancelled = $this->ordersQuery($tenant, $start, $end)
            ->where('status', 'cancelled')
            ->selectRaw('DATE(created_at) as date, COUNT(*) as orders, COALESCE(SUM(grand_total), 0) as amount')
            ->groupBy('date')
            ->get()
            ->keyBy('date');

        $days = [];
        foreach (CarbonPeriod::create($start->copy()->startOfDay(), $end->copy()->startOfDay()) as $day) {
            $date = $day->toDateString();
            $row = $completed[$date] ?? null;
            $cancel = $cancelled[$date] ?? null;

            $days[] = [
                'date' => $date,
                'orders' => (int) ($row->orders ?? 0),
                'gross_sales' => $this->money((float) ($row->gross_sales ?? 0)),
                'discounts' => $this->money((float) ($row->discounts ?? 0)),
                'net_sales' => $this->money((float) ($row->net_sales ?? 0)),
                'vat' => $this->money((float) ($row->vat ?? 0)),
                'sd' => $this->money((float) ($row->sd ?? 0)),
                'total_billed' => $this->money((float) ($row->total_billed ?? 0)),
                'cancelled_orders' => (int) ($cancel->orders ?? 0),
                'cancelled_amount' => $this->money((float) ($cancel->amount ?? 0)),
            ];
        }

        return $days;
    }

    /** Item-level sales (menu price × qty, before order-level discounts). */
    private function itemSalesQuery(Tenant $tenant, Carbon $start, Carbon $end)
    {
        return DB::table('order_items')
            ->join('orders', 'order_items.order_id', '=', 'orders.id')
            ->leftJoin('menu_items', 'order_items.menu_item_id', '=', 'menu_items.id')
            ->leftJoin('categories', 'menu_items.category_id', '=', 'categories.id')
            ->where('orders.tenant_id', $tenant->id)
            ->where('orders.status', 'completed')
            ->whereBetween('orders.created_at', [$start, $end]);
    }

    private function categories(Tenant $tenant, Carbon $start, Carbon $end): array
    {
        $rows = $this->itemSalesQuery($tenant, $start, $end)
            ->select('categories.id as category_id', 'categories.name as category')
            ->selectRaw('COALESCE(SUM(order_items.qty), 0) as qty')
            ->selectRaw('COALESCE(SUM(order_items.line_total), 0) as revenue')
            ->groupBy('categories.id', 'categories.name')
            ->orderByDesc('revenue')
            ->get();

        $grand = (float) $rows->sum('revenue');

        return $rows->map(fn ($row) => [
            'category' => $row->category ?? 'Uncategorised',
            'qty' => (int) $row->qty,
            'revenue' => $this->money((float) $row->revenue),
            'share' => $grand > 0 ? round($row->revenue / $grand * 100, 1) : 0,
        ])->all();
    }

    public function topItems(Tenant $tenant, Carbon $start, Carbon $end, ?int $limit = 15): array
    {
        $rows = $this->itemSalesQuery($tenant, $start, $end)
            ->select('order_items.menu_item_id', 'menu_items.name', 'categories.name as category')
            ->selectRaw('COALESCE(SUM(order_items.qty), 0) as qty')
            ->selectRaw('COALESCE(SUM(order_items.line_total), 0) as revenue')
            ->selectRaw('COUNT(DISTINCT orders.id) as orders')
            ->groupBy('order_items.menu_item_id', 'menu_items.name', 'categories.name')
            ->orderByDesc('revenue')
            ->when($limit, fn ($q) => $q->limit($limit))
            ->get();

        return $rows->map(fn ($row) => [
            'menu_item_id' => $row->menu_item_id,
            'name' => $row->name ?? 'Deleted item',
            'category' => $row->category ?? 'Uncategorised',
            'qty' => (int) $row->qty,
            'orders' => (int) $row->orders,
            'revenue' => $this->money((float) $row->revenue),
            'avg_price' => $this->money($row->qty > 0 ? $row->revenue / $row->qty : 0),
        ])->all();
    }

    private function staff(Tenant $tenant, Carbon $start, Carbon $end): array
    {
        return $this->ordersQuery($tenant, $start, $end)
            ->where('orders.status', 'completed')
            ->leftJoin('users', 'orders.served_by', '=', 'users.id')
            ->select('orders.served_by', 'users.name')
            ->selectRaw('COUNT(*) as orders')
            ->selectRaw('COALESCE(SUM(orders.grand_total), 0) as total')
            ->selectRaw('COALESCE(SUM(orders.discount), 0) as discounts')
            ->groupBy('orders.served_by', 'users.name')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($row) => [
                'user_id' => $row->served_by,
                'name' => $row->served_by ? ($row->name ?? 'Removed user') : 'Self-order (QR)',
                'orders' => (int) $row->orders,
                'total' => $this->money((float) $row->total),
                'discounts' => $this->money((float) $row->discounts),
                'avg_order_value' => $this->money($row->orders > 0 ? $row->total / $row->orders : 0),
            ])
            ->all();
    }

    /** POS shifts opened in the period, with cash counted vs expected. */
    private function cashDrawer(Tenant $tenant, Carbon $start, Carbon $end): array
    {
        $shifts = PosShift::withoutGlobalScopes()
            ->where('tenant_id', $tenant->id)
            ->whereBetween('opened_at', [$start, $end])
            ->with(['opener:id,name', 'closer:id,name'])
            ->orderBy('opened_at')
            ->get();

        $closed = $shifts->where('status', 'closed');

        return [
            'shifts' => $shifts->count(),
            'open_shifts' => $shifts->where('status', '!=', 'closed')->count(),
            'opening_cash' => $this->money((float) $shifts->sum('opening_cash')),
            'expected_cash' => $this->money((float) $closed->sum('expected_cash')),
            'closing_cash' => $this->money((float) $closed->sum('closing_cash')),
            'variance' => $this->money((float) $closed->sum('cash_variance')),
            'list' => $shifts->map(fn (PosShift $shift) => [
                'id' => $shift->id,
                'opened_at' => $shift->opened_at?->toDateTimeString(),
                'closed_at' => $shift->closed_at?->toDateTimeString(),
                'opened_by' => $shift->opener?->name,
                'closed_by' => $shift->closer?->name,
                'status' => $shift->status,
                'opening_cash' => $this->money((float) $shift->opening_cash),
                'expected_cash' => $shift->status === 'closed' ? $this->money((float) $shift->expected_cash) : null,
                'closing_cash' => $shift->closing_cash !== null ? $this->money((float) $shift->closing_cash) : null,
                'variance' => $shift->cash_variance !== null ? $this->money((float) $shift->cash_variance) : null,
            ])->values()->all(),
        ];
    }

    private function money(float $value): string
    {
        return number_format(round($value, 2), 2, '.', '');
    }
}
