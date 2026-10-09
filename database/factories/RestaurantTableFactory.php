<?php

namespace Database\Factories;

use App\Models\RestaurantTable;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<RestaurantTable>
 */
class RestaurantTableFactory extends Factory
{
    protected $model = RestaurantTable::class;

    public function definition(): array
    {
        return [
            'tenant_id' => Tenant::factory(),
            'table_number' => 'T' . fake()->unique()->numberBetween(1, 100),
            'capacity' => fake()->randomElement([2, 4, 6, 8]),
            'status' => 'available',
            'qr_code' => 'TBL-' . Str::upper(Str::random(10)),
        ];
    }

    public function occupied(): static
    {
        return $this->state(fn () => ['status' => 'occupied']);
    }

    public function reserved(): static
    {
        return $this->state(fn () => ['status' => 'reserved']);
    }

    public function inactive(): static
    {
        return $this->state(fn () => ['status' => 'inactive']);
    }
}
