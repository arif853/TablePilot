<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StorePosOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'type'                         => ['required', 'in:dine,parcel,quick,delivery'],
            'table_id'                     => ['nullable', 'integer'],
            'customer_name'                => ['nullable', 'string', 'max:100'],
            'customer_phone'               => ['nullable', 'string', 'max:20'],
            'delivery_address'             => ['nullable', 'string', 'max:500'],
            'items'                        => ['required', 'array', 'min:1'],
            'items.*.menu_item_id'         => ['required', 'integer'],
            'items.*.qty'                  => ['required', 'integer', 'min:1'],
            'items.*.special_instructions' => ['nullable', 'string', 'max:255'],
            'voucher_code'                 => ['nullable', 'string'],
            'notes'                        => ['nullable', 'string', 'max:500'],
            'payment_method'               => ['required', 'in:cash,card,mobile_banking,bkash,nagad,rocket,split'],
            'payment_status'               => ['required', 'in:paid,pending'],
            'transaction_id'               => ['nullable', 'string', 'max:100'],
            'split_payments'               => ['nullable', 'array', 'min:2'],
            'split_payments.*.method'      => ['required_with:split_payments', 'in:cash,card,bkash,nagad,rocket'],
            'split_payments.*.amount'      => ['required_with:split_payments', 'numeric', 'min:0.01'],
        ];
    }

    public function messages(): array
    {
        return [
            'type.required'    => 'Order type is required.',
            'type.in'          => 'Invalid order type. Must be dine, parcel, quick, or delivery.',
            'items.required'   => 'At least one item is required.',
            'items.min'        => 'At least one item is required.',
            'payment_method.required' => 'Payment method is required.',
            'payment_method.in'       => 'Invalid payment method.',
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            $type = $this->input('type');
            $paymentMethod = $this->input('payment_method');

            if ($type === 'delivery' && !$this->filled('delivery_address')) {
                $validator->errors()->add('delivery_address', 'Delivery address is required for delivery orders.');
            }

            if ($paymentMethod === 'split' && count($this->input('split_payments', [])) < 2) {
                $validator->errors()->add('split_payments', 'At least two split payment entries are required.');
            }
        });
    }
}
