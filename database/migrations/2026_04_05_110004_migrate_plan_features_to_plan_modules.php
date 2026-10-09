<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (!Schema::hasColumn('subscription_plans', 'features')) {
            return;
        }

        $plans = DB::table('subscription_plans')->select('id', 'features')->get();

        foreach ($plans as $plan) {
            $features = json_decode($plan->features ?? '[]', true);

            if (!is_array($features) || empty($features)) {
                continue;
            }

            $moduleIds = DB::table('modules')
                ->whereIn('key', $features)
                ->pluck('id');

            foreach ($moduleIds as $moduleId) {
                DB::table('plan_modules')->updateOrInsert(
                    [
                        'plan_id' => $plan->id,
                        'module_id' => $moduleId,
                    ],
                    [
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]
                );
            }
        }

        Schema::table('subscription_plans', function (Blueprint $table) {
            $table->dropColumn('features');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (!Schema::hasColumn('subscription_plans', 'features')) {
            Schema::table('subscription_plans', function (Blueprint $table) {
                $table->json('features')->nullable()->after('duration_days');
            });
        }
    }
};
