<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SslCommerzService
{
    protected string $storeId;
    protected string $storePassword;
    protected bool $sandbox;
    protected string $apiUrl;

    public function __construct()
    {
        $config = config('saas.payment_gateways.sslcommerz');

        $this->storeId = $config['store_id'] ?? '';
        $this->storePassword = $config['store_password'] ?? '';
        $this->sandbox = $config['sandbox'] ?? true;

        $this->apiUrl = $this->sandbox
            ? 'https://sandbox.sslcommerz.com'
            : 'https://securepay.sslcommerz.com';
    }

    /**
     * Initiate a payment session with SSLCommerz.
     *
     * @param array $data Order/payment data
     * @return array ['success' => bool, 'gateway_url' => string|null, 'session_key' => string|null]
     */
    public function initiatePayment(array $data): array
    {
        $postData = [
            'store_id'       => $this->storeId,
            'store_passwd'   => $this->storePassword,
            'total_amount'   => $data['amount'],
            'currency'       => $data['currency'] ?? 'BDT',
            'tran_id'        => $data['tran_id'],
            'success_url'    => $data['success_url'],
            'fail_url'       => $data['fail_url'],
            'cancel_url'     => $data['cancel_url'],
            'ipn_url'        => $data['ipn_url'] ?? $data['success_url'],

            // Customer info
            'cus_name'       => $data['customer_name'] ?? 'Customer',
            'cus_email'      => $data['customer_email'] ?? 'customer@example.com',
            'cus_phone'      => $data['customer_phone'] ?? '01700000000',
            'cus_add1'       => $data['customer_address'] ?? 'N/A',
            'cus_city'       => $data['customer_city'] ?? 'Dhaka',
            'cus_country'    => 'Bangladesh',

            // Shipping (required by SSLCommerz even for digital)
            'shipping_method' => 'NO',
            'num_of_item'    => $data['num_items'] ?? 1,
            'product_name'   => $data['product_name'] ?? 'Food Order',
            'product_category' => 'Food',
            'product_profile' => 'non-physical-goods',
        ];

        try {
            $response = Http::asForm()->post("{$this->apiUrl}/gwprocess/v4/api.php", $postData);

            $result = $response->json();

            if (isset($result['status']) && $result['status'] === 'SUCCESS') {
                return [
                    'success'     => true,
                    'gateway_url' => $result['GatewayPageURL'],
                    'session_key' => $result['sessionkey'] ?? null,
                ];
            }

            Log::warning('SSLCommerz initiation failed', ['response' => $result]);

            return [
                'success' => false,
                'gateway_url' => null,
                'error' => $result['failedreason'] ?? 'Payment initiation failed',
            ];
        } catch (\Exception $e) {
            Log::error('SSLCommerz exception', ['error' => $e->getMessage()]);

            return [
                'success' => false,
                'gateway_url' => null,
                'error' => 'Payment service unavailable',
            ];
        }
    }

    /**
     * Verify a callback/IPN with the gateway's validation API.
     *
     * The request body is never trusted: val_id is always re-checked with
     * SSLCommerz, and the validated transaction must match the transaction
     * and amount we expect, so a cheap valid val_id can't be replayed
     * against a different or more expensive order.
     */
    public function validatePayment(array $data, ?string $expectedTranId = null, string|float|int|null $expectedAmount = null): bool
    {
        $valId = (string) ($data['val_id'] ?? '');

        if ($valId === '' || $this->storeId === '' || $this->storePassword === '') {
            return false;
        }

        try {
            $response = Http::get("{$this->apiUrl}/validator/api/validationserverAPI.php", [
                'val_id'       => $valId,
                'store_id'     => $this->storeId,
                'store_passwd' => $this->storePassword,
                'format'       => 'json',
            ]);

            $result = $response->json() ?? [];
        } catch (\Exception $e) {
            Log::error('SSLCommerz validation failed', ['error' => $e->getMessage()]);
            return false;
        }

        if (!in_array(strtoupper((string) ($result['status'] ?? '')), ['VALID', 'VALIDATED'], true)) {
            return false;
        }

        if ($expectedTranId !== null && ($result['tran_id'] ?? null) !== $expectedTranId) {
            Log::warning('SSLCommerz validation: tran_id mismatch', ['expected' => $expectedTranId, 'got' => $result['tran_id'] ?? null]);
            return false;
        }

        if (!empty($result['currency_type']) && strtoupper($result['currency_type']) !== 'BDT') {
            return false;
        }

        if ($expectedAmount !== null) {
            $paid = number_format((float) ($result['amount'] ?? 0), 2, '.', '');
            $expected = number_format((float) $expectedAmount, 2, '.', '');

            if (bccomp($paid, $expected, 2) !== 0) {
                Log::warning('SSLCommerz validation: amount mismatch', ['expected' => $expected, 'got' => $paid]);
                return false;
            }
        }

        return true;
    }

    /**
     * Check if SSLCommerz is enabled and configured.
     */
    public function isEnabled(): bool
    {
        $config = config('saas.payment_gateways.sslcommerz');
        return ($config['enabled'] ?? false) && !empty($this->storeId) && !empty($this->storePassword);
    }
}
