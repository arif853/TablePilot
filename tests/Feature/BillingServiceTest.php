<?php

use App\Models\Category;
use App\Models\MenuItem;
use App\Models\Subscription;
use App\Models\Tenant;
use App\Models\User;
use App\Services\BillingService;
use App\Services\InvoiceNumberService;
use App\Services\VatCalculationService;
use Illuminate\Support\Facades\DB;

beforeEach(function () {
    // Create tenant
    $this->tenant = Tenant::create([
        'name'             => 'Test VAT Restaurant',
        'slug'             => 'test-vat-restaurant',
        'email'            => 'vat@test.com',
        'phone'            => '01700000000',
        'address'          => '123 Test Street, Dhaka',
        'tax_rate'         => 5.00,
        'default_vat_rate' => 5.00,
        'vat_registered'   => true,
        'vat_number'       => 'BIN-123456789',
        'vat_inclusive'    => false,
        'is_active'        => true,
    ]);

    // Create subscription
    Subscription::factory()->create([
        'tenant_id'  => $this->tenant->id,
        'plan_type'  => 'monthly',
        'amount'     => 999,
        'status'     => 'active',
        'starts_at'  => now()->subDays(5),
        'expires_at' => now()->addDays(25),
    ]);

    // Create admin user
    $this->user = User::create([
        'tenant_id' => $this->tenant->id,
        'name'      => 'Admin',
        'email'     => 'admin@vat-test.com',
        'password'  => bcrypt('password'),
        'role'      => 'restaurant_admin',
    ]);

    // Create category and menu items
    $category = Category::create([
        'tenant_id' => $this->tenant->id,
        'name'      => 'Main Course',
        'sort_order' => 1,
    ]);

    $this->menuItem1 = MenuItem::create([
        'tenant_id'   => $this->tenant->id,
        'category_id' => $category->id,
        'name'        => 'Biriyani',
        'price'       => 250.00,
        'is_active'   => true,
    ]);

    $this->menuItem2 = MenuItem::create([
        'tenant_id'   => $this->tenant->id,
        'category_id' => $category->id,
        'name'        => 'Kacchi',
        'price'       => 350.00,
        'is_active'   => true,
    ]);

    $this->billingService = new BillingService(
        new VatCalculationService(),
        new InvoiceNumberService(),
    );
});

test('billing service creates order with correct vat exclusive totals', function () {
    $order = $this->billingService->createOrder(
        tenant: $this->tenant,
        data: [
            'type'           => 'parcel',
            'customer_name'  => 'Test Customer',
            'customer_phone' => '01712345678',
            'items'          => [
                ['menu_item_id' => $this->menuItem1->id, 'qty' => 2], // 500
                ['menu_item_id' => $this->menuItem2->id, 'qty' => 1], // 350
            ],
            'payment_method' => 'cash',
            'payment_status' => 'pending',
        ],
        source: 'pos',
    );

    // subtotal = 850, discount = 0, net = 850, vat = 42.50, grand = 892.50
    expect($order->subtotal)->toBe('850.00')
        ->and($order->discount)->toBe('0.00')
        ->and($order->net_amount)->toBe('850.00')
        ->and($order->vat_rate)->toBe('5.00')
        ->and($order->vat_amount)->toBe('42.50')
        ->and($order->grand_total)->toBe('892.50')
        ->and($order->invoice_number)->not->toBeNull()
        ->and($order->items)->toHaveCount(2);
});

test('billing service creates order with vat inclusive totals', function () {
    $this->tenant->update(['vat_inclusive' => true]);

    $order = $this->billingService->createOrder(
        tenant: $this->tenant->fresh(),
        data: [
            'type'           => 'parcel',
            'customer_name'  => 'Test Customer',
            'customer_phone' => '01712345678',
            'items'          => [
                ['menu_item_id' => $this->menuItem1->id, 'qty' => 2], // 500
                ['menu_item_id' => $this->menuItem2->id, 'qty' => 1], // 350
            ],
            'payment_method' => 'cash',
            'payment_status' => 'paid',
        ],
        source: 'pos',
    );

    // subtotal = 850 (inclusive), vat = 850 * 5/105 = 40.47, net = 809.53, grand = 850
    expect($order->subtotal)->toBe('850.00')
        ->and($order->vat_amount)->toBe('40.47')
        ->and($order->net_amount)->toBe('809.53')
        ->and($order->grand_total)->toBe('850.00');
});

