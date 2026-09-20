import "server-only";
import { END, START, StateGraph } from "@langchain/langgraph";
import type { DSATutorRequest } from "@/features/dsa/reasonai/contract";
import type { DSAAgentProvider } from "@/features/dsa/reasonai/agent-provider";
import { createDSAFinalizeNode } from "./nodes/finalize";
import { createDSAModelNode, type DSATutorStreamingProvider } from "./nodes/model";
import { createDSAToolsNode } from "./nodes/tools";
import type { DSAGraphStage, DSAGraphStreamEvent } from "./events";
import { DSAGraphState, type DSADurableConversationState } from "./state";
import type { DSAToolExecutor } from "./tools";

function graphEvent(value: unknown): value is DSAGraphStreamEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  return event.type === "text.delta" && typeof event.delta === "string"
    || event.type === "result" && Boolean(event.result) && typeof event.result === "object"
    || event.type === "tool.started" && typeof event.toolCallId === "string" && typeof event.toolName === "string"
    || (event.type === "tool.completed" || event.type === "tool.failed") && typeof event.toolCallId === "string"
    || event.type === "sources" && Array.isArray(event.sources)
    || event.type === "visual" && Boolean(event.visual) && typeof event.visual === "object";
}

export interface DSAGraphExecution {
  durableState: DSADurableConversationState;
  signal?: AbortSignal;
  provider?: DSATutorStreamingProvider | DSAAgentProvider;
  toolExecutor?: DSAToolExecutor;
  learnerMemory?: string[];
  onStage?: (stage: DSAGraphStage, toolName?: string) => void;
  toolTimeoutMs?: number;
  onConversationState?: (state: DSADurableConversationState) => void;
}

export function createDSAGraph(
  provider?: DSATutorStreamingProvider | DSAAgentProvider,
  toolExecutor?: DSAToolExecutor,
  onStage?: (stage: DSAGraphStage, toolName?: string) => void,
  toolTimeoutMs?: number,
  onCandidate?: (state: DSADurableConversationState) => void,
) {
  return new StateGraph(DSAGraphState)
    .addNode("agent", createDSAModelNode(provider, onStage))
    .addNode("tools", createDSAToolsNode(toolExecutor, onStage, toolTimeoutMs))
    .addNode("finalize", createDSAFinalizeNode(onCandidate))
    .addEdge(START, "agent")
    .addConditionalEdges("agent", (state) => state.pendingToolCalls?.length ? "tools" : "finalize", ["tools", "finalize"])
    .addEdge("tools", "agent")
    .addEdge("finalize", END)
    .compile();
}

/** Streams provisional deltas and exposes validated state only after successful graph completion. */
export async function* streamDSAGraph(
  request: DSATutorRequest,
  execution: DSAGraphExecution,
): AsyncGenerator<DSAGraphStreamEvent> {
  let candidate: DSADurableConversationState | undefined;
  const graph = createDSAGraph(
    execution.provider,
    execution.toolExecutor,
    execution.onStage,
    execution.toolTimeoutMs,
    (state) => { candidate = state; },
  );
  execution.onStage?.("graph.started");
  const output = await graph.stream(
    { ...execution.durableState, request, learnerMemory: execution.learnerMemory ?? [] },
    {
      signal: execution.signal,
      streamMode: "custom",
    },
  );
  let finalEvent: DSAGraphStreamEvent | undefined;
  for await (const event of output) {
    if (!graphEvent(event)) throw new Error("DSA graph emitted an invalid event.");
    if (event.type === "result") finalEvent = event;
    else yield event;
  }
  if (finalEvent && candidate) {
    execution.onConversationState?.(candidate);
    yield finalEvent;
  }
}
