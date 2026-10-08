<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreTenantRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Only super admin can create tenants
        return $this->user() && $this->user()->isSuperAdmin();
    }

    public function rules(): array
    {
        return [
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:tenants,email',
            'phone' => 'nullable|string|max:20',
            'address' => 'nullable|string|max:500',
            'authorized_wifi_ip' => 'nullable|string|max:255',
            'payment_mode' => 'nullable|in:platform,seller',
            'commission_rate' => 'nullable|numeric|min:0|max:100',
            'tax_rate' => 'nullable|numeric|min:0|max:100',
            'max_users' => 'nullable|integer|min:1|max:999',
            // Admin user
            'admin_name' => 'required|string|max:255',
            'admin_email' => 'required|email|unique:users,email',
            'admin_password' => 'required|string|min:8',
            // Subscription
            'plan_id' => 'nullable|required_if_accepted:start_trial|exists:subscription_plans,id',
            'start_trial' => 'nullable|boolean',
            'trial_days' => 'nullable|integer|min:1|max:365',
            'plan_type' => 'required|in:monthly,yearly,custom',
            'custom_days' => 'nullable|integer|min:1|required_if:plan_type,custom',
            'subscription_amount' => 'required|numeric|min:0',
            'payment_method' => 'nullable|string|in:bkash,sslcommerz,manual,bank',
            'payment_ref' => 'nullable|string',
        ];
    }
}
