<?php

use App\Models\Order;
use App\Models\RestaurantTable;

// restaurantWithAdmin() and bearer() live in tests/Pest.php

test('the table list carries each table\'s running bill and seated-since time', function () {
    [$tenant, $admin] = restaurantWithAdmin();
    $seatedAt = now()->subMinutes(40)->startOfSecond();
    $busy = RestaurantTable::factory()->create(['tenant_id' => $tenant->id, 'table_number' => 'A1', 'status' => 'occupied']);
    $free = RestaurantTable::factory()->create(['tenant_id' => $tenant->id, 'table_number' => 'A2', 'status' => 'available']);

    Order::factory()->dineIn()->create(['tenant_id' => $tenant->id, 'table_id' => $busy->id, 'grand_total' => 300, 'created_at' => $seatedAt]);
    Order::factory()->dineIn()->create(['tenant_id' => $tenant->id, 'table_id' => $busy->id, 'grand_total' => 150, 'created_at' => now()->subMinutes(10)]);
    // Finished orders are not part of the running bill
    Order::factory()->dineIn()->completed()->create(['tenant_id' => $tenant->id, 'table_id' => $busy->id, 'grand_total' => 999]);

    $tables = collect($this->getJson('/api/tables', bearer($admin))->assertOk()->json('data'))->keyBy('id');

    expect($tables[$busy->id]['active_orders_count'])->toBe(2)
        ->and((float) $tables[$busy->id]['active_orders_sum_grand_total'])->toBe(450.0)
        ->and($tables[$busy->id]['active_orders_min_created_at'])->toBe($seatedAt->toJSON())
        ->and($tables[$free->id]['active_orders_count'])->toBe(0)
        ->and($tables[$free->id]['active_orders_min_created_at'])->toBeNull();
});

test('a table\'s detail shows who is serving its running orders', function () {
    [$tenant, $admin] = restaurantWithAdmin();
    $table = RestaurantTable::factory()->create(['tenant_id' => $tenant->id, 'status' => 'occupied']);
    Order::factory()->dineIn()->create(['tenant_id' => $tenant->id, 'table_id' => $table->id, 'served_by' => $admin->id]);

    $this->getJson("/api/tables/{$table->id}", bearer($admin))
        ->assertOk()
        ->assertJsonPath('data.active_orders.0.served_by.name', $admin->name);
});

test('new tables go to the area they are created in, or Main', function () {
    [, $admin] = restaurantWithAdmin();

    $this->postJson('/api/tables', ['table_number' => 'R1', 'area' => 'Rooftop'], bearer($admin))
        ->assertCreated()->assertJsonPath('data.area', 'Rooftop');
    $this->postJson('/api/tables', ['table_number' => 'R2'], bearer($admin))
        ->assertCreated()->assertJsonPath('data.area', 'Main');
});

test('the layout editor saves table positions', function () {
    [$tenant, $admin] = restaurantWithAdmin();
    [$a, $b] = RestaurantTable::factory()->count(2)->create(['tenant_id' => $tenant->id]);

    $this->putJson('/api/tables/layout', ['tables' => [
        ['id' => $a->id, 'pos_x' => 40, 'pos_y' => 60],
        ['id' => $b->id, 'pos_x' => 300, 'pos_y' => 60],
    ]], bearer($admin))->assertOk();

    expect($a->fresh()->only(['pos_x', 'pos_y']))->toBe(['pos_x' => 40, 'pos_y' => 60])
        ->and($b->fresh()->pos_x)->toBe(300);
});

test('the layout editor cannot move another restaurant\'s tables', function () {
    [$tenant, $admin] = restaurantWithAdmin();
    [$otherTenant] = restaurantWithAdmin();
    $mine = RestaurantTable::factory()->create(['tenant_id' => $tenant->id]);
    $theirs = RestaurantTable::factory()->create(['tenant_id' => $otherTenant->id]);

    $this->putJson('/api/tables/layout', ['tables' => [
        ['id' => $mine->id, 'pos_x' => 10, 'pos_y' => 10],
        ['id' => $theirs->id, 'pos_x' => 10, 'pos_y' => 10],
    ]], bearer($admin))->assertStatus(422);

    expect($theirs->fresh()->pos_x)->toBeNull()->and($mine->fresh()->pos_x)->toBeNull();
});

test('positions outside the canvas are rejected', function () {
    [$tenant, $admin] = restaurantWithAdmin();
    $table = RestaurantTable::factory()->create(['tenant_id' => $tenant->id]);

    $this->putJson('/api/tables/layout', ['tables' => [
        ['id' => $table->id, 'pos_x' => RestaurantTable::CANVAS_WIDTH + 1, 'pos_y' => 0],
    ]], bearer($admin))->assertStatus(422);
});

test('staff cannot rearrange the floor plan', function () {
    [$tenant] = restaurantWithAdmin();
    $staff = \App\Models\User::factory()->staff()->create(['tenant_id' => $tenant->id]);
    $table = RestaurantTable::factory()->create(['tenant_id' => $tenant->id]);

    $this->putJson('/api/tables/layout', ['tables' => [['id' => $table->id, 'pos_x' => 5, 'pos_y' => 5]]], bearer($staff))
        ->assertForbidden();
});

test('moving a table to another area clears its old position', function () {
    [$tenant, $admin] = restaurantWithAdmin();
    $table = RestaurantTable::factory()->create(['tenant_id' => $tenant->id, 'table_number' => 'M1', 'area' => 'Main', 'pos_x' => 200, 'pos_y' => 100]);

    $this->putJson("/api/tables/{$table->id}", ['table_number' => 'M1', 'area' => 'Terrace'], bearer($admin))->assertOk();
    expect($table->fresh()->only(['area', 'pos_x', 'pos_y']))->toBe(['area' => 'Terrace', 'pos_x' => null, 'pos_y' => null]);

    // Saving other fields keeps the table where it is
    $table->update(['pos_x' => 80, 'pos_y' => 40]);
    $this->putJson("/api/tables/{$table->id}", ['table_number' => 'M1', 'capacity' => 6, 'area' => 'Terrace'], bearer($admin))->assertOk();
    expect($table->fresh()->pos_x)->toBe(80);
});

test('renaming an area moves only this restaurant\'s tables', function () {
    [$tenant, $admin] = restaurantWithAdmin();
    [$otherTenant] = restaurantWithAdmin();
    RestaurantTable::factory()->count(2)->create(['tenant_id' => $tenant->id, 'area' => 'Floor 1']);
    $theirs = RestaurantTable::factory()->create(['tenant_id' => $otherTenant->id, 'area' => 'Floor 1']);

    $this->putJson('/api/tables/areas/rename', ['from' => 'Floor 1', 'to' => 'Ground Floor'], bearer($admin))->assertOk();

    expect(RestaurantTable::withoutGlobalScopes()->where('tenant_id', $tenant->id)->pluck('area')->unique()->all())->toBe(['Ground Floor'])
        ->and($theirs->fresh()->area)->toBe('Floor 1');
});

test('an area cannot be renamed onto one that already exists', function () {
    [$tenant, $admin] = restaurantWithAdmin();
    RestaurantTable::factory()->create(['tenant_id' => $tenant->id, 'area' => 'Floor 1']);
    RestaurantTable::factory()->create(['tenant_id' => $tenant->id, 'area' => 'Terrace']);

    $this->putJson('/api/tables/areas/rename', ['from' => 'Floor 1', 'to' => 'Terrace'], bearer($admin))->assertStatus(422);
});
