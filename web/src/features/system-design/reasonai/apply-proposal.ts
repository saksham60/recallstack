import { applyCanvasOperation } from "../realtime/apply-canvas-operation";
import type { CanvasOperation } from "../realtime/canvas-operation";
import type { SystemDesignEditorState } from "../types/system-design.types";
import { createSystemDesignNode, createSystemDesignEdge, migrateLegacyTechnologyIdentity } from "../utils/system-design-defaults";
import { parseReasonAIProposal, ReasonAIValidationError } from "./contract";

/** Validate the entire batch against the latest state before any commit or broadcast. */
export function prepareReasonAIApply(value: unknown, state: SystemDesignEditorState, diagramId: string): CanvasOperation[] {
  const diagram = state.document.diagrams[diagramId];
  if (!diagram || state.activeDiagramId !== diagramId || state.isPreviewMode) throw new ReasonAIValidationError("Return to the original diagram in edit mode to apply this proposal.");
  const proposal = parseReasonAIProposal(value, { nodes: diagram.nodes.map((n) => ({ ...n, technology: n.technology?.name })), edges: diagram.edges });
  const refs = new Map<string, string>();
  let simulated = state;
  const operations: CanvasOperation[] = [];
  for (const op of proposal.operations) {
    if ("nodeId" in op && diagram.nodes.find((n) => n.id === op.nodeId)?.locked) throw new ReasonAIValidationError("A proposed component is locked. Unlock it before applying.");
    let operation: CanvasOperation;
    switch (op.op) {
      case "add_node": {
        const node = createSystemDesignNode(op.type, { x: op.x, y: op.y }, { label: op.label, subtitle: op.subtitle, description: op.description, technology: migrateLegacyTechnologyIdentity(op.technology), parentModuleId: diagram.parentNodeId, layer: simulated.document.diagrams[diagramId].nodes.length });
        refs.set(op.ref, node.id);
        operation = { kind: "node.add", diagramId, node }; break;
      }
      case "update_node": {
        const { op: _op, nodeId, technology, ...patch } = op;
        void _op;
        operation = { kind: "node.update", diagramId, nodeId, patch: { ...patch, ...(technology === undefined ? {} : { technology: migrateLegacyTechnologyIdentity(technology) ?? null }) } }; break;
      }
      case "move_node": operation = { kind: "node.move", diagramId, positions: { [op.nodeId]: { x: op.x, y: op.y } } }; break;
      case "delete_node": operation = { kind: "node.delete", diagramId, nodeIds: [op.nodeId] }; break;
      case "add_edge": operation = { kind: "edge.add", diagramId, edge: createSystemDesignEdge(refs.get(op.sourceNodeId) ?? op.sourceNodeId, refs.get(op.targetNodeId) ?? op.targetNodeId, "right", "left", { type: op.type, label: op.label, protocol: op.protocol }) }; break;
      case "update_edge": {
        const { op: _op, edgeId, ...patch } = op;
        void _op;
        operation = { kind: "edge.update", diagramId, edgeId, patch: { ...patch, ...(patch.sourceNodeId ? { sourceNodeId: refs.get(patch.sourceNodeId) ?? patch.sourceNodeId } : {}), ...(patch.targetNodeId ? { targetNodeId: refs.get(patch.targetNodeId) ?? patch.targetNodeId } : {}) } }; break;
      }
      case "delete_edge": operation = { kind: "edge.delete", diagramId, edgeIds: [op.edgeId] }; break;
    }
    const applied = applyCanvasOperation(simulated, operation);
    if (applied.state === simulated) throw new ReasonAIValidationError("A proposed change cannot be applied to the current canvas. Ask ReasonAI for an updated proposal.");
    simulated = applied.state;
    operations.push(applied.operation);
  }
  return operations;
}
