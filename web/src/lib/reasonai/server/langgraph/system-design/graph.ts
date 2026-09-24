import "server-only";

import { END, START, StateGraph } from "@langchain/langgraph";
import type { ReasonAIRequest } from "@/features/system-design/reasonai/contract";
import type { SystemDesignAgentProvider } from "@/features/system-design/reasonai/agent-provider";
import type { SystemDesignGraphStage, SystemDesignGraphStreamEvent } from "./events";
import { createSystemDesignAgentNode } from "./nodes/agent";
import { createSystemDesignFinalizeNode } from "./nodes/finalize";
import { createSystemDesignToolsNode } from "./nodes/tools";
import { SystemDesignGraphState, type SystemDesignDurableConversationState } from "./state";
import type { SystemDesignToolExecutor } from "./tools";

function isGraphEvent(value: unknown): value is SystemDesignGraphStreamEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  return event.type === "text.delta" && typeof event.delta === "string"
    || event.type === "result" && Boolean(event.result) && typeof event.result === "object"
    || event.type === "tool.started" && typeof event.toolCallId === "string" && typeof event.toolName === "string"
    || (event.type === "tool.completed" || event.type === "tool.failed") && typeof event.toolCallId === "string"
    || event.type === "sources" && Array.isArray(event.sources)
    || event.type === "proposal" && Boolean(event.proposal)
    || event.type === "analysis" && Boolean(event.visualization);
}

export interface SystemDesignGraphExecution {
  durableState: SystemDesignDurableConversationState;
  signal?: AbortSignal;
  provider?: SystemDesignAgentProvider;
  toolExecutor?: SystemDesignToolExecutor;
  toolTimeoutMs?: number;
  onStage?: (stage: SystemDesignGraphStage, toolName?: string) => void;
  onConversationState?: (state: SystemDesignDurableConversationState) => void;
}

export function createSystemDesignGraph(
  provider?: SystemDesignAgentProvider,
  toolExecutor?: SystemDesignToolExecutor,
  onStage?: (stage: SystemDesignGraphStage, toolName?: string) => void,
  toolTimeoutMs?: number,
  onCandidate?: (state: SystemDesignDurableConversationState) => void,
) {
  return new StateGraph(SystemDesignGraphState)
    .addNode("agent", createSystemDesignAgentNode(provider, onStage))
    .addNode("tools", createSystemDesignToolsNode(toolExecutor, onStage, toolTimeoutMs))
    .addNode("finalize", createSystemDesignFinalizeNode(onCandidate))
    .addEdge(START, "agent")
    .addConditionalEdges("agent", (state) => state.pendingToolCalls?.length ? "tools" : "finalize", ["tools", "finalize"])
    .addEdge("tools", "agent")
    .addEdge("finalize", END)
    .compile();
}

export async function* streamSystemDesignGraph(
  request: ReasonAIRequest,
  execution: SystemDesignGraphExecution,
): AsyncGenerator<SystemDesignGraphStreamEvent> {
  let candidate: SystemDesignDurableConversationState | undefined;
  const graph = createSystemDesignGraph(execution.provider, execution.toolExecutor, execution.onStage, execution.toolTimeoutMs, (state) => { candidate = state; });
  execution.onStage?.("graph.started");
  const output = await graph.stream({ ...execution.durableState, request }, { signal: execution.signal, streamMode: "custom" });
  let finalEvent: SystemDesignGraphStreamEvent | undefined;
  for await (const event of output) {
    if (!isGraphEvent(event)) throw new Error("System Design graph emitted an invalid event.");
    if (event.type === "result") finalEvent = event;
    else yield event;
  }
  if (finalEvent && candidate) {
    execution.onConversationState?.(candidate);
    yield finalEvent;
  }
}
