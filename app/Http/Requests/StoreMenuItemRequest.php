<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreMenuItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'category_id' => ['nullable', Rule::exists('categories', 'id')->where('tenant_id', $this->user()?->tenant_id)],
            'name' => 'required|string|max:255',
            'description' => 'nullable|string|max:1000',
            'price' => 'required|numeric|min:0',
            'image' => 'nullable|image|max:2048',
            'is_active' => 'boolean',
            'sort_order' => 'nullable|integer|min:0',
        ];
    }
}
