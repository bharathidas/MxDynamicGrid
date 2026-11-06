import { formatDatePattern } from "./values";

/**
 * Safe formula evaluator for formula columns (no eval, no access to anything but the row).
 *
 * Syntax: numbers, "strings", TRUE/FALSE, column references, + - * / ^ & (concatenation), comparisons
 * = <> < > <= >=, unary minus, postfix %, parentheses and the functions IF, AND, OR, NOT, ROUND, SUM, AVG,
 * MIN, MAX, ABS, CONCAT, LEN, UPPER, LOWER, TODAY, DATEDIF, ISBLANK.
 * References are stored as [colKey] and shown to users as {Column Name}.
 */

export type FormulaValue = number | string | boolean | Date | null;

export class FormulaError extends Error {
    constructor(public readonly code: string, message?: string) {
        super(message ?? code);
    }
}

type Token =
    | { t: "num"; v: number }
    | { t: "str"; v: string }
    | { t: "ref"; v: string }
    | { t: "id"; v: string }
    | { t: "op"; v: string }
    | { t: "end" };

export type Node =
    | { k: "num"; v: number }
    | { k: "str"; v: string }
    | { k: "bool"; v: boolean }
    | { k: "ref"; v: string }
    | { k: "neg"; a: Node }
    | { k: "pct"; a: Node }
    | { k: "bin"; op: string; a: Node; b: Node }
    | { k: "call"; name: string; args: Node[] };

const OPS = ["<=", ">=", "<>", "+", "-", "*", "/", "^", "&", "=", "<", ">", "(", ")", ",", "%"];

export function tokenize(text: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    while (i < text.length) {
        const c = text[i];
        if (c === " " || c === "\t" || c === "\n" || c === "\r") {
            i++;
            continue;
        }
        if ((c >= "0" && c <= "9") || (c === "." && text[i + 1] >= "0" && text[i + 1] <= "9")) {
            let j = i;
            while (j < text.length && ((text[j] >= "0" && text[j] <= "9") || text[j] === ".")) {
                j++;
            }
            if ((text[j] === "e" || text[j] === "E") && /[-+\d]/.test(text[j + 1] ?? "")) {
                j += 2;
                while (j < text.length && text[j] >= "0" && text[j] <= "9") {
                    j++;
                }
            }
            const value = Number(text.slice(i, j));
            if (!Number.isFinite(value)) {
                throw new FormulaError("#SYNTAX", `Bad number at ${i + 1}`);
            }
            tokens.push({ t: "num", v: value });
            i = j;
            continue;
        }
        if (c === '"') {
            let j = i + 1;
            let value = "";
            while (j < text.length) {
                if (text[j] === '"') {
                    if (text[j + 1] === '"') {
                        value += '"';
                        j += 2;
                        continue;
                    }
                    break;
                }
                value += text[j++];
            }
            if (j >= text.length) {
                throw new FormulaError("#SYNTAX", "Unclosed text");
            }
            tokens.push({ t: "str", v: value });
            i = j + 1;
            continue;
        }
        if (c === "[") {
            const end = text.indexOf("]", i);
            if (end < 0) {
                throw new FormulaError("#SYNTAX", "Unclosed column reference");
            }
            tokens.push({ t: "ref", v: text.slice(i + 1, end) });
            i = end + 1;
            continue;
        }
        if (/[A-Za-z_]/.test(c)) {
            let j = i;
            while (j < text.length && /[A-Za-z0-9_.]/.test(text[j])) {
                j++;
            }
            tokens.push({ t: "id", v: text.slice(i, j).toUpperCase() });
            i = j;
            continue;
        }
        const at = i;
        const op = OPS.find(candidate => text.startsWith(candidate, at));
        if (!op) {
            throw new FormulaError("#SYNTAX", `Unexpected "${c}" at ${i + 1}`);
        }
        tokens.push({ t: "op", v: op });
        i += op.length;
    }
    tokens.push({ t: "end" });
    return tokens;
}

