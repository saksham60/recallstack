import "server-only";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import type { DSATutorRequest } from "@/features/dsa/reasonai/contract";
import { isReasonAILearnerMemoryEnabled } from "@/lib/config/server";
import { DSATutorProviderError } from "@/features/dsa/reasonai/provider";
import type { ReasonAIKnownEvent } from "@/lib/reasonai/runtime/events";
import { learnerMemoryExtractor, type LearnerMemoryExtractor } from "./memory/extractor";
import type { LearnerMemoryRepository } from "./memory/types";
import { streamDSAGraph } from "./langgraph/dsa/graph";
import type { DSAAgentProvider } from "@/features/dsa/reasonai/agent-provider";
import type { DSATutorStreamingProvider } from "./langgraph/dsa/nodes/model";
import type { DSAToolExecutor } from "./langgraph/dsa/tools";

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
  | "checkpoint.load.started"
  | "checkpoint.load.completed"
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
  | "checkpoint.persisted"
  | "transcript.persisted"
  | "transcript.persist.started"
  | "transcript.persist.completed"
  | "run.completed"
  | "run.cancelled"
  | "run.failed";

export interface DSAStreamExecution {
  checkpointer: BaseCheckpointSaver;
  threadId: string;
  runId: string;
  messageId: string;
  mark: (stage: DSAPerformanceStage, at?: number) => void;
  learnerMemoryRepository?: LearnerMemoryRepository;
  learnerMemoryExtractor?: LearnerMemoryExtractor;
  userId?: string;
  conversationId?: string;
  learnerMemory?: string[];
  provider?: DSAAgentProvider | DSATutorStreamingProvider;
  toolExecutor?: DSAToolExecutor;
  toolTimeoutMs?: number;
}

/** Maps the checkpointed DSA graph stream onto the shared ReasonAI protocol. */
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
    const memoryEnabled = isReasonAILearnerMemoryEnabled("dsa")
      && Boolean(execution.learnerMemoryRepository && execution.userId && execution.conversationId);
    let learnerMemory: string[] = execution.learnerMemory ?? [];
    if (memoryEnabled && execution.learnerMemory === undefined) {
      mark("memory.read.started");
      try {
        const items = await execution.learnerMemoryRepository!.findRelevant(execution.userId!, {
          surface: "dsa",
          contextId: input.context.contentId,
          category: input.context.category,
          limit: 8,
        });
        learnerMemory = items.slice(0, 8).map((item) => item.content.slice(0, 1_000));
      } catch {
        console.error("[DSA_V2_MEMORY]", { runId, stage: "memory.read.failed" });
      }
      mark("memory.read.completed");
    }
    let receivedResult = false;
    let sourcesEmitted = false;
    let visualEmitted = false;
    for await (const event of streamDSAGraph(input, {
      checkpointer: execution.checkpointer,
      threadId: execution.threadId,
      signal,
      learnerMemory,
      provider: execution.provider,
      toolExecutor: execution.toolExecutor,
      toolTimeoutMs: execution.toolTimeoutMs,
      onStage: (stage) => mark(stage),
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
      mark("text.final");
      yield { protocolVersion: 1, runId, seq: ++seq, type: "text.final", messageId, partId, text: result.text };
      if (memoryEnabled && !signal.aborted) {
        try {
          mark("memory.extract.started");
          const candidates = await (execution.learnerMemoryExtractor ?? learnerMemoryExtractor).extract({
            userMessage: input.message,
            assistantAnswer: result.text,
            action: input.action,
            hintLevel: input.hintLevel,
          }, signal);
          signal.throwIfAborted();
          mark("memory.extract.completed");
          if (candidates.length) {
            await execution.learnerMemoryRepository!.upsert(execution.userId!, {
              surface: "dsa",
              candidates,
              sourceConversationId: execution.conversationId!,
              sourceRunId: runId,
            });
            signal.throwIfAborted();
          }
          mark("memory.write.completed");
        } catch (error) {
          if (signal.aborted) throw error;
          console.error("[DSA_V2_MEMORY]", { runId, stage: "memory.extract_or_write.failed" });
        }
      }
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
