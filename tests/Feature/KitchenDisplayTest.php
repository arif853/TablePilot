<?php

use App\Models\Category;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\User;

// restaurantWithAdmin() and bearer() live in tests/Pest.php

function kitchenUser(\App\Models\Tenant $tenant): User
{
    return User::factory()->kitchen()->create(['tenant_id' => $tenant->id]);
}

test('the kitchen queue lists cooking tickets first, oldest first, with item categories', function () {
    [$tenant] = restaurantWithAdmin();
    $grill = Category::factory()->create(['tenant_id' => $tenant->id, 'name' => 'Grill']);
    $steak = MenuItem::factory()->create(['tenant_id' => $tenant->id, 'category_id' => $grill->id, 'name' => 'Steak']);

    $readyOld = Order::factory()->create(['tenant_id' => $tenant->id, 'status' => 'ready', 'created_at' => now()->subMinutes(50)]);
    $newer = Order::factory()->create(['tenant_id' => $tenant->id, 'status' => 'confirmed', 'created_at' => now()->subMinutes(5)]);
    $older = Order::factory()->create(['tenant_id' => $tenant->id, 'status' => 'confirmed', 'created_at' => now()->subMinutes(15)]);
    $cooking = Order::factory()->create(['tenant_id' => $tenant->id, 'status' => 'preparing', 'created_at' => now()->subMinutes(2)]);
    Order::factory()->create(['tenant_id' => $tenant->id, 'status' => 'placed']);
    OrderItem::factory()->create(['order_id' => $cooking->id, 'menu_item_id' => $steak->id, 'qty' => 2, 'price_at_sale' => 500]);

    $response = $this->getJson('/api/kitchen/orders', bearer(kitchenUser($tenant)))->assertOk();

    expect($response->json('data.*.id'))->toBe([$cooking->id, $older->id, $newer->id, $readyOld->id])
        ->and($response->json('data.0.items.0.menu_item.category.name'))->toBe('Grill');
});

test('an order is stamped when the kitchen marks it ready', function () {
    [$tenant] = restaurantWithAdmin();
    $order = Order::factory()->create(['tenant_id' => $tenant->id, 'status' => 'preparing']);

    $this->postJson("/api/kitchen/orders/{$order->id}/advance", [], bearer(kitchenUser($tenant)))->assertOk();

    expect($order->fresh()->status)->toBe('ready')
        ->and($order->fresh()->ready_at)->not->toBeNull();
});

test('kitchen stats report prep time, on-time rate and delayed tickets', function () {
    [$tenant] = restaurantWithAdmin();
    $target = \App\Http\Controllers\Api\KitchenController::DEFAULT_TARGET_MINUTES;

    // Finished today in 10 and 30 minutes: one on time, one late
    Order::factory()->create(['tenant_id' => $tenant->id, 'status' => 'ready', 'created_at' => now()->subMinutes(40), 'ready_at' => now()->subMinutes(30)]);
    Order::factory()->create(['tenant_id' => $tenant->id, 'status' => 'served', 'created_at' => now()->subMinutes(35), 'ready_at' => now()->subMinutes(5)]);
    // Still cooking: one past the target, one fresh
    Order::factory()->create(['tenant_id' => $tenant->id, 'status' => 'preparing', 'created_at' => now()->subMinutes($target + 5)]);
    Order::factory()->create(['tenant_id' => $tenant->id, 'status' => 'confirmed', 'created_at' => now()->subMinutes(3)]);

    $this->getJson('/api/kitchen/stats', bearer(kitchenUser($tenant)))
        ->assertOk()
        ->assertJsonPath('data.target_minutes', $target)
        ->assertJsonPath('data.ready_today', 2)
        ->assertJsonPath('data.avg_prep_minutes', 20)
        ->assertJsonPath('data.on_time_rate', 50)
        ->assertJsonPath('data.delayed', 1);
});

test('kitchen stats have no prep figures before anything is finished', function () {
    [$tenant] = restaurantWithAdmin();

    $this->getJson('/api/kitchen/stats', bearer(kitchenUser($tenant)))
        ->assertOk()
        ->assertJsonPath('data.avg_prep_minutes', null)
        ->assertJsonPath('data.on_time_rate', null);
});

test('a restaurant admin can change the kitchen target time', function () {
    [$tenant, $admin] = restaurantWithAdmin();

    $this->getJson('/api/kitchen/settings', bearer($admin))->assertOk()->assertJsonPath('data.target_minutes', 20);
    $this->putJson('/api/kitchen/settings', ['target_minutes' => 30], bearer($admin))
        ->assertOk()->assertJsonPath('data.target_minutes', 30);

    expect($tenant->fresh()->kitchen_target_minutes)->toBe(30);
});

test('the kitchen target must be a sensible number of minutes', function (mixed $value) {
    [, $admin] = restaurantWithAdmin();

    $this->putJson('/api/kitchen/settings', ['target_minutes' => $value], bearer($admin))->assertStatus(422);
})->with([0, 4, 121, 'soon', null]);

test('kitchen and staff users cannot change the kitchen target', function (string $role) {
    [$tenant] = restaurantWithAdmin();
    $user = User::factory()->{$role}()->create(['tenant_id' => $tenant->id]);

    $this->putJson('/api/kitchen/settings', ['target_minutes' => 45], bearer($user))->assertForbidden();

    expect($tenant->fresh()->kitchen_target_minutes)->toBe(20);
})->with(['kitchen', 'staff']);

test('kitchen stats use the restaurant\'s own target', function () {
    [$tenant] = restaurantWithAdmin();
    $tenant->update(['kitchen_target_minutes' => 10]);
    Order::factory()->create(['tenant_id' => $tenant->id, 'status' => 'preparing', 'created_at' => now()->subMinutes(15)]);

    $this->getJson('/api/kitchen/stats', bearer(kitchenUser($tenant)))
        ->assertOk()
        ->assertJsonPath('data.target_minutes', 10)
        ->assertJsonPath('data.delayed', 1);
});
