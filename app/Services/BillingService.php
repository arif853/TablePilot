<?php

namespace App\Services;

use App\Models\MenuItem;
use App\Models\Order;
use App\Models\RestaurantTable;
use App\Models\Tenant;
use App\Models\Voucher;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class BillingService
{
    public function __construct(
        protected VatCalculationService $vatService,
        protected InvoiceNumberService $invoiceService,
    ) {}

    /**
     * Create a fully calculated, VAT-compliant order with invoice number.
     *
     * This method wraps the entire order creation in a DB transaction:
     * 1. Validate & build order items
     * 2. Calculate subtotal
     * 3. Apply voucher discount
     * 4. Calculate VAT (inclusive or exclusive per tenant setting)
     * 5. Generate atomic sequential invoice number
     * 6. Store order and order items
     *
     * @param  Tenant $tenant
     * @param  array  $data   Validated request data
     * @param  int|null $servedBy  User ID of the staff (POS orders)
     * @param  string   $source   'customer' or 'pos'
     * @return Order
     *
     * @throws \Throwable
     */
    public function createOrder(Tenant $tenant, array $data, ?int $servedBy = null, string $source = 'customer'): Order
    {
        return DB::transaction(function () use ($tenant, $data, $servedBy, $source) {

            // ── Validate table (dine-in only) ───────────────────────────
            $tableId = null;
            if (($data['type'] ?? null) === 'dine' && !empty($data['table_id'])) {
                $table = RestaurantTable::withoutGlobalScopes()
                    ->where('tenant_id', $tenant->id)
                    ->where('id', $data['table_id'])
                    ->first();

                if (!$table) {
                    throw new \InvalidArgumentException('Invalid table selected.');
                }

                $tableId = $table->id;
            }

            // ── Build order items & calculate subtotal ──────────────────
            $orderItems = [];
            $calcItems  = []; // For VAT service

            foreach ($data['items'] as $item) {
                $menuItem = MenuItem::withoutGlobalScopes()
                    ->where('tenant_id', $tenant->id)
                    ->where('id', $item['menu_item_id'])
                    ->where('is_active', true)
                    ->first();

                if (!$menuItem) {
                    throw new \InvalidArgumentException("Menu item #{$item['menu_item_id']} is unavailable.");
                }

                $lineTotal = bcmul((string) $menuItem->price, (string) $item['qty'], 2);

                $orderItems[] = [
                    'menu_item_id'         => $menuItem->id,
                    'qty'                  => $item['qty'],
                    'price_at_sale'        => $menuItem->price,
                    'line_total'           => $lineTotal,
                    'special_instructions' => $item['special_instructions'] ?? null,
                ];

                $calcItems[] = [
                    'price' => $menuItem->price,
                    'qty'   => $item['qty'],
                ];
            }

            // ── Voucher / discount ──────────────────────────────────────
            $voucherId = null;
            $discount  = 0;

            if (!empty($data['voucher_code'])) {
                $voucher = Voucher::withoutGlobalScopes()
                    ->where('tenant_id', $tenant->id)
                    ->where('code', $data['voucher_code'])
                    ->first();

                if ($voucher && $voucher->isValid()) {
                    // Calculate subtotal first for voucher
                    $subtotal = collect($calcItems)->sum(fn ($i) => bcmul((string) $i['price'], (string) $i['qty'], 2));
                    $discount = $voucher->calculateDiscount((float) $subtotal);

                    // Only consume a use when it actually discounts (min_purchase met)
                    // and the usage cap wasn't hit by a concurrent order.
                    if ($discount > 0 && $voucher->incrementUsage()) {
                        $voucherId = $voucher->id;
                    } else {
                        $discount = 0;
                    }
                }
            }

            // ── VAT calculation ─────────────────────────────────────────
            $totals = $this->vatService->calculate($calcItems, $tenant, $discount);

            // ── Generate atomic invoice number ──────────────────────────
            $invoiceNumber = $this->invoiceService->generate($tenant->id);

            // ── Determine payment status ────────────────────────────────
            $isPaid = ($data['payment_status'] ?? 'pending') === 'paid';

            // ── Create order ────────────────────────────────────────────
            $order = Order::withoutGlobalScopes()->create([
                'tenant_id'       => $tenant->id,
                'table_id'        => $tableId,
                'voucher_id'      => $voucherId,
                'order_number'    => Order::generateOrderNumber($tenant->id),
                'public_access_token' => Str::random(40),
                'invoice_number'  => $invoiceNumber,
                'customer_name'   => $data['customer_name'] ?? null,
                'customer_phone'  => $data['customer_phone'] ?? null,
                'subtotal'        => $totals['subtotal'],
                'discount'        => $totals['discount'],
                'net_amount'      => $totals['net_amount'],
                'vat_rate'        => $totals['vat_rate'],
                'vat_amount'      => $totals['vat_amount'],
                'tax'             => $totals['vat_amount'], // Keep backward compat with 'tax' column
                'grand_total'     => $totals['grand_total'],
                'type'            => $data['type'],
                'status'          => 'placed',
                'ip_address'      => request()->ip(),
                'notes'           => $data['notes'] ?? null,
                'payment_method'  => $data['payment_method'] ?? 'cash',
                'payment_status'  => $isPaid ? 'paid' : 'pending',
                'transaction_id'  => $data['transaction_id'] ?? null,
                'paid_at'         => $isPaid ? now() : null,
                'source'          => $source,
                'served_by'       => $servedBy,
            ]);

            // ── Order items ─────────────────────────────────────────────
            $order->items()->createMany($orderItems);

            // ── Mark table as occupied (dine-in) ────────────────────────
            if ($tableId) {
                RestaurantTable::withoutGlobalScopes()
                    ->where('id', $tableId)
                    ->update(['status' => 'occupied']);
            }

            return $order->load(['items.menuItem', 'table', 'voucher']);
        });
    }
}
