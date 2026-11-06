/* Latest onClose callback kept in a ref so document listeners stay registered once. */
/* eslint-disable react-hooks/refs */
import {
    CSSProperties,
    ReactElement,
    ReactNode,
    createContext,
    useContext,
    useEffect,
    useLayoutEffect,
    useRef,
    useState
} from "react";
import { createPortal } from "react-dom";

import { Icon } from "./Icon";

/**
 * Floating layers (popovers, menus, dialogs, drawer, toasts) render in a portal on document.body so they are never
 * clipped by the grid; ThemeContext carries the grid's theme classes so the layer looks the same.
 */

export const ThemeContext = createContext<string>("mxt-dg-theme");

export function Layer({ children }: { children: ReactNode }): ReactElement | null {
    const theme = useContext(ThemeContext);
    if (typeof document === "undefined") {
        return null;
    }
    return createPortal(<div className={`mxt-dg-layer ${theme}`}>{children}</div>, document.body);
}

export interface Anchor {
    /** Viewport rectangle the popover is attached to. */
    rect: { left: number; top: number; right: number; bottom: number; width: number; height: number };
}

export function anchorOf(element: Element | null | undefined): Anchor | undefined {
    if (!element) {
        return undefined;
    }
    const r = element.getBoundingClientRect();
    return { rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } };
}

export function pointAnchor(x: number, y: number): Anchor {
    return { rect: { left: x, top: y, right: x, bottom: y, width: 0, height: 0 } };
}

export interface PopoverProps {
    anchor: Anchor;
    onClose: () => void;
    children: ReactNode;
    className?: string;
    align?: "start" | "end";
    label?: string;
    role?: "dialog" | "menu";
    width?: number;
}

export function Popover({
    anchor,
    onClose,
    children,
    className,
    align = "start",
    label,
    role = "dialog",
    width
}: PopoverProps): ReactElement {
    const ref = useRef<HTMLDivElement>(null);
    const [style, setStyle] = useState<CSSProperties>({
        left: anchor.rect.left,
        top: anchor.rect.bottom + 4,
        visibility: "hidden"
    });
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) {
            return;
        }
        // Re-fit whenever the content changes size (e.g. a field type that adds an Options section) or the window
        // resizes, so the popover never hangs off the bottom or the right edge of the screen.
        const place = (): void => {
            const box = element.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const width = Math.min(box.width, vw - 16);
            const height = Math.min(box.height, vh - 16);
            let left = align === "end" ? anchor.rect.right - width : anchor.rect.left;
            left = Math.max(8, Math.min(vw - width - 8, left));
            let top = anchor.rect.bottom + 4;
            if (top + height > vh - 8 && anchor.rect.top - height - 4 > 8) {
                top = anchor.rect.top - height - 4;
            }
            top = Math.max(8, Math.min(vh - height - 8, top));
            setStyle(current =>
                current.left === left && current.top === top && current.visibility === "visible"
                    ? current
                    : { left, top, visibility: "visible" }
            );
        };
        place();
        const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(place);
        observer?.observe(element);
        window.addEventListener("resize", place);
        return () => {
            observer?.disconnect();
            window.removeEventListener("resize", place);
        };
    }, [anchor, align]);

    useEffect(() => {
        const onDown = (event: MouseEvent): void => {
            const target = event.target as Node;
            if (ref.current && !ref.current.contains(target) && !(target as Element).closest?.(".mxt-dg-layer--keep")) {
                onCloseRef.current();
            }
        };
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === "Escape") {
                event.stopPropagation();
                onCloseRef.current();
            }
        };
        const id = window.setTimeout(() => document.addEventListener("mousedown", onDown, true), 0);
        document.addEventListener("keydown", onKey, true);
        return () => {
            window.clearTimeout(id);
            document.removeEventListener("mousedown", onDown, true);
            document.removeEventListener("keydown", onKey, true);
        };
    }, []);

    return (
        <Layer>
            <div
                ref={ref}
                className={`mxt-dg-popover ${className ?? ""}`}
                style={{ ...style, ...(width ? { width } : {}) }}
                role={role}
                aria-label={label}
            >
                {children}
            </div>
        </Layer>
    );
}

