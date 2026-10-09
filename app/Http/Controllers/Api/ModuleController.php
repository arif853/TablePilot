<?php

namespace App\Http\Controllers\Api;

use App\Models\Module;
use App\Models\SubscriptionPlan;
use App\Services\ModulePermissionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ModuleController extends BaseApiController
{
    public function __construct(
        protected ModulePermissionService $moduleService
    ) {}

    /**
     * Get all modules grouped by their category.
     * Super admin only.
     */
    public function index(): JsonResponse
    {
        $modules = Module::ordered()->get();

        $grouped = $modules->groupBy('group')->map(function ($groupModules) {
            return $groupModules->map(function ($module) {
                return [
                    'id' => $module->id,
                    'key' => $module->key,
                    'label' => $module->label,
                    'description' => $module->description,
                    'group' => $module->group,
                    'is_core' => $module->is_core,
                    'is_active' => $module->is_active,
                    'sort_order' => $module->sort_order,
                ];
            });
        });

        return $this->success([
            'modules' => $grouped,
            'total' => $modules->count(),
        ]);
    }

    /**
     * Toggle a module's platform-wide active/inactive status.
     * Super admin only.
     */
    public function toggle(string $key): JsonResponse
    {
        $module = Module::where('key', $key)->firstOrFail();

        $this->moduleService->toggleModule($module);

        return $this->success([
            'id' => $module->id,
            'key' => $module->key,
            'label' => $module->label,
            'is_active' => $module->is_active,
        ], 'Module status toggled successfully');
    }

    /**
     * Get modules for a specific plan.
     * Super admin only.
     */
    public function getPlanModules(int $planId): JsonResponse
    {
        $plan = SubscriptionPlan::findOrFail($planId);
        $modules = Module::ordered()->get();
        $planModuleIds = $plan->modules()->pluck('module_id');

        $data = $modules->map(function ($module) use ($planModuleIds) {
            return [
                'id' => $module->id,
                'key' => $module->key,
                'label' => $module->label,
                'description' => $module->description,
                'group' => $module->group,
                'is_core' => $module->is_core,
                'is_active' => $module->is_active,
                'included' => $planModuleIds->contains($module->id),
            ];
        });

        return $this->success([
            'plan_id' => $plan->id,
            'plan_name' => $plan->name,
            'modules' => $data->groupBy('group'),
        ]);
    }

    /**
     * Sync (update) the modules for a specific plan.
     * Super admin only.
     * Body: { "module_keys": ["pos", "kitchen_display", ...] }
     */
    public function syncPlanModules(Request $request, int $planId): JsonResponse
    {
        $plan = SubscriptionPlan::findOrFail($planId);

        $validated = $request->validate([
            'module_keys' => 'required|array',
            'module_keys.*' => 'required|string|exists:modules,key',
        ]);

        $this->moduleService->syncPlanModules($plan, $validated['module_keys']);

        // Reload to show updated state
        $plan->load('modules');

        return $this->success([
            'plan_id' => $plan->id,
            'plan_name' => $plan->name,
            'modules' => $plan->modules()->pluck('key'),
            'module_count' => $plan->modules()->count(),
        ], 'Plan modules updated successfully');
    }
}
