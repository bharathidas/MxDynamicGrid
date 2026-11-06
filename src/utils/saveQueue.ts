import { compactOps, describeOps, inverseOps, isReflected, parseResult, serializeChangeSet } from "./changeSet";
import { ChangeOp, GridModel, SaveError } from "./types";

/**
 * The save pipeline of the change-set contract, independent of React and Mendix so it is unit tested:
 *
 *  push(ops) -> pending  --save()-->  inflight (written to the change set attribute, On save executed)
 *            --done, ok-->  saved (still overlaid until the data sources reflect the ops)  --> dropped
 *            --done, failed--> back to pending (never lost), errors shown, Retry saves again.
 *
 * Ops pushed while a save runs wait in pending and are sent by the next save.
 */

export interface SaveAdapter {
    /** Writes the change set JSON to the context attribute. */
    write(json: string): void;
    /** Runs the On save action. */
    execute(): void;
    canExecute(): boolean;
    isExecuting(): boolean;
    /** The result attribute value (undefined when not configured). */
    readResult(): string | undefined;
    /** Clears the result attribute before a save (no-op when not configured or read-only). */
    clearResult(): void;
    hasResult(): boolean;
    baseVersion(): number | null;
    /** Reloads the rows and columns data sources. */
    reload(): void;
    now(): number;
}

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface UndoEntry {
    label: string;
    ops: ChangeOp[];
    inverse: ChangeOp[];
}

interface SavedBatch {
    ops: ChangeOp[];
    finishedAt: number;
    dataVersion: number;
}

export interface QueueOptions {
    mode: "auto" | "manual";
    delay: number;
    undoLimit: number;
}

/** Time to wait for On save to report isExecuting before treating a silent action as finished. */
const SILENT_ACTION_MS = 1500;
/** Saved ops that the data sources do not show stay overlaid at most this long after the save. */
const OVERLAY_GRACE_MS = 5000;

export class SaveQueue {
    pending: ChangeOp[] = [];
    inflight: ChangeOp[] | null = null;
    saved: SavedBatch[] = [];
    undoStack: UndoEntry[] = [];
    redoStack: UndoEntry[] = [];
    status: SaveStatus = "idle";
    errors: SaveError[] = [];
    lastSentJson = "";
    /** Number of successful saves (for tests and the status bar). */
    saveCount = 0;

    private listeners = new Set<() => void>();
    private timer: ReturnType<typeof setTimeout> | undefined;
    private startedAt = 0;
    private sawExecuting = false;
    private dataVersion = 0;
    /** A save requested while another runs. */
    private queued = false;
    /** Validation hook: returns a message when saving is blocked. */
    blocker: (() => string | undefined) | undefined;

    constructor(private adapter: SaveAdapter, public options: QueueOptions) {}

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private emit(): void {
        this.listeners.forEach(listener => listener());
    }

    /** All ops that the overlay applies on top of the server model, oldest first. */
    overlayOps(): ChangeOp[] {
        const saved = this.saved.flatMap(batch => batch.ops);
        return [...saved, ...(this.inflight ?? []), ...this.pending];
    }

    get dirtyCount(): number {
        return this.pending.length + (this.inflight?.length ?? 0);
    }

    /** Adds user ops. `before` is the displayed model before the ops (for undo). */
    push(ops: ChangeOp[], before: GridModel, label?: string, recordUndo = true): void {
        if (!ops.length) {
            return;
        }
        if (recordUndo && this.options.undoLimit > 0) {
            this.undoStack.push({ label: label ?? describeOps(ops), ops, inverse: inverseOps(before, ops) });
            if (this.undoStack.length > this.options.undoLimit) {
                this.undoStack.shift();
            }
            this.redoStack = [];
        }
        this.pending = compactOps([...this.pending, ...ops]);
        if (this.status !== "saving") {
            this.status = "dirty";
        }
        this.emit();
        this.schedule();
    }

    undo(current: GridModel): UndoEntry | undefined {
        const entry = this.undoStack.pop();
        if (!entry) {
            return undefined;
        }
        // Recompute the inverse against the current model so interleaved edits are respected.
        this.redoStack.push({
            label: entry.label,
            ops: inverseOps(current, entry.inverse),
            inverse: entry.inverse
        });
        this.push(entry.inverse, current, entry.label, false);
        return entry;
    }

    redo(current: GridModel): UndoEntry | undefined {
        const entry = this.redoStack.pop();
        if (!entry) {
            return undefined;
        }
        const ops = entry.ops;
        this.undoStack.push({ label: entry.label, ops, inverse: inverseOps(current, ops) });
        this.pending = compactOps([...this.pending, ...ops]);
        this.status = this.status === "saving" ? "saving" : "dirty";
        this.emit();
        this.schedule();
        return entry;
    }

