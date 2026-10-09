<?php

namespace App\Models;

use App\Models\TenantApplication;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class TenantApplicationOtp extends Model
{
    use HasFactory;

    protected $fillable = [
        'tenant_application_id',
        'code_hash',
        'expires_at',
        'sent_at',
        'verified_at',
        'attempts',
        'resend_count',
    ];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'sent_at' => 'datetime',
            'verified_at' => 'datetime',
            'attempts' => 'integer',
            'resend_count' => 'integer',
        ];
    }

    public function application()
    {
        return $this->belongsTo(TenantApplication::class, 'tenant_application_id');
    }

    public function isExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }
}
