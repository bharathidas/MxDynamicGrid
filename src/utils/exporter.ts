import { typeInfo } from "./columnTypes";
import { formatRanges, formatStyle, Range } from "./conditional";
import { buildCsv, delimiterChar } from "./csv";
import type { FormatRule, RowColor } from "./personalization";
import { cellHref } from "./links";
import { rowColor } from "./rowColor";
import type { DisplayRow } from "./pipeline";
import { excelFormat, excelValue, formatValue, isEmpty, plainValue, toDate } from "./values";
import { buildWorkbook, ExcelCell, ExcelCellStyle, ExcelColumn, ExcelRowOptions } from "./xlsx";
import { ColumnDef, RowRecord } from "./types";

/** Builds the Excel and CSV files from the columns in grid order and the rows (optionally grouped). */

export interface ExportColumn extends ColumnDef {
    /** Width in the grid (px). */
    gridWidth?: number;
    pinnedLeft?: boolean;
}

export interface XlsxExportOptions {
    sheetName: string;
    title?: string;
    exportedAt?: string;
    escapeFormulas: boolean;
    accent?: string;
    /** The grid's colour code, written as cell fills and font colours; plain cells when missing. */
    colors?: ExportColors;
}

export interface ExportColors {
    /** The view's row colour setting (Color panel). */
    row?: RowColor;
    /** Conditional formats per column key. */
    formats?: Record<string, FormatRule[]>;
    /** Min and max per column for colour scales; computed from the exported rows when missing. */
    ranges?: Record<string, Range>;
    /** Accent colour of the grid: the progress bars. */
    accent?: string;
}

const STAR_ON = "#F5A524";
const STAR_OFF = "#C9CED6";

/** The colours a data cell shows in the grid: format rule over select option colour over row colour. */
export function cellColors(
    column: ColumnDef,
    row: RowRecord,
    colors: ExportColors,
    ranges: Record<string, Range>,
    rowFill: string | undefined
): ExcelCellStyle | undefined {
    const result: ExcelCellStyle = {};
    if (rowFill) {
        result.fill = rowFill;
    }
    const value = row.values[column.key];
    if (column.type === "select" || column.type === "multiSelect") {
        const first = Array.isArray(value) ? value[0] : value;
        const option = column.options.find(o => o.value === first);
        if (option?.color) {
            result.fill = option.color;
        }
    }
    if (column.type === "rating" && !isEmpty(value)) {
        const max = Math.max(1, column.max ?? 5);
        const stars = Math.max(0, Math.min(max, Math.round(Number(value) || 0)));
        result.runs = [
            { text: "★".repeat(stars), color: STAR_ON },
            { text: "☆".repeat(max - stars), color: STAR_OFF }
        ];
    }
    if ((column.type === "link" || column.type === "email" || column.type === "phone") && !isEmpty(value)) {
        const link = cellHref(column, String(value));
        if (link) {
            result.link = link;
            result.font = colors.accent ?? "#264AE5";
        }
    }
    const style = formatStyle(colors.formats?.[column.key], ranges[column.key], value, column) as
        | Record<string, string>
        | undefined;
    if (style?.backgroundColor) {
        result.fill = style.backgroundColor;
    }
    if (style?.color) {
        result.font = style.color;
    }
    if (style?.fontWeight) {
        result.bold = true;
    }
    return result.fill || result.font || result.bold || result.runs || result.link ? result : undefined;
}

