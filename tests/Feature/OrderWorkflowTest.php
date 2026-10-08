<?php

use App\Jobs\AutoCancelStaleOrders;
use App\Jobs\CalculateSettlement;
use App\Models\Category;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\RestaurantTable;
use App\Models\Settlement;
use App\Models\Subscription;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Voucher;
use App\Services\BillingService;
use App\Services\InvoiceNumberService;
use App\Services\VatCalculationService;

beforeEach(function () {
    $this->tenant = Tenant::factory()->vatRegistered()->create();
    Subscription::factory()->create(['tenant_id' => $this->tenant->id]);
    $this->admin = User::factory()->restaurantAdmin()->create(['tenant_id' => $this->tenant->id]);
    $this->headers = ['Authorization' => 'Bearer ' . auth('api')->login($this->admin)];

    $category = Category::factory()->create(['tenant_id' => $this->tenant->id]);
    $this->menuItem = MenuItem::factory()->create([
        'tenant_id' => $this->tenant->id,
        'category_id' => $category->id,
        'price' => 100.00,
        'is_active' => true,
    ]);

    $this->billing = new BillingService(new VatCalculationService, new InvoiceNumberService);

    $this->placeOrder = function (array $extra = []) {
        return $this->billing->createOrder($this->tenant, array_merge([
            'type' => 'parcel',
            'items' => [['menu_item_id' => $this->menuItem->id, 'qty' => 1]],
        ], $extra));
    };
});

// ─── Status transitions ─────────────────────────────────────────────
test('order status can only move one step forward', function () {
    $order = ($this->placeOrder)();

    $this->withHeaders($this->headers)
        ->patchJson("/api/orders/{$order->id}/status", ['status' => 'ready'])
        ->assertStatus(422);

    $this->withHeaders($this->headers)
        ->patchJson("/api/orders/{$order->id}/status", ['status' => 'confirmed'])
        ->assertOk();

    expect($order->fresh()->status)->toBe('confirmed');
});

test('terminal orders cannot be reopened or changed', function () {
    foreach (['completed', 'cancelled'] as $final) {
        $order = ($this->placeOrder)();
        $order->update(['status' => $final]);

        foreach (['placed', 'confirmed', 'cancelled'] as $target) {
            $this->withHeaders($this->headers)
                ->patchJson("/api/orders/{$order->id}/status", ['status' => $target])
                ->assertStatus(422);
        }

        expect($order->fresh()->status)->toBe($final);
    }
});

// ─── Cancellation: table + voucher release ──────────────────────────
test('cancelling via status update frees the table and restores the voucher', function () {
    $table = RestaurantTable::factory()->create(['tenant_id' => $this->tenant->id]);
    $voucher = Voucher::factory()->create([
        'tenant_id' => $this->tenant->id,
        'code' => 'SAVE10',
        'type' => 'fixed',
        'discount_value' => 10,
        'min_purchase' => 0,
    ]);

    $order = ($this->placeOrder)(['type' => 'dine', 'table_id' => $table->id, 'voucher_code' => 'SAVE10']);

    expect($voucher->fresh()->used_count)->toBe(1)
        ->and($table->fresh()->status)->toBe('occupied');

    $this->withHeaders($this->headers)
        ->patchJson("/api/orders/{$order->id}/status", ['status' => 'cancelled'])
        ->assertOk();

    expect($voucher->fresh()->used_count)->toBe(0)
        ->and($table->fresh()->status)->toBe('available');
});

test('cancelling twice is rejected and does not double-refund the voucher', function () {
    $voucher = Voucher::factory()->create([
        'tenant_id' => $this->tenant->id,
        'code' => 'ONCE',
        'type' => 'fixed',
        'discount_value' => 10,
        'min_purchase' => 0,
        'used_count' => 5,
    ]);
    $order = ($this->placeOrder)(['voucher_code' => 'ONCE']);
    expect($voucher->fresh()->used_count)->toBe(6);

    $this->withHeaders($this->headers)->postJson("/api/orders/{$order->id}/cancel")->assertOk();
    $this->withHeaders($this->headers)->postJson("/api/orders/{$order->id}/cancel")->assertStatus(422);

    expect($voucher->fresh()->used_count)->toBe(5);
});

test('table stays occupied while another active order uses it', function () {
    $table = RestaurantTable::factory()->create(['tenant_id' => $this->tenant->id]);
    $first = ($this->placeOrder)(['type' => 'dine', 'table_id' => $table->id]);
    ($this->placeOrder)(['type' => 'dine', 'table_id' => $table->id]);

    $this->withHeaders($this->headers)->postJson("/api/orders/{$first->id}/cancel")->assertOk();

    expect($table->fresh()->status)->toBe('occupied');
});

// ─── Voucher consumption ────────────────────────────────────────────
test('voucher below minimum purchase is not consumed', function () {
    $voucher = Voucher::factory()->create([
        'tenant_id' => $this->tenant->id,
        'code' => 'BIG',
        'type' => 'fixed',
        'discount_value' => 50,
        'min_purchase' => 1000,
    ]);

    $order = ($this->placeOrder)(['voucher_code' => 'BIG']);

    expect($order->voucher_id)->toBeNull()
        ->and((float) $order->discount)->toBe(0.0)
        ->and($voucher->fresh()->used_count)->toBe(0);
});

