import { CSSProperties, ReactElement, useRef, useState } from "react";

import { CellView } from "./CellRenderers";
import { Icon } from "./Icon";
import { typeInfo } from "../utils/columnTypes";
import { aggregate, AggregateFn } from "../utils/pipeline";
import { fill, summaryLabel, Texts } from "../utils/texts";
import { formatValue, isEmpty } from "../utils/values";
import { CellValue, ColumnDef, RowRecord } from "../utils/types";

/** Kanban board: one lane per option of a single-select field; drag cards between lanes (a setCell). */

export interface BoardProps {
    texts: Texts;
    rows: RowRecord[];
    columns: ColumnDef[];
    laneCol?: string;
    fields: string[];
    summary?: { col: string; fn: AggregateFn };
    canEdit: (rowKey: string) => boolean;
    canAdd: boolean;
    onMove: (rowKey: string, value: CellValue) => void;
    onOpen: (rowKey: string) => void;
    onAdd: (values: Record<string, CellValue>) => void;
    rowColor: (row: RowRecord) => string | undefined;
}

export function BoardView(props: BoardProps): ReactElement {
    const { texts: t, rows, columns } = props;
    const lane = columns.find(c => c.key === props.laneCol && c.type === "select");
    const [dragKey, setDragKeyState] = useState<string | undefined>();
    // A ref as well as state: drag events can arrive before React re-renders.
    const dragRef = useRef<string | undefined>(undefined);
    const setDragKey = (key: string | undefined): void => {
        dragRef.current = key;
        setDragKeyState(key);
    };
    const [over, setOver] = useState<string | undefined>();
    if (!lane) {
        return (
            <div className="mxt-dg-altview mxt-dg-altview--empty" data-view="board">
                <Icon name="board" size={28} />
                <p>{t.textNeedSelectField}</p>
            </div>
        );
    }
    const primary = columns[0];
    const cardFields = props.fields
        .map(key => columns.find(c => c.key === key))
        .filter((c): c is ColumnDef => Boolean(c) && c !== primary);
    const lanes: Array<{ value: string; label: string; color?: string }> = [
        ...lane.options.map(option => ({ value: option.value, label: option.label, color: option.color })),
        { value: "", label: t.textNoStatus }
    ];
    const byLane = new Map<string, RowRecord[]>();
    lanes.forEach(l => byLane.set(l.value, []));
    rows.forEach(row => {
        const value = row.values[lane.key];
        const key = isEmpty(value) || !byLane.has(String(value)) ? "" : String(value);
        byLane.get(key)?.push(row);
    });
    const summaryCol = props.summary ? columns.find(c => c.key === props.summary?.col) : undefined;
    return (
        <div className="mxt-dg-altview mxt-dg-board" data-view="board">
            {lanes.map(l => {
                const laneRows = byLane.get(l.value) ?? [];
                if (l.value === "" && laneRows.length === 0) {
                    return null;
                }
                const sum = summaryCol && props.summary ? aggregate(laneRows, summaryCol, props.summary.fn) : null;
                return (
                    <section
                        key={l.value || "__none"}
                        className={`mxt-dg-lane${over === l.value ? " is-over" : ""}`}
                        data-lane={l.value || "none"}
                        style={{ "--mxt-dg-lane": l.color ?? "var(--mxt-dg-border)" } as CSSProperties}
                        onDragOver={event => {
                            if (dragRef.current) {
                                event.preventDefault();
                                setOver(l.value);
                            }
                        }}
                        onDragLeave={() => setOver(undefined)}
                        onDrop={event => {
                            event.preventDefault();
                            setOver(undefined);
                            const key = dragRef.current || event.dataTransfer?.getData("text/plain");
                            if (key) {
                                props.onMove(key, l.value || null);
                            }
                            setDragKey(undefined);
                        }}
                    >
                        <header className="mxt-dg-lane__head">
                            <span className="mxt-dg-chip" style={{ ["--mxt-dg-chip" as string]: l.color }}>
                                {l.label}
                            </span>
                            <span className="mxt-dg-lane__count">{laneRows.length}</span>
                            {summaryCol && sum !== null && props.summary && (
                                <span className="mxt-dg-lane__sum" title={summaryCol.caption}>
                                    {summaryLabel(t, props.summary.fn)}{" "}
                                    {typeof sum === "number" ? formatValue(summaryCol, sum) : String(sum)}
                                </span>
                            )}
                        </header>
                        <div className="mxt-dg-lane__cards">
                            {laneRows.map(row => {
                                const editable = props.canEdit(row.key);
                                const color = props.rowColor(row);
                                return (
                                    <article
                                        key={row.key}
                                        className={`mxt-dg-card2${dragKey === row.key ? " is-dragging" : ""}`}
                                        data-card={row.key}
                                        draggable={editable}
                                        tabIndex={0}
                                        style={color ? ({ "--mxt-dg-card-accent": color } as CSSProperties) : undefined}
                                        onDragStart={event => {
                                            setDragKey(row.key);
                                            event.dataTransfer.effectAllowed = "move";
                                            event.dataTransfer.setData("text/plain", row.key);
                                        }}
                                        onDragEnd={() => setDragKey(undefined)}
                                        onClick={() => props.onOpen(row.key)}
                                        onKeyDown={event => event.key === "Enter" && props.onOpen(row.key)}
                                    >
                                        <h4 className="mxt-dg-card2__title">
                                            {primary ? formatValue(primary, row.values[primary.key]) || "—" : row.key}
                                        </h4>
                                        {cardFields.map(field =>
                                            isEmpty(row.values[field.key]) ? null : (
                                                <div key={field.key} className="mxt-dg-card2__field">
                                                    <span className="mxt-dg-card2__label">
                                                        <Icon name={typeInfo(field.type).icon} size={11} />{" "}
                                                        {field.caption}
                                                    </span>
                                                    <span className="mxt-dg-card2__value">
                                                        <CellView column={field} value={row.values[field.key]} />
                                                    </span>
                                                </div>
                                            )
                                        )}
                                    </article>
                                );
                            })}
                        </div>
                        {props.canAdd && (
                            <button
                                type="button"
                                className="mxt-dg-lane__add"
                                data-action="lane-add"
                                onClick={() => props.onAdd({ [lane.key]: l.value || null })}
                            >
                                <Icon name="plus" size={13} /> {t.textNewRow}
                            </button>
                        )}
                    </section>
                );
            })}
            <span className="mxt-dg-sr">{fill(t.textRows, { count: rows.length })}</span>
        </div>
    );
}
