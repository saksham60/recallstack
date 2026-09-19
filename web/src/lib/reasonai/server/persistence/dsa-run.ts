import "server-only";
import type { DSATutorRequest } from "@/features/dsa/reasonai/contract";
import type { ReasonAITextPart } from "@/lib/reasonai/runtime/types";
import { ReasonAIPersistenceError, type PersistedReasonAIRun, type ReasonAIConversationSummary, type ReasonAIPersistenceRepository } from "./types";

export type PreparedDSARun =
  | { kind: "acquired"; conversation: ReasonAIConversationSummary; run: PersistedReasonAIRun; assistantMessageId: string }
  | { kind: "replay"; conversation: ReasonAIConversationSummary; run: PersistedReasonAIRun }
  | { kind: "active"; conversation: ReasonAIConversationSummary; run: PersistedReasonAIRun };

/** Acquires the run before inserting the user turn, so losing requests cannot duplicate transcript rows. */
export async function prepareDSARun(
  repository: ReasonAIPersistenceRepository,
  userId: string,
  request: DSATutorRequest & { idempotencyKey: string },
): Promise<PreparedDSARun> {
  let conversation: ReasonAIConversationSummary;
  if (request.conversationId) {
    const existing = await repository.getConversationSummary(userId, request.conversationId);
    if (!existing || existing.surface !== "dsa" || existing.contextId !== request.context.contentId) {
      throw new ReasonAIPersistenceError("NOT_FOUND", "Conversation not found.");
    }
    conversation = existing;
  } else {
    conversation = await repository.createConversation(userId, {
      surface: "dsa",
      contextId: request.context.contentId,
      title: request.context.title,
    });
  }

  const acquisition = await repository.acquireRun(userId, conversation.id, request.idempotencyKey);
  if (acquisition.kind !== "acquired") return { kind: acquisition.kind, conversation, run: acquisition.run };

  const userPart: ReasonAITextPart = {
    type: "text",
    partId: crypto.randomUUID(),
    text: request.message,
    finalized: true,
  };
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
    await repository.finalizeRun(userId, conversation.id, acquisition.run.id, {
      status: "failed",
      lastSeq: 0,
      errorCode: "USER_MESSAGE_PERSISTENCE_FAILED",
    }).catch(() => undefined);
    throw error;
  }
  return { kind: "acquired", conversation, run: acquisition.run, assistantMessageId: crypto.randomUUID() };
}
