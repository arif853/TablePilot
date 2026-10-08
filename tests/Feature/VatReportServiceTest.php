<?php

use App\Models\Category;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\Subscription;
use App\Models\Tenant;
use App\Models\User;
use App\Services\BillingService;
use App\Services\InvoiceNumberService;
use App\Services\VatCalculationService;
use App\Services\VatReportService;

beforeEach(function () {
    $this->tenant = Tenant::create([
        'name'             => 'Report Restaurant',
        'slug'             => 'report-restaurant',
        'email'            => 'report@test.com',
        'tax_rate'         => 5.00,
        'default_vat_rate' => 5.00,
        'vat_registered'   => true,
        'vat_number'       => 'BIN-REPORT-001',
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
        'name'      => 'Report Admin',
        'email'     => 'report-admin@test.com',
        'password'  => bcrypt('password'),
        'role'      => 'restaurant_admin',
    ]);

    $category = Category::create([
        'tenant_id'  => $this->tenant->id,
        'name'       => 'Food',
        'sort_order' => 1,
    ]);

    $this->menuItem = MenuItem::create([
        'tenant_id'   => $this->tenant->id,
        'category_id' => $category->id,
        'name'        => 'Test Item',
        'price'       => 100.00,
        'is_active'   => true,
    ]);

    $this->billingService = new BillingService(
        new VatCalculationService(),
        new InvoiceNumberService(),
    );

    $this->reportService = new VatReportService();
});

test('daily z report returns correct summary from stored values', function () {
    // Create 2 orders
    for ($i = 0; $i < 2; $i++) {
        $this->billingService->createOrder(
            tenant: $this->tenant,
            data: [
                'type'  => 'parcel', 'customer_name' => "Customer {$i}", 'customer_phone' => '017',
                'items' => [['menu_item_id' => $this->menuItem->id, 'qty' => 2]], // 200 per order
                'payment_method' => 'cash', 'payment_status' => 'paid',
            ],
        );
    }

    $report = $this->reportService->dailyZReport($this->tenant->id, today()->format('Y-m-d'));

    // Each order: subtotal=200, vat=10, grand=210
    expect($report['summary']['order_count'])->toBe(2)
        ->and($report['summary']['total_subtotal'])->toBe('400.00')
        ->and($report['summary']['total_vat_collected'])->toBe('20.00')
        ->and($report['summary']['total_sales'])->toBe('420.00')
        ->and($report['summary']['total_discount'])->toBe('0.00');
});

test('daily z report excludes cancelled orders', function () {
    $order = $this->billingService->createOrder(
        tenant: $this->tenant,
        data: [
            'type'  => 'parcel', 'customer_name' => 'Cancel Test', 'customer_phone' => '017',
            'items' => [['menu_item_id' => $this->menuItem->id, 'qty' => 1]],
            'payment_method' => 'cash', 'payment_status' => 'pending',
        ],
    );

    $order->update(['status' => 'cancelled']);

    $report = $this->reportService->dailyZReport($this->tenant->id, today()->format('Y-m-d'));

    expect($report['summary']['order_count'])->toBe(0)
        ->and($report['summary']['total_sales'])->toBe('0.00');
});

test('monthly vat report aggregates stored vat values', function () {
    // Create 3 orders
    for ($i = 0; $i < 3; $i++) {
        $this->billingService->createOrder(
            tenant: $this->tenant,
            data: [
                'type'  => 'parcel', 'customer_name' => "Cust {$i}", 'customer_phone' => '017',
                'items' => [['menu_item_id' => $this->menuItem->id, 'qty' => 1]], // 100 each
                'payment_method' => 'cash', 'payment_status' => 'paid',
            ],
        );
    }

    $from = today()->startOfMonth()->format('Y-m-d');
    $to   = today()->endOfMonth()->format('Y-m-d');

    $report = $this->reportService->monthlyVatReport($this->tenant->id, $from, $to);

    // Each order: subtotal=100, vat=5, grand=105
    expect($report['summary']['total_invoices'])->toBe(3)
        ->and($report['summary']['total_taxable_sales'])->toBe('300.00')
        ->and($report['summary']['total_vat_collected'])->toBe('15.00')
        ->and($report['summary']['total_sales'])->toBe('315.00');
});

test('daily z report api endpoint works', function () {
    $this->billingService->createOrder(
        tenant: $this->tenant,
        data: [
            'type'  => 'parcel', 'customer_name' => 'API Report', 'customer_phone' => '017',
            'items' => [['menu_item_id' => $this->menuItem->id, 'qty' => 1]],
            'payment_method' => 'cash', 'payment_status' => 'paid',
        ],
    );

    $token = auth('api')->login($this->user);

    $response = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/reports/vat/daily?date=' . today()->format('Y-m-d'));

    $response->assertStatus(200)
        ->assertJsonStructure([
            'data' => [
                'date',
                'summary' => ['order_count', 'total_vat_collected', 'total_sales'],
                'by_payment_method',
            ],
        ]);
});

test('monthly vat report api endpoint works', function () {
    $token = auth('api')->login($this->user);

    $from = today()->startOfMonth()->format('Y-m-d');
    $to   = today()->endOfMonth()->format('Y-m-d');

    $response = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson("/api/reports/vat/monthly?from={$from}&to={$to}");

    $response->assertStatus(200)
        ->assertJsonStructure([
            'data' => [
                'period',
                'summary' => ['total_invoices', 'total_taxable_sales', 'total_vat_collected'],
                'daily_breakdown',
                'by_vat_rate',
            ],
        ]);
});

test('reports use stored values not recalculated', function () {
    // Create order with 5% VAT
    $order = $this->billingService->createOrder(
        tenant: $this->tenant,
        data: [
            'type'  => 'parcel', 'customer_name' => 'Stored Test', 'customer_phone' => '017',
            'items' => [['menu_item_id' => $this->menuItem->id, 'qty' => 1]],
            'payment_method' => 'cash', 'payment_status' => 'paid',
        ],
    );

    // Now change tenant VAT rate
    $this->tenant->update(['default_vat_rate' => 15.00]);

    $report = $this->reportService->dailyZReport($this->tenant->id, today()->format('Y-m-d'));

    // Report should show the STORED 5% VAT, not recalculated 15%
    // order: subtotal=100, vat=5 (at 5%), grand=105
    expect($report['summary']['total_vat_collected'])->toBe('5.00')
        ->and($report['summary']['total_sales'])->toBe('105.00');
});

test('z report shows breakdown by payment method', function () {
    // Cash order
    $this->billingService->createOrder(
        tenant: $this->tenant,
        data: [
            'type'  => 'parcel', 'customer_name' => 'Cash', 'customer_phone' => '017',
            'items' => [['menu_item_id' => $this->menuItem->id, 'qty' => 1]],
            'payment_method' => 'cash', 'payment_status' => 'paid',
        ],
    );

    // Card order
    $this->billingService->createOrder(
        tenant: $this->tenant,
        data: [
            'type'  => 'parcel', 'customer_name' => 'Card', 'customer_phone' => '017',
            'items' => [['menu_item_id' => $this->menuItem->id, 'qty' => 1]],
            'payment_method' => 'card', 'payment_status' => 'paid',
        ],
    );

    $report = $this->reportService->dailyZReport($this->tenant->id, today()->format('Y-m-d'));

    $methods = collect($report['by_payment_method'])->pluck('payment_method')->all();
    expect($methods)->toContain('cash')
        ->and($methods)->toContain('card')
        ->and($report['by_payment_method'])->toHaveCount(2);
});
