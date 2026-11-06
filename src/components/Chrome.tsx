import { ReactElement, useEffect, useRef, useState } from "react";

import { Icon } from "./Icon";
import { Dialog } from "./Popover";
import { fill, Texts } from "../utils/texts";

/** Status bar, pager, toasts, keyboard help and the animated counter. */

/** Counts up/down to the value with requestAnimationFrame (instant when motion is off). */
export function useAnimatedNumber(value: number, animate: boolean): number {
    const [shown, setShown] = useState(value);
    const fromRef = useRef(value);
    useEffect(() => {
        if (!animate || typeof window.requestAnimationFrame !== "function" || Math.abs(value - fromRef.current) < 1) {
            fromRef.current = value;
            setShown(value);
            return;
        }
        const from = fromRef.current;
        const start = performance.now();
        const duration = 380;
        let frame = 0;
        const step = (now: number): void => {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            setShown(Math.round(from + (value - from) * eased));
            if (t < 1) {
                frame = window.requestAnimationFrame(step);
            } else {
                fromRef.current = value;
            }
        };
        frame = window.requestAnimationFrame(step);
        return () => {
            window.cancelAnimationFrame(frame);
            fromRef.current = value;
        };
    }, [value, animate]);
    return shown;
}

export function Counter({
    value,
    animate,
    format
}: {
    value: number;
    animate: boolean;
    format?: (n: number) => string;
}): ReactElement {
    const shown = useAnimatedNumber(value, animate);
    return <span className="mxt-dg-counter">{format ? format(shown) : shown.toLocaleString()}</span>;
}

export interface StatusBarProps {
    texts: Texts;
    animate: boolean;
    shown: number;
    /** The summary bar already shows the row count. */
    hideRows?: boolean;
    total: number;
    selected: number;
    range?: { count: number; sum?: number; avg?: number; min?: number; max?: number; numbers: number };
    saveState: ReactElement | null;
    issues: number;
    onIssues?: () => void;
    selectAllPages?: () => void;
    onClearSelection?: () => void;
    formatNumber: (n: number) => string;
}

/** The word after the animated counter: "rows", or "row" for one row when the text starts with the count. */
export function rowsLabel(text: string, total: number): string {
    const one = fill(text, { count: "1" });
    return total === 1 && one.startsWith("1 ") ? one.slice(2).trim() : fill(text, { count: "" }).trim();
}

export function StatusBar(props: StatusBarProps): ReactElement {
    const { texts: t, animate } = props;
    return (
        <div className="mxt-dg-status" role="status" aria-live="polite">
            <span className={props.hideRows ? "mxt-dg-sr" : "mxt-dg-status__item"} data-status="rows">
                {props.shown === props.total ? (
                    <>
                        <Counter value={props.total} animate={animate} /> {rowsLabel(t.textRows, props.total)}
                    </>
                ) : (
                    fill(t.textRowsOf, { count: props.shown.toLocaleString(), total: props.total.toLocaleString() })
                )}
            </span>
            {props.selected > 0 && (
                <span className="mxt-dg-status__item" data-status="selected">
                    {fill(t.textSelected, { count: props.selected })}
                    {props.selectAllPages && (
                        <button type="button" className="mxt-dg-linkbtn" onClick={props.selectAllPages}>
                            {fill(t.textSelectAllPages, { total: props.total })}
                        </button>
                    )}
                    {props.onClearSelection && (
                        <button type="button" className="mxt-dg-linkbtn" onClick={props.onClearSelection}>
                            {t.textClearSelection}
                        </button>
                    )}
                </span>
            )}
            {props.issues > 0 && (
                <button type="button" className="mxt-dg-status__item mxt-dg-status__issues" onClick={props.onIssues}>
                    <Icon name="warning" size={13} /> {fill(t.textIssues, { count: props.issues })}
                </button>
            )}
            {props.range && props.range.count > 1 && (
                <span className="mxt-dg-status__item mxt-dg-status__range" data-status="range">
                    <span>
                        {t.textCount}: {props.range.count}
                    </span>
                    {props.range.numbers > 0 && (
                        <>
                            <span>
                                {t.textSum}:{" "}
                                <Counter value={props.range.sum ?? 0} animate={false} format={props.formatNumber} />
                            </span>
                            <span>
                                {t.textAvg}: {props.formatNumber(props.range.avg ?? 0)}
                            </span>
                            <span>
                                {t.textMin}: {props.formatNumber(props.range.min ?? 0)}
                            </span>
                            <span>
                                {t.textMax}: {props.formatNumber(props.range.max ?? 0)}
                            </span>
                        </>
                    )}
                </span>
            )}
            <span className="mxt-dg-status__spacer" />
            {props.saveState}
        </div>
    );
}

export interface PagerProps {
    texts: Texts;
    page: number;
    pageSize: number;
    total: number;
    pageSizes: number[];
    onPage: (page: number) => void;
    onPageSize: (size: number) => void;
}

