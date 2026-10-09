<?php

use App\Models\InvoiceCounter;
use App\Services\InvoiceNumberService;
use Illuminate\Support\Facades\DB;

beforeEach(function () {
    $this->service = new InvoiceNumberService();
});

test('generates sequential invoice numbers within transaction', function () {
    // Create a tenant row directly (minimal)
    DB::table('tenants')->insert([
        'id'         => 99,
        'name'       => 'Test Restaurant',
        'slug'       => 'test-restaurant',
        'email'      => 'test@example.com',
        'tax_rate'   => 5.00,
        'default_vat_rate' => 5.00,
        'is_active'  => true,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $invoiceNumbers = [];

    // Generate 3 invoice numbers
    for ($i = 0; $i < 3; $i++) {
        DB::transaction(function () use (&$invoiceNumbers) {
            $invoiceNumbers[] = $this->service->generate(99);
        });
    }

    $yearMonth = now()->format('Ym');

    expect($invoiceNumbers[0])->toBe("INV-99-{$yearMonth}-000001")
        ->and($invoiceNumbers[1])->toBe("INV-99-{$yearMonth}-000002")
        ->and($invoiceNumbers[2])->toBe("INV-99-{$yearMonth}-000003");
});

test('throws exception when not in transaction', function () {
    // RefreshDatabase wraps tests in a transaction, so DB::transactionLevel() > 0
    // On SQLite with RefreshDatabase, the guard will not trigger
    if (DB::getDriverName() === 'sqlite') {
        $this->markTestSkipped('Transaction level detection unreliable with SQLite + RefreshDatabase');
    }

    $this->service->generate(1);
})->throws(RuntimeException::class, 'must be called within a DB transaction');

test('different tenants have independent counters', function () {
    DB::table('tenants')->insert([
        ['id' => 100, 'name' => 'Restaurant A', 'slug' => 'rest-a', 'email' => 'a@test.com', 'tax_rate' => 5.00, 'default_vat_rate' => 5.00, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()],
        ['id' => 101, 'name' => 'Restaurant B', 'slug' => 'rest-b', 'email' => 'b@test.com', 'tax_rate' => 5.00, 'default_vat_rate' => 5.00, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()],
    ]);

    $invoiceA = null;
    $invoiceB = null;

    DB::transaction(function () use (&$invoiceA) {
        $invoiceA = $this->service->generate(100);
    });

    DB::transaction(function () use (&$invoiceB) {
        $invoiceB = $this->service->generate(101);
    });

    $yearMonth = now()->format('Ym');

    // Both should be 000001 for their respective tenants
    expect($invoiceA)->toBe("INV-100-{$yearMonth}-000001")
        ->and($invoiceB)->toBe("INV-101-{$yearMonth}-000001");
});

test('counter persists correct last invoice number', function () {
    DB::table('tenants')->insert([
        'id' => 102, 'name' => 'Restaurant C', 'slug' => 'rest-c', 'email' => 'c@test.com',
        'tax_rate' => 5.00, 'default_vat_rate' => 5.00, 'is_active' => true,
        'created_at' => now(), 'updated_at' => now(),
    ]);

    DB::transaction(function () {
        $this->service->generate(102);
    });

    DB::transaction(function () {
        $this->service->generate(102);
    });

    $counter = InvoiceCounter::where('tenant_id', 102)->first();

    expect($counter)->not->toBeNull()
        ->and($counter->last_invoice_number)->toBe(2);
});
