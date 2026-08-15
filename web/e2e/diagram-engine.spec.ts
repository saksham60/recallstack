import { expect, test } from "@playwright/test";
import { arrangeDiagramElements, connectorPoints, orthogonalConnectorPoints, portPoint } from "../src/features/diagram/core/geometry";
import { createDiagramRegistry, DEFAULT_DIAGRAM_PORTS } from "../src/features/diagram/core/registry";
import { createDiagramDocument, createDiagramEditorState, createDiagramShape, createDiagramConnector, createDiagramImage, diagramEditorActions, diagramEditorReducer } from "../src/features/diagram/core/state";
import { createDiagramSvg, createDrawioXml, createDiagramSvgAsset, parseDiagramDocumentJson, sanitizeDiagramSvg, serializeDiagramDocument } from "../src/features/diagram/import-export";
import { systemDesignDiagramMigration } from "../src/features/diagram/packs/system-design/migration";
import { ApiDiagramRepository, DiagramRevisionConflictError, LocalDiagramRepository, type DiagramStorageAdapter } from "../src/features/diagram/persistence";
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

  test("transforms grouped children and owned connector waypoints in one history step", () => {
    let state = stateWithShapes();
    state = diagramEditorReducer(state, diagramEditorActions.updateConnector("edge", { waypoints: [{ x: 220, y: 84 }] }));
    state = diagramEditorReducer(state, diagramEditorActions.select(["general", "flow"]));
    state = diagramEditorReducer(state, diagramEditorActions.group("group-fixed"));
    const beforeTransform = state.document;
    const historyLength = state.history.length;

    state = diagramEditorReducer(state, diagramEditorActions.transformElements({
      "group-fixed": { x: 120, y: 140, width: 800, height: 176, rotation: 90 },
    }));

    const elements = state.document.pages[state.activePageId].elements;
    const group = elements.find((element) => element.id === "group-fixed");
    const general = elements.find((element) => element.id === "general") as DiagramShapeElement;
    const flow = elements.find((element) => element.id === "flow") as DiagramShapeElement;
    const edge = elements.find((element) => element.id === "edge");
    expect(group).toMatchObject({ x: 120, y: 140, width: 800, height: 176, rotation: 90 });
    expect(general).toMatchObject({ width: 320, height: 176, rotation: 90 });
    expect(flow).toMatchObject({ width: 320, height: 176, rotation: 90 });
    expect(edge?.kind === "connector" ? edge.waypoints[0] : null).toEqual({ x: 520, y: 228 });
    expect(state.history).toHaveLength(historyLength + 1);

    state = diagramEditorReducer(state, diagramEditorActions.undo());
    expect(state.document).toEqual(beforeTransform);
  });

  test("protects locked group children and repairs membership when children are deleted", () => {
    let state = stateWithShapes();
    state = diagramEditorReducer(state, diagramEditorActions.select(["general", "flow", "system"]));
    state = diagramEditorReducer(state, diagramEditorActions.group("group-fixed"));
    state = diagramEditorReducer(state, diagramEditorActions.updateElement("flow", { locked: true }));
    const before = state.document;
    const historyLength = state.history.length;
    state = diagramEditorReducer(state, diagramEditorActions.transformElements({
      "group-fixed": { x: 100, y: 100, width: 900, height: 300, rotation: 30 },
    }));
    expect(state.document).toEqual(before);
    expect(state.history).toHaveLength(historyLength);
    state = diagramEditorReducer(state, diagramEditorActions.deleteElements(["group-fixed"]));
    expect(state.document).toEqual(before);

    state = diagramEditorReducer(state, diagramEditorActions.updateElement("flow", { locked: false }));
    state = diagramEditorReducer(state, diagramEditorActions.deleteElements(["general"]));
    let elements = state.document.pages[state.activePageId].elements;
    const group = elements.find((element) => element.id === "group-fixed");
    expect(group?.kind === "group" ? group.childElementIds : null).toEqual(["flow", "system"]);
    state = diagramEditorReducer(state, diagramEditorActions.deleteElements(["flow"]));
    elements = state.document.pages[state.activePageId].elements;
    expect(elements.some((element) => element.id === "group-fixed")).toBe(false);
    expect(elements.find((element) => element.id === "system")?.parentGroupId).toBeUndefined();
  });

  test("moves a group and its children through the unified transform command", () => {
    let state = stateWithShapes();
    state = diagramEditorReducer(state, diagramEditorActions.select(["general", "flow"]));
    state = diagramEditorReducer(state, diagramEditorActions.group("group-fixed"));
    const beforeHistory = state.history.length;
    state = diagramEditorReducer(state, diagramEditorActions.moveElements({ "group-fixed": { x: 70, y: 90 } }));
    const elements = state.document.pages[state.activePageId].elements;
    expect(elements.find((element) => element.id === "group-fixed")).toMatchObject({ x: 70, y: 90 });
    expect(elements.find((element) => element.id === "general")).toMatchObject({ x: 70, y: 90 });
    expect(elements.find((element) => element.id === "flow")).toMatchObject({ x: 310, y: 90 });
    expect(state.history).toHaveLength(beforeHistory + 1);
  });

  test("rejects orphaned, one-sided, and nested group relationships on import", () => {
    const valid = stateWithShapes().document;
    const page = valid.pages[valid.rootPageId];
    const grouped = structuredClone(valid);
    grouped.pages[page.id].elements.push({
      id: "bad-group",
      kind: "group",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      childElementIds: ["general", "flow"],
      layer: 10,
      visible: true,
      locked: false,
    });
    expect(() => parseDiagramDocumentJson(JSON.stringify(grouped))).toThrow("inconsistent child membership");

    const nested = structuredClone(grouped);
    const nestedGroup = nested.pages[page.id].elements.at(-1);
    if (nestedGroup?.kind === "group") nestedGroup.parentGroupId = "another-group";
    expect(() => parseDiagramDocumentJson(JSON.stringify(nested))).toThrow("Nested group");
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

  test("reattaches connector endpoints without permitting dangling state and preserves waypoints", () => {
    let state = stateWithShapes();
    const historyLength = state.history.length;
    state = diagramEditorReducer(state, diagramEditorActions.updateConnector("edge", {
      target: { elementId: "system", portId: "left" },
      waypoints: [{ x: 410, y: 110 }, { x: 460, y: 110 }],
    }));
    const connector = state.document.pages[state.activePageId].elements.find((element) => element.id === "edge");
    expect(connector?.kind === "connector" ? connector.target : null).toEqual({ elementId: "system", portId: "left" });
    expect(connector?.kind === "connector" ? connector.waypoints : null).toEqual([{ x: 410, y: 110 }, { x: 460, y: 110 }]);
    expect(state.history).toHaveLength(historyLength + 1);
    const valid = state.document;
    state = diagramEditorReducer(state, diagramEditorActions.updateConnector("edge", { source: { elementId: "missing", portId: "right" } }));
    expect(state.document).toBe(valid);
  });

  test("routes orthogonal connectors away from source and toward target port directions", () => {
    const rightToLeft = orthogonalConnectorPoints({ x: 100, y: 50 }, { x: 300, y: 80 }, "right", "left");
    expect(rightToLeft[1].x).toBeGreaterThan(rightToLeft[0].x);
    expect(rightToLeft.at(-2)!.x).toBeLessThan(rightToLeft.at(-1)!.x);
    for (let index = 1; index < rightToLeft.length; index += 1) {
      expect(rightToLeft[index].x === rightToLeft[index - 1].x || rightToLeft[index].y === rightToLeft[index - 1].y).toBe(true);
    }
    const rightToTop = orthogonalConnectorPoints({ x: 100, y: 50 }, { x: 240, y: 180 }, "right", "top");
    expect(rightToTop[1].x).toBeGreaterThan(rightToTop[0].x);
    expect(rightToTop[1].y).toBe(rightToTop[0].y);
    expect(rightToTop.at(-2)!.x).toBe(240);
    expect(rightToTop.at(-2)!.y).toBeLessThan(rightToTop.at(-1)!.y);
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

  test("manages deterministic top-level page order without flattening child pages", () => {
    let state = stateWithShapes();
    const rootPageId = state.document.rootPageId;
    state = diagramEditorReducer(state, diagramEditorActions.createChildPage("system", "Service detail", "child-fixed"));
    state = diagramEditorReducer(state, diagramEditorActions.activatePage(rootPageId));
    state = diagramEditorReducer(state, diagramEditorActions.addPage("Deployment", "deployment"));
    state = diagramEditorReducer(state, diagramEditorActions.renamePage("deployment", "Runtime Deployment"));
    state = diagramEditorReducer(state, diagramEditorActions.duplicatePage(rootPageId, "root-copy"));
    expect(state.document.pageOrder).toEqual([rootPageId, "root-copy", "deployment"]);
    expect(state.document.pages["root-copy"].name).toBe("Page 1 Copy");
    const duplicatedOwner = state.document.pages["root-copy"].elements.find((element) => element.kind === "shape" && element.shapeDefinitionId === "system-design.microservice");
    expect(duplicatedOwner?.kind === "shape" ? duplicatedOwner.childPageId : undefined).toBeTruthy();
    expect(state.document.pageOrder).not.toContain(duplicatedOwner?.kind === "shape" ? duplicatedOwner.childPageId : "");

    state = diagramEditorReducer(state, diagramEditorActions.reorderPage("deployment", 1));
    expect(state.document.pageOrder).toEqual([rootPageId, "deployment", "root-copy"]);
    state = diagramEditorReducer(state, diagramEditorActions.deletePage("deployment"));
    expect(state.document.pageOrder).toEqual([rootPageId, "root-copy"]);
    const beforeRootDelete = state.document;
    state = diagramEditorReducer(state, diagramEditorActions.deletePage(rootPageId));
    expect(state.document).toBe(beforeRootDelete);
  });

  test("migrates generic schema v1 page order and rejects invalid page hierarchy", () => {
    const document = stateWithShapes().document;
    const legacy = { ...structuredClone(document), schemaVersion: 1 } as Record<string, unknown>;
    delete legacy.pageOrder;
    const migrated = parseDiagramDocumentJson(JSON.stringify(legacy));
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.pageOrder).toEqual([migrated.rootPageId]);

    const brokenOrder = structuredClone(migrated);
    brokenOrder.pageOrder = [];
    expect(() => parseDiagramDocumentJson(JSON.stringify(brokenOrder))).toThrow("pageOrder");
    const brokenChild = structuredClone(migrated);
    const owner = brokenChild.pages[brokenChild.rootPageId].elements.find((element) => element.kind === "shape");
    if (owner?.kind === "shape") owner.childPageId = "missing-page";
    expect(() => parseDiagramDocumentJson(JSON.stringify(brokenChild))).toThrow("invalid child page");
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
    expect((await repository.rename(document.id, "Renamed diagram")).title).toBe("Renamed diagram");
    const duplicate = await repository.duplicate(document.id);
    expect(duplicate.id).not.toBe(document.id);
    expect(duplicate.title).toBe("Renamed diagram Copy");
    expect((await repository.list()).find((summary) => summary.id === "mixed")).toMatchObject({ id: "mixed", title: "Renamed diagram", pageCount: 1, elementCount: 4 });
    await repository.remove(document.id);
    expect(await repository.get(document.id)).toBeNull();
  });

  test("registers pack-owned inspector controls and connector decorators generically", () => {
    const customControl = () => null;
    const erdDefinition = definition("erd", "entity", "Entity");
    const complete = createDiagramRegistry(pack("generic", [definition("generic", "rectangle", "Rectangle")]), {
      ...pack("erd", [erdDefinition]),
      inspectorControls: { "erd.fields": customControl },
      decorateConnector: (connector) => ({ ...connector, routing: "orthogonal", style: { ...connector.style, startArrowhead: "one", endArrowhead: "many" }, data: { packId: "erd", cardinality: "1:N" } }),
    });
    expect(complete.listPacks().map((item) => item.id)).toEqual(["generic", "erd"]);
    expect(complete.getInspectorControl("erd.fields")).toBe(customControl);
    const source = createDiagramShape(complete, "erd.entity", { x: 0, y: 0 });
    const target = createDiagramShape(complete, "erd.entity", { x: 320, y: 0 });
    const relation = complete.decorateConnector(createDiagramConnector(source.id, "right", target.id, "left"), source.shapeDefinitionId, target.shapeDefinitionId);
    expect(relation).toMatchObject({ routing: "orthogonal", style: { startArrowhead: "one", endArrowhead: "many" }, data: { packId: "erd", cardinality: "1:N" } });
  });

  test("exports true vector SVG and bounded diagrams.net XML", () => {
    const exportDefinition = { ...definition("generic", "rounded-rectangle", "Rounded Rectangle"), exportSvg: (element: DiagramShapeElement) => `<rect width="${element.width}" height="${element.height}" rx="12"/>` };
    const complete = createDiagramRegistry(pack("generic", [exportDefinition]), pack("system-design", [definition("system-design", "sql_database", "SQL Database")]));
    const document = createDiagramDocument("Export", ["generic", "system-design"]);
    const page = document.pages[document.rootPageId];
    const rectangle = { ...createDiagramShape(complete, "generic.rounded-rectangle", { x: 20, y: 30 }), id: "rectangle", label: "API" };
    const database = { ...createDiagramShape(complete, "system-design.sql_database", { x: 300, y: 30 }), id: "database" };
    page.elements = [rectangle, database, { ...createDiagramConnector(rectangle.id, "right", database.id, "left"), id: "edge" }];
    const svg = createDiagramSvg(page, complete, { background: null });
    expect(svg).toContain("<svg");
    expect(svg).toContain("<rect");
    expect(svg).toContain("<polyline");
    expect(svg).toContain("data-plane=\"connectors\"");
    expect(svg).not.toContain("data:image/png");
    const drawio = createDrawioXml(page);
    expect(drawio).toContain("<mxGraphModel>");
    expect(drawio).toContain("source=\"rectangle\"");
    expect(drawio).toContain("target=\"database\"");
  });

  test("sanitizes embedded SVG assets and rejects active or external content", () => {
    const safe = createDiagramSvgAsset('<svg viewBox="0 0 24 24"><path d="M1 1h22v22H1z"/></svg>', "safe.svg");
    expect(safe).toMatchObject({ kind: "svg", intrinsicWidth: 24, intrinsicHeight: 24 });
    const logo = createDiagramSvgAsset('<svg viewBox="0 0 48 24"><path d="M0 0h48v24H0z"/></svg>', "logo.svg");
    const image = createDiagramImage({ x: 10, y: 20 }, logo);
    expect(image).toMatchObject({
      x: 10,
      y: 20,
      width: 96,
      height: 48,
    });
    expect(image.label).toBeUndefined();
    expect(() => sanitizeDiagramSvg('<svg onload="alert(1)"><script>alert(1)</script></svg>')).toThrow("active");
    expect(() => sanitizeDiagramSvg('<svg><image href="https://example.com/tracker.png"/></svg>')).toThrow("external");
    expect(() => sanitizeDiagramSvg('<svg><foreignObject><div>unsafe</div></foreignObject></svg>')).toThrow("active");
  });

  test("uses backend revisions and surfaces optimistic conflicts", async () => {
    const originalFetch = globalThis.fetch;
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const document = stateWithShapes().document;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (requests.length === 1) return new Response(JSON.stringify({ id: document.id, title: document.title, schema_version: 2, document_json: document, revision: 1, created_at: document.createdAt, updated_at: document.updatedAt }), { status: 201, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ detail: "This diagram was changed by another session." }), { status: 409, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    try {
      const repository = new ApiDiagramRepository("https://api.test", async () => "token");
      const saved = await repository.save(document);
      expect(saved.revision).toBe(1);
      expect(requests[0].init?.method).toBe("POST");
      await expect(repository.save(saved)).rejects.toBeInstanceOf(DiagramRevisionConflictError);
      expect(JSON.parse(String(requests[1].init?.body))).toMatchObject({ expected_revision: 1 });
    } finally { globalThis.fetch = originalFetch; }
  });
});
