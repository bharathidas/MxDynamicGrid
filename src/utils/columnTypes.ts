import { COLUMN_TYPES, ColumnType } from "./types";

/** How a type behaves: the value kind it stores, its filter, alignment, whether users can edit it. */
export type ValueKind = "text" | "number" | "date" | "boolean" | "select" | "multi";
export type FilterKind = "text" | "number" | "date" | "boolean" | "set";

export interface TypeInfo {
    kind: ValueKind;
    filter: FilterKind;
    align: "left" | "right" | "center";
    /** Values come from the server or are computed: never edited in a cell. */
    system: boolean;
    defaultWidth: number;
    icon: string;
}

const T = (
    kind: ValueKind,
    filter: FilterKind,
    align: TypeInfo["align"],
    system: boolean,
    defaultWidth: number,
    icon: string
): TypeInfo => ({ kind, filter, align, system, defaultWidth, icon });

export const TYPE_INFO: Record<ColumnType, TypeInfo> = {
    text: T("text", "text", "left", false, 180, "text"),
    longText: T("text", "text", "left", false, 260, "longText"),
    number: T("number", "number", "right", false, 120, "number"),
    decimal: T("number", "number", "right", false, 130, "decimal"),
    currency: T("number", "number", "right", false, 140, "currency"),
    percent: T("number", "number", "right", false, 120, "percent"),
    date: T("date", "date", "left", false, 140, "date"),
    dateTime: T("date", "date", "left", false, 180, "dateTime"),
    boolean: T("boolean", "boolean", "center", false, 110, "boolean"),
    select: T("select", "set", "left", false, 160, "select"),
    multiSelect: T("multi", "set", "left", false, 220, "multiSelect"),
    rating: T("number", "number", "left", false, 140, "rating"),
    progress: T("number", "number", "left", false, 160, "progress"),
    link: T("text", "text", "left", false, 200, "link"),
    email: T("text", "text", "left", false, 200, "email"),
    phone: T("text", "text", "left", false, 150, "phone"),
    user: T("text", "set", "left", false, 160, "user"),
    formula: T("text", "text", "left", true, 160, "formula"),
    autoNumber: T("number", "number", "right", true, 110, "autoNumber"),
    createdAt: T("date", "date", "left", true, 180, "createdAt"),
    changedAt: T("date", "date", "left", true, 180, "changedAt"),
    createdBy: T("text", "set", "left", true, 150, "createdBy"),
    changedBy: T("text", "set", "left", true, 150, "changedBy"),
    linkedRecord: T("multi", "set", "left", false, 220, "linkedRecord"),
    lookup: T("text", "text", "left", true, 180, "lookup"),
    rollup: T("number", "number", "right", true, 130, "rollup")
};

const LOOKUP: Record<string, ColumnType> = {};
COLUMN_TYPES.forEach(type => {
    LOOKUP[type.toLowerCase()] = type;
});
// Common aliases.
Object.assign(LOOKUP, {
    string: "text",
    longtext: "longText",
    textarea: "longText",
    integer: "number",
    int: "number",
    long: "number",
    float: "decimal",
    money: "currency",
    datetime: "dateTime",
    bool: "boolean",
    checkbox: "boolean",
    singleselect: "select",
    enum: "select",
    multiselect: "multiSelect",
    url: "link",
    autonumber: "autoNumber",
    createdat: "createdAt",
    changedat: "changedAt",
    modifiedat: "changedAt",
    createdby: "createdBy",
    changedby: "changedBy",
    modifiedby: "changedBy",
    linktogrid: "linkedRecord",
    linked: "linkedRecord",
    linkedrecords: "linkedRecord",
    relation: "linkedRecord"
});

/** Case-insensitive type lookup; unknown types are shown as text. */
export function normalizeType(value: string | undefined | null): ColumnType {
    const key = String(value ?? "")
        .trim()
        .replace(/[\s_-]/g, "")
        .toLowerCase();
    return LOOKUP[key] ?? "text";
}

export function typeInfo(type: ColumnType): TypeInfo {
    return TYPE_INFO[type] ?? TYPE_INFO.text;
}

export function isSystemType(type: ColumnType): boolean {
    return typeInfo(type).system;
}

export function isNumericType(type: ColumnType): boolean {
    return typeInfo(type).kind === "number";
}

export function isDateType(type: ColumnType): boolean {
    return typeInfo(type).kind === "date";
}

export function hasOptions(type: ColumnType): boolean {
    return type === "select" || type === "multiSelect";
}

/** Types offered in the type picker, in picker order (system types last). */
export const PICKER_TYPES: ColumnType[] = [...COLUMN_TYPES];

/** Default colours for new select options (cycled). */
export const OPTION_COLORS = [
    "#DBEAFE",
    "#DCFCE7",
    "#FEF3C7",
    "#FCE7F3",
    "#EDE9FE",
    "#FFE4E6",
    "#CFFAFE",
    "#FFEDD5",
    "#E5E7EB",
    "#D1FAE5"
];
