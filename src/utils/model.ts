import type { ListAttributeValue, ListValue, ObjectItem } from "mendix";
import type { Big } from "big.js";

import { normalizeType } from "./columnTypes";
import { CellValue, ColumnDef, LinkSettings, Pinned, RowRecord, SelectOption, ValidationRule } from "./types";

/** Reads the column and row data sources into the plain grid model. */

type Attr<T extends string | boolean | Big> = ListAttributeValue<T> | undefined;

function read<T extends string | boolean | Big>(attribute: Attr<T>, item: ObjectItem): T | undefined {
    if (!attribute) {
        return undefined;
    }
    try {
        return attribute.get(item).value ?? undefined;
    } catch {
        return undefined;
    }
}

function num(value: Big | number | undefined): number | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    const n = typeof value === "number" ? value : Number(value.toString());
    return Number.isFinite(n) ? n : undefined;
}

export function parsePinned(value: string | undefined): Pinned {
    const s = String(value ?? "")
        .trim()
        .toLowerCase();
    return s === "left" ? "left" : s === "right" ? "right" : null;
}

function parseJson(text: string | undefined): unknown {
    if (!text || !text.trim()) {
        return undefined;
    }
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}

/** Options JSON: a list of options, or an object with options, max and default. Plain strings become options. */
export function parseOptions(text: string | undefined): {
    options: SelectOption[];
    max?: number;
    defaultValue?: CellValue;
    link?: LinkSettings;
} {
    const raw = parseJson(text);
    const list = Array.isArray(raw)
        ? raw
        : raw && typeof raw === "object"
        ? (raw as { options?: unknown }).options
        : undefined;
    const options: SelectOption[] = Array.isArray(list)
        ? list
              .map(entry => {
                  if (typeof entry === "string" || typeof entry === "number") {
                      return { value: String(entry), label: String(entry) };
                  }
                  if (entry && typeof entry === "object") {
                      const e = entry as Record<string, unknown>;
                      const value = String(e.value ?? e.label ?? "");
                      return {
                          value,
                          label: String(e.label ?? value),
                          ...(e.color ? { color: String(e.color) } : {})
                      };
                  }
                  return undefined;
              })
              .filter((option): option is SelectOption => Boolean(option && option.value))
        : [];
    const result: { options: SelectOption[]; max?: number; defaultValue?: CellValue; link?: LinkSettings } = {
        options
    };
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const o = raw as Record<string, unknown>;
        if (typeof o.max === "number") {
            result.max = o.max;
        }
        if (o.default !== undefined) {
            result.defaultValue = o.default as CellValue;
        }
        const link: LinkSettings = {};
        if (typeof o.target === "string") {
            link.target = o.target;
        }
        if (typeof o.multiple === "boolean") {
            link.multiple = o.multiple;
        }
        if (typeof o.link === "string") {
            link.link = o.link;
        }
        if (typeof o.field === "string") {
            link.field = o.field;
        }
        if (o.fn === "sum" || o.fn === "avg" || o.fn === "min" || o.fn === "max" || o.fn === "count") {
            link.fn = o.fn;
        }
        if (Object.keys(link).length) {
            result.link = link;
        }
    }
    return result;
}

/** Serialises options (and rating max / default value) back to the options JSON. */
export function serializeOptions(column: Pick<ColumnDef, "options" | "max" | "defaultValue">): string {
    const extra = column.max !== undefined || (column.defaultValue !== undefined && column.defaultValue !== null);
    if (!extra) {
        return column.options.length ? JSON.stringify(column.options) : "";
    }
    return JSON.stringify({
        options: column.options,
        ...(column.max !== undefined ? { max: column.max } : {}),
        ...(column.defaultValue !== undefined && column.defaultValue !== null ? { default: column.defaultValue } : {})
    });
}

export function parseValidation(text: string | undefined): ValidationRule {
    const raw = parseJson(text);
    if (!raw || typeof raw !== "object") {
        return {};
    }
    const o = raw as Record<string, unknown>;
    const rule: ValidationRule = {};
    if (o.min !== undefined && o.min !== null && o.min !== "" && Number.isFinite(Number(o.min))) {
        rule.min = Number(o.min);
    }
    if (o.max !== undefined && o.max !== null && o.max !== "" && Number.isFinite(Number(o.max))) {
        rule.max = Number(o.max);
    }
    if (typeof o.regex === "string" && o.regex) {
        rule.regex = o.regex;
    }
    if (o.unique === true) {
        rule.unique = true;
    }
    if (typeof o.message === "string" && o.message) {
        rule.message = o.message;
    }
    return rule;
}

