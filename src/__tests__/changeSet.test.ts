import {
    applyOps,
    compactOps,
    inverseOps,
    isReflected,
    newKey,
    parseResult,
    serializeChangeSet
} from "../utils/changeSet";
import { SaveAdapter, SaveQueue } from "../utils/saveQueue";
import { ChangeOp, GridModel } from "../utils/types";
import { col, model } from "./helpers";

describe("change set", () => {
    it("serialises v1 with the base version", () => {
        const json = serializeChangeSet([{ op: "deleteRow", row: "r1" }], 7);
        expect(JSON.parse(json)).toEqual({ v: 1, baseVersion: 7, ops: [{ op: "deleteRow", row: "r1" }] });
    });
    it("generates UUID v4 keys", () => {
        const keys = new Set(Array.from({ length: 50 }, newKey));
        expect(keys.size).toBe(50);
        keys.forEach(key =>
            expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
        );
    });
    it("parses results, also invalid ones", () => {
        expect(parseResult('{"ok":true,"version":3}')).toEqual({ ok: true, version: 3, errors: [] });
        expect(parseResult('{"ok":false,"errors":[{"row":"r1","col":"qty","message":"Too big"}]}')?.errors[0]).toEqual({
            row: "r1",
            col: "qty",
            message: "Too big"
        });
        expect(parseResult("")).toBeUndefined();
        expect(parseResult("boom")?.ok).toBe(false);
    });
});

describe("optimistic overlay", () => {
    const base = model();
    it("applies every op kind", () => {
        const ops: ChangeOp[] = [
            { op: "setCell", row: "r1", col: "name", value: "Uno" },
            { op: "addRow", row: "r9", index: 1, values: { name: "New" } },
            { op: "deleteRow", row: "r3" },
            { op: "moveRow", row: "r2", index: 0 },
            { op: "addColumn", col: { key: "due", caption: "Due", type: "date", index: 1 } },
            { op: "updateColumn", col: "qty", patch: { caption: "Quantity", type: "decimal" } },
            { op: "deleteColumn", col: "status" },
            { op: "moveColumn", col: "name", index: 2 }
        ];
        const result = applyOps(base, ops);
        expect(result.rows.map(r => r.key)).toEqual(["r2", "r1", "r9"]);
        expect(result.rows.find(r => r.key === "r1")?.values.name).toBe("Uno");
        expect(result.rows.find(r => r.key === "r9")?.pending).toBe(true);
        expect(result.columns.map(c => c.key)).toEqual(["due", "qty", "name"]);
        expect(result.columns.find(c => c.key === "qty")).toMatchObject({ caption: "Quantity", type: "decimal" });
        expect(result.rows.map(r => r.order)).toEqual([0, 1, 2]);
        expect(base.rows).toHaveLength(3);
    });
    it("ignores ops on unknown rows and columns", () => {
        const result = applyOps(base, [
            { op: "setCell", row: "nope", col: "x", value: 1 },
            { op: "deleteColumn", col: "nope" }
        ]);
        expect(result.rows).toEqual(base.rows);
    });
    it("knows when the server reflects an op", () => {
        const server: GridModel = applyOps(base, [{ op: "setCell", row: "r1", col: "qty", value: 9 }]);
        expect(isReflected(server, { op: "setCell", row: "r1", col: "qty", value: 9 })).toBe(true);
        expect(isReflected(server, { op: "setCell", row: "r1", col: "qty", value: 8 })).toBe(false);
        expect(isReflected(server, { op: "addRow", row: "r1", index: 0, values: {} })).toBe(true);
        expect(isReflected(server, { op: "deleteRow", row: "r1" })).toBe(false);
        expect(isReflected(server, { op: "updateColumn", col: "qty", patch: { caption: "Qty" } })).toBe(true);
    });
});

describe("inverse ops (undo)", () => {
    const base = model();
    it.each<[string, ChangeOp[]]>([
        ["setCell", [{ op: "setCell", row: "r1", col: "qty", value: 5 }]],
        ["addRow", [{ op: "addRow", row: "x", index: 0, values: { name: "X" } }]],
        ["deleteRow", [{ op: "deleteRow", row: "r2" }]],
        ["moveRow", [{ op: "moveRow", row: "r3", index: 0 }]],
        ["addColumn", [{ op: "addColumn", col: { key: "c", caption: "C", type: "text" } }]],
        ["deleteColumn", [{ op: "deleteColumn", col: "qty" }]],
        ["updateColumn", [{ op: "updateColumn", col: "name", patch: { caption: "Title", required: true } }]],
        ["moveColumn", [{ op: "moveColumn", col: "status", index: 0 }]]
    ])("%s round-trips", (_, ops) => {
        const after = applyOps(base, ops);
        const restored = applyOps(after, inverseOps(base, ops));
        expect(restored.columns.map(c => [c.key, c.caption, c.type, c.required])).toEqual(
            base.columns.map(c => [c.key, c.caption, c.type, c.required])
        );
        expect(restored.rows.map(r => [r.key, r.values])).toEqual(base.rows.map(r => [r.key, r.values]));
    });
});

