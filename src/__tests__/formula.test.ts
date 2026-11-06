import {
    compile,
    evaluate,
    FormulaError,
    formulaProblem,
    parse,
    referenceFragment,
    toDisplayFormula,
    toStoredFormula
} from "../utils/formula";
import { computeFormulas } from "../utils/pipeline";
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

describe("formula evaluator", () => {
    it("does arithmetic with precedence, power and percent", () => {
        expect(run("1 + 2 * 3")).toBe(7);
        expect(run("(1 + 2) * 3")).toBe(9);
        expect(run("2 ^ 3 ^ 2")).toBe(512);
        expect(run("-2 * 3")).toBe(-6);
        expect(run("50%")).toBe(0.5);
        expect(run("=10 / 4")).toBe(2.5);
    });
    it("reads column references", () => {
        expect(run("[price] * [qty]", { price: 2.5, qty: 4 })).toBe(10);
        expect(run("[missing] + 1")).toBe(1);
    });
    it("compares and concatenates", () => {
        expect(run("3 > 2")).toBe(true);
        expect(run('"a" = "A"')).toBe(true);
        expect(run("1 <> 1")).toBe(false);
        expect(run('"Hello " & [name]', { name: "Ann" })).toBe("Hello Ann");
    });
    it("supports the functions", () => {
        expect(run('IF([qty] > 2, "big", "small")', { qty: 3 })).toBe("big");
        expect(run("AND(TRUE, 1 > 0)")).toBe(true);
        expect(run("OR(FALSE, 0)")).toBe(false);
        expect(run("NOT(FALSE)")).toBe(true);
        expect(run("ROUND(2.345, 2)")).toBe(2.35);
        expect(run("ROUND(-2.5)")).toBe(-3);
        expect(run("SUM([a], [b], 3)", { a: 1, b: 2 })).toBe(6);
        expect(run("AVG(1, 2, 3)")).toBe(2);
        expect(run("MIN(4, 2, 8)")).toBe(2);
        expect(run("MAX(4, 2, 8)")).toBe(8);
        expect(run("ABS(-4)")).toBe(4);
        expect(run('CONCAT("a", 1, TRUE)')).toBe("a1TRUE");
        expect(run('LEN("abcd")')).toBe(4);
        expect(run('UPPER("ab") & LOWER("CD")')).toBe("ABcd");
        expect(run("ISBLANK([x])")).toBe(true);
        expect(run("TODAY()")).toBeInstanceOf(Date);
    });
    it("computes date differences", () => {
        const values = { start: new Date(2026, 0, 31), end: new Date(2026, 3, 15) };
        expect(run('DATEDIF([start], [end], "D")', values)).toBe(74);
        expect(run('DATEDIF([start], [end], "M")', values)).toBe(2);
        expect(run('DATEDIF([start], [end], "Y")', values)).toBe(0);
        expect(run("[end] - [start]", values)).toBe(74);
    });
    it("reports errors as codes", () => {
        expect(run("1 / 0")).toBe("#DIV/0");
        expect(run("FOO(1)")).toBe("#NAME");
        expect(run("1 +")).toBe("#SYNTAX");
        expect(run('"open')).toBe("#SYNTAX");
        expect(run('"x" * 2')).toBe("#VALUE");
    });
    it("cannot reach anything outside the row", () => {
        expect(run("constructor")).toBe("#NAME");
        expect(() => parse("window.alert(1)")).toThrow();
    });
});

describe("formula references", () => {
    const columns = [
        { key: "price", caption: "Unit price" },
        { key: "qty", caption: "Quantity" }
    ];
    it("converts between stored keys and shown names", () => {
        expect(toDisplayFormula("[price] * [qty]", columns)).toBe("{Unit price} * {Quantity}");
        expect(toStoredFormula("{unit price} * {Quantity}", columns)).toBe("[price] * [qty]");
        expect(toStoredFormula('"{not a ref}" & {Quantity}', columns)).toBe('"{not a ref}" & [qty]');
    });
    it("finds the fragment for autocomplete", () => {
        expect(referenceFragment("1 + {Qu", 7)).toEqual({ start: 4, query: "Qu" });
        expect(referenceFragment("{Quantity} + 1", 14)).toBeUndefined();
    });
    it("validates references", () => {
        expect(formulaProblem("[price] * 2", ["price"])).toBeUndefined();
        expect(formulaProblem("[nope]", ["price"])).toMatch(/Unknown column/);
        expect(formulaProblem("[self]", ["self"], "self")).toMatch(/own column/);
        expect(formulaProblem("1 +", [])).toBeTruthy();
    });
});

describe("computeFormulas", () => {
    it("evaluates formula columns per row, chained, with cycle detection", () => {
        const columns = [
            col("price", "currency"),
            col("qty", "number"),
            col("total", "formula", { formula: "[price] * [qty]" }),
            col("vat", "formula", { formula: "ROUND([total] * 0.21, 2)" }),
            col("a", "formula", { formula: "[b]" }),
            col("b", "formula", { formula: "[a]" }),
            col("status", "select", { options: [{ value: "x", label: "Open" }] }),
            col("label", "formula", { formula: '[status] & "!"' })
        ];
        const [result] = computeFormulas([row("r1", { price: 10, qty: 3, status: "x" })], columns);
        expect(result.values.total).toBe(30);
        expect(result.values.vat).toBe(6.3);
        expect(result.values.a).toBe("#CYCLE");
        expect(result.values.label).toBe("Open!");
    });
});
