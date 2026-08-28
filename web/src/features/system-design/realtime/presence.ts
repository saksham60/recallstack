import type { SystemDesignPoint } from "../types/system-design.types";
import type { DragPreviewScheduler } from "./node-drag-preview";

export interface RealtimeCursor extends SystemDesignPoint {
  diagramId: string;
}

export interface CollaborationParticipant {
  actorId: string;
  displayName: string;
  color: string;
  cursor?: RealtimeCursor;
  viewingDiagramId?: string;
  isLocal: boolean;
}

export type PresencePayload =
  | { status: "joined" | "left" }
  | {
      displayName: string;
      viewingDiagramId?: string;
      cursor?: RealtimeCursor;
    };

const COLORS = [
  "#a78bfa", "#22d3ee", "#34d399", "#fbbf24", "#fb7185",
  "#60a5fa", "#f472b6", "#a3e635", "#f97316", "#2dd4bf",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function actorHash(actorId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < actorId.length; index += 1) {
    hash ^= actorId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function participantDefaults(
  actorId: string,
  isLocal = false,
): CollaborationParticipant {
  const hash = actorHash(actorId);
  return {
    actorId,
    displayName: isLocal ? "You" : `Guest ${String(hash % 100).padStart(2, "0")}`,
    color: COLORS[hash % COLORS.length],
    isLocal,
  };
}

export function parsePresencePayload(value: unknown): PresencePayload {
  if (!isRecord(value)) throw new Error("Invalid presence payload.");
  if (value.status === "joined" || value.status === "left") {
    return { status: value.status };
  }
  if (
    typeof value.displayName !== "string" ||
    value.displayName.trim().length === 0 ||
    value.displayName.length > 80 ||
    (value.viewingDiagramId !== undefined &&
      (typeof value.viewingDiagramId !== "string" ||
        value.viewingDiagramId.length > 256))
  ) {
    throw new Error("Invalid participant presence.");
  }
  let cursor: RealtimeCursor | undefined;
  if (value.cursor !== undefined) {
    if (
      !isRecord(value.cursor) ||
      typeof value.cursor.diagramId !== "string" ||
      value.cursor.diagramId.length > 256 ||
      !finite(value.cursor.x) ||
      !finite(value.cursor.y)
    ) {
      throw new Error("Invalid presence cursor.");
    }
    cursor = {
      diagramId: value.cursor.diagramId,
      x: value.cursor.x,
      y: value.cursor.y,
    };
  }
  return {
    displayName: value.displayName.trim(),
    ...(value.viewingDiagramId ? { viewingDiagramId: value.viewingDiagramId } : {}),
    ...(cursor ? { cursor } : {}),
  };
}

const defaultScheduler: DragPreviewScheduler = {
  now: () => performance.now(),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (handle) => clearTimeout(handle),
};

export class CursorPresenceBroadcaster {
  private pending: PresencePayload | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSentAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly options: {
    send: (payload: PresencePayload) => boolean;
    scheduler?: DragPreviewScheduler;
    intervalMs?: number;
  }) {}

  update(payload: PresencePayload, immediate = false): void {
    this.pending = payload;
    if (immediate) {
      this.clearTimer();
      this.flush();
      return;
    }
    this.schedule();
  }

  cancel(): void {
    this.clearTimer();
    this.pending = null;
  }

  private schedule(): void {
    if (this.timer !== null || !this.pending) return;
    const scheduler = this.options.scheduler ?? defaultScheduler;
    const delay = Math.max(
      0,
      (this.options.intervalMs ?? 40) - (scheduler.now() - this.lastSentAt),
    );
    this.timer = scheduler.setTimeout(() => {
      this.timer = null;
      this.flush();
    }, delay);
  }

  private flush(): void {
    const payload = this.pending;
    if (!payload) return;
    this.pending = null;
    this.lastSentAt = (this.options.scheduler ?? defaultScheduler).now();
    if (!this.options.send(payload)) this.pending = payload;
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    (this.options.scheduler ?? defaultScheduler).clearTimeout(this.timer);
    this.timer = null;
  }
}
