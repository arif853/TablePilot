<?php

namespace App\Services;

use App\Models\Module;
use App\Models\SubscriptionPlan;
use App\Models\Tenant;
use App\Models\TenantModuleOverride;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;

class ModulePermissionService
{
    const CACHE_TTL = 3600; // 1 hour

    /**
     * Check if a tenant has access to a specific module.
     * Applies the three-layer resolution logic:
     * - Core modules are always granted
     * - Module must be platform-active
     * - Revocations take precedence (unless module is core)
     * - Grants override plan defaults
     * - Plan modules are the fallback
     */
    public function tenantHasModule(Tenant $tenant, string $moduleKey): bool
    {
        $module = Module::where('key', $moduleKey)->first();

        if (!$module) {
            return false;
        }

        // Core modules are always available
        if ($module->is_core) {
            return true;
        }

        // Module must be platform-active
        if (!$module->is_active) {
            return false;
        }

        // Check for active revocation (highest priority, prevents access)
        $revoked = $tenant->revokedModules()
            ->where('module_id', $module->id)
            ->active()
            ->exists();

        if ($revoked) {
            return false;
        }

        // Check for active grant (overrides plan defaults)
        $granted = $tenant->grantedModules()
            ->where('module_id', $module->id)
            ->active()
            ->exists();

        if ($granted) {
            return true;
        }

        // Check if module is in the subscription plan
        $subscription = $tenant->activeSubscription()->first();

        if (!$subscription || !$subscription->plan) {
            return false;
        }

        return $subscription->plan->modules()
            ->where('module_id', $module->id)
            ->exists();
    }

    /**
     * Get the full list of module keys accessible by a tenant.
     * Returns a flat array of module keys for frontend consumption.
     * Respects caching for performance.
     */
    public function getTenantModules(Tenant $tenant): array
    {
        $cacheKey = $this->cacheKey($tenant);

        $resolver = function () use ($tenant) {
            $modules = Module::where('is_active', true)->get();
            $accessible = [];

            foreach ($modules as $module) {
                if ($this->tenantHasModule($tenant, $module->key)) {
                    $accessible[] = $module->key;
                }
            }

            return $accessible;
        };

        if ($this->supportsTags()) {
            return Cache::tags(["tenant:{$tenant->id}", 'modules'])->remember($cacheKey, self::CACHE_TTL, $resolver);
        }

        return Cache::remember($cacheKey, self::CACHE_TTL, $resolver);
    }

    /**
     * Get structured module data for a tenant.
     * Each module with its source ('plan' | 'grant' | 'revoke' | 'core') and access status.
     * Used for the super admin tenant detail view and module matrix.
     */
    public function getTenantModuleMatrix(Tenant $tenant): array
    {
        $modules = Module::ordered()->get();
        $subscription = $tenant->activeSubscription()->first();
        $planModuleIds = $subscription?->plan?->modules()->pluck('module_id')->toArray() ?? [];

        $overrides = $tenant->moduleOverrides()
            ->active()
            ->with('module')
            ->get()
            ->keyBy('module_id');

        $matrix = [];

        foreach ($modules as $module) {
            $override = $overrides->get($module->id);
            $planIncludes = in_array($module->id, $planModuleIds);

            // Determine access
            $hasAccess = $this->tenantHasModule($tenant, $module->key);

            // Determine source
            $overrideType = $override?->type;

            $matrix[] = [
                'key'                => $module->key,
                'label'              => $module->label,
                'description'        => $module->description,
                'group'              => $module->group,
                'is_core'            => $module->is_core,
                'is_active'          => $module->is_active,
                'plan_includes'      => $planIncludes,
                'override_type'      => $overrideType,
                'has_access'         => $hasAccess,
                'override_reason'    => $override?->reason,
                'override_expires_at'=> $override?->expires_at?->toIso8601String(),
                'override_id'        => $override?->id,
            ];
        }

        return $matrix;
    }

    /**
     * Grant a module to a specific tenant (create override).
     * Creates or updates TenantModuleOverride with type='grant'.
     */
    public function grantModule(
        Tenant $tenant,
        string $moduleKey,
        User $grantedBy,
        ?string $reason = null,
        ?Carbon $expiresAt = null
    ): TenantModuleOverride {
        $module = Module::where('key', $moduleKey)->firstOrFail();

        $override = TenantModuleOverride::updateOrCreate(
            [
                'tenant_id' => $tenant->id,
                'module_id' => $module->id,
            ],
            [
                'type'       => 'grant',
                'reason'     => $reason,
                'granted_by' => $grantedBy->id,
                'expires_at' => $expiresAt,
            ]
        );

        $this->invalidateCache($tenant);

        // Audit logging
        AuditLogger::logAction('module_granted', null, [
            'tenant_id'  => $tenant->id,
            'tenant_name'=> $tenant->name,
            'module_key' => $moduleKey,
            'module_label' => $module->label,
            'reason'     => $reason,
            'expires_at' => $expiresAt?->toIso8601String(),
        ]);

        return $override;
    }

