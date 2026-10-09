<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->decimal('default_sd_rate', 5, 2)->default(0)->after('default_vat_rate');
        });

        if (DB::getDriverName() !== 'sqlite') {
            DB::statement('ALTER TABLE tenants MODIFY COLUMN default_vat_rate DECIMAL(5,2) NOT NULL DEFAULT 15.00');
        }

        DB::table('tenants')
            ->where('default_vat_rate', 5.00)
            ->update(['default_vat_rate' => 15.00]);
    }

    public function down(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->dropColumn('default_sd_rate');
        });

        if (DB::getDriverName() !== 'sqlite') {
            DB::statement('ALTER TABLE tenants MODIFY COLUMN default_vat_rate DECIMAL(5,2) NOT NULL DEFAULT 5.00');
        }
    }
};
