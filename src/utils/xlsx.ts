import { strToU8, zipSync } from "fflate";

export type ExcelColumnType = "text" | "number" | "date" | "boolean";
export type ExcelConditional = "dataBar" | "colorScale" | "iconSet";
export type ExcelTotalFn = "sum" | "avg" | "min" | "max" | "count" | "distinctCount";

export interface ExcelColumn {
    name: string;
    type: ExcelColumnType;
    /** Decimals for number columns; negative keeps the general format. */
    precision?: number;
    groupDigits?: boolean;
    /** Column width in characters; derived from the header when missing. */
    width?: number;
    /** Native Excel conditional format over the data rows (styled workbooks only). */
    conditional?: ExcelConditional;
    /** Data bar color as #RRGGBB. */
    conditionalColor?: string;
    /** Lower is better: reversed color scale and icon set. */
    conditionalReverse?: boolean;
    /** Fixed data bar bounds (for example 0 and 100 for progress); min and max of the data when missing. */
    conditionalMin?: number;
    conditionalMax?: number;
    /** Excel number format code (numbers and dates); overrides precision/groupDigits. */
    numFmt?: string;
}

export type ExcelCell = string | number | boolean | Date | null | undefined;

/** Colours of one data cell (styled workbooks): background fill, font colour and bold, as #RRGGBB or rgb(). */
export interface ExcelCellStyle {
    fill?: string;
    font?: string;
    bold?: boolean;
    /** Rich text written instead of the value: runs with their own font colour (rating stars). */
    runs?: Array<{ text: string; color?: string }>;
    /** Clickable link: the cell becomes a HYPERLINK formula showing the value. */
    link?: string;
}

export interface ExcelRowOptions {
    /** Outline (grouping) level of the data row, 0 = none; Excel shows collapsible +/- buttons. */
    outlineLevel?: number;
    /** Bold row, used for group header rows. */
    bold?: boolean;
}

export interface ExcelTotalsRow {
    /** Per column: the aggregation (written as a SUBTOTAL formula where Excel has one) and its current value. */
    cells: Array<{ fn?: ExcelTotalFn; value: ExcelCell }>;
}

export interface ExcelSheet {
    name: string;
    columns: ExcelColumn[];
    rows: ExcelCell[][];
    rowOptions?: ExcelRowOptions[];
    /** Extra header rows above the column names (pivot column labels). */
    headerRows?: string[][];
    /** Columns kept visible while scrolling right (pinned left columns). */
    freezeColumns?: number;
    /** Totals rows under the data (styled workbooks only). */
    totals?: ExcelTotalsRow[];
    /** Auto filter on the header row (default on). */
    autoFilter?: boolean;
    /** Rows above the table with a single bold text each (title, export date). */
    titleRows?: string[];
    /** Header groups shown as merged cells above the column names. */
    headerGroups?: Array<{ caption: string; start: number; span: number }>;
    /** Marks text cells that start with = + - @ tab or CR as text (quotePrefix), so Excel never evaluates them. */
    escapeFormulas?: boolean;
    /** Per data row and column: the cell colours (styled workbooks only); parallel to rows. */
    cellStyles?: Array<Array<ExcelCellStyle | undefined> | undefined>;
}

export interface WorkbookOptions {
    /** Header fill, column widths, conditional formats, totals formulas and frozen columns. */
    styled?: boolean;
    /** Header fill color as #RRGGBB (styled workbooks). */
    headerFill?: string;
}

function escapeXml(text: string): string {
    return text.replace(/[<>&"']/g, char => {
        switch (char) {
            case "<":
                return "&lt;";
            case ">":
                return "&gt;";
            case "&":
                return "&amp;";
            case '"':
                return "&quot;";
            default:
                return "&apos;";
        }
    });
}

/** Removes characters XML 1.0 cannot hold (control characters from pasted data). */
function cleanText(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "");
}

/** Excel column letters: 0 -> A, 25 -> Z, 26 -> AA. */
export function columnLetters(index: number): string {
    let letters = "";
    let current = index;
    do {
        letters = String.fromCharCode(65 + (current % 26)) + letters;
        current = Math.floor(current / 26) - 1;
    } while (current >= 0);
    return letters;
}

