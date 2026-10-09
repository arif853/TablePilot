<?php

return [
    /*
    |--------------------------------------------------------------------------
    | SaaS Configuration
    |--------------------------------------------------------------------------
    */

    // Legacy fallback values. Database table `subscription_plans` is the source of truth.
    'plans' => [
        'monthly' => [
            'name' => 'Monthly',
            'price' => 999,
            'duration_days' => 30,
        ],
        'yearly' => [
            'name' => 'Yearly',
            'price' => 9999,
            'duration_days' => 365,
        ],
    ],

    'default_commission_rate' => 5.00,

    /*
    |--------------------------------------------------------------------------
    | Free Trial
    |--------------------------------------------------------------------------
    | Default number of trial days granted when a new restaurant is onboarded.
    | Set TRIAL_DAYS=0 to disable trials entirely.
    */
    'trial' => [
        'default_days' => (int) env('TRIAL_DAYS', 14),
    ],

    'subscription' => [
        'grace_period_days' => (int) env('SUBSCRIPTION_GRACE_DAYS', 3),
        'trial_days' => (int) env('TRIAL_DAYS', 14),
        'expiry_warning_days' => [7, 3, 1],
    ],

    'payment_gateways' => [
        'bkash' => [
            'enabled' => env('BKASH_ENABLED', false),
            'app_key' => env('BKASH_APP_KEY'),
            'app_secret' => env('BKASH_APP_SECRET'),
            'username' => env('BKASH_USERNAME'),
            'password' => env('BKASH_PASSWORD'),
            'sandbox' => env('BKASH_SANDBOX', true),
        ],
        'sslcommerz' => [
            'enabled' => env('SSLCOMMERZ_ENABLED', false),
            'store_id' => env('SSLCOMMERZ_STORE_ID'),
            'store_password' => env('SSLCOMMERZ_STORE_PASSWORD'),
            'sandbox' => env('SSLCOMMERZ_SANDBOX', true),
        ],
    ],

    'wifi_enforcement' => env('WIFI_ENFORCEMENT_ENABLED', true),

    'order' => [
        'auto_cancel_minutes' => 30,
    ],
];
