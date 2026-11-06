import { readFileSync } from "fs";
import { join } from "path";

import { check, getPreview, getProperties, StructurePreviewProps } from "../MxDynamicGrid.editorConfig";
import { MxDynamicGridPreviewProps, StaticColumnsPreviewType } from "../../typings/MxDynamicGridProps";
import { TEXT_DEFAULTS } from "../utils/textDefaults";

const renderer = (() => null) as never;

function staticColumn(overrides: Partial<StaticColumnsPreviewType> = {}): StaticColumnsPreviewType {
    return {
        staticType: "attribute",
        staticAttribute: "Status",
        staticText: "",
        staticContent: { widgetCount: 0, renderer },
        staticCaption: "",
        staticHeaderGroup: "",
        staticPosition: "start",
        staticWidth: 160,
        staticPinned: "none",
        staticSortable: true,
        staticFilterable: true,
        staticEditable: false,
        staticAttributeName: "",
        ...overrides
    };
}

function values(overrides: Partial<MxDynamicGridPreviewProps> = {}): MxDynamicGridPreviewProps {
    return {
        className: "",
        class: "",
        style: "",
        readOnly: false,
        renderMode: "structure",
        translate: (text: string) => text,
        columnsSource: { caption: "Columns" },
        colKey: "Key",
        colCaption: "Caption",
        colType: "ColumnType",
        rowsSource: { caption: "GridRow" },
        rowKey: "Key",
        rowData: "DataJson",
        dataMode: "auto",
        clientThreshold: 5000,
        emptyPlaceholder: { widgetCount: 0, renderer },
        staticColumns: [],
        selection: "Multi",
        showCheckboxes: true,
        changeSet: "ChangeSet",
        onSave: {},
        saveMode: "auto",
        saveDelay: 600,
        rangeSelection: true,
        showSearch: true,
        showHeaderFilters: true,
        showColumnsPanel: true,
        enableGrouping: true,
        showRowNumbers: true,
        showTotals: true,
        showStatusBar: true,
        pagination: "virtualScrolling",
        pageSize: 50,
        pageSizeOptions: "25,50",
        exportFormats: "both",
        exportFileName: "export-[date]",
        allowImport: true,
        colorScheme: "light",
        ...overrides
    } as unknown as MxDynamicGridPreviewProps;
}

function texts(node: StructurePreviewProps, out: string[] = []): string[] {
    if (node.type === "Text") {
        out.push(node.content);
    }
    if ("children" in node && node.children) {
        node.children.forEach(child => texts(child, out));
    }
    if ((node.type === "Selectable" || node.type === "Datasource") && node.child) {
        texts(node.child, out);
    }
    return out;
}

function findRowLayouts(node: StructurePreviewProps, out: StructurePreviewProps[] = []): StructurePreviewProps[] {
    if (node.type === "RowLayout") {
        out.push(node);
    }
    if ("children" in node && node.children) {
        node.children.forEach(child => findRowLayouts(child, out));
    }
    return out;
}