/** Excel serial date (days since 1899-12-30) in the local time zone, so the sheet shows the same wall-clock time. */
function excelSerial(date: Date): number {
    const local = Date.UTC(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        date.getHours(),
        date.getMinutes(),
        date.getSeconds()
    );
    return local / 86400000 + 25569;
}

function numberFormatCode(column: ExcelColumn): string | undefined {
    const precision = column.precision ?? -1;
    if (precision < 0 && !column.groupDigits) {
        return undefined;
    }
    const integer = column.groupDigits ? "#,##0" : "0";
    return precision > 0 ? `${integer}.${"0".repeat(precision)}` : integer;
}

/** "#0ea58f" or "rgb(14, 165, 143)" -> "FF0EA58F"; undefined for anything else. */
export function argb(color: string | undefined): string | undefined {
    const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
        (color ?? "").trim()
    );
    if (rgb) {
        if (rgb[4] !== undefined && Number(rgb[4]) === 0) {
            return undefined;
        }
        return `FF${[rgb[1], rgb[2], rgb[3]]
            .map(part => Math.min(255, Number(part)).toString(16).padStart(2, "0"))
            .join("")
            .toUpperCase()}`;
    }
    const match = /^#?([0-9a-f]{6})$/i.exec((color ?? "").trim());
    if (match) {
        return `FF${match[1].toUpperCase()}`;
    }
    const short = /^#?([0-9a-f]{3})$/i.exec((color ?? "").trim());
    return short
        ? `FF${short[1]
              .split("")
              .map(char => char + char)
              .join("")
              .toUpperCase()}`
        : undefined;
}

/** First characters that make spreadsheet apps evaluate text as a formula. */
const FORMULA_CHARS = ["=", "+", "-", "@", "\t", "\r"];

const SUBTOTAL_CODES: Partial<Record<ExcelTotalFn, number>> = { avg: 101, count: 103, max: 104, min: 105, sum: 109 };

/** Style table shared by every sheet of a workbook. */
class Styles {
    private readonly formats: string[] = [];
    private readonly fills: string[] = [];
    /** Extra fonts after 0 (regular) and 1 (bold): "bold|ARGB". */
    private readonly fonts: string[] = [];
    private readonly xfs: string[] = [];
    private readonly lookup = new Map<string, number>();

    constructor() {
        // Fixed positions kept from 1.2: 0 default, 1 bold, 2 date/time.
        this.xfs.push(`<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>`);
        this.xfs.push(`<xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/>`);
        this.xfs.push(`<xf numFmtId="22" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>`);
        this.lookup.set("0|0|", 0);
        this.lookup.set("0|1|", 1);
        this.lookup.set("22|0|", 2);
    }

    numFmt(code: string | undefined): number {
        if (!code) {
            return 0;
        }
        let position = this.formats.indexOf(code);
        if (position < 0) {
            position = this.formats.push(code) - 1;
        }
        return 164 + position;
    }

    fill(color: string | undefined): number {
        if (!color) {
            return 0;
        }
        let position = this.fills.indexOf(color);
        if (position < 0) {
            position = this.fills.push(color) - 1;
        }
        return 2 + position;
    }

    font(bold: boolean, color: string | undefined): number {
        if (!color) {
            return bold ? 1 : 0;
        }
        const key = `${bold ? 1 : 0}|${color}`;
        let position = this.fonts.indexOf(key);
        if (position < 0) {
            position = this.fonts.push(key) - 1;
        }
        return 2 + position;
    }

    xf(numFmtId: number, bold: boolean, fillId = 0, quotePrefix = false, fontColor?: string): number {
        const fontId = this.font(bold, fontColor);
        const key = `${numFmtId}|${bold ? 1 : 0}|${fillId || ""}${quotePrefix ? "|q" : ""}${
            fontId > 1 ? `|f${fontId}` : ""
        }`;
        const existing = this.lookup.get(key);
        if (existing !== undefined) {
            return existing;
        }
        const index = this.xfs.length;
        this.xfs.push(
            `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="0"` +
                `${numFmtId ? ' applyNumberFormat="1"' : ""}${fontId ? ' applyFont="1"' : ""}${
                    fillId ? ' applyFill="1"' : ""
                }${quotePrefix ? ' quotePrefix="1"' : ""}/>`
        );
        this.lookup.set(key, index);
        return index;
    }

