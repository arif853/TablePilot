<?php

namespace Database\Factories;

use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Tenant>
 */
class TenantFactory extends Factory
{
    protected $model = Tenant::class;

    public function definition(): array
    {
        $name = fake()->company();

        return [
            'name' => $name,
            'slug' => Str::slug($name) . '-' . Str::random(5),
            'email' => fake()->unique()->companyEmail(),
            'phone' => fake()->phoneNumber(),
            'address' => fake()->address(),
            'is_active' => true,
            'payment_mode' => 'seller',
            'commission_rate' => 0,
            'tax_rate' => 0,
            'default_vat_rate' => 5.00,
            'vat_registered' => false,
            'vat_inclusive' => false,
            'max_users' => 5,
            'currency' => 'BDT',
        ];
    }

    public function inactive(): static
    {
        return $this->state(fn () => [
            'is_active' => false,
        ]);
    }

    public function vatRegistered(): static
    {
        return $this->state(fn () => [
            'vat_registered' => true,
            'vat_number' => 'BIN-' . fake()->numerify('#########'),
            'default_vat_rate' => 5.00,
        ]);
    }

    public function platformCollection(): static
    {
        return $this->state(fn () => [
            'payment_mode' => 'platform',
            'commission_rate' => 10.00,
        ]);
    }

    public function withWifi(string $ip = '192.168.1.0'): static
    {
        return $this->state(fn () => [
            'authorized_wifi_ip' => $ip,
        ]);
    }
}
