import "server-only";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { deriveDSAThreadId } from "../langgraph/thread-id";
import type { ReasonAIPersistenceRepository } from "./types";

export interface DSAConversationCheckpoint {
  checkpointer: BaseCheckpointSaver;
  threadSecret: string;
}

/** Verifies ownership, removes model memory, then removes the canonical transcript. */
export async function deleteReasonAIConversation(
  repository: ReasonAIPersistenceRepository,
  userId: string,
  conversationId: string,
  getDSACheckpoint: () => DSAConversationCheckpoint,
): Promise<boolean> {
  const conversation = await repository.getConversationSummary(userId, conversationId);
  if (!conversation) return false;
  if (conversation.surface === "dsa") {
    const { checkpointer, threadSecret } = getDSACheckpoint();
    const threadId = deriveDSAThreadId(conversationId, threadSecret);
    try { await checkpointer.deleteThread(threadId); }
    catch (error) {
      console.error("[DSA_CHECKPOINT_DELETE_FAILED]", {
        category: error instanceof Error ? error.name : "unknown",
      });
      throw error;
    }
  }
  return repository.deleteConversation(userId, conversationId);
}
