import { expect, test } from "@playwright/test";
import { arrangeDiagramElements, connectorPoints, portPoint } from "../src/features/diagram/core/geometry";
import { createDiagramRegistry, DEFAULT_DIAGRAM_PORTS } from "../src/features/diagram/core/registry";
import { createDiagramDocument, createDiagramEditorState, createDiagramShape, createDiagramConnector, diagramEditorActions, diagramEditorReducer } from "../src/features/diagram/core/state";
import { parseDiagramDocumentJson, serializeDiagramDocument } from "../src/features/diagram/import-export";
import { systemDesignDiagramMigration } from "../src/features/diagram/packs/system-design/migration";
import { LocalDiagramRepository, type DiagramStorageAdapter } from "../src/features/diagram/persistence";
import type { DiagramElement, DiagramPack, DiagramShapeDefinition, DiagramShapeElement } from "../src/features/diagram/core/types";

const renderer = () => null;
function definition(packId: string, id: string, label: string): DiagramShapeDefinition {
  return { id: `${packId}.${id}`, packId, label, category: "shapes", keywords: [label.toLowerCase()], icon: id, rendererId: "test", defaultSize: { width: 160, height: 88 }, minimumSize: { width: 32, height: 24 }, resize: { horizontal: true, vertical: true }, rotatable: true, ports: DEFAULT_DIAGRAM_PORTS, defaultStyle: { fill: "#18181b", stroke: "#a78bfa" }, inspector: [] };
}
function pack(id: string, shapes: DiagramShapeDefinition[]): DiagramPack { return { id, label: id, description: id, icon: id, categories: [{ id: "shapes", label: "Shapes", order: 0 }], shapes, renderers: { test: renderer } }; }
const registry = createDiagramRegistry(
  pack("generic", [definition("generic", "rectangle", "Rectangle")]),
  pack("flowchart", [definition("flowchart", "decision", "Decision"), definition("flowchart", "process", "Process")]),
  pack("system-design", [definition("system-design", "microservice", "Microservice"), { ...definition("system-design", "vector_database", "Vector Database"), data: { systemDesignType: "vector_database" } }]),
);

class MemoryStorage implements DiagramStorageAdapter {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
}

function stateWithShapes() {
  const document = createDiagramDocument("Mixed diagram", ["generic", "flowchart", "system-design"], "mixed");
  const page = document.pages[document.rootPageId];
  const general = { ...createDiagramShape(registry, "generic.rectangle", { x: 20, y: 40 }), id: "general" };
  const flow = { ...createDiagramShape(registry, "flowchart.decision", { x: 260, y: 40 }), id: "flow" };
  const system = { ...createDiagramShape(registry, "system-design.microservice", { x: 500, y: 40 }), id: "system" };
  page.elements = [general, flow, system, { ...createDiagramConnector("general", "right", "flow", "left"), id: "edge" }];
  return createDiagramEditorState(document);
}

