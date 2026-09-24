import "server-only";

import type { ReasonAIRequest, ReasonAIResponse } from "@/features/system-design/reasonai/contract";
import { ReasonAIProviderError } from "@/features/system-design/reasonai/provider";
import type { SystemDesignAgentProvider } from "@/features/system-design/reasonai/agent-provider";
import type { ReasonAIKnownEvent } from "@/lib/reasonai/runtime/events";
import { streamSystemDesignGraph } from "./langgraph/system-design/graph";
import type { SystemDesignDurableConversationState } from "./langgraph/system-design/state";
import type { SystemDesignToolExecutor } from "./langgraph/system-design/tools";

export interface SystemDesignStreamExecution {
  durableState: SystemDesignDurableConversationState;
  runId: string;
  messageId: string;
  provider?: SystemDesignAgentProvider;
  toolExecutor?: SystemDesignToolExecutor;
  toolTimeoutMs?: number;
  onConversationState?: (state: SystemDesignDurableConversationState) => void;
  onFinalResult?: (result: ReasonAIResponse) => void;
}

function touchedEntities(proposal: NonNullable<ReasonAIResponse["proposal"]>) {
  return proposal.operations.flatMap((operation) => {
    if ("nodeId" in operation) return [{ entityType: "node", entityId: operation.nodeId }];
    if ("edgeId" in operation) return [{ entityType: "edge", entityId: operation.edgeId }];
    if (operation.op === "add_node") return [{ entityType: "node", entityId: operation.ref }];
    return [
      { entityType: "node", entityId: operation.sourceNodeId },
      { entityType: "node", entityId: operation.targetNodeId },
    ];
  }).filter((item, index, all) => all.findIndex((candidate) => candidate.entityType === item.entityType && candidate.entityId === item.entityId) === index);
}

export async function* streamSystemDesignEvents(
  input: ReasonAIRequest,
  signal: AbortSignal,
  execution: SystemDesignStreamExecution,
): AsyncGenerator<ReasonAIKnownEvent> {
  const { runId, messageId } = execution;
  const partId = crypto.randomUUID();
  let seq = 0;
  let activeTool: { toolCallId: string } | undefined;
  let proposalEmitted = false;
  let analysisEmitted = false;
  let sourcesEmitted = false;
  yield { protocolVersion: 1, runId, seq: ++seq, type: "run.started" };
  try {
    let receivedResult = false;
    for await (const event of streamSystemDesignGraph(input, {
      durableState: execution.durableState,
      signal,
      provider: execution.provider,
      toolExecutor: execution.toolExecutor,
      toolTimeoutMs: execution.toolTimeoutMs,
      onConversationState: execution.onConversationState,
      onStage: (stage, toolName) => console.info("[SYSTEM_DESIGN_V2]", { runId, stage, ...(toolName ? { toolName } : {}) }),
    })) {
      if (event.type === "text.delta") {
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
          protocolVersion: 1,
          runId,
          seq: ++seq,
          type: "sources.ready",
          messageId,
          partId: `${partId}-sources`,
          sources: event.sources.map(({ id, title, url }) => ({ sourceId: `source-${id}`, title, url, kind: "search" })),
          retrievalStatus: event.retrievalStatus,
        };
        continue;
      }
      if (event.type === "proposal") {
        proposalEmitted = true;
        yield {
          protocolVersion: 1,
          runId,
          seq: ++seq,
          type: "artifact.proposal",
          messageId,
          partId: `${partId}-proposal`,
          proposalId: crypto.randomUUID(),
          data: event.proposal,
          ...(input.context.diagramId ? { baseArtifactFingerprint: `diagram:${input.context.diagramId}` } : {}),
          touchedEntities: touchedEntities(event.proposal),
        };
        continue;
      }
      if (event.type === "analysis") {
        analysisEmitted = true;
        yield { protocolVersion: 1, runId, seq: ++seq, type: "visual.ready", messageId, partId: `${partId}-analysis`, data: event.visualization };
        continue;
      }
      receivedResult = true;
      execution.onFinalResult?.(event.result);
      yield { protocolVersion: 1, runId, seq: ++seq, type: "text.final", messageId, partId, text: event.result.text };
      if (!proposalEmitted && event.result.proposal) {
        yield {
          protocolVersion: 1, runId, seq: ++seq, type: "artifact.proposal", messageId,
          partId: `${partId}-proposal`, proposalId: crypto.randomUUID(), data: event.result.proposal,
          ...(input.context.diagramId ? { baseArtifactFingerprint: `diagram:${input.context.diagramId}` } : {}),
          touchedEntities: touchedEntities(event.result.proposal),
        };
      }
      if (!analysisEmitted && event.result.visualization) {
        yield { protocolVersion: 1, runId, seq: ++seq, type: "visual.ready", messageId, partId: `${partId}-analysis`, data: event.result.visualization };
      }
      if (!sourcesEmitted && (event.result.sources?.length || event.result.notice)) {
        yield {
          protocolVersion: 1, runId, seq: ++seq, type: "sources.ready", messageId, partId: `${partId}-sources`,
          sources: (event.result.sources ?? []).map(({ id, title, url }) => ({ sourceId: `source-${id}`, title, url, kind: "search" })),
          retrievalStatus: event.result.sources?.length ? "used" : "unavailable",
          ...(event.result.notice ? { notice: event.result.notice } : {}),
        };
      }
    }
    if (!receivedResult) throw new ReasonAIProviderError("ReasonAI could not complete that response. Please try again.");
    yield { protocolVersion: 1, runId, seq: ++seq, type: "run.completed" };
  } catch (error) {
    if (activeTool) yield {
      protocolVersion: 1, runId, seq: ++seq, type: "tool.failed", messageId, toolCallId: activeTool.toolCallId,
      summary: signal.aborted ? "Tool cancelled" : "Tool failed",
    };
    if (signal.aborted) {
      yield { protocolVersion: 1, runId, seq: ++seq, type: "run.cancelled" };
      return;
    }
    yield {
      protocolVersion: 1,
      runId,
      seq: ++seq,
      type: "run.failed",
      message: error instanceof ReasonAIProviderError ? error.message : "ReasonAI is temporarily unavailable. Please try again.",
      code: "PROVIDER_FAILURE",
    };
  }
}
