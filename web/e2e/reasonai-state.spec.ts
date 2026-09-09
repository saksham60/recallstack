import { expect, test } from "@playwright/test";
import { buildReasonAIContext, parseReasonAIProposal, parseReasonAIRequest, type ReasonAIProposal } from "../src/features/system-design/reasonai/contract";
import { prepareReasonAIApply } from "../src/features/system-design/reasonai/apply-proposal";
import { createEmptyStandaloneSystemDesignDocument, createSystemDesignNode, createSystemDesignEdge } from "../src/features/system-design/utils/system-design-defaults";
import { createSystemDesignEditorState, systemDesignEditorReducer } from "../src/features/system-design/state/system-design-editor-reducer";
import { applyCanvasOperation } from "../src/features/system-design/realtime/apply-canvas-operation";

function fixture() {
  const document = createEmptyStandaloneSystemDesignDocument("Architecture");
  const diagram = document.diagrams[document.rootDiagramId];
  diagram.nodes = [createSystemDesignNode("service", { x: 40, y: 80 }, { id: "service-a" }), createSystemDesignNode("sql_database", { x: 350, y: 80 }, { id: "database-b" })];
  diagram.edges = [createSystemDesignEdge("service-a", "database-b", "right", "left", { id: "edge-a" })];
  return { document, diagram, state: createSystemDesignEditorState(document, { loadStatus: "ready" }), context: buildReasonAIContext(diagram, document.title) };
}
const newNode = { op: "add_node", ref: "new:redis", type: "cache", label: "Redis", technology: "redis", x: 500, y: 250 } as const;

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
