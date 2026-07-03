<?php

namespace App\Models;

use App\Models\Category;
use App\Models\InvoiceCounter;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\RestaurantTable;
use App\Models\Settlement;
use App\Models\TenantApplication;
use App\Models\Subscription;
use App\Models\TenantModuleOverride;
use App\Models\User;
use App\Models\Voucher;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Tenant extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'slug',
        'email',
        'phone',
        'address',
        'logo',
        'logo_dark',
        'favicon',
        'primary_color',
        'secondary_color',
        'accent_color',
        'description',
        'social_links',
        'banner_image',
        'authorized_wifi_ip',
        'payment_mode',
        'commission_rate',
        'currency',
        'tax_rate',
        'vat_registered',
        'vat_number',
        'default_vat_rate',
        'vat_inclusive',
        'is_active',
        'max_users',
        'trial_ends_at',
    ];

    protected function casts(): array
    {
        return [
            'commission_rate' => 'decimal:2',
            'tax_rate' => 'decimal:2',
            'vat_registered' => 'boolean',
            'default_vat_rate' => 'decimal:2',
            'vat_inclusive' => 'boolean',
            'is_active' => 'boolean',
            'max_users' => 'integer',
            'social_links' => 'array',
            'trial_ends_at' => 'datetime',
        ];
    }

    // Relationships
    public function users()
    {
        return $this->hasMany(User::class);
    }

    public function tables()
    {
        return $this->hasMany(RestaurantTable::class);
    }

    public function categories()
    {
        return $this->hasMany(Category::class);
    }

    public function menuItems()
    {
        return $this->hasMany(MenuItem::class);
    }

    public function vouchers()
    {
        return $this->hasMany(Voucher::class);
    }

    public function orders()
    {
        return $this->hasMany(Order::class);
    }

    public function subscriptions()
    {
        return $this->hasMany(Subscription::class);
    }

    public function settlements()
    {
        return $this->hasMany(Settlement::class);
    }

    /**
     * Get all module overrides for this tenant.
     */
    public function moduleOverrides()
    {
        return $this->hasMany(TenantModuleOverride::class);
    }

    /**
     * Get all granted module overrides for this tenant.
     */
    public function grantedModules()
    {
        return $this->moduleOverrides()->where('type', 'grant');
    }

    /**
     * Get all revoked module overrides for this tenant.
     */
    public function revokedModules()
    {
        return $this->moduleOverrides()->where('type', 'revoke');
    }

    public function invoiceCounter()
    {
        return $this->hasOne(InvoiceCounter::class);
    }

    public function application()
    {
        return $this->hasOne(TenantApplication::class);
    }

    public function activeSubscription()
    {
        return $this->hasOne(Subscription::class)
            ->where('status', 'active')
            ->where('expires_at', '>=', today())
            ->latest();
    }

    // Helpers
    public function hasActiveSubscription(): bool
    {
        return $this->activeSubscription()->exists();
    }

    public function isSubscriptionExpired(): bool
    {
        return !$this->hasActiveSubscription();
    }

    /** True while the free-trial window is still open (no paid sub required). */
    public function isOnTrial(): bool
    {
        return $this->trial_ends_at !== null && $this->trial_ends_at->isFuture();
    }

    /** Days left in the trial (0 if expired or no trial). */
    public function trialDaysRemaining(): int
    {
        if (!$this->trial_ends_at || $this->trial_ends_at->isPast()) {
            return 0;
        }
        return (int) now()->diffInDays($this->trial_ends_at, false);
    }

    /** True when a trial was granted but has since expired with no paid subscription. */
    public function trialExpired(): bool
    {
        return $this->trial_ends_at !== null
            && $this->trial_ends_at->isPast()
            && !$this->hasActiveSubscription();
    }

    /** Tenant may use the platform if they have a paid subscription OR an active trial. */
    public function hasAccessRights(): bool
    {
        return $this->hasActiveSubscription() || $this->isOnTrial();
    }

    public function isWifiEnforced(): bool
    {
        return !empty($this->authorized_wifi_ip);
    }

    public function isPlatformCollection(): bool
    {
        return $this->payment_mode === 'platform';
    }
}
