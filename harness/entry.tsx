// Browser harness: renders the real MxDynamicGrid container with mocked Mendix props and a simulated save
// microflow that applies the change set to an in-memory "database" (GridColumn / GridRow objects).
//   node harness/build.mjs && node harness/test.mjs
// Query parameters: rows (default 40), mode (client|server), save (auto|manual), dark=1, motion=off|subtle,
// fail=1 (next save returns ok:false with a cell error), static=1 (static attribute column), lock=1 (read-only).
import { Big } from "big.js";
import { strFromU8, unzipSync } from "fflate";
import { createRoot, Root } from "react-dom/client";
import { MxDynamicGrid } from "../src/MxDynamicGrid";

type AnyProps = Record<string, any>;
const params = new URLSearchParams(location.search);
const events: Array<{ name: string; args?: unknown }> = [];
const changeSets: string[] = [];

// ---- The "database" -------------------------------------------------------------------------------------
interface DbColumn {
    id: string;
    key: string;
    caption: string;
    type: string;
    order: number;
    width?: number;
    pinned?: string;
    hidden?: boolean;
    required?: boolean;
    readOnly?: boolean;
    options?: string;
    format?: string;
    formula?: string;
    headerGroup?: string;
    description?: string;
    validation?: string;
}
interface DbRow {
    id: string;
    key: string;
    data: Record<string, unknown>;
    order: number;
    status: string;
}
let nextId = 1;
const id = (): string => `obj${nextId++}`;
const STATUS = [
    { value: "todo", label: "To do", color: "#FEF3C7" },
    { value: "doing", label: "In progress", color: "#DBEAFE" },
    { value: "done", label: "Done", color: "#DCFCE7" }
];
const TAGS = [
    { value: "urgent", label: "Urgent", color: "#FFE4E6" },
    { value: "client", label: "Client", color: "#EDE9FE" },
    { value: "internal", label: "Internal", color: "#E5E7EB" }
];
let columns: DbColumn[] = [
    { id: id(), key: "name", caption: "Name", type: "text", order: 0, width: 180, required: true, validation: '{"unique":false}' },
    { id: id(), key: "status", caption: "Status", type: "select", order: 1, options: JSON.stringify(STATUS), headerGroup: "Tracking" },
    { id: id(), key: "tags", caption: "Tags", type: "multiSelect", order: 2, options: JSON.stringify(TAGS), headerGroup: "Tracking" },
    { id: id(), key: "price", caption: "Price", type: "currency", order: 3, format: "€ #,##0.00", validation: '{"min":0}' },
    { id: id(), key: "qty", caption: "Qty", type: "number", order: 4 },
    { id: id(), key: "total", caption: "Total", type: "formula", order: 5, formula: "[price] * [qty]", format: "#,##0.00" },
    { id: id(), key: "done", caption: "Done", type: "boolean", order: 6 },
    { id: id(), key: "due", caption: "Due", type: "date", order: 7, format: "dd-MM-yyyy" },
    { id: id(), key: "rating", caption: "Rating", type: "rating", order: 8, options: '{"max":5}' },
    { id: id(), key: "progress", caption: "Progress", type: "progress", order: 9 },
    { id: id(), key: "share", caption: "Share", type: "percent", order: 10 },
    { id: id(), key: "site", caption: "Website", type: "link", order: 11 },
    { id: id(), key: "mail", caption: "Email", type: "email", order: 12 },
    { id: id(), key: "notes", caption: "Notes", type: "longText", order: 13 },
    { id: id(), key: "owner", caption: "Owner", type: "user", order: 14 },
    { id: id(), key: "created", caption: "Created", type: "createdAt", order: 15 }
];
const ROW_COUNT = Number(params.get("rows") ?? 40);
if (params.get("empty") === "1") {
    columns = [];
}
const NAMES = ["Acme", "Globex", "Initech", "Umbrella", "Hooli", "Stark", "Wayne", "Wonka"];
let rows: DbRow[] = Array.from({ length: ROW_COUNT }, (_, i) => ({
    id: id(),
    key: `r${i + 1}`,
    order: i,
    status: i % 2 ? "Open" : "Closed",
    data: {
        name: `${NAMES[i % NAMES.length]} ${i + 1}`,
        status: STATUS[i % 3].value,
        tags: i % 4 === 0 ? ["urgent", "client"] : [TAGS[i % 3].value],
        price: 10 + (i % 7) * 2.5,
        qty: (i % 5) + 1,
        done: i % 3 === 0,
        due: `2026-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`,
        rating: i % 6,
        progress: (i * 13) % 101,
        share: ((i % 10) + 1) / 20,
        site: `www.example${i}.com`,
        mail: `info${i}@example.com`,
        notes: i % 5 === 0 ? "Long note line one\nline two" : "",
        owner: ["Ann Lee", "Bob Ray", "Cid Moe"][i % 3],
        created: "2026-01-05T09:30:00.000Z",
        ...(params.get("links") === "1" ? { contact: i % 3 === 2 ? [] : [`c${(i % 5) + 1}`] } : {})
    }
}));

