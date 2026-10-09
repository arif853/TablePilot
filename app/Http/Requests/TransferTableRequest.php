<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class TransferTableRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'from_table_id' => ['required', Rule::exists('restaurant_tables', 'id')->where('tenant_id', $this->user()?->tenant_id)],
            'to_table_id' => ['required', 'different:from_table_id', Rule::exists('restaurant_tables', 'id')->where('tenant_id', $this->user()?->tenant_id)],
        ];
    }

    public function messages(): array
    {
        return [
            'to_table_id.different' => 'Cannot transfer to the same table.',
        ];
    }
}
