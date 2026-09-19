export type ReasonAIMessageStatus = "streaming" | "completed" | "cancelled" | "failed" | "interrupted";

export interface ReasonAITextPart {
  type: "text";
  partId: string;
  text: string;
  finalized: boolean;
}

export interface ReasonAIToolPart {
  type: "tool";
  toolCallId: string;
  toolName: string;
  status: "running" | "completed" | "failed";
  summary?: string;
}

export interface ReasonAISource {
  sourceId: string;
  title: string;
  url: string;
  kind?: string;
}

export interface ReasonAISourcesPart {
  type: "sources";
  partId: string;
  sources: ReasonAISource[];
  retrievalStatus?: "off" | "used" | "cached" | "unavailable" | "empty";
  contextToken?: string;
  notice?: string;
}

export interface ReasonAIVisualPart {
  type: "visual";
  partId: string;
  data: unknown;
}

export type ReasonAIArtifactStatus = "proposed" | "applied" | "discarded" | "stale";

export interface ReasonAIArtifactTouchedEntity {
  entityType: string;
  entityId: string;
}

export interface ReasonAIArtifactPart {
  type: "artifact";
  partId: string;
  proposalId: string;
  status: ReasonAIArtifactStatus;
  data: unknown;
  baseArtifactFingerprint?: string;
  touchedEntities?: ReasonAIArtifactTouchedEntity[];
}

export type ReasonAIMessagePart =
  | ReasonAITextPart
  | ReasonAIToolPart
  | ReasonAISourcesPart
  | ReasonAIVisualPart
  | ReasonAIArtifactPart;

export interface ReasonAIRuntimeMessage {
  id: string;
  role: "user" | "assistant";
  parts: ReasonAIMessagePart[];
  status: ReasonAIMessageStatus;
}

export type ReasonAIRunStatus = "idle" | "running" | "completed" | "failed" | "cancelled" | "interrupted";

export interface ReasonAIRunError {
  code?: string;
  message: string;
}

export interface ReasonAIRuntimeState {
  runId: string | null;
  status: ReasonAIRunStatus;
  lastSeq: number;
  messages: ReasonAIRuntimeMessage[];
  error: ReasonAIRunError | null;
  terminalEventReceived: boolean;
}
