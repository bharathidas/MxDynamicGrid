import type { ColumnFilter, SortEntry } from "./pipeline";
import { isActiveCondition, RuleSet } from "./rules";

/**
 * Server mode view state, written to the View state attribute before the rows source reloads. A microflow data
 * source reads it to search, sort, filter and page the rows itself:
 * {"search":"..","sort":[{"col":k,"dir":"asc"}],"filters":[{"col":k,"op":"..","value":..}],"offset":n,"limit":n}
 */
export interface ServerViewInput {
    search: string;
    sort: SortEntry[];
    filters: Record<string, ColumnFilter>;
    offset: number;
    limit: number;
    /** 1.1 view-bar filter rules; sent as "rules" with the active conditions. */
    rules?: RuleSet;
}

export interface ServerFilter {
    col: string;
    op: string;
    value?: unknown;
    value2?: unknown;
    values?: string[];
}

export function serverFilters(filters: Record<string, ColumnFilter>): ServerFilter[] {
    return Object.entries(filters).map(([col, filter]) => {
        const entry: ServerFilter = { col, op: filter.op };
        if (filter.value !== undefined && filter.value !== null && filter.value !== "") {
            entry.value = filter.value;
        }
        if (filter.value2 !== undefined && filter.value2 !== null && filter.value2 !== "") {
            entry.value2 = filter.value2;
        }
        if (filter.values) {
            entry.values = filter.values;
        }
        return entry;
    });
}

export function buildServerViewState(input: ServerViewInput): string {
    return JSON.stringify({
        search: input.search.trim(),
        sort: input.sort.map(entry => ({ col: entry.col, dir: entry.dir })),
        filters: serverFilters(input.filters),
        offset: input.offset,
        limit: input.limit,
        ...(input.rules && input.rules.conditions.some(isActiveCondition)
            ? {
                  rules: {
                      conjunction: input.rules.conjunction,
                      conditions: input.rules.conditions.filter(isActiveCondition)
                  }
              }
            : {})
    });
}
