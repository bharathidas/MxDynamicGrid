import { ColumnDef } from "./types";

/** Where an email, phone or link cell goes when clicked (also the Excel hyperlink); undefined for other text. */
export function cellHref(column: ColumnDef, text: string): string | undefined {
    switch (column.type) {
        case "email":
            return `mailto:${text}`;
        case "phone":
            return `tel:${text.replace(/[^\d+]/g, "")}`;
        case "link":
            return /^[a-z][a-z0-9+.-]*:/i.test(text)
                ? /^(https?|mailto|tel):/i.test(text)
                    ? text
                    : undefined
                : `https://${text}`;
        default:
            return undefined;
    }
}
