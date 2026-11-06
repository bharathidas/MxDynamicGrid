import { aggregate, summaryFunctions } from "../utils/pipeline";
import { activeRuleCount, applyRules, matchesCondition, operatorsFor, withinRange } from "../utils/rules";
import { buildServerViewState } from "../utils/serverView";
import { templateOps } from "../utils/templates";
import { col, row } from "./helpers";

const status = col("status", "select", {
    options: [
        { value: "a", label: "Open" },
        { value: "b", label: "Done" }
    ]
});
const columns = [
    col("name"),
    col("qty", "number"),
    col("due", "date"),
    status,
    col("tags", "multiSelect"),
    col("ok", "boolean"),
    col("share", "percent")
];
const rows = [
    row("1", { name: "Alpha", qty: 3, due: "2026-10-28", status: "a", tags: ["x"], ok: true, share: 0.2 }),
    row("2", { name: "Beta", qty: 10, due: "2026-11-05", status: "b", tags: ["y"], ok: false, share: 0.5 }),
    row("3", { name: "Gamma", qty: null, due: null, status: null, tags: [], ok: false })
];
const keys = (list: Array<{ key: string }>): string[] => list.map(r => r.key);
const now = new Date(2026, 9, 29); // Thursday 29 Oct 2026

describe("filter rules", () => {
    it("offers operators per type", () => {
        expect(operatorsFor(columns[1])).toContain("gte");
        expect(operatorsFor(columns[2])).toContain("isWithin");
        expect(operatorsFor(status)).toContain("isAnyOf");
        expect(operatorsFor(columns[0])).toContain("contains");
    });
    it("matches by type", () => {
        expect(matchesCondition(columns[0], "Alpha", { col: "name", op: "contains", value: "lph" })).toBe(true);
        expect(matchesCondition(columns[1], 10, { col: "qty", op: "gte", value: 10 })).toBe(true);
        expect(matchesCondition(columns[6], 0.5, { col: "share", op: "eq", value: 50 })).toBe(true);
        expect(matchesCondition(status, "b", { col: "status", op: "isAnyOf", value: ["b"] })).toBe(true);
        expect(matchesCondition(columns[5], true, { col: "ok", op: "is", value: true })).toBe(true);
        expect(matchesCondition(columns[2], "2026-10-28", { col: "due", op: "before", value: "2026-11-01" })).toBe(
            true
        );
        expect(matchesCondition(columns[2], "2026-10-28", { col: "due", op: "isWithin", value: "thisWeek" }, now)).toBe(
            true
        );
        expect(matchesCondition(columns[2], "2026-11-05", { col: "due", op: "isWithin", value: "nextWeek" }, now)).toBe(
            true
        );
    });
    it("applies and / or and ignores incomplete conditions", () => {
        expect(
            keys(
                applyRules(rows, columns, {
                    conjunction: "and",
                    conditions: [
                        { col: "qty", op: "gt", value: 2 },
                        { col: "status", op: "is", value: "a" }
                    ]
                })
            )
        ).toEqual(["1"]);
        expect(
            keys(
                applyRules(rows, columns, {
                    conjunction: "or",
                    conditions: [
                        { col: "qty", op: "gt", value: 5 },
                        { col: "status", op: "is", value: "a" }
                    ]
                })
            )
        ).toEqual(["1", "2"]);
        expect(
            keys(applyRules(rows, columns, { conjunction: "and", conditions: [{ col: "qty", op: "gt", value: null }] }))
        ).toEqual(["1", "2", "3"]);
        expect(
            keys(applyRules(rows, columns, { conjunction: "and", conditions: [{ col: "due", op: "isEmpty" }] }))
        ).toEqual(["3"]);
        expect(
            activeRuleCount({
                conjunction: "and",
                conditions: [
                    { col: "qty", op: "gt", value: "" },
                    { col: "due", op: "isEmpty" }
                ]
            })
        ).toBe(1);
    });
    it("computes week ranges from Monday", () => {
        const [from, to] = withinRange("thisWeek", now);
        expect(new Date(from).getDay()).toBe(1);
        expect((to - from) / 86400000).toBe(7);
    });
    it("sends active rules in the server view state", () => {
        const json = JSON.parse(
            buildServerViewState({
                search: "",
                sort: [],
                filters: {},
                offset: 0,
                limit: 10,
                rules: {
                    conjunction: "or",
                    conditions: [
                        { col: "qty", op: "gt", value: 1 },
                        { col: "x", op: "is", value: "" }
                    ]
                }
            })
        );
        expect(json.rules).toEqual({ conjunction: "or", conditions: [{ col: "qty", op: "gt", value: 1 }] });
    });
});

describe("summary functions", () => {
    it("offers functions per type and computes them", () => {
        expect(summaryFunctions(columns[1])).toContain("range");
        expect(summaryFunctions(columns[2])).toContain("earliest");
        expect(summaryFunctions(columns[0])).not.toContain("sum");
        expect(aggregate(rows, columns[1], "range")).toBe(7);
        expect(aggregate(rows, columns[1], "empty")).toBe(1);
        expect(aggregate(rows, columns[1], "percentEmpty")).toBe(33.3);
        expect(aggregate(rows, columns[0], "unique")).toBe(3);
        expect(aggregate(rows, columns[2], "earliest")).toBe("2026-10-28");
        expect(aggregate(rows, columns[2], "latest")).toBe("2026-11-05");
    });
});

describe("templates", () => {
    it("creates fields with fresh keys and remapped formulas, plus sample rows", () => {
        const ops = templateOps("inventory", 0, 0, true);
        const added = ops.filter(op => op.op === "addColumn");
        expect(added).toHaveLength(5);
        const formula = added.find(op => op.op === "addColumn" && op.col.type === "formula");
        expect(formula && formula.op === "addColumn" && formula.col.formula).toMatch(
            /^\[[0-9a-f-]{36}\] \* \[[0-9a-f-]{36}\]$/
        );
        expect(ops.filter(op => op.op === "addRow")).toHaveLength(2);
        const budget = templateOps("budget", 2, 5, false);
        expect(budget.filter(op => op.op === "addColumn")).toHaveLength(14);
        expect(budget.some(op => op.op === "addColumn" && op.col.headerGroup === "Q4")).toBe(true);
        expect(budget.every(op => op.op !== "addRow")).toBe(true);
        expect(templateOps("blank", 0, 0)).toHaveLength(1);
    });
});
