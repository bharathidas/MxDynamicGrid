import { typeInfo } from "./columnTypes";
import {
    CellValue,
    ChangeOp,
    ChangeSet,
    ColumnDef,
    ColumnPatch,
    ColumnPayload,
    GridModel,
    RowRecord,
    SaveError,
    SaveResult
} from "./types";

/**
 * Change set v1: the ops the widget sends to the save action, the optimistic overlay that shows them before the
 * data sources reflect them, the inverse ops used by undo, and the compaction of queued ops.
 */

/** crypto.randomUUID with a fallback for old browsers and non-secure contexts. */
export function newKey(): string {
    const c = (
        (typeof window !== "undefined" ? window : {}) as {
            crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array };
        }
    ).crypto;
    if (c?.randomUUID) {
        try {
            return c.randomUUID();
        } catch {
            // insecure context; fall through
        }
    }
    const bytes = new Uint8Array(16);
    if (c?.getRandomValues) {
        c.getRandomValues(bytes);
    } else {
        for (let i = 0; i < 16; i++) {
            bytes[i] = Math.floor(Math.random() * 256);
        }
    }
    // RFC 4122 version 4 and variant bits.
    bytes[6] = (bytes[6] % 16) + 64;
    bytes[8] = (bytes[8] % 64) + 128;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function serializeChangeSet(ops: ChangeOp[], baseVersion: number | null): string {
    const set: ChangeSet = { v: 1, baseVersion, ops };
    return JSON.stringify(set);
}

export function parseResult(text: string | undefined): SaveResult | undefined {
    if (!text || !text.trim()) {
        return undefined;
    }
    try {
        const raw = JSON.parse(text) as { ok?: unknown; version?: unknown; errors?: unknown };
        const errors: SaveError[] = Array.isArray(raw.errors)
            ? raw.errors
                  .filter(entry => entry && typeof entry === "object")
                  .map(entry => {
                      const e = entry as Record<string, unknown>;
                      return {
                          row: e.row === undefined || e.row === null ? undefined : String(e.row),
                          col: e.col === undefined || e.col === null ? undefined : String(e.col),
                          message: String(e.message ?? "Error")
                      };
                  })
            : [];
        return {
            ok: raw.ok === undefined ? errors.length === 0 : raw.ok === true || raw.ok === "true",
            version: typeof raw.version === "number" ? raw.version : raw.version ? Number(raw.version) : undefined,
            errors
        };
    } catch {
        return { ok: false, errors: [{ message: text.slice(0, 200) }] };
    }
}

// ---- Columns from payloads ------------------------------------------------------------------------

export function columnFromPayload(payload: ColumnPayload, order: number): ColumnDef {
    return {
        key: payload.key,
        caption: payload.caption,
        type: payload.type,
        order,
        width: payload.width,
        pinned: payload.pinned ?? null,
        hidden: Boolean(payload.hidden),
        required: Boolean(payload.required),
        readOnly: Boolean(payload.readOnly),
        options: payload.options ?? [],
        format: payload.format ?? "",
        formula: payload.formula ?? "",
        headerGroup: payload.headerGroup ?? "",
        description: payload.description ?? "",
        validation: payload.validation ?? {},
        canEdit: true,
        max: payload.max,
        defaultValue: payload.defaultValue,
        link: payload.link
    };
}

export function payloadFromColumn(column: ColumnDef, index?: number): ColumnPayload {
    const payload: ColumnPayload = { key: column.key, caption: column.caption, type: column.type };
    if (index !== undefined) {
        payload.index = index;
    }
    if (column.width) {
        payload.width = column.width;
    }
    if (column.pinned) {
        payload.pinned = column.pinned;
    }
    if (column.hidden) {
        payload.hidden = true;
    }
    if (column.required) {
        payload.required = true;
    }
    if (column.readOnly) {
        payload.readOnly = true;
    }
    if (column.options.length) {
        payload.options = column.options;
    }
    if (column.format) {
        payload.format = column.format;
    }
    if (column.formula) {
        payload.formula = column.formula;
    }
    if (column.headerGroup) {
        payload.headerGroup = column.headerGroup;
    }
    if (column.description) {
        payload.description = column.description;
    }
    if (Object.keys(column.validation).length) {
        payload.validation = column.validation;
    }
    if (column.max !== undefined) {
        payload.max = column.max;
    }
    if (column.defaultValue !== undefined && column.defaultValue !== null) {
        payload.defaultValue = column.defaultValue;
    }
    if (column.link && Object.keys(column.link).length) {
        payload.link = column.link;
    }
    return payload;
}

