import "server-only";
import type { DSATutorRequest } from "@/features/dsa/reasonai/contract";
import { DSATutorProviderError } from "@/features/dsa/reasonai/provider";
import type { ReasonAIKnownEvent } from "@/lib/reasonai/runtime/events";
import { streamDSAGraph } from "./langgraph/dsa/graph";

/** Maps the request-scoped DSA graph stream onto the shared ReasonAI protocol. */
export async function* streamDSAEvents(
  input: DSATutorRequest,
  signal: AbortSignal,
  acceptedAt = Date.now(),
  identity: { runId?: string; messageId?: string } = {},
): AsyncGenerator<ReasonAIKnownEvent> {
  const runId = identity.runId ?? crypto.randomUUID();
  const messageId = identity.messageId ?? crypto.randomUUID();
  const partId = crypto.randomUUID();
  let seq = 0;
  let firstDeltaAt: number | undefined;
  const mark = (stage: string, at = Date.now()) => console.info("[DSA_V2_PERF]", { runId, stage, elapsedMs: at - acceptedAt });
  mark("request.accepted", acceptedAt);
  mark("run.started");
  yield { protocolVersion: 1, runId, seq: ++seq, type: "run.started" };
  try {
    let receivedResult = false;
    for await (const event of streamDSAGraph(input, signal)) {
      if (event.type === "text.delta") {
        if (!firstDeltaAt) { firstDeltaAt = Date.now(); mark("first.text.delta", firstDeltaAt); }
        yield { protocolVersion: 1, runId, seq: ++seq, type: "text.delta", messageId, partId, delta: event.delta };
        continue;
      }
      receivedResult = true;
      const result = event.result;
      mark("text.final");
      yield { protocolVersion: 1, runId, seq: ++seq, type: "text.final", messageId, partId, text: result.text };
      yield {
        protocolVersion: 1,
        runId,
        seq: ++seq,
        type: "sources.ready",
        messageId,
        partId: `${partId}-sources`,
        sources: result.sources.map((source, index) => ({ sourceId: `source-${index + 1}`, ...source })),
        retrievalStatus: result.webStatus,
        ...(result.webContextToken ? { contextToken: result.webContextToken } : {}),
        ...(result.notice ? { notice: result.notice } : {}),
      };
      if (result.visual) {
        yield { protocolVersion: 1, runId, seq: ++seq, type: "visual.ready", messageId, partId: `${partId}-visual`, data: result.visual };
      }
    }
    if (!receivedResult) throw new DSATutorProviderError("ReasonAI could not complete that response. Please try again.");
    mark("run.completed");
    yield { protocolVersion: 1, runId, seq: ++seq, type: "run.completed" };
  } catch (error) {
    if (signal.aborted) {
      mark("run.cancelled");
      yield { protocolVersion: 1, runId, seq: ++seq, type: "run.cancelled" };
      return;
    }
    const message = error instanceof DSATutorProviderError
      ? error.message
      : "ReasonAI is temporarily unavailable. Please try again.";
    mark("run.failed");
    yield { protocolVersion: 1, runId, seq: ++seq, type: "run.failed", message, code: "PROVIDER_FAILURE" };
  }
}
