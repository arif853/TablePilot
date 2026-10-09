<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\BaseApiController;
use App\Models\AIConversation;
use App\Models\AIUsageLog;
use App\Services\AI\AnalyticsAssistantService;
use App\Services\AI\GeminiService;
use App\Services\ModulePermissionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class AIAnalyticsController extends BaseApiController
{
    protected AnalyticsAssistantService $analyticsService;
    protected GeminiService $geminiService;
    protected ModulePermissionService $modulePermissionService;

    public function __construct(AnalyticsAssistantService $analyticsService, GeminiService $geminiService, ModulePermissionService $modulePermissionService)
    {
        $this->analyticsService = $analyticsService;
        $this->geminiService = $geminiService;
        $this->modulePermissionService = $modulePermissionService;
    }

    /**
     * Ask an analytics question.
     *
     * POST /api/ai/analytics/ask
     */
    public function ask(Request $request): JsonResponse
    {
        $request->validate([
            'question' => 'required|string|max:500',
            'conversation_id' => 'nullable|integer',
        ]);

        $user = $request->user();
        $tenantId = $user->tenant_id;

        if (!$tenantId) {
            return $this->error('Tenant context required', 400);
        }

        // Check if AI is enabled
        if (!config('ai.features.analytics_assistant')) {
            return $this->error('Analytics assistant is not enabled', 403);
        }

        if (!$this->modulePermissionService->tenantHasModule($user->tenant, 'ai_analytics_assistant')) {
            return $this->error('Your subscription plan does not include this feature.', 403);
        }

        // Get or create conversation
        $conversation = $this->getOrCreateConversation(
            $request->conversation_id,
            $tenantId,
            $user->id
        );

        // Get conversation context (last 6 messages for context)
        $context = $conversation->getContextMessages(6);

        // Process the question
        $result = $this->analyticsService
            ->forTenant($tenantId)
            ->ask($request->question, $context);

        if (!$result['success']) {
            return $this->error($result['error'] ?? 'Failed to process question', 500);
        }

        // Save messages to conversation
        $conversation->addMessage('user', $request->question);
        $conversation->addMessage('assistant', $result['answer']);

        return $this->success([
            'answer' => $result['answer'],
            'chart' => $result['chart'] ?? null,
            'intent' => $result['intent'] ?? null,
            'conversation_id' => $conversation->id,
            'cached' => $result['cached'] ?? false,
        ]);
    }

    /**
     * Get proactive insights.
     *
     * GET /api/ai/analytics/insights
     */
    public function insights(Request $request): JsonResponse
    {
        $user = $request->user();
        $tenantId = $user->tenant_id;

        if (!$tenantId) {
            return $this->error('Tenant context required', 400);
        }

        if (!config('ai.features.analytics_assistant')) {
            return $this->error('Analytics assistant is not enabled', 403);
        }

        if (!$this->modulePermissionService->tenantHasModule($user->tenant, 'ai_analytics_assistant')) {
            return $this->error('Your subscription plan does not include this feature.', 403);
        }

        $result = $this->analyticsService
            ->forTenant($tenantId)
            ->getInsights();

        if (!$result['success']) {
            return $this->error($result['error'] ?? 'Failed to generate insights', 500);
        }

        return $this->success([
            'insights' => $result['insights'],
            'metrics' => $result['metrics'] ?? null,
            'cached' => $result['cached'] ?? false,
        ]);
    }

    /**
     * Get conversation history.
     *
     * GET /api/ai/analytics/conversations
     */
    public function conversations(Request $request): JsonResponse
    {
        $user = $request->user();

        $conversations = AIConversation::where('user_id', $user->id)
            ->where('feature', 'analytics_assistant')
            ->orderByDesc('updated_at')
            ->limit(20)
            ->get(['id', 'messages', 'created_at', 'updated_at'])
            ->map(function ($conv) {
                $messages = $conv->messages ?? [];
                $firstMessage = $messages[0]['content'] ?? 'New conversation';

                return [
                    'id' => $conv->id,
                    'preview' => Str::limit($firstMessage, 50),
                    'message_count' => count($messages),
                    'created_at' => $conv->created_at,
                    'updated_at' => $conv->updated_at,
                ];
            });

        return $this->success($conversations);
    }

    /**
     * Get a specific conversation.
     *
     * GET /api/ai/analytics/conversations/{id}
     */
    public function conversation(Request $request, int $id): JsonResponse
    {
        $user = $request->user();

        $conversation = AIConversation::where('id', $id)
            ->where('user_id', $user->id)
            ->first();

        if (!$conversation) {
            return $this->error('Conversation not found', 404);
        }

        return $this->success([
            'id' => $conversation->id,
            'messages' => $conversation->messages,
            'created_at' => $conversation->created_at,
        ]);
    }

    /**
     * Delete a conversation.
     *
     * DELETE /api/ai/analytics/conversations/{id}
     */
    public function deleteConversation(Request $request, int $id): JsonResponse
    {
        $user = $request->user();

        $deleted = AIConversation::where('id', $id)
            ->where('user_id', $user->id)
            ->delete();

        if (!$deleted) {
            return $this->error('Conversation not found', 404);
        }

        return $this->success(['message' => 'Conversation deleted']);
    }

    /**
     * Get suggested questions.
     *
     * GET /api/ai/analytics/suggestions
     */
    public function suggestions(Request $request): JsonResponse
    {
        $suggestions = [
            [
                'category' => 'Revenue',
                'questions' => [
                    "What were my total sales today?",
                    "Compare this week's revenue to last week",
                    "Show me the revenue trend for the last 30 days",
                ],
            ],
            [
                'category' => 'Menu',
                'questions' => [
                    "What are my top 5 best selling items?",
                    "Which items are not selling well?",
                    "How is each category performing?",
                ],
            ],
            [
                'category' => 'Orders',
                'questions' => [
                    "What's my average order value this month?",
                    "How many orders did I get today?",
                    "What are the busiest hours?",
                ],
            ],
            [
                'category' => 'Analysis',
                'questions' => [
                    "Compare dine-in vs parcel sales",
                    "How effective are my vouchers?",
                    "Which tables generate the most revenue?",
                ],
            ],
        ];

        return $this->success($suggestions);
    }

    /**
     * Get AI usage statistics (for restaurant admin).
     *
     * GET /api/ai/analytics/usage
     */
    public function usage(Request $request): JsonResponse
    {
        $user = $request->user();
        $tenantId = $user->tenant_id;

        $usage = AIUsageLog::getUsageByFeature($tenantId, 'month');
        $quota = $this->geminiService->getRemainingQuota($tenantId);

        return $this->success([
            'usage_by_feature' => $usage,
            'quota' => $quota,
        ]);
    }

    /**
     * Get or create a conversation.
     */
    protected function getOrCreateConversation(?int $conversationId, int $tenantId, int $userId): AIConversation
    {
        if ($conversationId) {
            $conversation = AIConversation::where('id', $conversationId)
                ->where('user_id', $userId)
                ->first();

            if ($conversation) {
                return $conversation;
            }
        }

        return AIConversation::create([
            'tenant_id' => $tenantId,
            'user_id' => $userId,
            'session_id' => Str::uuid()->toString(),
            'feature' => 'analytics_assistant',
            'messages' => [],
        ]);
    }
}
