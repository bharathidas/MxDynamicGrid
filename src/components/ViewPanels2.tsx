import { ReactElement } from "react";

import { Icon } from "./Icon";
import { FilterPanel } from "./ViewPanels";
import { OPTION_COLORS, typeInfo } from "../utils/columnTypes";
import type { RowColor, ViewState, ViewType } from "../utils/personalization";
import { AggregateFn, summaryFunctions } from "../utils/pipeline";
import { emptyRules } from "../utils/rules";
import { summaryLabel, Texts } from "../utils/texts";
import { ColumnDef } from "../utils/types";

/** 1.2 view-bar panels: row colour and the layout settings of board, calendar and gallery views. */

const RULE_COLORS = ["#FEE2E2", "#FEF3C7", "#DCFCE7", "#DBEAFE", "#EDE9FE", "#FCE7F3"];

export function ColorPanel({
    texts: t,
    columns,
    color,
    onChange
}: {
    texts: Texts;
    columns: ColumnDef[];
    color: RowColor | undefined;
    onChange: (color: RowColor | undefined) => void;
}): ReactElement {
    const selects = columns.filter(column => column.type === "select");
    const mode = color?.mode ?? "none";
    return (
        <div className="mxt-dg-vp mxt-dg-vp--color" data-panel="color">
            <div className="mxt-dg-seg mxt-dg-seg--wide" role="radiogroup">
                <button
                    type="button"
                    className={mode === "none" ? "is-on" : ""}
                    aria-pressed={mode === "none"}
                    onClick={() => onChange(undefined)}
                >
                    {t.textColorNone}
                </button>
                <button
                    type="button"
                    data-color-mode="select"
                    className={mode === "select" ? "is-on" : ""}
                    aria-pressed={mode === "select"}
                    disabled={!selects.length}
                    onClick={() => onChange({ mode: "select", col: color?.col ?? selects[0]?.key })}
                >
                    {t.textColorBySelect}
                </button>
                <button
                    type="button"
                    data-color-mode="rules"
                    className={mode === "rules" ? "is-on" : ""}
                    aria-pressed={mode === "rules"}
                    onClick={() =>
                        onChange({
                            mode: "rules",
                            rules: color?.rules?.length
                                ? color.rules
                                : [{ color: RULE_COLORS[0], conditions: emptyRules() }]
                        })
                    }
                >
                    {t.textColorByConditions}
                </button>
            </div>
            {mode === "select" && (
                <div className="mxt-dg-vp-rule">
                    <select
                        className="mxt-dg-vp-select"
                        aria-label={t.textColorBySelect}
                        value={color?.col ?? ""}
                        onChange={event => onChange({ mode: "select", col: event.target.value })}
                    >
                        {selects.map(column => (
                            <option key={column.key} value={column.key}>
                                {column.caption}
                            </option>
                        ))}
                    </select>
                    <span className="mxt-dg-vp-swatches">
                        {(selects.find(c => c.key === color?.col)?.options ?? []).slice(0, 8).map(option => (
                            <span
                                key={option.value}
                                className="mxt-dg-vp-swatch"
                                style={{ background: option.color }}
                                title={option.label}
                            />
                        ))}
                    </span>
                </div>
            )}
            {mode === "rules" &&
                (color?.rules ?? []).map((rule, index) => (
                    <div key={index} className="mxt-dg-colorrule" data-color-rule={index}>
                        <div className="mxt-dg-colorrule__head">
                            <span className="mxt-dg-vp-swatches">
                                {RULE_COLORS.map(swatch => (
                                    <button
                                        key={swatch}
                                        type="button"
                                        aria-label={swatch}
                                        className={`mxt-dg-vp-swatch${rule.color === swatch ? " is-on" : ""}`}
                                        style={{ background: swatch }}
                                        onClick={() =>
                                            onChange({
                                                mode: "rules",
                                                rules: (color?.rules ?? []).map((r, i) =>
                                                    i === index ? { ...r, color: swatch } : r
                                                )
                                            })
                                        }
                                    />
                                ))}
                            </span>
                            <button
                                type="button"
                                className="mxt-dg-iconbtn mxt-dg-vp-remove"
                                aria-label={t.textRemoveRule}
                                onClick={() =>
                                    onChange({
                                        mode: "rules",
                                        rules: (color?.rules ?? []).filter((_, i) => i !== index)
                                    })
                                }
                            >
                                <Icon name="trash" size={13} />
                            </button>
                        </div>
                        <FilterPanel
                            texts={t}
                            columns={columns}
                            rules={rule.conditions}
                            onChange={conditions =>
                                onChange({
                                    mode: "rules",
                                    rules: (color?.rules ?? []).map((r, i) => (i === index ? { ...r, conditions } : r))
                                })
                            }
                        />
                    </div>
                ))}
            {mode === "rules" && (
                <button
                    type="button"
                    className="mxt-dg-vp-link"
                    data-action="add-color-rule"
                    onClick={() =>
                        onChange({
                            mode: "rules",
                            rules: [
                                ...(color?.rules ?? []),
                                {
                                    color: RULE_COLORS[(color?.rules?.length ?? 0) % RULE_COLORS.length],
                                    conditions: emptyRules()
                                }
                            ]
                        })
                    }
                >
                    <Icon name="plus" size={12} /> {t.textAddColorRule}
                </button>
            )}
            <p className="mxt-dg-vp-empty mxt-dg-vp-note">{t.textColorScaleHint}</p>
        </div>
    );
}

