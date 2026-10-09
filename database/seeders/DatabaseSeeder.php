<?php

namespace Database\Seeders;

use App\Models\Category;
use App\Models\MenuItem;
use App\Models\RestaurantTable;
use App\Models\Settlement;
use App\Models\Subscription;
use App\Models\SubscriptionPlan;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Voucher;
use Database\Seeders\TenantSeeder;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $this->call([
            TenantSeeder::class,
            SubscriptionPlanSeeder::class,
        ]);

        User::factory(10)->create();
        SubscriptionPlan::factory(10)->create();
        // Category::factory(10)->create();
        // Tenant::factory(5)->create();
        // Subscription::factory(5)->create();
        // RestaurantTable::factory(10)->create();
        // MenuItem::factory(50)->create();
        // Voucher::factory(20)->create();
        // Order::factory(30)->create();
        // OrderItem::factory(100)->create();
        // Settlement::factory(20)->create();


    }
}
