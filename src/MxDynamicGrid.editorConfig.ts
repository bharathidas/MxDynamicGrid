import {
    Problem,
    Properties,
    hideNestedPropertiesIn,
    hidePropertiesIn,
    hidePropertyIn
} from "@mendix/pluggable-widgets-tools";

import { MxDynamicGridPreviewProps, StaticColumnsPreviewType } from "../typings/MxDynamicGridProps";

/*
 * Studio Pro runs this file in Jint (Esprima 2.1.2): no regular expressions, no replaceAll, flat, flatMap,
 * matchAll or search. A unit test scans the source for them.
 */

type StaticKey = keyof StaticColumnsPreviewType;

// ---- Structure mode preview (same building blocks and palette as Data Grid 2 / AGGrid) ------------------

interface ContainerProps {
    type: "Container";
    children?: StructurePreviewProps[];
    borders?: boolean;
    borderWidth?: number;
    borderRadius?: number;
    backgroundColor?: string;
    grow?: number;
    padding?: number;
}

interface RowLayoutProps {
    type: "RowLayout";
    children: StructurePreviewProps[];
    columnSize?: "fixed" | "grow";
    borders?: boolean;
    borderWidth?: number;
    backgroundColor?: string;
    grow?: number;
    padding?: number;
}

interface TextProps {
    type: "Text";
    content: string;
    fontSize?: number;
    fontColor?: string;
    bold?: boolean;
    italic?: boolean;
}

interface DropZoneProps {
    type: "DropZone";
    property: object;
    placeholder?: string;
    showDataSourceHeader?: boolean;
    grow?: number;
}

interface SelectableProps {
    type: "Selectable";
    object: object;
    child: StructurePreviewProps;
    grow?: number;
}

interface DatasourceProps {
    type: "Datasource";
    property: object | null;
    child?: StructurePreviewProps;
}

export type StructurePreviewProps =
    | ContainerProps
    | RowLayoutProps
    | TextProps
    | DropZoneProps
    | SelectableProps
    | DatasourceProps;

const PALETTE = {
    light: {
        text: { primary: "#2F3646", secondary: "#6B707B", data: "#146FF4" },
        background: { topbarData: "#DCEEFE", topbarStandard: "#F7F7F7", container: "#FFFFFF", containerFill: "#F2F2F3" }
    },
    dark: {
        text: { primary: "#DEDEDE", secondary: "#A4A4A4", data: "#579BF9" },
        background: {
            topbarData: "#333A65E5",
            topbarStandard: "#33646464",
            container: "#313131",
            containerFill: "#3E3E3E"
        }
    }
};

const container =
    (props: Omit<ContainerProps, "type" | "children"> = {}) =>
    (...children: StructurePreviewProps[]): ContainerProps => ({ type: "Container", ...props, children });
const rowLayout =
    (props: Omit<RowLayoutProps, "type" | "children"> = {}) =>
    (...children: StructurePreviewProps[]): RowLayoutProps => ({ type: "RowLayout", ...props, children });
const text =
    (props: Omit<TextProps, "type" | "content"> = {}) =>
    (content: string): TextProps => ({ type: "Text", ...props, content });
const dropZone = (property: object, placeholder: string, hideHeader: boolean): DropZoneProps => ({
    type: "DropZone",
    property,
    placeholder,
    ...(hideHeader ? { showDataSourceHeader: false } : {})
});

/** Sample dynamic columns shown in the previews (the real ones are runtime data). */
export const SAMPLE_COLUMNS = [
    { caption: "Name", type: "Text", sample: "Acme Corp" },
    { caption: "Status", type: "Single select", sample: "Active" },
    { caption: "Amount", type: "Currency", sample: "€ 1,250.00" },
    { caption: "Due", type: "Date", sample: "29 Oct 2026" }
];

export function lastSegment(path: string): string {
    const parts = path.split("/");
    return parts[parts.length - 1] || path;
}

