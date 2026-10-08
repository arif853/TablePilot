import React, { useRef } from 'react';
import { HiOutlineDownload, HiOutlinePrinter } from 'react-icons/hi';

/**
 * POSInvoice — supports both the NEW structured response from the invoice API
 *   { invoice, restaurant, items, totals, payment }
 * and a LEGACY flat shape { order, restaurant } for backward compatibility.
 */
export default function POSInvoice({ data, order: legacyOrder, restaurant: legacyRestaurant, onClose }) {
    const invoiceRef = useRef(null);

    // ── Normalise props (new structure vs legacy) ──────────────────────────────
    const inv        = data?.invoice   ?? null;
    const restaurant = data?.restaurant ?? legacyRestaurant ?? null;
    const items      = data?.items     ?? legacyOrder?.items ?? [];
    const totals     = data?.totals    ?? null;
    const payment    = data?.payment   ?? null;

    // Derive display values — prefer new structured fields, fall back to legacy
    const orderNumber    = inv?.order_number   ?? legacyOrder?.order_number;
    const invoiceNumber  = inv?.invoice_number ?? legacyOrder?.invoice_number ?? null;
    const orderDate      = inv?.date           ?? legacyOrder?.created_at;
    const orderType      = legacyOrder?.type   ?? '';
    const tableName      = legacyOrder?.table?.table_number ?? null;
    const customerName   = legacyOrder?.customer_name ?? null;
    const customerPhone  = legacyOrder?.customer_phone ?? null;

    const subtotal   = parseFloat(totals?.subtotal    ?? legacyOrder?.subtotal   ?? 0);
    const discount   = parseFloat(totals?.discount    ?? legacyOrder?.discount   ?? 0);
    const netAmount  = parseFloat(totals?.net_amount  ?? legacyOrder?.net_amount ?? 0);
    const vatRate    = parseFloat(totals?.vat_rate     ?? legacyOrder?.vat_rate   ?? 0);
    const vatAmount  = parseFloat(totals?.vat_amount   ?? legacyOrder?.vat_amount ?? legacyOrder?.tax ?? 0);
    const grandTotal = parseFloat(totals?.grand_total  ?? legacyOrder?.grand_total ?? 0);

    const payMethod  = payment?.method ?? legacyOrder?.payment_method ?? '';
    const payStatus  = payment?.status ?? legacyOrder?.payment_status ?? '';
    const isPaid     = payStatus === 'paid';
    const txnId      = legacyOrder?.transaction_id ?? null;

    const paymentLabelMap = {
        cash: 'Cash',
        card: 'Card / POS',
        mobile_banking: 'Mobile Banking',
        online: 'Online',
    };
    const paymentLabel = paymentLabelMap[payMethod] ?? payMethod;

    const handlePrint = () => {
        const content = invoiceRef.current;
        if (!content) return;

        const printWindow = window.open('', '_blank', 'width=320,height=600');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8" />
                <title>Invoice - ${orderNumber}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; width: 80mm; margin: 0 auto; padding: 8px; }
                    .center { text-align: center; }
                    .bold { font-weight: bold; }
                    .divider { border-top: 1px dashed #000; margin: 6px 0; }
                    .row { display: flex; justify-content: space-between; padding: 1px 0; }
                    .item-row { display: flex; justify-content: space-between; padding: 2px 0; }
                    .restaurant-name { font-size: 16px; font-weight: bold; }
                    .order-num { font-size: 14px; font-weight: bold; margin: 4px 0; }
                    .inv-num { font-size: 11px; color: #444; margin-bottom: 2px; }
                    .total-row { font-size: 14px; font-weight: bold; }
                    .footer { font-size: 10px; color: #666; margin-top: 8px; }
                    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; text-transform: uppercase; }
                    .badge-paid { background: #dcfce7; color: #166534; }
                    .badge-pending { background: #fef3c7; color: #92400e; }
                    .badge-cash { background: #e0f2fe; color: #075985; }
                    .badge-online { background: #f3e8ff; color: #6b21a8; }
                    @media print {
                        body { width: 80mm; }
                        @page { size: 80mm auto; margin: 0; }
                    }
                </style>
            </head>
            <body>
                ${content.innerHTML}
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 250);
    };

    if (!orderNumber) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl max-w-sm w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
                {/* Action buttons */}
                <div className="flex items-center justify-between p-4 border-b bg-gray-50 rounded-t-2xl">
                    <h3 className="font-bold text-gray-800">Invoice</h3>
                    <div className="flex gap-2">
                        <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-restaurant text-on-restaurant rounded-lg hover:opacity-90">
                            <HiOutlinePrinter className="w-4 h-4" /> Print
                        </button>
                        <button onClick={onClose} className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
                            Close
                        </button>
                    </div>
                </div>

                {/* Invoice Content */}
                <div ref={invoiceRef} className="p-5">
                    {/* Restaurant Header */}
                    <div className="center" style={{ textAlign: 'center' }}>
                        {restaurant?.logo && (
                            <img src={`/storage/${restaurant.logo}`} alt="" style={{ height: '40px', margin: '0 auto 6px' }} />
                        )}
                        <div className="restaurant-name" style={{ fontSize: '16px', fontWeight: 'bold' }}>
                            {restaurant?.name || 'Restaurant'}
                        </div>
                        {restaurant?.address && (
                            <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>{restaurant.address}</div>
                        )}
                        {restaurant?.phone && (
                            <div style={{ fontSize: '11px', color: '#666' }}>Tel: {restaurant.phone}</div>
                        )}
                        {restaurant?.vat_number && (
                            <div style={{ fontSize: '11px', color: '#444', marginTop: '2px', fontWeight: 'bold' }}>
                                BIN/VAT: {restaurant.vat_number}
                            </div>
                        )}
                    </div>

                    <div className="divider" style={{ borderTop: '1px dashed #000', margin: '8px 0' }}></div>

                    {/* Order / Invoice Info */}
                    <div style={{ textAlign: 'center' }}>
                        {invoiceNumber && (
                            <div className="inv-num" style={{ fontSize: '11px', color: '#444', marginBottom: '2px' }}>
                                Invoice: {invoiceNumber}
                            </div>
                        )}
                        <div className="order-num" style={{ fontSize: '14px', fontWeight: 'bold' }}>
                            {orderNumber}
                        </div>
                        <div style={{ fontSize: '11px', color: '#666', display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                            {orderType && (
                                <span style={{ textTransform: 'capitalize' }}>
                                    {orderType === 'dine' ? 'Dine-in' : orderType === 'parcel' ? 'Takeaway' : orderType}
                                </span>
                            )}
                            {tableName && <span>| Table {tableName}</span>}
                            {orderDate && <span>| {new Date(orderDate).toLocaleString()}</span>}
                        </div>
                    </div>

                    <div className="divider" style={{ borderTop: '1px dashed #000', margin: '8px 0' }}></div>

                    {/* Customer */}
                    {(customerName || customerPhone) && (
                        <>
                            <div style={{ fontSize: '11px' }}>
                                {customerName && <div>Customer: {customerName}</div>}
                                {customerPhone && <div>Phone: {customerPhone}</div>}
                            </div>
                            <div className="divider" style={{ borderTop: '1px dashed #000', margin: '8px 0' }}></div>
                        </>
                    )}

                    {/* Items */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '11px', marginBottom: '4px' }}>
                            <span>Item</span>
                            <span>Total</span>
                        </div>
                        {items.map((item, idx) => (
                            <div key={item.id ?? idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '12px' }}>
                                <span>{item.qty}x {item.name ?? item.menu_item?.name ?? 'Item'}</span>
                                <span>৳{parseFloat(item.line_total ?? item.unit_price * item.qty).toFixed(2)}</span>
                            </div>
                        ))}
                    </div>

                    <div className="divider" style={{ borderTop: '1px dashed #000', margin: '8px 0' }}></div>

                    {/* Totals */}
                    <div style={{ fontSize: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                            <span>Subtotal</span>
                            <span>৳{subtotal.toFixed(2)}</span>
                        </div>
                        {discount > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', color: '#16a34a' }}>
                                <span>Discount</span>
                                <span>-৳{discount.toFixed(2)}</span>
                            </div>
                        )}
                        {netAmount > 0 && netAmount !== subtotal - discount && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                                <span>Net Amount</span>
                                <span>৳{netAmount.toFixed(2)}</span>
                            </div>
                        )}
                        {vatAmount > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                                <span>VAT ({vatRate}%)</span>
                                <span>৳{vatAmount.toFixed(2)}</span>
                            </div>
                        )}
                        <div className="divider" style={{ borderTop: '1px dashed #000', margin: '6px 0' }}></div>
                        <div className="total-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 'bold' }}>
                            <span>TOTAL</span>
                            <span>৳{grandTotal.toFixed(2)}</span>
                        </div>
                    </div>

                    <div className="divider" style={{ borderTop: '1px dashed #000', margin: '8px 0' }}></div>

                    {/* Payment Info */}
                    <div style={{ textAlign: 'center', fontSize: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            {payMethod && (
                                <span
                                    style={{
                                        display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
                                        fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase',
                                        background: payMethod === 'cash' ? '#e0f2fe' : payMethod === 'card' ? '#ede9fe' : '#f0fdf4',
                                        color: payMethod === 'cash' ? '#075985' : payMethod === 'card' ? '#5b21b6' : '#166534',
                                    }}>
                                    {paymentLabel}
                                </span>
                            )}
                            <span
                                style={{
                                    display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
                                    fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase',
                                    background: isPaid ? '#dcfce7' : '#fef3c7',
                                    color: isPaid ? '#166534' : '#92400e',
                                }}>
                                {isPaid ? 'PAID' : 'UNPAID'}
                            </span>
                        </div>
                        {txnId && (
                            <div style={{ fontSize: '10px', color: '#666', marginTop: '4px' }}>
                                TXN: {txnId}
                            </div>
                        )}
                    </div>

                    <div className="divider" style={{ borderTop: '1px dashed #000', margin: '8px 0' }}></div>

                    {/* Footer */}
                    <div className="footer" style={{ textAlign: 'center', fontSize: '10px', color: '#666', marginTop: '8px' }}>
                        <p>Thank you for your order!</p>
                        {payMethod === 'cash' && !isPaid && (
                            <p style={{ marginTop: '4px', fontWeight: 'bold', color: '#92400e' }}>
                                Please pay ৳{grandTotal.toFixed(2)} at the counter
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
