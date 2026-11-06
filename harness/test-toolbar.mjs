// 1.3 toolbar options: every view bar item can be switched off.
//   node harness/build.mjs && node harness/test-toolbar.mjs
import { check, launch, outPath, pageUrl, summary, wait } from "./lib.mjs";

const { browser, page, errors } = await launch();
const bar = () =>
    page.evaluate(() => {
        const vb = document.querySelector(".mxt-dg-viewbar");
        return {
            views: vb ? [...vb.querySelectorAll("[data-vb]")].map(b => b.getAttribute("data-vb")) : null,
            actions: vb ? [...vb.querySelectorAll("[data-action]")].map(b => b.getAttribute("data-action")) : [],
            search: !!vb?.querySelector(".mxt-dg-vb-search")
        };
    });
const go = async query => {
    await page.setViewport({ width: 1400, height: 1000 });
    await page.goto(`${pageUrl}${query}`);
    await page.waitForSelector(".ag-row");
    await wait(600);
};
try {
    await go("?rows=8");
    let b = await bar();
    check("default: all six buttons and the more menu", ["hide", "filter", "sort", "group", "color", "height", "more"].every(id => b.views.includes(id)), b.views.join(","));
    check("default: export and new row", b.actions.includes("export") && b.actions.includes("add-row"), b.actions.join(","));
    await go("?rows=8&tb=hide,filter,sort,group,color,height,more,export,newrow");
    b = await bar();
    check("all off: no view buttons", b.views.length === 0, b.views.join(","));
    check("all off: no export or new row", !b.actions.includes("export") && !b.actions.includes("add-row"), b.actions.join(","));
    check("all off: search stays (own setting)", b.search);
    await page.screenshot({ path: outPath("toolbar-off.png"), clip: { x: 0, y: 0, width: 1400, height: 260 } });
    await go("?rows=8&tb=color,height,more");
    b = await bar();
    check("partly off: only hide, filter, sort, group left", b.views.join(",") === "hide,filter,sort,group", b.views.join(","));
    // the palette no longer offers hidden panels
    await page.keyboard.down("Control");
    await page.keyboard.press("k");
    await page.keyboard.up("Control");
    await wait(400);
    const palette = await page.evaluate(() => document.body.innerText);
    check("command palette drops Row height", !/Row height/.test(palette));
    check("no page errors", errors.length === 0, errors.join(" | "));
} catch (error) {
    console.log("FAIL exception", error.message);
    await page.screenshot({ path: outPath("toolbar-error.png") });
} finally {
    await browser.close();
    process.exit(summary() ? 1 : 0);
}
