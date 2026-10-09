<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Services\AI\RecommendationService;
use App\Services\ModulePermissionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RecommendationController extends Controller
{
    protected RecommendationService $recommendations;
    protected ModulePermissionService $modulePermissionService;

    public function __construct(RecommendationService $recommendations, ModulePermissionService $modulePermissionService)
    {
        $this->recommendations = $recommendations;
        $this->modulePermissionService = $modulePermissionService;
    }

    /**
     * Get smart recommendations.
     */
    public function index(Request $request, string $tenant): JsonResponse
    {
        $tenantModel = Tenant::where(is_numeric($tenant) ? 'id' : 'slug', $tenant)->first();

        if (!$tenantModel || !$tenantModel->is_active) {
            return response()->json([
                'success' => false,
                'error' => 'Restaurant not found',
            ], 404);
        }

        if (!$this->modulePermissionService->tenantHasModule($tenantModel, 'ai_recommendations')) {
            return response()->json([
                'success' => false,
                'error' => 'This feature is not available for this restaurant.',
            ], 403);
        }

        $cartItems = $request->input('cart', []);
        $limit = min($request->input('limit', 6), 12);

        $result = $this->recommendations
            ->forTenant($tenantModel->id)
            ->getRecommendations($cartItems, $limit);

        return response()->json($result);
    }

    /**
     * Get frequently bought together items.
     */
    public function frequentlyBoughtTogether(Request $request, string $tenant, int $itemId): JsonResponse
    {
        $tenantModel = Tenant::where(is_numeric($tenant) ? 'id' : 'slug', $tenant)->first();

        if (!$tenantModel || !$tenantModel->is_active) {
            return response()->json([
                'success' => false,
                'error' => 'Restaurant not found',
            ], 404);
        }

        if (!$this->modulePermissionService->tenantHasModule($tenantModel, 'ai_recommendations')) {
            return response()->json([
                'success' => false,
                'error' => 'This feature is not available for this restaurant.',
            ], 403);
        }

        $limit = min($request->input('limit', 3), 6);

        $items = $this->recommendations
            ->forTenant($tenantModel->id)
            ->getFrequentlyBoughtTogether($itemId, $limit);

        return response()->json([
            'success' => true,
            'items' => $items,
        ]);
    }
}
