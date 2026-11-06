/**
 * Cell range selection on AG Grid Community (range selection is an AG Grid Enterprise feature): the pure parts.
 * A range is stored as two corner cells (row index in display order + column id); everything else (the cells in
 * between, copy text, statistics, fill values) is derived from the current column order.
 */

export interface CellPos {
    rowIndex: number;
    colId: string;
}

export interface CellRange {
    /** Where the selection started (the anchor). */
    start: CellPos;
    /** The cell the selection was extended to. */
    end: CellPos;
}

export interface NormalizedRange {
    top: number;
    bottom: number;
    /** Column ids of the range in display order. */
    colIds: string[];
}

export function normalizeRange(range: CellRange, colOrder: string[]): NormalizedRange | undefined {
    const a = colOrder.indexOf(range.start.colId);
    const b = colOrder.indexOf(range.end.colId);
    if (a < 0 || b < 0) {
        return undefined;
    }
    const left = Math.min(a, b);
    const right = Math.max(a, b);
    return {
        top: Math.min(range.start.rowIndex, range.end.rowIndex),
        bottom: Math.max(range.start.rowIndex, range.end.rowIndex),
        colIds: colOrder.slice(left, right + 1)
    };
}

export function rangeContains(range: NormalizedRange, rowIndex: number, colId: string): boolean {
    return rowIndex >= range.top && rowIndex <= range.bottom && range.colIds.includes(colId);
}

export function rangeCellCount(range: NormalizedRange | undefined): number {
    return range ? (range.bottom - range.top + 1) * range.colIds.length : 0;
}

export function sameRange(a: CellRange | undefined, b: CellRange | undefined): boolean {
    if (!a || !b) {
        return a === b;
    }
    return (
        a.start.rowIndex === b.start.rowIndex &&
        a.start.colId === b.start.colId &&
        a.end.rowIndex === b.end.rowIndex &&
        a.end.colId === b.end.colId
    );
}

function cleanTsv(text: string): string {
    return text.replace(/[\t\r\n]+/g, " ");
}

/** Tab separated text of the range (rows separated by CRLF), the format spreadsheets paste as a block. */
export function rangeToTsv(
    range: NormalizedRange,
    displayOf: (rowIndex: number, colId: string) => string | undefined,
    headers?: string[]
): string {
    const lines: string[] = [];
    if (headers) {
        lines.push(headers.map(cleanTsv).join("\t"));
    }
    for (let row = range.top; row <= range.bottom; row++) {
        const cells = range.colIds.map(colId => displayOf(row, colId));
        if (cells.every(cell => cell === undefined)) {
            // A row that is not a data row (group header, detail row) is left out.
            continue;
        }
        lines.push(cells.map(cell => cleanTsv(cell ?? "")).join("\t"));
    }
    return lines.join("\r\n");
}

export interface RangeStats {
    /** Non-empty cells. */
    count: number;
    /** Cells with a number. */
    numbers: number;
    sum: number;
    avg?: number;
    min?: number;
    max?: number;
}

export function rangeStats(values: unknown[]): RangeStats {
    let count = 0;
    let numbers = 0;
    let sum = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    values.forEach(value => {
        if (value === undefined || value === null || value === "") {
            return;
        }
        count++;
        if (typeof value === "number" && Number.isFinite(value)) {
            numbers++;
            sum += value;
            min = Math.min(min, value);
            max = Math.max(max, value);
        }
    });
    return numbers > 0
        ? { count, numbers, sum: Number(sum.toFixed(10)), avg: Number((sum / numbers).toFixed(10)), min, max }
        : { count, numbers, sum: 0 };
}

export type ArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

/** Extends the range end one cell in the arrow direction (Shift+arrow), clamped to the grid. */
export function extendRange(
    range: CellRange,
    key: ArrowKey,
    colOrder: string[],
    rowCount: number,
    rtl = false
): CellRange {
    let { rowIndex, colId } = range.end;
    let col = colOrder.indexOf(colId);
    const horizontal = (delta: number): number => (rtl ? -delta : delta);
    switch (key) {
        case "ArrowUp":
            rowIndex = Math.max(0, rowIndex - 1);
            break;
        case "ArrowDown":
            rowIndex = Math.min(Math.max(0, rowCount - 1), rowIndex + 1);
            break;
        case "ArrowLeft":
            col = Math.max(0, Math.min(colOrder.length - 1, col + horizontal(-1)));
            break;
        default:
            col = Math.max(0, Math.min(colOrder.length - 1, col + horizontal(1)));
            break;
    }
    colId = colOrder[col] ?? colId;
    return { start: range.start, end: { rowIndex, colId } };
}

// ---- Fill handle --------------------------------------------------------------------------------

