/* The grid keeps the latest props and callbacks in refs (AG Grid callbacks, timers and the save queue read them),
   which the React compiler lint rules flag; the component is not compiled by the React compiler. */
/* eslint-disable react-hooks/refs, react-hooks/set-state-in-effect, react-hooks/purity, react-hooks/preserve-manual-memoization, react-hooks/immutability */
import {
    CSSProperties,
    KeyboardEvent as ReactKeyboardEvent,
    ReactElement,
    ReactNode,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore
} from "react";
import { AgGridReact } from "ag-grid-react";
import {
    CellApiModule,
    CellContextMenuEvent,
    CellEditingStoppedEvent,
    CellStyleModule,
    ClientSideRowModelApiModule,
    ClientSideRowModelModule,
    ColDef,
    ColGroupDef,
    ColumnApiModule,
    ColumnAutoSizeModule,
    ColumnMovedEvent,
    ColumnResizedEvent,
    CustomEditorModule,
    EventApiModule,
    GridApi,
    GridReadyEvent,
    HighlightChangesModule,
    IRowNode,
    ModuleRegistry,
    PaginationModule,
    PinnedRowModule,
    RenderApiModule,
    RowApiModule,
    RowClassParams,
    RowClickedEvent,
    RowDragEndEvent,
    RowDragModule,
    RowSelectionModule,
    RowSelectionOptions,
    RowStyleModule,
    ScrollApiModule,
    SelectionChangedEvent,
    TooltipModule,
    ValidationModule,
    ValueSetterParams,
    colorSchemeDark,
    colorSchemeLight,
    themeQuartz
} from "ag-grid-community";
import classNames from "classnames";
import { ObjectItem, ValueStatus } from "mendix";
import { attribute as filterAttribute, contains, literal } from "mendix/filters/builders";

import { MxDynamicGridContainerProps } from "../typings/MxDynamicGridProps";
import { GridCellEditor, GridEditorContext } from "./components/CellEditors";
import { ColumnEditor } from "./components/ColumnEditor";
import { KeyboardHelp, Pager, Skeleton, StatusBar, ToastData, Toasts } from "./components/Chrome";
import { ExportChoice, ExportDialog, ExportFormat } from "./components/ExportDialog";
import {
    DataCell,
    FullWidthRow,
    RowNumberCell,
    RowNumberHeader,
    StaticContentCell,
    TotalsCell
} from "./components/GridCells";
import { AddColumnHeader, HeaderCell } from "./components/HeaderCell";
import { Icon } from "./components/Icon";
import { ImportDialog, ImportResult } from "./components/ImportDialog";
import { ColumnsPanel } from "./components/ColumnsPanel";
import { FormatDialog } from "./components/FormatDialog";
import { ViewsMenu } from "./components/ViewsMenu";
import { PanelId, SavePill, ViewBar, ViewBarButton } from "./components/ViewBar";
import {
    FilterPanel,
    GroupPanel,
    HideFieldsPanel,
    ROW_HEIGHTS,
    RowHeightPanel,
    SortPanel
} from "./components/ViewPanels";
import { ViewTabs } from "./components/ViewTabs";
import { ColorPanel, defaultLayout, LayoutPanel } from "./components/ViewPanels2";
import { BoardView } from "./components/BoardView";
import { CalendarView } from "./components/CalendarView";
import { GalleryView } from "./components/GalleryView";
import { BulkEditDialog, CoachMarks, FindMatch, FindReplaceDialog, hintsDone } from "./components/BulkTools";
import { rowColor } from "./utils/rowColor";
import { computeRelated, parsePresence, readComments, readHistory, readLinks, setLinkRows } from "./utils/related";
import { CommentThread, HistoryTimeline } from "./components/Comments";
import { Command, CommandPalette } from "./components/CommandPalette";
import { printHtml, printView } from "./utils/print";
import { activeRuleCount, applyRules, emptyRules, operatorsFor, RuleSet } from "./utils/rules";
import { TEMPLATES, TemplateId, templateOps } from "./utils/templates";
import { Anchor, anchorOf, Dialog, Menu, MenuItem, pointAnchor, Popover, ThemeContext } from "./components/Popover";
import { RecordDrawer } from "./components/RecordDrawer";
import { useRangeSelection } from "./hooks/useRangeSelection";
import { applyOps, describeOps, newKey, payloadFromColumn } from "./utils/changeSet";
import { parseClipboard, planPasteBlock } from "./utils/clipboard";
import { isSystemType, typeInfo } from "./utils/columnTypes";
import { formatStyle, formatRanges } from "./utils/conditional";
import { buildCsvExport, buildXlsxExport, expandTokens, ExportColumn, safeFileName } from "./utils/exporter";
import { GridContextState, GridContextStore } from "./utils/gridContext";
import type { GridItem } from "./utils/gridItem";
import { ColumnAttributes, readColumns, readRows } from "./utils/model";
import { resolveMotion, usePrefersReducedMotion } from "./utils/motion";
import {
    emptyViewState,
    parseViewState,
    RowHeightLevel,
    visibleViews,
    ViewType,
    parseViews,
    serializeViewState,
    ViewState,
    ViewsDocument
} from "./utils/personalization";
import {
    AggregateFn,
    aggregate,
    ColumnFilter,
    computeFormulas,
    defaultAggregate,
    DisplayRow,
    filterRows,
    groupRows,
    isActiveFilter,
    setKeys,
    SortEntry,
    sortRows,
    summaryFunctions,
    MAX_GROUP_LEVELS
} from "./utils/pipeline";
import { FillCell, planFill, planFillDown, rangeStats } from "./utils/range";
import { SaveAdapter, SaveQueue } from "./utils/saveQueue";
import { buildServerViewState } from "./utils/serverView";
import { isStaticId, staticColumnDefs, staticIndex, staticValue, writeStaticValue } from "./utils/staticColumns";
import { fill, resolveTexts, summaryLabel, Texts } from "./utils/texts";
import { collectIssues, DEFAULT_VALIDATION_TEXTS, issueKey, serverIssues, ValidationTexts } from "./utils/validation";
import { convertColumn, formatNumber, formatValue, isEmpty, plainValue, setLinkLabels } from "./utils/values";
import { CellValue, ChangeOp, ColumnDef, ColumnPatch, GridModel, RowRecord } from "./utils/types";
import { downloadFile } from "./utils/xlsx";

import "./ui/MxDynamicGrid.css";

// Only the AG Grid Community modules the widget uses.
ModuleRegistry.registerModules([
    ClientSideRowModelModule,
    ClientSideRowModelApiModule,
    CustomEditorModule,
    RowSelectionModule,
    PaginationModule,
    RowDragModule,
    PinnedRowModule,
    ColumnAutoSizeModule,
    ColumnApiModule,
    RowApiModule,
    CellApiModule,
    CellStyleModule,
    RowStyleModule,
    TooltipModule,
    HighlightChangesModule,
    EventApiModule,
    RenderApiModule,
    ScrollApiModule,
    // eslint-disable-next-line no-undef
    ...(process.env.NODE_ENV === "production" ? [] : [ValidationModule])
]);

const ROWNUM_ID = "__rownum";
const ADD_ID = "__add";
const TOTALS_ID = "__totals";
const EXPORT_PAGE = 500;
const EXPORT_LIMIT = 100000;

type Density = "compact" | "normal" | "comfortable";
/** Header heights per density: caption only, and caption with the header filter (caption + ~36 px). */
const HEADER_HEIGHT: Record<Density, { plain: number; filters: number }> = {
    compact: { plain: 36, filters: 66 },
    normal: { plain: 44, filters: 78 },
    comfortable: { plain: 52, filters: 88 }
};

interface ColumnMenuState {
    colId: string;
    anchor: Anchor;
}
interface ColumnEditorState {
    anchor: Anchor;
    colId?: string;
    index?: number;
    focusType?: boolean;
}
interface ConfirmState {
    title: string;
    text: string;
    confirm: string;
    danger?: boolean;
    run: () => void;
    secondary?: { label: string; run: () => void };
}

function parsePageSizes(text: string): number[] {
    return text
        .split(",")
        .map(part => Number(part.trim()))
        .filter(n => Number.isInteger(n) && n > 0);
}

function useDarkScheme(scheme: string): boolean {
    const query = "(prefers-color-scheme: dark)";
    const subscribe = useCallback((onChange: () => void) => {
        if (typeof window === "undefined" || !window.matchMedia) {
            return () => undefined;
        }
        const list = window.matchMedia(query);
        list.addEventListener("change", onChange);
        return () => list.removeEventListener("change", onChange);
    }, []);
    const system = useSyncExternalStore(
        subscribe,
        () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false),
        () => false
    );
    return scheme === "dark" || (scheme === "auto" && system);
}

/** Reads a DynamicValue<boolean> permission; defaults to true while loading. */
function allowed(value: { status: string; value?: boolean } | undefined): boolean {
    if (!value) {
        return true;
    }
    return value.status === ValueStatus.Available ? value.value !== false : false;
}

