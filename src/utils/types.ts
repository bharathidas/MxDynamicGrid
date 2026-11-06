/** Shared model types of MxDynamicGrid. Everything here is plain data (JSON serialisable). */

export const COLUMN_TYPES = [
    "text",
    "longText",
    "number",
    "decimal",
    "currency",
    "percent",
    "date",
    "dateTime",
    "boolean",
    "select",
    "multiSelect",
    "rating",
    "progress",
    "link",
    "email",
    "phone",
    "user",
    "formula",
    "autoNumber",
    "createdAt",
    "changedAt",
    "createdBy",
    "changedBy",
    "linkedRecord",
    "lookup",
    "rollup"
] as const;

export type ColumnType = (typeof COLUMN_TYPES)[number];

export type Pinned = "left" | "right" | null;

/** Value of a cell as stored in the row JSON: string, number, boolean, ISO date string, string[] or null. */
export type CellValue = string | number | boolean | string[] | null;

export interface SelectOption {
    value: string;
    label: string;
    color?: string;
}

export interface ValidationRule {
    min?: number;
    max?: number;
    regex?: string;
    unique?: boolean;
    message?: string;
}

/** A dynamic column definition (one GridColumn object), or a column added on the client. */
export interface ColumnDef {
    key: string;
    caption: string;
    type: ColumnType;
    order: number;
    width?: number;
    pinned: Pinned;
    hidden: boolean;
    required: boolean;
    readOnly: boolean;
    options: SelectOption[];
    format: string;
    formula: string;
    headerGroup: string;
    description: string;
    validation: ValidationRule;
    canEdit: boolean;
    /** Rating maximum (rating columns, default 5). */
    max?: number;
    /** Value new rows get. */
    defaultValue?: CellValue;
    /** 1.2: linked record / lookup / rollup settings (stored in the options JSON object). */
    link?: LinkSettings;
}

export interface LinkSettings {
    target?: string;
    multiple?: boolean;
    link?: string;
    field?: string;
    fn?: "sum" | "avg" | "min" | "max" | "count";
}

/** A row: its key, values by column key and order. */
export interface RowRecord {
    key: string;
    values: Record<string, CellValue>;
    order: number;
    /** Id of the Mendix object (rows that exist on the server). */
    itemId?: string;
    /** Set while the row only exists in the client (not yet confirmed by the rows source). */
    pending?: boolean;
}

export interface CommentRecord {
    key: string;
    row: string;
    /** Field key, or null for a comment on the whole row. */
    col: string | null;
    text: string;
    author: string;
    date?: string;
    resolved: boolean;
    mentions?: string[];
    /** Not yet confirmed by the comments data source. */
    pending?: boolean;
}

export interface HistoryRecord {
    row: string;
    col: string;
    oldValue: string;
    newValue: string;
    by: string;
    date?: string;
    op: string;
}

export interface GridModel {
    columns: ColumnDef[];
    rows: RowRecord[];
    /** 1.2: comments (optional data source), overlaid like rows. */
    comments?: CommentRecord[];
}

// ---- Change set v1 --------------------------------------------------------------------------------

export interface ColumnPayload {
    key: string;
    caption: string;
    type: ColumnType;
    index?: number;
    width?: number;
    pinned?: Pinned;
    hidden?: boolean;
    required?: boolean;
    readOnly?: boolean;
    options?: SelectOption[];
    format?: string;
    formula?: string;
    headerGroup?: string;
    description?: string;
    validation?: ValidationRule;
    max?: number;
    defaultValue?: CellValue;
    link?: LinkSettings;
}

export type ColumnPatch = Partial<Omit<ColumnPayload, "key" | "index">>;

export type ChangeOp =
    | { op: "setCell"; row: string; col: string; value: CellValue }
    | { op: "addRow"; row: string; index: number; values: Record<string, CellValue> }
    | { op: "deleteRow"; row: string }
    | { op: "moveRow"; row: string; index: number }
    | { op: "addColumn"; col: ColumnPayload }
    | { op: "updateColumn"; col: string; patch: ColumnPatch }
    | { op: "deleteColumn"; col: string }
    | { op: "moveColumn"; col: string; index: number }
    | { op: "addComment"; comment: { key: string; row: string; col: string | null; text: string; mentions: string[] } }
    | { op: "resolveComment"; comment: string; resolved: boolean };

export interface ChangeSet {
    v: 1;
    baseVersion: number | null;
    ops: ChangeOp[];
}

export interface SaveError {
    row?: string;
    col?: string;
    message: string;
}

export interface SaveResult {
    ok: boolean;
    version?: number;
    errors: SaveError[];
}
