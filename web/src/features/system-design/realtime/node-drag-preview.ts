import type { SystemDesignPoint } from "../types/system-design.types";
import type {
  NodeDragEndOperation,
  NodeDragOperation,
  NodeDragPreviewOperation,
  NodeDragStartOperation,
} from "./node-drag-operation";

export const NODE_DRAG_PREVIEW_INTERVAL_MS = 33;
export const REMOTE_NODE_DRAG_TIMEOUT_MS = 3_000;

type TimerHandle = ReturnType<typeof setTimeout>;

export interface DragPreviewScheduler {
  now: () => number;
  setTimeout: (callback: () => void, delay: number) => TimerHandle;
  clearTimeout: (handle: TimerHandle) => void;
}

const DEFAULT_SCHEDULER: DragPreviewScheduler = {
  now: () => performance.now(),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (handle) => clearTimeout(handle),
};

interface LocalDragSession {
  dragSessionId: string;
  diagramId: string;
  nodeIds: string[];
  previewIndex: number;
  lastAttemptAt: number;
  pendingPositions: Record<string, SystemDesignPoint> | null;
}

export class NodeDragPreviewBroadcaster {
  private readonly send: (operation: NodeDragOperation) => boolean;
  private readonly scheduler: DragPreviewScheduler;
  private readonly createSessionId: () => string;
  private session: LocalDragSession | null = null;
  private timer: TimerHandle | null = null;

  constructor(options: {
    send: (operation: NodeDragOperation) => boolean;
    scheduler?: DragPreviewScheduler;
    createSessionId?: () => string;
  }) {
    this.send = options.send;
    this.scheduler = options.scheduler ?? DEFAULT_SCHEDULER;
    this.createSessionId = options.createSessionId ?? (() => crypto.randomUUID());
  }

  begin(diagramId: string, nodeIds: readonly string[]): string {
    this.cancel();
    const dragSessionId = this.createSessionId();
    const session: LocalDragSession = {
      dragSessionId,
      diagramId,
      nodeIds: [...nodeIds],
      previewIndex: 0,
      lastAttemptAt: this.scheduler.now(),
      pendingPositions: null,
    };
    this.session = session;
    const operation: NodeDragStartOperation = {
      kind: "node.drag.start",
      dragSessionId,
      diagramId,
      nodeIds: session.nodeIds,
    };
    this.send(operation);
    return dragSessionId;
  }

  preview(positions: Readonly<Record<string, SystemDesignPoint>>): void {
    const session = this.session;
    if (!session) return;
    const allowedNodeIds = new Set(session.nodeIds);
    const latest = Object.fromEntries(
      Object.entries(positions).filter(([nodeId]) => allowedNodeIds.has(nodeId)),
    );
    if (Object.keys(latest).length === 0) return;
    session.pendingPositions = latest;
    this.scheduleFlush();
  }

  end(): void {
    const session = this.session;
    if (!session) return;
    this.clearTimer();
    this.flush(false);
    const operation: NodeDragEndOperation = {
      kind: "node.drag.end",
      dragSessionId: session.dragSessionId,
      diagramId: session.diagramId,
      nodeIds: session.nodeIds,
    };
    this.send(operation);
    this.session = null;
  }

  cancel(): void {
    this.clearTimer();
    this.session = null;
  }

  private scheduleFlush(): void {
    if (!this.session || this.timer !== null) return;
    const elapsed = this.scheduler.now() - this.session.lastAttemptAt;
    const delay = Math.max(0, NODE_DRAG_PREVIEW_INTERVAL_MS - elapsed);
    this.timer = this.scheduler.setTimeout(() => {
      this.timer = null;
      this.flush(true);
    }, delay);
  }

  private flush(retryOnBackpressure: boolean): void {
    const session = this.session;
    if (!session?.pendingPositions) return;
    session.lastAttemptAt = this.scheduler.now();
    const operation: NodeDragPreviewOperation = {
      kind: "node.drag.preview",
      dragSessionId: session.dragSessionId,
      diagramId: session.diagramId,
      previewIndex: session.previewIndex + 1,
      positions: session.pendingPositions,
    };
    if (this.send(operation)) {
      session.previewIndex = operation.previewIndex;
      session.pendingPositions = null;
      return;
    }
    if (retryOnBackpressure) this.scheduleFlush();
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    this.scheduler.clearTimeout(this.timer);
    this.timer = null;
  }
}

