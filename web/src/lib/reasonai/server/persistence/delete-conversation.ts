import "server-only";
import type { ReasonAIPersistenceRepository } from "./types";

/** Verifies ownership, then deletes the conversation and its cascading state. */
export async function deleteReasonAIConversation(
  repository: ReasonAIPersistenceRepository,
  userId: string,
  conversationId: string,
): Promise<boolean> {
  const conversation = await repository.getConversationSummary(userId, conversationId);
  if (!conversation) return false;
  return repository.deleteConversation(userId, conversationId);
}
