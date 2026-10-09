<?php

namespace App\Models;

use App\Models\Order;
use App\Models\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Voucher extends Model
{
    use HasFactory, BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'code',
        'discount_value',
        'type',
        'min_purchase',
        'expiry_date',
        'is_active',
        'max_uses',
        'used_count',
    ];

    protected function casts(): array
    {
        return [
            'discount_value' => 'decimal:2',
            'min_purchase' => 'decimal:2',
            'expiry_date' => 'date',
            'is_active' => 'boolean',
            'max_uses' => 'integer',
            'used_count' => 'integer',
        ];
    }

    // Relationships
    public function orders()
    {
        return $this->hasMany(Order::class);
    }

    // Scopes
    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    public function scopeValid($query)
    {
        return $query->active()
            ->where('expiry_date', '>=', now())
            ->where(function ($q) {
                $q->whereNull('max_uses')
                    ->orWhereColumn('used_count', '<', 'max_uses');
            });
    }

    // Helpers
    public function isValid(): bool
    {
        if (!$this->is_active) return false;
        if ($this->expiry_date->isPast()) return false;
        if ($this->max_uses && $this->used_count >= $this->max_uses) return false;
        return true;
    }

    public function isExpired(): bool
    {
        return $this->expiry_date->isPast();
    }

    public function calculateDiscount(float $subtotal): float
    {
        if ($subtotal < $this->min_purchase) return 0;

        if ($this->type === 'percentage') {
            return round($subtotal * ($this->discount_value / 100), 2);
        }

        return min($this->discount_value, $subtotal);
    }

    /**
     * Atomically consume one use. Returns false if the usage cap was
     * reached by a concurrent order.
     */
    public function incrementUsage(): bool
    {
        return static::withoutGlobalScopes()
            ->where('id', $this->id)
            ->where(fn ($q) => $q->whereNull('max_uses')->orWhereColumn('used_count', '<', 'max_uses'))
            ->increment('used_count') > 0;
    }

    public function releaseUsage(): void
    {
        static::withoutGlobalScopes()
            ->where('id', $this->id)
            ->where('used_count', '>', 0)
            ->decrement('used_count');
    }
}
