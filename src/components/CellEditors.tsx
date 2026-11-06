import { KeyboardEvent, ReactElement, useEffect, useMemo, useRef, useState } from "react";
import type { CustomCellEditorProps } from "ag-grid-react";

import { Stars, OptionChip } from "./CellRenderers";
import type { GridItem } from "../utils/gridItem";
import { linkOptionsFor } from "../utils/related";
import { asArray, linkedLabel, isEmpty, isoDate, isoDateTime, parseInput, toDate } from "../utils/values";
import { CellValue, ColumnDef } from "../utils/types";

/** Typed editors, used inside grid cells and in the record drawer. */

export interface FieldEditorProps {
    column: ColumnDef;
    value: CellValue | undefined;
    /** Called with every change; `undefined` means the typed text is not (yet) a valid value. */
    onChange: (value: CellValue | undefined) => void;
    /** Enter (or picking an option) in a grid cell. */
    onCommit?: () => void;
    onCancel?: () => void;
    autoFocus?: boolean;
    /** Character that started editing (typing into a cell). */
    initialKey?: string | null;
    inGrid?: boolean;
    id?: string;
    texts?: { search: string };
}

function pad(n: number): string {
    return String(n).padStart(2, "0");
}

function toLocalInput(value: CellValue | undefined, withTime: boolean): string {
    const date = toDate(value);
    if (!date) {
        return "";
    }
    const day = isoDate(date);
    return withTime ? `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}` : day;
}

/** Text shown in a number input for a stored value. */
function numberText(column: ColumnDef, value: CellValue | undefined): string {
    if (isEmpty(value)) {
        return "";
    }
    const n = Number(value);
    if (!Number.isFinite(n)) {
        return String(value);
    }
    return column.type === "percent" ? String(Number((n * 100).toFixed(8))) : String(n);
}