interface RemoteDragSession {
  key: string;
  actorId: string;
  dragSessionId: string;
  diagramId: string;
  nodeIds: Set<string>;
  positions: Record<string, SystemDesignPoint>;
  lastPreviewIndex: number;
  lastSeenAt: number;
  ended: boolean;
}

export interface RemoteDragMutation {
  diagramId: string;
  previewPositions: Record<string, SystemDesignPoint>;
  clearedNodeIds: string[];
  ownershipChanged: boolean;
}

const MAX_CLOSED_DRAG_SESSIONS = 512;

export class RemoteNodeDragRegistry {
  private readonly sessions = new Map<string, RemoteDragSession>();
  private readonly nodeOwners = new Map<string, string>();
  private readonly closedSessions = new Set<string>();
  private readonly closedOrder: string[] = [];

  apply(
    actorId: string,
    operation: NodeDragOperation,
    now: number,
  ): RemoteDragMutation | null {
    const key = this.sessionKey(actorId, operation.dragSessionId);
    if (this.closedSessions.has(key)) return null;
    if (operation.kind === "node.drag.start") {
      return this.start(key, actorId, operation, now);
    }
    if (operation.kind === "node.drag.preview") {
      return this.preview(key, actorId, operation, now);
    }
    return this.end(key, operation, now);
  }

  ownedNodeIds(diagramId: string): Set<string> {
    const nodeIds = new Set<string>();
    this.nodeOwners.forEach((sessionKey, ownerKey) => {
      const session = this.sessions.get(sessionKey);
      if (session?.diagramId === diagramId) {
        nodeIds.add(ownerKey.slice(diagramId.length + 1));
      }
    });
    return nodeIds;
  }

  hasActiveSessions(): boolean {
    return this.sessions.size > 0;
  }

  positionsForDiagram(diagramId: string): Record<string, SystemDesignPoint> {
    const positions: Record<string, SystemDesignPoint> = {};
    this.sessions.forEach((session) => {
      if (session.diagramId !== diagramId) return;
      Object.entries(session.positions).forEach(([nodeId, point]) => {
        if (this.nodeOwners.get(this.ownerKey(diagramId, nodeId)) === session.key) {
          positions[nodeId] = point;
        }
      });
    });
    return positions;
  }

  clearCommitted(diagramId: string, nodeIds: readonly string[]): RemoteDragMutation {
    return this.clearNodes(diagramId, nodeIds, true);
  }

  expire(now: number, timeout = REMOTE_NODE_DRAG_TIMEOUT_MS): RemoteDragMutation[] {
    const mutations: RemoteDragMutation[] = [];
    for (const session of [...this.sessions.values()]) {
      if (now - session.lastSeenAt < timeout) continue;
      mutations.push(this.clearSession(session, true));
    }
    return mutations;
  }

  clearAll(): RemoteDragMutation[] {
    return [...this.sessions.values()].map((session) =>
      this.clearSession(session, true),
    );
  }

  private start(
    key: string,
    actorId: string,
    operation: NodeDragStartOperation,
    now: number,
  ): RemoteDragMutation {
    const existing = this.sessions.get(key);
    if (existing) {
      existing.lastSeenAt = now;
      return this.mutation(existing.diagramId, {}, [], false);
    }
    const session: RemoteDragSession = {
      key,
      actorId,
      dragSessionId: operation.dragSessionId,
      diagramId: operation.diagramId,
      nodeIds: new Set(),
      positions: {},
      lastPreviewIndex: 0,
      lastSeenAt: now,
      ended: false,
    };
    operation.nodeIds.forEach((nodeId) => {
      const ownerKey = this.ownerKey(operation.diagramId, nodeId);
      if (this.nodeOwners.has(ownerKey)) return;
      this.nodeOwners.set(ownerKey, key);
      session.nodeIds.add(nodeId);
    });
    this.sessions.set(key, session);
    return this.mutation(
      operation.diagramId,
      {},
      [],
      session.nodeIds.size > 0,
    );
  }

