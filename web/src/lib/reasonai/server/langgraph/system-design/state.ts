import "server-only";

import { StateSchema, UntrackedValue } from "@langchain/langgraph";
import { z } from "zod";
import { parseReasonAIProposal, parseReasonAIRequest, type ReasonAIModelTier, type ReasonAIRequest, type ReasonAIResponse, type ReasonAIValidationError } from "@/features/system-design/reasonai/contract";
import { createPendingReasonAIProposal, fingerprintReasonAIContext, fingerprintReasonAIProposal, type ReasonAIPendingProposal } from "@/features/system-design/reasonai/proposal-state";
import type { SystemDesignAgentMessage, SystemDesignAgentToolCall } from "@/features/system-design/reasonai/agent-provider";
import type { TavilyEvidence } from "@/lib/tavily/search";
import type { SystemDesignBudget } from "./budget";

export const MAX_SYSTEM_DESIGN_RECENT_TURNS = 6;
export const MAX_SYSTEM_DESIGN_SUMMARY_CHARS = 4_000;
// Leave headroom for PostgreSQL jsonb text formatting around the 512 KiB DB cap.
export const MAX_SYSTEM_DESIGN_STATE_BYTES = 480 * 1024;

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
  pendingProposal: z.object({
    proposalId: z.uuid(), version: z.number().int().positive(), diagramId: z.string().max(256),
    baseFingerprint: z.string().max(100), baseContext: z.unknown(),
    lastReportedFingerprint: z.string().max(100).optional(),
    status: z.enum(["pending", "partially_accepted", "accepted", "discarded", "superseded", "stale", "failed"]),
    proposal: z.unknown(), operationIds: z.array(z.uuid()).max(150),
    acceptedOperationIds: z.array(z.uuid()).max(150), dismissedOperationIds: z.array(z.uuid()).max(150),
    refMappings: z.record(z.string().max(80), z.string().max(256)), warnings: z.array(z.string().max(100)).max(150),
  }).strict().optional(),
}).strict();

export type SystemDesignDurableConversationState = Omit<z.infer<typeof SystemDesignDurableConversationStateSchema>, "pendingProposal"> & { pendingProposal?: ReasonAIPendingProposal };

export function parseSystemDesignDurableConversationState(value: unknown): SystemDesignDurableConversationState {
  const state = SystemDesignDurableConversationStateSchema.parse(value);
  if (state.pendingProposal) {
    const pending = state.pendingProposal;
    const base = pending.baseContext as Record<string, unknown>;
    const context = parseReasonAIRequest({ mode: "chat", message: "Validate pending proposal", history: [], context: {
      title: "", requirements: [], scaleAssumptions: [], selectedNodeIds: [], selectedEdgeIds: [],
      diagramId: base?.diagramId, nodes: base?.nodes, edges: base?.edges,
    } }).context;
    const proposal = parseReasonAIProposal(pending.proposal, context, "accumulated");
    if (pending.diagramId !== (context.diagramId ?? "") || pending.baseFingerprint !== fingerprintReasonAIContext(context)
      || pending.operationIds.length !== proposal.operations.length
      || new Set(pending.operationIds).size !== pending.operationIds.length
      || new Set([...pending.acceptedOperationIds, ...pending.dismissedOperationIds]).size !== pending.acceptedOperationIds.length + pending.dismissedOperationIds.length
      || [...pending.acceptedOperationIds, ...pending.dismissedOperationIds].some((id) => !pending.operationIds.includes(id))
      || (proposal.review && proposal.review.lastValidatedProposalVersion !== pending.version)
      || (proposal.review?.status === "passed" && proposal.review.reviewedFingerprint !== fingerprintReasonAIProposal(proposal))) throw new Error("Invalid pending proposal state.");
  }
  if (new TextEncoder().encode(JSON.stringify(state)).byteLength > MAX_SYSTEM_DESIGN_STATE_BYTES) {
    throw new Error("ReasonAI conversation state exceeds the maximum size.");
  }
  return state as SystemDesignDurableConversationState;
}

export const defaultSystemDesignDurableConversationState = (): SystemDesignDurableConversationState =>
  parseSystemDesignDurableConversationState({});

