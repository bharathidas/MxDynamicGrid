// 1.2 drop-2 checks: linked records, lookup / rollup, comments, history, locked rows, palette, print, presence,
// rows changed by others and the conflict banner.
//   node harness/build.mjs && node harness/test12b.mjs
import { allOps, cellSel, cellText, check, db, launch, outPath, pageUrl, settle, summary, wait } from "./lib.mjs";

const { browser, page, errors } = await launch();
const go = async (query, width = 1400) => {
    await page.setViewport({ width, height: 1000 });
    await page.goto(`${pageUrl}${query}`);
    await page.waitForSelector(".ag-row");
    await wait(600);
};
const esc = async () => {
    await page.keyboard.press("Escape");
    await wait(200);
};
const scrollTo = col =>
    page.evaluate(c => {
        const api = document.querySelector(".mxt-dg")?.__api;
        const header = document.querySelector(`.ag-header-cell[col-id="${c}"]`);
        header?.scrollIntoView({ inline: "center" });
        return Boolean(api || header);
    }, col);

try {
    // ---- Linked records, lookup and rollup ---------------------------------------------------------------
    await go("?rows=12&links=1");
    await page.evaluate(() => {
        const viewport = document.querySelector(".ag-center-cols-viewport") || document.querySelector(".ag-body-horizontal-scroll-viewport");
        if (viewport) viewport.scrollLeft = 99999;
        const h = document.querySelector(".ag-body-horizontal-scroll-viewport");
        if (h) h.scrollLeft = 99999;
    });
    await wait(500);
    check("linked chip shows the label", (await cellText(page, "r1", "contact"))?.includes("Contact 1"), await cellText(page, "r1", "contact"));
    check("lookup reads the linked city", (await cellText(page, "r2", "contactCity")) === "Paris", await cellText(page, "r2", "contactCity"));
    check("rollup sums the linked score", (await cellText(page, "r2", "contactScore"))?.includes("20"), await cellText(page, "r2", "contactScore"));
    check("empty link gives empty lookup", ((await cellText(page, "r3", "contactCity")) ?? "").trim() === "");
    await page.click(cellSel("r3", "contact"));
    await page.keyboard.press("Enter");
    await page.waitForSelector(".mxt-dg-linkpicker [data-link]", { timeout: 3000 });
    const targets = await page.$$eval(".mxt-dg-linkpicker [data-link]", els => els.map(e => e.getAttribute("data-link")));
    check("picker lists only the target grid", targets.length === 5 && targets.every(k => k.startsWith("c")), targets.join(","));
    await page.type(".mxt-dg-linkpicker .mxt-dg-optionlist__search", "4");
    await wait(150);
    await page.click('.mxt-dg-linkpicker [data-link="c4"]');
    await wait(100);
    await page.keyboard.press("Enter");
    await settle(page);
    const linkOp = (await allOps(page)).find(op => op.op === "setCell" && op.row === "r3" && op.col === "contact");
    check("link edit sends an array of keys", Array.isArray(linkOp?.value) && linkOp.value[0] === "c4", JSON.stringify(linkOp));
    await wait(300);
    check("lookup follows the new link", (await cellText(page, "r3", "contactCity")) === "Rome", await cellText(page, "r3", "contactCity"));
    await page.screenshot({ path: outPath("12b-links.png") });

    // ---- Comments, history, locks, presence --------------------------------------------------------------
    await go("?rows=12&collab=1");
    check("comment marker on r1 name", Boolean(await page.$('[data-comment-marker="r1:name"]')));
    check("row comment icon on r2", Boolean(await page.$('.ag-row[row-id="r2"] .mxt-dg-rownum__comments')));
    await page.click('[data-comment-marker="r1:name"]');
    await page.waitForSelector("[data-thread]");
    const open = await page.$$eval("[data-thread] > .mxt-dg-thread__list [data-comment]", els => els.length);
    check("thread shows the open comment", open === 1, open);
    check("mention highlighted", Boolean(await page.$("[data-thread] .mxt-dg-mention")));
    await page.click("[data-comment-input]");
    await page.keyboard.type("Looks fine @Cid");
    await wait(150);
    check("mention suggestions", Boolean(await page.$(".mxt-dg-thread__mentions button")));
    await page.click(".mxt-dg-thread__mentions button");
    await page.keyboard.type("thanks");
    await page.screenshot({ path: outPath("12b-thread.png") });
    await page.keyboard.down("Control");
    await page.keyboard.press("Enter");
    await page.keyboard.up("Control");
    await settle(page);
    const addOp = (await allOps(page)).find(op => op.op === "addComment");
    check(
        "addComment op with mentions",
        addOp?.comment?.row === "r1" && addOp.comment.col === "name" && addOp.comment.mentions?.includes("Cid Moe"),
        JSON.stringify(addOp)
    );
    await wait(300);
    const dbComments = await page.evaluate(() => window.harness.comments().length);
    check("comment stored by the save microflow", dbComments === 4, dbComments);
    await page.click('[data-thread] [data-action="resolve-comment"]');
    await settle(page);
    const resolveOp = (await allOps(page)).find(op => op.op === "resolveComment");
    check("resolveComment op", resolveOp?.resolved === true && resolveOp.comment === "k1", JSON.stringify(resolveOp));
    await esc();

    // Drawer: comments + history
    await page.click('.ag-row[row-id="r1"] [data-action="expand-row"]');
    await page.waitForSelector(".mxt-dg-drawer");
    await wait(300);
    check("drawer title from the first column", (await page.$eval("[data-record-title]", el => el.textContent)).includes("Acme 1"));
    check("drawer history timeline", (await page.$$eval("[data-drawer-history] .mxt-dg-timeline__item", els => els.length)) === 3);
    check("history is newest first", (await page.$eval("[data-drawer-history] .mxt-dg-timeline__item", el => el.textContent)).includes("Cid Moe"));
    check("drawer comments section", Boolean(await page.$("[data-drawer-comments] [data-thread]")));
    await page.screenshot({ path: outPath("12b-drawer.png") });
    await esc();
    await esc();

    // Locked row
    check("padlock on locked row", Boolean(await page.$('.ag-row[row-id="r4"] .mxt-dg-rownum__lock')));
    check("locked row class", Boolean(await page.$('.ag-row[row-id="r4"].mxt-dg-row--locked')));
    const before = await page.evaluate(() => window.harness.changeSets.length);
    await page.click(cellSel("r4", "name"));
    await page.keyboard.press("Enter");
    await wait(300);
    check("locked row does not open an editor", !(await page.$(".ag-cell-inline-editing, .ag-popup-editor")));
    await esc();
    await page.click(cellSel("r4", "qty"));
    await page.keyboard.press("Delete");
    await settle(page);
    check("locked row ignores Delete", (await page.evaluate(() => window.harness.changeSets.length)) === before);

    // Presence
    const presence = await page.$eval("[data-presence]", el => Number(el.getAttribute("data-presence")));
    check("presence lists other viewers (not me)", presence === 5, presence);
    check("presence overflow +1", (await page.$eval(".mxt-dg-presence__more", el => el.textContent)) === "+1");

    // Changed by others
    await page.evaluate(() => window.harness.externalEdit("r6", "qty", 99, "Bob Ray"));
    await wait(400);
    check("updated-by dot", (await page.$eval('.ag-row[row-id="r6"] [data-updated-by]', el => el.getAttribute("data-updated-by"))) === "Bob Ray");
    check("updated row class", Boolean(await page.$('.ag-row[row-id="r6"].mxt-dg-row--updated')));
    check("external value shown", (await cellText(page, "r6", "qty")) === "99");
    await page.screenshot({ path: outPath("12b-collab.png") });

    // Conflict: manual save keeps a pending edit, someone else changes the same row
    await go("?rows=12&collab=1&save=manual");
    await page.click('.ag-row[row-id="r5"] [data-action="expand-row"]');
    await page.waitForSelector(".mxt-dg-drawer");
    await page.click("#mxt-dg-field-r5-qty", { clickCount: 3 });
    await page.keyboard.type("7");
    await page.keyboard.press("Tab");
    await wait(300);
    await page.evaluate(() => window.harness.externalEdit("r5", "price", 1, "Cid Moe"));
    await wait(500);
    check("conflict banner", Boolean(await page.$(".mxt-dg-drawer [data-conflict]")));
    await page.screenshot({ path: outPath("12b-conflict.png") });
    await esc();

    // ---- Command palette and print ------------------------------------------------------------------------
    await go("?rows=12&collab=1");
    await page.click(cellSel("r2", "qty"));
    await page.keyboard.type("5");
    await page.keyboard.press("Enter");
    await settle(page);
    await page.click(cellSel("r3", "qty"));
    await page.keyboard.down("Control");
    await page.keyboard.press("k");
    await page.keyboard.up("Control");
    await page.waitForSelector("[data-palette]");
    check("Ctrl+K opens the palette", true);
    await wait(350);
    check("palette shows undo history", (await page.$$("[data-undo-step]")).length >= 1);
    check("own save is not flagged as changed by others", !(await page.$('.ag-row[row-id="r2"] [data-updated-by]')));
    await page.screenshot({ path: outPath("12b-palette.png") });
    await page.keyboard.type("print");
    await wait(150);
    const shown = await page.$$eval("[data-command]", els => els.map(e => e.getAttribute("data-command")));
    check("palette filters commands", shown.length >= 1 && shown[0] === "print", shown.join(","));
    await page.keyboard.press("Enter");
    await wait(600);
    const prints = await page.evaluate(() => window.harness.prints);
    check("print renders the current view", prints.length === 1 && prints[0].includes("<table") && prints[0].includes("Acme 1"), prints.length);
    check("palette closed after run", !(await page.$("[data-palette]")));
    await page.click(cellSel("r3", "qty"));
    await page.keyboard.down("Control");
    await page.keyboard.press("k");
    await page.keyboard.up("Control");
    await page.waitForSelector('[data-undo-step="1"]');
    await page.click('[data-undo-step="1"]');
    await settle(page);
    const rows = (await db(page)).rows;
    check("undo from the palette history", rows.find(r => r.key === "r2").data.qty !== 5, rows.find(r => r.key === "r2").data.qty);

    // ---- Narrow width ----------------------------------------------------------------------------------------
    await go("?rows=12&collab=1", 1024);
    await page.click('[data-comment-marker="r1:name"]');
    await page.waitForSelector("[data-thread]");
    await page.screenshot({ path: outPath("12b-thread-1024.png") });
    await esc();

    check("no page errors", errors.length === 0, errors.join(" | "));
} catch (error) {
    console.log("FAIL exception", error.message);
    await page.screenshot({ path: outPath("12b-error.png") });
} finally {
    await browser.close();
    process.exit(summary() ? 1 : 0);
}