/** Recursive descent parser. Precedence: comparison < & < +- < * / < ^ < unary < postfix %. */
export function parse(text: string): Node {
    const tokens = tokenize(text.trim().startsWith("=") ? text.trim().slice(1) : text);
    let pos = 0;
    const peek = (): Token => tokens[pos];
    const isOp = (value: string): boolean => {
        const token = peek();
        return token.t === "op" && token.v === value;
    };
    const expect = (value: string): void => {
        if (!isOp(value)) {
            throw new FormulaError("#SYNTAX", `Expected "${value}"`);
        }
        pos++;
    };

    const comparison = (): Node => {
        let left = concat();
        for (;;) {
            const token = peek();
            if (token.t === "op" && ["=", "<>", "<", ">", "<=", ">="].includes(token.v)) {
                pos++;
                left = { k: "bin", op: token.v, a: left, b: concat() };
            } else {
                return left;
            }
        }
    };
    const concat = (): Node => {
        let left = additive();
        while (isOp("&")) {
            pos++;
            left = { k: "bin", op: "&", a: left, b: additive() };
        }
        return left;
    };
    const additive = (): Node => {
        let left = multiplicative();
        for (;;) {
            if (isOp("+") || isOp("-")) {
                const op = (tokens[pos++] as { v: string }).v;
                left = { k: "bin", op, a: left, b: multiplicative() };
            } else {
                return left;
            }
        }
    };
    const multiplicative = (): Node => {
        let left = power();
        for (;;) {
            if (isOp("*") || isOp("/")) {
                const op = (tokens[pos++] as { v: string }).v;
                left = { k: "bin", op, a: left, b: power() };
            } else {
                return left;
            }
        }
    };
    const power = (): Node => {
        const base = unary();
        if (isOp("^")) {
            pos++;
            return { k: "bin", op: "^", a: base, b: power() };
        }
        return base;
    };
    const unary = (): Node => {
        if (isOp("-")) {
            pos++;
            return { k: "neg", a: unary() };
        }
        if (isOp("+")) {
            pos++;
            return unary();
        }
        return postfix();
    };
    const postfix = (): Node => {
        let node = primary();
        while (isOp("%")) {
            pos++;
            node = { k: "pct", a: node };
        }
        return node;
    };
    const primary = (): Node => {
        const token = peek();
        pos++;
        switch (token.t) {
            case "num":
                return { k: "num", v: token.v };
            case "str":
                return { k: "str", v: token.v };
            case "ref":
                return { k: "ref", v: token.v };
            case "id": {
                if (token.v === "TRUE" || token.v === "FALSE") {
                    if (isOp("(")) {
                        pos++;
                        expect(")");
                    }
                    return { k: "bool", v: token.v === "TRUE" };
                }
                if (!FUNCTIONS[token.v]) {
                    throw new FormulaError("#NAME", `Unknown function ${token.v}`);
                }
                expect("(");
                const args: Node[] = [];
                if (!isOp(")")) {
                    args.push(comparison());
                    while (isOp(",")) {
                        pos++;
                        args.push(comparison());
                    }
                }
                expect(")");
                return { k: "call", name: token.v, args };
            }
            case "op":
                if (token.v === "(") {
                    const inner = comparison();
                    expect(")");
                    return inner;
                }
                throw new FormulaError("#SYNTAX", `Unexpected "${token.v}"`);
            default:
                throw new FormulaError("#SYNTAX", "Unexpected end of formula");
        }
    };

    const node = comparison();
    if (peek().t !== "end") {
        throw new FormulaError("#SYNTAX", "Unexpected text after the formula");
    }
    return node;
}

// ---- Evaluation -------------------------------------------------------------------------------------

function toNumber(value: FormulaValue): number {
    if (value === null || value === "") {
        return 0;
    }
    if (typeof value === "number") {
        return value;
    }
    if (typeof value === "boolean") {
        return value ? 1 : 0;
    }
    if (value instanceof Date) {
        return value.getTime() / 86400000;
    }
    const n = Number(String(value).replace(",", "."));
    if (!Number.isFinite(n)) {
        throw new FormulaError("#VALUE", `"${value}" is not a number`);
    }
    return n;
}

function toText(value: FormulaValue): string {
    if (value === null) {
        return "";
    }
    if (value instanceof Date) {
        return value.toISOString().slice(0, 10);
    }
    if (typeof value === "boolean") {
        return value ? "TRUE" : "FALSE";
    }
    if (typeof value === "number") {
        return String(Number(value.toFixed(10)));
    }
    return value;
}

