import { cellText, launch, pageUrl, wait } from "./lib.mjs";
const { browser, page, errors } = await launch();
await page.setViewport({ width: 1400, height: 1000 });
await page.goto(`${pageUrl}?rows=12&collab=1`);
await page.waitForSelector(".ag-row");
await wait(600);
await page.evaluate(() => window.harness.externalEdit("r6", "qty", 99, "Bob Ray"));
for (const ms of [100, 400, 1000]) {
    await wait(ms);
    console.log(
        ms,
        await cellText(page, "r6", "qty"),
        await page.evaluate(() => document.querySelector('.ag-row[row-id="r6"]')?.className),
        await page.evaluate(() => document.querySelector('.ag-row[row-id="r6"] .mxt-dg-rownum')?.outerHTML?.slice(0, 300))
    );
}
console.log(errors);
await browser.close();
