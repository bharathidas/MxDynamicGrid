// Deterministic number formatting regardless of the machine locale.
if (typeof window !== "undefined" && typeof globalThis.navigator === "object") {
    // jsdom: keep its navigator (React DOM reads the user agent), only pin the language.
    Object.defineProperty(globalThis.navigator, "language", { value: "en-US", configurable: true });
} else {
    Object.defineProperty(globalThis, "navigator", {
        value: { language: "en-US" },
        configurable: true,
        writable: true
    });
}
