import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HiOutlineDownload } from 'react-icons/hi';
import { reportAPI } from '../../services/api';
import { useModule } from '../../hooks/useModule';
import { downloadCsv } from '../../utils/download';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import SentimentDashboard from '../../components/ai/SentimentDashboard';
import FinancialReport from '../../components/reports/FinancialReport';

// Local-time Y-m-d (toISOString() would shift to UTC and can return yesterday).
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const PRESETS = [
    { key: 'today', label: 'Today', range: (t) => [t, t] },
    { key: 'yesterday', label: 'Yesterday', range: (t) => { const y = new Date(t); y.setDate(t.getDate() - 1); return [y, y]; } },
    { key: '7d', label: 'Last 7 days', range: (t) => { const f = new Date(t); f.setDate(t.getDate() - 6); return [f, t]; } },
    { key: 'month', label: 'This month', range: (t) => [new Date(t.getFullYear(), t.getMonth(), 1), t] },
    { key: 'last_month', label: 'Last month', range: (t) => [new Date(t.getFullYear(), t.getMonth() - 1, 1), new Date(t.getFullYear(), t.getMonth(), 0)] },
    { key: 'quarter', label: 'This quarter', range: (t) => [new Date(t.getFullYear(), Math.floor(t.getMonth() / 3) * 3, 1), t] },
    { key: 'year', label: 'This year', range: (t) => [new Date(t.getFullYear(), 0, 1), t] },
];

const presetRange = (key) => {
    const [f, t] = PRESETS.find((p) => p.key === key).range(new Date());
    return [ymd(f), ymd(t)];
};

