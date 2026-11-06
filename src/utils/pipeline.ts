import { typeInfo } from "./columnTypes";
import { compile, evaluate, FormulaError, FormulaValue } from "./formula";
import { asArray, formatValue, isEmpty, isoDate, optionLabel, toDate } from "./values";
import { CellValue, ColumnDef, RowRecord } from "./types";

/**
 * The client-side row pipeline: formula values, quick search, header filters, multi-column sort, grouping with
 * aggregates and the totals row. Pure functions, so they are unit tested and reused by the export.
 */

// ---- Formulas ---------------------------------------------------------------------------------------

/** Value of a cell as a formula sees it. */
function formulaInput(column: ColumnDef, value: CellValue | undefined): FormulaValue {
    if (isEmpty(value)) {
        return null;
    }
    const kind = typeInfo(column.type).kind;
    if (kind === "date") {
        return toDate(value) ?? null;
    }
    if (kind === "select") {
        return optionLabel(column, value);
    }
    if (kind === "multi") {
        return asArray(value)
            .map(v => optionLabel(column, v))
            .join(", ");
    }
    if (Array.isArray(value)) {
        return value.join(", ");
    }
    return value as FormulaValue;
}

/** Converts a formula result to a storable cell value (dates as ISO dates, errors as "#..." text). */
function formulaOutput(value: FormulaValue): CellValue {
    if (value instanceof Date) {
        return isoDate(value);
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? Number(value.toFixed(10)) : "#NUM";
    }
    return value;
}

/**
 * Adds the values of formula columns to the rows. Formulas may reference other formula columns; cycles give
 * "#CYCLE". Rows without formula columns are returned unchanged (same object).
 */
export function computeFormulas(rows: RowRecord[], columns: ColumnDef[]): RowRecord[] {
    const formulas = columns.filter(column => column.type === "formula");
    if (!formulas.length) {
        return rows;
    }
    const byKey = new Map(columns.map(column => [column.key, column]));
    return rows.map(row => {
        const done = new Map<string, FormulaValue>();
        const visiting = new Set<string>();
        const resolve = (key: string): FormulaValue => {
            const column = byKey.get(key);
            if (!column) {
                throw new FormulaError("#REF", `Unknown column ${key}`);
            }
            if (column.type !== "formula") {
                return formulaInput(column, row.values[key]);
            }
            if (done.has(key)) {
                return done.get(key) as FormulaValue;
            }
            if (visiting.has(key)) {
                throw new FormulaError("#CYCLE", "Circular reference");
            }
            visiting.add(key);
            const node = compile(column.formula);
            if (node instanceof FormulaError) {
                throw node;
            }
            const value = evaluate(node, resolve);
            visiting.delete(key);
            done.set(key, value);
            return value;
        };
        const values = { ...row.values };
        formulas.forEach(column => {
            if (!column.formula.trim()) {
                values[column.key] = null;
                return;
            }
            try {
                values[column.key] = formulaOutput(resolve(column.key));
            } catch (error) {
                visiting.clear();
                values[column.key] = error instanceof FormulaError ? error.code : "#ERR";
            }
        });
        return { ...row, values };
    });
}

// ---- Filters -----------------------------------------------------------------------------------------

export type FilterOp =
    | "contains"
    | "equals"
    | "notEquals"
    | "startsWith"
    | "empty"
    | "notEmpty"
    | "between"
    | "in"
    | "is";

export interface ColumnFilter {
    op: FilterOp;
    /** Text, number or ISO date (from), or boolean for "is". */
    value?: string | number | boolean | null;
    /** Upper bound of "between". */
    value2?: string | number | null;
    /** Values of a set filter ("" = blanks). */
    values?: string[];
}

export type FilterModel = Record<string, ColumnFilter>;

export function isActiveFilter(filter: ColumnFilter | undefined): boolean {
    if (!filter) {
        return false;
    }
    switch (filter.op) {
        case "empty":
        case "notEmpty":
            return true;
        case "between":
            return !isEmpty(filter.value) || !isEmpty(filter.value2);
        case "in":
            return Array.isArray(filter.values);
        case "is":
            return typeof filter.value === "boolean";
        default:
            return !isEmpty(filter.value);
    }
}

