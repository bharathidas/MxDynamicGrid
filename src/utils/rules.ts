import { typeInfo } from "./columnTypes";
import { asArray, formatValue, isEmpty, toDate } from "./values";
import { CellValue, ColumnDef, RowRecord } from "./types";

/**
 * View-bar filter rules (Airtable style): "Where [field] [operator] [value]" conditions joined by and/or.
 * Stored in the view state as {"conjunction":"and","conditions":[{"col":k,"op":"is","value":..}]}.
 */

export type RuleOp =
    | "is"
    | "isNot"
    | "contains"
    | "notContains"
    | "isEmpty"
    | "isNotEmpty"
    | "eq"
    | "neq"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "isAnyOf"
    | "isNoneOf"
    | "before"
    | "after"
    | "onOrBefore"
    | "onOrAfter"
    | "isWithin";

export type WithinRange = "today" | "thisWeek" | "nextWeek" | "pastWeek" | "thisMonth";

export interface RuleCondition {
    col: string;
    op: RuleOp;
    value?: string | number | boolean | string[] | null;
}

export interface RuleSet {
    conjunction: "and" | "or";
    conditions: RuleCondition[];
}

export function emptyRules(): RuleSet {
    return { conjunction: "and", conditions: [] };
}

/** Operators offered per field kind, in menu order. */
export function operatorsFor(column: ColumnDef): RuleOp[] {
    switch (typeInfo(column.type).kind) {
        case "number":
            return ["eq", "neq", "gt", "gte", "lt", "lte", "isEmpty", "isNotEmpty"];
        case "date":
            return ["is", "before", "after", "onOrBefore", "onOrAfter", "isWithin", "isEmpty", "isNotEmpty"];
        case "boolean":
            return ["is"];
        case "select":
            return ["is", "isNot", "isAnyOf", "isNoneOf", "isEmpty", "isNotEmpty"];
        case "multi":
            return ["contains", "notContains", "isAnyOf", "isNoneOf", "isEmpty", "isNotEmpty"];
        default:
            return ["contains", "notContains", "is", "isNot", "isEmpty", "isNotEmpty"];
    }
}

export function needsValue(op: RuleOp): boolean {
    return op !== "isEmpty" && op !== "isNotEmpty";
}

/** A condition counts when it has everything it needs (empty value inputs are ignored, like Airtable). */
export function isActiveCondition(condition: RuleCondition): boolean {
    if (!needsValue(condition.op)) {
        return true;
    }
    const value = condition.value;
    if (Array.isArray(value)) {
        return value.length > 0;
    }
    return value !== undefined && value !== null && value !== "";
}

function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** [from, to) of a relative date range; weeks start on Monday. */
export function withinRange(range: WithinRange, now = new Date()): [number, number] {
    const today = startOfDay(now);
    const day = 86400000;
    const monday = new Date(today.getTime() - ((today.getDay() + 6) % 7) * day);
    switch (range) {
        case "today":
            return [today.getTime(), today.getTime() + day];
        case "thisWeek":
            return [monday.getTime(), monday.getTime() + 7 * day];
        case "nextWeek":
            return [monday.getTime() + 7 * day, monday.getTime() + 14 * day];
        case "pastWeek":
            return [today.getTime() - 7 * day, today.getTime() + day];
        default:
            return [
                new Date(today.getFullYear(), today.getMonth(), 1).getTime(),
                new Date(today.getFullYear(), today.getMonth() + 1, 1).getTime()
            ];
    }
}

