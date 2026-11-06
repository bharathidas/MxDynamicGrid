import { TEXT_DEFAULTS, TextKey } from "./textDefaults";
import type { ColumnType } from "./types";

export type Texts = Record<TextKey, string>;

/** The UI texts: the translatable text properties, falling back to the English defaults. */
export function resolveTexts(props: object): Texts {
    const source = props as Record<string, { value?: string } | undefined>;
    const texts = {} as Texts;
    (Object.keys(TEXT_DEFAULTS) as TextKey[]).forEach(key => {
        const value = source[key]?.value;
        texts[key] = typeof value === "string" && value.trim() ? value : TEXT_DEFAULTS[key];
    });
    return texts;
}

export const DEFAULT_TEXTS: Texts = { ...TEXT_DEFAULTS };

// English plurals that directly follow a count placeholder: "[count] rows" reads "1 row" when the count is one.
const SINGULAR: Record<string, string> = {
    rows: "row",
    columns: "column",
    cells: "cell",
    values: "value",
    matches: "match",
    fields: "field",
    records: "record"
};

/** Replaces [name] placeholders; a following English plural becomes singular when the value is 1. */
export function fill(text: string, values: Record<string, string | number>): string {
    let out = text;
    Object.entries(values).forEach(([name, value]) => {
        if (String(value).trim() === "1") {
            Object.entries(SINGULAR).forEach(([plural, one]) => {
                out = out.split(`[${name}] ${plural}`).join(`[${name}] ${one}`);
            });
        }
        out = out.split(`[${name}]`).join(String(value));
    });
    return out;
}

function typeKey(type: ColumnType): string {
    return `type${type.charAt(0).toUpperCase()}${type.slice(1)}`;
}

export function typeLabel(texts: Texts, type: ColumnType): string {
    return (texts as Record<string, string>)[typeKey(type)] ?? type;
}

export function typeHelp(texts: Texts, type: ColumnType): string {
    return (texts as Record<string, string>)[`${typeKey(type)}Help`] ?? "";
}

/** Label of a summary/aggregate function. */
export function summaryLabel(texts: Texts, fn: string): string {
    const map: Record<string, string> = {
        none: texts.textNone,
        sum: texts.textSum,
        avg: texts.textAvg,
        min: texts.textMin,
        max: texts.textMax,
        count: texts.textCount,
        filled: texts.textFilled,
        empty: texts.textSumEmpty,
        unique: texts.textSumUnique,
        percentEmpty: texts.textSumPercentEmpty,
        range: texts.textSumRange,
        earliest: texts.textSumEarliest,
        latest: texts.textSumLatest
    };
    return map[fn] ?? fn;
}
