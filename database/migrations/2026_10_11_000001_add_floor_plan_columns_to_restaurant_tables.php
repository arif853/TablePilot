<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('restaurant_tables', function (Blueprint $table) {
            // Floor/section the table belongs to, shown as a tab on the floor plan
            $table->string('area', 50)->default('Main')->after('capacity');
            // Top-left corner on the floor-plan canvas; null until someone arranges the table
            $table->unsignedSmallInteger('pos_x')->nullable()->after('area');
            $table->unsignedSmallInteger('pos_y')->nullable()->after('pos_x');

            $table->index(['tenant_id', 'area']);
        });
    }

    public function down(): void
    {
        Schema::table('restaurant_tables', function (Blueprint $table) {
            $table->dropIndex(['tenant_id', 'area']);
            $table->dropColumn(['area', 'pos_x', 'pos_y']);
        });
    }
};