/** Applies a patch to a column (fields set to undefined are left alone). */
export function patchColumn(column: ColumnDef, patch: ColumnPatch): ColumnDef {
    const next: ColumnDef = { ...column };
    (Object.keys(patch) as Array<keyof ColumnPatch>).forEach(field => {
        const value = patch[field];
        if (value !== undefined) {
            (next as unknown as Record<string, unknown>)[field] = value;
        }
    });
    if (patch.pinned === null) {
        next.pinned = null;
    }
    return next;
}

function move<T>(list: T[], from: number, to: number): T[] {
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(Math.max(0, Math.min(next.length, to)), 0, item);
    return next;
}

function renumber<T extends { order: number }>(list: T[]): T[] {
    return list.map((item, index) => (item.order === index ? item : { ...item, order: index }));
}

// ---- Overlay --------------------------------------------------------------------------------------

/**
 * Applies ops to a model and returns a new model (inputs are not mutated). Columns and rows come out in display
 * order with `order` renumbered 0..n-1. Ops on unknown rows/columns are ignored.
 */
export function applyOps(model: GridModel, ops: ChangeOp[]): GridModel {
    if (!ops.length) {
        return model;
    }
    let columns = [...model.columns];
    let rows = [...model.rows];
    let comments = model.comments ? [...model.comments] : undefined;
    let rowIndex: Map<string, number> | undefined;
    const indexOfRow = (key: string): number => {
        if (!rowIndex) {
            rowIndex = new Map(rows.map((row, index) => [row.key, index]));
        }
        return rowIndex.get(key) ?? -1;
    };
    const invalidateRows = (): void => {
        rowIndex = undefined;
    };
    for (const op of ops) {
        switch (op.op) {
            case "setCell": {
                const index = indexOfRow(op.row);
                if (index >= 0) {
                    const row = rows[index];
                    rows[index] = { ...row, values: { ...row.values, [op.col]: op.value } };
                }
                break;
            }
            case "addRow": {
                if (indexOfRow(op.row) >= 0) {
                    break;
                }
                const row: RowRecord = { key: op.row, values: { ...op.values }, order: op.index, pending: true };
                rows.splice(Math.max(0, Math.min(rows.length, op.index)), 0, row);
                invalidateRows();
                break;
            }
            case "deleteRow": {
                const index = indexOfRow(op.row);
                if (index >= 0) {
                    rows.splice(index, 1);
                    invalidateRows();
                }
                break;
            }
            case "moveRow": {
                const index = indexOfRow(op.row);
                if (index >= 0) {
                    rows = move(rows, index, op.index);
                    invalidateRows();
                }
                break;
            }
            case "addColumn": {
                if (columns.some(column => column.key === op.col.key)) {
                    break;
                }
                const at = op.col.index ?? columns.length;
                columns.splice(Math.max(0, Math.min(columns.length, at)), 0, columnFromPayload(op.col, at));
                break;
            }
            case "updateColumn": {
                const index = columns.findIndex(column => column.key === op.col);
                if (index >= 0) {
                    columns[index] = patchColumn(columns[index], op.patch);
                }
                break;
            }
            case "deleteColumn":
                columns = columns.filter(column => column.key !== op.col);
                break;
            case "moveColumn": {
                const index = columns.findIndex(column => column.key === op.col);
                if (index >= 0) {
                    columns = move(columns, index, op.index);
                }
                break;
            }
            case "addComment":
                comments = comments ?? [];
                if (!comments.some(comment => comment.key === op.comment.key)) {
                    comments.push({ ...op.comment, author: "", resolved: false, pending: true });
                }
                break;
            case "resolveComment":
                comments = (comments ?? []).map(comment =>
                    comment.key === op.comment ? { ...comment, resolved: op.resolved } : comment
                );
                break;
        }
    }
    return { columns: renumber(columns), rows: renumber(rows), ...(comments ? { comments } : {}) };
}

