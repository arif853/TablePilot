import React from 'react';

export default function Pagination({ meta, page, onPageChange }) {
    if (!meta || meta.last_page <= 1) return null;

    const from = (meta.current_page - 1) * meta.per_page + 1;
    const to = Math.min(meta.current_page * meta.per_page, meta.total);

    return (
        <div className="flex items-center justify-between mt-4 text-sm">
            <p className="text-gray-500">
                {from}–{to} of {meta.total}
            </p>
            <div className="flex items-center gap-2">
                <button
                    onClick={() => onPageChange(page - 1)}
                    disabled={page <= 1}
                    className="btn-secondary px-3 py-1 text-sm disabled:opacity-50"
                >
                    Previous
                </button>
                <span className="text-gray-600">
                    {meta.current_page} / {meta.last_page}
                </span>
                <button
                    onClick={() => onPageChange(page + 1)}
                    disabled={page >= meta.last_page}
                    className="btn-secondary px-3 py-1 text-sm disabled:opacity-50"
                >
                    Next
                </button>
            </div>
        </div>
    );
}
