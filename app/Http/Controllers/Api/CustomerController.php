<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\BaseApiController;
use App\Models\Category;
use App\Models\MenuItem;
use App\Models\RestaurantTable;
use App\Models\Scopes\TenantScope;
use App\Models\Tenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerController extends BaseApiController
{
    private function findTenant(string $tenant): ?Tenant
    {
        return Tenant::where(is_numeric($tenant) ? 'id' : 'slug', $tenant)->first();
    }

    /**
     * Get restaurant info and menu (public, no auth)
     */
    public function restaurant(string $tenant): JsonResponse
    {
        $tenantModel = $this->findTenant($tenant);

        if (!$tenantModel || !$tenantModel->is_active) {
            return $this->notFound('Restaurant not found');
        }

        $data = $tenantModel->only([
            'id', 'name', 'slug', 'logo', 'logo_dark', 'favicon',
            'primary_color', 'secondary_color', 'accent_color',
            'description', 'banner_image', 'social_links',
            'currency', 'tax_rate', 'default_vat_rate', 'vat_inclusive',
        ]);

        // Ensure tax_rate reflects the actual VAT rate used for calculations
        $data['tax_rate'] = $tenantModel->default_vat_rate ?? $tenantModel->tax_rate ?? 0;

        return $this->success($data);
    }

    /**
     * Get full menu for a tenant (public)
     */
    public function menu(string $tenant): JsonResponse
    {
        $tenantModel = $this->findTenant($tenant);

        if (!$tenantModel || !$tenantModel->is_active) {
            return $this->notFound('Restaurant not found');
        }

        $tenantId = $tenantModel->id;

        $categories = Category::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->with(['menuItems' => function ($q) {
                $q->where('is_active', true)
                    ->orderBy('sort_order')
                    ->select(['id', 'category_id', 'name', 'description', 'price', 'image', 'is_active']);
            }])
            ->ordered()
            ->get();

        // Also get uncategorized items
        $uncategorized = MenuItem::withoutGlobalScope(TenantScope::class)
            ->where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->whereNull('category_id')
            ->orderBy('sort_order')
            ->get();

        return $this->success([
            'categories' => $categories,
            'uncategorized' => $uncategorized,
        ]);
    }

    /**
     * Get table info (public)
     */
    public function table(string $tenant, int $tableId): JsonResponse
    {
        $tenantModel = $this->findTenant($tenant);

        if (!$tenantModel) {
            return $this->notFound('Restaurant not found');
        }

        $table = RestaurantTable::withoutGlobalScopes()
            ->where('tenant_id', $tenantModel->id)
            ->where('id', $tableId)
            ->select(['id', 'table_number', 'status', 'capacity'])
            ->first();

        if (!$table) {
            return $this->notFound('Table not found');
        }

        return $this->success($table);
    }
}
