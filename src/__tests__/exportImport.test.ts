import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { planImport } from "../components/ImportDialog";
import { planPasteBlock, parseClipboard } from "../utils/clipboard";
import { buildCsv, detectDelimiter, escapeFormula, parseCsv } from "../utils/csv";
import { buildCsvExport, buildXlsxExport, expandTokens, headerGroupSpans } from "../utils/exporter";
import { guessType, readTable, readXlsx } from "../utils/importer";
import { groupRows } from "../utils/pipeline";
import { col, row } from "./helpers";

const columns = [
    col("name", "text", { caption: "Name", headerGroup: "" }),
    col("price", "currency", { caption: "Price", format: "€ #,##0.00", headerGroup: "Money" }),
    col("share", "percent", { caption: "Share", headerGroup: "Money" }),
    col("due", "date", { caption: "Due", format: "dd-MM-yyyy" }),
    col("done", "boolean", { caption: "Done" }),
    col("tags", "multiSelect", {
        caption: "Tags",
        options: [
            { value: "a", label: "Alpha" },
            { value: "b", label: "Beta" }
        ]
    })
];
const rows = [
    row("r1", {
        name: "=cmd|' /C calc'!A0",
        price: 12.5,
        share: 0.25,
        due: "2026-10-29",
        done: true,
        tags: ["a", "b"]
    }),
    row("r2", { name: 'Say "hi"', price: 3, share: null, due: null, done: false, tags: [] })
];
const display = rows.map(r => ({ kind: "data" as const, row: r, level: 0 }));

describe("xlsx export", () => {
    const files = unzipSync(
        buildXlsxExport(columns, display, {
            sheetName: "Data",
            title: "Report",
            exportedAt: "today",
            escapeFormulas: true
        })
    );
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
    const styles = strFromU8(files["xl/styles.xml"]);
    it("writes typed cells", () => {
        expect(sheet).toMatch(/<c r="B5" s="\d+"><v>12\.5<\/v><\/c>/);
        expect(sheet).toMatch(/<c r="C5" s="\d+"><v>0\.25<\/v><\/c>/);
        expect(sheet).toMatch(/<c r="E5" t="b"[^>]*><v>1<\/v><\/c>/);
        expect(sheet).toContain("Alpha, Beta");
        expect(sheet).toMatch(/<c r="D5" s="\d+"><v>46324(\.\d+)?<\/v><\/c>/);
    });
    it("uses the column formats", () => {
        expect(styles).toContain('formatCode="&quot;€ &quot;#,##0.00"');
        expect(styles).toContain('formatCode="0%"');
        expect(styles).toContain('formatCode="dd-mm-yyyy"');
    });
    it("has title rows, merged header groups, frozen header and autofilter", () => {
        expect(sheet).toContain("Report");
        expect(sheet).toContain('<mergeCell ref="B3:C3"/>');
        expect(sheet).toMatch(/<pane [^>]*ySplit="4"[^>]*state="frozen"/);
        expect(sheet).toContain('<autoFilter ref="A4:F6"/>');
    });
    it("marks formula-like text with quotePrefix", () => {
        expect(styles).toContain('quotePrefix="1"');
    });
    it("writes group rows as an outline", () => {
        const grouped = groupRows(rows, columns, ["done"], new Set(), [], { price: "sum" }, "(Empty)");
        const xml = strFromU8(
            unzipSync(buildXlsxExport(columns, grouped, { sheetName: "D", escapeFormulas: false }))[
                "xl/worksheets/sheet1.xml"
            ]
        );
        expect(xml).toContain('outlineLevel="1"');
        expect(xml).toContain("<outlinePr");
    });
    it("expands tokens and computes header group spans", () => {
        expect(expandTokens("x-[date]", new Date(2026, 0, 2))).toBe("x-2026-01-02");
        expect(headerGroupSpans(columns)).toEqual([
            { caption: "", start: 0, span: 1 },
            { caption: "Money", start: 1, span: 2 },
            { caption: "", start: 3, span: 3 }
        ]);
    });
});

describe("csv", () => {
    it("exports RFC 4180 with BOM, formula escaping and ISO dates", () => {
        const csv = buildCsvExport(columns, display, { delimiter: ";", bom: true, dates: "iso", escapeFormulas: true });
        expect(csv.charCodeAt(0)).toBe(0xfeff);
        const lines = csv.slice(1).split("\r\n");
        expect(lines[0]).toBe("Name;Price;Share;Due;Done;Tags");
        expect(lines[1]).toBe("'=cmd|' /C calc'!A0;12.5;0.25;2026-10-29;true;Alpha, Beta");
        expect(lines[2]).toBe('"Say ""hi""";3;;;false;');
    });
    it("can use the column date format and keeps negative numbers", () => {
        const csv = buildCsvExport(columns, display, {
            delimiter: ",",
            bom: false,
            dates: "format",
            escapeFormulas: true
        });
        expect(csv).toContain("29-10-2026");
        expect(
            buildCsv(["n"], [["-5"]], {
                delimiter: ",",
                bom: false,
                escapeFormulas: true,
                numericColumns: new Set([0])
            })
        ).toBe("n\r\n-5\r\n");
        expect(escapeFormula("@SUM(1)")).toBe("'@SUM(1)");
        expect(escapeFormula("plain")).toBe("plain");
    });
    it("parses quoted fields, embedded newlines and detects delimiters", () => {
        expect(parseCsv('a,b\r\n"x, y","multi\nline"\r\n')).toEqual([
            ["a", "b"],
            ["x, y", "multi\nline"]
        ]);
        expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
        expect(detectDelimiter("a\tb")).toBe("\t");
        expect(parseCsv("﻿a;b\n1;2")).toEqual([
            ["a", "b"],
            ["1", "2"]
        ]);
    });
});

