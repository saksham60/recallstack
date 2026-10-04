import "server-only";

import { getWriter } from "@langchain/langgraph";
import { systemDesignAgentProvider, type SystemDesignAgentProvider, type SystemDesignAgentRound } from "@/features/system-design/reasonai/agent-provider";
import { ReasonAIProviderError } from "@/features/system-design/reasonai/provider";
import type { SystemDesignGraphStage, SystemDesignGraphStreamEvent } from "../events";
import { SystemDesignGraphState, serverOwnedSystemDesignHistory } from "../state";
import { MAX_SYSTEM_DESIGN_TOOL_ROUNDS } from "../tools";

export function createSystemDesignAgentNode(
  provider: SystemDesignAgentProvider = systemDesignAgentProvider,
  onStage?: (stage: SystemDesignGraphStage) => void,
): typeof SystemDesignGraphState.Node {
  return async (state, config) => {
    const write = getWriter(config);
    const rounds = state.toolRounds ?? 0;
    if (rounds >= MAX_SYSTEM_DESIGN_TOOL_ROUNDS) onStage?.("tool.limit_reached");
    onStage?.(rounds ? "final_model.started" : "agent.started");
    onStage?.("provider.started");
    const modelTier = state.modelTier;
    const preference = state.request.modelPreference ?? "auto";
    const canEscalate = preference === "auto" && modelTier === "super" && !state.escalated;
    console.info("reasonai.model.selected", { runId: state.runId, preference, modelTier });
    let round: SystemDesignAgentRound | undefined;
    let visibleText = "";
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
      visualization: state.visualization,
      notice: state.notice,
      allowTools: rounds < MAX_SYSTEM_DESIGN_TOOL_ROUNDS,
    }, config.signal)) {
      if (event.type === "text.delta") {
        visibleText += event.delta;
        write?.(event satisfies SystemDesignGraphStreamEvent);
      }
      else round = event.round;
    }
    if (!round) throw new ReasonAIProviderError("ReasonAI could not complete that response. Please try again.");
    if (round.kind === "escalate") {
      if (!canEscalate) throw new ReasonAIProviderError("ReasonAI could not complete that response. Please try again.");
      if (visibleText.trim()) return { pendingEscalation: false, result: { text: visibleText } };
      console.info("reasonai.model.escalated", { runId: state.runId, from: "super", to: "ultra" });
      return { modelTier: "ultra", modelsUsed: ["super", "ultra"], escalated: true, pendingEscalation: true };
    }
    if (round.kind === "tools") {
      onStage?.("agent.tool_requested");
      return {
        pendingToolCalls: round.calls,
        agentMessages: [...(state.agentMessages ?? []), round.assistantMessage],
        result: undefined,
        pendingEscalation: false,
      };
    }
    return { pendingToolCalls: undefined, pendingEscalation: false, result: round.result };
  };
}