function compareKey(column: ColumnDef, value: CellValue | undefined): number | string | undefined {
    if (isEmpty(value)) {
        return undefined;
    }
    const kind = typeInfo(column.type).kind;
    if (kind === "number") {
        const n = Number(value);
        return Number.isFinite(n) ? n : undefined;
    }
    if (kind === "date") {
        return toDate(value)?.getTime();
    }
    return String(value);
}

/** Set filter keys of a cell: option values for selects, the display text otherwise. */
export function setKeys(column: ColumnDef, value: CellValue | undefined): string[] {
    if (isEmpty(value)) {
        return [""];
    }
    const kind = typeInfo(column.type).kind;
    if (kind === "multi") {
        return asArray(value);
    }
    if (kind === "select") {
        return [String(value)];
    }
    return [formatValue(column, value)];
}

export function passesFilter(column: ColumnDef, value: CellValue | undefined, filter: ColumnFilter): boolean {
    const empty = isEmpty(value);
    switch (filter.op) {
        case "empty":
            return empty;
        case "notEmpty":
            return !empty;
        case "in": {
            const wanted = filter.values ?? [];
            return setKeys(column, value).some(key => wanted.includes(key));
        }
        case "is":
            return (value === true) === (filter.value === true);
        case "between": {
            const key = compareKey(column, value);
            if (key === undefined || typeof key === "string") {
                return false;
            }
            const kind = typeInfo(column.type).kind;
            const bound = (raw: unknown, end: boolean): number | undefined => {
                if (isEmpty(raw)) {
                    return undefined;
                }
                if (kind === "date") {
                    const date = toDate(raw);
                    if (!date) {
                        return undefined;
                    }
                    // A "to" date includes that whole day.
                    return end && String(raw).length <= 10 ? date.getTime() + 86400000 - 1 : date.getTime();
                }
                const n = Number(raw);
                return Number.isFinite(n) ? n : undefined;
            };
            const from = bound(filter.value, false);
            const to = bound(filter.value2, true);
            return (from === undefined || key >= from) && (to === undefined || key <= to);
        }
        default: {
            const needle = String(filter.value ?? "").toLowerCase();
            const text = formatValue(column, value).toLowerCase();
            const raw = empty ? "" : String(Array.isArray(value) ? value.join(", ") : value).toLowerCase();
            switch (filter.op) {
                case "equals":
                    return text === needle || raw === needle;
                case "notEquals":
                    return text !== needle && raw !== needle;
                case "startsWith":
                    return text.startsWith(needle) || raw.startsWith(needle);
                default:
                    return text.includes(needle) || raw.includes(needle);
            }
        }
    }
}

export function searchText(row: RowRecord, columns: ColumnDef[]): string {
    return columns
        .map(column => formatValue(column, row.values[column.key]))
        .join("\u0001")
        .toLowerCase();
}

export function filterRows(rows: RowRecord[], columns: ColumnDef[], filters: FilterModel, search: string): RowRecord[] {
    const active = columns
        .map(column => ({ column, filter: filters[column.key] }))
        .filter(entry => isActiveFilter(entry.filter)) as Array<{ column: ColumnDef; filter: ColumnFilter }>;
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!active.length && !terms.length) {
        return rows;
    }
    return rows.filter(row => {
        if (!active.every(({ column, filter }) => passesFilter(column, row.values[column.key], filter))) {
            return false;
        }
        if (!terms.length) {
            return true;
        }
        const haystack = searchText(row, columns);
        return terms.every(term => haystack.includes(term));
    });
}

// ---- Sorting -----------------------------------------------------------------------------------------

export interface SortEntry {
    col: string;
    dir: "asc" | "desc";
}

export function compareValues(column: ColumnDef, a: CellValue | undefined, b: CellValue | undefined): number {
    const ka = sortKey(column, a);
    const kb = sortKey(column, b);
    if (ka === undefined || kb === undefined) {
        return ka === kb ? 0 : ka === undefined ? 1 : -1; // empty last
    }
    if (typeof ka === "number" && typeof kb === "number") {
        return ka - kb;
    }
    return String(ka).localeCompare(String(kb), undefined, { sensitivity: "base", numeric: true });
}

