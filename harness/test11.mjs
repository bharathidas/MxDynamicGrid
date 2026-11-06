// 1.1 checks: view bar popovers, filter builder, sort, group, hide fields, row height, view tabs, summary bar,
// row hover checkbox/expand, inline new row, save pill, auto height, templates, field dialog, empty states.
//   node harness/build.mjs && node harness/test11.mjs
import { allOps, check, launch, outPath, pageUrl, settle, summary, typeInto, wait } from "./lib.mjs";

const { browser, page, errors } = await launch();
const go = async (query, width = 1400) => {
    await page.setViewport({ width, height: 1000 });
    await page.goto(`${pageUrl}${query}`);
    await page.waitForSelector(".mxt-dg-viewbar");
    await wait(600);
};
const rowsStatus = () => page.evaluate(() => document.querySelector('[data-status="rows"]')?.textContent ?? "");
const vb = async id => {
    await page.click(`[data-vb="${id}"]`);
    await page.waitForSelector(`[data-panel="${id}"]`);
    await wait(150);
};
const closePopover = async () => {
    await page.keyboard.press("Escape");
    await wait(200);
};
const uniqueRows = () =>
    page.evaluate(() => new Set([...document.querySelectorAll(".ag-row[row-id]:not(.ag-row-pinned)")].map(r => r.getAttribute("row-id"))).size);

