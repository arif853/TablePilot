import React from 'react';
import { useModuleGate } from '../hooks/useModule';

export function ModuleGate({ module: moduleKey, children, fallback = null, loading = null }) {
    const { hasAccess, isLoaded } = useModuleGate(moduleKey);

    // Prevent flicker while module permissions are loading
    if (!isLoaded) {
        return loading;
    }

    if (!hasAccess) {
        return fallback;
    }

    return children;
}
