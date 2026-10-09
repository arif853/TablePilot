<?php

namespace Database\Seeders;

use App\Models\Module;
use App\Models\SubscriptionPlan;
use App\Services\ModulePermissionService;
use Illuminate\Database\Seeder;

class PlanModuleSeeder extends Seeder
{
    /**
     * Gives every active plan that has no modules yet the module set of its tier.
     * Plans that already have modules are left alone so re-running this never
     * overwrites selections made on the admin Plans page.
     */
    public function run(): void
    {
        // Older plan slugs map onto the current tiers; anything unknown gets Starter
        $tierBySlug = [
            'starter' => 'starter',
            'monthly' => 'starter',
            'basic' => 'starter',
            'professional' => 'professional',
            'enterprise' => 'enterprise',
            'yearly' => 'enterprise',
            'premium' => 'enterprise',
        ];

        SubscriptionPlan::query()->where('is_active', true)->get()->each(function (SubscriptionPlan $plan) use ($tierBySlug) {
            if ($plan->modules()->exists()) {
                return;
            }

            $tier = $tierBySlug[strtolower((string) $plan->slug)] ?? 'starter';
            $moduleIds = Module::whereIn('key', SubscriptionPlanSeeder::moduleKeysFor($tier))->pluck('id');

            $plan->modules()->sync($moduleIds);
            app(ModulePermissionService::class)->invalidatePlanCache($plan);
        });
    }
}
