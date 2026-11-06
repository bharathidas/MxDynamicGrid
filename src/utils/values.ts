import { typeInfo, OPTION_COLORS } from "./columnTypes";
import { CellValue, ColumnDef, ColumnType, SelectOption } from "./types";

/**
 * Value handling per column type: display formatting (locale aware, with the column format), parsing of typed or
 * pasted text, and conversion of stored values when a column changes type.
 *
 * Storage: text types store strings; number, decimal, currency, rating and progress (0-100) store numbers;
 * percent stores the fraction (0.25 = 25 %); date stores "yyyy-MM-dd", dateTime a full ISO-8601 string;
 * boolean stores true/false; select stores the option value; multiSelect a string array; empty is null.
 */

export function isEmpty(value: unknown): boolean {
    return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

export function currentLocale(): string {
    const lang = typeof document !== "undefined" ? document.documentElement.lang : "";
    return lang || (typeof navigator !== "undefined" && navigator.language) || "en-US";
}

// ---- Number formats ----------------------------------------------------------------------------------

export interface NumberPattern {
    prefix: string;
    suffix: string;
    decimals: number | undefined;
    grouping: boolean;
    percent: boolean;
}

/** Reads an Excel-like number format such as "0.00", "#,##0", "€ #,##0.00", "0.0%" or "#,##0 kg". */
export function parseNumberPattern(format: string): NumberPattern | undefined {
    const text = (format ?? "").trim();
    if (!text) {
        return undefined;
    }
    let first = -1;
    let last = -1;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === "#" || c === "0") {
            if (first < 0) {
                first = i;
            }
            last = i;
        }
    }
    if (first < 0) {
        return undefined;
    }
    let core = text.slice(first, last + 1);
    let suffix = text.slice(last + 1);
    const prefix = text.slice(0, first);
    const percent = suffix.includes("%") || prefix.includes("%");
    suffix = suffix.replace("%", "");
    const dot = core.indexOf(".");
    let decimals = 0;
    if (dot >= 0) {
        decimals = core.slice(dot + 1).replace(/[^0#]/g, "").length;
        core = core.slice(0, dot);
    }
    return { prefix: prefix.replace("%", ""), suffix, decimals, grouping: core.includes(","), percent };
}

const DEFAULT_NUMBER: Partial<Record<ColumnType, string>> = {
    number: "#,##0",
    decimal: "#,##0.00",
    currency: "#,##0.00",
    percent: "0%",
    autoNumber: "0",
    rating: "0",
    progress: "0"
};

export function formatNumber(value: number, type: ColumnType, format: string, locale = currentLocale()): string {
    const pattern = parseNumberPattern(format) ?? parseNumberPattern(DEFAULT_NUMBER[type] ?? "") ?? undefined;
    const isPercent = type === "percent" || Boolean(pattern?.percent);
    const shown = isPercent ? value * 100 : value;
    const digits = pattern?.decimals;
    const text = new Intl.NumberFormat(locale, {
        minimumFractionDigits: digits ?? 0,
        maximumFractionDigits: digits ?? 10,
        useGrouping: pattern ? pattern.grouping : true
    }).format(shown);
    return `${pattern?.prefix ?? ""}${text}${pattern?.suffix ?? ""}${isPercent ? "%" : ""}`;
}

/** Locale-tolerant number parsing: "1,234.5", "1.234,5", "€ 12", "12 %", "(5)" (negative). */
export function parseNumber(text: string, locale = currentLocale()): number | undefined {
    let s = String(text ?? "").trim();
    if (!s) {
        return undefined;
    }
    let negative = false;
    if (s.startsWith("(") && s.endsWith(")")) {
        negative = true;
        s = s.slice(1, -1);
    }
    s = s.replace(/[^\d,.\-+eE]/g, "");
    if (!s || !/\d/.test(s)) {
        return undefined;
    }
    const decimalSep = new Intl.NumberFormat(locale).format(1.5).includes(",") ? "," : ".";
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma >= 0 && lastDot >= 0) {
        // Both present: the later one is the decimal separator.
        if (lastComma > lastDot) {
            s = s.replace(/\./g, "").replace(",", ".");
        } else {
            s = s.replace(/,/g, "");
        }
    } else if (lastComma >= 0) {
        const parts = s.split(",");
        const groupLike = parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && decimalSep === ".");
        s = groupLike ? s.replace(/,/g, "") : s.replace(",", ".");
    } else if (lastDot >= 0) {
        const parts = s.split(".");
        if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && decimalSep === ",")) {
            s = s.replace(/\./g, "");
        }
    }
    const value = Number(s);
    if (!Number.isFinite(value)) {
        return undefined;
    }
    return negative ? -value : value;
}