export function Pager({ texts: t, page, pageSize, total, pageSizes, onPage, onPageSize }: PagerProps): ReactElement {
    const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
    const first = total === 0 ? 0 : page * pageSize + 1;
    const last = Math.min(total, (page + 1) * pageSize);
    return (
        <div className="mxt-dg-pager" role="navigation" aria-label="Pagination">
            {pageSizes.length > 0 && (
                <label className="mxt-dg-pager__size">
                    {t.textPageSize}
                    <select value={pageSize} onChange={event => onPageSize(Number(event.target.value))}>
                        {pageSizes.map(size => (
                            <option key={size} value={size}>
                                {size}
                            </option>
                        ))}
                    </select>
                </label>
            )}
            <button
                type="button"
                className="mxt-dg-iconbtn"
                disabled={page <= 0}
                aria-label={t.textFirstPage}
                onClick={() => onPage(0)}
            >
                «
            </button>
            <button
                type="button"
                className="mxt-dg-iconbtn"
                disabled={page <= 0}
                aria-label={t.textPreviousPage}
                onClick={() => onPage(page - 1)}
            >
                <Icon name="chevronLeft" size={14} />
            </button>
            <span className="mxt-dg-pager__status" data-status="paging">
                {fill(t.textPagingStatus, { first, last, total })}
            </span>
            <button
                type="button"
                className="mxt-dg-iconbtn"
                disabled={page >= pages - 1}
                aria-label={t.textNextPage}
                onClick={() => onPage(page + 1)}
            >
                <Icon name="chevronRight" size={14} />
            </button>
            <button
                type="button"
                className="mxt-dg-iconbtn"
                disabled={page >= pages - 1}
                aria-label={t.textLastPage}
                onClick={() => onPage(pages - 1)}
            >
                »
            </button>
        </div>
    );
}

export interface ToastData {
    id: number;
    text: string;
    action?: { label: string; run: () => void };
    tone?: "info" | "error" | "success";
    progress?: number;
    onCancel?: () => void;
    sticky?: boolean;
}

export function Toasts({
    toasts,
    onDismiss,
    cancelLabel
}: {
    toasts: ToastData[];
    onDismiss: (id: number) => void;
    cancelLabel: string;
}): ReactElement {
    return (
        <div className="mxt-dg-toasts" aria-live="polite">
            {toasts.map(toast => (
                <div key={toast.id} className={`mxt-dg-toast mxt-dg-toast--${toast.tone ?? "info"}`} role="status">
                    <span className="mxt-dg-toast__text">{toast.text}</span>
                    {toast.progress !== undefined && (
                        <span className="mxt-dg-toast__progress">
                            <span style={{ width: `${Math.round(toast.progress * 100)}%` }} />
                        </span>
                    )}
                    {toast.action && (
                        <button
                            type="button"
                            className="mxt-dg-linkbtn"
                            onClick={() => {
                                toast.action?.run();
                                onDismiss(toast.id);
                            }}
                        >
                            {toast.action.label}
                        </button>
                    )}
                    {toast.onCancel && (
                        <button type="button" className="mxt-dg-linkbtn" onClick={toast.onCancel}>
                            {cancelLabel}
                        </button>
                    )}
                    <button
                        type="button"
                        className="mxt-dg-iconbtn"
                        aria-label="Dismiss"
                        onClick={() => onDismiss(toast.id)}
                    >
                        <Icon name="close" size={12} />
                    </button>
                </div>
            ))}
        </div>
    );
}

export function KeyboardHelp({ texts: t, onClose }: { texts: Texts; onClose: () => void }): ReactElement {
    const rows: Array<[string, string]> = [
        ["↑ ↓ ← →", "Move between cells"],
        ["Home / End, Ctrl+Home / Ctrl+End", "First / last cell"],
        ["PgUp / PgDn", "Page up / down"],
        ["Enter, F2, typing", "Edit the cell"],
        ["Esc", "Cancel editing"],
        ["Enter on the last row", t.textAddRow],
        ["Shift+click, Shift+arrows", "Select a range"],
        ["Ctrl+C / Ctrl+V", `${t.textCopyCells} / ${t.textPaste}`],
        ["Ctrl+D", "Fill down"],
        ["Delete", "Clear the selected cells"],
        ["Ctrl+Z / Ctrl+Y", `${t.textUndo} / ${t.textRedo}`],
        ["Ctrl+S", t.textSave],
        ["Ctrl+Enter", t.textExpandRow],
        ["Ctrl+F", t.textSearch],
        ["Shift+click header", "Sort on several columns"],
        ["Double-click header", t.textRename],
        ["?", t.textKeyboardHelp]
    ];
    return (
        <Dialog title={t.textShortcutsTitle} onClose={onClose} width={520}>
            <table className="mxt-dg-keys">
                <tbody>
                    {rows.map(([keys, label]) => (
                        <tr key={keys}>
                            <td>
                                {keys.split(", ").map(k => (
                                    <kbd key={k}>{k}</kbd>
                                ))}
                            </td>
                            <td>{label}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </Dialog>
    );
}

export function Skeleton({ rows = 8, columns = 5 }: { rows?: number; columns?: number }): ReactElement {
    return (
        <div className="mxt-dg-skeleton" aria-hidden>
            {Array.from({ length: rows }, (_, r) => (
                <div key={r} className="mxt-dg-skeleton__row" style={{ animationDelay: `${r * 60}ms` }}>
                    {Array.from({ length: columns }, (_, c) => (
                        <span
                            key={c}
                            className="mxt-dg-skeleton__cell"
                            style={{ width: `${40 + ((r * 7 + c * 13) % 50)}%` }}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}
