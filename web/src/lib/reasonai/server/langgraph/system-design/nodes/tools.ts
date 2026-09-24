import "server-only";

import { getWriter } from "@langchain/langgraph";
import type { SystemDesignGraphStage, SystemDesignGraphStreamEvent } from "../events";
import { SystemDesignGraphState } from "../state";
import { systemDesignToolExecutor, type SystemDesignToolExecutor } from "../tools";

export const SYSTEM_DESIGN_TOOL_TIMEOUT_MS = 15_000;

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
    const toolSignal = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
    onStage?.("tool.started", call.name);
    write?.({ type: "tool.started", toolCallId: call.id, toolName: call.name, summary: label(call.name, "running") } satisfies SystemDesignGraphStreamEvent);
    try {
      const result = await executor.execute(call, {
        signal: toolSignal,
        request: state.request,
        searchEvidence: state.searchEvidence ?? [],
        searchCount: state.searchCount ?? 0,
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
          visualization: result.visualization ?? state.visualization,
          toolRounds: (state.toolRounds ?? 0) + 1,
        };
      }
      onStage?.("tool.failed", call.name);
      write?.({ type: "tool.failed", toolCallId: call.id, summary: result.reason || label(call.name, "failed") } satisfies SystemDesignGraphStreamEvent);
      return {
        pendingToolCalls: undefined,
        agentMessages: [...(state.agentMessages ?? []), result.message],
        searchStatus: result.retrievalStatus ?? state.searchStatus,
        searchCount: (state.searchCount ?? 0) + (call.name === "search_web" ? 1 : 0),
        notice: [state.notice, result.notice].filter(Boolean).join(" ") || undefined,
        toolRounds: (state.toolRounds ?? 0) + 1,
      };
    } catch (error) {
      onStage?.("tool.failed", call.name);
      write?.({ type: "tool.failed", toolCallId: call.id, summary: signal.aborted ? "Tool cancelled" : label(call.name, "failed") } satisfies SystemDesignGraphStreamEvent);
      throw error;
    }
  };
}
