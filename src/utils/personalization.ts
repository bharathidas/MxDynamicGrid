import type { AggregateFn, ColumnFilter, SortEntry } from "./pipeline";
import type { Pinned } from "./types";
import { parseRules, RuleSet } from "./rules";

export type RowHeightLevel = "short" | "medium" | "tall" | "extraTall";
export type ViewType = "grid" | "board" | "calendar" | "gallery";
export interface ColorRule {
    color: string;
    conditions: RuleSet;
}
export interface RowColor {
    mode: "select" | "rules";
    col?: string;
    rules?: ColorRule[];
}

/**
 * View state (Data Grid 2 personalization): what a user changes about how the grid looks, never the column
 * structure. Stored as JSON in the personalization attribute and inside saved views.
 */

export interface ColumnViewState {
    width?: number;
    hidden?: boolean;
    pinned?: Pinned;
}

export type FormatRule =
    | { kind: "colorScale"; low?: string; high?: string }
    | { kind: "dataBar"; color?: string }
    | { kind: "textColor"; op: "=" | "<>" | "<" | ">" | "contains"; value: string; color: string; background?: string };

export interface ViewState {
    v: 1;
    columns: Record<string, ColumnViewState>;
    /** Display order of column ids for users who cannot change the structure (and static columns). */
    order?: string[];
    sort: SortEntry[];
    filters: Record<string, ColumnFilter>;
    search?: string;
    groupBy: string[];
    aggregates: Record<string, AggregateFn>;
    formats: Record<string, FormatRule[]>;
    density?: "compact" | "normal" | "comfortable";
    /** 1.1: view-bar filter rules (and/or conditions). */
    rules?: RuleSet;
    /** 1.1: row height chosen in the view bar. */
    rowHeight?: RowHeightLevel;
    /** 1.2: row colour, by a select field or by condition rules. */
    color?: RowColor;
    /** 1.2: the view type and its layout settings. */
    viewType?: ViewType;
    board?: { col?: string; fields?: string[]; summary?: { col: string; fn: AggregateFn } };
    calendar?: { start?: string; end?: string; mode?: "month" | "week" };
    gallery?: { cover?: string; fields?: string[] };
    pageSize?: number;
    /** 1.2.1: personalization only: the saved view this state belongs to. */
    viewId?: string;
}

export function emptyViewState(): ViewState {
    return { v: 1, columns: {}, sort: [], filters: {}, groupBy: [], aggregates: {}, formats: {} };
}

