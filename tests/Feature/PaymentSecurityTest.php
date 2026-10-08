<?php

use App\Models\Category;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\Subscription;
use App\Models\SubscriptionPlan;
use App\Models\Tenant;
use App\Models\User;
use App\Services\BillingService;
use App\Services\InvoiceNumberService;
use App\Services\VatCalculationService;
use Illuminate\Support\Facades\Http;

beforeEach(function () {
    config([
        'saas.payment_gateways.sslcommerz.enabled' => true,
        'saas.payment_gateways.sslcommerz.store_id' => 'teststore',
        'saas.payment_gateways.sslcommerz.store_password' => 'secret',
        'saas.payment_gateways.sslcommerz.sandbox' => true,
    ]);

    $this->tenant = Tenant::factory()->vatRegistered()->create(['is_active' => false]);
    $this->plan = SubscriptionPlan::factory()->create(['price' => 1000, 'duration_days' => 30]);

    // What SSLCommerz's validation API returns for a genuine payment
    $this->gatewayReplies = function (array $override = []) {
        Http::swap(new \Illuminate\Http\Client\Factory);
        Http::fake([
            '*validationserverAPI.php*' => Http::response(array_merge([
                'status' => 'VALID',
                'tran_id' => 'SUB-1-1-abc',
                'amount' => '1000.00',
                'currency_type' => 'BDT',
            ], $override)),
        ]);
    };

    $this->pendingSubscription = function (string $tranId = 'SUB-1-1-abc', $amount = 1000) {
        cache()->put("subscription_payment:{$tranId}", [
            'tenant_id' => $this->tenant->id,
            'plan_id' => $this->plan->id,
            'amount' => $amount,
        ], now()->addMinutes(30));
    };

    $this->subscriptionCount = fn () => Subscription::withoutGlobalScopes()
        ->where('tenant_id', $this->tenant->id)->count();
});

// ─── Subscription payment callbacks ─────────────────────────────────
test('subscription callback with a forged val_id does not activate anything', function () {
    ($this->pendingSubscription)();
    ($this->gatewayReplies)(['status' => 'INVALID_TRANSACTION']);

    $this->post('/api/payment/sslcommerz/callback', ['tran_id' => 'SUB-1-1-abc', 'val_id' => 'forged', 'status' => 'VALID'])
        ->assertRedirect();

    expect(($this->subscriptionCount)())->toBe(0);
});

test('subscription callback without val_id never reaches activation', function () {
    ($this->pendingSubscription)();
    Http::fake();

    $this->post('/api/payment/sslcommerz/callback', ['tran_id' => 'SUB-1-1-abc', 'success' => true, 'status' => 'VALID']);

    expect(($this->subscriptionCount)())->toBe(0);
    Http::assertNothingSent();
});

test('a valid payment for a different transaction is rejected', function () {
    ($this->pendingSubscription)();
    ($this->gatewayReplies)(['tran_id' => 'SUB-9-9-other']);

    $this->post('/api/payment/sslcommerz/callback', ['tran_id' => 'SUB-1-1-abc', 'val_id' => 'v1']);

    expect(($this->subscriptionCount)())->toBe(0);
});

test('a payment of a smaller amount is rejected', function () {
    ($this->pendingSubscription)();
    ($this->gatewayReplies)(['amount' => '1.00']);

    $this->post('/api/payment/sslcommerz/callback', ['tran_id' => 'SUB-1-1-abc', 'val_id' => 'v1']);

    expect(($this->subscriptionCount)())->toBe(0);
});

test('a verified payment activates once even when redirect and IPN both arrive', function () {
    ($this->pendingSubscription)();
    ($this->gatewayReplies)();

    $payload = ['tran_id' => 'SUB-1-1-abc', 'val_id' => 'v1'];

    $this->post('/api/payment/sslcommerz/callback', $payload)->assertRedirect();
    $this->postJson('/api/payment/sslcommerz/ipn', $payload)->assertOk();

    expect(($this->subscriptionCount)())->toBe(1)
        ->and($this->tenant->fresh()->is_active)->toBeTrue();
});

