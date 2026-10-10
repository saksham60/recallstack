import "server-only";

import { getWriter } from "@langchain/langgraph";
import { ReasonAIProviderError } from "@/features/system-design/reasonai/provider";
import type { SystemDesignGraphStage, SystemDesignGraphStreamEvent } from "../events";
import { SystemDesignGraphState, serverOwnedSystemDesignHistory } from "../state";
import { systemDesignToolExecutor, type SystemDesignToolExecutor } from "../tools";
import { remainingReasonAIProposal, usablePendingReasonAIProposal } from "@/features/system-design/reasonai/proposal-state";

export const SYSTEM_DESIGN_TOOL_TIMEOUT_MS = 15_000;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

function callKey(name: string, args: string): string {
  try { return JSON.stringify([name, canonical(JSON.parse(args))]); }
  catch { return JSON.stringify([name, args]); }
}

function label(name: string, tense: "running" | "done" | "failed"): string {
  if (name === "search_web") return tense === "running" ? "Searching current architecture references…" : tense === "done" ? "Found relevant sources" : "Web search unavailable";
  if (name === "show_architecture_analysis") return tense === "running" ? "Analyzing the active architecture…" : tense === "done" ? "Architecture analysis ready" : "Architecture analysis unavailable";
  if (name === "propose_canvas_changes") return tense === "running" ? "Preparing canvas suggestions…" : tense === "done" ? "Canvas suggestions ready" : "Canvas suggestions unavailable";
  return tense === "running" ? "Running tool…" : tense === "done" ? "Tool completed" : "Tool unavailable";
}

export function createSystemDesignToolsNode(
  executor: SystemDesignToolExecutor = systemDesignToolExecutor,
  onStage?: (stage: SystemDesignGraphStage, toolName?: string) => void,
  timeoutMs = SYSTEM_DESIGN_TOOL_TIMEOUT_MS,
): typeof SystemDesignGraphState.Node {
  return async (state, config) => {
    const write = getWriter(config);
    const signal = config.signal ?? new AbortController().signal;
    const call = state.pendingToolCalls?.[0];
    if (!call) throw new Error("System Design graph reached tools without a pending call.");
    const key = callKey(call.name, call.arguments);
    if (state.executedToolCalls?.includes(key)) throw new ReasonAIProviderError("ReasonAI repeated a completed tool call. Please try again.");
    const toolSignal = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
    onStage?.("tool.started", call.name);
    write?.({ type: "tool.started", toolCallId: call.id, toolName: call.name, summary: label(call.name, "running") } satisfies SystemDesignGraphStreamEvent);
    try {
      const result = await executor.execute(call, {
        signal: toolSignal,
        request: { ...state.request, history: serverOwnedSystemDesignHistory(state) },
        searchEvidence: state.searchEvidence ?? [],
        searchCount: state.searchCount ?? 0,
        pendingProposal: state.proposal ?? (usablePendingReasonAIProposal(state.pendingProposal, state.request.context) ? remainingReasonAIProposal(state.pendingProposal!) : undefined),
      });
      toolSignal.throwIfAborted();
      if (result.ok) {
        if (result.searchEvidence && result.retrievalStatus) write?.({ type: "sources", sources: result.searchEvidence, retrievalStatus: result.retrievalStatus } satisfies SystemDesignGraphStreamEvent);
        if (result.proposal) write?.({ type: "proposal", proposal: result.proposal } satisfies SystemDesignGraphStreamEvent);
        if (result.visualization) write?.({ type: "analysis", visualization: result.visualization } satisfies SystemDesignGraphStreamEvent);
        onStage?.("tool.completed", call.name);
        write?.({ type: "tool.completed", toolCallId: call.id, summary: label(call.name, "done") } satisfies SystemDesignGraphStreamEvent);
        return {
          pendingToolCalls: undefined,
          agentMessages: [...(state.agentMessages ?? []), result.message],
          searchEvidence: result.searchEvidence ?? state.searchEvidence ?? [],
          searchStatus: result.retrievalStatus ?? state.searchStatus,
          searchCount: (state.searchCount ?? 0) + (call.name === "search_web" ? 1 : 0),
          proposal: result.proposal ?? state.proposal,
          proposalBatches: (state.proposalBatches ?? 0) + (result.proposal ? 1 : 0),
          visualization: result.visualization ?? state.visualization,
          toolRounds: (state.toolRounds ?? 0) + 1,
          executedToolCalls: [...(state.executedToolCalls ?? []), key],
        };
      }
      if (result.code === "authorization" || result.reason === "not_authorized" || /not authorized/i.test(result.reason)) {
        onStage?.("tool.failed", call.name);
        write?.({ type: "tool.failed", toolCallId: call.id, summary: "Canvas suggestions blocked", code: "authorization" } satisfies SystemDesignGraphStreamEvent);
        return {
          pendingToolCalls: undefined,
          result: { text: "Canvas suggestions are blocked for this turn. I made no changes.", outcome: "blocked" as const },
          terminalToolFailure: true,
          toolRounds: (state.toolRounds ?? 0) + 1,
          executedToolCalls: [...(state.executedToolCalls ?? []), key],
        };
      }
      if (result.code === "validation" && (state.validationRepairs ?? 0) >= 1) {
        throw new ReasonAIProviderError("ReasonAI could not prepare a valid canvas proposal. Please try again.");
      }
      onStage?.("tool.failed", call.name);
      write?.({ type: "tool.failed", toolCallId: call.id, summary: result.reason || label(call.name, "failed"), code: result.code ?? "recoverable" } satisfies SystemDesignGraphStreamEvent);
      return {
        pendingToolCalls: undefined,
        agentMessages: [...(state.agentMessages ?? []), result.message],
        searchStatus: result.retrievalStatus ?? state.searchStatus,
        searchCount: (state.searchCount ?? 0) + (call.name === "search_web" ? 1 : 0),
        notice: [state.notice, result.notice].filter(Boolean).join(" ") || undefined,
        toolRounds: (state.toolRounds ?? 0) + 1,
        executedToolCalls: [...(state.executedToolCalls ?? []), key],
        validationRepairs: (state.validationRepairs ?? 0) + (result.code === "validation" ? 1 : 0),
      };
    } catch (error) {
      onStage?.("tool.failed", call.name);
      write?.({ type: "tool.failed", toolCallId: call.id, summary: signal.aborted ? "Tool cancelled" : label(call.name, "failed"), code: "timeout" } satisfies SystemDesignGraphStreamEvent);
      throw error;
    }
  };
}
