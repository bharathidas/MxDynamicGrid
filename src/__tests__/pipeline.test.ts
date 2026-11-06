import { formatRanges, formatStyle } from "../utils/conditional";
import { parseOptions, parseValidation, serializeOptions } from "../utils/model";
import {
    defaultViewFor,
    parseViewState,
    parseViews,
    removeView,
    upsertView,
    visibleViews
} from "../utils/personalization";
import { aggregate, filterRows, groupRows, passesFilter, sortRows } from "../utils/pipeline";
import { buildServerViewState } from "../utils/serverView";
import { col, row } from "./helpers";

const status = col("status", "select", {
    options: [
        { value: "o", label: "Open" },
        { value: "c", label: "Closed" }
    ]
});
const columns = [
    col("name"),
    col("qty", "number"),
    col("due", "date"),
    status,
    col("ok", "boolean"),
    col("tags", "multiSelect")
];
const rows = [
    row("1", { name: "Alpha", qty: 3, due: "2026-01-10", status: "o", ok: true, tags: ["x"] }),
    row("2", { name: "beta", qty: 10, due: "2026-03-01", status: "c", ok: false, tags: ["y", "x"] }),
    row("3", { name: "Gamma", qty: null, due: null, status: "o", ok: false, tags: [] }),
    row("4", { name: "delta", qty: 7, due: "2026-02-15", status: null, ok: true, tags: ["y"] })
];
const keys = (list: Array<{ key: string }>): string[] => list.map(r => r.key);

describe("filters and search", () => {
    it("filters by type", () => {
        expect(keys(filterRows(rows, columns, { name: { op: "contains", value: "ta" } }, ""))).toEqual(["2", "4"]);
        expect(keys(filterRows(rows, columns, { name: { op: "startsWith", value: "a" } }, ""))).toEqual(["1"]);
        expect(keys(filterRows(rows, columns, { qty: { op: "between", value: 5, value2: null } }, ""))).toEqual([
            "2",
            "4"
        ]);
        expect(
            keys(filterRows(rows, columns, { due: { op: "between", value: "2026-02-01", value2: "2026-02-15" } }, ""))
        ).toEqual(["4"]);
        expect(keys(filterRows(rows, columns, { status: { op: "in", values: ["o", ""] } }, ""))).toEqual([
            "1",
            "3",
            "4"
        ]);
        expect(keys(filterRows(rows, columns, { tags: { op: "in", values: ["y"] } }, ""))).toEqual(["2", "4"]);
        expect(keys(filterRows(rows, columns, { ok: { op: "is", value: true } }, ""))).toEqual(["1", "4"]);
        expect(keys(filterRows(rows, columns, { qty: { op: "empty" } }, ""))).toEqual(["3"]);
        expect(passesFilter(status, "o", { op: "equals", value: "open" })).toBe(true);
    });
    it("searches all columns on display text, all terms", () => {
        expect(keys(filterRows(rows, columns, {}, "closed"))).toEqual(["2"]);
        expect(keys(filterRows(rows, columns, {}, "open alpha"))).toEqual(["1"]);
    });
});

describe("sorting", () => {
    it("sorts by several columns, empty last, options in option order", () => {
        expect(keys(sortRows(rows, columns, [{ col: "qty", dir: "desc" }]))).toEqual(["2", "4", "1", "3"]);
        expect(keys(sortRows(rows, columns, [{ col: "name", dir: "asc" }]))).toEqual(["1", "2", "4", "3"]);
        expect(
            keys(
                sortRows(rows, columns, [
                    { col: "status", dir: "asc" },
                    { col: "qty", dir: "desc" }
                ])
            )
        ).toEqual(["1", "3", "2", "4"]);
        expect(keys(sortRows(rows, columns, [{ col: "due", dir: "asc" }]))).toEqual(["1", "4", "2", "3"]);
    });
});

describe("grouping and aggregates", () => {
    it("aggregates", () => {
        const qty = columns[1];
        expect(aggregate(rows, qty, "sum")).toBe(20);
        expect(aggregate(rows, qty, "avg")).toBe(6.6666666667);
        expect(aggregate(rows, qty, "min")).toBe(3);
        expect(aggregate(rows, qty, "max")).toBe(10);
        expect(aggregate(rows, qty, "count")).toBe(4);
        expect(aggregate(rows, qty, "filled")).toBe(3);
        expect(aggregate(rows, columns[2], "max")).toBe("2026-03-01");
    });
    it("groups with counts, aggregates, collapse and nested levels", () => {
        const display = groupRows(rows, columns, ["status"], new Set(), [], { qty: "sum" }, "(Empty)");
        const groups = display.filter(d => d.kind === "group");
        expect(groups.map(g => (g.kind === "group" ? `${g.label}:${g.count}:${g.aggregates.qty}` : ""))).toEqual([
            "Open:2:3",
            "Closed:1:10",
            "(Empty):1:7"
        ]);
        const collapsed = groupRows(rows, columns, ["status"], new Set(["/0:o"]), [], {}, "(Empty)");
        expect(collapsed.filter(d => d.kind === "data")).toHaveLength(2);
        const nested = groupRows(rows, columns, ["status", "ok"], new Set(), [{ col: "status", dir: "desc" }], {}, "-");
        expect(nested[0].kind === "group" && nested[0].label).toBe("Closed");
        expect(nested.filter(d => d.kind === "group" && d.level === 1).length).toBe(4);
    });
});