// ---- 1.2 drop 2: linked rows, comments, history, locks, presence -----------------------------------------
const LINKS = params.get("links") === "1";
const COLLAB = params.get("collab") === "1";
interface DbLink {
    id: string;
    key: string;
    label: string;
    grid: string;
    data: Record<string, unknown>;
}
const CITIES = ["Berlin", "Paris", "Madrid", "Rome", "Oslo"];
const linkDb: DbLink[] = [
    ...CITIES.map((city, i) => ({ id: id(), key: `c${i + 1}`, label: `Contact ${i + 1}`, grid: "Contacts", data: { city, score: (i + 1) * 10 } })),
    ...[1, 2, 3].map(i => ({ id: id(), key: `v${i}`, label: `Vendor ${i}`, grid: "Vendors", data: { city: "Delft", score: i } }))
];
if (LINKS) {
    columns.push(
        { id: id(), key: "contact", caption: "Contacts", type: "linkedRecord", order: 16, options: JSON.stringify({ target: "Contacts", multiple: true }) },
        { id: id(), key: "contactCity", caption: "City", type: "lookup", order: 17, options: JSON.stringify({ link: "contact", field: "city" }) },
        { id: id(), key: "contactScore", caption: "Score", type: "rollup", order: 18, options: JSON.stringify({ link: "contact", field: "score", fn: "sum" }) }
    );
}
interface DbComment {
    id: string;
    key: string;
    row: string;
    col: string;
    text: string;
    author: string;
    resolved: boolean;
    date: Date;
}
const commentDb: DbComment[] = COLLAB
    ? [
          { id: id(), key: "k1", row: "r1", col: "name", text: "Please check this, @Bob Ray", author: "Cid Moe", resolved: false, date: new Date("2026-10-01T10:00:00Z") },
          { id: id(), key: "k2", row: "r1", col: "name", text: "Done", author: "Bob Ray", resolved: true, date: new Date("2026-10-02T10:00:00Z") },
          { id: id(), key: "k3", row: "r2", col: "", text: "Row level note", author: "Bob Ray", resolved: false, date: new Date("2026-10-03T10:00:00Z") }
      ]
    : [];
const historyDb = COLLAB
    ? [
          { id: id(), row: "r1", col: "price", old: "10", now: "12.5", by: "Bob Ray", op: "setCell", date: new Date("2026-10-04T08:00:00Z") },
          { id: id(), row: "r1", col: "status", old: "doing", now: "todo", by: "Cid Moe", op: "setCell", date: new Date("2026-10-05T08:00:00Z") },
          { id: id(), row: "r1", col: "", old: "", now: "", by: "Ann Lee", op: "addRow", date: new Date("2026-09-01T08:00:00Z") }
      ]
    : [];
