import { ReactElement, useMemo, useRef, useState } from "react";

import { FieldEditor } from "./CellEditors";
import { CellView } from "./CellRenderers";
import { Icon } from "./Icon";
import { hasOptions, isNumericType, isSystemType, OPTION_COLORS, typeInfo } from "../utils/columnTypes";
import {
    FUNCTION_HELP,
    FUNCTION_NAMES,
    formulaProblem,
    functionAtCaret,
    referenceFragment,
    toDisplayFormula,
    toStoredFormula
} from "../utils/formula";
import { computeFormulas } from "../utils/pipeline";
import { linkFieldKeys, linkGrids } from "../utils/related";
import { fill, Texts, typeHelp, typeLabel } from "../utils/texts";
import { Conversion, formatValue, parseNumberPattern } from "../utils/values";
import { CellValue, ColumnDef, ColumnType, RowRecord, SelectOption } from "../utils/types";

/** The field creation / edit form: name, type picker and type-specific options. */

export interface ColumnEditorProps {
    texts: Texts;
    /** Column being edited; undefined creates a new one. */
    column?: ColumnDef;
    /** All dynamic columns (for formula autocomplete and unique names). */
    columns: ColumnDef[];
    newKey: () => string;
    defaultCaption: string;
    /** Conversion preview of the existing values when the type changes. */
    previewConversion?: (type: ColumnType) => Conversion;
    /** First row of the grid, for the live formula result. */
    sampleRow?: RowRecord;
    focusType?: boolean;
    onSubmit: (column: ColumnDef) => void;
    onCancel: () => void;
}

const DATE_FORMATS = ["", "dd-MM-yyyy", "dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd", "d MMM yyyy", "MMMM d, yyyy"];

export function numberFormatString(type: ColumnType, decimals: number, thousands: boolean, symbol: string): string {
    const integer = thousands ? "#,##0" : "0";
    const fraction = decimals > 0 ? `.${"0".repeat(decimals)}` : "";
    if (type === "percent") {
        return `${integer}${fraction}%`;
    }
    if (type === "currency") {
        return `${symbol ? `${symbol} ` : ""}${integer}${fraction}`;
    }
    return `${integer}${fraction}`;
}

