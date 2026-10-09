<?php

/**
 * Middleware Tests
 *
 * Tests subscription enforcement (402), tenant identification,
 * role checking, and rate limiting.
 */

use App\Models\Category;
use App\Models\Subscription;
use App\Models\Tenant;
use App\Models\User;

// ─── EnsureActiveSubscription Middleware ─────────────────────────────
test('expired subscription returns 402', function () {
    $tenant = Tenant::factory()->create();

    // Create expired subscription
    Subscription::factory()->expired()->create(['tenant_id' => $tenant->id]);

    $user = User::factory()->restaurantAdmin()->create(['tenant_id' => $tenant->id]);
    $token = auth('api')->login($user);

    $response = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/categories');

    $response->assertStatus(402)
        ->assertJsonFragment(['subscription_expired' => true]);
});

test('active subscription passes middleware', function () {
    $tenant = Tenant::factory()->create();
    Subscription::factory()->create(['tenant_id' => $tenant->id]);
    $user = User::factory()->restaurantAdmin()->create(['tenant_id' => $tenant->id]);
    $token = auth('api')->login($user);

    $response = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/categories');

    $response->assertOk();
});

test('super admin bypasses subscription check', function () {
    $admin = User::factory()->superAdmin()->create();
    $token = auth('api')->login($admin);

    $response = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/admin/tenants');

    $response->assertOk();
});

// ─── IdentifyTenant Middleware ──────────────────────────────────────
test('user without tenant gets 403', function () {
    $user = User::factory()->create([
        'tenant_id' => null,
        'role' => 'restaurant_admin',
    ]);
    $token = auth('api')->login($user);

    $response = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/categories');

    $response->assertStatus(403)
        ->assertJsonFragment(['message' => 'No tenant associated with this user.']);
});

test('user with inactive tenant gets 403', function () {
    $tenant = Tenant::factory()->inactive()->create();
    Subscription::factory()->create(['tenant_id' => $tenant->id]);
    $user = User::factory()->restaurantAdmin()->create(['tenant_id' => $tenant->id]);
    $token = auth('api')->login($user);

    $response = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/categories');

    $response->assertStatus(403)
        ->assertJsonFragment(['message' => 'Tenant account is inactive.']);
});

// ─── CheckRole Middleware ───────────────────────────────────────────
test('restaurant admin can access user management routes', function () {
    $tenant = Tenant::factory()->create();
    Subscription::factory()->create(['tenant_id' => $tenant->id]);
    $admin = User::factory()->restaurantAdmin()->create(['tenant_id' => $tenant->id]);
    $token = auth('api')->login($admin);

    $response = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/users');

    $response->assertOk();
});

test('staff cannot access user management routes', function () {
    $tenant = Tenant::factory()->create();
    Subscription::factory()->create(['tenant_id' => $tenant->id]);
    $staff = User::factory()->staff()->create(['tenant_id' => $tenant->id]);
    $token = auth('api')->login($staff);

    $response = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/users');

    $response->assertStatus(403);
});

test('kitchen cannot access user management routes', function () {
    $tenant = Tenant::factory()->create();
    Subscription::factory()->create(['tenant_id' => $tenant->id]);
    $kitchen = User::factory()->kitchen()->create(['tenant_id' => $tenant->id]);
    $token = auth('api')->login($kitchen);

    $response = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/users');

    $response->assertStatus(403);
});

// ─── ForceJsonResponse ──────────────────────────────────────────────
test('api responses are always json', function () {
    // Hit an existing API route — ForceJsonResponse middleware sets Accept: application/json
    $response = $this->get('/api/health');

    $response->assertHeader('Content-Type', 'application/json');
});

// ─── Health Check ───────────────────────────────────────────────────
test('public health check endpoint returns healthy', function () {
    $response = $this->getJson('/api/health');

    $response->assertOk()
        ->assertJsonStructure(['status', 'timestamp'])
        ->assertJsonPath('status', 'healthy');
});
