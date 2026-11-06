import { ReactElement, useMemo, useState } from "react";

import { Icon } from "./Icon";
import { Dialog } from "./Popover";
import { newKey } from "../utils/changeSet";
import { isSystemType, typeInfo } from "../utils/columnTypes";
import { guessType, readTable } from "../utils/importer";
import { fill, Texts, typeLabel } from "../utils/texts";
import { newOption, parseInput } from "../utils/values";
import { CellValue, COLUMN_TYPES, ColumnDef, ColumnType, SelectOption } from "../utils/types";

/** Import rows from a CSV/XLSX file with a column mapping that can create missing fields. */

export interface ImportResult {
    newColumns: ColumnDef[];
    optionUpdates: Array<{ col: string; options: SelectOption[] }>;
    rows: Array<Record<string, CellValue>>;
}

type Target = { kind: "skip" } | { kind: "existing"; key: string } | { kind: "new"; type: ColumnType };

export interface ImportPlanInput {
    header: string[];
    body: string[][];
    targets: Target[];
    columns: ColumnDef[];
}

function blank(key: string, caption: string, type: ColumnType): ColumnDef {
    return {
        key,
        caption,
        type,
        order: 0,
        pinned: null,
        hidden: false,
        required: false,
        readOnly: false,
        options: [],
        format: "",
        formula: "",
        headerGroup: "",
        description: "",
        validation: {},
        canEdit: true
    };
}

/** Turns the parsed file and the mapping into new columns and row values (pure, unit tested). */
export function planImport(input: ImportPlanInput, makeKey: () => string = newKey): ImportResult {
    const newColumns: ColumnDef[] = [];
    const targetColumns: Array<ColumnDef | undefined> = input.targets.map((target, index) => {
        if (target.kind === "existing") {
            const column = input.columns.find(c => c.key === target.key);
            return column ? { ...column, options: [...column.options] } : undefined;
        }
        if (target.kind === "new") {
            const column = blank(makeKey(), input.header[index] || `Field ${index + 1}`, target.type);
            newColumns.push(column);
            return column;
        }
        return undefined;
    });
    const optionUpdates = new Map<string, SelectOption[]>();
    const rows = input.body
        .filter(line => line.some(cell => cell.trim() !== ""))
        .map(line => {
            const values: Record<string, CellValue> = {};
            targetColumns.forEach((column, index) => {
                if (!column) {
                    return;
                }
                const parsed = parseInput(column, line[index] ?? "", { allowNewOptions: true });
                if (!parsed.ok) {
                    return;
                }
                parsed.newOptions?.forEach(option => {
                    if (!column.options.some(o => o.value === option.value)) {
                        column.options.push(newOption(option.label, column.options.length));
                        if (!newColumns.includes(column)) {
                            optionUpdates.set(column.key, column.options);
                        }
                    }
                });
                if (parsed.value !== null) {
                    values[column.key] = parsed.value;
                }
            });
            return values;
        });
    newColumns.forEach((column, i) => {
        const updated = targetColumns.find(c => c?.key === column.key);
        if (updated) {
            newColumns[i] = updated;
        }
    });
    return {
        newColumns,
        optionUpdates: Array.from(optionUpdates.entries()).map(([col, options]) => ({ col, options })),
        rows
    };
}

