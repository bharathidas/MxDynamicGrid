// Second half of the harness checks (called from test.mjs): record drawer edits of every type, grouping,
// totals, filters, manual save, server errors, export, import, dark mode and motion off.
import { writeFileSync } from "node:fs";
import { allOps, cellSel, clickCell, check, columnMenu, downloads, events, open, outPath, settle, typeInto, wait } from "./lib.mjs";

export async function run({ page }) {
    // ---- Record drawer: edit every editable type ------------------------------------------------------------
    await open(page, "?rows=40");
    await clickCell(page, "r10", "name");
    await page.click('.ag-row[row-id="r10"] [data-action="expand-row"]');
    await page.waitForSelector(".mxt-dg-drawer");
    await wait(300);
    await page.screenshot({ path: outPath("05-record-drawer.png") });
    const field = col => `.mxt-dg-recfield[data-col="${col}"]`;
    const text = async (col, value) => {
        await typeInto(page, `${field(col)} input, ${field(col)} textarea`, value);
        await wait(80);
    };
    await text("name", "Drawer name");
    await text("price", "1234.5");
    await text("qty", "7");
    await text("share", "35");
    await text("site", "mendix.com");
    await text("mail", "team@example.com");
    await text("owner", "Dee Fox");
    await text("notes", "Line A");
    await page.$eval(`${field("due")} input`, el => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        setter.call(el, "2026-12-24");
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.click(`${field("done")} input[type=checkbox]`);
    await page.click(`${field("rating")} .mxt-dg-star:nth-child(4)`);
    await page.$eval(`${field("progress")} input[type=range]`, el => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        setter.call(el, "80");
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.click(`${field("status")} .mxt-dg-chippick__chip:nth-child(3)`);
    await page.click(`${field("tags")} .mxt-dg-chippick__chip:nth-child(3)`);
    await settle(page);
    const ops = (await allOps(page)).filter(op => op.op === "setCell" && op.row === "r10");
    const last = col => ops.filter(op => op.col === col).pop()?.value;
    const expect = {
        name: "Drawer name",
        price: 1234.5,
        qty: 7,
        share: 0.35,
        site: "mendix.com",
        mail: "team@example.com",
        owner: "Dee Fox",
        notes: "Line A",
        due: "2026-12-24",
        done: false,
        rating: 4,
        progress: 80,
        status: "done"
    };
    Object.entries(expect).forEach(([col, value]) =>
        check(`drawer edits ${col}`, JSON.stringify(last(col)) === JSON.stringify(value), JSON.stringify(last(col)))
    );
    check("drawer edits multiSelect", Array.isArray(last("tags")) && last("tags").includes("internal"), JSON.stringify(last("tags")));
    await page.click('.mxt-dg-drawer [aria-label="Next"]');
    await wait(200);
    check("drawer next navigates", /11/.test(await page.$eval(".mxt-dg-drawer h3", el => el.textContent)));
    await page.keyboard.press("Escape");
    await wait(200);
    const total = await page.evaluate(() => document.querySelector('.ag-row[row-id="r10"] [col-id="total"]')?.textContent);
    check("formula recomputes (price * qty)", total === "8,641.50", total);

    // ---- Filters ----------------------------------------------------------------------------------------------
    await page.type('.mxt-dg-header[data-col="name"] .mxt-dg-filter-input', "Acme");
    await wait(500);
    const filtered = await page.evaluate(() => document.querySelector('[data-status="rows"]')?.textContent ?? "");
    check("text header filter narrows rows", /of/.test(filtered) && /^5 of|5 of/.test(filtered), filtered);
    await typeInto(page, '.mxt-dg-header[data-col="name"] .mxt-dg-filter-input', "");
    await page.click('.mxt-dg-header[data-col="status"] .mxt-dg-filter-set');
    await page.waitForSelector(".mxt-dg-setlist");
    await page.click(".mxt-dg-setlist__all input");
    await page.click(".mxt-dg-setlist__items .mxt-dg-setlist__item:nth-child(1) input");
    await wait(300);
    const setFiltered = await page.evaluate(() => document.querySelector('[data-status="rows"]')?.textContent ?? "");
    check("set filter narrows rows", /of/.test(setFiltered), setFiltered);
    await page.keyboard.press("Escape");
    await page.type(".mxt-dg-search input", "Globex");
    await wait(1500);
    const searched = await page.evaluate(() => new Set([...document.querySelectorAll(".ag-row[row-id]:not(.ag-row-pinned)")].map(r => r.getAttribute("row-id"))).size);
    check("quick search filters", searched > 0 && searched <= 5, `${searched}`);
    await page.screenshot({ path: outPath("06-filters.png") });

    // ---- Grouping and totals ----------------------------------------------------------------------------------
    await open(page, "?rows=40");
    await columnMenu(page, "status", "group");
    await wait(400);
    await page.click('[data-action="group-by"]');
    await page.waitForSelector('.mxt-dg-menu [data-menu-id="collapse"]');
    await page.click('.mxt-dg-menu [data-menu-id="collapse"]');
    await wait(400);
    const groups = await page.evaluate(() => [...document.querySelectorAll(".mxt-dg-group")].map(g => g.querySelector(".mxt-dg-group__label").textContent + ":" + g.querySelector(".mxt-dg-group__count").textContent));
    check("group by status shows 3 groups", groups.length === 3, groups.join(", "));
    check("group rows show aggregates", await page.evaluate(() => Boolean(document.querySelector(".mxt-dg-group__agg"))));
    const totals = await page.evaluate(() => document.querySelector('.ag-row-pinned [col-id="price"]')?.textContent ?? "");
    check("totals footer shows the sum", /SUM/i.test(totals) && /€/.test(totals), totals);
    await page.click(".mxt-dg-group__toggle");
    await wait(300);
    const expandedOne = await page.evaluate(() => new Set([...document.querySelectorAll(".ag-row[row-id]:not(.ag-row-pinned)")].map(r => r.getAttribute("row-id"))).size);
    check("expanding one group shows its rows", expandedOne > 3, `${expandedOne}`);
    const collapsed = await page.evaluate(() => new Set([...document.querySelectorAll(".ag-row[row-id]:not(.ag-row-pinned)")].map(r => r.getAttribute("row-id"))).size);
    check("grouped view shows fewer rows than data", collapsed < 40, `${collapsed}`);
    await page.screenshot({ path: outPath("07-grouped.png") });

    // ---- Manual save ------------------------------------------------------------------------------------------
    await open(page, "?rows=20&save=manual");
    await clickCell(page, "r2", "name");
    await page.click(`${cellSel("r1", "done")} input`);
    await wait(400);
    check("manual mode shows the save bar", await page.evaluate(() => Boolean(document.querySelector(".mxt-dg-savebar"))));
    check("manual mode does not save by itself", (await page.evaluate(() => window.harness.changeSets.length)) === 0);
    await page.screenshot({ path: outPath("08-manual-savebar.png") });
    await page.keyboard.down("Control");
    await page.keyboard.press("s");
    await page.keyboard.up("Control");
    await settle(page);
    const manual = await page.evaluate(() => window.harness.changeSets.map(s => JSON.parse(s)));
    check(
        "Ctrl+S sends the change set v1",
        manual.length === 1 && manual[0].v === 1 && manual[0].baseVersion === 1 && manual[0].ops[0].op === "setCell" && manual[0].ops[0].value === false && manual[0].ops[0].row === "r1",
        JSON.stringify(manual)
    );
    check("datasources reloaded after save", (await page.evaluate(() => window.harness.reloads())) >= 2);

    // ---- Server result errors ---------------------------------------------------------------------------------
    await open(page, "?rows=20&fail=1");
    await clickCell(page, "r2", "name");
    await page.keyboard.press("Enter");
    await page.waitForSelector(".mxt-dg-editor-input");
    await typeInto(page, ".mxt-dg-editor-input", "Will fail");
    await page.keyboard.press("Enter");
    await settle(page);
    check("failed save shows the error state", (await page.evaluate(() => document.querySelector("[data-save-state]")?.getAttribute("data-save-state"))) === "error");
    check("server error mapped onto the cell", await page.evaluate(() => Boolean(document.querySelector('.ag-row[row-id="r2"] [col-id="name"].mxt-dg-td--invalid'))));
    check("failed edit is kept (not lost)", (await page.evaluate(() => document.querySelector('.ag-row[row-id="r2"] [col-id="name"]')?.textContent)) === "Will fail");
    await page.screenshot({ path: outPath("09-server-error.png") });
    await page.click('[data-action="retry"]');
    await settle(page);
    check("retry saves the kept ops", (await page.evaluate(() => window.harness.db().rows.find(r => r.key === "r2").data.name)) === "Will fail");

    // ---- Export ---------------------------------------------------------------------------------------------
    await open(page, "?rows=20");
    await clickCell(page, "r1", "name");
    await page.keyboard.press("Enter");
    await page.waitForSelector(".mxt-dg-editor-input");
    await typeInto(page, ".mxt-dg-editor-input", "=HYPERLINK(1)");
    await page.keyboard.press("Enter");
    await settle(page);
    await page.click('[data-action="export"]');
    await page.waitForSelector('[data-action="do-export"]');
    await page.click('[data-action="do-export"]');
    let files = await downloads(page, 1);
    const xlsx = files[0];
    check("xlsx export downloaded", xlsx?.name?.endsWith(".xlsx"), xlsx?.name);
    const sheet = xlsx?.text ?? "";
    check("xlsx has merged header group", /<mergeCell ref="[A-Z]+\d+:[A-Z]+\d+"\/>/.test(sheet));
    check("xlsx has autofilter and frozen header", /<autoFilter /.test(sheet) && /state="frozen"/.test(sheet));
    check("xlsx numbers are numeric cells", /<c r="[A-Z]+\d+"( s="\d+")?><v>12\.5<\/v><\/c>/.test(sheet));
    check("xlsx has a currency number format", /formatCode="&quot;€ &quot;#,##0.00"|formatCode="&quot;€&quot;/.test(xlsx?.files?.["xl/styles.xml"] ?? ""));
    check("xlsx date format from the column", /formatCode="dd-mm-yyyy"/.test(xlsx?.files?.["xl/styles.xml"] ?? ""));
    check("xlsx escapes formula text (quotePrefix)", /quotePrefix="1"/.test(xlsx?.files?.["xl/styles.xml"] ?? ""));
    check("xlsx title row", sheet.includes("Project list"));
    check("before/after export events", (await events(page, "beforeExport")).length === 1 && (await events(page, "afterExport")).length === 1);
    await page.click('[data-action="export"]');
    await page.waitForSelector('[data-action="do-export"]');
    await page.click(".mxt-dg-card:nth-child(2)");
    await page.click('[data-action="do-export"]');
    files = await downloads(page, 2);
    const csv = files[1]?.text ?? "";
    writeFileSync(outPath("export.csv"), csv);
    check("csv export downloaded with BOM", csv.charCodeAt(0) === 0xfeff, files[1]?.name);
    check("csv escapes formula injection", csv.includes("'=HYPERLINK(1)"));
    check("csv quotes fields with commas (RFC 4180)", /"Urgent, Client"/.test(csv));
    check("csv dates are ISO", /2026-01-01/.test(csv));

    // ---- Import -------------------------------------------------------------------------------------------
    const importFile = outPath("import.csv");
    writeFileSync(importFile, "Name,Price,Region\nImported A,9.5,North\nImported B,11,South\nImported C,13.25,North\n");
    const before = (await page.evaluate(() => window.harness.db())).rows.length;
    await page.click('[data-action="import"]');
    const input = await page.waitForSelector('.mxt-dg-import input[type="file"]');
    await input.uploadFile(importFile);
    await page.waitForSelector(".mxt-dg-mapping");
    await page.screenshot({ path: outPath("10-import-mapping.png") });
    await page.click('[data-action="do-import"]');
    await settle(page);
    const after = await page.evaluate(() => window.harness.db());
    check("import adds 3 rows", after.rows.length === before + 3, `${before} -> ${after.rows.length}`);
    check("import maps Price to the existing field", after.rows.some(r => r.data.price === 13.25));
    check("import creates the missing Region field", after.columns.some(c => c.caption === "Region"));

    // ---- Server mode: view state ----------------------------------------------------------------------------
    await open(page, "?rows=30&mode=server&paging=buttons&pageSize=10");
    await page.type(".mxt-dg-search input", "Acme");
    await page.click('.mxt-dg-header[data-col="price"] .mxt-dg-header__caption');
    await wait(700);
    const viewState = JSON.parse((await page.evaluate(() => window.harness.viewState())) || "{}");
    check(
        "server mode writes the view state JSON",
        viewState.search === "Acme" && viewState.sort?.[0]?.col === "price" && viewState.limit === 10 && viewState.offset === 0,
        JSON.stringify(viewState)
    );
    await page.click('.mxt-dg-pager [aria-label="Next page"]');
    await wait(500);
    const paged = JSON.parse((await page.evaluate(() => window.harness.viewState())) || "{}");
    check("server paging moves the offset", paged.offset === 10, JSON.stringify(paged));
    check("pager shows x to y of total", /11 to 20 of 30/.test(await page.$eval('[data-status="paging"]', el => el.textContent)));

    // ---- Dark mode and motion off ---------------------------------------------------------------------------
    await open(page, "?rows=30&dark=1");
    check("dark mode class", await page.evaluate(() => Boolean(document.querySelector(".mxt-dg.mxt-dg--dark"))));
    await page.screenshot({ path: outPath("11-dark.png") });
    await open(page, "?rows=30&motion=off");
    check("motion off class", await page.evaluate(() => Boolean(document.querySelector(".mxt-dg.mxt-dg--motion-off"))));
    const animation = await page.evaluate(() => getComputedStyle(document.querySelector(".mxt-dg-addcol")).transitionDuration);
    check("motion off disables transitions", animation === "0s", animation);
    await page.screenshot({ path: outPath("12-motion-off.png") });
}