const money = (v) => `৳${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fixed = (v) => Number(v || 0).toFixed(2);
const PAYMENT_LABELS = { mobile_banking: 'Mobile Banking', bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket', split: 'Split' };
const TYPE_LABELS = { dine: 'Dine-in', parcel: 'Takeaway', quick: 'Quick Sale', delivery: 'Delivery' };

function CsvButton({ onClick, label = 'Download CSV' }) {
    return (
        <button onClick={onClick} className="btn-secondary !py-1.5 !px-3 text-xs">
            <HiOutlineDownload className="w-4 h-4" /> {label}
        </button>
    );
}

function CardHeader({ title, onDownload }) {
    return (
        <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="section-title">{title}</h3>
            {onDownload && <CsvButton onClick={onDownload} />}
        </div>
    );
}

function Stat({ label, value, tone = 'text-gray-900' }) {
    return (
        <div className="card p-4 sm:p-5">
            <p className="text-xs sm:text-sm text-gray-500">{label}</p>
            <p className={`mt-1 text-lg sm:text-2xl font-bold tabular ${tone}`}>{value}</p>
        </div>
    );
}

export default function ReportsPage() {
    const hasVat = useModule('vat_reports');
    const [tab, setTab] = useState('financial');
    const [preset, setPreset] = useState('month');
    const [[from, to], setRange] = useState(() => presetRange('month'));
    const [vatDate, setVatDate] = useState(() => ymd(new Date()));

    const validRange = from && to && from <= to;
    const applyPreset = (key) => {
        setPreset(key);
        setRange(presetRange(key));
    };
    const setFrom = (v) => { setPreset('custom'); setRange([v, to]); };
    const setTo = (v) => { setPreset('custom'); setRange([from, v]); };
    const suffix = `${from}-to-${to}`;

    const { data: salesData, isLoading: salesLoading } = useQuery({
        queryKey: ['report-sales', from, to],
        queryFn: () => reportAPI.sales({ from, to }).then((r) => r.data.data),
        enabled: tab === 'sales' && validRange,
    });

    const { data: tableData, isLoading: tableLoading } = useQuery({
        queryKey: ['report-tables', from, to],
        queryFn: () => reportAPI.tables({ from, to }).then((r) => r.data.data),
        enabled: tab === 'tables' && validRange,
    });

    const { data: voucherData, isLoading: voucherLoading } = useQuery({
        queryKey: ['report-vouchers', from, to],
        queryFn: () => reportAPI.vouchers({ from, to }).then((r) => r.data.data),
        enabled: tab === 'vouchers' && validRange,
    });

    const { data: compareData, isLoading: compareLoading } = useQuery({
        queryKey: ['report-comparison'],
        queryFn: () => reportAPI.revenueComparison().then((r) => r.data.data),
        enabled: tab === 'comparison',
    });

    const { data: vatDailyData, isLoading: vatDailyLoading } = useQuery({
        queryKey: ['report-vat-daily', vatDate],
        queryFn: () => reportAPI.vatDaily({ date: vatDate }).then((r) => r.data.data),
        enabled: tab === 'vat' && hasVat && Boolean(vatDate),
    });

    const { data: vatMonthlyData, isLoading: vatMonthlyLoading } = useQuery({
        queryKey: ['report-vat-monthly', from, to],
        queryFn: () => reportAPI.vatMonthly({ from, to }).then((r) => r.data.data),
        enabled: tab === 'vat' && hasVat && validRange,
    });

    const tabs = [
        { key: 'financial', label: 'Financial Statement' },
        { key: 'sales', label: 'Sales' },
        { key: 'tables', label: 'Table Performance' },
        { key: 'vouchers', label: 'Vouchers' },
        ...(hasVat ? [{ key: 'vat', label: 'VAT Report' }] : []),
        { key: 'comparison', label: 'Yearly Comparison' },
        { key: 'sentiment', label: 'Sentiment' },
    ];

    const showRange = !['comparison', 'sentiment'].includes(tab);

    return (
        <div>
            <div className="mb-6">
                <h2 className="page-title">Reports</h2>
                <p className="page-subtitle">Track revenue, tax, collections and cash, and download statements for your accountant.</p>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-5 overflow-x-auto pb-1 scrollbar-hide">
                {tabs.map((t) => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${tab === t.key ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Shared date range */}
            {showRange && (
                <div className="flex flex-col xl:flex-row xl:items-end gap-3 mb-6">
                    <div className="flex flex-wrap gap-1.5">
                        {PRESETS.map((p) => (
                            <button key={p.key} onClick={() => applyPreset(p.key)}
                                className={`px-3 py-1.5 rounded-full text-xs font-medium ring-1 ring-inset transition-colors ${preset === p.key ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-white text-gray-600 ring-gray-200 hover:bg-gray-50'}`}>
                                {p.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-3 xl:ml-auto">
                        <div>
                            <label className="label">From</label>
                            <input type="date" className="input" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
                        </div>
                        <div>
                            <label className="label">To</label>
                            <input type="date" className="input" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
                        </div>
                    </div>
                </div>
            )}

            {showRange && !validRange && (
                <div className="card text-sm text-red-600 mb-6">The start date must be on or before the end date.</div>
            )}

            {/* Financial statement */}
            {tab === 'financial' && validRange && <FinancialReport from={from} to={to} />}

            {/* Sales Report */}
            {tab === 'sales' && validRange && (
                salesLoading ? <LoadingSpinner /> : salesData && (
                    <div>
                        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 mb-6">
                            <Stat label="Total Sales" value={money(salesData.summary.total_sales)} tone="text-emerald-700" />
                            <Stat label="Total Orders" value={salesData.summary.total_orders} />
                            <Stat label="Avg Order" value={money(salesData.summary.avg_order_value)} />
                            <Stat label="VAT Collected" value={money(salesData.summary.total_vat)} />
                        </div>
                        <div className="card">
                            <CardHeader title="Daily Breakdown" onDownload={() => downloadCsv(`sales-${suffix}.csv`, [
                                ['Date', 'Orders', 'Revenue', 'Net amount', 'VAT', 'Discounts'],
                                ...(salesData.daily_breakdown || []).map((d) => [d.date, d.orders, fixed(d.revenue), fixed(d.net_amount), fixed(d.vat), fixed(d.discounts)]),
                                ['Total', salesData.summary.total_orders, fixed(salesData.summary.total_sales), fixed(salesData.summary.total_net_amount), fixed(salesData.summary.total_vat), fixed(salesData.summary.total_discount)],
                            ])} />
                            <div className="overflow-x-auto">
                                <table className="data-table">
                                    <thead><tr><th className="pb-2">Date</th><th className="pb-2 !text-right">Orders</th><th className="pb-2 !text-right">Revenue</th><th className="pb-2 !text-right">VAT</th><th className="pb-2 !text-right">Discounts</th></tr></thead>
                                    <tbody>
                                        {salesData.daily_breakdown?.map((d) => (
                                            <tr key={d.date}>
                                                <td className="py-2">{d.date}</td>
                                                <td className="text-right tabular">{d.orders}</td>
                                                <td className="text-right tabular">{money(d.revenue)}</td>
                                                <td className="text-right tabular">{money(d.vat)}</td>
                                                <td className="text-right tabular">{money(d.discounts)}</td>
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
            {tab === 'tables' && validRange && (
                tableLoading ? <LoadingSpinner /> : (
                    <div className="card">
                        <CardHeader title="Revenue by Table" onDownload={tableData?.length ? () => downloadCsv(`table-performance-${suffix}.csv`, [
                            ['Table', 'Orders', 'Revenue', 'Avg order'],
                            ...tableData.map((t) => [t.table?.table_number, t.total_orders, fixed(t.total_revenue), fixed(t.avg_order_value)]),
                        ]) : null} />
                        <div className="overflow-x-auto">
                            <table className="data-table">
                                <thead><tr><th className="pb-2">Table</th><th className="pb-2 !text-right">Orders</th><th className="pb-2 !text-right">Revenue</th><th className="pb-2 !text-right">Avg</th></tr></thead>
                                <tbody>
                                    {tableData?.map((t) => (
                                        <tr key={t.table_id}>
                                            <td className="py-2 font-medium">{t.table?.table_number}</td>
                                            <td className="text-right tabular">{t.total_orders}</td>
                                            <td className="text-right tabular">{money(t.total_revenue)}</td>
                                            <td className="text-right tabular">{money(t.avg_order_value)}</td>
                                        </tr>
                                    ))}
                                    {!tableData?.length && <tr><td colSpan={4} className="py-6 text-center text-gray-400">No dine-in sales in this period.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            )}

            {/* Voucher Report */}
            {tab === 'vouchers' && validRange && (
                voucherLoading ? <LoadingSpinner /> : voucherData && (
                    <div>
                        <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
                            <Stat label="Total Discount Given" value={money(voucherData.total_discount_given)} tone="text-red-600" />
                            <Stat label="Orders with Voucher" value={voucherData.total_orders_with_voucher} />
                        </div>
                        <div className="card">
                            <CardHeader title="Voucher Breakdown" onDownload={voucherData.voucher_breakdown?.length ? () => downloadCsv(`vouchers-${suffix}.csv`, [
                                ['Code', 'Times used', 'Discount given', 'Revenue'],
                                ...voucherData.voucher_breakdown.map((v) => [v.voucher?.code, v.times_used, fixed(v.total_discount), fixed(v.total_revenue)]),
                            ]) : null} />
                            <div className="overflow-x-auto">
                                <table className="data-table">
                                    <thead><tr><th className="pb-2">Code</th><th className="pb-2 !text-right">Used</th><th className="pb-2 !text-right">Discount</th><th className="pb-2 !text-right">Revenue</th></tr></thead>
                                    <tbody>
                                        {voucherData.voucher_breakdown?.map((v) => (
                                            <tr key={v.voucher_id}>
                                                <td className="py-2 font-mono">{v.voucher?.code}</td>
                                                <td className="text-right tabular">{v.times_used}</td>
                                                <td className="text-right tabular">{money(v.total_discount)}</td>
                                                <td className="text-right tabular">{money(v.total_revenue)}</td>
                                            </tr>
                                        ))}
                                        {!voucherData.voucher_breakdown?.length && <tr><td colSpan={4} className="py-6 text-center text-gray-400">No vouchers used in this period.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )
            )}

            {/* VAT Report */}
            {tab === 'vat' && hasVat && (
                <div className="space-y-8">
                    {/* ── Monthly VAT Report (uses the shared range) ──────────── */}
                    {validRange && (
                        <div>
                            <h3 className="section-title mb-3">VAT Return Summary</h3>
                            {vatMonthlyLoading ? <LoadingSpinner /> : vatMonthlyData && (
                                <div>
                                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 mb-4">
                                        <Stat label="Invoices" value={vatMonthlyData.summary.total_invoices} />
                                        <Stat label="Total Sales" value={money(vatMonthlyData.summary.total_sales)} tone="text-emerald-700" />
                                        <Stat label="Taxable Sales" value={money(vatMonthlyData.summary.total_taxable_sales)} />
                                        <Stat label="VAT Collected" value={money(vatMonthlyData.summary.total_vat_collected)} tone="text-brand-700" />
                                        <Stat label="SD Collected" value={money(vatMonthlyData.summary.total_sd_collected)} />
                                    </div>
                                    <div className="card mb-4">
                                        <CardHeader title="Daily Breakdown" onDownload={() => downloadCsv(`vat-return-${suffix}.csv`, [
                                            ['Date', 'Invoices', 'Total sales', 'Taxable sales', 'VAT', 'Discount'],
                                            ...(vatMonthlyData.daily_breakdown || []).map((d) => [d.date, d.invoice_count, fixed(d.total_sales), fixed(d.taxable_sales), fixed(d.vat_collected), fixed(d.discounts)]),
                                            ['Total', vatMonthlyData.summary.total_invoices, vatMonthlyData.summary.total_sales, vatMonthlyData.summary.total_taxable_sales, vatMonthlyData.summary.total_vat_collected, vatMonthlyData.summary.total_discount],
                                            [],
                                            ['VAT rate %', 'Invoices', 'Taxable sales', 'VAT', 'Total'],
                                            ...(vatMonthlyData.by_vat_rate || []).map((r) => [r.vat_rate, r.invoice_count, fixed(r.taxable_sales), fixed(r.vat_collected), fixed(r.total_sales)]),
                                        ])} />
                                        <div className="overflow-x-auto">
                                            <table className="data-table">
                                                <thead><tr><th className="pb-2">Date</th><th className="pb-2 !text-right">Invoices</th><th className="pb-2 !text-right">Sales</th><th className="pb-2 !text-right">Taxable</th><th className="pb-2 !text-right">VAT</th><th className="pb-2 !text-right">Discount</th></tr></thead>
                                                <tbody>
                                                    {vatMonthlyData.daily_breakdown?.map((d) => (
                                                        <tr key={d.date}>
                                                            <td className="py-2">{d.date}</td>
                                                            <td className="text-right tabular">{d.invoice_count}</td>
                                                            <td className="text-right tabular">{money(d.total_sales)}</td>
                                                            <td className="text-right tabular">{money(d.taxable_sales)}</td>
                                                            <td className="text-right tabular">{money(d.vat_collected)}</td>
                                                            <td className="text-right tabular">{money(d.discounts)}</td>
                                                        </tr>
                                                    ))}
                                                    {!vatMonthlyData.daily_breakdown?.length && <tr><td colSpan={6} className="py-6 text-center text-gray-400">No invoices in this period.</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    {vatMonthlyData.by_vat_rate?.length > 0 && (
                                        <div className="card">
                                            <h4 className="section-title mb-3">By VAT Rate</h4>
                                            <div className="overflow-x-auto">
                                                <table className="data-table">
                                                    <thead><tr><th className="pb-2">Rate</th><th className="pb-2 !text-right">Invoices</th><th className="pb-2 !text-right">Taxable</th><th className="pb-2 !text-right">VAT</th><th className="pb-2 !text-right">Total</th></tr></thead>
                                                    <tbody>
                                                        {vatMonthlyData.by_vat_rate.map((r) => (
                                                            <tr key={r.vat_rate}>
                                                                <td className="py-2">{r.vat_rate}%</td>
                                                                <td className="text-right tabular">{r.invoice_count}</td>
                                                                <td className="text-right tabular">{money(r.taxable_sales)}</td>
                                                                <td className="text-right tabular">{money(r.vat_collected)}</td>
                                                                <td className="text-right tabular">{money(r.total_sales)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Daily Z Report ──────────────────────────────────────── */}
                    <div>
                        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-3">
                            <h3 className="section-title">Daily Z Report</h3>
                            <div className="flex items-end gap-2">
                                <div>
                                    <label className="label">Date</label>
                                    <input type="date" className="input" value={vatDate} onChange={(e) => setVatDate(e.target.value)} />
                                </div>
                                {vatDailyData && (
                                    <CsvButton label="CSV" onClick={() => downloadCsv(`z-report-${vatDate}.csv`, [
                                        ['Z Report', vatDate],
                                        ['Invoices', vatDailyData.summary.order_count],
                                        ['Subtotal', vatDailyData.summary.total_subtotal],
                                        ['Discount', vatDailyData.summary.total_discount],
                                        ['Net amount', vatDailyData.summary.total_net_amount],
                                        ['VAT collected', vatDailyData.summary.total_vat_collected],
                                        ['SD collected', vatDailyData.summary.total_sd_collected],
                                        ['Total sales', vatDailyData.summary.total_sales],
                                        [],
                                        ['Payment method', 'Invoices', 'Sales', 'VAT'],
                                        ...(vatDailyData.by_payment_method || []).map((m) => [PAYMENT_LABELS[m.payment_method] ?? m.payment_method, m.order_count, fixed(m.total_amount), fixed(m.vat_amount)]),
                                        [],
                                        ['Order type', 'Invoices', 'Sales', 'VAT'],
                                        ...(vatDailyData.by_order_type || []).map((t) => [TYPE_LABELS[t.type] ?? t.type, t.order_count, fixed(t.total_amount), fixed(t.vat_amount)]),
                                    ])} />
                                )}
                            </div>
                        </div>
                        {vatDailyLoading ? <LoadingSpinner /> : vatDailyData && (
                            <div>
                                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 mb-4">
                                    <Stat label="Invoices" value={vatDailyData.summary.order_count} />
                                    <Stat label="Total Sales" value={money(vatDailyData.summary.total_sales)} tone="text-emerald-700" />
                                    <Stat label="Net Amount" value={money(vatDailyData.summary.total_net_amount)} />
                                    <Stat label="VAT Collected" value={money(vatDailyData.summary.total_vat_collected)} tone="text-brand-700" />
                                </div>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    {[
                                        ['By Payment Method', vatDailyData.by_payment_method, 'payment_method', (k) => PAYMENT_LABELS[k] ?? k],
                                        ['By Order Type', vatDailyData.by_order_type, 'type', (k) => TYPE_LABELS[k] ?? k],
                                    ].map(([title, rows, keyField, label]) => (
                                        <div key={title} className="card">
                                            <h4 className="section-title mb-3">{title}</h4>
                                            <div className="overflow-x-auto">
                                                <table className="data-table">
                                                    <thead><tr><th className="pb-2" /><th className="pb-2 !text-right">Invoices</th><th className="pb-2 !text-right">Sales</th><th className="pb-2 !text-right">VAT</th></tr></thead>
                                                    <tbody>
                                                        {rows?.map((m) => (
                                                            <tr key={m[keyField]}>
                                                                <td className="py-2 capitalize">{label(m[keyField])}</td>
                                                                <td className="text-right tabular">{m.order_count}</td>
                                                                <td className="text-right tabular">{money(m.total_amount)}</td>
                                                                <td className="text-right tabular">{money(m.vat_amount)}</td>
                                                            </tr>
                                                        ))}
                                                        {!rows?.length && <tr><td colSpan={4} className="py-6 text-center text-gray-400">No invoices on this day.</td></tr>}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Revenue Comparison */}
            {tab === 'comparison' && (
                compareLoading ? <LoadingSpinner /> : compareData && (() => {
                    const rows = [...Array(12)].map((_, i) => {
                        const cur = compareData.current_year.months[i + 1];
                        const prev = compareData.last_year.months[i + 1];
                        const c = Number(cur?.revenue || 0);
                        const p = Number(prev?.revenue || 0);
                        return { month: new Date(2000, i).toLocaleString('en-US', { month: 'long' }), c, p, co: cur?.orders || 0, po: prev?.orders || 0, change: p > 0 ? Math.round(((c - p) / p) * 1000) / 10 : null };
                    });
                    const totalC = rows.reduce((a, r) => a + r.c, 0);
                    const totalP = rows.reduce((a, r) => a + r.p, 0);
                    const cy = compareData.current_year.year;
                    const ly = compareData.last_year.year;
                    return (
                        <div className="card">
                            <CardHeader title="Monthly Revenue Comparison" onDownload={() => downloadCsv(`revenue-comparison-${ly}-${cy}.csv`, [
                                ['Month', `${cy} revenue`, `${cy} orders`, `${ly} revenue`, `${ly} orders`, 'Change %'],
                                ...rows.map((r) => [r.month, fixed(r.c), r.co, fixed(r.p), r.po, r.change ?? '']),
                                ['Total', fixed(totalC), '', fixed(totalP), '', totalP > 0 ? Math.round(((totalC - totalP) / totalP) * 1000) / 10 : ''],
                            ])} />
                            <div className="overflow-x-auto">
                                <table className="data-table">
                                    <thead><tr><th className="pb-2">Month</th><th className="pb-2 !text-right">{cy}</th><th className="pb-2 !text-right">{ly}</th><th className="pb-2 !text-right">Change</th></tr></thead>
                                    <tbody>
                                        {rows.map((r) => (
                                            <tr key={r.month}>
                                                <td className="py-2">{r.month}</td>
                                                <td className="text-right tabular">{money(r.c)}</td>
                                                <td className="text-right tabular">{money(r.p)}</td>
                                                <td className={`text-right tabular ${r.change === null ? 'text-gray-300' : r.change >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{r.change === null ? '—' : `${r.change > 0 ? '+' : ''}${r.change}%`}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="border-t-2 border-gray-200 font-semibold text-gray-900">
                                            <td className="py-2.5">Total</td>
                                            <td className="text-right tabular">{money(totalC)}</td>
                                            <td className="text-right tabular">{money(totalP)}</td>
                                            <td />
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    );
                })()
            )}

            {/* Sentiment Analysis */}
            {tab === 'sentiment' && (
                <SentimentDashboard />
            )}
        </div>
    );
}