function FieldPicker({
    columns,
    value,
    onChange,
    label,
    allowEmpty
}: {
    columns: ColumnDef[];
    value?: string;
    onChange: (key: string | undefined) => void;
    label: string;
    allowEmpty?: string;
}): ReactElement {
    return (
        <label className="mxt-dg-vp-row">
            <span>{label}</span>
            <select
                className="mxt-dg-vp-select"
                aria-label={label}
                value={value ?? ""}
                onChange={event => onChange(event.target.value || undefined)}
            >
                {allowEmpty !== undefined && <option value="">{allowEmpty}</option>}
                {columns.map(column => (
                    <option key={column.key} value={column.key}>
                        {column.caption}
                    </option>
                ))}
            </select>
        </label>
    );
}

function CardFields({
    texts: t,
    columns,
    value,
    onChange
}: {
    texts: Texts;
    columns: ColumnDef[];
    value: string[];
    onChange: (fields: string[]) => void;
}): ReactElement {
    return (
        <div className="mxt-dg-vp-row mxt-dg-vp-row--top">
            <span>{t.textCardFields}</span>
            <span className="mxt-dg-vp-chips">
                {columns.map(column => {
                    const on = value.includes(column.key);
                    return (
                        <button
                            key={column.key}
                            type="button"
                            aria-pressed={on}
                            className={`mxt-dg-vp-fieldchip${on ? " is-on" : ""}`}
                            onClick={() =>
                                onChange(on ? value.filter(k => k !== column.key) : [...value, column.key].slice(0, 6))
                            }
                        >
                            <Icon name={typeInfo(column.type).icon} size={12} /> {column.caption}
                        </button>
                    );
                })}
            </span>
        </div>
    );
}

/** Defaults for a view type: the first matching fields of the grid. */
export function defaultLayout(type: ViewType, columns: ColumnDef[]): Partial<ViewState> {
    const firstOf = (test: (c: ColumnDef) => boolean): string | undefined => columns.find(test)?.key;
    const others = (exclude: Array<string | undefined>): string[] =>
        columns
            .filter(c => !exclude.includes(c.key) && c !== columns[0])
            .slice(0, 3)
            .map(c => c.key);
    if (type === "board") {
        const col = firstOf(c => c.type === "select");
        const numeric = firstOf(c => ["currency", "decimal", "number"].includes(c.type));
        return { board: { col, fields: others([col]), summary: numeric ? { col: numeric, fn: "sum" } : undefined } };
    }
    if (type === "calendar") {
        return { calendar: { start: firstOf(c => c.type === "date" || c.type === "dateTime"), mode: "month" } };
    }
    if (type === "gallery") {
        const cover = firstOf(c => c.type === "link");
        return { gallery: { cover, fields: others([cover]) } };
    }
    return {};
}

