<?php

namespace App\Services\AI;

use App\Models\AIConversation;
use App\Models\Category;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\Tenant;
use Illuminate\Support\Facades\Cache;

class CustomerChatbotService
{
    protected GeminiService $gemini;
    protected ?int $tenantId = null;
    protected ?Tenant $tenant = null;

    public function __construct(GeminiService $gemini)
    {
        $this->gemini = $gemini;
    }

    /**
     * Set tenant context.
     */
    public function forTenant(int $tenantId): self
    {
        $this->tenantId = $tenantId;
        $this->tenant = Tenant::find($tenantId);
        return $this;
    }

    /**
     * Process a customer message.
     */
    public function chat(string $message, ?string $sessionId = null): array
    {
        if (!$this->tenantId || !$this->tenant) {
            return ['success' => false, 'error' => 'Restaurant context required'];
        }

        if (!config('ai.features.customer_chatbot', true)) {
            return ['success' => false, 'error' => 'Chatbot is currently disabled'];
        }

        // Get or create session/conversation
        $conversation = $this->getOrCreateConversation($sessionId);
        $conversationHistory = $conversation->messages ?? [];

        // Classify intent to determine what context to fetch
        $intent = $this->classifyIntent($message);

        // Gather relevant context based on intent
        $context = $this->gatherContext($intent, $message);

        // Build the prompt
        $systemPrompt = $this->buildSystemPrompt($context);

        // Get AI response
        $response = $this->gemini->chat(
            $message,
            $systemPrompt,
            array_slice($conversationHistory, -6), // Last 6 messages for context
            $this->tenantId,
            'customer_chatbot'
        );

        if (!$response['success']) {
            // Fallback to rule-based response
            return $this->handleFallback($intent, $message, $conversation);
        }

        // Save conversation
        $this->updateConversation($conversation, $message, $response['content']);

        return [
            'success' => true,
            'message' => $response['content'],
            'session_id' => $conversation->session_id,
            'intent' => $intent,
            'suggestions' => $this->getSuggestionsForIntent($intent),
        ];
    }

    /**
     * Classify user intent.
     */
    protected function classifyIntent(string $message): string
    {
        $message = strtolower($message);

        // Menu/item related
        if (preg_match('/menu|items?|food|dish|what do you (have|serve)|show me/i', $message)) {
            return 'browse_menu';
        }

        // Category browsing
        if (preg_match('/categor|appetizer|main|dessert|drink|beverage|starter/i', $message)) {
            return 'browse_category';
        }

        // Recommendations
        if (preg_match('/recommend|suggest|popular|best|favorite|special|what should i/i', $message)) {
            return 'recommendation';
        }

        // Price related
        if (preg_match('/price|cost|how much|cheap|expensive|budget/i', $message)) {
            return 'price_inquiry';
        }

        // Item details
        if (preg_match('/ingredient|contain|allerg|spicy|vegetarian|vegan|halal|gluten/i', $message)) {
            return 'item_details';
        }

        // Order tracking
        if (preg_match('/track|order|status|where is|my order|order number/i', $message)) {
            return 'order_tracking';
        }

        // Restaurant info
        if (preg_match('/hour|open|close|location|address|contact|phone/i', $message)) {
            return 'restaurant_info';
        }

        // Greetings
        if (preg_match('/^(hi|hello|hey|good morning|good evening|assalamu)/i', $message)) {
            return 'greeting';
        }

        // Thanks/bye
        if (preg_match('/thank|bye|goodbye|see you/i', $message)) {
            return 'farewell';
        }

        return 'general';
    }

    /**
     * Gather context based on intent.
     */
    protected function gatherContext(string $intent, string $message): array
    {
        $context = [
            'restaurant_name' => $this->tenant->name,
            'currency' => $this->tenant->currency ?? 'BDT',
        ];

        switch ($intent) {
            case 'browse_menu':
            case 'recommendation':
            case 'price_inquiry':
                $context['menu'] = $this->getMenuSummary();
                $context['popular_items'] = $this->getPopularItems();
                break;

            case 'browse_category':
                $context['categories'] = $this->getCategories();
                $context['menu'] = $this->getMenuSummary();
                break;

            case 'item_details':
                $context['menu'] = $this->getFullMenu();
                break;

            case 'order_tracking':
                $orderNumber = $this->extractOrderNumber($message);
                if ($orderNumber) {
                    $context['order'] = $this->getOrderStatus($orderNumber);
                }
                break;

            case 'restaurant_info':
                $context['restaurant'] = $this->getRestaurantInfo();
                break;

            default:
                $context['menu_summary'] = $this->getMenuSummary();
                break;
        }

        return $context;
    }

