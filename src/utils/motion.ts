import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function media(): MediaQueryList | undefined {
    return typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia(QUERY)
        : undefined;
}

function subscribe(onChange: () => void): () => void {
    const list = media();
    if (!list) {
        return () => undefined;
    }
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
}

const snapshot = (): boolean => media()?.matches ?? false;
const serverSnapshot = (): boolean => false;

/** True while the user asked the operating system for reduced motion; follows changes live. */
export function usePrefersReducedMotion(): boolean {
    return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

export type MotionLevel = "full" | "subtle" | "off";

/**
 * Effective motion: the Motion property, switched off by "Lively effects" = No (the 1.1 switch) and by the
 * user's reduced-motion preference.
 */
export function resolveMotion(motion: MotionLevel | undefined, lively: boolean, reducedMotion: boolean): MotionLevel {
    if (!lively || reducedMotion || motion === "off") {
        return "off";
    }
    return motion === "subtle" ? "subtle" : "full";
}
