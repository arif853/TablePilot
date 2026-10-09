<?php

/**
 * Email Verification Tests (API)
 *
 * Note: The current system uses JWT auth without email verification.
 * These tests are placeholders for when email verification is implemented.
 */

test('email verification is not required for login', function () {
    $user = \App\Models\User::factory()->unverified()->create([
        'role' => 'restaurant_admin',
        'status' => 'active',
        'tenant_id' => \App\Models\Tenant::factory()->create()->id,
    ]);

    $response = $this->postJson('/api/auth/login', [
        'email' => $user->email,
        'password' => 'password',
    ]);

    // Currently login works even without verification
    $response->assertOk();
});
