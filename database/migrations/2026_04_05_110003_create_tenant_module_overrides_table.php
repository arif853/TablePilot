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
        Schema::create('tenant_module_overrides', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignId('module_id')->constrained('modules')->cascadeOnDelete();
            $table->enum('type', ['grant', 'revoke']); // grant or revoke
            $table->text('reason')->nullable(); // admin notes for why this override exists
            $table->foreignId('granted_by')->nullable()->constrained('users')->nullOnDelete(); // which super admin made this change
            $table->timestamp('expires_at')->nullable(); // optional time-limited override
            $table->timestamps();

            $table->unique(['tenant_id', 'module_id']);
            $table->index('tenant_id');
            $table->index('module_id');
            $table->index('type');
            $table->index('expires_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tenant_module_overrides');
    }
};
