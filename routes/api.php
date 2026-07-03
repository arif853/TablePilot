<?php

use App\Http\Controllers\Api\AIAnalyticsController;
use App\Http\Controllers\Api\SalesForecastController;
use App\Http\Controllers\Api\AnnouncementController;
use App\Http\Controllers\Api\AuditLogController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BrandingController;
use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\ContactController;
use App\Http\Controllers\Api\CustomerChatController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\KitchenController;
use App\Http\Controllers\Api\MenuDescriptionController;
use App\Http\Controllers\Api\ModuleController;
use App\Http\Controllers\Api\SentimentController;
use App\Http\Controllers\Api\MenuItemController;
use App\Http\Controllers\Api\OnboardingController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\PasswordResetController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\PlanController;
use App\Http\Controllers\Api\PlatformSettingController;
use App\Http\Controllers\Api\PosOrderController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\RecommendationController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\SettlementController;
use App\Http\Controllers\Api\SubscriptionController;
use App\Http\Controllers\Api\SystemController;
use App\Http\Controllers\Api\TableController;
use App\Http\Controllers\Api\TenantApplicationController;
use App\Http\Controllers\Api\TenantController;
use App\Http\Controllers\Api\TenantModuleController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\VatReportController;
use App\Http\Controllers\Api\VoucherController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Versioning
|--------------------------------------------------------------------------
| All routes are registered at both /api/ (backward compatible) and
| /api/v1/ (versioned). New API versions can be added as v2, v3 etc.
| Health-check and payment callbacks remain unversioned.
*/

// Unversioned Routes (must remain stable across versions)
// Public Health Check (for load balancers / uptime monitors)
Route::get('health', [SystemController::class, 'publicHealth']);

// SSLCommerz Payment Routes (public, callbacks from gateway — must be stable URLs)
Route::prefix('payment/sslcommerz')->group(function () {
    Route::post('initiate', [PaymentController::class, 'initiate']);
    Route::post('callback', [PaymentController::class, 'subscriptionCallback']);
    Route::post('success', [PaymentController::class, 'handleSuccess']);
    Route::post('fail', [PaymentController::class, 'handleFail']);
    Route::post('cancel', [PaymentController::class, 'handleCancel']);
    Route::post('ipn', [PaymentController::class, 'ipn']);
});

Route::prefix('payment/bkash')->group(function () {
    Route::post('callback', [PaymentController::class, 'bkashSubscriptionCallback']);
});

// Onboarding Payment Callbacks (public, from SSLCommerz gateway redirects)
Route::prefix('onboarding/payment')->group(function () {
    Route::post('success', [OnboardingController::class, 'paymentSuccess']);
    Route::post('fail', [OnboardingController::class, 'paymentFail']);
    Route::post('cancel', [OnboardingController::class, 'paymentCancel']);
    Route::post('ipn', [OnboardingController::class, 'paymentIpn']);
});

