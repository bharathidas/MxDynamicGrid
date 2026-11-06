import { ReactElement, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CustomHeaderProps } from "ag-grid-react";

import { Icon } from "./Icon";
import { anchorOf, Popover, Anchor } from "./Popover";
import { typeInfo } from "../utils/columnTypes";
import type { GridContextStore } from "../utils/gridContext";
import { ColumnFilter, FilterOp, isActiveFilter } from "../utils/pipeline";
import { fill, typeLabel } from "../utils/texts";
import type { ColumnDef } from "../utils/types";

/** Column header: type icon, caption (double-click renames), sort, header filter (Data Grid 2 style) and menu. */

function useStore(store: GridContextStore): void {
    useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
}

export function HeaderCell(props: CustomHeaderProps): ReactElement {
    const store = props.context as GridContextStore;
    useStore(store);
    const ctx = store.state;
    const colId = props.column.getColId();
    const column = ctx.columnOf(colId);
    const [renaming, setRenaming] = useState(false);
    const [name, setName] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const menuRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (renaming) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [renaming]);
    if (!column) {
        return <span className="mxt-dg-header">{props.displayName}</span>;
    }
    const isStatic = colId.startsWith("__static");
    const sortIndex = ctx.sort.findIndex(entry => entry.col === colId);
    const sort = sortIndex >= 0 ? ctx.sort[sortIndex].dir : undefined;
    const filter = ctx.filters[colId];
    const commitRename = (): void => {
        setRenaming(false);
        if (name.trim() && name.trim() !== column.caption) {
            ctx.onRename(colId, name.trim());
        }
    };
    const grouped = ctx.groupBy.includes(colId);
    return (
        <div
            className={`mxt-dg-header${sort ? " is-sorted" : ""}${isActiveFilter(filter) ? " is-filtered" : ""}${
                grouped ? " is-grouped" : ""
            }`}
            title={column.description || undefined}
            data-col={colId}
        >
            <div className="mxt-dg-header__top">
                <span className="mxt-dg-header__type" title={typeLabel(ctx.texts, column.type)}>
                    <Icon name={typeInfo(column.type).icon} size={14} />
                </span>
                {renaming ? (
                    <input
                        ref={inputRef}
                        className="mxt-dg-header__rename"
                        value={name}
                        aria-label={ctx.texts.textRename}
                        onChange={event => setName(event.target.value)}
                        onBlur={commitRename}
                        onKeyDown={event => {
                            event.stopPropagation();
                            if (event.key === "Enter") {
                                commitRename();
                            } else if (event.key === "Escape") {
                                setRenaming(false);
                            }
                        }}
                    />
                ) : (
                    <button
                        type="button"
                        className="mxt-dg-header__caption"
                        onClick={event => {
                            const multi = event.shiftKey || event.ctrlKey || event.metaKey;
                            if (ctx.openFieldMenuOnClick && !isStatic && !multi) {
                                const anchor = anchorOf(event.currentTarget);
                                if (anchor) {
                                    ctx.openMenu(colId, anchor);
                                }
                                return;
                            }
                            ctx.onSort(colId, multi);
                        }}
                        onDoubleClick={() => {
                            if (ctx.canEditStructure && !isStatic) {
                                setName(column.caption);
                                setRenaming(true);
                            }
                        }}
                    >
                        <span className="mxt-dg-header__text">{column.caption}</span>
                        {column.required && (
                            <span className="mxt-dg-header__req" aria-hidden>
                                *
                            </span>
                        )}
                        {column.description && (
                            <span
                                className="mxt-dg-header__info"
                                title={column.description}
                                aria-label={column.description}
                            >
                                i
                            </span>
                        )}
                        {sort && (
                            <span
                                className="mxt-dg-header__sort"
                                aria-label={sort === "asc" ? ctx.texts.textSortAsc : ctx.texts.textSortDesc}
                            >
                                <Icon name={sort === "asc" ? "sortAsc" : "sortDesc"} size={13} />
                                {ctx.sort.length > 1 && <sup>{sortIndex + 1}</sup>}
                            </span>
                        )}
                    </button>
                )}
                {!isStatic && (
                    <button
                        ref={menuRef}
                        type="button"
                        className="mxt-dg-header__menu"
                        aria-label={`${column.caption} menu`}
                        aria-haspopup="menu"
                        onClick={() => {
                            const anchor = anchorOf(menuRef.current);
                            if (anchor) {
                                ctx.openMenu(colId, anchor);
                            }
                        }}
                    >
                        <Icon name="chevronDown" size={14} />
                    </button>
                )}
            </div>
            {ctx.showFilters && (
                <div className="mxt-dg-header__filter" onKeyDown={event => event.stopPropagation()}>
                    <HeaderFilter store={store} column={column} colId={colId} filter={filter} />
                </div>
            )}
        </div>
    );
}