const lockedKeys = new Set(COLLAB ? ["r4"] : []);
const changedBy = new Map<string, string>();
let presenceValue = COLLAB ? "Ann Lee, Bob Ray, Cid Moe, Dee Fox, Eli Kay, Fay Lo" : "";

// ---- Mendix value stand-ins -----------------------------------------------------------------------------
const dv = <T,>(value: T): any => ({ status: "available", value });
const big = (n: number | undefined): Big | undefined => (n === undefined ? undefined : new Big(n));
function listAttr<T>(name: string, read: (target: any) => T, type = "String"): any {
    return {
        id: `attr_${name}`,
        type,
        sortable: true,
        filterable: true,
        get: (item: { id: string }) => ({ status: "available", value: read(item), readOnly: true, displayValue: String(read(item) ?? "") }),
        formatter: { format: (v: unknown) => String(v ?? "") }
    };
}
const linkById = (item: { id: string }): DbLink | undefined => linkDb.find(l => l.id === item.id);
const commentById = (item: { id: string }): DbComment | undefined => commentDb.find(c => c.id === item.id);
const historyById = (item: { id: string }): (typeof historyDb)[number] | undefined => historyDb.find(h => h.id === item.id);
let commentCache = { sig: "", items: [] as Array<{ id: string }> };
function commentItems(): Array<{ id: string }> {
    const sig = JSON.stringify(commentDb);
    if (sig !== commentCache.sig) {
        commentCache = { sig, items: commentDb.map(c => ({ id: c.id })) };
    }
    return commentCache.items;
}
const colById = (item: { id: string }): DbColumn => columns.find(c => c.id === item.id) as DbColumn;
const rowById = (item: { id: string }): DbRow => rows.find(r => r.id === item.id) as DbRow;

function editable(initial: string): any {
    const state = { value: initial };
    return {
        state,
        make: () => ({
            status: "available",
            value: state.value,
            readOnly: false,
            validation: undefined,
            setValue: (v: string) => {
                state.value = v;
                schedule();
            }
        })
    };
}
const changeSetAttr = editable("");
const resultAttr = editable("");
const viewStateAttr = editable("");
const personalizationAttr = editable("");
const viewsAttr = editable("");
let version = 1;
let executing = false;
let failNext = params.get("fail") === "1";
let reloads = 0;

