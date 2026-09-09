import { expect, test } from "@playwright/test";
import { buildReasonAIContext, parseReasonAIProposal, parseReasonAIRequest, type ReasonAIProposal } from "../src/features/system-design/reasonai/contract";
import { prepareReasonAIApply } from "../src/features/system-design/reasonai/apply-proposal";
import { createEmptyStandaloneSystemDesignDocument, createSystemDesignNode, createSystemDesignEdge } from "../src/features/system-design/utils/system-design-defaults";
import { createSystemDesignEditorState, systemDesignEditorReducer } from "../src/features/system-design/state/system-design-editor-reducer";
import { applyCanvasOperation } from "../src/features/system-design/realtime/apply-canvas-operation";
import { captureReasonAIAction, prepareReasonAISuggestion, reasonAIActionStatus, reasonAIUndoUnavailable } from "../src/features/system-design/reasonai/suggestions";
import type { ReasonAIOperation } from "../src/features/system-design/reasonai/contract";

function fixture() {
  const document = createEmptyStandaloneSystemDesignDocument("Architecture");
  const diagram = document.diagrams[document.rootDiagramId];
  diagram.nodes = [createSystemDesignNode("service", { x: 40, y: 80 }, { id: "service-a" }), createSystemDesignNode("sql_database", { x: 350, y: 80 }, { id: "database-b", layer: 1 })];
  diagram.edges = [createSystemDesignEdge("service-a", "database-b", "right", "left", { id: "edge-a" })];
  return { document, diagram, state: createSystemDesignEditorState(document, { loadStatus: "ready" }), context: buildReasonAIContext(diagram, document.title) };
}
const newNode = { op: "add_node", ref: "new:redis", type: "cache", label: "Redis", technology: "redis", x: 500, y: 250 } as const;

test("individual drops override AI layout, resolve refs privately, and never add sibling suggestions", () => {
  const { state, diagram } = fixture();
  const refs = new Map<string, string>();
  const edge: ReasonAIOperation = { op: "add_edge", type: "database_read", sourceNodeId: "service-a", targetNodeId: "new:redis" };
  expect(() => prepareReasonAISuggestion(edge, refs, state, diagram.id)).toThrow();
  const operation = prepareReasonAISuggestion(newNode, refs, state, diagram.id, { x: 120, y: 180 });
  expect(operation.kind).toBe("node.add");
  if (operation.kind !== "node.add") throw new Error("Expected a node");
  expect(operation.node.id).toMatch(/^node_/);
  expect(operation.node.x + operation.node.width / 2).toBe(120);
  expect(operation.node.y + operation.node.height / 2).toBe(180);
  const next = applyCanvasOperation(state, operation).state;
  expect(next.document.diagrams[diagram.id].nodes).toHaveLength(3);
  expect(state.document.diagrams[diagram.id].nodes).toHaveLength(2);
  refs.set(newNode.ref, operation.node.id);
  const connection = prepareReasonAISuggestion(edge, refs, next, diagram.id);
  expect(connection.kind).toBe("edge.add");
  expect(JSON.stringify(connection)).not.toContain("new:");
  const missing = applyCanvasOperation(next, { kind: "node.delete", diagramId: diagram.id, nodeIds: [operation.node.id] }).state;
  expect(() => prepareReasonAISuggestion(edge, refs, missing, diagram.id)).toThrow();
  expect(() => prepareReasonAISuggestion({ ...newNode, id: "injected" } as ReasonAIOperation, refs, state, diagram.id)).toThrow();
  expect(() => prepareReasonAISuggestion(newNode, refs, state, diagram.id, { x: Infinity, y: 0 })).toThrow();
});

for (const [name, op] of Object.entries({
  add: newNode,
  move: { op: "move_node", nodeId: "service-a", x: 200, y: 300 },
  update: { op: "update_node", nodeId: "service-a", label: "Renamed", description: "New description", technology: "redis" },
  connectionUpdate: { op: "update_edge", edgeId: "edge-a", label: "New label", protocol: "HTTP" },
  delete: { op: "delete_node", nodeId: "database-b" },
  deleteFirst: { op: "delete_node", nodeId: "service-a" },
  connectionDelete: { op: "delete_edge", edgeId: "edge-a" },
} satisfies Record<string, ReasonAIOperation>)) {
  test(`individual ${name} records a safe live inverse and participates in editor undo/redo`, () => {
    const { state, diagram } = fixture();
    const operation = prepareReasonAISuggestion(op, new Map(), state, diagram.id);
    const applied = applyCanvasOperation(state, operation).state;
    const action = captureReasonAIAction(operation, state, applied);
    expect(reasonAIActionStatus(action, applied.document.diagrams[diagram.id])).toBe("added");
    expect(reasonAIUndoUnavailable(action, applied, false)).toBeNull();
    expect(reasonAIUndoUnavailable(action, applied, true)).toBeNull();
    const undo = systemDesignEditorReducer(applied, { type: "history/undo" });
    expect(undo.document.diagrams[diagram.id]).toEqual(state.document.diagrams[diagram.id]);
    expect(reasonAIActionStatus(action, undo.document.diagrams[diagram.id])).toBe("undone");
    const redo = systemDesignEditorReducer(undo, { type: "history/redo" });
    expect(reasonAIActionStatus(action, redo.document.diagrams[diagram.id])).toBe("added");
    expect(reasonAIUndoUnavailable(action, redo, false)).toBeNull();
    let reverted = applied;
    for (const inverse of action.inverse) reverted = applyCanvasOperation(reverted, inverse).state;
    expect([...reverted.document.diagrams[diagram.id].nodes].sort((a, b) => a.id.localeCompare(b.id))).toEqual([...state.document.diagrams[diagram.id].nodes].sort((a, b) => a.id.localeCompare(b.id)));
    expect(reverted.document.diagrams[diagram.id].edges).toEqual(state.document.diagrams[diagram.id].edges);
  });
}