const TEXT_OPS: FilterOp[] = ["contains", "equals", "notEquals", "startsWith", "empty", "notEmpty"];

function HeaderFilter({
    store,
    column,
    colId,
    filter
}: {
    store: GridContextStore;
    column: ColumnDef;
    colId: string;
    filter?: ColumnFilter;
}): ReactElement {
    const ctx = store.state;
    const t = ctx.texts;
    const kind = typeInfo(column.type).filter;
    const [popover, setPopover] = useState<Anchor | undefined>();
    const buttonRef = useRef<HTMLButtonElement>(null);
    const set = (next: ColumnFilter | undefined): void =>
        ctx.onFilter(colId, next && isActiveFilter(next) ? next : undefined);
    const opLabel: Record<string, string> = {
        contains: t.textFilterContains,
        equals: t.textFilterEquals,
        notEquals: t.textFilterNotEquals,
        startsWith: t.textFilterStartsWith,
        empty: t.textFilterEmpty,
        notEmpty: t.textFilterNotEmpty
    };
    const openPopover = (): void => setPopover(anchorOf(buttonRef.current));

    if (kind === "boolean") {
        const value = filter?.op === "is" ? (filter.value ? "yes" : "no") : filter?.op ?? "";
        return (
            <select
                className="mxt-dg-filter-input"
                value={value}
                aria-label={`${t.textFilter} ${column.caption}`}
                onChange={event => {
                    const v = event.target.value;
                    set(
                        v === "yes"
                            ? { op: "is", value: true }
                            : v === "no"
                            ? { op: "is", value: false }
                            : v
                            ? { op: v as FilterOp }
                            : undefined
                    );
                }}
            >
                <option value="">{t.textFilterAny}</option>
                <option value="yes">{t.textFilterYes}</option>
                <option value="no">{t.textFilterNo}</option>
                <option value="empty">{t.textFilterEmpty}</option>
            </select>
        );
    }

    if (kind === "set") {
        const count = filter?.op === "in" ? filter.values?.length ?? 0 : 0;
        return (
            <>
                <button
                    ref={buttonRef}
                    type="button"
                    className={`mxt-dg-filter-input mxt-dg-filter-set${filter ? " is-active" : ""}`}
                    aria-haspopup="dialog"
                    aria-label={`${t.textFilter} ${column.caption}`}
                    onClick={openPopover}
                >
                    <span>
                        {filter?.op === "in"
                            ? fill(t.textSelected, { count })
                            : filter
                            ? opLabel[filter.op] ?? ""
                            : t.textFilterAny}
                    </span>
                    <Icon name="chevronDown" size={12} />
                </button>
                {popover && (
                    <Popover
                        anchor={popover}
                        onClose={() => setPopover(undefined)}
                        className="mxt-dg-setfilter"
                        label={column.caption}
                    >
                        <SetFilterList store={store} colId={colId} filter={filter} onChange={set} />
                    </Popover>
                )}
            </>
        );
    }

    if (kind === "number" || kind === "date") {
        return <RangeFilter column={column} kind={kind} filter={filter} set={set} texts={t} opLabel={opLabel} />;
    }

    const op = filter?.op ?? "contains";
    const needsValue = op !== "empty" && op !== "notEmpty";
    return (
        <span className="mxt-dg-filter-text">
            <button
                ref={buttonRef}
                type="button"
                className={`mxt-dg-filter-op${op !== "contains" ? " is-active" : ""}`}
                aria-label={opLabel[op]}
                title={opLabel[op]}
                onClick={openPopover}
            >
                <Icon name="filter" size={12} />
            </button>
            <input
                className="mxt-dg-filter-input"
                value={needsValue ? String(filter?.value ?? "") : opLabel[op]}
                disabled={!needsValue}
                aria-label={`${t.textFilter} ${column.caption}`}
                onChange={event => set({ op, value: event.target.value })}
            />
            {popover && (
                <Popover anchor={popover} onClose={() => setPopover(undefined)} className="mxt-dg-menu" role="menu">
                    {TEXT_OPS.map(candidate => (
                        <button
                            key={candidate}
                            type="button"
                            role="menuitemradio"
                            aria-checked={candidate === op}
                            className={`mxt-dg-menu__item${candidate === op ? " is-selected" : ""}`}
                            onClick={() => {
                                setPopover(undefined);
                                set({ op: candidate, value: filter?.value ?? "" });
                            }}
                        >
                            <span className="mxt-dg-menu__label">{opLabel[candidate]}</span>
                        </button>
                    ))}
                </Popover>
            )}
        </span>
    );
}

