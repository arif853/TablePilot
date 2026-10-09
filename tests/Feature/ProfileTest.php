<?php

use App\Models\User;
use App\Models\Tenant;
use App\Models\Subscription;
use App\Models\SubscriptionPlan;

function setupProfileUser(): array
{
    $plan = SubscriptionPlan::factory()->create();
    $tenant = Tenant::factory()->create();
    Subscription::factory()->for($tenant)->for($plan, 'plan')->create();
    $user = User::factory()->restaurantAdmin()->create(['tenant_id' => $tenant->id]);
    $token = auth('api')->login($user);

    return [$user, $token, $tenant];
}

test('user can view their profile', function () {
    [$user, $token] = setupProfileUser();

    $response = $this->getJson('/api/profile', [
        'Authorization' => "Bearer {$token}",
    ]);

    $response->assertOk()
        ->assertJsonFragment(['email' => $user->email]);
});

test('user can update their profile', function () {
    [$user, $token] = setupProfileUser();

    $response = $this->putJson('/api/profile', [
        'name' => 'Updated Name',
        'phone' => '01700000000',
    ], [
        'Authorization' => "Bearer {$token}",
    ]);

    $response->assertOk();

    $user->refresh();
    expect($user->name)->toBe('Updated Name');
});

test('user can change their password', function () {
    [$user, $token] = setupProfileUser();

    $response = $this->putJson('/api/profile/password', [
        'current_password' => 'password',
        'password' => 'newSecurePass123!',
        'password_confirmation' => 'newSecurePass123!',
    ], [
        'Authorization' => "Bearer {$token}",
    ]);

    $response->assertOk();
});

test('wrong current password is rejected', function () {
    [$user, $token] = setupProfileUser();

    $response = $this->putJson('/api/profile/password', [
        'current_password' => 'wrong-password',
        'password' => 'newSecurePass123!',
        'password_confirmation' => 'newSecurePass123!',
    ], [
        'Authorization' => "Bearer {$token}",
    ]);

    $response->assertStatus(422);
});

test('unauthenticated user cannot access profile', function () {
    $response = $this->getJson('/api/profile');

    $response->assertUnauthorized();
});
