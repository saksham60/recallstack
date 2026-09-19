import "server-only";
import type { ReasonAIKnownEvent } from "@/lib/reasonai/runtime/events";
import { createReasonAIRuntimeState, interruptReasonAIRun, reduceReasonAIEvent } from "@/lib/reasonai/runtime/reducer";
import type { ReasonAIRuntimeMessage } from "@/lib/reasonai/runtime/types";
import type { PersistedRunStatus, ReasonAIPersistenceRepository } from "./types";

function usefulAssistant(messages: ReasonAIRuntimeMessage[]): ReasonAIRuntimeMessage | undefined {
  return [...messages].reverse().find((message) => message.role === "assistant" && message.parts.some((part) =>
    part.type !== "text" || Boolean(part.text),
  ));
}

function transcriptParts(message: ReasonAIRuntimeMessage) {
  return message.parts.map((part) => {
    if (part.type !== "sources") return part;
    // The signed context token embeds retrieved snippets. Persist compact,
    // validated source metadata only, never cached/raw Tavily evidence.
    return {
      type: part.type,
      partId: part.partId,
      sources: part.sources,
      ...(part.retrievalStatus ? { retrievalStatus: part.retrievalStatus } : {}),
      ...(part.notice ? { notice: part.notice } : {}),
    };
  });
}

/**
 * Persists the canonical UI transcript. Interrupted partial text is useful for
 * restoration, but it is not trusted LangGraph/model memory.
 */
export async function* persistReasonAITranscript(
  repository: ReasonAIPersistenceRepository,
  userId: string,
  conversationId: string,
  runId: string,
  source: AsyncIterable<ReasonAIKnownEvent> | Iterable<ReasonAIKnownEvent>,
): AsyncGenerator<ReasonAIKnownEvent> {
  let state = createReasonAIRuntimeState();
  let persisted = false;

  const persist = async (fallbackStatus?: "cancelled" | "interrupted") => {
    if (persisted) return;
    persisted = true;
    if (!state.terminalEventReceived) state = interruptReasonAIRun(state);
    const status: Exclude<PersistedRunStatus, "running"> = state.status === "completed" || state.status === "failed" || state.status === "cancelled"
      ? state.status
      : fallbackStatus ?? "interrupted";
    const assistant = usefulAssistant(state.messages);
    await repository.finalizeRun(userId, conversationId, runId, {
      status,
      lastSeq: state.lastSeq,
      ...(state.error?.code ? { errorCode: state.error.code } : {}),
      ...(assistant ? { assistant: { id: assistant.id, role: "assistant", parts: transcriptParts(assistant), status } } : {}),
    });
  };

  try {
    for await (const event of source) {
      state = reduceReasonAIEvent(state, event);
      if (event.type === "run.completed" || event.type === "run.failed" || event.type === "run.cancelled") {
        try { await persist(); }
        catch { console.error("[DSA_PERSISTENCE_FAILED]", { runId, stage: "terminal" }); }
      }
      yield event;
    }
  } finally {
    if (!persisted) {
      try { await persist("interrupted"); }
      catch { console.error("[DSA_PERSISTENCE_FAILED]", { runId, stage: "disconnect" }); }
    }
  }
}
