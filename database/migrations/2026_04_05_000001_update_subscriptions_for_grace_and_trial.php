<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subscriptions', function (Blueprint $table) {
            if (!Schema::hasColumn('subscriptions', 'is_trial')) {
                $table->boolean('is_trial')->default(false)->after('plan_type');
            }

            if (!Schema::hasColumn('subscriptions', 'grace_ends_at')) {
                $table->timestamp('grace_ends_at')->nullable()->after('expires_at');
            }

            if (!Schema::hasColumn('subscriptions', 'initiated_by')) {
                $table->enum('initiated_by', ['super_admin', 'tenant', 'system'])
                    ->default('super_admin')
                    ->after('status');
            }
        });

        if (DB::getDriverName() === 'mysql') {
            // Keep plan_type for backward compatibility, but make it nullable.
            DB::statement("ALTER TABLE subscriptions MODIFY plan_type ENUM('monthly','yearly','custom') NULL");

            // Add 'grace' status while preserving existing states.
            DB::statement("ALTER TABLE subscriptions MODIFY status ENUM('active','grace','expired','cancelled','pending') NOT NULL DEFAULT 'pending'");
        }

        Schema::table('subscriptions', function (Blueprint $table) {
            $table->index(['status', 'expires_at'], 'subscriptions_status_expires_idx');
            $table->index(['status', 'grace_ends_at'], 'subscriptions_status_grace_idx');
            $table->index(['tenant_id', 'is_trial'], 'subscriptions_tenant_trial_idx');
        });
    }

    public function down(): void
    {
        Schema::table('subscriptions', function (Blueprint $table) {
            if (Schema::hasColumn('subscriptions', 'is_trial')) {
                $table->dropColumn('is_trial');
            }

            if (Schema::hasColumn('subscriptions', 'grace_ends_at')) {
                $table->dropColumn('grace_ends_at');
            }

            if (Schema::hasColumn('subscriptions', 'initiated_by')) {
                $table->dropColumn('initiated_by');
            }

            $table->dropIndex('subscriptions_status_expires_idx');
            $table->dropIndex('subscriptions_status_grace_idx');
            $table->dropIndex('subscriptions_tenant_trial_idx');
        });

        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE subscriptions MODIFY plan_type ENUM('monthly','yearly','custom') NOT NULL DEFAULT 'monthly'");
            DB::statement("ALTER TABLE subscriptions MODIFY status ENUM('active','expired','cancelled','pending') NOT NULL DEFAULT 'pending'");
        }
    }
};
