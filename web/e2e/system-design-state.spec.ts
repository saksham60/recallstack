import { expect, test } from "@playwright/test";
import { createSystemDesignRepository } from "../src/features/system-design/repository/createSystemDesignRepository";
import { systemDesignEditorActions } from "../src/features/system-design/state/system-design-editor-actions";
import {
  createSystemDesignEditorState,
  systemDesignEditorReducer,
} from "../src/features/system-design/state/system-design-editor-reducer";
import {
  SYSTEM_DESIGN_SCHEMA_VERSION,
  type SystemDesignDocument,
  type SystemDesignEdge,
  type SystemDesignNode,
} from "../src/features/system-design/types/system-design.types";
import {
  SystemDesignImportError,
  parseSystemDesignDocumentJson,
  prepareSystemDesignExport,
  serializeSystemDesignDocument,
} from "../src/features/system-design/utils/diagram-import-export";
import { validateSystemDesignDocument } from "../src/features/system-design/utils/diagram-validation";

const timestamp = (step: number) =>
  new Date(Date.UTC(2026, 6, 29, 0, 0, step)).toISOString();

function createNode(
  id: string,
  x = 40,
  y = 60,
  label = id,
): SystemDesignNode {
  return {
    id,
    type: "service",
    x,
    y,
    width: 160,
    height: 88,
    label,
    layer: 0,
    locked: false,
    visible: true,
  };
}

function createEdge(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
): SystemDesignEdge {
  return {
    id,
    sourceNodeId,
    targetNodeId,
    sourcePort: "right",
    targetPort: "left",
    type: "request",
  };
}