// ---- Inverse (undo) -------------------------------------------------------------------------------

/** Ops that undo `ops` when applied to the model that results from them; `model` is the state before. */
export function inverseOps(model: GridModel, ops: ChangeOp[]): ChangeOp[] {
    const inverse: ChangeOp[] = [];
    let current = model;
    for (const op of ops) {
        inverse.unshift(...inverseOf(current, op));
        current = applyOps(current, [op]);
    }
    return inverse;
}

function inverseOf(model: GridModel, op: ChangeOp): ChangeOp[] {
    switch (op.op) {
        case "setCell": {
            const row = model.rows.find(r => r.key === op.row);
            if (!row) {
                return [];
            }
            const old = row.values[op.col];
            return [{ op: "setCell", row: op.row, col: op.col, value: old === undefined ? null : old }];
        }
        case "addRow":
            return [{ op: "deleteRow", row: op.row }];
        case "deleteRow": {
            const index = model.rows.findIndex(r => r.key === op.row);
            if (index < 0) {
                return [];
            }
            return [{ op: "addRow", row: op.row, index, values: { ...model.rows[index].values } }];
        }
        case "moveRow": {
            const index = model.rows.findIndex(r => r.key === op.row);
            return index < 0 ? [] : [{ op: "moveRow", row: op.row, index }];
        }
        case "addColumn":
            return [{ op: "deleteColumn", col: op.col.key }];
        case "deleteColumn": {
            const index = model.columns.findIndex(c => c.key === op.col);
            if (index < 0) {
                return [];
            }
            const column = model.columns[index];
            const restore: ChangeOp[] = [{ op: "addColumn", col: payloadFromColumn(column, index) }];
            model.rows.forEach(row => {
                const value = row.values[op.col];
                if (value !== undefined && value !== null) {
                    restore.push({ op: "setCell", row: row.key, col: op.col, value });
                }
            });
            return restore;
        }
        case "updateColumn": {
            const column = model.columns.find(c => c.key === op.col);
            if (!column) {
                return [];
            }
            const old: ColumnPatch = {};
            (Object.keys(op.patch) as Array<keyof ColumnPatch>).forEach(field => {
                (old as Record<string, unknown>)[field] = (column as unknown as Record<string, unknown>)[field] ?? null;
            });
            return [{ op: "updateColumn", col: op.col, patch: old }];
        }
        case "moveColumn": {
            const index = model.columns.findIndex(c => c.key === op.col);
            return index < 0 ? [] : [{ op: "moveColumn", col: op.col, index }];
        }
        case "resolveComment": {
            const comment = model.comments?.find(c => c.key === op.comment);
            return comment ? [{ op: "resolveComment", comment: op.comment, resolved: comment.resolved }] : [];
        }
        default:
            // Comments are not undone.
            return [];
    }
}

// ---- Compaction -----------------------------------------------------------------------------------

/**
 * Shrinks a queue of not-yet-sent ops without changing its effect: later setCell on the same cell wins, cells of
 * rows added in the same queue merge into the addRow, a row or column added and deleted in the same queue
 * disappears, and updates of a column added in the same queue merge into the addColumn.
 */
