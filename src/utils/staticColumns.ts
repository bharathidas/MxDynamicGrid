import { Big } from "big.js";
import type { ListAttributeValue, ObjectItem } from "mendix";

import type { StaticColumnsType } from "../../typings/MxDynamicGridProps";
import { isoDateTime, toDate } from "./values";
import { CellValue, ColumnDef, ColumnType, SelectOption } from "./types";

/**
 * Static (Data Grid 2 style) columns over attributes of the row objects. Their values are put into the row values
 * under the column id `__static<n>`, so search, filters, sorting, grouping and export treat them like any column.
 * Editing writes through the Mendix client API (setValue is not supported on data source attributes).
 */

export type StaticAttribute = ListAttributeValue<string | Big | boolean | Date>;

export function staticId(index: number): string {
    return `__static${index}`;
}

export function isStaticId(colId: string): boolean {
    return colId.startsWith("__static");
}

export function staticIndex(colId: string): number {
    return Number(colId.slice("__static".length));
}

function attributeType(attribute: StaticAttribute | undefined): ColumnType {
    switch (attribute?.type) {
        case "Integer":
        case "Long":
        case "AutoNumber":
            return "number";
        case "Decimal":
            return "decimal";
        case "Boolean":
            return "boolean";
        case "DateTime":
            return "dateTime";
        case "Enum":
            return "select";
        default:
            return "text";
    }
}

function enumOptions(attribute: StaticAttribute | undefined): SelectOption[] {
    const universe = (attribute as { universe?: string[] } | undefined)?.universe ?? [];
    return universe.map(value => {
        let label = value;
        try {
            label = attribute?.formatter.format(value as never) || value;
        } catch {
            // keep the key
        }
        return { value, label };
    });
}

export function staticColumnDefs(columns: StaticColumnsType[]): ColumnDef[] {
    return columns.map((column, index): ColumnDef => {
        const type: ColumnType = column.staticType === "attribute" ? attributeType(column.staticAttribute) : "text";
        return {
            key: staticId(index),
            caption: column.staticCaption?.value ?? "",
            type,
            order: index,
            width: column.staticWidth > 0 ? column.staticWidth : undefined,
            pinned: column.staticPinned === "none" ? null : column.staticPinned,
            hidden: false,
            required: false,
            readOnly: !(column.staticType === "attribute" && column.staticEditable),
            options: type === "select" ? enumOptions(column.staticAttribute) : [],
            format: "",
            formula: "",
            headerGroup: column.staticHeaderGroup ?? "",
            description: "",
            validation: {},
            canEdit: column.staticType === "attribute" && column.staticEditable
        };
    });
}

export function staticValue(column: StaticColumnsType, item: ObjectItem): CellValue {
    try {
        if (column.staticType === "dynamicText") {
            return column.staticText?.get(item).value ?? null;
        }
        if (column.staticType !== "attribute" || !column.staticAttribute) {
            return null;
        }
        const value = column.staticAttribute.get(item).value;
        if (value === undefined || value === null) {
            return null;
        }
        if (value instanceof Big) {
            return value.toNumber();
        }
        if (value instanceof Date) {
            return isoDateTime(value);
        }
        return value as string | boolean;
    } catch {
        return null;
    }
}

// ---- Writing through the Mendix client API ---------------------------------------------------------

interface MxObject {
    get: (attribute: string) => unknown;
    set: (attribute: string, value: unknown) => void;
    getAttributes: () => string[];
    getAttributeType: (attribute: string) => string;
}

interface MxData {
    get: (options: {
        guids: string[];
        callback: (result: MxObject[] | MxObject) => void;
        error?: (e: unknown) => void;
    }) => void;
    commit?: (options: { mxobj: MxObject; callback: () => void; error?: (e: unknown) => void }) => void;
}

function mxData(): MxData | undefined {
    const mx = (window as unknown as { mx?: { data?: MxData } }).mx;
    return mx?.data && typeof mx.data.get === "function" ? mx.data : undefined;
}

