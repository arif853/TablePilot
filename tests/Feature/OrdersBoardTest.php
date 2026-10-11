<?php

use App\Models\Order;
use App\Models\RestaurantTable;

// restaurantWithAdmin() and bearer() live in tests/Pest.php

test('the order list filters by several statuses at once', function () {
    [$tenant, $admin] = restaurantWithAdmin();
    $placed = Order::factory()->create(['tenant_id' => $tenant->id, 'status' => 'placed']);
    $cooking = Order::factory()->create(['tenant_id' => $tenant->id, 'status' => 'preparing']);
    Order::factory()->create(['tenant_id' => $tenant->id, 'status' => 'completed']);

    $ids = $this->getJson('/api/orders?status=placed,preparing', bearer($admin))->assertOk()->json('data.*.id');

    expect($ids)->toEqualCanonicalizing([$placed->id, $cooking->id]);
});

test('the order list shows only delayed kitchen tickets when asked', function () {
    [$tenant, $admin] = restaurantWithAdmin();
    $tenant->update(['kitchen_target_minutes' => 15]);
    $late = Order::factory()->create(['tenant_id' => $tenant->id, 'status' => 'preparing', 'created_at' => now()->subMinutes(20)]);
    Order::factory()->create(['tenant_id' => $tenant->id, 'status' => 'preparing', 'created_at' => now()->subMinutes(5)]);
    // Ready orders are out of the kitchen, however old
    Order::factory()->create(['tenant_id' => $tenant->id, 'status' => 'ready', 'created_at' => now()->subHour()]);

    $this->getJson('/api/orders?delayed=1', bearer($admin))->assertOk()->assertJsonPath('data.*.id', [$late->id]);
});

test('the order list filters by floor area and finds orders by table or number', function () {
    [$tenant, $admin] = restaurantWithAdmin();
    $terrace = RestaurantTable::factory()->create(['tenant_id' => $tenant->id, 'table_number' => 'T9', 'area' => 'Terrace']);
    $hall = RestaurantTable::factory()->create(['tenant_id' => $tenant->id, 'table_number' => 'H1', 'area' => 'Main']);
    $outside = Order::factory()->create(['tenant_id' => $tenant->id, 'table_id' => $terrace->id, 'order_number' => 'ORD-A-0001']);
    $inside = Order::factory()->create(['tenant_id' => $tenant->id, 'table_id' => $hall->id, 'order_number' => 'ORD-A-0002']);
    Order::factory()->create(['tenant_id' => $tenant->id, 'table_id' => null, 'order_number' => 'ORD-A-0003']);

    $this->getJson('/api/orders?area=Terrace', bearer($admin))->assertJsonPath('data.*.id', [$outside->id]);
    $this->getJson('/api/orders?search=H1', bearer($admin))->assertJsonPath('data.*.id', [$inside->id]);
    $this->getJson('/api/orders?search=0002', bearer($admin))->assertJsonPath('data.*.id', [$inside->id]);
});

test('the summary counts open orders live and history for the chosen days', function () {
    [$tenant, $admin] = restaurantWithAdmin();
    // Open from yesterday: still counts as in progress and delayed
    Order::factory()->create(['tenant_id' => $tenant->id, 'status' => 'confirmed', 'created_at' => now()->subDay(), 'grand_total' => 100]);
    Order::factory()->create(['tenant_id' => $tenant->id, 'status' => 'placed', 'grand_total' => 200]);
    Order::factory()->create(['tenant_id' => $tenant->id, 'status' => 'ready', 'grand_total' => 300]);
    Order::factory()->create(['tenant_id' => $tenant->id, 'status' => 'served', 'grand_total' => 400]);
    Order::factory()->create(['tenant_id' => $tenant->id, 'status' => 'completed', 'grand_total' => 500]);
    Order::factory()->create(['tenant_id' => $tenant->id, 'status' => 'cancelled', 'grand_total' => 999]);
    Order::factory()->create(['tenant_id' => $tenant->id, 'status' => 'completed', 'created_at' => now()->subDays(3), 'grand_total' => 50]);

    $this->getJson('/api/orders/summary', bearer($admin))
        ->assertOk()
        ->assertJsonPath('data.target_minutes', 20)
        ->assertJsonPath('data.counts', [
            'all' => 5,
            'in_progress' => 2,
            'ready' => 1,
            'served' => 1,
            'delayed' => 1,
            'completed' => 1,
            'cancelled' => 1,
        ])
        // Today's orders, cancelled excluded
        ->assertJsonPath('data.sales', 1400);

    $this->getJson('/api/orders/summary?from=' . now()->subDays(7)->toDateString(), bearer($admin))
        ->assertJsonPath('data.counts.all', 7)
        ->assertJsonPath('data.counts.completed', 2);
});

test('the summary only counts this restaurant\'s orders', function () {
    [$tenant, $admin] = restaurantWithAdmin();
    [$other] = restaurantWithAdmin();
    Order::factory()->create(['tenant_id' => $tenant->id, 'status' => 'placed']);
    Order::factory()->count(3)->create(['tenant_id' => $other->id, 'status' => 'placed']);

    $this->getJson('/api/orders/summary', bearer($admin))->assertJsonPath('data.counts.in_progress', 1);
});