    /**
     * Revoke a module from a specific tenant.
     * Creates or updates TenantModuleOverride with type='revoke'.
     * Throws exception if module is_core.
     */
    public function revokeModule(
        Tenant $tenant,
        string $moduleKey,
        User $revokedBy,
        ?string $reason = null
    ): TenantModuleOverride {
        $module = Module::where('key', $moduleKey)->firstOrFail();

        // Core modules cannot be revoked
        if ($module->is_core) {
            throw new \Exception("Cannot revoke core module: {$moduleKey}");
        }

        $override = TenantModuleOverride::updateOrCreate(
            [
                'tenant_id' => $tenant->id,
                'module_id' => $module->id,
            ],
            [
                'type'       => 'revoke',
                'reason'     => $reason,
                'granted_by' => $revokedBy->id,
                'expires_at' => null, // Revokes don't expire
            ]
        );

        $this->invalidateCache($tenant);

        // Audit logging
        AuditLogger::logAction('module_revoked', null, [
            'tenant_id'   => $tenant->id,
            'tenant_name' => $tenant->name,
            'module_key'  => $moduleKey,
            'module_label'=> $module->label,
            'reason'      => $reason,
        ]);

        return $override;
    }

    /**
     * Remove an override entirely (revert to plan default).
     */
    public function removeOverride(Tenant $tenant, string $moduleKey): void
    {
        $module = Module::where('key', $moduleKey)->firstOrFail();

        $override = TenantModuleOverride::where('tenant_id', $tenant->id)
            ->where('module_id', $module->id)
            ->first();

        if ($override) {
            $override->delete();

            $this->invalidateCache($tenant);

            // Audit logging
            AuditLogger::logAction('module_override_removed', null, [
                'tenant_id'   => $tenant->id,
                'tenant_name' => $tenant->name,
                'module_key'  => $moduleKey,
                'module_label'=> $module->label,
                'was_type'    => $override->type,
            ]);
        }
    }

    /**
     * Sync modules for a plan. Replaces all plan_modules records.
     * Used when super admin edits plan modules.
     */
    public function syncPlanModules(SubscriptionPlan $plan, array $moduleKeys): void
    {
        $validKeys = Module::whereIn('key', $moduleKeys)->pluck('key')->toArray();
        $coreModuleKeys = Module::where('is_core', true)->pluck('key')->toArray();
        $keysToSync = array_values(array_unique(array_merge($validKeys, $coreModuleKeys)));
        $modules = Module::whereIn('key', $keysToSync)->pluck('id');

        $plan->modules()->sync($modules);

        // Invalidate cache for ALL tenants on this plan
        $this->invalidatePlanCache($plan);

        // Audit logging
        AuditLogger::logAction('plan_modules_updated', null, [
            'plan_id'    => $plan->id,
            'plan_name'  => $plan->name,
            'modules'    => $keysToSync,
            'count'      => count($keysToSync),
        ]);
    }

    /**
     * Toggle module platform-wide active/inactive status.
     * Affects all tenants regardless of plan.
     */
    public function toggleModule(Module $module): void
    {
        $module->update(['is_active' => !$module->is_active]);

        // Invalidate cache for ALL tenants
        if ($this->supportsTags()) {
            Cache::tags(['modules'])->flush();
        } else {
            Cache::flush();
        }

        // Audit logging
        AuditLogger::logAction('module_platform_toggled', null, [
            'module_key'   => $module->key,
            'module_label' => $module->label,
            'is_active'    => $module->is_active,
        ]);
    }

    /**
     * Cache key for a tenant's resolved module list.
     */
    private function cacheKey(Tenant $tenant): string
    {
        return "modules:tenant:{$tenant->id}";
    }

    /**
     * Invalidate the cached module list for a single tenant.
     */
    public function invalidateCache(Tenant $tenant): void
    {
        if ($this->supportsTags()) {
            Cache::tags(["tenant:{$tenant->id}", 'modules'])->forget($this->cacheKey($tenant));

            return;
        }

        Cache::forget($this->cacheKey($tenant));
    }

    /**
     * Invalidate the cached module list for all tenants on a plan.
     */
    public function invalidatePlanCache(SubscriptionPlan $plan): void
    {
        if ($this->supportsTags()) {
            Cache::tags(["plan:{$plan->id}", 'modules'])->flush();

            return;
        }

        // Get all active subscriptions on this plan
        $tenantIds = $plan->subscriptions()
            ->where('status', 'active')
            ->distinct()
            ->pluck('tenant_id');

        foreach ($tenantIds as $tenantId) {
            Cache::forget("modules:tenant:{$tenantId}");
        }
    }

    private function supportsTags(): bool
    {
        return method_exists(Cache::getStore(), 'tags');
    }
}