// ---- Save microflow: applies the change set like the DynamicGrid module would --------------------------
function applyChangeSet(json: string): { ok: boolean; errors: unknown[] } {
    const set = JSON.parse(json);
    for (const op of set.ops) {
        switch (op.op) {
            case "setCell": {
                const row = rows.find(r => r.key === op.row);
                if (row) {
                    row.data = { ...row.data, [op.col]: op.value };
                }
                break;
            }
            case "addRow":
                rows.splice(op.index, 0, { id: id(), key: op.row, order: op.index, status: "Open", data: { ...op.values, created: new Date().toISOString() } });
                rows.forEach((r, i) => (r.order = i));
                break;
            case "deleteRow":
                rows = rows.filter(r => r.key !== op.row);
                break;
            case "moveRow": {
                const index = rows.findIndex(r => r.key === op.row);
                const [row] = rows.splice(index, 1);
                rows.splice(op.index, 0, row);
                rows.forEach((r, i) => (r.order = i));
                break;
            }
            case "addColumn": {
                const c = op.col;
                const options = c.options || c.max !== undefined || c.defaultValue !== undefined || c.link ? JSON.stringify({ options: c.options ?? [], max: c.max, default: c.defaultValue, ...(c.link ?? {}) }) : "";
                columns.splice(c.index ?? columns.length, 0, {
                    id: id(),
                    key: c.key,
                    caption: c.caption,
                    type: c.type,
                    order: 0,
                    options,
                    format: c.format ?? "",
                    formula: c.formula ?? "",
                    headerGroup: c.headerGroup ?? "",
                    required: c.required,
                    validation: c.validation ? JSON.stringify(c.validation) : ""
                });
                columns.forEach((col, i) => (col.order = i));
                break;
            }
            case "updateColumn": {
                const col = columns.find(c => c.key === op.col);
                if (col) {
                    const p = op.patch;
                    if (p.caption !== undefined) col.caption = p.caption;
                    if (p.type !== undefined) col.type = p.type;
                    if (p.options !== undefined) col.options = JSON.stringify(p.options);
                    if (p.format !== undefined) col.format = p.format ?? "";
                    if (p.formula !== undefined) col.formula = p.formula ?? "";
                    if (p.required !== undefined) col.required = p.required;
                }
                break;
            }
            case "addComment":
                commentDb.push({ id: id(), key: op.comment.key, row: op.comment.row, col: op.comment.col ?? "", text: op.comment.text, author: "Ann Lee", resolved: false, date: new Date() });
                break;
            case "resolveComment": {
                const comment = commentDb.find(c => c.key === op.comment);
                if (comment) {
                    comment.resolved = op.resolved;
                }
                break;
            }
            case "deleteColumn":
                columns = columns.filter(c => c.key !== op.col);
                rows.forEach(r => delete r.data[op.col]);
                break;
            case "moveColumn": {
                const index = columns.findIndex(c => c.key === op.col);
                const [col] = columns.splice(index, 1);
                columns.splice(op.index, 0, col);
                columns.forEach((c, i) => (c.order = i));
                break;
            }
        }
    }
    return { ok: true, errors: [] };
}

const onSave = {
    get canExecute() {
        return true;
    },
    get isExecuting() {
        return executing;
    },
    execute: () => {
        const json = changeSetAttr.state.value;
        changeSets.push(json);
        events.push({ name: "onSave" });
        executing = true;
        schedule();
        window.setTimeout(() => {
            let result;
            if (failNext) {
                failNext = false;
                const set = JSON.parse(json);
                const cell = set.ops.find((op: any) => op.op === "setCell");
                result = { ok: false, version, errors: [{ row: cell?.row, col: cell?.col, message: "Rejected by the server (harness)" }, { message: "1 change rejected" }] };
            } else {
                applyChangeSet(json);
                version++;
                result = { ok: true, version, errors: [] };
            }
            resultAttr.state.value = JSON.stringify(result);
            executing = false;
            schedule();
        }, 120);
    }
};

// ---- Data sources ----------------------------------------------------------------------------------------
let rowLimit: number | undefined;
let rowOffset = 0;
function listValue(getItems: () => Array<{ id: string }>, isRows: boolean): any {
    const all = getItems();
    const items = isRows && rowLimit !== undefined ? all.slice(rowOffset, rowOffset + rowLimit) : all;
    return {
        status: "available",
        items,
        offset: isRows ? rowOffset : 0,
        limit: isRows ? rowLimit ?? all.length : all.length,
        totalCount: all.length,
        hasMoreItems: false,
        setLimit: (limit: number | undefined) => {
            if (isRows && limit !== rowLimit) {
                rowLimit = limit;
                schedule();
            }
        },
        setOffset: (offset: number) => {
            if (isRows && offset !== rowOffset) {
                rowOffset = offset;
                schedule();
            }
        },
        setSortOrder: () => undefined,
        setFilter: () => undefined,
        requestTotalCount: () => undefined,
        reload: () => {
            reloads++;
            schedule();
        }
    };
}
// Fresh item objects when the data changed, like Mendix after a reload.
let itemsCache = { columns: [] as Array<{ id: string }>, rows: [] as Array<{ id: string }>, sig: "" };
function items(): { columns: Array<{ id: string }>; rows: Array<{ id: string }> } {
    const sig = JSON.stringify(columns) + JSON.stringify(rows);
    if (sig !== itemsCache.sig) {
        itemsCache = { columns: columns.map(c => ({ id: c.id })), rows: rows.map(r => ({ id: r.id })), sig };
    }
    return itemsCache;
}

