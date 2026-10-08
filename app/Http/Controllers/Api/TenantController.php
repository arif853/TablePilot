<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\BaseApiController;
use App\Http\Requests\StoreTenantRequest;
use App\Http\Requests\UpdateTenantRequest;
use App\Models\Order;
use App\Models\Settlement;
use App\Models\Subscription;
use App\Models\Tenant;
use App\Models\User;
use App\Services\AuditLogger;
use App\Services\SubscriptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use PHPOpenSourceSaver\JWTAuth\Facades\JWTAuth;
use Carbon\Carbon;

class TenantController extends BaseApiController
{
    public function index(Request $request): JsonResponse
    {
        // Lightweight unpaginated list for dropdowns (subscriptions, user assignment)
        if ($request->boolean('all')) {
            return $this->success(
                Tenant::orderBy('name')->get(['id', 'name', 'slug', 'is_active', 'max_users'])
            );
        }

        $query = Tenant::query()
            ->withCount(['users', 'orders'])
            ->with('activeSubscription.plan:id,name');

        if ($search = $request->get('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('slug', 'like', "%{$search}%");
            });
        }

        if ($status = $request->get('status')) {
            $query->where('is_active', $status === 'active');
        }

        $perPage = min(max((int) $request->get('per_page', 15), 1), 100);

