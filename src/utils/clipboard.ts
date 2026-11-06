import { typeInfo } from "./columnTypes";
import { parseInput, newOption } from "./values";
import { CellValue, ColumnDef, RowRecord, SelectOption } from "./types";

/** Paste from Excel / Sheets: TSV parsing (Excel quoting) and the change plan of a pasted block. */

/**
 * Splits clipboard text into rows and cells. Understands Excel's quoting (cells with tabs, new lines or
 * quotes are wrapped in double quotes, inner quotes doubled) and ignores the trailing line break.
 */
export function parseClipboard(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let quoted = false;
    let atCellStart = true;
    for (let index = 0; index < text.length; index++) {
        const char = text[index];
        if (quoted) {
            if (char === '"') {
                if (text[index + 1] === '"') {
                    cell += '"';
                    index++;
                } else {
                    quoted = false;
                }
            } else {
                cell += char;
            }
            continue;
        }
        if (char === '"' && atCellStart) {
            quoted = true;
            atCellStart = false;
            continue;
        }
        if (char === "\t") {
            row.push(cell);
            cell = "";
            atCellStart = true;
            continue;
        }
        if (char === "\r" || char === "\n") {
            if (char === "\r" && text[index + 1] === "\n") {
                index++;
            }
            row.push(cell);
            rows.push(row);
            row = [];
            cell = "";
            atCellStart = true;
            continue;
        }
        cell += char;
        atCellStart = false;
    }
    if (cell !== "" || row.length > 0) {
        row.push(cell);
        rows.push(row);
    }
    return rows;
}

export interface PastePlan {
    /** Values per existing row key. */
    cells: Array<{ row: string; col: string; value: CellValue }>;
    /** Values of rows to add after the last row (keyed by column). */
    newRows: Array<Record<string, CellValue>>;
    /** Number of pasted columns beyond the last column. */
    extraColumns: number;
    /** Texts that do not fit the column type (skipped). */
    rejected: number;
    /** New select options per column created by the paste. */
    newOptions: Record<string, SelectOption[]>;
}

/**
 * Plans a paste of `block` at (rowIndex, colIndex) of the given rows and columns (display order). Read-only and
 * system columns are skipped; rows beyond the last row become new rows when `addRows` is set.
 */
export function planPasteBlock(
    block: string[][],
    rows: RowRecord[],
    columns: ColumnDef[],
    rowIndex: number,
    colIndex: number,
    options: { addRows: boolean; canEdit: (column: ColumnDef) => boolean }
): PastePlan {
    const plan: PastePlan = { cells: [], newRows: [], extraColumns: 0, rejected: 0, newOptions: {} };
    const width = Math.max(0, ...block.map(line => line.length));
    plan.extraColumns = Math.max(0, colIndex + width - columns.length);
    const working = new Map<string, ColumnDef>();
    const columnFor = (column: ColumnDef): ColumnDef => {
        const existing = working.get(column.key);
        if (existing) {
            return existing;
        }
        const copy = { ...column, options: [...column.options] };
        working.set(column.key, copy);
        return copy;
    };
    block.forEach((line, r) => {
        const target = rows[rowIndex + r];
        if (!target && !options.addRows) {
            return;
        }
        const values: Record<string, CellValue> = {};
        line.forEach((text, c) => {
            const original = columns[colIndex + c];
            if (!original || typeInfo(original.type).system || !options.canEdit(original)) {
                return;
            }
            const column = columnFor(original);
            const parsed = parseInput(column, text, { allowNewOptions: true });
            if (!parsed.ok) {
                plan.rejected++;
                return;
            }
            parsed.newOptions?.forEach(option => {
                if (!column.options.some(o => o.value === option.value)) {
                    const created = newOption(option.label, column.options.length);
                    column.options.push(created);
                    (plan.newOptions[column.key] = plan.newOptions[column.key] ?? []).push(created);
                }
            });
            if (target) {
                plan.cells.push({ row: target.key, col: column.key, value: parsed.value });
            } else {
                values[column.key] = parsed.value;
            }
        });
        if (!target) {
            plan.newRows.push(values);
        }
    });
    return plan;
}
