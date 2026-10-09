<?php

namespace App\Http\Controllers\Api;

use App\Models\Tenant;
use App\Services\ModulePermissionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class TenantModuleController extends BaseApiController
{
    public function __construct(
        protected ModulePermissionService $moduleService
    ) {}

    /**
     * Get the current user's tenant accessible modules.
     * Called once after login; result cached in frontend.
     * Tenant-facing endpoint.
     */
    public function myAccess(): JsonResponse
    {
        $tenant = Auth::user()?->tenant;

        if (!$tenant) {
            return $this->error('No tenant found', 404);
        }

        $modules = $this->moduleService->getTenantModules($tenant);
        $subscription = $tenant->activeSubscription()->first();

        return $this->success([
            'modules' => $modules,
            'subscription_plan' => $subscription?->plan?->name,
            'total_accessible' => count($modules),
        ]);
    }

    /**
     * Get the full module matrix for a specific tenant.
     * Shows plan includes, overrides, and final access status.
     * Super admin only.
     */
    public function getTenantModuleMatrix(int $tenantId): JsonResponse
    {
        $tenant = Tenant::withoutGlobalScopes()->findOrFail($tenantId);

        $matrix = $this->moduleService->getTenantModuleMatrix($tenant);
        $subscription = $tenant->activeSubscription()->first();

        return $this->success([
            'tenant_id' => $tenant->id,
            'tenant_name' => $tenant->name,
            'plan' => $subscription?->plan?->name,
            'modules' => $matrix,
        ]);
    }

    /**
     * Grant a module to a specific tenant.
     * Super admin only.
     * Body: { "module_key": "pos", "reason": "...", "expires_at": null }
     */
    public function grantModule(Request $request, int $tenantId): JsonResponse
    {
        $tenant = Tenant::withoutGlobalScopes()->findOrFail($tenantId);
        $user = Auth::user();

        $validated = $request->validate([
            'module_key' => 'required|string|exists:modules,key',
            'reason' => 'nullable|string|max:500',
            'expires_at' => 'nullable|date|after_or_equal:now',
        ]);

        $override = $this->moduleService->grantModule(
            $tenant,
            $validated['module_key'],
            $user,
            $validated['reason'] ?? null,
            $validated['expires_at'] ? \Carbon\Carbon::parse($validated['expires_at']) : null
        );

        return $this->success([
            'override_id' => $override->id,
            'tenant_id' => $override->tenant_id,
            'module_key' => $override->module->key,
            'module_label' => $override->module->label,
            'type' => $override->type,
            'reason' => $override->reason,
            'expires_at' => $override->expires_at?->toIso8601String(),
        ], 'Module granted successfully');
    }

    /**
     * Revoke a module from a specific tenant.
     * Super admin only.
     * Body: { "module_key": "pos", "reason": "..." }
     * Cannot revoke core modules.
     */
    public function revokeModule(Request $request, int $tenantId): JsonResponse
    {
        $tenant = Tenant::withoutGlobalScopes()->findOrFail($tenantId);
        $user = Auth::user();

        $validated = $request->validate([
            'module_key' => 'required|string|exists:modules,key',
            'reason' => 'nullable|string|max:500',
        ]);

        try {
            $override = $this->moduleService->revokeModule(
                $tenant,
                $validated['module_key'],
                $user,
                $validated['reason'] ?? null
            );

            return $this->success([
                'override_id' => $override->id,
                'tenant_id' => $override->tenant_id,
                'module_key' => $override->module->key,
                'module_label' => $override->module->label,
                'type' => $override->type,
                'reason' => $override->reason,
            ], 'Module revoked successfully');
        } catch (\Exception $e) {
            return $this->error($e->getMessage(), 422);
        }
    }

    /**
     * Remove a module override entirely (revert to plan default).
     * Super admin only.
     */
    public function removeOverride(int $tenantId, string $moduleKey): JsonResponse
    {
        $tenant = Tenant::withoutGlobalScopes()->findOrFail($tenantId);

        try {
            $this->moduleService->removeOverride($tenant, $moduleKey);

            return $this->success(null, 'Module override removed successfully');
        } catch (\Exception $e) {
            return $this->error($e->getMessage(), 404);
        }
    }
}
