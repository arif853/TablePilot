<?php

namespace Database\Factories;

use App\Models\Order;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Order>
 */
class OrderFactory extends Factory
{
    protected $model = Order::class;

    public function definition(): array
    {
        $subtotal = fake()->randomFloat(2, 200, 5000);
        $vatRate = 5.00;
        $vatAmount = round($subtotal * $vatRate / 100, 2);

        return [
            'tenant_id' => Tenant::factory(),
            'order_number' => 'ORD-' . strtoupper(fake()->unique()->bothify('??####')),
            'invoice_number' => 'INV-' . strtoupper(fake()->unique()->bothify('??####')),
            'customer_name' => fake()->name(),
            'customer_phone' => fake()->phoneNumber(),
            'subtotal' => $subtotal,
            'discount' => 0,
            'net_amount' => $subtotal,
            'vat_rate' => $vatRate,
            'vat_amount' => $vatAmount,
            'tax' => 0,
            'grand_total' => $subtotal + $vatAmount,
            'type' => fake()->randomElement(['dine_in', 'parcel']),
            'status' => 'placed',
            'payment_method' => 'cash',
            'payment_status' => 'pending',
            'source' => 'customer',
            'ip_address' => fake()->ipv4(),
        ];
    }

    public function confirmed(): static
    {
        return $this->state(fn () => ['status' => 'confirmed']);
    }

    public function preparing(): static
    {
        return $this->state(fn () => ['status' => 'preparing']);
    }

    public function ready(): static
    {
        return $this->state(fn () => ['status' => 'ready']);
    }

    public function completed(): static
    {
        return $this->state(fn () => [
            'status' => 'completed',
            'payment_status' => 'paid',
            'paid_at' => now(),
        ]);
    }

    public function cancelled(): static
    {
        return $this->state(fn () => ['status' => 'cancelled']);
    }

    public function dineIn(): static
    {
        return $this->state(fn () => ['type' => 'dine_in']);
    }

    public function parcel(): static
    {
        return $this->state(fn () => ['type' => 'parcel']);
    }

    public function paid(): static
    {
        return $this->state(fn () => [
            'payment_status' => 'paid',
            'paid_at' => now(),
        ]);
    }

    public function fromPos(): static
    {
        return $this->state(fn () => ['source' => 'pos']);
    }
}