// ---- Dates -------------------------------------------------------------------------------------------

const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
];
const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

/** Parses a stored value (ISO string or Date or timestamp) into a Date. */
export function toDate(value: unknown): Date | undefined {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? undefined : value;
    }
    if (typeof value === "number") {
        return new Date(value);
    }
    if (typeof value !== "string" || !value.trim()) {
        return undefined;
    }
    const s = value.trim();
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (dateOnly) {
        return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    }
    const date = new Date(s);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

export function isoDate(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isoDateTime(date: Date): string {
    return date.toISOString();
}

/** Formats a date with tokens yyyy, yy, MMMM, MMM, MM, M, dd, d, HH, H, hh, h, mm, ss, a. */
export function formatDatePattern(date: Date, format: string): string {
    const tokens = ["yyyy", "yy", "MMMM", "MMM", "MM", "M", "dd", "d", "HH", "H", "hh", "h", "mm", "ss", "a"];
    let out = "";
    let i = 0;
    while (i < format.length) {
        if (format[i] === "'") {
            const end = format.indexOf("'", i + 1);
            out += format.slice(i + 1, end < 0 ? undefined : end);
            i = end < 0 ? format.length : end + 1;
            continue;
        }
        const at = i;
        const token = tokens.find(t => format.startsWith(t, at));
        if (!token) {
            out += format[i++];
            continue;
        }
        const h = date.getHours();
        switch (token) {
            case "yyyy":
                out += pad(date.getFullYear(), 4);
                break;
            case "yy":
                out += pad(date.getFullYear() % 100);
                break;
            case "MMMM":
                out += MONTHS[date.getMonth()];
                break;
            case "MMM":
                out += MONTHS[date.getMonth()].slice(0, 3);
                break;
            case "MM":
                out += pad(date.getMonth() + 1);
                break;
            case "M":
                out += String(date.getMonth() + 1);
                break;
            case "dd":
                out += pad(date.getDate());
                break;
            case "d":
                out += String(date.getDate());
                break;
            case "HH":
                out += pad(h);
                break;
            case "H":
                out += String(h);
                break;
            case "hh":
                out += pad(h % 12 || 12);
                break;
            case "h":
                out += String(h % 12 || 12);
                break;
            case "mm":
                out += pad(date.getMinutes());
                break;
            case "ss":
                out += pad(date.getSeconds());
                break;
            default:
                out += h < 12 ? "AM" : "PM";
        }
        i += token.length;
    }
    return out;
}

export function formatDate(value: unknown, type: ColumnType, format: string, locale = currentLocale()): string {
    const date = toDate(value);
    if (!date) {
        return typeof value === "string" ? value : "";
    }
    if (format.trim()) {
        return formatDatePattern(date, format.trim());
    }
    const withTime = type === "dateTime" || type === "createdAt" || type === "changedAt";
    return new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
        ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {})
    }).format(date);
}

/** Whether a locale writes the month before the day (en-US). */
export function monthFirst(locale = currentLocale()): boolean {
    const parts = new Intl.DateTimeFormat(locale).formatToParts(new Date(2020, 10, 22));
    const month = parts.findIndex(part => part.type === "month");
    const day = parts.findIndex(part => part.type === "day");
    return month >= 0 && day >= 0 && month < day;
}

