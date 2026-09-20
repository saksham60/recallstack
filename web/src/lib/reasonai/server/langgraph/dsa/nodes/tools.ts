import "server-only";
import { getWriter } from "@langchain/langgraph";
import type { DSAGraphStage, DSAGraphStreamEvent } from "../events";
import { DSAGraphState } from "../state";
import { dsaToolExecutor, type DSAToolExecutor } from "../tools";

export const DSA_TOOL_TIMEOUT_MS = 15_000;

function label(name: string, tense: "running" | "done" | "failed"): string {
  if (name === "search_web") return tense === "running" ? "Searching the web…" : tense === "done" ? "Searched sources" : "Web search unavailable";
  if (name === "create_visual") return tense === "running" ? "Creating visualization…" : tense === "done" ? "Created visualization" : "Visualization unavailable";
  return tense === "running" ? "Running tool…" : tense === "done" ? "Tool completed" : "Tool unavailable";
}

export function createDSAToolsNode(
  executor: DSAToolExecutor = dsaToolExecutor,
  onStage?: (stage: DSAGraphStage, toolName?: string) => void,
  timeoutMs = DSA_TOOL_TIMEOUT_MS,
): typeof DSAGraphState.Node {
  return async (state, config) => {
    const write = getWriter(config);
    const signal = config.signal ?? new AbortController().signal;
    const toolSignal = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
    const call = state.pendingToolCalls?.[0];
    if (!call) throw new Error("DSA graph reached tools without a pending call.");
    onStage?.("tool.started", call.name);
    write?.({ type: "tool.started", toolCallId: call.id, toolName: call.name, summary: label(call.name, "running") } satisfies DSAGraphStreamEvent);
    try {
      const result = await executor.execute(call, { signal: toolSignal, searchEvidence: state.searchEvidence ?? [] });
      toolSignal.throwIfAborted();
      if (result.ok) {
        onStage?.("tool.completed", call.name);
        write?.({ type: "tool.completed", toolCallId: call.id, summary: label(call.name, "done") } satisfies DSAGraphStreamEvent);
        if (result.searchEvidence && result.retrievalStatus) {
          write?.({ type: "sources", sources: result.searchEvidence, retrievalStatus: result.retrievalStatus } satisfies DSAGraphStreamEvent);
        }
        if (result.visual) write?.({ type: "visual", visual: result.visual } satisfies DSAGraphStreamEvent);
        return {
          pendingToolCalls: undefined,
          agentMessages: [...(state.agentMessages ?? []), result.message],
          searchEvidence: result.searchEvidence ?? state.searchEvidence ?? [],
          visualDraft: result.visual ?? state.visualDraft,
          toolRounds: (state.toolRounds ?? 0) + 1,
        };
      }
      onStage?.("tool.failed", call.name);
      write?.({ type: "tool.failed", toolCallId: call.id, summary: result.reason } satisfies DSAGraphStreamEvent);
      return {
        pendingToolCalls: undefined,
        agentMessages: [...(state.agentMessages ?? []), result.message],
        searchStatus: result.retrievalStatus ?? state.searchStatus,
        toolRounds: (state.toolRounds ?? 0) + 1,
      };
    } catch (error) {
      onStage?.("tool.failed", call.name);
      write?.({ type: "tool.failed", toolCallId: call.id, summary: signal.aborted ? "Tool cancelled" : label(call.name, "failed") } satisfies DSAGraphStreamEvent);
      throw error;
    }
  };
}
