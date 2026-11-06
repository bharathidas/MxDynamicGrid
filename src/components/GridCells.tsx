import { ReactElement, ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import type { CustomCellRendererProps, CustomHeaderProps } from "ag-grid-react";

import { CellView } from "./CellRenderers";
import { Icon } from "./Icon";
import type { GridContextStore } from "../utils/gridContext";
import type { GridItem } from "../utils/gridItem";
import { fill } from "../utils/texts";
import { formatValue } from "../utils/values";
import type { CellValue } from "../utils/types";

function useStore(store: GridContextStore): void {
    useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
}

/** Cell of a dynamic or static attribute column. */
export function DataCell(props: CustomCellRendererProps<GridItem>): ReactElement | null {
    const store = props.context as GridContextStore;
    useStore(store);
    const ctx = store.state;
    const colId = props.column?.getColId() ?? "";
    const column = ctx.columnOf(colId);
    const row = props.data?.row;
    if (!column || !row) {
        return null;
    }
    const value = row.values[colId] as CellValue | undefined;
    const quick =
        (column.type === "boolean" || column.type === "rating") && ctx.canEditCell(row.key, colId)
            ? (next: CellValue) => ctx.quickSet(row.key, colId, next)
            : undefined;
    const comments = ctx.commentCount(row.key, colId);
    const view = (
        <CellView column={column} value={value} onQuickChange={quick} pendingText={row.pending ? "…" : undefined} />
    );
    if (!comments) {
        return view;
    }
    return (
        <>
            {view}
            <button
                type="button"
                className="mxt-dg-cmark"
                tabIndex={-1}
                aria-label={`${ctx.texts.textComments} (${comments})`}
                title={`${ctx.texts.textComments} (${comments})`}
                data-comment-marker={`${row.key}:${colId}`}
                onClick={event => {
                    event.stopPropagation();
                    const rect = event.currentTarget.getBoundingClientRect();
                    ctx.openComments(row.key, colId, {
                        rect: {
                            left: rect.left,
                            top: rect.top,
                            right: rect.right,
                            bottom: rect.bottom,
                            width: rect.width,
                            height: rect.height
                        }
                    });
                }}
            />
        </>
    );
}

/** Custom content of a static column: rendered by the container with the Mendix widgets of the row. */
export function StaticContentCell(props: CustomCellRendererProps<GridItem>): ReactNode {
    const store = props.context as GridContextStore;
    const row = props.data?.row;
    if (!row) {
        return null;
    }
    return store.state.staticCell(row.key, props.column?.getColId() ?? "") as ReactNode;
}

/** Row number; on hover (or when selected) it turns into a checkbox, plus the expand-record button. */
export function RowNumberCell(props: CustomCellRendererProps<GridItem>): ReactElement | null {
    const store = props.context as GridContextStore;
    useStore(store);
    const row = props.data?.row;
    const node = props.node;
    const [selected, setSelected] = useState(() => Boolean(node?.isSelected()));
    useEffect(() => {
        if (!node) {
            return;
        }
        const update = (): void => setSelected(Boolean(node.isSelected()));
        node.addEventListener("rowSelected", update);
        update();
        return () => node.removeEventListener("rowSelected", update);
    }, [node]);
    if (!row) {
        return null;
    }
    const ctx = store.state;
    const index = ctx.rowNumberOf(row.key) ?? (node.rowIndex ?? 0) + 1;
    const checkbox = ctx.hoverCheckbox && ctx.rowSelectable;
    return (
        <span className={`mxt-dg-rownum${checkbox ? " mxt-dg-rownum--select" : ""}${selected ? " is-selected" : ""}`}>
            {ctx.isLocked(row.key) ? (
                <span className="mxt-dg-rownum__lock" title={ctx.texts.textLocked} aria-label={ctx.texts.textLocked}>
                    <Icon name="lock" size={12} />
                </span>
            ) : (
                <span className="mxt-dg-rownum__n">{row.pending ? "•" : index}</span>
            )}
            {ctx.updatedBy(row.key) !== undefined && (
                <span
                    className="mxt-dg-rownum__updated"
                    title={ctx.texts.textUpdatedBy.replace("[name]", ctx.updatedBy(row.key) || "…")}
                    data-updated-by={ctx.updatedBy(row.key)}
                />
            )}
            {ctx.commentCount(row.key, null) > 0 && (
                <span className="mxt-dg-rownum__comments" title={ctx.texts.textComments}>
                    <Icon name="comment" size={11} />
                </span>
            )}
            {checkbox && (
                <input
                    type="checkbox"
                    className="mxt-dg-rownum__check"
                    tabIndex={-1}
                    checked={selected}
                    aria-label={`${ctx.texts.textSelected.replace("[count]", "")} ${index}`.trim()}
                    data-action="select-row"
                    onClick={event => event.stopPropagation()}
                    onChange={event => node.setSelected(event.target.checked, false, "checkboxSelected")}
                />
            )}
            <button
                type="button"
                className="mxt-dg-rownum__expand"
                tabIndex={-1}
                aria-label={ctx.texts.textExpandRow}
                title={ctx.texts.textExpandRow}
                data-action="expand-row"
                onClick={event => {
                    event.stopPropagation();
                    ctx.openRecord(row.key);
                }}
            >
                <Icon name="expand" size={13} />
            </button>
        </span>
    );
}

/** Header of the row-number column: a select-all checkbox (multi selection). */
export function RowNumberHeader(props: CustomHeaderProps): ReactElement {
    const store = props.context as GridContextStore;
    useStore(store);
    const [state, setState] = useState<"none" | "some" | "all">("none");
    const api = props.api;
    useEffect(() => {
        const update = (): void => {
            let total = 0;
            let count = 0;
            api.forEachNodeAfterFilter(node => {
                if (node.data?.row) {
                    total++;
                    if (node.isSelected()) {
                        count++;
                    }
                }
            });
            setState(count === 0 ? "none" : count === total ? "all" : "some");
        };
        api.addEventListener("selectionChanged", update);
        api.addEventListener("modelUpdated", update);
        update();
        return () => {
            if (!api.isDestroyed()) {
                api.removeEventListener("selectionChanged", update);
                api.removeEventListener("modelUpdated", update);
            }
        };
    }, [api]);
    const ctx = store.state;
    if (!ctx.hoverCheckbox || !ctx.rowSelectable) {
        return <span className="mxt-dg-rownum-head">#</span>;
    }
    return (
        <span className="mxt-dg-rownum-head">
            <input
                type="checkbox"
                className="mxt-dg-rownum__check mxt-dg-rownum__check--all"
                checked={state === "all"}
                ref={element => {
                    if (element) {
                        element.indeterminate = state === "some";
                    }
                }}
                aria-label={ctx.texts.textSelectAll}
                data-action="select-all"
                onChange={event => (event.target.checked ? api.selectAll("filtered") : api.deselectAll())}
            />
        </span>
    );
}

/** Full-width rows: group headers and the inline "+ New row". */
export function FullWidthRow(props: CustomCellRendererProps<GridItem>): ReactElement | null {
    const store = props.context as GridContextStore;
    if (props.data?.newRow) {
        return (
            <button
                type="button"
                className="mxt-dg-newrow"
                data-action="new-row-inline"
                onClick={() => store.state.addRow()}
            >
                <Icon name="plus" size={14} />
                <span>{store.state.texts.textNewRow}</span>
            </button>
        );
    }
    return <GroupRowRenderer {...props} />;
}

/** Full-width group header row. */
export function GroupRowRenderer(props: CustomCellRendererProps<GridItem>): ReactElement | null {
    const store = props.context as GridContextStore;
    useStore(store);
    const group = props.data?.group;
    if (!group) {
        return null;
    }
    const ctx = store.state;
    const column = ctx.columnOf(group.col);
    const aggregates = Object.entries(group.aggregates).filter(([, value]) => value !== null && value !== undefined);
    return (
        <div className="mxt-dg-group" style={{ paddingInlineStart: 12 + group.level * 24 }} data-path={group.path}>
            <button
                type="button"
                className={`mxt-dg-group__toggle${group.collapsed ? "" : " is-open"}`}
                aria-expanded={!group.collapsed}
                aria-label={group.label}
                onClick={() => ctx.toggleGroup(group.path)}
            >
                <Icon name="chevronRight" size={14} />
            </button>
            <span className="mxt-dg-group__caption">{column?.caption}</span>
            <span className="mxt-dg-group__label">{group.label}</span>
            <span className="mxt-dg-group__count">{group.count}</span>
            <span className="mxt-dg-group__aggs">
                {aggregates.map(([key, value]) => {
                    const target = ctx.columnOf(key);
                    if (!target) {
                        return null;
                    }
                    return (
                        <span key={key} className="mxt-dg-group__agg">
                            <span className="mxt-dg-group__aggname">{target.caption}</span>
                            {typeof value !== "number"
                                ? formatValue(target, value)
                                : ["currency", "decimal", "number", "percent"].includes(target.type)
                                ? formatValue(target, value)
                                : formatValue({ ...target, type: "decimal", format: "#,##0.#" }, value)}
                        </span>
                    );
                })}
            </span>
            <span className="mxt-dg-sr">{fill(ctx.texts.textRows, { count: group.count })}</span>
        </div>
    );
}

/** Summary bar cell (pinned bottom row): shows the function and value; click to choose the function. */
export function TotalsCell(props: CustomCellRendererProps<GridItem>): ReactElement | null {
    const store = props.context as GridContextStore;
    const value = props.value as { label: string; value: string } | undefined;
    const colId = props.column?.getColId() ?? "";
    const pickable = Boolean(store.state.columnOf(colId));
    const content =
        value && (value.label || value.value) ? (
            <>
                {value.label && <span className="mxt-dg-total__fn">{value.label}</span>}
                <span className="mxt-dg-total__value">{value.value}</span>
            </>
        ) : pickable ? (
            <span className="mxt-dg-total__hint">{store.state.texts.textSummarize}</span>
        ) : null;
    if (!pickable) {
        return <span className="mxt-dg-total mxt-dg-total--label">{content}</span>;
    }
    return (
        <button
            type="button"
            className="mxt-dg-total"
            data-summary={colId}
            tabIndex={-1}
            onClick={event => {
                const rect = event.currentTarget.getBoundingClientRect();
                store.state.openSummary(colId, {
                    rect: {
                        left: rect.left,
                        top: rect.top,
                        right: rect.right,
                        bottom: rect.bottom,
                        width: rect.width,
                        height: rect.height
                    }
                });
            }}
        >
            {content}
        </button>
    );
}
