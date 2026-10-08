<?php

/**
 * Password Reset Tests (API)
 *
 * Tests the JWT-compatible password reset flow via PasswordResetController.
 */

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

test('forgot password endpoint accepts email', function () {
    User::factory()->create(['email' => 'test@test.com']);

    $response = $this->postJson('/api/auth/forgot-password', [
        'email' => 'test@test.com',
    ]);

    // Always returns 200 to prevent email enumeration
    $response->assertOk()
        ->assertJsonPath('success', true);
});

test('forgot password does not reveal if email exists', function () {
    $response = $this->postJson('/api/auth/forgot-password', [
        'email' => 'nonexistent@test.com',
    ]);

    // Same response whether email exists or not
    $response->assertOk()
        ->assertJsonPath('success', true);
});

test('forgot password validates email field', function () {
    $response = $this->postJson('/api/auth/forgot-password', []);

    $response->assertStatus(422);
});

test('the emailed reset link opens the reset page and resets the password', function () {
    \Illuminate\Support\Facades\Mail::fake();
    $user = User::factory()->create(['email' => 'reset-me@example.com', 'password' => 'old-password-1']);

    $this->postJson('/api/auth/forgot-password', ['email' => $user->email])->assertOk();

    $resetUrl = null;
    \Illuminate\Support\Facades\Mail::assertSent(\App\Mail\PasswordResetMail::class, function ($mail) use (&$resetUrl) {
        $resetUrl = $mail->resetUrl;
        return true;
    });

    // The frontend's /reset-password page reads token and email from the query string
    expect(parse_url($resetUrl, PHP_URL_PATH))->toBe('/reset-password');
    parse_str(parse_url($resetUrl, PHP_URL_QUERY), $query);
    expect($query['email'])->toBe($user->email)->and($query['token'])->not->toBeEmpty();

    $this->postJson('/api/auth/reset-password', [
        'email' => $query['email'],
        'token' => $query['token'],
        'password' => 'new-password-1',
        'password_confirmation' => 'new-password-1',
    ])->assertOk();

    expect(Hash::check('new-password-1', $user->fresh()->password))->toBeTrue();

    // A reset link works once
    $this->postJson('/api/auth/reset-password', [
        'email' => $query['email'],
        'token' => $query['token'],
        'password' => 'another-password-1',
        'password_confirmation' => 'another-password-1',
    ])->assertUnprocessable();
});
