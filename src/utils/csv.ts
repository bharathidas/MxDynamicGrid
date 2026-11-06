/** CSV writing (RFC 4180, formula-injection safe) and parsing (quotes, embedded newlines, delimiter detection). */

export const CSV_BOM = "﻿";

/** Characters that make spreadsheet apps treat a cell as a formula. */
const FORMULA_START = ["=", "+", "-", "@", "\t", "\r"];

/** Prefixes text that would be read as a formula with a single quote (OWASP CSV injection guidance). */
export function escapeFormula(text: string): string {
    return text.length > 0 && FORMULA_START.includes(text[0]) ? `'${text}` : text;
}

export function csvField(text: string, delimiter: string): string {
    if (text.includes('"') || text.includes(delimiter) || text.includes("\n") || text.includes("\r")) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

export interface CsvOptions {
    delimiter: string;
    bom: boolean;
    escapeFormulas: boolean;
    /** Indexes of columns whose values are numbers (never formula-escaped, a leading minus is a sign). */
    numericColumns?: Set<number>;
}

export function buildCsv(header: string[], rows: string[][], options: CsvOptions): string {
    const line = (cells: string[], isHeader: boolean): string =>
        cells
            .map((cell, index) => {
                const safe =
                    options.escapeFormulas && (isHeader || !options.numericColumns?.has(index))
                        ? escapeFormula(cell)
                        : cell;
                return csvField(safe, options.delimiter);
            })
            .join(options.delimiter);
    const body = [line(header, true), ...rows.map(row => line(row, false))].join("\r\n");
    return (options.bom ? CSV_BOM : "") + body + "\r\n";
}

export function delimiterChar(kind: string): string {
    return kind === "semicolon" ? ";" : kind === "tab" ? "\t" : ",";
}

/** Guesses the delimiter from the first line: the most frequent of tab, semicolon and comma outside quotes. */
export function detectDelimiter(text: string): string {
    const counts: Record<string, number> = { "\t": 0, ";": 0, ",": 0 };
    let inQuotes = false;
    for (let i = 0; i < text.length && i < 10000; i++) {
        const c = text[i];
        if (c === '"') {
            inQuotes = !inQuotes;
        } else if (!inQuotes && (c === "\n" || c === "\r")) {
            break;
        } else if (!inQuotes && c in counts) {
            counts[c]++;
        }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0
        ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
        : ",";
}

/** Parses CSV/TSV text into rows of fields. */
export function parseCsv(input: string, delimiter?: string): string[][] {
    const text = input.startsWith(CSV_BOM) ? input.slice(1) : input;
    const sep = delimiter ?? detectDelimiter(text);
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;
    let i = 0;
    while (i < text.length) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i += 2;
                    continue;
                }
                inQuotes = false;
                i++;
                continue;
            }
            field += c;
            i++;
            continue;
        }
        if (c === '"' && field === "") {
            inQuotes = true;
            i++;
            continue;
        }
        if (c === sep) {
            row.push(field);
            field = "";
            i++;
            continue;
        }
        if (c === "\r" || c === "\n") {
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
            i += c === "\r" && text[i + 1] === "\n" ? 2 : 1;
            continue;
        }
        field += c;
        i++;
    }
    if (field !== "" || row.length) {
        row.push(field);
        rows.push(row);
    }
    return rows.filter(r => !(r.length === 1 && r[0] === ""));
}
