<?php

use App\Mail\TenantOtpMail;
use App\Models\MenuItem;
use App\Models\PosShift;
use App\Models\RestaurantTable;
use App\Models\Settlement;
use App\Models\SubscriptionPlan;
use App\Models\User;
use App\Models\Voucher;
use App\Services\BillingService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;

use function Pest\Laravel\getJson;
use function Pest\Laravel\patchJson;
use function Pest\Laravel\postJson;

/** Place an order straight through the billing service (bypasses HTTP). */
function placeParcelOrder(\App\Models\Tenant $tenant, MenuItem $item, array $extra = []): \App\Models\Order
{
    return app(BillingService::class)->createOrder($tenant, array_merge([
        'type' => 'parcel',
        'items' => [['menu_item_id' => $item->id, 'qty' => 1]],
    ], $extra));
}

// ─── Menu: deleted items ────────────────────────────────────────────

test('a deleted menu item cannot be ordered by a customer', function () {
    [$tenant] = restaurantWithAdmin();
    $item = MenuItem::factory()->create(['tenant_id' => $tenant->id, 'price' => 100, 'is_active' => true]);
    $item->delete();

    postJson("/api/customer/restaurant/{$tenant->slug}/order", [
        'type' => 'parcel',
        'customer_name' => 'Walk In',
        'customer_phone' => '01700000000',
        'payment_method' => 'cash',
        'items' => [['menu_item_id' => $item->id, 'qty' => 1]],
    ])->assertStatus(422);
});

test('a deleted uncategorized item is hidden from the public menu', function () {
    [$tenant] = restaurantWithAdmin();
    $item = MenuItem::factory()->create([
        'tenant_id' => $tenant->id, 'category_id' => null, 'price' => 100, 'is_active' => true,
    ]);
    $item->delete();

    $ids = collect(getJson("/api/customer/restaurant/{$tenant->slug}/menu")->assertOk()->json('data.uncategorized'))->pluck('id');

    expect($ids)->not->toContain($item->id);
});

// ─── Authorization ──────────────────────────────────────────────────

test('kitchen users cannot cancel an order through the status endpoint', function () {
    [$tenant] = restaurantWithAdmin();
    $kitchen = User::factory()->kitchen()->create(['tenant_id' => $tenant->id]);
    $item = MenuItem::factory()->create(['tenant_id' => $tenant->id, 'price' => 100, 'is_active' => true]);
    $order = placeParcelOrder($tenant, $item);

    patchJson("/api/orders/{$order->id}/status", ['status' => 'cancelled'], bearer($kitchen))->assertForbidden();

    expect($order->fresh()->status)->toBe('placed');
});

// ─── Kitchen flow ───────────────────────────────────────────────────

test('completing an order from the kitchen screen frees its table', function () {
    [$tenant] = restaurantWithAdmin();
    $kitchen = User::factory()->kitchen()->create(['tenant_id' => $tenant->id]);
    $table = RestaurantTable::factory()->create(['tenant_id' => $tenant->id]);
    $item = MenuItem::factory()->create(['tenant_id' => $tenant->id, 'price' => 100, 'is_active' => true]);
    $order = placeParcelOrder($tenant, $item, ['type' => 'dine', 'table_id' => $table->id]);

    expect($table->fresh()->status)->toBe('occupied');

    $order->update(['status' => 'served']);
    postJson("/api/kitchen/orders/{$order->id}/advance", [], bearer($kitchen))->assertOk();

    expect($order->fresh()->status)->toBe('completed')
        ->and($table->fresh()->status)->toBe('available');
});

// ─── Vouchers ───────────────────────────────────────────────────────

test('a voucher is still valid on its expiry date', function () {
    [$tenant] = restaurantWithAdmin();
    $voucher = Voucher::factory()->create(['tenant_id' => $tenant->id, 'expiry_date' => today()]);

    expect($voucher->isValid())->toBeTrue()
        ->and(Voucher::withoutGlobalScopes()->valid()->whereKey($voucher->id)->exists())->toBeTrue();
});

// ─── Orders list filters ────────────────────────────────────────────

