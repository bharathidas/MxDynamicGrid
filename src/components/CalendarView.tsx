import { CSSProperties, ReactElement, useRef, useState } from "react";

import { Icon } from "./Icon";
import { Texts } from "../utils/texts";
import { formatValue, isoDate, isoDateTime, toDate } from "../utils/values";
import { CellValue, ColumnDef, RowRecord } from "../utils/types";

/** Month / week calendar by a date field (optionally a start-end range). Drag to reschedule; click a day to add. */

export interface CalendarProps {
    texts: Texts;
    rows: RowRecord[];
    columns: ColumnDef[];
    startCol?: string;
    endCol?: string;
    mode: "month" | "week";
    onMode: (mode: "month" | "week") => void;
    canEdit: (rowKey: string) => boolean;
    canAdd: boolean;
    onMove: (rowKey: string, changes: Record<string, CellValue>) => void;
    onOpen: (rowKey: string) => void;
    onAdd: (values: Record<string, CellValue>) => void;
    rowColor: (row: RowRecord) => string | undefined;
    /** Today, injectable for tests. */
    today?: Date;
}

const DAY = 86400000;

function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function mondayOf(date: Date): Date {
    const d = startOfDay(date);
    return new Date(d.getTime() - ((d.getDay() + 6) % 7) * DAY);
}

function sameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Days shown for the anchor date: 6 full weeks for a month, 7 days for a week. */
export function calendarDays(anchor: Date, mode: "month" | "week"): Date[] {
    const first = mode === "month" ? mondayOf(new Date(anchor.getFullYear(), anchor.getMonth(), 1)) : mondayOf(anchor);
    const count = mode === "month" ? 42 : 7;
    return Array.from({ length: count }, (_, i) => {
        const d = new Date(first);
        d.setDate(first.getDate() + i);
        return d;
    });
}

/** Rows that fall on a day (start date, or within start..end). */
export function rowsOnDay(rows: RowRecord[], startCol: string, endCol: string | undefined, day: Date): RowRecord[] {
    const t = startOfDay(day).getTime();
    return rows.filter(row => {
        const start = toDate(row.values[startCol]);
        if (!start) {
            return false;
        }
        const s = startOfDay(start).getTime();
        const endDate = endCol ? toDate(row.values[endCol]) : undefined;
        const e = endDate ? startOfDay(endDate).getTime() : s;
        return t >= s && t <= Math.max(s, e);
    });
}