describe("compaction", () => {
    it("keeps the last value of a cell", () => {
        expect(
            compactOps([
                { op: "setCell", row: "r1", col: "a", value: 1 },
                { op: "setCell", row: "r1", col: "a", value: 2 }
            ])
        ).toEqual([{ op: "setCell", row: "r1", col: "a", value: 2 }]);
    });
    it("merges cells into a pending addRow and drops added+deleted rows", () => {
        expect(
            compactOps([
                { op: "addRow", row: "n", index: 3, values: {} },
                { op: "setCell", row: "n", col: "a", value: "x" }
            ])
        ).toEqual([{ op: "addRow", row: "n", index: 3, values: { a: "x" } }]);
        expect(
            compactOps([
                { op: "addRow", row: "n", index: 3, values: {} },
                { op: "setCell", row: "n", col: "a", value: "x" },
                { op: "deleteRow", row: "n" }
            ])
        ).toEqual([]);
    });
    it("merges updates into a pending addColumn and drops added+deleted columns", () => {
        const added = compactOps([
            { op: "addColumn", col: { key: "c", caption: "C", type: "text" } },
            { op: "updateColumn", col: "c", patch: { caption: "Renamed" } }
        ]);
        expect(added).toEqual([{ op: "addColumn", col: { key: "c", caption: "Renamed", type: "text" } }]);
        expect(
            compactOps([
                { op: "addColumn", col: { key: "c", caption: "C", type: "text" } },
                { op: "setCell", row: "r1", col: "c", value: 1 },
                { op: "deleteColumn", col: "c" }
            ])
        ).toEqual([]);
    });
});

describe("save queue", () => {
    function setup(mode: "auto" | "manual" = "manual") {
        const state = { json: "", executing: false, result: "", now: 0, reloads: 0, executed: 0 };
        const adapter: SaveAdapter = {
            write: json => (state.json = json),
            execute: () => {
                state.executed++;
                state.executing = true;
            },
            canExecute: () => true,
            isExecuting: () => state.executing,
            readResult: () => state.result,
            hasResult: () => true,
            clearResult: () => (state.result = ""),
            baseVersion: () => 4,
            reload: () => state.reloads++,
            now: () => state.now
        };
        const queue = new SaveQueue(adapter, { mode, delay: 0, undoLimit: 10 });
        return { queue, state };
    }
    const base = model();

    it("sends pending ops, keeps the overlay until reflected", () => {
        const { queue, state } = setup();
        queue.push([{ op: "setCell", row: "r1", col: "qty", value: 7 }], base);
        expect(queue.dirtyCount).toBe(1);
        expect(queue.save()).toBe(true);
        expect(JSON.parse(state.json)).toEqual({
            v: 1,
            baseVersion: 4,
            ops: [{ op: "setCell", row: "r1", col: "qty", value: 7 }]
        });
        // Ops pushed while saving wait for the next save.
        queue.push([{ op: "setCell", row: "r2", col: "qty", value: 8 }], base);
        expect(queue.save()).toBe(false);
        queue.poll();
        state.executing = false;
        state.result = '{"ok":true,"version":5}';
        queue.poll();
        expect(queue.status).toBe("dirty");
        expect(state.reloads).toBe(1);
        expect(queue.overlayOps()).toHaveLength(2);
        queue.reconcile(applyOps(base, [{ op: "setCell", row: "r1", col: "qty", value: 7 }]));
        expect(queue.overlayOps()).toEqual([{ op: "setCell", row: "r2", col: "qty", value: 8 }]);
    });

    it("never loses edits when the save fails", () => {
        const { queue, state } = setup();
        queue.push([{ op: "setCell", row: "r1", col: "name", value: "X" }], base);
        queue.save();
        state.executing = false;
        state.result = '{"ok":false,"errors":[{"row":"r1","col":"name","message":"Nope"}]}';
        queue.poll();
        expect(queue.status).toBe("error");
        expect(queue.errors[0].message).toBe("Nope");
        expect(queue.pending).toEqual([{ op: "setCell", row: "r1", col: "name", value: "X" }]);
        state.result = "";
        queue.save();
        state.executing = false;
        state.result = '{"ok":true}';
        queue.poll();
        expect(queue.status).toBe("saved");
        expect(state.executed).toBe(2);
    });

    it("treats a silent action as finished after a timeout", () => {
        const { queue, state } = setup();
        queue.push([{ op: "deleteRow", row: "r1" }], base);
        queue.save();
        state.executing = false;
        queue.poll();
        expect(queue.status).toBe("saving");
        state.now = 2000;
        queue.poll();
        expect(queue.status).toBe("saved");
    });

    it("undoes and redoes", () => {
        const { queue } = setup();
        queue.push([{ op: "setCell", row: "r1", col: "qty", value: 9 }], base, "edit");
        const current = applyOps(base, queue.overlayOps());
        expect(queue.undo(current)?.label).toBe("edit");
        let shown = applyOps(base, queue.overlayOps());
        expect(shown.rows[0].values.qty).toBe(1);
        queue.redo(shown);
        shown = applyOps(base, queue.overlayOps());
        expect(shown.rows[0].values.qty).toBe(9);
    });

    it("blocks saving while the blocker reports invalid cells", () => {
        const { queue, state } = setup();
        queue.blocker = () => "Fix 1 invalid cells";
        queue.push([{ op: "setCell", row: "r1", col: "qty", value: -1 }], base);
        expect(queue.save()).toBe(false);
        expect(queue.status).toBe("error");
        expect(state.executed).toBe(0);
    });

    it("auto mode saves after the delay", async () => {
        const { queue, state } = setup("auto");
        queue.push([{ op: "addColumn", col: { key: "k", caption: "K", type: "text" } }], {
            ...base,
            columns: [...base.columns, col("x")]
        });
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(state.executed).toBe(1);
        queue.dispose();
    });
});
