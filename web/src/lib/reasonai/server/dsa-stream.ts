import "server-only";
import type { DSATutorRequest, DSATutorResponse } from "@/features/dsa/reasonai/contract";
import { DSATutorProviderError } from "@/features/dsa/reasonai/provider";
import type { ReasonAIKnownEvent } from "@/lib/reasonai/runtime/events";
import { streamDSAGraph } from "./langgraph/dsa/graph";
import type { DSAAgentProvider } from "@/features/dsa/reasonai/agent-provider";
import type { DSATutorStreamingProvider } from "./langgraph/dsa/nodes/model";
import type { DSAToolExecutor } from "./langgraph/dsa/tools";
import type { DSADurableConversationState } from "./langgraph/dsa/state";

export type DSAPerformanceStage =
  | "request.accepted"
  | "auth.started"
  | "auth.completed"
  | "request.parsed"
  | "conversation.lookup.started"
  | "conversation.lookup.completed"
  | "conversation.created"
  | "conversation.ready"
  | "run.acquire.started"
  | "run.acquire.completed"
  | "run.acquired"
  | "user_message.persist.started"
  | "user_message.persist.completed"
  | "user_message.persisted"
  | "state.load.started"
  | "state.load.completed"
  | "graph.started"
  | "provider.started"
  | "agent.started"
  | "agent.tool_requested"
  | "final_model.started"
  | "tool.started"
  | "tool.completed"
  | "tool.failed"
  | "tool.limit_reached"
  | "first.text.delta"
  | "text.final"
  | "memory.read.started"
  | "memory.read.completed"
  | "memory.extract.started"
  | "memory.extract.completed"
  | "memory.write.completed"
  | "state.persisted"
  | "transcript.persisted"
  | "transcript.persist.started"
  | "transcript.persist.completed"
  | "run.completed"
  | "run.cancelled"
  | "run.failed";

export interface DSAStreamExecution {
  durableState: DSADurableConversationState;
  runId: string;
  messageId: string;
  mark: (stage: DSAPerformanceStage, at?: number) => void;
  learnerMemory?: string[];
  provider?: DSAAgentProvider | DSATutorStreamingProvider;
  toolExecutor?: DSAToolExecutor;
  toolTimeoutMs?: number;
  onConversationState?: (state: DSADurableConversationState) => void;
  onFinalResult?: (result: DSATutorResponse) => void;
}

/** Maps the request-scoped DSA graph stream onto the shared ReasonAI protocol. */
export async function* streamDSAEvents(
  input: DSATutorRequest,
  signal: AbortSignal,
  execution: DSAStreamExecution,
): AsyncGenerator<ReasonAIKnownEvent> {
  const { runId, messageId, mark } = execution;
  const partId = crypto.randomUUID();
  let seq = 0;
  let firstDeltaAt: number | undefined;
  let activeTool: { toolCallId: string } | undefined;
  yield { protocolVersion: 1, runId, seq: ++seq, type: "run.started" };
  try {
    let receivedResult = false;
    let sourcesEmitted = false;
    let visualEmitted = false;
    for await (const event of streamDSAGraph(input, {
      durableState: execution.durableState,
      signal,
      learnerMemory: execution.learnerMemory ?? [],
      provider: execution.provider,
      toolExecutor: execution.toolExecutor,
      toolTimeoutMs: execution.toolTimeoutMs,
      onStage: (stage) => mark(stage),
      onConversationState: execution.onConversationState,
    })) {
      if (event.type === "text.delta") {
        if (!firstDeltaAt) { firstDeltaAt = Date.now(); mark("first.text.delta", firstDeltaAt); }
        yield { protocolVersion: 1, runId, seq: ++seq, type: "text.delta", messageId, partId, delta: event.delta };
        continue;
      }
      if (event.type === "tool.started") {
        activeTool = { toolCallId: event.toolCallId };
        yield { protocolVersion: 1, runId, seq: ++seq, type: "tool.started", messageId, toolCallId: event.toolCallId, toolName: event.toolName, summary: event.summary };
        continue;
      }
      if (event.type === "tool.completed" || event.type === "tool.failed") {
        if (activeTool?.toolCallId === event.toolCallId) activeTool = undefined;
        yield { protocolVersion: 1, runId, seq: ++seq, type: event.type, messageId, toolCallId: event.toolCallId, summary: event.summary };
        continue;
      }
      if (event.type === "sources") {
        sourcesEmitted = true;
        yield {
          protocolVersion: 1, runId, seq: ++seq, type: "sources.ready", messageId,
          partId: `${partId}-sources`,
          sources: event.sources.map((source, index) => ({ sourceId: `source-${index + 1}`, title: source.title, url: source.url, kind: source.kind })),
          retrievalStatus: event.retrievalStatus,
        };
        continue;
      }
      if (event.type === "visual") {
        visualEmitted = true;
        yield { protocolVersion: 1, runId, seq: ++seq, type: "visual.ready", messageId, partId: `${partId}-visual`, data: event.visual };
        continue;
      }
      receivedResult = true;
      const result = event.result;
      execution.onFinalResult?.(result);
      mark("text.final");
      yield { protocolVersion: 1, runId, seq: ++seq, type: "text.final", messageId, partId, text: result.text };
      if (!sourcesEmitted) {
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
      }
      if (result.visual && !visualEmitted) {
        yield { protocolVersion: 1, runId, seq: ++seq, type: "visual.ready", messageId, partId: `${partId}-visual`, data: result.visual };
      }
    }
    if (!receivedResult) throw new DSATutorProviderError("ReasonAI could not complete that response. Please try again.");
    yield { protocolVersion: 1, runId, seq: ++seq, type: "run.completed" };
  } catch (error) {
    if (activeTool) {
      yield {
        protocolVersion: 1, runId, seq: ++seq, type: "tool.failed", messageId,
        toolCallId: activeTool.toolCallId,
        summary: signal.aborted ? "Tool cancelled" : "Tool failed",
      };
      activeTool = undefined;
    }
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
