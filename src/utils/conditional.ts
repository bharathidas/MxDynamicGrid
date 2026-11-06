import { CSSProperties } from "react";

import { typeInfo } from "./columnTypes";
import type { FormatRule } from "./personalization";
import { formatValue, isEmpty, toDate } from "./values";
import { CellValue, ColumnDef, RowRecord } from "./types";

/** Conditional formatting per column (stored in the view state): colour scale, data bar and text colour rules. */

export interface Range {
    min: number;
    max: number;
}

function numeric(column: ColumnDef, value: CellValue | undefined): number | undefined {
    if (isEmpty(value)) {
        return undefined;
    }
    if (typeInfo(column.type).kind === "date") {
        return toDate(value)?.getTime();
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
}

/** Min and max of every column that has a scale or bar rule. */
export function formatRanges(
    rows: RowRecord[],
    columns: ColumnDef[],
    formats: Record<string, FormatRule[]>
): Record<string, Range> {
    const result: Record<string, Range> = {};
    columns.forEach(column => {
        const rules = formats[column.key];
        if (!rules?.some(rule => rule.kind === "colorScale" || rule.kind === "dataBar")) {
            return;
        }
        let min = Number.POSITIVE_INFINITY;
        let max = Number.NEGATIVE_INFINITY;
        rows.forEach(row => {
            const n = numeric(column, row.values[column.key]);
            if (n !== undefined) {
                min = Math.min(min, n);
                max = Math.max(max, n);
            }
        });
        if (min <= max) {
            result[column.key] = { min, max };
        }
    });
    return result;
}

function hexToRgb(hex: string): [number, number, number] | undefined {
    const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!match) {
        return undefined;
    }
    const n = parseInt(match[1], 16);
    return [Math.floor(n / 65536) % 256, Math.floor(n / 256) % 256, n % 256];
}

export function mix(low: string, high: string, t: number): string {
    const a = hexToRgb(low) ?? [248, 105, 107];
    const b = hexToRgb(high) ?? [99, 190, 123];
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * Math.max(0, Math.min(1, t))));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export function ruleMatches(
    rule: Extract<FormatRule, { kind: "textColor" }>,
    column: ColumnDef,
    value: CellValue | undefined
): boolean {
    const text = formatValue(column, value).toLowerCase();
    const target = rule.value.toLowerCase();
    const n = numeric(column, value);
    const t = Number(rule.value);
    switch (rule.op) {
        case "=":
            return (
                text === target ||
                (n !== undefined && Number.isFinite(t) && n === t) ||
                String(value ?? "").toLowerCase() === target
            );
        case "<>":
            return !(text === target || (n !== undefined && Number.isFinite(t) && n === t));
        case "<":
            return n !== undefined && Number.isFinite(t) && n < t;
        case ">":
            return n !== undefined && Number.isFinite(t) && n > t;
        default:
            return text.includes(target);
    }
}

/** Inline style of a cell from its rules (undefined when nothing applies). */
export function formatStyle(
    rules: FormatRule[] | undefined,
    range: Range | undefined,
    value: CellValue | undefined,
    column?: ColumnDef
): CSSProperties | undefined {
    if (!rules?.length) {
        return undefined;
    }
    const style: Record<string, string> = {};
    rules.forEach(rule => {
        if (rule.kind === "textColor") {
            if (column && ruleMatches(rule, column, value)) {
                style.color = rule.color;
                if (rule.background) {
                    style.backgroundColor = rule.background;
                }
                style.fontWeight = "600";
            }
            return;
        }
        if (!range || isEmpty(value)) {
            return;
        }
        const n = Number(value);
        const t = range.max === range.min ? 1 : (n - range.min) / (range.max - range.min);
        if (!Number.isFinite(t)) {
            return;
        }
        if (rule.kind === "colorScale") {
            style.backgroundColor = mix(rule.low ?? "#f8696b", rule.high ?? "#63be7b", t);
            style.color = "#111";
        } else {
            const color = rule.color ?? "#264ae5";
            const pct = Math.round(Math.max(0.03, t) * 100);
            style.backgroundImage = `linear-gradient(90deg, ${color}40 0%, ${color}40 ${pct}%, transparent ${pct}%)`;
        }
    });
    return Object.keys(style).length ? (style as CSSProperties) : undefined;
}
