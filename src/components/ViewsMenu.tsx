import { ReactElement, useRef, useState } from "react";

import { Icon } from "./Icon";
import { anchorOf, Anchor, Popover } from "./Popover";
import { newKey } from "../utils/changeSet";
import { removeView, upsertView, ViewState, ViewsDocument, visibleViews } from "../utils/personalization";
import { Texts } from "../utils/texts";

/** Saved views: apply, save the current layout (personal or shared, default), delete, reset. */
export function ViewsMenu({
    texts: t,
    doc,
    owner,
    current,
    onApply,
    onSave,
    onReset
}: {
    texts: Texts;
    doc: ViewsDocument;
    owner: string | undefined;
    current: ViewState;
    onApply: (state: ViewState) => void;
    onSave: (doc: ViewsDocument) => void;
    onReset: () => void;
}): ReactElement {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [anchor, setAnchor] = useState<Anchor | undefined>();
    const [name, setName] = useState("");
    const [shared, setShared] = useState(false);
    const [isDefault, setIsDefault] = useState(false);
    const views = visibleViews(doc, owner);
    const personal = views.filter(view => !view.shared);
    const sharedViews = views.filter(view => view.shared);
    const list = (title: string, entries: typeof views): ReactElement | null =>
        entries.length ? (
            <div className="mxt-dg-views__group">
                <div className="mxt-dg-views__title">{title}</div>
                {entries.map(view => (
                    <div key={view.id} className="mxt-dg-views__item">
                        <button
                            type="button"
                            className="mxt-dg-views__apply"
                            onClick={() => {
                                onApply(view.state);
                                setAnchor(undefined);
                            }}
                        >
                            {view.isDefault && <Icon name="check" size={12} />} {view.name}
                        </button>
                        {(!view.owner || view.owner === owner) && (
                            <button
                                type="button"
                                className="mxt-dg-iconbtn"
                                aria-label={`${t.textDeleteView} ${view.name}`}
                                onClick={() => onSave(removeView(doc, view.id))}
                            >
                                <Icon name="trash" size={12} />
                            </button>
                        )}
                    </div>
                ))}
            </div>
        ) : null;
    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                className="mxt-dg-iconbtn"
                aria-label={t.textViews}
                title={t.textViews}
                data-action="views"
                onClick={() => setAnchor(anchorOf(buttonRef.current))}
            >
                <Icon name="views" />
            </button>
            {anchor && (
                <Popover
                    anchor={anchor}
                    onClose={() => setAnchor(undefined)}
                    className="mxt-dg-views"
                    align="end"
                    width={300}
                >
                    {list(t.textPersonalViews, personal)}
                    {list(t.textSharedViews, sharedViews)}
                    <form
                        className="mxt-dg-views__save"
                        onSubmit={event => {
                            event.preventDefault();
                            if (!name.trim()) {
                                return;
                            }
                            const existing = views.find(
                                view => view.name.toLowerCase() === name.trim().toLowerCase() && view.shared === shared
                            );
                            onSave(
                                upsertView(doc, {
                                    id: existing?.id ?? newKey(),
                                    name: name.trim(),
                                    shared,
                                    owner: shared ? undefined : owner,
                                    isDefault,
                                    state: { ...current, search: undefined }
                                })
                            );
                            setName("");
                            setAnchor(undefined);
                        }}
                    >
                        <div className="mxt-dg-views__title">{t.textSaveView}</div>
                        <input
                            className="form-control"
                            value={name}
                            placeholder={t.textViewName}
                            aria-label={t.textViewName}
                            onChange={event => setName(event.target.value)}
                        />
                        <label className="mxt-dg-check">
                            <input
                                type="checkbox"
                                checked={shared}
                                onChange={event => setShared(event.target.checked)}
                            />{" "}
                            {t.textSharedView}
                        </label>
                        <label className="mxt-dg-check">
                            <input
                                type="checkbox"
                                checked={isDefault}
                                onChange={event => setIsDefault(event.target.checked)}
                            />{" "}
                            {t.textDefaultView}
                        </label>
                        <div className="mxt-dg-views__actions">
                            <button
                                type="button"
                                className="btn btn-default mxt-dg-btn"
                                onClick={() => {
                                    onReset();
                                    setAnchor(undefined);
                                }}
                            >
                                {t.textResetView}
                            </button>
                            <button type="submit" className="btn btn-primary mxt-dg-btn" disabled={!name.trim()}>
                                {t.textSave}
                            </button>
                        </div>
                    </form>
                </Popover>
            )}
        </>
    );
}