function toBool(value: FormulaValue): boolean {
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "string") {
        const upper = value.toUpperCase();
        if (upper === "TRUE") {
            return true;
        }
        if (upper === "FALSE" || upper === "") {
            return false;
        }
    }
    return toNumber(value) !== 0;
}

function compare(a: FormulaValue, b: FormulaValue): number {
    if (a instanceof Date || b instanceof Date) {
        return toNumber(a) - toNumber(b);
    }
    if (typeof a === "number" || typeof b === "number") {
        if (
            (a === null || typeof a === "number" || typeof a === "boolean") &&
            (b === null || typeof b === "number" || typeof b === "boolean")
        ) {
            return toNumber(a) - toNumber(b);
        }
    }
    return toText(a).localeCompare(toText(b), undefined, { sensitivity: "base" });
}

function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toDateValue(value: FormulaValue): Date {
    if (value instanceof Date) {
        return value;
    }
    if (typeof value === "string") {
        const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
        if (!Number.isNaN(date.getTime())) {
            return date;
        }
    }
    if (typeof value === "number") {
        return new Date(value * 86400000);
    }
    throw new FormulaError("#VALUE", "Not a date");
}

type Fn = (args: Node[], ev: (node: Node) => FormulaValue) => FormulaValue;

const numbersOf = (args: Node[], ev: (node: Node) => FormulaValue): number[] =>
    args
        .map(ev)
        .filter(value => value !== null && value !== "")
        .map(toNumber);