/** "invert": what Excel does with Ctrl held - a copy where auto would continue a series, else a series. */
export type FillMode = "auto" | "copy" | "series" | "invert";

const TRAILING_NUMBER = /^(.*?)(-?\d+)$/;

function isNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

/**
 * Values for `count` new cells that continue `source` (the values along the fill direction).
 * Series: numbers and dates continue linearly (step = average difference, 1 / one day for a single value),
 * texts ending in a number count on ("Item 1", "Item 2" -> "Item 3"). Copy: the source repeats.
 * Auto: a series when there are at least two numbers or dates, or texts ending in a number (like Excel),
 * otherwise a copy.
 */
export function fillValues(source: unknown[], count: number, mode: FillMode = "auto"): unknown[] {
    if (count <= 0 || source.length === 0) {
        return [];
    }
    const copy = (): unknown[] => Array.from({ length: count }, (_, index) => source[index % source.length]);
    const allNumbers = source.every(isNumber);
    const allDates = source.every(value => value instanceof Date && !Number.isNaN(value.getTime()));
    const texts = source.every(value => typeof value === "string" && TRAILING_NUMBER.test(value));
    if (mode === "invert") {
        const autoSeries = (source.length >= 2 && (allNumbers || allDates)) || texts;
        return fillValues(source, count, autoSeries ? "copy" : "series");
    }
    const series =
        mode === "series" || (mode === "auto" && ((source.length >= 2 && (allNumbers || allDates)) || texts));
    if (!series) {
        return copy();
    }
    if (allNumbers || allDates) {
        const numbers = source.map(value => (value instanceof Date ? value.getTime() : (value as number)));
        const step =
            numbers.length >= 2
                ? (numbers[numbers.length - 1] - numbers[0]) / (numbers.length - 1)
                : allDates
                ? 86400000
                : 1;
        const last = numbers[numbers.length - 1];
        return Array.from({ length: count }, (_, index) => {
            const next = Number((last + step * (index + 1)).toFixed(10));
            return allDates ? new Date(next) : next;
        });
    }
    if (texts) {
        const parts = source.map(value => TRAILING_NUMBER.exec(value as string) as RegExpExecArray);
        const prefix = parts[parts.length - 1][1];
        const numbers = parts.map(part => Number(part[2]));
        const step =
            numbers.length >= 2 ? Math.round((numbers[numbers.length - 1] - numbers[0]) / (numbers.length - 1)) : 1;
        const last = numbers[numbers.length - 1];
        return Array.from({ length: count }, (_, index) => `${prefix}${last + step * (index + 1)}`);
    }
    return copy();
}

export interface FillCell {
    rowIndex: number;
    colId: string;
    value: unknown;
}

/**
 * The cells a fill writes: the source range is extended down to `targetBottom` or right to `targetColId`.
 * `valueAt` reads the raw grid value of a source cell.
 */
export function planFill(
    range: NormalizedRange,
    target: { bottom?: number; rightColId?: string },
    colOrder: string[],
    valueAt: (rowIndex: number, colId: string) => unknown,
    mode: FillMode = "auto"
): FillCell[] {
    const cells: FillCell[] = [];
    if (target.bottom !== undefined && target.bottom > range.bottom) {
        const count = target.bottom - range.bottom;
        range.colIds.forEach(colId => {
            const source: unknown[] = [];
            for (let row = range.top; row <= range.bottom; row++) {
                source.push(valueAt(row, colId));
            }
            fillValues(source, count, mode).forEach((value, index) =>
                cells.push({ rowIndex: range.bottom + 1 + index, colId, value })
            );
        });
        return cells;
    }
    if (target.rightColId) {
        const last = colOrder.indexOf(range.colIds[range.colIds.length - 1]);
        const end = colOrder.indexOf(target.rightColId);
        if (last < 0 || end <= last) {
            return cells;
        }
        const targets = colOrder.slice(last + 1, end + 1);
        for (let row = range.top; row <= range.bottom; row++) {
            const source = range.colIds.map(colId => valueAt(row, colId));
            fillValues(source, targets.length, mode).forEach((value, index) =>
                cells.push({ rowIndex: row, colId: targets[index], value })
            );
        }
    }
    return cells;
}

/** Ctrl+D: the first row of the range is copied into the other rows. */
export function planFillDown(
    range: NormalizedRange,
    valueAt: (rowIndex: number, colId: string) => unknown
): FillCell[] {
    const cells: FillCell[] = [];
    range.colIds.forEach(colId => {
        const value = valueAt(range.top, colId);
        for (let row = range.top + 1; row <= range.bottom; row++) {
            cells.push({ rowIndex: row, colId, value });
        }
    });
    return cells;
}
