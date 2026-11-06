import { extractMentions } from "../components/Comments";
import { applyOps, columnFromPayload, inverseOps, isReflected, payloadFromColumn } from "../utils/changeSet";
import { printHtml } from "../utils/print";
import { computeRelated, LinkRow, parsePresence, setLinkRows, linkOptionsFor, linkGrids } from "../utils/related";
import { linkedLabel, parseInput, setLinkLabels } from "../utils/values";
import { GridModel } from "../utils/types";
import { col, model, row } from "./helpers";

const LINKS: LinkRow[] = [
    { key: "c1", label: "Contact 1", grid: "Contacts", values: { city: "Berlin", score: 10 } },
    { key: "c2", label: "Contact 2", grid: "Contacts", values: { city: "Paris", score: 20 } },
    { key: "v1", label: "Vendor 1", grid: "Vendors", values: { city: "Delft", score: 1 } }
];

describe("1.2 linked records, lookup and rollup", () => {
    const columns = [
        col("contact", "linkedRecord", { link: { target: "Contacts", multiple: true } }),
        col("city", "lookup", { link: { link: "contact", field: "city" } }),
        col("total", "rollup", { link: { link: "contact", field: "score", fn: "sum" } }),
        col("avg", "rollup", { link: { link: "contact", field: "score", fn: "avg" } }),
        col("n", "rollup", { link: { link: "contact", field: "score", fn: "count" } })
    ];
    it("computes lookups and rollups", () => {
        const [a, b] = computeRelated(
            [row("r1", { contact: ["c1", "c2"] }), row("r2", { contact: [] })],
            columns,
            LINKS,
            []
        );
        expect(a.values.city).toBe("Berlin, Paris");
        expect(a.values.total).toBe(30);
        expect(a.values.avg).toBe(15);
        expect(a.values.n).toBe(2);
        expect(b.values.city).toBeNull();
        expect(b.values.total).toBeNull();
        expect(b.values.n).toBe(0);
    });
    it("follows self links to rows of the same grid", () => {
        const rows = [row("r1", { contact: ["r2"] }), row("r2", { city: "Oslo" })];
        expect(computeRelated(rows, [columns[1]], [], rows)[0].values.city).toBe("Oslo");
    });
    it("returns the same rows without derived columns", () => {
        const rows = [row("r1", {})];
        expect(computeRelated(rows, [col("name")], LINKS, [])).toBe(rows);
    });
    it("filters the picker options by target grid", () => {
        setLinkRows(LINKS);
        expect(linkOptionsFor(columns[0]).map(l => l.key)).toEqual(["c1", "c2"]);
        expect(linkGrids()).toEqual(["Contacts", "Vendors"]);
    });
    it("formats and parses linked values by label", () => {
        setLinkLabels(new Map(LINKS.map(l => [l.key, l.label])));
        expect(linkedLabel("c2")).toBe("Contact 2");
        expect(parseInput(columns[0], "Contact 1, Contact 2")).toEqual({ ok: true, value: ["c1", "c2"] });
    });
    it("round-trips link settings through the column payload", () => {
        const payload = payloadFromColumn(columns[2]);
        expect(payload.link).toEqual({ link: "contact", field: "score", fn: "sum" });
        expect(columnFromPayload(payload, 0).link).toEqual(columns[2].link);
    });
});

