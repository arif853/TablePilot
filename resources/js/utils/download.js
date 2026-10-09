// File download helpers for reports.

function triggerDownload(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

function filenameFromHeaders(headers, fallback) {
    const disposition = headers?.['content-disposition'] || '';
    const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
    return match ? decodeURIComponent(match[1]) : fallback;
}

/**
 * Save an axios `responseType: 'blob'` response, using the server's filename.
 */
export function saveBlobResponse(response, fallbackName) {
    triggerDownload(response.data, filenameFromHeaders(response.headers, fallbackName));
}

/**
 * Pull the JSON error message out of a failed blob request.
 */
export async function blobErrorMessage(error, fallback = 'Download failed') {
    const data = error?.response?.data;
    if (data instanceof Blob) {
        try {
            const json = JSON.parse(await data.text());
            return json.message || fallback;
        } catch {
            return fallback;
        }
    }
    return error?.response?.data?.message || fallback;
}

const csvCell = (value) => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * Build and download a CSV from an array of rows (each row an array of cells).
 * Adds a UTF-8 BOM so Excel renders non-ASCII text correctly.
 */
export function downloadCsv(filename, rows) {
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    triggerDownload(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }), filename);
}