export function compactOps(ops: ChangeOp[]): ChangeOp[] {
    const out: Array<ChangeOp | null> = [];
    const addedRows = new Map<string, number>();
    const addedCols = new Map<string, number>();
    const cellAt = new Map<string, number>();
    for (const original of ops) {
        const op = clone(original);
        switch (op.op) {
            case "setCell": {
                const added = addedRows.get(op.row);
                if (added !== undefined) {
                    const add = out[added] as Extract<ChangeOp, { op: "addRow" }>;
                    add.values[op.col] = op.value;
                    break;
                }
                const id = `${op.row}\u0000${op.col}`;
                const previous = cellAt.get(id);
                if (previous !== undefined) {
                    out[previous] = null;
                }
                cellAt.set(id, out.push(op) - 1);
                break;
            }
            case "addRow":
                addedRows.set(op.row, out.push(op) - 1);
                break;
            case "deleteRow": {
                const added = addedRows.get(op.row);
                out.forEach((entry, index) => {
                    if (entry && (entry.op === "setCell" || entry.op === "moveRow") && entry.row === op.row) {
                        out[index] = null;
                    }
                });
                if (added !== undefined) {
                    out[added] = null;
                    addedRows.delete(op.row);
                    break;
                }
                out.push(op);
                break;
            }
            case "addColumn":
                addedCols.set(op.col.key, out.push(op) - 1);
                break;
            case "updateColumn": {
                const added = addedCols.get(op.col);
                if (added !== undefined) {
                    const add = out[added] as Extract<ChangeOp, { op: "addColumn" }>;
                    Object.entries(op.patch).forEach(([field, value]) => {
                        if (value !== undefined) {
                            (add.col as unknown as Record<string, unknown>)[field] = value;
                        }
                    });
                    break;
                }
                out.push(op);
                break;
            }
            case "deleteColumn": {
                const added = addedCols.get(op.col);
                out.forEach((entry, index) => {
                    if (!entry) {
                        return;
                    }
                    if (
                        (entry.op === "setCell" || entry.op === "updateColumn" || entry.op === "moveColumn") &&
                        entry.col === op.col
                    ) {
                        out[index] = null;
                    }
                    if (entry.op === "addRow" && op.col in entry.values) {
                        delete entry.values[op.col];
                    }
                });
                if (added !== undefined) {
                    out[added] = null;
                    addedCols.delete(op.col);
                    break;
                }
                out.push(op);
                break;
            }
            default:
                out.push(op);
        }
    }
    return out.filter((op): op is ChangeOp => op !== null);
}

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

// ---- Reflection -----------------------------------------------------------------------------------

function sameValue(a: CellValue | undefined, b: CellValue | undefined): boolean {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Whether the server model already shows the effect of an op, so it can leave the optimistic overlay.
 * Move ops cannot be checked reliably and count as reflected once the data sources reloaded.
 */
export function isReflected(server: GridModel, op: ChangeOp): boolean {
    switch (op.op) {
        case "setCell": {
            const row = server.rows.find(r => r.key === op.row);
            if (!row) {
                return false;
            }
            const column = server.columns.find(c => c.key === op.col);
            if (column && typeInfo(column.type).system) {
                return true;
            }
            return sameValue(row.values[op.col], op.value);
        }
        case "addRow":
            return server.rows.some(r => r.key === op.row);
        case "deleteRow":
            return !server.rows.some(r => r.key === op.row);
        case "addColumn":
            return server.columns.some(c => c.key === op.col.key);
        case "deleteColumn":
            return !server.columns.some(c => c.key === op.col);
        case "addComment":
            return Boolean(server.comments?.some(comment => comment.key === op.comment.key));
        case "resolveComment":
            return Boolean(
                server.comments?.some(comment => comment.key === op.comment && comment.resolved === op.resolved)
            );
        case "updateColumn": {
            const column = server.columns.find(c => c.key === op.col);
            if (!column) {
                return false;
            }
            return Object.entries(op.patch).every(
                ([field, value]) =>
                    value === undefined ||
                    JSON.stringify((column as unknown as Record<string, unknown>)[field] ?? null) ===
                        JSON.stringify(value ?? null)
            );
        }
        default:
            return true;
    }
}

/** Short label of an op batch for undo toasts. */
export function describeOps(ops: ChangeOp[]): string {
    if (!ops.length) {
        return "";
    }
    const kinds = new Set(ops.map(op => op.op));
    if (kinds.size === 1) {
        const kind = ops[0].op;
        const count = ops.length;
        const labels: Record<ChangeOp["op"], string> = {
            setCell: count === 1 ? "edit" : `${count} edits`,
            addRow: count === 1 ? "add row" : `add ${count} rows`,
            deleteRow: count === 1 ? "delete row" : `delete ${count} rows`,
            moveRow: "move row",
            addColumn: "add field",
            updateColumn: "change field",
            deleteColumn: "delete field",
            moveColumn: "move field",
            addComment: "comment",
            resolveComment: "resolve comment"
        };
        return labels[kind];
    }
    return `${ops.length} changes`;
}
