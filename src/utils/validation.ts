import { typeInfo } from "./columnTypes";
import { asArray, isEmpty, toDate } from "./values";
import { CellValue, ColumnDef, RowRecord, SaveError } from "./types";

/** Cell validation: required, min/max, regex, select membership, unique, email. */

export interface ValidationTexts {
    required: string;
    min: string;
    max: string;
    pattern: string;
    option: string;
    number: string;
    date: string;
    unique: string;
    email: string;
}

export const DEFAULT_VALIDATION_TEXTS: ValidationTexts = {
    required: "A value is required",
    min: "Must be at least [min]",
    max: "Must be at most [max]",
    pattern: "Value does not match the expected pattern",
    option: "Not one of the allowed options",
    number: "Not a number",
    date: "Not a date",
    unique: "Value must be unique",
    email: "Not an email address"
};

const regexCache = new Map<string, RegExp | null>();
function compileRegex(source: string): RegExp | null {
    if (!regexCache.has(source)) {
        try {
            regexCache.set(source, new RegExp(source));
        } catch {
            regexCache.set(source, null);
        }
    }
    return regexCache.get(source) ?? null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The error message of a cell, or undefined when valid. `duplicates` holds values that occur more than once. */
export function validateCell(
    column: ColumnDef,
    value: CellValue | undefined,
    texts: ValidationTexts = DEFAULT_VALIDATION_TEXTS,
    duplicates?: Set<string>
): string | undefined {
    const info = typeInfo(column.type);
    if (info.system) {
        return undefined;
    }
    const rule = column.validation;
    const custom = (fallback: string): string => rule.message || fallback;
    if (isEmpty(value)) {
        return column.required ? custom(texts.required) : undefined;
    }
    switch (info.kind) {
        case "number": {
            const n = Number(value);
            if (!Number.isFinite(n)) {
                return texts.number;
            }
            const shown = column.type === "percent" ? n * 100 : n;
            if (rule.min !== undefined && shown < rule.min) {
                return custom(texts.min.replace("[min]", String(rule.min)));
            }
            if (rule.max !== undefined && shown > rule.max) {
                return custom(texts.max.replace("[max]", String(rule.max)));
            }
            break;
        }
        case "date":
            if (!toDate(value)) {
                return texts.date;
            }
            break;
        case "select":
            if (column.options.length && !column.options.some(option => option.value === String(value))) {
                return custom(texts.option);
            }
            break;
        case "multi":
            if (column.options.length && asArray(value).some(v => !column.options.some(option => option.value === v))) {
                return custom(texts.option);
            }
            break;
        case "text": {
            const text = String(value);
            if (rule.min !== undefined && text.length < rule.min) {
                return custom(texts.min.replace("[min]", String(rule.min)));
            }
            if (rule.max !== undefined && text.length > rule.max) {
                return custom(texts.max.replace("[max]", String(rule.max)));
            }
            if (column.type === "email" && !EMAIL.test(text)) {
                return custom(texts.email);
            }
            break;
        }
        default:
            break;
    }
    if (rule.regex) {
        const regex = compileRegex(rule.regex);
        if (regex && !regex.test(Array.isArray(value) ? value.join(",") : String(value))) {
            return custom(texts.pattern);
        }
    }
    if (rule.unique && duplicates?.has(JSON.stringify(value))) {
        return custom(texts.unique);
    }
    return undefined;
}

/** Values that occur more than once, per column with a unique rule. */
export function duplicateValues(rows: RowRecord[], columns: ColumnDef[]): Map<string, Set<string>> {
    const result = new Map<string, Set<string>>();
    columns
        .filter(column => column.validation.unique)
        .forEach(column => {
            const seen = new Set<string>();
            const dupes = new Set<string>();
            rows.forEach(row => {
                const value = row.values[column.key];
                if (isEmpty(value)) {
                    return;
                }
                const key = JSON.stringify(value);
                if (seen.has(key)) {
                    dupes.add(key);
                }
                seen.add(key);
            });
            result.set(column.key, dupes);
        });
    return result;
}

export type IssueMap = Map<string, string>;

export function issueKey(row: string, col: string): string {
    return `${row}\u0000${col}`;
}

/** Errors of all cells of the given rows (client validation), keyed by row+column. */
export function collectIssues(
    rows: RowRecord[],
    columns: ColumnDef[],
    texts: ValidationTexts,
    onlyRows?: ReadonlySet<string>
): IssueMap {
    const issues: IssueMap = new Map();
    const duplicates = duplicateValues(rows, columns);
    rows.forEach(row => {
        if (onlyRows && !onlyRows.has(row.key)) {
            return;
        }
        columns.forEach(column => {
            const message = validateCell(column, row.values[column.key], texts, duplicates.get(column.key));
            if (message) {
                issues.set(issueKey(row.key, column.key), message);
            }
        });
    });
    return issues;
}

/** Server result errors keyed like client issues; errors without a cell are returned separately. */
export function serverIssues(errors: SaveError[]): { cells: IssueMap; general: string[] } {
    const cells: IssueMap = new Map();
    const general: string[] = [];
    errors.forEach(error => {
        if (error.row && error.col) {
            cells.set(issueKey(error.row, error.col), error.message);
        } else if (error.row) {
            cells.set(issueKey(error.row, "*"), error.message);
        } else {
            general.push(error.message);
        }
    });
    return { cells, general };
}