let selected: any[] = [];
const selection = {
    type: "Multi",
    get selection() {
        return selected;
    },
    setSelection: (next: any[]) => {
        selected = next;
        events.push({ name: "setSelection", args: next.map(e => e.id) });
        schedule();
    }
};
const rowClick = { get: (item: { id: string }) => ({ canExecute: true, isExecuting: false, execute: () => events.push({ name: "rowClick", args: item.id }) }) };
const action = (name: string): any => ({ canExecute: true, isExecuting: false, execute: () => events.push({ name }) });

function props(): AnyProps {
    const lock = params.get("lock") === "1";
    const current = items();
    return {
        name: "harnessGrid",
        class: "",
        style: undefined,
        tabIndex: 0,
        columnsSource: listValue(() => current.columns, false),
        colKey: listAttr("key", item => colById(item)?.key),
        colCaption: listAttr("caption", item => colById(item)?.caption),
        colType: listAttr("type", item => colById(item)?.type),
        colOrder: listAttr("order", item => big(colById(item)?.order), "Integer"),
        colWidth: listAttr("width", item => big(colById(item)?.width), "Integer"),
        colPinned: listAttr("pinned", item => colById(item)?.pinned),
        colHidden: listAttr("hidden", item => Boolean(colById(item)?.hidden), "Boolean"),
        colRequired: listAttr("required", item => Boolean(colById(item)?.required), "Boolean"),
        colReadOnly: listAttr("readOnly", item => Boolean(colById(item)?.readOnly), "Boolean"),
        colOptions: listAttr("options", item => colById(item)?.options),
        colFormat: listAttr("format", item => colById(item)?.format),
        colFormula: listAttr("formula", item => colById(item)?.formula),
        colHeaderGroup: listAttr("headerGroup", item => colById(item)?.headerGroup),
        colDescription: listAttr("description", item => colById(item)?.description),
        colValidation: listAttr("validation", item => colById(item)?.validation),
        colCanEdit: undefined,
        rowsSource: listValue(() => current.rows, true),
        rowKey: listAttr("rowKey", item => rowById(item)?.key),
        rowData: listAttr("rowData", item => JSON.stringify(rowById(item)?.data ?? {})),
        rowOrder: listAttr("rowOrder", item => big(rowById(item)?.order), "Integer"),
        dataMode: params.get("mode") ?? "client",
        clientThreshold: 5000,
        searchAttribute: undefined,
        viewState: params.get("mode") === "server" ? viewStateAttr.make() : undefined,
        totalCount: undefined,
        rowClass: undefined,
        emptyPlaceholder: <span className="harness-empty">Nothing here yet</span>,
        staticColumns:
            params.get("static") === "1"
                ? [
                      {
                          staticType: "attribute",
                          staticAttribute: listAttr("rowStatus", item => rowById(item)?.status),
                          staticCaption: dv("Row status"),
                          staticHeaderGroup: "",
                          staticPosition: "end",
                          staticWidth: 130,
                          staticPinned: "none",
                          staticSortable: true,
                          staticFilterable: true,
                          staticEditable: false,
                          staticAttributeName: ""
                      }
                  ]
                : [],
        selection,
        showCheckboxes: true,
        selectAllPages: true,
        changeSet: changeSetAttr.make(),
        onSave,
        result: resultAttr.make(),
        version: { status: "available", value: new Big(version), readOnly: true },
        saveMode: params.get("save") ?? "auto",
        saveDelay: 150,
        blockInvalidSave: false,
        canEditData: dv(!lock),
        canEditStructure: dv(!lock),
        canAddRows: dv(!lock),
        canDeleteRows: dv(!lock),
        canExport: dv(true),
        singleClickEdit: false,
        enterAddsRow: true,
        rangeSelection: true,
        fillHandle: true,
        rowDrag: true,
        undoLimit: 100,
        showSearch: true,
        showHeaderFilters: params.get("vb") === "0" ? params.get("filters") !== "0" : params.get("filters") === "1",
        showColumnsPanel: true,
        enableGrouping: true,
        showKeyboardHelp: true,
        showRowNumbers: true,
        showTotals: true,
        showStatusBar: true,
        pagination: params.get("paging") ?? "virtualScrolling",
        pageSize: Number(params.get("pageSize") ?? 50),
        pageSizeOptions: "25,50,100",
        exportFormats: "both",
        exportGridColors: params.get("keepcolors") !== "0",
        exportFileName: "projects-[date]",
        exportSheetName: "Projects",
        exportTitle: dv("Project list"),
        csvDelimiter: "comma",
        csvBom: true,
        csvDates: "iso",
        csvEscapeFormulas: true,
        allowImport: true,
        personalization: personalizationAttr.make(),
        onPersonalizationChange: action("personalizationChange"),
        views: viewsAttr.make(),
        onViewsChange: action("viewsChange"),
        viewOwner: dv("Ann Lee"),
        colorScheme: params.get("dark") === "1" ? "dark" : "light",
        accentColor: "#264AE5",
        density: "normal",
        height: "640px",
        motion: params.get("motion") ?? "full",
        showViewBar: params.get("vb") !== "0",
        showViewTabs: true,
        // ?tb=hide,filter,... turns those toolbar items off (hide, filter, sort, group, color, height, more, export, newrow)
        showHideFieldsButton: !(params.get("tb") ?? "").split(",").includes("hide"),
        showFilterButton: !(params.get("tb") ?? "").split(",").includes("filter"),
        showSortButton: !(params.get("tb") ?? "").split(",").includes("sort"),
        showGroupButton: !(params.get("tb") ?? "").split(",").includes("group"),
        showColorButton: !(params.get("tb") ?? "").split(",").includes("color"),
        showRowHeightButton: !(params.get("tb") ?? "").split(",").includes("height"),
        showMoreMenu: !(params.get("tb") ?? "").split(",").includes("more"),
        showExportButton: !(params.get("tb") ?? "").split(",").includes("export"),
        showNewRowButton: !(params.get("tb") ?? "").split(",").includes("newrow"),
        freezeFirstColumn: params.get("vb") !== "0",
        showTemplates: true,
        showHints: params.get("hints") === "1",
        allowViewTypes: true,
        showCommandPalette: true,
        refreshInterval: Number(params.get("refresh") ?? 0),
        linkSource: LINKS ? listValue(() => linkDb.map(l => ({ id: l.id })), false) : undefined,
        linkKey: listAttr("linkKey", item => linkById(item)?.key),
        linkLabel: listAttr("linkLabel", item => linkById(item)?.label),
        linkData: listAttr("linkData", item => JSON.stringify(linkById(item)?.data ?? {})),
        linkGrid: listAttr("linkGrid", item => linkById(item)?.grid),
        commentsSource: COLLAB ? listValue(() => commentItems(), false) : undefined,
        commentKey: listAttr("commentKey", item => commentById(item)?.key),
        commentRow: listAttr("commentRow", item => commentById(item)?.row),
        commentCol: listAttr("commentCol", item => commentById(item)?.col),
        commentText: listAttr("commentText", item => commentById(item)?.text),
        commentAuthor: listAttr("commentAuthor", item => commentById(item)?.author),
        commentResolved: listAttr("commentResolved", item => Boolean(commentById(item)?.resolved), "Boolean"),
        commentDate: listAttr("commentDate", item => commentById(item)?.date, "DateTime"),
        historySource: COLLAB ? listValue(() => historyDb.map(h => ({ id: h.id })), false) : undefined,
        historyRow: listAttr("historyRow", item => historyById(item)?.row),
        historyCol: listAttr("historyCol", item => historyById(item)?.col),
        historyOld: listAttr("historyOld", item => historyById(item)?.old),
        historyNew: listAttr("historyNew", item => historyById(item)?.now),
        historyBy: listAttr("historyBy", item => historyById(item)?.by),
        historyOp: listAttr("historyOp", item => historyById(item)?.op),
        historyDate: listAttr("historyDate", item => historyById(item)?.date, "DateTime"),
        rowChangedBy: COLLAB ? listAttr("changedBy", item => changedBy.get(rowById(item)?.key) ?? "") : undefined,
        rowChangedAt: undefined,
        rowLocked: COLLAB ? listAttr("locked", item => lockedKeys.has(rowById(item)?.key), "Boolean") : undefined,
        presence: COLLAB ? { status: "available", value: presenceValue, readOnly: true } : undefined,
        heightMode: params.get("height") ?? (params.get("vb") === "0" ? "fixed" : "auto"),
        maxHeight: "640px",
        rowHeight: params.get("rh") ?? "medium",
        onRowClick: rowClick,
        beforeExport: action("beforeExport"),
        afterExport: action("afterExport")
    };
}

