import { ReactElement, useState } from "react";

import { Icon } from "./Icon";
import { Texts } from "../utils/texts";
import { CommentRecord, HistoryRecord } from "../utils/types";

/** Cell / row comment threads (with @mentions) and the row history timeline. */

export function extractMentions(text: string, people: string[]): string[] {
    const found: string[] = [];
    people.forEach(person => {
        if (person && text.toLowerCase().includes(`@${person.toLowerCase()}`)) {
            found.push(person);
        }
    });
    return found;
}

function initials(name: string): string {
    return (
        name
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map(part => part[0].toUpperCase())
            .join("") || "?"
    );
}

function when(date: string | undefined): string {
    if (!date) {
        return "";
    }
    const d = new Date(date);
    return Number.isNaN(d.getTime())
        ? ""
        : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(d);
}

/** Text with @mentions highlighted. */
function CommentText({ text, people }: { text: string; people: string[] }): ReactElement {
    const parts: Array<string | { mention: string }> = [];
    let rest = text;
    for (;;) {
        const at = rest.indexOf("@");
        if (at < 0) {
            parts.push(rest);
            break;
        }
        const tail = rest.slice(at + 1).toLowerCase();
        const person = people.find(p => p && tail.startsWith(p.toLowerCase()));
        if (!person) {
            parts.push(rest.slice(0, at + 1));
            rest = rest.slice(at + 1);
            continue;
        }
        parts.push(rest.slice(0, at));
        parts.push({ mention: rest.slice(at, at + 1 + person.length) });
        rest = rest.slice(at + 1 + person.length);
    }
    return (
        <p className="mxt-dg-comment__text">
            {parts.map((part, index) =>
                typeof part === "string" ? (
                    part
                ) : (
                    <span key={index} className="mxt-dg-mention">
                        {part.mention}
                    </span>
                )
            )}
        </p>
    );
}

export function CommentThread({
    texts: t,
    comments,
    people,
    canComment,
    onAdd,
    onResolve,
    title
}: {
    texts: Texts;
    comments: CommentRecord[];
    people: string[];
    canComment: boolean;
    onAdd: (text: string, mentions: string[]) => void;
    onResolve: (key: string, resolved: boolean) => void;
    title?: string;
}): ReactElement {
    const [text, setText] = useState("");
    const [suggest, setSuggest] = useState<string | undefined>();
    const open = comments.filter(c => !c.resolved);
    const resolved = comments.filter(c => c.resolved);
    const matches =
        suggest !== undefined ? people.filter(p => p.toLowerCase().startsWith(suggest.toLowerCase())).slice(0, 6) : [];
    const send = (): void => {
        const value = text.trim();
        if (!value) {
            return;
        }
        onAdd(value, extractMentions(value, people));
        setText("");
        setSuggest(undefined);
    };
    const list = (items: CommentRecord[]): ReactElement[] =>
        items.map(comment => (
            <li
                key={comment.key}
                className={`mxt-dg-comment${comment.resolved ? " is-resolved" : ""}${
                    comment.pending ? " is-pending" : ""
                }`}
                data-comment={comment.key}
            >
                <span className="mxt-dg-avatar" aria-hidden>
                    {initials(comment.author || "?")}
                </span>
                <div className="mxt-dg-comment__body">
                    <div className="mxt-dg-comment__meta">
                        <strong>{comment.author || "…"}</strong>
                        <span>{when(comment.date)}</span>
                        {canComment && (
                            <button
                                type="button"
                                className="mxt-dg-vp-link mxt-dg-comment__resolve"
                                data-action={comment.resolved ? "reopen-comment" : "resolve-comment"}
                                onClick={() => onResolve(comment.key, !comment.resolved)}
                            >
                                {comment.resolved ? t.textReopen : t.textResolve}
                            </button>
                        )}
                    </div>
                    <CommentText text={comment.text} people={people} />
                </div>
            </li>
        ));
    return (
        <div className="mxt-dg-thread" data-thread>
            {title && <div className="mxt-dg-thread__title">{title}</div>}
            {comments.length === 0 && <p className="mxt-dg-vp-empty">{t.textNoComments}</p>}
            <ul className="mxt-dg-thread__list">{list(open)}</ul>
            {resolved.length > 0 && (
                <details className="mxt-dg-thread__resolved">
                    <summary>
                        {t.textResolved} ({resolved.length})
                    </summary>
                    <ul className="mxt-dg-thread__list">{list(resolved)}</ul>
                </details>
            )}
            {canComment && (
                <div className="mxt-dg-thread__compose">
                    <textarea
                        className="form-control"
                        rows={2}
                        value={text}
                        data-comment-input
                        placeholder={t.textAddComment}
                        aria-label={t.textAddComment}
                        onChange={event => {
                            const value = event.target.value;
                            setText(value);
                            const caret = event.target.selectionStart ?? value.length;
                            const before = value.slice(0, caret);
                            const at = before.lastIndexOf("@");
                            setSuggest(at >= 0 && !before.slice(at).includes(" ") ? before.slice(at + 1) : undefined);
                        }}
                        onKeyDown={event => {
                            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                                event.preventDefault();
                                send();
                            }
                            event.stopPropagation();
                        }}
                    />
                    {matches.length > 0 && (
                        <ul className="mxt-dg-formula__suggest mxt-dg-thread__mentions">
                            {matches.map(person => (
                                <li key={person}>
                                    <button
                                        type="button"
                                        onMouseDown={event => event.preventDefault()}
                                        onClick={() => {
                                            const at = text.lastIndexOf("@");
                                            setText(`${text.slice(0, at)}@${person} `);
                                            setSuggest(undefined);
                                        }}
                                    >
                                        @{person}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    <button
                        type="button"
                        className="mxt-dg-vb-primary"
                        data-action="send-comment"
                        disabled={!text.trim()}
                        onClick={send}
                    >
                        <Icon name="comment" size={13} /> {t.textSend}
                    </button>
                </div>
            )}
        </div>
    );
}

export function HistoryTimeline({
    texts: t,
    history,
    captionOf
}: {
    texts: Texts;
    history: HistoryRecord[];
    captionOf: (col: string) => string;
}): ReactElement {
    if (!history.length) {
        return <p className="mxt-dg-vp-empty">{t.textNoHistory}</p>;
    }
    const sorted = [...history].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    return (
        <ol className="mxt-dg-timeline" data-history>
            {sorted.map((entry, index) => (
                <li key={index} className="mxt-dg-timeline__item">
                    <span className="mxt-dg-timeline__dot" aria-hidden />
                    <div>
                        <div className="mxt-dg-comment__meta">
                            <strong>{entry.by || "—"}</strong>
                            <span>{when(entry.date)}</span>
                        </div>
                        <p className="mxt-dg-timeline__change">
                            {entry.col ? (
                                <span className="mxt-dg-timeline__field">{captionOf(entry.col)}</span>
                            ) : (
                                <span className="mxt-dg-timeline__field">{entry.op}</span>
                            )}
                            {entry.oldValue && <span className="is-before">{entry.oldValue}</span>}
                            {(entry.oldValue || entry.newValue) && " → "}
                            {entry.newValue && <span className="is-after">{entry.newValue}</span>}
                        </p>
                    </div>
                </li>
            ))}
        </ol>
    );
}