describe("column definition parsing", () => {
    it("reads options, rating max and default values", () => {
        expect(parseOptions('[{"value":"a","label":"A","color":"#fff"},"b"]').options).toEqual([
            { value: "a", label: "A", color: "#fff" },
            { value: "b", label: "b" }
        ]);
        expect(parseOptions('{"options":[],"max":10,"default":3}')).toEqual({ options: [], max: 10, defaultValue: 3 });
        expect(parseOptions("not json").options).toEqual([]);
        expect(serializeOptions({ options: [{ value: "a", label: "A" }] })).toBe('[{"value":"a","label":"A"}]');
        expect(JSON.parse(serializeOptions({ options: [], max: 7 }))).toEqual({ options: [], max: 7 });
        expect(parseValidation('{"min":"1","max":5,"regex":"^x","unique":true,"message":"m"}')).toEqual({
            min: 1,
            max: 5,
            regex: "^x",
            unique: true,
            message: "m"
        });
    });
});

describe("view state and saved views", () => {
    it("parses defensively", () => {
        expect(
            parseViewState(
                '{"sort":[{"col":"a","dir":"desc"},{"bad":1}],"groupBy":["a","b","c","d"],"density":"compact"}'
            )
        ).toMatchObject({
            sort: [{ col: "a", dir: "desc" }],
            groupBy: ["a", "b", "c"],
            density: "compact"
        });
        expect(parseViewState("{oops")).toBeUndefined();
    });
    it("handles personal, shared and default views", () => {
        const state = parseViewState("{}")!;
        let doc = parseViews("");
        doc = upsertView(doc, { id: "1", name: "Mine", shared: false, owner: "ann", isDefault: true, state });
        doc = upsertView(doc, { id: "2", name: "Team", shared: true, isDefault: true, state });
        doc = upsertView(doc, { id: "3", name: "Bob's", shared: false, owner: "bob", state });
        expect(visibleViews(doc, "ann").map(v => v.name)).toEqual(["Mine", "Team"]);
        expect(defaultViewFor(doc, "ann")?.name).toBe("Mine");
        expect(defaultViewFor(doc, "bob")?.name).toBe("Team");
        doc = upsertView(doc, { id: "4", name: "Mine 2", shared: false, owner: "ann", isDefault: true, state });
        expect(doc.views.find(v => v.id === "1")?.isDefault).toBe(false);
        expect(removeView(doc, "4").views).toHaveLength(3);
        expect(parseViews(JSON.stringify(doc)).views).toHaveLength(4);
    });
    it("builds the server view state JSON", () => {
        expect(
            JSON.parse(
                buildServerViewState({
                    search: " acme ",
                    sort: [{ col: "a", dir: "desc" }],
                    filters: { b: { op: "between", value: 1, value2: null }, c: { op: "in", values: ["x"] } },
                    offset: 50,
                    limit: 25
                })
            )
        ).toEqual({
            search: "acme",
            sort: [{ col: "a", dir: "desc" }],
            filters: [
                { col: "b", op: "between", value: 1 },
                { col: "c", op: "in", values: ["x"] }
            ],
            offset: 50,
            limit: 25
        });
    });
});

describe("conditional formatting", () => {
    it("computes ranges and styles", () => {
        const qty = columns[1];
        const ranges = formatRanges(rows, columns, { qty: [{ kind: "colorScale" }] });
        expect(ranges.qty).toEqual({ min: 3, max: 10 });
        expect(
            formatStyle([{ kind: "colorScale", low: "#000000", high: "#ffffff" }], ranges.qty, 10)?.backgroundColor
        ).toBe("rgb(255, 255, 255)");
        expect(formatStyle([{ kind: "dataBar", color: "#264ae5" }], ranges.qty, 3)?.backgroundImage).toContain("3%");
        expect(formatStyle([{ kind: "textColor", op: ">", value: "5", color: "#f00" }], undefined, 7, qty)?.color).toBe(
            "#f00"
        );
        expect(
            formatStyle([{ kind: "textColor", op: "=", value: "open", color: "#0f0" }], undefined, "o", status)?.color
        ).toBe("#0f0");
        expect(formatStyle([], undefined, 1)).toBeUndefined();
    });
});
