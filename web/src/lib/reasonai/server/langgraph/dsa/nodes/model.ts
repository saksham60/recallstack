import "server-only";
import { getWriter } from "@langchain/langgraph";
import {
  dsaTutorProvider,
  DSATutorProviderError,
  type DSATutorProviderStreamEvent,
} from "@/features/dsa/reasonai/provider";
import { dsaAgentProvider, type DSAAgentProvider, type DSAAgentRound } from "@/features/dsa/reasonai/agent-provider";
import type { DSATutorRequest } from "@/features/dsa/reasonai/contract";
import type { DSAGraphStage, DSAGraphStreamEvent } from "../events";
import { DSAGraphState, serverOwnedHistory } from "../state";
import { MAX_TOOL_ROUNDS } from "../tools";

export interface DSATutorStreamingProvider {
  stream(request: DSATutorRequest, signal?: AbortSignal): AsyncGenerator<DSATutorProviderStreamEvent>;
}

export function createDSAModelNode(
  provider: DSATutorStreamingProvider | DSAAgentProvider = dsaAgentProvider,
  onStage?: (stage: DSAGraphStage) => void,
): typeof DSAGraphState.Node {
  return async (state, config) => {
    const write = getWriter(config);
    const hintProgress = state.request.action === "hint"
      ? Math.min(state.hintProgress + 1, 20)
      : state.hintProgress;
    const effectiveRequest: DSATutorRequest = {
      ...state.request,
      history: serverOwnedHistory(state),
      hintLevel: hintProgress,
    };

    const rounds = state.toolRounds ?? 0;
    if (rounds >= MAX_TOOL_ROUNDS) onStage?.("tool.limit_reached");
    onStage?.(rounds ? "final_model.started" : "agent.started");
    onStage?.("provider.started");
    let round: DSAAgentRound | undefined;
    if ("streamRound" in provider) {
      for await (const event of provider.streamRound({
        request: effectiveRequest,
        history: effectiveRequest.history,
        learnerMemory: state.learnerMemory ?? [],
        agentMessages: state.agentMessages ?? [],
        searchEvidence: state.searchEvidence ?? [],
        searchStatus: state.searchStatus,
        visual: state.visualDraft,
        allowTools: rounds < MAX_TOOL_ROUNDS,
      }, config.signal)) {
        if (event.type === "text.delta") write?.(event satisfies DSAGraphStreamEvent);
        else round = event.round;
      }
    } else {
      let result;
      for await (const event of (provider ?? dsaTutorProvider).stream(effectiveRequest, config.signal)) {
        write?.(event satisfies DSATutorProviderStreamEvent);
        if (event.type === "result") result = event.result;
      }
      if (result) round = { kind: "final", result };
    }
    if (!round) throw new DSATutorProviderError("ReasonAI could not complete that response. Please try again.");
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
