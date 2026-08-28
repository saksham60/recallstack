import type { SystemDesignPoint } from "../types/system-design.types";
import type { DragPreviewScheduler } from "./node-drag-preview";
import { MAX_STROKE_DELTA_POINTS, type StrokeOperation } from "./stroke-operation";

export const STROKE_BATCH_INTERVAL_MS = 24;
export const REMOTE_STROKE_TIMEOUT_MS = 3_000;
const MAX_PENDING_PREVIEW_POINTS = 1_024;

const defaultScheduler: DragPreviewScheduler = {
  now: () => performance.now(),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (handle) => clearTimeout(handle),
};

export class StrokeDeltaBroadcaster {
  private session: {
    strokeSessionId: string;
    diagramId: string;
    batchIndex: number;
    pending: SystemDesignPoint[];
    lastAttemptAt: number;
  } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: {
    send: (operation: StrokeOperation) => boolean;
    scheduler?: DragPreviewScheduler;
    createSessionId?: () => string;
  }) {}

  begin(diagramId: string, firstPoint: SystemDesignPoint): string {
    this.cancel();
    const activeScheduler = this.options.scheduler ?? defaultScheduler;
    const strokeSessionId = this.options.createSessionId?.() ?? crypto.randomUUID();
    this.session = {
      strokeSessionId,
      diagramId,
      batchIndex: 0,
      pending: [firstPoint],
      lastAttemptAt: activeScheduler.now(),
    };
    this.options.send({ kind: "stroke.start", strokeSessionId, diagramId, stroke: "#fafafa", strokeWidth: 3 });
    this.schedule();
    return strokeSessionId;
  }

  add(point: SystemDesignPoint): void {
    if (!this.session) return;
    this.session.pending.push(point);
    if (this.session.pending.length > MAX_PENDING_PREVIEW_POINTS) {
      this.session.pending = this.session.pending.filter((_, index) => index % 2 === 0).slice(-MAX_PENDING_PREVIEW_POINTS);
    }
    this.schedule();
  }

  end(): void {
    const session = this.session;
    if (!session) return;
    this.clearTimer();
    while (session.pending.length > 0 && this.flush(false)) {
      // Flush bounded remaining batches when the socket is writable.
    }
    this.options.send({ kind: "stroke.end", strokeSessionId: session.strokeSessionId, diagramId: session.diagramId });
    this.session = null;
  }

  cancel(): void { this.clearTimer(); this.session = null; }

  private schedule(): void {
    if (!this.session || this.timer !== null) return;
    const activeScheduler = this.options.scheduler ?? defaultScheduler;
    const delay = Math.max(0, STROKE_BATCH_INTERVAL_MS - (activeScheduler.now() - this.session.lastAttemptAt));
    this.timer = activeScheduler.setTimeout(() => {
      this.timer = null;
      if (this.flush(true) && this.session?.pending.length) this.schedule();
    }, delay);
  }

  private flush(retry: boolean): boolean {
    const session = this.session;
    if (!session || session.pending.length === 0) return false;
    const activeScheduler = this.options.scheduler ?? defaultScheduler;
    session.lastAttemptAt = activeScheduler.now();
    const points = session.pending.slice(0, MAX_STROKE_DELTA_POINTS);
    const operation: StrokeOperation = {
      kind: "stroke.delta", strokeSessionId: session.strokeSessionId,
      diagramId: session.diagramId, batchIndex: session.batchIndex + 1, points,
    };
    if (this.options.send(operation)) {
      session.pending.splice(0, points.length);
      session.batchIndex = operation.batchIndex;
      return true;
    }
    if (retry) this.schedule();
    return false;
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    (this.options.scheduler ?? defaultScheduler).clearTimeout(this.timer);
    this.timer = null;
  }
}

export interface RemoteStrokePreview {
  key: string;
  actorId: string;
  strokeSessionId: string;
  diagramId: string;
  stroke: string;
  strokeWidth: number;
  points: SystemDesignPoint[];
}

interface RemoteStrokeSession extends RemoteStrokePreview {
  lastBatchIndex: number;
  lastSeenAt: number;
  ended: boolean;
}

export class RemoteStrokeRegistry {
  private readonly sessions = new Map<string, RemoteStrokeSession>();
  private readonly closed = new Set<string>();

  apply(actorId: string, operation: StrokeOperation, now: number): boolean {
    const key = `${actorId}\u0000${operation.strokeSessionId}`;
    if (this.closed.has(key)) return false;
    let session = this.sessions.get(key);
    if (operation.kind === "stroke.start") {
      if (session) { session.lastSeenAt = now; return false; }
      this.sessions.set(key, {
        key, actorId, strokeSessionId: operation.strokeSessionId,
        diagramId: operation.diagramId, stroke: operation.stroke,
        strokeWidth: operation.strokeWidth, points: [], lastBatchIndex: 0,
        lastSeenAt: now, ended: false,
      });
      return true;
    }
    if (!session && operation.kind === "stroke.delta") {
      session = {
        key, actorId, strokeSessionId: operation.strokeSessionId,
        diagramId: operation.diagramId, stroke: "#fafafa", strokeWidth: 3,
        points: [], lastBatchIndex: 0, lastSeenAt: now, ended: false,
      };
      this.sessions.set(key, session);
    }
    if (!session || session.diagramId !== operation.diagramId) return false;
    session.lastSeenAt = now;
    if (operation.kind === "stroke.end") { session.ended = true; return false; }
    if (session.ended || operation.batchIndex !== session.lastBatchIndex + 1) return false;
    session.lastBatchIndex = operation.batchIndex;
    session.points.push(...operation.points);
    if (session.points.length > 10_000) session.points = session.points.slice(-10_000);
    return true;
  }

  previews(diagramId: string): RemoteStrokePreview[] {
    return [...this.sessions.values()]
      .filter((session) => session.diagramId === diagramId)
      .map((session) => ({
        key: session.key,
        actorId: session.actorId,
        strokeSessionId: session.strokeSessionId,
        diagramId: session.diagramId,
        stroke: session.stroke,
        strokeWidth: session.strokeWidth,
        points: [...session.points],
      }));
  }

  clearCommitted(strokeSessionId: string): boolean {
    const session = [...this.sessions.values()].find((candidate) => candidate.strokeSessionId === strokeSessionId);
    if (!session) return false;
    this.clear(session);
    return true;
  }

  expire(now: number, timeout = REMOTE_STROKE_TIMEOUT_MS): boolean {
    let changed = false;
    [...this.sessions.values()].forEach((session) => {
      if (now - session.lastSeenAt >= timeout) { this.clear(session); changed = true; }
    });
    return changed;
  }

  clearAll(): void { [...this.sessions.values()].forEach((session) => this.clear(session)); }
  get hasSessions(): boolean { return this.sessions.size > 0; }

  private clear(session: RemoteStrokeSession): void {
    this.sessions.delete(session.key);
    this.closed.add(session.key);
    if (this.closed.size > 512) this.closed.delete(this.closed.values().next().value!);
  }
}
