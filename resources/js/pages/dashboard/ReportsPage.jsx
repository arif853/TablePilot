import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportAPI } from '../../services/api';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import SentimentDashboard from '../../components/ai/SentimentDashboard';

export default function ReportsPage() {
    const [tab, setTab] = useState('sales');
    const [from, setFrom] = useState(new Date(new Date().setDate(1)).toISOString().split('T')[0]);
    const [to, setTo] = useState(new Date().toISOString().split('T')[0]);
    const [vatDate, setVatDate] = useState(new Date().toISOString().split('T')[0]);

    const { data: salesData, isLoading: salesLoading } = useQuery({
        queryKey: ['report-sales', from, to],
        queryFn: () => reportAPI.sales({ from, to }).then((r) => r.data.data),
        enabled: tab === 'sales',
    });

    const { data: tableData, isLoading: tableLoading } = useQuery({
        queryKey: ['report-tables', from, to],
        queryFn: () => reportAPI.tables({ from, to }).then((r) => r.data.data),
        enabled: tab === 'tables',
    });

    const { data: voucherData, isLoading: voucherLoading } = useQuery({
        queryKey: ['report-vouchers', from, to],
        queryFn: () => reportAPI.vouchers({ from, to }).then((r) => r.data.data),
        enabled: tab === 'vouchers',
    });

    const { data: compareData, isLoading: compareLoading } = useQuery({
        queryKey: ['report-comparison'],
        queryFn: () => reportAPI.revenueComparison().then((r) => r.data.data),
        enabled: tab === 'comparison',
    });

    const { data: vatDailyData, isLoading: vatDailyLoading } = useQuery({
        queryKey: ['report-vat-daily', vatDate],
        queryFn: () => reportAPI.vatDaily({ date: vatDate }).then((r) => r.data.data),
        enabled: tab === 'vat',
    });

    const { data: vatMonthlyData, isLoading: vatMonthlyLoading } = useQuery({
        queryKey: ['report-vat-monthly', from, to],
        queryFn: () => reportAPI.vatMonthly({ from, to }).then((r) => r.data.data),
        enabled: tab === 'vat',
    });

    const tabs = [
        { key: 'sales', label: 'Sales' },
        { key: 'tables', label: 'Table Performance' },
        { key: 'vouchers', label: 'Vouchers' },
        { key: 'vat', label: 'VAT Report' },
        { key: 'comparison', label: 'Yearly Comparison' },
        { key: 'sentiment', label: 'Sentiment' },
    ];

    return (
        <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-6">Reports</h2>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
                {tabs.map((t) => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${tab === t.key ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Date Range — for sales, tables, vouchers, vat monthly */}
            {!['comparison', 'vat', 'sentiment'].includes(tab) && (
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-6">
                    <div>
                        <label className="label">From</label>
                        <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
                    </div>
                    <div>
                        <label className="label">To</label>
                        <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
                    </div>
                </div>
            )}

            {/* Sales Report */}
            {tab === 'sales' && (
                salesLoading ? <LoadingSpinner /> : salesData && (
                    <div>
                        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 mb-6">
                            <div className="card"><p className="text-xs sm:text-sm text-gray-500">Total Sales</p><p className="text-lg sm:text-2xl font-bold text-green-600">৳{salesData.summary.total_sales}</p></div>
                            <div className="card"><p className="text-xs sm:text-sm text-gray-500">Total Orders</p><p className="text-lg sm:text-2xl font-bold">{salesData.summary.total_orders}</p></div>
                            <div className="card"><p className="text-xs sm:text-sm text-gray-500">Avg Order</p><p className="text-lg sm:text-2xl font-bold">৳{salesData.summary.avg_order_value}</p></div>
                            <div className="card"><p className="text-xs sm:text-sm text-gray-500">VAT Collected</p><p className="text-lg sm:text-2xl font-bold">৳{salesData.summary.total_vat ?? salesData.summary.total_tax ?? 0}</p></div>
                        </div>
                        <div className="card">
                            <h3 className="font-semibold mb-4">Daily Breakdown</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead><tr className="text-left border-b"><th className="pb-2">Date</th><th className="pb-2">Orders</th><th className="pb-2">Revenue</th><th className="pb-2">VAT</th><th className="pb-2">Discounts</th></tr></thead>
                                    <tbody>
                                        {salesData.daily_breakdown?.map((d) => (
                                            <tr key={d.date} className="border-b last:border-0">
                                                <td className="py-2">{d.date}</td><td>{d.orders}</td><td>৳{d.revenue}</td><td>৳{d.vat ?? d.tax ?? 0}</td><td>৳{d.discounts}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )
            )}

            {/* Table Performance */}
            {tab === 'tables' && (
                tableLoading ? <LoadingSpinner /> : (
                    <div className="card">
                        <h3 className="font-semibold mb-4">Revenue by Table</h3>
                        <table className="w-full text-sm">
                            <thead><tr className="text-left border-b"><th className="pb-2">Table</th><th className="pb-2">Orders</th><th className="pb-2">Revenue</th><th className="pb-2">Avg</th></tr></thead>
                            <tbody>
                                {tableData?.map((t) => (
                                    <tr key={t.table_id} className="border-b last:border-0">
                                        <td className="py-2 font-medium">{t.table?.table_number}</td><td>{t.total_orders}</td><td>৳{t.total_revenue}</td><td>৳{Math.round(t.avg_order_value)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )
            )}

            {/* Voucher Report */}
            {tab === 'vouchers' && (
                voucherLoading ? <LoadingSpinner /> : voucherData && (
                    <div>
                        <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
                            <div className="card"><p className="text-xs sm:text-sm text-gray-500">Total Discount Given</p><p className="text-lg sm:text-2xl font-bold text-red-600">৳{voucherData.total_discount_given}</p></div>
                            <div className="card"><p className="text-xs sm:text-sm text-gray-500">Orders with Voucher</p><p className="text-lg sm:text-2xl font-bold">{voucherData.total_orders_with_voucher}</p></div>
                        </div>
                        <div className="card">
                            <h3 className="font-semibold mb-4">Voucher Breakdown</h3>
                            <table className="w-full text-sm">
                                <thead><tr className="text-left border-b"><th className="pb-2">Code</th><th className="pb-2">Used</th><th className="pb-2">Discount</th><th className="pb-2">Revenue</th></tr></thead>
                                <tbody>
                                    {voucherData.voucher_breakdown?.map((v) => (
                                        <tr key={v.voucher_id} className="border-b last:border-0">
                                            <td className="py-2 font-mono">{v.voucher?.code}</td><td>{v.times_used}</td><td>৳{v.total_discount}</td><td>৳{v.total_revenue}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            )}

            {/* VAT Report */}
            {tab === 'vat' && (
                <div className="space-y-6">
                    {/* ── Daily Z Report ──────────────────────────────────────── */}
                    <div>
                        <h3 className="font-semibold text-gray-800 mb-3">Daily Z Report</h3>
                        <div className="flex gap-3 mb-4">
                            <div>
                                <label className="label">Date</label>
                                <input type="date" className="input" value={vatDate} onChange={(e) => setVatDate(e.target.value)} />
                            </div>
                        </div>
                        {vatDailyLoading ? <LoadingSpinner /> : vatDailyData && (
                            <div>
                                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 mb-4">
                                    <div className="card"><p className="text-xs text-gray-500">Total Orders</p><p className="text-xl font-bold">{vatDailyData.summary?.total_orders ?? 0}</p></div>
                                    <div className="card"><p className="text-xs text-gray-500">Total Sales</p><p className="text-xl font-bold text-green-600">৳{parseFloat(vatDailyData.summary?.total_sales ?? 0).toFixed(2)}</p></div>
                                    <div className="card"><p className="text-xs text-gray-500">Net Amount</p><p className="text-xl font-bold">৳{parseFloat(vatDailyData.summary?.total_net ?? 0).toFixed(2)}</p></div>
                                    <div className="card"><p className="text-xs text-gray-500">VAT Collected</p><p className="text-xl font-bold text-brand-700">৳{parseFloat(vatDailyData.summary?.total_vat ?? 0).toFixed(2)}</p></div>
                                </div>
                                {vatDailyData.by_payment_method?.length > 0 && (
                                    <div className="card mb-4">
                                        <h4 className="font-medium text-sm mb-3 text-gray-700">By Payment Method</h4>
                                        <table className="w-full text-sm">
                                            <thead><tr className="text-left border-b"><th className="pb-2">Method</th><th className="pb-2 text-right">Orders</th><th className="pb-2 text-right">Sales</th><th className="pb-2 text-right">VAT</th></tr></thead>
                                            <tbody>
                                                {vatDailyData.by_payment_method.map((m) => (
                                                    <tr key={m.payment_method} className="border-b last:border-0">
                                                        <td className="py-2 capitalize">{m.payment_method === 'mobile_banking' ? 'Mobile Banking' : m.payment_method}</td>
                                                        <td className="text-right">{m.orders}</td>
                                                        <td className="text-right">৳{parseFloat(m.sales).toFixed(2)}</td>
                                                        <td className="text-right">৳{parseFloat(m.vat).toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                                {vatDailyData.by_order_type?.length > 0 && (
                                    <div className="card">
                                        <h4 className="font-medium text-sm mb-3 text-gray-700">By Order Type</h4>
                                        <table className="w-full text-sm">
                                            <thead><tr className="text-left border-b"><th className="pb-2">Type</th><th className="pb-2 text-right">Orders</th><th className="pb-2 text-right">Sales</th><th className="pb-2 text-right">VAT</th></tr></thead>
                                            <tbody>
                                                {vatDailyData.by_order_type.map((t) => (
                                                    <tr key={t.type} className="border-b last:border-0">
                                                        <td className="py-2 capitalize">{t.type === 'dine' ? 'Dine-In' : t.type === 'parcel' ? 'Takeaway' : t.type}</td>
                                                        <td className="text-right">{t.orders}</td>
                                                        <td className="text-right">৳{parseFloat(t.sales).toFixed(2)}</td>
                                                        <td className="text-right">৳{parseFloat(t.vat).toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── Monthly VAT Report ──────────────────────────────────── */}
                    <div>
                        <h3 className="font-semibold text-gray-800 mb-3">Monthly VAT Report</h3>
                        <div className="flex flex-col sm:flex-row gap-3 mb-4">
                            <div>
                                <label className="label">From</label>
                                <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
                            </div>
                            <div>
                                <label className="label">To</label>
                                <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
                            </div>
                        </div>
                        {vatMonthlyLoading ? <LoadingSpinner /> : vatMonthlyData && (
                            <div>
                                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 mb-4">
                                    <div className="card"><p className="text-xs text-gray-500">Total Orders</p><p className="text-xl font-bold">{vatMonthlyData.summary?.total_orders ?? 0}</p></div>
                                    <div className="card"><p className="text-xs text-gray-500">Total Sales</p><p className="text-xl font-bold text-green-600">৳{parseFloat(vatMonthlyData.summary?.total_sales ?? 0).toFixed(2)}</p></div>
                                    <div className="card"><p className="text-xs text-gray-500">Total Net</p><p className="text-xl font-bold">৳{parseFloat(vatMonthlyData.summary?.total_net ?? 0).toFixed(2)}</p></div>
                                    <div className="card"><p className="text-xs text-gray-500">Total VAT</p><p className="text-xl font-bold text-brand-700">৳{parseFloat(vatMonthlyData.summary?.total_vat ?? 0).toFixed(2)}</p></div>
                                </div>
                                {vatMonthlyData.daily_breakdown?.length > 0 && (
                                    <div className="card mb-4">
                                        <h4 className="font-medium text-sm mb-3 text-gray-700">Daily Breakdown</h4>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead><tr className="text-left border-b"><th className="pb-2">Date</th><th className="pb-2 text-right">Orders</th><th className="pb-2 text-right">Sales</th><th className="pb-2 text-right">Net</th><th className="pb-2 text-right">VAT</th><th className="pb-2 text-right">Discount</th></tr></thead>
                                                <tbody>
                                                    {vatMonthlyData.daily_breakdown.map((d) => (
                                                        <tr key={d.date} className="border-b last:border-0">
                                                            <td className="py-2">{d.date}</td>
                                                            <td className="text-right">{d.orders}</td>
                                                            <td className="text-right">৳{parseFloat(d.sales).toFixed(2)}</td>
                                                            <td className="text-right">৳{parseFloat(d.net).toFixed(2)}</td>
                                                            <td className="text-right">৳{parseFloat(d.vat).toFixed(2)}</td>
                                                            <td className="text-right">৳{parseFloat(d.discount).toFixed(2)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                                {vatMonthlyData.by_vat_rate?.length > 0 && (
                                    <div className="card">
                                        <h4 className="font-medium text-sm mb-3 text-gray-700">By VAT Rate</h4>
                                        <table className="w-full text-sm">
                                            <thead><tr className="text-left border-b"><th className="pb-2">Rate</th><th className="pb-2 text-right">Orders</th><th className="pb-2 text-right">Net</th><th className="pb-2 text-right">VAT</th><th className="pb-2 text-right">Total</th></tr></thead>
                                            <tbody>
                                                {vatMonthlyData.by_vat_rate.map((r) => (
                                                    <tr key={r.vat_rate} className="border-b last:border-0">
                                                        <td className="py-2">{r.vat_rate}%</td>
                                                        <td className="text-right">{r.orders}</td>
                                                        <td className="text-right">৳{parseFloat(r.net).toFixed(2)}</td>
                                                        <td className="text-right">৳{parseFloat(r.vat).toFixed(2)}</td>
                                                        <td className="text-right">৳{parseFloat(r.total).toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Revenue Comparison */}
            {tab === 'comparison' && (
                compareLoading ? <LoadingSpinner /> : compareData && (
                    <div className="card">
                        <h3 className="font-semibold mb-4">Monthly Revenue Comparison</h3>
                        <table className="w-full text-sm">
                            <thead><tr className="text-left border-b"><th className="pb-2">Month</th><th className="pb-2">{compareData.current_year.year}</th><th className="pb-2">{compareData.last_year.year}</th></tr></thead>
                            <tbody>
                                {[...Array(12)].map((_, i) => {
                                    const m = i + 1;
                                    const cur = compareData.current_year.months[m];
                                    const prev = compareData.last_year.months[m];
                                    return (
                                        <tr key={m} className="border-b last:border-0">
                                            <td className="py-2">{new Date(2000, i).toLocaleString('default', { month: 'long' })}</td>
                                            <td>৳{cur?.revenue || 0}</td>
                                            <td>৳{prev?.revenue || 0}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )
            )}

            {/* Sentiment Analysis */}
            {tab === 'sentiment' && (
                <SentimentDashboard />
            )}
        </div>
    );
}
