import type {
  ReasonAIArtifactStatus,
  ReasonAIArtifactTouchedEntity,
  ReasonAISource,
} from "./types";

export const REASONAI_PROTOCOL_VERSION = 1 as const;

export interface ReasonAIEventBase {
  protocolVersion: typeof REASONAI_PROTOCOL_VERSION;
  runId: string;
  seq: number;
}

export interface ReasonAIRunStartedEvent extends ReasonAIEventBase { type: "run.started" }
export interface ReasonAIRunHeartbeatEvent extends ReasonAIEventBase { type: "run.heartbeat" }

export interface ReasonAITextDeltaEvent extends ReasonAIEventBase {
  type: "text.delta";
  messageId: string;
  partId: string;
  delta: string;
}

export interface ReasonAITextFinalEvent extends ReasonAIEventBase {
  type: "text.final";
  messageId: string;
  partId: string;
  text: string;
}

export interface ReasonAIToolStartedEvent extends ReasonAIEventBase {
  type: "tool.started";
  messageId: string;
  toolCallId: string;
  toolName: string;
  summary?: string;
}

export interface ReasonAIToolCompletedEvent extends ReasonAIEventBase {
  type: "tool.completed";
  messageId: string;
  toolCallId: string;
  summary?: string;
}

export interface ReasonAIToolFailedEvent extends ReasonAIEventBase {
  type: "tool.failed";
  messageId: string;
  toolCallId: string;
  summary?: string;
}

export interface ReasonAISourcesReadyEvent extends ReasonAIEventBase {
  type: "sources.ready";
  messageId: string;
  partId: string;
  sources: ReasonAISource[];
  retrievalStatus?: "off" | "used" | "cached" | "unavailable" | "empty";
  contextToken?: string;
  notice?: string;
}

export interface ReasonAIVisualReadyEvent extends ReasonAIEventBase {
  type: "visual.ready";
  messageId: string;
  partId: string;
  data: unknown;
}

export interface ReasonAIArtifactProposalEvent extends ReasonAIEventBase {
  type: "artifact.proposal";
  messageId: string;
  partId: string;
  proposalId: string;
  data: unknown;
  baseArtifactFingerprint?: string;
  touchedEntities?: ReasonAIArtifactTouchedEntity[];
}

export interface ReasonAIArtifactStatusEvent extends ReasonAIEventBase {
  type: "artifact.status";
  messageId: string;
  proposalId: string;
  status: Exclude<ReasonAIArtifactStatus, "proposed">;
}

export interface ReasonAIRunCompletedEvent extends ReasonAIEventBase { type: "run.completed" }

export interface ReasonAIRunFailedEvent extends ReasonAIEventBase {
  type: "run.failed";
  message: string;
  code?: string;
}

export interface ReasonAIRunCancelledEvent extends ReasonAIEventBase { type: "run.cancelled" }

export type ReasonAIKnownEvent =
  | ReasonAIRunStartedEvent
  | ReasonAIRunHeartbeatEvent
  | ReasonAITextDeltaEvent
  | ReasonAITextFinalEvent
  | ReasonAIToolStartedEvent
  | ReasonAIToolCompletedEvent
  | ReasonAIToolFailedEvent
  | ReasonAISourcesReadyEvent
  | ReasonAIVisualReadyEvent
  | ReasonAIArtifactProposalEvent
  | ReasonAIArtifactStatusEvent
  | ReasonAIRunCompletedEvent
  | ReasonAIRunFailedEvent
  | ReasonAIRunCancelledEvent;

/** A valid V1 envelope whose event type is newer than this client. */
export interface ReasonAIUnknownEvent extends ReasonAIEventBase {
  type: "protocol.unknown";
  eventType: string;
}

export type ReasonAIEvent = ReasonAIKnownEvent | ReasonAIUnknownEvent;