test('the orders list date range includes the whole end day', function () {
    [$tenant, $admin] = restaurantWithAdmin();
    $item = MenuItem::factory()->create(['tenant_id' => $tenant->id, 'price' => 100, 'is_active' => true]);
    $order = placeParcelOrder($tenant, $item);

    $day = today()->toDateString();
    $ids = collect(getJson("/api/orders?from={$day}&to={$day}", bearer($admin))->assertOk()->json('data'))->pluck('id');

    expect($ids)->toContain($order->id);
});

// ─── Password reset ─────────────────────────────────────────────────

test('an old password reset token is rejected', function () {
    $user = User::factory()->create(['email' => 'reset@example.test']);
    DB::table('password_reset_tokens')->insert([
        'email' => $user->email,
        'token' => Hash::make('stale-token'),
        'created_at' => now()->subHours(3),
    ]);

    postJson('/api/auth/reset-password', [
        'email' => $user->email,
        'token' => 'stale-token',
        'password' => 'brand-new-pass-1',
        'password_confirmation' => 'brand-new-pass-1',
    ])->assertStatus(422);

    expect(Hash::check('brand-new-pass-1', $user->fresh()->password))->toBeFalse();
});

test('a fresh password reset token works exactly once', function () {
    $user = User::factory()->create(['email' => 'reset2@example.test']);
    DB::table('password_reset_tokens')->insert([
        'email' => $user->email,
        'token' => Hash::make('good-token'),
        'created_at' => now()->subMinutes(5),
    ]);

    $payload = [
        'email' => $user->email,
        'token' => 'good-token',
        'password' => 'brand-new-pass-1',
        'password_confirmation' => 'brand-new-pass-1',
    ];

    postJson('/api/auth/reset-password', $payload)->assertOk();
    postJson('/api/auth/reset-password', $payload)->assertStatus(422);
    expect(Hash::check('brand-new-pass-1', $user->fresh()->password))->toBeTrue();
});

// ─── Super admin settlements ────────────────────────────────────────

test('recording a settlement payment from the admin screen keeps the method and note', function () {
    $super = User::factory()->superAdmin()->create();
    $settlement = Settlement::factory()->create();

    postJson("/api/admin/settlements/{$settlement->id}/payment", [
        'amount' => 100,
        'method' => 'bank_transfer',
        'note' => 'Ref 42',
    ], bearer($super))->assertOk();

    $payment = $settlement->payments()->first();

    expect($payment->payment_method)->toBe('bank_transfer')
        ->and($payment->notes)->toBe('Ref 42');
});

test('a settlement payment above the balance due is rejected', function () {
    $super = User::factory()->superAdmin()->create();
    $settlement = Settlement::factory()->create();
    $tooMuch = (float) $settlement->payable_balance + 1000;

    postJson("/api/admin/settlements/{$settlement->id}/payment", [
        'amount' => $tooMuch,
        'method' => 'cash',
    ], bearer($super))->assertStatus(422);

    expect($settlement->payments()->count())->toBe(0);
});

// ─── POS shifts ─────────────────────────────────────────────────────

test('each restaurant has its own cash shift', function () {
    [$tenantA, $adminA] = restaurantWithAdmin();
    [, $adminB] = restaurantWithAdmin();

    // Restaurant A already has an open shift (seeded directly: one HTTP user per test,
    // because the JWT guard keeps the first request's user for the rest of the test).
    PosShift::withoutGlobalScopes()->create([
        'tenant_id' => $tenantA->id, 'opened_by' => $adminA->id, 'opening_cash' => 100,
        'expected_cash' => 100, 'opened_at' => now(), 'status' => 'open',
    ]);

    expect(getJson('/api/pos/shifts/current', bearer($adminB))->json('data'))->toBeNull();

    postJson('/api/pos/shifts/open', ['opening_cash' => 200], bearer($adminB))->assertCreated();
});

