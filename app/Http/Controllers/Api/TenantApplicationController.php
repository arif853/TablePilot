<?php

namespace App\Http\Controllers\Api;

use App\Mail\TenantApplicationApprovalMail;
use App\Models\SubscriptionPlan;
use App\Models\Tenant;
use App\Models\TenantApplication;
use App\Services\AuditLogger;
use App\Services\SubscriptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class TenantApplicationController extends BaseApiController
{
    public function __construct(
        protected SubscriptionService $subscriptionService
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = TenantApplication::query()->with(['user', 'plan', 'tenant'])->latest();

        if ($status = $request->get('status')) {
            $query->where('status', $status);
        }

        return $this->paginated($query);
    }

    public function show(int $id): JsonResponse
    {
        $application = TenantApplication::with(['user', 'plan', 'tenant', 'latestOtp'])->find($id);

        if (!$application) {
            return $this->notFound('Tenant application not found');
        }

        return $this->success($application);
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'approval_notes' => 'nullable|string|max:1000',
        ]);

        $application = TenantApplication::with(['user', 'plan'])->find($id);

        if (!$application) {
            return $this->notFound('Tenant application not found');
        }

        if ($application->status === 'approved') {
            return $this->error('Application has already been approved.', 422);
        }

        if ($application->status === 'rejected') {
            return $this->error('Rejected applications must be resubmitted before approval.', 422);
        }

        if (!$application->email_verified_at) {
            return $this->error('Application must be email verified before approval.', 422);
        }

        if (Tenant::where('email', $application->user->email)->exists()) {
            return $this->error('Another restaurant is already registered with this email address.', 422);
        }

        $admin = Auth::user();

        $tenant = DB::transaction(function () use ($application, $validated, $admin) {
            $plan = $application->plan ?? SubscriptionPlan::findOrFail($application->plan_id);

            $tenant = Tenant::create([
                'name' => $application->restaurant_name,
                'slug' => Str::slug($application->restaurant_name) . '-' . Str::random(5),
                'email' => $application->user->email,
                'phone' => $application->phone,
                'address' => $application->address,
                'payment_mode' => 'seller',
                'commission_rate' => config('saas.default_commission_rate', 5.00),
                'tax_rate' => 0,
                'max_users' => $plan->max_users,
                'is_active' => true,
                'trial_ends_at' => (int) $plan->trial_days > 0 ? now()->addDays((int) $plan->trial_days) : null,
            ]);

            $application->user->update([
                'tenant_id' => $tenant->id,
                'status' => 'active',
            ]);

            if ((int) $plan->trial_days === 0) {
                $this->subscriptionService->createSubscription(
                    tenant: $tenant,
                    plan: $plan,
                    paymentData: [
                        'amount' => 0,
                        'payment_method' => 'manual',
                        'notes' => 'Activated by admin approval',
                    ],
                    isTrial: false,
                    initiatedBy: 'super_admin'
                );
            } else {
                // Without a subscription row the tenant would be locked out by EnsureActiveSubscription
                $this->subscriptionService->createTrialSubscription($tenant, $plan, (int) $plan->trial_days);
            }

            $application->update([
                'tenant_id' => $tenant->id,
                'status' => 'approved',
                'approved_at' => now(),
                'approved_by' => $admin?->id,
                'approval_notes' => $validated['approval_notes'] ?? null,
                'rejected_at' => null,
                'rejected_by' => null,
            ]);

            AuditLogger::logAction('tenant_application_approved', $application, null, [
                'tenant_id' => $tenant->id,
                'application_id' => $application->id,
            ]);

            return $tenant;
        });

        try {
            Mail::to($application->user->email)->send(new TenantApplicationApprovalMail(
                application: $application->fresh(['user', 'plan', 'tenant']),
                approved: true,
            ));
        } catch (\Throwable $e) {
            report($e);
        }

        return $this->success([
            'tenant' => $tenant->fresh(['activeSubscription']),
            'application' => $application->fresh(['user', 'plan', 'tenant']),
        ], 'Tenant application approved successfully.');
    }

    public function reject(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'approval_notes' => 'nullable|string|max:1000',
        ]);

        $application = TenantApplication::with('user')->find($id);

        if (!$application) {
            return $this->notFound('Tenant application not found');
        }

        if ($application->status === 'approved') {
            return $this->error('Approved applications cannot be rejected.', 422);
        }

        $application->update([
            'status' => 'rejected',
            'rejected_at' => now(),
            'rejected_by' => Auth::id(),
            'approval_notes' => $validated['approval_notes'] ?? null,
        ]);

        AuditLogger::logAction('tenant_application_rejected', $application, null, [
            'application_id' => $application->id,
        ]);

        try {
            Mail::to($application->user->email)->send(new TenantApplicationApprovalMail(
                application: $application->fresh(['user', 'plan', 'tenant']),
                approved: false,
            ));
        } catch (\Throwable $e) {
            report($e);
        }

        return $this->success($application->fresh(['user', 'plan', 'tenant']), 'Tenant application rejected.');
    }
}
