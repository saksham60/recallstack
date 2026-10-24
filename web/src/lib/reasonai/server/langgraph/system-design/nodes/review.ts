import "server-only";

import { getWriter } from "@langchain/langgraph";
import { ArchitectureReviewSchema } from "@/features/system-design/reasonai/architecture-review";
import { redactReasonAIText } from "@/features/system-design/reasonai/contract";
import { systemDesignAgentProvider, type SystemDesignAgentProvider } from "@/features/system-design/reasonai/agent-provider";
import { applySystemDesignDelta, assertSystemDesignCheckpointFits, captureSystemDesignCheckpoint, reviewCheckpointInput, withCheckpointReview } from "../checkpoint";
import type { SystemDesignGraphStage, SystemDesignGraphStreamEvent } from "../events";
import { recoverSystemDesignCheckpoint } from "../recovery";
import { SystemDesignGraphState } from "../state";

export function createSystemDesignBaselineNode(): typeof SystemDesignGraphState.Node {
  return async (state) => {
    if (!state.generationComplete || !state.proposal) throw new Error("Architecture review cannot start before primary generation completes.");
    try {
      const checkpoint = captureSystemDesignCheckpoint(state, state.proposal);
      return { workingCheckpoint: checkpoint, baselineCheckpoint: structuredClone(checkpoint), proposal: checkpoint.proposal };
    } catch (error) {
      return recoverSystemDesignCheckpoint(state, error, "generation");
    }
  };
}

export function createSystemDesignReviewNode(
  provider: SystemDesignAgentProvider = systemDesignAgentProvider,
  onStage?: (stage: SystemDesignGraphStage) => void,
): typeof SystemDesignGraphState.Node {
  return async (state, config) => {
    const checkpoint = state.workingCheckpoint;
    if (!checkpoint || !state.baselineCheckpoint) throw new Error("Architecture review requires the full validated primary baseline.");
    config.signal?.throwIfAborted();
    const write = getWriter(config);
    const meaningful = checkpoint.proposal.operations.some((op) => op.op !== "move_node");
    if (!meaningful || !provider.reviewArchitecture) {
      const next = withCheckpointReview(checkpoint, {
        status: "not_started", attempts: state.budget.reviews, repairAttempts: state.budget.repairs,
        lastValidatedProposalVersion: checkpoint.version, findings: [],
        incompleteReason: meaningful ? "reviewer_unavailable" : "layout_only",
      });
      return { workingCheckpoint: next, proposal: next.proposal, reviewNeedsRepair: false };
    }
    const toolCallId = `architecture-review-${state.budget.reviews + 1}`;
    try {
      const input = reviewCheckpointInput(state);
      state.budget.beginModelCall("review");
      onStage?.("review.started");
      write?.({ type: "tool.started", toolCallId, toolName: "architecture_review", summary: "Reviewing architecture…" } satisfies SystemDesignGraphStreamEvent);
      const output = await state.budget.run((signal) => provider.reviewArchitecture!(input, signal), config.signal, state.budget.limits.reviewCallMs);
      config.signal?.throwIfAborted();
      state.budget.check();
      // Only fixed schemas and redacted visible findings cross this boundary.
      const parsed = ArchitectureReviewSchema.parse(output);
      const review = ArchitectureReviewSchema.parse({ ...parsed,
        findings: parsed.findings.map((finding) => ({ ...finding, category: redactReasonAIText(finding.category),
          explanation: redactReasonAIText(finding.explanation), recommendation: redactReasonAIText(finding.recommendation) })),
        suggestedImprovements: parsed.suggestedImprovements.map(redactReasonAIText),
      });
      const knownRefs = new Set([...input.topology.nodes.map((node) => node.id), ...input.topology.edges.map((edge) => edge.id),
        ...state.request.context.nodes.map((node) => node.id), ...state.request.context.edges.map((edge) => edge.id), ...input.operationIds]);
      if (review.findings.some((finding) => finding.affectedRefs.some((ref) => !knownRefs.has(ref)))) throw new Error("Architecture review references unknown entities.");
      if (review.verdict === "pass" && review.findings.some((finding) => finding.severity !== "low")) throw new Error("Passing review contains material unresolved findings.");
      const next = withCheckpointReview(checkpoint, {
        status: review.verdict === "pass" ? "passed" : "needs_revision",
        attempts: state.budget.reviews, repairAttempts: state.budget.repairs,
        lastValidatedProposalVersion: checkpoint.version, reviewedProposalVersion: checkpoint.version,
        reviewedFingerprint: input.fingerprint, findings: review.findings,
        ...(review.verdict === "needs_revision" && !state.budget.canReviewAgain() ? { incompleteReason: "review_budget_exhausted" } : {}),
      });
      // Require capacity for BOTH repair and re-review. Structural validity does
      // not reset any counter; semantic revision cycles are globally bounded.
      const repair = review.verdict === "needs_revision" && Boolean(provider.repairProposal)
        && state.budget.repairs < state.budget.limits.deltaRepairs && state.budget.canReviewAgain()
        && state.budget.modelCalls + 2 <= state.budget.limits.totalModelCalls;
      assertSystemDesignCheckpointFits(state, next);
      onStage?.("review.completed");
      write?.({ type: "tool.completed", toolCallId, summary: review.verdict === "pass" ? "Architecture review passed" : "Architecture review found concerns" } satisfies SystemDesignGraphStreamEvent);
      return { workingCheckpoint: next, proposal: next.proposal, reviewNeedsRepair: repair };
    } catch (error) {
      config.signal?.throwIfAborted();
      write?.({ type: "tool.failed", toolCallId, summary: "Architecture review incomplete", code: "review" } satisfies SystemDesignGraphStreamEvent);
      return recoverSystemDesignCheckpoint(state, error, "review");
    }
  };
}

