<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class SubscriptionPlan extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'name',
        'slug',
        'price',
        'annual_price',
        'trial_days',
        'duration_days',
        'max_users',
        'is_active',
        'sort_order',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'annual_price' => 'decimal:2',
        'trial_days' => 'integer',
        'duration_days' => 'integer',
        'max_users' => 'integer',
        'is_active' => 'boolean',
        'sort_order' => 'integer',
    ];

    /**
     * Get subscriptions using this plan.
     */
    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class, 'plan_id');
    }

    /**
     * Get the modules included in this plan.
     */
    public function modules(): BelongsToMany
    {
        return $this->belongsToMany(Module::class, 'plan_modules', 'plan_id', 'module_id');
    }

    /**
     * Scope to get only active plans.
     */
    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    /**
     * Scope to order by sort_order.
     */
    public function scopeOrdered($query)
    {
        return $query->orderBy('sort_order')->orderBy('price');
    }

    /**
     * Get the count of active subscriptions on this plan.
     */
    public function getActiveSubscriptionsCountAttribute(): int
    {
        return $this->subscriptions()->active()->count();
    }

    /**
     * Check if this plan can be deleted.
     */
    public function canDelete(): bool
    {
        return $this->subscriptions()->active()->count() === 0;
    }

    /**
     * Map plan slug to legacy subscription enum values.
     */
    public function subscriptionType(): string
    {
        return in_array($this->slug, ['monthly', 'yearly'], true)
            ? $this->slug
            : 'custom';
    }
}
