<?php

use App\Services\VatCalculationService;

beforeEach(function () {
    $this->service = new VatCalculationService();
});

// ─── VAT Exclusive Mode ───────────────────────────────────────────────────────

test('vat exclusive: calculates correct totals for simple order', function () {
    $items = [
        ['price' => '100.00', 'qty' => 2], // 200
        ['price' => '50.00', 'qty' => 3],  // 150
    ];

    $result = $this->service->computeTotals($items, 5.00, 0.00, false, 0);

    expect($result['subtotal'])->toBe('350.00')
        ->and($result['discount'])->toBe('0.00')
        ->and($result['net_amount'])->toBe('350.00')
        ->and($result['vat_rate'])->toBe('5.00')
        ->and($result['vat_amount'])->toBe('17.50')
        ->and($result['grand_total'])->toBe('367.50');
});

test('vat exclusive: calculates with discount', function () {
    $items = [
        ['price' => '200.00', 'qty' => 1],
        ['price' => '100.00', 'qty' => 1],
    ];

    $result = $this->service->computeTotals($items, 5.00, 0.00, false, 50.00);

    // subtotal=300, discount=50, net=250, vat=12.50, grand=262.50
    expect($result['subtotal'])->toBe('300.00')
        ->and($result['discount'])->toBe('50.00')
        ->and($result['net_amount'])->toBe('250.00')
        ->and($result['vat_amount'])->toBe('12.50')
        ->and($result['grand_total'])->toBe('262.50');
});

test('vat exclusive: zero vat rate means no vat', function () {
    $items = [['price' => '500.00', 'qty' => 1]];

    $result = $this->service->computeTotals($items, 0.00, 0.00, false, 0);

    expect($result['vat_amount'])->toBe('0.00')
        ->and($result['grand_total'])->toBe('500.00');
});

test('vat exclusive: zero discount', function () {
    $items = [['price' => '100.00', 'qty' => 1]];

    $result = $this->service->computeTotals($items, 5.00, 0.00, false, 0);

    expect($result['discount'])->toBe('0.00')
        ->and($result['net_amount'])->toBe('100.00')
        ->and($result['vat_amount'])->toBe('5.00')
        ->and($result['grand_total'])->toBe('105.00');
});

test('vat exclusive: full discount equals subtotal', function () {
    $items = [['price' => '100.00', 'qty' => 1]];

    $result = $this->service->computeTotals($items, 5.00, 0.00, false, 100.00);

    expect($result['net_amount'])->toBe('0.00')
        ->and($result['vat_amount'])->toBe('0.00')
        ->and($result['grand_total'])->toBe('0.00');
});

// ─── VAT Inclusive Mode ───────────────────────────────────────────────────────

test('vat inclusive: calculates correct totals', function () {
    // Items priced at 105 each (includes 5% VAT)
    $items = [['price' => '105.00', 'qty' => 2]]; // subtotal = 210

    $result = $this->service->computeTotals($items, 5.00, 0.00, true, 0);

    // net_amount (VAT-inclusive) = 210
    // vat = 210 * (5 / 105) = 10.00
    // actual net = 210 - 10 = 200
    // grand_total = 210 (original, since inclusive)
    expect($result['subtotal'])->toBe('210.00')
        ->and($result['vat_amount'])->toBe('10.00')
        ->and($result['net_amount'])->toBe('200.00')
        ->and($result['grand_total'])->toBe('210.00');
});

test('vat inclusive: with discount', function () {
    $items = [['price' => '210.00', 'qty' => 1]]; // subtotal = 210

    $result = $this->service->computeTotals($items, 5.00, 0.00, true, 10.00);

    // subtotal=210, discount=10, net_before_vat_extraction=200
    // vat = 200 * (5 / 105) = 9.52
    // actual net = 200 - 9.52 = 190.48
    // grand = 200
    expect($result['subtotal'])->toBe('210.00')
        ->and($result['discount'])->toBe('10.00')
        ->and($result['vat_amount'])->toBe('9.52')
        ->and($result['net_amount'])->toBe('190.48')
        ->and($result['grand_total'])->toBe('200.00');
});