export function SetFilterList({
    store,
    colId,
    filter,
    onChange
}: {
    store: GridContextStore;
    colId: string;
    filter?: ColumnFilter;
    onChange: (filter: ColumnFilter | undefined) => void;
}): ReactElement {
    const ctx = store.state;
    const t = ctx.texts;
    const [query, setQuery] = useState("");
    const values = ctx.distinct(colId);
    const all = values.map(entry => entry.key);
    const selected = new Set(filter?.op === "in" ? filter.values ?? [] : all);
    const shown = values.filter(entry => !query || entry.label.toLowerCase().includes(query.toLowerCase()));
    const apply = (next: Set<string>): void => {
        if (next.size === all.length) {
            onChange(undefined);
        } else {
            onChange({ op: "in", values: Array.from(next) });
        }
    };
    return (
        <div className="mxt-dg-setlist">
            <input
                className="form-control mxt-dg-setlist__search"
                value={query}
                autoFocus
                placeholder={t.textSearchValues}
                aria-label={t.textSearchValues}
                onChange={event => setQuery(event.target.value)}
            />
            <label className="mxt-dg-setlist__item mxt-dg-setlist__all">
                <input
                    type="checkbox"
                    checked={selected.size === all.length}
                    ref={element => {
                        if (element) {
                            element.indeterminate = selected.size > 0 && selected.size < all.length;
                        }
                    }}
                    onChange={event => apply(event.target.checked ? new Set(all) : new Set())}
                />
                {t.textSelectAll}
            </label>
            <div className="mxt-dg-setlist__items">
                {shown.map(entry => (
                    <label key={entry.key} className="mxt-dg-setlist__item">
                        <input
                            type="checkbox"
                            checked={selected.has(entry.key)}
                            onChange={() => {
                                const next = new Set(selected);
                                if (next.has(entry.key)) {
                                    next.delete(entry.key);
                                } else {
                                    next.add(entry.key);
                                }
                                apply(next);
                            }}
                        />
                        {entry.color ? (
                            <span className="mxt-dg-chip" style={{ ["--mxt-dg-chip" as string]: entry.color }}>
                                {entry.label || t.textBlanks}
                            </span>
                        ) : (
                            <span>{entry.label || t.textBlanks}</span>
                        )}
                        <span className="mxt-dg-setlist__count">{entry.count}</span>
                    </label>
                ))}
            </div>
            <button type="button" className="btn btn-default mxt-dg-btn" onClick={() => onChange(undefined)}>
                {t.textClearFilter}
            </button>
        </div>
    );
}

/** The "+" header at the end of the dynamic columns. */
export function AddColumnHeader(props: CustomHeaderProps): ReactElement | null {
    const store = props.context as GridContextStore;
    useStore(store);
    const ref = useRef<HTMLButtonElement>(null);
    if (!store.state.canEditStructure) {
        return null;
    }
    return (
        <button
            ref={ref}
            type="button"
            className={`mxt-dg-addcol${store.state.showAddLabel ? " mxt-dg-addcol--label" : ""}`}
            aria-label={store.state.texts.textAddColumn}
            title={store.state.texts.textAddColumn}
            data-action="add-column"
            onClick={() => {
                const anchor = anchorOf(ref.current);
                if (anchor) {
                    store.state.openAddColumn(anchor);
                }
            }}
        >
            <Icon name="plus" size={15} />
            {store.state.showAddLabel && <span className="mxt-dg-addcol__label">{store.state.texts.textAddField}</span>}
        </button>
    );
}

/** Width (px) below which range filters collapse into one button with a popover. */
const NARROW_RANGE = 200;

function useWidth(ref: { current: HTMLElement | null }): number {
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const element = ref.current;
        if (!element) {
            return;
        }
        setWidth(element.getBoundingClientRect().width);
        if (typeof ResizeObserver === "undefined") {
            return;
        }
        const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
        observer.observe(element);
        return () => observer.disconnect();
    }, [ref]);
    return width;
}

