// 1.2 drop-1 checks: colour, board / calendar / gallery views, bulk edit, find and replace, hints, formula help.
//   node harness/build.mjs && node harness/test12.mjs
import { allOps, check, launch, outPath, pageUrl, settle, summary, wait } from "./lib.mjs";

const { browser, page, errors } = await launch();
const go = async (query, width = 1400) => {
    await page.setViewport({ width, height: 1000 });
    await page.goto(`${pageUrl}${query}`);
    await page.waitForSelector(".mxt-dg-viewbar");
    await wait(600);
};
const vb = async id => {
    await page.click(`[data-vb="${id}"]`);
    await page.waitForSelector(`[data-panel="${id}"]`);
    await wait(150);
};
const esc = async () => {
    await page.keyboard.press("Escape");
    await wait(200);
};
const addView = async type => {
    await page.click('[data-action="add-view"]');
    await page.waitForSelector(`[data-menu-id="view-${type}"]`);
    await page.click(`[data-menu-id="view-${type}"]`);
    await wait(500);
    if (await page.$(".mxt-dg-tab__rename")) {
        await page.focus(".mxt-dg-tab__rename");
        await page.keyboard.press("Enter");
    }
    await wait(300);
};
/** Drags with synthetic HTML5 drag events (headless Chrome does not do native DnD from puppeteer clicks). */
const dragTo = (from, to) =>
    page.evaluate(
        (a, b) => {
            const source = document.querySelector(a);
            const target = document.querySelector(b);
            if (!source || !target) {
                return false;
            }
            const data = new DataTransfer();
            const fire = (el, type) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data }));
            fire(source, "dragstart");
            fire(target, "dragenter");
            fire(target, "dragover");
            fire(target, "drop");
            fire(source, "dragend");
            return true;
        },
        from,
        to
    );

