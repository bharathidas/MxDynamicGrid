import { CSSProperties, ReactElement } from "react";

import { typeInfo } from "../utils/columnTypes";
import { cellHref as href } from "../utils/links";
import { asArray, formatValue, isEmpty, linkedLabel, optionFor } from "../utils/values";
import { CellValue, ColumnDef } from "../utils/types";

/** Read-only presentation of a value by type: chips, stars, bars, links, checkboxes. */

export function OptionChip({ label, color }: { label: string; color?: string }): ReactElement {
    const style: CSSProperties | undefined = color ? ({ "--mxt-dg-chip": color } as CSSProperties) : undefined;
    return (
        <span className="mxt-dg-chip" style={style}>
            {label}
        </span>
    );
}

export function Stars({
    value,
    max,
    onChange
}: {
    value: number;
    max: number;
    onChange?: (value: number) => void;
}): ReactElement {
    return (
        <span className="mxt-dg-stars" role={onChange ? "radiogroup" : undefined}>
            {Array.from({ length: max }, (_, index) => {
                const on = index < value;
                return onChange ? (
                    <button
                        key={index}
                        type="button"
                        role="radio"
                        aria-checked={index + 1 === value}
                        aria-label={`${index + 1}`}
                        className={on ? "mxt-dg-star mxt-dg-star--on" : "mxt-dg-star"}
                        onMouseDown={event => event.preventDefault()}
                        onClick={() => onChange(index + 1 === value ? 0 : index + 1)}
                    >
                        ★
                    </button>
                ) : (
                    <span key={index} className={on ? "mxt-dg-star mxt-dg-star--on" : "mxt-dg-star"} aria-hidden>
                        ★
                    </span>
                );
            })}
        </span>
    );
}

export function ProgressBar({ value }: { value: number }): ReactElement {
    const pct = Math.max(0, Math.min(100, value));
    return (
        <span className="mxt-dg-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <span className="mxt-dg-progress__track">
                <span className="mxt-dg-progress__bar" style={{ width: `${pct}%` }} />
            </span>
            <span className="mxt-dg-progress__label">{Math.round(pct)}%</span>
        </span>
    );
}

export interface CellViewProps {
    column: ColumnDef;
    value: CellValue | undefined;
    pendingText?: string;
    /** Inline toggles for checkbox, rating and progress (no editor needed). */
    onQuickChange?: (value: CellValue) => void;
}

export function CellView({ column, value, pendingText, onQuickChange }: CellViewProps): ReactElement | null {
    const info = typeInfo(column.type);
    if (column.type === "formula" && typeof value === "string" && value.startsWith("#")) {
        return (
            <span className="mxt-dg-formula-error" title={value}>
                {value}
            </span>
        );
    }
    if (info.system && isEmpty(value) && pendingText) {
        return <span className="mxt-dg-muted">{pendingText}</span>;
    }
    switch (column.type) {
        case "boolean": {
            const checked = value === true;
            return (
                <span className="mxt-dg-check-cell">
                    <input
                        type="checkbox"
                        className="mxt-dg-checkbox"
                        checked={checked}
                        disabled={!onQuickChange}
                        tabIndex={-1}
                        aria-label={column.caption}
                        onChange={() => onQuickChange?.(!checked)}
                    />
                </span>
            );
        }
        case "rating":
            return <Stars value={Number(value) || 0} max={column.max ?? 5} onChange={onQuickChange} />;
        case "progress":
            return isEmpty(value) ? null : <ProgressBar value={Number(value)} />;
        case "select": {
            if (isEmpty(value)) {
                return null;
            }
            const option = optionFor(column, value);
            return <OptionChip label={option?.label ?? String(value)} color={option?.color} />;
        }
        case "linkedRecord":
            return (
                <span className="mxt-dg-chips">
                    {asArray(value).map(key => (
                        <span key={key} className="mxt-dg-chip mxt-dg-chip--link">
                            {linkedLabel(key)}
                        </span>
                    ))}
                </span>
            );
        case "multiSelect":
            return (
                <span className="mxt-dg-chips">
                    {asArray(value).map(item => {
                        const option = optionFor(column, item);
                        return <OptionChip key={item} label={option?.label ?? item} color={option?.color} />;
                    })}
                </span>
            );
        case "link":
        case "email":
        case "phone": {
            if (isEmpty(value)) {
                return null;
            }
            const text = String(value);
            const target = href(column, text);
            return target ? (
                <a
                    className="mxt-dg-link"
                    href={target}
                    target={column.type === "link" ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    onClick={event => event.stopPropagation()}
                    tabIndex={-1}
                >
                    {text}
                </a>
            ) : (
                <span>{text}</span>
            );
        }
        case "user":
        case "createdBy":
        case "changedBy": {
            if (isEmpty(value)) {
                return null;
            }
            const text = String(value);
            const initials = text
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map(part => part[0].toUpperCase())
                .join("");
            return (
                <span className="mxt-dg-user">
                    <span className="mxt-dg-avatar" aria-hidden>
                        {initials}
                    </span>
                    {text}
                </span>
            );
        }
        case "longText":
            return <span className="mxt-dg-longtext">{isEmpty(value) ? "" : String(value)}</span>;
        default:
            return <span className="mxt-dg-text">{formatValue(column, value)}</span>;
    }
}
