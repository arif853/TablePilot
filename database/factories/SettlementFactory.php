<?php

namespace Database\Factories;

use App\Models\Settlement;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Settlement>
 */
class SettlementFactory extends Factory
{
    protected $model = Settlement::class;

    public function definition(): array
    {
        $totalSold = fake()->randomFloat(2, 10000, 100000);
        $commissionRate = 10.00;
        $commissionAmount = round($totalSold * $commissionRate / 100, 2);

        return [
            'tenant_id' => Tenant::factory(),
            'total_sold' => $totalSold,
            'commission_rate' => $commissionRate,
            'commission_amount' => $commissionAmount,
            'total_paid' => 0,
            'payable_balance' => $totalSold - $commissionAmount,
            'period_start' => now()->subDays(30),
            'period_end' => now(),
            'status' => 'pending',
        ];
    }

    public function settled(): static
    {
        return $this->state(function (array $attributes) {
            $payable = $attributes['total_sold'] - $attributes['commission_amount'];
            return [
                'total_paid' => $payable,
                'payable_balance' => 0,
                'status' => 'settled',
            ];
        });
    }

    public function partial(): static
    {
        return $this->state(function (array $attributes) {
            $payable = $attributes['total_sold'] - $attributes['commission_amount'];
            $paid = round($payable / 2, 2);
            return [
                'total_paid' => $paid,
                'payable_balance' => $payable - $paid,
                'status' => 'partial',
            ];
        });
    }
}
