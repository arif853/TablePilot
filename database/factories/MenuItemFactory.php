<?php

namespace Database\Factories;

use App\Models\Category;
use App\Models\MenuItem;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<MenuItem>
 */
class MenuItemFactory extends Factory
{
    protected $model = MenuItem::class;

    public function definition(): array
    {
        return [
            'tenant_id' => Tenant::factory(),
            'category_id' => Category::factory(),
            'name' => fake()->randomElement([
                'Chicken Biriyani', 'Kacchi Biriyani', 'Beef Curry',
                'Naan', 'Fried Rice', 'Mango Lassi', 'Gulab Jamun',
                'Fish Curry', 'Dal Makhani', 'Tandoori Chicken',
            ]),
            'description' => fake()->optional()->sentence(),
            'price' => fake()->randomFloat(2, 50, 1500),
            'is_active' => true,
            'sort_order' => fake()->numberBetween(0, 20),
        ];
    }

    public function inactive(): static
    {
        return $this->state(fn () => [
            'is_active' => false,
        ]);
    }

    public function withImage(): static
    {
        return $this->state(fn () => [
            'image' => 'menu-items/test-' . fake()->uuid() . '.jpg',
        ]);
    }
}
