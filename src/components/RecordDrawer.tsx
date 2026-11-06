/* Latest onClose callback kept in a ref so document listeners stay registered once. */
/* eslint-disable react-hooks/refs */
import { ReactElement, ReactNode, useEffect, useRef } from "react";

import { CellView } from "./CellRenderers";
import { FieldEditor } from "./CellEditors";
import { Icon } from "./Icon";
import { Layer } from "./Popover";
import { typeInfo } from "../utils/columnTypes";
import { formatValue } from "../utils/values";
import { fill, Texts, typeLabel } from "../utils/texts";
import { CellValue, ColumnDef, RowRecord } from "../utils/types";

/** Side drawer showing one row as a form with every column, with previous/next navigation. */
export function RecordDrawer({
    texts: t,
    row,
    index,
    total,
    columns,
    canEdit,
    issueOf,
    onChange,
    onNavigate,
    onClose,
    banner,
    extra,
    locked
}: {
    texts: Texts;
    row: RowRecord;
    index: number;
    total: number;
    columns: ColumnDef[];
    canEdit: (column: ColumnDef) => boolean;
    issueOf: (colKey: string) => string | undefined;
    onChange: (column: ColumnDef, value: CellValue) => void;
    onNavigate: (delta: number) => void;
    onClose: () => void;
    /** 1.2: conflict banner above the fields. */
    banner?: ReactNode;
    /** 1.2: comments and history below the fields. */
    extra?: ReactNode;
    locked?: boolean;
}): ReactElement {
    const ref = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    useEffect(() => {
        ref.current?.focus();
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === "Escape") {
                onCloseRef.current();
            }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, []);
    return (
        <Layer>
            <div
                className="mxt-dg-drawer-backdrop"
                onMouseDown={event => event.target === event.currentTarget && onClose()}
            >
                <aside
                    ref={ref}
                    tabIndex={-1}
                    className="mxt-dg-drawer"
                    role="dialog"
                    aria-modal="true"
                    aria-label={fill(t.textRecord, { number: index + 1, total })}
                >
                    <header className="mxt-dg-drawer__head">
                        <button
                            type="button"
                            className="mxt-dg-iconbtn"
                            disabled={index <= 0}
                            aria-label={t.textPrevious}
                            onClick={() => onNavigate(-1)}
                        >
                            <Icon name="chevronLeft" />
                        </button>
                        <button
                            type="button"
                            className="mxt-dg-iconbtn"
                            disabled={index >= total - 1}
                            aria-label={t.textNext}
                            onClick={() => onNavigate(1)}
                        >
                            <Icon name="chevronRight" />
                        </button>
                        <h3>{fill(t.textRecord, { number: index + 1, total })}</h3>
                        <button type="button" className="mxt-dg-iconbtn" aria-label={t.textClose} onClick={onClose}>
                            <Icon name="close" />
                        </button>
                    </header>
                    <div className="mxt-dg-drawer__body" key={row.key}>
                        {banner}
                        {columns[0] && (
                            <h2 className="mxt-dg-drawer__title" data-record-title>
                                {locked && <Icon name="lock" size={16} />}
                                {formatValue(columns[0], row.values[columns[0].key]) || "—"}
                            </h2>
                        )}
                        {columns.map(column => {
                            const editable = canEdit(column);
                            const issue = issueOf(column.key);
                            const id = `mxt-dg-field-${row.key}-${column.key}`;
                            return (
                                <div
                                    key={column.key}
                                    className={`mxt-dg-recfield${issue ? " is-invalid" : ""}`}
                                    data-col={column.key}
                                >
                                    <label className="mxt-dg-recfield__label" htmlFor={id}>
                                        <Icon name={typeInfo(column.type).icon} size={13} />
                                        <span>{column.caption}</span>
                                        {column.required && <span className="mxt-dg-header__req">*</span>}
                                        <span className="mxt-dg-recfield__type">{typeLabel(t, column.type)}</span>
                                    </label>
                                    {column.description && <p className="mxt-dg-field__help">{column.description}</p>}
                                    <div className="mxt-dg-recfield__value">
                                        {editable ? (
                                            <FieldEditor
                                                id={id}
                                                column={column}
                                                value={row.values[column.key]}
                                                onChange={value => {
                                                    if (value !== undefined) {
                                                        onChange(column, value);
                                                    }
                                                }}
                                                texts={{ search: t.textSearchValues }}
                                            />
                                        ) : (
                                            <span className="mxt-dg-recfield__readonly" title={t.textReadOnly}>
                                                <CellView column={column} value={row.values[column.key]} />
                                            </span>
                                        )}
                                    </div>
                                    {issue && (
                                        <p className="mxt-dg-field__error" role="alert">
                                            {issue}
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                        {extra}
                    </div>
                </aside>
            </div>
        </Layer>
    );
}
