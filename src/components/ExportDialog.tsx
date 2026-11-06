import { ReactElement, useState } from "react";

import { Icon } from "./Icon";
import { Dialog } from "./Popover";
import { Texts } from "../utils/texts";

export type ExportFormat = "xlsx" | "csv";
export type ExportColumns = "visible" | "all";
export type ExportRows = "all" | "filtered" | "selected";

export interface ExportChoice {
    format: ExportFormat;
    columns: ExportColumns;
    rows: ExportRows;
    /** Excel only: write the grid's colour code into the cells. */
    keepColors: boolean;
}

export function ExportDialog({
    texts: t,
    formats,
    selectedCount,
    filtered,
    keepColors = true,
    onExport,
    onClose
}: {
    texts: Texts;
    formats: ExportFormat[];
    selectedCount: number;
    filtered: boolean;
    keepColors?: boolean;
    onExport: (choice: ExportChoice) => void;
    onClose: () => void;
}): ReactElement {
    const [choice, setChoice] = useState<ExportChoice>({
        format: formats[0],
        columns: "visible",
        rows: selectedCount > 0 ? "selected" : filtered ? "filtered" : "all",
        keepColors
    });
    const radio = <K extends keyof ExportChoice>(
        key: K,
        value: ExportChoice[K],
        label: string,
        disabled = false
    ): ReactElement => (
        <label
            className={`mxt-dg-choice${choice[key] === value ? " is-selected" : ""}${disabled ? " is-disabled" : ""}`}
        >
            <input
                type="radio"
                name={`mxt-dg-export-${key}`}
                value={String(value)}
                checked={choice[key] === value}
                disabled={disabled}
                onChange={() => setChoice(previous => ({ ...previous, [key]: value }))}
            />
            {label}
        </label>
    );
    return (
        <Dialog
            title={t.textExport}
            onClose={onClose}
            width={460}
            footer={
                <>
                    <button type="button" className="btn btn-default mxt-dg-btn" onClick={onClose}>
                        {t.textCancel}
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary mxt-dg-btn"
                        data-action="do-export"
                        onClick={() => onExport(choice)}
                    >
                        <Icon name="download" size={14} /> {t.textDownload}
                    </button>
                </>
            }
        >
            {formats.length > 1 && (
                <fieldset className="mxt-dg-choices mxt-dg-choices--cards">
                    <label className={`mxt-dg-card${choice.format === "xlsx" ? " is-selected" : ""}`}>
                        <input
                            type="radio"
                            name="mxt-dg-export-format"
                            checked={choice.format === "xlsx"}
                            onChange={() => setChoice(p => ({ ...p, format: "xlsx" }))}
                        />
                        <Icon name="excel" size={22} />
                        {t.textExportExcel}
                    </label>
                    <label className={`mxt-dg-card${choice.format === "csv" ? " is-selected" : ""}`}>
                        <input
                            type="radio"
                            name="mxt-dg-export-format"
                            checked={choice.format === "csv"}
                            onChange={() => setChoice(p => ({ ...p, format: "csv" }))}
                        />
                        <Icon name="csv" size={22} />
                        {t.textExportCsv}
                    </label>
                </fieldset>
            )}
            <fieldset className="mxt-dg-choices">
                <legend>{t.textExportColumns}</legend>
                {radio("columns", "visible", t.textVisibleColumns)}
                {radio("columns", "all", t.textAllColumns)}
            </fieldset>
            <fieldset className="mxt-dg-choices">
                <legend>{t.textExportRows}</legend>
                {radio("rows", "all", t.textAllRows)}
                {radio("rows", "filtered", t.textFilteredRows, !filtered)}
                {radio("rows", "selected", `${t.textSelectedRows} (${selectedCount})`, selectedCount === 0)}
            </fieldset>
            {choice.format === "xlsx" && (
                <label className="mxt-dg-check mxt-dg-export-colors">
                    <input
                        type="checkbox"
                        data-option="keep-colors"
                        checked={choice.keepColors}
                        onChange={event => {
                            const checked = event.target.checked;
                            setChoice(previous => ({ ...previous, keepColors: checked }));
                        }}
                    />
                    {t.textKeepGridColors}
                </label>
            )}
        </Dialog>
    );
}
