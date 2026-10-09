import React from 'react';
import { useBrandingStore } from '../../stores/brandingStore';
import BrandLogo from './BrandLogo';

const STORAGE_URL = '/storage/';

/**
 * Small "Powered by" branding badge shown on restaurant dashboard and customer panels.
 * Configurable from super admin Settings → Platform Settings.
 */
export default function PoweredBy({ className = '', variant = 'light' }) {
    const { branding } = useBrandingStore();

    if (!branding.powered_by_text) return null;

    const textColor = variant === 'dark' ? 'text-gray-300' : 'text-gray-400';
    const logoSrc = branding.platform_logo
        ? STORAGE_URL + branding.platform_logo
        : null;

    const content = (
        <span className={`inline-flex items-center gap-1.5 text-xs ${textColor} ${className}`}>
            <BrandLogo src={logoSrc} alt="" className="h-4 w-auto" />
            <span>{branding.powered_by_text}</span>
        </span>
    );

    if (branding.powered_by_url) {
        return (
            <a
                href={branding.powered_by_url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:opacity-80 transition-opacity"
            >
                {content}
            </a>
        );
    }

    return content;
}
