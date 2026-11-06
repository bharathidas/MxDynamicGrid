import type { ColumnFilter, SortEntry } from "./pipeline";
import type { Texts } from "./texts";
import type { CellValue, ColumnDef } from "./types";
import type { Anchor } from "../components/Popover";

/**
 * The object handed to AG Grid as `context`: header and cell components read the current state from it and
 * subscribe to its version, so they re-render without AG Grid recreating them.
 */
export interface GridContextState {
    texts: Texts;
    columnOf: (colId: string) => ColumnDef | undefined;
    sort: SortEntry[];
    filters: Record<string, ColumnFilter>;
    showFilters: boolean;
    canEditStructure: boolean;
    canEditData: boolean;
    groupBy: string[];
    searchText: string;
    motion: string;
    /** Distinct set-filter keys with labels and counts (client mode). */
    distinct: (colId: string) => Array<{ key: string; label: string; count: number; color?: string }>;
    onSort: (colId: string, multi: boolean, dir?: "asc" | "desc" | null) => void;
    onFilter: (colId: string, filter: ColumnFilter | undefined) => void;
    onRename: (colId: string, caption: string) => void;
    openMenu: (colId: string, anchor: Anchor) => void;
    openAddColumn: (anchor: Anchor, index?: number) => void;
    quickSet: (rowKey: string, colId: string, value: CellValue) => void;
    canEditCell: (rowKey: string, colId: string) => boolean;
    issueOf: (rowKey: string, colId: string) => string | undefined;
    openRecord: (rowKey: string) => void;
    toggleGroup: (path: string) => void;
    staticCell: (rowKey: string, colId: string) => unknown;
    pendingText: string;
    addRow: () => void;
    openSummary: (colId: string, anchor: Anchor) => void;
    rowSelectable: boolean;
    hoverCheckbox: boolean;
    rowNumberOf: (rowKey: string) => number | undefined;
    showAddLabel: boolean;
    openFieldMenuOnClick: boolean;
    commentCount: (rowKey: string, colId: string | null) => number;
    openComments: (rowKey: string, colId: string | null, anchor: Anchor) => void;
    isLocked: (rowKey: string) => boolean;
    updatedBy: (rowKey: string) => string | undefined;
}

export class GridContextStore {
    version = 0;
    private listeners = new Set<() => void>();
    constructor(public state: GridContextState) {}

    update(state: GridContextState): void {
        this.state = state;
        this.version++;
        this.listeners.forEach(listener => listener());
    }

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    getVersion = (): number => this.version;
}