export function staticCaption(column: StaticColumnsPreviewType, index: number): string {
    if (column.staticCaption && column.staticCaption.trim()) {
        return column.staticCaption;
    }
    if (column.staticType === "attribute" && column.staticAttribute) {
        return lastSegment(column.staticAttribute);
    }
    return column.staticType === "dynamicText" ? "Dynamic text" : "Column " + (index + 1);
}

export function staticCellText(column: StaticColumnsPreviewType): string {
    if (column.staticType === "attribute") {
        return "[" + (column.staticAttribute || "No attribute selected") + "]";
    }
    return column.staticText || "Dynamic text";
}

/** Grow of a static column in structure mode: width relative to the 150 px of a dynamic column. */
export function staticGrow(column: StaticColumnsPreviewType): number {
    const width = column.staticWidth || 160;
    return Math.max(1, Math.round(width / 150));
}

export function getPreview(
    values: MxDynamicGridPreviewProps,
    isDarkMode: boolean,
    version: number[] = [0, 0, 0]
): StructurePreviewProps {
    const major = version[0] || 0;
    const minor = version[1] || 0;
    const modernStudio = major > 9 || (major === 9 && minor >= 20);
    const palette = isDarkMode ? PALETTE.dark : PALETTE.light;
    const cell = (
        props: Omit<ContainerProps, "type" | "children">
    ): ((...children: StructurePreviewProps[]) => ContainerProps) => container({ borders: true, ...props });
    const startColumns = values.staticColumns.filter(column => column.staticPosition !== "end");
    const endColumns = values.staticColumns.filter(column => column.staticPosition === "end");

    const titleBar = rowLayout({
        columnSize: "fixed",
        backgroundColor: palette.background.topbarData,
        borders: true,
        borderWidth: 1
    })(container({ padding: 4 })(text({ fontColor: palette.text.data })("MxDynamicGrid")));

    const buttons: string[] = [];
    if (values.enableGrouping) {
        buttons.push("Group by");
    }
    if (values.showColumnsPanel) {
        buttons.push("Columns");
    }
    if (values.allowImport) {
        buttons.push("Import");
    }
    if (values.exportFormats !== "none") {
        buttons.push("Export");
    }
    buttons.push("+ Add row");
    const toolbar = rowLayout({ columnSize: "fixed", borders: true, padding: 6 })(
        container({ grow: 3 })(
            text({ fontSize: 10, fontColor: palette.text.secondary })(values.showSearch ? "🔍 Search..." : "")
        ),
        container({ grow: 2 })(text({ fontSize: 10, fontColor: palette.text.data })(buttons.join("   ")))
    );

    const extraHeaders: StructurePreviewProps[] = [];
    const extraCells: StructurePreviewProps[] = [];
    if (values.selection !== "None" && values.showCheckboxes) {
        extraHeaders.push(
            cell({ grow: 0, backgroundColor: palette.background.topbarStandard, padding: 8 })(
                text({ fontSize: 10 })("☐")
            )
        );
        extraCells.push(cell({ grow: 0, padding: 8 })(text({ fontSize: 10, fontColor: palette.text.secondary })("☐")));
    }
    if (values.showRowNumbers) {
        extraHeaders.push(
            cell({ grow: 0, backgroundColor: palette.background.topbarStandard, padding: 8 })(
                text({ fontSize: 10, bold: true })("#")
            )
        );
        extraCells.push(cell({ grow: 0, padding: 8 })(text({ fontSize: 10, fontColor: palette.text.secondary })("1")));
    }

    const staticHeader = (column: StaticColumnsPreviewType, index: number): StructurePreviewProps => {
        const header = cell({ grow: staticGrow(column), backgroundColor: palette.background.topbarStandard })(
            rowLayout({ columnSize: "grow" })(
                container({ grow: 0, backgroundColor: "#AEEdAA" })(container({ padding: 0 })()),
                container({ padding: 8 })(
                    container({ grow: 1, padding: 8 })(
                        text({ bold: true, fontSize: 10, fontColor: palette.text.primary })(
                            staticCaption(column, index) +
                                (column.staticSortable && column.staticType === "attribute" ? " ⇅" : "")
                        )
                    )
                )
            )
        );
        return { type: "Selectable", object: column, child: header, grow: staticGrow(column) };
    };
    const staticBody = (column: StaticColumnsPreviewType): StructurePreviewProps => {
        if (column.staticType === "customContent") {
            return cell({ grow: staticGrow(column) })(dropZone(column.staticContent, "Custom content", modernStudio));
        }
        return cell({ grow: staticGrow(column), padding: 8 })(
            text({ fontSize: 10, fontColor: palette.text.secondary })(staticCellText(column))
        );
    };
    const indexOf = (column: StaticColumnsPreviewType): number => values.staticColumns.indexOf(column);

    const dynamicHeaders = SAMPLE_COLUMNS.map(sample =>
        cell({ grow: 1, backgroundColor: palette.background.topbarStandard, padding: 8 })(
            text({ bold: true, fontSize: 10, fontColor: palette.text.primary })(sample.caption + "  ·  " + sample.type)
        )
    );
    const addHeader = cell({ grow: 0, backgroundColor: palette.background.topbarStandard, padding: 8 })(
        text({ bold: true, fontSize: 10, fontColor: palette.text.data })("+")
    );
    const headerRow = rowLayout({ columnSize: "fixed" })(
        ...extraHeaders,
        ...startColumns.map(column => staticHeader(column, indexOf(column))),
        ...dynamicHeaders,
        ...endColumns.map(column => staticHeader(column, indexOf(column))),
        addHeader
    );
    const filterRow = values.showHeaderFilters
        ? [
              rowLayout({ columnSize: "fixed" })(
                  ...extraCells.map(() => cell({ grow: 0, padding: 8 })(text({ fontSize: 10 })(" "))),
                  ...startColumns.map(column =>
                      cell({ grow: staticGrow(column), padding: 6 })(
                          text({ fontSize: 10, fontColor: palette.text.secondary })(
                              column.staticFilterable && column.staticType !== "customContent" ? "[ filter ]" : ""
                          )
                      )
                  ),
                  ...SAMPLE_COLUMNS.map(() =>
                      cell({ grow: 1, padding: 6 })(
                          text({ fontSize: 10, fontColor: palette.text.secondary })("[ filter ]")
                      )
                  ),
                  ...endColumns.map(column =>
                      cell({ grow: staticGrow(column), padding: 6 })(
                          text({ fontSize: 10, fontColor: palette.text.secondary })(
                              column.staticFilterable && column.staticType !== "customContent" ? "[ filter ]" : ""
                          )
                      )
                  ),
                  cell({ grow: 0, padding: 8 })(text({ fontSize: 10 })(" "))
              )
          ]
        : [];
    const dataRow = rowLayout({ columnSize: "fixed" })(
        ...extraCells,
        ...startColumns.map(staticBody),
        ...SAMPLE_COLUMNS.map(() =>
            cell({ grow: 1, padding: 8 })(
                text({ fontSize: 10, fontColor: palette.text.secondary })("[" + (values.rowData || "Row data") + "]")
            )
        ),
        ...endColumns.map(staticBody),
        cell({ grow: 0, padding: 8 })(text({ fontSize: 10 })(" "))
    );
    const totalsRow = values.showTotals
        ? [
              rowLayout({ columnSize: "fixed", backgroundColor: palette.background.containerFill })(
                  ...extraCells.map(() => cell({ grow: 0, padding: 8 })(text({ fontSize: 10 })(" "))),
                  ...startColumns.map(column =>
                      cell({ grow: staticGrow(column), padding: 8 })(text({ fontSize: 10 })(" "))
                  ),
                  ...SAMPLE_COLUMNS.map((_sample, index) =>
                      cell({ grow: 1, padding: 8 })(
                          text({ fontSize: 10, bold: true, fontColor: palette.text.primary })(
                              index === 2 ? "SUM [total]" : ""
                          )
                      )
                  ),
                  ...endColumns.map(column =>
                      cell({ grow: staticGrow(column), padding: 8 })(text({ fontSize: 10 })(" "))
                  ),
                  cell({ grow: 0, padding: 8 })(text({ fontSize: 10 })(" "))
              )
          ]
        : [];
    const emptyRow =
        values.emptyPlaceholder.widgetCount > 0
            ? [
                  rowLayout({ columnSize: "fixed", borders: true })(
                      dropZone(values.emptyPlaceholder, "Empty placeholder", modernStudio)
                  )
              ]
            : [];
    const footer = rowLayout({ columnSize: "fixed", borders: true, padding: 6 })(
        container({ grow: 1 })(
            text({ fontSize: 10, fontColor: palette.text.secondary })(
                values.showStatusBar ? "[count] rows  ·  All changes saved" : ""
            )
        ),
        container({ grow: 0 })(
            text({ fontSize: 10, fontColor: palette.text.secondary })(
                values.pagination === "buttons" ? "«  ‹   1 to " + (values.pageSize || 50) + " of [total]   ›  »" : ""
            )
        )
    );
    const datasourceHeader: StructurePreviewProps[] = modernStudio
        ? [{ type: "Datasource", property: values.rowsSource }]
        : [];
    const columnsHeader: StructurePreviewProps[] = modernStudio
        ? [{ type: "Datasource", property: values.columnsSource }]
        : [];

    return container()(
        titleBar,
        ...columnsHeader,
        ...datasourceHeader,
        toolbar,
        headerRow,
        ...filterRow,
        dataRow,
        dataRow,
        dataRow,
        ...totalsRow,
        ...emptyRow,
        footer
    );
}

