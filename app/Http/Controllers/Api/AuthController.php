<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\BaseApiController;
use App\Mail\TenantOtpMail;
use App\Models\SubscriptionPlan;
use App\Models\TenantApplication;
use App\Models\TenantApplicationOtp;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Validator;

class AuthController extends BaseApiController
{
    public function login(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|email',
            'password' => 'required|string|min:6',
        ]);

        if ($validator->fails()) {
            return $this->error('Validation failed', 422, $validator->errors());
        }

        $credentials = $request->only('email', 'password');

        if (!$token = Auth::attempt($credentials)) {
            return $this->error('Invalid credentials', 401);
        }

        /** @var User|null $user */
        $user = Auth::user();

        if (!$user instanceof User) {
            Auth::logout();
            return $this->error('Unauthenticated', 401);
        }

        if (!$user->isActive()) {
            Auth::logout();

            if ($user->isPendingVerification()) {
                return $this->error('Please verify your email OTP before logging in.', 403, [
                    'next_step' => 'verify_email',
                ]);
            }

            if ($user->isPendingApproval()) {
                return $this->error('Your application is awaiting admin approval.', 403, [
                    'next_step' => 'await_approval',
                ]);
            }

            return $this->error('Account is inactive. Contact administrator.', 403);
        }

        AuditLogger::logLogin();

        return $this->respondWithToken($token);
    }

    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users,email',
            'password' => 'required|string|min:8|confirmed',
            'restaurant_name' => 'required|string|max:255',
            'phone' => 'required|string|max:20',
            'address' => 'nullable|string|max:500',
            'plan_id' => 'required|exists:subscription_plans,id',
        ]);

        $plan = SubscriptionPlan::active()->findOrFail($validated['plan_id']);

        [$user, $application, $otp] = DB::transaction(function () use ($validated, $plan) {
            $user = User::create([
                'name' => $validated['name'],
                'email' => $validated['email'],
                'password' => $validated['password'],
                'role' => User::ROLE_RESTAURANT_ADMIN,
                'status' => 'pending',
            ]);

            $application = TenantApplication::create([
                'user_id' => $user->id,
                'plan_id' => $plan->id,
                'restaurant_name' => $validated['restaurant_name'],
                'phone' => $validated['phone'],
                'address' => $validated['address'] ?? null,
                'trial_days_snapshot' => (int) $plan->trial_days,
                'duration_days_snapshot' => (int) $plan->duration_days,
                'price_snapshot' => $plan->price,
                'plan_snapshot' => [
                    'name' => $plan->name,
                    'slug' => $plan->slug,
                    'price' => $plan->price,
                    'trial_days' => $plan->trial_days,
                    'duration_days' => $plan->duration_days,
                    'max_users' => $plan->max_users,
                ],
                'status' => 'pending',
            ]);

            $otp = $this->issueOtp($application);

            return [$user, $application, $otp];
        });

        try {
            Mail::to($user->email)->send(new TenantOtpMail(
                user: $user->fresh(),
                application: $application->fresh(['plan']),
                code: $otp->plain_code,
            ));
        } catch (\Throwable $e) {
            report($e);
        }

        return $this->created([
            'user' => $user->fresh(),
            'application_id' => $application->id,
            'email' => $user->email,
            'plan' => $plan,
            'next_step' => 'verify_email',
        ], 'Registration created. Enter the OTP sent to your email.');
    }

    public function sendOtp(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => 'required|email',
        ]);

        $application = TenantApplication::with(['user', 'plan'])
            ->whereHas('user', fn ($query) => $query->where('email', $validated['email']))
            ->latest()
            ->first();

        if (!$application) {
            return $this->notFound('Application not found.');
        }

        if ($application->status === 'approved') {
            return $this->error('Application has already been approved.', 422);
        }

        $otp = $this->issueOtp($application);

        try {
            Mail::to($application->user->email)->send(new TenantOtpMail(
                user: $application->user,
                application: $application->fresh(['plan']),
                code: $otp->plain_code,
            ));
        } catch (\Throwable $e) {
            report($e);
        }

        return $this->success([
            'application_id' => $application->id,
            'expires_at' => $otp->expires_at,
        ], 'OTP sent successfully.');
    }

    public function verifyOtp(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => 'required|email',
            'code' => 'required|string|min:4|max:10',
        ]);

        $application = TenantApplication::with(['user', 'latestOtp'])
            ->whereHas('user', fn ($query) => $query->where('email', $validated['email']))
            ->latest()
            ->first();

        if (!$application) {
            return $this->notFound('Application not found.');
        }

        if ($application->status === 'approved') {
            return $this->success(null, 'Application has already been approved.');
        }

        $otp = $application->latestOtp;

        if (!$otp || $otp->isExpired()) {
            return $this->error('OTP has expired. Please request a new one.', 422);
        }

        if ($otp->attempts >= 5) {
            return $this->error('Too many invalid OTP attempts. Please request a new code.', 429);
        }

        if (!Hash::check($validated['code'], $otp->code_hash)) {
            $otp->increment('attempts');

            return $this->error('Invalid OTP code.', 422);
        }

        DB::transaction(function () use ($application, $otp) {
            $application->update([
                'status' => 'verified',
                'email_verified_at' => now(),
            ]);

            $application->user()->update([
                'email_verified_at' => now(),
            ]);

            $otp->update([
                'verified_at' => now(),
            ]);

            AuditLogger::logAction('tenant_application_email_verified', $application);
        });

        return $this->success([
            'application_id' => $application->id,
            'status' => 'verified',
            'next_step' => 'await_approval',
        ], 'Email verified. Your application is waiting for admin approval.');
    }

    private function issueOtp(TenantApplication $application): TenantApplicationOtp
    {
        $plainCode = (string) random_int(100000, 999999);

        $otp = TenantApplicationOtp::create([
            'tenant_application_id' => $application->id,
            'code_hash' => Hash::make($plainCode),
            'expires_at' => now()->addMinutes(10),
            'sent_at' => now(),
        ]);

        $otp->plain_code = $plainCode;

        $application->update([
            'status' => 'submitted',
            'otp_sent_at' => now(),
        ]);

        AuditLogger::logAction('tenant_application_otp_sent', $application, null, [
            'application_id' => $application->id,
        ]);

        return $otp;
    }

    public function me(): JsonResponse
    {
        /** @var User|null $user */
        $user = Auth::user();

        if (!$user instanceof User) {
            return $this->error('Unauthenticated', 401);
        }

        $user->load('tenant');

        return $this->success([
            'user' => $user,
            'subscription' => $user->tenant?->activeSubscription,
            'is_on_trial' => $user->tenant?->isOnTrial() ?? false,
            'trial_days_remaining' => $user->tenant?->trialDaysRemaining() ?? 0,
            'trial_ends_at' => $user->tenant?->trial_ends_at,
        ]);
    }

    public function logout(): JsonResponse
    {
        AuditLogger::logAction('logout', Auth::user());

        Auth::logout();
        return $this->success(null, 'Logged out successfully');
    }

    public function refresh(): JsonResponse
    {
        return $this->respondWithToken(Auth::refresh());
    }

    protected function respondWithToken(string $token, int $code = 200): JsonResponse
    {
        /** @var User|null $user */
        $user = Auth::user();

        if (!$user instanceof User) {
            return $this->error('Unauthenticated', 401);
        }

        $user->load('tenant');

        return response()->json([
            'success' => true,
            'access_token' => $token,
            'token_type' => 'bearer',
            'expires_in' => config('jwt.ttl') * 60,
            'user' => $user,
        ], $code);
    }
}