export function CalendarView(props: CalendarProps): ReactElement {
    const { texts: t, columns, rows } = props;
    const start = columns.find(c => c.key === props.startCol);
    const end = columns.find(c => c.key === props.endCol);
    const today = props.today ?? new Date();
    const [anchor, setAnchor] = useState(() => startOfDay(today));
    const [, setDragKeyState] = useState<string | undefined>();
    const dragRef = useRef<string | undefined>(undefined);
    const setDragKey = (key: string | undefined): void => {
        dragRef.current = key;
        setDragKeyState(key);
    };
    const [over, setOver] = useState<string | undefined>();
    if (!start) {
        return (
            <div className="mxt-dg-altview mxt-dg-altview--empty" data-view="calendar">
                <Icon name="calendar" size={28} />
                <p>{t.textNeedDateField}</p>
            </div>
        );
    }
    const primary = columns[0];
    const days = calendarDays(anchor, props.mode);
    const title = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(anchor);
    const weekdays = days.slice(0, 7).map(d => new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(d));
    const shift = (delta: number): void => {
        const next = new Date(anchor);
        if (props.mode === "month") {
            next.setMonth(next.getMonth() + delta, 1);
        } else {
            next.setDate(next.getDate() + delta * 7);
        }
        setAnchor(next);
    };
    const toValue = (column: ColumnDef, date: Date, original: unknown): CellValue => {
        if (column.type === "date") {
            return isoDate(date);
        }
        const before = toDate(original);
        const withTime = new Date(date);
        if (before) {
            withTime.setHours(before.getHours(), before.getMinutes(), before.getSeconds());
        }
        return isoDateTime(withTime);
    };
    const drop = (day: Date): void => {
        const row = rows.find(r => r.key === dragRef.current);
        setDragKey(undefined);
        setOver(undefined);
        const from = row ? toDate(row.values[start.key]) : undefined;
        if (!row || !from) {
            return;
        }
        const delta = startOfDay(day).getTime() - startOfDay(from).getTime();
        if (!delta) {
            return;
        }
        const changes: Record<string, CellValue> = { [start.key]: toValue(start, day, row.values[start.key]) };
        const endValue = end ? toDate(row.values[end.key]) : undefined;
        if (end && endValue) {
            changes[end.key] = toValue(end, new Date(startOfDay(endValue).getTime() + delta), row.values[end.key]);
        }
        props.onMove(row.key, changes);
    };
    const maxPerDay = props.mode === "month" ? 3 : 12;
    return (
        <div className={`mxt-dg-altview mxt-dg-cal mxt-dg-cal--${props.mode}`} data-view="calendar">
            <div className="mxt-dg-cal__bar">
                <button
                    type="button"
                    className="mxt-dg-iconbtn"
                    aria-label="Previous"
                    data-action="cal-prev"
                    onClick={() => shift(-1)}
                >
                    <Icon name="chevronLeft" size={15} />
                </button>
                <button type="button" className="mxt-dg-vb-btn" onClick={() => setAnchor(startOfDay(today))}>
                    {t.textToday}
                </button>
                <button
                    type="button"
                    className="mxt-dg-iconbtn"
                    aria-label="Next"
                    data-action="cal-next"
                    onClick={() => shift(1)}
                >
                    <Icon name="chevronRight" size={15} />
                </button>
                <h4 className="mxt-dg-cal__title" data-cal-title>
                    {title}
                </h4>
                <span className="mxt-dg-seg">
                    <button
                        type="button"
                        className={props.mode === "month" ? "is-on" : ""}
                        onClick={() => props.onMode("month")}
                    >
                        {t.textMonth}
                    </button>
                    <button
                        type="button"
                        className={props.mode === "week" ? "is-on" : ""}
                        data-action="cal-week"
                        onClick={() => props.onMode("week")}
                    >
                        {t.textWeek}
                    </button>
                </span>
            </div>
            <div className="mxt-dg-cal__head">
                {weekdays.map(name => (
                    <span key={name}>{name}</span>
                ))}
            </div>
            <div className="mxt-dg-cal__grid">
                {days.map(day => {
                    const id = isoDate(day);
                    const items = rowsOnDay(rows, start.key, end?.key, day);
                    const outside = props.mode === "month" && day.getMonth() !== anchor.getMonth();
                    return (
                        <div
                            key={id}
                            className={`mxt-dg-cal__day${outside ? " is-outside" : ""}${
                                sameDay(day, today) ? " is-today" : ""
                            }${over === id ? " is-over" : ""}`}
                            data-day={id}
                            onDragOver={event => {
                                if (dragRef.current) {
                                    event.preventDefault();
                                    setOver(id);
                                }
                            }}
                            onDragLeave={() => setOver(undefined)}
                            onDrop={event => {
                                event.preventDefault();
                                drop(day);
                            }}
                        >
                            <div className="mxt-dg-cal__daynum">
                                <span>{day.getDate()}</span>
                                {props.canAdd && (
                                    <button
                                        type="button"
                                        className="mxt-dg-cal__add"
                                        aria-label={`${t.textNewRow} ${id}`}
                                        data-action="cal-add"
                                        onClick={() => props.onAdd({ [start.key]: toValue(start, day, null) })}
                                    >
                                        <Icon name="plus" size={12} />
                                    </button>
                                )}
                            </div>
                            {items.slice(0, maxPerDay).map(row => {
                                const color = props.rowColor(row);
                                return (
                                    <button
                                        key={row.key}
                                        type="button"
                                        className="mxt-dg-cal__item"
                                        data-card={row.key}
                                        draggable={props.canEdit(row.key)}
                                        style={color ? ({ "--mxt-dg-card-accent": color } as CSSProperties) : undefined}
                                        onDragStart={event => {
                                            setDragKey(row.key);
                                            event.dataTransfer.effectAllowed = "move";
                                            event.dataTransfer.setData("text/plain", row.key);
                                        }}
                                        onDragEnd={() => setDragKey(undefined)}
                                        onClick={() => props.onOpen(row.key)}
                                    >
                                        {primary ? formatValue(primary, row.values[primary.key]) || "—" : row.key}
                                    </button>
                                );
                            })}
                            {items.length > maxPerDay && (
                                <span className="mxt-dg-cal__more">
                                    {t.textMoreItems.replace("[count]", String(items.length - maxPerDay))}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