function getObjects(data: MxData, guids: string[]): Promise<MxObject[]> {
    return new Promise((resolve, reject) =>
        data.get({ guids, callback: result => resolve(Array.isArray(result) ? result : [result]), error: reject })
    );
}

const CLIENT_TYPES: Record<string, string[]> = {
    text: ["String", "HashString"],
    number: ["Integer", "Long", "AutoNumber"],
    decimal: ["Decimal"],
    boolean: ["Boolean"],
    dateTime: ["DateTime"],
    select: ["Enum"]
};

function same(raw: unknown, value: unknown): boolean {
    const empty = (v: unknown): boolean => v === undefined || v === null || v === "";
    if (empty(raw) || empty(value)) {
        return empty(raw) && empty(value);
    }
    if (value instanceof Date) {
        return Number(raw) === value.getTime();
    }
    if (value instanceof Big) {
        return Number(String(raw)) === value.toNumber();
    }
    return String(raw) === String(value);
}

const names = new Map<string, Promise<string | undefined>>();

/** Recovers the attribute name by matching values of a few loaded objects (the widget API hides names). */
function resolveName(
    data: MxData,
    attribute: StaticAttribute,
    type: ColumnType,
    items: ObjectItem[]
): Promise<string | undefined> {
    const cached = names.get(attribute.id);
    if (cached) {
        return cached;
    }
    const sample = items.slice(0, 8);
    const promise = getObjects(
        data,
        sample.map(item => item.id)
    )
        .then(objects => {
            let candidates: string[] | undefined;
            objects.forEach((object, index) => {
                const expected = attribute.get(sample[index]).value;
                candidates = (candidates ?? object.getAttributes()).filter(
                    name =>
                        (CLIENT_TYPES[type] ?? []).includes(object.getAttributeType(name)) &&
                        same(object.get(name), expected)
                );
            });
            if (!candidates || candidates.length !== 1) {
                names.delete(attribute.id);
                return undefined;
            }
            return candidates[0];
        })
        .catch(() => {
            names.delete(attribute.id);
            return undefined;
        });
    names.set(attribute.id, promise);
    return promise;
}

function clientValue(type: ColumnType, value: CellValue): unknown {
    if (value === null || value === "") {
        return type === "text" ? "" : null;
    }
    if (type === "dateTime") {
        return toDate(value)?.getTime() ?? null;
    }
    if (type === "number" || type === "decimal") {
        return String(value);
    }
    return value;
}

/** Writes and commits a static attribute value. Resolves with an error message, or undefined on success. */
export async function writeStaticValue(
    column: StaticColumnsType,
    type: ColumnType,
    item: ObjectItem,
    value: CellValue,
    items: ObjectItem[]
): Promise<string | undefined> {
    const attribute = column.staticAttribute;
    if (!attribute) {
        return "No attribute";
    }
    const editable = attribute.get(item);
    if (!editable.readOnly) {
        try {
            const converted =
                type === "dateTime"
                    ? toDate(value)
                    : type === "number" || type === "decimal"
                    ? value === null
                        ? undefined
                        : new Big(Number(value))
                    : value ?? undefined;
            editable.setValue(converted as never);
            return undefined;
        } catch {
            // fall through to the client API
        }
    }
    const data = mxData();
    if (!data) {
        return "The Mendix client API is not available";
    }
    const name =
        column.staticAttributeName.trim() || (await resolveName(data, attribute, type, items.length ? items : [item]));
    if (!name) {
        return "Cannot tell which attribute to write; set 'Attribute name (editing)' on the static column";
    }
    const [object] = await getObjects(data, [item.id]);
    if (!object) {
        return "The object is no longer available";
    }
    object.set(name, clientValue(type, value));
    if (data.commit) {
        await new Promise<void>((resolve, reject) =>
            data.commit?.({ mxobj: object, callback: resolve, error: reject })
        );
    }
    return undefined;
}
