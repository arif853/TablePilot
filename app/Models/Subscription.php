<?php

namespace App\Models;

use App\Models\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Subscription extends Model
{
    use HasFactory, BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'plan_id',
        'plan_type',
        'is_trial',
        'amount',
        'payment_method',
        'payment_ref',
        'transaction_id',
        'starts_at',
        'expires_at',
        'grace_ends_at',
        'status',
        'initiated_by',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'is_trial' => 'boolean',
            'starts_at' => 'date',
            'expires_at' => 'date',
            'grace_ends_at' => 'datetime',
        ];
    }

    /**
     * Get the subscription plan.
     */
    public function plan()
    {
        return $this->belongsTo(SubscriptionPlan::class, 'plan_id');
    }

    // Scopes
    public function scopeActive($query)
    {
        return $query->where('status', 'active')
            ->where('expires_at', '>=', today());
    }

    public function scopeGrace($query)
    {
        return $query->where('status', 'grace')
            ->where('grace_ends_at', '>=', now());
    }

    public function scopeExpired($query)
    {
        return $query->where('status', 'active')
            ->where('expires_at', '<', today());
    }

    // Helpers
    public function isActive(): bool
    {
        return $this->status === 'active' && $this->expires_at->gte(today());
    }

    public function isInGrace(): bool
    {
        return $this->status === 'grace'
            && $this->grace_ends_at !== null
            && $this->grace_ends_at->gte(now());
    }

    public function isExpired(): bool
    {
        return $this->expires_at->lt(today());
    }

    public function daysRemaining(): int
    {
        return max(0, today()->diffInDays($this->expires_at, false));
    }

    public function markExpired(): void
    {
        $this->update(['status' => 'expired']);
    }

    public function markGrace(): void
    {
        $this->update(['status' => 'grace']);
    }
}
