<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\BaseApiController;
use App\Models\Settlement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SettlementController extends BaseApiController
{
    public function index(Request $request): JsonResponse
    {
        $query = Settlement::with('payments');

        if ($status = $request->get('status')) {
            $query->where('status', $status);
        }

        return $this->paginated($query->latest());
    }

    public function show(int $id): JsonResponse
    {
        $settlement = Settlement::with('payments')->find($id);

        if (!$settlement) {
            return $this->notFound('Settlement not found');
        }

        return $this->success($settlement);
    }

    /**
     * Super admin: List all settlements across tenants
     */
    public function allSettlements(Request $request): JsonResponse
    {
        $query = Settlement::withoutGlobalScopes()
            ->with(['tenant:id,name', 'payments']);

        if ($tenantId = $request->get('tenant_id')) {
            $query->where('tenant_id', $tenantId);
        }

        if ($status = $request->get('status')) {
            $query->where('status', $status);
        }

        return $this->paginated($query->latest());
    }
}
