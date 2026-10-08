<?php

use App\Models\Tenant;
use App\Services\ModulePermissionService;
use Database\Seeders\ModuleSeeder;
use Database\Seeders\PlanModuleSeeder;
use Illuminate\Database\Migrations\Migration;

/**
 * The module registry is reference data the access checks depend on, but it was only
 * created by `db:seed`. Environments that never seeded it (or seeded before ModuleSeeder
 * existed) have an empty `modules` table, which denies every non-core module to every
 * tenant and leaves the admin module matrix blank. Both seeders are idempotent.
 */
return new class extends Migration
{
    public function up(): void
    {
        (new ModuleSeeder())->run();
        (new PlanModuleSeeder())->run();

        // Tenants may have cached an empty module list while the registry was missing
        $modulePermissions = app(ModulePermissionService::class);
        Tenant::withoutGlobalScopes()->get()->each(
            fn (Tenant $tenant) => $modulePermissions->invalidateCache($tenant)
        );
    }

    public function down(): void
    {
        // Reference data; leave it in place on rollback
    }
};