const FUNCTIONS: Record<string, Fn> = {
    IF: (args, ev) => {
        if (args.length < 2) {
            throw new FormulaError("#ARGS", "IF needs a condition and a value");
        }
        return toBool(ev(args[0])) ? ev(args[1]) : args[2] ? ev(args[2]) : false;
    },
    AND: (args, ev) => args.every(arg => toBool(ev(arg))),
    OR: (args, ev) => args.some(arg => toBool(ev(arg))),
    NOT: (args, ev) => !toBool(ev(args[0])),
    ROUND: (args, ev) => {
        const digits = args[1] ? Math.trunc(toNumber(ev(args[1]))) : 0;
        const factor = Math.pow(10, digits);
        const n = toNumber(ev(args[0])) * factor;
        return (Math.sign(n) * Math.round(Math.abs(n))) / factor;
    },
    SUM: (args, ev) =>
        Number(
            numbersOf(args, ev)
                .reduce((sum, n) => sum + n, 0)
                .toFixed(10)
        ),
    AVG: (args, ev) => {
        const list = numbersOf(args, ev);
        if (!list.length) {
            throw new FormulaError("#DIV/0", "No values to average");
        }
        return list.reduce((sum, n) => sum + n, 0) / list.length;
    },
    MIN: (args, ev) => {
        const list = numbersOf(args, ev);
        return list.length ? Math.min(...list) : 0;
    },
    MAX: (args, ev) => {
        const list = numbersOf(args, ev);
        return list.length ? Math.max(...list) : 0;
    },
    ABS: (args, ev) => Math.abs(toNumber(ev(args[0]))),
    CONCAT: (args, ev) => args.map(arg => toText(ev(arg))).join(""),
    LEN: (args, ev) => toText(ev(args[0])).length,
    UPPER: (args, ev) => toText(ev(args[0])).toUpperCase(),
    LOWER: (args, ev) => toText(ev(args[0])).toLowerCase(),
    ISBLANK: (args, ev) => {
        const value = ev(args[0]);
        return value === null || value === "";
    },
    TODAY: () => startOfDay(new Date()),
    NOW: () => new Date(),
    AVERAGE: (args, ev) => FUNCTIONS.AVG(args, ev),
    IFS: (args, ev) => {
        for (let i = 0; i + 1 < args.length; i += 2) {
            if (toBool(ev(args[i]))) {
                return ev(args[i + 1]);
            }
        }
        throw new FormulaError("#N/A", "No IFS condition is true");
    },
    SWITCH: (args, ev) => {
        if (args.length < 3) {
            throw new FormulaError("#ARGS", "SWITCH needs a value and at least one case");
        }
        const value = ev(args[0]);
        let i = 1;
        for (; i + 1 < args.length; i += 2) {
            if (compare(value, ev(args[i])) === 0) {
                return ev(args[i + 1]);
            }
        }
        if (i < args.length) {
            return ev(args[i]);
        }
        throw new FormulaError("#N/A", "No SWITCH case matches");
    },
    CEILING: (args, ev) => {
        const step = args[1] ? toNumber(ev(args[1])) : 1;
        return step ? Math.ceil(toNumber(ev(args[0])) / step) * step : 0;
    },
    FLOOR: (args, ev) => {
        const step = args[1] ? toNumber(ev(args[1])) : 1;
        return step ? Math.floor(toNumber(ev(args[0])) / step) * step : 0;
    },
    LEFT: (args, ev) => toText(ev(args[0])).slice(0, args[1] ? Math.max(0, toNumber(ev(args[1]))) : 1),
    RIGHT: (args, ev) => {
        const text = toText(ev(args[0]));
        const n = args[1] ? Math.max(0, toNumber(ev(args[1]))) : 1;
        return n ? text.slice(-n) : "";
    },
    MID: (args, ev) => {
        const start = Math.max(1, toNumber(ev(args[1])));
        return toText(ev(args[0])).substr(start - 1, Math.max(0, toNumber(ev(args[2]))));
    },
    TRIM: (args, ev) => toText(ev(args[0])).trim().split(" ").filter(Boolean).join(" "),
    REPLACE: (args, ev) => {
        const text = toText(ev(args[0]));
        if (args.length === 3) {
            // REPLACE(text, old, new): replaces every occurrence (also SUBSTITUTE).
            return text.split(toText(ev(args[1]))).join(toText(ev(args[2])));
        }
        const start = Math.max(1, toNumber(ev(args[1])));
        const count = Math.max(0, toNumber(ev(args[2])));
        return text.slice(0, start - 1) + toText(ev(args[3])) + text.slice(start - 1 + count);
    },
    SUBSTITUTE: (args, ev) =>
        toText(ev(args[0]))
            .split(toText(ev(args[1])))
            .join(toText(ev(args[2]))),
    DATEADD: (args, ev) => {
        const date = new Date(toDateValue(ev(args[0])).getTime());
        const n = Math.trunc(toNumber(ev(args[1])));
        const unit = args[2] ? toText(ev(args[2])).toUpperCase() : "D";
        if (unit === "M") {
            date.setMonth(date.getMonth() + n);
        } else if (unit === "Y") {
            date.setFullYear(date.getFullYear() + n);
        } else if (unit === "W") {
            date.setDate(date.getDate() + n * 7);
        } else if (unit === "H") {
            date.setHours(date.getHours() + n);
        } else {
            date.setDate(date.getDate() + n);
        }
        return date;
    },
    WEEKDAY: (args, ev) => {
        // 1 = Sunday ... 7 = Saturday (Excel default); type 2: 1 = Monday ... 7 = Sunday.
        const day = toDateValue(ev(args[0])).getDay();
        const type = args[1] ? toNumber(ev(args[1])) : 1;
        return type === 2 ? ((day + 6) % 7) + 1 : day + 1;
    },
    WORKDAY: (args, ev) => {
        const date = startOfDay(toDateValue(ev(args[0])));
        let n = Math.trunc(toNumber(ev(args[1])));
        const step = n < 0 ? -1 : 1;
        while (n !== 0) {
            date.setDate(date.getDate() + step);
            if (date.getDay() !== 0 && date.getDay() !== 6) {
                n -= step;
            }
        }
        return date;
    },
    FORMAT_DATE: (args, ev) =>
        formatDatePattern(toDateValue(ev(args[0])), args[1] ? toText(ev(args[1])) : "yyyy-MM-dd"),
    DATEDIF: (args, ev) => {
        const start = startOfDay(toDateValue(ev(args[0])));
        const end = startOfDay(toDateValue(ev(args[1])));
        const unit = args[2] ? toText(ev(args[2])).toUpperCase() : "D";
        if (unit === "D") {
            return Math.round((end.getTime() - start.getTime()) / 86400000);
        }
        let months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
        if (end.getDate() < start.getDate()) {
            months--;
        }
        if (unit === "M") {
            return months;
        }
        if (unit === "Y") {
            return Math.trunc(months / 12);
        }
        throw new FormulaError("#VALUE", "DATEDIF unit must be D, M or Y");
    }
};

