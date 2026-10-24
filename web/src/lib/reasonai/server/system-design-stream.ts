import "server-only";

import type { ReasonAIRequest, ReasonAIResponse } from "@/features/system-design/reasonai/contract";
import { ReasonAIProviderError } from "@/features/system-design/reasonai/provider";
import type { SystemDesignAgentProvider } from "@/features/system-design/reasonai/agent-provider";
import type { ReasonAIKnownEvent } from "@/lib/reasonai/runtime/events";
import { streamSystemDesignGraph } from "./langgraph/system-design/graph";
import type { SystemDesignDurableConversationState } from "./langgraph/system-design/state";
import type { SystemDesignToolExecutor } from "./langgraph/system-design/tools";
import { fingerprintReasonAIContext, usablePendingReasonAIProposal, type ReasonAIPendingProposal } from "@/features/system-design/reasonai/proposal-state";
import { SystemDesignBudgetError, type SystemDesignBudgetLimits } from "./langgraph/system-design/budget";
import { systemDesignFailureCode } from "./langgraph/system-design/recovery";

export interface SystemDesignStreamExecution {
  durableState: SystemDesignDurableConversationState;
  runId: string;
  messageId: string;
  provider?: SystemDesignAgentProvider;
  toolExecutor?: SystemDesignToolExecutor;
  toolTimeoutMs?: number;
  budgets?: Partial<SystemDesignBudgetLimits>;
  startedAt?: number;
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
  const started = Date.now();
  const partId = crypto.randomUUID();
  const currentFingerprint = fingerprintReasonAIContext(input.context);
  const previous = usablePendingReasonAIProposal(execution.durableState.pendingProposal, input.context);
  let proposalId = previous?.proposalId ?? crypto.randomUUID();
  let baseFingerprint = previous?.baseFingerprint ?? currentFingerprint;
  let seq = 0;
  let activeTool: { toolCallId: string; toolName: string; started: number } | undefined;
  let toolAttempt = 0;
  let proposalEmitted = false;
  let proposalVersion = previous?.version ?? 0;
  let lastCheckpoint: ReasonAIPendingProposal | undefined;
  let lastEmittedProposal: string | undefined;
  let analysisEmitted = false;
  let sourcesEmitted = false;
  let completedModel: ReasonAIResponse["model"];
  let taskOutcome: ReasonAIResponse["outcome"];
  yield { protocolVersion: 1, runId, seq: ++seq, type: "run.started" };
  try {
    let receivedResult = false;
    for await (const event of streamSystemDesignGraph(input, {
      durableState: execution.durableState,
      runId,
      signal,
      provider: execution.provider,
      toolExecutor: execution.toolExecutor,
      toolTimeoutMs: execution.toolTimeoutMs,
      budgets: execution.budgets,
      startedAt: execution.startedAt,
      onConversationState: (state) => { lastCheckpoint = state.pendingProposal; execution.onConversationState?.(state); },
      onStage: (stage, toolName) => console.info("[SYSTEM_DESIGN_V2]", { runId, stage, ...(toolName ? { toolName } : {}) }),
    })) {
      if (event.type === "text.delta") {
        yield { protocolVersion: 1, runId, seq: ++seq, type: "text.delta", messageId, partId, delta: event.delta };
        continue;
      }
      if (event.type === "tool.started") {
        activeTool = { toolCallId: event.toolCallId, toolName: event.toolName, started: Date.now() };
        toolAttempt++;
        yield { protocolVersion: 1, runId, seq: ++seq, type: "tool.started", messageId, toolCallId: event.toolCallId, toolName: event.toolName, summary: event.summary };
        continue;
      }
      if (event.type === "tool.completed" || event.type === "tool.failed") {
        console.info(`reasonai.${event.type}`, { runId, feature: "system-design", route: "/api/reasonai/chat", toolName: activeTool?.toolName ?? "unknown", attempt: toolAttempt, durationMs: activeTool ? Date.now() - activeTool.started : 0, ...(event.type === "tool.failed" ? { errorCode: event.code ?? "recoverable" } : {}) });
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
        lastEmittedProposal = JSON.stringify(event.proposal);
        if (event.checkpoint) {
          lastCheckpoint = event.checkpoint;
          proposalId = event.checkpoint.proposalId;
          proposalVersion = event.checkpoint.version;
          baseFingerprint = event.checkpoint.baseFingerprint;
        } else proposalVersion++;
        yield {
          protocolVersion: 1,
          runId,
          seq: ++seq,
          type: "artifact.proposal",
          messageId,
          partId: `${partId}-proposal`,
          proposalId,
          proposalVersion,
          persistenceStatus: "working",
          data: event.proposal,
          baseArtifactFingerprint: baseFingerprint,
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
      completedModel = event.result.model;
      taskOutcome = event.result.outcome;
      execution.onFinalResult?.(event.result);
      yield { protocolVersion: 1, runId, seq: ++seq, type: "text.final", messageId, partId, text: event.result.text, ...(event.result.model ? { model: event.result.model } : {}), ...(event.result.outcome ? { outcome: event.result.outcome } : {}) };
      if (event.result.proposal && (!proposalEmitted || lastEmittedProposal !== JSON.stringify(event.result.proposal))) {
        proposalId = lastCheckpoint?.proposalId ?? proposalId;
        proposalVersion = lastCheckpoint?.version ?? proposalVersion + 1;
        yield {
          protocolVersion: 1, runId, seq: ++seq, type: "artifact.proposal", messageId,
          partId: `${partId}-proposal`, proposalId, proposalVersion, data: event.result.proposal,
          persistenceStatus: "working",
          baseArtifactFingerprint: baseFingerprint,
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
    // Model metadata comes from graph state, never from provider text.
    console.info("reasonai.generation.completed", { runId, feature: "system-design", route: "/api/reasonai/chat", durationMs: Date.now() - started, taskOutcome, modelPreference: input.modelPreference ?? "auto", modelsUsed: completedModel?.modelsUsed, finalModel: completedModel?.finalModel });
    yield { protocolVersion: 1, runId, seq: ++seq, type: "run.completed" };
  } catch (error) {
    if (activeTool) console.error("reasonai.tool.failed", { runId, feature: "system-design", route: "/api/reasonai/chat", toolName: activeTool.toolName, attempt: toolAttempt, durationMs: Date.now() - activeTool.started, errorCode: signal.aborted ? "TOOL_CANCELLED" : "TOOL_EXECUTION_FAILED" });
    if (activeTool) yield {
      protocolVersion: 1, runId, seq: ++seq, type: "tool.failed", messageId, toolCallId: activeTool.toolCallId,
      summary: signal.aborted ? "Tool cancelled" : "Tool failed",
    };
    if (signal.aborted) {
      yield { protocolVersion: 1, runId, seq: ++seq, type: "run.cancelled" };
      return;
    }
    const errorCode = systemDesignFailureCode(error);
    console.error("reasonai.run.failed", { runId, feature: "system-design", route: "/api/reasonai/chat", errorCode, durationMs: Date.now() - started });
    yield {
      protocolVersion: 1,
      runId,
      seq: ++seq,
      type: "run.failed",
      message: error instanceof ReasonAIProviderError ? error.message : error instanceof SystemDesignBudgetError ? "ReasonAI reached its execution budget before preparing a usable proposal. Please try again." : "ReasonAI is temporarily unavailable. Please try again.",
      code: errorCode,
    };
  }
}
