type NavigationGuard = () => boolean;

let activeGuard: NavigationGuard | null = null;

export function setNavigationGuard(guard: NavigationGuard | null) {
    activeGuard = guard;
}

/** Returns true if navigation may proceed. */
export function confirmLeavePage(): boolean {
    if (!activeGuard) return true;
    try {
        return activeGuard();
    } catch {
        return true;
    }
}