    xml(): string {
        const numFmts = this.formats
            .map((code, index) => `<numFmt numFmtId="${164 + index}" formatCode="${escapeXml(code)}"/>`)
            .join("");
        const fills = this.fills
            .map(
                color =>
                    `<fill><patternFill patternType="solid"><fgColor rgb="${color}"/><bgColor indexed="64"/></patternFill></fill>`
            )
            .join("");
        return (
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
            `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
            (this.formats.length ? `<numFmts count="${this.formats.length}">${numFmts}</numFmts>` : "") +
            `<fonts count="${
                2 + this.fonts.length
            }"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font>${this.fonts
                .map(key => {
                    const [bold, color] = key.split("|");
                    return `<font>${
                        bold === "1" ? "<b/>" : ""
                    }<sz val="11"/><color rgb="${color}"/><name val="Calibri"/></font>`;
                })
                .join("")}</fonts>` +
            `<fills count="${
                2 + this.fills.length
            }"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${fills}</fills>` +
            `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
            `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
            `<cellXfs count="${this.xfs.length}">${this.xfs.join("")}</cellXfs>` +
            `<dxfs count="0"/></styleSheet>`
        );
    }
}

function cellXml(ref: string, value: ExcelCell, style: number): string {
    const styleAttribute = style ? ` s="${style}"` : "";
    if (value === null || value === undefined || value === "") {
        return style ? `<c r="${ref}"${styleAttribute}/>` : "";
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return `<c r="${ref}"${styleAttribute}><v>${value}</v></c>`;
    }
    if (typeof value === "boolean") {
        return `<c r="${ref}" t="b"${styleAttribute}><v>${value ? 1 : 0}</v></c>`;
    }
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? "" : `<c r="${ref}"${styleAttribute}><v>${excelSerial(value)}</v></c>`;
    }
    return `<c r="${ref}" t="inlineStr"${styleAttribute}><is><t xml:space="preserve">${escapeXml(
        cleanText(String(value))
    )}</t></is></c>`;
}

/** HYPERLINK formula cell; undefined when Excel cannot hold the link (over 255 characters). */
function linkCellXml(ref: string, link: string, label: string, style: number): string | undefined {
    if (link.length > 255 || label.length > 255) {
        return undefined;
    }
    const quote = (text: string): string => `"${text.split('"').join('""')}"`;
    return `<c r="${ref}" t="str"${style ? ` s="${style}"` : ""}><f>${escapeXml(
        `HYPERLINK(${quote(link)},${quote(label)})`
    )}</f><v>${escapeXml(cleanText(label))}</v></c>`;
}