export function matchesCondition(
    column: ColumnDef,
    raw: CellValue | undefined,
    condition: RuleCondition,
    now = new Date()
): boolean {
    const kind = typeInfo(column.type).kind;
    const empty = isEmpty(raw);
    const { op, value } = condition;
    if (op === "isEmpty") {
        return empty;
    }
    if (op === "isNotEmpty") {
        return !empty;
    }
    if (kind === "boolean") {
        return (raw === true) === (value === true || value === "true");
    }
    if (kind === "number") {
        const n = Number(raw);
        let target = Number(value);
        if (column.type === "percent" && Number.isFinite(target)) {
            target = target / 100;
        }
        if (empty || !Number.isFinite(n) || !Number.isFinite(target)) {
            return op === "neq";
        }
        const eps = 1e-9;
        switch (op) {
            case "eq":
                return Math.abs(n - target) < eps;
            case "neq":
                return Math.abs(n - target) >= eps;
            case "gt":
                return n > target;
            case "gte":
                return n >= target - eps;
            case "lt":
                return n < target;
            default:
                return n <= target + eps;
        }
    }
    if (kind === "date") {
        const date = toDate(raw);
        if (!date) {
            return false;
        }
        const t = startOfDay(date).getTime();
        if (op === "isWithin") {
            const [from, to] = withinRange((value as WithinRange) || "thisWeek", now);
            return date.getTime() >= from && date.getTime() < to;
        }
        const targetDate = value === "today" ? startOfDay(now) : toDate(value);
        if (!targetDate) {
            return true;
        }
        const target = startOfDay(targetDate).getTime();
        switch (op) {
            case "before":
                return t < target;
            case "after":
                return t > target;
            case "onOrBefore":
                return t <= target;
            case "onOrAfter":
                return t >= target;
            default:
                return t === target;
        }
    }
    if (kind === "select" || kind === "multi") {
        const have = kind === "multi" ? asArray(raw) : empty ? [] : [String(raw)];
        const wanted = Array.isArray(value)
            ? value.map(String)
            : value === undefined || value === null
            ? []
            : [String(value)];
        switch (op) {
            case "is":
                return have.length > 0 && wanted.includes(have[0]);
            case "isNot":
                return !(have.length > 0 && wanted.includes(have[0]));
            case "contains":
            case "isAnyOf":
                return have.some(v => wanted.includes(v));
            case "notContains":
            case "isNoneOf":
                return !have.some(v => wanted.includes(v));
            default:
                return true;
        }
    }
    const text = formatValue(column, raw).toLowerCase();
    const needle = String(value ?? "")
        .trim()
        .toLowerCase();
    switch (op) {
        case "is":
            return text === needle;
        case "isNot":
            return text !== needle;
        case "notContains":
            return !text.includes(needle);
        default:
            return text.includes(needle);
    }
}

/** Rows that pass the rule set (inactive conditions and unknown fields are ignored). */
export function applyRules(
    rows: RowRecord[],
    columns: ColumnDef[],
    rules: RuleSet | undefined,
    now = new Date()
): RowRecord[] {
    if (!rules) {
        return rows;
    }
    const active = rules.conditions
        .filter(isActiveCondition)
        .map(condition => ({ condition, column: columns.find(c => c.key === condition.col) }))
        .filter((entry): entry is { condition: RuleCondition; column: ColumnDef } => Boolean(entry.column));
    if (!active.length) {
        return rows;
    }
    return rows.filter(row => {
        const test = (entry: { condition: RuleCondition; column: ColumnDef }): boolean =>
            matchesCondition(entry.column, row.values[entry.column.key], entry.condition, now);
        return rules.conjunction === "or" ? active.some(test) : active.every(test);
    });
}

export function activeRuleCount(rules: RuleSet | undefined): number {
    return rules ? rules.conditions.filter(isActiveCondition).length : 0;
}

export function parseRules(raw: unknown): RuleSet | undefined {
    if (!raw || typeof raw !== "object") {
        return undefined;
    }
    const o = raw as { conjunction?: unknown; conditions?: unknown };
    const conditions = Array.isArray(o.conditions)
        ? (o.conditions as RuleCondition[]).filter(c => c && typeof c.col === "string" && typeof c.op === "string")
        : [];
    return { conjunction: o.conjunction === "or" ? "or" : "and", conditions };
}