/*
|--------------------------------------------------------------------------
| Versioned API Routes (v1)
|--------------------------------------------------------------------------
| Closure that registers all v1 routes. Mounted at both / and /v1/.
*/
$v1Routes = function () {

    /*
    |----------------------------------------------------------------------
    | Public Routes (No Authentication)
    |----------------------------------------------------------------------
    */

    // Authentication
    Route::prefix('auth')->middleware('throttle:auth')->group(function () {
        Route::post('register', [AuthController::class, 'register']);
        Route::post('login', [AuthController::class, 'login']);
        Route::post('verify-otp', [AuthController::class, 'verifyOtp']);
        Route::post('resend-otp', [AuthController::class, 'sendOtp']);
    });

    // Platform branding (public, no auth)
    Route::get('platform/branding', [PlatformSettingController::class, 'branding']);

    // Public subscription plans (for registration page)
    Route::get('plans', [PlanController::class, 'index']);

    // Contact / Enquiry (public)
    Route::post('contact', [ContactController::class, 'store'])->middleware('throttle:contact');

    // Password Reset (public, rate limited)
    Route::prefix('auth')->middleware('throttle:auth')->group(function () {
        Route::post('forgot-password', [PasswordResetController::class, 'sendResetLink']);
        Route::post('reset-password', [PasswordResetController::class, 'resetPassword']);
    });

    // Customer-facing (public, no auth required)
    Route::prefix('customer')->group(function () {
        Route::get('restaurant/{tenant}', [CustomerController::class, 'restaurant']);
        Route::get('restaurant/{tenant}/menu', [CustomerController::class, 'menu']);
        Route::get('restaurant/{tenant}/table/{table}', [CustomerController::class, 'table']);

        // AI Chatbot (public)
        Route::post('restaurant/{tenant}/chat', [CustomerChatController::class, 'chat']);
        Route::get('restaurant/{tenant}/chat/suggestions', [CustomerChatController::class, 'suggestions']);

        // Smart Recommendations
        Route::post('restaurant/{tenant}/recommendations', [RecommendationController::class, 'index']);
        Route::get('restaurant/{tenant}/recommendations/{itemId}/fbt', [RecommendationController::class, 'frequentlyBoughtTogether']);

        // Place order (with WiFi validation)
        Route::post('restaurant/{tenant}/order', [OrderController::class, 'store'])
            ->middleware(['wifi.validate', 'throttle:customer-order']);

        // Voucher validation
        Route::post('voucher/validate', [VoucherController::class, 'validate']);

        // Track order
        Route::get('order/track/{orderNumber}', [OrderController::class, 'trackOrder'])
            ->middleware('throttle:30,1');

        // Invoice (public)
        Route::get('order/{orderNumber}/invoice', [OrderController::class, 'invoice'])
            ->middleware('throttle:30,1');
    });

    /*
    |----------------------------------------------------------------------
    | Authenticated Routes
    |----------------------------------------------------------------------
    */
    Route::middleware(['auth:api'])->group(function () {

        // Auth management
        Route::prefix('auth')->group(function () {
            Route::get('me', [AuthController::class, 'me']);
            Route::post('logout', [AuthController::class, 'logout']);
            Route::post('refresh', [AuthController::class, 'refresh']);
        });

        // Dashboard
        Route::get('dashboard', [DashboardController::class, 'index']);

        // User Profile
        Route::prefix('profile')->group(function () {
            Route::get('/', [ProfileController::class, 'show']);
            Route::put('/', [ProfileController::class, 'update']);
            Route::put('password', [ProfileController::class, 'changePassword']);
        });

        // Onboarding (for new restaurant_admin users without a tenant)
        Route::prefix('onboarding')->group(function () {
            Route::get('status', [OnboardingController::class, 'status']);
            Route::post('setup-restaurant', [OnboardingController::class, 'setupRestaurant']);
            Route::post('subscribe', [OnboardingController::class, 'initiateSubscription']);
        });

        // Subscription endpoints must be reachable even when subscription is expired
        Route::middleware('tenant')->prefix('subscription')->group(function () {
            Route::get('current', [SubscriptionController::class, 'currentSubscription']);
            Route::get('plans', [SubscriptionController::class, 'plans']);
            Route::post('initiate', [SubscriptionController::class, 'initiatePayment']);
            Route::post('verify', [SubscriptionController::class, 'verify']);
            Route::post('pay', [SubscriptionController::class, 'pay']);
            Route::post('callback', [SubscriptionController::class, 'paymentCallback']);
        });

        // Module access (tenant-facing — get my accessible modules)
        Route::middleware(['tenant', 'subscription'])->get('modules/my-access', [TenantModuleController::class, 'myAccess']);

        /*
        |------------------------------------------------------------------
        | Tenant-scoped Routes (requires active tenant + subscription)
        |------------------------------------------------------------------
        */
        Route::middleware(['tenant', 'subscription'])->group(function () {

            // Menu Items
            Route::apiResource('menu-items', MenuItemController::class);
            Route::patch('menu-items/{id}/toggle', [MenuItemController::class, 'toggleAvailability']);
            Route::post('menu-items/{id}/restore', [MenuItemController::class, 'restore']);

            // Categories
            Route::apiResource('categories', CategoryController::class);

            // Tables
            Route::apiResource('tables', TableController::class);
            Route::post('tables/transfer', [TableController::class, 'transfer']);
            Route::get('tables/{id}/qr', [TableController::class, 'generateQrCode']);
            Route::get('tables/parcel-qr', [TableController::class, 'generateParcelQr']);

            // Vouchers
            Route::middleware('module:voucher_system')->apiResource('vouchers', VoucherController::class);

            // Orders (restaurant-side management)
            Route::apiResource('orders', OrderController::class)->only(['index', 'show']);
            Route::patch('orders/{id}/status', [OrderController::class, 'updateStatus']);
            Route::post('orders/{id}/cancel', [OrderController::class, 'cancel']);
            Route::post('orders/{id}/mark-paid', [OrderController::class, 'markPaid']);

            // POS Terminal (staff + admin order creation)
            Route::middleware(['role:restaurant_admin,staff', 'module:pos'])->group(function () {
                Route::post('pos/orders', [PosOrderController::class, 'store']);
            });

            // Kitchen
            Route::middleware('module:kitchen_display')->prefix('kitchen')->group(function () {
                Route::get('orders', [KitchenController::class, 'activeOrders']);
                Route::get('orders/{status}', [KitchenController::class, 'ordersByStatus']);
                Route::post('orders/{id}/advance', [KitchenController::class, 'advanceOrder']);
                Route::get('stats', [KitchenController::class, 'stats']);
            });

            // Reports
            Route::middleware('module:reports_analytics')->prefix('reports')->group(function () {
                Route::get('sales', [ReportController::class, 'salesReport']);
                Route::get('vouchers', [ReportController::class, 'voucherReport']);
                Route::get('tables', [ReportController::class, 'tablePerformance']);
                Route::get('trends', [ReportController::class, 'trendReport']);
                Route::get('top-items', [ReportController::class, 'topSellingItems']);
                Route::get('revenue-comparison', [ReportController::class, 'revenueComparison']);
                Route::get('settlements', [ReportController::class, 'settlementReport']);

                // VAT Reports
                Route::middleware('module:vat_reports')->group(function () {
                    Route::get('vat/daily', [VatReportController::class, 'dailyZReport']);
                    Route::get('vat/monthly', [VatReportController::class, 'monthlyVatReport']);
                });
            });

            // AI Analytics Assistant
            Route::middleware('module:ai_analytics_assistant')->prefix('ai/analytics')->group(function () {
                Route::post('ask', [AIAnalyticsController::class, 'ask']);
                Route::get('insights', [AIAnalyticsController::class, 'insights']);
                Route::get('suggestions', [AIAnalyticsController::class, 'suggestions']);
                Route::get('usage', [AIAnalyticsController::class, 'usage']);
                Route::get('conversations', [AIAnalyticsController::class, 'conversations']);
                Route::get('conversations/{id}', [AIAnalyticsController::class, 'conversation']);
                Route::delete('conversations/{id}', [AIAnalyticsController::class, 'deleteConversation']);
            });

            // AI Sales Forecasting
            Route::middleware('module:ai_sales_forecast')->prefix('ai/forecast')->group(function () {
                Route::get('/', [SalesForecastController::class, 'forecast']);
                Route::get('busy-hours', [SalesForecastController::class, 'busyHours']);
                Route::get('staffing', [SalesForecastController::class, 'staffing']);
            });

            // AI Menu Description Generator
            Route::middleware('module:ai_menu_description')->prefix('ai/description')->group(function () {
                Route::post('generate', [MenuDescriptionController::class, 'generate']);
                Route::post('alternatives', [MenuDescriptionController::class, 'alternatives']);
                Route::post('improve', [MenuDescriptionController::class, 'improve']);
                Route::post('batch', [MenuDescriptionController::class, 'batch']);
                Route::post('menu-items/{id}', [MenuDescriptionController::class, 'generateAndApply']);
            });

            // AI Sentiment Analysis
            Route::middleware('module:ai_sentiment_analysis')->prefix('ai/sentiment')->group(function () {
                Route::get('overview', [SentimentController::class, 'overview']);
                Route::get('trends', [SentimentController::class, 'trends']);
                Route::get('negative', [SentimentController::class, 'negativeFeedback']);
                Route::post('analyze', [SentimentController::class, 'analyze']);
            });

            // Settlements
            Route::middleware('module:settlement_management')->group(function () {
                Route::get('settlements', [SettlementController::class, 'index']);
                Route::get('settlements/{id}', [SettlementController::class, 'show']);
            });

            // Users: restaurant admin can manage own tenant's staff/kitchen users
            Route::middleware(['role:restaurant_admin', 'module:user_management'])->group(function () {
                Route::get('users', [UserController::class, 'index']);
                Route::post('users', [UserController::class, 'store']);
                Route::get('users/{id}', [UserController::class, 'show']);
                Route::put('users/{id}', [UserController::class, 'update']);
                Route::delete('users/{id}', [UserController::class, 'destroy']);
            });

            // Restaurant Branding (restaurant admin)
            Route::middleware(['role:restaurant_admin', 'module:branding'])->prefix('branding')->group(function () {
                Route::get('/', [BrandingController::class, 'show']);
                Route::post('/', [BrandingController::class, 'update']);
            });

        });

        /*
        |------------------------------------------------------------------
        | Super Admin Routes
        |------------------------------------------------------------------
        */
        Route::middleware('role:super_admin')->prefix('admin')->group(function () {

            // Tenant management
            Route::apiResource('tenants', TenantController::class);
            Route::get('tenants-dashboard', [TenantController::class, 'dashboard']);
            Route::apiResource('tenant-applications', TenantApplicationController::class)->only(['index', 'show']);
            Route::post('tenant-applications/{id}/approve', [TenantApplicationController::class, 'approve']);
            Route::post('tenant-applications/{id}/reject', [TenantApplicationController::class, 'reject']);

            // Subscriptions
            Route::apiResource('subscriptions', SubscriptionController::class)->only(['index', 'store', 'show']);
            Route::post('subscriptions/{id}/cancel', [SubscriptionController::class, 'cancel']);

            // User management (super admin only)
            Route::apiResource('users', UserController::class);

            // Settlements
            Route::get('all-settlements', [SettlementController::class, 'allSettlements']);
            Route::post('settlements/{id}/payment', [SettlementController::class, 'addPayment']);

            // Admin Settlements (enhanced)
            Route::prefix('settlements')->group(function () {
                Route::get('/', [\App\Http\Controllers\AdminSettlementController::class, 'index']);
                Route::get('stats', [\App\Http\Controllers\AdminSettlementController::class, 'stats']);
                Route::get('export', [\App\Http\Controllers\AdminSettlementController::class, 'export']);
                Route::get('{settlement}', [\App\Http\Controllers\AdminSettlementController::class, 'show']);
                Route::post('{settlement}/payment', [\App\Http\Controllers\AdminSettlementController::class, 'recordPayment']);
            });

            // Platform Settings / Branding
            Route::prefix('settings')->group(function () {
                Route::get('/', [PlatformSettingController::class, 'index']);
                Route::post('/', [PlatformSettingController::class, 'update']);
            });

            // Contact Enquiries (super admin)
            Route::prefix('enquiries')->group(function () {
                Route::get('/', [\App\Http\Controllers\EnquiryController::class, 'index']);
                Route::get('{enquiry}', [\App\Http\Controllers\EnquiryController::class, 'show']);
                Route::patch('{enquiry}/read', [\App\Http\Controllers\EnquiryController::class, 'markRead']);
                Route::patch('{enquiry}/status', [\App\Http\Controllers\EnquiryController::class, 'updateStatus']);
                Route::post('{enquiry}/reply', [\App\Http\Controllers\EnquiryController::class, 'reply']);
                Route::delete('{enquiry}', [\App\Http\Controllers\EnquiryController::class, 'destroy']);
            });

            // Advanced Tenant Management
            Route::get('tenants/{id}/stats', [TenantController::class, 'stats']);
            Route::post('tenants/{id}/impersonate', [TenantController::class, 'impersonate']);
            Route::post('tenants/{id}/send-email', [TenantController::class, 'sendEmail']);
            Route::post('tenants/bulk-action', [TenantController::class, 'bulkAction']);
            Route::get('tenants/export', [TenantController::class, 'export']);

            // Advanced Subscription Management
            Route::get('subscriptions/expiring-soon', [SubscriptionController::class, 'expiringSoon']);
            Route::post('subscriptions/{id}/extend', [SubscriptionController::class, 'extend']);
            Route::post('subscriptions/{tenantId}/renew', [SubscriptionController::class, 'renewManual']);

            // Subscription Plans
            Route::apiResource('plans', PlanController::class);
            Route::patch('plans/{id}/toggle', [PlanController::class, 'toggle']);

            // Plan Modules Management
            Route::prefix('plans/{planId}/modules')->group(function () {
                Route::get('/', [ModuleController::class, 'getPlanModules']);
                Route::post('sync', [ModuleController::class, 'syncPlanModules']);
            });

            // Module Registry Management
            Route::prefix('modules')->group(function () {
                Route::get('/', [ModuleController::class, 'index']);
                Route::patch('{key}/toggle', [ModuleController::class, 'toggle']);
            });

            // Tenant Module Overrides (per-tenant grants and revokes)
            Route::prefix('tenants/{tenantId}/modules')->group(function () {
                Route::get('/', [TenantModuleController::class, 'getTenantModuleMatrix']);
                Route::post('grant', [TenantModuleController::class, 'grantModule']);
                Route::post('revoke', [TenantModuleController::class, 'revokeModule']);
                Route::delete('{moduleKey}', [TenantModuleController::class, 'removeOverride']);
            });

            // Announcements
            Route::apiResource('announcements', AnnouncementController::class);
            Route::post('announcements/{id}/send', [AnnouncementController::class, 'send']);

            // System Management
            Route::prefix('system')->group(function () {
                Route::get('health', [SystemController::class, 'health']);
                Route::get('info', [SystemController::class, 'info']);
                Route::get('queue-stats', [SystemController::class, 'queueStats']);
                Route::post('retry-failed-jobs', [SystemController::class, 'retryFailedJobs']);
                Route::post('clear-cache', [SystemController::class, 'clearCache']);
                Route::post('storage-link', [SystemController::class, 'storageLink']);
                Route::get('logs', [SystemController::class, 'logs']);
            });

            // Audit Logs
            Route::prefix('audit-logs')->group(function () {
                Route::get('/', [AuditLogController::class, 'index']);
                Route::get('actions', [AuditLogController::class, 'actions']);
                Route::get('stats', [AuditLogController::class, 'stats']);
                Route::get('export', [AuditLogController::class, 'export']);
                Route::get('{id}', [AuditLogController::class, 'show']);
            });
        });

        // Active Announcements (for tenant dashboard)
        Route::get('announcements/active', [AnnouncementController::class, 'active']);
        Route::post('announcements/{id}/read', [AnnouncementController::class, 'markAsRead']);
    });
};

// Register v1 routes at root /api/ (backward compatible) and /api/v1/ (versioned)
$v1Routes();
Route::prefix('v1')->as('v1.')->group($v1Routes);