export function createSystemDesignDeltaRepairNode(
  provider: SystemDesignAgentProvider = systemDesignAgentProvider,
  onStage?: (stage: SystemDesignGraphStage) => void,
): typeof SystemDesignGraphState.Node {
  return async (state, config) => {
    const checkpoint = state.workingCheckpoint;
    if (!checkpoint || !state.reviewNeedsRepair || !provider.repairProposal) throw new Error("Proposal repair requires a reviewed checkpoint.");
    const write = getWriter(config);
    const toolCallId = `proposal-repair-${state.budget.repairs + 1}`;
    try {
      state.budget.beginModelCall("repair");
      onStage?.("repair.started");
      write?.({ type: "tool.started", toolCallId, toolName: "proposal_repair", summary: "Repairing proposal…" } satisfies SystemDesignGraphStreamEvent);
      const delta = await state.budget.run((signal) => provider.repairProposal!({
        ...reviewCheckpointInput(state), findings: checkpoint.proposal.review!.findings, modelTier: state.modelTier,
      }, signal), config.signal, state.budget.limits.repairCallMs);
      config.signal?.throwIfAborted();
      state.budget.check();
      const revised = applySystemDesignDelta(checkpoint, delta, state.request.context);
      if (revised === checkpoint) {
        write?.({ type: "tool.completed", toolCallId, summary: "No validated proposal changes" } satisfies SystemDesignGraphStreamEvent);
        const next = withCheckpointReview(checkpoint, { ...checkpoint.proposal.review!, repairAttempts: state.budget.repairs, incompleteReason: "repair_no_change" });
        return { workingCheckpoint: next, proposal: next.proposal, reviewNeedsRepair: false };
      }
      const next = withCheckpointReview(revised, {
        status: "incomplete", attempts: state.budget.reviews, repairAttempts: state.budget.repairs,
        lastValidatedProposalVersion: revised.version, reviewedProposalVersion: checkpoint.version,
        reviewedFingerprint: checkpoint.proposal.review!.reviewedFingerprint,
        findings: checkpoint.proposal.review!.findings, incompleteReason: "revised_content_not_reviewed",
      });
      assertSystemDesignCheckpointFits({ ...state, result: { text: next.proposal.summary } }, next);
      onStage?.("repair.completed");
      write?.({ type: "proposal", proposal: next.proposal, checkpoint: next } satisfies SystemDesignGraphStreamEvent);
      write?.({ type: "tool.completed", toolCallId, summary: "Proposal repair validated" } satisfies SystemDesignGraphStreamEvent);
      return { workingCheckpoint: next, proposal: next.proposal, reviewNeedsRepair: true, result: { text: next.proposal.summary } };
    } catch (error) {
      config.signal?.throwIfAborted();
      write?.({ type: "tool.failed", toolCallId, summary: "Proposal repair incomplete; prior checkpoint retained", code: "repair" } satisfies SystemDesignGraphStreamEvent);
      return recoverSystemDesignCheckpoint(state, error, "repair");
    }
  };
}
