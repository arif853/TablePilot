import React, { useEffect, useState } from 'react';

/**
 * An uploaded logo that falls back to `fallback` (usually the name as text) if the image
 * can't load, e.g. when the server's public/storage link is missing.
 */
export default function BrandLogo({ src, alt, className, fallback = null }) {
    const [failed, setFailed] = useState(false);

    // A new logo gets a fresh chance to load
    useEffect(() => setFailed(false), [src]);

    if (!src || failed) return fallback;

    return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}