/** Parses typed or pasted dates: ISO, the column format, d/m/y or m/d/y (locale), "22 Nov 2020", Excel serials. */
export function parseDate(text: string, format = "", locale = currentLocale()): Date | undefined {
    const s = String(text ?? "").trim();
    if (!s) {
        return undefined;
    }
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
    if (iso) {
        if (s.length > 10 && /[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
            const parsed = new Date(s);
            return Number.isNaN(parsed.getTime()) ? undefined : parsed;
        }
        return new Date(
            Number(iso[1]),
            Number(iso[2]) - 1,
            Number(iso[3]),
            Number(iso[4] ?? 0),
            Number(iso[5] ?? 0),
            Number(iso[6] ?? 0)
        );
    }
    const parts =
        /^(\d{1,4})[./\-\s](\d{1,2})[./\-\s](\d{1,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)?)?$/i.exec(s);
    if (parts) {
        let [a, b, c] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
        let year: number;
        let month: number;
        let day: number;
        if (parts[1].length === 4) {
            [year, month, day] = [a, b, c];
        } else {
            const fmt = format.trim();
            const mFirst = fmt ? fmt.indexOf("M") < fmt.indexOf("d") : monthFirst(locale);
            if (a > 12) {
                [day, month] = [a, b];
            } else if (b > 12) {
                [month, day] = [a, b];
            } else if (mFirst) {
                [month, day] = [a, b];
            } else {
                [day, month] = [a, b];
            }
            year = c < 100 ? 2000 + c : c;
            a = b = c = 0;
        }
        let hours = Number(parts[4] ?? 0);
        if (parts[7]) {
            hours = (hours % 12) + (parts[7].toLowerCase() === "pm" ? 12 : 0);
        }
        const date = new Date(year, month - 1, day, hours, Number(parts[5] ?? 0), Number(parts[6] ?? 0));
        return date.getMonth() === month - 1 ? date : undefined;
    }
    const named = /^(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})$/.exec(s) ?? undefined;
    if (named) {
        const month = MONTHS.findIndex(m => m.toLowerCase().startsWith(named[2].toLowerCase().slice(0, 3)));
        if (month >= 0) {
            return new Date(Number(named[3]), month, Number(named[1]));
        }
    }
    if (/^\d{5}(\.\d+)?$/.test(s)) {
        // Excel serial date.
        const serial = Number(s);
        const ms = Math.round((serial - 25569) * 86400000);
        const utc = new Date(ms);
        return new Date(
            utc.getUTCFullYear(),
            utc.getUTCMonth(),
            utc.getUTCDate(),
            utc.getUTCHours(),
            utc.getUTCMinutes()
        );
    }
    const fallback = new Date(s);
    return Number.isNaN(fallback.getTime()) ? undefined : fallback;
}

// ---- Booleans ----------------------------------------------------------------------------------------

const TRUE_WORDS = ["true", "yes", "y", "1", "x", "✓", "✔", "ja", "oui", "si", "sí", "on", "checked"];
const FALSE_WORDS = ["false", "no", "n", "0", "nee", "non", "nein", "off", "unchecked", "-"];

export function parseBoolean(text: string): boolean | undefined {
    const s = String(text ?? "")
        .trim()
        .toLowerCase();
    if (TRUE_WORDS.includes(s)) {
        return true;
    }
    if (FALSE_WORDS.includes(s)) {
        return false;
    }
    return undefined;
}

// ---- Options -----------------------------------------------------------------------------------------

export function optionFor(column: ColumnDef, value: unknown): SelectOption | undefined {
    const s = String(value ?? "");
    return column.options.find(option => option.value === s);
}

export function optionLabel(column: ColumnDef, value: unknown): string {
    return optionFor(column, value)?.label ?? String(value ?? "");
}

