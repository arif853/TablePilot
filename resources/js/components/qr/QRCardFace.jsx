import React, { forwardRef } from 'react';
import QRCode from 'react-qr-code';
import { restaurantTheme } from '../../utils/restaurantTheme';

// Designed at 320x480 CSS px (2:3). Print zooms it to exactly 4x6 in; PNG export renders it at 4x.
export const CARD_WIDTH = 320;
export const CARD_HEIGHT = 480;

/** Tenant files are stored as relative paths on the public disk. */
export const storageUrl = (path) => {
    if (!path) return null;
    return /^(https?:|data:|blob:|\/)/.test(path) ? path : `/storage/${path}`;
};

const STEPS = ['Scan', 'Choose', 'Order'];
const STEP_DOT = 16;

// Long restaurant names shrink first, then wrap onto a second line
const nameFontSize = (name) => (name.length <= 18 ? 18 : name.length <= 28 ? 15 : 13);

/**
 * The printable QR card. `label` is the small heading ("Table" / "Takeaway") and
 * `title` the large line under it ("12" / "Order to go").
 */
const QRCardFace = forwardRef(function QRCardFace({ tenant, label, title, qrUrl }, ref) {
    const theme = restaurantTheme(tenant?.primary_color);
    const logo = storageUrl(tenant?.logo);
    const name = tenant?.name || 'Restaurant';
    const isNumber = String(title ?? '').length <= 4;

    return (
        <div
            ref={ref}
            data-qr-card
            className="qr-card bg-white overflow-hidden flex flex-col"
            style={{
                width: CARD_WIDTH,
                height: CARD_HEIGHT,
                borderRadius: 16,
                boxShadow: '0 10px 30px -12px rgba(17, 24, 39, 0.35)',
                fontFamily: 'Figtree, ui-sans-serif, system-ui, sans-serif',
            }}
        >
            {/* Restaurant band. No overflow clipping on text: html2canvas draws text a few px lower than
                the browser, so clipped boxes (truncate) cut words in half in the PNG. Long names wrap/shrink. */}
            <div
                className="flex items-center justify-center gap-2.5 px-5 py-3"
                style={{ backgroundColor: theme.color, color: theme.on, minHeight: 64, flexShrink: 0 }}
            >
                {logo && (
                    <div className="bg-white rounded-lg p-1 flex items-center justify-center" style={{ height: 40, width: 40, flexShrink: 0 }}>
                        <img src={logo} alt="" crossOrigin="anonymous" className="max-h-full max-w-full object-contain" />
                    </div>
                )}
                <p className="font-bold text-center" style={{ fontSize: nameFontSize(name), lineHeight: 1.3, wordBreak: 'break-word' }}>
                    {name}
                </p>
            </div>

            {/* Table identity + QR */}
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
                <p className="text-[11px] font-bold tracking-[0.25em] uppercase" style={{ color: theme.ink }}>
                    {label}
                </p>
                <p className={`font-extrabold text-gray-900 leading-none mt-1 ${isNumber ? 'text-5xl' : 'text-2xl'}`}>
                    {title}
                </p>

                <div
                    className="mt-4 p-3 rounded-2xl bg-white"
                    style={{ border: `2px solid ${theme.color}`, lineHeight: 0 }}
                >
                    {qrUrl ? (
                        <QRCode value={qrUrl} size={168} level="M" fgColor="#111827" bgColor="#FFFFFF" />
                    ) : (
                        <div className="flex items-center justify-center text-xs text-gray-400" style={{ width: 168, height: 168 }}>
                            Generating QR…
                        </div>
                    )}
                </div>

                <p className="mt-4 text-sm font-semibold text-gray-900">Scan to view the menu &amp; order</p>
                {/* Centred with line-height, not flexbox: html2canvas ignores flex centring inside small boxes */}
                <div className="mt-2 text-gray-600" style={{ fontSize: 11, lineHeight: `${STEP_DOT}px`, whiteSpace: 'nowrap' }}>
                    {STEPS.map((step, i) => (
                        <React.Fragment key={step}>
                            {i > 0 && <span className="text-gray-300" style={{ margin: '0 6px' }}>→</span>}
                            <span
                                className="font-bold"
                                style={{
                                    display: 'inline-block',
                                    width: STEP_DOT,
                                    height: STEP_DOT,
                                    lineHeight: `${STEP_DOT}px`,
                                    borderRadius: '50%',
                                    textAlign: 'center',
                                    verticalAlign: 'top',
                                    fontSize: 9,
                                    marginRight: 4,
                                    backgroundColor: theme.color,
                                    color: theme.on,
                                }}
                            >
                                {i + 1}
                            </span>
                            {step}
                        </React.Fragment>
                    ))}
                </div>
            </div>

            {/* Contact + platform */}
            <div className="px-5 pb-3 pt-2 text-center border-t border-gray-100" style={{ flexShrink: 0, lineHeight: 1.4 }}>
                {tenant?.phone && <p className="text-[10px] text-gray-600">{tenant.phone}</p>}
                {tenant?.address && <p className="text-[10px] text-gray-500" style={{ wordBreak: 'break-word' }}>{tenant.address}</p>}
                <p className="text-[9px] text-gray-400 mt-0.5">Powered by TablePilot</p>
            </div>
        </div>
    );
});

export default QRCardFace;

/** Print CSS shared by single and bulk printing: one 4x6 in card per page, colours kept. */
export const QR_CARD_PAGE_STYLE = `
    @page { size: 4in 6in; margin: 0; }
    html, body { margin: 0; padding: 0; background: #ffffff; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .qr-print-page { width: 4in; height: 6in; overflow: hidden; break-after: page; page-break-after: always; }
    .qr-print-page:last-child { break-after: auto; page-break-after: auto; }
    .qr-card { zoom: 1.2; box-shadow: none !important; border-radius: 0 !important; }
`;