test('bkash callback cannot activate subscriptions', function () {
    ($this->pendingSubscription)();

    $this->postJson('/api/payment/bkash/callback', ['tran_id' => 'SUB-1-1-abc', 'success' => true])
        ->assertStatus(501);

    expect(($this->subscriptionCount)())->toBe(0);
});

// ─── Tenant-initiated flows ─────────────────────────────────────────
test('manual payment verification does not activate a subscription', function () {
    $user = User::factory()->restaurantAdmin()->create(['tenant_id' => $this->tenant->id]);
    $this->tenant->update(['is_active' => true]);
    ($this->pendingSubscription)();

    $this->withHeader('Authorization', 'Bearer ' . auth('api')->login($user))
        ->postJson('/api/subscription/verify', ['tran_id' => 'SUB-1-1-abc', 'payment_ref' => 'I-PAID-TRUST-ME'])
        ->assertOk()
        ->assertJsonPath('data.status', 'pending_review');

    expect(($this->subscriptionCount)())->toBe(0);
});

test('an unconfigured gateway does not hand out free subscriptions in production', function () {
    config(['saas.payment_gateways.sslcommerz.enabled' => false]);
    app()->detectEnvironment(fn () => 'production');

    $user = User::factory()->restaurantAdmin()->create(['tenant_id' => $this->tenant->id]);
    $this->tenant->update(['is_active' => true]);

    $this->withHeader('Authorization', 'Bearer ' . auth('api')->login($user))
        ->postJson('/api/subscription/pay', ['plan_id' => $this->plan->id])
        ->assertStatus(503);

    expect(($this->subscriptionCount)())->toBe(0);
});

// ─── Order payments ─────────────────────────────────────────────────
function orderAwaitingPayment($test): Order
{
    $category = Category::factory()->create(['tenant_id' => $test->tenant->id]);
    $item = MenuItem::factory()->create([
        'tenant_id' => $test->tenant->id, 'category_id' => $category->id, 'price' => 200, 'is_active' => true,
    ]);

    $order = (new BillingService(new VatCalculationService, new InvoiceNumberService))->createOrder($test->tenant, [
        'type' => 'parcel',
        'items' => [['menu_item_id' => $item->id, 'qty' => 1]],
        'payment_method' => 'online',
    ]);

    $order->update(['transaction_id' => "ORDER-{$order->order_number}-1700000000"]);

    return $order->fresh();
}

test('order is marked paid only when tran_id and amount match the gateway record', function () {
    $order = orderAwaitingPayment($this);
    $tranId = $order->transaction_id;

    // Cheap valid payment replayed against this order
    ($this->gatewayReplies)(['tran_id' => $tranId, 'amount' => '5.00']);
    $this->postJson('/api/payment/sslcommerz/ipn', ['tran_id' => $tranId, 'val_id' => 'cheap'])->assertStatus(400);
    expect($order->fresh()->payment_status)->toBe('pending');

    // Genuine payment
    ($this->gatewayReplies)(['tran_id' => $tranId, 'amount' => number_format((float) $order->grand_total, 2, '.', '')]);
    $this->postJson('/api/payment/sslcommerz/ipn', ['tran_id' => $tranId, 'val_id' => 'real'])->assertOk();
    expect($order->fresh()->payment_status)->toBe('paid');
});

test('order payment callback trusts the gateway, not a status field in the request', function () {
    $order = orderAwaitingPayment($this);
    $tranId = $order->transaction_id;

    ($this->gatewayReplies)(['status' => 'FAILED', 'tran_id' => $tranId]);
    $this->postJson('/api/payment/sslcommerz/ipn', ['tran_id' => $tranId, 'val_id' => 'x', 'status' => 'VALID'])
        ->assertStatus(400);

    expect($order->fresh()->payment_status)->toBe('pending');
});