export const SystemDesignGraphState = new StateSchema({
  recentTurns: z.array(TurnSchema).max(MAX_SYSTEM_DESIGN_RECENT_TURNS).default(() => []),
  summary: z.string().max(MAX_SYSTEM_DESIGN_SUMMARY_CHARS).default(""),
  lastMode: z.enum(["chat", "review", "fix", "eagle"]).optional(),
  diagramId: z.string().max(256).optional(),
  pendingProposal: new UntrackedValue<ReasonAIPendingProposal | undefined>(),
  // pendingProposal is the last confirmed durable input; these are working copies.
  workingCheckpoint: new UntrackedValue<ReasonAIPendingProposal | undefined>(),
  baselineCheckpoint: new UntrackedValue<ReasonAIPendingProposal | undefined>(),
  budget: new UntrackedValue<SystemDesignBudget>(),
  generationComplete: new UntrackedValue<boolean | undefined>(),
  recoveryReason: new UntrackedValue<string | undefined>(),
  reviewNeedsRepair: new UntrackedValue<boolean | undefined>(),
  duplicateCallCount: new UntrackedValue<number | undefined>(),
  completedToolResults: new UntrackedValue<Record<string, string> | undefined>(),
  request: new UntrackedValue<ReasonAIRequest>(),
  runId: new UntrackedValue<string | undefined>(),
  modelTier: new UntrackedValue<ReasonAIModelTier>(),
  modelsUsed: new UntrackedValue<ReasonAIModelTier[]>(),
  escalated: new UntrackedValue<boolean>(),
  pendingEscalation: new UntrackedValue<boolean | undefined>(),
  pendingProposalRetry: new UntrackedValue<boolean | undefined>(),
  proposalRetries: new UntrackedValue<number | undefined>(),
  correctionAttempts: new UntrackedValue<number | undefined>(),
  validationRepairs: new UntrackedValue<number | undefined>(),
  proposalCorrection: new UntrackedValue<ReasonAIValidationError["diagnostic"] | undefined>(),
  executedToolCalls: new UntrackedValue<string[] | undefined>(),
  result: new UntrackedValue<ReasonAIResponse | undefined>(),
  pendingToolCalls: new UntrackedValue<SystemDesignAgentToolCall[] | undefined>(),
  agentMessages: new UntrackedValue<SystemDesignAgentMessage[] | undefined>(),
  searchEvidence: new UntrackedValue<Array<TavilyEvidence & { id: number }> | undefined>(),
  searchStatus: new UntrackedValue<"off" | "used" | "empty" | "unavailable" | undefined>(),
  searchCount: new UntrackedValue<number | undefined>(),
  proposal: new UntrackedValue<ReasonAIResponse["proposal"] | undefined>(),
  proposalBatches: new UntrackedValue<number | undefined>(),
  terminalToolFailure: new UntrackedValue<boolean | undefined>(),
  visualization: new UntrackedValue<ReasonAIResponse["visualization"] | undefined>(),
  notices: new UntrackedValue<string[] | undefined>(),
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
  const prior = state.pendingProposal;
  const priorMatchesCanvas = prior?.diagramId === (state.request.context.diagramId ?? "")
    && (prior.lastReportedFingerprint ?? prior.baseFingerprint) === fingerprintReasonAIContext(state.request.context);
  return parseSystemDesignDurableConversationState({
    recentTurns: turns.slice(-MAX_SYSTEM_DESIGN_RECENT_TURNS),
    summary: summary.length <= MAX_SYSTEM_DESIGN_SUMMARY_CHARS ? summary : summary.slice(-MAX_SYSTEM_DESIGN_SUMMARY_CHARS),
    lastMode: state.request.mode,
    ...(state.request.context.diagramId ? { diagramId: state.request.context.diagramId } : {}),
    ...(state.workingCheckpoint ? { pendingProposal: state.workingCheckpoint }
      : state.proposal ? { pendingProposal: createPendingReasonAIProposal(state.proposal, state.request.context, priorMatchesCanvas ? prior : undefined, state.proposalBatches ?? 1) }
      : prior ? { pendingProposal: priorMatchesCanvas ? prior : { ...prior, status: "stale" } } : {}),
  });
}