/** Number and date range filter: two inputs on wide columns, a summary button with a popover on narrow ones. */
function RangeFilter({
    column,
    kind,
    filter,
    set,
    texts: t,
    opLabel
}: {
    column: ColumnDef;
    kind: "number" | "date";
    filter?: ColumnFilter;
    set: (next: ColumnFilter | undefined) => void;
    texts: GridContextStore["state"]["texts"];
    opLabel: Record<string, string>;
}): ReactElement {
    const wrapRef = useRef<HTMLSpanElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [popover, setPopover] = useState<Anchor | undefined>();
    const width = useWidth(wrapRef);
    const inputType = kind === "date" ? "date" : "number";
    const from = filter?.op === "between" ? filter.value ?? "" : "";
    const to = filter?.op === "between" ? filter.value2 ?? "" : "";
    const update = (a: unknown, b: unknown): void =>
        set({
            op: "between",
            value: a === "" ? null : inputType === "number" ? Number(a) : String(a),
            value2: b === "" ? null : inputType === "number" ? Number(b) : String(b)
        });
    const fromInput = (
        <input
            className="mxt-dg-filter-input"
            type={inputType}
            value={String(from)}
            placeholder="≥"
            aria-label={`${column.caption} ${t.textFilterFrom}`}
            onChange={event => update(event.target.value, to)}
        />
    );
    const toInput = (
        <input
            className="mxt-dg-filter-input"
            type={inputType}
            value={String(to)}
            placeholder="≤"
            aria-label={`${column.caption} ${t.textFilterTo}`}
            onChange={event => update(from, event.target.value)}
        />
    );
    const summary = !filter
        ? t.textFilterAny
        : filter.op === "between"
        ? [from !== "" ? `≥ ${from}` : "", to !== "" ? `≤ ${to}` : ""].filter(Boolean).join(" ")
        : opLabel[filter.op] ?? "";
    const narrow = width > 0 && width < NARROW_RANGE;
    return (
        <span ref={wrapRef} className="mxt-dg-filter-range" data-narrow={narrow || undefined}>
            {narrow ? (
                <button
                    ref={buttonRef}
                    type="button"
                    className={`mxt-dg-filter-input mxt-dg-filter-set${filter ? " is-active" : ""}`}
                    aria-haspopup="dialog"
                    aria-label={`${t.textFilter} ${column.caption}`}
                    onClick={() => setPopover(anchorOf(buttonRef.current))}
                >
                    <span>{summary}</span>
                    <Icon name="chevronDown" size={12} />
                </button>
            ) : (
                <>
                    {fromInput}
                    {toInput}
                </>
            )}
            {popover && (
                <Popover
                    anchor={popover}
                    onClose={() => setPopover(undefined)}
                    className="mxt-dg-rangepop"
                    label={column.caption}
                >
                    <label className="mxt-dg-field">
                        <span className="mxt-dg-field__label">{t.textFilterFrom}</span>
                        {fromInput}
                    </label>
                    <label className="mxt-dg-field">
                        <span className="mxt-dg-field__label">{t.textFilterTo}</span>
                        {toInput}
                    </label>
                    <div className="mxt-dg-rangepop__ops">
                        {(["empty", "notEmpty"] as FilterOp[]).map(op => (
                            <button
                                key={op}
                                type="button"
                                className={`mxt-dg-choice${filter?.op === op ? " is-selected" : ""}`}
                                onClick={() => set(filter?.op === op ? undefined : { op })}
                            >
                                {opLabel[op]}
                            </button>
                        ))}
                        <button type="button" className="mxt-dg-linkbtn" onClick={() => set(undefined)}>
                            {t.textClearFilter}
                        </button>
                    </div>
                </Popover>
            )}
            {!narrow && (
                <button
                    type="button"
                    className={`mxt-dg-filter-op${filter && filter.op !== "between" ? " is-active" : ""}`}
                    aria-label={t.textFilterEmpty}
                    title={filter && filter.op !== "between" ? opLabel[filter.op] : t.textFilterEmpty}
                    onClick={() =>
                        set(
                            filter?.op === "empty"
                                ? { op: "notEmpty" }
                                : filter?.op === "notEmpty"
                                ? undefined
                                : { op: "empty" }
                        )
                    }
                >
                    {filter?.op === "empty" ? "∅" : filter?.op === "notEmpty" ? "≠∅" : "·"}
                </button>
            )}
        </span>
    );
}
