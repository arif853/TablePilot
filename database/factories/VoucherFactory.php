<?php

namespace Database\Factories;

use App\Models\Tenant;
use App\Models\Voucher;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Voucher>
 */
class VoucherFactory extends Factory
{
    protected $model = Voucher::class;

    public function definition(): array
    {
        return [
            'tenant_id' => Tenant::factory(),
            'code' => Str::upper(fake()->unique()->bothify('????##')),
            'discount_value' => fake()->randomFloat(2, 5, 50),
            'type' => 'percentage',
            'min_purchase' => fake()->randomFloat(2, 100, 500),
            'expiry_date' => now()->addDays(30),
            'is_active' => true,
            'max_uses' => 100,
            'used_count' => 0,
        ];
    }

    public function fixed(): static
    {
        return $this->state(fn () => [
            'type' => 'fixed',
            'discount_value' => fake()->randomFloat(2, 50, 500),
        ]);
    }

    public function expired(): static
    {
        return $this->state(fn () => [
            'expiry_date' => now()->subDays(5),
        ]);
    }

    public function exhausted(): static
    {
        return $this->state(fn () => [
            'max_uses' => 10,
            'used_count' => 10,
        ]);
    }

    public function inactive(): static
    {
        return $this->state(fn () => [
            'is_active' => false,
        ]);
    }

    public function unlimited(): static
    {
        return $this->state(fn () => [
            'max_uses' => null,
        ]);
    }
}
