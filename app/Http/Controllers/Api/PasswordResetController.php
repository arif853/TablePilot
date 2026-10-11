<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\BaseApiController;
use App\Mail\PasswordResetMail;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class PasswordResetController extends BaseApiController
{
    /**
     * Send password reset link via email.
     */
    public function sendResetLink(Request $request): JsonResponse
    {
        $request->validate([
            'email' => 'required|email',
        ]);

        $user = User::where('email', $request->email)->first();

        // Always return success to prevent email enumeration
        if (!$user) {
            return $this->success(null, 'If an account exists with that email, a password reset link has been sent.');
        }

        // Delete any existing tokens for this email
        DB::table('password_reset_tokens')->where('email', $user->email)->delete();

        // Generate token
        $token = Str::random(64);

        DB::table('password_reset_tokens')->insert([
            'email' => $user->email,
            'token' => Hash::make($token),
            'created_at' => now(),
        ]);

        // Build reset URL (frontend handles the actual form)
        $frontendUrl = config('app.frontend_url', config('app.url'));
        $resetUrl = "{$frontendUrl}/reset-password?token={$token}&email=" . urlencode($user->email);

        try {
            Mail::to($user->email)->send(new PasswordResetMail(
                userName: $user->name,
                resetUrl: $resetUrl,
                token: $token,
            ));
        } catch (\Exception $e) {
            report($e);
        }

        return $this->success(null, 'If an account exists with that email, a password reset link has been sent.');
    }

    /**
     * Reset password using the token.
     */
    public function resetPassword(Request $request): JsonResponse
    {
        $request->validate([
            'email' => 'required|email',
            'token' => 'required|string',
            'password' => 'required|string|min:8|confirmed',
        ]);

        $record = DB::table('password_reset_tokens')
            ->where('email', $request->email)
            ->first();

        if (!$record) {
            return $this->error('Invalid or expired reset token.', 422);
        }

        // Check if token matches
        if (!Hash::check($request->token, $record->token)) {
            return $this->error('Invalid or expired reset token.', 422);
        }

        // Check token expiry (60 minutes)
        // (Carbon 3: now()->diffInMinutes($past) is negative, so it can never exceed 60)
        if (Carbon::parse($record->created_at)->addMinutes(60)->isPast()) {
            DB::table('password_reset_tokens')->where('email', $request->email)->delete();
            return $this->error('Reset token has expired. Please request a new one.', 422);
        }

        // Find and update user
        $user = User::where('email', $request->email)->first();

        if (!$user) {
            return $this->error('User not found.', 404);
        }

        $user->update([
            'password' => $request->password, // Will be hashed via the 'hashed' cast
        ]);

        // Delete the token
        DB::table('password_reset_tokens')->where('email', $request->email)->delete();

        return $this->success(null, 'Password has been reset successfully. You can now login with your new password.');
    }
}
