import type { Big } from "big.js";
import type { ListAttributeValue, ListValue, ObjectItem } from "mendix";

import { parseRowData } from "./model";
import { asArray, isEmpty } from "./values";
import { CellValue, ColumnDef, CommentRecord, HistoryRecord, RowRecord } from "./types";

/** 1.2 drop 2: linked rows, lookup and rollup fields, comments and history read from their optional data sources. */

type Attr<T extends string | boolean | Big | Date> = ListAttributeValue<T> | undefined;

function read<T extends string | boolean | Big | Date>(attribute: Attr<T>, item: ObjectItem): T | undefined {
    if (!attribute) {
        return undefined;
    }
    try {
        return attribute.get(item).value ?? undefined;
    } catch {
        return undefined;
    }
}

export interface LinkRow {
    key: string;
    label: string;
    grid: string;
    values: Record<string, CellValue>;
}

export function readLinks(
    source: ListValue | undefined,
    attrs: { linkKey?: Attr<string>; linkLabel?: Attr<string>; linkData?: Attr<string>; linkGrid?: Attr<string> }
): LinkRow[] {
    return (source?.items ?? []).map(item => ({
        key: read(attrs.linkKey, item) || String(item.id),
        label: read(attrs.linkLabel, item) ?? "",
        grid: read(attrs.linkGrid, item) ?? "",
        values: parseRowData(read(attrs.linkData, item))
    }));
}

export function readComments(
    source: ListValue | undefined,
    attrs: {
        commentKey?: Attr<string>;
        commentRow?: Attr<string>;
        commentCol?: Attr<string>;
        commentText?: Attr<string>;
        commentAuthor?: Attr<string>;
        commentResolved?: Attr<boolean>;
        commentDate?: Attr<Date>;
    }
): CommentRecord[] | undefined {
    if (!source) {
        return undefined;
    }
    return (source.items ?? []).map(item => {
        const date = read(attrs.commentDate, item);
        return {
            key: read(attrs.commentKey, item) || String(item.id),
            row: read(attrs.commentRow, item) ?? "",
            col: read(attrs.commentCol, item) || null,
            text: read(attrs.commentText, item) ?? "",
            author: read(attrs.commentAuthor, item) ?? "",
            resolved: read(attrs.commentResolved, item) === true,
            date: date ? date.toISOString() : undefined
        };
    });
}

export function readHistory(
    source: ListValue | undefined,
    attrs: {
        historyRow?: Attr<string>;
        historyCol?: Attr<string>;
        historyOld?: Attr<string>;
        historyNew?: Attr<string>;
        historyBy?: Attr<string>;
        historyOp?: Attr<string>;
        historyDate?: Attr<Date>;
    }
): HistoryRecord[] {
    return (source?.items ?? []).map(item => {
        const date = read(attrs.historyDate, item);
        return {
            row: read(attrs.historyRow, item) ?? "",
            col: read(attrs.historyCol, item) ?? "",
            oldValue: read(attrs.historyOld, item) ?? "",
            newValue: read(attrs.historyNew, item) ?? "",
            by: read(attrs.historyBy, item) ?? "",
            op: read(attrs.historyOp, item) ?? "setCell",
            date: date ? date.toISOString() : undefined
        };
    });
}

// ---- Linked records, lookup and rollup ------------------------------------------------------------------

export interface LinkConfig {
    target?: string;
    multiple?: boolean;
    link?: string;
    field?: string;
    fn?: "sum" | "avg" | "min" | "max" | "count";
}

/** Link settings are kept in the options JSON object (colOptions), which the model exposes as `link`. */
export function linkConfig(column: ColumnDef): LinkConfig {
    return column.link ?? {};
}

export function linkTargets(column: ColumnDef, links: LinkRow[]): LinkRow[] {
    const target = linkConfig(column).target;
    return target ? links.filter(link => link.grid === target) : links;
}

/** Label of a linked key (unknown keys show the key). */
export function linkLabel(links: Map<string, LinkRow>, key: string): string {
    const link = links.get(key);
    return link ? link.label || key : key;
}

/** Adds lookup and rollup values to the rows. Rows without such columns are returned unchanged. */
export function computeRelated(
    rows: RowRecord[],
    columns: ColumnDef[],
    links: LinkRow[],
    sameRows: RowRecord[]
): RowRecord[] {
    const derived = columns.filter(column => column.type === "lookup" || column.type === "rollup");
    if (!derived.length) {
        return rows;
    }
    const index = new Map<string, Record<string, CellValue>>();
    links.forEach(link => index.set(link.key, link.values));
    // The rows of this grid can be linked too (self links, for example a parent task).
    sameRows.forEach(row => {
        if (!index.has(row.key)) {
            index.set(row.key, row.values);
        }
    });
    return rows.map(row => {
        const values = { ...row.values };
        derived.forEach(column => {
            const config = linkConfig(column);
            const keys = config.link ? asArray(row.values[config.link]) : [];
            const field = config.field ?? "";
            const targets = keys.map(key => index.get(key)).filter((v): v is Record<string, CellValue> => Boolean(v));
            if (column.type === "lookup") {
                const parts = targets
                    .map(values => values[field])
                    .filter(value => !isEmpty(value))
                    .map(value => (Array.isArray(value) ? value.join(", ") : String(value)));
                values[column.key] = parts.length ? parts.join(", ") : null;
                return;
            }
            const numbers = targets.map(values => Number(values[field])).filter(Number.isFinite);
            const fn = config.fn ?? "sum";
            let result: number | null;
            if (fn === "count") {
                result = targets.length;
            } else if (!numbers.length) {
                result = null;
            } else if (fn === "avg") {
                result = numbers.reduce((s, n) => s + n, 0) / numbers.length;
            } else if (fn === "min") {
                result = Math.min(...numbers);
            } else if (fn === "max") {
                result = Math.max(...numbers);
            } else {
                result = Number(numbers.reduce((s, n) => s + n, 0).toFixed(10));
            }
            values[column.key] = result;
        });
        return { ...row, values };
    });
}

// ---- Registry of the linkable rows, for editors (set by the grid) -------------------------------------

let linkRows: LinkRow[] = [];

export function setLinkRows(rows: LinkRow[]): void {
    linkRows = rows;
}

export function linkOptionsFor(column: ColumnDef): LinkRow[] {
    return linkTargets(column, linkRows);
}

export function allLinkRows(): LinkRow[] {
    return linkRows;
}

/** Grids found among the linkable rows (for the link target picker). */
export function linkGrids(): string[] {
    return Array.from(new Set(linkRows.map(link => link.grid).filter(Boolean)));
}

/** Field keys found in the data of the linkable rows (optionally of one grid). */
export function linkFieldKeys(target?: string): string[] {
    const keys = new Set<string>();
    linkRows
        .filter(link => !target || link.grid === target)
        .slice(0, 200)
        .forEach(link => Object.keys(link.values).forEach(key => keys.add(key)));
    return Array.from(keys);
}

/** Presence attribute: a JSON array or a comma separated list of names. */
export function parsePresence(text: string | undefined): string[] {
    if (!text || !text.trim()) {
        return [];
    }
    try {
        const raw = JSON.parse(text);
        if (Array.isArray(raw)) {
            return raw
                .map(entry => (typeof entry === "string" ? entry : String((entry as { name?: string })?.name ?? "")))
                .filter(Boolean);
        }
    } catch {
        // not JSON: a list
    }
    return text
        .split(",")
        .map(name => name.trim())
        .filter(Boolean);
}
