import { applyCanvasOperation } from "../realtime/apply-canvas-operation";
import type { CanvasOperation, CanvasNodePatch, CanvasEdgePatch } from "../realtime/canvas-operation";
import type { SystemDesignDiagram, SystemDesignDocument, SystemDesignEditorState, SystemDesignPoint } from "../types/system-design.types";
import { prepareReasonAIApply } from "./apply-proposal";
import type { ReasonAIOperation } from "./contract";

// Only a private suggestion token travels through HTML drag/drop, never a node payload.
export const REASONAI_NODE_DRAG_MIME = "application/x-recallstack-reasonai-suggestion";
export type ReasonAIRefs = ReadonlyMap<string, string>;
export interface ReasonAIAction {
  operation: CanvasOperation;
  inverse: CanvasOperation[];
  beforeDocument: SystemDesignDocument;
  before: SystemDesignDiagram;
  after: SystemDesignDiagram;
}

export function resolveReasonAISuggestion(op: ReasonAIOperation, refs: ReasonAIRefs): ReasonAIOperation {
  const resolve = (id: string) => {
    if (!id.startsWith("new:")) return id;
    const actual = refs.get(id);
    if (!actual) throw new Error("Add the suggested components first.");
    return actual;
  };
  if (op.op === "add_edge" || op.op === "update_edge") return {
    ...op,
    ...(op.sourceNodeId ? { sourceNodeId: resolve(op.sourceNodeId) } : {}),
    ...(op.targetNodeId ? { targetNodeId: resolve(op.targetNodeId) } : {}),
  };
  return op;
}

/** Reuse the strict contract, trusted factories and reducer preflight for ONE suggestion. */
export function prepareReasonAISuggestion(op: ReasonAIOperation, refs: ReasonAIRefs, state: SystemDesignEditorState, diagramId: string, drop?: SystemDesignPoint): CanvasOperation {
  const resolved = resolveReasonAISuggestion(op, refs);
  const operation = prepareReasonAIApply({ summary: "Individual suggestion", operations: [resolved] }, state, diagramId)[0];
  if (operation.kind === "node.add" && drop) {
    if (![drop.x, drop.y].every((value) => Number.isFinite(value) && Math.abs(value) <= 100_000)) throw new Error("Invalid drop position.");
    // Match the palette: the pointer is the component's center, not its top-left.
    operation.node = { ...operation.node, x: drop.x - operation.node.width / 2, y: drop.y - operation.node.height / 2 };
  }
  applyCanvasOperation(state, operation);
  return operation;
}

