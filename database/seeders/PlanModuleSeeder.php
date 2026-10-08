<?php

namespace Database\Seeders;

use App\Models\Module;
use App\Models\SubscriptionPlan;
use App\Services\ModulePermissionService;
use Illuminate\Database\Seeder;

class PlanModuleSeeder extends Seeder
{
    /**
     * Run the database seeds.
     * Assigns modules to each subscription plan based on plan tier.
     * Must run AFTER ModuleSeeder and AFTER SubscriptionPlanSeeder.
     */
    public function run(): void
    {
        // Core modules (always included in any plan)
        $coreModules = [
            'menu_management',
            'order_management',
            'table_management',
        ];

        // Monthly / Basic Plan modules
        $monthlyModules = array_merge($coreModules, [
            'kitchen_display',
            'voucher_system',
            'reports_analytics',
            'user_management',
            'branding',
            'announcements_inbox',
            'online_payment_sslcommerz',
            'online_payment_bkash',
        ]);

        // Yearly / Premium Plan modules (all modules)
        $yearlyModules = [
            // Core
            'menu_management',
            'order_management',
            'table_management',
            // Operations
            'kitchen_display',
            'pos',
            'voucher_system',
            'wifi_enforcement',
            // Finance
            'reports_analytics',
            'vat_reports',
            'settlement_management',
            'online_payment_sslcommerz',
            'online_payment_bkash',
            // AI Features
            'ai_analytics_assistant',
            'ai_sales_forecast',
            'ai_recommendations',
            'ai_customer_chatbot',
            'ai_menu_description',
            'ai_sentiment_analysis',
            // Customization
            'branding',
            'user_management',
            'announcements_inbox',
        ];

        $planModuleMap = [
            // Basic-tier aliases
            'monthly' => $monthlyModules,
            'basic' => $monthlyModules,
            'starter' => $monthlyModules,

            // Premium-tier aliases
            'yearly' => $yearlyModules,
            'premium' => $yearlyModules,
            'professional' => $yearlyModules,
            'enterprise' => $yearlyModules,
        ];

        // Ensure all active plans have a module set. Plans that already have modules are left alone
        // so re-running this never overwrites selections made on the admin Plans page.
        SubscriptionPlan::query()->where('is_active', true)->get()->each(function (SubscriptionPlan $plan) use ($planModuleMap, $monthlyModules) {
            if ($plan->modules()->exists()) {
                return;
            }

            $slug = strtolower((string) $plan->slug);
            $moduleKeys = $planModuleMap[$slug] ?? $monthlyModules;
            $moduleIds = Module::whereIn('key', $moduleKeys)->pluck('id');

            $plan->modules()->sync($moduleIds);
            app(ModulePermissionService::class)->invalidatePlanCache($plan);
        });
    }
}