test('closing a shift counts the cash part of split payments', function () {
    [$tenant, $admin] = restaurantWithAdmin();
    $item = MenuItem::factory()->create(['tenant_id' => $tenant->id, 'price' => 100, 'is_active' => true]);

    postJson('/api/pos/shifts/open', ['opening_cash' => 0], bearer($admin))->assertCreated();

    // Find out what the order costs after VAT, then split it into 50 cash + remainder card.
    $probe = postJson('/api/pos/orders', [
        'type' => 'quick', 'payment_method' => 'cash', 'payment_status' => 'pending',
        'items' => [['menu_item_id' => $item->id, 'qty' => 1]],
    ], bearer($admin))->assertCreated();
    $grand = (float) $probe->json('data.grand_total');
    $probe = \App\Models\Order::withoutGlobalScopes()->find($probe->json('data.id'));
    $probe->update(['status' => 'cancelled']);

    postJson('/api/pos/orders', [
        'type' => 'quick', 'payment_method' => 'split', 'payment_status' => 'paid',
        'items' => [['menu_item_id' => $item->id, 'qty' => 1]],
        'split_payments' => [
            ['method' => 'cash', 'amount' => 50],
            ['method' => 'card', 'amount' => round($grand - 50, 2)],
        ],
    ], bearer($admin))->assertCreated();

    $closed = postJson('/api/pos/shifts/close', ['closing_cash' => 50], bearer($admin))->assertOk();

    expect((float) $closed->json('data.cash_variance'))->toEqual(0.0);
});

// ─── Registration → OTP → approval → login ──────────────────────────

test('a new restaurant can register, verify, get approved and log in', function () {
    Mail::fake();
    // The 'auth' limiter is 5/min per email+IP and this flow makes six auth calls.
    $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
    $plan = SubscriptionPlan::factory()->create(['is_active' => true]);
    $plan->modules()->sync(\App\Models\Module::pluck('id'));
    $super = User::factory()->superAdmin()->create();

    $registration = [
        'name' => 'New Owner',
        'email' => 'owner@newplace.test',
        'password' => 'secret-pass-1',
        'password_confirmation' => 'secret-pass-1',
        'restaurant_name' => 'New Place',
        'phone' => '01711111111',
        'plan_id' => $plan->id,
    ];

    $created = postJson('/api/auth/register', $registration)->assertCreated();
    $applicationId = $created->json('data.application_id');

    $code = null;
    Mail::assertSent(TenantOtpMail::class, function ($mail) use (&$code) {
        $code = $mail->code;

        // The email body must actually contain the code (a template/layout section
        // mismatch once sent mails with only the header and footer).
        $mail->assertSeeInHtml($code);

        return true;
    });

    postJson('/api/auth/login', ['email' => $registration['email'], 'password' => $registration['password']])
        ->assertForbidden();

    postJson('/api/auth/verify-otp', ['email' => $registration['email'], 'code' => '000000'])->assertStatus(422);
    postJson('/api/auth/verify-otp', ['email' => $registration['email'], 'code' => $code])->assertOk();

    // Verified but not yet approved: still locked out.
    postJson('/api/auth/login', ['email' => $registration['email'], 'password' => $registration['password']])
        ->assertForbidden();

    postJson("/api/admin/tenant-applications/{$applicationId}/approve", [], bearer($super))->assertOk();

    $login = postJson('/api/auth/login', ['email' => $registration['email'], 'password' => $registration['password']])
        ->assertOk();
    $headers = ['Authorization' => 'Bearer ' . $login->json('access_token')];

    getJson('/api/auth/me', $headers)->assertOk()->assertJsonPath('data.user.email', $registration['email']);
    getJson('/api/menu-items', $headers)->assertOk();
});

// ─── Tables ─────────────────────────────────────────────────────────

test('a table cannot be renamed to a number another table already uses', function () {
    [$tenant, $admin] = restaurantWithAdmin();
    RestaurantTable::factory()->create(['tenant_id' => $tenant->id, 'table_number' => 'A1']);
    $other = RestaurantTable::factory()->create(['tenant_id' => $tenant->id, 'table_number' => 'A2']);

    \Pest\Laravel\putJson("/api/tables/{$other->id}", ['table_number' => 'A1'], bearer($admin))
        ->assertStatus(422);

    expect($other->fresh()->table_number)->toBe('A2');
});

test('a table can keep its own number when other fields change', function () {
    [$tenant, $admin] = restaurantWithAdmin();
    $table = RestaurantTable::factory()->create(['tenant_id' => $tenant->id, 'table_number' => 'A1', 'capacity' => 2]);

    \Pest\Laravel\putJson("/api/tables/{$table->id}", ['table_number' => 'A1', 'capacity' => 6], bearer($admin))
        ->assertOk();

    expect($table->fresh()->capacity)->toBe(6);
});

// ─── Trial → paid upgrade ───────────────────────────────────────────