export function LayoutPanel({
    texts: t,
    columns,
    view,
    onChange
}: {
    texts: Texts;
    columns: ColumnDef[];
    view: ViewState;
    onChange: (patch: Partial<ViewState>) => void;
}): ReactElement {
    const type = view.viewType ?? "grid";
    const selects = columns.filter(c => c.type === "select");
    const dates = columns.filter(c => typeInfo(c.type).kind === "date");
    const numbers = columns.filter(c => typeInfo(c.type).kind === "number");
    return (
        <div className="mxt-dg-vp mxt-dg-vp--layout" data-panel="layout">
            {type === "board" && (
                <>
                    <FieldPicker
                        columns={selects}
                        label={t.textBoardBy}
                        value={view.board?.col}
                        onChange={col => onChange({ board: { ...view.board, col } })}
                    />
                    <CardFields
                        texts={t}
                        columns={columns.slice(1)}
                        value={view.board?.fields ?? []}
                        onChange={fields => onChange({ board: { ...view.board, fields } })}
                    />
                    <div className="mxt-dg-vp-row">
                        <span>{t.textLaneSummary}</span>
                        <select
                            className="mxt-dg-vp-select"
                            aria-label={t.textLaneSummary}
                            value={view.board?.summary?.col ?? ""}
                            onChange={event =>
                                onChange({
                                    board: {
                                        ...view.board,
                                        summary: event.target.value
                                            ? { col: event.target.value, fn: view.board?.summary?.fn ?? "sum" }
                                            : undefined
                                    }
                                })
                            }
                        >
                            <option value="">{t.textNone}</option>
                            {numbers.map(column => (
                                <option key={column.key} value={column.key}>
                                    {column.caption}
                                </option>
                            ))}
                        </select>
                        {view.board?.summary && (
                            <select
                                className="mxt-dg-vp-select"
                                aria-label={t.textSummarize}
                                value={view.board.summary.fn}
                                onChange={event =>
                                    onChange({
                                        board: {
                                            ...view.board,
                                            summary: {
                                                col: view.board?.summary?.col as string,
                                                fn: event.target.value as AggregateFn
                                            }
                                        }
                                    })
                                }
                            >
                                {summaryFunctions(numbers.find(c => c.key === view.board?.summary?.col) ?? numbers[0])
                                    .filter(fn => fn !== "none")
                                    .map(fn => (
                                        <option key={fn} value={fn}>
                                            {summaryLabel(t, fn)}
                                        </option>
                                    ))}
                            </select>
                        )}
                    </div>
                </>
            )}
            {type === "calendar" && (
                <>
                    <FieldPicker
                        columns={dates}
                        label={t.textDateField}
                        value={view.calendar?.start}
                        onChange={start => onChange({ calendar: { ...view.calendar, start } })}
                    />
                    <FieldPicker
                        columns={dates}
                        label={t.textEndField}
                        value={view.calendar?.end}
                        allowEmpty={t.textNone}
                        onChange={end => onChange({ calendar: { ...view.calendar, end } })}
                    />
                </>
            )}
            {type === "gallery" && (
                <>
                    <FieldPicker
                        columns={columns.filter(c => c.type === "link" || c.type === "text")}
                        label={t.textCoverField}
                        value={view.gallery?.cover}
                        allowEmpty={t.textNoCover}
                        onChange={cover => onChange({ gallery: { ...view.gallery, cover } })}
                    />
                    <CardFields
                        texts={t}
                        columns={columns.slice(1)}
                        value={view.gallery?.fields ?? []}
                        onChange={fields => onChange({ gallery: { ...view.gallery, fields } })}
                    />
                </>
            )}
        </div>
    );
}

export const VIEW_TYPE_ICON: Record<ViewType, string> = {
    grid: "columns",
    board: "board",
    calendar: "calendar",
    gallery: "gallery"
};
export { OPTION_COLORS };