export function captureReasonAIAction(operation: CanvasOperation, beforeState: SystemDesignEditorState, afterState: SystemDesignEditorState): ReasonAIAction {
  const { diagramId } = operation;
  const before = beforeState.document.diagrams[diagramId], after = afterState.document.diagrams[diagramId];
  const inverse: CanvasOperation[] = [];
  switch (operation.kind) {
    case "node.add": inverse.push({ kind: "node.delete", diagramId, nodeIds: [operation.node.id] }); break;
    case "edge.add": inverse.push({ kind: "edge.delete", diagramId, edgeIds: [operation.edge.id] }); break;
    case "node.move": inverse.push({ kind: "node.move", diagramId, positions: Object.fromEntries(Object.keys(operation.positions).map((id) => { const node = before.nodes.find((n) => n.id === id)!; return [id, { x: node.x, y: node.y }]; })) }); break;
    case "node.update": {
      const node = before.nodes.find((n) => n.id === operation.nodeId)!;
      const patch = Object.fromEntries(Object.keys(operation.patch).map((key) => [key, node[key as keyof typeof node] ?? null])) as CanvasNodePatch;
      inverse.push({ kind: "node.update", diagramId, nodeId: node.id, patch }); break;
    }
    case "edge.update": {
      const edge = before.edges.find((e) => e.id === operation.edgeId)!;
      const patch = Object.fromEntries(Object.keys(operation.patch).map((key) => [key, edge[key as keyof typeof edge] ?? null])) as CanvasEdgePatch;
      inverse.push({ kind: "edge.update", diagramId, edgeId: edge.id, patch }); break;
    }
    case "edge.delete": inverse.push(...before.edges.filter((e) => operation.edgeIds.includes(e.id)).map((edge): CanvasOperation => ({ kind: "edge.add", diagramId, edge }))); break;
    case "node.delete": {
      const nodes = before.nodes.filter((n) => operation.nodeIds.includes(n.id));
      // Restoring a nested module needs more than node.add; never promise that in live mode.
      if (nodes.some((n) => n.childDiagramId)) break;
      inverse.push(...nodes.map((node): CanvasOperation => ({ kind: "node.add", diagramId, node })));
      // node.add appends at the front of the visual stack; restore original layers.
      const layers = new Map(after.nodes.map((node) => [node.id, node.layer]));
      let top = Math.max(-1, ...layers.values());
      for (const node of nodes) layers.set(node.id, ++top);
      const patches = Object.fromEntries(before.nodes.filter((node) => layers.get(node.id) !== node.layer).map((node) => [node.id, { layer: node.layer }]));
      if (Object.keys(patches).length) inverse.push({ kind: "nodes.update", diagramId, patches });
      inverse.push(...before.edges.filter((e) => operation.nodeIds.includes(e.sourceNodeId) || operation.nodeIds.includes(e.targetNodeId)).map((edge): CanvasOperation => ({ kind: "edge.add", diagramId, edge })));
      break;
    }
  }
  return { operation, inverse, beforeDocument: beforeState.document, before, after };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
const equal = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function matchesAction(action: ReasonAIAction, diagram: SystemDesignDiagram, expected: SystemDesignDiagram): boolean {
  const op = action.operation;
  const node = (id: string, keys?: string[]) => {
    const actual = diagram.nodes.find((n) => n.id === id), target = expected.nodes.find((n) => n.id === id);
    return keys && actual && target ? keys.every((key) => equal(actual[key as keyof typeof actual], target[key as keyof typeof target])) : equal(actual, target);
  };
  const edge = (id: string, keys?: string[]) => {
    const actual = diagram.edges.find((e) => e.id === id), target = expected.edges.find((e) => e.id === id);
    return keys && actual && target ? keys.every((key) => equal(actual[key as keyof typeof actual], target[key as keyof typeof target])) : equal(actual, target);
  };
  switch (op.kind) {
    case "node.add": return node(op.node.id);
    case "edge.add": return edge(op.edge.id);
    case "node.move": return Object.keys(op.positions).every((id) => node(id, ["x", "y"]));
    case "node.update": return node(op.nodeId, Object.keys(op.patch));
    case "edge.update": return edge(op.edgeId, Object.keys(op.patch));
    case "node.delete": return op.nodeIds.every((id) => node(id));
    case "edge.delete": return op.edgeIds.every((id) => edge(id));
    default: return false;
  }
}

export function reasonAIActionStatus(action: ReasonAIAction, diagram: SystemDesignDiagram): "added" | "undone" | "unavailable" {
  if (diagram.id !== action.operation.diagramId) return "unavailable";
  if (matchesAction(action, diagram, action.after)) return "added";
  if (matchesAction(action, diagram, action.before)) return "undone";
  return "unavailable";
}

function sameHistoryContent(a: SystemDesignDocument | undefined, b: SystemDesignDocument) {
  const content = (document: SystemDesignDocument) => ({ ...document, updatedAt: undefined, diagrams: Object.fromEntries(Object.entries(document.diagrams).map(([id, diagram]) => [id, { ...diagram, viewport: undefined }])) });
  return a === b || Boolean(a && equal(content(a), content(b)));
}

/** Preflight all inverse operations before broadcasting any; refuse conflicting edits. */
export function reasonAIUndoUnavailable(action: ReasonAIAction, state: SystemDesignEditorState, live: boolean): string | null {
  const diagram = state.document.diagrams[action.operation.diagramId];
  if (!diagram || state.activeDiagramId !== diagram.id || state.isPreviewMode) return "Return to this diagram in edit mode.";
  if (reasonAIActionStatus(action, diagram) !== "added") return "This suggestion has changed or was already undone.";
  if (!live) return sameHistoryContent(state.history.at(-1), action.beforeDocument) ? null : "Undo newer edits first using the editor Undo.";
  if (!action.inverse.length) return "Nested module deletion cannot be undone in a live session.";
  const op = action.operation;
  if (op.kind === "node.delete" && (!equal(diagram.nodes, action.after.nodes) || !equal(diagram.edges, action.after.edges))) return "The diagram has changed since this deletion; restoring it would affect newer edits.";
  if (op.kind === "node.update" && "label" in op.patch) {
    const original = action.before.nodes.find((node) => node.id === op.nodeId);
    const childId = original?.childDiagramId;
    if (childId && (action.beforeDocument.diagrams[childId]?.name !== original.label || state.document.diagrams[childId]?.name !== op.patch.label)) return "The nested page name has changed; undoing would overwrite it.";
  }
  if (op.kind === "node.add" && (diagram.edges.some((e) => e.sourceNodeId === op.node.id || e.targetNodeId === op.node.id) || diagram.nodes.find((n) => n.id === op.node.id)?.childDiagramId)) return "Remove this component's connections or nested content first.";
  // Never overwrite a collaborator's newer edits or delete a locked component.
  if (action.inverse.some((inverse) => {
    const ids = inverse.kind === "node.delete" ? inverse.nodeIds : inverse.kind === "node.move" ? Object.keys(inverse.positions) : inverse.kind === "nodes.update" ? Object.keys(inverse.patches) : inverse.kind === "node.update" ? [inverse.nodeId] : [];
    return ids.some((id) => diagram.nodes.find((n) => n.id === id)?.locked);
  })) return "Unlock the component before undoing.";
  try {
    let simulated = state;
    for (const inverse of action.inverse) {
      if (inverse.kind === "node.add" && diagram.nodes.some((n) => n.id === inverse.node.id)) return "The component already exists.";
      if (inverse.kind === "edge.add" && (diagram.edges.some((e) => e.id === inverse.edge.id) || !simulated.document.diagrams[diagram.id].nodes.some((n) => n.id === inverse.edge.sourceNodeId) || !simulated.document.diagrams[diagram.id].nodes.some((n) => n.id === inverse.edge.targetNodeId))) return "The connection's endpoints have changed.";
      const applied = applyCanvasOperation(simulated, inverse);
      if (applied.state === simulated) return "This action can no longer be undone safely.";
      simulated = applied.state;
    }
    return null;
  } catch { return "This action can no longer be undone safely."; }
}