test('vat inclusive: full discount yields zero', function () {
    $items = [['price' => '100.00', 'qty' => 1]];

    $result = $this->service->computeTotals($items, 5.00, 0.00, true, 100.00);

    expect($result['net_amount'])->toBe('0.00')
        ->and($result['vat_amount'])->toBe('0.00')
        ->and($result['grand_total'])->toBe('0.00');
});

// ─── Edge Cases ───────────────────────────────────────────────────────────────

test('discount exceeding subtotal throws exception', function () {
    $items = [['price' => '100.00', 'qty' => 1]];

    $this->service->computeTotals($items, 5.00, 0.00, false, 150.00);
})->throws(InvalidArgumentException::class, 'Discount cannot exceed subtotal.');

test('negative discount throws exception', function () {
    $items = [['price' => '100.00', 'qty' => 1]];

    $this->service->computeTotals($items, 5.00, 0.00, false, -10.00);
})->throws(InvalidArgumentException::class, 'Discount cannot be negative.');

test('large order amounts use precise decimal math', function () {
    $items = [['price' => '99999.99', 'qty' => 100]];

    $result = $this->service->computeTotals($items, 5.00, 0.00, false, 0);

    // subtotal = 9999999.00
    expect($result['subtotal'])->toBe('9999999.00')
        ->and($result['vat_amount'])->toBe('499999.95')
        ->and($result['grand_total'])->toBe('10499998.95');
});

test('fractional vat rate calculates correctly', function () {
    $items = [['price' => '100.00', 'qty' => 1]];

    $result = $this->service->computeTotals($items, 7.50, 0.00, false, 0);

    // vat = 100 * 7.5 / 100 = 7.50
    expect($result['vat_amount'])->toBe('7.50')
        ->and($result['grand_total'])->toBe('107.50');
});

test('single item single quantity', function () {
    $items = [['price' => '55.50', 'qty' => 1]];

    $result = $this->service->computeTotals($items, 5.00, 0.00, false, 0);

    // vat = 55.50 * 0.05 = 2.775 → 2.77 (bcmath truncation)
    expect($result['subtotal'])->toBe('55.50')
        ->and($result['vat_amount'])->toBe('2.77')
        ->and($result['grand_total'])->toBe('58.27');
});

test('empty items array yields zero totals', function () {
    $result = $this->service->computeTotals([], 5.00, 0.00, false, 0);

    expect($result['subtotal'])->toBe('0.00')
        ->and($result['vat_amount'])->toBe('0.00')
        ->and($result['grand_total'])->toBe('0.00');
});

// ─── Supplementary Duty (SD) ──────────────────────────────────────────────────

test('sd exclusive: sd is added on top and reported separately', function () {
    $items = [['price' => '100.00', 'qty' => 2]]; // 200

    $result = $this->service->computeTotals($items, 5.00, 10.00, false, 0);

    expect($result['sd_rate'])->toBe('10.00')
        ->and($result['sd_amount'])->toBe('20.00')
        ->and($result['vat_amount'])->toBe('10.00')
        ->and(bcadd($result['net_amount'], bcadd($result['vat_amount'], $result['sd_amount'], 2), 2))
        ->toBe($result['grand_total']);
});

test('sd inclusive: vat and sd are extracted from the price', function () {
    $items = [['price' => '115.00', 'qty' => 1]];

    $result = $this->service->computeTotals($items, 5.00, 10.00, true, 0);

    expect($result['net_amount'])->toBe('100.00')
        ->and($result['vat_amount'])->toBe('5.00')
        ->and($result['sd_amount'])->toBe('10.00')
        ->and($result['grand_total'])->toBe('115.00');
});

test('zero sd rate leaves sd amount at zero', function () {
    $result = $this->service->computeTotals([['price' => '100.00', 'qty' => 1]], 5.00, 0.00, false, 0);

    expect($result['sd_amount'])->toBe('0.00');
});
