<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            // Minutes a kitchen ticket may run before the kitchen screen flags it as late
            $table->unsignedSmallInteger('kitchen_target_minutes')->default(20)->after('vat_inclusive');
        });
    }

    public function down(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->dropColumn('kitchen_target_minutes');
        });
    }
};
