// Renders widget icons/tiles from SVG with headless Chrome (transparent background).
// usage: node make-icons.mjs <widgetName> <srcDir>   (puppeteer-core resolved from the widget's node_modules)
import { createRequire } from "node:module";
import path from "node:path";

const [, , name, srcDir] = process.argv;
const require = createRequire(path.join(srcDir, "..", "package.json"));
const puppeteer = require("puppeteer-core");

const L = { ink: "#264ae5", surface: "#e8f0fe", muted: "#b8c7f8", accent: "#0ea58f" };
const D = { ink: "#ffffff", surface: "#2e3440", muted: "#626770", accent: "#0ea58f" };

const art = {
    MxDynamicGrid: c => `
        <rect x="4" y="8" width="44" height="48" rx="5" fill="none" stroke="${c.ink}" stroke-width="3"/>
        <path d="M4 20h44M4 32h44M4 44h44M19 8v48M34 8v48" stroke="${c.muted}" stroke-width="2.5"/>
        <rect x="4" y="8" width="44" height="12" rx="5" fill="${c.ink}"/>
        <circle cx="54" cy="14" r="8" fill="${c.accent}"/>
        <path d="M54 10v8M50 14h8" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>
        <rect x="22" y="35" width="10" height="6" rx="3" fill="${c.accent}"/>`,
    MxTree: c => `
        <rect x="22" y="8" width="20" height="12" rx="3" fill="${c.ink}"/>
        <path d="M32 20v8M12 28h40M12 28v8M52 28v8M32 28v8" stroke="${c.muted}" stroke-width="3" fill="none" stroke-linecap="round"/>
        <rect x="3" y="36" width="18" height="12" rx="3" fill="${c.ink}"/>
        <rect x="23" y="36" width="18" height="12" rx="3" fill="${c.accent}"/>
        <rect x="43" y="36" width="18" height="12" rx="3" fill="${c.ink}"/>
        <path d="M32 48v6h10" stroke="${c.muted}" stroke-width="3" fill="none" stroke-linecap="round"/>
        <rect x="42" y="50" width="14" height="9" rx="2.5" fill="${c.muted}"/>`,
    MxFlow: c => `
        <circle cx="12" cy="14" r="7" fill="${c.accent}"/>
        <path d="M19 14h10M32 21v8M32 43v4M39 36h6" stroke="${c.muted}" stroke-width="3" fill="none" stroke-linecap="round"/>
        <rect x="22" y="6" width="20" height="15" rx="3.5" fill="${c.ink}"/>
        <path d="M32 29l7 7-7 7-7-7z" fill="${c.ink}"/>
        <rect x="45" y="29" width="15" height="14" rx="3" fill="${c.muted}"/>
        <rect x="22" y="47" width="20" height="13" rx="6.5" fill="none" stroke="${c.ink}" stroke-width="3"/>`,
    MxMap: c => `
        <path d="M6 14l16-6 20 6 16-6v42l-16 6-20-6-16 6z" fill="${c.surface}" stroke="${c.muted}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M22 8v42M42 14v42" stroke="${c.muted}" stroke-width="3"/>
        <path d="M12 40c8-2 12-12 22-10s12-6 16-8" stroke="${c.accent}" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="1 5"/>
        <path d="M32 6c-7 0-12 5-12 11.5C20 26 32 38 32 38s12-12 12-20.5C44 11 39 6 32 6z" fill="${c.ink}"/>
        <circle cx="32" cy="17.5" r="4.5" fill="${c.surface}"/>`
};

function icon(c) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${art[name](c)}</svg>`;
}
function tile(c) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="192" viewBox="0 0 256 192">
        <rect x="8" y="8" width="240" height="176" rx="22" fill="${c.surface}"/>
        <g transform="translate(64 32) scale(2)">${art[name](c)}</g></svg>`;
}

const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true
});
try {
    const page = await browser.newPage();
    const shots = [
        [`${name}.icon.png`, icon(L), 64, 64],
        [`${name}.icon.dark.png`, icon(D), 64, 64],
        [`${name}.tile.png`, tile(L), 256, 192],
        [`${name}.tile.dark.png`, tile(D), 256, 192]
    ];
    for (const [file, svg, w, h] of shots) {
        await page.setViewport({ width: w, height: h });
        await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
        await page.screenshot({ path: path.join(srcDir, file), omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
        console.log("wrote", file);
    }
} finally {
    await browser.close();
}
