import { strFromU8, unzipSync } from "fflate";

import { buildXlsxExport, cellColors, ExportColors } from "../utils/exporter";
import { argb } from "../utils/xlsx";
import { col, row } from "./helpers";

const columns = [
    col("name", "text", { caption: "Name" }),
    col("status", "select", {
        caption: "Status",
        options: [
            { value: "open", label: "Open", color: "#fde68a" },
            { value: "done", label: "Done" }
        ]
    }),
    col("score", "number", { caption: "Score" }),
    col("qty", "number", { caption: "Qty" })
];
const rows = [
    row("r1", { name: "Alpha", status: "open", score: 10, qty: 1 }),
    row("r2", { name: "Beta", status: "done", score: 90, qty: 5 }),
    row("r3", { name: "Gamma", status: "done", score: 50, qty: 9 })
];
const display = rows.map(r => ({ kind: "data" as const, row: r, level: 0 }));
const colors: ExportColors = {
    row: {
        mode: "rules",
        rules: [
            {
                color: "#dbeafe",
                conditions: { conjunction: "and", conditions: [{ col: "name", op: "is", value: "Beta" }] }
            }
        ]
    },
    formats: {
        name: [{ kind: "textColor", op: "contains", value: "gam", color: "#b91c1c", background: "#fee2e2" }],
        score: [{ kind: "colorScale", low: "#ff0000", high: "#00ff00" }],
        qty: [{ kind: "dataBar", color: "#264ae5" }]
    }
};

function files(withColors: boolean): { sheet: string; styles: string } {
    const unzipped = unzipSync(
        buildXlsxExport(columns, display, {
            sheetName: "Data",
            escapeFormulas: true,
            colors: withColors ? colors : undefined
        })
    );
    return {
        sheet: strFromU8(unzipped["xl/worksheets/sheet1.xml"]),
        styles: strFromU8(unzipped["xl/styles.xml"])
    };
}

describe("export colours", () => {
    it("parses hex and rgb() colours", () => {
        expect(argb("#0ea58f")).toBe("FF0EA58F");
        expect(argb("rgb(255, 0, 16)")).toBe("FFFF0010");
        expect(argb("rgba(0, 0, 0, 0)")).toBeUndefined();
        expect(argb("transparent")).toBeUndefined();
    });

    it("picks rule over option over row colour", () => {
        const ranges = { score: { min: 10, max: 90 } };
        expect(cellColors(columns[1], rows[0], colors, ranges, undefined)).toEqual({ fill: "#fde68a" });
        expect(cellColors(columns[0], rows[1], colors, ranges, "#dbeafe")).toEqual({ fill: "#dbeafe" });
        expect(cellColors(columns[0], rows[2], colors, ranges, undefined)).toEqual({
            fill: "#fee2e2",
            font: "#b91c1c",
            bold: true
        });
        expect(cellColors(columns[2], rows[0], colors, ranges, undefined)?.fill).toBe("rgb(255, 0, 0)");
        expect(cellColors(columns[2], rows[1], colors, ranges, "#dbeafe")?.fill).toBe("rgb(0, 255, 0)");
    });

    it("writes fills, font colours and a native data bar when kept", () => {
        const { sheet, styles } = files(true);
        ["FFFDE68A", "FFDBEAFE", "FFFEE2E2", "FFFF0000", "FF00FF00"].forEach(color =>
            expect(styles).toContain(`<fgColor rgb="${color}"/>`)
        );
        expect(styles).toMatch(/<font><b\/><sz val="11"\/><color rgb="FFB91C1C"\/>/);
        expect(styles).toMatch(/<fonts count="(\d+)">/);
        const fontCount = Number(/<fonts count="(\d+)">/.exec(styles)?.[1]);
        expect((styles.match(/<font>/g) ?? []).length).toBe(fontCount);
        const xfCount = Number(/<cellXfs count="(\d+)">/.exec(styles)?.[1]);
        const xfs = /<cellXfs[^>]*>(.*)<\/cellXfs>/.exec(styles)?.[1] ?? "";
        expect((xfs.match(/<xf /g) ?? []).length).toBe(xfCount);
        expect(sheet).toContain('<cfRule type="dataBar"');
        // every style index used by a cell exists
        const used = [...sheet.matchAll(/ s="(\d+)"/g)].map(m => Number(m[1]));
        expect(Math.max(...used)).toBeLessThan(xfCount);
    });

    it("stays plain when not kept", () => {
        const { sheet, styles } = files(false);
        expect(styles).not.toContain("FFFDE68A");
        expect(styles).toContain('<fonts count="2">');
        expect(sheet).not.toContain("dataBar");
    });
});

