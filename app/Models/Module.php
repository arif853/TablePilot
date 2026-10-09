<?php

namespace App\Models;

use App\Models\TenantModuleOverride;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Module extends Model
{
    use HasFactory;

    protected $fillable = [
        'key',
        'label',
        'description',
        'group',
        'is_core',
        'is_active',
        'sort_order',
    ];

    protected $casts = [
        'is_core' => 'boolean',
        'is_active' => 'boolean',
    ];

    /**
     * Get the subscription plans that include this module.
     */
    public function plans(): BelongsToMany
    {
        return $this->belongsToMany(SubscriptionPlan::class, 'plan_modules', 'module_id', 'plan_id');
    }

    /**
     * Get the tenant module overrides for this module.
     */
    public function tenantOverrides(): HasMany
    {
        return $this->hasMany(TenantModuleOverride::class);
    }

    /**
     * Scope to get only active modules.
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    /**
     * Scope to get only core modules.
     */
    public function scopeCore(Builder $query): Builder
    {
        return $query->where('is_core', true);
    }

    /**
     * Scope to get modules by group.
     */
    public function scopeByGroup(Builder $query, string $group): Builder
    {
        return $query->where('group', $group);
    }

    /**
     * Scope to order by group and sort_order.
     */
    public function scopeOrdered(Builder $query): Builder
    {
        return $query->orderBy('group')->orderBy('sort_order')->orderBy('label');
    }
}
