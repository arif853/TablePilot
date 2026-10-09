import React from 'react';
import { HiOutlineChevronLeft, HiOutlineChevronRight } from 'react-icons/hi';

export default function Pagination({ meta, page, onPageChange }) {
    if (!meta || meta.last_page <= 1) return null;

    const from = (meta.current_page - 1) * meta.per_page + 1;
    const to = Math.min(meta.current_page * meta.per_page, meta.total);

    return (
        <div className="flex items-center justify-between mt-4 text-sm">
            <p className="text-gray-500">
                Showing <span className="font-medium text-gray-700">{from}–{to}</span> of{' '}
                <span className="font-medium text-gray-700">{meta.total}</span>
            </p>
            <div className="flex items-center gap-1.5">
                <button
                    onClick={() => onPageChange(page - 1)}
                    disabled={page <= 1}
                    className="btn-secondary px-2.5 py-1.5"
                    aria-label="Previous page"
                >
                    <HiOutlineChevronLeft className="w-4 h-4" />
                    <span className="hidden sm:inline">Previous</span>
                </button>
                <span className="px-2 text-gray-600 tabular">
                    {meta.current_page} / {meta.last_page}
                </span>
                <button
                    onClick={() => onPageChange(page + 1)}
                    disabled={page >= meta.last_page}
                    className="btn-secondary px-2.5 py-1.5"
                    aria-label="Next page"
                >
                    <span className="hidden sm:inline">Next</span>
                    <HiOutlineChevronRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
