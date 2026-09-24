import "server-only";

import type { ReasonAIRequest } from "@/features/system-design/reasonai/contract";
import type { ReasonAITextPart } from "@/lib/reasonai/runtime/types";
import { ReasonAIPersistenceError, type PersistedReasonAIRun, type ReasonAIConversationSummary, type ReasonAIPersistenceRepository } from "./types";

export type PreparedSystemDesignRun =
  | { kind: "acquired"; conversation: ReasonAIConversationSummary; run: PersistedReasonAIRun; assistantMessageId: string; recoveredRunId?: string }
  | { kind: "replay"; conversation: ReasonAIConversationSummary; run: PersistedReasonAIRun; recoveredRunId?: string }
  | { kind: "active"; conversation: ReasonAIConversationSummary; run: PersistedReasonAIRun };

export async function prepareSystemDesignRun(
  repository: ReasonAIPersistenceRepository,
  userId: string,
  request: ReasonAIRequest & { idempotencyKey: string },
): Promise<PreparedSystemDesignRun> {
  const contextId = request.context.diagramId ?? `title:${request.context.title}`.slice(0, 256);
  let conversation: ReasonAIConversationSummary;
  if (request.conversationId) {
    const existing = await repository.getConversationSummary(userId, request.conversationId);
    if (!existing || existing.surface !== "system_design" || existing.contextId !== contextId) {
      throw new ReasonAIPersistenceError("NOT_FOUND", "Conversation not found.");
    }
    conversation = existing;
  } else {
    conversation = await repository.createConversation(userId, {
      surface: "system_design",
      contextId,
      title: request.context.title,
    });
  }
  const acquisition = await repository.acquireRun(userId, conversation.id, request.idempotencyKey);
  if (acquisition.kind !== "acquired") return {
    kind: acquisition.kind,
    conversation,
    run: acquisition.run,
    ...(acquisition.kind === "replay" && acquisition.recoveredRunId ? { recoveredRunId: acquisition.recoveredRunId } : {}),
  };
  const userPart: ReasonAITextPart = { type: "text", partId: crypto.randomUUID(), text: request.message, finalized: true };
  try {
    await repository.createMessage(userId, {
      id: crypto.randomUUID(),
      conversationId: conversation.id,
      runId: acquisition.run.id,
      role: "user",
      parts: [userPart],
      status: "completed",
    });
  } catch (error) {
    try {
      await repository.finalizeRun(userId, conversation.id, acquisition.run.id, { status: "failed", lastSeq: 0, errorCode: "USER_MESSAGE_PERSISTENCE_FAILED" });
    } catch (finalizeError) {
      console.error("[SYSTEM_DESIGN_V2_LIFECYCLE]", { runId: acquisition.run.id, stage: "run.finalize_failed", category: finalizeError instanceof Error ? finalizeError.name : "unknown" });
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
