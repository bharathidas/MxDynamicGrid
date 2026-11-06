import { CSSProperties, ReactElement } from "react";
import { Selectable } from "mendix/preview/Selectable";

import { MxDynamicGridPreviewProps, StaticColumnsPreviewType } from "../typings/MxDynamicGridProps";
import { SAMPLE_COLUMNS, staticCaption, staticCellText } from "./MxDynamicGrid.editorConfig";

/**
 * Design-mode preview. Reuses the Data Grid 2 markup and classes (widget-datagrid, th, td, pagination-bar), so the
 * Atlas theme styles it like a Data Grid 2, and adds sample dynamic columns with type badges.
 */

const PREVIEW_CSS = `
.widget-datagrid.mxt-dg-preview .table .th { z-index: unset; }
.widget-datagrid.mxt-dg-preview .mxt-dg-pv-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 8px 0; }
.widget-datagrid.mxt-dg-preview .mxt-dg-pv-toolbar .form-control { max-width: 240px; }
.widget-datagrid.mxt-dg-preview .mxt-dg-pv-toolbar .btn { margin: 0; }
.widget-datagrid.mxt-dg-preview .mxt-dg-pv-buttons { display: flex; gap: 6px; margin-left: auto; }
.widget-datagrid.mxt-dg-preview .mxt-dg-pv-badge { display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 8px; font-size: 10px; font-weight: 500; background: #e8ecfc; color: #264ae5; }
.widget-datagrid.mxt-dg-preview .mxt-dg-pv-chip { display: inline-block; padding: 0 8px; border-radius: 10px; font-size: 12px; background: #dcfce7; color: #14532d; }
.widget-datagrid.mxt-dg-preview .mxt-dg-pv-add { justify-content: center; color: #264ae5; font-weight: 700; }
.widget-datagrid.mxt-dg-preview .td-number { justify-content: flex-end; text-align: right; }
.widget-datagrid.mxt-dg-preview .tr.tr-preview:nth-last-child(2) > .td { opacity: 0.55; }
.widget-datagrid.mxt-dg-preview .tr.tr-preview:last-child > .td { opacity: 0.25; }
.widget-datagrid.mxt-dg-preview .tr-totals > .td { font-weight: 600; background: #f7f8fa; }
.widget-datagrid.mxt-dg-preview .filter .form-control { height: 26px; padding: 2px 6px; font-size: 12px; }
.widget-datagrid.mxt-dg-preview .mxt-dg-pv-addrow { border: 1px dashed #ced0d3; border-radius: 6px; padding: 6px 10px; color: #6b707b; margin-top: 6px; }
.widget-datagrid.mxt-dg-preview .mxt-dg-pv-status { display: flex; gap: 16px; font-size: 12px; color: #6b707b; padding: 6px 0; }
.widget-datagrid.mxt-dg-preview.mxt-dg-pv-dark { background: #1d2027; color: #e6e8ee; }
.widget-datagrid.mxt-dg-preview.mxt-dg-pv-dark .th, .widget-datagrid.mxt-dg-preview.mxt-dg-pv-dark .td { background: #1d2027; color: #e6e8ee; border-color: #353a46; }
.widget-datagrid.mxt-dg-preview.mxt-dg-pv-dark .th { background: #252932; }
.widget-datagrid.mxt-dg-preview.mxt-dg-pv-dark .mxt-dg-pv-badge { background: #2d3555; color: #9db1ff; }
`;

const SAMPLE_VALUES = [
    ["Acme Corp", "Active", "€ 1,250.00", "29 Oct 2026"],
    ["Globex", "Pending", "€ 980.50", "4 Nov 2026"],
    ["Initech", "Active", "€ 3,410.00", "12 Nov 2026"]
];

function cssWidth(column: StaticColumnsPreviewType): string {
    return `${column.staticWidth || 160}px`;
}

function StaticCell({ column }: { column: StaticColumnsPreviewType }): ReactElement {
    if (column.staticType === "customContent") {
        const Content = column.staticContent.renderer;
        return (
            <Content caption="Custom content">
                <div style={{ flexGrow: 1 }} />
            </Content>
        );
    }
    return <span className="td-text">{staticCellText(column)}</span>;
}

