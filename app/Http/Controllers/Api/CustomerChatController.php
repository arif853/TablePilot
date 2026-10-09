<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Services\AI\CustomerChatbotService;
use App\Services\ModulePermissionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerChatController extends Controller
{
    protected CustomerChatbotService $chatbot;
    protected ModulePermissionService $modulePermissionService;

    public function __construct(CustomerChatbotService $chatbot, ModulePermissionService $modulePermissionService)
    {
        $this->chatbot = $chatbot;
        $this->modulePermissionService = $modulePermissionService;
    }

    /**
     * Send a message to the chatbot.
     */
    public function chat(Request $request, string $tenant): JsonResponse
    {
        $request->validate([
            'message' => 'required|string|max:500',
            'session_id' => 'nullable|string|max:100',
        ]);

        // Find tenant by slug or ID
        $tenantModel = Tenant::where(is_numeric($tenant) ? 'id' : 'slug', $tenant)->first();

        if (!$tenantModel || !$tenantModel->is_active) {
            return response()->json([
                'success' => false,
                'error' => 'Restaurant not found',
            ], 404);
        }

        if (!$this->modulePermissionService->tenantHasModule($tenantModel, 'ai_customer_chatbot')) {
            return response()->json([
                'success' => false,
                'error' => 'This feature is not available for this restaurant.',
            ], 403);
        }

        $result = $this->chatbot
            ->forTenant($tenantModel->id)
            ->chat(
                $request->input('message'),
                $request->input('session_id')
            );

        if (!$result['success']) {
            return response()->json($result, 400);
        }

        return response()->json($result);
    }

    /**
     * Get quick start suggestions.
     */
    public function suggestions(string $tenant): JsonResponse
    {
        $tenantModel = Tenant::where(is_numeric($tenant) ? 'id' : 'slug', $tenant)->first();

        if (!$tenantModel || !$tenantModel->is_active) {
            return response()->json([
                'success' => false,
                'error' => 'Restaurant not found',
            ], 404);
        }

        if (!$this->modulePermissionService->tenantHasModule($tenantModel, 'ai_customer_chatbot')) {
            return response()->json([
                'success' => false,
                'error' => 'This feature is not available for this restaurant.',
            ], 403);
        }

        return response()->json([
            'success' => true,
            'suggestions' => [
                [
                    'text' => 'Show me the menu',
                    'icon' => 'menu',
                ],
                [
                    'text' => 'What do you recommend?',
                    'icon' => 'star',
                ],
                [
                    'text' => 'Any vegetarian options?',
                    'icon' => 'leaf',
                ],
                [
                    'text' => 'Track my order',
                    'icon' => 'search',
                ],
            ],
            'welcome_message' => "Hi! I'm your assistant for {$tenantModel->name}. How can I help you today?",
        ]);
    }
}
