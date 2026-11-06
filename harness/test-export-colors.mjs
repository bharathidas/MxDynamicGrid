// Excel export keeps the grid colours (row colour, option colours) when "Keep grid colours" is on.
//   node harness/build.mjs && node harness/test-export-colors.mjs
import { strFromU8, unzipSync } from "fflate";
import { check, launch, outPath, pageUrl, summary, wait } from "./lib.mjs";

const { browser, page, errors } = await launch();
const go = async query => {
    await page.setViewport({ width: 1400, height: 1000 });
    await page.goto(`${pageUrl}${query}`);
    await page.waitForSelector(".ag-row");
    await page.evaluate(() => {
        window.__blobs = [];
        const original = URL.createObjectURL;
        URL.createObjectURL = blob => {
            window.__blobs.push(blob);
            return original.call(URL, blob);
        };
    });
    await wait(600);
};
const exportXlsx = async keep => {
    await page.click("[data-action=export]");
    await page.waitForSelector("[data-action=do-export]");
    await wait(300);
    const shown = await page.$("[data-option=keep-colors]");
    const state = shown ? await page.$eval("[data-option=keep-colors]", e => e.checked) : null;
    if (shown && keep !== undefined && state !== keep) {
        await page.click("[data-option=keep-colors]");
    }
    await page.screenshot({ path: outPath(`export-dialog-${keep}.png`) });
    await page.click("[data-action=do-export]");
    await wait(800);
    const b64 = await page.evaluate(async () => {
        const blob = window.__blobs[window.__blobs.length - 1];
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let s = "";
        bytes.forEach(b => (s += String.fromCharCode(b)));
        return btoa(s);
    });
    const files = unzipSync(new Uint8Array(Buffer.from(b64, "base64")));
    return { shown: !!shown, state, styles: strFromU8(files["xl/styles.xml"]), sheet: strFromU8(files["xl/worksheets/sheet1.xml"]) };
};
try {
    await go("?rows=8");
    let r = await exportXlsx(true);
    check("checkbox shown for Excel and on by default", r.shown && r.state === true);
    const fills = [...r.styles.matchAll(/fgColor rgb="(\w+)"/g)].map(m => m[1]);
    check("kept: option colours become cell fills", ["FFFEF3C7", "FFDBEAFE", "FFDCFCE7"].some(c => fills.includes(c)), fills.join(","));
    await go("?rows=8");
    r = await exportXlsx(false);
    const plain = [...r.styles.matchAll(/fgColor rgb="(\w+)"/g)].map(m => m[1]);
    check("off: only the header fill", plain.length === 1, plain.join(","));
    await go("?rows=8&keepcolors=0");
    r = await exportXlsx(undefined);
    check("Studio Pro default off: checkbox starts unchecked", r.shown && r.state === false);
    // CSV: no checkbox
    await go("?rows=8");
    await page.click("[data-action=export]");
    await page.waitForSelector("[data-action=do-export]");
    await page.evaluate(() => [...document.querySelectorAll(".mxt-dg-card input")][1].click());
    await wait(300);
    check("CSV: no colour checkbox", !(await page.$("[data-option=keep-colors]")));
    check("no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
} finally {
    await browser.close();
}
summary();
