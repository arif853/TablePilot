<?php

namespace Database\Seeders;

use App\Models\Module;
use Illuminate\Database\Seeder;

class ModuleSeeder extends Seeder
{
    /**
     * Run the database seeds.
     * Seeds the complete module registry with all 21 modules.
     */
    public function run(): void
    {
        $modules = [
            // Group: Core (Always Available — Cannot Be Disabled)
            [
                'key' => 'menu_management',
                'label' => 'Menu Management',
                'description' => 'Categories and menu items CRUD',
                'group' => 'core',
                'is_core' => true,
                'is_active' => true,
                'sort_order' => 1,
            ],
            [
                'key' => 'order_management',
                'label' => 'Order Management',
                'description' => 'View and manage dashboard orders',
                'group' => 'core',
                'is_core' => true,
                'is_active' => true,
                'sort_order' => 2,
            ],
            [
                'key' => 'table_management',
                'label' => 'Table Management',
                'description' => 'Tables, QR codes, transfers',
                'group' => 'core',
                'is_core' => true,
                'is_active' => true,
                'sort_order' => 3,
            ],

            // Group: Operations
            [
                'key' => 'kitchen_display',
                'label' => 'Kitchen Display System',
                'description' => 'Real-time kitchen order queue screen',
                'group' => 'operations',
                'is_core' => false,
                'is_active' => true,
                'sort_order' => 1,
            ],
            [
                'key' => 'pos',
                'label' => 'Point of Sale (POS)',
                'description' => 'Counter-based quick order entry',
                'group' => 'operations',
                'is_core' => false,
                'is_active' => true,
                'sort_order' => 2,
            ],
            [
                'key' => 'voucher_system',
                'label' => 'Voucher System',
                'description' => 'Discount vouchers and promotional codes',
                'group' => 'operations',
                'is_core' => false,
                'is_active' => true,
                'sort_order' => 3,
            ],
            [
                'key' => 'wifi_enforcement',
                'label' => 'WiFi Enforcement',
                'description' => 'Restrict customer ordering to specific IP',
                'group' => 'operations',
                'is_core' => false,
                'is_active' => true,
                'sort_order' => 4,
            ],

            // Group: Finance
            [
                'key' => 'reports_analytics',
                'label' => 'Reports & Analytics',
                'description' => 'Sales, trends, top items, table performance',
                'group' => 'finance',
                'is_core' => false,
                'is_active' => true,
                'sort_order' => 1,
            ],
            [
                'key' => 'vat_reports',
                'label' => 'VAT Reports',
                'description' => 'Daily and monthly VAT/tax reports',
                'group' => 'finance',
                'is_core' => false,
                'is_active' => true,
                'sort_order' => 2,
            ],
            [
                'key' => 'settlement_management',
                'label' => 'Settlement Management',
                'description' => 'Commission and settlement tracking',
                'group' => 'finance',
                'is_core' => false,
                'is_active' => true,
                'sort_order' => 3,
            ],
            [
                'key' => 'online_payment_sslcommerz',
                'label' => 'SSLCommerz Payments',
                'description' => 'Online payment via SSLCommerz gateway',
                'group' => 'finance',
                'is_core' => false,
                'is_active' => true,
                'sort_order' => 4,
            ],
            [
                'key' => 'online_payment_bkash',
                'label' => 'bKash Payments',
                'description' => 'Online payment via bKash gateway',
                'group' => 'finance',
                'is_core' => false,
                'is_active' => true,
                'sort_order' => 5,
            ],

            // Group: AI Features
            [
                'key' => 'ai_analytics_assistant',
                'label' => 'AI Analytics Assistant',
                'description' => 'Natural language business Q&A',
                'group' => 'ai_features',
                'is_core' => false,
                'is_active' => true,
                'sort_order' => 1,
            ],
            [
                'key' => 'ai_sales_forecast',
                'label' => 'AI Sales Forecast',
                'description' => 'Statistical + AI sales predictions',
                'group' => 'ai_features',
                'is_core' => false,
                'is_active' => true,
                'sort_order' => 2,
            ],
            [
                'key' => 'ai_recommendations',
                'label' => 'AI Recommendations',
                'description' => 'Menu recommendation engine (customer-facing)',
                'group' => 'ai_features',
                'is_core' => false,
                'is_active' => true,
                'sort_order' => 3,
            ],
            [
                'key' => 'ai_customer_chatbot',
                'label' => 'AI Customer Chatbot',
                'description' => 'Customer-facing AI assistant',
                'group' => 'ai_features',
                'is_core' => false,
                'is_active' => true,
                'sort_order' => 4,
            ],
            [
                'key' => 'ai_menu_description',
                'label' => 'AI Menu Description',
                'description' => 'AI-generated menu item descriptions',
                'group' => 'ai_features',
                'is_core' => false,
                'is_active' => true,
                'sort_order' => 5,
            ],
            [
                'key' => 'ai_sentiment_analysis',
                'label' => 'AI Sentiment Analysis',
                'description' => 'Feedback sentiment scoring and trends',
                'group' => 'ai_features',
                'is_core' => false,
                'is_active' => true,
                'sort_order' => 6,
            ],

            // Group: Customization
            [
                'key' => 'branding',
                'label' => 'Branding & White-label',
                'description' => 'Custom logo, colors, banner, favicon',
                'group' => 'customization',
                'is_core' => false,
                'is_active' => true,
                'sort_order' => 1,
            ],
            [
                'key' => 'user_management',
                'label' => 'User Management',
                'description' => 'Create and manage staff/kitchen users',
                'group' => 'customization',
                'is_core' => false,
                'is_active' => true,
                'sort_order' => 2,
            ],
            [
                'key' => 'announcements_inbox',
                'label' => 'Announcements Inbox',
                'description' => 'Receive super admin announcements',
                'group' => 'customization',
                'is_core' => false,
                'is_active' => true,
                'sort_order' => 3,
            ],
        ];

        foreach ($modules as $module) {
            Module::firstOrCreate(['key' => $module['key']], $module);
        }
    }
}
