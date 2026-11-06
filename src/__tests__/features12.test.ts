import { findMatches } from "../components/BulkTools";
import { calendarDays, rowsOnDay } from "../components/CalendarView";
import { coverUrl } from "../components/GalleryView";
import { compile, evaluate, FormulaError, functionAtCaret } from "../utils/formula";
import { parseViewState } from "../utils/personalization";
import { rowColor } from "../utils/rowColor";
import { col, row } from "./helpers";

const run = (formula: string, values: Record<string, unknown> = {}): unknown => {
    const node = compile(formula);
    if (node instanceof FormulaError) {
        return node.code;
    }
    try {
        return evaluate(node, key => (key in values ? (values[key] as never) : null));
    } catch (error) {
        return (error as FormulaError).code;
    }
};

describe("1.2 formula functions", () => {
    it("handles IFS and SWITCH", () => {
        expect(run('IFS([x] > 10, "big", [x] > 5, "mid", TRUE, "small")', { x: 7 })).toBe("mid");
        expect(run("IFS(FALSE, 1)")).toBe("#N/A");
        expect(run('SWITCH([s], "a", 1, "b", 2, 0)', { s: "b" })).toBe(2);
        expect(run('SWITCH([s], "a", 1, 0)', { s: "z" })).toBe(0);
    });
    it("rounds with CEILING and FLOOR, averages with AVERAGE", () => {
        expect(run("CEILING(4.1)")).toBe(5);
        expect(run("FLOOR(17, 5)")).toBe(15);
        expect(run("AVERAGE(2, 4)")).toBe(3);
    });
    it("handles text functions", () => {
        expect(run('LEFT("Mendix", 3)')).toBe("Men");
        expect(run('RIGHT("Mendix", 3)')).toBe("dix");
        expect(run('MID("Mendix", 2, 3)')).toBe("end");
        expect(run('TRIM("  a   b ")')).toBe("a b");
        expect(run('REPLACE("2026-10", "-", "/")')).toBe("2026/10");
        expect(run('REPLACE("abcdef", 2, 3, "X")')).toBe("aXef");
        expect(run('SUBSTITUTE("a.b.c", ".", "")')).toBe("abc");
    });
    it("handles date functions", () => {
        const d = new Date(2026, 9, 30); // Friday
        expect((run('DATEADD([d], 1, "M")', { d }) as Date).getMonth()).toBe(10);
        expect((run("DATEADD([d], 3)", { d }) as Date).getDate()).toBe(2);
        expect(run("WEEKDAY([d])", { d })).toBe(6);
        expect(run("WEEKDAY([d], 2)", { d })).toBe(5);
        expect((run("WORKDAY([d], 1)", { d }) as Date).getDay()).toBe(1);
        expect(run('FORMAT_DATE([d], "dd-MM-yyyy")', { d })).toBe("30-10-2026");
        expect(run("NOW()")).toBeInstanceOf(Date);
    });
    it("finds the function at the caret for help", () => {
        expect(functionAtCaret("ROUND([a], ", 11)).toBe("ROUND");
        expect(functionAtCaret("IF(LEN([a]) > 2, ", 17)).toBe("IF");
        expect(functionAtCaret("DATEA", 5)).toBe("DATEADD");
        expect(functionAtCaret("1 + 2", 5)).toBeUndefined();
    });
});

describe("1.2 views", () => {
    it("parses view types, layouts and colour", () => {
        const state = parseViewState(
            JSON.stringify({
                viewType: "board",
                board: { col: "s", fields: ["a", "b"], summary: { col: "v", fn: "sum" } },
                calendar: { start: "d", mode: "week" },
                gallery: { cover: "img" },
                color: {
                    mode: "rules",
                    rules: [
                        {
                            color: "#FEE2E2",
                            conditions: { conjunction: "and", conditions: [{ col: "q", op: "lt", value: 5 }] }
                        }
                    ]
                }
            })
        );
        expect(state?.viewType).toBe("board");
        expect(state?.board?.summary).toEqual({ col: "v", fn: "sum" });
        expect(state?.calendar?.mode).toBe("week");
        expect(state?.color?.rules?.[0].conditions.conditions[0].op).toBe("lt");
        expect(parseViewState('{"viewType":"spreadsheet"}')?.viewType).toBeUndefined();
    });
    it("colours rows by select option or by the first matching rule", () => {
        const status = col("s", "select", { options: [{ value: "a", label: "A", color: "#DBEAFE" }] });
        const qty = col("q", "number");
        expect(rowColor(row("1", { s: "a" }), [status], { mode: "select", col: "s" })).toBe("#DBEAFE");
        const rules = {
            mode: "rules" as const,
            rules: [
                {
                    color: "#FEE2E2",
                    conditions: { conjunction: "and" as const, conditions: [{ col: "q", op: "lt" as const, value: 5 }] }
                },
                { color: "#DCFCE7", conditions: { conjunction: "and" as const, conditions: [] } }
            ]
        };
        expect(rowColor(row("1", { q: 2 }), [qty], rules)).toBe("#FEE2E2");
        expect(rowColor(row("2", { q: 9 }), [qty], rules)).toBeUndefined();
    });
    it("lays out calendar days and places ranges", () => {
        const month = calendarDays(new Date(2026, 9, 15), "month");
        expect(month).toHaveLength(42);
        expect(month[0].getDay()).toBe(1);
        expect(calendarDays(new Date(2026, 9, 15), "week")).toHaveLength(7);
        const rows = [row("1", { d: "2026-10-05", e: "2026-10-07" }), row("2", { d: "2026-10-06" })];
        expect(rowsOnDay(rows, "d", "e", new Date(2026, 9, 6)).map(r => r.key)).toEqual(["1", "2"]);
        expect(rowsOnDay(rows, "d", "e", new Date(2026, 9, 8))).toHaveLength(0);
    });
    it("only treats image URLs as covers", () => {
        expect(coverUrl("https://example.com/a.png")).toBeDefined();
        expect(coverUrl("www.example.com")).toBeUndefined();
        expect(coverUrl("https://picsum.photos/200")).toBeDefined();
    });
    it("finds and replaces in text fields only", () => {
        const columns = [col("name"), col("qty", "number"), col("mail", "email")];
        const rows = [row("1", { name: "Acme acme", qty: 1, mail: "x@acme.com" }), row("2", { name: "Other" })];
        const all = findMatches(rows, columns, "acme", "Apex", false, "");
        expect(all.map(m => m.after)).toEqual(["Apex Apex", "x@Apex.com"]);
        expect(findMatches(rows, columns, "acme", "Apex", true, "name")[0].after).toBe("Acme Apex");
    });
});
