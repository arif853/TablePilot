<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\BaseApiController;
use App\Models\SubscriptionPlan;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

class PlanController extends BaseApiController
{
    /**
     * List all subscription plans.
     * Public endpoint - used during tenant registration.
     */
    public function index(Request $request): JsonResponse
    {
        $query = SubscriptionPlan::query()->withCount('modules');

        // Only show active plans for non-super-admins
        if (!Auth::check() || Auth::user()?->role !== 'super_admin') {
            $query->active();
        }

        $plans = $query->ordered()->get();

        // Append active subscription counts for super admin
        if (Auth::check() && Auth::user()?->role === 'super_admin') {
            $plans->each(function ($plan) {
                $plan->active_subscriptions_count = $plan->active_subscriptions_count;
            });
        }

        return $this->success($plans);
    }

    /**
     * Store a new subscription plan.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'slug' => 'nullable|string|max:100|unique:subscription_plans,slug',
            'price' => 'required|numeric|min:0',
            'annual_price' => 'nullable|numeric|min:0',
            'trial_days' => 'nullable|integer|min:0|max:90',
            'duration_days' => 'required|integer|min:1|max:730',
            'max_users' => 'nullable|integer|min:1|max:999',
            'is_active' => 'nullable|boolean',
            'sort_order' => 'nullable|integer|min:0',
        ]);

        $validated['slug'] = $validated['slug'] ?? Str::slug($validated['name']);
        $validated['max_users'] = $validated['max_users'] ?? 5;
        $validated['is_active'] = $validated['is_active'] ?? true;
        $validated['sort_order'] = $validated['sort_order'] ?? 0;
        $validated['trial_days'] = $validated['trial_days'] ?? 0;

        $plan = SubscriptionPlan::create($validated);

        AuditLogger::logCreated($plan);

        return $this->created($plan, 'Subscription plan created successfully');
    }

    /**
     * Show a specific subscription plan.
     */
    public function show(int $id): JsonResponse
    {
        $plan = SubscriptionPlan::withCount('modules')->find($id);

        if (!$plan) {
            return $this->notFound('Subscription plan not found');
        }

        // Add stats for super admin
        if (Auth::check() && Auth::user()?->role === 'super_admin') {
            $plan->active_subscriptions_count = $plan->active_subscriptions_count;
            $plan->can_delete = $plan->canDelete();
        }

        return $this->success($plan);
    }

    /**
     * Update a subscription plan.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $plan = SubscriptionPlan::find($id);

        if (!$plan) {
            return $this->notFound('Subscription plan not found');
        }

        $validated = $request->validate([
            'name' => 'sometimes|string|max:100',
            'slug' => 'sometimes|string|max:100|unique:subscription_plans,slug,' . $id,
            'price' => 'sometimes|numeric|min:0',
            'annual_price' => 'nullable|numeric|min:0',
            'trial_days' => 'nullable|integer|min:0|max:90',
            'duration_days' => 'sometimes|integer|min:1|max:730',
            'max_users' => 'sometimes|integer|min:1|max:999',
            'is_active' => 'sometimes|boolean',
            'sort_order' => 'sometimes|integer|min:0',
        ]);

        $original = $plan->toArray();
        $plan->update($validated);

        AuditLogger::logUpdated($plan, $original);

        return $this->success($plan, 'Subscription plan updated successfully');
    }

    /**
     * Delete a subscription plan.
     */
    public function destroy(int $id): JsonResponse
    {
        $plan = SubscriptionPlan::find($id);

        if (!$plan) {
            return $this->notFound('Subscription plan not found');
        }

        $hasActiveSubscriptions = $plan->subscriptions()
            ->whereIn('status', ['active', 'grace'])
            ->exists();

        if ($hasActiveSubscriptions) {
            return $this->error('Cannot delete plan with active subscriptions. Deactivate it instead.', 422);
        }

        AuditLogger::logDeleted($plan);
        $plan->delete();

        return $this->success(null, 'Subscription plan deleted successfully');
    }

    public function toggle(int $id): JsonResponse
    {
        $plan = SubscriptionPlan::find($id);

        if (!$plan) {
            return $this->notFound('Subscription plan not found');
        }

        $original = $plan->toArray();

        $plan->update([
            'is_active' => !$plan->is_active,
        ]);

        AuditLogger::logUpdated($plan, $original);

        return $this->success($plan->fresh(), $plan->is_active ? 'Plan activated' : 'Plan deactivated');
    }
}
