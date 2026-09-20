import "server-only";
import { getWriter } from "@langchain/langgraph";
import { DSATutorProviderError } from "@/features/dsa/reasonai/provider";
import type { DSAGraphStreamEvent } from "../events";
import { boundTutorMemory, compactTutorTurn, DSAGraphState } from "../state";

export function createDSAFinalizeNode(): typeof DSAGraphState.Node {
  return async (state, config) => {
    if (!state.result) throw new DSATutorProviderError("ReasonAI could not complete that response. Please try again.");
    const result = {
      ...state.result,
      webStatus: state.result.sources.length ? "used" as const : state.searchStatus ?? state.result.webStatus,
    };
    const hintProgress = state.request.action === "hint" ? Math.min(state.hintProgress + 1, 20) : state.hintProgress;
    const memory = boundTutorMemory(state.summary, [
      ...state.recentTurns,
      compactTutorTurn({ user: state.request.message, assistant: result.text, action: state.request.action, hintLevel: hintProgress }),
    ]);
    getWriter(config)?.({ type: "result", result } satisfies DSAGraphStreamEvent);
    return {
      ...memory,
      hintProgress,
      problemIdentity: {
        contentId: state.request.context.contentId,
        slug: state.request.context.slug,
        title: state.request.context.title,
      },
      lastTutorMode: state.request.action,
      pendingToolCalls: undefined,
      agentMessages: undefined,
      searchEvidence: undefined,
      searchStatus: undefined,
      visualDraft: undefined,
      toolRounds: undefined,
      result,
    };
  };
}