  private preview(
    key: string,
    actorId: string,
    operation: NodeDragPreviewOperation,
    now: number,
  ): RemoteDragMutation | null {
    let session = this.sessions.get(key);
    let ownershipChanged = false;
    if (!session) {
      const started = this.start(
        key,
        actorId,
        {
          kind: "node.drag.start",
          dragSessionId: operation.dragSessionId,
          diagramId: operation.diagramId,
          nodeIds: Object.keys(operation.positions),
        },
        now,
      );
      ownershipChanged = started.ownershipChanged;
      session = this.sessions.get(key);
    }
    if (
      !session ||
      session.ended ||
      session.diagramId !== operation.diagramId ||
      operation.previewIndex <= session.lastPreviewIndex
    ) {
      return null;
    }
    session.lastSeenAt = now;
    session.lastPreviewIndex = operation.previewIndex;
    const previewPositions: Record<string, SystemDesignPoint> = {};
    Object.entries(operation.positions).forEach(([nodeId, point]) => {
      if (
        session?.nodeIds.has(nodeId) &&
        this.nodeOwners.get(this.ownerKey(operation.diagramId, nodeId)) === key
      ) {
        session.positions[nodeId] = point;
        previewPositions[nodeId] = point;
      }
    });
    return this.mutation(
      operation.diagramId,
      previewPositions,
      [],
      ownershipChanged,
    );
  }

  private end(
    key: string,
    operation: NodeDragEndOperation,
    now: number,
  ): RemoteDragMutation | null {
    const session = this.sessions.get(key);
    if (!session || session.diagramId !== operation.diagramId) return null;
    session.ended = true;
    session.lastSeenAt = now;
    return this.mutation(operation.diagramId, {}, [], false);
  }

  private clearNodes(
    diagramId: string,
    nodeIds: readonly string[],
    closeEmptySessions: boolean,
  ): RemoteDragMutation {
    let ownershipChanged = false;
    const clearedNodeIds: string[] = [];
    nodeIds.forEach((nodeId) => {
      const ownerKey = this.ownerKey(diagramId, nodeId);
      const sessionKey = this.nodeOwners.get(ownerKey);
      if (!sessionKey) return;
      const session = this.sessions.get(sessionKey);
      this.nodeOwners.delete(ownerKey);
      session?.nodeIds.delete(nodeId);
      if (session) delete session.positions[nodeId];
      clearedNodeIds.push(nodeId);
      ownershipChanged = true;
      if (session && session.nodeIds.size === 0) {
        this.sessions.delete(session.key);
        if (closeEmptySessions) this.rememberClosed(session.key);
      }
    });
    return this.mutation(
      diagramId,
      {},
      clearedNodeIds,
      ownershipChanged,
    );
  }

  private clearSession(
    session: RemoteDragSession,
    rememberClosed: boolean,
  ): RemoteDragMutation {
    const clearedNodeIds: string[] = [];
    session.nodeIds.forEach((nodeId) => {
      const ownerKey = this.ownerKey(session.diagramId, nodeId);
      if (this.nodeOwners.get(ownerKey) !== session.key) return;
      this.nodeOwners.delete(ownerKey);
      clearedNodeIds.push(nodeId);
    });
    this.sessions.delete(session.key);
    if (rememberClosed) this.rememberClosed(session.key);
    return this.mutation(
      session.diagramId,
      {},
      clearedNodeIds,
      clearedNodeIds.length > 0,
    );
  }

  private mutation(
    diagramId: string,
    previewPositions: Record<string, SystemDesignPoint>,
    clearedNodeIds: string[],
    ownershipChanged: boolean,
  ): RemoteDragMutation {
    return { diagramId, previewPositions, clearedNodeIds, ownershipChanged };
  }

  private sessionKey(actorId: string, dragSessionId: string): string {
    return `${actorId}\u0000${dragSessionId}`;
  }

  private ownerKey(diagramId: string, nodeId: string): string {
    return `${diagramId}\u0000${nodeId}`;
  }

  private rememberClosed(key: string): void {
    if (this.closedSessions.has(key)) return;
    this.closedSessions.add(key);
    this.closedOrder.push(key);
    if (this.closedOrder.length > MAX_CLOSED_DRAG_SESSIONS) {
      const oldest = this.closedOrder.shift();
      if (oldest) this.closedSessions.delete(oldest);
    }
  }
}
