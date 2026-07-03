<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenant_applications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->foreignId('tenant_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('plan_id')->nullable()->constrained('subscription_plans')->nullOnDelete();
            $table->string('restaurant_name');
            $table->string('phone', 20);
            $table->string('address')->nullable();
            $table->json('plan_snapshot')->nullable();
            $table->unsignedInteger('trial_days_snapshot')->default(0);
            $table->unsignedInteger('duration_days_snapshot')->default(0);
            $table->decimal('price_snapshot', 10, 2)->nullable();
            $table->string('status')->default('pending');
            $table->timestamp('email_verified_at')->nullable();
            $table->timestamp('otp_sent_at')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('rejected_at')->nullable();
            $table->foreignId('rejected_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('approval_notes')->nullable();
            $table->timestamps();

            $table->index(['status', 'email_verified_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenant_applications');
    }
};