const container = document.getElementById("root") as HTMLElement;
if (params.get("dark") === "1") {
    document.body.style.background = "#14161b";
}
let root: Root | undefined = createRoot(container);
function render(): void {
    root?.render(<MxDynamicGrid {...(props() as any)} />);
}
let pending = false;
function schedule(): void {
    if (!pending) {
        pending = true;
        queueMicrotask(() => {
            pending = false;
            render();
        });
    }
}

// Captures downloads (exports) so the test can inspect the files.
const downloads: Array<{ name: string; text: string; files?: Record<string, string> }> = [];
const originalCreate = URL.createObjectURL.bind(URL);
let lastBlob: Blob | undefined;
URL.createObjectURL = (blob: Blob) => {
    lastBlob = blob;
    return originalCreate(blob);
};
HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
    const name = this.download;
    const blob = lastBlob;
    if (!blob || !name) {
        return;
    }
    blob.arrayBuffer().then(buffer => {
        const bytes = new Uint8Array(buffer);
        let text: string;
        let files: Record<string, string> | undefined;
        if (name.endsWith(".xlsx")) {
            files = {};
            Object.entries(unzipSync(bytes)).forEach(([path, content]) => ((files as Record<string, string>)[path] = strFromU8(content)));
            text = files["xl/worksheets/sheet1.xml"];
        } else {
            text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
        }
        downloads.push({ name, text, files });
    });
};

// Print: capture the hidden frame's document and stub its print().
const prints: string[] = [];
new MutationObserver(records =>
    records.forEach(record =>
        record.addedNodes.forEach(node => {
            if (node instanceof HTMLIFrameElement) {
                window.setTimeout(() => {
                    const win = node.contentWindow as any;
                    if (win) {
                        win.print = () => prints.push(node.contentDocument?.documentElement.outerHTML ?? "");
                    }
                }, 10);
            }
        })
    )
).observe(document.body, { childList: true });

(window as any).harness = {
    events,
    downloads,
    changeSets,
    db: () => ({ columns, rows }),
    reloads: () => reloads,
    failNext: () => (failNext = true),
    viewState: () => viewStateAttr.state.value,
    personalization: () => personalizationAttr.state.value,
    rerender: render,
    comments: () => commentDb,
    /** Simulates another user changing a row (picked up by the next render / poll). */
    externalEdit: (row: string, col: string, value: unknown, by: string) => {
        const target = rows.find(r => r.key === row);
        if (target) {
            target.data = { ...target.data, [col]: value };
            changedBy.set(row, by);
            schedule();
        }
    },
    setPresence: (text: string) => {
        presenceValue = text;
        schedule();
    },
    prints
};

render();