export function ImportDialog({
    texts: t,
    columns,
    canCreateColumns,
    onImport,
    onClose
}: {
    texts: Texts;
    columns: ColumnDef[];
    canCreateColumns: boolean;
    onImport: (result: ImportResult) => void;
    onClose: () => void;
}): ReactElement {
    const [table, setTable] = useState<string[][] | undefined>();
    const [fileName, setFileName] = useState("");
    const [error, setError] = useState("");
    const [hasHeader, setHasHeader] = useState(true);
    const [targets, setTargets] = useState<Target[]>([]);
    const editable = columns.filter(column => !isSystemType(column.type));

    const header = useMemo(
        () => (table ? (hasHeader ? table[0] ?? [] : (table[0] ?? []).map((_, i) => `Column ${i + 1}`)) : []),
        [table, hasHeader]
    );
    const body = useMemo(() => (table ? (hasHeader ? table.slice(1) : table) : []), [table, hasHeader]);

    const autoMap = (rows: string[][], withHeader: boolean): Target[] => {
        const head = withHeader ? rows[0] ?? [] : [];
        const width = Math.max(0, ...rows.map(r => r.length));
        return Array.from({ length: width }, (_, i) => {
            const name = (head[i] ?? "").trim().toLowerCase();
            const match = editable.find(
                column => column.caption.trim().toLowerCase() === name || column.key.toLowerCase() === name
            );
            if (match) {
                return { kind: "existing", key: match.key };
            }
            if (canCreateColumns) {
                return { kind: "new", type: guessType(rows.slice(withHeader ? 1 : 0).map(r => r[i] ?? "")) };
            }
            return { kind: "skip" };
        });
    };

    const onFile = async (file: File | undefined): Promise<void> => {
        if (!file) {
            return;
        }
        setError("");
        try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const rows = readTable(bytes);
            setTable(rows);
            setFileName(file.name);
            setTargets(autoMap(rows, hasHeader));
        } catch {
            setError(t.textImportFailed);
        }
    };

    const valueOf = (target: Target): string =>
        target.kind === "skip" ? "skip" : target.kind === "existing" ? `col:${target.key}` : `new:${target.type}`;
    const result = useMemo(
        () => (table ? planImport({ header, body, targets, columns }) : undefined),
        [table, header, body, targets, columns]
    );

    return (
        <Dialog
            title={t.textImportTitle}
            onClose={onClose}
            width={640}
            className="mxt-dg-import"
            footer={
                <>
                    <button type="button" className="btn btn-default mxt-dg-btn" onClick={onClose}>
                        {t.textCancel}
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary mxt-dg-btn"
                        data-action="do-import"
                        disabled={!result || !result.rows.length}
                        onClick={() => result && onImport(result)}
                    >
                        <Icon name="upload" size={14} /> {fill(t.textImportRun, { count: result?.rows.length ?? 0 })}
                    </button>
                </>
            }
        >
            <label className="mxt-dg-dropzone">
                <Icon name="upload" size={22} />
                <span>{fileName || t.textImportPick}</span>
                <input
                    type="file"
                    accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={event => {
                        onFile(event.target.files?.[0]).catch(() => setError(t.textImportFailed));
                    }}
                />
            </label>
            {error && <p className="mxt-dg-field__error">{error}</p>}
            {table && (
                <>
                    <label className="mxt-dg-check">
                        <input
                            type="checkbox"
                            checked={hasHeader}
                            onChange={event => {
                                setHasHeader(event.target.checked);
                                setTargets(autoMap(table, event.target.checked));
                            }}
                        />
                        {t.textImportFirstRowHeader}
                    </label>
                    <table className="mxt-dg-mapping">
                        <thead>
                            <tr>
                                <th>{t.textFieldName}</th>
                                <th>{t.textImportMapTo}</th>
                                <th>…</th>
                            </tr>
                        </thead>
                        <tbody>
                            {header.map((name, index) => (
                                <tr key={index}>
                                    <td>{name}</td>
                                    <td>
                                        <select
                                            className="form-control"
                                            value={valueOf(targets[index] ?? { kind: "skip" })}
                                            aria-label={`${t.textImportMapTo} ${name}`}
                                            onChange={event => {
                                                const v = event.target.value;
                                                const next: Target =
                                                    v === "skip"
                                                        ? { kind: "skip" }
                                                        : v.startsWith("col:")
                                                        ? { kind: "existing", key: v.slice(4) }
                                                        : { kind: "new", type: v.slice(4) as ColumnType };
                                                setTargets(list =>
                                                    list.map((entry, i) => (i === index ? next : entry))
                                                );
                                            }}
                                        >
                                            <option value="skip">{t.textImportSkip}</option>
                                            {editable.map(column => (
                                                <option key={column.key} value={`col:${column.key}`}>
                                                    {column.caption}
                                                </option>
                                            ))}
                                            {canCreateColumns &&
                                                COLUMN_TYPES.filter(type => !typeInfo(type).system).map(type => (
                                                    <option key={type} value={`new:${type}`}>
                                                        + {t.textImportNewField}: {typeLabel(t, type)}
                                                    </option>
                                                ))}
                                        </select>
                                    </td>
                                    <td className="mxt-dg-mapping__sample">
                                        {body
                                            .slice(0, 3)
                                            .map(r => r[index] ?? "")
                                            .filter(Boolean)
                                            .join(", ")}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}
        </Dialog>
    );
}
