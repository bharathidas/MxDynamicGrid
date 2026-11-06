/* CoachMarks reads the grid root from a ref to place the marks next to elements that render after it. */
/* eslint-disable react-hooks/refs */
import { ReactElement, useEffect, useMemo, useState } from "react";

import { FieldEditor } from "./CellEditors";
import { Icon } from "./Icon";
import { anchorOf, Dialog, Layer } from "./Popover";
import { typeInfo } from "../utils/columnTypes";
import { fill, Texts } from "../utils/texts";
import { CellValue, ColumnDef, RowRecord } from "../utils/types";

/** Bulk edit, find and replace, and the onboarding coach marks. */

export function BulkEditDialog({
    texts: t,
    columns,
    count,
    onApply,
    onClose
}: {
    texts: Texts;
    columns: ColumnDef[];
    count: number;
    onApply: (col: string, value: CellValue) => void;
    onClose: () => void;
}): ReactElement {
    const [col, setCol] = useState(columns[0]?.key ?? "");
    const [value, setValue] = useState<CellValue>(null);
    const column = columns.find(c => c.key === col);
    return (
        <Dialog
            title={fill(t.textEditRows, { count })}
            onClose={onClose}
            width={460}
            className="mxt-dg-bulk"
            footer={
                <>
                    <button type="button" className="btn btn-default mxt-dg-btn" onClick={onClose}>
                        {t.textCancel}
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary mxt-dg-btn"
                        data-action="bulk-apply"
                        disabled={!column}
                        onClick={() => onApply(col, value)}
                    >
                        {fill(t.textApplyToRows, { count })}
                    </button>
                </>
            }
        >
            <label className="mxt-dg-field">
                <span className="mxt-dg-field__label">{t.textSetField}</span>
                <select
                    className="form-control"
                    value={col}
                    data-bulk-field
                    onChange={event => {
                        setCol(event.target.value);
                        setValue(null);
                    }}
                >
                    {columns.map(c => (
                        <option key={c.key} value={c.key}>
                            {c.caption}
                        </option>
                    ))}
                </select>
            </label>
            {column && (
                <div className="mxt-dg-field" data-bulk-value>
                    <span className="mxt-dg-field__label">{t.textToValue}</span>
                    <FieldEditor
                        key={column.key}
                        column={column}
                        value={value}
                        onChange={next => next !== undefined && setValue(next)}
                        texts={{ search: t.textSearchValues }}
                    />
                </div>
            )}
        </Dialog>
    );
}

export interface FindMatch {
    row: string;
    col: string;
    before: string;
    after: string;
}

/** Text-like fields that find and replace works on. */
export function replaceableColumns(columns: ColumnDef[]): ColumnDef[] {
    return columns.filter(c => typeInfo(c.type).kind === "text" && !typeInfo(c.type).system);
}

export function findMatches(
    rows: RowRecord[],
    columns: ColumnDef[],
    find: string,
    replace: string,
    matchCase: boolean,
    col: string
): FindMatch[] {
    if (!find) {
        return [];
    }
    const targets = replaceableColumns(columns).filter(c => !col || c.key === col);
    const needle = matchCase ? find : find.toLowerCase();
    const matches: FindMatch[] = [];
    rows.forEach(row => {
        targets.forEach(column => {
            const value = row.values[column.key];
            if (typeof value !== "string" || !value) {
                return;
            }
            const hay = matchCase ? value : value.toLowerCase();
            if (!hay.includes(needle)) {
                return;
            }
            let after = "";
            let i = 0;
            for (;;) {
                const at = hay.indexOf(needle, i);
                if (at < 0) {
                    after += value.slice(i);
                    break;
                }
                after += value.slice(i, at) + replace;
                i = at + find.length;
            }
            matches.push({ row: row.key, col: column.key, before: value, after });
        });
    });
    return matches;
}

