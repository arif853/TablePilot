import React, { useRef, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import html2canvas from 'html2canvas';
import toast from 'react-hot-toast';
import { HiOutlineDownload, HiOutlinePrinter, HiOutlineLink, HiOutlineCheck } from 'react-icons/hi';
import Modal from './ui/Modal';
import QRCardFace, { QR_CARD_PAGE_STYLE } from './qr/QRCardFace';

// 4x the 320x480 design = 1280x1920 px, i.e. 320 dpi at 4x6 in
const EXPORT_SCALE = 4;

const slugify = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Preview, print and download a single QR card.
 * `card` = { label, title, qrUrl, fileName } (e.g. a table, or the takeaway card).
 */
export default function TableQRCard({ isOpen, onClose, tenant, card }) {
    const printRef = useRef(null);
    const cardRef = useRef(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [copied, setCopied] = useState(false);

    const baseName = [slugify(tenant?.name), card?.fileName].filter(Boolean).join('-') || 'qr-card';

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: baseName,
        pageStyle: QR_CARD_PAGE_STYLE,
        onPrintError: () => toast.error('Could not open the print dialog'),
    });

    const handleDownload = async () => {
        if (isDownloading || !cardRef.current) return;
        setIsDownloading(true);

        // html2canvas measures font baselines with a probe <img>; Tailwind's preflight makes images
        // display:block, which shifts every line of text down in the export. Restore inline images
        // for the duration of the capture.
        const baselineFix = document.createElement('style');
        baselineFix.textContent = 'img { display: inline-block !important; }';
        document.head.appendChild(baselineFix);

        try {
            await document.fonts?.ready;
            const canvas = await html2canvas(cardRef.current, {
                scale: EXPORT_SCALE,
                backgroundColor: '#ffffff',
                useCORS: true,
                logging: false,
                // Export a flat, square-cornered card (the shadow and rounding are for the on-screen preview)
                onclone: (_doc, clone) => {
                    clone.style.boxShadow = 'none';
                    clone.style.borderRadius = '0';
                },
            });
            baselineFix.remove();

            const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
            if (!blob) throw new Error('Empty image');

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${baseName}.png`;
            link.click();
            URL.revokeObjectURL(url);
            toast.success('QR card downloaded');
        } catch (error) {
            console.error('QR card download failed', error);
            toast.error('Failed to download the QR card');
        } finally {
            baselineFix.remove();
            setIsDownloading(false);
        }
    };

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(card.qrUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Could not copy the link');
        }
    };

    if (!card) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`QR Card · ${card.label} ${card.title}`} size="lg">
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-5">
                    {/* Live preview: exactly what prints and downloads */}
                    <div className="flex-1 flex justify-center rounded-xl bg-gray-100 py-6 px-4">
                        <div ref={printRef}>
                            <div className="qr-print-page">
                                <QRCardFace ref={cardRef} tenant={tenant} label={card.label} title={card.title} qrUrl={card.qrUrl} />
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="sm:w-52 flex flex-col gap-2">
                        <button onClick={handlePrint} disabled={!card.qrUrl} className="btn-primary flex items-center justify-center gap-2">
                            <HiOutlinePrinter className="w-5 h-5" />
                            Print card
                        </button>
                        <button
                            onClick={handleDownload}
                            disabled={!card.qrUrl || isDownloading}
                            className="btn-secondary flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <HiOutlineDownload className="w-5 h-5" />
                            {isDownloading ? 'Preparing…' : 'Download PNG'}
                        </button>
                        <button
                            onClick={handleCopyLink}
                            disabled={!card.qrUrl}
                            className="btn-secondary flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {copied ? <HiOutlineCheck className="w-5 h-5 text-green-600" /> : <HiOutlineLink className="w-5 h-5" />}
                            {copied ? 'Link copied' : 'Copy order link'}
                        </button>

                        <div className="mt-2 rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600 space-y-1.5">
                            <p className="font-semibold text-gray-800">Printing tips</p>
                            <p>Prints at 4 × 6 in, one card per page. Pick the 4×6 / postcard paper size, or "Fit to page" on A4.</p>
                            <p>The PNG is 1280 × 1920 px, sharp enough for professional printing.</p>
                            <p>Laminate table cards so they last.</p>
                        </div>
                    </div>
                </div>

                {card.qrUrl && (
                    <p className="text-[11px] text-gray-400 break-all">
                        Opens: <span className="font-mono">{card.qrUrl}</span>
                    </p>
                )}
            </div>
        </Modal>
    );
}
