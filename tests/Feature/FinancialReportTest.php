<?php

use App\Models\Category;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\Subscription;
use App\Models\Tenant;
use App\Models\User;
use App\Services\BillingService;
use App\Services\FinancialReportService;
use App\Services\InvoiceNumberService;
use App\Services\VatCalculationService;

beforeEach(function () {
    $this->tenant = Tenant::create([
        'name'             => 'Ledger Bistro',
        'slug'             => 'ledger-bistro',
        'email'            => 'ledger@test.com',
        'tax_rate'         => 5.00,
        'default_vat_rate' => 5.00,
        'vat_registered'   => true,
        'vat_number'       => 'BIN-LEDGER-001',
        'vat_inclusive'    => false,
        'is_active'        => true,
    ]);

    Subscription::factory()->create([
        'tenant_id'  => $this->tenant->id,
        'plan_type'  => 'monthly',
        'amount'     => 999,
        'status'     => 'active',
        'starts_at'  => now()->subDays(5),
        'expires_at' => now()->addDays(25),
    ]);

    $this->user = User::create([
        'tenant_id' => $this->tenant->id,
        'name'      => 'Ledger Admin',
        'email'     => 'ledger-admin@test.com',
        'password'  => bcrypt('password'),
        'role'      => 'restaurant_admin',
    ]);

    $category = Category::create(['tenant_id' => $this->tenant->id, 'name' => 'Mains', 'sort_order' => 1]);

    $this->menuItem = MenuItem::create([
        'tenant_id'   => $this->tenant->id,
        'category_id' => $category->id,
        'name'        => 'Kacchi',
        'price'       => 100.00,
        'is_active'   => true,
    ]);

    $this->billing = new BillingService(new VatCalculationService(), new InvoiceNumberService());
    $this->service = new FinancialReportService();

    $this->order = function (int $qty, string $status = 'completed', array $extra = []) {
        $order = $this->billing->createOrder(
            tenant: $this->tenant,
            data: array_merge([
                'type' => 'parcel', 'customer_name' => 'Guest', 'customer_phone' => '017',
                'items' => [['menu_item_id' => $this->menuItem->id, 'qty' => $qty]],
                'payment_method' => 'cash', 'payment_status' => 'paid',
            ], $extra),
        );
        $order->update(['status' => $status]);

        return $order;
    };
});

test('statement totals reconcile from gross sales to total billed', function () {
    ($this->order)(2);                       // 200 + 10 VAT
    ($this->order)(1, 'completed', ['payment_status' => 'pending']); // 100 + 5, unpaid
    ($this->order)(3, 'cancelled');          // excluded from revenue
    ($this->order)(1, 'preparing');          // open order

    $today = today()->toDateString();
    $r = $this->service->statement($this->tenant, $today, $today);
    $s = $r['summary'];

    expect($s['completed_orders'])->toBe(2)
        ->and($s['gross_sales'])->toBe('300.00')
        ->and($s['net_sales'])->toBe('300.00')
        ->and($s['vat'])->toBe('15.00')
        ->and($s['total_billed'])->toBe('315.00')
        ->and($s['avg_order_value'])->toBe('157.50')
        ->and($s['cancelled_orders'])->toBe(1)
        ->and($s['cancelled_amount'])->toBe('315.00')
        ->and($s['open_orders'])->toBe(1)
        ->and($s['net_earnings'])->toBe('300.00');

    expect($r['collections']['paid']['amount'])->toBe('210.00')
        ->and($r['collections']['outstanding'])->toBe('105.00');

    // Daily ledger row sums to the summary
    expect($r['daily'])->toHaveCount(1)
        ->and($r['daily'][0]['total_billed'])->toBe('315.00');

    expect($r['top_items'][0]['name'])->toBe('Kacchi')
        ->and($r['top_items'][0]['qty'])->toBe(3);
});

test('orders late on the last day of the range are included', function () {
    $order = ($this->order)(1);
    $order->forceFill(['created_at' => today()->setTime(22, 30)])->save();

    $today = today()->toDateString();
    $r = $this->service->statement($this->tenant, $today, $today);

    expect($r['summary']['completed_orders'])->toBe(1);
    expect(Order::withoutGlobalScopes()->completed()->dateRange($today, $today)->count())->toBe(1);
});

test('split payments are broken out by tender', function () {
    ($this->order)(2, 'completed', [
        'payment_method' => 'split',
        'split_payments' => [['method' => 'cash', 'amount' => 110], ['method' => 'bkash', 'amount' => 100]],
    ]);
    ($this->order)(1); // cash 105

    $today = today()->toDateString();
    $methods = collect($this->service->statement($this->tenant, $today, $today)['payment_methods'])->keyBy('method');

    expect($methods['cash']['amount'])->toBe('215.00')
        ->and($methods['bkash']['amount'])->toBe('100.00')
        ->and($methods->has('split'))->toBeFalse();
});

test('platform tenants see commission deducted from net earnings', function () {
    $this->tenant->update(['payment_mode' => 'platform', 'commission_rate' => 10]);
    ($this->order)(2); // 210 billed

    $today = today()->toDateString();
    $s = $this->service->statement($this->tenant->fresh(), $today, $today)['summary'];

    expect($s['commission'])->toBe('21.00')
        ->and($s['net_earnings'])->toBe('179.00');
});

test('financial api returns statement and csv exports', function () {
    ($this->order)(2);
    $token = auth('api')->login($this->user);
    $today = today()->toDateString();

    $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson("/api/reports/financial?from={$today}&to={$today}")
        ->assertOk()
        ->assertJsonPath('data.summary.total_billed', '210.00')
        ->assertJsonPath('data.restaurant.vat_number', 'BIN-LEDGER-001');

    foreach (['statement' => 'INCOME STATEMENT', 'transactions' => 'Invoice No', 'items' => 'Kacchi'] as $type => $needle) {
        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->get("/api/reports/financial/export?from={$today}&to={$today}&type={$type}");

        $response->assertOk();
        expect($response->headers->get('content-disposition'))->toContain("ledger-bistro-{$type}-{$today}-to-{$today}.csv")
            ->and($response->streamedContent())->toContain($needle);
    }
});

test('financial api rejects ranges longer than a year', function () {
    $token = auth('api')->login($this->user);

    $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/reports/financial?from=2024-01-01&to=2025-06-01')
        ->assertStatus(422);
});

test('statement only includes the requesting tenant orders', function () {
    ($this->order)(2);

    $other = Tenant::create(['name' => 'Other', 'slug' => 'other', 'email' => 'o@test.com', 'is_active' => true]);
    $today = today()->toDateString();

    expect($this->service->statement($other, $today, $today)['summary']['completed_orders'])->toBe(0);
});
