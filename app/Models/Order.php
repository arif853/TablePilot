<?php

namespace App\Models;

use App\Models\OrderItem;
use App\Models\RestaurantTable;
use App\Models\Traits\BelongsToTenant;
use App\Models\User;
use App\Models\Voucher;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Order extends Model
{
    use HasFactory, BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'table_id',
        'voucher_id',
        'order_number',
        'public_access_token',
        'invoice_number',
        'customer_name',
        'customer_phone',
        'subtotal',
        'discount',
        'net_amount',
        'vat_rate',
        'vat_amount',
        'tax',
        'grand_total',
        'type',
        'status',
        'ip_address',
        'notes',
        'payment_method',
        'payment_status',
        'transaction_id',
        'payment_gateway',
        'paid_at',
        'source',
        'served_by',
    ];

    protected $hidden = [
        'public_access_token',
    ];

    protected function casts(): array
    {
        return [
            'subtotal' => 'decimal:2',
            'discount' => 'decimal:2',
            'net_amount' => 'decimal:2',
            'vat_rate' => 'decimal:2',
            'vat_amount' => 'decimal:2',
            'tax' => 'decimal:2',
            'grand_total' => 'decimal:2',
            'paid_at' => 'datetime',
        ];
    }

    public const STATUS_FLOW = [
        'placed' => 'confirmed',
        'confirmed' => 'preparing',
        'preparing' => 'ready',
        'ready' => 'served',
        'served' => 'completed',
    ];

    // Relationships
    public function table()
    {
        return $this->belongsTo(RestaurantTable::class, 'table_id');
    }

    public function servedBy()
    {
        return $this->belongsTo(User::class, 'served_by');
    }

    public function voucher()
    {
        return $this->belongsTo(Voucher::class);
    }

    public function items()
    {
        return $this->hasMany(OrderItem::class);
    }

    // Scopes
    public function scopeActive($query)
    {
        return $query->whereNotIn('status', ['completed', 'cancelled']);
    }

    public function scopeDineIn($query)
    {
        return $query->where('type', 'dine');
    }

    public function scopeParcel($query)
    {
        return $query->where('type', 'parcel');
    }

    public function scopeToday($query)
    {
        return $query->whereDate('created_at', today());
    }

    public function scopeDateRange($query, $from, $to)
    {
        return $query->whereBetween('created_at', [$from, $to]);
    }

    public function scopeCompleted($query)
    {
        return $query->where('status', 'completed');
    }

    // Helpers
    /**
     * Format: ORD-{YYYYMMDD}-{TENANT_ID}-{SEQ}. order_number is globally
     * unique, so the tenant id is part of it, and the sequence continues
     * from the highest existing number (not a row count, which repeats
     * after deletes). Call inside the transaction that holds the tenant's
     * invoice-counter lock so concurrent orders are serialized.
     */
    public static function generateOrderNumber(int $tenantId): string
    {
        $prefix = sprintf('ORD-%s-%d-', now()->format('Ymd'), $tenantId);

        $last = self::withoutGlobalScopes()
            ->where('order_number', 'like', $prefix . '%')
            ->orderByDesc('order_number')
            ->value('order_number');

        $next = $last ? ((int) substr($last, strlen($prefix))) + 1 : 1;

        return sprintf('%s%04d', $prefix, $next);
    }

    public function canAdvanceStatus(): bool
    {
        return isset(self::STATUS_FLOW[$this->status]);
    }

    public function getNextStatus(): ?string
    {
        return self::STATUS_FLOW[$this->status] ?? null;
    }

    public function advanceStatus(): bool
    {
        $next = $this->getNextStatus();
        if (!$next) return false;

        $this->update(['status' => $next]);
        return true;
    }

    /**
     * Whether a manual status change is allowed: one step forward along
     * STATUS_FLOW, or cancellation from any non-final state. Terminal
     * states (completed/cancelled) cannot be changed.
     */
    public function canTransitionTo(string $newStatus): bool
    {
        if (in_array($this->status, ['completed', 'cancelled'], true)) {
            return false;
        }

        return $newStatus === 'cancelled' || self::STATUS_FLOW[$this->status] === $newStatus;
    }

    /**
     * Free the table (when no other active order uses it) and give back the
     * voucher use. Call exactly once when an order reaches a terminal state.
     */
    public function releaseResources(bool $restoreVoucher = false): void
    {
        if ($this->table_id) {
            $busy = self::withoutGlobalScopes()
                ->where('table_id', $this->table_id)
                ->where('id', '!=', $this->id)
                ->active()
                ->exists();

            if (!$busy) {
                RestaurantTable::withoutGlobalScopes()
                    ->where('id', $this->table_id)
                    ->update(['status' => 'available']);
            }
        }

        if ($restoreVoucher && $this->voucher_id) {
            Voucher::withoutGlobalScopes()->find($this->voucher_id)?->releaseUsage();
        }
    }

    public function isDineIn(): bool
    {
        return $this->type === 'dine';
    }

    public function isParcel(): bool
    {
        return $this->type === 'parcel';
    }

    public function isCompleted(): bool
    {
        return $this->status === 'completed';
    }

    public function isCancelled(): bool
    {
        return $this->status === 'cancelled';
    }

    public function calculateTotals(): void
    {
        $subtotal = $this->items->sum('line_total');
        $discount = 0;

        if ($this->voucher_id && $this->voucher) {
            $discount = $this->voucher->calculateDiscount($subtotal);
        }

        $tenant = $this->tenant;
        $vatService = app(\App\Services\VatCalculationService::class);

        $items = $this->items->map(fn ($item) => [
            'price' => $item->price_at_sale,
            'qty'   => $item->qty,
        ])->all();

        $totals = $vatService->calculate($items, $tenant, $discount);

        $this->update([
            'subtotal'   => $totals['subtotal'],
            'discount'   => $totals['discount'],
            'net_amount' => $totals['net_amount'],
            'vat_rate'   => $totals['vat_rate'],
            'vat_amount' => $totals['vat_amount'],
            'tax'        => $totals['vat_amount'],
            'grand_total' => $totals['grand_total'],
        ]);
    }
}