export interface ColumnAttributes {
    colKey: ListAttributeValue<string>;
    colCaption: ListAttributeValue<string>;
    colType: ListAttributeValue<string>;
    colOrder?: ListAttributeValue<Big>;
    colWidth?: ListAttributeValue<Big>;
    colPinned?: ListAttributeValue<string>;
    colHidden?: ListAttributeValue<boolean>;
    colRequired?: ListAttributeValue<boolean>;
    colReadOnly?: ListAttributeValue<boolean>;
    colOptions?: ListAttributeValue<string>;
    colFormat?: ListAttributeValue<string>;
    colFormula?: ListAttributeValue<string>;
    colHeaderGroup?: ListAttributeValue<string>;
    colDescription?: ListAttributeValue<string>;
    colValidation?: ListAttributeValue<string>;
    colCanEdit?: ListAttributeValue<boolean>;
}

export function readColumns(source: ListValue, attrs: ColumnAttributes): ColumnDef[] {
    const items = source.items ?? [];
    const columns = items.map((item, index): ColumnDef => {
        const options = parseOptions(read(attrs.colOptions, item));
        const width = num(read(attrs.colWidth, item));
        return {
            key: read(attrs.colKey, item) || String(item.id),
            caption: read(attrs.colCaption, item) ?? "",
            type: normalizeType(read(attrs.colType, item)),
            order: num(read(attrs.colOrder, item)) ?? index,
            width: width && width > 0 ? width : undefined,
            pinned: parsePinned(read(attrs.colPinned, item)),
            hidden: read(attrs.colHidden, item) === true,
            required: read(attrs.colRequired, item) === true,
            readOnly: read(attrs.colReadOnly, item) === true,
            options: options.options,
            max: options.max,
            defaultValue: options.defaultValue,
            link: options.link,
            format: read(attrs.colFormat, item) ?? "",
            formula: read(attrs.colFormula, item) ?? "",
            headerGroup: read(attrs.colHeaderGroup, item) ?? "",
            description: read(attrs.colDescription, item) ?? "",
            validation: parseValidation(read(attrs.colValidation, item)),
            canEdit: attrs.colCanEdit ? read(attrs.colCanEdit, item) !== false : true
        };
    });
    const position = new Map(items.map((item, index) => [item.id, index]));
    return columns
        .map((column, index) => ({ column, index }))
        .sort((a, b) => a.column.order - b.column.order || a.index - b.index)
        .map(({ column }, order) => ({ ...column, order }))
        .filter(
            (column, index, list) => list.findIndex(other => other.key === column.key) === index && position.size >= 0
        );
}

const jsonCache = new Map<string, Record<string, CellValue>>();

/** Parses the row JSON with a small cache (rows rarely change between renders). */
export function parseRowData(text: string | undefined): Record<string, CellValue> {
    if (!text) {
        return {};
    }
    const cached = jsonCache.get(text);
    if (cached) {
        return cached;
    }
    const raw = parseJson(text);
    const values = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, CellValue>) : {};
    if (jsonCache.size > 20000) {
        jsonCache.clear();
    }
    jsonCache.set(text, values);
    return values;
}

export interface RowAttributes {
    rowKey: ListAttributeValue<string>;
    rowData: ListAttributeValue<string>;
    rowOrder?: ListAttributeValue<Big>;
}

export function readRows(items: ObjectItem[], attrs: RowAttributes, sortByOrder: boolean): RowRecord[] {
    const rows = items.map(
        (item, index): RowRecord => ({
            key: read(attrs.rowKey, item) || String(item.id),
            values: parseRowData(read(attrs.rowData, item)),
            order: (attrs.rowOrder ? num(read(attrs.rowOrder, item)) : undefined) ?? index,
            itemId: String(item.id)
        })
    );
    const ordered =
        sortByOrder && attrs.rowOrder
            ? rows
                  .map((row, index) => ({ row, index }))
                  .sort((a, b) => a.row.order - b.row.order || a.index - b.index)
                  .map(e => e.row)
            : rows;
    return ordered.map((row, order) => (row.order === order ? row : { ...row, order }));
}
