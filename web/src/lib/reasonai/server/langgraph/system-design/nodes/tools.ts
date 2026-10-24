import "server-only";

import { getWriter } from "@langchain/langgraph";
import { ReasonAIProviderError } from "@/features/system-design/reasonai/provider";
import type { SystemDesignGraphStage, SystemDesignGraphStreamEvent } from "../events";
import { SystemDesignGraphState, serverOwnedSystemDesignHistory } from "../state";
import { systemDesignToolExecutor, type SystemDesignToolExecutor } from "../tools";
import { remainingReasonAIProposal, usablePendingReasonAIProposal } from "@/features/system-design/reasonai/proposal-state";
import { SystemDesignBudgetError } from "../budget";
import { captureSystemDesignCheckpoint } from "../checkpoint";
import { recoverSystemDesignCheckpoint } from "../recovery";

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
    const toolSignal = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
    let validationFailure = false;
    onStage?.("tool.started", call.name);
    write?.({ type: "tool.started", toolCallId: call.id, toolName: call.name, summary: label(call.name, "running") } satisfies SystemDesignGraphStreamEvent);
    try {
      signal.throwIfAborted();
      state.budget.check();
      if ((state.toolRounds ?? 0) >= state.budget.limits.toolRounds) throw new SystemDesignBudgetError("tool_rounds");
      const completed = state.completedToolResults?.[key];
      if (completed !== undefined) {
        const duplicateCallCount = (state.duplicateCallCount ?? 0) + 1;
        if (duplicateCallCount > state.budget.limits.duplicateCalls) throw new SystemDesignBudgetError("duplicate_calls");
        write?.({ type: "tool.completed", toolCallId: call.id, summary: "Already completed; retained the validated result" } satisfies SystemDesignGraphStreamEvent);
        let previousResult: unknown;
        try { previousResult = JSON.parse(completed); } catch { previousResult = completed; }
        return {
          duplicateCallCount, pendingToolCalls: undefined, toolRounds: (state.toolRounds ?? 0) + 1,
          agentMessages: [...(state.agentMessages ?? []), { role: "tool" as const, tool_call_id: call.id,
            content: JSON.stringify({ ok: true, status: "already_completed", result: previousResult }) }],
        };
      }
      const result = await state.budget.run((boundedSignal) => executor.execute(call, {
        signal: boundedSignal,
        request: { ...state.request, history: serverOwnedSystemDesignHistory(state) },
        searchEvidence: state.searchEvidence ?? [],
        searchCount: state.searchCount ?? 0,
        pendingProposal: state.proposal ?? (usablePendingReasonAIProposal(state.pendingProposal, state.request.context) ? remainingReasonAIProposal(state.pendingProposal!) : undefined),
      }), toolSignal);
      toolSignal.throwIfAborted();
      if (result.ok) {
        const checkpoint = result.proposal ? captureSystemDesignCheckpoint(state, result.proposal) : state.workingCheckpoint;
        if (result.searchEvidence && result.retrievalStatus) write?.({ type: "sources", sources: result.searchEvidence, retrievalStatus: result.retrievalStatus } satisfies SystemDesignGraphStreamEvent);
        if (result.proposal && checkpoint) write?.({ type: "proposal", proposal: checkpoint.proposal, checkpoint } satisfies SystemDesignGraphStreamEvent);
        if (result.visualization) write?.({ type: "analysis", visualization: result.visualization } satisfies SystemDesignGraphStreamEvent);
        onStage?.("tool.completed", call.name);
        write?.({ type: "tool.completed", toolCallId: call.id, summary: label(call.name, "done") } satisfies SystemDesignGraphStreamEvent);
        return {
          pendingToolCalls: undefined,
          agentMessages: [...(state.agentMessages ?? []), result.message],
          searchEvidence: result.searchEvidence ?? state.searchEvidence ?? [],
          searchStatus: result.retrievalStatus ?? state.searchStatus,
          searchCount: (state.searchCount ?? 0) + (call.name === "search_web" ? 1 : 0),
          proposal: checkpoint?.proposal ?? state.proposal,
          workingCheckpoint: checkpoint,
          proposalBatches: (state.proposalBatches ?? 0) + (result.proposal ? 1 : 0),
          ...(result.proposal ? { proposalCorrection: undefined } : {}),
          visualization: result.visualization ?? state.visualization,
          toolRounds: (state.toolRounds ?? 0) + 1,
          executedToolCalls: [...(state.executedToolCalls ?? []), key],
          completedToolResults: { ...state.completedToolResults, [key]: result.message.content ?? "{}" },
        };
      }
      if (result.code === "authorization" || result.reason === "not_authorized" || /not authorized/i.test(result.reason)) {
        onStage?.("tool.failed", call.name);
        write?.({ type: "tool.failed", toolCallId: call.id, summary: "Canvas suggestions blocked", code: "authorization" } satisfies SystemDesignGraphStreamEvent);
        return {
          pendingToolCalls: undefined,
          result: { text: "Canvas suggestions are blocked for this turn. I made no changes.", outcome: "blocked" as const },
          terminalToolFailure: true,
          proposal: undefined,
          workingCheckpoint: undefined,
          toolRounds: (state.toolRounds ?? 0) + 1,
          executedToolCalls: [...(state.executedToolCalls ?? []), key],
        };
      }
      if (result.code === "validation" && (state.validationRepairs ?? 0) >= state.budget.limits.validationRepairs) {
        validationFailure = true;
        throw new ReasonAIProviderError("ReasonAI could not prepare a valid canvas proposal. Please try again.", 502, "INVALID_PROPOSAL");
      }
      onStage?.("tool.failed", call.name);
      write?.({ type: "tool.failed", toolCallId: call.id, summary: result.reason || label(call.name, "failed"), code: result.code ?? "recoverable" } satisfies SystemDesignGraphStreamEvent);
      return {
        pendingToolCalls: undefined,
        agentMessages: [...(state.agentMessages ?? []), result.message],
        searchStatus: result.retrievalStatus ?? state.searchStatus,
        searchCount: (state.searchCount ?? 0) + (call.name === "search_web" ? 1 : 0),
        notices: [...new Set([...(state.notices ?? []), ...(result.notice ? [result.notice] : [])])],
        toolRounds: (state.toolRounds ?? 0) + 1,
        validationRepairs: (state.validationRepairs ?? 0) + (result.code === "validation" ? 1 : 0),
        ...(result.code === "validation" ? { proposalCorrection: result.diagnostic ?? { code: "INVALID_PROPOSAL" } } : {}),
      };
    } catch (error) {
      onStage?.("tool.failed", call.name);
      const code = validationFailure ? "validation" : toolSignal.aborted && !signal.aborted ? "timeout" : "recoverable";
      write?.({ type: "tool.failed", toolCallId: call.id, summary: signal.aborted ? "Tool cancelled" : validationFailure ? "The canvas proposal was invalid." : label(call.name, "failed"), code } satisfies SystemDesignGraphStreamEvent);
      signal.throwIfAborted();
      const recovery = recoverSystemDesignCheckpoint(state, error, "generation");
      return { ...recovery, ...(error instanceof SystemDesignBudgetError && error.reason === "duplicate_calls"
        ? { duplicateCallCount: (state.duplicateCallCount ?? 0) + 1 } : {}) };
    }
  };
}