function emptyColumn(key: string, caption: string): ColumnDef {
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

export function ColumnEditor(props: ColumnEditorProps): ReactElement {
    const { texts, column, columns, onSubmit, onCancel, previewConversion } = props;
    const [draft, setDraft] = useState<ColumnDef>(() => column ?? emptyColumn(props.newKey(), props.defaultCaption));
    const pattern = parseNumberPattern(draft.format);
    const [decimals, setDecimals] = useState(() => pattern?.decimals ?? (draft.type === "number" ? 0 : 2));
    const [thousands, setThousands] = useState(() => pattern?.grouping ?? true);
    const [symbol, setSymbol] = useState(
        () => (pattern?.prefix ?? "").trim() || (draft.type === "currency" ? "€" : "")
    );
    const others = columns.filter(c => c.key !== draft.key);
    const [formulaText, setFormulaText] = useState(() => toDisplayFormula(draft.formula, others));
    const [suggest, setSuggest] = useState<{ start: number; query: string } | undefined>();
    const [typeQuery, setTypeQuery] = useState("");
    const formulaRef = useRef<HTMLTextAreaElement>(null);
    const dragFrom = useRef<number | null>(null);
    const isNew = !column;
    const typeChanged = Boolean(column && column.type !== draft.type);
    const conversion = useMemo(
        () => (typeChanged && previewConversion ? previewConversion(draft.type) : undefined),
        [typeChanged, previewConversion, draft.type]
    );
    const storedFormula = toStoredFormula(formulaText, others);
    const [caret, setCaret] = useState(0);
    const helpFor = draft.type === "formula" ? functionAtCaret(formulaText, caret) : undefined;
    const formulaError =
        draft.type === "formula"
            ? formulaProblem(
                  storedFormula,
                  others.map(c => c.key),
                  draft.key
              )
            : undefined;
    const liveResult = useMemo(() => {
        if (draft.type !== "formula" || !props.sampleRow || formulaError || !storedFormula.trim()) {
            return "";
        }
        const self: ColumnDef = { ...draft, formula: storedFormula };
        const [row] = computeFormulas([props.sampleRow], [...others, self]);
        const value = row.values[draft.key];
        return value === null || value === undefined || value === "" ? "—" : formatValue(self, value);
    }, [draft, props.sampleRow, formulaError, storedFormula, others]);
    const nameTaken = others.some(c => c.caption.trim().toLowerCase() === draft.caption.trim().toLowerCase());
    const canSubmit = draft.caption.trim().length > 0 && !formulaError && !nameTaken;

    const set = (patch: Partial<ColumnDef>): void => setDraft(previous => ({ ...previous, ...patch }));

    const setType = (type: ColumnType): void => {
        const patch: Partial<ColumnDef> = { type };
        if (hasOptions(type) && !draft.options.length) {
            patch.options = conversion?.options ?? [];
        }
        if (isNumericType(type) && type !== "rating" && type !== "progress") {
            const nextDecimals = type === "number" ? 0 : type === "percent" ? 0 : 2;
            setDecimals(nextDecimals);
            patch.format = numberFormatString(type, nextDecimals, thousands, type === "currency" ? symbol || "€" : "");
            if (type === "currency" && !symbol) {
                setSymbol("€");
            }
        } else if (typeInfo(type).kind !== typeInfo(draft.type).kind) {
            patch.format = "";
        }
        if (type === "rating" && !draft.max) {
            patch.max = 5;
        }
        set(patch);
    };

    const updateNumberFormat = (nextDecimals: number, nextThousands: boolean, nextSymbol: string): void => {
        setDecimals(nextDecimals);
        setThousands(nextThousands);
        setSymbol(nextSymbol);
        set({ format: numberFormatString(draft.type, nextDecimals, nextThousands, nextSymbol) });
    };

    const setOption = (index: number, patch: Partial<SelectOption>): void => {
        const options = draft.options.map((option, i) => (i === index ? { ...option, ...patch } : option));
        set({ options });
    };

    const submit = (): void => {
        if (!canSubmit) {
            return;
        }
        const options =
            hasOptions(draft.type) && conversion
                ? mergeOptions(draft.options, conversion.options)
                : draft.options
                      .filter(option => option.label.trim())
                      .map(option => ({ ...option, value: option.value || option.label.trim() }));
        onSubmit({
            ...draft,
            caption: draft.caption.trim(),
            options: hasOptions(draft.type) ? options : [],
            formula: draft.type === "formula" ? storedFormula : "",
            readOnly: draft.readOnly
        });
    };

    const suggestions = suggest
        ? others.filter(c => c.caption.toLowerCase().includes(suggest.query.toLowerCase())).slice(0, 8)
        : [];
    const insertReference = (target: ColumnDef): void => {
        if (!suggest) {
            return;
        }
        const area = formulaRef.current;
        const caret = area?.selectionStart ?? formulaText.length;
        const next = `${formulaText.slice(0, suggest.start)}{${target.caption}}${formulaText.slice(caret)}`;
        setFormulaText(next);
        setSuggest(undefined);
        const position = suggest.start + target.caption.length + 2;
        window.setTimeout(() => {
            area?.focus();
            area?.setSelectionRange(position, position);
        }, 0);
    };

    const info = typeInfo(draft.type);

    return (
        <form
            className="mxt-dg-coleditor"
            onSubmit={event => {
                event.preventDefault();
                submit();
            }}
        >
            <label className="mxt-dg-field">
                <span className="mxt-dg-field__label">{texts.textFieldName}</span>
                <input
                    className="form-control"
                    value={draft.caption}
                    autoFocus={!props.focusType}
                    aria-invalid={nameTaken || undefined}
                    onChange={event => set({ caption: event.target.value })}
                />
            </label>
            <div className="mxt-dg-field">
                <span className="mxt-dg-field__label">{texts.textFieldType}</span>
                <input
                    className="mxt-dg-vp-search mxt-dg-typesearch"
                    value={typeQuery}
                    placeholder={texts.textSearch}
                    aria-label={`${texts.textFieldType} ${texts.textSearch}`}
                    onChange={event => setTypeQuery(event.target.value)}
                />
                <div className="mxt-dg-typelist" role="radiogroup" aria-label={texts.textFieldType}>
                    {TYPE_GROUPS.map(group => {
                        const types = group.types.filter(type => {
                            const q = typeQuery.trim().toLowerCase();
                            return (
                                !q ||
                                typeLabel(texts, type).toLowerCase().includes(q) ||
                                typeHelp(texts, type).toLowerCase().includes(q)
                            );
                        });
                        if (!types.length) {
                            return null;
                        }
                        return (
                            <div key={group.key} className="mxt-dg-typelist__group">
                                <div className="mxt-dg-typelist__title">
                                    {(texts as unknown as Record<string, string>)[group.key]}
                                </div>
                                {types.map((type, index) => (
                                    <button
                                        key={type}
                                        type="button"
                                        role="radio"
                                        aria-checked={draft.type === type}
                                        autoFocus={props.focusType && draft.type === type}
                                        className={`mxt-dg-typepicker__item mxt-dg-typelist__item${
                                            draft.type === type ? " is-selected" : ""
                                        }${isSystemType(type) ? " is-system" : ""}`}
                                        style={{ animationDelay: `${index * 12}ms` }}
                                        data-type={type}
                                        onClick={() => setType(type)}
                                    >
                                        <Icon name={typeInfo(type).icon} size={15} />
                                        <span className="mxt-dg-typelist__name">{typeLabel(texts, type)}</span>
                                        <span className="mxt-dg-typelist__help">{typeHelp(texts, type)}</span>
                                    </button>
                                ))}
                            </div>
                        );
                    })}
                </div>
                <div className="mxt-dg-typepreview" aria-label={texts.textPreview}>
                    <span className="mxt-dg-typepreview__label">{texts.textPreview}</span>
                    <span className="mxt-dg-typepreview__cell" data-preview={draft.type}>
                        <CellView column={draft} value={previewValue(draft)} pendingText="…" />
                    </span>
                </div>
            </div>

            {conversion && (
                <div className={`mxt-dg-conversion${conversion.lost ? " mxt-dg-conversion--warn" : ""}`} role="status">
                    <Icon name={conversion.lost ? "warning" : "check"} />
                    <div>
                        <p>
                            {conversion.lost
                                ? fill(texts.textTypeChangeWarning, { count: conversion.lost, total: conversion.total })
                                : fill(texts.textTypeChangeSafe, { total: conversion.total })}
                        </p>
                        {conversion.samples.length > 0 && (
                            <table className="mxt-dg-conversion__table">
                                <thead>
                                    <tr>
                                        <th>{texts.textBefore}</th>
                                        <th>{texts.textAfter}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {conversion.samples.map((sample, index) => (
                                        <tr key={index} className={sample.lost ? "is-lost" : undefined}>
                                            <td>{sample.before}</td>
                                            <td>{sample.lost ? "—" : sample.after}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {hasOptions(draft.type) && (
                <div className="mxt-dg-field">
                    <span className="mxt-dg-field__label">{texts.textOptions}</span>
                    <ul className="mxt-dg-options">
                        {draft.options.map((option, index) => (
                            <li
                                key={index}
                                className="mxt-dg-options__row"
                                draggable
                                onDragStart={() => (dragFrom.current = index)}
                                onDragOver={event => event.preventDefault()}
                                onDrop={() => {
                                    const from = dragFrom.current;
                                    dragFrom.current = null;
                                    if (from === null || from === index) {
                                        return;
                                    }
                                    const next = [...draft.options];
                                    const [moved] = next.splice(from, 1);
                                    next.splice(index, 0, moved);
                                    set({ options: next });
                                }}
                            >
                                <span className="mxt-dg-options__drag" aria-hidden>
                                    <Icon name="drag" size={14} />
                                </span>
                                <input
                                    type="color"
                                    className="mxt-dg-options__color"
                                    value={option.color && option.color.length === 7 ? option.color : "#e5e7eb"}
                                    aria-label="Color"
                                    onChange={event => setOption(index, { color: event.target.value })}
                                />
                                <input
                                    className="form-control"
                                    value={option.label}
                                    aria-label={texts.textOptions}
                                    onChange={event =>
                                        setOption(index, {
                                            label: event.target.value,
                                            ...(column?.options.some(o => o.value === option.value)
                                                ? {}
                                                : { value: event.target.value })
                                        })
                                    }
                                />
                                <button
                                    type="button"
                                    className="mxt-dg-iconbtn"
                                    aria-label={texts.textDelete}
                                    onClick={() => set({ options: draft.options.filter((_, i) => i !== index) })}
                                >
                                    <Icon name="close" size={14} />
                                </button>
                            </li>
                        ))}
                    </ul>
                    <button
                        type="button"
                        className="btn btn-default mxt-dg-btn mxt-dg-addoption"
                        onClick={() =>
                            set({
                                options: [
                                    ...draft.options,
                                    {
                                        value: "",
                                        label: "",
                                        color: OPTION_COLORS[draft.options.length % OPTION_COLORS.length]
                                    }
                                ]
                            })
                        }
                    >
                        <Icon name="plus" size={14} /> {texts.textAddOption}
                    </button>
                </div>
            )}

            {isNumericType(draft.type) && !info.system && draft.type !== "rating" && draft.type !== "progress" && (
                <div className="mxt-dg-field-row">
                    <label className="mxt-dg-field">
                        <span className="mxt-dg-field__label">{texts.textDecimals}</span>
                        <input
                            className="form-control"
                            type="number"
                            min={0}
                            max={8}
                            value={decimals}
                            onChange={event =>
                                updateNumberFormat(
                                    Math.max(0, Math.min(8, Number(event.target.value) || 0)),
                                    thousands,
                                    symbol
                                )
                            }
                        />
                    </label>
                    {draft.type === "currency" && (
                        <label className="mxt-dg-field">
                            <span className="mxt-dg-field__label">{texts.textCurrencySymbol}</span>
                            <input
                                className="form-control"
                                value={symbol}
                                maxLength={4}
                                onChange={event => updateNumberFormat(decimals, thousands, event.target.value)}
                            />
                        </label>
                    )}
                    <label className="mxt-dg-check">
                        <input
                            type="checkbox"
                            checked={thousands}
                            onChange={event => updateNumberFormat(decimals, event.target.checked, symbol)}
                        />
                        {texts.textThousands}
                    </label>
                </div>
            )}

            {(draft.type === "date" || draft.type === "dateTime") && (
                <label className="mxt-dg-field">
                    <span className="mxt-dg-field__label">{texts.textDateFormat}</span>
                    <select
                        className="form-control"
                        value={
                            DATE_FORMATS.includes(draft.format.replace(" HH:mm", ""))
                                ? draft.format.replace(" HH:mm", "")
                                : ""
                        }
                        onChange={event =>
                            set({
                                format: event.target.value
                                    ? `${event.target.value}${draft.type === "dateTime" ? " HH:mm" : ""}`
                                    : ""
                            })
                        }
                    >
                        {DATE_FORMATS.map(format => (
                            <option key={format} value={format}>
                                {format || "Locale"}
                            </option>
                        ))}
                    </select>
                </label>
            )}

            {draft.type === "linkedRecord" && (
                <div className="mxt-dg-field-row" data-link-settings>
                    <label className="mxt-dg-field">
                        <span className="mxt-dg-field__label">{texts.textLinkTarget}</span>
                        <select
                            className="form-control"
                            value={draft.link?.target ?? ""}
                            onChange={event =>
                                set({ link: { ...draft.link, target: event.target.value || undefined } })
                            }
                        >
                            <option value="">{texts.textAllRows}</option>
                            {linkGrids().map(grid => (
                                <option key={grid} value={grid}>
                                    {grid}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="mxt-dg-check">
                        <input
                            type="checkbox"
                            checked={draft.link?.multiple !== false}
                            onChange={event => set({ link: { ...draft.link, multiple: event.target.checked } })}
                        />
                        {texts.textPickRecords} (n)
                    </label>
                </div>
            )}

            {(draft.type === "lookup" || draft.type === "rollup") && (
                <div className="mxt-dg-field-row" data-link-settings>
                    <label className="mxt-dg-field">
                        <span className="mxt-dg-field__label">{texts.textLinkField}</span>
                        <select
                            className="form-control"
                            value={draft.link?.link ?? ""}
                            onChange={event => set({ link: { ...draft.link, link: event.target.value || undefined } })}
                        >
                            <option value="" />
                            {others
                                .filter(c => c.type === "linkedRecord")
                                .map(c => (
                                    <option key={c.key} value={c.key}>
                                        {c.caption}
                                    </option>
                                ))}
                        </select>
                    </label>
                    <label className="mxt-dg-field">
                        <span className="mxt-dg-field__label">{texts.textLookupField}</span>
                        <input
                            className="form-control"
                            list="mxt-dg-link-fields"
                            value={draft.link?.field ?? ""}
                            onChange={event => set({ link: { ...draft.link, field: event.target.value || undefined } })}
                        />
                        <datalist id="mxt-dg-link-fields">
                            {linkFieldKeys(others.find(c => c.key === draft.link?.link)?.link?.target).map(key => (
                                <option key={key} value={key} />
                            ))}
                        </datalist>
                    </label>
                    {draft.type === "rollup" && (
                        <label className="mxt-dg-field">
                            <span className="mxt-dg-field__label">{texts.textRollupFn}</span>
                            <select
                                className="form-control"
                                value={draft.link?.fn ?? "sum"}
                                onChange={event => set({ link: { ...draft.link, fn: event.target.value as "sum" } })}
                            >
                                <option value="sum">{texts.textSum}</option>
                                <option value="avg">{texts.textAvg}</option>
                                <option value="min">{texts.textMin}</option>
                                <option value="max">{texts.textMax}</option>
                                <option value="count">{texts.textCount}</option>
                            </select>
                        </label>
                    )}
                </div>
            )}

            {draft.type === "rating" && (
                <label className="mxt-dg-field">
                    <span className="mxt-dg-field__label">{texts.textRatingMax}</span>
                    <input
                        className="form-control"
                        type="number"
                        min={1}
                        max={10}
                        value={draft.max ?? 5}
                        onChange={event => set({ max: Math.max(1, Math.min(10, Number(event.target.value) || 5)) })}
                    />
                </label>
            )}

            {draft.type === "formula" && (
                <div className="mxt-dg-field mxt-dg-formula">
                    <span className="mxt-dg-field__label">{texts.textFormula}</span>
                    <textarea
                        ref={formulaRef}
                        className="form-control mxt-dg-formula__input"
                        rows={3}
                        value={formulaText}
                        spellCheck={false}
                        aria-invalid={Boolean(formulaError) || undefined}
                        aria-describedby="mxt-dg-formula-help"
                        onSelect={event => setCaret(event.currentTarget.selectionStart ?? 0)}
                        onChange={event => {
                            setFormulaText(event.target.value);
                            setCaret(event.target.selectionStart ?? event.target.value.length);
                            setSuggest(
                                referenceFragment(
                                    event.target.value,
                                    event.target.selectionStart ?? event.target.value.length
                                )
                            );
                        }}
                        onKeyDown={event => {
                            if (suggestions.length && (event.key === "Enter" || event.key === "Tab")) {
                                event.preventDefault();
                                insertReference(suggestions[0]);
                            }
                        }}
                    />
                    {suggestions.length > 0 && (
                        <ul className="mxt-dg-formula__suggest" role="listbox">
                            {suggestions.map(c => (
                                <li key={c.key} role="option" aria-selected={false}>
                                    <button
                                        type="button"
                                        onMouseDown={event => event.preventDefault()}
                                        onClick={() => insertReference(c)}
                                    >
                                        <Icon name={typeInfo(c.type).icon} size={13} /> {c.caption}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    {formulaError ? (
                        <p className="mxt-dg-field__error">{formulaError}</p>
                    ) : (
                        <p className="mxt-dg-field__help" id="mxt-dg-formula-help">
                            {texts.textFormulaHelp}
                        </p>
                    )}
                    {helpFor && (
                        <p className="mxt-dg-formula__sig" data-formula-help={helpFor}>
                            <code>{FUNCTION_HELP[helpFor]}</code>
                        </p>
                    )}
                    {!formulaError && formulaText.trim() && props.sampleRow && (
                        <p className="mxt-dg-formula__result" data-formula-result>
                            <span>{texts.textFormulaResult}:</span> <strong>{liveResult}</strong>
                        </p>
                    )}
                    <p className="mxt-dg-formula__fns">{FUNCTION_NAMES.join(" · ")}</p>
                </div>
            )}

            {!info.system && (
                <details className="mxt-dg-more">
                    <summary>
                        {texts.textDescription} · {texts.textDefaultValue} · {texts.textRequired}
                    </summary>
                    <label className="mxt-dg-field">
                        <span className="mxt-dg-field__label">{texts.textDescription}</span>
                        <textarea
                            className="form-control"
                            rows={2}
                            value={draft.description}
                            onChange={event => set({ description: event.target.value })}
                        />
                    </label>
                    <div className="mxt-dg-field">
                        <span className="mxt-dg-field__label">{texts.textDefaultValue}</span>
                        <FieldEditor
                            key={draft.type}
                            column={draft}
                            value={draft.defaultValue ?? null}
                            onChange={(value: CellValue | undefined) =>
                                value !== undefined && set({ defaultValue: value })
                            }
                        />
                    </div>
                    <div className="mxt-dg-field-row">
                        <label className="mxt-dg-check">
                            <input
                                type="checkbox"
                                checked={draft.required}
                                onChange={event => set({ required: event.target.checked })}
                            />
                            {texts.textRequired}
                        </label>
                        <label className="mxt-dg-check">
                            <input
                                type="checkbox"
                                checked={Boolean(draft.validation.unique)}
                                onChange={event =>
                                    set({
                                        validation: { ...draft.validation, unique: event.target.checked || undefined }
                                    })
                                }
                            />
                            {texts.textUnique}
                        </label>
                    </div>
                    {(info.kind === "number" || info.kind === "text") && (
                        <div className="mxt-dg-field-row">
                            <label className="mxt-dg-field">
                                <span className="mxt-dg-field__label">{texts.textMinimum}</span>
                                <input
                                    className="form-control"
                                    type="number"
                                    value={draft.validation.min ?? ""}
                                    onChange={event =>
                                        set({
                                            validation: {
                                                ...draft.validation,
                                                min: event.target.value === "" ? undefined : Number(event.target.value)
                                            }
                                        })
                                    }
                                />
                            </label>
                            <label className="mxt-dg-field">
                                <span className="mxt-dg-field__label">{texts.textMaximum}</span>
                                <input
                                    className="form-control"
                                    type="number"
                                    value={draft.validation.max ?? ""}
                                    onChange={event =>
                                        set({
                                            validation: {
                                                ...draft.validation,
                                                max: event.target.value === "" ? undefined : Number(event.target.value)
                                            }
                                        })
                                    }
                                />
                            </label>
                        </div>
                    )}
                    {info.kind === "text" && (
                        <label className="mxt-dg-field">
                            <span className="mxt-dg-field__label">{texts.textPattern}</span>
                            <input
                                className="form-control"
                                value={draft.validation.regex ?? ""}
                                spellCheck={false}
                                onChange={event =>
                                    set({ validation: { ...draft.validation, regex: event.target.value || undefined } })
                                }
                            />
                        </label>
                    )}
                    <label className="mxt-dg-field">
                        <span className="mxt-dg-field__label">{texts.textErrorMessage}</span>
                        <input
                            className="form-control"
                            value={draft.validation.message ?? ""}
                            onChange={event =>
                                set({ validation: { ...draft.validation, message: event.target.value || undefined } })
                            }
                        />
                    </label>
                </details>
            )}

            <div className="mxt-dg-coleditor__foot">
                <button type="button" className="btn btn-default mxt-dg-btn" onClick={onCancel}>
                    {texts.textCancel}
                </button>
                <button
                    type="submit"
                    className="btn btn-primary mxt-dg-btn"
                    disabled={!canSubmit}
                    data-action="submit-column"
                >
                    {isNew ? texts.textCreate : texts.textApply}
                </button>
            </div>
        </form>
    );
}

function mergeOptions(own: SelectOption[], fromConversion: SelectOption[]): SelectOption[] {
    const result = own
        .filter(option => option.label.trim())
        .map(option => ({ ...option, value: option.value || option.label }));
    fromConversion.forEach(option => {
        if (!result.some(existing => existing.value === option.value)) {
            result.push(option);
        }
    });
    return result;
}

/** Type groups of the field dialog (text keys of the group captions). */
const TYPE_GROUPS: Array<{ key: string; types: ColumnType[] }> = [
    { key: "textCatBasic", types: ["text", "longText", "boolean"] },
    { key: "textCatChoice", types: ["select", "multiSelect", "rating"] },
    { key: "textCatNumber", types: ["number", "decimal", "currency", "percent", "progress"] },
    { key: "textCatDate", types: ["date", "dateTime"] },
    { key: "textCatContact", types: ["user", "email", "phone", "link"] },
    { key: "textCatAdvanced", types: ["formula", "linkedRecord", "lookup", "rollup"] },
    { key: "textCatSystem", types: ["autoNumber", "createdAt", "changedAt", "createdBy", "changedBy"] }
];

/** A sample value for the live preview cell of a type. */
function previewValue(column: ColumnDef): CellValue {
    if (column.defaultValue !== undefined && column.defaultValue !== null) {
        return column.defaultValue;
    }
    switch (column.type) {
        case "longText":
            return "A longer note that can span several lines";
        case "number":
        case "autoNumber":
            return 1234;
        case "decimal":
            return 1234.5;
        case "currency":
            return 2480;
        case "percent":
            return 0.42;
        case "progress":
            return 65;
        case "rating":
            return 4;
        case "date":
            return "2026-11-02";
        case "dateTime":
        case "createdAt":
        case "changedAt":
            return "2026-11-02T09:30:00.000Z";
        case "boolean":
            return true;
        case "select":
            return column.options[0]?.value ?? null;
        case "multiSelect":
            return column.options.slice(0, 2).map(option => option.value);
        case "link":
            return "www.example.com";
        case "email":
            return "anna@example.com";
        case "phone":
            return "+31 20 123 4567";
        case "user":
        case "createdBy":
        case "changedBy":
            return "Anna de Vries";
        case "formula":
            return 42;
        default:
            return "Sample text";
    }
}