function createDocument(
  nodes: SystemDesignNode[] = [],
  edges: SystemDesignEdge[] = [],
  updatedAt = timestamp(0),
): SystemDesignDocument {
  return {
    schemaVersion: SYSTEM_DESIGN_SCHEMA_VERSION,
    id: "diagram-url-shortener",
    problemId: "url-shortener",
    title: "URL Shortener",
    status: "in_progress",
    nodes,
    edges,
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: timestamp(0),
    updatedAt,
  };
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function validationIssuePaths(value: unknown): string[] {
  const result = validateSystemDesignDocument(value);
  expect(result.valid).toBe(false);
  return result.valid ? [] : result.issues.map((issue) => issue.path);
}

test.describe("system-design editor reducer", () => {
  test("adds, moves, updates, connects, deletes, undoes, and redoes", () => {
    let state = createSystemDesignEditorState(createDocument());
    const api = createNode("node-api", 100, 120, "API");
    const database = {
      ...createNode("node-db", 420, 120, "Database"),
      type: "sql_database" as const,
      layer: 1,
    };

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.addNode(api, timestamp(1)),
    );
    expect(state.document.nodes).toHaveLength(1);
    expect(state.selectedNodeIds).toEqual(["node-api"]);

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.moveNodes(
        { "node-api": { x: 180, y: 220 } },
        timestamp(2),
      ),
    );
    expect(state.document.nodes[0]).toMatchObject({ x: 180, y: 220 });

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.updateNode(
        "node-api",
        { label: "Gateway", technology: "Kong" },
        timestamp(3),
      ),
    );
    expect(state.document.nodes[0]).toMatchObject({
      label: "Gateway",
      technology: "Kong",
    });

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.addNode(database, timestamp(4)),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.addEdge(
        createEdge("edge-api-db", "node-api", "node-db"),
        timestamp(5),
      ),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.updateEdge(
        "edge-api-db",
        { type: "data", label: "Read/write", protocol: "SQL" },
        timestamp(6),
      ),
    );
    expect(state.document.edges[0]).toMatchObject({
      type: "data",
      label: "Read/write",
      protocol: "SQL",
    });

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.deleteNodes(["node-api"], timestamp(7)),
    );
    expect(state.document.nodes.map((node) => node.id)).toEqual(["node-db"]);
    expect(state.document.edges).toHaveLength(0);

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.undo(),
    );
    expect(state.document.nodes).toHaveLength(2);
    expect(state.document.edges[0]).toMatchObject({
      id: "edge-api-db",
      type: "data",
    });

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.redo(),
    );
    expect(state.document.nodes.map((node) => node.id)).toEqual(["node-db"]);
    expect(state.document.edges).toHaveLength(0);
  });

  test("caps meaningful undo history at fifty documents", () => {
    let state = createSystemDesignEditorState(
      createDocument([createNode("node-api", 0, 0, "Initial")]),
    );

    for (let index = 0; index < 60; index += 1) {
      state = systemDesignEditorReducer(
        state,
        systemDesignEditorActions.updateNode(
          "node-api",
          { label: `Revision ${index}` },
          timestamp(index + 1),
        ),
      );
    }

    expect(state.history).toHaveLength(50);
    expect(state.document.nodes[0].label).toBe("Revision 59");

    for (let index = 0; index < 50; index += 1) {
      state = systemDesignEditorReducer(
        state,
        systemDesignEditorActions.undo(),
      );
    }
    expect(state.history).toHaveLength(0);
    expect(state.future).toHaveLength(50);
    expect(state.document.nodes[0].label).toBe("Revision 9");
  });

  test("copies, pastes, and duplicates node groups with internal edges", () => {
    const client = createNode("node-client", 20, 30, "Client");
    const api = { ...createNode("node-api", 260, 30, "API"), layer: 1 };
    const edge = createEdge("edge-client-api", client.id, api.id);
    let state = createSystemDesignEditorState(
      createDocument([client, api], [edge]),
    );

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.selectNodes(
        [client.id, api.id],
        "replace",
      ),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.copySelection(),
    );
    expect(state.clipboard?.nodes).toHaveLength(2);
    expect(state.clipboard?.edges).toHaveLength(1);
    expect(state.history).toHaveLength(0);

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.pasteClipboard({
        nodeIdMap: {
          "node-client": "node-client-copy",
          "node-api": "node-api-copy",
        },
        edgeIdMap: { "edge-client-api": "edge-client-api-copy" },
        at: timestamp(1),
      }),
    );
    expect(state.document.nodes).toHaveLength(4);
    expect(state.selectedNodeIds).toEqual([
      "node-client-copy",
      "node-api-copy",
    ]);
    expect(
      state.document.nodes.find((node) => node.id === "node-client-copy"),
    ).toMatchObject({ x: 52, y: 62 });
    expect(
      state.document.edges.find((candidate) => candidate.id === "edge-client-api-copy"),
    ).toMatchObject({
      sourceNodeId: "node-client-copy",
      targetNodeId: "node-api-copy",
    });

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.duplicateNodes(undefined, {
        offset: { x: 10, y: 20 },
        nodeIdMap: {
          "node-client-copy": "node-client-duplicate",
          "node-api-copy": "node-api-duplicate",
        },
        edgeIdMap: {
          "edge-client-api-copy": "edge-client-api-duplicate",
        },
        at: timestamp(2),
      }),
    );
    expect(state.document.nodes).toHaveLength(6);
    expect(state.document.edges).toHaveLength(3);
    expect(
      state.document.edges.find(
        (candidate) => candidate.id === "edge-client-api-duplicate",
      ),
    ).toMatchObject({
      sourceNodeId: "node-client-duplicate",
      targetNodeId: "node-api-duplicate",
    });
  });

  test("blocks edits in preview while allowing viewport changes", () => {
    let state = createSystemDesignEditorState(
      createDocument([createNode("node-api")]),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.setPreviewMode(true),
    );
    const previewDocument = state.document;

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.updateNode(
        "node-api",
        { label: "Blocked" },
        timestamp(1),
      ),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.deleteNodes(["node-api"], timestamp(2)),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.addNode(
        createNode("node-new"),
        timestamp(3),
      ),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.markComplete(timestamp(4)),
    );
    expect(state.document).toBe(previewDocument);
    expect(state.history).toHaveLength(0);

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.setViewport(
        { x: -120, y: 80, zoom: 1.5 },
        timestamp(5),
      ),
    );
    expect(state.document.viewport).toEqual({
      x: -120,
      y: 80,
      zoom: 1.5,
    });
    expect(state.history).toHaveLength(0);
  });

  test("does not add viewport-only changes to undo history", () => {
    let state = createSystemDesignEditorState(createDocument());
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.setViewport(
        { x: 100, y: -50, zoom: 1.25 },
        timestamp(1),
      ),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.setViewport(
        { x: 140, y: -70, zoom: 1.4 },
        timestamp(2),
      ),
    );
    expect(state.history).toHaveLength(0);

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.addNode(
        createNode("node-api"),
        timestamp(3),
      ),
    );
    expect(state.history).toHaveLength(1);

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.undo(),
    );
    expect(state.document.nodes).toHaveLength(0);
    expect(state.document.viewport).toEqual({
      x: 140,
      y: -70,
      zoom: 1.4,
    });
  });

  test("preserves the live viewport across content undo and redo", () => {
    let state = createSystemDesignEditorState(createDocument());
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.addNode(
        createNode("node-api"),
        timestamp(1),
      ),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.updateNode(
        "node-api",
        { label: "Renamed API" },
        timestamp(2),
      ),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.setViewport(
        { x: 180, y: -90, zoom: 1.5 },
        timestamp(3),
      ),
    );

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.undo(),
    );
    expect(state.document.nodes[0].label).toBe("node-api");
    expect(state.document.viewport).toEqual({
      x: 180,
      y: -90,
      zoom: 1.5,
    });

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.setViewport(
        { x: 220, y: -110, zoom: 1.6 },
        timestamp(4),
      ),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.redo(),
    );
    expect(state.document.nodes[0].label).toBe("Renamed API");
    expect(state.document.viewport).toEqual({
      x: 220,
      y: -110,
      zoom: 1.6,
    });
  });

  test("prevents geometry changes while a component is locked", () => {
    const lockedNode = {
      ...createNode("node-api"),
      locked: true,
    };
    let state = createSystemDesignEditorState(
      createDocument([lockedNode]),
    );

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.updateNode(
        lockedNode.id,
        {
          label: "Locked API",
          x: 300,
          y: 320,
          width: 260,
          height: 180,
        },
        timestamp(1),
      ),
    );

    expect(state.document.nodes[0]).toMatchObject({
      label: "Locked API",
      x: lockedNode.x,
      y: lockedNode.y,
      width: lockedNode.width,
      height: lockedNode.height,
      locked: true,
    });
  });

  test("assigns distinct snapshot identities to same-millisecond edits", () => {
    let state = createSystemDesignEditorState(createDocument());
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.addNode(
        createNode("node-api"),
        timestamp(0),
      ),
    );
    const firstSnapshot = state.document.updatedAt;

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.updateNode(
        "node-api",
        { label: "Same millisecond edit" },
        timestamp(0),
      ),
    );
    const secondSnapshot = state.document.updatedAt;

    expect(secondSnapshot).not.toBe(firstSnapshot);
    expect(Date.parse(secondSnapshot)).toBeGreaterThan(
      Date.parse(firstSnapshot),
    );
  });

  test("keeps newer edits dirty when an older save snapshot succeeds", () => {
    let state = createSystemDesignEditorState(createDocument());
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.addNode(
        createNode("node-api"),
        timestamp(1),
      ),
    );
    const firstSnapshot = state.document.updatedAt;
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.saveStarted(firstSnapshot),
    );

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.updateNode(
        "node-api",
        { label: "Newer edit" },
        timestamp(2),
      ),
    );
    const secondSnapshot = state.document.updatedAt;
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.saveSucceeded(
        firstSnapshot,
        timestamp(3),
      ),
    );
    expect(state.isDirty).toBe(true);
    expect(state.saveStatus).toBe("unsaved");
    expect(state.lastSavedDocumentUpdatedAt).toBe(firstSnapshot);

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.saveStarted(secondSnapshot),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.saveSucceeded(
        secondSnapshot,
        timestamp(4),
      ),
    );
    expect(state.isDirty).toBe(false);
    expect(state.saveStatus).toBe("saved");
    expect(state.lastSavedAt).toBe(timestamp(4));
  });
});