export const FUNCTION_NAMES = Object.keys(FUNCTIONS);

export function evaluate(node: Node, resolve: (key: string) => FormulaValue): FormulaValue {
    const ev = (n: Node): FormulaValue => evaluate(n, resolve);
    switch (node.k) {
        case "num":
            return node.v;
        case "str":
            return node.v;
        case "bool":
            return node.v;
        case "ref":
            return resolve(node.v);
        case "neg":
            return -toNumber(ev(node.a));
        case "pct":
            return toNumber(ev(node.a)) / 100;
        case "call":
            return FUNCTIONS[node.name](node.args, ev);
        default: {
            const a = ev(node.a);
            const b = ev(node.b);
            switch (node.op) {
                case "+":
                    if (a instanceof Date && !(b instanceof Date)) {
                        return new Date(a.getTime() + toNumber(b) * 86400000);
                    }
                    return toNumber(a) + toNumber(b);
                case "-":
                    if (a instanceof Date && b instanceof Date) {
                        return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86400000);
                    }
                    if (a instanceof Date) {
                        return new Date(a.getTime() - toNumber(b) * 86400000);
                    }
                    return toNumber(a) - toNumber(b);
                case "*":
                    return toNumber(a) * toNumber(b);
                case "/": {
                    const divisor = toNumber(b);
                    if (divisor === 0) {
                        throw new FormulaError("#DIV/0", "Division by zero");
                    }
                    return toNumber(a) / divisor;
                }
                case "^":
                    return Math.pow(toNumber(a), toNumber(b));
                case "&":
                    return toText(a) + toText(b);
                case "=":
                    return compare(a, b) === 0;
                case "<>":
                    return compare(a, b) !== 0;
                case "<":
                    return compare(a, b) < 0;
                case ">":
                    return compare(a, b) > 0;
                case "<=":
                    return compare(a, b) <= 0;
                default:
                    return compare(a, b) >= 0;
            }
        }
    }
}

/** Column keys referenced by a stored formula. */
export function references(node: Node, out: Set<string> = new Set()): Set<string> {
    switch (node.k) {
        case "ref":
            out.add(node.v);
            break;
        case "neg":
        case "pct":
            references(node.a, out);
            break;
        case "bin":
            references(node.a, out);
            references(node.b, out);
            break;
        case "call":
            node.args.forEach(arg => references(arg, out));
            break;
        default:
            break;
    }
    return out;
}

const cache = new Map<string, Node | FormulaError>();

/** Parses with a cache; returns a FormulaError for invalid formulas. */
export function compile(formula: string): Node | FormulaError {
    let entry = cache.get(formula);
    if (!entry) {
        try {
            entry = parse(formula);
        } catch (error) {
            entry = error instanceof FormulaError ? error : new FormulaError("#SYNTAX", String(error));
        }
        if (cache.size > 500) {
            cache.clear();
        }
        cache.set(formula, entry);
    }
    return entry;
}

// ---- Display <-> stored references ------------------------------------------------------------------

export interface RefColumn {
    key: string;
    caption: string;
}

/** Stored "[price] * [qty]" -> shown "{Price} * {Quantity}" (text inside strings is left alone). */
export function toDisplayFormula(stored: string, columns: RefColumn[]): string {
    return mapOutsideStrings(stored, "[", "]", key => {
        const column = columns.find(c => c.key === key);
        return `{${column ? column.caption : key}}`;
    });
}

/** Shown "{Price} * {Quantity}" -> stored "[price] * [qty]"; unknown names are kept and fail at evaluation. */
export function toStoredFormula(display: string, columns: RefColumn[]): string {
    return mapOutsideStrings(display, "{", "}", name => {
        const trimmed = name.trim().toLowerCase();
        const column =
            columns.find(c => c.caption.trim().toLowerCase() === trimmed) ??
            columns.find(c => c.key.toLowerCase() === trimmed);
        return `[${column ? column.key : name}]`;
    });
}