try {
    // ---- Colour -------------------------------------------------------------------------------------------
    await go("?rows=24");
    await vb("color");
    await page.click('[data-color-mode="select"]');
    await wait(300);
    await esc();
    const bg = await page.$eval('.ag-row[row-id="r1"]', el => el.style.backgroundColor);
    check("colour rows by a select field", bg !== "", bg);
    check("Color button is active", (await page.$eval('[data-vb="color"]', el => el.className)).includes("is-active"));
    await vb("color");
    await page.click('[data-color-mode="rules"]');
    await wait(150);
    await page.select('[data-color-rule="0"] [data-rule] select[aria-label="Field name"]', "qty").catch(async () => {
        await page.click('[data-color-rule="0"] [data-action="add-condition"]');
        await wait(100);
        await page.select('[data-color-rule="0"] [data-rule="0"] select[aria-label="Field name"]', "qty");
    });
    await wait(100);
    if (!(await page.$('[data-color-rule="0"] [data-rule="0"]'))) {
        await page.click('[data-color-rule="0"] [data-action="add-condition"]');
        await wait(100);
        await page.select('[data-color-rule="0"] [data-rule="0"] select[aria-label="Field name"]', "qty");
    }
    await page.select('[data-color-rule="0"] [data-rule="0"] select[aria-label="Operator"]', "gte");
    await page.type('[data-color-rule="0"] [data-rule="0"] input[aria-label="Value"]', "5");
    await wait(300);
    await page.screenshot({ path: outPath("30-color-rules.png") });
    await esc();
    const colored = await page.$$eval(".ag-row[row-id]", rows => rows.filter(r => r.style.backgroundColor).map(r => r.getAttribute("row-id")));
    check("colour by condition (qty ≥ 5) colours only matching rows", colored.includes("r5") && !colored.includes("r1"), colored.join(","));

    // ---- Board ----------------------------------------------------------------------------------------------
    await go("?rows=24");
    await addView("board");
    await page.waitForSelector('[data-view="board"]');
    const lanes = await page.$$eval("[data-lane]", els => els.map(e => e.getAttribute("data-lane")));
    check("board view shows a lane per option", ["todo", "doing", "done"].every(l => lanes.includes(l)), lanes.join(","));
    check("board tab shows the board icon", (await page.$$eval(".mxt-dg-tab__btn", els => els.map(e => e.textContent).join("|"))).includes("Board"));
    const cardsInDone = await page.$$eval('[data-lane="done"] [data-card]', els => els.length);
    check("cards show in lanes with counts", cardsInDone > 0 && (await page.$eval('[data-lane="done"] .mxt-dg-lane__count', el => el.textContent)) === String(cardsInDone));
    await page.screenshot({ path: outPath("31-board.png") });
    await dragTo('[data-card="r1"]', '[data-lane="done"]');
    await settle(page);
    check("dragging a card to another lane sends setCell", (await allOps(page)).some(op => op.op === "setCell" && op.row === "r1" && op.col === "status" && op.value === "done"));
    check("card moved lane", Boolean(await page.$('[data-lane="done"] [data-card="r1"]')));
    await page.$eval('[data-lane="doing"] [data-action="lane-add"]', el => el.click());
    await settle(page);
    check("adding in a lane presets the lane value", (await allOps(page)).some(op => op.op === "addRow" && op.values.status === "doing"), JSON.stringify((await allOps(page)).filter(op => op.op === "addRow")));

    // ---- Calendar --------------------------------------------------------------------------------------------
    await addView("calendar");
    await page.waitForSelector('[data-view="calendar"]');
    const items = await page.$$eval(".mxt-dg-cal__item", els => els.length);
    check("calendar shows rows on their dates", items > 0, `${items}`);
    await page.screenshot({ path: outPath("32-calendar.png") });
    const firstItem = await page.$eval(".mxt-dg-cal__item", el => el.getAttribute("data-card"));
    const firstDay = await page.$eval(".mxt-dg-cal__item", el => el.closest("[data-day]").getAttribute("data-day"));
    const target = await page.$$eval("[data-day]:not(.is-outside)", (els, d) => els.map(e => e.getAttribute("data-day")).find(x => x !== d), firstDay);
    await dragTo(`.mxt-dg-cal__item[data-card="${firstItem}"]`, `[data-day="${target}"]`);
    await settle(page);
    check("dragging a calendar item reschedules it", (await allOps(page)).some(op => op.op === "setCell" && op.row === firstItem && op.col === "due" && op.value === target), `${firstItem} -> ${target}`);
    await page.click('[data-action="cal-week"]');
    await wait(300);
    check("week mode shows 7 days", (await page.$$eval("[data-day]", els => els.length)) === 7);

    // ---- Gallery --------------------------------------------------------------------------------------------
    await addView("gallery");
    await page.waitForSelector('[data-view="gallery"]');
    check("gallery shows a card per row", (await page.$$eval(".mxt-dg-gcard[data-card]", els => els.length)) >= 20);
    await page.screenshot({ path: outPath("33-gallery.png") });
    await page.click('.mxt-dg-gcard[data-card="r3"]');
    await page.waitForSelector(".mxt-dg-drawer");
    check("clicking a card opens the record", true);
    await esc();

    // ---- Bulk edit ------------------------------------------------------------------------------------------
    await go("?rows=24");
    for (const key of ["r2", "r3", "r4"]) {
        await page.hover(`.ag-row[row-id="${key}"] [col-id="name"]`);
        await page.click(`.ag-row[row-id="${key}"] [data-action="select-row"]`);
        await wait(80);
    }
    await page.click('[data-action="bulk-edit"]');
    await page.waitForSelector("[data-bulk-field]");
    await page.select("[data-bulk-field]", "status");
    await wait(150);
    await page.click("[data-bulk-value] .mxt-dg-chippick__chip:nth-child(3)");
    await page.screenshot({ path: outPath("34-bulk-edit.png") });
    await page.click('[data-action="bulk-apply"]');
    await settle(page);
    const bulk = (await allOps(page)).filter(op => op.op === "setCell" && op.col === "status" && op.value === "done");
    check("bulk edit sends one setCell per selected row", ["r2", "r3", "r4"].every(k => bulk.some(op => op.row === k)), JSON.stringify(bulk));
    check("bulk edit is one change set", (await page.evaluate(() => window.harness.changeSets.length)) === 1);

    // ---- Find and replace ------------------------------------------------------------------------------------
    await page.click('.ag-row[row-id="r5"] [col-id="name"]');
    await page.keyboard.down("Control");
    await page.keyboard.press("h");
    await page.keyboard.up("Control");
    await page.waitForSelector("[data-find]");
    await page.type("[data-find]", "acme");
    await page.type("[data-replace]", "Apex");
    await wait(200);
    const matchCount = await page.$eval("[data-matches]", el => Number(el.getAttribute("data-matches")));
    check("find shows a preview count", matchCount === 3, `${matchCount}`);
    await page.click(".mxt-dg-findreplace .mxt-dg-check input");
    await wait(150);
    check("match case changes the count", (await page.$eval("[data-matches]", el => Number(el.getAttribute("data-matches")))) === 0);
    await page.click(".mxt-dg-findreplace .mxt-dg-check input");
    await wait(150);
    await page.screenshot({ path: outPath("35-find-replace.png") });
    await page.click('[data-action="replace-all"]');
    await settle(page);
    const replaced = (await allOps(page)).filter(op => op.op === "setCell" && op.col === "name" && String(op.value).startsWith("Apex"));
    check("replace all writes the replaced values", replaced.length === 3, JSON.stringify(replaced.map(op => op.value)));

    // ---- Formula help and live result -------------------------------------------------------------------------
    await page.click('.mxt-dg-header[data-col="total"] .mxt-dg-header__caption');
    await page.waitForSelector('[data-menu-id="edit"]');
    await page.click('[data-menu-id="edit"]');
    await page.waitForSelector(".mxt-dg-formula__input");
    await page.click(".mxt-dg-formula__input", { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type(".mxt-dg-formula__input", "ROUND({Price} * 1.21, ");
    await wait(200);
    check("formula editor shows function help", (await page.$eval("[data-formula-help]", el => el.textContent)).includes("ROUND(number, decimals)"));
    await page.type(".mxt-dg-formula__input", "1)");
    await wait(200);
    check("formula editor shows the live result for the first row", /12\.1/.test(await page.$eval("[data-formula-result]", el => el.textContent)));
    await page.screenshot({ path: outPath("36-formula-help.png") });
    await esc();

    // ---- Hints ---------------------------------------------------------------------------------------------------
    await page.evaluate(() => localStorage.removeItem("mxt-dg-hints-v1"));
    await go("?rows=10&hints=1");
    await page.waitForSelector('[data-hint="1"]');
    check("first coach mark shows", true);
    await page.screenshot({ path: outPath("37-hints.png") });
    await page.click('[data-action="hint-next"]');
    await page.waitForSelector('[data-hint="2"]');
    await page.click('[data-action="hint-done"]');
    await wait(200);
    check("Got it remembers the hints", (await page.evaluate(() => localStorage.getItem("mxt-dg-hints-v1"))) === "done" && !(await page.$("[data-hint]")));
    await go("?rows=10&hints=1");
    check("hints do not show again", !(await page.$("[data-hint]")));
} catch (error) {
    check("1.2 harness ran without exceptions", false, error.stack);
} finally {
    check("no page errors (1.2)", errors.length === 0, errors.join(" | "));
    const failed = summary();
    await browser.close();
    process.exitCode = failed ? 1 : 0;
}
