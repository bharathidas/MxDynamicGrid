import { ReactElement } from "react";

/** Stroke icons on a 16x16 grid. Each entry is one or more path "d" strings. */
const PATHS: Record<string, string[]> = {
    // field types
    text: ["M3 4h10", "M8 4v9"],
    longText: ["M2.5 4h11", "M2.5 7h11", "M2.5 10h11", "M2.5 13h6"],
    number: ["M6 2.5 4.5 13.5", "M11.5 2.5 10 13.5", "M2.5 6h11", "M2 10.5h11"],
    decimal: ["M3 12.5h.01", "M7.5 4.5a2 2 0 0 1 2 2v4a2 2 0 0 1-4 0v-4a2 2 0 0 1 2-2z", "M12.5 4.5v8"],
    currency: ["M8 2v12", "M11 4.5H6.8a2 2 0 0 0 0 4h2.4a2 2 0 0 1 0 4H5"],
    percent: ["M12.5 3.5l-9 9", "M5 3a2 2 0 1 0 0 .01", "M11 9.5a2 2 0 1 0 0 .01"],
    date: ["M3 4h10v9.5H3z", "M3 7h10", "M5.5 2.5v3", "M10.5 2.5v3"],
    dateTime: ["M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z", "M8 5v3l2 1.5"],
    boolean: ["M3 3h10v10H3z", "M5.5 8l2 2 3.5-4"],
    select: ["M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z", "M5.5 7l2.5 2.5L10.5 7"],
    multiSelect: ["M2.5 4.5h2", "M2.5 8h2", "M2.5 11.5h2", "M6.5 4.5h7", "M6.5 8h7", "M6.5 11.5h7"],
    rating: ["M8 2.2l1.8 3.7 4 .6-2.9 2.8.7 4L8 11.4l-3.6 1.9.7-4L2.2 6.5l4-.6z"],
    progress: ["M2 6.5h12v3H2z", "M2 8h7"],
    link: ["M6.5 9.5l3-3", "M7 4.5l1-1a2.8 2.8 0 0 1 4 4l-1 1", "M9 11.5l-1 1a2.8 2.8 0 0 1-4-4l1-1"],
    email: ["M2.5 4h11v8.5h-11z", "M2.5 4.5L8 9l5.5-4.5"],
    phone: [
        "M4 2.5h2.5l1 3-1.5 1a7 7 0 0 0 3.5 3.5l1-1.5 3 1V12a1.5 1.5 0 0 1-1.5 1.5A10 10 0 0 1 2.5 4 1.5 1.5 0 0 1 4 2.5z"
    ],
    user: ["M8 2.5a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z", "M3 13.5a5 5 0 0 1 10 0"],
    formula: ["M10.5 2.5H8.5a1.5 1.5 0 0 0-1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-2", "M4.5 7h6"],
    autoNumber: ["M3 3.5h3v9", "M3 12.5h6", "M11 5l2-1.5v9"],
    createdAt: ["M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z", "M8 5v3h2.5"],
    changedAt: ["M13.5 8A5.5 5.5 0 1 1 11.9 4.1", "M13.5 2.5v3h-3", "M8 5.5V8l1.5 1"],
    createdBy: ["M6.5 2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z", "M2 13a4.5 4.5 0 0 1 8 0", "M12.5 6v4", "M10.5 8h4"],
    changedBy: [
        "M6.5 2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
        "M2 13a4.5 4.5 0 0 1 8 0",
        "M11 10.5l3-3-1.5-1.5-3 3V10.5z"
    ],
    linkedRecord: ["M2.5 4.5h5v4h-5z", "M8.5 7.5h5v4h-5z", "M7.5 6.5h1v3"],
    lookup: ["M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z", "M10.5 10.5l3 3", "M5 7h4"],
    rollup: ["M12 3H4l4.5 5L4 13h8"],
    board: ["M2.5 3h3.5v10H2.5z", "M7 3h3v7H7z", "M11 3h2.5v5H11z"],
    calendar: [
        "M2.5 3.5h11v10h-11z",
        "M2.5 6.5h11",
        "M5.5 2v3",
        "M10.5 2v3",
        "M5 9h1",
        "M7.5 9h1",
        "M10 9h1",
        "M5 11.5h1"
    ],
    gallery: ["M2.5 2.5h5v5h-5z", "M8.5 2.5h5v5h-5z", "M2.5 8.5h5v5h-5z", "M8.5 8.5h5v5h-5z"],
    comment: ["M2.5 3h11v8h-6l-3 2.5V11h-2z"],
    history: ["M2.5 8a5.5 5.5 0 1 0 1.6-3.9", "M2.5 2.5v3h3", "M8 5v3l2 1.5"],
    lock: ["M4 7.5h8v6H4z", "M5.5 7.5V5a2.5 2.5 0 0 1 5 0v2.5"],
    command: ["M5 3a2 2 0 1 0 0 4h6a2 2 0 1 0-2-2v6a2 2 0 1 0 2-2H5a2 2 0 1 0 2 2V5a2 2 0 0 0-2-2z"],
    replace: ["M2.5 5h8", "M8 2.5L10.5 5 8 7.5", "M13.5 11h-8", "M8 8.5L5.5 11 8 13.5"],
    print: ["M4.5 6V2.5h7V6", "M4.5 11.5h-2v-5h11v5h-2", "M4.5 9.5h7v4h-7z"],
    color: ["M8 2.5a5.5 5.5 0 0 0 0 11c1 0 1.5-.8 1-1.6-.5-.9 0-1.9 1-1.9h1.5a2 2 0 0 0 2-2A5.5 5.5 0 0 0 8 2.5z"],
    // ui
    plus: ["M8 3v10", "M3 8h10"],
    close: ["M4 4l8 8", "M12 4l-8 8"],
    menu: ["M8 3.5h.01", "M8 8h.01", "M8 12.5h.01"],
    chevronDown: ["M4 6l4 4 4-4"],
    chevronRight: ["M6 4l4 4-4 4"],
    chevronLeft: ["M10 4L6 8l4 4"],
    sortAsc: ["M8 13V3", "M4.5 6.5L8 3l3.5 3.5"],
    sortDesc: ["M8 3v10", "M4.5 9.5L8 13l3.5-3.5"],
    filter: ["M2.5 3.5h11L9.5 8.5v4l-3 1.5V8.5z"],
    search: ["M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z", "M10.5 10.5l3 3"],
    undo: ["M5 7.5H10.5a3 3 0 0 1 0 6H8", "M7.5 5L5 7.5 7.5 10"],
    redo: ["M11 7.5H5.5a3 3 0 0 0 0 6H8", "M8.5 5L11 7.5 8.5 10"],
    excel: ["M2 2.5h12v11H2z", "M2 6.5h12", "M2 10h12", "M7 2.5v11"],
    csv: ["M4 1.5h5.5L13 5v9.5H4z", "M9.5 1.5V5H13", "M6 8.5h5", "M6 11.5h5"],
    download: ["M8 2.5v8", "M4.5 7.5L8 11l3.5-3.5", "M2.5 13.5h11"],
    upload: ["M8 11V3", "M4.5 6.5L8 3l3.5 3.5", "M2.5 13.5h11"],
    columns: ["M2 2.5h12v11H2z", "M6 2.5v11", "M10 2.5v11"],
    group: ["M2.5 3h11", "M5 6.5h8.5", "M5 10h8.5", "M2.5 13h11"],
    views: ["M2.5 3.5h11v3h-11z", "M2.5 9.5h11v3h-11z"],
    density: ["M2.5 4h11", "M2.5 8h11", "M2.5 12h11"],
    keyboard: ["M1.5 4h13v8.5h-13z", "M4 7h.01", "M6.5 7h.01", "M9 7h.01", "M11.5 7h.01", "M5 10h6"],
    trash: ["M3 4.5h10", "M6.5 4.5V3h3v1.5", "M4.5 4.5l.7 9h5.6l.7-9"],
    copy: ["M5.5 5.5h8v8h-8z", "M10.5 5.5v-3h-8v8h3"],
    pencil: ["M11 2.5l2.5 2.5L6 12.5H3.5V10z"],
    expand: ["M9.5 2.5h4v4", "M13.5 2.5L9 7", "M6.5 13.5h-4v-4", "M2.5 13.5L7 9"],
    pin: ["M6 2.5h4l-.5 4 2 2H4.5l2-2z", "M8 8.5v5"],
    eye: [
        "M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z",
        "M8 6.3a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4z"
    ],
    eyeOff: [
        "M2 2l12 12",
        "M6.6 6.7a1.7 1.7 0 0 0 2.6 2.3",
        "M4.2 4.6C2.5 5.8 1.5 8 1.5 8s2.5 4.5 6.5 4.5c1.3 0 2.4-.4 3.3-1",
        "M7 3.6c.3 0 .7-.1 1-.1 4 0 6.5 4.5 6.5 4.5s-.5 1-1.5 2.1"
    ],
    drag: ["M6 3.5h.01", "M10 3.5h.01", "M6 8h.01", "M10 8h.01", "M6 12.5h.01", "M10 12.5h.01"],
    check: ["M3 8.5l3 3 7-7"],
    warning: ["M8 2.5l6 11H2z", "M8 6.5v3", "M8 11.5h.01"],
    save: ["M3 2.5h8l2.5 2.5v8.5H3z", "M5.5 2.5v3.5h5V2.5", "M5 13.5v-4h6v4"],
    palette: [
        "M8 2.5a5.5 5.5 0 0 0 0 11c1 0 1.5-.8 1-1.6-.5-.9 0-1.9 1-1.9h1.5a2 2 0 0 0 2-2A5.5 5.5 0 0 0 8 2.5z",
        "M5 7h.01",
        "M8 5h.01",
        "M11 7h.01"
    ],
    resize: ["M4.5 8h7", "M6 6l-2 2 2 2", "M10 6l2 2-2 2"]
};

export interface IconProps {
    name: string;
    size?: number;
    className?: string;
    title?: string;
}

export function Icon({ name, size = 16, className, title }: IconProps): ReactElement {
    const paths = PATHS[name] ?? PATHS.text;
    return (
        <svg
            className={className ? `mxt-dg-icon ${className}` : "mxt-dg-icon"}
            width={size}
            height={size}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden={title ? undefined : true}
            role={title ? "img" : undefined}
            focusable="false"
        >
            {title ? <title>{title}</title> : null}
            {paths.map(d => (
                <path key={d} d={d} />
            ))}
        </svg>
    );
}
