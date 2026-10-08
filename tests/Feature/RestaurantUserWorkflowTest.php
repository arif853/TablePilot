<?php

use App\Models\Category;
use App\Models\Subscription;
use App\Models\SubscriptionPlan;
use App\Models\Tenant;
use App\Models\User;
use PHPOpenSourceSaver\JWTAuth\Facades\JWTAuth;
use function Pest\Laravel\deleteJson;
use function Pest\Laravel\getJson;
use function Pest\Laravel\postJson;
use function Pest\Laravel\putJson;

/**
 * A tenant on an active plan that includes user management, with one restaurant admin.
 */
function restaurantWithAdmin(int $maxUsers = 5): array
{
    $plan = SubscriptionPlan::factory()->create(['max_users' => $maxUsers]);
    $plan->modules()->sync(\App\Models\Module::pluck('id'));

    $tenant = Tenant::factory()->create(['max_users' => $maxUsers]);
    Subscription::factory()->create([
        'tenant_id' => $tenant->id,
        'plan_id' => $plan->id,
        'status' => 'active',
        'starts_at' => now()->subDay(),
        'expires_at' => now()->addMonth(),
    ]);

    $admin = User::factory()->restaurantAdmin()->create(['tenant_id' => $tenant->id]);

    return [$tenant, $admin];
}

function bearer(User $user): array
{
    return ['Authorization' => 'Bearer ' . JWTAuth::fromUser($user)];
}

test('staff and kitchen can read the menu but cannot change it', function () {
    [$tenant] = restaurantWithAdmin();
    $staff = User::factory()->staff()->create(['tenant_id' => $tenant->id]);
    $kitchen = User::factory()->kitchen()->create(['tenant_id' => $tenant->id]);
    $category = Category::factory()->create(['tenant_id' => $tenant->id]);

    foreach ([$staff, $kitchen] as $user) {
        getJson('/api/menu-items', bearer($user))->assertOk();
        getJson('/api/categories', bearer($user))->assertOk();

        postJson('/api/categories', ['name' => 'Desserts'], bearer($user))->assertForbidden();
        deleteJson("/api/categories/{$category->id}", [], bearer($user))->assertForbidden();
        postJson('/api/tables', ['name' => 'T9'], bearer($user))->assertForbidden();
        getJson('/api/vouchers', bearer($user))->assertForbidden();
    }
});

test('kitchen users cannot take payments or cancel orders', function () {
    [$tenant] = restaurantWithAdmin();
    $kitchen = User::factory()->kitchen()->create(['tenant_id' => $tenant->id]);

    postJson('/api/orders/1/mark-paid', [], bearer($kitchen))->assertForbidden();
    postJson('/api/orders/1/cancel', [], bearer($kitchen))->assertForbidden();
});

test('parcel QR route is no longer swallowed by the table show route', function () {
    $route = app('router')->getRoutes()->match(\Illuminate\Http\Request::create('/api/tables/parcel-qr', 'GET'));

    expect($route->getActionMethod())->toBe('generateParcelQr');
});

test('a deactivated user is locked out on their existing token', function () {
    [$tenant] = restaurantWithAdmin();
    $staff = User::factory()->staff()->create(['tenant_id' => $tenant->id]);
    $headers = bearer($staff);

    getJson('/api/auth/me', $headers)->assertOk();

    $staff->update(['status' => 'inactive']);
    // Each real request resolves the user fresh; drop the guard's cached instance to match
    app('auth')->forgetGuards();

    getJson('/api/auth/me', $headers)->assertUnauthorized();
    postJson('/api/auth/refresh', [], $headers)->assertUnauthorized();
});

test('restaurant admin can edit their own profile but not their own role or status', function () {
    [, $admin] = restaurantWithAdmin();

    // The edit form re-sends the unchanged role
    putJson("/api/users/{$admin->id}", ['name' => 'Owner Renamed', 'role' => 'restaurant_admin'], bearer($admin))
        ->assertOk()
        ->assertJsonPath('data.name', 'Owner Renamed');

    putJson("/api/users/{$admin->id}", ['role' => 'staff'], bearer($admin))->assertUnprocessable();
    putJson("/api/users/{$admin->id}", ['status' => 'inactive'], bearer($admin))->assertUnprocessable();
});

test('restaurant admin can only create staff and kitchen users, within the seat limit', function () {
    [$tenant, $admin] = restaurantWithAdmin(maxUsers: 2);

    postJson('/api/users', [
        'name' => 'Second Admin', 'email' => 'second@example.test', 'password' => 'password123', 'role' => 'restaurant_admin',
    ], bearer($admin))->assertUnprocessable();

    postJson('/api/users', [
        'name' => 'Waiter', 'email' => 'waiter@example.test', 'password' => 'password123', 'role' => 'staff',
    ], bearer($admin))->assertCreated();

    postJson('/api/users', [
        'name' => 'Cook', 'email' => 'cook@example.test', 'password' => 'password123', 'role' => 'kitchen',
    ], bearer($admin))->assertUnprocessable();

    getJson('/api/users', bearer($admin))
        ->assertOk()
        ->assertJsonPath('seats.used', 2)
        ->assertJsonPath('seats.max', 2);
});

test('restaurant admin can deactivate and reactivate staff', function () {
    [$tenant, $admin] = restaurantWithAdmin();
    $staff = User::factory()->staff()->create(['tenant_id' => $tenant->id]);

    putJson("/api/users/{$staff->id}", ['status' => 'inactive'], bearer($admin))->assertOk();
    putJson("/api/users/{$staff->id}", ['status' => 'active'], bearer($admin))->assertOk();
});

test('restaurant admin cannot see or manage another restaurant\'s users', function () {
    [, $admin] = restaurantWithAdmin();
    [$otherTenant] = restaurantWithAdmin();
    $foreignStaff = User::factory()->staff()->create(['tenant_id' => $otherTenant->id]);

    getJson("/api/users/{$foreignStaff->id}", bearer($admin))->assertNotFound();
    putJson("/api/users/{$foreignStaff->id}", ['status' => 'inactive'], bearer($admin))->assertNotFound();
});

test('a restaurant always keeps at least one active admin', function () {
    [$tenant, $admin] = restaurantWithAdmin();
    $superAdmin = User::factory()->superAdmin()->create();

    putJson("/api/admin/users/{$admin->id}", ['role' => 'staff'], bearer($superAdmin))->assertUnprocessable();
    deleteJson("/api/admin/users/{$admin->id}", [], bearer($superAdmin))->assertUnprocessable();

    User::factory()->restaurantAdmin()->create(['tenant_id' => $tenant->id]);

    deleteJson("/api/admin/users/{$admin->id}", [], bearer($superAdmin))->assertOk();
});

test('every user can update their own profile and password', function () {
    [$tenant] = restaurantWithAdmin();
    $kitchen = User::factory()->kitchen()->create(['tenant_id' => $tenant->id, 'password' => 'old-password-1']);

    putJson('/api/profile', ['name' => 'Chef Renamed'], bearer($kitchen))->assertOk();

    putJson('/api/profile/password', [
        'current_password' => 'wrong-password',
        'password' => 'new-password-1',
        'password_confirmation' => 'new-password-1',
    ], bearer($kitchen))->assertUnprocessable();

    putJson('/api/profile/password', [
        'current_password' => 'old-password-1',
        'password' => 'new-password-1',
        'password_confirmation' => 'new-password-1',
    ], bearer($kitchen))->assertOk();

    expect(\Illuminate\Support\Facades\Hash::check('new-password-1', $kitchen->fresh()->password))->toBeTrue();
});