/** Finds an option by value or label (case-insensitive). */
export function matchOption(options: SelectOption[], text: string): SelectOption | undefined {
    const s = text.trim().toLowerCase();
    return (
        options.find(option => option.value.toLowerCase() === s) ??
        options.find(option => option.label.toLowerCase() === s)
    );
}

export function asArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map(String);
    }
    if (isEmpty(value)) {
        return [];
    }
    return String(value)
        .split(/[,;\n]/)
        .map(part => part.trim())
        .filter(Boolean);
}

// ---- Display -----------------------------------------------------------------------------------------

/** Text shown for a stored value (also used for copy, search, CSV and grouping). */
// ---- Linked record labels (1.2) ------------------------------------------------------------------------

let linkLabels = new Map<string, string>();

/** Labels of linkable rows by key; set by the grid whenever the link data source changes. */
export function setLinkLabels(labels: Map<string, string>): void {
    linkLabels = labels;
}

export function linkedLabel(key: string): string {
    return linkLabels.get(key) ?? key;
}

export function formatValue(column: ColumnDef, value: unknown, locale = currentLocale()): string {
    if (isEmpty(value)) {
        return "";
    }
    if (column.type === "linkedRecord") {
        return asArray(value).map(linkedLabel).join(", ");
    }
    if (column.type === "formula") {
        if (typeof value === "number") {
            return formatNumber(value, "decimal", column.format || "#,##0.##", locale);
        }
        if (typeof value === "boolean") {
            return value ? "✓" : "✗";
        }
        return String(value);
    }
    const kind = typeInfo(column.type).kind;
    switch (kind) {
        case "number": {
            const n = typeof value === "number" ? value : Number(value);
            return Number.isFinite(n) ? formatNumber(n, column.type, column.format, locale) : String(value);
        }
        case "date":
            return formatDate(value, column.type, column.format, locale);
        case "boolean":
            return value === true || value === "true" ? "✓" : "";
        case "select":
            return optionLabel(column, value);
        case "multi":
            return asArray(value)
                .map(item => optionLabel(column, item))
                .join(", ");
        default:
            return String(value);
    }
}

/** Plain text of a value for copy/CSV: booleans as true/false, dates ISO-like, numbers unformatted. */
export function plainValue(column: ColumnDef, value: unknown): string {
    if (isEmpty(value)) {
        return "";
    }
    if (column.type === "linkedRecord") {
        return asArray(value).map(linkedLabel).join(", ");
    }
    const kind = typeInfo(column.type).kind;
    switch (kind) {
        case "boolean":
            return value === true || value === "true" ? "true" : "false";
        case "number":
            return String(value);
        case "date": {
            const date = toDate(value);
            if (!date) {
                return String(value);
            }
            return column.type === "date" ? isoDate(date) : formatDatePattern(date, "yyyy-MM-dd HH:mm:ss");
        }
        case "select":
            return optionLabel(column, value);
        case "multi":
            return asArray(value)
                .map(item => optionLabel(column, item))
                .join(", ");
        default:
            return String(value);
    }
}

// ---- Parsing user input ------------------------------------------------------------------------------

export type Parsed = { ok: true; value: CellValue; newOptions?: SelectOption[] } | { ok: false };

/**
 * Turns text (typed, pasted, imported) into a stored value for the column. Unknown select labels are
 * accepted as new options when `allowNewOptions` is set (paste and import), otherwise rejected.
 */