function sortKey(column: ColumnDef, value: CellValue | undefined): number | string | undefined {
    if (isEmpty(value)) {
        return undefined;
    }
    const kind = typeInfo(column.type).kind;
    if (kind === "boolean") {
        return value === true ? 1 : 0;
    }
    if (kind === "select") {
        const index = column.options.findIndex(option => option.value === value);
        return index >= 0 ? index : String(value);
    }
    if (kind === "multi") {
        return formatValue(column, value);
    }
    if (column.type === "formula") {
        return typeof value === "number" ? value : String(value);
    }
    return compareKey(column, value);
}

export function sortRows(rows: RowRecord[], columns: ColumnDef[], sort: SortEntry[]): RowRecord[] {
    const entries = sort
        .map(entry => ({ entry, column: columns.find(column => column.key === entry.col) }))
        .filter(item => item.column) as Array<{ entry: SortEntry; column: ColumnDef }>;
    if (!entries.length) {
        return rows;
    }
    return rows
        .map((row, index) => ({ row, index }))
        .sort((x, y) => {
            for (const { entry, column } of entries) {
                const a = x.row.values[column.key];
                const b = y.row.values[column.key];
                const emptyA = isEmpty(a);
                const emptyB = isEmpty(b);
                if (emptyA || emptyB) {
                    if (emptyA !== emptyB) {
                        return emptyA ? 1 : -1;
                    }
                    continue;
                }
                const result = compareValues(column, a, b);
                if (result !== 0) {
                    return entry.dir === "desc" ? -result : result;
                }
            }
            return x.index - y.index;
        })
        .map(item => item.row);
}

// ---- Aggregates --------------------------------------------------------------------------------------

export type AggregateFn =
    | "sum"
    | "avg"
    | "min"
    | "max"
    | "count"
    | "filled"
    | "none"
    | "empty"
    | "unique"
    | "percentEmpty"
    | "range"
    | "earliest"
    | "latest";

export const AGGREGATES: AggregateFn[] = ["none", "sum", "avg", "min", "max", "count", "filled"];

export function aggregate(rows: RowRecord[], column: ColumnDef, fn: AggregateFn): number | string | null {
    if (fn === "none") {
        return null;
    }
    if (fn === "count") {
        return rows.length;
    }
    const values = rows.map(row => row.values[column.key]).filter(value => !isEmpty(value));
    if (fn === "empty") {
        return rows.length - values.length;
    }
    if (fn === "percentEmpty") {
        return rows.length ? Math.round(((rows.length - values.length) / rows.length) * 1000) / 10 : 0;
    }
    if (fn === "unique") {
        return new Set(values.map(value => JSON.stringify(value))).size;
    }
    if (fn === "earliest" || fn === "latest") {
        const times = values.map(value => toDate(value)?.getTime()).filter((t): t is number => t !== undefined);
        if (!times.length) {
            return null;
        }
        return isoDate(new Date(fn === "earliest" ? Math.min(...times) : Math.max(...times)));
    }
    if (fn === "range") {
        const nums = values.map(Number).filter(Number.isFinite);
        return nums.length ? Number((Math.max(...nums) - Math.min(...nums)).toFixed(10)) : null;
    }
    if (fn === "filled") {
        return values.length;
    }
    const kind = typeInfo(column.type).kind;
    if (kind === "date" && (fn === "min" || fn === "max")) {
        const times = values.map(value => toDate(value)?.getTime()).filter((t): t is number => t !== undefined);
        if (!times.length) {
            return null;
        }
        return isoDate(new Date(fn === "min" ? Math.min(...times) : Math.max(...times)));
    }
    const numbers = values.map(Number).filter(Number.isFinite);
    if (!numbers.length) {
        return null;
    }
    switch (fn) {
        case "sum":
            return Number(numbers.reduce((s, n) => s + n, 0).toFixed(10));
        case "avg":
            return Number((numbers.reduce((s, n) => s + n, 0) / numbers.length).toFixed(10));
        case "min":
            return Math.min(...numbers);
        default:
            return Math.max(...numbers);
    }
}

/** Default aggregate of a column in the totals row: sum for numbers (not ratings/progress), filled otherwise. */
export function defaultAggregate(column: ColumnDef): AggregateFn {
    switch (column.type) {
        case "number":
        case "decimal":
        case "currency":
            return "sum";
        case "percent":
        case "rating":
        case "progress":
            return "avg";
        default:
            return "none";
    }
}

