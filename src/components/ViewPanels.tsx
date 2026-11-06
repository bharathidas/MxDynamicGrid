import { ReactElement, useRef, useState } from "react";

import { Icon } from "./Icon";
import { typeInfo } from "../utils/columnTypes";
import { MAX_GROUP_LEVELS, SortEntry } from "../utils/pipeline";
import type { RowHeightLevel } from "../utils/personalization";
import { needsValue, operatorsFor, RuleCondition, RuleOp, RuleSet } from "../utils/rules";
import { Texts } from "../utils/texts";
import { ColumnDef } from "../utils/types";

/** The panels of the view bar popovers: hide fields, filter rules, sort, group, row height. */

function FieldIcon({ column }: { column: ColumnDef }): ReactElement {
    return <Icon name={typeInfo(column.type).icon} size={13} />;
}

function FieldSelect({
    columns,
    value,
    onChange,
    label
}: {
    columns: ColumnDef[];
    value: string;
    onChange: (key: string) => void;
    label: string;
}): ReactElement {
    return (
        <select
            className="mxt-dg-vp-select"
            value={value}
            aria-label={label}
            onChange={event => onChange(event.target.value)}
        >
            {columns.map(column => (
                <option key={column.key} value={column.key}>
                    {column.caption}
                </option>
            ))}
        </select>
    );
}

// ---- Hide fields --------------------------------------------------------------------------------------

export function HideFieldsPanel({
    texts: t,
    columns,
    isHidden,
    onToggle,
    onAll,
    onMove,
    canReorder
}: {
    texts: Texts;
    columns: ColumnDef[];
    isHidden: (column: ColumnDef) => boolean;
    onToggle: (key: string, hidden: boolean) => void;
    onAll: (hidden: boolean) => void;
    onMove: (key: string, toKey: string) => void;
    canReorder: boolean;
}): ReactElement {
    const [query, setQuery] = useState("");
    const drag = useRef<string | null>(null);
    const shown = columns.filter(column => !query || column.caption.toLowerCase().includes(query.toLowerCase()));
    return (
        <div className="mxt-dg-vp mxt-dg-vp--fields" data-panel="hide">
            <input
                className="mxt-dg-vp-search"
                value={query}
                autoFocus
                placeholder={t.textFindField}
                aria-label={t.textFindField}
                onChange={event => setQuery(event.target.value)}
            />
            <ul className="mxt-dg-vp-list">
                {shown.map(column => {
                    const hidden = isHidden(column);
                    return (
                        <li
                            key={column.key}
                            className="mxt-dg-vp-field"
                            draggable={canReorder && !query}
                            onDragStart={() => (drag.current = column.key)}
                            onDragOver={event => drag.current && event.preventDefault()}
                            onDrop={() => {
                                if (drag.current && drag.current !== column.key) {
                                    onMove(drag.current, column.key);
                                }
                                drag.current = null;
                            }}
                        >
                            <button
                                type="button"
                                role="switch"
                                aria-checked={!hidden}
                                className={`mxt-dg-switch${hidden ? "" : " is-on"}`}
                                aria-label={column.caption}
                                onClick={() => onToggle(column.key, !hidden)}
                            >
                                <span />
                            </button>
                            <FieldIcon column={column} />
                            <span className="mxt-dg-vp-field__name">{column.caption}</span>
                            {canReorder && !query && (
                                <span className="mxt-dg-vp-drag" aria-hidden>
                                    <Icon name="drag" size={12} />
                                </span>
                            )}
                        </li>
                    );
                })}
            </ul>
            <div className="mxt-dg-vp-foot">
                <button type="button" className="mxt-dg-vp-link" onClick={() => onAll(true)}>
                    {t.textHideAll}
                </button>
                <button type="button" className="mxt-dg-vp-link" onClick={() => onAll(false)}>
                    {t.textShowAll}
                </button>
            </div>
        </div>
    );
}

// ---- Filter rule builder ------------------------------------------------------------------------------