    /**
     * Build system prompt with context.
     */
    protected function buildSystemPrompt(array $context): string
    {
        $basePrompt = config('ai.prompts.customer_chatbot');
        $restaurantName = $context['restaurant_name'];
        $currency = $context['currency'] === 'BDT' ? '৳' : $context['currency'];

        $contextString = "You are chatting with a customer of {$restaurantName}.\n";
        $contextString .= "Currency symbol: {$currency}\n\n";

        if (isset($context['menu'])) {
            $contextString .= "MENU:\n" . $context['menu'] . "\n\n";
        }

        if (isset($context['categories'])) {
            $contextString .= "CATEGORIES:\n" . implode(', ', $context['categories']) . "\n\n";
        }

        if (isset($context['popular_items'])) {
            $contextString .= "POPULAR ITEMS:\n" . $context['popular_items'] . "\n\n";
        }

        if (isset($context['order'])) {
            $contextString .= "ORDER STATUS:\n" . $context['order'] . "\n\n";
        }

        if (isset($context['restaurant'])) {
            $contextString .= "RESTAURANT INFO:\n" . $context['restaurant'] . "\n\n";
        }

        return $basePrompt . "\n\n" . $contextString;
    }

    /**
     * Get menu summary (cached).
     */
    protected function getMenuSummary(): string
    {
        return Cache::remember("menu_summary:{$this->tenantId}", 300, function () {
            $categories = Category::withoutGlobalScopes()
                ->where('tenant_id', $this->tenantId)
                ->where('is_active', true)
                ->with(['menuItems' => function ($q) {
                    $q->where('is_active', true)->orderBy('sort_order');
                }])
                ->ordered()
                ->get();

            $summary = [];
            foreach ($categories as $category) {
                $items = $category->menuItems->map(function ($item) {
                    return "- {$item->name}: ৳{$item->price}";
                })->implode("\n");

                $summary[] = "**{$category->name}**\n{$items}";
            }

            return implode("\n\n", $summary);
        });
    }

    /**
     * Get full menu with descriptions.
     */
    protected function getFullMenu(): string
    {
        return Cache::remember("full_menu:{$this->tenantId}", 300, function () {
            $categories = Category::withoutGlobalScopes()
                ->where('tenant_id', $this->tenantId)
                ->where('is_active', true)
                ->with(['menuItems' => function ($q) {
                    $q->where('is_active', true)->orderBy('sort_order');
                }])
                ->ordered()
                ->get();

            $menu = [];
            foreach ($categories as $category) {
                $items = $category->menuItems->map(function ($item) {
                    $desc = $item->description ? " - {$item->description}" : '';
                    return "- {$item->name} (৳{$item->price}){$desc}";
                })->implode("\n");

                $menu[] = "**{$category->name}**\n{$items}";
            }

            return implode("\n\n", $menu);
        });
    }

    /**
     * Get categories list.
     */
    protected function getCategories(): array
    {
        return Category::withoutGlobalScopes()
            ->where('tenant_id', $this->tenantId)
            ->where('is_active', true)
            ->ordered()
            ->pluck('name')
            ->toArray();
    }

    /**
     * Get popular items.
     */
    protected function getPopularItems(): string
    {
        return Cache::remember("popular_items:{$this->tenantId}", 600, function () {
            $popularItems = MenuItem::withoutGlobalScopes()
                ->where('tenant_id', $this->tenantId)
                ->where('is_active', true)
                ->withCount(['orderItems as order_count' => function ($q) {
                    $q->whereHas('order', function ($oq) {
                        $oq->where('created_at', '>=', now()->subDays(30));
                    });
                }])
                ->orderByDesc('order_count')
                ->take(5)
                ->get();

            if ($popularItems->isEmpty()) {
                return "No popular items data yet.";
            }

            return $popularItems->map(function ($item) {
                return "- {$item->name} (৳{$item->price})";
            })->implode("\n");
        });
    }

    /**
     * Extract a full order number (e.g. ORD-20261008-12-0003) from a message.
     * Partial numbers are not accepted: they would let anyone enumerate orders.
     */
    protected function extractOrderNumber(string $message): ?string
    {
        if (preg_match('/\bORD-\d{8}(?:-\d+)?-\d{4,}\b/i', $message, $matches)) {
            return strtoupper($matches[0]);
        }

        return null;
    }

