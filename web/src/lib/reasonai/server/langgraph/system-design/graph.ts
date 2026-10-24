import "server-only";

import { END, START, StateGraph } from "@langchain/langgraph";
import type { ReasonAIRequest } from "@/features/system-design/reasonai/contract";
import { initialSystemDesignTier } from "@/features/system-design/reasonai/model-registry";
import type { SystemDesignAgentProvider } from "@/features/system-design/reasonai/agent-provider";
import type { SystemDesignGraphStage, SystemDesignGraphStreamEvent } from "./events";
import { createSystemDesignAgentNode } from "./nodes/agent";
import { createSystemDesignFinalizeNode } from "./nodes/finalize";
import { createSystemDesignToolsNode } from "./nodes/tools";
import { SystemDesignGraphState, type SystemDesignDurableConversationState } from "./state";
import type { SystemDesignToolExecutor } from "./tools";
import { SystemDesignBudget, type SystemDesignBudgetLimits } from "./budget";
import { createSystemDesignBaselineNode, createSystemDesignReviewNode, createSystemDesignDeltaRepairNode } from "./nodes/review";

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
  runId?: string;
  signal?: AbortSignal;
  provider?: SystemDesignAgentProvider;
  toolExecutor?: SystemDesignToolExecutor;
  toolTimeoutMs?: number;
  budgets?: Partial<SystemDesignBudgetLimits>;
  startedAt?: number;
  now?: () => number;
  onStage?: (stage: SystemDesignGraphStage, toolName?: string) => void;
  /** Validated save candidate, not a confirmation of database persistence. */
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
    .addNode("baseline", createSystemDesignBaselineNode())
    .addNode("review", createSystemDesignReviewNode(provider, onStage))
    .addNode("repair", createSystemDesignDeltaRepairNode(provider, onStage))
    .addNode("finalize", createSystemDesignFinalizeNode(onCandidate))
    .addEdge(START, "agent")
    .addConditionalEdges("agent", (state) => state.terminalToolFailure ? "finalize" : state.pendingEscalation || state.pendingProposalRetry ? "agent" : state.pendingToolCalls?.length ? "tools" : state.generationComplete && state.proposal ? "baseline" : "finalize", ["agent", "tools", "baseline", "finalize"])
    .addConditionalEdges("tools", (state) => state.terminalToolFailure ? "finalize" : "agent", ["finalize", "agent"])
    .addConditionalEdges("baseline", (state) => state.terminalToolFailure ? "finalize" : "review", ["finalize", "review"])
    .addConditionalEdges("review", (state) => state.reviewNeedsRepair ? "repair" : "finalize", ["repair", "finalize"])
    .addConditionalEdges("repair", (state) => state.reviewNeedsRepair ? "review" : "finalize", ["review", "finalize"])
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
  const modelTier = initialSystemDesignTier(request.modelPreference);
  const budget = new SystemDesignBudget(execution.budgets, execution.startedAt, execution.now);
  const output = await graph.stream({ ...execution.durableState, request, budget, runId: execution.runId, modelTier, modelsUsed: [modelTier], escalated: false }, {
    signal: execution.signal, streamMode: "custom",
    // A secondary guard, above all configured model/tool/review transitions.
    recursionLimit: 10 + budget.limits.generationModelCalls * 2 + budget.limits.reviewIterations * 3,
  });
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