export function parseInput(
    column: ColumnDef,
    text: string,
    options: { allowNewOptions?: boolean; locale?: string } = {}
): Parsed {
    const s = String(text ?? "");
    if (!s.trim()) {
        return { ok: true, value: null };
    }
    const locale = options.locale ?? currentLocale();
    switch (column.type) {
        case "number":
        case "decimal":
        case "currency":
        case "autoNumber": {
            const n = parseNumber(s, locale);
            if (n === undefined) {
                return { ok: false };
            }
            return { ok: true, value: column.type === "number" ? Math.round(n) : n };
        }
        case "percent": {
            const n = parseNumber(s, locale);
            if (n === undefined) {
                return { ok: false };
            }
            return { ok: true, value: s.includes("%") || Math.abs(n) > 1 ? n / 100 : n };
        }
        case "rating": {
            const stars = s.includes("★") ? s.split("★").length - 1 : parseNumber(s, locale);
            if (stars === undefined) {
                return { ok: false };
            }
            return { ok: true, value: Math.max(0, Math.min(column.max ?? 5, Math.round(stars))) };
        }
        case "progress": {
            const n = parseNumber(s, locale);
            if (n === undefined) {
                return { ok: false };
            }
            return { ok: true, value: Math.max(0, Math.min(100, n)) };
        }
        case "date":
        case "dateTime":
        case "createdAt":
        case "changedAt": {
            const date = parseDate(s, column.format, locale);
            if (!date) {
                return { ok: false };
            }
            return { ok: true, value: column.type === "date" ? isoDate(date) : isoDateTime(date) };
        }
        case "boolean": {
            const b = parseBoolean(s);
            return b === undefined ? { ok: false } : { ok: true, value: b };
        }
        case "select": {
            const match = matchOption(column.options, s);
            if (match) {
                return { ok: true, value: match.value };
            }
            if (!options.allowNewOptions) {
                return { ok: false };
            }
            const created = newOption(s.trim(), column.options.length);
            return { ok: true, value: created.value, newOptions: [created] };
        }
        case "linkedRecord": {
            const keys: string[] = [];
            for (const part of asArray(s)) {
                const lower = part.toLowerCase();
                let found: string | undefined;
                linkLabels.forEach((label, key) => {
                    if (!found && (key === part || label.toLowerCase() === lower)) {
                        found = key;
                    }
                });
                if (!found) {
                    return { ok: false };
                }
                keys.push(found);
            }
            return { ok: true, value: keys };
        }
        case "multiSelect": {
            const values: string[] = [];
            const created: SelectOption[] = [];
            for (const part of asArray(s)) {
                const match = matchOption([...column.options, ...created], part);
                if (match) {
                    values.push(match.value);
                } else if (options.allowNewOptions) {
                    const option = newOption(part, column.options.length + created.length);
                    created.push(option);
                    values.push(option.value);
                } else {
                    return { ok: false };
                }
            }
            return created.length ? { ok: true, value: values, newOptions: created } : { ok: true, value: values };
        }
        default:
            return { ok: true, value: s };
    }
}

export function newOption(label: string, index: number): SelectOption {
    return { value: label, label, color: OPTION_COLORS[index % OPTION_COLORS.length] };
}

// ---- Type conversion ---------------------------------------------------------------------------------

export interface Conversion {
    /** New value per row key (only rows whose stored value changes). */
    values: Map<string, CellValue>;
    /** Non-empty values that cannot be converted (cleared). */
    lost: number;
    /** Non-empty values in total. */
    total: number;
    /** Options of the target column (existing plus created from distinct values). */
    options: SelectOption[];
    /** A few before/after examples for the preview. */
    samples: Array<{ before: string; after: string; lost: boolean }>;
}