test.describe("generic diagram engine", () => {
  test("registers independent general, flowchart, and system-design packs", () => {
    expect(registry.listPacks().map((pack) => pack.id)).toEqual(["generic", "flowchart", "system-design"]);
    expect(registry.requirePack("generic").shapes).toHaveLength(1);
    expect(registry.requirePack("flowchart").shapes).toHaveLength(2);
    expect(registry.requireShape("system-design.vector_database").data?.systemDesignType).toBe("vector_database");
    expect(registry.requireShape("flowchart.decision").rendererId).toBe("test");
  });

  test("serializes mixed-pack documents without runtime objects", () => {
    const state = stateWithShapes();
    const serialized = serializeDiagramDocument(state.document);
    const parsed = parseDiagramDocumentJson(serialized);
    expect(parsed.enabledPackIds).toEqual(["generic", "flowchart", "system-design"]);
    expect(parsed.pages[parsed.rootPageId].elements.map((element) => element.kind)).toEqual(["shape", "shape", "shape", "connector"]);
    expect(serialized).not.toContain("renderer");
  });

  test("persists rotation, groups, clipboard clones, child pages, and undo", () => {
    let state = stateWithShapes();
    state = diagramEditorReducer(state, diagramEditorActions.rotateElement("flow", 37, "2026-08-15T00:00:01.000Z"));
    expect((state.document.pages[state.activePageId].elements.find((element) => element.id === "flow") as DiagramShapeElement).rotation).toBe(37);
    state = diagramEditorReducer(state, diagramEditorActions.select(["general", "flow"]));
    state = diagramEditorReducer(state, diagramEditorActions.group("group-fixed"));
    expect(state.selectedElementIds).toEqual(["group-fixed"]);
    state = diagramEditorReducer(state, diagramEditorActions.copy());
    state = diagramEditorReducer(state, diagramEditorActions.paste());
    expect(state.document.pages[state.activePageId].elements.filter((element) => element.kind === "group")).toHaveLength(2);
    state = diagramEditorReducer(state, diagramEditorActions.undo());
    expect(state.document.pages[state.activePageId].elements.filter((element) => element.kind === "group")).toHaveLength(1);
    state = diagramEditorReducer(state, diagramEditorActions.select(["system"]));
    state = diagramEditorReducer(state, diagramEditorActions.createChildPage("system", "Service internals", "child-fixed"));
    expect(state.activePageId).toBe("child-fixed");
    expect(state.document.pages["child-fixed"].parentElementId).toBe("system");
  });

  test("resolves rotated ports and connector geometry generically", () => {
    const source = { ...createDiagramShape(registry, "generic.rectangle", { x: 0, y: 0 }, { width: 100, height: 50, rotation: 90 }), id: "a" };
    const target = { ...createDiagramShape(registry, "flowchart.process", { x: 300, y: 0 }), id: "b" };
    const edge = { ...createDiagramConnector("a", "right", "b", "left", { routing: "orthogonal" }), id: "ab" };
    const right = portPoint(source, "right");
    expect(right.x).toBeCloseTo(50);
    expect(right.y).toBeCloseTo(75);
    const elements = new Map<string, DiagramElement>([[source.id, source], [target.id, target], [edge.id, edge]]);
    expect(connectorPoints(edge, elements, registry)).toHaveLength(4);
  });

  test("aligns, distributes, and matches sizes as one generic batch command", () => {
    let state = stateWithShapes();
    const shapes = state.document.pages[state.activePageId].elements.filter((element): element is DiagramShapeElement => element.kind === "shape");
    state = diagramEditorReducer(state, diagramEditorActions.updateElements(arrangeDiagramElements(shapes, "align-top")));
    expect(state.document.pages[state.activePageId].elements.filter((element): element is DiagramShapeElement => element.kind === "shape").map((element) => element.y)).toEqual([40, 40, 40]);
    expect(state.history).toHaveLength(1);
    state = diagramEditorReducer(state, diagramEditorActions.updateElements(arrangeDiagramElements(shapes, "match-width")));
    expect(state.document.pages[state.activePageId].elements.filter((element): element is DiagramShapeElement => element.kind === "shape").map((element) => element.width)).toEqual([160, 160, 160]);
  });

  test("migrates System Design v1 and v2 documents into generic pages", () => {
    const now = "2026-08-15T00:00:00.000Z";
    const node = { id: "service", type: "service", label: "Service", x: 10, y: 20, width: 160, height: 88, layer: 0, locked: false, visible: true };
    const v1 = { schemaVersion: 1, id: "legacy", problemId: "url-shortener", title: "Legacy", status: "in_progress", nodes: [node], edges: [], viewport: { x: 3, y: 4, zoom: 1.2 }, createdAt: now, updatedAt: now };
    const migratedV1 = parseDiagramDocumentJson(JSON.stringify(v1), [systemDesignDiagramMigration]);
    expect(migratedV1.rootPageId).toBe("legacy");
    expect((migratedV1.pages.legacy.elements[0] as DiagramShapeElement).shapeDefinitionId).toBe("system-design.service");
    const v2 = { schemaVersion: 2, id: "current", problemId: "url-shortener", title: "Current", status: "completed", rootDiagramId: "root", diagrams: { root: { id: "root", name: "Current", nodes: [node], edges: [], viewport: { x: 0, y: 0, zoom: 1 } } }, createdAt: now, updatedAt: now };
    const migratedV2 = parseDiagramDocumentJson(JSON.stringify(v2), [systemDesignDiagramMigration]);
    expect(migratedV2.pages.root.elements[0].data?.systemDesignType).toBe("service");
    expect(migratedV2.metadata?.sourceSchemaVersion).toBe("2");
  });

  test("uses a replaceable repository contract", async () => {
    const storage = new MemoryStorage();
    const repository = new LocalDiagramRepository(storage, [systemDesignDiagramMigration], "test:");
    const document = stateWithShapes().document;
    await repository.save(document);
    expect((await repository.get(document.id))?.title).toBe("Mixed diagram");
    expect(await repository.list()).toMatchObject([{ id: "mixed", pageCount: 1, elementCount: 4 }]);
    await repository.remove(document.id);
    expect(await repository.get(document.id)).toBeNull();
  });
});