function obj(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function parseViewState(text: string | undefined): ViewState | undefined {
    if (!text || !text.trim()) {
        return undefined;
    }
    try {
        const raw = obj(JSON.parse(text));
        const state = emptyViewState();
        state.columns = obj(raw.columns) as Record<string, ColumnViewState>;
        state.order = Array.isArray(raw.order) ? raw.order.map(String) : undefined;
        state.sort = Array.isArray(raw.sort)
            ? (raw.sort as SortEntry[])
                  .filter(entry => entry && typeof entry.col === "string")
                  .map(entry => ({ col: entry.col, dir: entry.dir === "desc" ? "desc" : "asc" }))
            : [];
        state.filters = obj(raw.filters) as Record<string, ColumnFilter>;
        state.search = typeof raw.search === "string" ? raw.search : undefined;
        state.groupBy = Array.isArray(raw.groupBy) ? raw.groupBy.map(String).slice(0, 3) : [];
        state.aggregates = obj(raw.aggregates) as Record<string, AggregateFn>;
        state.formats = obj(raw.formats) as Record<string, FormatRule[]>;
        if (raw.density === "compact" || raw.density === "normal" || raw.density === "comfortable") {
            state.density = raw.density;
        }
        state.rules = parseRules(raw.rules);
        if (
            raw.rowHeight === "short" ||
            raw.rowHeight === "medium" ||
            raw.rowHeight === "tall" ||
            raw.rowHeight === "extraTall"
        ) {
            state.rowHeight = raw.rowHeight;
        }
        const color = obj(raw.color);
        if (color.mode === "rules" && Array.isArray(color.rules)) {
            state.color = {
                mode: "rules",
                rules: (color.rules as unknown[])
                    .map(rule => obj(rule))
                    .filter(rule => typeof rule.color === "string")
                    .map(rule => ({
                        color: rule.color as string,
                        conditions: parseRules(rule.conditions) ?? { conjunction: "and", conditions: [] }
                    }))
            };
        } else if (typeof color.col === "string") {
            state.color = { mode: "select", col: color.col };
        }
        if (
            raw.viewType === "board" ||
            raw.viewType === "calendar" ||
            raw.viewType === "gallery" ||
            raw.viewType === "grid"
        ) {
            state.viewType = raw.viewType;
        }
        const board = obj(raw.board);
        if (Object.keys(board).length) {
            state.board = {
                col: typeof board.col === "string" ? board.col : undefined,
                fields: Array.isArray(board.fields) ? board.fields.map(String) : undefined,
                summary:
                    board.summary && typeof obj(board.summary).col === "string"
                        ? (board.summary as { col: string; fn: AggregateFn })
                        : undefined
            };
        }
        const calendar = obj(raw.calendar);
        if (Object.keys(calendar).length) {
            state.calendar = {
                start: typeof calendar.start === "string" ? calendar.start : undefined,
                end: typeof calendar.end === "string" ? calendar.end : undefined,
                mode: calendar.mode === "week" ? "week" : "month"
            };
        }
        const gallery = obj(raw.gallery);
        if (Object.keys(gallery).length) {
            state.gallery = {
                cover: typeof gallery.cover === "string" ? gallery.cover : undefined,
                fields: Array.isArray(gallery.fields) ? gallery.fields.map(String) : undefined
            };
        }
        if (typeof raw.pageSize === "number" && raw.pageSize > 0) {
            state.pageSize = raw.pageSize;
        }
        if (typeof raw.viewId === "string" && raw.viewId) {
            state.viewId = raw.viewId;
        }
        return state;
    } catch {
        return undefined;
    }
}

export function serializeViewState(state: ViewState): string {
    return JSON.stringify(state);
}

// ---- Saved views ------------------------------------------------------------------------------------

export interface SavedView {
    id: string;
    name: string;
    shared: boolean;
    owner?: string;
    isDefault?: boolean;
    state: ViewState;
}

export interface ViewsDocument {
    v: 1;
    views: SavedView[];
}

export function parseViews(text: string | undefined): ViewsDocument {
    if (!text || !text.trim()) {
        return { v: 1, views: [] };
    }
    try {
        const raw = obj(JSON.parse(text));
        const list = Array.isArray(raw.views) ? raw.views : [];
        return {
            v: 1,
            views: list
                .map(entry => obj(entry))
                .filter(entry => typeof entry.id === "string" && typeof entry.name === "string")
                .map(entry => ({
                    id: entry.id as string,
                    name: entry.name as string,
                    shared: entry.shared === true,
                    owner: typeof entry.owner === "string" ? entry.owner : undefined,
                    isDefault: entry.isDefault === true,
                    state: parseViewState(JSON.stringify(entry.state ?? {})) ?? emptyViewState()
                }))
        };
    } catch {
        return { v: 1, views: [] };
    }
}

/** Views the user sees: shared ones and their own (all when no owner is known). */
export function visibleViews(doc: ViewsDocument, owner: string | undefined): SavedView[] {
    return doc.views.filter(view => view.shared || !owner || !view.owner || view.owner === owner);
}

export function defaultViewFor(doc: ViewsDocument, owner: string | undefined): SavedView | undefined {
    const views = visibleViews(doc, owner);
    return (
        views.find(view => view.isDefault && !view.shared && view.owner === owner) ?? views.find(view => view.isDefault)
    );
}

export function upsertView(doc: ViewsDocument, view: SavedView): ViewsDocument {
    let views = doc.views.filter(existing => existing.id !== view.id);
    if (view.isDefault) {
        views = views.map(existing =>
            existing.shared === view.shared && existing.owner === view.owner
                ? { ...existing, isDefault: false }
                : existing
        );
    }
    return { v: 1, views: [...views, view] };
}

export function removeView(doc: ViewsDocument, id: string): ViewsDocument {
    return { v: 1, views: doc.views.filter(view => view.id !== id) };
}
