<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\BaseApiController;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\Settlement;
use App\Models\Subscription;
use App\Models\SubscriptionPlan;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class DashboardController extends BaseApiController
{
    public function index(Request $request): JsonResponse
    {
        $user = auth()->user();

        if ($user->isSuperAdmin()) {
            return $this->superAdminDashboard();
        }

        return $this->tenantDashboard($user->tenant_id);
    }

    private function superAdminDashboard(): JsonResponse
    {
        $now = Carbon::now();
        $startOfMonth = $now->copy()->startOfMonth();
        // Carbon is mutable: one shared instance would make startOfMonth()/endOfMonth() collapse to the same instant
        $lastMonthStart = $now->copy()->subMonthNoOverflow()->startOfMonth();
        $lastMonthEnd = $now->copy()->subMonthNoOverflow()->endOfMonth();

        // Basic tenant stats
        $totalTenants = Tenant::count();
        $activeTenants = Tenant::where('is_active', true)->count();
        $inactiveTenants = $totalTenants - $activeTenants;

        // Subscription stats
        $activeSubscriptions = Subscription::withoutGlobalScopes()->active()->get();

        // MRR calculation: sum of all active subscription amounts normalized to monthly
        $mrr = $activeSubscriptions->sum(function ($sub) {
            $daysRemaining = max(1, $sub->daysRemaining());
            $totalDays = $sub->starts_at->diffInDays($sub->expires_at) ?: 30;
            $monthlyEquivalent = ($sub->amount / $totalDays) * 30;
            return $monthlyEquivalent;
        });

        // ARR
        $arr = $mrr * 12;

        // Churn rate: expired subscriptions in last 30 days / total subscriptions at start of period
        $expiredLastMonth = Subscription::withoutGlobalScopes()
            ->where('status', 'expired')
            ->where('expires_at', '>=', $lastMonthStart)
            ->where('expires_at', '<=', $lastMonthEnd)
            ->count();

        $totalSubsLastMonth = Subscription::withoutGlobalScopes()
            ->where('created_at', '<', $lastMonthEnd)
            ->count();

        $churnRate = $totalSubsLastMonth > 0
            ? round(($expiredLastMonth / $totalSubsLastMonth) * 100, 2)
            : 0;

        // Order stats
        $ordersToday = Order::withoutGlobalScopes()->whereDate('created_at', today())->count();
        $ordersThisMonth = Order::withoutGlobalScopes()
            ->where('created_at', '>=', $startOfMonth)
            ->count();

        // Revenue stats
        $revenueToday = Order::withoutGlobalScopes()
            ->whereDate('created_at', today())
            ->where('status', 'completed')
            ->sum('grand_total');

        $revenueThisMonth = Order::withoutGlobalScopes()
            ->where('created_at', '>=', $startOfMonth)
            ->where('status', 'completed')
            ->sum('grand_total');

        // Top 10 tenants by revenue this month
        $topTenants = Tenant::select('tenants.id', 'tenants.name', 'tenants.slug')
            ->leftJoin('orders', 'tenants.id', '=', 'orders.tenant_id')
            ->where('orders.created_at', '>=', $startOfMonth)
            ->where('orders.status', 'completed')
            ->groupBy('tenants.id', 'tenants.name', 'tenants.slug')
            ->selectRaw('SUM(orders.grand_total) as total_revenue')
            ->selectRaw('COUNT(orders.id) as order_count')
            ->orderByDesc('total_revenue')
            ->limit(10)
            ->get();

        // New tenants per month (last 12 months)
        $newTenantsPerMonth = Tenant::select(
                DB::raw("DATE_FORMAT(created_at, '%Y-%m') as month"),
                DB::raw('COUNT(*) as count')
            )
            ->where('created_at', '>=', $now->copy()->subMonths(12)->startOfMonth())
            ->groupBy('month')
            ->orderBy('month')
            ->get();

        // Revenue trend per month (last 12 months)
        $revenueTrend = Order::withoutGlobalScopes()
            ->select(
                DB::raw("DATE_FORMAT(created_at, '%Y-%m') as month"),
                DB::raw('SUM(grand_total) as revenue')
            )
            ->where('status', 'completed')
            ->where('created_at', '>=', $now->copy()->subMonths(12)->startOfMonth())
            ->groupBy('month')
            ->orderBy('month')
            ->get();

        // Plan distribution
        $planDistribution = Subscription::withoutGlobalScopes()
            ->active()
            ->select('plan_type', DB::raw('COUNT(*) as count'))
            ->groupBy('plan_type')
            ->get();

        // Expiring soon (next 30 days)
        $expiringSoon = Subscription::withoutGlobalScopes()
            ->active()
            ->where('expires_at', '<=', $now->copy()->addDays(30))
            ->count();

        // Recent activity
        $recentTenants = Tenant::latest()->limit(5)->get(['id', 'name', 'slug', 'created_at', 'is_active']);

        $recentSubscriptions = Subscription::withoutGlobalScopes()
            ->with('tenant:id,name,slug')
            ->latest()
            ->limit(5)
            ->get(['id', 'tenant_id', 'plan_type', 'status', 'expires_at', 'created_at']);

        // Commission/settlement stats
        $pendingCommission = Settlement::withoutGlobalScopes()
            ->where('status', '!=', 'settled')
            ->sum('payable_balance');

        $totalCollected = Settlement::withoutGlobalScopes()->sum('total_paid');

        return $this->success([
            'kpi' => [
                'mrr' => round($mrr, 2),
                'arr' => round($arr, 2),
                'active_tenants' => $activeTenants,
                'inactive_tenants' => $inactiveTenants,
                'total_tenants' => $totalTenants,
                'churn_rate' => $churnRate,
                'orders_today' => $ordersToday,
                'orders_this_month' => $ordersThisMonth,
                'revenue_today' => round($revenueToday, 2),
                'revenue_this_month' => round($revenueThisMonth, 2),
                'pending_commission' => round($pendingCommission, 2),
                'total_collected' => round($totalCollected, 2),
                'expiring_soon' => $expiringSoon,
            ],
            'charts' => [
                'new_tenants_per_month' => $newTenantsPerMonth,
                'revenue_trend' => $revenueTrend,
                'plan_distribution' => $planDistribution,
            ],
            'top_tenants' => $topTenants,
            'recent_tenants' => $recentTenants,
            'recent_subscriptions' => $recentSubscriptions,
            'users_count' => User::count(),
        ]);
    }

    private function tenantDashboard(int $tenantId): JsonResponse
    {
        $today = now()->startOfDay();
        $thisMonth = now()->startOfMonth();

        $ordersToday = Order::where('created_at', '>=', $today);
        $ordersMonth = Order::where('created_at', '>=', $thisMonth);

        $revenueToday = (clone $ordersToday)->completed()->sum('grand_total');
        $revenueMonth = (clone $ordersMonth)->completed()->sum('grand_total');

        return $this->success([
            'orders' => [
                'today' => (clone $ordersToday)->count(),
                'this_month' => (clone $ordersMonth)->count(),
                'pending' => Order::whereIn('status', ['placed', 'confirmed'])->count(),
                'preparing' => Order::where('status', 'preparing')->count(),
                'ready' => Order::where('status', 'ready')->count(),
            ],
            'revenue' => [
                'today' => $revenueToday,
                'this_month' => $revenueMonth,
            ],
            'recent_orders' => Order::with(['table', 'items.menuItem'])
                ->latest()
                ->limit(10)
                ->get(),
            'top_items' => DB::table('order_items')
                ->join('orders', 'order_items.order_id', '=', 'orders.id')
                ->join('menu_items', 'order_items.menu_item_id', '=', 'menu_items.id')
                ->where('orders.tenant_id', $tenantId)
                ->where('orders.status', 'completed')
                ->where('orders.created_at', '>=', $thisMonth)
                ->select(
                    'menu_items.name',
                    DB::raw('SUM(order_items.qty) as total_qty'),
                    DB::raw('SUM(order_items.line_total) as total_revenue')
                )
                ->groupBy('menu_items.name')
                ->orderByDesc('total_qty')
                ->limit(5)
                ->get(),
        ]);
    }
}