describe("import", () => {
    it("reads an xlsx with shared strings, numbers, booleans and dates", () => {
        const workbook = `<workbook xmlns:r="r"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`;
        const rels = `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`;
        const shared = `<sst><si><t>Name</t></si><si><r><t>Ac</t></r><r><t>me</t></r></si></sst>`;
        const styles = `<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`;
        const sheet = `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>When</t></is></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>3.5</v></c><c r="C2" s="1"><v>46324</v></c><c r="D2" t="b"><v>1</v></c></row></sheetData></worksheet>`;
        const zip = zipSync({
            "xl/workbook.xml": strToU8(workbook),
            "xl/_rels/workbook.xml.rels": strToU8(rels),
            "xl/sharedStrings.xml": strToU8(shared),
            "xl/styles.xml": strToU8(styles),
            "xl/worksheets/sheet1.xml": strToU8(sheet)
        });
        expect(readXlsx(zip)).toEqual([
            ["Name", "", "When"],
            ["Acme", "3.5", "2026-10-29", "true"]
        ]);
        expect(readTable(strToU8("a,b\n1,2"))).toEqual([
            ["a", "b"],
            ["1", "2"]
        ]);
    });
    it("round-trips its own xlsx export", () => {
        const table = readXlsx(buildXlsxExport(columns, display, { sheetName: "Data", escapeFormulas: false }));
        expect(table[1][0]).toBe("Name");
        expect(table[2][1]).toBe("12.5");
        expect(table[2][3]).toBe("2026-10-29");
    });
    it("guesses field types", () => {
        expect(guessType(["1", "2", "30"])).toBe("number");
        expect(guessType(["1.5", "2,25"])).toBe("decimal");
        expect(guessType(["yes", "no"])).toBe("boolean");
        expect(guessType(["a@b.co"])).toBe("email");
        expect(guessType(["2026-01-02", "2026-02-03"])).toBe("date");
        expect(guessType(["10%", "20%"])).toBe("percent");
        expect(guessType(["x", "y", "x", "y", "x", "y"])).toBe("select");
        expect(guessType(["Some text"])).toBe("text");
    });
    it("plans rows and new columns from the mapping", () => {
        let n = 0;
        const result = planImport(
            {
                header: ["Name", "Price", "Region", "Skip"],
                body: [
                    ["A", "9.5", "North", "x"],
                    ["B", "bad", "South", "y"],
                    ["", "", "", ""]
                ],
                targets: [
                    { kind: "existing", key: "name" },
                    { kind: "existing", key: "price" },
                    { kind: "new", type: "select" },
                    { kind: "skip" }
                ],
                columns
            },
            () => `k${++n}`
        );
        expect(result.rows).toEqual([
            { name: "A", price: 9.5, k1: "North" },
            { name: "B", k1: "South" }
        ]);
        expect(result.newColumns[0]).toMatchObject({ key: "k1", caption: "Region", type: "select" });
        expect(result.newColumns[0].options.map(o => o.label)).toEqual(["North", "South"]);
    });
});

describe("paste planning", () => {
    it("parses Excel TSV and plans cells, new rows, extra columns and options", () => {
        const block = parseClipboard('A\t1\tNew\r\n"multi\nline"\t2\tx\r\nC\t3\ty\r\n');
        expect(block[1][0]).toBe("multi\nline");
        const target = [
            col("name"),
            col("qty", "number"),
            col("status", "select", { options: [{ value: "x", label: "x" }] })
        ];
        const plan = planPasteBlock(block, [row("r1", {}), row("r2", {})], target, 0, 0, {
            addRows: true,
            canEdit: () => true
        });
        expect(plan.cells).toHaveLength(6);
        expect(plan.newRows).toEqual([{ name: "C", qty: 3, status: "y" }]);
        expect(plan.newOptions.status.map(o => o.label)).toEqual(["New", "y"]);
        const wide = planPasteBlock([["a", "b", "c"]], [row("r1", {})], target, 0, 1, {
            addRows: false,
            canEdit: () => true
        });
        expect(wide.extraColumns).toBe(1);
        expect(wide.rejected).toBe(1);
    });
});
