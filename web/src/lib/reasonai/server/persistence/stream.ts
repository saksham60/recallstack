import "server-only";
import type { ReasonAIKnownEvent } from "@/lib/reasonai/runtime/events";
import { createReasonAIRuntimeState, interruptReasonAIRun, reduceReasonAIEvent } from "@/lib/reasonai/runtime/reducer";
import type { ReasonAIRuntimeMessage } from "@/lib/reasonai/runtime/types";
import type { PersistedRunStatus, ReasonAIPersistenceRepository } from "./types";
import { RUN_HEARTBEAT_INTERVAL_MS } from "./lease";

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
  onPersisted?: (status: Exclude<PersistedRunStatus, "running">) => void | Promise<void>,
  getNextConversationState?: () => unknown,
): AsyncGenerator<ReasonAIKnownEvent> {
  let state = createReasonAIRuntimeState();
  let persisted = false;
  let persisting: Promise<void> | undefined;

  const persist = async (fallbackStatus?: "cancelled" | "interrupted") => {
    if (persisted) return;
    if (persisting) return persisting;
    if (!state.terminalEventReceived) state = interruptReasonAIRun(state);
    const status: Exclude<PersistedRunStatus, "running"> = state.status === "completed" || state.status === "failed" || state.status === "cancelled"
      ? state.status
      : fallbackStatus ?? "interrupted";
    const assistant = usefulAssistant(state.messages);
    const operation = (async () => {
      const nextConversationState = status === "completed" ? getNextConversationState?.() : undefined;
      if (status === "completed" && nextConversationState === undefined) {
        throw new Error("Completed ReasonAI runs require validated conversation state.");
      }
      const finalized = await repository.finalizeRun(userId, conversationId, runId, {
        status,
        lastSeq: state.lastSeq,
        ...(state.error?.code ? { errorCode: state.error.code } : {}),
        ...(assistant ? { assistant: { id: assistant.id, role: "assistant", parts: transcriptParts(assistant), status } } : {}),
        ...(status === "completed" ? { nextConversationState } : {}),
      });
      if (!finalized) throw new Error("ReasonAI terminal persistence did not find the run.");
      persisted = true;
      await onPersisted?.(finalized.status === "running" ? status : finalized.status);
    })();
    persisting = operation;
    try { await operation; }
    finally { if (persisting === operation) persisting = undefined; }
  };

  const iterator: AsyncIterator<ReasonAIKnownEvent> = Symbol.asyncIterator in source
    ? source[Symbol.asyncIterator]()
    : (() => {
        const sync = source[Symbol.iterator]();
        return { next: async () => sync.next(), return: sync.return ? async (value?: unknown) => sync.return!(value as never) : undefined };
      })();
  let nextHeartbeatAt = Date.now() + RUN_HEARTBEAT_INTERVAL_MS;
  let sourceDone = false;
  let nextEvent = iterator.next();
  try {
    while (!sourceDone) {
      const waitMs = Math.max(0, nextHeartbeatAt - Date.now());
      let timer: ReturnType<typeof setTimeout> | undefined;
      const heartbeatDue = new Promise<{ kind: "heartbeat" }>((resolve) => {
        timer = setTimeout(() => resolve({ kind: "heartbeat" }), waitMs);
      });
      const result = await Promise.race([
        nextEvent.then((value) => ({ kind: "event" as const, value })),
        heartbeatDue,
      ]);
      if (timer) clearTimeout(timer);
      if (result.kind === "heartbeat") {
        const alive = await repository.heartbeatRun(userId, conversationId, runId);
        if (!alive) throw new Error("ReasonAI run lease is no longer active.");
        nextHeartbeatAt = Date.now() + RUN_HEARTBEAT_INTERVAL_MS;
        continue;
      }
      if (result.value.done) {
        sourceDone = true;
        break;
      }
      const event = result.value.value;
      state = reduceReasonAIEvent(state, event);
      if (Date.now() >= nextHeartbeatAt && !state.terminalEventReceived) {
        const alive = await repository.heartbeatRun(userId, conversationId, runId);
        if (!alive) throw new Error("ReasonAI run lease is no longer active.");
        nextHeartbeatAt = Date.now() + RUN_HEARTBEAT_INTERVAL_MS;
      }
      if (event.type === "run.completed" || event.type === "run.failed" || event.type === "run.cancelled") {
        try { await persist(); }
        catch (error) {
          console.error("[DSA_V2_LIFECYCLE]", {
            runId,
            stage: "run.finalize_failed",
            category: error instanceof Error ? error.name : "unknown",
          });
        }
      }
      yield event;
      nextEvent = iterator.next();
    }
  } finally {
    if (!sourceDone) {
      try { await iterator.return?.(); }
      catch (error) {
        console.error("[DSA_V2_LIFECYCLE]", {
          runId,
          stage: "stream.source_cleanup_failed",
          category: error instanceof Error ? error.name : "unknown",
        });
      }
    }
    if (!persisted) {
      try { await persist("interrupted"); }
      catch (error) {
        console.error("[DSA_V2_LIFECYCLE]", {
          runId,
          stage: "run.finalize_failed",
          category: error instanceof Error ? error.name : "unknown",
        });
      }
    }
  }
}