export function MxDynamicGrid(props: MxDynamicGridContainerProps): ReactElement {
    const texts = useMemo(() => resolveTexts(props), [props]);
    const validationTexts: ValidationTexts = useMemo(
        () => ({
            ...DEFAULT_VALIDATION_TEXTS,
            required: texts.textErrRequired,
            min: texts.textErrMin,
            max: texts.textErrMax,
            pattern: texts.textErrPattern,
            option: texts.textErrOption,
            number: texts.textErrNumber,
            date: texts.textErrDate,
            unique: texts.textErrUnique,
            email: texts.textErrEmail
        }),
        [texts]
    );
    const propsRef = useRef(props);
    propsRef.current = props;

    // ---- Permissions -------------------------------------------------------------------------------------
    const editingConfigured = Boolean(props.changeSet && props.onSave);
    const canEditData = editingConfigured && allowed(props.canEditData);
    const canEditStructure = editingConfigured && allowed(props.canEditStructure);
    const canAddRows = editingConfigured && allowed(props.canAddRows);
    const canDeleteRows = editingConfigured && allowed(props.canDeleteRows);
    const canExport = allowed(props.canExport);

    // ---- Motion and theme --------------------------------------------------------------------------------
    const reducedMotion = usePrefersReducedMotion();
    const motion = resolveMotion(props.motion, true, reducedMotion);
    const animate = motion !== "off";
    const dark = useDarkScheme(props.colorScheme);

    // ---- Data mode --------------------------------------------------------------------------------------
    const { rowsSource, columnsSource } = props;
    const [autoServer, setAutoServer] = useState<boolean | undefined>(undefined);
    const serverMode = props.dataMode === "server" || (props.dataMode === "auto" && autoServer === true);
    const pageSizes = useMemo(() => parsePageSizes(props.pageSizeOptions), [props.pageSizeOptions]);
    const [pageSize, setPageSize] = useState(Math.max(1, props.pageSize || 50));
    const [page, setPage] = useState(0);
    const [loadedLimit, setLoadedLimit] = useState(Math.max(1, props.pageSize || 50));

    // ---- View state (personalization) ---------------------------------------------------------------------
    const [view, setViewRaw] = useState<ViewState>(() => emptyViewState());
    const viewLoaded = useRef(false);
    const [rowLevel, setRowLevel] = useState<RowHeightLevel>(props.rowHeight ?? "medium");
    const density: Density = rowLevel === "short" ? "compact" : rowLevel === "medium" ? "normal" : "comfortable";
    const setDensity = (next: Density): void =>
        setRowLevel(next === "compact" ? "short" : next === "normal" ? "medium" : "tall");
    const [activeViewId, setActiveViewId] = useState<string | undefined>();
    const [viewBarRequest, setViewBarRequest] = useState<{ id: PanelId; nonce: number } | undefined>();
    const [summaryMenu, setSummaryMenu] = useState<{ colId: string; anchor: Anchor } | undefined>();
    const [bulkOpen, setBulkOpen] = useState(false);
    const [commentsAt, setCommentsAt] = useState<{ row: string; col: string | null; anchor: Anchor } | undefined>();
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [updatedRows, setUpdatedRows] = useState<Map<string, string>>(new Map());
    const [conflictRow, setConflictRow] = useState<string | undefined>();
    const [findOpen, setFindOpen] = useState(false);
    const [hintsOpen, setHintsOpen] = useState(() => Boolean(props.showHints) && !hintsDone());
    const [search, setSearch] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
    const personalizationTimer = useRef<number | undefined>(undefined);
    const activeViewIdRef = useRef(activeViewId);
    activeViewIdRef.current = activeViewId;
    const lastPersisted = useRef<string>("");

    const persistView = useCallback((next: ViewState) => {
        const attribute = propsRef.current.personalization;
        if (!attribute || attribute.readOnly) {
            return;
        }
        window.clearTimeout(personalizationTimer.current);
        personalizationTimer.current = window.setTimeout(() => {
            // The view id is read when the timer fires, so a tab switch and its state are stored together.
            const json = serializeViewState({ ...next, viewId: activeViewIdRef.current });
            if (json === lastPersisted.current) {
                return;
            }
            lastPersisted.current = json;
            attribute.setValue(json);
            const action = propsRef.current.onPersonalizationChange;
            if (action?.canExecute && !action.isExecuting) {
                action.execute();
            }
        }, 700);
    }, []);

    const setView = useCallback(
        (update: (previous: ViewState) => ViewState) => {
            setViewRaw(previous => {
                const next = update(previous);
                persistView({ ...next, search: undefined, rowHeight: rowLevel });
                return next;
            });
        },
        [persistView, rowLevel]
    );

    // Load the stored view once the attribute is available; then the default saved view.
    useEffect(() => {
        if (viewLoaded.current) {
            return;
        }
        const personalization = props.personalization;
        const viewsAttr = props.views;
        if (
            (personalization && personalization.status === ValueStatus.Loading) ||
            (viewsAttr && viewsAttr.status === ValueStatus.Loading)
        ) {
            return;
        }
        viewLoaded.current = true;
        const stored = parseViewState(personalization?.value);
        // 1.1: the tab of the default (or first) saved view is active from the start.
        const initialDoc = parseViews(viewsAttr?.value);
        const initialOwner = props.viewOwner?.value;
        const visible = initialDoc.views.filter(v => v.shared || !initialOwner || !v.owner || v.owner === initialOwner);
        const initialView =
            visible.find(v => v.isDefault && v.owner === initialOwner && !v.shared) ??
            visible.find(v => v.isDefault) ??
            visible[0];
        // The stored state is reused only for the view it was made in (1.2.1: it carries that view id); otherwise
        // the tab and the state could disagree, for example a board layout under a grid tab.
        const storedView = stored?.viewId ? visible.find(v => v.id === stored.viewId) : undefined;
        const tabView = storedView ?? initialView;
        if (tabView) {
            setActiveViewId(tabView.id);
        }
        if (stored && (storedView || !visible.length)) {
            delete stored.viewId;
            lastPersisted.current = personalization?.value ?? "";
            setViewRaw(stored);
            if (stored.rowHeight) {
                setRowLevel(stored.rowHeight);
            } else if (stored.density) {
                setDensity(stored.density);
            }
            if (stored.pageSize) {
                setPageSize(stored.pageSize);
            }
            return;
        }
        const doc = parseViews(viewsAttr?.value);
        const owner = props.viewOwner?.value;
        const preferred =
            initialView ?? doc.views.find(v => v.isDefault && (!v.owner || v.owner === owner || v.shared));
        if (stored?.pageSize) {
            setPageSize(stored.pageSize);
        }
        if (preferred) {
            setViewRaw(preferred.state);
            if (preferred.state.rowHeight) {
                setRowLevel(preferred.state.rowHeight);
            }
        }
    }, [props.personalization, props.views, props.viewOwner]);

    // ---- Server model --------------------------------------------------------------------------------------
    const columnAttrs: ColumnAttributes = props;
    const serverColumns = useMemo(
        () =>
            columnsSource.status === ValueStatus.Available || columnsSource.items
                ? readColumns(columnsSource, columnAttrs)
                : [],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [columnsSource.items, columnsSource.status]
    );
    const staticDefs = useMemo(() => staticColumnDefs(props.staticColumns), [props.staticColumns]);
    const items = useMemo(() => rowsSource.items ?? [], [rowsSource.items]);
    const itemById = useMemo(() => new Map<string, ObjectItem>(items.map(item => [String(item.id), item])), [items]);
    const serverRows = useMemo(() => {
        const rows = readRows(items, props, true);
        if (!props.staticColumns.length) {
            return rows;
        }
        return rows.map(row => {
            const item = row.itemId ? itemById.get(row.itemId) : undefined;
            if (!item) {
                return row;
            }
            const values = { ...row.values };
            props.staticColumns.forEach((column, index) => {
                values[`__static${index}`] = staticValue(column, item);
            });
            return { ...row, values };
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items, itemById, props.staticColumns]);
    // 1.2: comments, history and linkable rows from their optional data sources.
    const commentItems = props.commentsSource?.items;
    const serverComments = useMemo(
        () => readComments(props.commentsSource, props),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [commentItems]
    );
    const historyItems = props.historySource?.items;
    const history = useMemo(
        () => readHistory(props.historySource, props),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [historyItems]
    );
    const linkItems = props.linkSource?.items;
    const links = useMemo(() => {
        const list = readLinks(props.linkSource, props);
        setLinkRows(list);
        setLinkLabels(new Map(list.map(link => [link.key, link.label || link.key])));
        return list;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [linkItems]);
    const serverModel: GridModel = useMemo(
        () => ({ columns: serverColumns, rows: serverRows, ...(serverComments ? { comments: serverComments } : {}) }),
        [serverColumns, serverRows, serverComments]
    );
    const lockedRows = useMemo(() => {
        const set = new Set<string>();
        const attr = props.rowLocked;
        if (attr) {
            items.forEach(item => {
                try {
                    if (attr.get(item).value === true) {
                        const key = props.rowKey.get(item).value;
                        set.add(key || String(item.id));
                    }
                } catch {
                    // attribute not available for this item
                }
            });
        }
        return set;
    }, [items, props.rowLocked, props.rowKey]);

    const loading =
        (rowsSource.status === ValueStatus.Loading && !rowsSource.items) ||
        (columnsSource.status === ValueStatus.Loading && !columnsSource.items);

    // ---- Save queue (change-set contract) -------------------------------------------------------------------
    const queueRef = useRef<SaveQueue | null>(null);
    if (!queueRef.current) {
        const adapter: SaveAdapter = {
            write: json => propsRef.current.changeSet?.setValue(json),
            execute: () => propsRef.current.onSave?.execute(),
            canExecute: () =>
                Boolean(
                    propsRef.current.onSave?.canExecute &&
                        propsRef.current.changeSet &&
                        !propsRef.current.changeSet.readOnly
                ),
            isExecuting: () => Boolean(propsRef.current.onSave?.isExecuting),
            readResult: () => propsRef.current.result?.value,
            hasResult: () => Boolean(propsRef.current.result),
            clearResult: () => {
                const result = propsRef.current.result;
                if (result && !result.readOnly) {
                    result.setValue("");
                }
            },
            baseVersion: () => {
                const version = propsRef.current.version?.value;
                return version === undefined || version === null ? null : Number(version.toString());
            },
            reload: () => {
                propsRef.current.rowsSource.reload();
                propsRef.current.columnsSource.reload();
                propsRef.current.commentsSource?.reload();
                propsRef.current.historySource?.reload();
            },
            now: () => Date.now()
        };
        queueRef.current = new SaveQueue(adapter, {
            mode: props.saveMode,
            delay: props.saveDelay,
            undoLimit: Math.max(0, props.undoLimit)
        });
    }
    const queue = queueRef.current;
    queue.options = { mode: props.saveMode, delay: props.saveDelay, undoLimit: Math.max(0, props.undoLimit) };
    const [queueVersion, setQueueVersion] = useState(0);
    useEffect(() => queue.subscribe(() => setQueueVersion(v => v + 1)), [queue]);
    useEffect(() => () => queue.dispose(), [queue]);
    // Poll the running save on every render and every 250 ms.
    useEffect(() => {
        queue.poll();
    });
    useEffect(() => {
        const id = window.setInterval(() => {
            queue.poll();
            queue.expire();
        }, 250);
        return () => window.clearInterval(id);
    }, [queue]);
    useEffect(() => {
        queue.reconcile(serverModel);
    }, [queue, serverModel]);

    // ---- Displayed model -------------------------------------------------------------------------------------
    const overlay = queue.overlayOps();
    const model = useMemo(
        () => applyOps(serverModel, overlay),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [serverModel, queueVersion]
    );
    const modelRef = useRef(model);
    modelRef.current = model;
    const dynamicColumns = model.columns;
    const allColumns = useMemo(() => {
        const start = staticDefs.filter((_, index) => props.staticColumns[index]?.staticPosition !== "end");
        const end = staticDefs.filter((_, index) => props.staticColumns[index]?.staticPosition === "end");
        return [...start, ...dynamicColumns, ...end];
    }, [staticDefs, dynamicColumns, props.staticColumns]);
    const columnByKey = useMemo(() => new Map(allColumns.map(column => [column.key, column])), [allColumns]);
    const isHidden = useCallback(
        (column: ColumnDef) => view.columns[column.key]?.hidden ?? column.hidden,
        [view.columns]
    );
    const visibleColumns = useMemo(() => allColumns.filter(column => !isHidden(column)), [allColumns, isHidden]);

    const computedRows = useMemo(
        () => computeFormulas(computeRelated(model.rows, dynamicColumns, links, model.rows), dynamicColumns),
        [model.rows, dynamicColumns, links]
    );

    // ---- Pipeline ---------------------------------------------------------------------------------------------
    const filters = view.filters;
    const sort = view.sort;
    const groupBy = useMemo(
        () => view.groupBy.filter(key => columnByKey.has(key)).slice(0, MAX_GROUP_LEVELS),
        [view.groupBy, columnByKey]
    );
    const aggregates = useMemo(() => {
        const result: Record<string, AggregateFn> = {};
        allColumns.forEach(column => {
            result[column.key] = view.aggregates[column.key] ?? defaultAggregate(column);
        });
        return result;
    }, [allColumns, view.aggregates]);
    const filteredRows = useMemo(
        () =>
            serverMode
                ? computedRows
                : sortRows(
                      applyRules(filterRows(computedRows, visibleColumns, filters, search), allColumns, view.rules),
                      allColumns,
                      sort
                  ),
        [serverMode, computedRows, visibleColumns, filters, search, allColumns, sort, view.rules]
    );
    const display: DisplayRow[] = useMemo(
        () => groupRows(filteredRows, allColumns, groupBy, collapsed, sort, aggregates, texts.textEmpty),
        [filteredRows, allColumns, groupBy, collapsed, sort, aggregates, texts.textEmpty]
    );
    const dataRowsInOrder = useMemo(() => filteredRows, [filteredRows]);

    // Client pagination: buttons use AG Grid pages, load more slices.
    const clientLoadMore = !serverMode && props.pagination === "loadMore";
    const shownDisplay = useMemo(
        () => (clientLoadMore ? display.slice(0, loadedLimit) : display),
        [clientLoadMore, display, loadedLimit]
    );

    // ---- Grid items (stable objects for unchanged rows) ---------------------------------------------------------
    const itemCache = useRef(new WeakMap<object, GridItem>());
    const rowData: GridItem[] = useMemo(
        () =>
            shownDisplay.map(entry => {
                const source = entry.kind === "group" ? entry : entry.row;
                const cached = itemCache.current.get(source);
                if (cached && cached.level === entry.level) {
                    return cached;
                }
                const item: GridItem =
                    entry.kind === "group"
                        ? { id: entry.id, group: entry, level: entry.level }
                        : { id: entry.row.key, row: entry.row, level: entry.level };
                itemCache.current.set(source, item);
                return item;
            }),
        [shownDisplay]
    );
    // The inline "+ New row" (Airtable) at the end of the grid.
    const inlineNewRow =
        props.showViewBar &&
        editingConfigured &&
        allowed(props.canAddRows) &&
        props.dataMode !== "server" &&
        !autoServer;
    const gridRows: GridItem[] = useMemo(
        () => (inlineNewRow && rowData.length > 0 ? [...rowData, { id: "__newrow", newRow: true, level: 0 }] : rowData),
        [rowData, inlineNewRow]
    );

    // ---- Validation ------------------------------------------------------------------------------------------
    const editedRows = useMemo(() => {
        const keys = new Set<string>();
        overlay.forEach(op => {
            if ("row" in op) {
                keys.add(op.row);
            }
        });
        return keys;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queueVersion]);
    const clientIssues = useMemo(
        () => collectIssues(computedRows, dynamicColumns, validationTexts, editedRows),
        [computedRows, dynamicColumns, validationTexts, editedRows]
    );
    const server = useMemo(() => serverIssues(queue.errors), [queue, queueVersion]); // eslint-disable-line react-hooks/exhaustive-deps
    const issueOf = useCallback(
        (rowKey: string, colId: string) =>
            server.cells.get(issueKey(rowKey, colId)) ?? clientIssues.get(issueKey(rowKey, colId)),
        [server, clientIssues]
    );
    const issueCount = clientIssues.size + server.cells.size;
    queue.blocker = props.blockInvalidSave
        ? () => (clientIssues.size > 0 ? fill(texts.textInvalidBlocked, { count: clientIssues.size }) : undefined)
        : undefined;

    // ---- Grid API, toasts, layers --------------------------------------------------------------------------------
    const apiRef = useRef<GridApi<GridItem> | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const [toasts, setToasts] = useState<ToastData[]>([]);
    const toastId = useRef(0);
    const toast = useCallback((data: Omit<ToastData, "id">, ms = 5000): number => {
        const id = ++toastId.current;
        setToasts(list => [...list.slice(-3), { ...data, id }]);
        if (!data.sticky) {
            window.setTimeout(() => setToasts(list => list.filter(t => t.id !== id)), ms);
        }
        return id;
    }, []);
    const dismissToast = useCallback((id: number) => setToasts(list => list.filter(t => t.id !== id)), []);
    const [columnMenu, setColumnMenu] = useState<ColumnMenuState | undefined>();
    const [columnEditor, setColumnEditor] = useState<ColumnEditorState | undefined>();
    const [rowMenu, setRowMenu] = useState<{ rowKey: string; anchor: Anchor; colId?: string } | undefined>();
    const [confirm, setConfirm] = useState<ConfirmState | undefined>();
    const [recordKey, setRecordKey] = useState<string | undefined>();
    const recordKeyRef = useRef(recordKey);
    recordKeyRef.current = recordKey;
    const [exportOpen, setExportOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);
    const [panelOpen, setPanelOpen] = useState(false);
    const [formatCol, setFormatCol] = useState<string | undefined>();
    const [groupMenu, setGroupMenu] = useState<Anchor | undefined>();
    const recentRows = useRef(new Map<string, number>());
    const flashQueue = useRef<Array<{ row: string; col: string }>>([]);

    // ---- Editing -------------------------------------------------------------------------------------------
    const canEditColumn = useCallback(
        (column: ColumnDef): boolean => {
            if (isStaticId(column.key)) {
                return canEditData && column.canEdit;
            }
            return canEditData && column.canEdit && !column.readOnly && !isSystemType(column.type);
        },
        [canEditData]
    );
    const canEditCell = useCallback(
        (rowKey: string, colId: string): boolean => {
            const column = columnByKey.get(colId);
            if (!column || !canEditColumn(column)) {
                return false;
            }
            if (lockedRows.has(rowKey)) {
                return false;
            }
            if (isStaticId(colId)) {
                const row = modelRef.current.rows.find(r => r.key === rowKey);
                return Boolean(row?.itemId);
            }
            return true;
        },
        [columnByKey, canEditColumn, lockedRows]
    );

    /** Pushes ops to the save queue (with undo) and remembers what to animate. */
    const apply = useCallback(
        (ops: ChangeOp[], label?: string) => {
            if (!ops.length) {
                return;
            }
            const now = Date.now();
            ops.forEach(op => {
                if (op.op === "addRow") {
                    recentRows.current.set(op.row, now);
                }
                if (op.op === "setCell") {
                    flashQueue.current.push({ row: op.row, col: op.col });
                }
            });
            queue.push(ops, modelRef.current, label);
        },
        [queue]
    );

    const writeStatic = useCallback(
        (rowKey: string, colId: string, value: CellValue) => {
            const row = modelRef.current.rows.find(r => r.key === rowKey);
            const item = row?.itemId ? itemById.get(row.itemId) : undefined;
            const index = staticIndex(colId);
            const config = propsRef.current.staticColumns[index];
            const def = staticDefs[index];
            if (!item || !config || !def) {
                return;
            }
            writeStaticValue(config, def.type, item, value, items).then(error => {
                if (error) {
                    toast({ text: error, tone: "error" });
                }
            });
        },
        [itemById, staticDefs, items, toast]
    );

    const setCells = useCallback(
        (cells: Array<{ row: string; col: string; value: CellValue }>, label?: string) => {
            const ops: ChangeOp[] = [];
            cells.forEach(cell => {
                if (isStaticId(cell.col)) {
                    writeStatic(cell.row, cell.col, cell.value);
                } else {
                    ops.push({ op: "setCell", row: cell.row, col: cell.col, value: cell.value });
                }
            });
            apply(ops, label);
        },
        [apply, writeStatic]
    );

    const newRowValues = useCallback((): Record<string, CellValue> => {
        const values: Record<string, CellValue> = {};
        modelRef.current.columns.forEach(column => {
            if (column.defaultValue !== undefined && column.defaultValue !== null && !isSystemType(column.type)) {
                values[column.key] = column.defaultValue;
            }
        });
        return values;
    }, []);

    const addRow = useCallback(
        (index?: number, values?: Record<string, CellValue>, focus = true): string | undefined => {
            if (!canAddRows) {
                toast({ text: texts.textNoPermission, tone: "error" });
                return undefined;
            }
            const key = newKey();
            const at = index ?? modelRef.current.rows.length;
            apply(
                [{ op: "addRow", row: key, index: at, values: { ...newRowValues(), ...(values ?? {}) } }],
                texts.textAddRow
            );
            if (focus) {
                // Focus the new row once AG Grid rendered it, in a later frame (never inside a React commit).
                let attempts = 0;
                const tryFocus = (): void => {
                    const api = apiRef.current;
                    const node = api?.getRowNode(key);
                    const firstEditable = visibleColumns.find(column => canEditColumn(column));
                    if (api && node && node.rowIndex !== null && node.rowIndex !== undefined) {
                        const rowIndex = node.rowIndex;
                        window.requestAnimationFrame(() =>
                            window.setTimeout(() => {
                                // A plain DOM scroll for rows at the end: ensureIndexVisible renders rows with flushSync,
                                // which React reports when it happens during a render.
                                const viewport = rootRef.current?.querySelector<HTMLElement>(
                                    ".ag-grid-viewport, .ag-body-viewport"
                                );
                                if (viewport && rowIndex >= api.getDisplayedRowCount() - 1) {
                                    viewport.scrollTop = viewport.scrollHeight;
                                } else {
                                    api.ensureIndexVisible(rowIndex);
                                }
                                if (firstEditable) {
                                    api.setFocusedCell(rowIndex, firstEditable.key);
                                }
                            }, 0)
                        );
                    } else if (attempts++ < 20) {
                        window.setTimeout(tryFocus, 50);
                    }
                };
                window.setTimeout(tryFocus, 50);
            }
            return key;
        },
        [canAddRows, apply, newRowValues, texts, toast, visibleColumns, canEditColumn]
    );

    const deleteRows = useCallback(
        (requested: string[], ask = true) => {
            const keys = requested.filter(key => !lockedRows.has(key));
            if (!canDeleteRows || !keys.length) {
                return;
            }
            const run = (): void => {
                apply(
                    keys.map(row => ({ op: "deleteRow" as const, row })),
                    fill(texts.textRowsDeleted, { count: keys.length })
                );
                toast({
                    text: fill(texts.textRowsDeleted, { count: keys.length }),
                    action: { label: texts.textUndo, run: () => undoRef.current() }
                });
            };
            if (ask && keys.length > 1) {
                setConfirm({
                    title: texts.textDeleteRow,
                    text: fill(texts.textDeleteRowsConfirm, { count: keys.length }),
                    confirm: texts.textDelete,
                    danger: true,
                    run
                });
            } else {
                run();
            }
        },
        [canDeleteRows, apply, texts, toast, lockedRows]
    );

    const duplicateRow = useCallback(
        (rowKey: string) => {
            const index = modelRef.current.rows.findIndex(r => r.key === rowKey);
            const row = modelRef.current.rows[index];
            if (!row) {
                return;
            }
            const values: Record<string, CellValue> = {};
            modelRef.current.columns.forEach(column => {
                if (!isSystemType(column.type) && row.values[column.key] !== undefined) {
                    values[column.key] = row.values[column.key];
                }
            });
            addRow(index + 1, values);
        },
        [addRow]
    );

    // ---- Undo / redo -------------------------------------------------------------------------------------------
    const undo = useCallback(() => {
        const entry = queue.undo(modelRef.current);
        if (entry) {
            toast({ text: fill(texts.textUndoDone, { action: entry.label }) }, 2500);
        }
    }, [queue, texts, toast]);
    const redo = useCallback(() => {
        queue.redo(modelRef.current);
    }, [queue]);
    const undoRef = useRef(undo);
    undoRef.current = undo;

    // ---- Column structure ---------------------------------------------------------------------------------------
    const createColumn = useCallback(
        (column: ColumnDef, index?: number) => {
            const at = index ?? modelRef.current.columns.length;
            apply([{ op: "addColumn", col: payloadFromColumn(column, at) }], texts.textAddColumn);
            window.setTimeout(() => apiRef.current?.ensureColumnVisible(column.key), 80);
        },
        [apply, texts]
    );

    const updateColumn = useCallback(
        (before: ColumnDef, after: ColumnDef) => {
            const patch: ColumnPatch = {};
            const fields: Array<keyof ColumnPatch> = [
                "caption",
                "type",
                "width",
                "required",
                "readOnly",
                "options",
                "format",
                "formula",
                "headerGroup",
                "description",
                "validation",
                "max",
                "defaultValue",
                "link"
            ];
            fields.forEach(field => {
                const a = (before as unknown as Record<string, unknown>)[field];
                const b = (after as unknown as Record<string, unknown>)[field];
                if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) {
                    (patch as Record<string, unknown>)[field] = b ?? null;
                }
            });
            if (!Object.keys(patch).length) {
                return;
            }
            const ops: ChangeOp[] = [{ op: "updateColumn", col: before.key, patch }];
            if (patch.type && patch.type !== before.type) {
                const conversion = convertColumn(modelRef.current.rows, before, after.type);
                conversion.values.forEach((value, row) => ops.push({ op: "setCell", row, col: before.key, value }));
            }
            apply(ops, texts.textEditField);
        },
        [apply, texts]
    );

    const renameColumn = useCallback(
        (colId: string, caption: string) => {
            const column = modelRef.current.columns.find(c => c.key === colId);
            if (column && canEditStructure) {
                apply([{ op: "updateColumn", col: colId, patch: { caption } }], texts.textRename);
            }
        },
        [apply, canEditStructure, texts]
    );

    const deleteColumn = useCallback(
        (colId: string) => {
            const column = modelRef.current.columns.find(c => c.key === colId);
            if (!column) {
                return;
            }
            setConfirm({
                title: texts.textDelete,
                text: fill(texts.textDeleteColumnConfirm, { name: column.caption }),
                confirm: texts.textDelete,
                danger: true,
                run: () => {
                    apply([{ op: "deleteColumn", col: colId }], texts.textDelete);
                    toast(
                        {
                            text: fill(texts.textColumnDeleted, { name: column.caption }),
                            action: { label: texts.textUndo, run: () => undoRef.current() }
                        },
                        8000
                    );
                }
            });
        },
        [apply, texts, toast]
    );

    const duplicateColumn = useCallback(
        (colId: string) => {
            const index = modelRef.current.columns.findIndex(c => c.key === colId);
            const column = modelRef.current.columns[index];
            if (!column) {
                return;
            }
            const key = newKey();
            const copy: ColumnDef = { ...column, key, caption: `${column.caption} (${texts.textCopy})` };
            const ops: ChangeOp[] = [{ op: "addColumn", col: payloadFromColumn(copy, index + 1) }];
            if (!isSystemType(column.type)) {
                modelRef.current.rows.forEach(row => {
                    const value = row.values[colId];
                    if (!isEmpty(value)) {
                        ops.push({ op: "setCell", row: row.key, col: key, value: value as CellValue });
                    }
                });
            }
            apply(ops, texts.textDuplicate);
        },
        [apply, texts]
    );

    // ---- View changes ---------------------------------------------------------------------------------------
    const setSort = useCallback(
        (colId: string, multi: boolean, dir?: "asc" | "desc" | null) => {
            setView(previous => {
                const current = previous.sort.find(entry => entry.col === colId);
                const nextDir = dir !== undefined ? dir : !current ? "asc" : current.dir === "asc" ? "desc" : null;
                let next: SortEntry[] = multi ? previous.sort.filter(entry => entry.col !== colId) : [];
                if (nextDir) {
                    next =
                        multi && current
                            ? previous.sort.map(entry => (entry.col === colId ? { col: colId, dir: nextDir } : entry))
                            : [...next, { col: colId, dir: nextDir }];
                }
                return { ...previous, sort: next };
            });
        },
        [setView]
    );
    const setFilter = useCallback(
        (colId: string, filter: ColumnFilter | undefined) => {
            setView(previous => {
                const filtersNext = { ...previous.filters };
                if (filter && isActiveFilter(filter)) {
                    filtersNext[colId] = filter;
                } else {
                    delete filtersNext[colId];
                }
                return { ...previous, filters: filtersNext };
            });
            setPage(0);
        },
        [setView]
    );
    const setColumnView = useCallback(
        (colId: string, patch: { width?: number; hidden?: boolean; pinned?: "left" | "right" | null }) => {
            setView(previous => ({
                ...previous,
                columns: { ...previous.columns, [colId]: { ...previous.columns[colId], ...patch } }
            }));
        },
        [setView]
    );
    const toggleGroupBy = useCallback(
        (colId: string) => {
            setView(previous => {
                const has = previous.groupBy.includes(colId);
                const next = has
                    ? previous.groupBy.filter(key => key !== colId)
                    : [...previous.groupBy, colId].slice(0, MAX_GROUP_LEVELS);
                return { ...previous, groupBy: next };
            });
            setCollapsed(new Set());
        },
        [setView]
    );

    // Debounced quick search.
    useEffect(() => {
        const id = window.setTimeout(() => {
            setSearch(searchInput);
            setPage(0);
        }, 200);
        return () => window.clearTimeout(id);
    }, [searchInput]);

    // ---- 1.2 live collaboration: polling, rows changed by others, conflicts ---------------------------------------
    useEffect(() => {
        const seconds = props.refreshInterval ?? 0;
        if (seconds <= 0) {
            return;
        }
        const id = window.setInterval(() => {
            // Never reload under a running save or while the user has unsaved edits in auto mode.
            if (queue.inflight || (queue.pending.length && props.saveMode === "auto")) {
                return;
            }
            propsRef.current.rowsSource.reload();
            propsRef.current.columnsSource.reload();
            propsRef.current.commentsSource?.reload();
        }, seconds * 1000);
        return () => window.clearInterval(id);
    }, [props.refreshInterval, props.saveMode, queue]);
    const previousServerRows = useRef<Map<string, Record<string, string>> | undefined>(undefined);
    // Cells (row + col, or row + "*" for row operations) this user sent recently: their echo is not someone else's change.
    const ownCells = useRef(new Map<string, number>());
    [...(queue.inflight ?? []), ...queue.saved.flatMap(batch => batch.ops)].forEach(op => {
        if ("row" in op && typeof op.row === "string") {
            ownCells.current.set(`${op.row}\u0000${op.op === "setCell" ? op.col : "*"}`, Date.now());
        }
    });
    useEffect(() => {
        const current = new Map(
            serverRows.map(row => {
                const cells: Record<string, string> = {};
                Object.keys(row.values).forEach(key => (cells[key] = JSON.stringify(row.values[key] ?? null)));
                return [row.key, cells] as const;
            })
        );
        const previous = previousServerRows.current;
        previousServerRows.current = current;
        if (!previous) {
            return;
        }
        const me = props.viewOwner?.value ?? "";
        // Echoes of our own saves are not changes by others; unsent edits are not sent yet, so a server change on
        // a row with an unsent edit is a conflict.
        const now = Date.now();
        ownCells.current.forEach((at, key) => now - at > 20000 && ownCells.current.delete(key));
        const isOwn = (row: string, col: string): boolean =>
            ownCells.current.has(`${row}\u0000${col}`) || ownCells.current.has(`${row}\u0000*`);
        const changed = new Map<string, string>();
        serverRows.forEach(row => {
            const before = previous.get(row.key);
            const after = current.get(row.key) ?? {};
            if (before === undefined) {
                return;
            }
            const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
            let foreign = false;
            keys.forEach(col => {
                if (before[col] !== after[col] && !isOwn(row.key, col)) {
                    foreign = true;
                }
            });
            if (!foreign) {
                return;
            }
            const item = row.itemId ? itemById.get(row.itemId) : undefined;
            let by = "";
            try {
                by = (item && props.rowChangedBy?.get(item).value) || "";
            } catch {
                by = "";
            }
            if (by && by === me) {
                return;
            }
            changed.set(row.key, by);
        });
        if (!changed.size) {
            return;
        }
        setUpdatedRows(new Map(changed));
        changed.forEach((_, key) => {
            const node = apiRef.current?.getRowNode(key);
            if (node && motion !== "off") {
                apiRef.current?.flashCells({ rowNodes: [node], flashDuration: 700, fadeDuration: 1500 });
            }
            if (key === recordKeyRef.current && queue.pending.some(op => "row" in op && op.row === key)) {
                setConflictRow(key);
            }
        });
        const id = window.setTimeout(() => setUpdatedRows(new Map()), 8000);
        return () => window.clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serverRows]);

    // ---- Server mode: paging, view state, search -------------------------------------------------------------
    const viewStateAttr = props.viewState;
    const serverPagingByViewState = serverMode && Boolean(viewStateAttr);
    useEffect(() => {
        if (props.dataMode === "auto" && autoServer === undefined) {
            const threshold = Math.max(1, props.clientThreshold || 5000);
            rowsSource.setLimit(threshold + 1);
            if (rowsSource.status === ValueStatus.Available) {
                setAutoServer((rowsSource.items?.length ?? 0) > threshold);
            }
            return;
        }
        if (!serverMode) {
            rowsSource.setOffset(0);
            rowsSource.setLimit(undefined);
            return;
        }
        rowsSource.requestTotalCount(true);
        const limit = props.pagination === "buttons" ? pageSize : loadedLimit;
        const offset = props.pagination === "buttons" ? page * pageSize : 0;
        if (serverPagingByViewState) {
            // The microflow pages itself: the widget passes offset and limit in the view state.
            rowsSource.setOffset(0);
            rowsSource.setLimit(undefined);
        } else {
            rowsSource.setOffset(offset);
            rowsSource.setLimit(limit);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        serverMode,
        props.dataMode,
        autoServer,
        rowsSource.status,
        page,
        pageSize,
        loadedLimit,
        props.pagination,
        serverPagingByViewState
    ]);

    const lastViewJson = useRef("");
    useEffect(() => {
        if (!serverMode) {
            return;
        }
        const limit = props.pagination === "buttons" ? pageSize : loadedLimit;
        const offset = props.pagination === "buttons" ? page * pageSize : 0;
        if (viewStateAttr && !viewStateAttr.readOnly) {
            const json = buildServerViewState({ search, sort, filters, offset, limit, rules: view.rules });
            if (json !== lastViewJson.current) {
                lastViewJson.current = json;
                viewStateAttr.setValue(json);
                rowsSource.reload();
            }
        }
        const searchAttr = props.searchAttribute;
        if (searchAttr && searchAttr.filterable) {
            rowsSource.setFilter(
                search.trim() ? contains(filterAttribute(searchAttr.id), literal(search.trim())) : undefined
            );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serverMode, search, sort, filters, page, pageSize, loadedLimit, props.pagination, view.rules]);

    const totalRows = serverMode
        ? Number(props.totalCount?.value?.toString() ?? rowsSource.totalCount ?? items.length) || items.length
        : computedRows.length;

    // ---- Context store for headers and cells -----------------------------------------------------------------
    const distinct = useCallback(
        (colId: string) => {
            const column = columnByKey.get(colId);
            if (!column) {
                return [];
            }
            const counts = new Map<string, number>();
            computedRows.forEach(row =>
                setKeys(column, row.values[colId]).forEach(key => counts.set(key, (counts.get(key) ?? 0) + 1))
            );
            const keys = Array.from(counts.keys());
            if (column.options.length) {
                column.options.forEach(option => !counts.has(option.value) && keys.push(option.value));
            }
            return keys
                .map(key => {
                    const option = column.options.find(o => o.value === key);
                    return { key, label: option?.label ?? key, count: counts.get(key) ?? 0, color: option?.color };
                })
                .sort((a, b) =>
                    a.key === "" ? 1 : b.key === "" ? -1 : a.label.localeCompare(b.label, undefined, { numeric: true })
                )
                .slice(0, 1000);
        },
        [columnByKey, computedRows]
    );
    const rowNumbers = useMemo(() => {
        const map = new Map<string, number>();
        let n = 0;
        rowData.forEach(item => {
            if (item.row) {
                map.set(item.row.key, ++n);
            }
        });
        return map;
    }, [rowData]);
    // 1.2: unresolved comments per cell ("row\0col") and per row ("row\0").
    const commentIndex = useMemo(() => {
        const index = new Map<string, number>();
        (model.comments ?? []).forEach(comment => {
            if (!comment.resolved) {
                const key = `${comment.row}\u0000${comment.col ?? ""}`;
                index.set(key, (index.get(key) ?? 0) + 1);
            }
        });
        return index;
    }, [model.comments]);
    const commentsEnabled = Boolean(props.commentsSource) && editingConfigured;
    const people = useMemo(() => {
        const names = new Set<string>();
        const owner = props.viewOwner?.value;
        if (owner) {
            names.add(owner);
        }
        parsePresence(props.presence?.value).forEach(name => names.add(name));
        (model.comments ?? []).forEach(comment => comment.author && names.add(comment.author));
        computedRows.slice(0, 500).forEach(row =>
            dynamicColumns.forEach(column => {
                const value = row.values[column.key];
                if (column.type === "user" && typeof value === "string" && value) {
                    names.add(value);
                }
            })
        );
        return Array.from(names).slice(0, 200);
    }, [props.viewOwner?.value, props.presence?.value, model.comments, computedRows, dynamicColumns]);
    const addComment = (row: string, col: string | null, text: string, mentions: string[]): void => {
        queue.push(
            [{ op: "addComment", comment: { key: newKey(), row, col, text, mentions } }],
            modelRef.current,
            "comment",
            false
        );
    };
    const resolveComment = (key: string, resolved: boolean): void => {
        queue.push([{ op: "resolveComment", comment: key, resolved }], modelRef.current, "resolve comment", false);
    };
    // 1.1: multi selection uses the row-number checkbox (shown on hover) instead of a checkbox column.
    const multiSelectable =
        props.selection?.type === "Multi" || (!props.selection && props.showCheckboxes && canDeleteRows);
    const hoverCheckbox = multiSelectable && props.showCheckboxes && props.showRowNumbers;
    const contextState: GridContextState = {
        texts,
        columnOf: colId => columnByKey.get(colId),
        sort,
        filters,
        showFilters: props.showHeaderFilters,
        canEditStructure,
        canEditData,
        groupBy,
        searchText: texts.textSearchValues,
        motion,
        distinct,
        onSort: setSort,
        onFilter: setFilter,
        onRename: renameColumn,
        openMenu: (colId, anchor) => setColumnMenu({ colId, anchor }),
        openAddColumn: (anchor, index) => setColumnEditor({ anchor, index }),
        quickSet: (rowKey, colId, value) => setCells([{ row: rowKey, col: colId, value }]),
        canEditCell,
        issueOf,
        openRecord: rowKey => setRecordKey(rowKey),
        toggleGroup: path =>
            setCollapsed(previous => {
                const next = new Set(previous);
                if (next.has(path)) {
                    next.delete(path);
                } else {
                    next.add(path);
                }
                return next;
            }),
        staticCell: (rowKey, colId) => {
            const row = modelRef.current.rows.find(r => r.key === rowKey);
            const item = row?.itemId ? itemById.get(row.itemId) : undefined;
            const config = propsRef.current.staticColumns[staticIndex(colId)];
            return item && config?.staticContent ? config.staticContent.get(item) : null;
        },
        pendingText: "…",
        addRow: () => {
            addRow();
        },
        openSummary: (colId, anchor) => setSummaryMenu({ colId, anchor }),
        rowSelectable: multiSelectable,
        hoverCheckbox,
        rowNumberOf: key => rowNumbers.get(key),
        showAddLabel: props.showViewBar,
        openFieldMenuOnClick: props.showViewBar,
        commentCount: (rowKey, colId) => commentIndex.get(`${rowKey}\u0000${colId ?? ""}`) ?? 0,
        openComments: (rowKey, colId, anchor) => setCommentsAt({ row: rowKey, col: colId, anchor }),
        isLocked: rowKey => lockedRows.has(rowKey),
        updatedBy: rowKey => updatedRows.get(rowKey)
    };
    const storeRef = useRef<GridContextStore | null>(null);
    if (!storeRef.current) {
        storeRef.current = new GridContextStore(contextState);
    }
    const store = storeRef.current;
    useLayoutEffect(() => {
        store.update(contextState);
    });
    const editorContext = store as unknown as GridEditorContext;
    Object.assign(editorContext, {
        columnOf: (colId: string) => store.state.columnOf(colId),
        searchText: texts.textSearchValues
    });

    // ---- Conditional formats -----------------------------------------------------------------------------
    const ranges = useMemo(
        () => formatRanges(computedRows, allColumns, view.formats),
        [computedRows, allColumns, view.formats]
    );

    // ---- Column definitions ----------------------------------------------------------------------------------
    const columnDefs = useMemo((): Array<ColDef<GridItem> | ColGroupDef<GridItem>> => {
        const leaves: Array<{ group: string; def: ColDef<GridItem> }> = [];
        if (props.showRowNumbers) {
            leaves.push({
                group: "",
                def: {
                    colId: ROWNUM_ID,
                    headerName: "#",
                    headerComponent: RowNumberHeader,
                    headerClass: "mxt-dg-rownum-th",
                    width: props.rowDrag && canEditData ? 92 : 72,
                    pinned: "left",
                    lockPinned: true,
                    lockPosition: "left",
                    suppressMovable: true,
                    resizable: false,
                    sortable: false,
                    editable: false,
                    rowDrag: props.rowDrag && canEditData && !serverMode && !sort.length && !groupBy.length,
                    valueGetter: params => params.data?.totals?.[ROWNUM_ID],
                    cellRendererSelector: params =>
                        params.node.rowPinned ? { component: TotalsCell } : { component: RowNumberCell },
                    cellClass: "mxt-dg-rownum-cell",
                    suppressKeyboardEvent: () => false
                }
            });
        }
        const order = view.order;
        const ordered =
            order && order.length
                ? [...allColumns].sort((a, b) => indexIn(order, a.key) - indexIn(order, b.key))
                : allColumns;
        const firstDynamicKey = ordered.find(
            c => !isStaticId(c.key) && !(view.columns[c.key]?.hidden ?? c.hidden)
        )?.key;
        ordered.forEach(column => {
            const isStatic = isStaticId(column.key);
            const config = isStatic ? props.staticColumns[staticIndex(column.key)] : undefined;
            const info = typeInfo(column.type);
            const viewColumn = view.columns[column.key] ?? {};
            const frozen =
                props.freezeFirstColumn &&
                column.key === firstDynamicKey &&
                viewColumn.pinned === undefined &&
                !column.pinned;
            const pinned = viewColumn.pinned !== undefined ? viewColumn.pinned : frozen ? "left" : column.pinned;
            const custom = config?.staticType === "customContent";
            const popupEditor = ["longText", "select", "multiSelect"].includes(column.type);
            leaves.push({
                group: column.headerGroup.trim(),
                def: {
                    colId: column.key,
                    headerName: column.caption,
                    headerComponent: HeaderCell,
                    headerClass: `mxt-dg-th mxt-dg-th--${info.align}`,
                    width: viewColumn.width ?? column.width ?? info.defaultWidth,
                    minWidth: 60,
                    pinned: pinned ?? undefined,
                    hide: viewColumn.hidden ?? column.hidden,
                    sortable: false,
                    resizable: true,
                    suppressMovable: false,
                    valueGetter: params =>
                        params.data?.totals ? params.data.totals[column.key] : params.data?.row?.values[column.key],
                    valueFormatter: params => (params.data?.row ? formatValue(column, params.value) : ""),
                    cellRendererSelector: params =>
                        params.node.rowPinned
                            ? { component: TotalsCell }
                            : { component: custom ? StaticContentCell : DataCell },
                    cellEditor: GridCellEditor,
                    cellEditorPopup: popupEditor,
                    cellEditorPopupPosition: "under",
                    editable: params =>
                        Boolean(params.data?.row) &&
                        !custom &&
                        canEditCell(params.data?.row?.key ?? "", column.key) &&
                        column.type !== "boolean" &&
                        column.type !== "rating",
                    valueSetter: (params: ValueSetterParams<GridItem>) => {
                        const row = params.data?.row;
                        if (!row || params.newValue === undefined) {
                            return false;
                        }
                        const next = params.newValue as CellValue;
                        if (JSON.stringify(next ?? null) === JSON.stringify(row.values[column.key] ?? null)) {
                            return false;
                        }
                        setCells([{ row: row.key, col: column.key, value: next }]);
                        return false;
                    },
                    cellClass: params => {
                        const classes = [`mxt-dg-td`, `mxt-dg-td--${column.type}`, `mxt-dg-td--${info.align}`];
                        const row = params.data?.row;
                        if (row) {
                            if (issueOf(row.key, column.key)) {
                                classes.push("mxt-dg-td--invalid");
                            }
                            if (!canEditCell(row.key, column.key)) {
                                classes.push("mxt-dg-td--readonly");
                            }
                        }
                        return classes;
                    },
                    cellStyle: view.formats[column.key]?.length
                        ? params => ({
                              color: "",
                              backgroundColor: "",
                              backgroundImage: "",
                              fontWeight: "",
                              ...(params.data?.row
                                  ? formatStyle(
                                        view.formats[column.key],
                                        ranges[column.key],
                                        params.data.row.values[column.key],
                                        column
                                    )
                                  : undefined)
                          })
                        : undefined,
                    tooltipValueGetter: params => {
                        const row = params.data?.row;
                        if (!row) {
                            return undefined;
                        }
                        const issue = issueOf(row.key, column.key);
                        if (issue) {
                            return issue;
                        }
                        return column.type === "longText" && !isEmpty(params.value) ? String(params.value) : undefined;
                    },
                    suppressKeyboardEvent: params => {
                        const key = params.event.key;
                        if (
                            params.editing &&
                            (column.type === "longText" || column.type === "select" || column.type === "multiSelect")
                        ) {
                            return key === "Enter" || key === "ArrowUp" || key === "ArrowDown" || key === " ";
                        }
                        return false;
                    }
                }
            });
        });
        if (canEditStructure) {
            leaves.push({
                group: "",
                def: {
                    colId: ADD_ID,
                    headerName: "",
                    headerComponent: AddColumnHeader,
                    width: props.showViewBar ? 128 : 56,
                    minWidth: props.showViewBar ? 128 : 56,
                    maxWidth: props.showViewBar ? 128 : 56,
                    resizable: false,
                    suppressMovable: true,
                    lockPosition: "right",
                    pinned: "right",
                    lockPinned: true,
                    sortable: false,
                    editable: false,
                    cellClass: "mxt-dg-addcol-cell",
                    headerClass: "mxt-dg-addcol-th",
                    suppressNavigable: true
                }
            });
        }
        // Header groups: adjacent leaves with the same caption.
        const defs: Array<ColDef<GridItem> | ColGroupDef<GridItem>> = [];
        const hasGroups = leaves.some(leaf => leaf.group);
        leaves.forEach(({ group, def }) => {
            // Ungrouped leaves stay plain column defs: AG Grid then gives them a padding group and their header
            // spans the full header height, like Data Grid 2 / AG Grid with partial header groups.
            if (!hasGroups || !group) {
                defs.push(def);
                return;
            }
            const previous = defs[defs.length - 1] as ColGroupDef<GridItem> | undefined;
            if (group && previous && "children" in previous && previous.headerName === group) {
                previous.children.push(def);
            } else {
                defs.push({
                    headerName: group,
                    groupId: `grp_${defs.length}_${group}`,
                    headerClass: "mxt-dg-groupheader",
                    marryChildren: true,
                    children: [def]
                });
            }
        });
        return defs;
    }, [
        props.showRowNumbers,
        props.rowDrag,
        props.freezeFirstColumn,
        props.showViewBar,
        props.staticColumns,
        canEditData,
        canEditStructure,
        serverMode,
        sort.length,
        groupBy.length,
        allColumns,
        view.columns,
        view.order,
        view.formats,
        ranges,
        canEditCell,
        issueOf,
        setCells
    ]);

    // ---- Totals row ------------------------------------------------------------------------------------------
    const totalsRow = useMemo((): GridItem[] => {
        if (!props.showTotals || !allColumns.length) {
            return [];
        }
        const totals: Record<string, { label: string; value: string }> = {};
        const fnLabel: Record<string, string> = {
            sum: texts.textSum,
            avg: texts.textAvg,
            min: texts.textMin,
            max: texts.textMax,
            count: texts.textCount,
            filled: texts.textFilled
        };
        allColumns.forEach(column => {
            const fn = aggregates[column.key];
            if (!fn || fn === "none") {
                totals[column.key] = { label: "", value: "" };
                return;
            }
            const value = aggregate(filteredRows, column, fn);
            const shown =
                value === null
                    ? "–"
                    : ["count", "filled", "empty", "unique"].includes(fn)
                    ? String(value)
                    : fn === "percentEmpty"
                    ? `${value}%`
                    : fn === "earliest" || fn === "latest"
                    ? formatValue({ ...column, type: "date" }, value)
                    : typeof value === "number" && typeInfo(column.type).kind === "number"
                    ? formatValue(
                          {
                              ...column,
                              type: column.type === "rating" || column.type === "progress" ? "decimal" : column.type,
                              format: column.type === "rating" || column.type === "progress" ? "0.0" : column.format
                          },
                          value
                      )
                    : formatValue(column, value);
            totals[column.key] = { label: fnLabel[fn] ?? summaryLabel(texts, fn), value: shown };
        });
        // No totals row at all when no visible column has an aggregate.
        const shown = visibleColumns.filter(column => aggregates[column.key] && aggregates[column.key] !== "none");
        // 1.0: no totals row without aggregates. 1.1 summary bar: always shown (cells are empty until a function is picked).
        if (!shown.length && !props.showViewBar) {
            return [];
        }
        if (props.showViewBar && !filteredRows.length) {
            return [];
        }
        if (props.showRowNumbers) {
            totals[ROWNUM_ID] = props.showViewBar
                ? {
                      label: "",
                      value: fill(texts.textRows, {
                          count: (serverMode ? totalRows : filteredRows.length).toLocaleString()
                      })
                  }
                : { label: "", value: texts.textTotal };
        } else {
            const free = visibleColumns.find(column => !totals[column.key]?.value);
            if (free) {
                totals[free.key] = { label: "", value: texts.textTotal };
            }
        }
        return [{ id: TOTALS_ID, totals, level: 0 }];
    }, [
        props.showTotals,
        serverMode,
        totalRows,
        props.showRowNumbers,
        props.showViewBar,
        allColumns,
        visibleColumns,
        aggregates,
        filteredRows,
        texts
    ]);

    // ---- Range selection, clipboard, fill ------------------------------------------------------------------------
    const isRangeColumn = useCallback((colId: string) => columnByKey.has(colId), [columnByKey]);
    const rowAt = useCallback(
        (rowIndex: number): RowRecord | undefined => apiRef.current?.getDisplayedRowAtIndex(rowIndex)?.data?.row,
        []
    );
    const range = useRangeSelection({
        enabled: props.rangeSelection,
        fillHandle: props.fillHandle && canEditData,
        rootRef,
        apiRef,
        isRangeColumn,
        onFill: (current, target, invert) => {
            const cells = planFill(
                current,
                target,
                rangeColumnOrder(),
                (r, c) => rowAt(r)?.values[c],
                invert ? "invert" : "auto"
            );
            applyFill(cells);
        }
    });
    const rangeColumnOrder = (): string[] => range.columnOrder();
    const applyFill = (cells: FillCell[]): void => {
        const writes: Array<{ row: string; col: string; value: CellValue }> = [];
        cells.forEach(cell => {
            const row = rowAt(cell.rowIndex);
            const column = columnByKey.get(cell.colId);
            if (!row || !column || !canEditCell(row.key, cell.colId)) {
                return;
            }
            const value =
                cell.value instanceof Date
                    ? plainValue({ ...column, type: column.type === "date" ? "date" : "dateTime" }, cell.value)
                    : (cell.value as CellValue);
            writes.push({ row: row.key, col: cell.colId, value: value ?? null });
        });
        setCells(writes, fill(texts.textFilledCells, { count: writes.length }));
        if (writes.length) {
            toast({ text: fill(texts.textFilledCells, { count: writes.length }) }, 2000);
        }
    };

    const rangeSummary = useMemo(() => {
        const current = range.normalized();
        if (!current || range.cellCount < 2) {
            return undefined;
        }
        const values: unknown[] = [];
        for (let r = current.top; r <= current.bottom; r++) {
            const row = rowAt(r);
            current.colIds.forEach(colId => {
                const column = columnByKey.get(colId);
                const value = row?.values[colId];
                values.push(
                    column && typeInfo(column.type).kind === "number" && !isEmpty(value) ? Number(value) : value
                );
            });
        }
        return rangeStats(values);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [range.range, range.cellCount, rowData]);

    const focusedOrRange = (): { top: number; bottom: number; colIds: string[] } | undefined => {
        const current = range.normalized();
        if (current) {
            return current;
        }
        const focused = apiRef.current?.getFocusedCell();
        if (!focused || focused.rowIndex === null || focused.rowPinned) {
            return undefined;
        }
        const colId = focused.column.getColId();
        return columnByKey.has(colId)
            ? { top: focused.rowIndex, bottom: focused.rowIndex, colIds: [colId] }
            : undefined;
    };

    const copySelection = (): string | undefined => {
        const area = focusedOrRange();
        if (!area) {
            return undefined;
        }
        const lines: string[] = [];
        for (let r = area.top; r <= area.bottom; r++) {
            const row = rowAt(r);
            if (!row) {
                continue;
            }
            lines.push(
                area.colIds
                    .map(colId => {
                        const column = columnByKey.get(colId);
                        return column ? plainValue(column, row.values[colId]).replace(/[\t\r\n]+/g, " ") : "";
                    })
                    .join("\t")
            );
        }
        return lines.join("\r\n");
    };

    const pasteText = (text: string): void => {
        const area = focusedOrRange();
        if (!area || !canEditData) {
            return;
        }
        const block = parseClipboard(text);
        if (!block.length) {
            return;
        }
        const order = range.columnOrder();
        const columnsInOrder = order.map(colId => columnByKey.get(colId)).filter((c): c is ColumnDef => Boolean(c));
        const startCol = order.indexOf(area.colIds[0]);
        const rowsInOrder: RowRecord[] = [];
        const api = apiRef.current;
        const count = api?.getDisplayedRowCount() ?? 0;
        for (let i = area.top; i < count; i++) {
            const row = rowAt(i);
            if (row) {
                rowsInOrder.push(row);
            }
        }
        // A single value pasted on a range fills the range.
        const singleOnRange =
            block.length === 1 && block[0].length === 1 && (area.bottom > area.top || area.colIds.length > 1);
        const effective = singleOnRange
            ? Array.from({ length: area.bottom - area.top + 1 }, () => area.colIds.map(() => block[0][0]))
            : block;
        const plan = planPasteBlock(effective, rowsInOrder, columnsInOrder, 0, startCol, {
            addRows: canAddRows && !serverMode,
            canEdit: column => canEditColumn(column)
        });
        const run = (withColumns: boolean): void => {
            const ops: ChangeOp[] = [];
            Object.entries(plan.newOptions).forEach(([col, options]) => {
                const column = columnByKey.get(col);
                if (column && !isStaticId(col)) {
                    ops.push({ op: "updateColumn", col, patch: { options: [...column.options, ...options] } });
                }
            });
            const staticWrites = plan.cells.filter(cell => isStaticId(cell.col));
            plan.cells.filter(cell => !isStaticId(cell.col)).forEach(cell => ops.push({ op: "setCell", ...cell }));
            let addedColumns: ColumnDef[] = [];
            if (withColumns && plan.extraColumns > 0 && canEditStructure) {
                addedColumns = Array.from({ length: plan.extraColumns }, (_, i) => ({
                    ...blankColumn(
                        newKey(),
                        fill(texts.textNewColumn, { number: modelRef.current.columns.length + i + 1 })
                    )
                }));
                addedColumns.forEach((column, i) =>
                    ops.push({ op: "addColumn", col: payloadFromColumn(column, modelRef.current.columns.length + i) })
                );
                const width = columnsInOrder.length - startCol;
                effective.forEach((line, r) => {
                    const target = rowsInOrder[r];
                    line.slice(width).forEach((text, c) => {
                        if (target && text !== "") {
                            ops.push({ op: "setCell", row: target.key, col: addedColumns[c].key, value: text });
                        }
                    });
                });
            }
            plan.newRows.forEach((values, i) => {
                const r = rowsInOrder.length + i;
                const extra: Record<string, CellValue> = {};
                if (addedColumns.length) {
                    const width = columnsInOrder.length - startCol;
                    effective[r]?.slice(width).forEach((text, c) => {
                        if (text !== "") {
                            extra[addedColumns[c].key] = text;
                        }
                    });
                }
                ops.push({
                    op: "addRow",
                    row: newKey(),
                    index: modelRef.current.rows.length + i,
                    values: { ...newRowValues(), ...values, ...extra }
                });
            });
            staticWrites.forEach(cell => writeStatic(cell.row, cell.col, cell.value));
            const cellCount = plan.cells.length + plan.newRows.reduce((n, v) => n + Object.keys(v).length, 0);
            apply(ops, fill(texts.textPasted, { count: cellCount }));
            toast({ text: fill(texts.textPasted, { count: cellCount }) }, 2500);
        };
        if (plan.extraColumns > 0 && canEditStructure) {
            setConfirm({
                title: texts.textPaste,
                text: fill(texts.textPasteAddColumns, { count: plan.extraColumns }),
                confirm: texts.textAddColumns,
                run: () => run(true),
                secondary: { label: texts.textIgnore, run: () => run(false) }
            });
        } else {
            run(false);
        }
    };

    const clearSelection = (): void => {
        const area = focusedOrRange();
        if (!area) {
            return;
        }
        const writes: Array<{ row: string; col: string; value: CellValue }> = [];
        for (let r = area.top; r <= area.bottom; r++) {
            const row = rowAt(r);
            area.colIds.forEach(colId => {
                if (row && canEditCell(row.key, colId) && !isEmpty(row.values[colId])) {
                    writes.push({ row: row.key, col: colId, value: null });
                }
            });
        }
        setCells(writes);
    };

    // Copy / paste events on the grid root.
    useEffect(() => {
        const root = rootRef.current;
        if (!root) {
            return;
        }
        const editing = (): boolean => (apiRef.current?.getEditingCells().length ?? 0) > 0;
        const typing = (target: EventTarget | null): boolean => {
            const element = target as HTMLElement | null;
            return (
                Boolean(element?.closest?.("input, textarea, select, [contenteditable=true]")) &&
                !element?.classList.contains("mxt-dg-checkbox")
            );
        };
        const onCopy = (event: ClipboardEvent): void => {
            if (editing() || typing(event.target)) {
                return;
            }
            const text = copySelection();
            if (text !== undefined) {
                event.preventDefault();
                event.clipboardData?.setData("text/plain", text);
            }
        };
        const onPaste = (event: ClipboardEvent): void => {
            if (editing() || typing(event.target)) {
                return;
            }
            const text = event.clipboardData?.getData("text/plain");
            if (text) {
                event.preventDefault();
                pasteText(text);
            }
        };
        root.addEventListener("copy", onCopy);
        root.addEventListener("paste", onPaste);
        return () => {
            root.removeEventListener("copy", onCopy);
            root.removeEventListener("paste", onPaste);
        };
    });

    // ---- Keyboard shortcuts --------------------------------------------------------------------------------------
    const searchRef = useRef<HTMLInputElement>(null);
    const lastEnterAt = useRef(0);
    // The key that ended an edit: tracked in the window capture phase, before AG Grid handles it.
    useEffect(() => {
        const onKey = (event: KeyboardEvent): void => {
            if (rootRef.current?.contains(event.target as Node)) {
                if (event.key === "Enter" && !event.shiftKey && !event.altKey) {
                    lastEnterAt.current = Date.now();
                }
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, []);
    const onRootKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
        const target = event.target as HTMLElement;
        const inField =
            Boolean(target.closest("input, textarea, select")) && !target.classList.contains("mxt-dg-checkbox");
        const mod = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();
        if (mod && key === "s") {
            event.preventDefault();
            apiRef.current?.stopEditing();
            queue.save();
            return;
        }
        if (inField || (apiRef.current?.getEditingCells().length ?? 0) > 0) {
            return;
        }
        if (mod && key === "z" && !event.shiftKey) {
            event.preventDefault();
            undo();
        } else if (mod && (key === "y" || (key === "z" && event.shiftKey))) {
            event.preventDefault();
            redo();
        } else if (mod && key === "d") {
            event.preventDefault();
            const current = range.normalized();
            if (current) {
                applyFill(planFillDown(current, (r, c) => rowAt(r)?.values[c]));
            }
        } else if (mod && key === "k" && props.showCommandPalette !== false) {
            event.preventDefault();
            setPaletteOpen(true);
        } else if (mod && key === "h" && canEditData) {
            event.preventDefault();
            setFindOpen(true);
        } else if (mod && key === "f" && props.showSearch) {
            event.preventDefault();
            searchRef.current?.focus();
        } else if (mod && key === "enter") {
            event.preventDefault();
            const focused = apiRef.current?.getFocusedCell();
            const row = focused && focused.rowIndex !== null ? rowAt(focused.rowIndex) : undefined;
            if (row) {
                setRecordKey(row.key);
            }
        } else if ((event.key === "Delete" || event.key === "Backspace") && !mod) {
            if (range.cellCount > 1) {
                event.preventDefault();
                clearSelection();
            }
        } else if (event.key === "?" && props.showKeyboardHelp) {
            event.preventDefault();
            setHelpOpen(true);
        } else if (event.shiftKey && event.key.startsWith("Arrow") && props.rangeSelection) {
            const focused = apiRef.current?.getFocusedCell();
            if (!focused || focused.rowIndex === null) {
                return;
            }
            const colId = focused.column.getColId();
            const current = range.range ?? {
                start: { rowIndex: focused.rowIndex, colId },
                end: { rowIndex: focused.rowIndex, colId }
            };
            const order = range.columnOrder();
            let { rowIndex, colId: endCol } = current.end;
            let ci = order.indexOf(endCol);
            if (event.key === "ArrowUp") {
                rowIndex = Math.max(0, rowIndex - 1);
            } else if (event.key === "ArrowDown") {
                rowIndex = Math.min((apiRef.current?.getDisplayedRowCount() ?? 1) - 1, rowIndex + 1);
            } else if (event.key === "ArrowLeft") {
                ci = Math.max(0, ci - 1);
            } else {
                ci = Math.min(order.length - 1, ci + 1);
            }
            endCol = order[ci] ?? endCol;
            event.preventDefault();
            event.stopPropagation();
            range.setRange({ start: current.start, end: { rowIndex, colId: endCol } });
        }
    };

    const onCellEditingStopped = useCallback(
        (event: CellEditingStoppedEvent<GridItem>) => {
            const wasEnter = Date.now() - lastEnterAt.current < 400;
            lastEnterAt.current = 0;
            if (!props.enterAddsRow || !wasEnter || serverMode || !canAddRows) {
                return;
            }
            const count = apiRef.current?.getDisplayedRowCount() ?? 0;
            if (event.rowIndex === count - 1 && event.data?.row) {
                // Outside AG Grid's editing lifecycle (React would warn about flushSync).
                window.setTimeout(() => {
                    apiRef.current?.clearFocusedCell();
                    addRow(undefined, undefined, true);
                }, 0);
            }
        },
        [props.enterAddsRow, serverMode, canAddRows, addRow]
    );

    // ---- Selection ------------------------------------------------------------------------------------------------
    const selectionProp = props.selection;
    const selectionMode = selectionProp?.type;
    const selectingFromMendix = useRef(false);
    const [selectedCount, setSelectedCount] = useState(0);
    const rowSelection = useMemo((): RowSelectionOptions<GridItem> | undefined => {
        if (!selectionMode) {
            return props.showCheckboxes && canDeleteRows
                ? {
                      mode: "multiRow",
                      checkboxes: !hoverCheckbox,
                      headerCheckbox: !hoverCheckbox,
                      enableClickSelection: false,
                      selectAll: "filtered",
                      isRowSelectable: node => Boolean(node.data?.row)
                  }
                : undefined;
        }
        return selectionMode === "Multi"
            ? {
                  mode: "multiRow",
                  checkboxes: props.showCheckboxes && !hoverCheckbox,
                  headerCheckbox: props.showCheckboxes && !hoverCheckbox,
                  enableClickSelection: !props.showCheckboxes,
                  selectAll: props.selectAllPages ? "filtered" : "currentPage",
                  isRowSelectable: node => Boolean(node.data?.row)
              }
            : {
                  mode: "singleRow",
                  checkboxes: props.showCheckboxes,
                  enableClickSelection: true,
                  isRowSelectable: node => Boolean(node.data?.row)
              };
    }, [selectionMode, props.showCheckboxes, props.selectAllPages, canDeleteRows, hoverCheckbox]);

    const onSelectionChanged = useCallback(
        (event: SelectionChangedEvent<GridItem>) => {
            const nodes = event.api.getSelectedNodes();
            setSelectedCount(nodes.length);
            if (selectingFromMendix.current || !selectionProp || event.source === "api") {
                return;
            }
            const selectedItems = nodes
                .map(node => (node.data?.row?.itemId ? itemById.get(node.data.row.itemId) : undefined))
                .filter((item): item is ObjectItem => Boolean(item));
            if (selectionProp.type === "Multi") {
                selectionProp.setSelection(selectedItems);
            } else {
                selectionProp.setSelection(selectedItems[0]);
            }
        },
        [selectionProp, itemById]
    );

    // Mendix -> grid selection.
    useEffect(() => {
        const api = apiRef.current;
        if (!api || !selectionProp) {
            return;
        }
        const wanted = new Set(
            selectionProp.type === "Multi"
                ? selectionProp.selection.map(item => String(item.id))
                : selectionProp.selection
                ? [String(selectionProp.selection.id)]
                : []
        );
        const select: Array<IRowNode<GridItem>> = [];
        const deselect: Array<IRowNode<GridItem>> = [];
        api.forEachNode(node => {
            const id = node.data?.row?.itemId;
            const should = Boolean(id && wanted.has(id));
            if (should !== Boolean(node.isSelected())) {
                (should ? select : deselect).push(node);
            }
        });
        if (select.length || deselect.length) {
            selectingFromMendix.current = true;
            if (select.length) {
                api.setNodesSelected({ nodes: select, newValue: true, source: "api" });
            }
            if (deselect.length) {
                api.setNodesSelected({ nodes: deselect, newValue: false, source: "api" });
            }
            selectingFromMendix.current = false;
        }
    }, [selectionProp, rowData]);

    const selectedRowKeys = (): string[] =>
        (apiRef.current?.getSelectedNodes() ?? [])
            .map(node => node.data?.row?.key)
            .filter((k): k is string => Boolean(k));

    // ---- Row click, context menu, drag -----------------------------------------------------------------------------
    const onRowClicked = useCallback(
        (event: RowClickedEvent<GridItem>) => {
            const row = event.data?.row;
            const action = propsRef.current.onRowClick;
            const target = (event.event?.target as HTMLElement | null) ?? null;
            if (
                !row?.itemId ||
                !action ||
                target?.closest(".ag-selection-checkbox, button, a, input, .mxt-dg-rownum")
            ) {
                return;
            }
            const item = itemById.get(row.itemId);
            const value = item ? action.get(item) : undefined;
            if (value?.canExecute && !value.isExecuting) {
                value.execute();
            }
        },
        [itemById]
    );

    const onCellContextMenu = useCallback((event: CellContextMenuEvent<GridItem>) => {
        const row = event.data?.row;
        const mouse = event.event as MouseEvent | undefined;
        if (!row || !mouse) {
            return;
        }
        mouse.preventDefault();
        setRowMenu({
            rowKey: row.key,
            anchor: pointAnchor(mouse.clientX, mouse.clientY),
            colId: event.column?.getColId()
        });
    }, []);

    const onRowDragEnd = useCallback(
        (event: RowDragEndEvent<GridItem>) => {
            const row = event.node.data?.row;
            if (!row || event.overIndex < 0 || lockedRows.has(row.key)) {
                return;
            }
            const target = rowAt(event.overIndex);
            const to = target
                ? modelRef.current.rows.findIndex(r => r.key === target.key)
                : modelRef.current.rows.length - 1;
            const from = modelRef.current.rows.findIndex(r => r.key === row.key);
            if (to >= 0 && from !== to) {
                apply([{ op: "moveRow", row: row.key, index: to }], "move row");
            }
        },
        [apply, rowAt, lockedRows]
    );

    // ---- Column move / resize -----------------------------------------------------------------------------------
    const onColumnMoved = useCallback(
        (event: ColumnMovedEvent<GridItem>) => {
            if (!event.finished || event.source !== "uiColumnMoved" || !event.column) {
                return;
            }
            const ids = event.api
                .getAllGridColumns()
                .map(column => column.getColId())
                .filter(id => columnByKey.has(id));
            const moved = event.column.getColId();
            if (canEditStructure && !isStaticId(moved)) {
                const dynamicIds = ids.filter(id => !isStaticId(id));
                const index = dynamicIds.indexOf(moved);
                const current = modelRef.current.columns.findIndex(c => c.key === moved);
                if (index >= 0 && index !== current) {
                    apply([{ op: "moveColumn", col: moved, index }], "move field");
                }
                setView(previous => ({ ...previous, order: undefined }));
            } else {
                setView(previous => ({ ...previous, order: ids }));
            }
        },
        [columnByKey, canEditStructure, apply, setView]
    );

    const onColumnResized = useCallback(
        (event: ColumnResizedEvent<GridItem>) => {
            if (!event.finished || event.source !== "uiColumnResized") {
                return;
            }
            (event.columns ?? []).forEach(column => {
                const id = column.getColId();
                if (columnByKey.has(id)) {
                    setColumnView(id, { width: column.getActualWidth() });
                }
            });
        },
        [columnByKey, setColumnView]
    );

    // ---- Flash changed cells after each update ---------------------------------------------------------------------
    useEffect(() => {
        const api = apiRef.current;
        if (!api || !flashQueue.current.length || motion === "off") {
            flashQueue.current = [];
            return;
        }
        const pending = flashQueue.current;
        flashQueue.current = [];
        const byRow = new Map<string, string[]>();
        pending.forEach(cell => byRow.set(cell.row, [...(byRow.get(cell.row) ?? []), cell.col]));
        if (pending.length > 400) {
            return;
        }
        byRow.forEach((cols, rowKey) => {
            const node = api.getRowNode(rowKey);
            if (node) {
                api.flashCells({
                    rowNodes: [node],
                    columns: cols,
                    flashDuration: motion === "subtle" ? 250 : 500,
                    fadeDuration: motion === "subtle" ? 400 : 900
                });
            }
        });
    }, [rowData, motion]);

    useEffect(() => {
        range.schedulePaint();
    }, [rowData, range]);

    const rowClassRules = useMemo(
        () => ({
            "mxt-dg-row--new": (params: RowClassParams<GridItem>) => {
                const key = params.data?.row?.key;
                const at = key ? recentRows.current.get(key) : undefined;
                return at !== undefined && Date.now() - at < 1200;
            },
            "mxt-dg-row--pending": (params: RowClassParams<GridItem>) => Boolean(params.data?.row?.pending),
            "mxt-dg-row--locked": (params: RowClassParams<GridItem>) =>
                Boolean(params.data?.row && lockedRows.has(params.data.row.key)),
            "mxt-dg-row--updated": (params: RowClassParams<GridItem>) =>
                Boolean(params.data?.row && updatedRows.has(params.data.row.key)),
            "mxt-dg-row--invalid": (params: RowClassParams<GridItem>) =>
                Boolean(params.data?.row && server.cells.has(issueKey(params.data.row.key, "*")))
        }),
        [server, lockedRows, updatedRows]
    );
    const colorSetting = view.color;
    const getRowStyle = useCallback(
        (params: RowClassParams<GridItem>) => {
            const row = params.data?.row;
            const color = row ? rowColor(row, modelRef.current.columns, colorSetting) : undefined;
            if (!color) {
                return undefined;
            }
            const style: Record<string, string> = dark
                ? { boxShadow: `inset 4px 0 0 ${color}` }
                : { backgroundColor: color, boxShadow: `inset 4px 0 0 color-mix(in srgb, ${color} 60%, #000)` };
            return style;
        },
        [colorSetting, dark]
    );
    const getRowClass = useCallback(
        (params: RowClassParams<GridItem>) => {
            const expression = propsRef.current.rowClass;
            const itemId = params.data?.row?.itemId;
            const item = itemId ? itemById.get(itemId) : undefined;
            return item && expression ? expression.get(item).value ?? undefined : undefined;
        },
        [itemById]
    );

    // ---- Theme -----------------------------------------------------------------------------------------------
    const accent = props.accentColor?.trim() || "#264AE5";
    const theme = useMemo(
        () =>
            themeQuartz.withPart(dark ? colorSchemeDark : colorSchemeLight).withParams({
                accentColor: accent,
                fontFamily: "inherit",
                fontSize: 14,
                headerFontWeight: 600,
                rowHeight: ROW_HEIGHTS[rowLevel],
                headerHeight: props.showHeaderFilters ? HEADER_HEIGHT[density].filters : HEADER_HEIGHT[density].plain,
                spacing: density === "compact" ? 5 : density === "comfortable" ? 9 : 7,
                cellHorizontalPadding: density === "compact" ? 10 : 14,
                wrapperBorderRadius: 8,
                wrapperBorder: true,
                columnBorder: { color: dark ? "#2b303a" : "#eceef2" },
                headerColumnBorder: false,
                headerColumnResizeHandleColor: dark ? "#4a5060" : "#ced0d3",
                headerColumnResizeHandleHeight: "30%",
                headerRowBorder: true,
                rowBorder: true,
                pinnedRowBorder: true,
                iconSize: 14,
                ...(dark
                    ? {
                          backgroundColor: "#1d2027",
                          headerBackgroundColor: "#1d2027",
                          foregroundColor: "#e6e8ee",
                          borderColor: "#353a46",
                          oddRowBackgroundColor: "#1d2027",
                          rowHoverColor: "#262b35",
                          selectedRowBackgroundColor: "#262f52",
                          headerTextColor: "#e6e8ee"
                      }
                    : {
                          backgroundColor: "#ffffff",
                          headerBackgroundColor: "#ffffff",
                          foregroundColor: "#0a1325",
                          borderColor: "#ced0d3",
                          oddRowBackgroundColor: "#ffffff",
                          rowHoverColor: "#f5f6f6",
                          selectedRowBackgroundColor: "#e6eaff",
                          headerTextColor: "#0a1325"
                      })
            }),
        [dark, accent, density, rowLevel, props.showHeaderFilters]
    );

    // ---- Export ----------------------------------------------------------------------------------------------
    const exportFormats: ExportFormat[] =
        props.exportFormats === "both"
            ? ["xlsx", "csv"]
            : props.exportFormats === "excel"
            ? ["xlsx"]
            : props.exportFormats === "csv"
            ? ["csv"]
            : [];
    const exportAbort = useRef(false);

    /** Server mode: pages through the rows source and returns all matching rows. */
    const fetchAllServerRows = async (onProgress: (n: number) => void): Promise<RowRecord[] | undefined> => {
        const ds = propsRef.current.rowsSource;
        const original = { offset: ds.offset, limit: ds.limit };
        const collected: RowRecord[] = [];
        const waitFor = (offset: number): Promise<void> =>
            new Promise(resolve => {
                const started = Date.now();
                const check = (): void => {
                    const current = propsRef.current.rowsSource;
                    if (
                        (current.status === ValueStatus.Available && current.offset === offset) ||
                        Date.now() - started > 15000
                    ) {
                        resolve();
                    } else {
                        window.setTimeout(check, 40);
                    }
                };
                window.setTimeout(check, 40);
            });
        try {
            for (let offset = 0; offset < EXPORT_LIMIT; offset += EXPORT_PAGE) {
                if (exportAbort.current) {
                    return undefined;
                }
                if (viewStateAttr) {
                    viewStateAttr.setValue(buildServerViewState({ search, sort, filters, offset, limit: EXPORT_PAGE }));
                    ds.reload();
                    await waitFor(ds.offset);
                } else {
                    propsRef.current.rowsSource.setOffset(offset);
                    propsRef.current.rowsSource.setLimit(EXPORT_PAGE);
                    await waitFor(offset);
                }
                const pageItems = propsRef.current.rowsSource.items ?? [];
                const rows = computeFormulas(readRows(pageItems, propsRef.current, false), modelRef.current.columns);
                collected.push(...rows);
                onProgress(collected.length);
                if (pageItems.length < EXPORT_PAGE) {
                    break;
                }
            }
            return collected;
        } finally {
            if (viewStateAttr) {
                lastViewJson.current = "";
            }
            propsRef.current.rowsSource.setOffset(original.offset);
            propsRef.current.rowsSource.setLimit(original.limit);
        }
    };

    const runExport = async (choice: ExportChoice): Promise<void> => {
        setExportOpen(false);
        const before = propsRef.current.beforeExport;
        if (before?.canExecute) {
            before.execute();
        }
        const api = apiRef.current;
        const gridOrder = api
            ? api
                  .getAllGridColumns()
                  .map(column => column.getColId())
                  .filter(id => columnByKey.has(id))
            : allColumns.map(c => c.key);
        const exportColumns: ExportColumn[] = gridOrder
            .map(id => columnByKey.get(id) as ColumnDef)
            .filter(column => {
                const config = isStaticId(column.key) ? props.staticColumns[staticIndex(column.key)] : undefined;
                return config?.staticType !== "customContent" && (choice.columns === "all" || !isHidden(column));
            })
            .map(column => ({
                ...column,
                gridWidth: api?.getColumn(column.key)?.getActualWidth(),
                pinnedLeft: (view.columns[column.key]?.pinned ?? column.pinned) === "left"
            }));
        let rows: DisplayRow[];
        if (choice.rows === "selected") {
            const keys = new Set(selectedRowKeys());
            rows = filteredRows.filter(row => keys.has(row.key)).map(row => ({ kind: "data", row, level: 0 }));
        } else if (serverMode) {
            exportAbort.current = false;
            const id = toast({
                text: fill(texts.textExporting, { count: 0 }),
                sticky: true,
                progress: 0,
                onCancel: () => (exportAbort.current = true)
            });
            const all = await fetchAllServerRows(n =>
                setToasts(list =>
                    list.map(t =>
                        t.id === id
                            ? {
                                  ...t,
                                  text: fill(texts.textExporting, { count: n }),
                                  progress: Math.min(1, n / Math.max(1, totalRows))
                              }
                            : t
                    )
                )
            );
            dismissToast(id);
            if (!all) {
                return;
            }
            rows = all.map(row => ({ kind: "data", row, level: 0 }));
        } else if (choice.rows === "all") {
            rows = groupRows(
                sortRows(computedRows, allColumns, sort),
                allColumns,
                groupBy,
                new Set(),
                sort,
                aggregates,
                texts.textEmpty
            );
        } else {
            rows = groupRows(filteredRows, allColumns, groupBy, new Set(), sort, aggregates, texts.textEmpty);
        }
        const base = safeFileName(expandTokens(props.exportFileName || "export-[date]"));
        if (choice.format === "xlsx") {
            const now = new Date();
            const bytes = buildXlsxExport(exportColumns, rows, {
                sheetName: expandTokens(props.exportSheetName || "Data", now),
                title: props.exportTitle?.value || undefined,
                exportedAt: now.toLocaleString(),
                escapeFormulas: props.csvEscapeFormulas,
                colors: choice.keepColors ? { row: view.color, formats: view.formats, ranges, accent } : undefined
            });
            downloadFile(bytes, `${base}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        } else {
            const delimiter = props.csvDelimiter === "semicolon" ? ";" : props.csvDelimiter === "tab" ? "\t" : ",";
            const text = buildCsvExport(exportColumns, rows, {
                delimiter,
                bom: props.csvBom,
                dates: props.csvDates,
                escapeFormulas: props.csvEscapeFormulas
            });
            downloadFile(new TextEncoder().encode(text), `${base}.csv`, "text/csv;charset=utf-8");
        }
        const after = propsRef.current.afterExport;
        if (after?.canExecute) {
            after.execute();
        }
    };

    // ---- Import -----------------------------------------------------------------------------------------------
    const runImport = (result: ImportResult): void => {
        setImportOpen(false);
        const ops: ChangeOp[] = [];
        let index = modelRef.current.columns.length;
        result.newColumns.forEach(column => ops.push({ op: "addColumn", col: payloadFromColumn(column, index++) }));
        result.optionUpdates.forEach(update =>
            ops.push({ op: "updateColumn", col: update.col, patch: { options: update.options } })
        );
        result.rows.forEach((values, i) =>
            ops.push({
                op: "addRow",
                row: newKey(),
                index: modelRef.current.rows.length + i,
                values: { ...newRowValues(), ...values }
            })
        );
        apply(ops, fill(texts.textImportDone, { count: result.rows.length }));
        toast({ text: fill(texts.textImportDone, { count: result.rows.length }), tone: "success" });
    };

    // ---- Views (saved) --------------------------------------------------------------------------------------------
    const viewsDoc: ViewsDocument = useMemo(() => parseViews(props.views?.value), [props.views?.value]);
    const visibleViewsForPalette = visibleViews(viewsDoc, props.viewOwner?.value);
    const saveViewsDoc = (doc: ViewsDocument): void => {
        const attribute = propsRef.current.views;
        if (!attribute || attribute.readOnly) {
            return;
        }
        attribute.setValue(JSON.stringify(doc));
        const action = propsRef.current.onViewsChange;
        if (action?.canExecute) {
            action.execute();
        }
    };

    // ---- Menus ---------------------------------------------------------------------------------------------------
    const columnMenuItems = (colId: string): MenuItem[] => {
        const column = columnByKey.get(colId);
        if (!column) {
            return [];
        }
        const index = modelRef.current.columns.findIndex(c => c.key === colId);
        const pinned = view.columns[colId]?.pinned !== undefined ? view.columns[colId]?.pinned : column.pinned;
        const anchor = columnMenu?.anchor ?? pointAnchor(0, 0);
        const structure = canEditStructure && !isStaticId(colId);
        const items: MenuItem[] = [];
        if (structure) {
            items.push(
                {
                    id: "edit",
                    label: texts.textEditField,
                    icon: "pencil",
                    onSelect: () => setColumnEditor({ anchor, colId })
                },
                {
                    id: "rename",
                    label: texts.textRename,
                    icon: "text",
                    onSelect: () => {
                        const header = rootRef.current?.querySelector(
                            `.mxt-dg-header[data-col="${CSS.escape(colId)}"] .mxt-dg-header__caption`
                        );
                        header?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
                    }
                },
                {
                    id: "type",
                    label: texts.textChangeType,
                    icon: typeInfo(column.type).icon,
                    onSelect: () => setColumnEditor({ anchor, colId, focusType: true })
                },
                { id: "duplicate", label: texts.textDuplicate, icon: "copy", onSelect: () => duplicateColumn(colId) },
                {
                    id: "insertLeft",
                    label: texts.textInsertLeft,
                    icon: "chevronLeft",
                    onSelect: () => setColumnEditor({ anchor, index })
                },
                {
                    id: "insertRight",
                    label: texts.textInsertRight,
                    icon: "chevronRight",
                    onSelect: () => setColumnEditor({ anchor, index: index + 1 })
                },
                { id: "sep1", label: "", separator: true }
            );
        }
        items.push(
            { id: "sortAsc", label: texts.textSortAsc, icon: "sortAsc", onSelect: () => setSort(colId, false, "asc") },
            {
                id: "sortDesc",
                label: texts.textSortDesc,
                icon: "sortDesc",
                onSelect: () => setSort(colId, false, "desc")
            }
        );
        if (sort.some(entry => entry.col === colId)) {
            items.push({
                id: "clearSort",
                label: texts.textClearSort,
                icon: "close",
                onSelect: () => setSort(colId, true, null)
            });
        }
        if (isActiveFilter(filters[colId])) {
            items.push({
                id: "clearFilter",
                label: `${texts.textClearFilter} (${texts.textFilter})`,
                icon: "filter",
                onSelect: () => setFilter(colId, undefined)
            });
        }
        if (props.enableGrouping && !serverMode) {
            items.push({
                id: "group",
                label: groupBy.includes(colId) ? texts.textUngroup : texts.textGroupByColumn,
                icon: "group",
                onSelect: () => toggleGroupBy(colId)
            });
        }
        items.push(
            { id: "sep2", label: "", separator: true },
            pinned === "left"
                ? {
                      id: "unpin",
                      label: texts.textUnpin,
                      icon: "pin",
                      onSelect: () => setColumnView(colId, { pinned: null })
                  }
                : {
                      id: "pinLeft",
                      label: texts.textPinLeft,
                      icon: "pin",
                      onSelect: () => setColumnView(colId, { pinned: "left" })
                  },
            pinned === "right"
                ? {
                      id: "unpinRight",
                      label: texts.textUnpin,
                      icon: "pin",
                      onSelect: () => setColumnView(colId, { pinned: null })
                  }
                : {
                      id: "pinRight",
                      label: texts.textPinRight,
                      icon: "pin",
                      onSelect: () => setColumnView(colId, { pinned: "right" })
                  },
            {
                id: "freeze",
                label: texts.textFreezeHere,
                icon: "pin",
                onSelect: () => {
                    const ids = (apiRef.current?.getAllDisplayedColumns() ?? [])
                        .map(c => c.getColId())
                        .filter(id => columnByKey.has(id));
                    const upTo = ids.indexOf(colId);
                    setView(previous => {
                        const columns = { ...previous.columns };
                        ids.forEach((id, index) => {
                            columns[id] = { ...columns[id], pinned: index <= upTo ? "left" : null };
                        });
                        return { ...previous, columns };
                    });
                }
            },
            ...(props.showViewBar && props.showFilterButton !== false
                ? [
                      {
                          id: "filterBy",
                          label: texts.textFilterByField,
                          icon: "filter",
                          onSelect: () => {
                              const base = view.rules ?? emptyRules();
                              setView(previous => ({
                                  ...previous,
                                  rules: {
                                      ...base,
                                      conditions: [
                                          ...base.conditions,
                                          { col: colId, op: operatorsFor(column)[0], value: null }
                                      ]
                                  }
                              }));
                              setViewBarRequest({ id: "filter", nonce: Date.now() });
                          }
                      }
                  ]
                : []),
            {
                id: "autosize",
                label: texts.textAutoSize,
                icon: "resize",
                onSelect: () => apiRef.current?.autoSizeColumns([colId])
            },
            {
                id: "hide",
                label: texts.textHide,
                icon: "eyeOff",
                onSelect: () => setColumnView(colId, { hidden: true })
            },
            { id: "format", label: texts.textFormatting, icon: "palette", onSelect: () => setFormatCol(colId) }
        );
        if (structure) {
            items.push(
                { id: "sep3", label: "", separator: true },
                {
                    id: "delete",
                    label: texts.textDelete,
                    icon: "trash",
                    danger: true,
                    onSelect: () => deleteColumn(colId)
                }
            );
        }
        return items;
    };

    const rowMenuItems = (rowKey: string): MenuItem[] => {
        const index = modelRef.current.rows.findIndex(r => r.key === rowKey);
        const selected = selectedRowKeys();
        const targets = selected.includes(rowKey) && selected.length > 1 ? selected : [rowKey];
        const items: MenuItem[] = [
            ...(commentsEnabled
                ? [
                      {
                          id: "comments",
                          label: texts.textComments,
                          icon: "comment",
                          onSelect: () => {
                              const col = rowMenu?.colId && columnByKey.has(rowMenu.colId) ? rowMenu.colId : null;
                              setCommentsAt({ row: rowKey, col, anchor: rowMenu?.anchor ?? pointAnchor(200, 200) });
                          }
                      }
                  ]
                : []),
            {
                id: "expand",
                label: texts.textExpandRow,
                icon: "expand",
                shortcut: "Ctrl+Enter",
                onSelect: () => setRecordKey(rowKey)
            },
            {
                id: "copy",
                label: texts.textCopyCells,
                icon: "copy",
                shortcut: "Ctrl+C",
                onSelect: () => {
                    const text = copySelection();
                    if (text !== undefined) {
                        navigator.clipboard?.writeText(text).catch(() => undefined);
                    }
                }
            }
        ];
        if (canAddRows && !serverMode) {
            items.push(
                { id: "sep", label: "", separator: true },
                { id: "above", label: texts.textInsertAbove, icon: "plus", onSelect: () => addRow(Math.max(0, index)) },
                { id: "below", label: texts.textInsertBelow, icon: "plus", onSelect: () => addRow(index + 1) },
                { id: "dup", label: texts.textDuplicateRow, icon: "copy", onSelect: () => duplicateRow(rowKey) }
            );
        }
        if (canDeleteRows) {
            items.push(
                { id: "sep2", label: "", separator: true },
                {
                    id: "delete",
                    label:
                        targets.length > 1
                            ? fill(texts.textDeleteRows, { count: targets.length })
                            : texts.textDeleteRow,
                    icon: "trash",
                    danger: true,
                    onSelect: () => deleteRows(targets)
                }
            );
        }
        return items;
    };

    // ---- Grid ready / pagination ------------------------------------------------------------------------------
    const onGridReady = useCallback((event: GridReadyEvent<GridItem>) => {
        apiRef.current = event.api;
    }, []);
    const clientButtons = !serverMode && props.pagination === "buttons";
    useEffect(() => {
        const api = apiRef.current;
        if (api && clientButtons) {
            api.paginationGoToPage(page);
        }
    }, [page, clientButtons, rowData]);

    // Server virtual scrolling: load more when the last rows are rendered.
    const onBodyScrollEnd = useCallback(() => {
        const api = apiRef.current;
        if (!api || !serverMode || props.pagination !== "virtualScrolling") {
            return;
        }
        const last = api.getLastDisplayedRowIndex();
        if (
            last >= api.getDisplayedRowCount() - 5 &&
            items.length < totalRows &&
            rowsSource.status === ValueStatus.Available
        ) {
            setLoadedLimit(limit => limit + pageSize);
        }
    }, [serverMode, props.pagination, items.length, totalRows, rowsSource.status, pageSize]);

    // ---- Render ------------------------------------------------------------------------------------------------
    const status = queue.status;
    const dirty = queue.dirtyCount;
    const saveState = editingConfigured ? (
        <span className={`mxt-dg-savestate mxt-dg-savestate--${status}`} data-save-state={status}>
            {status === "saving" ? (
                <>
                    <span className="mxt-dg-spinner" aria-hidden /> {texts.textSaving}
                </>
            ) : status === "error" ? (
                <>
                    <Icon name="warning" size={13} />{" "}
                    {fill(texts.textSaveFailed, {
                        message:
                            queue.errors
                                .filter(e => !e.row)
                                .map(e => e.message)
                                .join("; ") || `${queue.errors.length}`
                    })}
                    <button type="button" className="mxt-dg-linkbtn" data-action="retry" onClick={() => queue.save()}>
                        {texts.textRetry}
                    </button>
                </>
            ) : dirty > 0 ? (
                <>{fill(texts.textUnsaved, { count: dirty })}</>
            ) : status === "saved" ? (
                <>
                    <Icon name="check" size={13} /> {texts.textSaved}
                </>
            ) : null}
        </span>
    ) : null;

    const recordRows = dataRowsInOrder;
    const recordIndex = recordKey ? recordRows.findIndex(row => row.key === recordKey) : -1;
    const recordRow =
        recordIndex >= 0
            ? recordRows[recordIndex]
            : recordKey
            ? computedRows.find(r => r.key === recordKey)
            : undefined;
    const editingColumn = columnEditor?.colId ? columnByKey.get(columnEditor.colId) : undefined;
    const themeClass = classNames("mxt-dg-theme", { "mxt-dg--dark": dark, [`mxt-dg--motion-${motion}`]: true });
    // ---- 1.1 view bar, view tabs, empty states ----------------------------------------------------------------
    const rules: RuleSet = view.rules ?? emptyRules();
    const viewType = view.viewType ?? "grid";
    const setRules = (next: RuleSet): void => {
        setView(previous => ({ ...previous, rules: next }));
        setPage(0);
    };
    const fieldColumns = allColumns.filter(
        column =>
            !(isStaticId(column.key) && props.staticColumns[staticIndex(column.key)]?.staticType === "customContent")
    );
    const hiddenCount = allColumns.filter(isHidden).length;
    const ruleCount = activeRuleCount(view.rules) + Object.keys(filters).length;
    const plural = (n: number, one: string): string => `${one} (${n})`;
    const allViewButtons: ViewBarButton[] = [
        {
            id: "hide",
            icon: "eyeOff",
            label: texts.textHideFields,
            count: hiddenCount,
            activeLabel: plural(hiddenCount, texts.textHideFields),
            width: 300,
            panel: () => (
                <HideFieldsPanel
                    texts={texts}
                    columns={allColumns}
                    isHidden={isHidden}
                    canReorder={canEditStructure}
                    onToggle={(key, hidden) => setColumnView(key, { hidden })}
                    onAll={hidden =>
                        setView(previous => {
                            const columns = { ...previous.columns };
                            allColumns.forEach((column, index) => {
                                // Keep the first field visible when hiding all, like Airtable.
                                columns[column.key] = { ...columns[column.key], hidden: hidden && index > 0 };
                            });
                            return { ...previous, columns };
                        })
                    }
                    onMove={(key, toKey) => {
                        const to = modelRef.current.columns.findIndex(c => c.key === toKey);
                        if (to >= 0 && !isStaticId(key)) {
                            apply([{ op: "moveColumn", col: key, index: to }], "move field");
                        }
                    }}
                />
            )
        },
        {
            id: "filter",
            icon: "filter",
            label: texts.textFilter,
            count: ruleCount,
            activeLabel: plural(ruleCount, texts.textFilter),
            width: 560,
            panel: () => <FilterPanel texts={texts} columns={fieldColumns} rules={rules} onChange={setRules} />
        },
        {
            id: "sort",
            icon: "sortAsc",
            label: texts.textSort,
            count: sort.length,
            activeLabel: plural(sort.length, texts.textSort),
            width: 420,
            panel: () => (
                <SortPanel
                    texts={texts}
                    columns={fieldColumns}
                    sort={sort}
                    onChange={next => setView(previous => ({ ...previous, sort: next }))}
                />
            )
        },
        ...(props.enableGrouping && !serverMode && props.showGroupButton !== false
            ? [
                  {
                      id: "group" as PanelId,
                      icon: "group",
                      label: texts.textGroup,
                      count: groupBy.length,
                      activeLabel: plural(groupBy.length, texts.textGroup),
                      width: 340,
                      panel: () => (
                          <GroupPanel
                              texts={texts}
                              columns={fieldColumns}
                              groupBy={groupBy}
                              onChange={next => {
                                  setView(previous => ({ ...previous, groupBy: next }));
                                  setCollapsed(new Set());
                              }}
                              onExpandAll={() => setCollapsed(new Set())}
                              onCollapseAll={() =>
                                  setCollapsed(
                                      new Set(
                                          display
                                              .filter(row => row.kind === "group" && row.level === 0)
                                              .map(row => (row as { path: string }).path)
                                      )
                                  )
                              }
                          />
                      )
                  }
              ]
            : []),
        {
            id: "color",
            icon: "color",
            label: texts.textColor,
            count: view.color ? 1 : 0,
            activeLabel: texts.textColor,
            width: 560,
            panel: () => (
                <ColorPanel
                    texts={texts}
                    columns={fieldColumns}
                    color={view.color}
                    onChange={color => setView(previous => ({ ...previous, color }))}
                />
            )
        },
        ...(viewType !== "grid"
            ? [
                  {
                      id: "layout" as PanelId,
                      icon: viewType === "board" ? "board" : viewType === "calendar" ? "calendar" : "gallery",
                      label: texts.textCustomize,
                      count: 0,
                      width: 420,
                      panel: () => (
                          <LayoutPanel
                              texts={texts}
                              columns={fieldColumns}
                              view={view}
                              onChange={patch => setView(previous => ({ ...previous, ...patch }))}
                          />
                      )
                  }
              ]
            : []),
        {
            id: "height",
            icon: "density",
            label: texts.textRowHeight,
            count: 0,
            width: 200,
            panel: () => (
                <RowHeightPanel
                    texts={texts}
                    value={rowLevel}
                    onChange={next => {
                        setRowLevel(next);
                        setView(previous => ({ ...previous, rowHeight: next }));
                    }}
                />
            )
        }
    ];
    // Toolbar options: a hidden button also leaves the command palette (it maps over viewButtons).
    const hiddenButtons: Partial<Record<PanelId, boolean>> = {
        hide: props.showHideFieldsButton === false,
        filter: props.showFilterButton === false,
        sort: props.showSortButton === false,
        color: props.showColorButton === false,
        height: props.showRowHeightButton === false
    };
    const viewButtons = allViewButtons.filter(button => !hiddenButtons[button.id]);
    const filterSummary = (): string => {
        const parts: string[] = [];
        if (search.trim()) {
            parts.push(`"${search.trim()}"`);
        }
        (view.rules?.conditions ?? []).forEach(condition => {
            const column = columnByKey.get(condition.col);
            if (column && condition.value !== undefined && condition.value !== null && condition.value !== "") {
                parts.push(
                    `${column.caption} ${condition.op} ${
                        Array.isArray(condition.value) ? condition.value.join(", ") : String(condition.value)
                    }`
                );
            }
        });
        Object.keys(filters).forEach(key => parts.push(columnByKey.get(key)?.caption ?? key));
        return parts.length ? fill(texts.textFiltersSummary, { filters: parts.join("; ") }) : texts.textAllRows;
    };
    const printCurrentView = (): void => {
        const cols = visibleColumns.filter(
            column =>
                !(
                    isStaticId(column.key) &&
                    props.staticColumns[staticIndex(column.key)]?.staticType === "customContent"
                )
        );
        // Heading: the export title and/or the open view name (never the action label unless nothing else is known).
        const viewName = visibleViewsForPalette.find(entry => entry.id === activeViewId)?.name;
        const title =
            [props.exportTitle?.value, viewName].filter(Boolean).join(" · ") ||
            props.exportSheetName ||
            texts.textPrintView;
        printView(printHtml(title, filterSummary(), cols, filteredRows));
    };
    const presenceNames = parsePresence(props.presence?.value).filter(name => name !== props.viewOwner?.value);
    const paletteCommands: Command[] = [
        ...(canAddRows && !serverMode
            ? [{ id: "newRow", label: texts.textNewRow, icon: "plus", run: () => addRow() }]
            : []),
        ...(canEditStructure
            ? [
                  {
                      id: "addField",
                      label: texts.textAddField,
                      icon: "plus",
                      group: texts.textColumns,
                      run: () => setColumnEditor({ anchor: pointAnchor(window.innerWidth / 2 - 200, 120) })
                  }
              ]
            : []),
        ...viewButtons.map(button => ({
            id: `vb-${button.id}`,
            label: button.label,
            icon: button.icon,
            group: texts.textViews,
            run: () => setViewBarRequest({ id: button.id, nonce: Date.now() })
        })),
        ...(canEditData
            ? [
                  {
                      id: "findReplace",
                      label: texts.textFindReplace,
                      icon: "replace",
                      shortcut: "Ctrl+H",
                      run: () => setFindOpen(true)
                  }
              ]
            : []),
        ...(selectedCount > 1 && canEditData
            ? [
                  {
                      id: "bulk",
                      label: fill(texts.textEditRows, { count: selectedCount }),
                      icon: "pencil",
                      run: () => setBulkOpen(true)
                  }
              ]
            : []),
        ...(canExport && exportFormats.length
            ? [{ id: "export", label: texts.textExport, icon: "download", run: () => setExportOpen(true) }]
            : []),
        ...(canExport && props.allowImport && canAddRows && !serverMode
            ? [{ id: "import", label: texts.textImport, icon: "upload", run: () => setImportOpen(true) }]
            : []),
        { id: "print", label: texts.textPrintView, icon: "print", run: () => printCurrentView() },
        ...(editingConfigured && props.undoLimit > 0
            ? [
                  { id: "undo", label: texts.textUndo, icon: "undo", shortcut: "Ctrl+Z", run: undo },
                  { id: "redo", label: texts.textRedo, icon: "redo", shortcut: "Ctrl+Y", run: redo }
              ]
            : []),
        ...visibleViewsForPalette.map(entry => ({
            id: `view-${entry.id}`,
            label: entry.name,
            icon: "views",
            group: texts.textViews,
            run: () => {
                setActiveViewId(entry.id);
                setView(() => entry.state);
                if (entry.state.rowHeight) {
                    setRowLevel(entry.state.rowHeight);
                }
            }
        })),
        ...(props.showKeyboardHelp
            ? [
                  {
                      id: "keys",
                      label: texts.textKeyboardHelp,
                      icon: "keyboard",
                      shortcut: "?",
                      run: () => setHelpOpen(true)
                  }
              ]
            : [])
    ];
    const moreItems: MenuItem[] = [
        ...(props.showCommandPalette !== false
            ? [
                  {
                      id: "palette",
                      label: texts.textCommandPalette,
                      icon: "command",
                      shortcut: "Ctrl+K",
                      onSelect: () => setPaletteOpen(true)
                  }
              ]
            : []),
        ...(canEditData
            ? [
                  {
                      id: "findReplace",
                      label: texts.textFindReplace,
                      icon: "replace",
                      shortcut: "Ctrl+H",
                      onSelect: () => setFindOpen(true)
                  }
              ]
            : []),
        ...(editingConfigured && props.undoLimit > 0
            ? [
                  {
                      id: "undo",
                      label: texts.textUndo,
                      icon: "undo",
                      shortcut: "Ctrl+Z",
                      disabled: !queue.undoStack.length,
                      onSelect: undo
                  },
                  {
                      id: "redo",
                      label: texts.textRedo,
                      icon: "redo",
                      shortcut: "Ctrl+Y",
                      disabled: !queue.redoStack.length,
                      onSelect: redo
                  }
              ]
            : []),
        ...(props.showColumnsPanel
            ? [{ id: "panel", label: texts.textColumns, icon: "columns", onSelect: () => setPanelOpen(open => !open) }]
            : []),
        ...(props.showKeyboardHelp
            ? [
                  {
                      id: "keys",
                      label: texts.textKeyboardHelp,
                      icon: "keyboard",
                      shortcut: "?",
                      onSelect: () => setHelpOpen(true)
                  }
              ]
            : []),
        { id: "print", label: texts.textPrintView, icon: "print", onSelect: printCurrentView },
        {
            id: "reset",
            label: texts.textResetView,
            icon: "undo",
            onSelect: () => {
                setView(() => emptyViewState());
                setRowLevel(props.rowHeight ?? "medium");
                setSearchInput("");
            }
        }
    ];
    const savePill =
        editingConfigured && status !== "idle" ? (
            <SavePill
                texts={texts}
                state={{
                    status,
                    dirty,
                    manual: props.saveMode === "manual",
                    message: queue.errors.map(e => e.message).join("; "),
                    onSave: () => queue.save(),
                    onRetry: () => queue.save()
                }}
            />
        ) : null;
    // ---- 1.2 board / calendar / gallery views ----------------------------------------------------------------
    const colorOf = (row: RowRecord): string | undefined => rowColor(row, modelRef.current.columns, view.color);
    const canEditRow = (rowKey: string): boolean => canEditData && Boolean(rowKey) && !lockedRows.has(rowKey);
    const addWithValues = (values: Record<string, CellValue>): void => {
        addRow(undefined, values, false);
    };
    const altView =
        viewType === "board" ? (
            <BoardView
                texts={texts}
                rows={filteredRows}
                columns={visibleColumns}
                laneCol={view.board?.col}
                fields={view.board?.fields ?? []}
                summary={view.board?.summary}
                canEdit={canEditRow}
                canAdd={canAddRows && !serverMode}
                onMove={(rowKey, value) => {
                    const col = view.board?.col;
                    if (col && canEditRow(rowKey)) {
                        setCells([{ row: rowKey, col, value }], texts.textEditField);
                    }
                }}
                onOpen={rowKey => setRecordKey(rowKey)}
                onAdd={addWithValues}
                rowColor={colorOf}
            />
        ) : viewType === "calendar" ? (
            <CalendarView
                texts={texts}
                rows={filteredRows}
                columns={visibleColumns}
                startCol={view.calendar?.start}
                endCol={view.calendar?.end}
                mode={view.calendar?.mode ?? "month"}
                onMode={mode => setView(previous => ({ ...previous, calendar: { ...previous.calendar, mode } }))}
                canEdit={canEditRow}
                canAdd={canAddRows && !serverMode}
                onMove={(rowKey, changes) => {
                    if (canEditRow(rowKey)) {
                        setCells(Object.entries(changes).map(([col, value]) => ({ row: rowKey, col, value })));
                    }
                }}
                onOpen={rowKey => setRecordKey(rowKey)}
                onAdd={addWithValues}
                rowColor={colorOf}
            />
        ) : viewType === "gallery" ? (
            <GalleryView
                texts={texts}
                rows={filteredRows}
                columns={visibleColumns}
                coverCol={view.gallery?.cover}
                fields={view.gallery?.fields ?? []}
                canAdd={canAddRows && !serverMode}
                onOpen={rowKey => setRecordKey(rowKey)}
                onAdd={addWithValues}
                rowColor={colorOf}
            />
        ) : null;
    const applyBulk = (col: string, value: CellValue): void => {
        const keys = selectedRowKeys().filter(canEditRow);
        setCells(
            keys.map(row => ({ row, col, value })),
            fill(texts.textEdited, { count: keys.length })
        );
        setBulkOpen(false);
        toast({ text: fill(texts.textEdited, { count: keys.length }), tone: "success" }, 2500);
    };
    const applyReplace = (matches: FindMatch[]): void => {
        const cells = matches
            .filter(m => canEditRow(m.row))
            .map(m => ({ row: m.row, col: m.col, value: m.after as CellValue }));
        setCells(cells, fill(texts.textReplaced, { count: cells.length }));
        setFindOpen(false);
        toast({ text: fill(texts.textReplaced, { count: cells.length }), tone: "success" }, 2500);
    };
    const createTypedView = (type: ViewType): Partial<ViewState> => ({
        viewType: type,
        ...defaultLayout(type, fieldColumns)
    });

    const viewChrome = (
        <>
            {props.showViewTabs && props.views && (
                <ViewTabs
                    texts={texts}
                    allowTypes={props.allowViewTypes !== false}
                    makeTypedState={createTypedView}
                    doc={viewsDoc}
                    owner={props.viewOwner?.value}
                    activeId={activeViewId}
                    current={view}
                    defaultRowHeight={props.rowHeight ?? "medium"}
                    onSelect={selected => {
                        setActiveViewId(selected?.id);
                        if (selected) {
                            setView(() => selected.state);
                            if (selected.state.rowHeight) {
                                setRowLevel(selected.state.rowHeight);
                            }
                            setCollapsed(new Set());
                        }
                    }}
                    onSave={(doc, selectId) => {
                        saveViewsDoc(doc);
                        if (selectId) {
                            setActiveViewId(selectId);
                        }
                    }}
                />
            )}
            <ViewBar
                texts={texts}
                buttons={viewButtons}
                request={viewBarRequest}
                moreItems={moreItems}
                showMore={props.showMoreMenu !== false && moreItems.length > 0}
                search={
                    props.showSearch ? (
                        <label className={`mxt-dg-vb-search${searchInput ? " has-value" : ""}`}>
                            <Icon name="search" size={15} />
                            <input
                                ref={searchRef}
                                type="search"
                                value={searchInput}
                                placeholder={texts.textSearch}
                                aria-label={texts.textSearch}
                                onChange={event => setSearchInput(event.target.value)}
                            />
                        </label>
                    ) : null
                }
                savePill={
                    <>
                        {presenceNames.length > 0 && (
                            <span
                                className="mxt-dg-presence"
                                title={`${texts.textViewing}: ${presenceNames.join(", ")}`}
                                data-presence={presenceNames.length}
                            >
                                {presenceNames.slice(0, 4).map(name => (
                                    <span
                                        key={name}
                                        className="mxt-dg-avatar mxt-dg-presence__avatar"
                                        aria-label={name}
                                    >
                                        {name
                                            .split(" ")
                                            .filter(Boolean)
                                            .slice(0, 2)
                                            .map(part => part[0].toUpperCase())
                                            .join("")}
                                    </span>
                                ))}
                                {presenceNames.length > 4 && (
                                    <span className="mxt-dg-presence__more">+{presenceNames.length - 4}</span>
                                )}
                            </span>
                        )}
                        {savePill}
                    </>
                }
                actions={
                    <>
                        {selectedCount > 1 && canEditData && (
                            <button
                                type="button"
                                className="mxt-dg-vb-btn"
                                data-action="bulk-edit"
                                onClick={() => setBulkOpen(true)}
                            >
                                <Icon name="pencil" size={14} /> {fill(texts.textEditRows, { count: selectedCount })}
                            </button>
                        )}
                        {selectedCount > 0 && canDeleteRows && (
                            <button
                                type="button"
                                className="mxt-dg-vb-btn mxt-dg-vb-btn--danger"
                                data-action="delete-rows"
                                onClick={() => deleteRows(selectedRowKeys())}
                            >
                                <Icon name="trash" size={14} /> {fill(texts.textDeleteRows, { count: selectedCount })}
                            </button>
                        )}
                        {canExport && props.allowImport && canAddRows && !serverMode && allColumns.length > 0 && (
                            <button
                                type="button"
                                className="mxt-dg-vb-btn"
                                title={texts.textImport}
                                onClick={() => setImportOpen(true)}
                                data-action="import"
                            >
                                <Icon name="upload" size={14} />
                                <span className="mxt-dg-vb-btn__label">{texts.textImport}</span>
                            </button>
                        )}
                        {canExport &&
                            exportFormats.length > 0 &&
                            allColumns.length > 0 &&
                            props.showExportButton !== false && (
                                <button
                                    type="button"
                                    className="mxt-dg-vb-btn"
                                    title={texts.textExport}
                                    onClick={() => setExportOpen(true)}
                                    data-action="export"
                                >
                                    <Icon name="download" size={14} />
                                    <span className="mxt-dg-vb-btn__label">{texts.textExport}</span>
                                </button>
                            )}
                    </>
                }
                primary={
                    canAddRows && !serverMode && allColumns.length > 0 && props.showNewRowButton !== false ? (
                        <button
                            type="button"
                            className="mxt-dg-vb-primary"
                            data-action="add-row"
                            onClick={() => addRow()}
                        >
                            <Icon name="plus" size={14} /> {texts.textNewRow}
                        </button>
                    ) : null
                }
            />
        </>
    );

    const showTemplatePicker =
        props.showViewBar &&
        props.showTemplates &&
        !loading &&
        dynamicColumns.length === 0 &&
        staticDefs.length === 0 &&
        canEditStructure;
    const applyTemplate = (id: TemplateId): void => {
        apply(templateOps(id, modelRef.current.columns.length, modelRef.current.rows.length, true), texts.textAddField);
    };
    const filteredEmpty = !loading && rowData.length === 0 && computedRows.length > 0;
    const noRecords = !loading && computedRows.length === 0 && dynamicColumns.length + staticDefs.length > 0;
    const autoHeight = props.heightMode === "auto";
    const rowPx = ROW_HEIGHTS[rowLevel];
    const headerPx =
        (props.showHeaderFilters ? HEADER_HEIGHT[density].filters : HEADER_HEIGHT[density].plain) +
        (allColumns.some(column => column.headerGroup.trim())
            ? density === "compact"
                ? 26
                : density === "comfortable"
                ? 34
                : 30
            : 0);
    const estimatedHeight =
        headerPx +
        Math.max(3, rowData.length) * rowPx +
        (inlineNewRow && rowData.length > 0 ? 36 : 0) +
        (totalsRow.length ? Math.max(32, Math.min(rowPx, 40)) + 2 : 0) +
        18;
    const gridStyle: CSSProperties | undefined = autoHeight
        ? {
              height:
                  viewType !== "grid"
                      ? props.maxHeight || "640px"
                      : `${showTemplatePicker ? Math.max(estimatedHeight, 440) : estimatedHeight}px`,
              maxHeight: props.maxHeight || "640px",
              flex: "none"
          }
        : undefined;

    const rootStyle = {
        "--mxt-dg-accent": accent,
        height: props.heightMode === "auto" ? undefined : props.heightMode === "fill" ? "100%" : props.height || "600px"
    } as CSSProperties;
    const empty = !loading && rowData.length === 0;
    const filtersActive = Object.keys(filters).length > 0 || Boolean(search.trim());

    let emptyContent: ReactNode = null;
    if (empty) {
        emptyContent = props.emptyPlaceholder ?? <span className="mxt-dg-empty__text">{texts.textNoRows}</span>;
    }

    return (
        <ThemeContext.Provider value={themeClass}>
            <div
                ref={rootRef}
                className={classNames("mxt-dg", themeClass, props.class, `mxt-dg--${density}`, {
                    "mxt-dg--filters": props.showHeaderFilters,
                    "mxt-dg--auto": props.heightMode === "auto",
                    "mxt-dg--viewbar": props.showViewBar,
                    "mxt-dg--readonly": !canEditData
                })}
                style={{ ...props.style, ...rootStyle }}
                onKeyDown={onRootKeyDown}
                data-mode={serverMode ? "server" : "client"}
            >
                {props.showViewBar ? (
                    viewChrome
                ) : (
                    <div className="mxt-dg-toolbar" role="toolbar" aria-label="Grid toolbar">
                        {props.showSearch && (
                            <label className="mxt-dg-search">
                                <Icon name="search" size={15} />
                                <input
                                    ref={searchRef}
                                    type="search"
                                    value={searchInput}
                                    placeholder={texts.textSearch}
                                    aria-label={texts.textSearch}
                                    onChange={event => setSearchInput(event.target.value)}
                                />
                            </label>
                        )}
                        {filtersActive && (
                            <button
                                type="button"
                                className="mxt-dg-btn btn btn-default mxt-dg-btn--ghost"
                                onClick={() => {
                                    setSearchInput("");
                                    setView(previous => ({ ...previous, filters: {} }));
                                }}
                            >
                                <Icon name="filter" size={14} /> {texts.textClearFilters}
                            </button>
                        )}
                        <span className="mxt-dg-toolbar__spacer" />
                        {canAddRows && !serverMode && (
                            <button
                                type="button"
                                className="btn btn-primary mxt-dg-btn mxt-dg-btn--add"
                                data-action="add-row"
                                onClick={() => addRow()}
                            >
                                <Icon name="plus" size={14} /> {texts.textAddRow}
                            </button>
                        )}
                        {selectedCount > 0 && canDeleteRows && (
                            <button
                                type="button"
                                className="btn btn-default mxt-dg-btn mxt-dg-btn--danger"
                                data-action="delete-rows"
                                onClick={() => deleteRows(selectedRowKeys())}
                            >
                                <Icon name="trash" size={14} /> {fill(texts.textDeleteRows, { count: selectedCount })}
                            </button>
                        )}
                        {editingConfigured && props.undoLimit > 0 && (
                            <span className="mxt-dg-btngroup">
                                <button
                                    type="button"
                                    className="mxt-dg-iconbtn"
                                    aria-label={texts.textUndo}
                                    title={`${texts.textUndo} (Ctrl+Z)`}
                                    disabled={!queue.undoStack.length}
                                    onClick={undo}
                                    data-action="undo"
                                >
                                    <Icon name="undo" />
                                </button>
                                <button
                                    type="button"
                                    className="mxt-dg-iconbtn"
                                    aria-label={texts.textRedo}
                                    title={`${texts.textRedo} (Ctrl+Y)`}
                                    disabled={!queue.redoStack.length}
                                    onClick={redo}
                                    data-action="redo"
                                >
                                    <Icon name="redo" />
                                </button>
                            </span>
                        )}
                        {props.enableGrouping && !serverMode && (
                            <button
                                type="button"
                                className={classNames("mxt-dg-iconbtn", { "is-active": groupBy.length > 0 })}
                                aria-label={texts.textGroupBy}
                                title={texts.textGroupBy}
                                data-action="group-by"
                                onClick={event => setGroupMenu(anchorOf(event.currentTarget))}
                            >
                                <Icon name="group" />
                            </button>
                        )}
                        {props.showColumnsPanel && (
                            <button
                                type="button"
                                className={classNames("mxt-dg-iconbtn", { "is-active": panelOpen })}
                                aria-label={texts.textColumns}
                                title={texts.textColumns}
                                onClick={() => setPanelOpen(open => !open)}
                                data-action="columns-panel"
                            >
                                <Icon name="columns" />
                            </button>
                        )}
                        {props.views && (
                            <ViewsMenu
                                texts={texts}
                                doc={viewsDoc}
                                owner={props.viewOwner?.value}
                                current={view}
                                onApply={state => {
                                    setView(() => state);
                                    setCollapsed(new Set());
                                }}
                                onSave={saveViewsDoc}
                                onReset={() => setView(() => emptyViewState())}
                            />
                        )}
                        <button
                            type="button"
                            className="mxt-dg-iconbtn"
                            aria-label={texts.textDensity}
                            title={texts.textDensity}
                            onClick={() => {
                                const next: Density =
                                    density === "compact" ? "normal" : density === "normal" ? "comfortable" : "compact";
                                setDensity(next);
                                setView(previous => ({ ...previous, density: next }));
                            }}
                        >
                            <Icon name="density" />
                        </button>
                        {canExport && props.allowImport && canAddRows && !serverMode && (
                            <button
                                type="button"
                                className="mxt-dg-iconbtn"
                                aria-label={texts.textImport}
                                title={texts.textImport}
                                onClick={() => setImportOpen(true)}
                                data-action="import"
                            >
                                <Icon name="upload" />
                            </button>
                        )}
                        {canExport && exportFormats.length > 0 && (
                            <button
                                type="button"
                                className="btn btn-default mxt-dg-btn"
                                onClick={() => setExportOpen(true)}
                                data-action="export"
                            >
                                <Icon name="download" size={14} /> {texts.textExport}
                            </button>
                        )}
                        {props.showKeyboardHelp && (
                            <button
                                type="button"
                                className="mxt-dg-iconbtn"
                                aria-label={texts.textKeyboardHelp}
                                title={texts.textKeyboardHelp}
                                onClick={() => setHelpOpen(true)}
                            >
                                <Icon name="keyboard" />
                            </button>
                        )}
                    </div>
                )}

                {!props.showViewBar &&
                    props.saveMode === "manual" &&
                    editingConfigured &&
                    (dirty > 0 || status === "error" || status === "saving") && (
                        <div
                            className={`mxt-dg-savebar mxt-dg-savebar--${status}`}
                            role="region"
                            aria-label={texts.textSave}
                        >
                            <span className="mxt-dg-savebar__dot" aria-hidden />
                            <span className="mxt-dg-savebar__text">
                                {status === "saving"
                                    ? texts.textSaving
                                    : status === "error"
                                    ? fill(texts.textSaveFailed, {
                                          message:
                                              queue.errors
                                                  .filter(e => !e.row)
                                                  .map(e => e.message)
                                                  .join("; ") || `${queue.errors.length}`
                                      })
                                    : fill(texts.textUnsaved, { count: dirty })}
                            </span>
                            <button
                                type="button"
                                className="btn btn-default mxt-dg-btn"
                                disabled={status === "saving"}
                                onClick={() => queue.discard()}
                                data-action="discard"
                            >
                                {texts.textDiscard}
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary mxt-dg-btn"
                                disabled={status === "saving" || dirty === 0}
                                onClick={() => queue.save()}
                                data-action="save"
                            >
                                <Icon name="save" size={14} /> {texts.textSave} <kbd>Ctrl+S</kbd>
                            </button>
                        </div>
                    )}

                <div className="mxt-dg-body" style={gridStyle}>
                    {viewType !== "grid" && altView}
                    <div className={viewType === "grid" ? "mxt-dg-grid" : "mxt-dg-grid mxt-dg-grid--hidden"}>
                        <AgGridReact<GridItem>
                            theme={theme}
                            rowData={gridRows}
                            columnDefs={columnDefs}
                            context={store}
                            getRowId={params => params.data.id}
                            pinnedBottomRowData={totalsRow}
                            isFullWidthRow={params =>
                                Boolean(params.rowNode.data?.group || params.rowNode.data?.newRow)
                            }
                            fullWidthCellRenderer={FullWidthRow}
                            rowSelection={rowSelection}
                            selectionColumnDef={{ pinned: "left", lockPinned: true, width: 48, suppressMovable: true }}
                            onSelectionChanged={onSelectionChanged}
                            onGridReady={onGridReady}
                            onRowClicked={onRowClicked}
                            onCellContextMenu={onCellContextMenu}
                            preventDefaultOnContextMenu
                            onCellEditingStopped={onCellEditingStopped}
                            onColumnMoved={onColumnMoved}
                            onColumnResized={onColumnResized}
                            onRowDragEnd={onRowDragEnd}
                            onBodyScrollEnd={onBodyScrollEnd}
                            onBodyScroll={() => range.schedulePaint()}
                            rowClassRules={rowClassRules}
                            getRowClass={getRowClass}
                            getRowStyle={getRowStyle}
                            animateRows={animate}
                            singleClickEdit={props.singleClickEdit}
                            stopEditingWhenCellsLoseFocus
                            enterNavigatesVerticallyAfterEdit
                            enterNavigatesVertically={false}
                            tooltipShowDelay={300}
                            suppressDragLeaveHidesColumns
                            pagination={clientButtons}
                            paginationPageSize={pageSize}
                            suppressPaginationPanel
                            suppressNoRowsOverlay
                            groupHeaderHeight={density === "compact" ? 26 : density === "comfortable" ? 34 : 30}
                            suppressColumnVirtualisation={allColumns.length <= 60}
                            loading={false}
                            ensureDomOrder={false}
                            suppressCellFocus={false}
                            getRowHeight={params =>
                                params.node.rowPinned
                                    ? Math.max(32, Math.min(ROW_HEIGHTS[rowLevel], 40))
                                    : params.data?.newRow
                                    ? 36
                                    : undefined
                            }
                        />
                        {loading && (
                            <div className="mxt-dg-overlay">
                                <Skeleton columns={Math.min(6, Math.max(3, visibleColumns.length))} />
                            </div>
                        )}
                        {showTemplatePicker ? (
                            <div className="mxt-dg-templates" data-empty="templates">
                                <h3>{texts.textStartTemplate}</h3>
                                <div className="mxt-dg-templates__cards">
                                    {TEMPLATES.map(template => {
                                        const key = template.id.charAt(0).toUpperCase() + template.id.slice(1);
                                        const textsMap = texts as unknown as Record<string, string>;
                                        return (
                                            <button
                                                key={template.id}
                                                type="button"
                                                className="mxt-dg-tplcard"
                                                data-template={template.id}
                                                onClick={() => applyTemplate(template.id)}
                                            >
                                                <span className="mxt-dg-tplcard__icon">
                                                    <Icon name={template.icon} size={20} />
                                                </span>
                                                <strong>{textsMap[`textTpl${key}`]}</strong>
                                                <span>{textsMap[`textTpl${key}Help`]}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                                <button
                                    type="button"
                                    className="mxt-dg-vp-link"
                                    onClick={event => {
                                        const anchor = anchorOf(event.currentTarget);
                                        if (anchor) {
                                            setColumnEditor({ anchor });
                                        }
                                    }}
                                >
                                    {texts.textOrAddField}
                                </button>
                            </div>
                        ) : props.showViewBar && filteredEmpty ? (
                            <div className="mxt-dg-empty" data-empty="filtered">
                                <span className="mxt-dg-empty__text">{texts.textNoMatches}</span>
                                <button
                                    type="button"
                                    className="mxt-dg-vb-btn"
                                    data-action="clear-filters"
                                    onClick={() => {
                                        setSearchInput("");
                                        setView(previous => ({ ...previous, filters: {}, rules: emptyRules() }));
                                    }}
                                >
                                    {texts.textClearFilters}
                                </button>
                            </div>
                        ) : props.showViewBar && noRecords && !props.emptyPlaceholder ? (
                            <div className="mxt-dg-empty" data-empty="norecords">
                                <span className="mxt-dg-empty__text">{texts.textNoRecords}</span>
                                {canAddRows && !serverMode && (
                                    <button
                                        type="button"
                                        className="mxt-dg-vb-primary"
                                        data-action="add-row-empty"
                                        onClick={() => addRow()}
                                    >
                                        <Icon name="plus" size={14} /> {texts.textNewRow}
                                    </button>
                                )}
                            </div>
                        ) : (
                            empty && (
                                <div className="mxt-dg-empty" data-empty>
                                    {emptyContent}
                                </div>
                            )
                        )}
                    </div>
                    {panelOpen && (
                        <ColumnsPanel
                            texts={texts}
                            columns={allColumns}
                            view={view}
                            canEditStructure={canEditStructure}
                            onToggle={(colId, hidden) => setColumnView(colId, { hidden })}
                            onPin={(colId, pinned) => setColumnView(colId, { pinned })}
                            onMove={(colId, index) => {
                                if (canEditStructure && !isStaticId(colId)) {
                                    apply([{ op: "moveColumn", col: colId, index }], "move field");
                                }
                            }}
                            onClose={() => setPanelOpen(false)}
                        />
                    )}
                </div>

                {canAddRows && !serverMode && !props.showViewBar && (
                    <button
                        type="button"
                        className="mxt-dg-addrow"
                        onClick={() => addRow()}
                        data-action="add-row-bottom"
                    >
                        <Icon name="plus" size={14} /> {texts.textAddRow}
                    </button>
                )}
                {clientLoadMore && display.length > loadedLimit && (
                    <button
                        type="button"
                        className="btn btn-default mxt-dg-btn mxt-dg-loadmore"
                        onClick={() => setLoadedLimit(limit => limit + pageSize)}
                    >
                        {texts.textLoadMore}
                    </button>
                )}
                {serverMode && props.pagination === "loadMore" && items.length < totalRows && (
                    <button
                        type="button"
                        className="btn btn-default mxt-dg-btn mxt-dg-loadmore"
                        onClick={() => setLoadedLimit(limit => limit + pageSize)}
                    >
                        {texts.textLoadMore}
                    </button>
                )}

                <div className="mxt-dg-footer">
                    {props.showStatusBar ? (
                        <StatusBar
                            texts={texts}
                            animate={animate}
                            hideRows={props.showViewBar && totalsRow.length > 0}
                            shown={serverMode ? totalRows : filteredRows.length}
                            total={totalRows}
                            selected={selectedCount}
                            range={rangeSummary}
                            saveState={props.showViewBar ? null : saveState}
                            issues={issueCount}
                            onIssues={() => {
                                const first = Array.from(server.cells.keys())[0] ?? Array.from(clientIssues.keys())[0];
                                if (first) {
                                    const [rowKey, colId] = first.split("\u0000");
                                    const node = apiRef.current?.getRowNode(rowKey);
                                    if (node && node.rowIndex !== null) {
                                        apiRef.current?.ensureIndexVisible(node.rowIndex);
                                        if (colId !== "*") {
                                            apiRef.current?.ensureColumnVisible(colId);
                                            apiRef.current?.setFocusedCell(node.rowIndex, colId);
                                        }
                                    }
                                }
                            }}
                            onClearSelection={selectedCount > 0 ? () => apiRef.current?.deselectAll() : undefined}
                            formatNumber={n => formatNumber(n, "decimal", "#,##0.##")}
                        />
                    ) : (
                        saveState
                    )}
                    {props.pagination === "buttons" && (clientButtons || serverMode) && (
                        <Pager
                            texts={texts}
                            page={page}
                            pageSize={pageSize}
                            total={serverMode ? totalRows : display.length}
                            pageSizes={pageSizes}
                            onPage={setPage}
                            onPageSize={size => {
                                setPageSize(size);
                                setPage(0);
                                setView(previous => ({ ...previous, pageSize: size }));
                            }}
                        />
                    )}
                </div>

                {summaryMenu && columnByKey.get(summaryMenu.colId) && (
                    <Menu
                        anchor={summaryMenu.anchor}
                        label={texts.textSummarize}
                        onClose={() => setSummaryMenu(undefined)}
                        items={summaryFunctions(columnByKey.get(summaryMenu.colId) as ColumnDef).map(fn => ({
                            id: `sum-${fn}`,
                            label: summaryLabel(texts, fn),
                            icon: aggregates[summaryMenu.colId] === fn ? "check" : undefined,
                            onSelect: () =>
                                setView(previous => ({
                                    ...previous,
                                    aggregates: { ...previous.aggregates, [summaryMenu.colId]: fn }
                                }))
                        }))}
                    />
                )}
                {columnMenu && (
                    <Menu
                        anchor={columnMenu.anchor}
                        items={columnMenuItems(columnMenu.colId)}
                        onClose={() => setColumnMenu(undefined)}
                        label={columnByKey.get(columnMenu.colId)?.caption}
                    />
                )}
                {rowMenu && (
                    <Menu
                        anchor={rowMenu.anchor}
                        items={rowMenuItems(rowMenu.rowKey)}
                        onClose={() => setRowMenu(undefined)}
                    />
                )}
                {groupMenu && (
                    <Menu
                        anchor={groupMenu}
                        onClose={() => setGroupMenu(undefined)}
                        items={[
                            ...visibleColumns
                                .filter(
                                    column =>
                                        !(
                                            isStaticId(column.key) &&
                                            props.staticColumns[staticIndex(column.key)]?.staticType === "customContent"
                                        )
                                )
                                .map(column => ({
                                    id: column.key,
                                    label: `${
                                        groupBy.includes(column.key) ? `${groupBy.indexOf(column.key) + 1}. ` : ""
                                    }${column.caption}`,
                                    icon: groupBy.includes(column.key) ? "check" : typeInfo(column.type).icon,
                                    onSelect: () => toggleGroupBy(column.key)
                                })),
                            { id: "sep", label: "", separator: true },
                            {
                                id: "expand",
                                label: texts.textExpandAll,
                                icon: "chevronDown",
                                disabled: !groupBy.length,
                                onSelect: () => setCollapsed(new Set())
                            },
                            {
                                id: "collapse",
                                label: texts.textCollapseAll,
                                icon: "chevronRight",
                                disabled: !groupBy.length,
                                onSelect: () =>
                                    setCollapsed(
                                        new Set(
                                            display
                                                .filter(row => row.kind === "group" && row.level === 0)
                                                .map(row => (row as { path: string }).path)
                                        )
                                    )
                            },
                            {
                                id: "none",
                                label: texts.textNoGrouping,
                                icon: "close",
                                disabled: !groupBy.length,
                                onSelect: () => setView(previous => ({ ...previous, groupBy: [] }))
                            }
                        ]}
                    />
                )}
                {columnEditor && (
                    <Popover
                        anchor={columnEditor.anchor}
                        onClose={() => setColumnEditor(undefined)}
                        className="mxt-dg-coleditor-pop"
                        label={texts.textAddColumn}
                        width={props.showViewBar ? 520 : 420}
                    >
                        <ColumnEditor
                            texts={texts}
                            column={editingColumn}
                            columns={dynamicColumns}
                            newKey={newKey}
                            defaultCaption={fill(texts.textNewColumn, { number: dynamicColumns.length + 1 })}
                            focusType={columnEditor.focusType}
                            sampleRow={computedRows[0]}
                            previewConversion={
                                editingColumn ? type => convertColumn(computedRows, editingColumn, type) : undefined
                            }
                            onCancel={() => setColumnEditor(undefined)}
                            onSubmit={result => {
                                setColumnEditor(undefined);
                                if (editingColumn) {
                                    updateColumn(editingColumn, result);
                                } else {
                                    createColumn(result, columnEditor.index);
                                }
                            }}
                        />
                    </Popover>
                )}
                {confirm && (
                    <Dialog
                        title={confirm.title}
                        onClose={() => setConfirm(undefined)}
                        width={420}
                        footer={
                            <>
                                <button
                                    type="button"
                                    className="btn btn-default mxt-dg-btn"
                                    onClick={() => setConfirm(undefined)}
                                >
                                    {texts.textCancel}
                                </button>
                                {confirm.secondary && (
                                    <button
                                        type="button"
                                        className="btn btn-default mxt-dg-btn"
                                        onClick={() => {
                                            const run = confirm.secondary?.run;
                                            setConfirm(undefined);
                                            run?.();
                                        }}
                                    >
                                        {confirm.secondary.label}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    data-action="confirm"
                                    className={classNames(
                                        "btn mxt-dg-btn",
                                        confirm.danger ? "btn-danger" : "btn-primary"
                                    )}
                                    onClick={() => {
                                        const run = confirm.run;
                                        setConfirm(undefined);
                                        run();
                                    }}
                                >
                                    {confirm.confirm}
                                </button>
                            </>
                        }
                    >
                        <p>{confirm.text}</p>
                    </Dialog>
                )}
                {recordRow && (
                    <RecordDrawer
                        texts={texts}
                        row={recordRow}
                        index={Math.max(0, recordIndex)}
                        total={recordRows.length}
                        columns={visibleColumns.filter(
                            column =>
                                !(
                                    isStaticId(column.key) &&
                                    props.staticColumns[staticIndex(column.key)]?.staticType === "customContent"
                                )
                        )}
                        canEdit={column => canEditCell(recordRow.key, column.key)}
                        issueOf={colKey => issueOf(recordRow.key, colKey)}
                        onChange={(column, value) => setCells([{ row: recordRow.key, col: column.key, value }])}
                        onNavigate={delta => {
                            const next = recordRows[recordIndex + delta];
                            if (next) {
                                setRecordKey(next.key);
                            }
                        }}
                        onClose={() => {
                            setRecordKey(undefined);
                            setConflictRow(undefined);
                        }}
                        locked={lockedRows.has(recordRow.key)}
                        banner={
                            conflictRow === recordRow.key ? (
                                <div className="mxt-dg-conflict" role="alert" data-conflict>
                                    <Icon name="warning" size={15} />
                                    <span>{texts.textRecordChanged}</span>
                                    <button
                                        type="button"
                                        className="mxt-dg-vb-btn"
                                        data-action="conflict-reload"
                                        onClick={() => {
                                            queue.dropPendingForRow(recordRow.key);
                                            setConflictRow(undefined);
                                        }}
                                    >
                                        {texts.textReloadRecord}
                                    </button>
                                    <button
                                        type="button"
                                        className="mxt-dg-vb-primary"
                                        data-action="conflict-keep"
                                        onClick={() => setConflictRow(undefined)}
                                    >
                                        {texts.textKeepMine}
                                    </button>
                                </div>
                            ) : undefined
                        }
                        extra={
                            <>
                                {commentsEnabled && (
                                    <section className="mxt-dg-drawer__section" data-drawer-comments>
                                        <h4>
                                            <Icon name="comment" size={14} /> {texts.textComments}{" "}
                                            <span className="mxt-dg-lane__count">
                                                {
                                                    (model.comments ?? []).filter(
                                                        c => c.row === recordRow.key && !c.resolved
                                                    ).length
                                                }
                                            </span>
                                        </h4>
                                        <CommentThread
                                            texts={texts}
                                            comments={(model.comments ?? []).filter(c => c.row === recordRow.key)}
                                            people={people}
                                            canComment={commentsEnabled}
                                            onAdd={(text, mentions) => addComment(recordRow.key, null, text, mentions)}
                                            onResolve={resolveComment}
                                        />
                                    </section>
                                )}
                                {props.historySource && (
                                    <section className="mxt-dg-drawer__section" data-drawer-history>
                                        <h4>
                                            <Icon name="history" size={14} /> {texts.textHistory}
                                        </h4>
                                        <HistoryTimeline
                                            texts={texts}
                                            history={history.filter(entry => entry.row === recordRow.key)}
                                            captionOf={col => columnByKey.get(col)?.caption ?? col}
                                        />
                                    </section>
                                )}
                            </>
                        }
                    />
                )}
                {exportOpen && (
                    <ExportDialog
                        texts={texts}
                        formats={exportFormats}
                        selectedCount={selectedCount}
                        filtered={filtersActive}
                        keepColors={props.exportGridColors !== false}
                        onExport={choice => {
                            runExport(choice).catch(error => toast({ text: String(error), tone: "error" }));
                        }}
                        onClose={() => setExportOpen(false)}
                    />
                )}
                {importOpen && (
                    <ImportDialog
                        texts={texts}
                        columns={dynamicColumns}
                        canCreateColumns={canEditStructure}
                        onImport={runImport}
                        onClose={() => setImportOpen(false)}
                    />
                )}
                {formatCol && columnByKey.get(formatCol) && (
                    <FormatDialog
                        texts={texts}
                        column={columnByKey.get(formatCol) as ColumnDef}
                        rules={view.formats[formatCol] ?? []}
                        onChange={rules =>
                            setView(previous => ({ ...previous, formats: { ...previous.formats, [formatCol]: rules } }))
                        }
                        onClose={() => setFormatCol(undefined)}
                        aggregate={aggregates[formatCol] ?? "none"}
                        onAggregate={fn =>
                            setView(previous => ({
                                ...previous,
                                aggregates: { ...previous.aggregates, [formatCol]: fn }
                            }))
                        }
                    />
                )}
                {helpOpen && <KeyboardHelp texts={texts} onClose={() => setHelpOpen(false)} />}
                {bulkOpen && (
                    <BulkEditDialog
                        texts={texts}
                        columns={dynamicColumns.filter(column => canEditColumn(column))}
                        count={selectedRowKeys().filter(canEditRow).length}
                        onApply={applyBulk}
                        onClose={() => setBulkOpen(false)}
                    />
                )}
                {findOpen && (
                    <FindReplaceDialog
                        texts={texts}
                        columns={dynamicColumns.filter(column => canEditColumn(column))}
                        rows={filteredRows}
                        onReplace={applyReplace}
                        onClose={() => setFindOpen(false)}
                    />
                )}
                {hintsOpen && props.showViewBar && !loading && (
                    <CoachMarks texts={texts} rootRef={rootRef} onDone={() => setHintsOpen(false)} />
                )}
                {commentsAt && (
                    <Popover
                        anchor={commentsAt.anchor}
                        onClose={() => setCommentsAt(undefined)}
                        className="mxt-dg-thread-pop"
                        width={360}
                        label={texts.textComments}
                    >
                        <CommentThread
                            texts={texts}
                            title={commentsAt.col ? columnByKey.get(commentsAt.col)?.caption : texts.textComments}
                            comments={(model.comments ?? []).filter(
                                c => c.row === commentsAt.row && c.col === commentsAt.col
                            )}
                            people={people}
                            canComment={commentsEnabled}
                            onAdd={(text, mentions) => addComment(commentsAt.row, commentsAt.col, text, mentions)}
                            onResolve={resolveComment}
                        />
                    </Popover>
                )}
                {paletteOpen && (
                    <CommandPalette
                        texts={texts}
                        commands={paletteCommands}
                        undoLabels={queue.undoStack.map(entry => entry.label)}
                        onUndoSteps={steps => {
                            for (let i = 0; i < steps; i++) {
                                undo();
                            }
                        }}
                        onClose={() => setPaletteOpen(false)}
                    />
                )}
                <Toasts toasts={toasts} onDismiss={dismissToast} cancelLabel={texts.textCancel} />
                <span className="mxt-dg-sr" aria-live="polite">
                    {describeOps(queue.pending)}
                </span>
            </div>
        </ThemeContext.Provider>
    );
}

function indexIn(order: string[], key: string): number {
    const index = order.indexOf(key);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

function blankColumn(key: string, caption: string): ColumnDef {
    return {
        key,
        caption,
        type: "text",
        order: 0,
        pinned: null,
        hidden: false,
        required: false,
        readOnly: false,
        options: [],
        format: "",
        formula: "",
        headerGroup: "",
        description: "",
        validation: {},
        canEdit: true
    };
}

export type { Texts };
