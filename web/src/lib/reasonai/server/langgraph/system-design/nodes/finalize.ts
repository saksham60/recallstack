import "server-only";

import { getWriter } from "@langchain/langgraph";
import { ReasonAIProviderError } from "@/features/system-design/reasonai/provider";
import { requiresReasonAIProposal } from "@/features/system-design/reasonai/contract";
import type { SystemDesignGraphStreamEvent } from "../events";
import { nextSystemDesignConversationState, SystemDesignGraphState, type SystemDesignDurableConversationState } from "../state";

export function createSystemDesignFinalizeNode(
  onCandidate?: (state: SystemDesignDurableConversationState) => void,
): typeof SystemDesignGraphState.Node {
  return async (state, config) => {
    config.signal?.throwIfAborted();
    if (!state.result) throw new ReasonAIProviderError("ReasonAI could not complete that response. Please try again.");
    if (requiresReasonAIProposal(state.request) && !state.proposal
      && !["needs_clarification", "blocked", "failed"].includes(state.result.outcome ?? "completed")) {
      throw new ReasonAIProviderError("ReasonAI could not prepare canvas suggestions. Please try again.", 502, "INVALID_PROPOSAL");
    }
    const review = state.workingCheckpoint?.proposal.review;
    const reviewNotice = review && review.status !== "passed" && review.incompleteReason !== "layout_only"
      ? review.status === "needs_revision" ? "Architecture review found unresolved concerns. Review the findings before approving." : "Architecture review was not completed. This proposal has not passed architecture review."
      : undefined;
    const notice = [...new Set([...(state.notices ?? []), state.result.notice, reviewNotice].filter((value): value is string => Boolean(value)))].join(" ") || undefined;
    const result = {
      ...state.result,
      model: {
        preference: state.request.modelPreference ?? "auto",
        modelsUsed: state.modelsUsed,
        finalModel: state.modelTier,
        escalated: state.escalated,
      },
      ...(state.proposal ? { proposal: state.proposal } : {}),
      outcome: state.proposal ? "awaiting_approval" as const : state.result.outcome ?? "completed" as const,
      ...(state.visualization ? { visualization: state.visualization } : {}),
      ...(notice ? { notice } : {}),
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
      notices: undefined,
      toolRounds: undefined,
      result,
    };
  };
}
