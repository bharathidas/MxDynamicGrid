import { normalizeType } from "../utils/columnTypes";
import {
    convertColumn,
    excelFormat,
    formatDatePattern,
    formatValue,
    parseDate,
    parseInput,
    parseNumber,
    parseNumberPattern
} from "../utils/values";
import { collectIssues, DEFAULT_VALIDATION_TEXTS, serverIssues, validateCell } from "../utils/validation";
import { col, row } from "./helpers";

describe("types", () => {
    it("normalises case-insensitively with aliases", () => {
        expect(normalizeType("TEXT")).toBe("text");
        expect(normalizeType("multi_select")).toBe("multiSelect");
        expect(normalizeType("DateTime")).toBe("dateTime");
        expect(normalizeType("url")).toBe("link");
        expect(normalizeType("createdBy")).toBe("createdBy");
        expect(normalizeType("weird")).toBe("text");
        expect(normalizeType(undefined)).toBe("text");
    });
});

describe("number and date formats", () => {
    it("reads Excel-like number patterns", () => {
        expect(parseNumberPattern("€ #,##0.00")).toEqual({
            prefix: "€ ",
            suffix: "",
            decimals: 2,
            grouping: true,
            percent: false
        });
        expect(parseNumberPattern("0.0%")).toMatchObject({ decimals: 1, percent: true });
        expect(parseNumberPattern("")).toBeUndefined();
    });
    it("formats by type and format", () => {
        expect(formatValue(col("p", "currency", { format: "€ #,##0.00" }), 1234.5, "en-US")).toBe("€ 1,234.50");
        expect(formatValue(col("p", "percent"), 0.255, "en-US")).toBe("26%");
        expect(formatValue(col("p", "number"), 1234567, "de-DE")).toBe("1.234.567");
        expect(formatValue(col("d", "date", { format: "dd-MM-yyyy" }), "2026-10-29")).toBe("29-10-2026");
        expect(formatValue(col("b", "boolean"), true)).toBe("✓");
        expect(formatValue(col("s", "select", { options: [{ value: "a", label: "Alpha" }] }), "a")).toBe("Alpha");
        expect(formatValue(col("m", "multiSelect", { options: [{ value: "a", label: "Alpha" }] }), ["a", "z"])).toBe(
            "Alpha, z"
        );
        expect(formatDatePattern(new Date(2026, 0, 5, 14, 7), "d MMM yyyy h:mm a")).toBe("5 Jan 2026 2:07 PM");
    });
    it("parses numbers in several locales", () => {
        expect(parseNumber("1,234.50", "en-US")).toBe(1234.5);
        expect(parseNumber("1.234,50", "de-DE")).toBe(1234.5);
        expect(parseNumber("€ 12", "en-US")).toBe(12);
        expect(parseNumber("(5)", "en-US")).toBe(-5);
        expect(parseNumber("abc")).toBeUndefined();
    });
    it("parses dates", () => {
        expect(parseDate("2026-10-29")?.getDate()).toBe(29);
        expect(parseDate("29-10-2026", "dd-MM-yyyy")?.getMonth()).toBe(9);
        expect(parseDate("10/29/2026", "", "en-US")?.getDate()).toBe(29);
        expect(parseDate("29 Oct 2026")?.getMonth()).toBe(9);
        expect(parseDate("46324")?.getFullYear()).toBe(2026);
        expect(parseDate("not a date")).toBeUndefined();
    });
    it("converts formats for Excel", () => {
        expect(excelFormat(col("p", "currency", { format: "€ #,##0.00" }))).toBe('"€ "#,##0.00');
        expect(excelFormat(col("p", "percent"))).toBe("0%");
        expect(excelFormat(col("d", "date", { format: "dd-MM-yyyy" }))).toBe("dd-mm-yyyy");
        expect(excelFormat(col("d", "dateTime"))).toBe("dd-mm-yyyy hh:mm");
        expect(excelFormat(col("t", "text"))).toBeUndefined();
    });
});

describe("parseInput", () => {
    it("parses by type", () => {
        expect(parseInput(col("n", "number"), "12.7")).toEqual({ ok: true, value: 13 });
        expect(parseInput(col("n", "percent"), "25%")).toEqual({ ok: true, value: 0.25 });
        expect(parseInput(col("n", "rating", { max: 5 }), "★★★")).toEqual({ ok: true, value: 3 });
        expect(parseInput(col("n", "progress"), "150")).toEqual({ ok: true, value: 100 });
        expect(parseInput(col("b", "boolean"), "yes")).toEqual({ ok: true, value: true });
        expect(parseInput(col("d", "date"), "2026-02-03")).toEqual({ ok: true, value: "2026-02-03" });
        expect(parseInput(col("n", "number"), "x").ok).toBe(false);
        expect(parseInput(col("t", "text"), "")).toEqual({ ok: true, value: null });
    });
    it("matches options and optionally creates new ones", () => {
        const select = col("s", "select", { options: [{ value: "a", label: "Alpha" }] });
        expect(parseInput(select, "alpha")).toEqual({ ok: true, value: "a" });
        expect(parseInput(select, "Beta").ok).toBe(false);
        const created = parseInput(select, "Beta", { allowNewOptions: true });
        expect(created.ok && created.newOptions?.[0].label).toBe("Beta");
        const multi = parseInput(
            col("m", "multiSelect", { options: [{ value: "a", label: "Alpha" }] }),
            "Alpha, Gamma",
            { allowNewOptions: true }
        );
        expect(multi).toMatchObject({ ok: true, value: ["a", "Gamma"] });
    });
});

