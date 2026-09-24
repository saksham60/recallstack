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
    let round: SystemDesignAgentRound | undefined;
    for await (const event of provider.streamRound({
      request: { ...state.request, history: serverOwnedSystemDesignHistory(state) },
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
      if (event.type === "text.delta") write?.(event satisfies SystemDesignGraphStreamEvent);
      else round = event.round;
    }
    if (!round) throw new ReasonAIProviderError("ReasonAI could not complete that response. Please try again.");
    if (round.kind === "tools") {
      onStage?.("agent.tool_requested");
      return {
        pendingToolCalls: round.calls,
        agentMessages: [...(state.agentMessages ?? []), round.assistantMessage],
        result: undefined,
      };
    }
    return { pendingToolCalls: undefined, result: round.result };
  };
}