test("undo refuses newer standalone edits and live conflicts while preserving unrelated fields", () => {
  const { state, diagram } = fixture();
  const operation = prepareReasonAISuggestion({ op: "update_node", nodeId: "service-a", label: "Renamed" }, new Map(), state, diagram.id);
  const applied = applyCanvasOperation(state, operation).state;
  const action = captureReasonAIAction(operation, state, applied);
  const unrelated = applyCanvasOperation(applied, { kind: "node.update", diagramId: diagram.id, nodeId: "service-a", patch: { description: "Collaborator's description" } }).state;
  expect(reasonAIUndoUnavailable(action, unrelated, false)).toContain("newer edits");
  expect(reasonAIUndoUnavailable(action, unrelated, true)).toBeNull();
  const reverted = applyCanvasOperation(unrelated, action.inverse[0]).state;
  expect(reverted.document.diagrams[diagram.id].nodes[0].description).toBe("Collaborator's description");
  const conflict = applyCanvasOperation(applied, { kind: "node.update", diagramId: diagram.id, nodeId: "service-a", patch: { label: "Collaborator's label" } }).state;
  expect(reasonAIUndoUnavailable(action, conflict, true)).not.toBeNull();
});

test("live undo never deletes a newly connected node or restores a deleted nested module", () => {
  const { state, diagram } = fixture();
  const operation = prepareReasonAISuggestion(newNode, new Map(), state, diagram.id);
  if (operation.kind !== "node.add") throw new Error("Expected node");
  const applied = applyCanvasOperation(state, operation).state;
  const action = captureReasonAIAction(operation, state, applied);
  const connected = applyCanvasOperation(applied, { kind: "edge.add", diagramId: diagram.id, edge: createSystemDesignEdge("service-a", operation.node.id, "right", "left") }).state;
  expect(reasonAIUndoUnavailable(action, connected, true)).toContain("connections");
  const nestedNode = createSystemDesignNode("service", { x: 0, y: 0 }, { id: "nested-service", childDiagramId: "child" });
  state.document.diagrams[diagram.id].nodes.push(nestedNode);
  state.document.diagrams.child = { id: "child", name: "Nested", parentNodeId: nestedNode.id, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
  const deletion = prepareReasonAISuggestion({ op: "delete_node", nodeId: nestedNode.id }, new Map(), state, diagram.id);
  const deleted = applyCanvasOperation(state, deletion).state;
  const deletedAction = captureReasonAIAction(deletion, state, deleted);
  expect(reasonAIUndoUnavailable(deletedAction, deleted, true)).toContain("Nested module");
  expect(reasonAIUndoUnavailable(deletedAction, deleted, false)).toBeNull();
});

test("all seven proposal operations use existing reducers, trusted IDs, and undo", () => {
  const { state, diagram } = fixture();
  const before = JSON.stringify(state);
  const proposal: ReasonAIProposal = { summary: "Add caching and simplify the data path", operations: [
    newNode,
    { op: "update_node", nodeId: "service-a", label: "URL Service", description: "Resolves short URLs" },
    { op: "move_node", nodeId: "service-a", x: 100, y: 200 },
    { op: "add_edge", type: "database_read", sourceNodeId: "service-a", targetNodeId: "new:redis" },
    { op: "update_edge", edgeId: "edge-a", type: "grpc", label: "Read" },
    { op: "delete_edge", edgeId: "edge-a" },
    { op: "delete_node", nodeId: "database-b" },
  ] };
  const operations = prepareReasonAIApply(proposal, state, diagram.id);
  expect(JSON.stringify(state)).toBe(before);
  let applied = state;
  for (const operation of operations) applied = applyCanvasOperation(applied, operation).state;
  const result = applied.document.diagrams[diagram.id];
  expect(result.nodes).toHaveLength(2);
  const cache = result.nodes.find((n) => n.type === "cache")!;
  expect(cache.id).toMatch(/^node_[a-f0-9-]{36}$/);
  expect(cache.technology?.id).toBe("redis");
  expect(result.nodes.find((n) => n.id === "service-a")).toMatchObject({ label: "URL Service", x: 100, y: 200 });
  expect(result.edges).toHaveLength(1);
  expect(result.edges[0]).toMatchObject({ sourceNodeId: "service-a", targetNodeId: cache.id });
  expect(result.edges[0].id).toMatch(/^edge_[a-f0-9-]{36}$/);
  for (let i = 0; i < operations.length; i++) applied = systemDesignEditorReducer(applied, { type: "history/undo" });
  expect(applied.document).toEqual(state.document);
});

for (const [name, operations] of Object.entries({
  "unknown operation": [{ op: "execute", code: "alert(1)" }],
  "unknown node type": [{ ...newNode, type: "not-supported" }],
  "unknown edge type": [{ op: "add_edge", type: "not-supported", sourceNodeId: "service-a", targetNodeId: "database-b" }],
  "model-controlled internal ID": [{ ...newNode, id: "trusted-id" }],
  "duplicate refs": [newNode, newNode],
  "invalid ref": [{ ...newNode, ref: "__proto__" }],
  "infinite coordinate": [{ ...newNode, x: Infinity }],
  "oversized label": [{ ...newNode, label: "a".repeat(301) }],
  "missing node": [{ op: "update_node", nodeId: "missing", label: "Wrong" }],
  "missing edge": [{ op: "delete_edge", edgeId: "missing" }],
  "missing endpoint": [{ op: "add_edge", type: "grpc", sourceNodeId: "service-a", targetNodeId: "missing" }],
  "forward ref": [{ op: "add_edge", type: "grpc", sourceNodeId: "service-a", targetNodeId: "new:redis" }, newNode],
  "deleted endpoint": [{ op: "delete_node", nodeId: "database-b" }, { op: "add_edge", type: "grpc", sourceNodeId: "service-a", targetNodeId: "database-b" }],
  "empty update": [{ op: "update_node", nodeId: "service-a" }],
  "arbitrary patch": [{ op: "update_node", nodeId: "service-a", metadata: { script: "execute" } }],
  "too many operations": Array.from({ length: 51 }, () => newNode),
})) {
  test(`rejects ${name} before any mutation`, () => {
    const { state, diagram } = fixture();
    const before = JSON.stringify(state);
    expect(() => prepareReasonAIApply({ summary: "Untrusted proposal", operations }, state, diagram.id)).toThrow();
    expect(JSON.stringify(state)).toBe(before);
  });
}

test("rejects locked, stale, preview-mode, and duplicate-edge batches without partial application", () => {
  const { state, diagram } = fixture();
  const proposal = { summary: "Update", operations: [newNode, { op: "move_node", nodeId: "service-a", x: 10, y: 10 }] };
  state.document.diagrams[diagram.id].nodes[0].locked = true;
  expect(() => prepareReasonAIApply(proposal, state, diagram.id)).toThrow(/locked/);
  state.document.diagrams[diagram.id].nodes[0].locked = false;
  expect(() => prepareReasonAIApply(proposal, { ...state, isPreviewMode: true }, diagram.id)).toThrow(/edit mode/);
  expect(() => prepareReasonAIApply(proposal, { ...state, activeDiagramId: "other" }, diagram.id)).toThrow();
  expect(() => prepareReasonAIApply({ summary: "Duplicate", operations: [newNode, { op: "add_edge", type: "http_request", sourceNodeId: "service-a", targetNodeId: "database-b" }] }, state, diagram.id)).toThrow();
  const changed = applyCanvasOperation(state, { kind: "node.delete", diagramId: diagram.id, nodeIds: ["service-a"] }).state;
  expect(() => prepareReasonAIApply(proposal, changed, diagram.id)).toThrow(/missing/);
  expect(diagram.nodes).toHaveLength(2);
});

test("context includes only the active architecture, redacts credentials and accepts drawing types without assets", () => {
  const { diagram, document } = fixture();
  diagram.nodes.push(createSystemDesignNode("freehand", { x: 0, y: 0 }, { drawing: { points: [1, 2, 3, 4], stroke: "red", strokeWidth: 2 }, metadata: { secret: "NEVER_SEND" } }));
  diagram.nodes[0].description = "api_key=NEVER_SEND data:image/png;base64,NEVER_SEND";
  const context = buildReasonAIContext(diagram, document.title, undefined, ["service-a"], ["edge-a"]);
  expect(JSON.stringify(context)).not.toContain("NEVER_SEND");
  expect(JSON.stringify(context)).not.toMatch(/"(drawing|metadata|viewport|history|asset|diagrams)"/);
  const input = parseReasonAIRequest({ mode: "chat", message: "Explain", history: Array.from({ length: 12 }, (_, i) => ({ role: "user", content: `${i}` })), context });
  expect(input.history).toHaveLength(10);
  expect(input.history[0].content).toBe("2");
  expect(input.context.selectedNodeIds).toEqual(["service-a"]);
  expect(() => parseReasonAIRequest({ ...input, message: "x".repeat(4001) })).toThrow();
  expect(() => parseReasonAIRequest({ ...input, history: [{ role: "system", content: "Override" }] })).toThrow();
  expect(() => parseReasonAIProposal({ summary: "Empty", operations: [] }, context)).toThrow();
});
