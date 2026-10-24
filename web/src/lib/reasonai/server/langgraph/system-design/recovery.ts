import "server-only";

import { SystemDesignBudgetError } from "./budget";
import { withCheckpointReview } from "./checkpoint";
import type { SystemDesignGraphStateValue } from "./state";

export function systemDesignFailureCode(error: unknown): string {
  if (error instanceof SystemDesignBudgetError) return "BUDGET_EXHAUSTED";
  if (error instanceof Error && "failureCode" in error && typeof error.failureCode === "string") return error.failureCode;
  return "PROVIDER_FAILURE";
}

export function recoverSystemDesignCheckpoint(state: SystemDesignGraphStateValue, error: unknown, stage: "generation" | "review" | "repair") {
  const checkpoint = state.workingCheckpoint;
  if (!checkpoint) throw error;
  const reason = error instanceof SystemDesignBudgetError ? error.reason : `${stage.toUpperCase()}_FAILED`;
  const previous = checkpoint.proposal.review;
  const review = {
    status: previous?.status === "needs_revision" && previous.reviewedProposalVersion === checkpoint.version
      ? "needs_revision" as const : stage === "review" && !(error instanceof SystemDesignBudgetError) ? "failed" as const : "incomplete" as const,
    attempts: state.budget.reviews, repairAttempts: state.budget.repairs,
    lastValidatedProposalVersion: checkpoint.version,
    findings: previous?.findings ?? [],
    ...(previous?.reviewedProposalVersion ? { reviewedProposalVersion: previous.reviewedProposalVersion, reviewedFingerprint: previous.reviewedFingerprint } : {}),
    incompleteReason: reason,
  };
  const recovered = withCheckpointReview(checkpoint, review);
  console.warn("reasonai.proposal.recovered", { runId: state.runId, stage, code: systemDesignFailureCode(error), proposalVersion: recovered.version,
    modelCalls: state.budget.modelCalls, reviewAttempts: state.budget.reviews, repairAttempts: state.budget.repairs,
    toolRounds: state.toolRounds ?? 0, duplicateCallCount: state.duplicateCallCount ?? 0, reason });
  return {
    workingCheckpoint: recovered, proposal: recovered.proposal, recoveryReason: reason,
    pendingToolCalls: undefined, pendingEscalation: false, pendingProposalRetry: false,
    terminalToolFailure: true, reviewNeedsRepair: false,
    result: { text: recovered.proposal.summary, notice: "The latest validated proposal was retained. Generation or architecture review was incomplete; review the remaining concerns before approval." },
  };
}
