export const REALTIME_PROTOCOL_VERSION = 1 as const;

export type RealtimeMessageType =
  | "room.state"
  | "op.commit"
  | "op.ephemeral"
  | "presence"
  | "ack"
  | "error"
  | "ping"
  | "pong";

export interface RealtimeCommittedOperation {
  v: typeof REALTIME_PROTOCOL_VERSION;
  type: "op.commit";
  opId: string;
  actorId: string;
  sequence: number;
  payload: unknown;
}

export interface RealtimeRoomStateMessage {
  v: typeof REALTIME_PROTOCOL_VERSION;
  type: "room.state";
  snapshot?: unknown;
  operations: RealtimeCommittedOperation[];
  presence: Array<{ actorId: string; payload: unknown }>;
  stateMode: "full" | "replay";
  currentSequence: number;
  historyStartsAt: number;
}

export type RealtimeCommitMessage = RealtimeCommittedOperation;

export interface RealtimeAckMessage {
  v: typeof REALTIME_PROTOCOL_VERSION;
  type: "ack";
  opId: string;
  actorId?: string;
  sequence: number;
  duplicate: boolean;
}

export interface RealtimeErrorMessage {
  v: typeof REALTIME_PROTOCOL_VERSION;
  type: "error";
  error: { code: string; message: string };
}

export interface RealtimeOpaqueMessage {
  v: typeof REALTIME_PROTOCOL_VERSION;
  type: "op.ephemeral" | "presence" | "ping" | "pong";
  actorId?: string;
  opId?: string;
  payload?: unknown;
}

export type RealtimeServerMessage =
  | RealtimeRoomStateMessage
  | RealtimeCommitMessage
  | RealtimeAckMessage
  | RealtimeErrorMessage
  | RealtimeOpaqueMessage;

export interface CreateRealtimeRoomResponse {
  roomId: string;
  roomToken: string;
  expiresAt: string;
  maxParticipants: number;
  websocketPath: string;
}

export class RealtimeProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RealtimeProtocolError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    value.trim() === value &&
    !/[\u0000-\u0020\u007f]/u.test(value)
  );
}

function isSequence(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function parseCommittedOperation(
  value: unknown,
  path: string,
): RealtimeCommittedOperation {
  if (
    !isRecord(value) ||
    value.v !== REALTIME_PROTOCOL_VERSION ||
    value.type !== "op.commit" ||
    !isIdentifier(value.opId) ||
    !isIdentifier(value.actorId) ||
    !isSequence(value.sequence) ||
    value.sequence < 1 ||
    !("payload" in value)
  ) {
    throw new RealtimeProtocolError(`Invalid ${path}.`);
  }
  return {
    v: REALTIME_PROTOCOL_VERSION,
    type: "op.commit",
    opId: value.opId,
    actorId: value.actorId,
    sequence: value.sequence,
    payload: value.payload,
  };
}

export function parseRealtimeServerMessage(
  raw: string,
): RealtimeServerMessage {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new RealtimeProtocolError("The realtime server sent invalid JSON.");
  }
  if (!isRecord(value) || value.v !== REALTIME_PROTOCOL_VERSION) {
    throw new RealtimeProtocolError("Unsupported realtime protocol version.");
  }
  if (typeof value.type !== "string") {
    throw new RealtimeProtocolError("Realtime message type is missing.");
  }

  if (value.type === "room.state") {
    if (
      (value.stateMode !== "full" && value.stateMode !== "replay") ||
      !isSequence(value.currentSequence) ||
      !isSequence(value.historyStartsAt) ||
      (value.snapshot === undefined && value.stateMode === "full") ||
      (value.operations !== undefined && !Array.isArray(value.operations)) ||
      (value.presence !== undefined && !Array.isArray(value.presence))
    ) {
      throw new RealtimeProtocolError("Invalid room state envelope.");
    }
    const operations = (value.operations ?? []).map((operation, index) =>
      parseCommittedOperation(operation, `room operation ${index}`),
    );
    const presence = (value.presence ?? []).map((entry) => {
      if (!isRecord(entry) || !isIdentifier(entry.actorId)) {
        throw new RealtimeProtocolError("Invalid room presence state.");
      }
      return { actorId: entry.actorId, payload: entry.payload };
    });
    return {
      v: REALTIME_PROTOCOL_VERSION,
      type: "room.state",
      ...(value.snapshot === undefined ? {} : { snapshot: value.snapshot }),
      operations,
      presence,
      stateMode: value.stateMode,
      currentSequence: value.currentSequence,
      historyStartsAt: value.historyStartsAt,
    };
  }

  if (value.type === "op.commit") {
    return parseCommittedOperation(value, "committed operation");
  }

  if (value.type === "ack") {
    if (
      !isIdentifier(value.opId) ||
      !isSequence(value.sequence) ||
      value.sequence < 1 ||
      (value.actorId !== undefined && !isIdentifier(value.actorId)) ||
      (value.duplicate !== undefined && typeof value.duplicate !== "boolean")
    ) {
      throw new RealtimeProtocolError("Invalid acknowledgement envelope.");
    }
    return {
      v: REALTIME_PROTOCOL_VERSION,
      type: "ack",
      opId: value.opId,
      ...(value.actorId === undefined ? {} : { actorId: value.actorId }),
      sequence: value.sequence,
      duplicate: value.duplicate === true,
    };
  }

  if (value.type === "error") {
    if (
      !isRecord(value.error) ||
      typeof value.error.code !== "string" ||
      typeof value.error.message !== "string"
    ) {
      throw new RealtimeProtocolError("Invalid realtime error envelope.");
    }
    return {
      v: REALTIME_PROTOCOL_VERSION,
      type: "error",
      error: { code: value.error.code, message: value.error.message },
    };
  }

  if (
    value.type === "op.ephemeral" ||
    value.type === "presence" ||
    value.type === "ping" ||
    value.type === "pong"
  ) {
    if (value.actorId !== undefined && !isIdentifier(value.actorId)) {
      throw new RealtimeProtocolError("Invalid realtime actor identifier.");
    }
    return {
      v: REALTIME_PROTOCOL_VERSION,
      type: value.type,
      ...(value.actorId === undefined ? {} : { actorId: value.actorId }),
      ...(isIdentifier(value.opId) ? { opId: value.opId } : {}),
      ...("payload" in value ? { payload: value.payload } : {}),
    };
  }

  throw new RealtimeProtocolError("Unsupported realtime message type.");
}

export function parseCreateRealtimeRoomResponse(
  value: unknown,
): CreateRealtimeRoomResponse {
  if (
    !isRecord(value) ||
    !isIdentifier(value.roomId) ||
    !isIdentifier(value.roomToken) ||
    typeof value.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    typeof value.maxParticipants !== "number" ||
    !Number.isInteger(value.maxParticipants) ||
    value.maxParticipants < 1 ||
    value.maxParticipants > 10 ||
    typeof value.websocketPath !== "string" ||
    !value.websocketPath.startsWith("/v1/rooms/")
  ) {
    throw new RealtimeProtocolError("Invalid create-room response.");
  }
  return {
    roomId: value.roomId,
    roomToken: value.roomToken,
    expiresAt: value.expiresAt,
    maxParticipants: value.maxParticipants,
    websocketPath: value.websocketPath,
  };
}
