<?php

namespace App\Services\AI;

use App\Models\Category;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Tenant;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class RecommendationService
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
     * Get smart recommendations based on context.
     */
    public function getRecommendations(array $cartItems = [], int $limit = 6): array
    {
        if (!$this->tenantId) {
            return ['success' => false, 'error' => 'Tenant context required'];
        }

        $recommendations = [];

        // 1. Time-based recommendations
        $timeBasedItems = $this->getTimeBasedRecommendations($limit);

        // 2. Popular items
        $popularItems = $this->getPopularItems($limit);

        // 3. Complementary items (if cart has items)
        $complementaryItems = [];
        if (!empty($cartItems)) {
            $complementaryItems = $this->getComplementaryItems($cartItems, $limit);
        }

        // 4. AI-powered recommendations (if cart has items and AI is available)
        $aiRecommendations = [];
        if (!empty($cartItems) && $this->gemini->isConfigured()) {
            $aiRecommendations = $this->getAIRecommendations($cartItems, $limit);
        }

        // Merge and deduplicate recommendations
        $allItems = collect();

        // Prioritize complementary/AI items when cart exists
        if (!empty($cartItems)) {
            $allItems = $allItems->merge($complementaryItems)->merge($aiRecommendations);
        }

        // Add time-based and popular items
        $allItems = $allItems->merge($timeBasedItems)->merge($popularItems);

        // Remove items already in cart
        $cartItemIds = collect($cartItems)->pluck('menu_item_id')->filter()->toArray();
        $allItems = $allItems->filter(fn($item) => !in_array($item['id'], $cartItemIds));

        // Deduplicate by ID and take limit
        $recommendations = $allItems
            ->unique('id')
            ->take($limit)
            ->values()
            ->toArray();

        return [
            'success' => true,
            'recommendations' => $recommendations,
            'context' => [
                'has_cart' => !empty($cartItems),
                'time_of_day' => $this->getTimeOfDay(),
            ],
        ];
    }

    /**
     * Get time-based recommendations.
     */
    protected function getTimeBasedRecommendations(int $limit): array
    {
        $hour = Carbon::now()->hour;
        $timeOfDay = $this->getTimeOfDay();

        return Cache::remember("time_recs:{$this->tenantId}:{$timeOfDay}", 1800, function () use ($hour, $limit) {
            // Find categories that sell well at this time
            $popularAtTime = OrderItem::query()
                ->whereHas('order', function ($q) use ($hour) {
                    $q->where('tenant_id', $this->tenantId)
                        ->completed()
                        ->where('created_at', '>=', Carbon::now()->subDays(30))
                        ->whereRaw('HOUR(created_at) BETWEEN ? AND ?', [$hour - 1, $hour + 1]);
                })
                ->select('menu_item_id', DB::raw('SUM(qty) as total_qty'))
                ->groupBy('menu_item_id')
                ->orderByDesc('total_qty')
                ->limit($limit)
                ->pluck('total_qty', 'menu_item_id');

            if ($popularAtTime->isEmpty()) {
                return [];
            }

            return MenuItem::withoutGlobalScopes()
                ->whereIn('id', $popularAtTime->keys())
                ->where('is_active', true)
                ->get()
                ->map(fn($item) => $this->formatMenuItem($item, 'time_based', "Popular at {$this->getTimeOfDay()}"))
                ->toArray();
        });
    }

    /**
     * Get popular items overall.
     */
    protected function getPopularItems(int $limit): array
    {
        return Cache::remember("popular_recs:{$this->tenantId}", 1800, function () use ($limit) {
            $popularIds = OrderItem::query()
                ->whereHas('order', function ($q) {
                    $q->where('tenant_id', $this->tenantId)
                        ->completed()
                        ->where('created_at', '>=', Carbon::now()->subDays(30));
                })
                ->select('menu_item_id', DB::raw('SUM(qty) as total_qty'))
                ->groupBy('menu_item_id')
                ->orderByDesc('total_qty')
                ->limit($limit)
                ->pluck('total_qty', 'menu_item_id');

            if ($popularIds->isEmpty()) {
                // Fall back to random active items
                return MenuItem::withoutGlobalScopes()
                    ->where('tenant_id', $this->tenantId)
                    ->where('is_active', true)
                    ->inRandomOrder()
                    ->limit($limit)
                    ->get()
                    ->map(fn($item) => $this->formatMenuItem($item, 'random', 'Try something new'))
                    ->toArray();
            }

            return MenuItem::withoutGlobalScopes()
                ->whereIn('id', $popularIds->keys())
                ->where('is_active', true)
                ->get()
                ->sortByDesc(fn($item) => $popularIds[$item->id] ?? 0)
                ->map(fn($item) => $this->formatMenuItem($item, 'popular', 'Customer favorite'))
                ->values()
                ->toArray();
        });
    }

    /**
     * Get complementary items based on cart contents.
     */
    protected function getComplementaryItems(array $cartItems, int $limit): array
    {
        $cartItemIds = collect($cartItems)->pluck('menu_item_id')->filter()->toArray();

        if (empty($cartItemIds)) {
            return [];
        }

        // Find items frequently ordered together with cart items
        $complementary = OrderItem::query()
            ->whereHas('order', function ($q) use ($cartItemIds) {
                $q->where('tenant_id', $this->tenantId)
                    ->completed()
                    ->whereHas('items', function ($iq) use ($cartItemIds) {
                        $iq->whereIn('menu_item_id', $cartItemIds);
                    });
            })
            ->whereNotIn('menu_item_id', $cartItemIds)
            ->select('menu_item_id', DB::raw('COUNT(*) as frequency'))
            ->groupBy('menu_item_id')
            ->orderByDesc('frequency')
            ->limit($limit)
            ->pluck('frequency', 'menu_item_id');

        if ($complementary->isEmpty()) {
            return [];
        }

        return MenuItem::withoutGlobalScopes()
            ->where('tenant_id', $this->tenantId)
            ->whereIn('id', $complementary->keys())
            ->where('is_active', true)
            ->get()
            ->map(fn($item) => $this->formatMenuItem($item, 'complementary', 'Goes well with your order'))
            ->toArray();
    }

    /**
     * Get AI-powered recommendations.
     */
    protected function getAIRecommendations(array $cartItems, int $limit): array
    {
        // Get cart item names
        $cartItemDetails = MenuItem::withoutGlobalScopes()
            ->where('tenant_id', $this->tenantId)
            ->whereIn('id', collect($cartItems)->pluck('menu_item_id')->filter())
            ->get(['id', 'name', 'category_id'])
            ->toArray();

        if (empty($cartItemDetails)) {
            return [];
        }

        // Get available menu items
        $availableItems = MenuItem::withoutGlobalScopes()
            ->where('tenant_id', $this->tenantId)
            ->where('is_active', true)
            ->whereNotIn('id', collect($cartItems)->pluck('menu_item_id')->filter())
            ->with('category:id,name')
            ->get(['id', 'name', 'price', 'category_id']);

        if ($availableItems->isEmpty()) {
            return [];
        }

        // Build prompt
        $cartNames = collect($cartItemDetails)->pluck('name')->implode(', ');
        $menuList = $availableItems->map(fn($i) => "{$i->id}: {$i->name} (৳{$i->price})")->implode("\n");

        $prompt = <<<PROMPT
Customer has these items in cart: {$cartNames}

Available menu items:
{$menuList}

Recommend exactly {$limit} items that would complement their order.
Return ONLY a JSON array of item IDs, nothing else. Example: [1, 5, 12]
PROMPT;

        $response = $this->gemini->chatJson(
            $prompt,
            'You are a menu recommendation assistant. Return only valid JSON arrays of item IDs.',
            $this->tenantId,
            'recommendations'
        );

        if (!$response['success'] || empty($response['data'])) {
            return [];
        }

        $recommendedIds = $response['data'];
        if (!is_array($recommendedIds)) {
            return [];
        }

        return $availableItems
            ->whereIn('id', $recommendedIds)
            ->take($limit)
            ->map(fn($item) => $this->formatMenuItem($item, 'ai', 'AI recommended'))
            ->values()
            ->toArray();
    }

    /**
     * Get "frequently bought together" items for a specific menu item.
     */
    public function getFrequentlyBoughtTogether(int $menuItemId, int $limit = 3): array
    {
        if (!$this->tenantId) {
            return [];
        }

        $cacheKey = "fbt:{$this->tenantId}:{$menuItemId}";

        return Cache::remember($cacheKey, 3600, function () use ($menuItemId, $limit) {
            $together = OrderItem::query()
                ->whereHas('order', function ($q) use ($menuItemId) {
                    $q->where('tenant_id', $this->tenantId)
                        ->completed()
                        ->whereHas('items', function ($iq) use ($menuItemId) {
                            $iq->where('menu_item_id', $menuItemId);
                        });
                })
                ->where('menu_item_id', '!=', $menuItemId)
                ->select('menu_item_id', DB::raw('COUNT(*) as frequency'))
                ->groupBy('menu_item_id')
                ->orderByDesc('frequency')
                ->limit($limit)
                ->pluck('frequency', 'menu_item_id');

            if ($together->isEmpty()) {
                return [];
            }

            return MenuItem::withoutGlobalScopes()
                ->whereIn('id', $together->keys())
                ->where('is_active', true)
                ->get()
                ->map(fn($item) => $this->formatMenuItem($item, 'fbt', 'Frequently bought together'))
                ->toArray();
        });
    }

    /**
     * Get category-based recommendations.
     */
    public function getCategoryRecommendations(int $categoryId, int $limit = 4): array
    {
        if (!$this->tenantId) {
            return [];
        }

        // Get popular items from different categories
        $category = Category::find($categoryId);
        if (!$category) {
            return [];
        }

        // Suggest items from complementary categories
        $complementaryCategories = $this->getComplementaryCategories($categoryId);

        return MenuItem::withoutGlobalScopes()
            ->where('tenant_id', $this->tenantId)
            ->where('is_active', true)
            ->whereIn('category_id', $complementaryCategories)
            ->inRandomOrder()
            ->limit($limit)
            ->get()
            ->map(fn($item) => $this->formatMenuItem($item, 'category', 'You might also like'))
            ->toArray();
    }

    /**
     * Get complementary category IDs.
     */
    protected function getComplementaryCategories(int $categoryId): array
    {
        // Find categories that are often ordered together
        $categoryOrders = Order::where('tenant_id', $this->tenantId)
            ->completed()
            ->whereHas('items.menuItem', function ($q) use ($categoryId) {
                $q->where('category_id', $categoryId);
            })
            ->with('items.menuItem:id,category_id')
            ->limit(100)
            ->get();

        $categoryCounts = [];
        foreach ($categoryOrders as $order) {
            foreach ($order->items as $item) {
                $catId = $item->menuItem->category_id ?? null;
                if ($catId && $catId !== $categoryId) {
                    $categoryCounts[$catId] = ($categoryCounts[$catId] ?? 0) + 1;
                }
            }
        }

        arsort($categoryCounts);

        return array_slice(array_keys($categoryCounts), 0, 3) ?: Category::withoutGlobalScopes()
            ->where('tenant_id', $this->tenantId)
            ->where('id', '!=', $categoryId)
            ->pluck('id')
            ->take(3)
            ->toArray();
    }

    /**
     * Format menu item for response.
     */
    protected function formatMenuItem(MenuItem $item, string $type, string $reason): array
    {
        return [
            'id' => $item->id,
            'name' => $item->name,
            'description' => $item->description,
            'price' => (float) $item->price,
            'image' => $item->image,
            'category' => $item->category?->name ?? null,
            'recommendation_type' => $type,
            'recommendation_reason' => $reason,
        ];
    }

    /**
     * Get time of day label.
     */
    protected function getTimeOfDay(): string
    {
        $hour = Carbon::now()->hour;

        if ($hour >= 5 && $hour < 11) {
            return 'breakfast';
        } elseif ($hour >= 11 && $hour < 15) {
            return 'lunch';
        } elseif ($hour >= 15 && $hour < 18) {
            return 'afternoon';
        } elseif ($hour >= 18 && $hour < 22) {
            return 'dinner';
        } else {
            return 'late_night';
        }
    }
}
