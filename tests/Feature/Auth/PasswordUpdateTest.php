<?php

/**
 * Password Update Tests (API)
 *
 * Tests the API profile password change endpoint.
 */

use App\Models\Subscription;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

test('user can change password via api', function () {
    $tenant = Tenant::factory()->create();
    Subscription::factory()->create(['tenant_id' => $tenant->id]);
    $user = User::factory()->restaurantAdmin()->create(['tenant_id' => $tenant->id]);
    $token = auth('api')->login($user);

    $response = $this->withHeader('Authorization', "Bearer {$token}")
        ->putJson('/api/profile/password', [
            'current_password' => 'password',
            'password' => 'new-secure-pass',
            'password_confirmation' => 'new-secure-pass',
        ]);

    $response->assertOk();

    // Verify new password works
    expect(Hash::check('new-secure-pass', $user->fresh()->password))->toBeTrue();
});

test('password change requires correct current password', function () {
    $tenant = Tenant::factory()->create();
    Subscription::factory()->create(['tenant_id' => $tenant->id]);
    $user = User::factory()->restaurantAdmin()->create(['tenant_id' => $tenant->id]);
    $token = auth('api')->login($user);

    $response = $this->withHeader('Authorization', "Bearer {$token}")
        ->putJson('/api/profile/password', [
            'current_password' => 'wrong-password',
            'password' => 'new-secure-pass',
            'password_confirmation' => 'new-secure-pass',
        ]);

    $response->assertStatus(422);
});
