<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PlanModule extends Model
{
    protected $fillable = ['plan_id', 'module_id'];

    public $timestamps = true;

    /**
     * Get the subscription plan this record belongs to.
     */
    public function plan(): BelongsTo
    {
        return $this->belongsTo(SubscriptionPlan::class);
    }

    /**
     * Get the module this pivot belongs to.
     */
    public function module(): BelongsTo
    {
        return $this->belongsTo(Module::class);
    }
}