test('billing service generates unique sequential invoice numbers', function () {
    $order1 = $this->billingService->createOrder(
        tenant: $this->tenant,
        data: [
            'type'  => 'parcel', 'customer_name' => 'A', 'customer_phone' => '017',
            'items' => [['menu_item_id' => $this->menuItem1->id, 'qty' => 1]],
            'payment_method' => 'cash', 'payment_status' => 'pending',
        ],
    );

    $order2 = $this->billingService->createOrder(
        tenant: $this->tenant,
        data: [
            'type'  => 'parcel', 'customer_name' => 'B', 'customer_phone' => '017',
            'items' => [['menu_item_id' => $this->menuItem1->id, 'qty' => 1]],
            'payment_method' => 'cash', 'payment_status' => 'pending',
        ],
    );

    expect($order1->invoice_number)->not->toBe($order2->invoice_number)
        ->and($order1->invoice_number)->toContain('INV-')
        ->and($order2->invoice_number)->toContain('INV-');
});

test('order stores vat rate historically', function () {
    $order = $this->billingService->createOrder(
        tenant: $this->tenant,
        data: [
            'type'  => 'parcel', 'customer_name' => 'A', 'customer_phone' => '017',
            'items' => [['menu_item_id' => $this->menuItem1->id, 'qty' => 1]],
            'payment_method' => 'cash', 'payment_status' => 'pending',
        ],
    );

    // Change tenant VAT rate
    $this->tenant->update(['default_vat_rate' => 15.00]);

    // Old order should still have the original rate
    $order->refresh();
    expect($order->vat_rate)->toBe('5.00');
});

test('pos order via api returns vat invoice fields', function () {
    $token = auth('api')->login($this->user);

    $response = $this->withHeader('Authorization', "Bearer {$token}")
        ->postJson('/api/pos/orders', [
            'type'           => 'parcel',
            'customer_name'  => 'API Customer',
            'customer_phone' => '01700000000',
            'items'          => [
                ['menu_item_id' => $this->menuItem1->id, 'qty' => 1],
            ],
            'payment_method' => 'cash',
            'payment_status' => 'paid',
        ]);

    $response->assertStatus(201)
        ->assertJsonPath('success', true)
        ->assertJsonStructure([
            'data' => [
                'invoice_number',
                'subtotal',
                'discount',
                'net_amount',
                'vat_rate',
                'vat_amount',
                'grand_total',
            ],
        ]);

    $data = $response->json('data');
    expect($data['invoice_number'])->not->toBeNull()
        ->and($data['vat_rate'])->toBe('5.00');
});

test('invoice endpoint returns vat compliant data', function () {
    $order = $this->billingService->createOrder(
        tenant: $this->tenant,
        data: [
            'type'  => 'parcel', 'customer_name' => 'Invoice Test', 'customer_phone' => '017',
            'items' => [['menu_item_id' => $this->menuItem1->id, 'qty' => 2]],
            'payment_method' => 'cash', 'payment_status' => 'pending',
        ],
    );

    $response = $this->getJson("/api/customer/order/{$order->order_number}/invoice?access_token={$order->public_access_token}");

    $response->assertStatus(200)
        ->assertJsonStructure([
            'data' => [
                'invoice' => ['invoice_number', 'date', 'order_number'],
                'restaurant' => ['name', 'address', 'vat_number'],
                'items',
                'totals' => ['subtotal', 'discount', 'net_amount', 'vat_rate', 'vat_amount', 'grand_total'],
                'payment' => ['method', 'status'],
            ],
        ]);

    $this->getJson("/api/customer/order/{$order->order_number}/invoice")
        ->assertStatus(404);
});
