<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\User>
 */
class UserFactory extends Factory
{
    protected static ?string $password;

    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'email_verified_at' => now(),
            'password' => static::$password ??= Hash::make('password'),
            'remember_token' => Str::random(10),
            'role' => User::ROLE_STAFF,
            'status' => 'active',
            'phone' => fake()->phoneNumber(),
        ];
    }

    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => [
            'email_verified_at' => null,
        ]);
    }

    public function superAdmin(): static
    {
        return $this->state(fn () => [
            'role' => User::ROLE_SUPER_ADMIN,
            'tenant_id' => null,
        ]);
    }

    public function restaurantAdmin(): static
    {
        return $this->state(fn () => [
            'role' => User::ROLE_RESTAURANT_ADMIN,
        ]);
    }

    public function staff(): static
    {
        return $this->state(fn () => [
            'role' => User::ROLE_STAFF,
        ]);
    }

    public function kitchen(): static
    {
        return $this->state(fn () => [
            'role' => User::ROLE_KITCHEN,
        ]);
    }

    public function inactive(): static
    {
        return $this->state(fn () => [
            'status' => 'inactive',
        ]);
    }

    public function pending(): static
    {
        return $this->state(fn () => [
            'status' => 'pending',
        ]);
    }
}
