import React, { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useReactToPrint } from 'react-to-print';
import toast from 'react-hot-toast';
import {
    HiOutlineArrowSmDown,
    HiOutlineArrowSmUp,
    HiOutlineCash,
    HiOutlineDocumentText,
    HiOutlineDownload,
    HiOutlinePrinter,
    HiOutlineReceiptTax,
    HiOutlineScale,
    HiOutlineShoppingBag,
    HiOutlineTable,
    HiOutlineTrendingUp,
} from 'react-icons/hi';
import { reportAPI } from '../../services/api';
import { blobErrorMessage, saveBlobResponse } from '../../utils/download';
import LoadingSpinner from '../ui/LoadingSpinner';

const CURRENCY_SYMBOLS = { BDT: '৳', USD: '$', EUR: '€', GBP: '£', INR: '₹' };

const makeMoney = (currency) => {
    const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
    return (value) => {
        const n = Number(value || 0);
        const text = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return `${n < 0 ? '-' : ''}${symbol}${text}`;
    };
};

const num = (value) => Number(value || 0).toLocaleString('en-US');
const plural = (n, word) => `${num(n)} ${word}${Number(n) === 1 ? '' : 's'}`;
const pct = (value) => `${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
const prettyDate = (ymd) => new Date(`${ymd}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const shortDate = (ymd) => new Date(`${ymd}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/* ─── Small building blocks ─────────────────────────────────────────── */

// `goodWhenUp`: true = green on increase, false = green on decrease, null = neutral
function Change({ value, goodWhenUp = true, compact = false, className = '' }) {
    if (value === null || value === undefined) {
        return <span className={`text-xs text-gray-400 ${className}`}>{compact ? '—' : 'no prior data'}</span>;
    }
    const up = value > 0;
    const flat = value === 0;
    const good = goodWhenUp === null || flat ? null : up === goodWhenUp;
    const tone = good === null ? 'text-gray-500' : good ? 'text-emerald-700' : 'text-red-600';
    const Icon = up ? HiOutlineArrowSmUp : HiOutlineArrowSmDown;
    return (
        <span className={`inline-flex items-center gap-0.5 text-xs font-medium tabular ${tone} ${className}`}>
            {!flat && <Icon className="w-3.5 h-3.5" aria-hidden />}
            {Math.abs(value)}%<span className="sr-only">{up ? ' increase' : ' decrease'}</span>
            {!compact && <span className="font-normal text-gray-400 ml-1">vs prev.</span>}
        </span>
    );
}

function Kpi({ label, value, change, goodWhenUp, icon: Icon, hint }) {
    return (
        <div className="card p-4 sm:p-5">
            <div className="flex items-start justify-between gap-2">
                <p className="text-xs sm:text-sm font-medium text-gray-500">{label}</p>
                <span className="w-8 h-8 rounded-xl ring-1 ring-brand-100 bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                </span>
            </div>
            <p className="mt-1.5 text-lg sm:text-2xl font-bold tracking-tight text-gray-900 tabular truncate">{value}</p>
            <div className="mt-1 min-h-[1rem]">
                {change !== undefined ? <Change value={change} goodWhenUp={goodWhenUp} /> : hint && <span className="text-xs text-gray-400">{hint}</span>}
            </div>
        </div>
    );
}

function Section({ title, subtitle, children, action, className = '' }) {
    return (
        <div className={`card ${className}`}>
            <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                    <h3 className="section-title">{title}</h3>
                    {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
                </div>
                {action}
            </div>
            {children}
        </div>
    );
}

function Empty({ children = 'No data for this period.' }) {
    return <p className="text-sm text-gray-400 py-6 text-center">{children}</p>;
}

// Single-hue magnitude bar used for share-of-total rows.
function ShareBar({ share }) {
    return (
        <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden" aria-hidden>
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, Math.max(0, share))}%` }} />
        </div>
    );
}

/* ─── Revenue chart ─────────────────────────────────────────────────── */

