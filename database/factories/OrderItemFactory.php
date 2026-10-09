<?php

namespace Database\Factories;

use App\Models\MenuItem;
use App\Models\Order;
use App\Models\OrderItem;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<OrderItem>
 */
class OrderItemFactory extends Factory
{
    protected $model = OrderItem::class;

    public function definition(): array
    {
        $qty = fake()->numberBetween(1, 5);
        $price = fake()->randomFloat(2, 100, 800);

        return [
            'order_id' => Order::factory(),
            'menu_item_id' => MenuItem::factory(),
            'qty' => $qty,
            'price_at_sale' => $price,
            'line_total' => round($qty * $price, 2),
            'special_instructions' => fake()->optional(0.3)->sentence(),
        ];
    }
}
