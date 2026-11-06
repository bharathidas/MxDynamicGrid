import { ReactElement, ReactNode, useEffect, useRef, useState } from "react";

import { Icon } from "./Icon";
import { anchorOf, Anchor, Menu, MenuItem, Popover } from "./Popover";
import { fill, Texts } from "../utils/texts";

/** The labelled view bar (Airtable style) replacing the icon toolbar. */

export type PanelId = "hide" | "filter" | "sort" | "group" | "height" | "color" | "layout";

export interface ViewBarButton {
    id: PanelId;
    icon: string;
    label: string;
    count: number;
    /** Label shown when active, e.g. "Filtered by 1 field". */
    activeLabel?: string;
    panel: () => ReactNode;
    width?: number;
}

export interface SaveState {
    status: "idle" | "dirty" | "saving" | "saved" | "error";
    dirty: number;
    manual: boolean;
    message?: string;
    onSave: () => void;
    onRetry: () => void;
}

export function SavePill({ texts: t, state }: { texts: Texts; state: SaveState }): ReactElement | null {
    const { status, dirty } = state;
    if (status === "saving") {
        return (
            <span className="mxt-dg-pill mxt-dg-pill--saving" data-save-state="saving" role="status">
                <span className="mxt-dg-spinner" aria-hidden /> {t.textSaving}
            </span>
        );
    }
    if (status === "error") {
        return (
            <span
                className="mxt-dg-pill mxt-dg-pill--error"
                data-save-state="error"
                role="status"
                title={state.message}
            >
                <Icon name="warning" size={13} /> {t.textCouldNotSave}
                <button type="button" className="mxt-dg-pill__btn" data-action="retry" onClick={state.onRetry}>
                    {t.textRetry}
                </button>
            </span>
        );
    }
    if (dirty > 0) {
        return (
            <span className="mxt-dg-pill mxt-dg-pill--dirty" data-save-state="dirty" role="status">
                <span className="mxt-dg-pill__dot" aria-hidden /> {fill(t.textUnsavedSave, { count: dirty })}
                {state.manual && (
                    <button type="button" className="mxt-dg-pill__btn" data-action="save" onClick={state.onSave}>
                        {t.textSave}
                    </button>
                )}
            </span>
        );
    }
    if (status === "saved") {
        return (
            <span className="mxt-dg-pill mxt-dg-pill--saved" data-save-state="saved" role="status">
                <Icon name="check" size={13} /> <span className="mxt-dg-pill__text">{t.textSavedAll}</span>
            </span>
        );
    }
    return <span data-save-state="idle" />;
}

export function ViewBar({
    texts: t,
    buttons,
    search,
    savePill,
    actions,
    primary,
    moreItems,
    showMore = true,
    request
}: {
    texts: Texts;
    buttons: ViewBarButton[];
    search: ReactNode;
    savePill: ReactNode;
    actions: ReactNode;
    primary: ReactNode;
    moreItems: MenuItem[];
    /** False hides the ⋮ menu button. */
    showMore?: boolean;
    /** Opens a panel from outside (for example "Filter by this field"). */
    request?: { id: PanelId; nonce: number };
}): ReactElement {
    const [open, setOpen] = useState<{ id: PanelId; anchor: Anchor } | undefined>();
    const [more, setMore] = useState<Anchor | undefined>();
    const current = open ? buttons.find(button => button.id === open.id) : undefined;
    const barRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!request) {
            return;
        }
        const element = barRef.current?.querySelector(`[data-vb="${request.id}"]`);
        const anchor = anchorOf(element);
        if (anchor) {
            setOpen({ id: request.id, anchor });
        }
    }, [request]);
    return (
        // The wrapper is a size container: on narrow grids the right-hand labels collapse to icons.
        <div className="mxt-dg-viewbar-c">
            <div ref={barRef} className="mxt-dg-viewbar" role="toolbar" aria-label="View">
                {(buttons.length > 0 || showMore) && (
                    <div className="mxt-dg-viewbar__views">
                        {buttons.map(button => (
                            <button
                                key={button.id}
                                type="button"
                                className={`mxt-dg-vb-btn${button.count > 0 ? " is-active" : ""}${
                                    open?.id === button.id ? " is-open" : ""
                                }`}
                                data-vb={button.id}
                                aria-haspopup="dialog"
                                aria-expanded={open?.id === button.id}
                                onClick={event => {
                                    const anchor = anchorOf(event.currentTarget);
                                    setOpen(previous =>
                                        previous?.id === button.id || !anchor ? undefined : { id: button.id, anchor }
                                    );
                                }}
                            >
                                <Icon name={button.icon} size={15} />
                                <span className="mxt-dg-vb-btn__label">
                                    {button.count > 0 && button.activeLabel ? button.activeLabel : button.label}
                                </span>
                            </button>
                        ))}
                        {showMore && (
                            <button
                                type="button"
                                className="mxt-dg-vb-btn mxt-dg-vb-btn--icon"
                                aria-label={t.textMore}
                                title={t.textMore}
                                data-vb="more"
                                onClick={event => setMore(anchorOf(event.currentTarget))}
                            >
                                <Icon name="menu" size={15} />
                            </button>
                        )}
                    </div>
                )}
                <div className="mxt-dg-viewbar__right">
                    {search}
                    {savePill}
                    {actions}
                    {primary}
                </div>
                {open && current && (
                    <Popover
                        anchor={open.anchor}
                        onClose={() => setOpen(undefined)}
                        className="mxt-dg-vp-pop"
                        width={current.width ?? 340}
                        label={current.label}
                    >
                        {current.panel()}
                    </Popover>
                )}
                {more && <Menu anchor={more} items={moreItems} onClose={() => setMore(undefined)} label={t.textMore} />}
            </div>
        </div>
    );
}
