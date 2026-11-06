import type { RowColor } from "./personalization";
import { activeRuleCount, applyRules } from "./rules";
import { ColumnDef, RowRecord } from "./types";

/** The colour of a row for the view colour setting (select field option colour, or the first matching rule). */
export function rowColor(row: RowRecord, columns: ColumnDef[], color: RowColor | undefined): string | undefined {
    if (!color) {
        return undefined;
    }
    if (color.mode === "select" && color.col) {
        const column = columns.find(c => c.key === color.col);
        const value = row.values[color.col];
        const option = column?.options.find(o => o.value === (Array.isArray(value) ? value[0] : value));
        return option?.color;
    }
    for (const rule of color.rules ?? []) {
        if (activeRuleCount(rule.conditions) && applyRules([row], columns, rule.conditions).length === 1) {
            return rule.color;
        }
    }
    return undefined;
}
