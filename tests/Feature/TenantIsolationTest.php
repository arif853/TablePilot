<?php

/**
 * Tenant Isolation Tests
 *
 * Verifies that tenant A cannot see or modify tenant B's data.
 * This is critical for multi-tenancy security.
 */

use App\Models\Category;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\RestaurantTable;
use App\Models\Subscription;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Voucher;

function setupTwoTenants(): array
{
    // Tenant A
    $tenantA = Tenant::factory()->create(['name' => 'Restaurant A']);
    Subscription::factory()->create(['tenant_id' => $tenantA->id]);
    $adminA = User::factory()->restaurantAdmin()->create(['tenant_id' => $tenantA->id]);

    // Tenant B
    $tenantB = Tenant::factory()->create(['name' => 'Restaurant B']);
    Subscription::factory()->create(['tenant_id' => $tenantB->id]);
    $adminB = User::factory()->restaurantAdmin()->create(['tenant_id' => $tenantB->id]);

    return [$tenantA, $adminA, $tenantB, $adminB];
}

function apiHeaders(User $user): array
{
    return ['Authorization' => 'Bearer ' . auth('api')->login($user)];
}

// ─── Category Isolation ─────────────────────────────────────────────
test('tenant A cannot see tenant B categories', function () {
    [$tenantA, $adminA, $tenantB, $adminB] = setupTwoTenants();

    $catA = Category::factory()->create(['tenant_id' => $tenantA->id, 'name' => 'A Starters']);
    $catB = Category::factory()->create(['tenant_id' => $tenantB->id, 'name' => 'B Starters']);

    $response = $this->withHeaders(apiHeaders($adminA))
        ->getJson('/api/categories');

    $response->assertOk();
    $names = collect($response->json('data'))->pluck('name');

    expect($names)->toContain('A Starters')
        ->not->toContain('B Starters');
});

// ─── Menu Item Isolation ────────────────────────────────────────────
test('tenant A cannot see tenant B menu items', function () {
    [$tenantA, $adminA, $tenantB, $adminB] = setupTwoTenants();

    $catA = Category::factory()->create(['tenant_id' => $tenantA->id]);
    $catB = Category::factory()->create(['tenant_id' => $tenantB->id]);

    MenuItem::factory()->create([
        'tenant_id' => $tenantA->id,
        'category_id' => $catA->id,
        'name' => 'A Biriyani',
    ]);
    MenuItem::factory()->create([
        'tenant_id' => $tenantB->id,
        'category_id' => $catB->id,
        'name' => 'B Biriyani',
    ]);

    $response = $this->withHeaders(apiHeaders($adminA))
        ->getJson('/api/menu-items');

    $response->assertOk();
    $names = collect($response->json('data'))->pluck('name');

    expect($names)->toContain('A Biriyani')
        ->not->toContain('B Biriyani');
});

// ─── Order Isolation ────────────────────────────────────────────────
test('tenant A cannot see tenant B orders', function () {
    [$tenantA, $adminA, $tenantB, $adminB] = setupTwoTenants();

    Order::factory()->create([
        'tenant_id' => $tenantA->id,
        'order_number' => 'ORD-AAA001',
    ]);
    Order::factory()->create([
        'tenant_id' => $tenantB->id,
        'order_number' => 'ORD-BBB001',
    ]);

    $response = $this->withHeaders(apiHeaders($adminA))
        ->getJson('/api/orders');

    $response->assertOk();
    $orderNumbers = collect($response->json('data'))->pluck('order_number');

    expect($orderNumbers)->toContain('ORD-AAA001')
        ->not->toContain('ORD-BBB001');
});