describe("type conversion", () => {
    const rows = [row("1", { v: "12" }), row("2", { v: "abc" }), row("3", { v: "" }), row("4", { v: "7.5" })];
    it("text to number counts lost values", () => {
        const result = convertColumn(rows, col("v", "text"), "decimal");
        expect(result.total).toBe(3);
        expect(result.lost).toBe(1);
        expect(result.values.get("1")).toBe(12);
        expect(result.values.get("2")).toBeNull();
        expect(result.samples[1]).toMatchObject({ before: "abc", lost: true });
    });
    it("text to select creates options from distinct values", () => {
        const result = convertColumn(
            [row("1", { v: "Red" }), row("2", { v: "Blue" }), row("3", { v: "red" })],
            col("v", "text"),
            "select"
        );
        expect(result.options.map(o => o.label)).toEqual(["Red", "Blue"]);
        expect(result.lost).toBe(0);
        expect(result.values.get("3")).toBe("Red");
    });
    it("handles select <-> multi, percent, dates and booleans", () => {
        expect(convertColumn([row("1", { v: "a" })], col("v", "select"), "multiSelect").values.get("1")).toEqual(["a"]);
        expect(convertColumn([row("1", { v: ["a", "b"] })], col("v", "multiSelect"), "select").values.get("1")).toBe(
            "a"
        );
        expect(convertColumn([row("1", { v: 0.25 })], col("v", "percent"), "decimal").values.get("1")).toBe(25);
        expect(convertColumn([row("1", { v: 25 })], col("v", "number"), "percent").values.get("1")).toBe(0.25);
        expect(
            convertColumn([row("1", { v: "2026-03-04T10:00:00.000Z" })], col("v", "dateTime"), "date").values.get("1")
        ).toMatch(/^2026-03-0[45]$/);
        expect(convertColumn([row("1", { v: true })], col("v", "boolean"), "number").values.get("1")).toBe(1);
        expect(convertColumn([row("1", { v: 3 })], col("v", "number"), "boolean").values.get("1")).toBe(true);
        expect(convertColumn([row("1", { v: 3 })], col("v", "number"), "formula").lost).toBe(1);
    });
});

describe("validation", () => {
    const t = DEFAULT_VALIDATION_TEXTS;
    it("checks required, ranges, patterns, options and email", () => {
        expect(validateCell(col("a", "text", { required: true }), null, t)).toBe(t.required);
        expect(validateCell(col("a", "number", { validation: { min: 1, max: 5 } }), 9, t)).toBe("Must be at most 5");
        expect(validateCell(col("a", "percent", { validation: { max: 50 } }), 0.6, t)).toBe("Must be at most 50");
        expect(
            validateCell(col("a", "text", { validation: { regex: "^[A-Z]{3}$", message: "Three capitals" } }), "abc", t)
        ).toBe("Three capitals");
        expect(validateCell(col("a", "select", { options: [{ value: "x", label: "X" }] }), "y", t)).toBe(t.option);
        expect(validateCell(col("a", "email"), "nope", t)).toBe(t.email);
        expect(validateCell(col("a", "text", { validation: { min: 2 } }), "a", t)).toBe("Must be at least 2");
        expect(validateCell(col("a", "formula", { required: true }), null, t)).toBeUndefined();
        expect(validateCell(col("a", "text", { validation: { regex: "(" } }), "x", t)).toBeUndefined();
    });
    it("finds duplicates of unique columns and only checks the given rows", () => {
        const columns = [col("code", "text", { validation: { unique: true } })];
        const rows = [row("1", { code: "A" }), row("2", { code: "A" }), row("3", { code: "B" })];
        expect(collectIssues(rows, columns, t).size).toBe(2);
        expect(collectIssues(rows, columns, t, new Set(["1"])).size).toBe(1);
    });
    it("maps server errors", () => {
        const mapped = serverIssues([
            { row: "r1", col: "a", message: "Bad" },
            { row: "r2", message: "Row bad" },
            { message: "General" }
        ]);
        expect(mapped.cells.get("r1\u0000a")).toBe("Bad");
        expect(mapped.cells.get("r2\u0000*")).toBe("Row bad");
        expect(mapped.general).toEqual(["General"]);
    });
});
