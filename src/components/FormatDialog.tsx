import { ReactElement } from "react";

import { Icon } from "./Icon";
import { Dialog } from "./Popover";
import { typeInfo } from "../utils/columnTypes";
import type { FormatRule } from "../utils/personalization";
import { AggregateFn, summaryFunctions } from "../utils/pipeline";
import { summaryLabel, Texts } from "../utils/texts";
import { ColumnDef } from "../utils/types";

/** Conditional formatting rules and the totals function of one column (view state). */
export function FormatDialog({
    texts: t,
    column,
    rules,
    onChange,
    aggregate,
    onAggregate,
    onClose
}: {
    texts: Texts;
    column: ColumnDef;
    rules: FormatRule[];
    onChange: (rules: FormatRule[]) => void;
    aggregate: AggregateFn;
    onAggregate: (fn: AggregateFn) => void;
    onClose: () => void;
}): ReactElement {
    const numeric = typeInfo(column.type).kind === "number" || typeInfo(column.type).kind === "date";
    const set = (index: number, rule: FormatRule): void => onChange(rules.map((r, i) => (i === index ? rule : r)));
    return (
        <Dialog title={`${t.textFormatting}: ${column.caption}`} onClose={onClose} width={520}>
            <label className="mxt-dg-field">
                <span className="mxt-dg-field__label">{t.textTotal}</span>
                <select
                    className="form-control"
                    value={aggregate}
                    onChange={event => onAggregate(event.target.value as AggregateFn)}
                >
                    {summaryFunctions(column).map(fn => (
                        <option key={fn} value={fn}>
                            {summaryLabel(t, fn)}
                        </option>
                    ))}
                </select>
            </label>
            <ul className="mxt-dg-rules">
                {rules.map((rule, index) => (
                    <li key={index} className="mxt-dg-rule">
                        {rule.kind === "colorScale" && (
                            <>
                                <span className="mxt-dg-rule__name">{t.textColorScale}</span>
                                <input
                                    type="color"
                                    aria-label="Low"
                                    value={rule.low ?? "#f8696b"}
                                    onChange={event => set(index, { ...rule, low: event.target.value })}
                                />
                                <span
                                    className="mxt-dg-rule__scale"
                                    style={{
                                        background: `linear-gradient(90deg, ${rule.low ?? "#f8696b"}, ${
                                            rule.high ?? "#63be7b"
                                        })`
                                    }}
                                />
                                <input
                                    type="color"
                                    aria-label="High"
                                    value={rule.high ?? "#63be7b"}
                                    onChange={event => set(index, { ...rule, high: event.target.value })}
                                />
                            </>
                        )}
                        {rule.kind === "dataBar" && (
                            <>
                                <span className="mxt-dg-rule__name">{t.textDataBar}</span>
                                <input
                                    type="color"
                                    aria-label={t.textDataBar}
                                    value={rule.color ?? "#264ae5"}
                                    onChange={event => set(index, { ...rule, color: event.target.value })}
                                />
                            </>
                        )}
                        {rule.kind === "textColor" && (
                            <>
                                <span className="mxt-dg-rule__name">{t.textTextColor}</span>
                                <select
                                    className="form-control"
                                    value={rule.op}
                                    aria-label="Operator"
                                    onChange={event =>
                                        set(index, { ...rule, op: event.target.value as typeof rule.op })
                                    }
                                >
                                    <option value="=">=</option>
                                    <option value="<>">≠</option>
                                    <option value="<">&lt;</option>
                                    <option value=">">&gt;</option>
                                    <option value="contains">{t.textFilterContains}</option>
                                </select>
                                <input
                                    className="form-control"
                                    value={rule.value}
                                    aria-label="Value"
                                    onChange={event => set(index, { ...rule, value: event.target.value })}
                                />
                                <input
                                    type="color"
                                    aria-label="Color"
                                    value={rule.color}
                                    onChange={event => set(index, { ...rule, color: event.target.value })}
                                />
                            </>
                        )}
                        <button
                            type="button"
                            className="mxt-dg-iconbtn"
                            aria-label={t.textRemoveRule}
                            onClick={() => onChange(rules.filter((_, i) => i !== index))}
                        >
                            <Icon name="trash" size={14} />
                        </button>
                    </li>
                ))}
            </ul>
            <div className="mxt-dg-rules__add">
                {numeric && (
                    <>
                        <button
                            type="button"
                            className="btn btn-default mxt-dg-btn"
                            onClick={() => onChange([...rules, { kind: "colorScale" }])}
                        >
                            <Icon name="plus" size={13} /> {t.textColorScale}
                        </button>
                        <button
                            type="button"
                            className="btn btn-default mxt-dg-btn"
                            onClick={() => onChange([...rules, { kind: "dataBar" }])}
                        >
                            <Icon name="plus" size={13} /> {t.textDataBar}
                        </button>
                    </>
                )}
                <button
                    type="button"
                    className="btn btn-default mxt-dg-btn"
                    onClick={() => onChange([...rules, { kind: "textColor", op: "=", value: "", color: "#c0392b" }])}
                >
                    <Icon name="plus" size={13} /> {t.textTextColor}
                </button>
            </div>
        </Dialog>
    );
}
