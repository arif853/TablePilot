<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::transaction(function () {
            // Backfill plan_id from legacy plan_type where possible.
            $plansBySlug = DB::table('subscription_plans')
                ->select('id', 'slug')
                ->get()
                ->keyBy('slug');

            $subscriptions = DB::table('subscriptions')
                ->whereNull('plan_id')
                ->whereNotNull('plan_type')
                ->get(['id', 'plan_type']);

            foreach ($subscriptions as $subscription) {
                $slug = $subscription->plan_type;

                if (!isset($plansBySlug[$slug])) {
                    continue;
                }

                DB::table('subscriptions')
                    ->where('id', $subscription->id)
                    ->update(['plan_id' => $plansBySlug[$slug]->id]);
            }

        });
    }

    public function down(): void
    {
        DB::table('subscriptions')
            ->where('is_trial', true)
            ->where('initiated_by', 'system')
            ->where('notes', 'Backfilled from tenants.trial_ends_at')
            ->delete();

        DB::table('subscriptions')->update(['plan_id' => null]);
    }
};
