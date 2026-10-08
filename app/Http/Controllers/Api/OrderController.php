<?php

namespace App\Http\Controllers\Api;

use App\Events\NewOrderCreated;
use App\Events\OrderStatusUpdated;
use App\Http\Controllers\Api\BaseApiController;
use App\Http\Requests\StoreOrderRequest;
use App\Http\Requests\UpdateOrderStatusRequest;
use App\Models\Order;
use App\Models\RestaurantTable;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Voucher;
use App\Services\BillingService;
use App\Services\SslCommerzService;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OrderController extends BaseApiController
{
    public function __construct(
        protected BillingService $billingService,
    ) {}

    /**
     * List orders (authenticated restaurant users)
     */
    public function index(Request $request): JsonResponse
    {
        $query = Order::with(['items.menuItem', 'table', 'voucher']);

        if ($status = $request->get('status')) {
            $query->where('status', $status);
        }

        if ($type = $request->get('type')) {
            $query->where('type', $type);
        }

        if ($request->boolean('today')) {
            $query->today();
        }

        if ($from = $request->get('from')) {
            $query->where('created_at', '>=', $from);
        }

        if ($to = $request->get('to')) {
            $query->where('created_at', '<=', $to);
        }

        if ($request->boolean('active')) {
            $query->active();
        }

        return $this->paginated($query->latest(), $request->get('per_page', 20));
    }

    /**
     * Create order (public - customer facing, no auth required)
     */
    public function store(StoreOrderRequest $request, string $tenantParam): JsonResponse
    {
        $tenant = is_numeric($tenantParam)
            ? Tenant::find($tenantParam)
            : Tenant::where('slug', $tenantParam)->first();

        if (!$tenant || !$tenant->is_active) {
            return $this->error('Restaurant not available', 404);
        }

        // Check subscription
        if ($tenant->isSubscriptionExpired()) {
            return $this->error('Restaurant is currently unavailable', 503);
        }

        // WiFi IP validation
        if ($tenant->isWifiEnforced()) {
            $clientIp = $request->ip();
            $authorizedIps = array_map('trim', explode(',', $tenant->authorized_wifi_ip));

            if (!in_array($clientIp, $authorizedIps)) {
                return $this->error('You must be connected to the restaurant WiFi to place an order', 403);
            }
        }

        try {
            $order = $this->billingService->createOrder(
                tenant: $tenant,
                data: $request->validated(),
                servedBy: null,
                source: 'customer',
            );

            // Broadcast new order event
            try {
                broadcast(new NewOrderCreated($order))->toOthers();
            } catch (\Throwable $e) {
                report($e);
            }

            // If online payment, initiate SSLCommerz
            $paymentUrl = null;
            if (($request->payment_method ?? 'cash') === 'online') {
                $sslCommerz = app(SslCommerzService::class);
                if ($sslCommerz->isEnabled()) {
                    $tranId = 'ORDER-' . $order->order_number . '-' . time();
                    $baseUrl = url('/');

                    $result = $sslCommerz->initiatePayment([
                        'amount'         => $order->grand_total,
                        'currency'       => 'BDT',
                        'tran_id'        => $tranId,
                        'success_url'    => "{$baseUrl}/api/payment/sslcommerz/success",
                        'fail_url'       => "{$baseUrl}/api/payment/sslcommerz/fail",
                        'cancel_url'     => "{$baseUrl}/api/payment/sslcommerz/cancel",
                        'ipn_url'        => "{$baseUrl}/api/payment/sslcommerz/ipn",
                        'customer_name'  => $order->customer_name ?? 'Customer',
                        'customer_phone' => $order->customer_phone ?? '01700000000',
                        'product_name'   => "Order #{$order->order_number}",
                        'num_items'      => $order->items->count(),
                    ]);

                    if ($result['success']) {
                        $order->update([
                            'transaction_id'  => $tranId,
                            'payment_gateway' => 'sslcommerz',
                        ]);
                        $paymentUrl = $result['gateway_url'];
                    }
                }
            }

            $responseData = $order->toArray();
            if ($paymentUrl) {
                $responseData['payment_url'] = $paymentUrl;
            }

            if (!empty($order->public_access_token)) {
                $responseData['access_token'] = $order->public_access_token;
                $responseData['tracking_url'] = url('/order/' . $order->order_number . '?access_token=' . $order->public_access_token);
            }

            return $this->created($responseData, 'Order placed successfully');
        } catch (\InvalidArgumentException $e) {
            return $this->error($e->getMessage(), 422);
        }
    }

    public function show(int $id): JsonResponse
    {
        $order = Order::with(['items.menuItem', 'table', 'voucher'])->find($id);

        if (!$order) {
            return $this->notFound('Order not found');
        }

        return $this->success($order);
    }

    public function updateStatus(UpdateOrderStatusRequest $request, int $id): JsonResponse
    {
        $order = Order::find($id);

        if (!$order) {
            return $this->notFound('Order not found');
        }

        $oldStatus = $order->status;
        $newStatus = $request->status;

        if (!$order->canTransitionTo($newStatus)) {
            return $this->error("Cannot change order from '{$oldStatus}' to '{$newStatus}'", 422);
        }

        $order->update(['status' => $newStatus]);

        AuditLogger::logAction('order_status_updated', $order, [
            'old_status' => $oldStatus,
            'new_status' => $newStatus,
        ]);

        if (in_array($newStatus, ['completed', 'cancelled'], true)) {
            $order->releaseResources(restoreVoucher: $newStatus === 'cancelled');
        }

        $this->broadcastStatus($order);

        return $this->success($order->fresh()->load(['items.menuItem', 'table']), 'Order status updated');
    }

    public function cancel(int $id): JsonResponse
    {
        $order = Order::find($id);

        if (!$order) {
            return $this->notFound('Order not found');
        }

        if (!$order->canTransitionTo('cancelled')) {
            return $this->error("Cannot cancel an order that is {$order->status}", 422);
        }

        $previous = $order->status;
        $order->update(['status' => 'cancelled']);

        AuditLogger::logAction('order_cancelled', $order, [
            'previous_status' => $previous,
        ]);

        $order->releaseResources(restoreVoucher: true);
        $this->broadcastStatus($order);

        return $this->success($order->fresh(), 'Order cancelled');
    }

    private function broadcastStatus(Order $order): void
    {
        try {
            broadcast(new OrderStatusUpdated($order->fresh()))->toOthers();
        } catch (\Throwable $e) {
            report($e);
        }
    }

    /**
     * Public endpoint: Get order status by order number (no auth)
     */
    public function trackOrder(Request $request, string $orderNumber): JsonResponse
    {
        $order = $this->resolveOrderForPublicOrTenant($request, $orderNumber);

        if (!$order) {
            return $this->notFound('Order not found');
        }

        return $this->success($order);
    }

    /**
     * Public endpoint: Get full VAT-compliant invoice data for an order
     */
    public function invoice(Request $request, string $orderNumber): JsonResponse
    {
        $order = $this->resolveOrderForPublicOrTenant($request, $orderNumber);

        if (!$order) {
            return $this->notFound('Order not found');
        }

        // Get tenant/restaurant info for the invoice header
        $tenant = Tenant::withoutGlobalScopes()->find($order->tenant_id);

        return $this->success([
            'invoice' => [
                'invoice_number'  => $order->invoice_number,
                'date'            => $order->created_at->toIso8601String(),
                'order_number'    => $order->order_number,
            ],
            'restaurant' => $tenant ? [
                'name'       => $tenant->name,
                'address'    => $tenant->address,
                'phone'      => $tenant->phone,
                'email'      => $tenant->email,
                'vat_number' => $tenant->vat_number,
                'currency'   => $tenant->currency,
            ] : null,
            'items' => $order->items->map(fn ($item) => [
                'name'             => $item->menuItem?->name,
                'qty'              => $item->qty,
                'unit_price'       => $item->price_at_sale,
                'line_total'       => $item->line_total,
                'special_instructions' => $item->special_instructions,
            ]),
            'totals' => [
                'subtotal'    => $order->subtotal,
                'discount'    => $order->discount,
                'net_amount'  => $order->net_amount,
                'vat_rate'    => $order->vat_rate,
                'vat_amount'  => $order->vat_amount,
                'grand_total' => $order->grand_total,
            ],
            'payment' => [
                'method' => $order->payment_method,
                'status' => $order->payment_status,
                'paid_at' => $order->paid_at?->toIso8601String(),
            ],
        ]);
    }

    private function resolveOrderForPublicOrTenant(Request $request, string $orderNumber): ?Order
    {
        $order = Order::withoutGlobalScopes()
            ->where('order_number', $orderNumber)
            ->with(['items.menuItem', 'table', 'voucher'])
            ->first();

        if (!$order) {
            return null;
        }

        $apiUser = auth('api')->user();

        if ($this->canAccessOrderAsTenantUser($apiUser, $order)) {
            return $order;
        }

        $accessToken = (string) $request->query('access_token', $request->input('access_token', ''));

        if ($accessToken !== ''
            && !empty($order->public_access_token)
            && hash_equals((string) $order->public_access_token, $accessToken)) {
            return $order;
        }

        return null;
    }

    private function canAccessOrderAsTenantUser(?User $user, Order $order): bool
    {
        if (!$user) {
            return false;
        }

        if ($user->isSuperAdmin()) {
            return true;
        }

        return (int) $user->tenant_id === (int) $order->tenant_id;
    }

    /**
     * Mark order payment as paid (restaurant staff/admin)
     */
    public function markPaid(Request $request, int $id): JsonResponse
    {
        $order = Order::find($id);

        if (!$order) {
            return $this->notFound('Order not found');
        }

        if ($order->payment_status === 'paid') {
            return $this->error('Order is already paid', 422);
        }

        if ($order->isCancelled()) {
            return $this->error('Cannot mark a cancelled order as paid', 422);
        }

        $order->update([
            'payment_status' => 'paid',
            'paid_at' => now(),
            'transaction_id' => $request->transaction_id ?? null,
            'payment_gateway' => $request->payment_gateway ?? ($order->payment_method === 'cash' ? 'counter' : null),
        ]);

        AuditLogger::logAction('payment_marked_paid', $order, [
            'payment_method' => $order->payment_method,
            'grand_total' => $order->grand_total,
        ]);

        return $this->success($order->fresh()->load(['items.menuItem', 'table', 'voucher']), 'Payment marked as paid');
    }
}
