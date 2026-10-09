<?php

/**
 * API CRUD Tests
 *
 * Tests Category, MenuItem, Table, Voucher, and User CRUD operations.
 */

use App\Models\Category;
use App\Models\MenuItem;
use App\Models\RestaurantTable;
use App\Models\Subscription;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Voucher;

// ─── Setup ──────────────────────────────────────────────────────────
function setupAuthTenant(): array
{
    $tenant = Tenant::factory()->vatRegistered()->create();
    Subscription::factory()->create(['tenant_id' => $tenant->id]);
    $admin = User::factory()->restaurantAdmin()->create(['tenant_id' => $tenant->id]);
    $token = auth('api')->login($admin);

    return [$tenant, $admin, ['Authorization' => "Bearer {$token}"]];
}

// ═══════════════════════════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════════════════════════
test('can list categories', function () {
    [$tenant, $admin, $headers] = setupAuthTenant();
    Category::factory()->count(3)->create(['tenant_id' => $tenant->id]);

    $response = $this->withHeaders($headers)->getJson('/api/categories');

    $response->assertOk();
    expect(count($response->json('data')))->toBe(3);
});

test('can create a category', function () {
    [$tenant, $admin, $headers] = setupAuthTenant();

    $response = $this->withHeaders($headers)->postJson('/api/categories', [
        'name' => 'Appetizers',
        'description' => 'Start your meal',
        'sort_order' => 1,
    ]);

    $response->assertStatus(201)
        ->assertJsonPath('data.name', 'Appetizers');

    $this->assertDatabaseHas('categories', [
        'tenant_id' => $tenant->id,
        'name' => 'Appetizers',
    ]);
});

test('can update a category', function () {
    [$tenant, $admin, $headers] = setupAuthTenant();
    $category = Category::factory()->create(['tenant_id' => $tenant->id, 'name' => 'Old']);

    $response = $this->withHeaders($headers)->putJson("/api/categories/{$category->id}", [
        'name' => 'Updated',
    ]);

    $response->assertOk()
        ->assertJsonPath('data.name', 'Updated');
});

test('can delete a category', function () {
    [$tenant, $admin, $headers] = setupAuthTenant();
    $category = Category::factory()->create(['tenant_id' => $tenant->id]);

    $response = $this->withHeaders($headers)->deleteJson("/api/categories/{$category->id}");

    $response->assertOk();
    $this->assertDatabaseMissing('categories', ['id' => $category->id]);
});

// ═══════════════════════════════════════════════════════════════════
// MENU ITEMS
// ═══════════════════════════════════════════════════════════════════
test('can list menu items', function () {
    [$tenant, $admin, $headers] = setupAuthTenant();
    $cat = Category::factory()->create(['tenant_id' => $tenant->id]);
    MenuItem::factory()->count(3)->create([
        'tenant_id' => $tenant->id,
        'category_id' => $cat->id,
    ]);

    $response = $this->withHeaders($headers)->getJson('/api/menu-items');

    $response->assertOk();
    expect(count($response->json('data')))->toBe(3);
});

test('can create a menu item', function () {
    [$tenant, $admin, $headers] = setupAuthTenant();
    $cat = Category::factory()->create(['tenant_id' => $tenant->id]);

    $response = $this->withHeaders($headers)->postJson('/api/menu-items', [
        'category_id' => $cat->id,
        'name' => 'Chicken Biriyani',
        'price' => 250.00,
        'is_active' => true,
    ]);

    $response->assertStatus(201)
        ->assertJsonPath('data.name', 'Chicken Biriyani');
});

test('can update a menu item', function () {
    [$tenant, $admin, $headers] = setupAuthTenant();
    $cat = Category::factory()->create(['tenant_id' => $tenant->id]);
    $item = MenuItem::factory()->create([
        'tenant_id' => $tenant->id,
        'category_id' => $cat->id,
        'price' => 200,
    ]);

    $response = $this->withHeaders($headers)->putJson("/api/menu-items/{$item->id}", [
        'price' => 350,
    ]);

    $response->assertOk()
        ->assertJsonPath('data.price', '350.00');
});