// ─── Table Isolation ────────────────────────────────────────────────
test('tenant A cannot see tenant B tables', function () {
    [$tenantA, $adminA, $tenantB, $adminB] = setupTwoTenants();

    RestaurantTable::factory()->create([
        'tenant_id' => $tenantA->id,
        'table_number' => 'A-1',
    ]);
    RestaurantTable::factory()->create([
        'tenant_id' => $tenantB->id,
        'table_number' => 'B-1',
    ]);

    $response = $this->withHeaders(apiHeaders($adminA))
        ->getJson('/api/tables');

    $response->assertOk();
    $numbers = collect($response->json('data'))->pluck('table_number');

    expect($numbers)->toContain('A-1')
        ->not->toContain('B-1');
});

// ─── Voucher Isolation ──────────────────────────────────────────────
test('tenant A cannot see tenant B vouchers', function () {
    [$tenantA, $adminA, $tenantB, $adminB] = setupTwoTenants();

    Voucher::factory()->create([
        'tenant_id' => $tenantA->id,
        'code' => 'CODEA',
    ]);
    Voucher::factory()->create([
        'tenant_id' => $tenantB->id,
        'code' => 'CODEB',
    ]);

    $response = $this->withHeaders(apiHeaders($adminA))
        ->getJson('/api/vouchers');

    $response->assertOk();
    $codes = collect($response->json('data'))->pluck('code');

    expect($codes)->toContain('CODEA')
        ->not->toContain('CODEB');
});

// ─── Cross-tenant modification blocked ──────────────────────────────
test('tenant A cannot update tenant B category', function () {
    [$tenantA, $adminA, $tenantB, $adminB] = setupTwoTenants();

    $catB = Category::factory()->create([
        'tenant_id' => $tenantB->id,
        'name' => 'B Original',
    ]);

    $response = $this->withHeaders(apiHeaders($adminA))
        ->putJson("/api/categories/{$catB->id}", [
            'name' => 'Hacked',
        ]);

    // Should either 404 (global scope hides it) or 403
    expect($response->status())->toBeIn([404, 403]);

    // Verify unchanged
    expect($catB->fresh()->name)->toBe('B Original');
});

test('tenant A cannot delete tenant B menu item', function () {
    [$tenantA, $adminA, $tenantB, $adminB] = setupTwoTenants();

    $catB = Category::factory()->create(['tenant_id' => $tenantB->id]);
    $itemB = MenuItem::factory()->create([
        'tenant_id' => $tenantB->id,
        'category_id' => $catB->id,
    ]);

    $response = $this->withHeaders(apiHeaders($adminA))
        ->deleteJson("/api/menu-items/{$itemB->id}");

    expect($response->status())->toBeIn([404, 403]);

    // Menu item should still exist (bypass tenant scope for assertion)
    expect(MenuItem::withoutGlobalScopes()->find($itemB->id))->not->toBeNull();
});

// ─── Super admin bypass ─────────────────────────────────────────────
test('super admin can see all tenants', function () {
    [$tenantA, $adminA, $tenantB, $adminB] = setupTwoTenants();
    $superAdmin = User::factory()->superAdmin()->create();

    $response = $this->withHeaders(apiHeaders($superAdmin))
        ->getJson('/api/admin/tenants');

    $response->assertOk();
    $names = collect($response->json('data'))->pluck('name');

    expect($names)->toContain('Restaurant A')
        ->and($names)->toContain('Restaurant B');
});

// ─── User Isolation ─────────────────────────────────────────────────
test('restaurant admin only sees own tenant users', function () {
    [$tenantA, $adminA, $tenantB, $adminB] = setupTwoTenants();

    User::factory()->staff()->create([
        'tenant_id' => $tenantA->id,
        'name' => 'Staff A',
    ]);
    User::factory()->staff()->create([
        'tenant_id' => $tenantB->id,
        'name' => 'Staff B',
    ]);

    $response = $this->withHeaders(apiHeaders($adminA))
        ->getJson('/api/users');

    $response->assertOk();
    $names = collect($response->json('data'))->pluck('name');

    expect($names)->toContain('Staff A')
        ->not->toContain('Staff B');
});
