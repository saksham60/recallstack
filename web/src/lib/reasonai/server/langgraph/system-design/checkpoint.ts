import "server-only";

import { parseReasonAIProposal, type ReasonAIContext, type ReasonAIProposal } from "@/features/system-design/reasonai/contract";
import { ProposalDeltaSchema, type ArchitectureReviewMetadata, type ProposalDelta } from "@/features/system-design/reasonai/architecture-review";
import { createPendingReasonAIProposal, fingerprintReasonAIProposal, proposalContentKey, usablePendingReasonAIProposal, type ReasonAIPendingProposal } from "@/features/system-design/reasonai/proposal-state";
import { sanitizeAIProposal } from "@/features/system-design/reasonai/sanitizeAIProposal";
import { MAX_SYSTEM_DESIGN_STATE_BYTES, nextSystemDesignConversationState, type SystemDesignGraphStateValue } from "./state";

export function assertSystemDesignCheckpointFits(state: SystemDesignGraphStateValue, checkpoint: ReasonAIPendingProposal): void {
  const candidate = nextSystemDesignConversationState({ ...state, workingCheckpoint: checkpoint,
    proposal: checkpoint.proposal, result: state.result ?? { text: checkpoint.proposal.summary } });
  // Reserve space for compact recovery metadata rather than losing a valid
  // checkpoint to a larger advisory review or final narration.
  if (new TextEncoder().encode(JSON.stringify(candidate)).byteLength > MAX_SYSTEM_DESIGN_STATE_BYTES - 4_096) throw new Error("Proposal checkpoint exceeds its recoverable state budget.");
}

/** Working state only. Supabase confirmation occurs outside the graph. */
export function captureSystemDesignCheckpoint(state: SystemDesignGraphStateValue, proposal: ReasonAIProposal): ReasonAIPendingProposal {
  const previous = state.workingCheckpoint ?? usablePendingReasonAIProposal(state.pendingProposal, state.request.context);
  const validated = parseReasonAIProposal({ summary: proposal.summary, operations: proposal.operations }, state.request.context, "accumulated");
  const checkpoint = createPendingReasonAIProposal(validated, state.request.context, previous);
  const priorReview = previous?.proposal.review;
  checkpoint.proposal.review = {
    status: "not_started", attempts: state.budget?.reviews ?? 0, repairAttempts: state.budget?.repairs ?? 0,
    lastValidatedProposalVersion: checkpoint.version, findings: [],
    ...(priorReview && proposalContentKey(validated) === proposalContentKey(previous!.proposal) ? priorReview : {}),
  };
  assertSystemDesignCheckpointFits(state, checkpoint);
  return checkpoint;
}

export function withCheckpointReview(checkpoint: ReasonAIPendingProposal, review: ArchitectureReviewMetadata): ReasonAIPendingProposal {
  return { ...checkpoint, proposal: { ...checkpoint.proposal, review } };
}

export function reviewCheckpointInput(state: SystemDesignGraphStateValue) {
  const checkpoint = state.workingCheckpoint;
  if (!checkpoint) throw new Error("Architecture review requires a validated baseline checkpoint.");
  // Revalidate before projecting or making any additional LLM call.
  const proposal = parseReasonAIProposal(checkpoint.proposal, state.request.context, "accumulated");
  return {
    request: state.request, proposalId: checkpoint.proposalId, version: checkpoint.version,
    fingerprint: fingerprintReasonAIProposal(proposal), proposal, operationIds: checkpoint.operationIds,
    topology: projectSystemDesignTopology(state.request.context, proposal),
  };
}

/** Pure projection: never invokes canvas commits, persistence, Undo or Live Share. */
export function projectSystemDesignTopology(context: ReasonAIContext, proposal: ReasonAIProposal): Pick<ReasonAIContext, "nodes" | "edges"> {
  const validated = parseReasonAIProposal(proposal, context, "accumulated");
  const nodes = new Map(context.nodes.map((node) => [node.id, { ...node }]));
  const edges = new Map(context.edges.map((edge) => [edge.id, { ...edge }]));
  for (const [index, op] of validated.operations.entries()) {
    switch (op.op) {
      case "add_node": nodes.set(op.ref, { id: op.ref, type: op.type, x: op.x, y: op.y, label: op.label, subtitle: op.subtitle ?? "", description: op.description ?? "", technology: op.technology }); break;
      case "update_node": case "move_node": nodes.set(op.nodeId, { ...nodes.get(op.nodeId)!, ...op }); break;
      case "delete_node":
        nodes.delete(op.nodeId);
        for (const [id, edge] of edges) if (edge.sourceNodeId === op.nodeId || edge.targetNodeId === op.nodeId) edges.delete(id);
        break;
      case "add_edge": {
        let id = `proposed-edge:${index}`;
        while (edges.has(id)) id = `proposed:${id}`;
        edges.set(id, { ...op, id }); break;
      }
      case "update_edge": edges.set(op.edgeId, { ...edges.get(op.edgeId)!, ...op }); break;
      case "delete_edge": edges.delete(op.edgeId); break;
    }
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

/** Apply a model delta to a copy, then validate the entire result before commit. */
export function applySystemDesignDelta(checkpoint: ReasonAIPendingProposal, delta: ProposalDelta, context: ReasonAIContext): ReasonAIPendingProposal {
  ProposalDeltaSchema.parse(delta);
  if (delta.proposalId !== checkpoint.proposalId || delta.baseVersion !== checkpoint.version) throw new Error("Stale proposal delta.");
  if (!Array.isArray(delta.changes) || !delta.changes.length || delta.changes.length > 50) throw new Error("Invalid proposal delta.");
  const entries = checkpoint.proposal.operations.map((operation, index) => ({ id: checkpoint.operationIds[index], operation }));
  const decided = new Set([...checkpoint.acceptedOperationIds, ...checkpoint.dismissedOperationIds]);
  for (const change of delta.changes) {
    if (change.kind === "add") {
      const index = change.beforeOperationId === undefined ? entries.length : entries.findIndex((entry) => entry.id === change.beforeOperationId);
      if (index < 0) throw new Error("Delta insertion target is missing.");
      entries.splice(index, 0, { id: crypto.randomUUID(), operation: change.operation });
    } else {
      if (decided.has(change.operationId)) throw new Error("A delta cannot change an approved or dismissed operation.");
      const index = entries.findIndex((entry) => entry.id === change.operationId);
      if (index < 0) throw new Error("Delta operation target is missing.");
      if (change.kind === "remove") entries.splice(index, 1);
      else if (change.kind === "replace") {
        // Changed operations require a fresh approval identity.
        if (proposalContentKey({ summary: "", operations: [entries[index].operation] }) !== proposalContentKey({ summary: "", operations: [change.operation] })) entries[index] = { id: crypto.randomUUID(), operation: change.operation };
      } else throw new Error("Unsupported proposal delta.");
    }
  }
  const proposal = parseReasonAIProposal({ summary: delta.summary ?? checkpoint.proposal.summary, operations: entries.map((entry) => entry.operation) }, context, "accumulated");
  // Do not silently drop an unrelated operation while normalizing a delta.
  // Reuse the existing duplicate/dependency safeguards as a rejection boundary.
  if (sanitizeAIProposal(proposal, context).operationIndexes.length !== proposal.operations.length) throw new Error("Proposal delta contains conflicting or redundant operations.");
  if (proposalContentKey(proposal) === proposalContentKey(checkpoint.proposal)) return checkpoint;
  return { ...checkpoint, version: checkpoint.version + 1, proposal, operationIds: entries.map((entry) => entry.id) };
}