test('can soft delete a menu item', function () {
    [$tenant, $admin, $headers] = setupAuthTenant();
    $cat = Category::factory()->create(['tenant_id' => $tenant->id]);
    $item = MenuItem::factory()->create([
        'tenant_id' => $tenant->id,
        'category_id' => $cat->id,
    ]);

    $response = $this->withHeaders($headers)->deleteJson("/api/menu-items/{$item->id}");

    $response->assertOk();
    expect(MenuItem::find($item->id))->toBeNull();
    expect(MenuItem::withTrashed()->find($item->id))->not->toBeNull();
});

test('can toggle menu item availability', function () {
    [$tenant, $admin, $headers] = setupAuthTenant();
    $cat = Category::factory()->create(['tenant_id' => $tenant->id]);
    $item = MenuItem::factory()->create([
        'tenant_id' => $tenant->id,
        'category_id' => $cat->id,
        'is_active' => true,
    ]);

    $response = $this->withHeaders($headers)->patchJson("/api/menu-items/{$item->id}/toggle");

    $response->assertOk();
    expect($item->fresh()->is_active)->toBeFalse();
});

test('can restore a soft-deleted menu item', function () {
    [$tenant, $admin, $headers] = setupAuthTenant();
    $cat = Category::factory()->create(['tenant_id' => $tenant->id]);
    $item = MenuItem::factory()->create([
        'tenant_id' => $tenant->id,
        'category_id' => $cat->id,
    ]);
    $item->delete();

    $response = $this->withHeaders($headers)->postJson("/api/menu-items/{$item->id}/restore");

    $response->assertOk();
    expect(MenuItem::find($item->id))->not->toBeNull();
});

// ═══════════════════════════════════════════════════════════════════
// TABLES
// ═══════════════════════════════════════════════════════════════════
test('can list tables', function () {
    [$tenant, $admin, $headers] = setupAuthTenant();
    RestaurantTable::factory()->count(5)->create(['tenant_id' => $tenant->id]);

    $response = $this->withHeaders($headers)->getJson('/api/tables');

    $response->assertOk();
    expect(count($response->json('data')))->toBe(5);
});

test('can create a table', function () {
    [$tenant, $admin, $headers] = setupAuthTenant();

    $response = $this->withHeaders($headers)->postJson('/api/tables', [
        'table_number' => 'T1',
        'capacity' => 4,
    ]);

    $response->assertStatus(201)
        ->assertJsonPath('data.table_number', 'T1');
});

test('cannot create duplicate table number', function () {
    [$tenant, $admin, $headers] = setupAuthTenant();
    RestaurantTable::factory()->create([
        'tenant_id' => $tenant->id,
        'table_number' => 'T1',
    ]);

    $response = $this->withHeaders($headers)->postJson('/api/tables', [
        'table_number' => 'T1',
        'capacity' => 4,
    ]);

    $response->assertStatus(422);
});

test('can delete a table without active orders', function () {
    [$tenant, $admin, $headers] = setupAuthTenant();
    $table = RestaurantTable::factory()->create(['tenant_id' => $tenant->id]);

    $response = $this->withHeaders($headers)->deleteJson("/api/tables/{$table->id}");

    $response->assertOk();
    $this->assertDatabaseMissing('restaurant_tables', ['id' => $table->id]);
});

// ═══════════════════════════════════════════════════════════════════
// VOUCHERS
// ═══════════════════════════════════════════════════════════════════
test('can list vouchers', function () {
    [$tenant, $admin, $headers] = setupAuthTenant();
    Voucher::factory()->count(3)->create(['tenant_id' => $tenant->id]);

    $response = $this->withHeaders($headers)->getJson('/api/vouchers');

    $response->assertOk();
    expect(count($response->json('data')))->toBe(3);
});

test('can create a voucher', function () {
    [$tenant, $admin, $headers] = setupAuthTenant();

    $response = $this->withHeaders($headers)->postJson('/api/vouchers', [
        'code' => 'SUMMER20',
        'discount_value' => 20,
        'type' => 'percentage',
        'min_purchase' => 500,
        'expiry_date' => now()->addDays(30)->toDateString(),
        'is_active' => true,
        'max_uses' => 100,
    ]);

    $response->assertStatus(201)
        ->assertJsonPath('data.code', 'SUMMER20');
});

