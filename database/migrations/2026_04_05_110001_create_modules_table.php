<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('modules', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique(); // e.g. 'pos', 'ai_sales_forecast'
            $table->string('label'); // e.g. 'Point of Sale (POS)'
            $table->text('description')->nullable();
            $table->string('group'); // e.g. 'operations', 'ai_features', 'finance', 'core', 'customization'
            $table->boolean('is_core')->default(false); // core modules cannot be revoked
            $table->boolean('is_active')->default(true); // platform-wide kill switch
            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->index('group');
            $table->index('is_active');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('modules');
    }
};
