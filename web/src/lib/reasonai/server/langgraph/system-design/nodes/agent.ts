import "server-only";

import { getWriter } from "@langchain/langgraph";
import { systemDesignAgentProvider, type SystemDesignAgentProvider, type SystemDesignAgentRound } from "@/features/system-design/reasonai/agent-provider";
import { requiresReasonAIProposal } from "@/features/system-design/reasonai/contract";
import { ReasonAIProviderError } from "@/features/system-design/reasonai/provider";
import type { SystemDesignGraphStage, SystemDesignGraphStreamEvent } from "../events";
import { SystemDesignGraphState, serverOwnedSystemDesignHistory } from "../state";
import { MAX_SYSTEM_DESIGN_TOOL_ROUNDS } from "../tools";
import { remainingReasonAIProposal, usablePendingReasonAIProposal } from "@/features/system-design/reasonai/proposal-state";

export function createSystemDesignAgentNode(
  provider: SystemDesignAgentProvider = systemDesignAgentProvider,
  onStage?: (stage: SystemDesignGraphStage) => void,
): typeof SystemDesignGraphState.Node {
  return async (state, config) => {
    const write = getWriter(config);
    const rounds = state.toolRounds ?? 0;
    const proposalRequired = requiresReasonAIProposal(state.request) && !state.proposal;
    if (rounds >= MAX_SYSTEM_DESIGN_TOOL_ROUNDS) onStage?.("tool.limit_reached");
    if (proposalRequired && rounds >= MAX_SYSTEM_DESIGN_TOOL_ROUNDS) throw new ReasonAIProviderError("ReasonAI could not prepare canvas suggestions. Please try again.");
    onStage?.(rounds ? "final_model.started" : "agent.started");
    onStage?.("provider.started");
    const modelTier = state.modelTier;
    const preference = state.request.modelPreference ?? "auto";
    const canEscalate = rounds === 0 && !proposalRequired && preference === "auto" && modelTier === "super" && !state.escalated;
    console.info("reasonai.model.selected", { runId: state.runId, preference, modelTier });
    let round: SystemDesignAgentRound | undefined;
    let visibleText = "";
    const usablePending = usablePendingReasonAIProposal(state.pendingProposal, state.request.context);
    for await (const event of provider.streamRound({
      request: { ...state.request, history: serverOwnedSystemDesignHistory(state) },
      modelTier,
      canEscalate,
      history: serverOwnedSystemDesignHistory(state),
      agentMessages: state.agentMessages ?? [],
      searchEvidence: state.searchEvidence ?? [],
      searchCount: state.searchCount ?? 0,
      searchStatus: state.searchStatus,
      proposal: state.proposal,
      pendingProposal: usablePending ? { ...usablePending, proposal: remainingReasonAIProposal(usablePending) } : undefined,
      visualization: state.visualization,
      notice: state.notice,
      allowTools: rounds < MAX_SYSTEM_DESIGN_TOOL_ROUNDS && !(state.correctionAttempts ?? 0),
      correctionOnly: Boolean(state.correctionAttempts),
      requireProposal: proposalRequired,
      proposalRetry: state.proposalRetries ?? 0,
    }, config.signal)) {
      if (event.type === "text.delta") {
        visibleText += event.delta;
        if (!proposalRequired) write?.(event satisfies SystemDesignGraphStreamEvent);
      }
      else round = event.round;
    }
    if (!round) throw new ReasonAIProviderError("ReasonAI could not complete that response. Please try again.");
    if (proposalRequired && round.kind === "final" && !/\?\s*$/u.test(round.result.text)) {
      const retries = state.proposalRetries ?? 0;
      if (retries >= 1) throw new ReasonAIProviderError("ReasonAI could not prepare canvas suggestions. Please try again.");
      onStage?.("proposal.retry");
      return { pendingProposalRetry: true, proposalRetries: retries + 1, pendingToolCalls: undefined, pendingEscalation: false, result: undefined };
    }
    if (round.kind === "escalate") {
      if (!canEscalate) throw new ReasonAIProviderError("ReasonAI could not complete that response. Please try again.");
      if (visibleText.trim()) return { pendingEscalation: false, result: { text: visibleText } };
      console.info("reasonai.model.escalated", { runId: state.runId, from: "super", to: "ultra" });
      return { modelTier: "ultra", modelsUsed: ["super", "ultra"], escalated: true, pendingEscalation: true };
    }
    if (round.kind === "tools") {
      if (rounds >= MAX_SYSTEM_DESIGN_TOOL_ROUNDS) throw new ReasonAIProviderError("ReasonAI reached the tool limit. Please try again.");
      if (round.calls[0]?.invalidReason === "unoffered_tool") {
        if (state.correctionAttempts) throw new ReasonAIProviderError("ReasonAI requested an unavailable tool. Please try again.");
        return {
          correctionAttempts: 1,
          pendingProposalRetry: true,
          pendingToolCalls: undefined,
          agentMessages: [...(state.agentMessages ?? []), round.assistantMessage, { role: "tool" as const, tool_call_id: round.calls[0].id, content: '{"ok":false,"code":"unoffered_tool","message":"Answer without tools."}' }],
        };
      }
      if (state.correctionAttempts) throw new ReasonAIProviderError("ReasonAI requested an unavailable tool. Please try again.");
      if (proposalRequired && round.calls[0]?.name !== "propose_canvas_changes") throw new ReasonAIProviderError("ReasonAI could not prepare canvas suggestions. Please try again.");
      if (proposalRequired && visibleText.trim()) write?.({ type: "text.delta", delta: visibleText } satisfies SystemDesignGraphStreamEvent);
      onStage?.("agent.tool_requested");
      return {
        pendingToolCalls: round.calls,
        agentMessages: [...(state.agentMessages ?? []), round.assistantMessage],
        result: undefined,
        pendingEscalation: false,
        pendingProposalRetry: false,
      };
    }
    return { pendingToolCalls: undefined, pendingEscalation: false, pendingProposalRetry: false, result: { ...round.result, ...(proposalRequired && !state.proposal ? { outcome: "needs_clarification" as const } : {}) } };
  };
}