function mapOutsideStrings(text: string, open: string, close: string, map: (inner: string) => string): string {
    let out = "";
    let i = 0;
    let inString = false;
    while (i < text.length) {
        const c = text[i];
        if (c === '"') {
            inString = !inString;
            out += c;
            i++;
            continue;
        }
        if (!inString && c === open) {
            const end = text.indexOf(close, i + 1);
            if (end > i) {
                out += map(text.slice(i + 1, end));
                i = end + 1;
                continue;
            }
        }
        out += c;
        i++;
    }
    return out;
}

/** Autocomplete: the column-name fragment being typed after an unclosed "{" at the caret, if any. */
export function referenceFragment(text: string, caret: number): { start: number; query: string } | undefined {
    const before = text.slice(0, caret);
    const open = before.lastIndexOf("{");
    if (open < 0 || before.lastIndexOf("}") > open) {
        return undefined;
    }
    return { start: open, query: before.slice(open + 1) };
}

/** Error message for a formula, or undefined when it parses and only references known columns. */
export function formulaProblem(stored: string, knownKeys: string[], selfKey?: string): string | undefined {
    if (!stored.trim()) {
        return undefined;
    }
    const node = compile(stored);
    if (node instanceof FormulaError) {
        return node.message;
    }
    for (const key of references(node)) {
        if (key === selfKey) {
            return "A formula cannot reference its own column";
        }
        if (!knownKeys.includes(key)) {
            return `Unknown column ${key}`;
        }
    }
    return undefined;
}

/** Signature and one-line help per function, shown in the formula editor. */
export const FUNCTION_HELP: Record<string, string> = {
    IF: "IF(condition, then, else)",
    IFS: "IFS(cond1, value1, cond2, value2, ...) - first true condition",
    SWITCH: "SWITCH(value, case1, result1, ..., default)",
    AND: "AND(a, b, ...) - all true",
    OR: "OR(a, b, ...) - any true",
    NOT: "NOT(value)",
    ROUND: "ROUND(number, decimals)",
    CEILING: "CEILING(number, step) - round up",
    FLOOR: "FLOOR(number, step) - round down",
    ABS: "ABS(number)",
    SUM: "SUM(a, b, ...)",
    AVG: "AVG(a, b, ...)",
    AVERAGE: "AVERAGE(a, b, ...)",
    MIN: "MIN(a, b, ...)",
    MAX: "MAX(a, b, ...)",
    CONCAT: "CONCAT(a, b, ...) - join texts",
    LEFT: "LEFT(text, count)",
    RIGHT: "RIGHT(text, count)",
    MID: "MID(text, start, count)",
    TRIM: "TRIM(text) - remove extra spaces",
    REPLACE: "REPLACE(text, old, new) or REPLACE(text, start, count, new)",
    SUBSTITUTE: "SUBSTITUTE(text, old, new)",
    LEN: "LEN(text)",
    UPPER: "UPPER(text)",
    LOWER: "LOWER(text)",
    ISBLANK: "ISBLANK(value)",
    TODAY: "TODAY() - today's date",
    NOW: "NOW() - date and time now",
    DATEADD: 'DATEADD(date, number, "D|W|M|Y|H")',
    DATEDIF: 'DATEDIF(start, end, "D|M|Y")',
    WEEKDAY: "WEEKDAY(date, [type]) - 1 = Sunday (type 2: 1 = Monday)",
    WORKDAY: "WORKDAY(date, days) - skips weekends",
    FORMAT_DATE: 'FORMAT_DATE(date, "dd-MM-yyyy")'
};

/** The function name being typed or whose parentheses contain the caret. */
export function functionAtCaret(text: string, caret: number): string | undefined {
    let depth = 0;
    for (let i = caret - 1; i >= 0; i--) {
        const c = text[i];
        if (c === ")") {
            depth++;
        } else if (c === "(") {
            if (depth === 0) {
                let j = i;
                while (j > 0 && /[A-Za-z_]/.test(text[j - 1])) {
                    j--;
                }
                const name = text.slice(j, i).toUpperCase();
                return FUNCTION_HELP[name] ? name : undefined;
            }
            depth--;
        }
    }
    let j = caret;
    while (j > 0 && /[A-Za-z_]/.test(text[j - 1])) {
        j--;
    }
    const partial = text.slice(j, caret).toUpperCase();
    return partial.length >= 2 ? Object.keys(FUNCTION_HELP).find(name => name.startsWith(partial)) : undefined;
}
