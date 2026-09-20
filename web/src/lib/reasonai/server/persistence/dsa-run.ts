import "server-only";
import type { DSATutorRequest } from "@/features/dsa/reasonai/contract";
import type { ReasonAITextPart } from "@/lib/reasonai/runtime/types";
import { ReasonAIPersistenceError, type PersistedReasonAIRun, type ReasonAIConversationSummary, type ReasonAIPersistenceRepository } from "./types";

export type PreparedDSARun =
  | { kind: "acquired"; conversation: ReasonAIConversationSummary; run: PersistedReasonAIRun; assistantMessageId: string; recoveredRunId?: string }
  | { kind: "replay"; conversation: ReasonAIConversationSummary; run: PersistedReasonAIRun; recoveredRunId?: string }
  | { kind: "active"; conversation: ReasonAIConversationSummary; run: PersistedReasonAIRun };

/** Acquires the run before inserting the user turn, so losing requests cannot duplicate transcript rows. */
export async function prepareDSARun(
  repository: ReasonAIPersistenceRepository,
  userId: string,
  request: DSATutorRequest & { idempotencyKey: string },
  onStage?: (stage:
    | "conversation.lookup.started" | "conversation.lookup.completed" | "conversation.created" | "conversation.ready"
    | "run.acquire.started" | "run.acquire.completed" | "run.acquired"
    | "user_message.persist.started" | "user_message.persist.completed" | "user_message.persisted"
  ) => void,
): Promise<PreparedDSARun> {
  let conversation: ReasonAIConversationSummary;
  onStage?.("conversation.lookup.started");
  if (request.conversationId) {
    const existing = await repository.getConversationSummary(userId, request.conversationId);
    if (!existing || existing.surface !== "dsa" || existing.contextId !== request.context.contentId) {
      throw new ReasonAIPersistenceError("NOT_FOUND", "Conversation not found.");
    }
    conversation = existing;
    onStage?.("conversation.lookup.completed");
  } else {
    conversation = await repository.createConversation(userId, {
      surface: "dsa",
      contextId: request.context.contentId,
      title: request.context.title,
    });
    onStage?.("conversation.created");
  }
  onStage?.("conversation.ready");

  onStage?.("run.acquire.started");
  const acquisition = await repository.acquireRun(userId, conversation.id, request.idempotencyKey);
  onStage?.("run.acquire.completed");
  onStage?.("run.acquired");
  if (acquisition.kind !== "acquired") return {
    kind: acquisition.kind,
    conversation,
    run: acquisition.run,
    ...(acquisition.kind === "replay" && acquisition.recoveredRunId ? { recoveredRunId: acquisition.recoveredRunId } : {}),
  };

  const userPart: ReasonAITextPart = {
    type: "text",
    partId: crypto.randomUUID(),
    text: request.message,
    finalized: true,
  };
  try {
    onStage?.("user_message.persist.started");
    await repository.createMessage(userId, {
      id: crypto.randomUUID(),
      conversationId: conversation.id,
      runId: acquisition.run.id,
      role: "user",
      parts: [userPart],
      status: "completed",
    });
    onStage?.("user_message.persist.completed");
    onStage?.("user_message.persisted");
  } catch (error) {
    try {
      await repository.finalizeRun(userId, conversation.id, acquisition.run.id, {
        status: "failed",
        lastSeq: 0,
        errorCode: "USER_MESSAGE_PERSISTENCE_FAILED",
      });
    } catch (finalizeError) {
      console.error("[DSA_V2_LIFECYCLE]", {
        runId: acquisition.run.id,
        stage: "run.finalize_failed",
        category: finalizeError instanceof Error ? finalizeError.name : "unknown",
      });
    }
    throw error;
  }
  return {
    kind: "acquired",
    conversation,
    run: acquisition.run,
    assistantMessageId: crypto.randomUUID(),
    ...(acquisition.recoveredRunId ? { recoveredRunId: acquisition.recoveredRunId } : {}),
  };
}
