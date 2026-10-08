<?php

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| The closure you provide to your test functions is always bound to a specific PHPUnit test
| case class. By default, that class is "PHPUnit\Framework\TestCase". Of course, you may
| need to change it using the "pest()" function to bind a different classes or traits.
|
*/

pest()->extend(Tests\TestCase::class)
    ->use(Illuminate\Foundation\Testing\RefreshDatabase::class)
    ->in('Feature');

/*
|--------------------------------------------------------------------------
| Expectations
|--------------------------------------------------------------------------
|
| When you're writing tests, you often need to check that values meet certain conditions. The
| "expect()" function gives you access to a set of "expectations" methods that you can use
| to assert different things. Of course, you may extend the Expectation API at any time.
|
*/

expect()->extend('toBeOne', function () {
    return $this->toBe(1);
});

/*
|--------------------------------------------------------------------------
| Functions
|--------------------------------------------------------------------------
|
| While Pest is very powerful out-of-the-box, you may have some testing code specific to your
| project that you don't want to repeat in every file. Here you can also expose helpers as
| global functions to help you to reduce the number of lines of code in your test files.
|
*/

/**
 * A tenant on an active plan with every module, plus its restaurant admin.
 *
 * @return array{0: \App\Models\Tenant, 1: \App\Models\User}
 */
function restaurantWithAdmin(int $maxUsers = 5): array
{
    $plan = \App\Models\SubscriptionPlan::factory()->create(['max_users' => $maxUsers]);
    $plan->modules()->sync(\App\Models\Module::pluck('id'));

    $tenant = \App\Models\Tenant::factory()->create(['max_users' => $maxUsers]);
    \App\Models\Subscription::factory()->create([
        'tenant_id' => $tenant->id,
        'plan_id' => $plan->id,
        'status' => 'active',
        'starts_at' => now()->subDay(),
        'expires_at' => now()->addMonth(),
    ]);

    $admin = \App\Models\User::factory()->restaurantAdmin()->create(['tenant_id' => $tenant->id]);

    return [$tenant, $admin];
}

/** Authorization header for an API request as the given user. */
function bearer(\App\Models\User $user): array
{
    return ['Authorization' => 'Bearer ' . \PHPOpenSourceSaver\JWTAuth\Facades\JWTAuth::fromUser($user)];
}
