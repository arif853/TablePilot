<?php

namespace App\Services;

use App\Models\Tenant;
use InvalidArgumentException;

class VatCalculationService
{
    /**
     * Calculate all financial totals for an order.
     *
     * @param  array  $items        Array of ['price' => decimal, 'qty' => int]
     * @param  Tenant $tenant       The restaurant tenant
     * @param  float  $discount     Discount amount (pre-validated, must not exceed subtotal)
     * @return array{subtotal: string, discount: string, net_amount: string, vat_rate: string, vat_amount: string, sd_rate: string, sd_amount: string, grand_total: string}
     */
    public function calculate(array $items, Tenant $tenant, float $discount = 0): array
    {
        $vatRate    = (float) $tenant->default_vat_rate;
        $sdRate     = (float) ($tenant->default_sd_rate ?? 0);
        $vatInclusive = (bool) $tenant->vat_inclusive;

        return $this->computeTotals($items, $vatRate, $sdRate, $vatInclusive, $discount);
    }

    /**
     * Core calculation engine — stateless, testable.
     *
     * @param  array  $items        Array of ['price' => string|float, 'qty' => int]
     * @param  float  $vatRate      VAT rate as percentage (e.g. 5.00)
    * @param  float  $sdRate       SD rate as percentage (e.g. 10.00)
    * @param  bool   $vatInclusive Whether prices already include VAT
     * @param  float  $discount     Flat discount amount
    * @return array{subtotal: string, discount: string, net_amount: string, vat_rate: string, vat_amount: string, sd_rate: string, sd_amount: string, grand_total: string}
     */
    public function computeTotals(array $items, float $vatRate, float $sdRate, bool $vatInclusive, float $discount = 0): array
    {
        // Step 1: Subtotal = sum of (price * qty) using bcmath for precision
        $subtotal = '0.00';
        foreach ($items as $item) {
            $lineTotal = bcmul((string) $item['price'], (string) $item['qty'], 2);
            $subtotal  = bcadd($subtotal, $lineTotal, 2);
        }

        // Validate discount
        $discount = number_format(round($discount, 2), 2, '.', '');
        if (bccomp($discount, $subtotal, 2) > 0) {
            throw new InvalidArgumentException('Discount cannot exceed subtotal.');
        }

        if (bccomp($discount, '0.00', 2) < 0) {
            throw new InvalidArgumentException('Discount cannot be negative.');
        }

        // Step 2: Net amount = subtotal - discount
        $netAmount = bcsub($subtotal, $discount, 2);

        // Step 3: VAT calculation
        $vatRateStr = number_format(round($vatRate, 2), 2, '.', '');
        $sdRateStr = number_format(round($sdRate, 2), 2, '.', '');

        if ($vatInclusive) {
            // VAT+SD are already included in prices.
            $combinedRate = bcadd($vatRateStr, $sdRateStr, 2);
            $divisor = bcadd('100', $combinedRate, 2);
            $taxTotal = bcdiv(bcmul($netAmount, $combinedRate, 4), $divisor, 2);

            $vatAmount = '0.00';
            $sdAmount = '0.00';
            if (bccomp($combinedRate, '0.00', 2) > 0) {
                $vatAmount = bcdiv(bcmul($taxTotal, $vatRateStr, 4), $combinedRate, 2);
                $sdAmount = bcsub($taxTotal, $vatAmount, 2);
            }

            // Actual net (excluding VAT and SD) = net_amount - taxTotal
            $actualNet = bcsub($netAmount, $taxTotal, 2);

            // Grand total = original net_amount (prices already include VAT)
            $grandTotal = $netAmount;

            // Update net_amount to the VAT-exclusive portion
            $netAmount = $actualNet;
        } else {
            // VAT/SD exclusive — add both taxes on top.
            $vatAmount = bcdiv(bcmul($netAmount, $vatRateStr, 4), '100', 2);
            $sdAmount = bcdiv(bcmul($netAmount, $sdRateStr, 4), '100', 2);
            $grandTotal = bcadd($netAmount, bcadd($vatAmount, $sdAmount, 2), 2);
        }

        return [
            'subtotal'    => $subtotal,
            'discount'    => $discount,
            'net_amount'  => $netAmount,
            'vat_rate'    => $vatRateStr,
            'vat_amount'  => $vatAmount,
            'sd_rate'     => $sdRateStr,
            'sd_amount'   => $sdAmount,
            'grand_total' => $grandTotal,
        ];
    }
}
