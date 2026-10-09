<?php

use App\Models\Subscription;
use App\Models\SubscriptionPlan;
use App\Models\Tenant;
use App\Models\User;
use PHPOpenSourceSaver\JWTAuth\Facades\JWTAuth;
use Illuminate\Support\Carbon;
use function Pest\Laravel\assertDatabaseHas;
use function Pest\Laravel\postJson;

beforeEach(function () {
    Carbon::setTestNow(Carbon::parse('2026-03-24 00:00:00'));
});

afterEach(function () {
    Carbon::setTestNow();
});

function superAdminAuthHeaders(): array
{
    $admin = User::factory()->superAdmin()->create();
    $token = JWTAuth::fromUser($admin);

    return [$admin, ['Authorization' => "Bearer {$token}"]];
}

test('renewing a subscription extends from the current expiry and stores an audit log', function () {
    [$admin, $headers] = superAdminAuthHeaders();

    $tenant = Tenant::factory()->create([
        'is_active' => false,
    ]);

    Subscription::factory()->create([
        'tenant_id' => $tenant->id,
        'starts_at' => now()->subDays(27)->toDateString(),
        'expires_at' => now()->addDays(3)->toDateString(),
        'status' => 'active',
    ]);

    $plan = SubscriptionPlan::factory()->create([
        'name' => 'Renewal Custom Plan',
        'slug' => 'renewal-custom-plan',
        'price' => 1500.00,
        'duration_days' => 30,
    ]);

    $response = postJson("/api/admin/subscriptions/{$tenant->id}/renew", [
        'plan_id' => $plan->id,
        'plan_type' => 'custom',
        'payment_method' => 'manual',
        'payment_ref' => 'TRX-1001',
        'notes' => 'Renewed by admin',
    ], $headers);

    $response->assertCreated()
        ->assertJsonPath('data.expires_at', '2026-04-26')
        ->assertJsonPath('data.renewal_base_date', '2026-03-27');

    assertDatabaseHas('subscriptions', [
        'tenant_id' => $tenant->id,
        'status' => 'expired',
        'expires_at' => '2026-03-27 00:00:00',
    ]);

    assertDatabaseHas('subscriptions', [
        'tenant_id' => $tenant->id,
        'status' => 'active',
        'plan_id' => $plan->id,
        'plan_type' => 'custom',
        'amount' => '1500.00',
        'starts_at' => '2026-03-24 00:00:00',
        'expires_at' => '2026-04-26 00:00:00',
    ]);

    $activeSubscription = Subscription::withoutGlobalScopes()
        ->where('tenant_id', $tenant->id)
        ->where('status', 'active')
        ->firstOrFail();

    assertDatabaseHas('audit_logs', [
        'action' => 'subscription_renewed',
        'subject_type' => Subscription::class,
        'subject_id' => $activeSubscription->id,
        'user_id' => $admin->id,
    ]);

    expect($tenant->fresh()->is_active)->toBeTrue();
    expect($activeSubscription->expires_at->toDateString())->toBe('2026-04-26');
});
