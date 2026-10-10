import type { SystemDesignEditorState } from "../types/system-design.types";
import { applyCanvasOperationsToDocument } from "../realtime/apply-canvas-operation";
import { buildReasonAIContext, type ReasonAIProposal } from "./contract";
import { prepareReasonAIApply } from "./apply-proposal";
import { fingerprintReasonAIContext } from "./proposal-state";

/** Performs the entire preflight in memory. Callers commit the returned document once. */
export function prepareReasonAIAtomicAcceptance(
  proposal: ReasonAIProposal,
  state: SystemDesignEditorState,
  diagramId: string,
  expectedFingerprint: string,
) {
  const diagram = state.document.diagrams[diagramId];
  if (!diagram || state.activeDiagramId !== diagramId || state.isPreviewMode) {
    throw new Error("Return to this diagram in edit mode before accepting the proposal.");
  }
  if (fingerprintReasonAIContext(buildReasonAIContext(diagram, state.document.title)) !== expectedFingerprint) {
    throw new Error("This diagram changed after the proposal was prepared. Refresh the proposal before accepting it.");
  }
  const operations = prepareReasonAIApply(proposal, state, diagramId);
  const document = applyCanvasOperationsToDocument(state.document, operations);
  const refs: Record<string, string> = {};
  let index = 0;
  for (const item of proposal.operations) {
    if (item.op === "add_node") {
      const operation = operations[index];
      if (operation.kind !== "node.add") throw new Error("Proposal operation ordering changed during validation.");
      refs[item.ref] = operation.node.id;
    }
    index++;
  }
  return { document, operations, refs };
}
