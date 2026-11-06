import { strFromU8, unzipSync } from "fflate";

import { parseCsv } from "./csv";
import { isoDate, isoDateTime, parseBoolean, parseDate, parseNumber } from "./values";
import { ColumnType } from "./types";

/** Import of CSV and XLSX files: a small xlsx reader (first sheet) and type guessing for new fields. */

function decodeXml(text: string): string {
    return text
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
        .replace(/&amp;/g, "&");
}

function attr(tag: string, name: string): string | undefined {
    const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
    return match ? decodeXml(match[1]) : undefined;
}

/** Text of all <t> elements inside a fragment (rich text runs are concatenated). */
function texts(fragment: string): string {
    let out = "";
    const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(fragment))) {
        out += decodeXml(match[1] ?? "");
    }
    return out;
}

function columnIndex(ref: string): number {
    let n = 0;
    for (const c of ref) {
        const code = c.charCodeAt(0);
        if (code < 65 || code > 90) {
            break;
        }
        n = n * 26 + (code - 64);
    }
    return n - 1;
}

const DATE_FORMAT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function excelDate(serial: number): Date {
    const utc = new Date(Math.round((serial - 25569) * 86400000));
    return new Date(
        utc.getUTCFullYear(),
        utc.getUTCMonth(),
        utc.getUTCDate(),
        utc.getUTCHours(),
        utc.getUTCMinutes(),
        utc.getUTCSeconds()
    );
}

/** Reads the first worksheet of an xlsx file into rows of text (dates as ISO, booleans as true/false). */
export function readXlsx(data: Uint8Array): string[][] {
    const files = unzipSync(data);
    const read = (path: string): string | undefined => (files[path] ? strFromU8(files[path]) : undefined);
    const workbook = read("xl/workbook.xml") ?? "";
    const rels = read("xl/_rels/workbook.xml.rels") ?? "";
    const firstSheet = /<sheet\s[^>]*>/.exec(workbook)?.[0];
    const relId = firstSheet ? attr(firstSheet, "r:id") : undefined;
    let sheetPath = "xl/worksheets/sheet1.xml";
    if (relId) {
        const rel = new RegExp(`<Relationship[^>]*Id="${relId}"[^>]*>`).exec(rels)?.[0];
        const target = rel ? attr(rel, "Target") : undefined;
        if (target) {
            sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
        }
    }
    const shared: string[] = [];
    const sharedXml = read("xl/sharedStrings.xml");
    if (sharedXml) {
        const re = /<si>([\s\S]*?)<\/si>/g;
        let match: RegExpExecArray | null;
        while ((match = re.exec(sharedXml))) {
            shared.push(texts(match[1]));
        }
    }
    // Styles: which cell formats are dates.
    const dateStyles = new Set<number>();
    const styles = read("xl/styles.xml");
    if (styles) {
        const customDate = new Set<number>();
        const fmtRe = /<numFmt\s[^>]*>/g;
        let match: RegExpExecArray | null;
        while ((match = fmtRe.exec(styles))) {
            const id = Number(attr(match[0], "numFmtId"));
            const code = (attr(match[0], "formatCode") ?? "")
                .replace(/"[^"]*"/g, "")
                .replace(/\[[^\]]*\]/g, "")
                .toLowerCase();
            if (/[dy]/.test(code) || /(^|[^a-z])m{1,4}([^a-z]|$)/.test(code.replace(/h+:?m+/g, ""))) {
                customDate.add(id);
            }
        }
        const xfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? "";
        const xfRe = /<xf\s[^>]*?\/?>/g;
        let index = 0;
        while ((match = xfRe.exec(xfs))) {
            const id = Number(attr(match[0], "numFmtId") ?? 0);
            if (DATE_FORMAT_IDS.has(id) || customDate.has(id)) {
                dateStyles.add(index);
            }
            index++;
        }
    }
    const sheet = read(sheetPath) ?? "";
    const rows: string[][] = [];
    const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRe.exec(sheet))) {
        const rowNumber = Number(attr(rowMatch[0].slice(0, rowMatch[0].indexOf(">") + 1), "r") ?? rows.length + 1);
        while (rows.length < rowNumber - 1) {
            rows.push([]);
        }
        const cells: string[] = [];
        const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
        let cellMatch: RegExpExecArray | null;
        const body = rowMatch[1] ?? "";
        let position = 0;
        while ((cellMatch = cellRe.exec(body))) {
            const head = `<c${cellMatch[1]}>`;
            const ref = attr(head, "r");
            const col = ref ? columnIndex(ref) : position;
            position = col + 1;
            const type = attr(head, "t");
            const style = Number(attr(head, "s") ?? -1);
            const inner = cellMatch[2] ?? "";
            const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
            let value = "";
            if (type === "s") {
                value = shared[Number(raw)] ?? "";
            } else if (type === "inlineStr") {
                value = texts(inner);
            } else if (type === "b") {
                value = raw === "1" ? "true" : "false";
            } else if (type === "str" || type === "e") {
                value = decodeXml(raw ?? "");
            } else if (raw !== undefined) {
                const n = Number(raw);
                if (dateStyles.has(style) && Number.isFinite(n)) {
                    const date = excelDate(n);
                    value = n % 1 === 0 ? isoDate(date) : isoDateTime(date);
                } else {
                    value = raw;
                }
            }
            while (cells.length < col) {
                cells.push("");
            }
            cells[col] = value;
        }
        rows.push(cells);
    }
    while (rows.length && rows[rows.length - 1].every(cell => cell === "")) {
        rows.pop();
    }
    return rows;
}

/** Reads a CSV or XLSX file (by content: a zip starts with "PK"). */
export function readTable(bytes: Uint8Array): string[][] {
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
        return readXlsx(bytes);
    }
    return parseCsv(new TextDecoder("utf-8").decode(bytes));
}

/** Guesses a field type from sample values. */
export function guessType(values: string[]): ColumnType {
    const sample = values
        .map(v => v.trim())
        .filter(Boolean)
        .slice(0, 200);
    if (!sample.length) {
        return "text";
    }
    const all = (test: (v: string) => boolean): boolean => sample.every(test);
    if (all(v => v.length > 1 && parseBoolean(v) !== undefined && !/^\d+$/.test(v))) {
        return "boolean";
    }
    if (all(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))) {
        return "email";
    }
    if (all(v => /^(https?:\/\/|www\.)/i.test(v))) {
        return "link";
    }
    if (all(v => /^-?\d+$/.test(v))) {
        return "number";
    }
    if (all(v => /%$/.test(v) && parseNumber(v) !== undefined)) {
        return "percent";
    }
    if (all(v => /^[€$£¥]/.test(v) && parseNumber(v) !== undefined)) {
        return "currency";
    }
    if (all(v => parseNumber(v) !== undefined && /^[-+(]?[\d.,\s]+\)?$/.test(v))) {
        return "decimal";
    }
    if (all(v => /\d/.test(v) && /[-/.\s]/.test(v) && parseDate(v) !== undefined && !/^-?\d+([.,]\d+)?$/.test(v))) {
        return all(v => /\d{1,2}:\d{2}/.test(v)) ? "dateTime" : "date";
    }
    const distinct = new Set(sample.map(v => v.toLowerCase()));
    if (sample.length >= 6 && distinct.size <= Math.max(2, Math.min(12, sample.length / 3))) {
        return "select";
    }
    if (sample.some(v => v.length > 80 || v.includes("\n"))) {
        return "longText";
    }
    return "text";
}