test('voucher at its usage cap is not applied', function () {
    $voucher = Voucher::factory()->create([
        'tenant_id' => $this->tenant->id,
        'code' => 'LAST',
        'type' => 'fixed',
        'discount_value' => 10,
        'min_purchase' => 0,
        'max_uses' => 1,
        'used_count' => 0,
    ]);

    $first = ($this->placeOrder)(['voucher_code' => 'LAST']);
    $second = ($this->placeOrder)(['voucher_code' => 'LAST']);

    expect($first->voucher_id)->toBe($voucher->id)
        ->and($second->voucher_id)->toBeNull()
        ->and($voucher->fresh()->used_count)->toBe(1);
});

test('stale voucher usage never goes below zero', function () {
    $voucher = Voucher::factory()->create(['tenant_id' => $this->tenant->id, 'used_count' => 0]);

    $voucher->releaseUsage();

    expect($voucher->fresh()->used_count)->toBe(0);
});

// ─── markPaid ───────────────────────────────────────────────────────
test('mark paid rejects already paid and cancelled orders', function () {
    $order = ($this->placeOrder)();

    $this->withHeaders($this->headers)->postJson("/api/orders/{$order->id}/mark-paid")->assertOk();
    $this->withHeaders($this->headers)->postJson("/api/orders/{$order->id}/mark-paid")->assertStatus(422);

    $cancelled = ($this->placeOrder)();
    $cancelled->update(['status' => 'cancelled']);
    $this->withHeaders($this->headers)->postJson("/api/orders/{$cancelled->id}/mark-paid")->assertStatus(422);
});

// ─── Auto-cancel job ────────────────────────────────────────────────
test('auto-cancel only cancels stale placed orders and releases resources', function () {
    $table = RestaurantTable::factory()->create(['tenant_id' => $this->tenant->id]);
    $voucher = Voucher::factory()->create([
        'tenant_id' => $this->tenant->id,
        'code' => 'AUTO',
        'type' => 'fixed',
        'discount_value' => 10,
        'min_purchase' => 0,
    ]);

    $stale = ($this->placeOrder)(['type' => 'dine', 'table_id' => $table->id, 'voucher_code' => 'AUTO']);
    $fresh = ($this->placeOrder)();
    $advanced = ($this->placeOrder)();
    $advanced->update(['status' => 'confirmed']);

    $old = now()->subMinutes(config('saas.order.auto_cancel_minutes', 30) + 5);
    Order::withoutGlobalScopes()->whereIn('id', [$stale->id, $advanced->id])->update(['created_at' => $old]);

    (new AutoCancelStaleOrders)->handle();

    expect($stale->fresh()->status)->toBe('cancelled')
        ->and($stale->fresh()->notes)->toContain('Auto-cancelled')
        ->and($fresh->fresh()->status)->toBe('placed')
        ->and($advanced->fresh()->status)->toBe('confirmed')
        ->and($table->fresh()->status)->toBe('available')
        ->and($voucher->fresh()->used_count)->toBe(0);
});

// ─── Settlement job ─────────────────────────────────────────────────
test('settlement defaults to the previous month and includes its last day', function () {
    $this->tenant->update(['payment_mode' => 'platform', 'commission_rate' => 10]);

    $lastMonth = now()->subMonthNoOverflow();
    $inLastDay = ($this->placeOrder)();
    $inLastDay->update(['status' => 'completed']);
    Order::withoutGlobalScopes()->where('id', $inLastDay->id)
        ->update(['created_at' => $lastMonth->copy()->endOfMonth()->subMinute()]);

    $thisMonth = ($this->placeOrder)();
    $thisMonth->update(['status' => 'completed']);

    (new CalculateSettlement)->handle();

    $settlement = Settlement::withoutGlobalScopes()->where('tenant_id', $this->tenant->id)->firstOrFail();

    expect($settlement->period_start->toDateString())->toBe($lastMonth->copy()->startOfMonth()->toDateString())
        ->and($settlement->period_end->toDateString())->toBe($lastMonth->copy()->endOfMonth()->toDateString())
        ->and((float) $settlement->total_sold)->toBe((float) $inLastDay->grand_total)
        ->and((float) $settlement->commission_amount)->toBe(round($inLastDay->grand_total * 0.10, 2));
});

// ─── Order numbers ──────────────────────────────────────────────────
test('order numbers are unique across tenants and after back-dating', function () {
    $other = Tenant::factory()->vatRegistered()->create();
    $otherCategory = Category::factory()->create(['tenant_id' => $other->id]);
    $otherItem = MenuItem::factory()->create([
        'tenant_id' => $other->id, 'category_id' => $otherCategory->id, 'price' => 50, 'is_active' => true,
    ]);

    $a1 = ($this->placeOrder)();
    $b1 = $this->billing->createOrder($other, [
        'type' => 'parcel',
        'items' => [['menu_item_id' => $otherItem->id, 'qty' => 1]],
    ]);

    // Moving an order out of today must not make the next number repeat
    Order::withoutGlobalScopes()->where('id', $a1->id)->update(['created_at' => now()->subDay()]);
    $a2 = ($this->placeOrder)();
    $a3 = ($this->placeOrder)();

    $numbers = [$a1->order_number, $b1->order_number, $a2->order_number, $a3->order_number];

    expect(array_unique($numbers))->toHaveCount(4)
        ->and($a3->order_number)->toEndWith('-0003');
});
