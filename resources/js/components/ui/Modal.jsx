import React from 'react';
import { HiOutlineX } from 'react-icons/hi';

export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
    if (!isOpen) return null;

    const sizeClasses = {
        sm: 'max-w-md',
        md: 'max-w-lg',
        lg: 'max-w-2xl',
        xl: 'max-w-4xl',
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-end sm:items-center justify-center min-h-screen px-0 sm:px-4 pt-4 pb-0 sm:pb-20 text-center">
                {/* Backdrop */}
                <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm transition-opacity" onClick={onClose} />

                {/* Modal Panel */}
                <div className={`relative inline-block w-full ${sizeClasses[size]} text-left align-middle bg-white shadow-2xl ring-1 ring-gray-900/5 rounded-t-2xl sm:rounded-2xl transform transition-all max-h-[90vh] sm:max-h-[85vh] overflow-y-auto`}>
                    {/* Header */}
                    <div className="flex items-center justify-between gap-4 px-4 sm:px-6 py-4 border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur z-10">
                        <h3 className="text-lg font-semibold tracking-tight text-gray-900">{title}</h3>
                        <button
                            onClick={onClose}
                            className="p-1.5 -mr-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
                            aria-label="Close"
                        >
                            <HiOutlineX className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-4 sm:p-6">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}