export function getCustomCaption(values: MxDynamicGridPreviewProps): string {
    const source = values.rowsSource as { caption?: string } | null;
    return (source && source.caption) || "MxDynamicGrid";
}

export function getProperties(values: MxDynamicGridPreviewProps, defaultProperties: Properties): Properties {
    values.staticColumns.forEach((column, index) => {
        const hidden: StaticKey[] = [];
        if (column.staticType !== "attribute") {
            hidden.push("staticAttribute", "staticEditable", "staticAttributeName", "staticSortable");
        } else if (!column.staticEditable) {
            hidden.push("staticAttributeName");
        }
        if (column.staticType !== "dynamicText") {
            hidden.push("staticText");
        }
        if (column.staticType !== "customContent") {
            hidden.push("staticContent");
        } else {
            hidden.push("staticFilterable");
        }
        hideNestedPropertiesIn(defaultProperties, values, "staticColumns", index, hidden);
    });
    if (values.dataMode === "client") {
        hidePropertiesIn(defaultProperties, values, ["searchAttribute", "viewState", "totalCount", "clientThreshold"]);
    } else if (values.dataMode === "server") {
        hidePropertyIn(defaultProperties, values, "clientThreshold");
    }
    if (!values.viewState) {
        hidePropertyIn(defaultProperties, values, "totalCount");
    }
    if (!values.showViewBar) {
        hidePropertiesIn(defaultProperties, values, [
            "showHideFieldsButton",
            "showFilterButton",
            "showSortButton",
            "showGroupButton",
            "showColorButton",
            "showRowHeightButton",
            "showMoreMenu",
            "showExportButton",
            "showNewRowButton"
        ]);
    } else if (!values.enableGrouping) {
        hidePropertyIn(defaultProperties, values, "showGroupButton");
    }
    if (values.saveMode === "manual") {
        hidePropertyIn(defaultProperties, values, "saveDelay");
    }
    if (values.selection === "None") {
        hidePropertiesIn(defaultProperties, values, ["selectAllPages"]);
    }
    if (!values.rangeSelection) {
        hidePropertyIn(defaultProperties, values, "fillHandle");
    }
    if (values.pagination !== "buttons") {
        hidePropertyIn(defaultProperties, values, "pageSizeOptions");
    }
    if (values.exportFormats === "none") {
        hidePropertiesIn(defaultProperties, values, [
            "exportFileName",
            "exportSheetName",
            "exportTitle",
            "exportGridColors",
            "csvDelimiter",
            "csvBom",
            "csvDates",
            "beforeExport",
            "afterExport"
        ]);
    } else if (values.exportFormats === "excel") {
        hidePropertiesIn(defaultProperties, values, ["csvDelimiter", "csvBom", "csvDates"]);
    } else if (values.exportFormats === "csv") {
        hidePropertiesIn(defaultProperties, values, ["exportSheetName", "exportTitle", "exportGridColors"]);
    }
    if (!values.personalization) {
        hidePropertyIn(defaultProperties, values, "onPersonalizationChange");
    }
    if (!values.views) {
        hidePropertiesIn(defaultProperties, values, ["onViewsChange", "viewOwner"]);
    }
    return defaultProperties;
}

