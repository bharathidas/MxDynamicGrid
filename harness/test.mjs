// Drives the harness in headless Chrome and prints PASS/FAIL per check:
//   node harness/build.mjs && node harness/test.mjs
// Screenshots are written to harness/out.
import { writeFileSync } from "node:fs";
import {
    allOps,
    clickCell,
    cellSel,
    cellText,
    changeSets,
    check,
    columnMenu,
    db,
    downloads,
    launch,
    open,
    outPath,
    paste,
    settle,
    summary,
    typeInto,
    wait
} from "./lib.mjs";

const { browser, page, errors } = await launch();
try {
    // ---- 1. Large data: 5,000 rows -----------------------------------------------------------------------
    const t0 = Date.now();
    await open(page, "?rows=5000");
    const renderMs = Date.now() - t0;
    const status5k = await page.evaluate(() => document.querySelector('[data-status="rows"]')?.textContent ?? "");
    check("renders 5,000 rows (virtualised)", /5,?000/.test(status5k), status5k);
    check("5,000 rows render within 8 s", renderMs < 8000, `${renderMs} ms`);
    await page.screenshot({ path: outPath("01-5k-rows.png") });

    // ---- 2. Dynamic columns: add, rename, retype, delete -------------------------------------------------
    await open(page, "?rows=40");
    await page.click('[data-action="add-column"]');
    await page.waitForSelector(".mxt-dg-coleditor");
    await typeInto(page, ".mxt-dg-coleditor input.form-control", "Budget");
    await page.click('.mxt-dg-typelist [data-type="decimal"]');
    await wait(150);
    await page.screenshot({ path: outPath("02-add-column-popover.png") });
    await page.click('[data-action="submit-column"]');
    await settle(page);
    let ops = await allOps(page);
    const added = ops.find(op => op.op === "addColumn");
    check("add column sends addColumn op", added && added.col.caption === "Budget" && added.col.type === "decimal", JSON.stringify(added));
    const budgetKey = added?.col.key;
    check("add column key is a UUID", /^[0-9a-f-]{36}$/.test(budgetKey ?? ""), budgetKey);
    check("added column header shown", await page.evaluate(k => Boolean(document.querySelector(`.mxt-dg-header[data-col="${k}"]`)), budgetKey));
    check("database got the column", (await db(page)).columns.some(c => c.key === budgetKey));

    // Rename by double-clicking the header.
    await page.click(`.mxt-dg-header[data-col="${budgetKey}"] .mxt-dg-header__caption`, { clickCount: 2 });
    await page.waitForSelector(".mxt-dg-header__rename");
    await typeInto(page, ".mxt-dg-header__rename", "Budget 2026");
    await page.keyboard.press("Enter");
    await settle(page);
    ops = await allOps(page);
    check(
        "rename sends updateColumn caption",
        ops.some(op => op.op === "updateColumn" && op.col === budgetKey && op.patch.caption === "Budget 2026")
    );

    // Retype "Qty" (number) to text with the conversion preview.
    await columnMenu(page, "qty", "type");
    await page.waitForSelector(".mxt-dg-coleditor");
    await page.click('.mxt-dg-typelist [data-type="select"]');
    await wait(200);
    const preview = await page.evaluate(() => document.querySelector(".mxt-dg-conversion")?.textContent ?? "");
    check("type change shows a conversion preview", /convert|cleared/i.test(preview), preview);
    await page.screenshot({ path: outPath("03-retype-preview.png") });
    await page.click('[data-action="submit-column"]');
    await settle(page);
    ops = await lastOps2();
    const retype = ops.find(op => op.op === "updateColumn" && op.col === "qty");
    check("retype sends updateColumn type + options", retype?.patch.type === "select" && Array.isArray(retype.patch.options), JSON.stringify(retype));
    check("retype sends converted cell values", ops.some(op => op.op === "setCell" && op.col === "qty" && typeof op.value === "string"));

    // Delete with confirm, then undo.
    await columnMenu(page, budgetKey, "delete");
    await page.waitForSelector('[data-action="confirm"]');
    await page.click('[data-action="confirm"]');
    await settle(page);
    check("delete column sends deleteColumn", (await allOps(page)).some(op => op.op === "deleteColumn" && op.col === budgetKey));
    check("deleted column is gone", !(await page.evaluate(k => Boolean(document.querySelector(`.mxt-dg-header[data-col="${k}"]`)), budgetKey)));
    await page.click('[data-action="undo"]');
    await settle(page);
    check("undo restores the deleted column", await page.evaluate(k => Boolean(document.querySelector(`.mxt-dg-header[data-col="${k}"]`)), budgetKey));

    async function lastOps2() {
        const sets = await changeSets(page);
        return sets.slice(-2).flatMap(set => set.ops);
    }

    // ---- 3. Rows: add, edit, paste, fill, undo/redo --------------------------------------------------------
    const rowsBefore = (await db(page)).rows.length;
    await page.click('[data-action="add-row"]');
    await settle(page);
    ops = await allOps(page);
    const addRow = ops.filter(op => op.op === "addRow").pop();
    check("add row sends addRow op", Boolean(addRow) && typeof addRow.index === "number");
    check("database has the new row", (await db(page)).rows.length === rowsBefore + 1);

    // Grid editing with the keyboard: name of r1.
    await clickCell(page, "r1", "name");
    await page.keyboard.press("Enter");
    await page.waitForSelector(".mxt-dg-editor-input");
    await typeInto(page, ".mxt-dg-editor-input", "Acme Renamed");
    await page.keyboard.press("Enter");
    await settle(page);
    check("text cell edit sends setCell", (await allOps(page)).some(op => op.op === "setCell" && op.row === "r1" && op.col === "name" && op.value === "Acme Renamed"));
    check("edited value shown", (await cellText(page, "r1", "name")) === "Acme Renamed");

    // Number cell by typing (starts the editor with the key).
    await clickCell(page, "r2", "price");
    await page.keyboard.type("42");
    await page.keyboard.press("Enter");
    await settle(page);
    check("currency cell typed edit", (await allOps(page)).some(op => op.op === "setCell" && op.row === "r2" && op.col === "price" && op.value === 42));

    // Paste a 3x3 block at r3/name: name, status, tags.
    await clickCell(page, "r3", "name");
    await paste(page, "P1\tDone\tUrgent\r\nP2\tTo do\tClient, Internal\r\nP3\tIn progress\tBrand new");
    await settle(page);
    ops = await allOps(page);
    const pasted = ops.filter(op => op.op === "setCell" && ["r3", "r4", "r5"].includes(op.row) && ["name", "status", "tags"].includes(op.col));
    check("paste 3x3 writes 9 cells", pasted.length >= 9, JSON.stringify(pasted.map(op => `${op.row}.${op.col}=${JSON.stringify(op.value)}`)));
    check("paste maps select labels to values", pasted.some(op => op.row === "r3" && op.col === "status" && op.value === "done"));
    check("paste creates a new option", ops.some(op => op.op === "updateColumn" && op.col === "tags" && op.patch.options?.some(o => o.label === "Brand new")));
    await page.screenshot({ path: outPath("04-after-paste.png") });

    // Fill down: select qty? use rating r6..r9 then Ctrl+D.
    await clickCell(page, "r6", "progress");
    await page.keyboard.down("Shift");
    await clickCell(page, "r9", "progress");
    await page.keyboard.up("Shift");
    await wait(150);
    const top = await page.evaluate(() => window.harness.db().rows.find(r => r.key === "r6").data.progress);
    await page.keyboard.down("Control");
    await page.keyboard.press("d");
    await page.keyboard.up("Control");
    await settle(page);
    const filled = (await allOps(page)).filter(op => op.op === "setCell" && op.col === "progress" && ["r7", "r8", "r9"].includes(op.row));
    check("fill down (Ctrl+D) copies the first value", filled.length === 3 && filled.every(op => op.value === top), JSON.stringify(filled));
    const statusRange = await page.evaluate(() => document.querySelector('[data-status="range"]')?.textContent ?? "");
    check("status bar shows range aggregates", /Sum/.test(statusRange), statusRange);

    // Undo / redo of the fill.
    await page.click('[data-action="undo"]');
    await settle(page);
    const afterUndo = await page.evaluate(() => window.harness.db().rows.find(r => r.key === "r9").data.progress);
    check("undo reverts the fill", afterUndo !== top, `${afterUndo} vs ${top}`);
    await page.click('[data-action="redo"]');
    await settle(page);
    const afterRedo = await page.evaluate(() => window.harness.db().rows.find(r => r.key === "r9").data.progress);
    check("redo re-applies the fill", afterRedo === top, `${afterRedo} vs ${top}`);

    // Enter on the last row adds a row.
    await page.evaluate(() => document.querySelector(".ag-grid-viewport, .ag-body-viewport").scrollTo(0, 99999));
    await wait(300);
    const lastKey = await page.evaluate(() => {
        const rows = [...document.querySelectorAll(".ag-row[row-index]:not(.ag-row-pinned)")];
        return rows.sort((a, b) => Number(b.getAttribute("row-index")) - Number(a.getAttribute("row-index")))[0]?.getAttribute("row-id");
    });
    const countBeforeEnter = (await db(page)).rows.length;
    await clickCell(page, lastKey, "name");
    await page.keyboard.press("Enter");
    await page.waitForSelector(".mxt-dg-editor-input");
    await page.keyboard.type("Last");
    await page.keyboard.press("Enter");
    await settle(page);
    check("Enter on the last row adds a row", (await db(page)).rows.length === countBeforeEnter + 1);

    writeFileSync(outPath("changesets-part1.json"), JSON.stringify(await changeSets(page), null, 2));
    await import("./test-part2.mjs").then(module => module.run({ page, errors }));
} catch (error) {
    check("harness ran without exceptions", false, error.stack);
} finally {
    check("no page errors", errors.length === 0, errors.join(" | "));
    const failed = summary();
    await browser.close();
    process.exitCode = failed ? 1 : 0;
}