test.describe("local system-design repository", () => {
  test("saves, loads, lists, summarizes, and deletes documents", async () => {
    const storage = new MemoryStorage();
    const repository = createSystemDesignRepository(storage);
    const node = createNode("node-api");
    const started = createDocument([node], [], timestamp(2));
    const empty = {
      ...createDocument([], [], timestamp(1)),
      id: "diagram-rate-limiter",
      problemId: "distributed-rate-limiter",
      title: "Distributed Rate Limiter",
    };

    await repository.saveDocument(empty);
    await repository.saveDocument(started);

    await expect(repository.getDocument(started.problemId)).resolves.toEqual(
      started,
    );
    await expect(repository.listDocumentSummaries()).resolves.toEqual([
      {
        problemId: "url-shortener",
        title: "URL Shortener",
        status: "in_progress",
        nodeCount: 1,
        edgeCount: 0,
        createdAt: timestamp(0),
        updatedAt: timestamp(2),
      },
      {
        problemId: "distributed-rate-limiter",
        title: "Distributed Rate Limiter",
        status: "not_started",
        nodeCount: 0,
        edgeCount: 0,
        createdAt: timestamp(0),
        updatedAt: timestamp(1),
      },
    ]);

    await repository.deleteDocument(started.problemId);
    await expect(repository.getDocument(started.problemId)).resolves.toBeNull();
    await expect(repository.listDocumentSummaries()).resolves.toHaveLength(1);
  });
});

