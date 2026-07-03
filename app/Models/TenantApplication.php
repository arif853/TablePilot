<?php

namespace App\Models;

use App\Models\SubscriptionPlan;
use App\Models\Tenant;
use App\Models\TenantApplicationOtp;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class TenantApplication extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'tenant_id',
        'plan_id',
        'restaurant_name',
        'phone',
        'address',
        'plan_snapshot',
        'trial_days_snapshot',
        'duration_days_snapshot',
        'price_snapshot',
        'status',
        'email_verified_at',
        'otp_sent_at',
        'approved_at',
        'approved_by',
        'rejected_at',
        'rejected_by',
        'approval_notes',
    ];

    protected function casts(): array
    {
        return [
            'plan_snapshot' => 'array',
            'trial_days_snapshot' => 'integer',
            'duration_days_snapshot' => 'integer',
            'price_snapshot' => 'decimal:2',
            'email_verified_at' => 'datetime',
            'otp_sent_at' => 'datetime',
            'approved_at' => 'datetime',
            'rejected_at' => 'datetime',
        ];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function plan()
    {
        return $this->belongsTo(SubscriptionPlan::class, 'plan_id');
    }

    public function latestOtp()
    {
        return $this->hasOne(TenantApplicationOtp::class)->latestOfMany();
    }

    public function otps()
    {
        return $this->hasMany(TenantApplicationOtp::class);
    }
}