function sameValue(a: unknown, b: unknown): boolean {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Converts the stored values of a column to a new type. Select targets get an option for every distinct
 * value (keeping the existing options); computed and system targets drop the stored values.
 */
export function convertColumn(
    rows: Array<{ key: string; values: Record<string, CellValue> }>,
    from: ColumnDef,
    toType: ColumnType,
    sampleCount = 6
): Conversion {
    const target: ColumnDef = { ...from, type: toType, options: [...from.options] };
    if (toType !== "select" && toType !== "multiSelect") {
        target.options = from.options;
    }
    const values = new Map<string, CellValue>();
    const samples: Conversion["samples"] = [];
    let lost = 0;
    let total = 0;
    const fromKind = typeInfo(from.type).kind;
    const toInfo = typeInfo(toType);
    for (const row of rows) {
        const before = row.values[from.key];
        if (isEmpty(before)) {
            continue;
        }
        total++;
        let after: CellValue = null;
        let ok = true;
        if (toInfo.system) {
            ok = false;
        } else if (fromKind === "select" && toType === "multiSelect") {
            after = [String(before)];
        } else if (fromKind === "multi" && toType === "select") {
            after = asArray(before)[0] ?? null;
        } else if (fromKind === "number" && (toType === "percent" || from.type === "percent")) {
            const n = Number(before);
            after =
                from.type === "percent" && toType !== "percent"
                    ? n * 100
                    : toType === "percent" && from.type !== "percent"
                    ? n / 100
                    : n;
            if (toType === "number") {
                after = Math.round(after);
            }
        } else if (fromKind === "date" && typeInfo(toType).kind === "date") {
            const date = toDate(before);
            after = date ? (toType === "date" ? isoDate(date) : isoDateTime(date)) : null;
            ok = Boolean(date);
        } else if (fromKind === "boolean" && typeInfo(toType).kind === "number") {
            after = before === true ? 1 : 0;
        } else if (fromKind === "number" && toType === "boolean") {
            after = Number(before) !== 0;
        } else {
            const text = plainValue(from, before);
            const parsed = parseInput(target, text, { allowNewOptions: true });
            if (parsed.ok) {
                after = parsed.value;
                parsed.newOptions?.forEach(option => {
                    if (!matchOption(target.options, option.label)) {
                        target.options.push(newOption(option.label, target.options.length));
                    }
                });
            } else {
                ok = false;
            }
        }
        if (!ok) {
            lost++;
            after = null;
        }
        if (!sameValue(before, after)) {
            values.set(row.key, after);
        }
        if (samples.length < sampleCount) {
            samples.push({
                before: formatValue(from, before),
                after: ok ? formatValue(target, after) : "",
                lost: !ok
            });
        }
    }
    return { values, lost, total, options: target.options, samples };
}

// ---- Excel ------------------------------------------------------------------------------------------

/** Typed value for an Excel cell: numbers, Dates, booleans, or text (labels for options). */
export function excelValue(column: ColumnDef, value: unknown): string | number | boolean | Date | null {
    if (isEmpty(value)) {
        return null;
    }
    switch (typeInfo(column.type).kind) {
        case "number": {
            const n = Number(value);
            return Number.isFinite(n) ? n : String(value);
        }
        case "date":
            return toDate(value) ?? String(value);
        case "boolean":
            return value === true || value === "true";
        default:
            return plainValue(column, value);
    }
}

/** Converts a column number/date format to an Excel number format code. */
export function excelFormat(column: ColumnDef): string | undefined {
    const kind = typeInfo(column.type).kind;
    const format = column.format.trim();
    if (kind === "date") {
        const base = format || (column.type === "date" ? "dd-MM-yyyy" : "dd-MM-yyyy HH:mm");
        // Excel uses m for months and minutes; MM after H/h is minutes.
        let out = "";
        for (const c of base) {
            if (c === "M") {
                out += "m";
            } else if (c === "m") {
                out += "m";
            } else if (c === "a") {
                out += "AM/PM";
            } else if (c === "H") {
                out += "h";
            } else {
                out += c;
            }
        }
        return out;
    }
    if (kind !== "number") {
        return undefined;
    }
    const pattern = parseNumberPattern(format) ?? parseNumberPattern(DEFAULT_NUMBER[column.type] ?? "");
    if (!pattern) {
        return undefined;
    }
    const integer = pattern.grouping ? "#,##0" : "0";
    const decimals = pattern.decimals ? `.${"0".repeat(pattern.decimals)}` : "";
    const quote = (s: string): string => (s ? `"${s.replace(/"/g, "")}"` : "");
    const percent = column.type === "percent" || pattern.percent ? "%" : "";
    return `${quote(pattern.prefix)}${integer}${decimals}${percent}${quote(pattern.suffix)}`;
}