try {
    // ---- View bar and auto height --------------------------------------------------------------------------
    await go("?rows=40");
    const labels = await page.$$eval(".mxt-dg-vb-btn__label", els => els.map(e => e.textContent));
    check("view bar has labelled buttons", ["Hide fields", "Filter", "Sort", "Group", "Row height"].every(l => labels.includes(l)), labels.join(","));
    check("legacy icon toolbar is gone", !(await page.$(".mxt-dg-toolbar")));
    check("no separate checkbox column", !(await page.$('[col-id="ag-Grid-SelectionColumn"]')));
    const tall = await page.$eval(".mxt-dg-body", el => el.getBoundingClientRect().height);
    check("auto height grows up to the 640px maximum", tall > 400 && tall <= 641, `${tall}`);
    check("+ Add field header has a label", (await page.$eval('[data-action="add-column"]', el => el.textContent)).includes("Add field"));
    await page.screenshot({ path: outPath("20-viewbar.png") });

    // ---- Filter builder ------------------------------------------------------------------------------------
    await vb("filter");
    await page.click('[data-action="add-condition"]');
    await wait(150);
    await page.select('[data-rule="0"] select[aria-label="Field name"]', "status");
    await wait(100);
    await page.select('[data-rule="0"] select[aria-label="Operator"]', "is");
    await page.select('[data-rule="0"] select[aria-label="Value"]', "done");
    await wait(500);
    await page.screenshot({ path: outPath("21-filter-builder.png") });
    await closePopover();
    check("filter rule narrows rows", /of 40/.test(await rowsStatus()), await rowsStatus());
    check("filter button shows the count", (await page.$eval('[data-vb="filter"]', el => el.textContent)).includes("(1)"));
    await page.type(".mxt-dg-vb-search input", "zzzz");
    await wait(700);
    check("no-match empty state with Clear filters", Boolean(await page.$('[data-empty="filtered"] [data-action="clear-filters"]')));
    await page.click('[data-action="clear-filters"]');
    await wait(500);
    check("Clear filters restores all rows", /^40/.test((await rowsStatus()).trim()), await rowsStatus());

    // ---- Sort, group, hide fields, row height ------------------------------------------------------------
    await vb("sort");
    await page.click('[data-action="add-sort"]');
    await wait(150);
    await page.click('[data-panel="sort"] .mxt-dg-seg button:nth-child(2)');
    await wait(300);
    await closePopover();
    check("sort button shows the count", (await page.$eval('[data-vb="sort"]', el => el.textContent)).includes("(1)"));
    const firstName = await page.$eval('.ag-row[row-index="0"] [col-id="name"]', el => el.textContent);
    check("sort applied (Z to A)", /Wonka|Wayne|Umbrella/.test(firstName), firstName);

    await vb("group");
    await page.click('[data-action="add-group"]');
    await wait(150);
    await page.select('[data-panel="group"] select', "status");
    await wait(400);
    await closePopover();
    const groups = await page.$$eval(".mxt-dg-group", els => els.length);
    check("group panel groups rows", groups >= 2, `${groups}`);
    await page.screenshot({ path: outPath("22-grouped.png") });
    await vb("group");
    await page.click('[data-panel="group"] .mxt-dg-vp-remove');
    await closePopover();

    await vb("hide");
    await page.click('[data-panel="hide"] .mxt-dg-vp-field:nth-child(3) .mxt-dg-switch');
    await wait(300);
    await closePopover();
    check("hide fields hides a column", (await page.$eval('[data-vb="hide"]', el => el.textContent)).includes("(1)"));
    check("hidden column header gone", !(await page.$('.mxt-dg-header[data-col="tags"]')));

    await vb("height");
    await page.click('[data-height="tall"]');
    await wait(400);
    await closePopover();
    const rowH = await page.$eval('.ag-row[row-index="1"]', el => el.getBoundingClientRect().height);
    check("row height tall = 56px", Math.round(rowH) === 56, `${rowH}`);

    // ---- View tabs ---------------------------------------------------------------------------------------------
    await page.click('[data-action="add-view"]');
    await page.waitForSelector('[data-menu-id="view-grid"]');
    await page.click('[data-menu-id="view-grid"]');
    await wait(400);
    await page.keyboard.press("Enter");
    await wait(300);
    const tabCount = await page.$$eval(".mxt-dg-tab", els => els.length);
    check("add view creates a tab", tabCount >= 1 && (await page.$$eval(".mxt-dg-tab__btn", els => els.map(e => e.textContent).join(","))).includes("View 1"));
    await vb("sort");
    await page.click('[data-panel="sort"] .mxt-dg-vp-remove');
    await closePopover();
    check("changed view shows the unsaved dot", Boolean(await page.$(".mxt-dg-tab__dot")));
    await page.click('[data-action="save-view"]');
    await wait(300);
    check("Save view clears the dot", !(await page.$(".mxt-dg-tab__dot")));
    await page.screenshot({ path: outPath("23-view-tabs.png") });

    // ---- Summary bar ------------------------------------------------------------------------------------------
    await page.click('[data-summary="price"]');
    await page.waitForSelector('[data-menu-id="sum-avg"]');
    await page.click('[data-menu-id="sum-avg"]');
    await wait(300);
    check("summary bar shows the chosen function", /Average/.test(await page.$eval('[data-summary="price"]', el => el.textContent)));
    await page.click('[data-summary="name"]');
    await page.waitForSelector('[data-menu-id="sum-unique"]');
    await page.click('[data-menu-id="sum-unique"]');
    await wait(300);
    check("summary bar: unique count for text", /Unique\s*40/.test(await page.$eval('[data-summary="name"]', el => el.textContent)));

    // ---- Rows: hover checkbox, expand, inline new row, save pill ------------------------------------------------
    await go("?rows=8");
    const small = await page.$eval(".mxt-dg-body", el => el.getBoundingClientRect().height);
    check("auto height shrinks for few rows", small < 520, `${small}`);
    await page.hover('.ag-row[row-id="r2"] [col-id="name"]');
    await wait(150);
    const visible = await page.$eval('.ag-row[row-id="r2"] [data-action="select-row"]', el => getComputedStyle(el).display !== "none");
    check("row number turns into a checkbox on hover", visible);
    await page.click('.ag-row[row-id="r2"] [data-action="select-row"]');
    await wait(200);
    check("hover checkbox selects the row", (await page.evaluate(() => window.harness.events.filter(e => e.name === "setSelection").length)) > 0);
    await page.click('.ag-row[row-id="r3"] [data-action="expand-row"]');
    await page.waitForSelector(".mxt-dg-drawer");
    check("expand opens the record", true);
    await page.keyboard.press("Escape");
    await wait(300);
    const before = (await page.evaluate(() => window.harness.db())).rows.length;
    await page.click('[data-action="new-row-inline"]');
    await settle(page);
    check("inline + New row adds a row", (await page.evaluate(() => window.harness.db())).rows.length === before + 1);
    check("save pill shows All changes saved", /All changes saved/.test(await page.$eval("[data-save-state]", el => el.textContent)));
    check("no dashed add-row bar", !(await page.$(".mxt-dg-addrow")));
    await page.screenshot({ path: outPath("24-rows.png") });

    // ---- Field dialog: search, groups, preview ------------------------------------------------------------------
    await page.click('[data-action="add-column"]');
    await page.waitForSelector(".mxt-dg-typelist");
    check("type list is grouped", (await page.$$eval(".mxt-dg-typelist__title", els => els.length)) >= 6);
    await page.type(".mxt-dg-typesearch", "curr");
    await wait(150);
    const listed = await page.$$eval(".mxt-dg-typelist__item", els => els.map(e => e.getAttribute("data-type")));
    check("type search filters the list", listed.length === 1 && listed[0] === "currency", listed.join(","));
    await page.click('[data-type="currency"]');
    await wait(150);
    check("live preview cell renders the type", /2,480|2\.480/.test(await page.$eval('[data-preview="currency"]', el => el.textContent)));
    await page.screenshot({ path: outPath("25-field-dialog.png") });
    await page.keyboard.press("Escape");
    await wait(200);

    // ---- Header click opens the field menu ---------------------------------------------------------------------
    await page.click('.mxt-dg-header[data-col="qty"] .mxt-dg-header__caption');
    await page.waitForSelector('[data-menu-id="freeze"]');
    check("header click opens the field menu with Freeze and Filter by", Boolean(await page.$('[data-menu-id="filterBy"]')));
    await page.click('[data-menu-id="filterBy"]');
    await page.waitForSelector('[data-panel="filter"] [data-rule="0"]');
    check("Filter by this field opens the filter with a rule", true);
    await closePopover();

    // ---- Templates ---------------------------------------------------------------------------------------------
    await page.setViewport({ width: 1400, height: 1000 });
    await page.goto(`${pageUrl}?rows=0&empty=1`);
    await page.waitForSelector(".mxt-dg-templates");
    await wait(300);
    await page.screenshot({ path: outPath("26-templates.png") });
    check("empty grid shows 5 template cards", (await page.$$eval(".mxt-dg-tplcard", els => els.length)) === 5);
    await page.click('[data-template="tasks"]');
    await settle(page, 5000);
    const ops = await allOps(page);
    check("template emits addColumn ops", ops.filter(op => op.op === "addColumn").length === 6, `${ops.filter(op => op.op === "addColumn").length}`);
    check("template adds sample rows", ops.filter(op => op.op === "addRow").length === 3);
    await wait(500);
    check("grid shows the template rows", (await uniqueRows()) >= 3);
    await page.screenshot({ path: outPath("27-template-applied.png") });

    // ---- Dark and narrow -------------------------------------------------------------------------------------
    await go("?rows=40&dark=1", 1024);
    await page.screenshot({ path: outPath("28-dark-1024.png") });
    check("view bar fits at 1024px", (await page.$eval(".mxt-dg-viewbar", el => el.scrollWidth <= el.clientWidth + 1)));
    await go("?rows=40", 700);
    await page.screenshot({ path: outPath("29-narrow-700.png") });
    check("labels collapse on narrow widths", (await page.$eval(".mxt-dg-vb-btn__label", el => getComputedStyle(el).display)) === "none");
    void typeInto;
} catch (error) {
    check("1.1 harness ran without exceptions", false, error.stack);
} finally {
    check("no page errors (1.1)", errors.length === 0, errors.join(" | "));
    const failed = summary();
    await browser.close();
    process.exitCode = failed ? 1 : 0;
}