export function opLabel(t: Texts, op: RuleOp): string {
    const map: Record<RuleOp, string> = {
        is: t.textOpIs,
        isNot: t.textOpIsNot,
        contains: t.textOpContains,
        notContains: t.textOpNotContains,
        isEmpty: t.textOpIsEmpty,
        isNotEmpty: t.textOpIsNotEmpty,
        eq: "=",
        neq: "≠",
        gt: t.textOpGt,
        gte: t.textOpGte,
        lt: t.textOpLt,
        lte: t.textOpLte,
        isAnyOf: t.textOpIsAnyOf,
        isNoneOf: t.textOpIsNoneOf,
        before: t.textOpBefore,
        after: t.textOpAfter,
        onOrBefore: `${t.textOpBefore} =`,
        onOrAfter: `${t.textOpAfter} =`,
        isWithin: t.textOpIsWithin
    };
    return map[op];
}

function ValueInput({
    texts: t,
    column,
    condition,
    onChange
}: {
    texts: Texts;
    column: ColumnDef;
    condition: RuleCondition;
    onChange: (value: RuleCondition["value"]) => void;
}): ReactElement | null {
    const kind = typeInfo(column.type).kind;
    if (!needsValue(condition.op)) {
        return null;
    }
    if (kind === "boolean") {
        return (
            <select
                className="mxt-dg-vp-select"
                aria-label="Value"
                value={condition.value === true ? "true" : "false"}
                onChange={event => onChange(event.target.value === "true")}
            >
                <option value="true">{t.textChecked}</option>
                <option value="false">{t.textUnchecked}</option>
            </select>
        );
    }
    if (kind === "date" && condition.op === "isWithin") {
        return (
            <select
                className="mxt-dg-vp-select"
                aria-label="Value"
                value={String(condition.value ?? "thisWeek")}
                onChange={event => onChange(event.target.value)}
            >
                <option value="today">{t.textToday}</option>
                <option value="thisWeek">{t.textThisWeek}</option>
                <option value="nextWeek">{t.textNextWeek}</option>
                <option value="pastWeek">{t.textPastWeek}</option>
                <option value="thisMonth">{t.textThisMonth}</option>
            </select>
        );
    }
    if (kind === "select" || kind === "multi") {
        const multiple = condition.op === "isAnyOf" || condition.op === "isNoneOf" || kind === "multi";
        const selected = Array.isArray(condition.value)
            ? condition.value.map(String)
            : condition.value
            ? [String(condition.value)]
            : [];
        if (!multiple) {
            return (
                <select
                    className="mxt-dg-vp-select"
                    aria-label="Value"
                    value={selected[0] ?? ""}
                    onChange={event => onChange(event.target.value)}
                >
                    <option value="" />
                    {column.options.map(option => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            );
        }
        return (
            <span className="mxt-dg-vp-chips">
                {column.options.map(option => {
                    const on = selected.includes(option.value);
                    return (
                        <button
                            key={option.value}
                            type="button"
                            className={`mxt-dg-chip mxt-dg-vp-chip${on ? " is-on" : ""}`}
                            style={{ ["--mxt-dg-chip" as string]: option.color }}
                            aria-pressed={on}
                            onClick={() =>
                                onChange(on ? selected.filter(v => v !== option.value) : [...selected, option.value])
                            }
                        >
                            {option.label}
                        </button>
                    );
                })}
            </span>
        );
    }
    return (
        <input
            className="mxt-dg-vp-input"
            aria-label="Value"
            type={kind === "number" ? "number" : kind === "date" ? "date" : "text"}
            value={condition.value === undefined || condition.value === null ? "" : String(condition.value)}
            onChange={event =>
                onChange(
                    kind === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value
                )
            }
        />
    );
}

export function FilterPanel({
    texts: t,
    columns,
    rules,
    onChange
}: {
    texts: Texts;
    columns: ColumnDef[];
    rules: RuleSet;
    onChange: (rules: RuleSet) => void;
}): ReactElement {
    const setCondition = (index: number, patch: Partial<RuleCondition>): void =>
        onChange({ ...rules, conditions: rules.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)) });
    const add = (): void => {
        const column = columns[0];
        if (column) {
            onChange({
                ...rules,
                conditions: [...rules.conditions, { col: column.key, op: operatorsFor(column)[0], value: null }]
            });
        }
    };
    return (
        <div className="mxt-dg-vp mxt-dg-vp--filter" data-panel="filter">
            {rules.conditions.length === 0 && <p className="mxt-dg-vp-empty">{t.textNoConditions}</p>}
            {rules.conditions.map((condition, index) => {
                const column = columns.find(c => c.key === condition.col) ?? columns[0];
                if (!column) {
                    return null;
                }
                return (
                    <div key={index} className="mxt-dg-vp-rule" data-rule={index}>
                        <span className="mxt-dg-vp-rule__lead">
                            {index === 0 ? (
                                t.textWhere
                            ) : index === 1 ? (
                                <select
                                    className="mxt-dg-vp-select"
                                    aria-label="And or"
                                    value={rules.conjunction}
                                    onChange={event =>
                                        onChange({ ...rules, conjunction: event.target.value === "or" ? "or" : "and" })
                                    }
                                >
                                    <option value="and">{t.textAnd}</option>
                                    <option value="or">{t.textOr}</option>
                                </select>
                            ) : rules.conjunction === "or" ? (
                                t.textOr
                            ) : (
                                t.textAnd
                            )}
                        </span>
                        <FieldSelect
                            columns={columns}
                            value={column.key}
                            label={t.textFieldName}
                            onChange={key => {
                                const next = columns.find(c => c.key === key);
                                if (next) {
                                    setCondition(index, { col: key, op: operatorsFor(next)[0], value: null });
                                }
                            }}
                        />
                        <select
                            className="mxt-dg-vp-select"
                            aria-label="Operator"
                            value={condition.op}
                            onChange={event => setCondition(index, { op: event.target.value as RuleOp })}
                        >
                            {operatorsFor(column).map(op => (
                                <option key={op} value={op}>
                                    {opLabel(t, op)}
                                </option>
                            ))}
                        </select>
                        <ValueInput
                            texts={t}
                            column={column}
                            condition={condition}
                            onChange={value => setCondition(index, { value })}
                        />
                        <button
                            type="button"
                            className="mxt-dg-iconbtn mxt-dg-vp-remove"
                            aria-label={t.textRemoveRule}
                            onClick={() =>
                                onChange({ ...rules, conditions: rules.conditions.filter((_, i) => i !== index) })
                            }
                        >
                            <Icon name="trash" size={13} />
                        </button>
                    </div>
                );
            })}
            <button type="button" className="mxt-dg-vp-link" data-action="add-condition" onClick={add}>
                <Icon name="plus" size={12} /> {t.textAddCondition}
            </button>
        </div>
    );
}

