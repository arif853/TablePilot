<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Add trial_days to subscription_plans (how many free days each plan offers)
        Schema::table('subscription_plans', function (Blueprint $table) {
            $table->unsignedSmallInteger('trial_days')->default(0)->after('duration_days');
        });

        // Add trial_ends_at to tenants (when their current trial period expires)
        Schema::table('tenants', function (Blueprint $table) {
            $table->timestamp('trial_ends_at')->nullable()->after('is_active');
        });
    }

    public function down(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->dropColumn('trial_ends_at');
        });

        Schema::table('subscription_plans', function (Blueprint $table) {
            $table->dropColumn('trial_days');
        });
    }
};