    /**
     * Get order status. Deliberately minimal: the chat is public and order
     * numbers are guessable, so only the status is shared (no items, totals
     * or customer details, which require the order's access token).
     */
    protected function getOrderStatus(string $orderNumber): string
    {
        $order = Order::withoutGlobalScopes()
            ->where('tenant_id', $this->tenantId)
            ->where('order_number', $orderNumber)
            ->first();

        if (!$order) {
            return "Order not found. Please check the order number.";
        }

        $statusLabels = [
            'placed' => 'Received, waiting for confirmation',
            'confirmed' => 'Confirmed by kitchen',
            'preparing' => 'Being prepared',
            'ready' => 'Ready for pickup/serving',
            'served' => 'Served',
            'completed' => 'Completed',
            'cancelled' => 'Cancelled',
        ];

        $status = $statusLabels[$order->status] ?? $order->status;

        return "Order: {$order->order_number}\nStatus: {$status}";
    }

    /**
     * Get restaurant info.
     */
    protected function getRestaurantInfo(): string
    {
        $tenant = $this->tenant;

        $info = "Restaurant: {$tenant->name}";

        if ($tenant->description) {
            $info .= "\nDescription: {$tenant->description}";
        }

        if ($tenant->social_links) {
            $links = is_array($tenant->social_links) ? $tenant->social_links : json_decode($tenant->social_links, true);
            if ($links) {
                foreach ($links as $platform => $url) {
                    if ($url) {
                        $info .= "\n{$platform}: {$url}";
                    }
                }
            }
        }

        return $info;
    }

    /**
     * Get or create conversation.
     */
    protected function getOrCreateConversation(?string $sessionId): AIConversation
    {
        if ($sessionId) {
            $conversation = AIConversation::where('session_id', $sessionId)
                ->where('tenant_id', $this->tenantId)
                ->where('feature', 'customer_chat')
                ->first();

            if ($conversation) {
                return $conversation;
            }
        }

        return AIConversation::create([
            'tenant_id' => $this->tenantId,
            'user_id' => null, // Customer chats are anonymous
            'feature' => 'customer_chat',
            'session_id' => $sessionId ?? $this->generateSessionId(),
            'messages' => [],
            'metadata' => [
                'started_at' => now()->toISOString(),
            ],
        ]);
    }

    /**
     * Generate unique session ID.
     */
    protected function generateSessionId(): string
    {
        return 'cust_' . bin2hex(random_bytes(16));
    }

    /**
     * Update conversation with new messages.
     */
    protected function updateConversation(AIConversation $conversation, string $userMessage, string $aiResponse): void
    {
        $messages = $conversation->messages ?? [];

        $messages[] = ['role' => 'user', 'content' => $userMessage];
        $messages[] = ['role' => 'assistant', 'content' => $aiResponse];

        $conversation->update([
            'messages' => $messages,
            'metadata' => array_merge($conversation->metadata ?? [], [
                'last_message_at' => now()->toISOString(),
                'message_count' => count($messages),
            ]),
        ]);
    }

    /**
     * Handle fallback when AI is unavailable.
     */
    protected function handleFallback(string $intent, string $message, AIConversation $conversation): array
    {
        $response = match ($intent) {
            'greeting' => "Hello! Welcome to {$this->tenant->name}. I can help you browse our menu, get recommendations, or track your order. What would you like to do?",
            'farewell' => "Thank you for visiting {$this->tenant->name}! We hope to see you again soon.",
            'browse_menu' => "Please check out our menu on the screen. We have various categories to explore. Is there anything specific you're looking for?",
            'recommendation' => "Our most popular items are highly rated by customers. Check out our specials section on the menu!",
            'order_tracking' => "To track your order, please provide your order number (e.g., ORD-12345).",
            default => "I'm here to help! You can ask me about our menu, get recommendations, or track your order.",
        };

        $this->updateConversation($conversation, $message, $response);

        return [
            'success' => true,
            'message' => $response,
            'session_id' => $conversation->session_id,
            'intent' => $intent,
            'suggestions' => $this->getSuggestionsForIntent($intent),
            'fallback' => true,
        ];
    }

    /**
     * Get quick reply suggestions based on intent.
     */
    protected function getSuggestionsForIntent(string $intent): array
    {
        return match ($intent) {
            'greeting' => [
                'Show me the menu',
                'What do you recommend?',
                'Track my order',
            ],
            'browse_menu' => [
                'What\'s popular?',
                'Any vegetarian options?',
                'Show me desserts',
            ],
            'recommendation' => [
                'Tell me more',
                'Any other options?',
                'Show prices',
            ],
            'order_tracking' => [
                'My order is ORD-...',
                'When will it be ready?',
            ],
            default => [
                'Show menu',
                'What\'s popular?',
                'Track order',
            ],
        };
    }
}
