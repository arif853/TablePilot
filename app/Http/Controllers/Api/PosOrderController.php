<?php

namespace App\Http\Controllers\Api;

use App\Events\NewOrderCreated;
use App\Http\Requests\StorePosOrderRequest;
use App\Services\BillingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

class PosOrderController extends BaseApiController
{
    public function __construct(
        protected BillingService $billingService,
    ) {}

    /**
     * Create an order from the POS terminal (authenticated staff/admin).
     *
     * Differences from the public CustomerController flow:
     *  - No WiFi IP check (staff are trusted / on-premises)
     *  - Tenant is resolved from the authenticated user's tenant_id
        *  - Supports order types: dine | parcel | quick | delivery
        *  - Supports payment methods: cash | card | mobile_banking | bkash | nagad | rocket | split
     *  - Can mark payment as paid immediately (payment_status = 'paid')
     *  - Records served_by = authenticated user id
     *  - Sets source = 'pos'
     */
    public function store(StorePosOrderRequest $request): JsonResponse
    {
        $user   = Auth::user();
        $tenant = $user->tenant;

        if (!$tenant || !$tenant->is_active) {
            return $this->error('Restaurant account is not active', 403);
        }

        if ($tenant->isSubscriptionExpired()) {
            return $this->error('Subscription has expired', 402);
        }

        // Extra validation: parcel needs customer name
        $validated = $request->validated();
        if ($validated['type'] === 'parcel' && empty($validated['customer_name'])) {
            return $this->error('Customer name is required for takeaway orders', 422);
        }

        try {
            $order = $this->billingService->createOrder(
                tenant: $tenant,
                data: $validated,
                servedBy: $user->id,
                source: 'pos',
            );

            broadcast(new NewOrderCreated($order))->toOthers();

            return $this->created($order, 'POS order created successfully');
        } catch (\InvalidArgumentException $e) {
            return $this->error($e->getMessage(), 422);
        }
    }
}