export function check(values: MxDynamicGridPreviewProps): Problem[] {
    const errors: Problem[] = [];
    const editing = Boolean(values.changeSet) || Boolean(values.onSave);
    if (editing && !values.changeSet) {
        errors.push({
            property: "changeSet",
            severity: "error",
            message:
                "Editing needs a Change set attribute: the widget writes the change set JSON there before On save runs."
        });
    }
    if (editing && !values.onSave) {
        errors.push({
            property: "onSave",
            severity: "error",
            message:
                "Editing needs an On save action that applies the change set (see the README for the JSON contract)."
        });
    }
    if (!editing) {
        errors.push({
            property: "changeSet",
            severity: "warning",
            message: "No Change set attribute and On save action: the grid is read-only."
        });
    }
    if ((values.result || values.version) && !editing) {
        errors.push({
            property: "result",
            severity: "warning",
            message: "Result and Version are only used when editing is configured."
        });
    }
    if (values.dataMode !== "client" && values.viewState && !values.totalCount) {
        errors.push({
            property: "totalCount",
            severity: "warning",
            message:
                "With a View state the data source pages itself; set Total count so the pager and status bar know the number of rows."
        });
    }
    if (values.dataMode === "auto" && values.clientThreshold !== null && values.clientThreshold < 1) {
        errors.push({
            property: "clientThreshold",
            severity: "error",
            message: "The client threshold must be at least 1."
        });
    }
    if (values.saveMode === "auto" && values.saveDelay !== null && values.saveDelay < 0) {
        errors.push({ property: "saveDelay", severity: "error", message: "The auto save delay cannot be negative." });
    }
    if (values.pageSize !== null && values.pageSize < 1) {
        errors.push({ property: "pageSize", severity: "error", message: "The page size must be at least 1." });
    }
    if (values.pagination === "buttons" && values.pageSizeOptions) {
        const parts = values.pageSizeOptions.split(",");
        const invalid = parts.some(part => {
            const n = Number(part.trim());
            return !(n > 0) || Math.floor(n) !== n;
        });
        if (invalid) {
            errors.push({
                property: "pageSizeOptions",
                severity: "error",
                message: "Page size options must be whole numbers separated by commas, for example 25,50,100."
            });
        }
    }
    if (values.exportFileName && values.exportFileName.indexOf("{") >= 0) {
        errors.push({
            property: "exportFileName",
            severity: "warning",
            message: "Use [date] (square brackets) for the date token."
        });
    }
    values.staticColumns.forEach((column, index) => {
        if (column.staticType === "attribute" && !column.staticAttribute) {
            errors.push({
                property: "staticColumns/" + (index + 1) + "/staticAttribute",
                severity: "error",
                message: "Static column " + (index + 1) + ": select an attribute."
            });
        }
        if (column.staticType === "dynamicText" && !column.staticText) {
            errors.push({
                property: "staticColumns/" + (index + 1) + "/staticText",
                severity: "error",
                message: "Static column " + (index + 1) + ": enter a dynamic text."
            });
        }
    });
    return errors;
}
