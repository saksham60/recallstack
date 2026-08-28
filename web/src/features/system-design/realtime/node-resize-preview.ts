import type { SystemDesignRect } from "../types/system-design.types";
import {
  NODE_DRAG_PREVIEW_INTERVAL_MS,
  REMOTE_NODE_DRAG_TIMEOUT_MS,
  type DragPreviewScheduler,
} from "./node-drag-preview";
import type { NodeResizeOperation } from "./node-resize-operation";

type TimerHandle = ReturnType<typeof setTimeout>;
const scheduler: DragPreviewScheduler = {
  now: () => performance.now(),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (handle) => clearTimeout(handle),
};

export class NodeResizePreviewBroadcaster {
  private session: {
    dragSessionId: string;
    diagramId: string;
    nodeId: string;
    previewIndex: number;
    lastAttemptAt: number;
    pending: SystemDesignRect | null;
  } | null = null;
  private timer: TimerHandle | null = null;

  constructor(private readonly options: {
    send: (operation: NodeResizeOperation) => boolean;
    scheduler?: DragPreviewScheduler;
    createSessionId?: () => string;
  }) {}

  begin(diagramId: string, nodeId: string): void {
    this.cancel();
    const activeScheduler = this.options.scheduler ?? scheduler;
    this.session = {
      dragSessionId: this.options.createSessionId?.() ?? crypto.randomUUID(),
      diagramId,
      nodeId,
      previewIndex: 0,
      lastAttemptAt: activeScheduler.now(),
      pending: null,
    };
    this.options.send({
      kind: "node.resize.start",
      dragSessionId: this.session.dragSessionId,
      diagramId,
      nodeId,
    });
  }

  preview(frame: SystemDesignRect): void {
    if (!this.session) return;
    this.session.pending = frame;
    this.schedule();
  }

  end(): void {
    const session = this.session;
    if (!session) return;
    this.clearTimer();
    this.flush(false);
    this.options.send({
      kind: "node.resize.end",
      dragSessionId: session.dragSessionId,
      diagramId: session.diagramId,
      nodeId: session.nodeId,
    });
    this.session = null;
  }

  cancel(): void {
    this.clearTimer();
    this.session = null;
  }

  private schedule(): void {
    if (!this.session || this.timer !== null) return;
    const activeScheduler = this.options.scheduler ?? scheduler;
    const elapsed = activeScheduler.now() - this.session.lastAttemptAt;
    this.timer = activeScheduler.setTimeout(() => {
      this.timer = null;
      this.flush(true);
    }, Math.max(0, NODE_DRAG_PREVIEW_INTERVAL_MS - elapsed));
  }

  private flush(retry: boolean): void {
    const session = this.session;
    if (!session?.pending) return;
    const activeScheduler = this.options.scheduler ?? scheduler;
    session.lastAttemptAt = activeScheduler.now();
    const operation: NodeResizeOperation = {
      kind: "node.resize.preview",
      dragSessionId: session.dragSessionId,
      diagramId: session.diagramId,
      nodeId: session.nodeId,
      previewIndex: session.previewIndex + 1,
      frame: session.pending,
    };
    if (this.options.send(operation)) {
      session.previewIndex = operation.previewIndex;
      session.pending = null;
    } else if (retry) {
      this.schedule();
    }
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    (this.options.scheduler ?? scheduler).clearTimeout(this.timer);
    this.timer = null;
  }
}

interface RemoteResizeSession {
  key: string;
  diagramId: string;
  nodeId: string;
  frame?: SystemDesignRect;
  previewIndex: number;
  lastSeenAt: number;
  ended: boolean;
}

export class RemoteNodeResizeRegistry {
  private readonly sessions = new Map<string, RemoteResizeSession>();
  private readonly owners = new Map<string, string>();
  private readonly closed = new Set<string>();

  apply(actorId: string, operation: NodeResizeOperation, now: number): boolean {
    const key = `${actorId}\u0000${operation.dragSessionId}`;
    if (this.closed.has(key)) return false;
    let session = this.sessions.get(key);
    if (operation.kind === "node.resize.start") {
      if (session) {
        session.lastSeenAt = now;
        return false;
      }
      const ownerKey = `${operation.diagramId}\u0000${operation.nodeId}`;
      if (this.owners.has(ownerKey)) return false;
      session = {
        key,
        diagramId: operation.diagramId,
        nodeId: operation.nodeId,
        previewIndex: 0,
        lastSeenAt: now,
        ended: false,
      };
      this.sessions.set(key, session);
      this.owners.set(ownerKey, key);
      return true;
    }
    if (!session && operation.kind === "node.resize.preview") {
      this.apply(actorId, {
        kind: "node.resize.start",
        dragSessionId: operation.dragSessionId,
        diagramId: operation.diagramId,
        nodeId: operation.nodeId,
      }, now);
      session = this.sessions.get(key);
    }
    if (!session || session.ended || session.diagramId !== operation.diagramId ||
        session.nodeId !== operation.nodeId) return false;
    session.lastSeenAt = now;
    if (operation.kind === "node.resize.end") {
      session.ended = true;
      return false;
    }
    if (operation.previewIndex <= session.previewIndex) return false;
    session.previewIndex = operation.previewIndex;
    session.frame = operation.frame;
    return true;
  }

  frames(diagramId: string): Record<string, SystemDesignRect> {
    return Object.fromEntries(
      [...this.sessions.values()].flatMap((session) =>
        session.diagramId === diagramId && session.frame
          ? [[session.nodeId, session.frame] as const]
          : [],
      ),
    );
  }

  ownedNodeIds(diagramId: string): Set<string> {
    return new Set(
      [...this.sessions.values()]
        .filter((session) => session.diagramId === diagramId)
        .map((session) => session.nodeId),
    );
  }

  clearCommitted(diagramId: string, nodeId: string): boolean {
    const owner = this.owners.get(`${diagramId}\u0000${nodeId}`);
    const session = owner ? this.sessions.get(owner) : undefined;
    if (!session) return false;
    this.clearSession(session);
    return true;
  }

  expire(now: number, timeout = REMOTE_NODE_DRAG_TIMEOUT_MS): boolean {
    let changed = false;
    [...this.sessions.values()].forEach((session) => {
      if (now - session.lastSeenAt >= timeout) {
        this.clearSession(session);
        changed = true;
      }
    });
    return changed;
  }

  clearAll(): void {
    [...this.sessions.values()].forEach((session) => this.clearSession(session));
  }

  get hasSessions(): boolean { return this.sessions.size > 0; }

  private clearSession(session: RemoteResizeSession): void {
    this.sessions.delete(session.key);
    this.owners.delete(`${session.diagramId}\u0000${session.nodeId}`);
    this.closed.add(session.key);
    if (this.closed.size > 512) this.closed.delete(this.closed.values().next().value!);
  }
}
