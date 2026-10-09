import { useModuleStore } from '../stores/moduleStore';

export function useModule(moduleKey) {
    const isLoaded = useModuleStore((s) => s.isLoaded);
    const hasModule = useModuleStore((s) => s.hasModule);

    if (!isLoaded) {
        return false;
    }

    return hasModule(moduleKey);
}

export function useModuleGate(moduleKey) {
    const hasAccess = useModule(moduleKey);
    const isLoaded = useModuleStore((s) => s.isLoaded);

    return {
        hasAccess,
        denied: isLoaded && !hasAccess,
        isLoaded,
    };
}