test('cannot create duplicate voucher code within tenant', function () {
    [$tenant, $admin, $headers] = setupAuthTenant();
    Voucher::factory()->create([
        'tenant_id' => $tenant->id,
        'code' => 'DUPE',
    ]);

    $response = $this->withHeaders($headers)->postJson('/api/vouchers', [
        'code' => 'DUPE',
        'discount_value' => 10,
        'type' => 'percentage',
        'min_purchase' => 0,
        'expiry_date' => now()->addDays(30)->toDateString(),
    ]);

    $response->assertStatus(422);
});

// ═══════════════════════════════════════════════════════════════════
// USERS (restaurant admin managing staff)
// ═══════════════════════════════════════════════════════════════════
test('restaurant admin can list own tenant users', function () {
    [$tenant, $admin, $headers] = setupAuthTenant();
    User::factory()->staff()->count(2)->create(['tenant_id' => $tenant->id]);

    $response = $this->withHeaders($headers)->getJson('/api/users');

    $response->assertOk();
    // Admin + 2 staff
    expect(count($response->json('data')))->toBe(3);
});

test('restaurant admin can create staff user', function () {
    [$tenant, $admin, $headers] = setupAuthTenant();

    $response = $this->withHeaders($headers)->postJson('/api/users', [
        'name' => 'New Staff',
        'email' => 'staff@test.com',
        'password' => 'password123',
        'role' => 'staff',
    ]);

    $response->assertStatus(201)
        ->assertJsonPath('data.role', 'staff');

    $this->assertDatabaseHas('users', [
        'email' => 'staff@test.com',
        'tenant_id' => $tenant->id,
        'role' => 'staff',
    ]);
});

test('restaurant admin can deactivate staff user', function () {
    [$tenant, $admin, $headers] = setupAuthTenant();
    $staff = User::factory()->staff()->create(['tenant_id' => $tenant->id]);

    $response = $this->withHeaders($headers)->deleteJson("/api/users/{$staff->id}");

    $response->assertOk();
    expect($staff->fresh()->status)->toBe('inactive');
});

test('user cannot deactivate themselves', function () {
    [$tenant, $admin, $headers] = setupAuthTenant();

    $response = $this->withHeaders($headers)->deleteJson("/api/users/{$admin->id}");

    $response->assertStatus(422);
});

// ═══════════════════════════════════════════════════════════════════
// AUDIT LOGGING
// ═══════════════════════════════════════════════════════════════════
test('category CRUD creates audit log entries', function () {
    [$tenant, $admin, $headers] = setupAuthTenant();

    // Create
    $response = $this->withHeaders($headers)->postJson('/api/categories', [
        'name' => 'Audit Test',
        'sort_order' => 1,
    ]);
    $response->assertStatus(201);
    $categoryId = $response->json('data.id');

    // Update
    $this->withHeaders($headers)->putJson("/api/categories/{$categoryId}", [
        'name' => 'Audit Updated',
    ])->assertOk();

    // Delete
    $this->withHeaders($headers)->deleteJson("/api/categories/{$categoryId}")->assertOk();

    $this->assertDatabaseHas('audit_logs', [
        'action' => 'created',
        'subject_type' => 'App\\Models\\Category',
        'subject_id' => $categoryId,
    ]);

    $this->assertDatabaseHas('audit_logs', [
        'action' => 'updated',
        'subject_type' => 'App\\Models\\Category',
        'subject_id' => $categoryId,
    ]);

    $this->assertDatabaseHas('audit_logs', [
        'action' => 'deleted',
        'subject_type' => 'App\\Models\\Category',
        'subject_id' => $categoryId,
    ]);
});

test('login creates audit log entry', function () {
    $tenant = Tenant::factory()->create();
    Subscription::factory()->create(['tenant_id' => $tenant->id]);
    $user = User::factory()->restaurantAdmin()->create(['tenant_id' => $tenant->id]);

    $this->postJson('/api/auth/login', [
        'email' => $user->email,
        'password' => 'password',
    ])->assertOk();

    $this->assertDatabaseHas('audit_logs', [
        'action' => 'login',
        'user_id' => $user->id,
    ]);
});
