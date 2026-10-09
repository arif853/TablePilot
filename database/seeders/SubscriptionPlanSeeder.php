<?php

namespace Database\Seeders;

use App\Models\Module;
use App\Models\SubscriptionPlan;
use App\Services\ModulePermissionService;
use Illuminate\Database\Seeder;

/**
 * The three public plans. Prices are in BDT per 30 days; the annual price is
 * ten months' worth (two months free). Must run AFTER ModuleSeeder.
 */
class SubscriptionPlanSeeder extends Seeder
{
    private const CORE = ['menu_management', 'order_management', 'table_management'];

    private const STARTER = [
        'kitchen_display',
        'voucher_system',
        'reports_analytics',
        'user_management',
        'announcements_inbox',
        'online_payment_bkash',
    ];

    private const PROFESSIONAL = [
        'pos',
        'wifi_enforcement',
        'vat_reports',
        'online_payment_sslcommerz',
        'branding',
        'ai_menu_description',
        'ai_recommendations',
    ];

    public const PLANS = [
        [
            'name' => 'Starter',
            'slug' => 'starter',
            'price' => 999.00,
            'annual_price' => 9990.00,
            'trial_days' => 14,
            'duration_days' => 30,
            'max_users' => 3,
            'is_active' => true,
            'sort_order' => 1,
        ],
        [
            'name' => 'Professional',
            'slug' => 'professional',
            'price' => 1999.00,
            'annual_price' => 19990.00,
            'trial_days' => 14,
            'duration_days' => 30,
            'max_users' => 10,
            'is_active' => true,
            'sort_order' => 2,
        ],
        [
            'name' => 'Enterprise',
            'slug' => 'enterprise',
            'price' => 4999.00,
            'annual_price' => 49990.00,
            'trial_days' => 14,
            'duration_days' => 30,
            'max_users' => 30,
            'is_active' => true,
            'sort_order' => 3,
        ],
    ];

    /**
     * Module keys included in a plan tier. Enterprise gets every module in the registry.
     */
    public static function moduleKeysFor(string $slug): array
    {
        return match ($slug) {
            'starter' => [...self::CORE, ...self::STARTER],
            'professional' => [...self::CORE, ...self::STARTER, ...self::PROFESSIONAL],
            'enterprise' => Module::pluck('key')->all(),
        };
    }

    public function run(): void
    {
        foreach (self::PLANS as $attributes) {
            $plan = SubscriptionPlan::updateOrCreate(['slug' => $attributes['slug']], $attributes);

            $plan->modules()->sync(
                Module::whereIn('key', self::moduleKeysFor($plan->slug))->pluck('id')
            );
            app(ModulePermissionService::class)->invalidatePlanCache($plan);
        }
    }
}