/** A restaurant four days into a 14-day free trial. */
function restaurantOnTrial(): array
{
    $plan = SubscriptionPlan::factory()->create(['is_active' => true, 'duration_days' => 30]);
    $plan->modules()->sync(\App\Models\Module::pluck('id'));
    $tenant = \App\Models\Tenant::factory()->create();
    app(\App\Services\SubscriptionService::class)->createTrialSubscription($tenant, $plan, 14);
    $admin = User::factory()->restaurantAdmin()->create(['tenant_id' => $tenant->id]);

    return [$tenant->fresh(), $admin, $plan];
}

test('upgrading during the trial ends the trial flag but keeps the remaining trial days', function () {
    [$tenant, , $plan] = restaurantOnTrial();
    expect($tenant->isOnTrial())->toBeTrue();
    $trialEnd = $tenant->trial_ends_at->copy();

    $paid = app(\App\Services\SubscriptionService::class)->createSubscription(
        tenant: $tenant,
        plan: $plan,
        paymentData: ['amount' => $plan->price, 'payment_method' => 'sslcommerz', 'transaction_id' => 'SUB-TEST-1'],
        initiatedBy: 'tenant',
    );

    $tenant = $tenant->fresh();

    // No more "Free trial / Upgrade Now" banner after paying…
    expect($tenant->isOnTrial())->toBeFalse()
        ->and($tenant->trial_ends_at)->toBeNull()
        ->and($tenant->hasActiveSubscription())->toBeTrue();

    // …and the unused trial days are not lost: the paid term starts when the trial ends.
    expect($paid->starts_at->isSameDay($trialEnd))->toBeTrue()
        ->and($paid->expires_at->isSameDay($trialEnd->copy()->addDays(30)))->toBeTrue();
});

test('after upgrading mid-trial the subscription endpoint reports an active paid plan', function () {
    [$tenant, $admin, $plan] = restaurantOnTrial();

    app(\App\Services\SubscriptionService::class)->createSubscription(
        tenant: $tenant,
        plan: $plan,
        paymentData: ['amount' => $plan->price, 'payment_method' => 'sslcommerz', 'transaction_id' => 'SUB-TEST-2'],
        initiatedBy: 'tenant',
    );

    getJson('/api/subscription/current', bearer($admin))
        ->assertOk()
        ->assertJsonPath('data.status', 'active')
        ->assertJsonPath('data.is_on_trial', false)
        ->assertJsonPath('data.expired', false);
    // Access is not lost while the paid term waits for the trial's end date.
    getJson('/api/pos/shifts/current', bearer($admin))->assertOk();
});

// ─── Subscription grace period ──────────────────────────────────────

/** A restaurant whose paid term ended yesterday and is inside its grace window. */
function restaurantInGrace(): array
{
    $tenant = \App\Models\Tenant::factory()->create();
    $sub = \App\Models\Subscription::factory()->create([
        'tenant_id' => $tenant->id,
        'status' => 'grace',
        'starts_at' => now()->subDays(31),
        'expires_at' => now()->subDay(),
        'grace_ends_at' => now()->addDays(2),
    ]);
    $admin = User::factory()->restaurantAdmin()->create(['tenant_id' => $tenant->id]);

    return [$tenant, $admin, $sub];
}

test('a restaurant in its grace period keeps its plan features', function () {
    [, $admin] = restaurantInGrace();

    // Passes the subscription middleware (grace), so the module gate must agree.
    getJson('/api/pos/shifts/current', bearer($admin))->assertOk();
});

test('the module list for a restaurant in grace still includes its plan modules', function () {
    [, $admin] = restaurantInGrace();

    $modules = getJson('/api/modules/my-access', bearer($admin))->assertOk()->json('data');

    expect(json_encode($modules))->toContain('pos');
});

test('a restaurant in its grace period can still take POS orders', function () {
    [$tenant, $admin] = restaurantInGrace();
    $item = MenuItem::factory()->create(['tenant_id' => $tenant->id, 'price' => 100, 'is_active' => true]);

    postJson('/api/pos/orders', [
        'type' => 'quick', 'payment_method' => 'cash', 'payment_status' => 'paid',
        'items' => [['menu_item_id' => $item->id, 'qty' => 1]],
    ], bearer($admin))->assertCreated();
});
