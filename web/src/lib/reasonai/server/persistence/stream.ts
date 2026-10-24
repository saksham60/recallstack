import "server-only";
import type { ReasonAIKnownEvent } from "@/lib/reasonai/runtime/events";
import { createReasonAIRuntimeState, interruptReasonAIRun, reduceReasonAIEvent } from "@/lib/reasonai/runtime/reducer";
import type { ReasonAIRuntimeMessage } from "@/lib/reasonai/runtime/types";
import { ReasonAIPersistenceError, type PersistedRunStatus, type ReasonAIPersistenceRepository } from "./types";
import { RUN_HEARTBEAT_INTERVAL_MS } from "./lease";
import { AIRunMeasurements } from "@/lib/telemetry/ai-measurements";

function usefulAssistant(messages: ReasonAIRuntimeMessage[]): ReasonAIRuntimeMessage | undefined {
  return [...messages].reverse().find((message) => message.role === "assistant" && message.parts.some((part) =>
    part.type !== "text" || Boolean(part.text),
  ));
}

function transcriptParts(message: ReasonAIRuntimeMessage, confirmArtifacts = false) {
  return message.parts.map((part) => {
    if (confirmArtifacts && part.type === "artifact" && part.persistenceStatus === "working") return { ...part, persistenceStatus: "saved" as const };
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
  options?: { confirmArtifactPersistence: boolean; expectedStateVersion: number },
): AsyncGenerator<ReasonAIKnownEvent> {
  let state = createReasonAIRuntimeState();
  const measurements = new AIRunMeasurements();
  let persisted = false;
  let persisting: Promise<void> | undefined;
  let confirmationCount = 0;

  const persist = async (fallbackStatus?: "cancelled" | "interrupted") => {
    if (persisted) return;
    if (persisting) return persisting;
    if (!state.terminalEventReceived) state = interruptReasonAIRun(state);
    const observedStatus: Exclude<PersistedRunStatus, "running"> = state.status === "completed" || state.status === "failed" || state.status === "cancelled"
      ? state.status
      : "interrupted";
    // A fallback status is used only after normal terminal persistence failed or
    // when the stream ended without a terminal event. It must override a stale
    // in-memory "completed" status so a persistence error cannot leave the DB
    // lease permanently running and block the next turn with RUN_IN_PROGRESS.
    const status: Exclude<PersistedRunStatus, "running"> = fallbackStatus ?? observedStatus;
    const assistant = usefulAssistant(state.messages);
    const operation = (async () => {
      const nextConversationState = status === "completed" ? getNextConversationState?.() : undefined;
      if (status === "completed" && nextConversationState === undefined) {
        throw new Error("Completed ReasonAI runs require validated conversation state.");
      }
      const finalized = await repository.finalizeRun(userId, conversationId, runId, {
        status,
        lastSeq: state.lastSeq + (status === "completed" ? confirmationCount : 0),
        ...(state.error?.code ? { errorCode: state.error.code } : {}),
        ...(assistant ? { assistant: { id: assistant.id, role: "assistant", parts: transcriptParts(assistant, status === "completed" && options?.confirmArtifactPersistence), status } } : {}),
        ...(status === "completed" ? { nextConversationState } : {}),
        ...(status === "completed" && options ? { expectedStateVersion: options.expectedStateVersion } : {}),
      });
      if (!finalized) throw new Error("ReasonAI terminal persistence did not find the run.");
      if (options && finalized.status !== status) throw new ReasonAIPersistenceError("RUN_TERMINATED", "This run ended before the proposal could be saved.");
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
      measurements.observe(event);
      state = reduceReasonAIEvent(state, event);
      if (Date.now() >= nextHeartbeatAt && !state.terminalEventReceived) {
        const alive = await repository.heartbeatRun(userId, conversationId, runId);
        if (!alive) throw new Error("ReasonAI run lease is no longer active.");
        nextHeartbeatAt = Date.now() + RUN_HEARTBEAT_INTERVAL_MS;
      }
      if (event.type === "run.completed" || event.type === "run.failed" || event.type === "run.cancelled") {
        const artifacts = options?.confirmArtifactPersistence && event.type === "run.completed"
          ? state.messages.flatMap((message) => message.parts.flatMap((part) => part.type === "artifact" && part.status === "proposed" && part.persistenceStatus === "working" && part.proposalVersion !== undefined
            ? [{ messageId: message.id, proposalId: part.proposalId, proposalVersion: part.proposalVersion }] : [])) : [];
        confirmationCount = artifacts.length;
        try { await persist(); }
        catch (error) {
          console.error("[REASONAI_V2_LIFECYCLE]", {
            runId,
            stage: "run.finalize_failed",
            category: error instanceof Error ? error.name : "unknown",
          });
          if (options) {
            const conflict = error instanceof ReasonAIPersistenceError && error.code === "STATE_CONFLICT";
            const code = conflict ? "STATE_VERSION_CONFLICT" : error instanceof ReasonAIPersistenceError && error.code === "RUN_TERMINATED" ? "RUN_TERMINATED" : "PERSISTENCE_FAILURE";
            state = { ...state, status: "failed", error: { code, message: conflict ? "The proposal changed while this run was working. Refresh before reviewing it." : "The proposal could not be confirmed as saved. Please retry before approving it." } };
            yield { protocolVersion: 1, runId, seq: event.seq, type: "run.failed", code, message: state.error!.message };
            return;
          }
        }
        if (options && event.type === "run.completed") {
          console.info("reasonai.run.completed", { runId, feature: "system-design", persistence: "confirmed", proposalCount: artifacts.length });
          for (const [index, artifact] of artifacts.entries()) yield {
            protocolVersion: 1, runId, seq: event.seq + index, type: "artifact.persistence", ...artifact, persistenceStatus: "saved",
          };
          yield { ...event, seq: event.seq + artifacts.length };
          nextEvent = iterator.next();
          continue;
        }
      }
      yield event;
      nextEvent = iterator.next();
    }
  } finally {
    if (!sourceDone) {
      try { await iterator.return?.(); }
      catch (error) {
        console.error("[REASONAI_V2_LIFECYCLE]", {
          runId,
          stage: "stream.source_cleanup_failed",
          category: error instanceof Error ? error.name : "unknown",
        });
      }
    }
    if (!persisted) {
      try { await persist("interrupted"); }
      catch (error) {
        console.error("[REASONAI_V2_LIFECYCLE]", {
          runId,
          stage: "run.finalize_failed",
          category: error instanceof Error ? error.name : "unknown",
        });
      }
    }
    // Transcript/judge correctness does not depend on optional measurements.
    await measurements.persist(userId, runId, state.status === "completed" || state.status === "failed" || state.status === "cancelled" ? state.status : "interrupted");
  }
}
