// Shared helpers of the browser harness tests.
import puppeteer from "puppeteer-core";
import { fileURLToPath, pathToFileURL } from "node:url";

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
export const pageUrl = pathToFileURL(fileURLToPath(new URL("index.html", import.meta.url))).href;
export const outPath = name => fileURLToPath(new URL(`out/${name}`, import.meta.url));
export const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

let passed = 0;
let failed = 0;
export function check(name, ok, detail = "") {
    if (ok) {
        passed++;
        console.log(`PASS ${name}`);
    } else {
        failed++;
        console.log(`FAIL ${name}${detail ? ` - ${String(detail).slice(0, 300)}` : ""}`);
    }
}
export function summary() {
    console.log(`\n${passed} passed, ${failed} failed`);
    return failed;
}

export async function launch() {
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
        if (message.type() === "error") {
            errors.push(message.text());
            if (process.env.TRACE_ERRORS) console.log("ERROR>", message.text().slice(0, 120));
        }
    });
    return { browser, page, errors };
}

export async function open(page, query = "", width = 1400) {
    await page.setViewport({ width, height: 900 });
    // The 1.0 checks run the legacy toolbar (vb=0); test11.mjs covers the 1.1 view bar.
    const q = query.includes("vb=") ? query : `${query}${query.includes("?") ? "&" : "?"}vb=0`;
    await page.goto(`${pageUrl}${q}`);
    await page.waitForSelector(".ag-row");
    await wait(400);
}

export const cellSel = (row, col) => `.ag-row[row-id="${row}"]:not(.ag-row-pinned) [col-id="${col}"]`;
export const cellText = (page, row, col) =>
    page.evaluate(sel => document.querySelector(sel)?.textContent ?? null, cellSel(row, col));
export const changeSets = page => page.evaluate(() => window.harness.changeSets.map(json => JSON.parse(json)));
export const lastOps = async page => {
    const sets = await changeSets(page);
    return sets.length ? sets[sets.length - 1].ops : [];
};
export const allOps = async page => (await changeSets(page)).flatMap(set => set.ops);
export const db = page => page.evaluate(() => window.harness.db());
export const events = (page, name) => page.evaluate(n => window.harness.events.filter(e => e.name === n), name);

/** Waits until the save cycle is idle (no unsaved changes, not saving). */
export async function settle(page, ms = 4000) {
    const start = Date.now();
    await wait(250);
    while (Date.now() - start < ms) {
        const state = await page.evaluate(() => document.querySelector("[data-save-state]")?.getAttribute("data-save-state"));
        const dirty = await page.evaluate(() => document.querySelector(".mxt-dg-savestate")?.textContent ?? "");
        if ((state === "saved" || state === "idle" || state === "error" || !state) && !/unsaved/i.test(dirty)) {
            await wait(300);
            return state;
        }
        await wait(100);
    }
    return "timeout";
}

/** Opens the header menu of a column and clicks an item by its data-menu-id. */
export async function columnMenu(page, col, item) {
    await page.click(`.mxt-dg-header[data-col="${col}"] .mxt-dg-header__menu`);
    await page.waitForSelector(`.mxt-dg-menu [data-menu-id="${item}"]`);
    await page.click(`.mxt-dg-menu [data-menu-id="${item}"]`);
    await wait(200);
}

/** Replaces the text of an input (React-friendly). */
export async function typeInto(page, selector, text) {
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.down("Control");
    await page.keyboard.press("a");
    await page.keyboard.up("Control");
    await page.keyboard.press("Backspace");
    if (text) {
        await page.type(selector, text);
    }
}

/** Dispatches a paste event with TSV text on the grid. */
export async function paste(page, text) {
    await page.evaluate(t => {
        const data = new DataTransfer();
        data.setData("text/plain", t);
        const target = document.activeElement && document.querySelector(".mxt-dg")?.contains(document.activeElement) ? document.activeElement : document.querySelector(".ag-cell-focus") ?? document.querySelector(".mxt-dg");
        target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    }, text);
    await wait(300);
}

export async function downloads(page, count, ms = 4000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
        const list = await page.evaluate(() => window.harness.downloads);
        if (list.length >= count) {
            return list;
        }
        await wait(100);
    }
    return page.evaluate(() => window.harness.downloads);
}

/** Clicks a cell, scrolling the grid body vertically until the row is rendered. */
export async function clickCell(page, row, col, options = {}) {
    const selector = cellSel(row, col);
    for (const position of [null, 0, 99999]) {
        if (position !== null) {
            await page.evaluate(top => document.querySelector(".ag-grid-viewport, .ag-body-viewport")?.scrollTo(0, top), position);
            await wait(250);
        }
        if (await page.$(selector)) {
            await page.$eval(selector, el => el.scrollIntoView({ block: "center", inline: "nearest" }));
            await wait(150);
            await page.click(selector, options);
            return;
        }
    }
    throw new Error(`cell ${row}/${col} not rendered`);
}