        return $this->paginated($query->latest(), $perPage);
    }

    public function store(StoreTenantRequest $request): JsonResponse
    {
        return DB::transaction(function () use ($request) {
            $tenant = Tenant::create([
                'name' => $request->name,
                'slug' => Str::slug($request->name) . '-' . Str::random(5),
                'email' => $request->email,
                'phone' => $request->phone,
                'address' => $request->address,
                'authorized_wifi_ip' => $request->authorized_wifi_ip,
                'payment_mode' => $request->payment_mode ?? 'seller',
                'commission_rate' => $request->commission_rate ?? 0,
                'tax_rate' => $request->tax_rate ?? 0,
                'max_users' => $request->max_users ?? 5,
                'is_active' => true,
            ]);

            // Create admin user for tenant
            $admin = User::create([
                'tenant_id' => $tenant->id,
                'name' => $request->admin_name,
                'email' => $request->admin_email,
                'password' => $request->admin_password,
                'role' => User::ROLE_RESTAURANT_ADMIN,
                'status' => 'active',
            ]);

            // Create subscription
            $planModel = $request->plan_id
                ? \App\Models\SubscriptionPlan::find($request->plan_id)
                : null;

            $planDays = $planModel
                ? $planModel->duration_days
                : match ($request->plan_type) {
                    'monthly' => config('saas.plans.monthly.duration_days', 30),
                    'yearly' => config('saas.plans.yearly.duration_days', 365),
                    'custom' => $request->custom_days ?? 30,
                    default => 30,
                };

            if ($planModel && $request->boolean('start_trial')) {
                app(SubscriptionService::class)->createTrialSubscription(
                    $tenant,
                    $planModel,
                    (int) ($request->trial_days ?: $planModel->trial_days ?: config('saas.trial.default_days', 14))
                );

                // Trial uses the plan's max_users unless the admin set one explicitly
                if ($request->filled('max_users')) {
                    $tenant->update(['max_users' => $request->max_users]);
                }

                AuditLogger::logCreated($tenant);

                return $this->created([
                    'tenant' => $tenant->fresh()->load('activeSubscription'),
                    'admin' => $admin->fresh(),
                ], 'Restaurant onboarded on a free trial');
            }

            // Use plan max_users if a plan was selected
            if ($planModel && !$request->filled('max_users')) {
                $tenant->update(['max_users' => $planModel->max_users]);
            }

            Subscription::withoutGlobalScopes()->create([
                'tenant_id' => $tenant->id,
                'plan_id' => $planModel?->id,
                'plan_type' => $planModel ? $planModel->subscriptionType() : $request->plan_type,
                'amount' => $request->subscription_amount,
                'payment_method' => $request->payment_method ?? 'manual',
                'payment_ref' => $request->payment_ref,
                'starts_at' => now(),
                'expires_at' => now()->addDays($planDays),
                'status' => 'active',
            ]);

            AuditLogger::logCreated($tenant);

            return $this->created([
                'tenant' => $tenant->fresh()->load('activeSubscription'),
                'admin' => $admin->fresh(),
            ], 'Restaurant onboarded successfully');
        });
    }

    public function show(int $id): JsonResponse
    {
        $tenant = Tenant::with(['activeSubscription', 'users'])
            ->withCount(['tables', 'menuItems', 'orders', 'vouchers'])
            ->find($id);

        if (!$tenant) {
            return $this->notFound('Tenant not found');
        }

        return $this->success($tenant);
    }

    public function update(UpdateTenantRequest $request, int $id): JsonResponse
    {
        $tenant = Tenant::find($id);

        if (!$tenant) {
            return $this->notFound('Tenant not found');
        }

        $data = $request->validated();
        $original = $tenant->toArray();

        if ($request->hasFile('logo')) {
            // Delete old logo when replacing
            if ($tenant->logo) {
                Storage::disk('public')->delete($tenant->logo);
            }
            $data['logo'] = $request->file('logo')->store('tenants/logos', 'public');
        }

        $tenant->update($data);

        AuditLogger::logUpdated($tenant, $original);

        return $this->success($tenant->fresh(), 'Tenant updated successfully');
    }

    public function destroy(int $id): JsonResponse
    {
        $tenant = Tenant::find($id);

        if (!$tenant) {
            return $this->notFound('Tenant not found');
        }

        $tenant->update(['is_active' => false]);

        AuditLogger::logAction('tenant_deactivated', $tenant);

        return $this->success(null, 'Tenant deactivated successfully');
    }

    public function dashboard(): JsonResponse
    {
        $user = auth()->user();

        if ($user->isSuperAdmin()) {
            return $this->success([
                'total_tenants' => Tenant::count(),
                'active_tenants' => Tenant::where('is_active', true)->count(),
                'total_users' => User::count(),
                'total_revenue' => Subscription::withoutGlobalScopes()
                    ->where('status', 'active')->sum('amount'),
            ]);
        }

        return $this->forbidden();
    }

    /**
     * Get detailed stats for a specific tenant.
     */
    public function stats(int $id): JsonResponse
    {
        $tenant = Tenant::find($id);

        if (!$tenant) {
            return $this->notFound('Tenant not found');
        }

        $now = Carbon::now();
        $startOfMonth = $now->copy()->startOfMonth();

        // Order stats
        $totalOrders = Order::withoutGlobalScopes()->where('tenant_id', $id)->count();
        $ordersThisMonth = Order::withoutGlobalScopes()
            ->where('tenant_id', $id)
            ->where('created_at', '>=', $startOfMonth)
            ->count();

        // Revenue stats
        $totalRevenue = Order::withoutGlobalScopes()
            ->where('tenant_id', $id)
            ->where('status', 'completed')
            ->sum('grand_total');

        $revenueThisMonth = Order::withoutGlobalScopes()
            ->where('tenant_id', $id)
            ->where('status', 'completed')
            ->where('created_at', '>=', $startOfMonth)
            ->sum('grand_total');

        // User stats
        $activeUsers = User::where('tenant_id', $id)->where('status', 'active')->count();
        $totalUsers = User::where('tenant_id', $id)->count();

        // Subscription history
        $subscriptions = Subscription::withoutGlobalScopes()
            ->where('tenant_id', $id)
            ->orderByDesc('created_at')
            ->get();

        // Settlement/balance stats
        $balanceDue = Settlement::withoutGlobalScopes()
            ->where('tenant_id', $id)
            ->where('status', '!=', 'settled')
            ->sum('payable_balance');

        $totalPaid = Settlement::withoutGlobalScopes()
            ->where('tenant_id', $id)
            ->sum('total_paid');

        // Monthly revenue trend (last 6 months)
        $revenueTrend = Order::withoutGlobalScopes()
            ->where('tenant_id', $id)
            ->where('status', 'completed')
            ->where('created_at', '>=', $now->copy()->subMonths(6)->startOfMonth())
            ->select(
                DB::raw("DATE_FORMAT(created_at, '%Y-%m') as month"),
                DB::raw('SUM(grand_total) as revenue'),
                DB::raw('COUNT(*) as orders')
            )
            ->groupBy('month')
            ->orderBy('month')
            ->get();

        return $this->success([
            'tenant' => $tenant->load(['activeSubscription', 'users']),
            'stats' => [
                'total_orders' => $totalOrders,
                'orders_this_month' => $ordersThisMonth,
                'total_revenue' => round($totalRevenue, 2),
                'revenue_this_month' => round($revenueThisMonth, 2),
                'active_users' => $activeUsers,
                'total_users' => $totalUsers,
                'balance_due' => round($balanceDue, 2),
                'total_paid' => round($totalPaid, 2),
            ],
            'subscriptions' => $subscriptions,
            'revenue_trend' => $revenueTrend,
        ]);
    }

    /**
     * Impersonate a tenant's admin user.
     * Returns a short-lived JWT for the tenant's restaurant_admin.
     */
    public function impersonate(int $id): JsonResponse
    {
        $tenant = Tenant::find($id);

        if (!$tenant) {
            return $this->notFound('Tenant not found');
        }

        // Find the restaurant admin for this tenant
        $admin = User::where('tenant_id', $id)
            ->where('role', User::ROLE_RESTAURANT_ADMIN)
            ->where('status', 'active')
            ->first();

        if (!$admin) {
            return $this->error('No active restaurant admin found for this tenant', 404);
        }

        // Generate a short-lived token (15 minutes)
        $token = JWTAuth::customClaims(['exp' => now()->addMinutes(15)->timestamp])
            ->fromUser($admin);

        // Log the impersonation
        AuditLogger::logImpersonation($admin);

        return $this->success([
            'token' => $token,
            'expires_in' => 15 * 60, // 15 minutes in seconds
            'user' => $admin,
            'tenant' => $tenant,
        ], 'Impersonation token generated');
    }

    /**
     * Send an email to a tenant's admin.
     */
    public function sendEmail(Request $request, int $id): JsonResponse
    {
        $tenant = Tenant::find($id);

        if (!$tenant) {
            return $this->notFound('Tenant not found');
        }

        $request->validate([
            'subject' => 'required|string|max:255',
            'message' => 'required|string',
        ]);

        // Get tenant admin email
        $adminEmail = $tenant->email;

        // Also get user admin emails
        $adminUsers = User::where('tenant_id', $id)
            ->where('role', User::ROLE_RESTAURANT_ADMIN)
            ->pluck('email')
            ->toArray();

        $recipients = array_unique(array_merge([$adminEmail], $adminUsers));

        try {
            Mail::raw($request->message, function ($mail) use ($recipients, $request, $tenant) {
                $mail->to($recipients)
                    ->subject($request->subject)
                    ->from(config('mail.from.address'), config('mail.from.name'));
            });

            AuditLogger::logAction('email_sent', $tenant, [
                'subject' => $request->subject,
                'recipients' => $recipients,
            ]);

            return $this->success(null, 'Email sent successfully');
        } catch (\Exception $e) {
            return $this->error('Failed to send email: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Perform bulk actions on multiple tenants.
     */
    public function bulkAction(Request $request): JsonResponse
    {
        $request->validate([
            'action' => 'required|in:activate,deactivate,delete',
            'tenant_ids' => 'required|array|min:1',
            'tenant_ids.*' => 'integer|exists:tenants,id',
        ]);

        $action = $request->action;
        $tenantIds = $request->tenant_ids;
        $affected = 0;

        DB::transaction(function () use ($action, $tenantIds, &$affected) {
            $tenants = Tenant::whereIn('id', $tenantIds)->get();

            foreach ($tenants as $tenant) {
                $original = $tenant->toArray();

                switch ($action) {
                    case 'activate':
                        $tenant->update(['is_active' => true]);
                        break;
                    case 'deactivate':
                        $tenant->update(['is_active' => false]);
                        break;
                    case 'delete':
                        // Soft delete by deactivating - don't actually delete
                        $tenant->update(['is_active' => false]);
                        break;
                }

                AuditLogger::logUpdated($tenant, $original);
                $affected++;
            }
        });

        $actionPast = match ($action) {
            'activate' => 'activated',
            'deactivate' => 'deactivated',
            'delete' => 'deleted',
        };

        return $this->success([
            'affected' => $affected,
        ], "{$affected} tenants {$actionPast} successfully");
    }

    /**
     * Export tenants to CSV.
     */
    public function export(Request $request): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        $tenants = Tenant::with('activeSubscription')
            ->withCount(['users', 'orders'])
            ->get();

        $filename = 'tenants-export-' . date('Y-m-d') . '.csv';

        return response()->streamDownload(function () use ($tenants) {
            $handle = fopen('php://output', 'w');

            // Header
            fputcsv($handle, [
                'ID',
                'Name',
                'Slug',
                'Email',
                'Phone',
                'Status',
                'Users',
                'Orders',
                'Subscription Status',
                'Subscription Expires',
                'Created At',
            ]);

            // Data
            foreach ($tenants as $tenant) {
                fputcsv($handle, [
                    $tenant->id,
                    $tenant->name,
                    $tenant->slug,
                    $tenant->email,
                    $tenant->phone,
                    $tenant->is_active ? 'Active' : 'Inactive',
                    $tenant->users_count,
                    $tenant->orders_count,
                    $tenant->activeSubscription?->status ?? 'None',
                    $tenant->activeSubscription?->expires_at?->format('Y-m-d') ?? 'N/A',
                    $tenant->created_at->format('Y-m-d H:i'),
                ]);
            }

            fclose($handle);
        }, $filename, [
            'Content-Type' => 'text/csv',
        ]);
    }
}