// ---- Sort ---------------------------------------------------------------------------------------------

export function SortPanel({
    texts: t,
    columns,
    sort,
    onChange
}: {
    texts: Texts;
    columns: ColumnDef[];
    sort: SortEntry[];
    onChange: (sort: SortEntry[]) => void;
}): ReactElement {
    const drag = useRef<number | null>(null);
    const unused = columns.filter(column => !sort.some(entry => entry.col === column.key));
    return (
        <div className="mxt-dg-vp mxt-dg-vp--sort" data-panel="sort">
            {sort.length === 0 && <p className="mxt-dg-vp-empty">{t.textNoSorts}</p>}
            {sort.map((entry, index) => (
                <div
                    key={entry.col}
                    className="mxt-dg-vp-rule"
                    draggable
                    onDragStart={() => (drag.current = index)}
                    onDragOver={event => event.preventDefault()}
                    onDrop={() => {
                        const from = drag.current;
                        drag.current = null;
                        if (from === null || from === index) {
                            return;
                        }
                        const next = [...sort];
                        const [moved] = next.splice(from, 1);
                        next.splice(index, 0, moved);
                        onChange(next);
                    }}
                >
                    <span className="mxt-dg-vp-drag" aria-hidden>
                        <Icon name="drag" size={12} />
                    </span>
                    <FieldSelect
                        columns={columns.filter(c => c.key === entry.col || !sort.some(s => s.col === c.key))}
                        value={entry.col}
                        label={t.textFieldName}
                        onChange={key => onChange(sort.map((s, i) => (i === index ? { ...s, col: key } : s)))}
                    />
                    <span className="mxt-dg-seg" role="group">
                        {(["asc", "desc"] as const).map(dir => (
                            <button
                                key={dir}
                                type="button"
                                className={entry.dir === dir ? "is-on" : ""}
                                aria-pressed={entry.dir === dir}
                                onClick={() => onChange(sort.map((s, i) => (i === index ? { ...s, dir } : s)))}
                            >
                                {dir === "asc" ? t.textAscending : t.textDescending}
                            </button>
                        ))}
                    </span>
                    <button
                        type="button"
                        className="mxt-dg-iconbtn mxt-dg-vp-remove"
                        aria-label={t.textRemoveRule}
                        onClick={() => onChange(sort.filter((_, i) => i !== index))}
                    >
                        <Icon name="close" size={13} />
                    </button>
                </div>
            ))}
            {unused.length > 0 && (
                <button
                    type="button"
                    className="mxt-dg-vp-link"
                    data-action="add-sort"
                    onClick={() => onChange([...sort, { col: unused[0].key, dir: "asc" }])}
                >
                    <Icon name="plus" size={12} /> {t.textAddSort}
                </button>
            )}
        </div>
    );
}

