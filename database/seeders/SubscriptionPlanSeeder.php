<?php

namespace Database\Seeders;

use App\Models\SubscriptionPlan;
use Illuminate\Database\Seeder;

class SubscriptionPlanSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $plans = [
            [
                'name' => 'Monthly',
                'slug' => 'monthly',
                'price' => 999.00,
                'annual_price' => null,
                'trial_days' => 14,
                'duration_days' => 30,
                'features' => [
                    'pos_enabled' => true,
                    'ai_enabled' => false,
                ],
                'max_users' => 10,
                'is_active' => true,
                'sort_order' => 1,
            ],
            [
                'name' => 'Yearly',
                'slug' => 'yearly',
                'price' => 9999.00,
                'annual_price' => null,
                'trial_days' => 14,
                'duration_days' => 365,
                'features' => [
                    'pos_enabled' => true,
                    'ai_enabled' => true,
                ],
                'max_users' => 25,
                'is_active' => true,
                'sort_order' => 2,
            ],
        ];

        foreach ($plans as $plan) {
            SubscriptionPlan::updateOrCreate(
                ['slug' => $plan['slug']],
                $plan
            );
        }
    }
}
