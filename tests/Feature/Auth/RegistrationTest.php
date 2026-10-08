<?php

use App\Models\SubscriptionPlan;

/**
 * Registration Tests (API)
 *
 * Tests API user registration endpoint.
 */

test('new users can register via api', function () {
    $plan = SubscriptionPlan::factory()->create();

    $response = $this->postJson('/api/auth/register', [
        'name' => 'Test User',
        'email' => 'test@example.com',
        'password' => 'password123',
        'password_confirmation' => 'password123',
        'restaurant_name' => 'Test Restaurant',
        'phone' => '01700000000',
        'plan_id' => $plan->id,
    ]);

    $response->assertStatus(201)
        ->assertJsonPath('data.next_step', 'verify_email');
});

test('registration requires valid email', function () {
    $response = $this->postJson('/api/auth/register', [
        'name' => 'Test',
        'email' => 'not-an-email',
        'password' => 'password123',
        'password_confirmation' => 'password123',
    ]);

    $response->assertStatus(422);
});

test('registration requires password confirmation', function () {
    $response = $this->postJson('/api/auth/register', [
        'name' => 'Test',
        'email' => 'test@example.com',
        'password' => 'password123',
    ]);

    $response->assertStatus(422);
});
