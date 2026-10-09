<?php

use App\Models\Order;
use App\Models\Tenant;
use function Pest\Laravel\getJson;

test('order tracking includes only the restaurant\'s public branding', function () {
    $tenant = Tenant::factory()->create([
        'primary_color' => '#16A34A',
        'secondary_color' => '#14532D',
    ]);
    $order = Order::factory()->create([
        'tenant_id' => $tenant->id,
        'public_access_token' => 'track-me-123',
    ]);

    $response = getJson("/api/customer/order/track/{$order->order_number}?access_token=track-me-123")
        ->assertOk()
        ->assertJsonPath('data.restaurant.name', $tenant->name)
        ->assertJsonPath('data.restaurant.slug', $tenant->slug)
        ->assertJsonPath('data.restaurant.primary_color', '#16A34A')
        ->assertJsonPath('data.restaurant.secondary_color', '#14532D');

    // Nothing private (contact, billing, payment settings) leaks to the public page
    expect(array_keys($response->json('data.restaurant')))
        ->toEqualCanonicalizing(['name', 'slug', 'logo', 'primary_color', 'secondary_color']);
});

test('new restaurants default to TablePilot orange', function () {
    $tenant = Tenant::factory()->create();

    expect($tenant->fresh()->primary_color)->toBe('#ED802A')
        ->and($tenant->fresh()->secondary_color)->toBe('#B8560E');
});
