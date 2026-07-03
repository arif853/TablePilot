<?php

namespace App\Models;

use App\Models\Tenant;
use App\Models\TenantApplication;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use PHPOpenSourceSaver\JWTAuth\Contracts\JWTSubject;

class User extends Authenticatable implements JWTSubject
{
    use HasFactory, Notifiable;

    public const ROLE_SUPER_ADMIN = 'super_admin';
    public const ROLE_RESTAURANT_ADMIN = 'restaurant_admin';
    public const ROLE_STAFF = 'staff';
    public const ROLE_KITCHEN = 'kitchen';

    public const ROLES = [
        self::ROLE_SUPER_ADMIN,
        self::ROLE_RESTAURANT_ADMIN,
        self::ROLE_STAFF,
        self::ROLE_KITCHEN,
    ];

    protected $fillable = [
        'tenant_id',
        'name',
        'email',
        'password',
        'role',
        'status',
        'phone',
        'address',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    // JWT
    public function getJWTIdentifier()
    {
        return $this->getKey();
    }

    public function getJWTCustomClaims()
    {
        return [
            'tenant_id' => $this->tenant_id,
            'role' => $this->role,
        ];
    }

    // Relationships
    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function tenantApplication()
    {
        return $this->hasOne(TenantApplication::class);
    }

    // Role Helpers
    public function isSuperAdmin(): bool
    {
        return $this->role === self::ROLE_SUPER_ADMIN;
    }

    public function isRestaurantAdmin(): bool
    {
        return $this->role === self::ROLE_RESTAURANT_ADMIN;
    }

    public function isStaff(): bool
    {
        return $this->role === self::ROLE_STAFF;
    }

    public function isKitchen(): bool
    {
        return $this->role === self::ROLE_KITCHEN;
    }

    public function hasRole(string ...$roles): bool
    {
        return in_array($this->role, $roles);
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    public function isPendingVerification(): bool
    {
        return $this->status === 'pending' && $this->email_verified_at === null;
    }

    public function isPendingApproval(): bool
    {
        return $this->status === 'pending' && $this->email_verified_at !== null;
    }
}
