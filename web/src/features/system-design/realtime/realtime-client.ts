import type { SystemDesignDocument } from "../types/system-design.types";
import type { CanvasOperation } from "./canvas-operation";
import {
  createRealtimeWebSocketUrl,
  getRealtimeBaseUrl,
} from "./realtime-config";
import {
  parseCreateRealtimeRoomResponse,
  parseRealtimeServerMessage,
  RealtimeProtocolError,
  REALTIME_PROTOCOL_VERSION,
  type CreateRealtimeRoomResponse,
  type RealtimeCommitMessage,
  type RealtimeRoomStateMessage,
} from "./realtime.types";

export type RealtimeConnectionStatus =
  | "idle"
  | "starting"
  | "connecting"
  | "live"
  | "reconnecting"
  | "error"
  | "closed";

export type RealtimeFailureKind =
  | "connection_failed"
  | "ended"
  | "room_full"
  | "unsupported_protocol"
  | "invalid_state";

export interface RealtimeFailure {
  kind: RealtimeFailureKind;
  message: string;
}

export interface RealtimeClientCallbacks {
  onStatus: (status: RealtimeConnectionStatus) => void;
  onRoomState: (
    message: RealtimeRoomStateMessage,
    pendingOperations: readonly CanvasOperation[],
  ) => void;
  onCommittedOperation: (message: RealtimeCommitMessage) => void;
  onFailure: (failure: RealtimeFailure) => void;
}

interface PendingOperation {
  operation: CanvasOperation;
  checkpoint: SystemDesignDocument;
}

type WebSocketFactory = (url: string) => WebSocket;

const RECONNECT_DELAYS = [1_000, 2_000, 4_000, 8_000, 12_000] as const;
const MAX_PENDING_OPERATIONS = 256;
const MAX_APPLIED_OPERATION_IDS = 4_096;

export class RealtimeSequenceTracker {
  private last = 0;
  private readonly appliedIds = new Set<string>();
  private readonly appliedOrder: string[] = [];

  get lastSequence(): number {
    return this.last;
  }

  inspect(
    operation: RealtimeCommitMessage,
    ownOperationIds: ReadonlySet<string>,
  ): "apply" | "own" | "duplicate" | "gap" {
    if (
      operation.sequence <= this.last ||
      this.appliedIds.has(operation.opId)
    ) {
      return "duplicate";
    }
    if (operation.sequence !== this.last + 1) return "gap";
    return ownOperationIds.has(operation.opId) ? "own" : "apply";
  }

  accept(operation: RealtimeCommitMessage): void {
    this.last = operation.sequence;
    this.remember(operation.opId);
  }

  reset(sequence: number, operationIds: readonly string[]): void {
    this.last = sequence;
    this.appliedIds.clear();
    this.appliedOrder.length = 0;
    operationIds.forEach((opId) => this.remember(opId));
  }

  private remember(opId: string): void {
    if (this.appliedIds.has(opId)) return;
    this.appliedIds.add(opId);
    this.appliedOrder.push(opId);
    if (this.appliedOrder.length > MAX_APPLIED_OPERATION_IDS) {
      const oldest = this.appliedOrder.shift();
      if (oldest) this.appliedIds.delete(oldest);
    }
  }
}

export async function createRealtimeRoom(
  snapshot: SystemDesignDocument,
  options: { signal?: AbortSignal; fetchImplementation?: typeof fetch } = {},
): Promise<CreateRealtimeRoomResponse> {
  const baseUrl = getRealtimeBaseUrl();
  const response = await (options.fetchImplementation ?? fetch)(
    new URL("/v1/rooms", baseUrl),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot }),
      signal: options.signal,
    },
  );
  let body: unknown;
  try {
    body = (await response.json()) as unknown;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "object" &&
      body.error !== null &&
      "message" in body.error &&
      typeof body.error.message === "string"
        ? body.error.message
        : "The live session could not be started.";
    throw new Error(message);
  }
  return parseCreateRealtimeRoomResponse(body);
}

export class RealtimeClient {
  private readonly roomToken: string;
  private readonly actorId: string;
  private readonly callbacks: RealtimeClientCallbacks;
  private readonly websocketFactory: WebSocketFactory;
  private readonly sequence = new RealtimeSequenceTracker();
  private readonly pending = new Map<string, PendingOperation>();
  private readonly ownOperationIds = new Set<string>();
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private operationCounter = 0;
  private inflightOpId: string | null = null;
  private stopped = false;
  private everLive = false;