/** An inline rich text cell: each run keeps its own font colour. */
function richCellXml(ref: string, runs: Array<{ text: string; color?: string }>, style: number): string {
    const xml = runs
        .filter(run => run.text)
        .map(run => {
            const color = argb(run.color);
            return `<r>${
                color ? `<rPr><sz val="11"/><color rgb="${color}"/><rFont val="Calibri"/></rPr>` : ""
            }<t xml:space="preserve">${escapeXml(cleanText(run.text))}</t></r>`;
        })
        .join("");
    return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ""}><is>${xml}</is></c>`;
}

function conditionalXml(column: ExcelColumn, sqref: string, priority: number): string {
    switch (column.conditional) {
        case "dataBar":
            return (
                `<conditionalFormatting sqref="${sqref}"><cfRule type="dataBar" priority="${priority}"><dataBar${
                    column.conditionalMin !== undefined ? ' minLength="0" maxLength="100"' : ""
                }>` +
                `${
                    column.conditionalMin !== undefined && column.conditionalMax !== undefined
                        ? `<cfvo type="num" val="${column.conditionalMin}"/><cfvo type="num" val="${column.conditionalMax}"/>`
                        : `<cfvo type="min"/><cfvo type="max"/>`
                }<color rgb="${argb(column.conditionalColor) ?? "FF264AE5"}"/>` +
                `</dataBar></cfRule></conditionalFormatting>`
            );
        case "colorScale": {
            const colors = ["FFF8696B", "FFFFEB84", "FF63BE7B"];
            if (column.conditionalReverse) {
                colors.reverse();
            }
            return (
                `<conditionalFormatting sqref="${sqref}"><cfRule type="colorScale" priority="${priority}"><colorScale>` +
                `<cfvo type="min"/><cfvo type="percentile" val="50"/><cfvo type="max"/>` +
                colors.map(color => `<color rgb="${color}"/>`).join("") +
                `</colorScale></cfRule></conditionalFormatting>`
            );
        }
        case "iconSet":
            return (
                `<conditionalFormatting sqref="${sqref}"><cfRule type="iconSet" priority="${priority}">` +
                `<iconSet iconSet="3Arrows"${column.conditionalReverse ? ' reverse="1"' : ""}>` +
                `<cfvo type="percent" val="0"/><cfvo type="percent" val="33"/><cfvo type="percent" val="67"/>` +
                `</iconSet></cfRule></conditionalFormatting>`
            );
        default:
            return "";
    }
}

function sheetXml(sheet: ExcelSheet, styles: Styles, options: WorkbookOptions): string {
    const styled = Boolean(options.styled);
    const columns = sheet.columns;
    const rowOptions = sheet.rowOptions ?? [];
    const headerFill = styled ? styles.fill(argb(options.headerFill) ?? "FFEEF1F8") : 0;
    const headerStyle = styled ? styles.xf(0, true, headerFill) : 1;
    const styleIndexByColumn = columns.map(column => {
        if (column.numFmt && (column.type === "date" || column.type === "number")) {
            return styles.xf(styles.numFmt(column.numFmt), false);
        }
        if (column.type === "date") {
            return 2;
        }
        const code = column.type === "number" ? numberFormatCode(column) : undefined;
        return code ? styles.xf(styles.numFmt(code), false) : 0;
    });
    const boldByColumn = columns.map(column => {
        if (column.numFmt && (column.type === "date" || column.type === "number")) {
            return styles.xf(styles.numFmt(column.numFmt), true);
        }
        const code = column.type === "number" ? numberFormatCode(column) : undefined;
        return column.type === "date" ? styles.xf(22, true) : styles.xf(styles.numFmt(code), true);
    });

    const titleRows = (sheet.titleRows ?? []).map(title => [title]);
    const groupRow: string[] | undefined = sheet.headerGroups?.some(group => group.caption)
        ? columns.map(() => "")
        : undefined;
    const merges: string[] = [];
    const firstGroupRow = titleRows.length + (sheet.headerRows?.length ?? 0) + 1;
    if (groupRow) {
        sheet.headerGroups?.forEach(group => {
            if (!group.caption) {
                return;
            }
            groupRow[group.start] = group.caption;
            if (group.span > 1) {
                merges.push(
                    `${columnLetters(group.start)}${firstGroupRow}:${columnLetters(
                        group.start + group.span - 1
                    )}${firstGroupRow}`
                );
            }
        });
    }
    const quoteStyle = styles.xf(0, false, 0, true);
    const needsQuote = (value: ExcelCell): boolean =>
        Boolean(sheet.escapeFormulas) &&
        typeof value === "string" &&
        value.length > 0 &&
        FORMULA_CHARS.includes(value[0]);
    const numFmtByColumn = columns.map(column => {
        if (column.numFmt && (column.type === "date" || column.type === "number")) {
            return styles.numFmt(column.numFmt);
        }
        if (column.type === "date") {
            return 22;
        }
        return styles.numFmt(column.type === "number" ? numberFormatCode(column) : undefined);
    });
    const colorStyle = (columnIndex: number, value: ExcelCell, colors: ExcelCellStyle | undefined): number => {
        const fill = styles.fill(argb(colors?.fill));
        const font = argb(colors?.font);
        if (!fill && !font && !colors?.bold) {
            return -1;
        }
        return styles.xf(numFmtByColumn[columnIndex], Boolean(colors?.bold), fill, needsQuote(value), font);
    };
    const headerRows = [
        ...titleRows,
        ...(sheet.headerRows ?? []),
        ...(groupRow ? [groupRow] : []),
        columns.map(column => column.name)
    ];
    const headerCount = headerRows.length;
    const headerXml = headerRows
        .map((cells, index) => {
            const number = index + 1;
            return (
                `<row r="${number}">` +
                (index < titleRows.length
                    ? cellXml(`A${number}`, cells[0] ?? "", 1)
                    : columns
                          .map((_, col) => cellXml(`${columnLetters(col)}${number}`, cells[col] ?? "", headerStyle))
                          .join("")) +
                `</row>`
            );
        })
        .join("");
    const dataRows = sheet.rows
        .map((row, rowIndex) => {
            const number = rowIndex + headerCount + 1;
            const rowOption = rowOptions[rowIndex] ?? {};
            const cells = columns
                .map((_, columnIndex) => {
                    const value = row[columnIndex];
                    let style = styleIndexByColumn[columnIndex];
                    if (rowOption.bold) {
                        style = typeof value === "string" ? 1 : styled ? boldByColumn[columnIndex] : style;
                    } else if (needsQuote(value)) {
                        style = quoteStyle;
                    }
                    if (styled && !rowOption.bold) {
                        const colored = colorStyle(columnIndex, value, sheet.cellStyles?.[rowIndex]?.[columnIndex]);
                        style = colored >= 0 ? colored : style;
                    }
                    const runs =
                        styled && !rowOption.bold ? sheet.cellStyles?.[rowIndex]?.[columnIndex]?.runs : undefined;
                    const ref = `${columnLetters(columnIndex)}${number}`;
                    const link =
                        styled && !rowOption.bold ? sheet.cellStyles?.[rowIndex]?.[columnIndex]?.link : undefined;
                    const linked =
                        link && typeof value === "string" && value ? linkCellXml(ref, link, value, style) : undefined;
                    if (linked) {
                        return linked;
                    }
                    return runs?.length ? richCellXml(ref, runs, style) : cellXml(ref, value, style);
                })
                .join("");
            const level = Math.max(0, Math.min(7, Math.round(rowOption.outlineLevel ?? 0)));
            return `<row r="${number}"${level ? ` outlineLevel="${level}"` : ""}>${cells}</row>`;
        })
        .join("");
    const firstData = headerCount + 1;
    const lastData = headerCount + sheet.rows.length;
    let totalsXml = "";
    const totals = styled ? sheet.totals ?? [] : [];
    totals.forEach((totalsRow, index) => {
        const number = lastData + 1 + index;
        const cells = columns
            .map((_, col) => {
                const entry = totalsRow.cells[col];
                const ref = `${columnLetters(col)}${number}`;
                const style = typeof entry?.value === "string" ? 1 : boldByColumn[col];
                const code = entry?.fn ? SUBTOTAL_CODES[entry.fn] : undefined;
                if (code && sheet.rows.length > 0) {
                    const range = `${columnLetters(col)}${firstData}:${columnLetters(col)}${lastData}`;
                    const cached =
                        typeof entry?.value === "number" && Number.isFinite(entry.value) ? `<v>${entry.value}</v>` : "";
                    return `<c r="${ref}" s="${style}"><f>SUBTOTAL(${code},${range})</f>${cached}</c>`;
                }
                return cellXml(ref, entry?.value, style);
            })
            .join("");
        totalsXml += `<row r="${number}">${cells}</row>`;
    });
    const lastRow = lastData + totals.length;

    const widths = columns
        .map((column, index) => {
            const width =
                styled && column.width && column.width > 0
                    ? Math.min(80, Math.max(6, Math.round(column.width)))
                    : Math.min(60, Math.max(10, column.name.length + 4));
            return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
        })
        .join("");
    const lastColumn = columnLetters(Math.max(0, columns.length - 1));
    const maxOutline = rowOptions.reduce((max, option) => Math.max(max, Math.min(7, option.outlineLevel ?? 0)), 0);
    const freezeColumns = styled ? Math.max(0, Math.min(columns.length - 1, sheet.freezeColumns ?? 0)) : 0;
    const pane = freezeColumns
        ? `<pane xSplit="${freezeColumns}" ySplit="${headerCount}" topLeftCell="${columnLetters(freezeColumns)}${
              headerCount + 1
          }" activePane="bottomRight" state="frozen"/>`
        : `<pane ySplit="${headerCount}" topLeftCell="A${headerCount + 1}" activePane="bottomLeft" state="frozen"/>`;
    let priority = 1;
    const conditional =
        styled && sheet.rows.length > 0
            ? columns
                  .map((column, index) =>
                      column.conditional
                          ? conditionalXml(
                                column,
                                `${columnLetters(index)}${firstData}:${columnLetters(index)}${lastData}`,
                                priority++
                            )
                          : ""
                  )
                  .join("")
            : "";
    const filterRef = `A${headerCount}:${lastColumn}${Math.max(headerCount, lastData)}`;
    return (
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        (maxOutline ? `<sheetPr><outlinePr summaryBelow="0"/></sheetPr>` : "") +
        `<dimension ref="A1:${lastColumn}${Math.max(lastRow, headerCount)}"/>` +
        `<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>` +
        (maxOutline ? `<sheetFormatPr defaultRowHeight="15" outlineLevelRow="${maxOutline}"/>` : "") +
        (columns.length ? `<cols>${widths}</cols>` : "") +
        `<sheetData>${headerXml}${dataRows}${totalsXml}</sheetData>` +
        (sheet.autoFilter === false ? "" : `<autoFilter ref="${filterRef}"/>`) +
        (merges.length
            ? `<mergeCells count="${merges.length}">${merges
                  .map(ref => `<mergeCell ref="${ref}"/>`)
                  .join("")}</mergeCells>`
            : "") +
        conditional +
        `</worksheet>`
    );
}