// ---- Group --------------------------------------------------------------------------------------------

export function GroupPanel({
    texts: t,
    columns,
    groupBy,
    onChange,
    onExpandAll,
    onCollapseAll
}: {
    texts: Texts;
    columns: ColumnDef[];
    groupBy: string[];
    onChange: (groupBy: string[]) => void;
    onExpandAll: () => void;
    onCollapseAll: () => void;
}): ReactElement {
    const unused = columns.filter(column => !groupBy.includes(column.key));
    return (
        <div className="mxt-dg-vp mxt-dg-vp--group" data-panel="group">
            {groupBy.length === 0 && <p className="mxt-dg-vp-empty">{t.textNoGroups}</p>}
            {groupBy.map((key, index) => (
                <div key={key} className="mxt-dg-vp-rule">
                    <span className="mxt-dg-vp-rule__lead">{index + 1}</span>
                    <FieldSelect
                        columns={columns.filter(c => c.key === key || !groupBy.includes(c.key))}
                        value={key}
                        label={t.textGroupBy}
                        onChange={next => onChange(groupBy.map((g, i) => (i === index ? next : g)))}
                    />
                    <button
                        type="button"
                        className="mxt-dg-iconbtn mxt-dg-vp-remove"
                        aria-label={t.textRemoveRule}
                        onClick={() => onChange(groupBy.filter((_, i) => i !== index))}
                    >
                        <Icon name="close" size={13} />
                    </button>
                </div>
            ))}
            {unused.length > 0 && groupBy.length < MAX_GROUP_LEVELS && (
                <button
                    type="button"
                    className="mxt-dg-vp-link"
                    data-action="add-group"
                    onClick={() => onChange([...groupBy, unused[0].key])}
                >
                    <Icon name="plus" size={12} /> {groupBy.length ? t.textAddGroup : t.textGroupBy}
                </button>
            )}
            {groupBy.length > 0 && (
                <div className="mxt-dg-vp-foot">
                    <button type="button" className="mxt-dg-vp-link" onClick={onCollapseAll}>
                        {t.textCollapseAll}
                    </button>
                    <button type="button" className="mxt-dg-vp-link" onClick={onExpandAll}>
                        {t.textExpandAll}
                    </button>
                </div>
            )}
        </div>
    );
}

// ---- Row height ---------------------------------------------------------------------------------------

export const ROW_HEIGHTS: Record<RowHeightLevel, number> = { short: 32, medium: 40, tall: 56, extraTall: 88 };

export function RowHeightPanel({
    texts: t,
    value,
    onChange
}: {
    texts: Texts;
    value: RowHeightLevel;
    onChange: (value: RowHeightLevel) => void;
}): ReactElement {
    const levels: Array<[RowHeightLevel, string]> = [
        ["short", t.textRowShort],
        ["medium", t.textRowMedium],
        ["tall", t.textRowTall],
        ["extraTall", t.textRowExtraTall]
    ];
    return (
        <div className="mxt-dg-vp mxt-dg-vp--height" data-panel="height" role="radiogroup">
            {levels.map(([level, label]) => (
                <button
                    key={level}
                    type="button"
                    role="radio"
                    aria-checked={value === level}
                    className={`mxt-dg-vp-height${value === level ? " is-on" : ""}`}
                    data-height={level}
                    onClick={() => onChange(level)}
                >
                    <span className="mxt-dg-vp-height__bars" style={{ height: ROW_HEIGHTS[level] / 4 }} aria-hidden />
                    {label}
                </button>
            ))}
        </div>
    );
}
