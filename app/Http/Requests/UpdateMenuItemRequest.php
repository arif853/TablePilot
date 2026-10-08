<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateMenuItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'category_id' => ['nullable', Rule::exists('categories', 'id')->where('tenant_id', $this->user()?->tenant_id)],
            'name' => 'sometimes|string|max:255',
            'description' => 'nullable|string|max:1000',
            'price' => 'sometimes|numeric|min:0',
            'image' => 'nullable|image|max:2048',
            'is_active' => 'boolean',
            'sort_order' => 'nullable|integer|min:0',
        ];
    }
}