describe("1.2 comments", () => {
    const base = (): GridModel => ({ ...model(), comments: [] });
    it("adds and resolves comments optimistically", () => {
        const added = applyOps(base(), [
            { op: "addComment", comment: { key: "k1", row: "r1", col: "name", text: "Hi @Bob", mentions: ["Bob"] } }
        ]);
        expect(added.comments?.[0]).toMatchObject({
            key: "k1",
            row: "r1",
            col: "name",
            resolved: false,
            pending: true
        });
        const resolved = applyOps(added, [{ op: "resolveComment", comment: "k1", resolved: true }]);
        expect(resolved.comments?.[0].resolved).toBe(true);
    });
    it("inverts resolve but not add", () => {
        const added = applyOps(base(), [
            { op: "addComment", comment: { key: "k1", row: "r1", col: null, text: "x", mentions: [] } }
        ]);
        expect(
            inverseOps(base(), [
                { op: "addComment", comment: { key: "k1", row: "r1", col: null, text: "x", mentions: [] } }
            ])
        ).toEqual([]);
        expect(inverseOps(added, [{ op: "resolveComment", comment: "k1", resolved: true }])).toEqual([
            { op: "resolveComment", comment: "k1", resolved: false }
        ]);
    });
    it("detects reflection on the server", () => {
        const server: GridModel = {
            ...model(),
            comments: [{ key: "k1", row: "r1", col: null, text: "x", author: "Ann", resolved: true }]
        };
        expect(
            isReflected(server, {
                op: "addComment",
                comment: { key: "k1", row: "r1", col: null, text: "x", mentions: [] }
            })
        ).toBe(true);
        expect(
            isReflected(server, {
                op: "addComment",
                comment: { key: "k2", row: "r1", col: null, text: "x", mentions: [] }
            })
        ).toBe(false);
        expect(isReflected(server, { op: "resolveComment", comment: "k1", resolved: true })).toBe(true);
        expect(isReflected(server, { op: "resolveComment", comment: "k1", resolved: false })).toBe(false);
    });
    it("extracts mentions of known people", () => {
        expect(extractMentions("Ping @Bob Ray and @ann lee", ["Bob Ray", "Ann Lee", "Cid"])).toEqual([
            "Bob Ray",
            "Ann Lee"
        ]);
        expect(extractMentions("no mentions", ["Bob"])).toEqual([]);
    });
});

describe("1.2 presence and print", () => {
    it("parses presence as JSON or a list", () => {
        expect(parsePresence('["Ann", {"name": "Bob"}]')).toEqual(["Ann", "Bob"]);
        expect(parsePresence(" Ann , Bob ,")).toEqual(["Ann", "Bob"]);
        expect(parsePresence("")).toEqual([]);
    });
    it("prints an escaped table of the view", () => {
        const html = printHtml(
            "Q<1>",
            "Status is open",
            [col("name"), col("done", "boolean")],
            [row("r1", { name: "<b>A</b>", done: true })]
        );
        expect(html).toContain("<title>Q&lt;1&gt;</title>");
        expect(html).toContain("&lt;b&gt;A&lt;/b&gt;");
        expect(html).toContain("✓");
        expect(html).toContain("1 rows");
    });
});

describe("1.2.1 saved view comparison", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { sameState } = require("../components/ViewTabs");
    const base = { v: 1, columns: {}, sort: [], filters: {}, groupBy: [], aggregates: {}, formats: {} };
    it("ignores key order and a missing default row height", () => {
        const saved = { ...base, viewType: "board", board: { col: "stage", fields: ["a"] } };
        const current = { board: { fields: ["a"], col: "stage" }, viewType: "board", rowHeight: "medium", ...base };
        expect(sameState(saved, current, "medium")).toBe(true);
        expect(sameState(saved, { ...current, rowHeight: "tall" }, "medium")).toBe(false);
        expect(sameState(saved, { ...current, sort: [{ col: "a", dir: "asc" }] }, "medium")).toBe(false);
    });
});

describe("1.2.1 personalization view id", () => {
    it("keeps the view id of the stored state", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { parseViewState, serializeViewState, emptyViewState } = require("../utils/personalization");
        const parsed = parseViewState(serializeViewState({ ...emptyViewState(), viewType: "board", viewId: "v2" }));
        expect(parsed.viewId).toBe("v2");
        expect(parseViewState(serializeViewState(emptyViewState())).viewId).toBeUndefined();
    });
});