export function preview(props: MxDynamicGridPreviewProps): ReactElement {
    const start = props.staticColumns.filter(column => column.staticPosition !== "end");
    const end = props.staticColumns.filter(column => column.staticPosition === "end");
    const hasSelection = props.selection !== "None" && props.showCheckboxes;
    const widths: string[] = [];
    if (hasSelection) {
        widths.push("44px");
    }
    if (props.showRowNumbers) {
        widths.push("52px");
    }
    widths.push(...start.map(cssWidth), ...SAMPLE_COLUMNS.map(() => "1fr"), ...end.map(cssWidth), "48px");
    const gridStyle = { "--widgets-grid-template-columns": widths.join(" ") } as CSSProperties;
    const span = widths.length;
    const EmptyPlaceholder = props.emptyPlaceholder.renderer;
    const dark = props.colorScheme === "dark";

    const staticHeader = (column: StaticColumnsPreviewType): ReactElement => {
        const index = props.staticColumns.indexOf(column);
        return (
            <Selectable key={`s${index}`} object={column} caption={staticCaption(column, index)}>
                <div className="th" role="columnheader">
                    <div className="column-container">
                        <div className="column-header">
                            <span>{staticCaption(column, index)}</span>
                        </div>
                        {props.showHeaderFilters && (
                            <div
                                className="filter"
                                style={
                                    column.staticFilterable && column.staticType !== "customContent"
                                        ? undefined
                                        : { visibility: "hidden" }
                                }
                            >
                                <input className="form-control" readOnly value="" />
                            </div>
                        )}
                    </div>
                </div>
            </Selectable>
        );
    };

    return (
        <div
            className={`widget-datagrid mxt-dg-preview${dark ? " mxt-dg-pv-dark" : ""} ${props.class ?? ""}`}
            style={props.styleObject}
        >
            <div className="widget-datagrid-header header-filters mxt-dg-pv-toolbar">
                {props.showSearch && <input className="form-control" readOnly value="" placeholder="Search..." />}
                <div className="mxt-dg-pv-buttons">
                    <button className="btn btn-primary">+ Add row</button>
                    {props.enableGrouping && <button className="btn btn-default">Group by</button>}
                    {props.showColumnsPanel && <button className="btn btn-default">Columns</button>}
                    {props.allowImport && <button className="btn btn-default">Import</button>}
                    {props.exportFormats !== "none" && <button className="btn btn-default">Export</button>}
                </div>
            </div>
            <div className="widget-datagrid-content">
                <div className="widget-datagrid-grid table" style={gridStyle}>
                    <div className="widget-datagrid-grid-head">
                        <div className="tr">
                            {hasSelection && (
                                <div className="th widget-datagrid-col-select" role="columnheader">
                                    {props.selection === "Multi" ? <input type="checkbox" readOnly /> : null}
                                </div>
                            )}
                            {props.showRowNumbers && (
                                <div className="th" role="columnheader">
                                    <div className="column-container">
                                        <div className="column-header">
                                            <span>#</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {start.map(staticHeader)}
                            {SAMPLE_COLUMNS.map(sample => (
                                <div key={sample.caption} className="th" role="columnheader">
                                    <div className="column-container">
                                        <div className="column-header">
                                            <span>{sample.caption}</span>
                                            <span className="mxt-dg-pv-badge">{sample.type}</span>
                                        </div>
                                        {props.showHeaderFilters && (
                                            <div className="filter">
                                                <input className="form-control" readOnly value="" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {end.map(staticHeader)}
                            <div className="th mxt-dg-pv-add" role="columnheader">
                                <div className="column-container">
                                    <div className="column-header mxt-dg-pv-add">
                                        <span>+</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="widget-datagrid-grid-body table-content">
                        {SAMPLE_VALUES.map((values, row) => (
                            <div key={row} className="tr tr-preview">
                                {hasSelection && (
                                    <div className={`td widget-datagrid-col-select${row === 0 ? " td-borders" : ""}`}>
                                        <input type="checkbox" readOnly />
                                    </div>
                                )}
                                {props.showRowNumbers && (
                                    <div className={`td${row === 0 ? " td-borders" : ""}`}>
                                        <span className="td-text">{row + 1}</span>
                                    </div>
                                )}
                                {start.map(column => (
                                    <div
                                        key={`s${props.staticColumns.indexOf(column)}`}
                                        className={`td${row === 0 ? " td-borders" : ""}`}
                                    >
                                        <StaticCell column={column} />
                                    </div>
                                ))}
                                {values.map((value, index) => (
                                    <div
                                        key={index}
                                        className={`td${row === 0 ? " td-borders" : ""}${
                                            index === 2 ? " td-number" : ""
                                        }`}
                                    >
                                        {index === 1 ? (
                                            <span className="mxt-dg-pv-chip">{value}</span>
                                        ) : (
                                            <span className="td-text">{value}</span>
                                        )}
                                    </div>
                                ))}
                                {end.map(column => (
                                    <div
                                        key={`e${props.staticColumns.indexOf(column)}`}
                                        className={`td${row === 0 ? " td-borders" : ""}`}
                                    >
                                        <StaticCell column={column} />
                                    </div>
                                ))}
                                <div className="td" />
                            </div>
                        ))}
                        {props.showTotals && (
                            <div className="tr tr-totals">
                                {hasSelection && <div className="td" />}
                                {props.showRowNumbers && <div className="td" />}
                                {start.map((_, i) => (
                                    <div key={`ts${i}`} className="td" />
                                ))}
                                {SAMPLE_COLUMNS.map((sample, index) => (
                                    <div key={sample.caption} className={`td${index === 2 ? " td-number" : ""}`}>
                                        <span className="td-text">{index === 2 ? "SUM € 5,640.50" : ""}</span>
                                    </div>
                                ))}
                                {end.map((_, i) => (
                                    <div key={`te${i}`} className="td" />
                                ))}
                                <div className="td" />
                            </div>
                        )}
                        <EmptyPlaceholder caption="Empty placeholder: widgets shown when there are no rows">
                            <div className="td" style={{ gridColumn: `span ${span}` }} />
                        </EmptyPlaceholder>
                    </div>
                </div>
            </div>
            <div className="mxt-dg-pv-addrow">+ Add row</div>
            <div className="widget-datagrid-footer table-footer">
                {props.showStatusBar && (
                    <div className="mxt-dg-pv-status">
                        <span>3 rows</span>
                        <span>All changes saved</span>
                    </div>
                )}
                {props.pagination === "buttons" && (
                    <div className="widget-datagrid-paging-bottom">
                        <div className="widget-datagrid-pb-end">
                            <div aria-label="Pagination" className="pagination-bar">
                                <button className="btn pagination-button" disabled>
                                    «
                                </button>
                                <div className="paging-status">1 to {props.pageSize ?? 50} of [total]</div>
                                <button className="btn pagination-button">»</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export function getPreviewCss(): string {
    return PREVIEW_CSS;
}
