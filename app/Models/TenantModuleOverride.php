<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TenantModuleOverride extends Model
{
    protected $fillable = [
        'tenant_id',
        'module_id',
        'type',
        'reason',
        'granted_by',
        'expires_at',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
    ];

    /**
     * Get the tenant this override belongs to.
     */
    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    /**
     * Get the module this override applies to.
     */
    public function module(): BelongsTo
    {
        return $this->belongsTo(Module::class);
    }

    /**
     * Get the user who created this override.
     */
    public function grantedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'granted_by');
    }

    /**
     * Scope to get only active (not expired) overrides.
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where(function ($q) {
            $q->whereNull('expires_at')->orWhere('expires_at', '>', now());
        });
    }

    /**
     * Scope to get only grant overrides.
     */
    public function scopeGrants(Builder $query): Builder
    {
        return $query->where('type', 'grant');
    }

    /**
     * Scope to get only revoke overrides.
     */
    public function scopeRevokes(Builder $query): Builder
    {
        return $query->where('type', 'revoke');
    }

    /**
     * Check if this override is expired.
     */
    public function isExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }

    /**
     * Check if this override is a grant.
     */
    public function isGrant(): bool
    {
        return $this->type === 'grant';
    }

    /**
     * Check if this override is a revoke.
     */
    public function isRevoke(): bool
    {
        return $this->type === 'revoke';
    }
}