function TextInput(props: FieldEditorProps & { kind: string }): ReactElement {
    const { column, value, onChange, onCommit, onCancel, autoFocus, initialKey, inGrid, id, kind } = props;
    const numeric = kind === "number";
    const [text, setText] = useState(() =>
        initialKey && initialKey.length === 1
            ? initialKey
            : numeric
            ? numberText(column, value)
            : isEmpty(value)
            ? ""
            : String(value)
    );
    const ref = useRef<HTMLInputElement>(null);
    const emit = (next: string): void => {
        if (numeric) {
            const parsed = parseInput(
                column,
                column.type === "percent" && next.trim() && !next.includes("%") ? `${next}%` : next
            );
            onChange(parsed.ok ? parsed.value : undefined);
        } else {
            onChange(next === "" ? null : next);
        }
    };
    useEffect(() => {
        if (autoFocus) {
            ref.current?.focus();
            if (!(initialKey && initialKey.length === 1)) {
                ref.current?.select();
            }
        }
        if (initialKey && initialKey.length === 1) {
            emit(initialKey);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const inputType =
        column.type === "email" ? "email" : column.type === "link" ? "url" : column.type === "phone" ? "tel" : "text";
    return (
        <input
            id={id}
            ref={ref}
            className={inGrid ? "mxt-dg-editor-input" : "form-control"}
            type={inputType}
            inputMode={numeric ? "decimal" : undefined}
            value={text}
            aria-label={column.caption}
            onChange={event => {
                setText(event.target.value);
                emit(event.target.value);
            }}
            onKeyDown={event => {
                if (!inGrid && event.key === "Enter") {
                    onCommit?.();
                }
                if (!inGrid && event.key === "Escape") {
                    onCancel?.();
                }
            }}
        />
    );
}

function LongTextInput({
    column,
    value,
    onChange,
    onCommit,
    autoFocus,
    initialKey,
    inGrid,
    id
}: FieldEditorProps): ReactElement {
    const [text, setText] = useState(() =>
        initialKey && initialKey.length === 1 ? initialKey : isEmpty(value) ? "" : String(value)
    );
    const ref = useRef<HTMLTextAreaElement>(null);
    useEffect(() => {
        if (autoFocus) {
            ref.current?.focus();
            const length = ref.current?.value.length ?? 0;
            ref.current?.setSelectionRange(length, length);
        }
        if (initialKey && initialKey.length === 1) {
            onChange(initialKey);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return (
        <textarea
            id={id}
            ref={ref}
            className={inGrid ? "mxt-dg-editor-textarea" : "form-control mxt-dg-field-textarea"}
            value={text}
            rows={inGrid ? 6 : 4}
            aria-label={column.caption}
            onChange={event => {
                setText(event.target.value);
                onChange(event.target.value === "" ? null : event.target.value);
            }}
            onKeyDown={event => {
                if (event.key === "Enter" && (event.shiftKey || event.altKey)) {
                    // New line: keep the key away from the grid.
                    event.stopPropagation();
                } else if (event.key === "Enter" && inGrid) {
                    onCommit?.();
                }
            }}
        />
    );
}

function DateInput({ column, value, onChange, onCommit, autoFocus, inGrid, id }: FieldEditorProps): ReactElement {
    const withTime = column.type !== "date";
    const [text, setText] = useState(() => toLocalInput(value, withTime));
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (autoFocus) {
            ref.current?.focus();
        }
    }, [autoFocus]);
    return (
        <input
            id={id}
            ref={ref}
            className={inGrid ? "mxt-dg-editor-input" : "form-control"}
            type={withTime ? "datetime-local" : "date"}
            value={text}
            aria-label={column.caption}
            onChange={event => {
                const next = event.target.value;
                setText(next);
                if (!next) {
                    onChange(null);
                    return;
                }
                const date = toDate(withTime ? new Date(next).toISOString() : next);
                onChange(date ? (withTime ? isoDateTime(date) : isoDate(date)) : undefined);
            }}
            onKeyDown={event => {
                if (event.key === "Enter" && !inGrid) {
                    onCommit?.();
                }
            }}
        />
    );
}

function OptionList({
    column,
    value,
    onChange,
    onCommit,
    autoFocus,
    initialKey,
    inGrid,
    texts
}: FieldEditorProps): ReactElement {
    const multi = column.type === "multiSelect";
    const [selected, setSelected] = useState<string[]>(() =>
        multi ? asArray(value) : isEmpty(value) ? [] : [String(value)]
    );
    const [query, setQuery] = useState(initialKey && initialKey.length === 1 ? initialKey : "");
    const [active, setActive] = useState(0);
    const searchRef = useRef<HTMLInputElement>(null);
    const options = useMemo(() => {
        const q = query.trim().toLowerCase();
        return column.options.filter(option => !q || option.label.toLowerCase().includes(q));
    }, [column.options, query]);
    useEffect(() => {
        if (autoFocus) {
            searchRef.current?.focus();
        }
    }, [autoFocus]);
    const toggle = (optionValue: string): void => {
        if (multi) {
            const next = selected.includes(optionValue)
                ? selected.filter(v => v !== optionValue)
                : [...selected, optionValue];
            setSelected(next);
            onChange(next.length ? next : null);
        } else {
            const next = selected[0] === optionValue ? [] : [optionValue];
            setSelected(next);
            onChange(next[0] ?? null);
            if (inGrid) {
                // Let the value land before the grid reads it.
                setTimeout(() => onCommit?.(), 0);
            }
        }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            event.stopPropagation();
            setActive(index => Math.max(0, Math.min(options.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))));
        } else if (event.key === "Enter" && options[active] && (!multi || !event.ctrlKey)) {
            event.preventDefault();
            event.stopPropagation();
            toggle(options[active].value);
        } else if (event.key === " " && multi && options[active]) {
            event.preventDefault();
            event.stopPropagation();
            toggle(options[active].value);
        }
    };
    if (!inGrid && column.options.length <= 10) {
        // Forms (record view, default value): a compact row of toggle chips, Airtable style.
        return (
            <div
                className="mxt-dg-chippick"
                role="listbox"
                aria-multiselectable={multi || undefined}
                aria-label={column.caption}
            >
                {column.options.map(option => {
                    const isSelected = selected.includes(option.value);
                    return (
                        <button
                            key={option.value}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            className={`mxt-dg-chip mxt-dg-chippick__chip${isSelected ? " is-on" : ""}`}
                            style={{ ["--mxt-dg-chip" as string]: option.color }}
                            onClick={() => toggle(option.value)}
                        >
                            {option.label}
                        </button>
                    );
                })}
            </div>
        );
    }
    return (
        <div
            className={inGrid ? "mxt-dg-optionlist mxt-dg-optionlist--grid" : "mxt-dg-optionlist"}
            onKeyDown={onKeyDown}
        >
            <input
                ref={searchRef}
                className="mxt-dg-optionlist__search"
                value={query}
                placeholder={texts?.search ?? "Search..."}
                aria-label={texts?.search ?? "Search"}
                onChange={event => {
                    setQuery(event.target.value);
                    setActive(0);
                }}
            />
            <div className="mxt-dg-optionlist__items" role="listbox" aria-multiselectable={multi || undefined}>
                {options.map((option, index) => {
                    const isSelected = selected.includes(option.value);
                    return (
                        <div
                            key={option.value}
                            role="option"
                            aria-selected={isSelected}
                            className={`mxt-dg-optionlist__item${index === active ? " is-active" : ""}${
                                isSelected ? " is-selected" : ""
                            }`}
                            onMouseDown={event => event.preventDefault()}
                            onMouseEnter={() => setActive(index)}
                            onClick={() => toggle(option.value)}
                        >
                            {multi && <input type="checkbox" readOnly checked={isSelected} tabIndex={-1} />}
                            <OptionChip label={option.label} color={option.color} />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/** Linked record picker: searchable list of the linkable rows (one or several). */
function LinkPicker({ column, value, onChange, onCommit, autoFocus, inGrid, texts }: FieldEditorProps): ReactElement {
    const multiple = column.link?.multiple !== false;
    const [selected, setSelected] = useState<string[]>(() => asArray(value));
    const [query, setQuery] = useState("");
    const searchRef = useRef<HTMLInputElement>(null);
    const all = linkOptionsFor(column);
    const shown = all.filter(link => !query || link.label.toLowerCase().includes(query.toLowerCase())).slice(0, 200);
    useEffect(() => {
        if (autoFocus) {
            searchRef.current?.focus();
        }
    }, [autoFocus]);
    const toggle = (key: string): void => {
        const next = multiple
            ? selected.includes(key)
                ? selected.filter(k => k !== key)
                : [...selected, key]
            : selected[0] === key
            ? []
            : [key];
        setSelected(next);
        onChange(next.length ? next : null);
        if (!multiple && inGrid) {
            setTimeout(() => onCommit?.(), 0);
        }
    };
    return (
        <div
            className={
                inGrid
                    ? "mxt-dg-optionlist mxt-dg-optionlist--grid mxt-dg-linkpicker"
                    : "mxt-dg-optionlist mxt-dg-linkpicker"
            }
        >
            {selected.length > 0 && (
                <div className="mxt-dg-linkpicker__selected">
                    {selected.map(key => (
                        <button
                            key={key}
                            type="button"
                            className="mxt-dg-chip mxt-dg-chip--link"
                            onMouseDown={event => event.preventDefault()}
                            onClick={() => toggle(key)}
                        >
                            {linkedLabel(key)} ×
                        </button>
                    ))}
                </div>
            )}
            <input
                ref={searchRef}
                className="mxt-dg-optionlist__search"
                value={query}
                placeholder={texts?.search ?? "Search..."}
                aria-label={texts?.search ?? "Search"}
                onChange={event => setQuery(event.target.value)}
            />
            <div className="mxt-dg-optionlist__items" role="listbox" aria-multiselectable={multiple || undefined}>
                {shown.map(link => {
                    const isSelected = selected.includes(link.key);
                    return (
                        <div
                            key={link.key}
                            role="option"
                            aria-selected={isSelected}
                            data-link={link.key}
                            className={`mxt-dg-optionlist__item${isSelected ? " is-selected" : ""}`}
                            onMouseDown={event => event.preventDefault()}
                            onClick={() => toggle(link.key)}
                        >
                            {multiple && <input type="checkbox" readOnly checked={isSelected} tabIndex={-1} />}
                            <span className="mxt-dg-linkpicker__label">{link.label || link.key}</span>
                            {link.grid && <span className="mxt-dg-linkpicker__grid">{link.grid}</span>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function ProgressInput({ column, value, onChange, autoFocus, inGrid }: FieldEditorProps): ReactElement {
    const [n, setN] = useState(() => (isEmpty(value) ? 0 : Number(value)));
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (autoFocus) {
            ref.current?.focus();
        }
    }, [autoFocus]);
    return (
        <span className={inGrid ? "mxt-dg-slider mxt-dg-slider--grid" : "mxt-dg-slider"}>
            <input
                ref={ref}
                type="range"
                min={0}
                max={100}
                step={1}
                value={n}
                aria-label={column.caption}
                onChange={event => {
                    const next = Number(event.target.value);
                    setN(next);
                    onChange(next);
                }}
            />
            <output>{n}%</output>
        </span>
    );
}

export function FieldEditor(props: FieldEditorProps): ReactElement {
    const { column } = props;
    switch (column.type) {
        case "longText":
            return <LongTextInput {...props} />;
        case "number":
        case "decimal":
        case "currency":
        case "percent":
            return <TextInput {...props} kind="number" />;
        case "date":
        case "dateTime":
            return <DateInput {...props} />;
        case "boolean":
            return (
                <input
                    id={props.id}
                    type="checkbox"
                    className="mxt-dg-checkbox"
                    checked={props.value === true}
                    aria-label={column.caption}
                    onChange={event => props.onChange(event.target.checked)}
                />
            );
        case "select":
        case "multiSelect":
            return <OptionList {...props} />;
        case "linkedRecord":
            return <LinkPicker {...props} />;
        case "rating":
            return (
                <Stars
                    value={Number(props.value) || 0}
                    max={column.max ?? 5}
                    onChange={value => props.onChange(value)}
                />
            );
        case "progress":
            return <ProgressInput {...props} />;
        default:
            return <TextInput {...props} kind="text" />;
    }
}

export interface GridEditorContext {
    columnOf: (colId: string) => ColumnDef | undefined;
    searchText: string;
}

/** AG Grid cell editor wrapping FieldEditor. The value it reports is a stored CellValue (undefined = invalid). */
export function GridCellEditor(props: CustomCellEditorProps<GridItem, CellValue | undefined>): ReactElement | null {
    const context = props.context as GridEditorContext;
    const column = context.columnOf(props.column.getColId());
    if (!column) {
        return null;
    }
    return (
        <div className={`mxt-dg-cell-editor mxt-dg-cell-editor--${column.type}`}>
            <FieldEditor
                column={column}
                value={props.value}
                onChange={value => props.onValueChange(value)}
                onCommit={() => props.stopEditing()}
                autoFocus
                initialKey={props.eventKey}
                inGrid
                texts={{ search: context.searchText }}
            />
        </div>
    );
}
