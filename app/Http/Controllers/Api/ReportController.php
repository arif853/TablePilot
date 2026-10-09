<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\BaseApiController;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Settlement;
use App\Models\Voucher;
use App\Services\FinancialReportService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReportController extends BaseApiController
{
    public function __construct(
        protected FinancialReportService $financialReports,
    ) {}

    /**
     * Financial statement: P&L-style summary, collections, tenders,
     * channels, daily ledger, item/category mix, staff and cash drawer.
     *
     * GET /api/reports/financial?from=2026-10-01&to=2026-10-31
     */
    public function financialStatement(Request $request): JsonResponse
    {
        $this->validateRange($request);

        return $this->success(
            $this->financialReports->statement(auth()->user()->tenant, $request->from, $request->to),
            'Financial statement'
        );
    }

    /**
     * CSV download of the financial report.
     *
     * GET /api/reports/financial/export?from=..&to=..&type=statement|transactions|items
     */
    public function financialExport(Request $request): StreamedResponse
    {
        $this->validateRange($request);
        $request->validate(['type' => 'nullable|in:statement,transactions,items']);

        $tenant = auth()->user()->tenant;
        $type = $request->get('type', 'statement');
        $filename = sprintf('%s-%s-%s-to-%s.csv', str($tenant->slug ?: $tenant->name)->slug(), $type, $request->from, $request->to);

        $writer = match ($type) {
            'transactions' => fn ($out) => $this->writeTransactionsCsv($out, $tenant, $request->from, $request->to),
            'items' => fn ($out) => $this->writeItemsCsv($out, $tenant, $request->from, $request->to),
            default => fn ($out) => $this->writeStatementCsv($out, $tenant, $request->from, $request->to),
        };

        return response()->streamDownload(function () use ($writer) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF"); // UTF-8 BOM so Excel shows names and currency symbols correctly
            $writer($out);
            fclose($out);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Cache-Control' => 'no-store',
        ]);
    }

    private function validateRange(Request $request): void
    {
        $request->validate([
            'from' => 'required|date_format:Y-m-d',
            'to' => 'required|date_format:Y-m-d|after_or_equal:from',
        ]);

        if (Carbon::parse($request->from)->diffInDays(Carbon::parse($request->to)) > 366) {
            throw ValidationException::withMessages(['to' => 'The date range cannot be longer than one year.']);
        }
    }

    private function writeStatementCsv($out, $tenant, string $from, string $to): void
    {
        $r = $this->financialReports->statement($tenant, $from, $to);
        $s = $r['summary'];
        $c = $r['collections'];
        $blank = fn () => fputcsv($out, []);

        fputcsv($out, ['Financial Statement']);
        fputcsv($out, ['Restaurant', $r['restaurant']['name']]);
        if ($r['restaurant']['vat_number']) {
            fputcsv($out, ['VAT Reg. (BIN)', $r['restaurant']['vat_number']]);
        }
        fputcsv($out, ['Period', "{$r['period']['from']} to {$r['period']['to']}"]);
        fputcsv($out, ['Currency', $r['restaurant']['currency']]);
        fputcsv($out, ['Generated at', $r['generated_at']]);
        $blank();

        fputcsv($out, ['INCOME STATEMENT', 'Amount', 'Previous period', 'Change %']);
        $line = fn (string $label, string $key) => fputcsv($out, [
            $label,
            $s[$key],
            $r['previous_summary'][$key],
            $r['changes'][$key] ?? '',
        ]);
        $line('Gross sales (menu prices)', 'gross_sales');
        $line('Less: discounts', 'discounts');
        $line('Less: VAT & SD included in prices', 'inclusive_tax');
        $line('Net sales (excl. VAT/SD)', 'net_sales');
        $line('Add: VAT collected', 'vat');
        $line('Add: SD collected', 'sd');
        $line('Total billed', 'total_billed');
        if ((float) $s['commission_rate'] > 0) {
            $line("Less: platform commission ({$s['commission_rate']}%)", 'commission');
        }
        $line('Net earnings', 'net_earnings');
        $line('Tax liability (VAT + SD)', 'tax_liability');
        $blank();

        fputcsv($out, ['KEY FIGURES', 'Value']);
        fputcsv($out, ['Completed orders', $s['completed_orders']]);
        fputcsv($out, ['Average order value', $s['avg_order_value']]);
        fputcsv($out, ['Discount rate %', $s['discount_rate']]);
        fputcsv($out, ['Cancelled orders', $s['cancelled_orders']]);
        fputcsv($out, ['Cancelled order value', $s['cancelled_amount']]);
        fputcsv($out, ['Cancellation rate %', $s['cancellation_rate']]);
        fputcsv($out, ['Open (unfinished) orders', $s['open_orders']]);
        fputcsv($out, ['Open order value', $s['open_amount']]);
        $blank();

        fputcsv($out, ['COLLECTIONS (completed orders)', 'Orders', 'Amount']);
        fputcsv($out, ['Paid', $c['paid']['orders'], $c['paid']['amount']]);
        fputcsv($out, ['Pending', $c['pending']['orders'], $c['pending']['amount']]);
        fputcsv($out, ['Failed', $c['failed']['orders'], $c['failed']['amount']]);
        fputcsv($out, ['Refunded', $c['refunded']['orders'], $c['refunded']['amount']]);
        fputcsv($out, ['Outstanding (pending + failed)', '', $c['outstanding']]);
        $blank();

        fputcsv($out, ['PAYMENTS RECEIVED BY METHOD', 'Orders', 'Amount', 'Share %']);
        foreach ($r['payment_methods'] as $m) {
            fputcsv($out, [$m['label'], $m['orders'], $m['amount'], $m['share']]);
        }
        $blank();

        foreach (['order_types' => 'SALES BY ORDER TYPE', 'sources' => 'SALES BY CHANNEL'] as $key => $title) {
            fputcsv($out, [$title, 'Orders', 'Net sales', 'VAT + SD', 'Total', 'Avg order', 'Share %']);
            foreach ($r[$key] as $row) {
                fputcsv($out, [$row['label'], $row['orders'], $row['net_sales'], $row['tax'], $row['total'], $row['avg_order_value'], $row['share']]);
            }
            $blank();
        }

        fputcsv($out, ['SALES BY CATEGORY', 'Qty', 'Item sales', 'Share %']);
        foreach ($r['categories'] as $row) {
            fputcsv($out, [$row['category'], $row['qty'], $row['revenue'], $row['share']]);
        }
        $blank();

        fputcsv($out, ['STAFF', 'Orders', 'Total billed', 'Discounts', 'Avg order']);
        foreach ($r['staff'] as $row) {
            fputcsv($out, [$row['name'], $row['orders'], $row['total'], $row['discounts'], $row['avg_order_value']]);
        }
        $blank();

        $d = $r['cash_drawer'];
        fputcsv($out, ['CASH DRAWER (POS shifts)', 'Value']);
        fputcsv($out, ['Shifts', $d['shifts']]);
        fputcsv($out, ['Opening float', $d['opening_cash']]);
        fputcsv($out, ['Expected cash (closed shifts)', $d['expected_cash']]);
        fputcsv($out, ['Counted cash (closed shifts)', $d['closing_cash']]);
        fputcsv($out, ['Variance (over / short)', $d['variance']]);
        $blank();

        fputcsv($out, ['DAILY LEDGER', 'Orders', 'Gross sales', 'Discounts', 'Net sales', 'VAT', 'SD', 'Total billed', 'Cancelled orders', 'Cancelled value']);
        foreach ($r['daily'] as $day) {
            fputcsv($out, [
                $day['date'], $day['orders'], $day['gross_sales'], $day['discounts'], $day['net_sales'],
                $day['vat'], $day['sd'], $day['total_billed'], $day['cancelled_orders'], $day['cancelled_amount'],
            ]);
        }
        fputcsv($out, [
            'TOTAL', $s['completed_orders'], $s['gross_sales'], $s['discounts'], $s['net_sales'],
            $s['vat'], $s['sd'], $s['total_billed'], $s['cancelled_orders'], $s['cancelled_amount'],
        ]);
    }

    /** Every order in the range (all statuses): the invoice ledger accountants reconcile against. */
    private function writeTransactionsCsv($out, $tenant, string $from, string $to): void
    {
        [$start, $end] = $this->financialReports->bounds($from, $to);

        fputcsv($out, [
            'Date', 'Time', 'Invoice No', 'Order No', 'Order type', 'Channel', 'Status',
            'Payment method', 'Payment split', 'Payment status', 'Customer', 'Phone', 'Table', 'Served by', 'Voucher',
            'Subtotal', 'Discount', 'Net amount', 'VAT %', 'VAT', 'SD %', 'SD', 'Grand total',
        ]);

        $this->financialReports->ordersQuery($tenant, $start, $end)
            ->with(['table:id,table_number', 'servedBy:id,name', 'voucher:id,code'])
            ->lazyById(500)
            ->each(function (Order $o) use ($out) {
                $split = collect($o->split_payment_details ?? [])
                    ->map(fn ($p) => ($p['method'] ?? '?') . ':' . number_format((float) ($p['amount'] ?? 0), 2, '.', ''))
                    ->implode(' | ');

                fputcsv($out, [
                    $o->created_at->toDateString(),
                    $o->created_at->format('H:i'),
                    $o->invoice_number,
                    $o->order_number,
                    FinancialReportService::ORDER_TYPE_LABELS[$o->type] ?? $o->type,
                    $o->source === 'pos' ? 'POS' : 'QR',
                    $o->status,
                    FinancialReportService::PAYMENT_METHOD_LABELS[$o->payment_method] ?? $o->payment_method,
                    $split,
                    $o->payment_status,
                    $o->customer_name,
                    $o->customer_phone,
                    $o->table?->table_number,
                    $o->servedBy?->name,
                    $o->voucher?->code,
                    $o->subtotal,
                    $o->discount,
                    $o->net_amount,
                    $o->vat_rate,
                    $o->vat_amount,
                    $o->sd_rate,
                    $o->sd_amount,
                    $o->grand_total,
                ]);
            });
    }

    private function writeItemsCsv($out, $tenant, string $from, string $to): void
    {
        [$start, $end] = $this->financialReports->bounds($from, $to);

        fputcsv($out, ['Item', 'Category', 'Qty sold', 'Orders', 'Avg price', 'Item sales']);
        foreach ($this->financialReports->topItems($tenant, $start, $end, null) as $row) {
            fputcsv($out, [$row['name'], $row['category'], $row['qty'], $row['orders'], $row['avg_price'], $row['revenue']]);
        }
    }

    public function salesReport(Request $request): JsonResponse
    {
        $request->validate([
            'from' => 'required|date',
            'to' => 'required|date|after_or_equal:from',
        ]);

        $from = $request->from;
        $to = $request->to;

        $orders = Order::completed()->dateRange($from, $to);

        $totalSales = (clone $orders)->sum('grand_total');
        $totalOrders = (clone $orders)->count();
        $totalTax = (clone $orders)->sum('vat_amount');
        $totalDiscount = (clone $orders)->sum('discount');
        $totalNetAmount = (clone $orders)->sum('net_amount');
        $avgOrderValue = $totalOrders > 0 ? round($totalSales / $totalOrders, 2) : 0;

        $dineInSales = (clone $orders)->dineIn()->sum('grand_total');
        $parcelSales = (clone $orders)->parcel()->sum('grand_total');

        $dailyBreakdown = Order::completed()
            ->dateRange($from, $to)
            ->select(
                DB::raw('DATE(created_at) as date'),
                DB::raw('COUNT(*) as orders'),
                DB::raw('SUM(grand_total) as revenue'),
                DB::raw('SUM(vat_amount) as vat'),
                DB::raw('SUM(net_amount) as net_amount'),
                DB::raw('SUM(discount) as discounts')
            )
            ->groupBy('date')
            ->orderBy('date')
            ->get();

        return $this->success([
            'period' => ['from' => $from, 'to' => $to],
            'summary' => [
                'total_sales' => $totalSales,
                'total_orders' => $totalOrders,
                'total_vat' => $totalTax,
                'total_net_amount' => $totalNetAmount,
                'total_discount' => $totalDiscount,
                'avg_order_value' => $avgOrderValue,
                'dine_in_sales' => $dineInSales,
                'parcel_sales' => $parcelSales,
            ],
            'daily_breakdown' => $dailyBreakdown,
        ]);
    }

    public function voucherReport(Request $request): JsonResponse
    {
        $request->validate([
            'from' => 'required|date',
            'to' => 'required|date|after_or_equal:from',
        ]);

        $voucherImpact = Order::completed()
            ->dateRange($request->from, $request->to)
            ->whereNotNull('voucher_id')
            ->select(
                'voucher_id',
                DB::raw('COUNT(*) as times_used'),
                DB::raw('SUM(discount) as total_discount'),
                DB::raw('SUM(grand_total) as total_revenue')
            )
            ->groupBy('voucher_id')
            ->with('voucher:id,code,type,discount_value')
            ->get();

        $totalDiscountGiven = $voucherImpact->sum('total_discount');
        $totalOrdersWithVoucher = $voucherImpact->sum('times_used');

        return $this->success([
            'total_discount_given' => $totalDiscountGiven,
            'total_orders_with_voucher' => $totalOrdersWithVoucher,
            'voucher_breakdown' => $voucherImpact,
        ]);
    }

    public function tablePerformance(Request $request): JsonResponse
    {
        $request->validate([
            'from' => 'required|date',
            'to' => 'required|date|after_or_equal:from',
        ]);

        $tableStats = Order::completed()
            ->dineIn()
            ->dateRange($request->from, $request->to)
            ->whereNotNull('table_id')
            ->select(
                'table_id',
                DB::raw('COUNT(*) as total_orders'),
                DB::raw('SUM(grand_total) as total_revenue'),
                DB::raw('AVG(grand_total) as avg_order_value')
            )
            ->groupBy('table_id')
            ->with('table:id,table_number')
            ->orderByDesc('total_revenue')
            ->get();

        return $this->success($tableStats);
    }

    public function trendReport(Request $request): JsonResponse
    {
        $request->validate([
            'period' => 'required|in:daily,weekly,monthly',
            'from' => 'required|date',
            'to' => 'required|date|after_or_equal:from',
        ]);

        $groupBy = match ($request->period) {
            'daily' => 'DATE(created_at)',
            'weekly' => 'YEARWEEK(created_at)',
            'monthly' => "DATE_FORMAT(created_at, '%Y-%m')",
        };

        $trends = Order::completed()
            ->dateRange($request->from, $request->to)
            ->select(
                DB::raw("{$groupBy} as period"),
                DB::raw('COUNT(*) as orders'),
                DB::raw('SUM(grand_total) as revenue'),
                DB::raw('AVG(grand_total) as avg_order_value')
            )
            ->groupBy('period')
            ->orderBy('period')
            ->get();

        return $this->success($trends);
    }

    public function topSellingItems(Request $request): JsonResponse
    {
        $request->validate([
            'from' => 'required|date',
            'to' => 'required|date|after_or_equal:from',
            'limit' => 'nullable|integer|min:1|max:50',
        ]);

        $tenantId = auth()->user()->tenant_id;
        $limit = $request->get('limit', 10);

        $topItems = OrderItem::join('orders', 'order_items.order_id', '=', 'orders.id')
            ->where('orders.tenant_id', $tenantId)
            ->where('orders.status', 'completed')
            ->whereBetween('orders.created_at', $this->financialReports->bounds($request->from, $request->to))
            ->select(
                'order_items.menu_item_id',
                DB::raw('SUM(order_items.qty) as total_qty'),
                DB::raw('SUM(order_items.line_total) as total_revenue')
            )
            ->groupBy('order_items.menu_item_id')
            ->with('menuItem:id,name,price')
            ->orderByDesc('total_qty')
            ->limit($limit)
            ->get();

        return $this->success($topItems);
    }

    public function revenueComparison(Request $request): JsonResponse
    {
        $tenantId = auth()->user()->tenant_id;
        $currentYear = now()->year;
        $lastYear = $currentYear - 1;

        $monthlyRevenue = function ($year) use ($tenantId) {
            return Order::withoutGlobalScopes()
                ->where('tenant_id', $tenantId)
                ->where('status', 'completed')
                ->whereYear('created_at', $year)
                ->select(
                    DB::raw('MONTH(created_at) as month'),
                    DB::raw('SUM(grand_total) as revenue'),
                    DB::raw('COUNT(*) as orders')
                )
                ->groupBy('month')
                ->orderBy('month')
                ->get()
                ->keyBy('month');
        };

        return $this->success([
            'current_year' => [
                'year' => $currentYear,
                'months' => $monthlyRevenue($currentYear),
            ],
            'last_year' => [
                'year' => $lastYear,
                'months' => $monthlyRevenue($lastYear),
            ],
        ]);
    }

    public function settlementReport(Request $request): JsonResponse
    {
        $tenantId = auth()->user()->tenant_id;

        $settlements = Settlement::where('tenant_id', $tenantId)
            ->with('payments')
            ->latest()
            ->get();

        $totalSold = $settlements->sum('total_sold');
        $totalCommission = $settlements->sum('commission_amount');
        $totalPaid = $settlements->sum('total_paid');
        $totalPayable = $settlements->sum('payable_balance');

        return $this->success([
            'summary' => [
                'total_sold' => $totalSold,
                'total_commission' => $totalCommission,
                'total_paid' => $totalPaid,
                'total_payable' => $totalPayable,
            ],
            'settlements' => $settlements,
        ]);
    }
}
