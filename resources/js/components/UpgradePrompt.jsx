import React from 'react';
import { Link } from 'react-router-dom';

const moduleMeta = {
    kitchen_display: {
        title: 'Kitchen Display System',
        description: 'Real-time kitchen order queue screen for better order flow.',
    },
    pos: {
        title: 'Point of Sale (POS)',
        description: 'Counter-based quick order entry for on-site staff.',
    },
    voucher_system: {
        title: 'Voucher System',
        description: 'Discount vouchers and promotional codes for growth.',
    },
    reports_analytics: {
        title: 'Reports & Analytics',
        description: 'Sales insights, trends, top items, and table performance.',
    },
    vat_reports: {
        title: 'VAT Reports',
        description: 'Daily and monthly VAT and tax reporting capabilities.',
    },
    settlement_management: {
        title: 'Settlement Management',
        description: 'Commission and settlement tracking across operations.',
    },
    ai_analytics_assistant: {
        title: 'AI Analytics Assistant',
        description: 'Ask natural-language business questions and get insights.',
    },
    ai_sales_forecast: {
        title: 'AI Sales Forecast',
        description: 'Forecast sales trends using historical and AI signals.',
    },
    ai_recommendations: {
        title: 'AI Recommendations',
        description: 'Deliver smarter menu recommendations to customers.',
    },
    ai_customer_chatbot: {
        title: 'AI Customer Chatbot',
        description: 'Offer customer-facing AI help in ordering journeys.',
    },
    ai_menu_description: {
        title: 'AI Menu Description',
        description: 'Generate high-quality menu descriptions automatically.',
    },
    ai_sentiment_analysis: {
        title: 'AI Sentiment Analysis',
        description: 'Measure and monitor customer sentiment from feedback.',
    },
    branding: {
        title: 'Branding & White-label',
        description: 'Customize logo, colors, favicon, and visual identity.',
    },
    user_management: {
        title: 'User Management',
        description: 'Create and manage staff and kitchen team users.',
    },
};

export function UpgradePrompt({ module }) {
    const info = moduleMeta[module] || {
        title: 'Premium Feature',
        description: 'This feature is not included in your current plan.',
    };

    return (
        <div className="min-h-[50vh] flex items-center justify-center p-6">
            <div className="w-full max-w-2xl rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-slate-50 shadow-lg">
                <div className="p-8">
                    <div className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-orange-200">
                        Module Locked
                    </div>

                    <h2 className="mt-4 text-2xl font-bold text-slate-900">{info.title}</h2>
                    <p className="mt-2 text-slate-600">{info.description}</p>

                    <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
                        <p className="text-sm text-slate-700">
                            This feature is not included in your current plan.
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                            Contact support to upgrade your plan and unlock this module.
                        </p>
                    </div>

                    <div className="mt-6 flex flex-wrap items-center gap-3">
                        <Link
                            to="/dashboard/settings?tab=subscription"
                            className="inline-flex items-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
                        >
                            View Plan Options
                        </Link>
                        <Link
                            to="/contact"
                            className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                            Contact Support
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
