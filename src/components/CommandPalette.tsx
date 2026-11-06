import { ReactElement, useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "./Icon";
import { Layer } from "./Popover";
import { Texts } from "../utils/texts";

/** Ctrl+K command palette with the undo history. */

export interface Command {
    id: string;
    label: string;
    icon: string;
    group?: string;
    shortcut?: string;
    run: () => void;
}

export function CommandPalette({
    texts: t,
    commands,
    undoLabels,
    onUndoSteps,
    onClose
}: {
    texts: Texts;
    commands: Command[];
    /** Undo stack labels, newest last. */
    undoLabels: string[];
    onUndoSteps: (steps: number) => void;
    onClose: () => void;
}): ReactElement {
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        inputRef.current?.focus();
    }, []);
    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        return commands.filter(
            command => !q || command.label.toLowerCase().includes(q) || (command.group ?? "").toLowerCase().includes(q)
        );
    }, [commands, query]);
    const run = (command: Command | undefined): void => {
        if (!command) {
            return;
        }
        onClose();
        window.setTimeout(command.run, 0);
    };
    const history = [...undoLabels].reverse();
    return (
        <Layer>
            <div
                className="mxt-dg-backdrop mxt-dg-backdrop--top"
                onMouseDown={event => event.target === event.currentTarget && onClose()}
            >
                <div
                    className="mxt-dg-palette"
                    role="dialog"
                    aria-modal="true"
                    aria-label={t.textCommandPalette}
                    data-palette
                >
                    <div className="mxt-dg-palette__search">
                        <Icon name="command" size={16} />
                        <input
                            ref={inputRef}
                            value={query}
                            placeholder={t.textCommandPalette}
                            aria-label={t.textCommandPalette}
                            onChange={event => {
                                setQuery(event.target.value);
                                setActive(0);
                            }}
                            onKeyDown={event => {
                                if (event.key === "ArrowDown") {
                                    event.preventDefault();
                                    setActive(i => Math.min(shown.length - 1, i + 1));
                                } else if (event.key === "ArrowUp") {
                                    event.preventDefault();
                                    setActive(i => Math.max(0, i - 1));
                                } else if (event.key === "Enter") {
                                    event.preventDefault();
                                    run(shown[active]);
                                } else if (event.key === "Escape") {
                                    event.preventDefault();
                                    onClose();
                                }
                            }}
                        />
                        <kbd>Esc</kbd>
                    </div>
                    <div className="mxt-dg-palette__body">
                        <ul className="mxt-dg-palette__list" role="listbox">
                            {shown.map((command, index) => (
                                <li key={command.id}>
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected={index === active}
                                        data-command={command.id}
                                        className={`mxt-dg-palette__item${index === active ? " is-active" : ""}`}
                                        onMouseEnter={() => setActive(index)}
                                        onClick={() => run(command)}
                                    >
                                        <Icon name={command.icon} size={15} />
                                        <span className="mxt-dg-palette__label">{command.label}</span>
                                        {command.group && (
                                            <span className="mxt-dg-palette__group">{command.group}</span>
                                        )}
                                        {command.shortcut && <kbd>{command.shortcut}</kbd>}
                                    </button>
                                </li>
                            ))}
                        </ul>
                        <aside className="mxt-dg-palette__history" aria-label={t.textUndoHistory}>
                            <h5>{t.textUndoHistory}</h5>
                            {history.length === 0 && <p className="mxt-dg-vp-empty">{t.textNothingToUndo}</p>}
                            <ol>
                                {history.slice(0, 12).map((label, index) => (
                                    <li key={index}>
                                        <button
                                            type="button"
                                            data-undo-step={index + 1}
                                            onClick={() => {
                                                onClose();
                                                onUndoSteps(index + 1);
                                            }}
                                        >
                                            <Icon name="undo" size={12} /> {label}
                                        </button>
                                    </li>
                                ))}
                            </ol>
                        </aside>
                    </div>
                </div>
            </div>
        </Layer>
    );
}
