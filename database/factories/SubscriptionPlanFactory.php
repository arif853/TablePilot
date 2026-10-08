<?php

namespace Database\Factories;

use App\Models\SubscriptionPlan;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<SubscriptionPlan>
 */
class SubscriptionPlanFactory extends Factory
{
    protected $model = SubscriptionPlan::class;

    public function definition(): array
    {
        $name = fake()->randomElement(['Starter', 'Growth', 'Pro', 'Enterprise']);

        return [
            'name' => $name,
            'slug' => Str::slug($name) . '-' . Str::random(3),
            'price' => fake()->randomFloat(2, 499, 4999),
            'duration_days' => 30,
            'max_users' => 5,
            'is_active' => true,
            'sort_order' => 0,
        ];
    }

    public function yearly(): static
    {
        return $this->state(fn () => [
            'duration_days' => 365,
            'price' => fake()->randomFloat(2, 4999, 49999),
        ]);
    }

    public function inactive(): static
    {
        return $this->state(fn () => [
            'is_active' => false,
        ]);
    }
}