/** "[date]" -> 2026-10-29 */
export function expandTokens(template: string, now = new Date()): string {
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(
        2,
        "0"
    )}`;
    return template.split("[date]").join(date);
}

export function safeFileName(name: string): string {
    return name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "export";
}

/** Header groups of adjacent columns with the same caption. */
export function headerGroupSpans(columns: ColumnDef[]): Array<{ caption: string; start: number; span: number }> {
    const spans: Array<{ caption: string; start: number; span: number }> = [];
    columns.forEach((column, index) => {
        const caption = column.headerGroup.trim();
        const last = spans[spans.length - 1];
        if (last && last.caption === caption && last.start + last.span === index) {
            last.span++;
        } else {
            spans.push({ caption, start: index, span: 1 });
        }
    });
    return spans;
}

export function buildXlsxExport(columns: ExportColumn[], rows: DisplayRow[], options: XlsxExportOptions): Uint8Array {
    const colors = options.colors;
    const excelColumns: ExcelColumn[] = columns.map(column => {
        const kind = typeInfo(column.type).kind;
        const type = kind === "number" ? "number" : kind === "date" ? "date" : kind === "boolean" ? "boolean" : "text";
        const bar = colors?.formats?.[column.key]?.find(rule => rule.kind === "dataBar") as
            | { color?: string }
            | undefined;
        if (colors && column.type === "progress") {
            // the grid's progress bar: a 0-100 data bar in the accent colour with the value as a percentage
            return {
                name: column.caption,
                type: "number" as const,
                numFmt: '0"%"',
                width: column.gridWidth ? column.gridWidth / 7 : undefined,
                conditional: "dataBar" as const,
                conditionalColor: colors.accent ?? "#264ae5",
                conditionalMin: 0,
                conditionalMax: 100
            };
        }
        return {
            name: column.caption,
            type: column.type === "formula" ? "text" : type,
            numFmt: excelFormat(column),
            width: column.gridWidth ? column.gridWidth / 7 : undefined,
            ...(bar && kind === "number"
                ? { conditional: "dataBar" as const, conditionalColor: bar.color ?? "#264ae5" }
                : {})
        };
    });
    const dataRows = rows.flatMap(entry => (entry.kind === "data" ? [entry.row] : []));
    const ranges = colors ? colors.ranges ?? formatRanges(dataRows, columns, colors.formats ?? {}) : {};
    const cellStyles: Array<Array<ExcelCellStyle | undefined> | undefined> = [];
    const cells: ExcelCell[][] = [];
    const rowOptions: ExcelRowOptions[] = [];
    const grouped = rows.some(row => row.kind === "group");
    rows.forEach(entry => {
        if (entry.kind === "group") {
            const line: ExcelCell[] = columns.map(column => {
                const value = entry.aggregates[column.key];
                return value === undefined || value === null ? null : typeof value === "number" ? value : String(value);
            });
            line[0] = `${entry.label} (${entry.count})`;
            cells.push(line);
            rowOptions.push({ outlineLevel: entry.level, bold: true });
            cellStyles.push(undefined);
            return;
        }
        cells.push(
            columns.map(column => {
                const value = entry.row.values[column.key];
                if (column.type === "formula") {
                    return typeof value === "number" ? value : isEmpty(value) ? null : String(value);
                }
                return excelValue(column, value);
            })
        );
        rowOptions.push({ outlineLevel: grouped ? entry.level : 0 });
        if (colors) {
            const rowFill = rowColor(entry.row, columns, colors.row);
            cellStyles.push(columns.map(column => cellColors(column, entry.row, colors, ranges, rowFill)));
        } else {
            cellStyles.push(undefined);
        }
    });
    const titleRows: string[] = [];
    if (options.title) {
        titleRows.push(options.title);
        if (options.exportedAt) {
            titleRows.push(options.exportedAt);
        }
    }
    const freezeColumns = columns.filter(column => column.pinnedLeft).length;
    return buildWorkbook(
        [
            {
                name: options.sheetName,
                columns: excelColumns,
                rows: cells,
                rowOptions,
                freezeColumns,
                titleRows,
                headerGroups: headerGroupSpans(columns),
                escapeFormulas: options.escapeFormulas,
                ...(colors ? { cellStyles } : {})
            }
        ],
        { styled: true, headerFill: options.accent ? "#E8ECFC" : undefined }
    );
}

export interface CsvExportOptions {
    delimiter: string;
    bom: boolean;
    dates: "iso" | "format";
    escapeFormulas: boolean;
}

export function csvCell(column: ColumnDef, value: unknown, dates: "iso" | "format"): string {
    if (isEmpty(value)) {
        return "";
    }
    const kind = typeInfo(column.type).kind;
    if (kind === "date") {
        if (dates === "format") {
            return formatValue(column, value);
        }
        const date = toDate(value);
        if (!date) {
            return String(value);
        }
        return column.type === "date" ? plainValue(column, value) : date.toISOString();
    }
    return plainValue(column, value);
}

export function buildCsvExport(columns: ColumnDef[], rows: DisplayRow[], options: CsvExportOptions): string {
    const numeric = new Set<number>();
    columns.forEach((column, index) => {
        if (typeInfo(column.type).kind === "number") {
            numeric.add(index);
        }
    });
    const body: string[][] = [];
    rows.forEach(entry => {
        if (entry.kind === "data") {
            body.push(columns.map(column => csvCell(column, entry.row.values[column.key], options.dates)));
        }
    });
    return buildCsv(
        columns.map(column => column.caption),
        body,
        {
            delimiter: delimiterChar(
                options.delimiter === ","
                    ? "comma"
                    : options.delimiter === ";"
                    ? "semicolon"
                    : options.delimiter === "\t"
                    ? "tab"
                    : options.delimiter
            ),
            bom: options.bom,
            escapeFormulas: options.escapeFormulas,
            numericColumns: numeric
        }
    );
}
