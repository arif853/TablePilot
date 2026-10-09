<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\BaseApiController;
use App\Http\Requests\StoreVoucherRequest;
use App\Models\Voucher;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VoucherController extends BaseApiController
{
    public function index(Request $request): JsonResponse
    {
        $query = Voucher::query();

        if ($request->boolean('active_only')) {
            $query->valid();
        }

        if ($search = $request->get('search')) {
            $query->where('code', 'like', "%{$search}%");
        }

        return $this->paginated($query->latest());
    }

    public function store(StoreVoucherRequest $request): JsonResponse
    {
        $data = $request->validated();

        // Check unique code within tenant
        $exists = Voucher::where('tenant_id', auth()->user()->tenant_id)
            ->where('code', $data['code'])
            ->exists();

        if ($exists) {
            return $this->error('Voucher code already exists', 422);
        }

        $voucher = Voucher::create($data);

        AuditLogger::logCreated($voucher);

        return $this->created($voucher, 'Voucher created');
    }

    public function show(int $id): JsonResponse
    {
        $voucher = Voucher::withCount('orders')->find($id);

        if (!$voucher) {
            return $this->notFound('Voucher not found');
        }

        return $this->success($voucher);
    }

    public function update(StoreVoucherRequest $request, int $id): JsonResponse
    {
        $voucher = Voucher::find($id);

        if (!$voucher) {
            return $this->notFound('Voucher not found');
        }

        $original = $voucher->toArray();
        $voucher->update($request->validated());

        AuditLogger::logUpdated($voucher, $original);

        return $this->success($voucher->fresh(), 'Voucher updated');
    }

    public function destroy(int $id): JsonResponse
    {
        $voucher = Voucher::find($id);

        if (!$voucher) {
            return $this->notFound('Voucher not found');
        }

        AuditLogger::logDeleted($voucher);

        $voucher->delete();

        return $this->success(null, 'Voucher deleted');
    }

    public function validate(Request $request): JsonResponse
    {
        $request->validate([
            'code' => 'required|string',
            'subtotal' => 'required|numeric|min:0',
            'tenant_id' => 'nullable|exists:tenants,id',
            'tenant_slug' => 'nullable|string',
        ]);

        // Resolve tenant by ID, slug, or authenticated user
        $tenantId = $request->tenant_id;
        if (!$tenantId && $request->tenant_slug) {
            $tenant = \App\Models\Tenant::where('slug', $request->tenant_slug)->first();
            if (!$tenant) {
                return $this->error('Restaurant not found', 404);
            }
            $tenantId = $tenant->id;
        }

        // Fallback to authenticated user's tenant
        if (!$tenantId && auth()->check()) {
            $tenantId = auth()->user()->tenant_id;
        }

        if (!$tenantId) {
            return $this->error('Restaurant identifier is required', 422);
        }

        $voucher = Voucher::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->where('code', $request->code)
            ->first();

        if (!$voucher) {
            return $this->error('Voucher not found', 404);
        }

        if (!$voucher->isValid()) {
            return $this->error('Voucher is no longer valid', 422);
        }

        if ($request->subtotal < $voucher->min_purchase) {
            return $this->error("Minimum purchase of {$voucher->min_purchase} required", 422);
        }

        $discount = $voucher->calculateDiscount($request->subtotal);

        return $this->success([
            'voucher' => $voucher,
            'discount' => $discount,
            'new_total' => $request->subtotal - $discount,
        ]);
    }
}
