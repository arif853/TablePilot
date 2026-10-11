<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreTableRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'table_number' => 'required|string|max:50',
            'capacity' => 'nullable|integer|min:1|max:50',
            'status' => 'nullable|in:available,occupied,reserved,inactive',
            'area' => 'nullable|string|max:50',
        ];
    }
}
