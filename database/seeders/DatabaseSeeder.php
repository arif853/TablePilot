<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed a fresh database: module registry, the three plans, the super admin
     * and two demo restaurants. Run with `php artisan migrate:fresh --seed`.
     */
    public function run(): void
    {
        $this->call([
            ModuleSeeder::class,
            SubscriptionPlanSeeder::class,
            SuperAdminSeeder::class,
            DemoRestaurantSeeder::class,
        ]);
    }
}
