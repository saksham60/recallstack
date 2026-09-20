import "server-only";
import { StateSchema, UntrackedValue } from "@langchain/langgraph";
import { z } from "zod";
import type { DSATutorRequest, DSATutorResponse } from "@/features/dsa/reasonai/contract";
import type { DSAAgentMessage, DSAAgentToolCall } from "@/features/dsa/reasonai/agent-provider";
import type { WebContext } from "@/features/dsa/reasonai/web-context";

export const MAX_RECENT_TURNS = 6;
export const MAX_SUMMARY_CHARS = 4_000;
export const MAX_TURN_USER_CHARS = 2_000;
export const MAX_TURN_ASSISTANT_CHARS = 4_000;

const tutorAction = z.enum([
  "chat", "hint", "review", "solution", "complexity", "explain", "start", "trace", "visualize", "research",
]);
const tutorTurn = z.object({
  user: z.string().max(MAX_TURN_USER_CHARS),
  assistant: z.string().max(MAX_TURN_ASSISTANT_CHARS),
  action: tutorAction,
  hintLevel: z.number().int().min(0).max(20),
});
const problemIdentity = z.object({
  contentId: z.string().max(200),
  slug: z.string().max(200),
  title: z.string().max(300),
});

/** Durable fields are compact model memory; request and result never enter checkpoints. */
export const DSAGraphState = new StateSchema({
  recentTurns: z.array(tutorTurn).max(MAX_RECENT_TURNS).default(() => []),
  summary: z.string().max(MAX_SUMMARY_CHARS).default(""),
  hintProgress: z.number().int().min(0).max(20).default(0),
  problemIdentity: problemIdentity.optional(),
  lastTutorMode: tutorAction.optional(),
  request: new UntrackedValue<DSATutorRequest>(),
  result: new UntrackedValue<DSATutorResponse | undefined>(),
  pendingToolCalls: new UntrackedValue<DSAAgentToolCall[] | undefined>(),
  agentMessages: new UntrackedValue<DSAAgentMessage[] | undefined>(),
  searchEvidence: new UntrackedValue<WebContext["results"] | undefined>(),
  searchStatus: new UntrackedValue<DSATutorResponse["webStatus"] | undefined>(),
  visualDraft: new UntrackedValue<DSATutorResponse["visual"] | undefined>(),
  toolRounds: new UntrackedValue<number | undefined>(),
  learnerMemory: new UntrackedValue<string[] | undefined>(),
});

export type DSATutorTurn = z.infer<typeof tutorTurn>;
export type DSAGraphStateValue = typeof DSAGraphState.State;

function compact(value: string, max = 420): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1)}…`;
}

export function compactTutorTurn(turn: DSATutorTurn): DSATutorTurn {
  return {
    ...turn,
    user: compact(turn.user, MAX_TURN_USER_CHARS),
    assistant: compact(turn.assistant, MAX_TURN_ASSISTANT_CHARS),
  };
}

/** Rolls completed, validated turns into bounded tutor memory without another model call. */
export function boundTutorMemory(
  summary: string,
  turns: DSATutorTurn[],
): { summary: string; recentTurns: DSATutorTurn[] } {
  if (turns.length <= MAX_RECENT_TURNS) return { summary, recentTurns: turns };
  const additions = turns.slice(0, -MAX_RECENT_TURNS).map((turn) =>
    `[${turn.action}; hint ${turn.hintLevel}] Learner: ${compact(turn.user)} Tutor: ${compact(turn.assistant)}`,
  );
  const combined = [summary.trim(), ...additions].filter(Boolean).join("\n");
  return {
    summary: combined.length <= MAX_SUMMARY_CHARS ? combined : combined.slice(-MAX_SUMMARY_CHARS),
    recentTurns: turns.slice(-MAX_RECENT_TURNS),
  };
}

export function serverOwnedHistory(state: DSAGraphStateValue): DSATutorRequest["history"] {
  const recent = state.recentTurns.flatMap((turn) => [
    { role: "user" as const, content: turn.user },
    { role: "assistant" as const, content: turn.assistant },
  ]);
  return state.summary
    ? [{ role: "assistant" as const, content: `Server-owned tutor memory summary:\n${state.summary}` }, ...recent]
    : recent;
}
