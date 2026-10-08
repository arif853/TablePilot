import React from 'react';

export default function LoadingSpinner({ fullScreen = false, size = 'md' }) {
    const sizeClasses = {
        sm: 'w-5 h-5',
        md: 'w-8 h-8',
        lg: 'w-12 h-12',
    };

    const spinner = (
        <div className={`${sizeClasses[size]} animate-spin rounded-full border-4 border-gray-200 border-t-brand-600`} />
    );

    if (fullScreen) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                {spinner}
            </div>
        );
    }

    return (
        <div className="flex items-center justify-center py-12">
            {spinner}
        </div>
    );
}