    private schedule(): void {
        if (this.options.mode !== "auto") {
            return;
        }
        if (this.timer) {
            clearTimeout(this.timer);
        }
        this.timer = setTimeout(() => {
            this.timer = undefined;
            this.save();
        }, Math.max(0, this.options.delay));
    }

    /** Sends the pending ops. Returns false when nothing was sent. */
    save(): boolean {
        if (this.inflight) {
            this.queued = true;
            return false;
        }
        if (!this.pending.length) {
            return false;
        }
        const blocked = this.blocker?.();
        if (blocked) {
            this.status = "error";
            this.errors = [{ message: blocked }];
            this.emit();
            return false;
        }
        if (!this.adapter.canExecute()) {
            this.status = "error";
            this.errors = [{ message: "The save action cannot run" }];
            this.emit();
            return false;
        }
        const ops = this.pending;
        const json = serializeChangeSet(ops, this.adapter.baseVersion());
        this.inflight = ops;
        this.pending = [];
        this.status = "saving";
        this.errors = [];
        this.sawExecuting = false;
        this.startedAt = this.adapter.now();
        this.lastSentJson = json;
        this.adapter.clearResult();
        this.adapter.write(json);
        this.adapter.execute();
        this.emit();
        return true;
    }

    /** Drops the unsaved ops of one row (conflict: "Reload" keeps the other user's version). */
    dropPendingForRow(rowKey: string): void {
        this.pending = this.pending.filter(op => !("row" in op) || op.row !== rowKey);
        if (!this.pending.length && this.status === "dirty") {
            this.status = "idle";
        }
        this.emit();
    }

    /** Throws away the unsaved ops (not the ones being saved). */
    discard(): void {
        this.pending = [];
        this.undoStack = [];
        this.redoStack = [];
        this.errors = [];
        this.status = this.inflight ? "saving" : "idle";
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
        this.emit();
    }

    /** Checks whether the running save finished. Call on every render and from a timer. */
    poll(): void {
        if (!this.inflight) {
            return;
        }
        if (this.adapter.isExecuting()) {
            this.sawExecuting = true;
            return;
        }
        const result = this.adapter.readResult();
        const hasResultValue = this.adapter.hasResult() && Boolean(result && result.trim());
        const silentTimeout = this.adapter.now() - this.startedAt > SILENT_ACTION_MS;
        if (!this.sawExecuting && !hasResultValue && !silentTimeout) {
            return;
        }
        if (this.adapter.hasResult() && !hasResultValue && !silentTimeout) {
            // Executed, but the result is not there yet: wait a little longer.
            return;
        }
        this.finish(parseResult(result));
    }

    private finish(result: ReturnType<typeof parseResult>): void {
        const ops = this.inflight ?? [];
        this.inflight = null;
        if (!result || result.ok) {
            this.saved.push({ ops, finishedAt: this.adapter.now(), dataVersion: this.dataVersion });
            this.saveCount++;
            this.errors = result?.errors ?? [];
            this.status = this.pending.length ? "dirty" : "saved";
            this.adapter.reload();
        } else {
            this.pending = compactOps([...ops, ...this.pending]);
            this.errors = result.errors.length ? result.errors : [{ message: "Save failed" }];
            this.status = "error";
        }
        this.emit();
        if (this.queued || (this.pending.length && this.options.mode === "auto" && this.status !== "error")) {
            this.queued = false;
            this.schedule();
        }
    }

    /** Called when the data sources deliver new data: drops saved ops they now reflect. */
    reconcile(server: GridModel): void {
        this.dataVersion++;
        if (!this.saved.length) {
            return;
        }
        const now = this.adapter.now();
        const before = this.saved.length;
        this.saved = this.saved
            .map(batch => ({ ...batch, ops: batch.ops.filter(op => !isReflected(server, op)) }))
            .filter(
                batch =>
                    batch.ops.length > 0 &&
                    this.dataVersion - batch.dataVersion < 3 &&
                    now - batch.finishedAt < OVERLAY_GRACE_MS
            );
        if (before !== this.saved.length) {
            this.emit();
        }
    }

    /** Drops expired saved batches (call from a timer). */
    expire(): void {
        const now = this.adapter.now();
        const kept = this.saved.filter(batch => now - batch.finishedAt < OVERLAY_GRACE_MS);
        if (kept.length !== this.saved.length) {
            this.saved = kept;
            this.emit();
        }
    }

    dispose(): void {
        if (this.timer) {
            clearTimeout(this.timer);
        }
        this.listeners.clear();
    }
}
