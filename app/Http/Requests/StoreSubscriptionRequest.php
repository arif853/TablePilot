<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreSubscriptionRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Only super admin can create subscriptions
        return $this->user() && $this->user()->isSuperAdmin();
    }

    public function rules(): array
    {
        return [
            'tenant_id' => 'required|exists:tenants,id',
            'plan_id' => 'nullable|exists:subscription_plans,id',
            'plan_type' => 'nullable|in:monthly,yearly,custom',
            'amount' => 'nullable|numeric|min:0',
            'payment_method' => 'nullable|string|in:bkash,sslcommerz,manual,bank',
            'payment_ref' => 'nullable|string',
            'transaction_id' => 'nullable|string',
            'starts_at' => 'nullable|date',
            'expires_at' => 'nullable|date|after:starts_at',
            'custom_days' => 'nullable|integer|min:1|required_if:plan_type,custom',
            'notes' => 'nullable|string|max:500',
        ];
    }
}