describe("export colours: progress and rating", () => {
    const cols = [
        col("name", "text", { caption: "Task" }),
        col("progress", "progress", { caption: "Progress" }),
        col("impact", "rating", { caption: "Impact", max: 5 })
    ];
    const data = [
        row("t1", { name: "A", progress: 90, impact: 3 }),
        row("t2", { name: "B", progress: 0, impact: null })
    ].map(r => ({ kind: "data" as const, row: r, level: 0 }));
    const sheet = (keep: boolean): string =>
        strFromU8(
            unzipSync(
                buildXlsxExport(cols, data, {
                    sheetName: "Data",
                    escapeFormulas: true,
                    colors: keep ? { accent: "#E0703A" } : undefined
                })
            )["xl/worksheets/sheet1.xml"]
        );

    it("writes progress as a 0-100 data bar in the accent colour", () => {
        const xml = sheet(true);
        expect(xml).toContain(
            '<dataBar minLength="0" maxLength="100"><cfvo type="num" val="0"/><cfvo type="num" val="100"/>'
        );
        expect(xml).toContain('<color rgb="FFE0703A"/>');
        expect(xml).toMatch(/<c r="B\d+" s="\d+"><v>90<\/v><\/c>/);
    });

    it("writes ratings as orange and grey stars", () => {
        const xml = sheet(true);
        expect(xml).toContain('<color rgb="FFF5A524"/><rFont val="Calibri"/></rPr><t xml:space="preserve">★★★</t>');
        expect(xml).toContain("☆☆</t>");
    });

    it("keeps plain numbers when not kept", () => {
        const xml = sheet(false);
        expect(xml).not.toContain("dataBar");
        expect(xml).not.toContain("★");
    });
});

describe("export colours: links", () => {
    it("writes link, email and phone fields as clickable HYPERLINK cells in the accent colour", () => {
        const cols = [
            col("site", "link", { caption: "Site" }),
            col("mail", "email", { caption: "Mail" }),
            col("note", "text", { caption: "Note" })
        ];
        const data = [row("l1", { site: "mendix.com", mail: "a@b.nl", note: "x" })].map(r => ({
            kind: "data" as const,
            row: r,
            level: 0
        }));
        const bytes = buildXlsxExport(cols, data, {
            sheetName: "Data",
            escapeFormulas: true,
            colors: { accent: "#F26522" }
        });
        const files = unzipSync(bytes);
        const xml = strFromU8(files["xl/worksheets/sheet1.xml"]);
        expect(xml).toContain(
            "<f>HYPERLINK(&quot;https://mendix.com&quot;,&quot;mendix.com&quot;)</f><v>mendix.com</v>"
        );
        expect(xml).toContain("HYPERLINK(&quot;mailto:a@b.nl&quot;");
        expect(xml).not.toContain("HYPERLINK(&quot;x");
        expect(strFromU8(files["xl/styles.xml"])).toContain('<color rgb="FFF26522"/>');
        const plain = strFromU8(
            unzipSync(buildXlsxExport(cols, data, { sheetName: "Data", escapeFormulas: true }))[
                "xl/worksheets/sheet1.xml"
            ]
        );
        expect(plain).not.toContain("HYPERLINK");
    });
});
