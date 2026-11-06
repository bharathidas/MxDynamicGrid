// Bundles the widget with mocked Mendix props for the browser harness: node harness/build.mjs
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
await build({
    entryPoints: [here + "entry.tsx"],
    outdir: here + "dist",
    bundle: true,
    format: "iife",
    jsx: "automatic",
    target: "es2020",
    alias: {
        mendix: here + "shim-mendix.ts",
        "mendix/filters/builders": here + "../src/__mocks__/mendixFilters.ts"
    },
    define: { "process.env.NODE_ENV": '"development"' },
    logLevel: "warning"
});
console.log("harness bundle written");