// ---- Grouping ----------------------------------------------------------------------------------------

export const MAX_GROUP_LEVELS = 3;

export interface GroupRow {
    kind: "group";
    id: string;
    path: string;
    level: number;
    col: string;
    label: string;
    count: number;
    aggregates: Record<string, number | string | null>;
    collapsed: boolean;
}

export interface DataRow {
    kind: "data";
    row: RowRecord;
    level: number;
}

export type DisplayRow = GroupRow | DataRow;

/**
 * Groups sorted rows by up to three columns. Groups are ordered by the group value (descending when the user sorts
 * that column descending); rows inside keep the sorted order. Collapsed groups hide their content.
 */
export function groupRows(
    rows: RowRecord[],
    columns: ColumnDef[],
    groupBy: string[],
    collapsed: ReadonlySet<string>,
    sort: SortEntry[],
    aggregates: Record<string, AggregateFn>,
    emptyLabel: string
): DisplayRow[] {
    const levels = groupBy
        .map(key => columns.find(column => column.key === key))
        .filter((column): column is ColumnDef => Boolean(column))
        .slice(0, MAX_GROUP_LEVELS);
    if (!levels.length) {
        return rows.map(row => ({ kind: "data", row, level: 0 }));
    }
    const out: DisplayRow[] = [];
    const visit = (bucket: RowRecord[], level: number, parentPath: string, visible: boolean): void => {
        if (level >= levels.length) {
            if (visible) {
                bucket.forEach(row => out.push({ kind: "data", row, level }));
            }
            return;
        }
        const column = levels[level];
        const groups = new Map<string, { value: CellValue | undefined; rows: RowRecord[] }>();
        bucket.forEach(row => {
            const value = row.values[column.key];
            const keys = typeInfo(column.type).kind === "multi" ? [formatValue(column, value)] : setKeys(column, value);
            const key = keys[0];
            const entry = groups.get(key);
            if (entry) {
                entry.rows.push(row);
            } else {
                groups.set(key, { value, rows: [row] });
            }
        });
        const descending = sort.find(entry => entry.col === column.key)?.dir === "desc";
        const ordered = Array.from(groups.entries()).sort(([, a], [, b]) => {
            // The empty group is always last.
            if (isEmpty(a.value) || isEmpty(b.value)) {
                return isEmpty(a.value) === isEmpty(b.value) ? 0 : isEmpty(a.value) ? 1 : -1;
            }
            const result = compareValues(column, a.value, b.value);
            return descending ? -result : result;
        });
        ordered.forEach(([key, group]) => {
            const path = `${parentPath}/${level}:${key}`;
            const isCollapsed = collapsed.has(path);
            if (visible) {
                const sums: Record<string, number | string | null> = {};
                columns.forEach(c => {
                    const fn = aggregates[c.key];
                    if (fn && fn !== "none") {
                        sums[c.key] = aggregate(group.rows, c, fn);
                    }
                });
                out.push({
                    kind: "group",
                    id: `__group__${path}`,
                    path,
                    level,
                    col: column.key,
                    label: isEmpty(group.value) ? emptyLabel : formatValue(column, group.value),
                    count: group.rows.length,
                    aggregates: sums,
                    collapsed: isCollapsed
                });
            }
            visit(group.rows, level + 1, path, visible && !isCollapsed);
        });
    };
    visit(rows, 0, "", true);
    return out;
}

/** Every group path of the current grouping (for collapse all). */
export function allGroupPaths(display: DisplayRow[]): string[] {
    return display.filter((row): row is GroupRow => row.kind === "group").map(row => row.path);
}

/** Summary functions offered for a field in the summary bar. */
export function summaryFunctions(column: ColumnDef): AggregateFn[] {
    const kind = typeInfo(column.type).kind;
    const base: AggregateFn[] = ["none", "count", "empty", "filled", "unique", "percentEmpty"];
    if (kind === "number" || (column.type === "formula" && column.format)) {
        return [...base, "sum", "avg", "min", "max", "range"];
    }
    if (kind === "date") {
        return [...base, "earliest", "latest"];
    }
    return base;
}