const startOfWeek = (ymd) => {
    const d = new Date(`${ymd}T00:00:00`);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
    return d;
};
const toYmd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function bucketDaily(daily) {
    if (daily.length <= 45) {
        return { unit: 'day', buckets: daily.map((d) => ({ key: d.date, label: shortDate(d.date), title: prettyDate(d.date), total: Number(d.total_billed), orders: d.orders })) };
    }
    const unit = daily.length <= 190 ? 'week' : 'month';
    const map = new Map();
    daily.forEach((d) => {
        const key = unit === 'week' ? toYmd(startOfWeek(d.date)) : d.date.slice(0, 7);
        const b = map.get(key) || { key, total: 0, orders: 0, first: d.date, last: d.date };
        b.total += Number(d.total_billed);
        b.orders += d.orders;
        b.last = d.date;
        map.set(key, b);
    });
    return {
        unit,
        buckets: [...map.values()].map((b) => ({
            ...b,
            label: unit === 'week' ? shortDate(b.first) : new Date(`${b.key}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
            title: unit === 'week' ? `${prettyDate(b.first)} – ${prettyDate(b.last)}` : new Date(`${b.key}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
        })),
    };
}

const niceMax = (max) => {
    if (max <= 0) return 1;
    const pow = 10 ** Math.floor(Math.log10(max));
    return [1, 2, 2.5, 5, 10].find((s) => s * pow >= max) * pow;
};

function RevenueChart({ daily, money }) {
    const [hover, setHover] = useState(null);
    const { unit, buckets } = useMemo(() => bucketDaily(daily), [daily]);
    const max = niceMax(Math.max(0, ...buckets.map((b) => b.total)));
    const ticks = [max, max / 2, 0];
    const labelEvery = Math.max(1, Math.ceil(buckets.length / 8));
    const active = hover !== null ? buckets[hover] : null;

    return (
        <Section title={`Revenue by ${unit}`} subtitle="Total billed on completed orders, incl. VAT & SD">
            {buckets.every((b) => b.total === 0) ? <Empty>No completed sales in this period.</Empty> : (
                <div className="flex gap-2">
                    {/* Y axis */}
                    <div className="relative h-48 w-14 shrink-0 text-[10px] text-gray-400 tabular">
                        {ticks.map((t, i) => (
                            <span key={i} className="absolute right-0 -translate-y-1/2" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}>
                                {money(t).replace(/\.00$/, '')}
                            </span>
                        ))}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="relative h-48" onMouseLeave={() => setHover(null)}>
                            {ticks.map((_, i) => (
                                <div key={i} className="absolute inset-x-0 border-t border-gray-100" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }} />
                            ))}
                            <div className="absolute inset-0 flex items-end gap-[2px]">
                                {buckets.map((b, i) => (
                                    <div
                                        key={b.key}
                                        className="relative flex-1 h-full flex items-end justify-center cursor-default"
                                        onMouseEnter={() => setHover(i)}
                                        aria-label={`${b.title}: ${money(b.total)}, ${b.orders} orders`}
                                    >
                                        <div
                                            className={`w-full max-w-[40px] rounded-t-[4px] transition-colors ${hover === i ? 'bg-brand-600' : 'bg-brand-500'}`}
                                            style={{ height: `${(b.total / max) * 100}%`, minHeight: b.total > 0 ? 2 : 0 }}
                                        />
                                    </div>
                                ))}
                            </div>
                            {active && (
                                <div
                                    className="pointer-events-none absolute z-10 -translate-x-1/2 -top-2 -translate-y-full rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow-lg whitespace-nowrap"
                                    style={{ left: `${Math.min(88, Math.max(12, ((hover + 0.5) / buckets.length) * 100))}%` }}
                                >
                                    <p className="font-medium">{active.title}</p>
                                    <p className="tabular">{money(active.total)} · {plural(active.orders, 'order')}</p>
                                </div>
                            )}
                        </div>
                        <div className="flex gap-[2px] mt-1.5 text-[10px] text-gray-400">
                            {buckets.map((b, i) => (
                                <span key={b.key} className="flex-1 text-center truncate">{i % labelEvery === 0 ? b.label : ''}</span>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </Section>
    );
}

/* ─── Statement lines (shared by screen + print) ────────────────────── */

function statementLines(s) {
    const lines = [
        { label: 'Gross sales (menu prices)', key: 'gross_sales', good: true },
        { label: 'Less: discounts', key: 'discounts', negative: true, good: false },
    ];
    if (Number(s.inclusive_tax) > 0) lines.push({ label: 'Less: VAT & SD included in prices', key: 'inclusive_tax', negative: true, good: null });
    lines.push({ label: 'Net sales (excl. VAT/SD)', key: 'net_sales', total: true, good: true });
    lines.push({ label: 'Add: VAT collected', key: 'vat', good: null });
    if (Number(s.sd) > 0) lines.push({ label: 'Add: SD collected', key: 'sd', good: null });
    lines.push({ label: 'Total billed', key: 'total_billed', total: true, good: true });
    return lines;
}

/* ─── Printable statement (A4) ──────────────────────────────────────── */

const PrintTable = ({ head, rows, foot, align }) => (
    <table className="w-full text-[10.5px] border-collapse mb-1">
        <thead>
            <tr className="border-b border-gray-400">
                {head.map((h, i) => <th key={i} className={`py-1 px-1 font-semibold text-gray-700 ${align?.[i] === 'r' ? 'text-right' : 'text-left'}`}>{h}</th>)}
            </tr>
        </thead>
        <tbody>
            {rows.map((r, ri) => (
                <tr key={ri} className="border-b border-gray-200">
                    {r.map((c, i) => <td key={i} className={`py-[3px] px-1 ${align?.[i] === 'r' ? 'text-right tabular' : ''}`}>{c}</td>)}
                </tr>
            ))}
        </tbody>
        {foot && (
            <tfoot>
                <tr className="border-t-2 border-gray-700 font-semibold">
                    {foot.map((c, i) => <td key={i} className={`py-1 px-1 ${align?.[i] === 'r' ? 'text-right tabular' : ''}`}>{c}</td>)}
                </tr>
            </tfoot>
        )}
    </table>
);

const PrintHeading = ({ children }) => (
    <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-800 mt-4 mb-1.5 pb-0.5 border-b border-gray-800">{children}</h4>
);

const PrintableStatement = React.forwardRef(function PrintableStatement({ data, money }, ref) {
    const { restaurant: rest, summary: s, previous_summary: p, changes, collections: c, cash_drawer: d } = data;
    const chg = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${v}%`);

    return (
        <div ref={ref} className="bg-white text-gray-900 p-8 font-sans" style={{ width: '210mm' }}>
            {/* Letterhead */}
            <div className="flex justify-between items-start border-b-2 border-gray-900 pb-3">
                <div>
                    <h1 className="text-xl font-bold">{rest.name}</h1>
                    {rest.address && <p className="text-[11px] text-gray-600">{rest.address}</p>}
                    <p className="text-[11px] text-gray-600">{[rest.phone, rest.email].filter(Boolean).join(' · ')}</p>
                    {rest.vat_number && <p className="text-[11px] text-gray-600">VAT Reg. (BIN): {rest.vat_number}</p>}
                </div>
                <div className="text-right">
                    <h2 className="text-lg font-bold uppercase tracking-wide">Financial Statement</h2>
                    <p className="text-[11px]">Period: <b>{prettyDate(data.period.from)} – {prettyDate(data.period.to)}</b> ({data.period.days} days)</p>
                    <p className="text-[11px] text-gray-600">Compared with {prettyDate(data.previous_period.from)} – {prettyDate(data.previous_period.to)}</p>
                    <p className="text-[11px] text-gray-600">Generated {new Date(data.generated_at.replace(' ', 'T')).toLocaleString('en-GB')}</p>
                </div>
            </div>

            {/* Headline figures */}
            <div className="grid grid-cols-4 gap-2 mt-3">
                {[
                    ['Total billed', money(s.total_billed)],
                    ['Net sales', money(s.net_sales)],
                    ['Tax liability (VAT+SD)', money(s.tax_liability)],
                    ['Net earnings', money(s.net_earnings)],
                ].map(([l, v]) => (
                    <div key={l} className="border border-gray-300 rounded p-2">
                        <p className="text-[9px] uppercase tracking-wide text-gray-500">{l}</p>
                        <p className="text-sm font-bold tabular">{v}</p>
                    </div>
                ))}
            </div>

            <PrintHeading>Income statement</PrintHeading>
            <PrintTable
                head={['', 'This period', 'Previous period', 'Change']}
                align={['l', 'r', 'r', 'r']}
                rows={[
                    ...statementLines(s).map((l) => [
                        l.total ? <b>{l.label}</b> : l.label,
                        l.total ? <b>{money(s[l.key])}</b> : (l.negative ? `(${money(s[l.key])})` : money(s[l.key])),
                        l.negative ? `(${money(p[l.key])})` : money(p[l.key]),
                        chg(changes[l.key]),
                    ]),
                    ...(Number(s.commission_rate) > 0
                        ? [[`Less: platform commission (${s.commission_rate}%)`, `(${money(s.commission)})`, `(${money(p.commission)})`, chg(changes.commission)]]
                        : []),
                    [<b>Net earnings (net sales{Number(s.commission_rate) > 0 ? ' − commission' : ''})</b>, <b>{money(s.net_earnings)}</b>, money(p.net_earnings), chg(changes.net_earnings)],
                ]}
            />

            <div className="grid grid-cols-2 gap-6">
                <div>
                    <PrintHeading>Key figures</PrintHeading>
                    <PrintTable
                        head={['Metric', 'Value']}
                        align={['l', 'r']}
                        rows={[
                            ['Completed orders', num(s.completed_orders)],
                            ['Average order value', money(s.avg_order_value)],
                            ['Discount rate', pct(s.discount_rate)],
                            ['Cancelled orders', `${num(s.cancelled_orders)} (${money(s.cancelled_amount)})`],
                            ['Cancellation rate', pct(s.cancellation_rate)],
                            ['Open / unfinished orders', `${num(s.open_orders)} (${money(s.open_amount)})`],
                        ]}
                    />
                </div>
                <div>
                    <PrintHeading>Collections (completed orders)</PrintHeading>
                    <PrintTable
                        head={['Status', 'Orders', 'Amount']}
                        align={['l', 'r', 'r']}
                        rows={[
                            ['Paid', num(c.paid.orders), money(c.paid.amount)],
                            ['Pending', num(c.pending.orders), money(c.pending.amount)],
                            ['Failed', num(c.failed.orders), money(c.failed.amount)],
                            ['Refunded', num(c.refunded.orders), money(c.refunded.amount)],
                        ]}
                        foot={['Outstanding', '', money(c.outstanding)]}
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
                <div>
                    <PrintHeading>Payments received by method</PrintHeading>
                    <PrintTable
                        head={['Method', 'Orders', 'Amount', 'Share']}
                        align={['l', 'r', 'r', 'r']}
                        rows={data.payment_methods.map((m) => [m.label, num(m.orders), money(m.amount), pct(m.share)])}
                        foot={['Total', '', money(c.paid.amount), '']}
                    />
                </div>
                <div>
                    <PrintHeading>Sales by order type</PrintHeading>
                    <PrintTable
                        head={['Type', 'Orders', 'Total', 'Share']}
                        align={['l', 'r', 'r', 'r']}
                        rows={data.order_types.map((t) => [t.label, num(t.orders), money(t.total), pct(t.share)])}
                    />
                    <PrintHeading>Sales by channel</PrintHeading>
                    <PrintTable
                        head={['Channel', 'Orders', 'Total', 'Share']}
                        align={['l', 'r', 'r', 'r']}
                        rows={data.sources.map((t) => [t.label, num(t.orders), money(t.total), pct(t.share)])}
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
                <div>
                    <PrintHeading>Sales by category</PrintHeading>
                    <PrintTable
                        head={['Category', 'Qty', 'Item sales', 'Share']}
                        align={['l', 'r', 'r', 'r']}
                        rows={data.categories.map((r) => [r.category, num(r.qty), money(r.revenue), pct(r.share)])}
                    />
                </div>
                <div>
                    <PrintHeading>Top items</PrintHeading>
                    <PrintTable
                        head={['Item', 'Qty', 'Item sales']}
                        align={['l', 'r', 'r']}
                        rows={data.top_items.slice(0, 10).map((r) => [r.name, num(r.qty), money(r.revenue)])}
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
                <div>
                    <PrintHeading>Staff</PrintHeading>
                    <PrintTable
                        head={['Served by', 'Orders', 'Total', 'Discounts']}
                        align={['l', 'r', 'r', 'r']}
                        rows={data.staff.map((r) => [r.name, num(r.orders), money(r.total), money(r.discounts)])}
                    />
                </div>
                <div>
                    <PrintHeading>Cash drawer (POS shifts)</PrintHeading>
                    <PrintTable
                        head={['', 'Amount']}
                        align={['l', 'r']}
                        rows={[
                            ['Shifts opened', num(d.shifts)],
                            ['Opening float', money(d.opening_cash)],
                            ['Expected cash (closed shifts)', money(d.expected_cash)],
                            ['Counted cash (closed shifts)', money(d.closing_cash)],
                        ]}
                        foot={['Variance (over / short)', money(d.variance)]}
                    />
                </div>
            </div>

            <div style={{ breakBefore: data.daily.length > 12 ? 'page' : 'auto' }}>
                <PrintHeading>Daily ledger</PrintHeading>
                <PrintTable
                    head={['Date', 'Orders', 'Gross', 'Discount', 'Net sales', 'VAT', 'SD', 'Total billed', 'Cancelled']}
                    align={['l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r']}
                    rows={data.daily.map((r) => [
                        prettyDate(r.date), num(r.orders), money(r.gross_sales), money(r.discounts), money(r.net_sales),
                        money(r.vat), money(r.sd), money(r.total_billed), r.cancelled_orders ? `${r.cancelled_orders} (${money(r.cancelled_amount)})` : '—',
                    ])}
                    foot={['Total', num(s.completed_orders), money(s.gross_sales), money(s.discounts), money(s.net_sales), money(s.vat), money(s.sd), money(s.total_billed), s.cancelled_orders ? `${s.cancelled_orders} (${money(s.cancelled_amount)})` : '—']}
                />
            </div>

            <p className="text-[9px] text-gray-500 mt-4 leading-snug">
                Revenue is recognised on completed orders using the amounts stored on each invoice (VAT/SD are not recalculated).
                Cancelled and unfinished orders are excluded from revenue. Item and category sales are at menu price before order-level discounts.
                {Number(s.commission_rate) > 0 && ' Platform commission is an estimate at the current rate; see Settlements for invoiced amounts.'}
            </p>

            <div className="grid grid-cols-2 gap-16 mt-12 text-[10px] text-gray-600">
                <div className="border-t border-gray-500 pt-1">Prepared by</div>
                <div className="border-t border-gray-500 pt-1">Approved by</div>
            </div>
        </div>
    );
});

/* ─── Screen view ───────────────────────────────────────────────────── */

export default function FinancialReport({ from, to }) {
    const printRef = useRef(null);
    const [downloading, setDownloading] = useState(null);

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['report-financial', from, to],
        queryFn: () => reportAPI.financial({ from, to }).then((r) => r.data.data),
        enabled: Boolean(from && to && from <= to),
    });

    const money = useMemo(() => makeMoney(data?.restaurant?.currency || 'BDT'), [data?.restaurant?.currency]);

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: `Financial-Statement-${from}-to-${to}`,
        pageStyle: `
            @page { size: A4; margin: 10mm; }
            @media print {
                html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                table { page-break-inside: auto; }
                tr { page-break-inside: avoid; }
            }
        `,
    });

    const download = async (type) => {
        setDownloading(type);
        try {
            const response = await reportAPI.financialExport({ from, to, type });
            saveBlobResponse(response, `${type}-${from}-to-${to}.csv`);
        } catch (e) {
            toast.error(await blobErrorMessage(e));
        } finally {
            setDownloading(null);
        }
    };

    if (from > to) return <div className="card text-sm text-red-600">The start date must be on or before the end date.</div>;
    if (isLoading) return <LoadingSpinner />;
    if (isError) return <div className="card text-sm text-red-600">{error?.response?.data?.message || 'Could not load the financial report.'}</div>;
    if (!data) return null;

    const { summary: s, previous_summary: p, changes, collections: c, cash_drawer: d } = data;
    const hasCommission = Number(s.commission_rate) > 0;

    return (
        <div className="space-y-4 sm:space-y-6">
            {/* Download bar */}
            <div className="card p-3 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="text-sm text-gray-600">
                    <span className="font-medium text-gray-900">{prettyDate(data.period.from)} – {prettyDate(data.period.to)}</span>
                    <span className="text-gray-400"> · compared with {prettyDate(data.previous_period.from)} – {prettyDate(data.previous_period.to)}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button onClick={handlePrint} className="btn-primary">
                        <HiOutlinePrinter className="w-4 h-4" /> Statement PDF
                    </button>
                    <button onClick={() => download('statement')} disabled={!!downloading} className="btn-secondary">
                        <HiOutlineDownload className="w-4 h-4" /> {downloading === 'statement' ? 'Preparing…' : 'Statement CSV'}
                    </button>
                    <button onClick={() => download('transactions')} disabled={!!downloading} className="btn-secondary">
                        <HiOutlineTable className="w-4 h-4" /> {downloading === 'transactions' ? 'Preparing…' : 'Transactions CSV'}
                    </button>
                    <button onClick={() => download('items')} disabled={!!downloading} className="btn-secondary">
                        <HiOutlineDocumentText className="w-4 h-4" /> {downloading === 'items' ? 'Preparing…' : 'Item sales CSV'}
                    </button>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
                <Kpi label="Total billed" value={money(s.total_billed)} change={changes.total_billed} icon={HiOutlineCash} />
                <Kpi label="Net sales" value={money(s.net_sales)} change={changes.net_sales} icon={HiOutlineTrendingUp} />
                <Kpi label="Net earnings" value={money(s.net_earnings)} change={changes.net_earnings} icon={HiOutlineScale} />
                <Kpi label="Tax liability" value={money(s.tax_liability)} change={changes.tax_liability} goodWhenUp={null} icon={HiOutlineReceiptTax} />
                <Kpi label="Orders" value={num(s.completed_orders)} change={changes.completed_orders} icon={HiOutlineShoppingBag} />
                <Kpi label="Avg order value" value={money(s.avg_order_value)} change={changes.avg_order_value} icon={HiOutlineCash} />
            </div>

            <RevenueChart daily={data.daily} money={money} />

            <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 sm:gap-6">
                {/* Income statement */}
                <Section title="Income statement" subtitle="Completed orders, stored invoice values" className="xl:col-span-3">
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th className="pb-2" />
                                    <th className="pb-2 !text-right">This period</th>
                                    <th className="pb-2 !text-right hidden sm:table-cell">Previous</th>
                                    <th className="pb-2 !text-right">Change</th>
                                </tr>
                            </thead>
                            <tbody>
                                {statementLines(s).map((l) => (
                                    <tr key={l.key} className={l.total ? 'bg-gray-50/70' : ''}>
                                        <td className={`py-2.5 ${l.total ? 'font-semibold text-gray-900' : 'pl-4'}`}>{l.label}</td>
                                        <td className={`py-2.5 text-right tabular ${l.total ? 'font-semibold text-gray-900' : ''}`}>{l.negative ? `(${money(s[l.key])})` : money(s[l.key])}</td>
                                        <td className="py-2.5 text-right tabular text-gray-500 hidden sm:table-cell">{l.negative ? `(${money(p[l.key])})` : money(p[l.key])}</td>
                                        <td className="py-2.5 text-right"><Change value={changes[l.key]} goodWhenUp={l.good} compact /></td>
                                    </tr>
                                ))}
                                {hasCommission && (
                                    <tr>
                                        <td className="py-2.5 pl-4">Less: platform commission ({s.commission_rate}%)</td>
                                        <td className="py-2.5 text-right tabular">({money(s.commission)})</td>
                                        <td className="py-2.5 text-right tabular text-gray-500 hidden sm:table-cell">({money(p.commission)})</td>
                                        <td className="py-2.5 text-right"><Change value={changes.commission} goodWhenUp={null} compact /></td>
                                    </tr>
                                )}
                                <tr className="bg-brand-50/60">
                                    <td className="py-2.5 font-bold text-gray-900">Net earnings{hasCommission ? ' (after commission)' : ''}</td>
                                    <td className="py-2.5 text-right tabular font-bold text-gray-900">{money(s.net_earnings)}</td>
                                    <td className="py-2.5 text-right tabular text-gray-500 hidden sm:table-cell">{money(p.net_earnings)}</td>
                                    <td className="py-2.5 text-right"><Change value={changes.net_earnings} compact /></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <p className="text-xs text-gray-500 mt-3">
                        VAT + SD of <b className="tabular">{money(s.tax_liability)}</b> is owed to the tax authority and is not part of your earnings.
                        {hasCommission && ' Commission is estimated at the current rate; invoiced amounts are under Settlements.'}
                    </p>
                </Section>

                {/* Collections & health */}
                <div className="xl:col-span-2 space-y-4 sm:space-y-6">
                    <Section title="Collections" subtitle="Payment status of completed orders">
                        <dl className="space-y-2.5 text-sm">
                            {[
                                ['Paid', c.paid, 'text-emerald-700'],
                                ['Pending', c.pending, 'text-amber-700'],
                                ['Failed', c.failed, 'text-red-600'],
                                ['Refunded', c.refunded, 'text-gray-600'],
                            ].map(([label, row, tone]) => (
                                <div key={label} className="flex items-center justify-between">
                                    <dt className="text-gray-600">{label} <span className="text-gray-400 text-xs">· {plural(row.orders, 'order')}</span></dt>
                                    <dd className={`tabular font-medium ${Number(row.amount) > 0 ? tone : 'text-gray-400'}`}>{money(row.amount)}</dd>
                                </div>
                            ))}
                            <div className="flex items-center justify-between border-t border-gray-100 pt-2.5">
                                <dt className="font-semibold text-gray-900">Outstanding</dt>
                                <dd className={`tabular font-bold ${Number(c.outstanding) > 0 ? 'text-amber-700' : 'text-gray-900'}`}>{money(c.outstanding)}</dd>
                            </div>
                        </dl>
                    </Section>
                    <Section title="Order health">
                        <dl className="grid grid-cols-2 gap-4 text-sm">
                            <div><dt className="text-xs text-gray-500">Discount rate</dt><dd className="font-semibold tabular">{pct(s.discount_rate)}</dd><dd className="text-xs text-gray-400 tabular">{money(s.discounts)} given</dd></div>
                            <div><dt className="text-xs text-gray-500">Cancellation rate</dt><dd className="font-semibold tabular">{pct(s.cancellation_rate)}</dd><dd className="text-xs text-gray-400 tabular">{num(s.cancelled_orders)} · {money(s.cancelled_amount)} lost</dd></div>
                            <div><dt className="text-xs text-gray-500">Unfinished orders</dt><dd className="font-semibold tabular">{num(s.open_orders)}</dd><dd className="text-xs text-gray-400 tabular">{money(s.open_amount)} not yet completed</dd></div>
                            <div><dt className="text-xs text-gray-500">VAT / SD</dt><dd className="font-semibold tabular">{money(s.vat)}</dd><dd className="text-xs text-gray-400 tabular">SD {money(s.sd)}</dd></div>
                        </dl>
                    </Section>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <Section title="Payments received" subtitle="Paid orders by tender; split bills counted per method">
                    {data.payment_methods.length === 0 ? <Empty /> : (
                        <ul className="space-y-3">
                            {data.payment_methods.map((m) => (
                                <li key={m.method}>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-gray-700">{m.label} <span className="text-xs text-gray-400">· {plural(m.orders, 'order')}</span></span>
                                        <span className="tabular font-medium text-gray-900">{money(m.amount)} <span className="text-xs text-gray-400 font-normal">{pct(m.share)}</span></span>
                                    </div>
                                    <ShareBar share={m.share} />
                                </li>
                            ))}
                        </ul>
                    )}
                </Section>

                <Section title="Sales by order type & channel">
                    {data.order_types.length === 0 ? <Empty /> : (
                        <div className="overflow-x-auto">
                            <table className="data-table">
                                <thead><tr><th className="pb-2" /><th className="pb-2 !text-right">Orders</th><th className="pb-2 !text-right">Avg</th><th className="pb-2 !text-right">Total</th><th className="pb-2 !text-right">Share</th></tr></thead>
                                {[['Order type', data.order_types], ['Channel', data.sources]].map(([group, rows]) => (
                                    <tbody key={group}>
                                        <tr className="hover:bg-transparent">
                                            <td colSpan={5} className="pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider !text-gray-400">{group}</td>
                                        </tr>
                                        {rows.map((t) => (
                                            <tr key={t.key}>
                                                <td className="py-2">{t.label}</td>
                                                <td className="py-2 text-right tabular">{num(t.orders)}</td>
                                                <td className="py-2 text-right tabular">{money(t.avg_order_value)}</td>
                                                <td className="py-2 text-right tabular font-medium">{money(t.total)}</td>
                                                <td className="py-2 text-right tabular text-gray-500">{pct(t.share)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                ))}
                            </table>
                        </div>
                    )}
                </Section>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <Section title="Sales by category" subtitle="Menu price × qty, before order discounts">
                    {data.categories.length === 0 ? <Empty /> : (
                        <ul className="space-y-3">
                            {data.categories.map((r) => (
                                <li key={r.category}>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-gray-700">{r.category} <span className="text-xs text-gray-400">· {num(r.qty)} sold</span></span>
                                        <span className="tabular font-medium text-gray-900">{money(r.revenue)} <span className="text-xs text-gray-400 font-normal">{pct(r.share)}</span></span>
                                    </div>
                                    <ShareBar share={r.share} />
                                </li>
                            ))}
                        </ul>
                    )}
                </Section>

                <Section title="Top items by revenue">
                    {data.top_items.length === 0 ? <Empty /> : (
                        <div className="overflow-x-auto">
                            <table className="data-table">
                                <thead><tr><th className="pb-2">Item</th><th className="pb-2 !text-right">Qty</th><th className="pb-2 !text-right">Revenue</th></tr></thead>
                                <tbody>
                                    {data.top_items.map((r, i) => (
                                        <tr key={`${r.menu_item_id}-${i}`}>
                                            <td className="py-2"><span className="text-gray-900">{r.name}</span><span className="block text-xs text-gray-400">{r.category}</span></td>
                                            <td className="py-2 text-right tabular">{num(r.qty)}</td>
                                            <td className="py-2 text-right tabular font-medium">{money(r.revenue)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Section>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <Section title="Staff performance" subtitle="Completed orders by who served them">
                    {data.staff.length === 0 ? <Empty /> : (
                        <div className="overflow-x-auto">
                            <table className="data-table">
                                <thead><tr><th className="pb-2">Served by</th><th className="pb-2 !text-right">Orders</th><th className="pb-2 !text-right">Discounts</th><th className="pb-2 !text-right">Total</th></tr></thead>
                                <tbody>
                                    {data.staff.map((r) => (
                                        <tr key={r.user_id ?? 'qr'}>
                                            <td className="py-2">{r.name}</td>
                                            <td className="py-2 text-right tabular">{num(r.orders)}</td>
                                            <td className="py-2 text-right tabular">{money(r.discounts)}</td>
                                            <td className="py-2 text-right tabular font-medium">{money(r.total)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Section>

                <Section title="Cash drawer" subtitle="POS shifts opened in this period">
                    {d.shifts === 0 ? <Empty>No POS shifts in this period.</Empty> : (
                        <>
                            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-4">
                                <div><dt className="text-xs text-gray-500">Opening float</dt><dd className="font-semibold tabular">{money(d.opening_cash)}</dd></div>
                                <div><dt className="text-xs text-gray-500">Expected</dt><dd className="font-semibold tabular">{money(d.expected_cash)}</dd></div>
                                <div><dt className="text-xs text-gray-500">Counted</dt><dd className="font-semibold tabular">{money(d.closing_cash)}</dd></div>
                                <div><dt className="text-xs text-gray-500">Over / short</dt><dd className={`font-semibold tabular ${Number(d.variance) < 0 ? 'text-red-600' : Number(d.variance) > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{money(d.variance)}</dd></div>
                            </dl>
                            <div className="overflow-x-auto max-h-64">
                                <table className="data-table">
                                    <thead><tr><th className="pb-2">Opened</th><th className="pb-2">By</th><th className="pb-2 !text-right">Expected</th><th className="pb-2 !text-right">Counted</th><th className="pb-2 !text-right">Variance</th></tr></thead>
                                    <tbody>
                                        {d.list.map((sh) => (
                                            <tr key={sh.id}>
                                                <td className="py-2 whitespace-nowrap">{new Date(sh.opened_at.replace(' ', 'T')).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                                                <td className="py-2">{sh.opened_by} {sh.status !== 'closed' && <span className="ml-1 badge-warning">open</span>}</td>
                                                <td className="py-2 text-right tabular">{sh.expected_cash !== null ? money(sh.expected_cash) : '—'}</td>
                                                <td className="py-2 text-right tabular">{sh.closing_cash !== null ? money(sh.closing_cash) : '—'}</td>
                                                <td className={`py-2 text-right tabular ${Number(sh.variance) < 0 ? 'text-red-600' : ''}`}>{sh.variance !== null ? money(sh.variance) : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </Section>
            </div>

            <Section title="Daily ledger" subtitle="Completed orders per day; cancellations shown separately">
                <div className="overflow-x-auto max-h-[28rem]">
                    <table className="data-table">
                        <thead className="sticky top-0 bg-white">
                            <tr>
                                <th className="pb-2">Date</th>
                                <th className="pb-2 !text-right">Orders</th>
                                <th className="pb-2 !text-right">Gross</th>
                                <th className="pb-2 !text-right">Discount</th>
                                <th className="pb-2 !text-right">Net sales</th>
                                <th className="pb-2 !text-right">VAT</th>
                                <th className="pb-2 !text-right">SD</th>
                                <th className="pb-2 !text-right">Total billed</th>
                                <th className="pb-2 !text-right">Cancelled</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.daily.map((r) => (
                                <tr key={r.date} className={r.orders === 0 && r.cancelled_orders === 0 ? 'text-gray-400' : ''}>
                                    <td className="py-2 whitespace-nowrap">{prettyDate(r.date)}</td>
                                    <td className="py-2 text-right tabular">{num(r.orders)}</td>
                                    <td className="py-2 text-right tabular">{money(r.gross_sales)}</td>
                                    <td className="py-2 text-right tabular">{money(r.discounts)}</td>
                                    <td className="py-2 text-right tabular">{money(r.net_sales)}</td>
                                    <td className="py-2 text-right tabular">{money(r.vat)}</td>
                                    <td className="py-2 text-right tabular">{money(r.sd)}</td>
                                    <td className="py-2 text-right tabular font-medium">{money(r.total_billed)}</td>
                                    <td className="py-2 text-right tabular">{r.cancelled_orders ? `${r.cancelled_orders} · ${money(r.cancelled_amount)}` : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="sticky bottom-0 bg-white">
                            <tr className="border-t-2 border-gray-200 font-semibold text-gray-900">
                                <td className="py-2.5">Total</td>
                                <td className="py-2.5 text-right tabular">{num(s.completed_orders)}</td>
                                <td className="py-2.5 text-right tabular">{money(s.gross_sales)}</td>
                                <td className="py-2.5 text-right tabular">{money(s.discounts)}</td>
                                <td className="py-2.5 text-right tabular">{money(s.net_sales)}</td>
                                <td className="py-2.5 text-right tabular">{money(s.vat)}</td>
                                <td className="py-2.5 text-right tabular">{money(s.sd)}</td>
                                <td className="py-2.5 text-right tabular">{money(s.total_billed)}</td>
                                <td className="py-2.5 text-right tabular">{s.cancelled_orders ? `${s.cancelled_orders} · ${money(s.cancelled_amount)}` : '—'}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </Section>

            {/* Off-screen printable statement */}
            <div className="hidden">
                <PrintableStatement ref={printRef} data={data} money={money} />
            </div>
        </div>
    );
}
