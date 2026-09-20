import type { ReasonAIMessagePart, ReasonAIMessageStatus } from "@/lib/reasonai/runtime/types";

export type ReasonAISurface = "dsa" | "system_design";
export type PersistedRunStatus = "running" | "completed" | "failed" | "cancelled" | "interrupted";

export interface ReasonAIConversationSummary {
  id: string;
  surface: ReasonAISurface;
  contextId?: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersistedReasonAIMessage {
  id: string;
  conversationId: string;
  runId?: string;
  role: "user" | "assistant";
  parts: ReasonAIMessagePart[];
  status: ReasonAIMessageStatus;
  createdAt: string;
}

export interface ReasonAIConversation extends ReasonAIConversationSummary {
  messages: PersistedReasonAIMessage[];
}

export interface PersistedReasonAIRun {
  id: string;
  conversationId: string;
  idempotencyKey: string;
  status: PersistedRunStatus;
  lastSeq: number;
  startedAt?: string;
  heartbeatAt: string;
  completedAt?: string;
  cancelledAt?: string;
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
}

export type RunAcquisition =
  | { kind: "acquired"; run: PersistedReasonAIRun; recoveredRunId?: string }
  | { kind: "replay"; run: PersistedReasonAIRun; recoveredRunId?: string }
  | { kind: "active"; run: PersistedReasonAIRun };

export interface FinalizeRunInput {
  status: Exclude<PersistedRunStatus, "running">;
  lastSeq: number;
  errorCode?: string;
  assistant?: Omit<PersistedReasonAIMessage, "conversationId" | "runId" | "createdAt">;
}

export interface ReasonAIPersistenceRepository {
  createConversation(userId: string, input: { surface: ReasonAISurface; contextId?: string; title?: string }): Promise<ReasonAIConversationSummary>;
  listConversations(userId: string, filter: { surface?: ReasonAISurface; contextId?: string; limit: number }): Promise<ReasonAIConversationSummary[]>;
  getConversationSummary(userId: string, conversationId: string): Promise<ReasonAIConversationSummary | undefined>;
  getConversation(userId: string, conversationId: string): Promise<ReasonAIConversation | undefined>;
  deleteConversation(userId: string, conversationId: string): Promise<boolean>;
  acquireRun(userId: string, conversationId: string, idempotencyKey: string): Promise<RunAcquisition>;
  createMessage(userId: string, input: Omit<PersistedReasonAIMessage, "createdAt">): Promise<PersistedReasonAIMessage>;
  finalizeRun(userId: string, conversationId: string, runId: string, input: FinalizeRunInput): Promise<PersistedReasonAIRun | undefined>;
  heartbeatRun(userId: string, conversationId: string, runId: string): Promise<boolean>;
  cancelRun(userId: string, conversationId: string, runId: string): Promise<boolean>;
}

export class ReasonAIPersistenceError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "RUN_IN_PROGRESS" | "PERSISTENCE_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "ReasonAIPersistenceError";
  }
}

export const isReasonAIUUID = (value: unknown): value is string =>
  typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
