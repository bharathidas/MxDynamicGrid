import { ReactElement, useRef, useState } from "react";

import { Icon } from "./Icon";
import { typeInfo } from "../utils/columnTypes";
import type { ViewState } from "../utils/personalization";
import { Texts } from "../utils/texts";
import { ColumnDef, Pinned } from "../utils/types";

/** Side panel listing every column: show/hide, pin and (for structure editors) drag to reorder. */
export function ColumnsPanel({
    texts: t,
    columns,
    view,
    canEditStructure,
    onToggle,
    onPin,
    onMove,
    onClose
}: {
    texts: Texts;
    columns: ColumnDef[];
    view: ViewState;
    canEditStructure: boolean;
    onToggle: (colId: string, hidden: boolean) => void;
    onPin: (colId: string, pinned: Pinned) => void;
    onMove: (colId: string, index: number) => void;
    onClose: () => void;
}): ReactElement {
    const [query, setQuery] = useState("");
    const drag = useRef<string | null>(null);
    const [over, setOver] = useState<string | null>(null);
    const dynamic = columns.filter(column => !column.key.startsWith("__static"));
    const shown = columns.filter(column => !query || column.caption.toLowerCase().includes(query.toLowerCase()));
    return (
        <aside className="mxt-dg-panel" aria-label={t.textColumns}>
            <header className="mxt-dg-panel__head">
                <h4>{t.textColumns}</h4>
                <button type="button" className="mxt-dg-iconbtn" aria-label={t.textClose} onClick={onClose}>
                    <Icon name="close" size={14} />
                </button>
            </header>
            <input
                className="form-control mxt-dg-panel__search"
                value={query}
                placeholder={t.textSearch}
                aria-label={t.textSearch}
                onChange={event => setQuery(event.target.value)}
            />
            <ul className="mxt-dg-panel__list">
                {shown.map(column => {
                    const state = view.columns[column.key] ?? {};
                    const hidden = state.hidden ?? column.hidden;
                    const pinned = state.pinned !== undefined ? state.pinned : column.pinned;
                    const movable = canEditStructure && !column.key.startsWith("__static") && !query;
                    return (
                        <li
                            key={column.key}
                            className={`mxt-dg-panel__item${over === column.key ? " is-over" : ""}${
                                hidden ? " is-hidden" : ""
                            }`}
                            draggable={movable}
                            data-col={column.key}
                            onDragStart={() => (drag.current = column.key)}
                            onDragOver={event => {
                                if (drag.current && movable) {
                                    event.preventDefault();
                                    setOver(column.key);
                                }
                            }}
                            onDragLeave={() => setOver(null)}
                            onDrop={() => {
                                const from = drag.current;
                                drag.current = null;
                                setOver(null);
                                if (from && from !== column.key) {
                                    onMove(
                                        from,
                                        dynamic.findIndex(c => c.key === column.key)
                                    );
                                }
                            }}
                        >
                            {movable && (
                                <span className="mxt-dg-panel__drag" aria-hidden>
                                    <Icon name="drag" size={13} />
                                </span>
                            )}
                            <label className="mxt-dg-panel__label">
                                <input
                                    type="checkbox"
                                    checked={!hidden}
                                    onChange={event => onToggle(column.key, !event.target.checked)}
                                />
                                <Icon name={typeInfo(column.type).icon} size={13} />
                                <span>{column.caption}</span>
                            </label>
                            <button
                                type="button"
                                className={`mxt-dg-iconbtn mxt-dg-panel__pin${pinned ? " is-active" : ""}`}
                                aria-label={pinned ? t.textUnpin : t.textPinLeft}
                                title={pinned ? t.textUnpin : t.textPinLeft}
                                onClick={() => onPin(column.key, pinned ? null : "left")}
                            >
                                <Icon name="pin" size={13} />
                            </button>
                        </li>
                    );
                })}
            </ul>
        </aside>
    );
}
