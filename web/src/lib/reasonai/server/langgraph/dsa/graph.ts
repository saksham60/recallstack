import "server-only";
import { END, START, StateGraph, type BaseCheckpointSaver } from "@langchain/langgraph";
import type { DSATutorRequest } from "@/features/dsa/reasonai/contract";
import type { DSAAgentProvider } from "@/features/dsa/reasonai/agent-provider";
import { createDSAFinalizeNode } from "./nodes/finalize";
import { createDSAModelNode, type DSATutorStreamingProvider } from "./nodes/model";
import { createDSAToolsNode } from "./nodes/tools";
import type { DSAGraphStage, DSAGraphStreamEvent } from "./events";
import { DSAGraphState } from "./state";
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
  checkpointer: BaseCheckpointSaver;
  threadId: string;
  signal?: AbortSignal;
  provider?: DSATutorStreamingProvider | DSAAgentProvider;
  toolExecutor?: DSAToolExecutor;
  learnerMemory?: string[];
  onStage?: (stage: DSAGraphStage, toolName?: string) => void;
  toolTimeoutMs?: number;
}

export function createDSAGraph(
  checkpointer: BaseCheckpointSaver,
  provider?: DSATutorStreamingProvider | DSAAgentProvider,
  toolExecutor?: DSAToolExecutor,
  onStage?: (stage: DSAGraphStage, toolName?: string) => void,
  toolTimeoutMs?: number,
) {
  return new StateGraph(DSAGraphState)
    .addNode("agent", createDSAModelNode(provider, onStage))
    .addNode("tools", createDSAToolsNode(toolExecutor, onStage, toolTimeoutMs))
    .addNode("finalize", createDSAFinalizeNode())
    .addEdge(START, "agent")
    .addConditionalEdges("agent", (state) => state.pendingToolCalls?.length ? "tools" : "finalize", ["tools", "finalize"])
    .addEdge("tools", "agent")
    .addEdge("finalize", END)
    .compile({ checkpointer });
}

/** Streams provisional deltas and releases the validated final only after a durable checkpoint. */
export async function* streamDSAGraph(
  request: DSATutorRequest,
  execution: DSAGraphExecution,
): AsyncGenerator<DSAGraphStreamEvent> {
  const graph = createDSAGraph(
    execution.checkpointer,
    execution.provider,
    execution.toolExecutor,
    execution.onStage,
    execution.toolTimeoutMs,
  );
  execution.onStage?.("graph.started");
  const output = await graph.stream(
    { request, learnerMemory: execution.learnerMemory ?? [] },
    {
      signal: execution.signal,
      streamMode: "custom",
      durability: "sync",
      configurable: { thread_id: execution.threadId },
    },
  );
  let finalEvent: DSAGraphStreamEvent | undefined;
  for await (const event of output) {
    if (!graphEvent(event)) throw new Error("DSA graph emitted an invalid event.");
    if (event.type === "result") finalEvent = event;
    else yield event;
  }
  execution.onStage?.("checkpoint.persisted");
  if (finalEvent) yield finalEvent;
}