test.describe("system-design import and validation", () => {
  test("round-trips a valid document as formatted JSON", () => {
    const client = createNode("node-client", 20, 40, "Client");
    const api = { ...createNode("node-api", 300, 40, "API"), layer: 1 };
    const document = createDocument(
      [client, api],
      [createEdge("edge-client-api", client.id, api.id)],
      timestamp(1),
    );

    const json = serializeSystemDesignDocument(document);
    expect(json).toContain('\n  "schemaVersion": 1');
    expect(
      parseSystemDesignDocumentJson(json, document.problemId),
    ).toEqual(document);
    expect(prepareSystemDesignExport(document, "URL Shortener")).toEqual({
      filename: "url-shortener-system-design.json",
      json,
    });
    expect(() =>
      parseSystemDesignDocumentJson(json, "different-problem"),
    ).toThrow(SystemDesignImportError);
  });

  test("rejects invalid JSON and schema versions", () => {
    expect(() => parseSystemDesignDocumentJson("{broken")).toThrow(
      SystemDesignImportError,
    );
    const invalidSchema = {
      ...createDocument(),
      schemaVersion: 2,
    };
    expect(validationIssuePaths(invalidSchema)).toContain("$.schemaVersion");
  });

  test("rejects unsupported node types", () => {
    const invalidType = {
      ...createDocument(),
      nodes: [{ ...createNode("node-api"), type: "unsupported_component" }],
    };
    expect(validationIssuePaths(invalidType)).toContain("$.nodes[0].type");
  });

  test("rejects dangling and exact duplicate edges", () => {
    const source = createNode("node-source");
    const target = { ...createNode("node-target"), layer: 1 };
    const edge = createEdge("edge-request", source.id, target.id);
    const dangling = createDocument(
      [source, target],
      [{ ...edge, targetNodeId: "missing-node" }],
    );
    expect(validationIssuePaths(dangling)).toContain(
      "$.edges[0].targetNodeId",
    );

    const duplicate = createDocument(
      [source, target],
      [edge, { ...edge, id: "edge-request-duplicate" }],
    );
    expect(validationIssuePaths(duplicate)).toContain("$.edges[1]");
  });
});
