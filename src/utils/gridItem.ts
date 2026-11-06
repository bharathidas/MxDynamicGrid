import type { GroupRow } from "./pipeline";
import type { RowRecord } from "./types";

/** One row as AG Grid sees it: a data row (with computed values), a group header or the totals row. */
export interface GridItem {
    id: string;
    row?: RowRecord;
    group?: GroupRow;
    /** Totals footer: label and formatted value per column. */
    totals?: Record<string, { label: string; value: string }>;
    /** The inline "+ New row" row at the end of the grid. */
    newRow?: boolean;
    level: number;
}
