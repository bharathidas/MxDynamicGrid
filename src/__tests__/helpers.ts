import { ColumnDef, ColumnType, GridModel, RowRecord } from "../utils/types";

export function col(key: string, type: ColumnType = "text", extra: Partial<ColumnDef> = {}): ColumnDef {
    return {
        key,
        caption: extra.caption ?? key.charAt(0).toUpperCase() + key.slice(1),
        type,
        order: 0,
        pinned: null,
        hidden: false,
        required: false,
        readOnly: false,
        options: [],
        format: "",
        formula: "",
        headerGroup: "",
        description: "",
        validation: {},
        canEdit: true,
        ...extra
    };
}

export function row(key: string, values: RowRecord["values"], order = 0): RowRecord {
    return { key, values, order };
}

export function model(): GridModel {
    return {
        columns: [
            col("name"),
            col("qty", "number"),
            col("status", "select", {
                options: [
                    { value: "a", label: "Open" },
                    { value: "b", label: "Closed" }
                ]
            })
        ],
        rows: [
            row("r1", { name: "One", qty: 1, status: "a" }, 0),
            row("r2", { name: "Two", qty: 2, status: "b" }, 1),
            row("r3", { name: "Three", qty: 3 }, 2)
        ]
    };
}
