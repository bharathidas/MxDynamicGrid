import { RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { GridApi } from "ag-grid-community";

import type { GridItem as GridRow } from "../utils/gridItem";
import { CellPos, CellRange, NormalizedRange, normalizeRange, rangeCellCount, sameRange } from "../utils/range";

/**
 * Mouse handling and painting of the cell range selection. The range lives in React state; the highlight is put
 * on the rendered cells with classes (AG Grid recycles rows while scrolling, so the paint runs again on scroll and
 * model updates), which avoids re-rendering any cell.
 */

export interface FillTarget {
    bottom?: number;
    rightColId?: string;
}

export interface RangeSelectionOptions {
    enabled: boolean;
    fillHandle: boolean;
    rootRef: RefObject<HTMLDivElement | null>;
    apiRef: RefObject<GridApi<GridRow> | null>;
    /** Columns that can be part of a range (data columns, no system columns). */
    isRangeColumn: (colId: string) => boolean;
    /** Called when a fill drag ends on cells outside the range. */
    onFill: (range: NormalizedRange, target: FillTarget, invert: boolean) => void;
    /** Called after the range changed. */
    onChange?: (range: CellRange | undefined) => void;
}

export interface RangeSelection {
    range: CellRange | undefined;
    setRange: (range: CellRange | undefined) => void;
    /** The current range in display column order; undefined without a range. */
    normalized: () => NormalizedRange | undefined;
    /** Cells in the range (0 without a range). */
    cellCount: number;
    /** Paints the highlight on the rendered cells (call after scrolling and model updates). */
    schedulePaint: () => void;
    /** Range columns in display order. */
    columnOrder: () => string[];
}

const HANDLE_SIZE = 10;
const CELL_CLASSES = [
    "mxt-dg-range-cell",
    "mxt-dg-range-cell--top",
    "mxt-dg-range-cell--bottom",
    "mxt-dg-range-cell--left",
    "mxt-dg-range-cell--right",
    "mxt-dg-range-handle",
    "mxt-dg-range-fill"
];

function cellFromElement(element: Element | null, root: HTMLElement | null): CellPos | undefined {
    const cell = element?.closest?.(".ag-cell");
    if (!cell || !root?.contains(cell)) {
        return undefined;
    }
    const row = cell.closest(".ag-row");
    const index = Number(row?.getAttribute("row-index"));
    const colId = cell.getAttribute("col-id");
    if (!row || !Number.isInteger(index) || !colId || row.classList.contains("ag-row-pinned")) {
        return undefined;
    }
    return { rowIndex: index, colId };
}

function isInteractive(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    return Boolean(
        element?.closest?.(
            "input, button, select, textarea, a, label, .ag-selection-checkbox, .ag-row-drag, .ag-cell-inline-editing"
        )
    );
}

export function useRangeSelection(options: RangeSelectionOptions): RangeSelection {
    const { enabled, rootRef, apiRef } = options;
    const [state, setState] = useState<{ range: CellRange | undefined; count: number }>({ range: undefined, count: 0 });
    const rangeRef = useRef<CellRange | undefined>(undefined);
    const fillPreview = useRef<FillTarget | undefined>(undefined);
    const optionsRef = useRef(options);
    useLayoutEffect(() => {
        optionsRef.current = options;
    });

    const columnOrder = useCallback((): string[] => {
        const api = apiRef.current;
        if (!api) {
            return [];
        }
        return api
            .getAllDisplayedColumns()
            .map(column => column.getColId())
            .filter(id => optionsRef.current.isRangeColumn(id));
    }, [apiRef]);

    const normalized = useCallback(
        (): NormalizedRange | undefined =>
            rangeRef.current ? normalizeRange(rangeRef.current, columnOrder()) : undefined,
        [columnOrder]
    );

    const setRange = useCallback(
        (next: CellRange | undefined) => {
            if (sameRange(rangeRef.current, next)) {
                return;
            }
            rangeRef.current = next;
            setState({ range: next, count: rangeCellCount(next ? normalizeRange(next, columnOrder()) : undefined) });
            optionsRef.current.onChange?.(next);
        },
        [columnOrder]
    );
    const range = state.range;

    const paint = useCallback(() => {
        const root = rootRef.current;
        if (!root) {
            return;
        }
        root.querySelectorAll(".mxt-dg-range-cell, .mxt-dg-range-fill").forEach(element =>
            element.classList.remove(...CELL_CLASSES)
        );
        const current = normalized();
        if (!current || rangeCellCount(current) < 2) {
            if (!fillPreview.current) {
                return;
            }
        }
        const order = columnOrder();
        const preview = fillPreview.current;
        root.querySelectorAll<HTMLElement>(".ag-row[row-index]").forEach(row => {
            if (row.classList.contains("ag-row-pinned")) {
                return;
            }
            const index = Number(row.getAttribute("row-index"));
            if (!Number.isInteger(index) || !current) {
                return;
            }
            const inRows = index >= current.top && index <= current.bottom;
            const inFillRows =
                preview?.bottom !== undefined ? index > current.bottom && index <= preview.bottom : inRows;
            if (!inRows && !(preview && inFillRows)) {
                return;
            }
            row.querySelectorAll<HTMLElement>(".ag-cell[col-id]").forEach(cell => {
                const colId = cell.getAttribute("col-id") as string;
                const position = current.colIds.indexOf(colId);
                if (inRows && position >= 0 && rangeCellCount(current) > 1) {
                    cell.classList.add("mxt-dg-range-cell");
                    if (index === current.top) {
                        cell.classList.add("mxt-dg-range-cell--top");
                    }
                    if (index === current.bottom) {
                        cell.classList.add("mxt-dg-range-cell--bottom");
                    }
                    if (position === 0) {
                        cell.classList.add("mxt-dg-range-cell--left");
                    }
                    if (position === current.colIds.length - 1) {
                        cell.classList.add("mxt-dg-range-cell--right");
                    }
                }
                if (
                    optionsRef.current.fillHandle &&
                    index === current.bottom &&
                    position === current.colIds.length - 1
                ) {
                    cell.classList.add("mxt-dg-range-handle");
                }
                if (preview) {
                    const col = order.indexOf(colId);
                    const last = order.indexOf(current.colIds[current.colIds.length - 1]);
                    const verticalFill = preview.bottom !== undefined && inFillRows && position >= 0;
                    const horizontalFill =
                        preview.rightColId !== undefined &&
                        inRows &&
                        col > last &&
                        col <= order.indexOf(preview.rightColId);
                    if (verticalFill || horizontalFill) {
                        cell.classList.add("mxt-dg-range-fill");
                    }
                }
            });
        });
    }, [rootRef, normalized, columnOrder]);

    const frame = useRef(0);
    const schedulePaint = useCallback(() => {
        if (typeof window.requestAnimationFrame !== "function") {
            paint();
            return;
        }
        window.cancelAnimationFrame(frame.current);
        frame.current = window.requestAnimationFrame(paint);
    }, [paint]);
    useEffect(() => () => window.cancelAnimationFrame(frame.current), []);

    useEffect(() => {
        schedulePaint();
    }, [range, schedulePaint]);

    // ---- Mouse: drag, Shift+click and the fill handle ---------------------------------------------
    useEffect(() => {
        const root = rootRef.current;
        if (!enabled || !root) {
            return;
        }
        let mode: "none" | "select" | "fill" = "none";
        let scrollTimer: number | undefined;
        const viewport = (): HTMLElement | null => root.querySelector(".ag-grid-viewport, .ag-body-viewport");

        const fillTargetFor = (cell: CellPos | undefined): FillTarget | undefined => {
            const current = normalized();
            if (!cell || !current) {
                return undefined;
            }
            const order = columnOrder();
            const last = order.indexOf(current.colIds[current.colIds.length - 1]);
            const col = order.indexOf(cell.colId);
            if (cell.rowIndex > current.bottom) {
                return { bottom: cell.rowIndex };
            }
            if (col > last && cell.rowIndex >= current.top) {
                return { rightColId: cell.colId };
            }
            return undefined;
        };

        const onMouseDown = (event: MouseEvent): void => {
            if (event.button !== 0) {
                return;
            }
            const target = event.target as HTMLElement;
            const cell = cellFromElement(target, root);
            if (!cell || !optionsRef.current.isRangeColumn(cell.colId)) {
                return;
            }
            const cellElement = target.closest(".ag-cell") as HTMLElement;
            if (optionsRef.current.fillHandle && cellElement.classList.contains("mxt-dg-range-handle")) {
                const rect = cellElement.getBoundingClientRect();
                const rtl = getComputedStyle(cellElement).direction === "rtl";
                const nearX = rtl
                    ? event.clientX - rect.left <= HANDLE_SIZE
                    : rect.right - event.clientX <= HANDLE_SIZE;
                if (nearX && rect.bottom - event.clientY <= HANDLE_SIZE) {
                    event.preventDefault();
                    event.stopPropagation();
                    mode = "fill";
                    root.classList.add("mxt-dg-grid--range-dragging");
                    return;
                }
            }
            if (isInteractive(target)) {
                return;
            }
            const current = rangeRef.current;
            if (event.shiftKey && current) {
                event.preventDefault();
                setRange({ start: current.start, end: cell });
                return;
            }
            setRange({ start: cell, end: cell });
            mode = "select";
        };

        const autoScroll = (event: MouseEvent): void => {
            const body = viewport();
            window.clearInterval(scrollTimer);
            if (!body) {
                return;
            }
            const rect = body.getBoundingClientRect();
            const delta = event.clientY > rect.bottom - 16 ? 24 : event.clientY < rect.top + 16 ? -24 : 0;
            if (delta !== 0) {
                scrollTimer = window.setInterval(() => (body.scrollTop += delta), 40);
            }
        };

        const onMouseMove = (event: MouseEvent): void => {
            if (mode === "none") {
                return;
            }
            if (event.buttons % 2 === 0) {
                finish(event);
                return;
            }
            event.preventDefault();
            autoScroll(event);
            const cell = cellFromElement(document.elementFromPoint(event.clientX, event.clientY), root);
            if (mode === "select") {
                const current = rangeRef.current;
                if (cell && current && optionsRef.current.isRangeColumn(cell.colId)) {
                    root.classList.add("mxt-dg-grid--range-dragging");
                    setRange({ start: current.start, end: cell });
                }
            } else {
                fillPreview.current = fillTargetFor(cell);
                schedulePaint();
            }
        };

        const finish = (event: MouseEvent): void => {
            window.clearInterval(scrollTimer);
            root.classList.remove("mxt-dg-grid--range-dragging");
            if (mode === "fill") {
                const target = fillPreview.current;
                fillPreview.current = undefined;
                const current = normalized();
                if (target && current) {
                    optionsRef.current.onFill(current, target, event.ctrlKey || event.metaKey);
                }
                schedulePaint();
            }
            mode = "none";
        };

        const onMouseUp = (event: MouseEvent): void => {
            if (mode !== "none") {
                finish(event);
            }
        };

        root.addEventListener("mousedown", onMouseDown, true);
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
        return () => {
            window.clearInterval(scrollTimer);
            root.removeEventListener("mousedown", onMouseDown, true);
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
        };
    }, [enabled, rootRef, setRange, normalized, columnOrder, schedulePaint]);

    useEffect(() => {
        if (!enabled) {
            setRange(undefined);
        }
    }, [enabled, setRange]);

    return {
        range,
        setRange,
        normalized,
        cellCount: state.count,
        schedulePaint,
        columnOrder
    };
}