export interface MenuItem {
    id: string;
    label: string;
    icon?: string;
    danger?: boolean;
    disabled?: boolean;
    separator?: boolean;
    shortcut?: string;
    onSelect?: () => void;
}

export function Menu({
    items,
    onClose,
    anchor,
    label
}: {
    items: MenuItem[];
    onClose: () => void;
    anchor: Anchor;
    label?: string;
}): ReactElement {
    const listRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        listRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
    }, []);
    const move = (delta: number): void => {
        const buttons = Array.from(
            listRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []
        );
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(index + delta + buttons.length) % buttons.length]?.focus();
    };
    return (
        <Popover anchor={anchor} onClose={onClose} className="mxt-dg-menu" role="menu" label={label}>
            <div
                ref={listRef}
                onKeyDown={event => {
                    if (event.key === "ArrowDown") {
                        event.preventDefault();
                        move(1);
                    } else if (event.key === "ArrowUp") {
                        event.preventDefault();
                        move(-1);
                    }
                }}
            >
                {items.map(item =>
                    item.separator ? (
                        <div key={item.id} className="mxt-dg-menu__sep" role="separator" />
                    ) : (
                        <button
                            key={item.id}
                            type="button"
                            role="menuitem"
                            data-menu-id={item.id}
                            className={`mxt-dg-menu__item${item.danger ? " mxt-dg-menu__item--danger" : ""}`}
                            disabled={item.disabled}
                            onClick={() => {
                                onClose();
                                item.onSelect?.();
                            }}
                        >
                            {item.icon ? <IconSlot name={item.icon} /> : <span className="mxt-dg-menu__icon" />}
                            <span className="mxt-dg-menu__label">{item.label}</span>
                            {item.shortcut && <kbd>{item.shortcut}</kbd>}
                        </button>
                    )
                )}
            </div>
        </Popover>
    );
}

function IconSlot({ name }: { name: string }): ReactElement {
    return (
        <span className="mxt-dg-menu__icon">
            <Icon name={name} size={14} />
        </span>
    );
}

export interface DialogProps {
    title: string;
    onClose: () => void;
    children: ReactNode;
    footer?: ReactNode;
    width?: number;
    className?: string;
}

export function Dialog({ title, onClose, children, footer, width = 480, className }: DialogProps): ReactElement {
    const ref = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        const first = ref.current?.querySelector<HTMLElement>(
            "input, select, textarea, button:not(.mxt-dg-dialog__close)"
        );
        first?.focus();
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === "Escape") {
                event.stopPropagation();
                onCloseRef.current();
            }
        };
        document.addEventListener("keydown", onKey, true);
        return () => {
            document.removeEventListener("keydown", onKey, true);
            previous?.focus?.();
        };
    }, []);
    return (
        <Layer>
            <div className="mxt-dg-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
                <div
                    ref={ref}
                    className={`mxt-dg-dialog ${className ?? ""}`}
                    role="dialog"
                    aria-modal="true"
                    aria-label={title}
                    style={{ width: `min(${width}px, calc(100vw - 32px))` }}
                >
                    <div className="mxt-dg-dialog__head">
                        <h3>{title}</h3>
                        <button
                            type="button"
                            className="mxt-dg-iconbtn mxt-dg-dialog__close"
                            aria-label="Close"
                            onClick={onClose}
                        >
                            <Icon name="close" />
                        </button>
                    </div>
                    <div className="mxt-dg-dialog__body">{children}</div>
                    {footer && <div className="mxt-dg-dialog__foot">{footer}</div>}
                </div>
            </div>
        </Layer>
    );
}
