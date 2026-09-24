import "server-only";

import { StateSchema, UntrackedValue } from "@langchain/langgraph";
import { z } from "zod";
import type { ReasonAIRequest, ReasonAIResponse } from "@/features/system-design/reasonai/contract";
import type { SystemDesignAgentMessage, SystemDesignAgentToolCall } from "@/features/system-design/reasonai/agent-provider";
import type { TavilyEvidence } from "@/lib/tavily/search";

export const MAX_SYSTEM_DESIGN_RECENT_TURNS = 6;
export const MAX_SYSTEM_DESIGN_SUMMARY_CHARS = 4_000;
export const MAX_SYSTEM_DESIGN_STATE_BYTES = 64 * 1024;

const TurnSchema = z.object({
  user: z.string().max(4_000),
  assistant: z.string().max(8_000),
  mode: z.enum(["chat", "review", "fix", "eagle"]),
});

export const SystemDesignDurableConversationStateSchema = z.object({
  recentTurns: z.array(TurnSchema).max(MAX_SYSTEM_DESIGN_RECENT_TURNS).default(() => []),
  summary: z.string().max(MAX_SYSTEM_DESIGN_SUMMARY_CHARS).default(""),
  lastMode: z.enum(["chat", "review", "fix", "eagle"]).optional(),
  diagramId: z.string().max(256).optional(),
}).strict();

export type SystemDesignDurableConversationState = z.infer<typeof SystemDesignDurableConversationStateSchema>;

export function parseSystemDesignDurableConversationState(value: unknown): SystemDesignDurableConversationState {
  const state = SystemDesignDurableConversationStateSchema.parse(value);
  if (new TextEncoder().encode(JSON.stringify(state)).byteLength > MAX_SYSTEM_DESIGN_STATE_BYTES) {
    throw new Error("ReasonAI conversation state exceeds the maximum size.");
  }
  return state;
}

export const defaultSystemDesignDurableConversationState = (): SystemDesignDurableConversationState =>
  SystemDesignDurableConversationStateSchema.parse({});

export const SystemDesignGraphState = new StateSchema({
  recentTurns: z.array(TurnSchema).max(MAX_SYSTEM_DESIGN_RECENT_TURNS).default(() => []),
  summary: z.string().max(MAX_SYSTEM_DESIGN_SUMMARY_CHARS).default(""),
  lastMode: z.enum(["chat", "review", "fix", "eagle"]).optional(),
  diagramId: z.string().max(256).optional(),
  request: new UntrackedValue<ReasonAIRequest>(),
  result: new UntrackedValue<ReasonAIResponse | undefined>(),
  pendingToolCalls: new UntrackedValue<SystemDesignAgentToolCall[] | undefined>(),
  agentMessages: new UntrackedValue<SystemDesignAgentMessage[] | undefined>(),
  searchEvidence: new UntrackedValue<Array<TavilyEvidence & { id: number }> | undefined>(),
  searchStatus: new UntrackedValue<"off" | "used" | "empty" | "unavailable" | undefined>(),
  searchCount: new UntrackedValue<number | undefined>(),
  proposal: new UntrackedValue<ReasonAIResponse["proposal"] | undefined>(),
  visualization: new UntrackedValue<ReasonAIResponse["visualization"] | undefined>(),
  notice: new UntrackedValue<string | undefined>(),
  toolRounds: new UntrackedValue<number | undefined>(),
});

export type SystemDesignGraphStateValue = typeof SystemDesignGraphState.State;

function compact(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1)}…`;
}

export function serverOwnedSystemDesignHistory(state: SystemDesignGraphStateValue): ReasonAIRequest["history"] {
  const recent = state.recentTurns.flatMap((turn) => [
    { role: "user" as const, content: turn.user },
    { role: "assistant" as const, content: turn.assistant },
  ]);
  return state.summary
    ? [{ role: "assistant" as const, content: `Server-owned architecture conversation summary:\n${state.summary}` }, ...recent]
    : recent;
}

export function nextSystemDesignConversationState(state: SystemDesignGraphStateValue): SystemDesignDurableConversationState {
  if (!state.result) throw new Error("System Design graph completed without a result.");
  const turns = [...state.recentTurns, {
    user: compact(state.request.message, 4_000),
    assistant: compact(state.result.text, 8_000),
    mode: state.request.mode,
  }];
  const overflow = turns.slice(0, -MAX_SYSTEM_DESIGN_RECENT_TURNS);
  const additions = overflow.map((turn) => `[${turn.mode}] User: ${compact(turn.user, 420)} ReasonAI: ${compact(turn.assistant, 700)}`);
  const summary = [state.summary.trim(), ...additions].filter(Boolean).join("\n");
  return parseSystemDesignDurableConversationState({
    recentTurns: turns.slice(-MAX_SYSTEM_DESIGN_RECENT_TURNS),
    summary: summary.length <= MAX_SYSTEM_DESIGN_SUMMARY_CHARS ? summary : summary.slice(-MAX_SYSTEM_DESIGN_SUMMARY_CHARS),
    lastMode: state.request.mode,
    ...(state.request.context.diagramId ? { diagramId: state.request.context.diagramId } : {}),
  });
}