  constructor(options: {
    roomToken: string;
    actorId: string;
    callbacks: RealtimeClientCallbacks;
    websocketFactory?: WebSocketFactory;
  }) {
    this.roomToken = options.roomToken;
    this.actorId = options.actorId;
    this.callbacks = options.callbacks;
    this.websocketFactory =
      options.websocketFactory ?? ((url) => new WebSocket(url));
  }

  get lastSequence(): number {
    return this.sequence.lastSequence;
  }

  connect(): void {
    this.stopped = false;
    this.openSocket(false);
  }

  retry(): void {
    this.clearReconnectTimer();
    this.inflightOpId = null;
    this.reconnectAttempt = 0;
    this.stopped = false;
    this.openSocket(this.everLive);
  }

  disconnect(): void {
    this.stopped = true;
    this.clearReconnectTimer();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < 2) socket.close(1000, "leaving room");
    this.callbacks.onStatus("closed");
  }

  destroy(): void {
    this.stopped = true;
    this.clearReconnectTimer();
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      if (socket.readyState < 2) socket.close(1000, "leaving room");
    }
  }

  sendCommitted(
    operation: CanvasOperation,
    checkpoint: SystemDesignDocument,
  ): string | null {
    if (this.pending.size >= MAX_PENDING_OPERATIONS) {
      this.fail({
        kind: "connection_failed",
        message: "Too many changes are waiting to synchronize.",
      });
      return null;
    }
    this.operationCounter += 1;
    const opId = `${this.actorId}-${this.operationCounter}-${crypto.randomUUID()}`;
    this.pending.set(opId, { operation, checkpoint });
    this.ownOperationIds.add(opId);
    this.flushPending();
    return opId;
  }

  private openSocket(reconnecting: boolean): void {
    if (this.stopped) return;
    const previous = this.socket;
    this.inflightOpId = null;
    if (previous) {
      previous.onopen = null;
      previous.onmessage = null;
      previous.onerror = null;
      previous.onclose = null;
      if (previous.readyState < 2) previous.close(1000, "reconnecting");
    }
    this.callbacks.onStatus(reconnecting ? "reconnecting" : "connecting");
    let socket: WebSocket;
    try {
      socket = this.websocketFactory(
        createRealtimeWebSocketUrl(
          this.roomToken,
          this.actorId,
          this.sequence.lastSequence,
        ),
      );
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.onmessage = (event) => {
      if (this.socket !== socket || typeof event.data !== "string") return;
      try {
        this.handleMessage(parseRealtimeServerMessage(event.data));
      } catch (error) {
        this.fail({
          kind:
            error instanceof RealtimeProtocolError
              ? "unsupported_protocol"
              : "invalid_state",
          message: "The live session returned data this editor cannot use.",
        });
      }
    };
    socket.onerror = () => {
      // Browsers intentionally hide WebSocket upgrade details. The close event
      // provides the safe retry/terminal signal used below.
    };
    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (this.stopped) return;
      const terminal = this.failureForCloseCode(event.code);
      if (terminal) {
        this.fail(terminal);
        return;
      }
      this.scheduleReconnect();
    };
  }

  private handleMessage(
    message: ReturnType<typeof parseRealtimeServerMessage>,
  ): void {
    if (message.type === "room.state") {
      this.handleRoomState(message);
      return;
    }
    if (message.type === "op.commit") {
      this.handleCommit(message);
      return;
    }
    if (message.type === "ack") {
      this.pending.delete(message.opId);
      this.ownOperationIds.delete(message.opId);
      if (this.inflightOpId === message.opId) this.inflightOpId = null;
      this.flushPending();
      return;
    }
    if (message.type === "error") {
      if (message.error.code === "checkpoint_required") {
        this.flushPending(true);
        return;
      }
      this.fail({
        kind: "invalid_state",
        message: "The live session could not apply this change safely.",
      });
      return;
    }
    if (message.type === "ping" && this.socket?.readyState === 1) {
      this.socket.send(
        JSON.stringify({
          v: REALTIME_PROTOCOL_VERSION,
          type: "pong",
          actorId: this.actorId,
          ...(message.payload === undefined
            ? {}
            : { payload: message.payload }),
        }),
      );
    }
  }

  private handleRoomState(message: RealtimeRoomStateMessage): void {
    if (message.stateMode === "full") {
      this.validateFullRoomState(message);
      this.callbacks.onRoomState(
        message,
        [...this.pending.values()].map((entry) => entry.operation),
      );
      this.sequence.reset(
        message.currentSequence,
        message.operations.map((operation) => operation.opId),
      );
    } else {
      for (const operation of message.operations) {
        this.handleCommit(operation);
      }
      if (this.sequence.lastSequence !== message.currentSequence) {
        this.requestReplay();
        return;
      }
    }
    this.everLive = true;
    this.reconnectAttempt = 0;
    this.callbacks.onStatus("live");
    this.flushPending();
  }

  private validateFullRoomState(message: RealtimeRoomStateMessage): void {
    let expected = message.historyStartsAt;
    for (const operation of message.operations) {
      if (operation.sequence !== expected) {
        throw new RealtimeProtocolError("Room history is not contiguous.");
      }
      expected += 1;
    }
    const finalSequence =
      message.operations.at(-1)?.sequence ?? message.historyStartsAt - 1;
    if (finalSequence !== message.currentSequence) {
      throw new RealtimeProtocolError("Room history is incomplete.");
    }
  }

  private handleCommit(message: RealtimeCommitMessage): void {
    const disposition = this.sequence.inspect(message, this.ownOperationIds);
    if (disposition === "gap") {
      this.requestReplay();
      return;
    }
    if (disposition === "duplicate") return;
    if (disposition === "apply") {
      this.callbacks.onCommittedOperation(message);
    } else {
      this.pending.delete(message.opId);
      this.ownOperationIds.delete(message.opId);
      if (this.inflightOpId === message.opId) this.inflightOpId = null;
    }
    this.sequence.accept(message);
    this.flushPending();
  }

  private requestReplay(): void {
    const socket = this.socket;
    this.socket = null;
    this.inflightOpId = null;
    if (socket) {
      socket.onclose = null;
      if (socket.readyState < 2) socket.close(4000, "sequence replay required");
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    if (this.reconnectAttempt >= RECONNECT_DELAYS.length) {
      this.fail({
        kind: this.everLive ? "ended" : "connection_failed",
        message: this.everLive
          ? "This live session has ended."
          : "The live session is unavailable right now.",
      });
      return;
    }
    const delay = RECONNECT_DELAYS[this.reconnectAttempt];
    this.reconnectAttempt += 1;
    this.callbacks.onStatus("reconnecting");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket(true);
    }, delay);
  }

  private flushPending(withCheckpoint = false): void {
    if (
      this.socket?.readyState !== 1 ||
      (!this.everLive && !withCheckpoint) ||
      (this.inflightOpId !== null && !withCheckpoint)
    ) {
      return;
    }
    const first = this.pending.entries().next().value as
      | [string, PendingOperation]
      | undefined;
    if (!first) return;
    const [opId, entry] = first;
    this.inflightOpId = opId;
    this.socket.send(
      JSON.stringify({
        v: REALTIME_PROTOCOL_VERSION,
        type: "op.commit",
        opId,
        actorId: this.actorId,
        payload: entry.operation,
        ...(withCheckpoint ? { snapshot: entry.checkpoint } : {}),
      }),
    );
  }

  private failureForCloseCode(code: number): RealtimeFailure | null {
    if (code === 4404 || code === 4408) {
      return { kind: "ended", message: "This live session has ended." };
    }
    if (code === 4430) {
      return {
        kind: "room_full",
        message: "This live session already has the maximum number of participants.",
      };
    }
    if (code === 4401) {
      return {
        kind: "unsupported_protocol",
        message: "This live session uses an unsupported protocol version.",
      };
    }
    if (code === 4400 || code === 4403) {
      return {
        kind: "invalid_state",
        message: "The live connection could not be validated.",
      };
    }
    return null;
  }

  private fail(failure: RealtimeFailure): void {
    this.stopped = true;
    this.clearReconnectTimer();
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onclose = null;
      if (socket.readyState < 2) socket.close(1000, "session closed");
    }
    this.callbacks.onStatus(failure.kind === "ended" ? "closed" : "error");
    this.callbacks.onFailure(failure);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
}
