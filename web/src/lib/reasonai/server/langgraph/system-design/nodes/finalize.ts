import "server-only";

import { getWriter } from "@langchain/langgraph";
import { ReasonAIProviderError } from "@/features/system-design/reasonai/provider";
import type { SystemDesignGraphStreamEvent } from "../events";
import { nextSystemDesignConversationState, SystemDesignGraphState, type SystemDesignDurableConversationState } from "../state";

export function createSystemDesignFinalizeNode(
  onCandidate?: (state: SystemDesignDurableConversationState) => void,
): typeof SystemDesignGraphState.Node {
  return async (state, config) => {
    if (!state.result) throw new ReasonAIProviderError("ReasonAI could not complete that response. Please try again.");
    const result = {
      ...state.result,
      ...(state.proposal ? { proposal: state.proposal } : {}),
      ...(state.visualization ? { visualization: state.visualization } : {}),
      ...([state.result.notice, state.notice].filter(Boolean).join(" ") ? { notice: [state.result.notice, state.notice].filter(Boolean).join(" ") } : {}),
    };
    const candidate = nextSystemDesignConversationState({ ...state, result });
    onCandidate?.(candidate);
    getWriter(config)?.({ type: "result", result } satisfies SystemDesignGraphStreamEvent);
    return {
      ...candidate,
      pendingToolCalls: undefined,
      agentMessages: undefined,
      searchEvidence: undefined,
      searchStatus: undefined,
      searchCount: undefined,
      proposal: undefined,
      visualization: undefined,
      notice: undefined,
      toolRounds: undefined,
      result,
    };
  };
}