export function FindReplaceDialog({
    texts: t,
    columns,
    rows,
    onReplace,
    onClose
}: {
    texts: Texts;
    columns: ColumnDef[];
    rows: RowRecord[];
    onReplace: (matches: FindMatch[]) => void;
    onClose: () => void;
}): ReactElement {
    const [find, setFind] = useState("");
    const [replace, setReplace] = useState("");
    const [matchCase, setMatchCase] = useState(false);
    const [col, setCol] = useState("");
    const matches = useMemo(
        () => findMatches(rows, columns, find, replace, matchCase, col),
        [rows, columns, find, replace, matchCase, col]
    );
    const rowCount = new Set(matches.map(m => m.row)).size;
    return (
        <Dialog
            title={t.textFindReplace}
            onClose={onClose}
            width={480}
            className="mxt-dg-findreplace"
            footer={
                <>
                    <button type="button" className="btn btn-default mxt-dg-btn" onClick={onClose}>
                        {t.textClose}
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary mxt-dg-btn"
                        data-action="replace-all"
                        disabled={!matches.length}
                        onClick={() => onReplace(matches)}
                    >
                        <Icon name="replace" size={14} /> {t.textReplaceAll}
                    </button>
                </>
            }
        >
            <label className="mxt-dg-field">
                <span className="mxt-dg-field__label">{t.textFind}</span>
                <input
                    className="form-control"
                    data-find
                    value={find}
                    autoFocus
                    onChange={event => setFind(event.target.value)}
                />
            </label>
            <label className="mxt-dg-field">
                <span className="mxt-dg-field__label">{t.textReplaceWith}</span>
                <input
                    className="form-control"
                    data-replace
                    value={replace}
                    onChange={event => setReplace(event.target.value)}
                />
            </label>
            <div className="mxt-dg-field-row">
                <label className="mxt-dg-field">
                    <span className="mxt-dg-field__label">{t.textInField}</span>
                    <select className="form-control" value={col} onChange={event => setCol(event.target.value)}>
                        <option value="">{t.textAllFields}</option>
                        {replaceableColumns(columns).map(c => (
                            <option key={c.key} value={c.key}>
                                {c.caption}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="mxt-dg-check">
                    <input type="checkbox" checked={matchCase} onChange={event => setMatchCase(event.target.checked)} />{" "}
                    {t.textMatchCase}
                </label>
            </div>
            <p className="mxt-dg-findreplace__count" data-matches={matches.length} role="status">
                {fill(t.textMatches, { count: matches.length, rows: rowCount })}
            </p>
            {matches.length > 0 && (
                <ul className="mxt-dg-findreplace__preview">
                    {matches.slice(0, 5).map(m => (
                        <li key={`${m.row}-${m.col}`}>
                            <span className="is-before">{m.before}</span> → <span className="is-after">{m.after}</span>
                        </li>
                    ))}
                </ul>
            )}
        </Dialog>
    );
}

const HINTS_KEY = "mxt-dg-hints-v1";

export function hintsDone(): boolean {
    try {
        return window.localStorage.getItem(HINTS_KEY) === "done";
    } catch {
        return true;
    }
}

// Only one grid on a page shows the hints at a time; the others wait and stop once they are done.
let hintOwner: symbol | null = null;
const hintWaiters = new Set<() => void>();

/** Three coach marks: add field, view bar, views. Remembered per browser. */
export function CoachMarks({
    texts: t,
    rootRef,
    onDone
}: {
    texts: Texts;
    rootRef: { current: HTMLElement | null };
    onDone: () => void;
}): ReactElement | null {
    const root = rootRef.current;
    const [step, setStep] = useState(0);
    const [, setTick] = useState(0);
    const [me] = useState(() => Symbol("hints"));
    const [owner, setOwner] = useState(false);
    useEffect(() => {
        const tryClaim = (): void => {
            if (hintOwner === null && !hintsDone()) {
                hintOwner = me;
                setOwner(true);
            }
        };
        hintWaiters.add(tryClaim);
        tryClaim();
        return () => {
            hintWaiters.delete(tryClaim);
            if (hintOwner === me) {
                hintOwner = null;
                hintWaiters.forEach(waiter => waiter());
            }
        };
    }, [me]);
    useEffect(() => {
        // The anchors (header, view bar) render after the first paint.
        const id = window.setTimeout(() => setTick(n => n + 1), 400);
        return () => window.clearTimeout(id);
    }, []);
    useEffect(() => {
        const onResize = (): void => setTick(n => n + 1);
        window.addEventListener("resize", onResize);
        window.addEventListener("scroll", onResize, true);
        return () => {
            window.removeEventListener("resize", onResize);
            window.removeEventListener("scroll", onResize, true);
        };
    }, []);
    if (!owner) {
        return null;
    }
    const steps = [
        { selector: '[data-action="add-column"]', text: t.textHint1 },
        { selector: '[data-vb="filter"]', text: t.textHint2 },
        { selector: '[data-action="add-view"]', text: t.textHint3 }
    ].filter(s => {
        // Only targets the user can see (not the hidden grid behind a board, calendar or gallery view).
        const el = root?.querySelector(s.selector);
        if (!el || el.closest(".mxt-dg-grid--hidden")) {
            return false;
        }
        const rect = el.getBoundingClientRect();
        return rect.width > 4 && rect.height > 4;
    });
    const current = steps[step];
    const anchor = current ? anchorOf(root?.querySelector(current.selector)) : undefined;
    if (!current || !anchor) {
        return null;
    }
    const finish = (): void => {
        try {
            window.localStorage.setItem(HINTS_KEY, "done");
        } catch {
            // private mode: hints show again next time
        }
        onDone();
    };
    const left = Math.max(8, Math.min(window.innerWidth - 300, anchor.rect.left + anchor.rect.width / 2 - 140));
    const top = anchor.rect.bottom + 10;
    return (
        <Layer>
            <div
                className="mxt-dg-hint"
                role="dialog"
                aria-label={current.text}
                data-hint={step + 1}
                style={{ left, top }}
            >
                <span className="mxt-dg-hint__step">
                    {step + 1} / {steps.length}
                </span>
                <p>{current.text}</p>
                <div className="mxt-dg-hint__actions">
                    <button type="button" className="mxt-dg-vp-link" data-action="hint-done" onClick={finish}>
                        {t.textGotIt}
                    </button>
                    {step < steps.length - 1 && (
                        <button
                            type="button"
                            className="mxt-dg-vb-primary"
                            data-action="hint-next"
                            onClick={() => setStep(s => s + 1)}
                        >
                            {t.textNextHint}
                        </button>
                    )}
                </div>
            </div>
            <div
                className="mxt-dg-hint-ring"
                style={{
                    left: anchor.rect.left - 4,
                    top: anchor.rect.top - 4,
                    width: anchor.rect.width + 8,
                    height: anchor.rect.height + 8
                }}
            />
        </Layer>
    );
}
