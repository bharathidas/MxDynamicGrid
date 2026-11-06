import { CSSProperties, ReactElement } from "react";

import { CellView } from "./CellRenderers";
import { Icon } from "./Icon";
import { typeInfo } from "../utils/columnTypes";
import { Texts } from "../utils/texts";
import { formatValue, isEmpty } from "../utils/values";
import { CellValue, ColumnDef, RowRecord } from "../utils/types";

/** Gallery of cards with an optional cover image (URL field). */

export interface GalleryProps {
    texts: Texts;
    rows: RowRecord[];
    columns: ColumnDef[];
    coverCol?: string;
    fields: string[];
    canAdd: boolean;
    onOpen: (rowKey: string) => void;
    onAdd: (values: Record<string, CellValue>) => void;
    rowColor: (row: RowRecord) => string | undefined;
}

const IMAGE = /\.(png|jpe?g|gif|webp|svg|avif)(\?.*)?$/i;

export function coverUrl(value: unknown): string | undefined {
    if (isEmpty(value)) {
        return undefined;
    }
    const text = String(value).trim();
    if (!/^(https?:)?\/\//i.test(text) && !text.startsWith("data:image/") && !text.startsWith("/")) {
        return undefined;
    }
    return IMAGE.test(text) || text.startsWith("data:image/") || /images|img|photo|picsum|unsplash/i.test(text)
        ? text
        : undefined;
}

const PALETTE = ["#DBEAFE", "#DCFCE7", "#FEF3C7", "#FCE7F3", "#EDE9FE", "#CFFAFE"];

export function GalleryView(props: GalleryProps): ReactElement {
    const { texts: t, rows, columns } = props;
    const primary = columns[0];
    const cover = columns.find(c => c.key === props.coverCol);
    const fields = props.fields
        .map(key => columns.find(c => c.key === key))
        .filter((c): c is ColumnDef => Boolean(c) && c !== primary && c !== cover);
    return (
        <div className="mxt-dg-altview mxt-dg-gallery" data-view="gallery">
            {rows.map((row, index) => {
                const title = primary ? formatValue(primary, row.values[primary.key]) : row.key;
                const url = cover ? coverUrl(row.values[cover.key]) : undefined;
                const color = props.rowColor(row);
                return (
                    <article
                        key={row.key}
                        className="mxt-dg-gcard"
                        data-card={row.key}
                        tabIndex={0}
                        style={
                            {
                                animationDelay: `${Math.min(index, 20) * 25}ms`,
                                ...(color ? { "--mxt-dg-card-accent": color } : {})
                            } as CSSProperties
                        }
                        onClick={() => props.onOpen(row.key)}
                        onKeyDown={event => event.key === "Enter" && props.onOpen(row.key)}
                    >
                        {cover && (
                            <div
                                className="mxt-dg-gcard__cover"
                                style={url ? undefined : { background: PALETTE[index % PALETTE.length] }}
                            >
                                {url ? (
                                    <img src={url} alt="" loading="lazy" />
                                ) : (
                                    <span>{(title || "?").slice(0, 1).toUpperCase()}</span>
                                )}
                            </div>
                        )}
                        <div className="mxt-dg-gcard__body">
                            <h4>{title || "—"}</h4>
                            {fields.map(field =>
                                isEmpty(row.values[field.key]) ? null : (
                                    <div key={field.key} className="mxt-dg-card2__field">
                                        <span className="mxt-dg-card2__label">
                                            <Icon name={typeInfo(field.type).icon} size={11} /> {field.caption}
                                        </span>
                                        <span className="mxt-dg-card2__value">
                                            <CellView column={field} value={row.values[field.key]} />
                                        </span>
                                    </div>
                                )
                            )}
                        </div>
                    </article>
                );
            })}
            {props.canAdd && (
                <button
                    type="button"
                    className="mxt-dg-gcard mxt-dg-gcard--add"
                    data-action="gallery-add"
                    onClick={() => props.onAdd({})}
                >
                    <Icon name="plus" size={20} />
                    <span>{t.textNewRow}</span>
                </button>
            )}
        </div>
    );
}
