<?php

use App\Models\SubscriptionPlan;

/**
 * Authentication Tests
 *
 * Tests login, register, logout, refresh, role-based access.
 */

use App\Models\Subscription;
use App\Models\Tenant;
use App\Models\User;

// ─── Helpers ───────────────────────────────────────────────────────
function createTenantWithAdmin(array $tenantOverrides = [], array $userOverrides = []): array
{
    $tenant = Tenant::factory()->create($tenantOverrides);

    Subscription::factory()->create(['tenant_id' => $tenant->id]);

    $user = User::factory()->restaurantAdmin()->create(array_merge(
        ['tenant_id' => $tenant->id],
        $userOverrides,
    ));

    return [$tenant, $user];
}

function authHeader(User $user): array
{
    $token = auth('api')->login($user);
    return ['Authorization' => "Bearer {$token}"];
}

// ─── Login ─────────────────────────────────────────────────────────
test('user can login with valid credentials', function () {
    [$tenant, $user] = createTenantWithAdmin();

    $response = $this->postJson('/api/auth/login', [
        'email' => $user->email,
        'password' => 'password',
    ]);

    $response->assertOk()
        ->assertJsonStructure([
            'success',
            'access_token',
            'token_type',
            'expires_in',
            'user',
        ])
        ->assertJsonPath('success', true)
        ->assertJsonPath('token_type', 'bearer');
});

test('login fails with invalid credentials', function () {
    [$tenant, $user] = createTenantWithAdmin();

    $response = $this->postJson('/api/auth/login', [
        'email' => $user->email,
        'password' => 'wrong-password',
    ]);

    $response->assertStatus(401)
        ->assertJsonPath('success', false);
});

test('inactive user cannot login', function () {
    [$tenant, $user] = createTenantWithAdmin(userOverrides: [
        'status' => 'inactive',
    ]);

    $response = $this->postJson('/api/auth/login', [
        'email' => $user->email,
        'password' => 'password',
    ]);

    $response->assertStatus(403)
        ->assertJsonFragment(['message' => 'Account is inactive. Contact administrator.']);
});

test('login validates required fields', function () {
    $response = $this->postJson('/api/auth/login', []);

    $response->assertStatus(422);
});

// ─── Register ───────────────────────────────────────────────────────
test('user can register with valid data', function () {
    $plan = SubscriptionPlan::factory()->create();

    $response = $this->postJson('/api/auth/register', [
        'name' => 'New User',
        'email' => 'new@test.com',
        'password' => 'password123',
        'password_confirmation' => 'password123',
        'restaurant_name' => 'Test Restaurant',
        'phone' => '01700000000',
        'plan_id' => $plan->id,
    ]);

    $response->assertStatus(201)
        ->assertJsonPath('data.next_step', 'verify_email');

    $this->assertDatabaseHas('users', [
        'email' => 'new@test.com',
        'role' => 'restaurant_admin',
        'status' => 'pending',
    ]);
});

test('register fails with duplicate email', function () {
    User::factory()->create(['email' => 'taken@test.com']);

    $response = $this->postJson('/api/auth/register', [
        'name' => 'Another',
        'email' => 'taken@test.com',
        'password' => 'password123',
        'password_confirmation' => 'password123',
    ]);

    $response->assertStatus(422);
});

// ─── Authenticated Endpoints ────────────────────────────────────────
test('auth me returns current user with tenant', function () {
    [$tenant, $user] = createTenantWithAdmin();

    $response = $this->withHeaders(authHeader($user))
        ->getJson('/api/auth/me');

    $response->assertOk()
        ->assertJsonPath('data.user.id', $user->id)
        ->assertJsonPath('data.user.email', $user->email);
});

test('auth me fails without token', function () {
    $response = $this->getJson('/api/auth/me');

    $response->assertStatus(401);
});

test('user can logout', function () {
    [$tenant, $user] = createTenantWithAdmin();
    $headers = authHeader($user);

    $response = $this->withHeaders($headers)->postJson('/api/auth/logout');

    $response->assertOk()
        ->assertJsonPath('message', 'Logged out successfully');

    // Token should be invalidated
    $this->withHeaders($headers)->getJson('/api/auth/me')->assertStatus(401);
});

test('user can refresh token', function () {
    [$tenant, $user] = createTenantWithAdmin();

    $response = $this->withHeaders(authHeader($user))
        ->postJson('/api/auth/refresh');

    $response->assertOk()
        ->assertJsonStructure(['access_token']);
});

// ─── Role-based Access ──────────────────────────────────────────────
test('super admin can access admin routes', function () {
    $admin = User::factory()->superAdmin()->create();

    $response = $this->withHeaders(authHeader($admin))
        ->getJson('/api/admin/tenants');

    $response->assertOk();
});

test('restaurant admin cannot access admin routes', function () {
    [$tenant, $user] = createTenantWithAdmin();

    $response = $this->withHeaders(authHeader($user))
        ->getJson('/api/admin/tenants');

    $response->assertStatus(403);
});

test('staff cannot access admin routes', function () {
    $tenant = Tenant::factory()->create();
    Subscription::factory()->create(['tenant_id' => $tenant->id]);
    $staff = User::factory()->staff()->create(['tenant_id' => $tenant->id]);

    $response = $this->withHeaders(authHeader($staff))
        ->getJson('/api/admin/tenants');

    $response->assertStatus(403);
});

// ─── v1 versioned routes ────────────────────────────────────────────
test('v1 prefixed auth routes work', function () {
    [$tenant, $user] = createTenantWithAdmin();

    $response = $this->postJson('/api/v1/auth/login', [
        'email' => $user->email,
        'password' => 'password',
    ]);

    $response->assertOk()
        ->assertJsonPath('success', true);
});
