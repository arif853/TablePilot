<?php

namespace App\Models\Scopes;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

class TenantScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        if (!auth()->check()) {
            return;
        }

        $user = auth()->user();

        if ($user->tenant_id) {
            $builder->where($model->getTable() . '.tenant_id', $user->tenant_id);
        } elseif (!$user->isSuperAdmin()) {
            // Authenticated but not bound to a tenant (and not a platform admin):
            // never fall through to an unfiltered, cross-tenant query.
            $builder->whereRaw('1 = 0');
        }
    }
}
