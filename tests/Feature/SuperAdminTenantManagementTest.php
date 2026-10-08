<?php

use App\Models\Subscription;
use App\Models\SubscriptionPlan;
use App\Models\Tenant;
use App\Models\TenantApplication;
use App\Models\User;
use App\Services\SubscriptionService;
use Illuminate\Support\Facades\Mail;
use PHPOpenSourceSaver\JWTAuth\Facades\JWTAuth;
use function Pest\Laravel\getJson;
use function Pest\Laravel\postJson;
use function Pest\Laravel\putJson;

function tenantManagementAdminHeaders(): array
{
    $admin = User::factory()->superAdmin()->create();

    return ['Authorization' => 'Bearer ' . JWTAuth::fromUser($admin)];
}

function onboardPayload(SubscriptionPlan $plan, array $overrides = []): array
{
    return array_merge([
        'name' => 'Trial Bistro',
        'email' => 'bistro@example.test',
        'payment_mode' => 'seller',
        'admin_name' => 'Bistro Owner',
        'admin_email' => 'owner@bistro.example.test',
        'admin_password' => 'secret-pass-123',
        'plan_id' => $plan->id,
        'plan_type' => 'monthly',
        'subscription_amount' => 0,
    ], $overrides);
}

test('static tenant and subscription routes are not swallowed by the resource show routes', function () {
    $headers = tenantManagementAdminHeaders();
    Tenant::factory()->create();

    getJson('/api/admin/tenants/export', $headers)->assertOk();
    getJson('/api/admin/subscriptions/expiring-soon', $headers)
        ->assertOk()
        ->assertJsonStructure(['data' => ['critical', 'warning', 'upcoming', 'counts']]);
});

test('tenant index filters by status and search and can return every tenant for dropdowns', function () {
    $headers = tenantManagementAdminHeaders();
    Tenant::factory()->create(['name' => 'Alpha Kitchen', 'is_active' => true]);
    Tenant::factory()->create(['name' => 'Beta Grill', 'is_active' => false]);
    Tenant::factory()->count(20)->create(['is_active' => true]);

    getJson('/api/admin/tenants?status=inactive', $headers)
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.name', 'Beta Grill');

    getJson('/api/admin/tenants?search=Alpha', $headers)
        ->assertOk()
        ->assertJsonCount(1, 'data');

    getJson('/api/admin/tenants?all=1', $headers)
        ->assertOk()
        ->assertJsonCount(22, 'data');
});

test('onboarding with start_trial creates a trial subscription that grants access', function () {
    $headers = tenantManagementAdminHeaders();
    $plan = SubscriptionPlan::factory()->create(['trial_days' => 10, 'max_users' => 7]);

    postJson('/api/admin/tenants', onboardPayload($plan, ['start_trial' => true]), $headers)
        ->assertCreated();

    $tenant = Tenant::where('email', 'bistro@example.test')->firstOrFail();
    $subscription = Subscription::withoutGlobalScopes()->where('tenant_id', $tenant->id)->sole();

    expect($subscription->is_trial)->toBeTrue()
        ->and((float) $subscription->amount)->toBe(0.0)
        ->and($subscription->expires_at->isSameDay(now()->addDays(10)))->toBeTrue()
        ->and($tenant->max_users)->toBe(7)
        ->and($tenant->trial_ends_at)->not->toBeNull()
        ->and(app(SubscriptionService::class)->getAccessStatus($tenant))->toBe('trial');
});

test('onboarding a trial requires a plan', function () {
    $headers = tenantManagementAdminHeaders();
    $plan = SubscriptionPlan::factory()->create();

    postJson('/api/admin/tenants', onboardPayload($plan, ['plan_id' => null, 'start_trial' => true]), $headers)
        ->assertUnprocessable()
        ->assertJsonValidationErrors('plan_id');
});

test('approving an application on a trial plan creates a trial subscription', function () {
    Mail::fake();
    $headers = tenantManagementAdminHeaders();
    $plan = SubscriptionPlan::factory()->create(['trial_days' => 14]);
    $applicant = User::factory()->restaurantAdmin()->pending()->create(['tenant_id' => null]);

    $application = TenantApplication::create([
        'user_id' => $applicant->id,
        'plan_id' => $plan->id,
        'restaurant_name' => 'Applicant Cafe',
        'phone' => '01700000000',
        'status' => 'pending',
        'email_verified_at' => now(),
    ]);

    postJson("/api/admin/tenant-applications/{$application->id}/approve", [], $headers)->assertOk();

    $tenant = Tenant::where('email', $applicant->email)->firstOrFail();

    expect(app(SubscriptionService::class)->getAccessStatus($tenant))->toBe('trial');
});

test('approving an application whose email already belongs to a tenant returns a validation error', function () {
    Mail::fake();
    $headers = tenantManagementAdminHeaders();
    $plan = SubscriptionPlan::factory()->create();
    $applicant = User::factory()->restaurantAdmin()->pending()->create(['tenant_id' => null]);
    Tenant::factory()->create(['email' => $applicant->email]);

    $application = TenantApplication::create([
        'user_id' => $applicant->id,
        'plan_id' => $plan->id,
        'restaurant_name' => 'Duplicate Cafe',
        'phone' => '01700000000',
        'status' => 'pending',
        'email_verified_at' => now(),
    ]);

    postJson("/api/admin/tenant-applications/{$application->id}/approve", [], $headers)
        ->assertUnprocessable();

    expect($application->fresh()->status)->toBe('pending');
});

test('super admin can list users with their tenant and filter by status', function () {
    $headers = tenantManagementAdminHeaders();
    $tenant = Tenant::factory()->create();
    User::factory()->staff()->create(['tenant_id' => $tenant->id]);
    User::factory()->staff()->inactive()->create(['tenant_id' => $tenant->id]);

    getJson("/api/admin/users?tenant_id={$tenant->id}&status=inactive", $headers)
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.tenant.id', $tenant->id);
});

test('reactivating a user respects the tenant user limit', function () {
    $headers = tenantManagementAdminHeaders();
    $tenant = Tenant::factory()->create(['max_users' => 1]);
    User::factory()->staff()->create(['tenant_id' => $tenant->id]);
    $inactive = User::factory()->staff()->inactive()->create(['tenant_id' => $tenant->id]);

    putJson("/api/admin/users/{$inactive->id}", ['status' => 'active'], $headers)
        ->assertUnprocessable();

    $tenant->update(['max_users' => 2]);

    putJson("/api/admin/users/{$inactive->id}", ['status' => 'active'], $headers)
        ->assertOk()
        ->assertJsonPath('data.status', 'active');
});

test('super admin role and status cannot be changed through the user endpoint', function () {
    $headers = tenantManagementAdminHeaders();
    $otherAdmin = User::factory()->superAdmin()->create();

    putJson("/api/admin/users/{$otherAdmin->id}", ['role' => 'staff'], $headers)
        ->assertUnprocessable();

    putJson("/api/admin/users/{$otherAdmin->id}", ['name' => 'Renamed Admin'], $headers)
        ->assertOk();
});
