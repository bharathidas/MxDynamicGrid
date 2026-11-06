import { ReactElement, useEffect, useRef, useState } from "react";

import { Icon } from "./Icon";
import { anchorOf, Anchor, Menu } from "./Popover";
import { newKey } from "../utils/changeSet";
import {
    emptyViewState,
    removeView,
    SavedView,
    upsertView,
    ViewState,
    ViewsDocument,
    ViewType,
    visibleViews
} from "../utils/personalization";
import { VIEW_TYPE_ICON } from "./ViewPanels2";
import { fill, Texts } from "../utils/texts";

/** Notion/Airtable view tabs over the saved views (the views attribute). */

/** Key order independent JSON (saved views come from the module, so their key order can differ). */
function stable(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(stable).join(",")}]`;
    }
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return `{${Object.keys(record)
            .filter(key => record[key] !== undefined)
            .sort()
            .map(key => `${JSON.stringify(key)}:${stable(record[key])}`)
            .join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}

export function sameState(a: ViewState, b: ViewState, defaultRowHeight?: ViewState["rowHeight"]): boolean {
    // A view saved without a row height uses the grid default.
    const clean = (s: ViewState): string =>
        stable({
            ...s,
            search: undefined,
            density: undefined,
            pageSize: undefined,
            viewId: undefined,
            rowHeight: s.rowHeight ?? defaultRowHeight
        });
    return clean(a) === clean(b);
}

export function ViewTabs({
    texts: t,
    doc,
    owner,
    activeId,
    current,
    onSelect,
    onSave,
    allowTypes,
    makeTypedState,
    defaultRowHeight
}: {
    texts: Texts;
    doc: ViewsDocument;
    owner: string | undefined;
    activeId: string | undefined;
    current: ViewState;
    onSelect: (view: SavedView | undefined) => void;
    onSave: (doc: ViewsDocument, selectId?: string) => void;
    allowTypes?: boolean;
    makeTypedState?: (type: ViewType) => Partial<ViewState>;
    /** Row height a view without its own height uses. */
    defaultRowHeight?: ViewState["rowHeight"];
}): ReactElement {
    const [typeMenu, setTypeMenu] = useState<Anchor | undefined>();
    const views = visibleViews(doc, owner);
    const active = views.find(view => view.id === activeId);
    const changed = active ? !sameState(active.state, current, defaultRowHeight) : false;
    const [menu, setMenu] = useState<{ view: SavedView; anchor: Anchor } | undefined>();
    const [renaming, setRenaming] = useState<string | undefined>();
    const [name, setName] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        // After the menu closed (it restores focus), so the rename box keeps it.
        const id = window.setTimeout(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
        }, 40);
        return () => window.clearTimeout(id);
    }, [renaming]);

    const addView = (type: ViewType = "grid"): void => {
        const id = newKey();
        const typeName: Record<ViewType, string> = {
            grid: t.textViewGrid,
            board: t.textViewBoard,
            calendar: t.textViewCalendar,
            gallery: t.textViewGallery
        };
        const view: SavedView = {
            id,
            name: type === "grid" ? fill(t.textNewViewName, { number: views.length + 1 }) : typeName[type],
            shared: !owner,
            owner,
            state: { ...current, search: undefined, viewType: type, ...(makeTypedState ? makeTypedState(type) : {}) }
        };
        onSave(upsertView(doc, view), id);
        onSelect(view);
        setName(view.name);
        setRenaming(id);
    };
    const commitRename = (view: SavedView): void => {
        setRenaming(undefined);
        if (name.trim() && name.trim() !== view.name) {
            onSave(upsertView(doc, { ...view, name: name.trim() }), view.id);
        }
    };

    return (
        <div className="mxt-dg-tabs" role="tablist" aria-label="Views">
            {views.length === 0 && (
                <div className="mxt-dg-tab is-active">
                    <button type="button" role="tab" aria-selected className="mxt-dg-tab__btn">
                        <Icon name="columns" size={13} />
                        <span>{t.textAllRows}</span>
                    </button>
                </div>
            )}
            {views.map(view => {
                const selected = view.id === activeId;
                return (
                    <div key={view.id} className={`mxt-dg-tab${selected ? " is-active" : ""}`} data-view={view.name}>
                        {renaming === view.id ? (
                            <input
                                ref={inputRef}
                                className="mxt-dg-tab__rename"
                                value={name}
                                aria-label={t.textRenameView}
                                onChange={event => setName(event.target.value)}
                                onBlur={() => commitRename(view)}
                                onKeyDown={event => {
                                    if (event.key === "Enter") {
                                        commitRename(view);
                                    } else if (event.key === "Escape") {
                                        setRenaming(undefined);
                                    }
                                }}
                            />
                        ) : (
                            <button
                                type="button"
                                role="tab"
                                aria-selected={selected}
                                className="mxt-dg-tab__btn"
                                onClick={() => onSelect(view)}
                                onDoubleClick={() => {
                                    setName(view.name);
                                    setRenaming(view.id);
                                }}
                            >
                                <Icon name={VIEW_TYPE_ICON[view.state.viewType ?? "grid"]} size={13} />
                                {!view.shared && <Icon name="user" size={11} className="mxt-dg-tab__personal" />}
                                <span>{view.name}</span>
                                {selected && changed && <span className="mxt-dg-tab__dot" title={t.textUnsavedView} />}
                            </button>
                        )}
                        {selected && (
                            <button
                                type="button"
                                className="mxt-dg-tab__menu"
                                aria-label={`${view.name} ${t.textMore}`}
                                onClick={event => {
                                    const anchor = anchorOf(event.currentTarget);
                                    if (anchor) {
                                        setMenu({ view, anchor });
                                    }
                                }}
                            >
                                <Icon name="chevronDown" size={12} />
                            </button>
                        )}
                    </div>
                );
            })}
            {changed && active && (
                <button
                    type="button"
                    className="mxt-dg-tab-save"
                    data-action="save-view"
                    onClick={() =>
                        onSave(upsertView(doc, { ...active, state: { ...current, search: undefined } }), active.id)
                    }
                >
                    {t.textSaveView}
                </button>
            )}
            <button
                type="button"
                className="mxt-dg-tab-add"
                aria-label={t.textAddView}
                title={t.textAddView}
                data-action="add-view"
                onClick={event => {
                    if (allowTypes) {
                        setTypeMenu(anchorOf(event.currentTarget));
                    } else {
                        addView("grid");
                    }
                }}
            >
                <Icon name="plus" size={14} />
                <span>{t.textAddView}</span>
            </button>
            {typeMenu && (
                <Menu
                    anchor={typeMenu}
                    label={t.textAddView}
                    onClose={() => setTypeMenu(undefined)}
                    items={(["grid", "board", "calendar", "gallery"] as ViewType[]).map(type => ({
                        id: `view-${type}`,
                        label: {
                            grid: t.textViewGrid,
                            board: t.textViewBoard,
                            calendar: t.textViewCalendar,
                            gallery: t.textViewGallery
                        }[type],
                        icon: VIEW_TYPE_ICON[type],
                        onSelect: () => addView(type)
                    }))}
                />
            )}
            {menu && (
                <Menu
                    anchor={menu.anchor}
                    onClose={() => setMenu(undefined)}
                    items={[
                        {
                            id: "rename",
                            label: t.textRenameView,
                            icon: "pencil",
                            onSelect: () => {
                                setName(menu.view.name);
                                setRenaming(menu.view.id);
                            }
                        },
                        {
                            id: "duplicate",
                            label: t.textDuplicateView,
                            icon: "copy",
                            onSelect: () => {
                                const id = newKey();
                                onSave(
                                    upsertView(doc, {
                                        ...menu.view,
                                        id,
                                        name: `${menu.view.name} (${t.textCopy})`,
                                        isDefault: false,
                                        owner,
                                        shared: menu.view.shared
                                    }),
                                    id
                                );
                            }
                        },
                        {
                            id: "default",
                            label: t.textSetDefaultView,
                            icon: "check",
                            onSelect: () => onSave(upsertView(doc, { ...menu.view, isDefault: true }), menu.view.id)
                        },
                        {
                            id: "share",
                            label: menu.view.shared ? t.textUnshareView : t.textShareView,
                            icon: "views",
                            onSelect: () =>
                                onSave(
                                    upsertView(doc, {
                                        ...menu.view,
                                        shared: !menu.view.shared,
                                        owner: menu.view.shared ? owner : undefined
                                    }),
                                    menu.view.id
                                )
                        },
                        { id: "sep", label: "", separator: true },
                        {
                            id: "delete",
                            label: t.textDeleteView,
                            icon: "trash",
                            danger: true,
                            onSelect: () => {
                                onSave(removeView(doc, menu.view.id));
                                onSelect(views.find(v => v.id !== menu.view.id) ?? undefined);
                            }
                        }
                    ]}
                />
            )}
        </div>
    );
}

export { emptyViewState };
