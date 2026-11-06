import { typeInfo } from "./columnTypes";
import { formatValue } from "./values";
import { ColumnDef, RowRecord } from "./types";

/** Print-friendly HTML of the current view (title, filter summary, table), printed from a hidden frame. */

function escapeHtml(text: string): string {
    return text.replace(/[&<>"]/g, c => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"));
}

export function printHtml(
    title: string,
    summary: string,
    columns: ColumnDef[],
    rows: RowRecord[],
    stamp = new Date()
): string {
    const head = columns.map(c => `<th class="${typeInfo(c.type).align}">${escapeHtml(c.caption)}</th>`).join("");
    const body = rows
        .map(
            row =>
                `<tr>${columns
                    .map(
                        c =>
                            `<td class="${typeInfo(c.type).align}">${escapeHtml(
                                c.type === "boolean"
                                    ? row.values[c.key] === true
                                        ? "✓"
                                        : ""
                                    : formatValue(c, row.values[c.key])
                            )}</td>`
                    )
                    .join("")}</tr>`
        )
        .join("");
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#111827;margin:24px}
h1{font-size:18px;margin:0 0 4px}p{margin:0 0 12px;color:#6b7280;font-size:12px}
table{border-collapse:collapse;width:100%;font-size:11px}th,td{border-bottom:1px solid #e5e7eb;padding:5px 6px;text-align:left;vertical-align:top}
th{background:#f3f4f6;font-weight:600}td.right,th.right{text-align:right}td.center,th.center{text-align:center}
thead{display:table-header-group}tr{page-break-inside:avoid}@page{margin:12mm}
</style></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(summary)} · ${escapeHtml(stamp.toLocaleString())} · ${
        rows.length
    } rows</p>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}

/** Prints through a hidden iframe so the page itself is untouched. */
export function printView(html: string): void {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc || !frame.contentWindow) {
        frame.remove();
        return;
    }
    doc.open();
    doc.write(html);
    doc.close();
    window.setTimeout(() => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        window.setTimeout(() => frame.remove(), 1000);
    }, 100);
}