describe("editorConfig: Jint guard", () => {
    const source = readFileSync(join(__dirname, "..", "MxDynamicGrid.editorConfig.ts"), "utf8");
    const code = source
        .split("\n")
        .filter(line => !line.trim().startsWith("*") && !line.trim().startsWith("//") && !line.trim().startsWith("/*"))
        .join("\n");
    it.each([
        ["RegExp", /\bRegExp\b/],
        ["regex literal in split", /split\(\s*\//],
        ["regex literal method call", /\/[^/\n*]+\/[gimsuy]*\.(test|exec)\(/],
        ["matchAll", /\.matchAll\(/],
        ["replaceAll", /\.replaceAll\(/],
        ["flat", /\.flat\(/],
        ["flatMap", /\.flatMap\(/],
        ["search", /\.search\(/],
        ["for-of", /for\s*\(\s*(const|let|var)\s+\w+\s+of\b/]
    ])("does not use %s", (_, pattern) => {
        expect(pattern.test(code)).toBe(false);
    });
});

describe("structure preview", () => {
    it("mirrors AGGrid: title, data source headers, fixed rows with equal grow and [Attribute] placeholders", () => {
        const preview = getPreview(
            values({
                staticColumns: [staticColumn(), staticColumn({ staticType: "customContent", staticPosition: "end" })]
            }),
            false,
            [11, 12, 1]
        );
        const all = texts(preview);
        expect(all[0]).toBe("MxDynamicGrid");
        expect(all).toContain("Name  ·  Text");
        expect(all).toContain("Status ⇅");
        expect(all).toContain("[Status]");
        expect(all).toContain("[DataJson]");
        expect(all).toContain("+");
        const rows = findRowLayouts(preview);
        expect(rows.every(r => r.type === "RowLayout" && (r.columnSize === "fixed" || r.columnSize === "grow"))).toBe(
            true
        );
        expect(preview.type === "Container" && preview.children?.filter(c => c.type === "Datasource")).toHaveLength(2);
        expect(JSON.stringify(preview)).toContain('"type":"DropZone"');
        expect(JSON.stringify(preview)).toContain('"type":"Selectable"');
    });
    it("supports dark mode and old Studio versions", () => {
        const dark = JSON.stringify(getPreview(values(), true, [9, 18, 0]));
        expect(dark).toContain("#579BF9");
        expect(dark).not.toContain('"type":"Datasource"');
    });
});

describe("getProperties", () => {
    function visible(v: MxDynamicGridPreviewProps): string[] {
        const props = [
            {
                caption: "All",
                properties: [
                    "searchAttribute",
                    "viewState",
                    "totalCount",
                    "clientThreshold",
                    "saveDelay",
                    "fillHandle",
                    "pageSizeOptions",
                    "exportSheetName",
                    "csvDelimiter",
                    "onPersonalizationChange",
                    "onViewsChange",
                    "viewOwner",
                    "selectAllPages",
                    "showGroupButton",
                    "showRowHeightButton",
                    "showMoreMenu",
                    "showFilterButton",
                    "showNewRowButton",
                    "staticColumns"
                ].map(key => ({
                    key,
                    caption: key,
                    objects:
                        key === "staticColumns"
                            ? v.staticColumns.map(() => ({
                                  properties: [
                                      {
                                          caption: "x",
                                          properties: [
                                              "staticAttribute",
                                              "staticText",
                                              "staticContent",
                                              "staticAttributeName",
                                              "staticFilterable",
                                              "staticEditable",
                                              "staticSortable"
                                          ].map(k => ({ key: k, caption: k }))
                                      }
                                  ]
                              }))
                            : undefined
                }))
            }
        ];
        const result = getProperties(v, props as never) as unknown as Array<{ properties: Array<{ key: string }> }>;
        return result[0].properties.map(p => p.key);
    }
    it("hides properties that do not apply", () => {
        const client = visible(
            values({ dataMode: "client", saveMode: "manual", pagination: "loadMore", exportFormats: "excel" })
        );
        expect(client).not.toContain("viewState");
        expect(client).not.toContain("saveDelay");
        expect(client).not.toContain("pageSizeOptions");
        expect(client).not.toContain("csvDelimiter");
        expect(client).toContain("exportSheetName");
        expect(client).not.toContain("onViewsChange");
        const server = visible(
            values({
                dataMode: "server",
                viewState: "ViewState",
                pagination: "buttons",
                exportFormats: "csv",
                views: "Views"
            } as never)
        );
        expect(server).toContain("viewState");
        expect(server).toContain("totalCount");
        expect(server).not.toContain("clientThreshold");
        expect(server).not.toContain("exportSheetName");
        expect(server).toContain("onViewsChange");
    });
    it("hides the toolbar item options without the view bar", () => {
        const on = visible(values({ showViewBar: true, enableGrouping: true } as never));
        expect(on).toContain("showMoreMenu");
        expect(on).toContain("showGroupButton");
        const noGroup = visible(values({ showViewBar: true, enableGrouping: false } as never));
        expect(noGroup).toContain("showRowHeightButton");
        expect(noGroup).not.toContain("showGroupButton");
        const off = visible(values({ showViewBar: false } as never));
        expect(off).not.toContain("showFilterButton");
        expect(off).not.toContain("showNewRowButton");
    });
    it("hides static column properties by kind", () => {
        const v = values({ staticColumns: [staticColumn({ staticType: "dynamicText", staticText: "x" })] });
        const props = [
            {
                caption: "All",
                properties: [
                    {
                        key: "staticColumns",
                        caption: "Static",
                        objects: [
                            {
                                properties: [
                                    {
                                        caption: "G",
                                        properties: [
                                            "staticAttribute",
                                            "staticText",
                                            "staticContent",
                                            "staticEditable"
                                        ].map(k => ({ key: k, caption: k }))
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        ];
        const result = getProperties(v, props as never) as never as Array<{
            properties: Array<{ objects: Array<{ properties: Array<{ properties: Array<{ key: string }> }> }> }>;
        }>;
        const keys = result[0].properties[0].objects[0].properties[0].properties.map(p => p.key);
        expect(keys).toEqual(["staticText"]);
    });
});

describe("check", () => {
    it("requires both change set and save action for editing", () => {
        expect(check(values({ onSave: null } as never)).map(p => p.property)).toContain("onSave");
        expect(check(values({ changeSet: "" })).map(p => p.property)).toContain("changeSet");
        const readOnly = check(values({ changeSet: "", onSave: null } as never));
        expect(readOnly.every(p => p.severity === "warning")).toBe(true);
    });
    it("validates numbers, page size options and static columns", () => {
        const problems = check(
            values({
                pageSize: 0,
                pagination: "buttons",
                pageSizeOptions: "10,x",
                staticColumns: [
                    staticColumn({ staticAttribute: "" }),
                    staticColumn({ staticType: "dynamicText", staticText: "" })
                ]
            })
        ).map(p => p.property);
        expect(problems).toEqual(
            expect.arrayContaining([
                "pageSize",
                "pageSizeOptions",
                "staticColumns/1/staticAttribute",
                "staticColumns/2/staticText"
            ])
        );
        expect(check(values())).toEqual([]);
    });
});

describe("texts", () => {
    it("have no curly braces (Studio Pro text templates)", () => {
        Object.values(TEXT_DEFAULTS).forEach(text => expect(text).not.toMatch(/[{}]/));
    });
    it("every text is a property of the XML", () => {
        const xml = readFileSync(join(__dirname, "..", "MxDynamicGrid.xml"), "utf8");
        Object.keys(TEXT_DEFAULTS).forEach(key => expect(xml).toContain(`key="${key}"`));
        expect(xml).not.toContain("<helpUrl>");
        const properties = xml.split("<property ").length - 1;
        const descriptions = xml.split("<description>").length - 2;
        expect(descriptions).toBeGreaterThanOrEqual(properties);
    });
});