export function safeSheetName(name: string, used: Set<string>): string {
    const base = name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet1";
    let candidate = base;
    let counter = 2;
    while (used.has(candidate.toLowerCase())) {
        const suffix = ` (${counter++})`;
        candidate = base.slice(0, 31 - suffix.length) + suffix;
    }
    used.add(candidate.toLowerCase());
    return candidate;
}

/** Builds a valid .xlsx workbook with one or more sheets: typed cells, number and date formats, inline strings. */
export function buildWorkbook(sheets: ExcelSheet[], options: WorkbookOptions = {}): Uint8Array {
    const styles = new Styles();
    const list = sheets.length ? sheets : [{ name: "Sheet1", columns: [], rows: [] }];
    const used = new Set<string>();
    const names = list.map(sheet => safeSheetName(sheet.name, used));
    const sheetFiles: Record<string, Uint8Array> = {};
    list.forEach((sheet, index) => {
        sheetFiles[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(sheetXml(sheet, styles, options));
    });

    const workbook =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets>${names
            .map((name, index) => `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
            .join("")}</sheets></workbook>`;
    const workbookRels =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        names
            .map(
                (_, index) =>
                    `<Relationship Id="rId${
                        index + 1
                    }" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${
                        index + 1
                    }.xml"/>`
            )
            .join("") +
        `<Relationship Id="rId${
            names.length + 1
        }" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`;
    const rootRels =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`;
    const contentTypes =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        names
            .map(
                (_, index) =>
                    `<Override PartName="/xl/worksheets/sheet${
                        index + 1
                    }.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
            )
            .join("") +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        `</Types>`;

    return zipSync(
        {
            "[Content_Types].xml": strToU8(contentTypes),
            "_rels/.rels": strToU8(rootRels),
            "xl/workbook.xml": strToU8(workbook),
            "xl/_rels/workbook.xml.rels": strToU8(workbookRels),
            ...sheetFiles,
            "xl/styles.xml": strToU8(styles.xml())
        },
        { level: 6 }
    );
}

/** One plain sheet (the 1.2 export): bold frozen header, typed cells, auto filter, optional outline levels. */
export function buildXlsx(
    sheetName: string,
    columns: ExcelColumn[],
    rows: ExcelCell[][],
    rowOptions: ExcelRowOptions[] = []
): Uint8Array {
    return buildWorkbook([{ name: sheetName, columns, rows, rowOptions }], { styled: false });
}

/** Offers a file for download in the browser. */
export function downloadFile(bytes: Uint8Array, fileName: string, mimeType: string): void {
    const blob = new Blob([bytes as BlobPart], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
