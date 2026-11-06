import { newKey } from "./changeSet";
import { OPTION_COLORS } from "./columnTypes";
import { CellValue, ChangeOp, ColumnPayload, SelectOption } from "./types";

/** Starter templates for an empty grid: field definitions plus a few sample rows, emitted as change-set ops. */

export type TemplateId = "tasks" | "crm" | "inventory" | "budget" | "blank";

const opts = (...labels: string[]): SelectOption[] =>
    labels.map((label, index) => ({
        value: label.toLowerCase().replace(/\s+/g, "-"),
        label,
        color: OPTION_COLORS[index % OPTION_COLORS.length]
    }));

interface TemplateField extends Omit<ColumnPayload, "key"> {
    id: string;
}

interface TemplateSpec {
    fields: TemplateField[];
    rows: Array<Record<string, CellValue>>;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function spec(id: TemplateId): TemplateSpec {
    switch (id) {
        case "tasks":
            return {
                fields: [
                    { id: "name", caption: "Task", type: "text", required: true, width: 240 },
                    { id: "status", caption: "Status", type: "select", options: opts("To do", "In progress", "Done") },
                    { id: "owner", caption: "Owner", type: "user" },
                    { id: "due", caption: "Due date", type: "date" },
                    { id: "priority", caption: "Priority", type: "select", options: opts("Low", "Medium", "High") },
                    { id: "done", caption: "Done", type: "boolean" }
                ],
                rows: [
                    { name: "Plan kick-off", status: "done", owner: "Ann Lee", priority: "medium", done: true },
                    { name: "Collect requirements", status: "in-progress", owner: "Bob Ray", priority: "high" },
                    { name: "Design data model", status: "to-do", owner: "Ann Lee", priority: "medium" }
                ]
            };
        case "crm":
            return {
                fields: [
                    { id: "company", caption: "Company", type: "text", required: true, width: 220 },
                    { id: "contact", caption: "Contact", type: "user" },
                    { id: "email", caption: "Email", type: "email" },
                    { id: "phone", caption: "Phone", type: "phone" },
                    {
                        id: "stage",
                        caption: "Deal stage",
                        type: "select",
                        options: opts("Lead", "Qualified", "Proposal", "Won", "Lost")
                    },
                    { id: "value", caption: "Deal value", type: "currency", format: "€ #,##0" }
                ],
                rows: [
                    {
                        company: "Acme Corp",
                        contact: "Jane Doe",
                        email: "jane@acme.example",
                        stage: "qualified",
                        value: 12000
                    },
                    {
                        company: "Globex",
                        contact: "Sam Hill",
                        email: "sam@globex.example",
                        stage: "proposal",
                        value: 30000
                    }
                ]
            };
        case "inventory":
            return {
                fields: [
                    { id: "sku", caption: "SKU", type: "text", required: true, validation: { unique: true } },
                    { id: "product", caption: "Product", type: "text", width: 220 },
                    { id: "onHand", caption: "On hand", type: "number" },
                    { id: "price", caption: "Unit price", type: "currency", format: "€ #,##0.00" },
                    {
                        id: "value",
                        caption: "Stock value",
                        type: "formula",
                        formula: "[onHand] * [price]",
                        format: "€ #,##0.00"
                    }
                ],
                rows: [
                    { sku: "BOX-001", product: "Storage box", onHand: 120, price: 4.5 },
                    { sku: "LMP-002", product: "Desk lamp", onHand: 35, price: 29.9 }
                ]
            };
        case "budget":
            return {
                fields: [
                    { id: "line", caption: "Cost line", type: "text", required: true, width: 200 },
                    ...MONTHS.map((month, index) => ({
                        id: `m${index + 1}`,
                        caption: month,
                        type: "currency" as const,
                        format: "€ #,##0",
                        width: 100,
                        headerGroup: `Q${Math.floor(index / 3) + 1}`
                    })),
                    {
                        id: "total",
                        caption: "Year total",
                        type: "formula",
                        format: "€ #,##0",
                        formula: `SUM(${MONTHS.map((_, i) => `[m${i + 1}]`).join(", ")})`
                    }
                ],
                rows: [
                    { line: "Salaries", ...Object.fromEntries(MONTHS.map((_, i) => [`m${i + 1}`, 42000])) },
                    { line: "Software", ...Object.fromEntries(MONTHS.map((_, i) => [`m${i + 1}`, 3500])) }
                ]
            };
        default:
            return { fields: [{ id: "name", caption: "Name", type: "text", required: true, width: 240 }], rows: [] };
    }
}

/** Ops that create the template's fields (fresh keys) and sample rows, appended after `columnCount` columns. */
export function templateOps(id: TemplateId, columnCount: number, rowCount: number, withRows = true): ChangeOp[] {
    const { fields, rows } = spec(id);
    const keys = new Map(fields.map(field => [field.id, newKey()]));
    const ops: ChangeOp[] = fields.map((field, index) => {
        const { id: fieldId, ...rest } = field;
        const payload: ColumnPayload = { ...rest, key: keys.get(fieldId) as string, index: columnCount + index };
        if (payload.formula) {
            let formula = payload.formula;
            keys.forEach((key, local) => {
                formula = formula.split(`[${local}]`).join(`[${key}]`);
            });
            payload.formula = formula;
        }
        return { op: "addColumn", col: payload };
    });
    if (withRows) {
        rows.forEach((values, index) => {
            const mapped: Record<string, CellValue> = {};
            Object.entries(values).forEach(([local, value]) => {
                const key = keys.get(local);
                if (key) {
                    mapped[key] = value;
                }
            });
            ops.push({ op: "addRow", row: newKey(), index: rowCount + index, values: mapped });
        });
    }
    return ops;
}

export const TEMPLATES: Array<{ id: TemplateId; icon: string }> = [
    { id: "tasks", icon: "boolean" },
    { id: "crm", icon: "user" },
    { id: "inventory", icon: "number" },
    { id: "budget", icon: "currency" },
    { id: "blank", icon: "plus" }
];
