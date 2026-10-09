<?php

use App\Models\RestaurantTable;

// restaurantWithAdmin() and bearer() live in tests/Pest.php

test('viewing a table QR keeps the same link so printed cards stay valid', function () {
    [$tenant, $admin] = restaurantWithAdmin();
    $table = RestaurantTable::factory()->create(['tenant_id' => $tenant->id, 'table_number' => 'T7']);

    $first = $this->getJson("/api/tables/{$table->id}/qr", bearer($admin))->assertOk()->json('data.qr_url');
    $second = $this->getJson("/api/tables/{$table->id}/qr", bearer($admin))->assertOk()->json('data.qr_url');

    expect($second)->toBe($first)
        ->and($first)->toContain("/restaurant/{$tenant->slug}?table={$table->id}&qr=");
});

test('a table without an identifier gets one on first view', function () {
    [$tenant, $admin] = restaurantWithAdmin();
    $table = RestaurantTable::factory()->create(['tenant_id' => $tenant->id, 'qr_code' => null]);

    $this->getJson("/api/tables/{$table->id}/qr", bearer($admin))->assertOk();

    expect($table->fresh()->qr_code)->toStartWith('TBL-');
});

test('qr-codes returns a card for every table and is not swallowed by the table show route', function () {
    [$tenant, $admin] = restaurantWithAdmin();
    RestaurantTable::factory()->count(3)->create(['tenant_id' => $tenant->id]);

    $this->getJson('/api/tables/qr-codes', bearer($admin))
        ->assertOk()
        ->assertJsonCount(3, 'data')
        ->assertJsonStructure(['data' => [['table' => ['id', 'table_number', 'capacity'], 'qr_url']]]);
});

test('qr-codes only includes the restaurant\'s own tables', function () {
    [$tenant, $admin] = restaurantWithAdmin();
    [$otherTenant] = restaurantWithAdmin();
    RestaurantTable::factory()->create(['tenant_id' => $tenant->id]);
    RestaurantTable::factory()->count(2)->create(['tenant_id' => $otherTenant->id]);

    $this->getJson('/api/tables/qr-codes', bearer($admin))->assertOk()->assertJsonCount(1, 'data');
});

test('the takeaway QR link is stable', function () {
    [, $admin] = restaurantWithAdmin();

    $first = $this->getJson('/api/tables/parcel-qr', bearer($admin))->assertOk()->json('data.qr_url');
    $second = $this->getJson('/api/tables/parcel-qr', bearer($admin))->assertOk()->json('data.qr_url');

    expect($second)->toBe($first)->and($first)->toContain('type=parcel&qr=PARCEL-');
});

test('staff can print table QR cards', function () {
    [$tenant] = restaurantWithAdmin();
    $staff = \App\Models\User::factory()->staff()->create(['tenant_id' => $tenant->id]);
    RestaurantTable::factory()->create(['tenant_id' => $tenant->id]);

    $this->getJson('/api/tables/qr-codes', bearer($staff))->assertOk();
    $this->getJson('/api/tables/parcel-qr', bearer($staff))->assertOk();
});
