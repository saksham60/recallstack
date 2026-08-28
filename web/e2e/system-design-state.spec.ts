import { expect, test } from "@playwright/test";
import { createSystemDesignRepository } from "../src/features/system-design/repository/createSystemDesignRepository";
import { systemDesignEditorActions } from "../src/features/system-design/state/system-design-editor-actions";
import {
  createSystemDesignEditorState,
  systemDesignEditorReducer,
} from "../src/features/system-design/state/system-design-editor-reducer";
import {
  SYSTEM_DESIGN_SCHEMA_VERSION,
  type SystemDesignDiagram,
  type SystemDesignDocument,
  type SystemDesignEdge,
  type SystemDesignEditorState,
  type SystemDesignNode,
} from "../src/features/system-design/types/system-design.types";
import {
  SystemDesignImportError,
  parseSystemDesignDocumentJson,
  prepareSystemDesignExport,
  serializeSystemDesignDocument,
} from "../src/features/system-design/utils/diagram-import-export";
import { validateSystemDesignDocument } from "../src/features/system-design/utils/diagram-validation";
import {
  createEmptyStandaloneSystemDesignDocument,
  createSystemDesignFreehandNode,
} from "../src/features/system-design/utils/system-design-defaults";
import {
  applyCanvasOperation,
  reconstructRoomDocument,
} from "../src/features/system-design/realtime/apply-canvas-operation";
import { parseCanvasOperation } from "../src/features/system-design/realtime/canvas-operation";
import { RealtimeSequenceTracker } from "../src/features/system-design/realtime/realtime-client";
import {
  parseRealtimeServerMessage,
  type RealtimeCommitMessage,
} from "../src/features/system-design/realtime/realtime.types";
import { parseNodeDragOperation } from "../src/features/system-design/realtime/node-drag-operation";
import {
  NODE_DRAG_PREVIEW_INTERVAL_MS,
  REMOTE_NODE_DRAG_TIMEOUT_MS,
  NodeDragPreviewBroadcaster,
  RemoteNodeDragRegistry,
  type DragPreviewScheduler,
} from "../src/features/system-design/realtime/node-drag-preview";

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
  const rootDiagramId = "diagram-url-shortener";
  return {
    schemaVersion: SYSTEM_DESIGN_SCHEMA_VERSION,
    id: "document-url-shortener",
    problemId: "url-shortener",
    title: "URL Shortener",
    status: "in_progress",
    rootDiagramId,
    diagrams: {
      [rootDiagramId]: {
        id: rootDiagramId,
        name: "URL Shortener",
        nodes,
        edges,
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    },
    createdAt: timestamp(0),
    updatedAt,
  };
}

function rootDiagram(document: SystemDesignDocument): SystemDesignDiagram {
  return document.diagrams[document.rootDiagramId];
}

function activeDiagram(state: SystemDesignEditorState): SystemDesignDiagram {
  return state.document.diagrams[state.activeDiagramId];
}

function withRootDiagram(
  document: SystemDesignDocument,
  changes: Partial<SystemDesignDiagram>,
): SystemDesignDocument {
  const diagram = rootDiagram(document);
  return {
    ...document,
    diagrams: {
      ...document.diagrams,
      [document.rootDiagramId]: { ...diagram, ...changes },
    },
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
  test("commits one complete freehand stroke as one undoable node", () => {
    let state = createSystemDesignEditorState(createDocument());
    const stroke = createSystemDesignFreehandNode([
      { x: 140, y: 90 },
      { x: 148, y: 102 },
      { x: 164, y: 111 },
    ]);
    expect(stroke).not.toBeNull();

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.addNode(stroke!, timestamp(1)),
    );
    expect(rootDiagram(state.document).nodes).toHaveLength(1);
    expect(state.history).toHaveLength(1);

    state = systemDesignEditorReducer(state, systemDesignEditorActions.undo());
    expect(rootDiagram(state.document).nodes).toHaveLength(0);
    state = systemDesignEditorReducer(state, systemDesignEditorActions.redo());
    expect(rootDiagram(state.document).nodes[0]).toMatchObject({
      type: "freehand",
      drawing: {
        stroke: "#fafafa",
        strokeWidth: 3,
      },
    });
  });

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
    expect(activeDiagram(state).nodes).toHaveLength(1);
    expect(state.selectedNodeIds).toEqual(["node-api"]);

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.moveNodes(
        { "node-api": { x: 180, y: 220 } },
        timestamp(2),
      ),
    );
    expect(activeDiagram(state).nodes[0]).toMatchObject({
      x: 180,
      y: 220,
    });

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.updateNode(
        "node-api",
        {
          label: "Gateway",
          technology: {
            id: "kong",
            name: "Kong",
            category: "networking",
          },
        },
        timestamp(3),
      ),
    );
    expect(activeDiagram(state).nodes[0]).toMatchObject({
      label: "Gateway",
      technology: {
        id: "kong",
        name: "Kong",
        category: "networking",
      },
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
    expect(activeDiagram(state).edges[0]).toMatchObject({
      type: "data",
      label: "Read/write",
      protocol: "SQL",
    });

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.deleteNodes(["node-api"], timestamp(7)),
    );
    expect(activeDiagram(state).nodes.map((node) => node.id)).toEqual([
      "node-db",
    ]);
    expect(activeDiagram(state).edges).toHaveLength(0);

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.undo(),
    );
    expect(activeDiagram(state).nodes).toHaveLength(2);
    expect(activeDiagram(state).edges[0]).toMatchObject({
      id: "edge-api-db",
      type: "data",
    });

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.redo(),
    );
    expect(activeDiagram(state).nodes.map((node) => node.id)).toEqual([
      "node-db",
    ]);
    expect(activeDiagram(state).edges).toHaveLength(0);
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
    expect(activeDiagram(state).nodes[0].label).toBe("Revision 59");

    for (let index = 0; index < 50; index += 1) {
      state = systemDesignEditorReducer(
        state,
        systemDesignEditorActions.undo(),
      );
    }
    expect(state.history).toHaveLength(0);
    expect(state.future).toHaveLength(50);
    expect(activeDiagram(state).nodes[0].label).toBe("Revision 9");
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
    expect(activeDiagram(state).nodes).toHaveLength(4);
    expect(state.selectedNodeIds).toEqual([
      "node-client-copy",
      "node-api-copy",
    ]);
    expect(
      activeDiagram(state).nodes.find(
        (node) => node.id === "node-client-copy",
      ),
    ).toMatchObject({ x: 52, y: 62 });
    expect(
      activeDiagram(state).edges.find(
        (candidate) => candidate.id === "edge-client-api-copy",
      ),
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
    expect(activeDiagram(state).nodes).toHaveLength(6);
    expect(activeDiagram(state).edges).toHaveLength(3);
    expect(
      activeDiagram(state).edges.find(
        (candidate) => candidate.id === "edge-client-api-duplicate",
      ),
    ).toMatchObject({
      sourceNodeId: "node-client-duplicate",
      targetNodeId: "node-api-duplicate",
    });
  });

  test("groups nodes as one selection and remaps groups when duplicating", () => {
    const first = createNode("node-first", 40, 60, "First");
    const second = {
      ...createNode("node-second", 260, 60, "Second"),
      layer: 1,
    };
    const third = {
      ...createNode("node-third", 480, 60, "Third"),
      layer: 2,
    };
    let state = createSystemDesignEditorState(
      createDocument([first, second, third]),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.selectNodes(
        [first.id, second.id],
        "replace",
      ),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.groupNodes(undefined, {
        groupId: "group-pair",
        at: timestamp(1),
      }),
    );
    expect(activeDiagram(state).nodes.slice(0, 2).map((node) => node.groupId)).toEqual([
      "group-pair",
      "group-pair",
    ]);

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.clearSelection(),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.selectNodes([first.id], "replace"),
    );
    expect(state.selectedNodeIds).toEqual([first.id, second.id]);
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.setNodesState(
        { locked: true },
        undefined,
        timestamp(2),
      ),
    );
    expect(activeDiagram(state).nodes.slice(0, 2).every((node) => node.locked)).toBe(true);

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.duplicateNodes(undefined, {
        nodeIdMap: {
          [first.id]: "node-first-copy",
          [second.id]: "node-second-copy",
        },
        at: timestamp(3),
      }),
    );
    const copies = activeDiagram(state).nodes.filter((node) =>
      state.selectedNodeIds.includes(node.id),
    );
    expect(copies).toHaveLength(2);
    expect(copies[0].groupId).toBeTruthy();
    expect(copies[0].groupId).toBe(copies[1].groupId);
    expect(copies[0].groupId).not.toBe("group-pair");

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.ungroupNodes(undefined, timestamp(4)),
    );
    expect(
      activeDiagram(state).nodes
        .filter((node) => state.selectedNodeIds.includes(node.id))
        .every((node) => node.groupId === undefined),
    ).toBe(true);
    expect(
      activeDiagram(state).nodes
        .filter((node) => node.id === first.id || node.id === second.id)
        .every((node) => node.groupId === "group-pair"),
    ).toBe(true);
  });

  test("applies multi-selection visibility, frames, and layer ordering once", () => {
    const first = createNode("node-first", 40, 60, "First");
    const second = {
      ...createNode("node-second", 260, 60, "Second"),
      layer: 1,
    };
    const third = {
      ...createNode("node-third", 480, 60, "Third"),
      layer: 2,
    };
    const fourth = {
      ...createNode("node-fourth", 700, 60, "Fourth"),
      layer: 3,
    };
    let state = createSystemDesignEditorState(
      createDocument([first, second, third, fourth]),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.selectNodes(
        [second.id, third.id],
        "replace",
      ),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.arrangeNodes(
        {
          [second.id]: { x: 100, y: 120, width: 220, height: 96 },
          [third.id]: { x: 360, y: 120, width: 220, height: 96 },
        },
        timestamp(1),
      ),
    );
    expect(state.history).toHaveLength(1);
    expect(activeDiagram(state).nodes[1]).toMatchObject({
      x: 100,
      y: 120,
      width: 220,
      height: 96,
    });

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.reorderSelectedLayers(
        "front",
        undefined,
        timestamp(2),
      ),
    );
    expect(
      [...activeDiagram(state).nodes]
        .sort((left, right) => left.layer - right.layer)
        .map((node) => node.id),
    ).toEqual([first.id, fourth.id, second.id, third.id]);

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.setNodesState(
        { visible: false },
        undefined,
        timestamp(3),
      ),
    );
    expect(state.selectedNodeIds).toEqual([]);
    expect(
      activeDiagram(state).nodes
        .filter((node) => node.id === second.id || node.id === third.id)
        .every((node) => node.visible === false),
    ).toBe(true);
  });

  test("preserves intentionally non-expandable modules when pasting and duplicating", () => {
    const moduleNode = {
      ...createNode("node-static-module", 80, 100, "Static boundary"),
      type: "module" as const,
      isExpandable: false,
    };
    let state = createSystemDesignEditorState(createDocument([moduleNode]));

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.selectNodes([moduleNode.id], "replace"),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.copySelection(),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.pasteClipboard({
        nodeIdMap: { [moduleNode.id]: "node-static-module-copy" },
        at: timestamp(1),
      }),
    );

    const pastedModule = activeDiagram(state).nodes.find(
      (node) => node.id === "node-static-module-copy",
    );
    expect(pastedModule).toMatchObject({
      childDiagramId: undefined,
      isExpandable: false,
    });

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.duplicateNodes(undefined, {
        nodeIdMap: {
          "node-static-module-copy": "node-static-module-duplicate",
        },
        at: timestamp(2),
      }),
    );

    expect(
      activeDiagram(state).nodes.find(
        (node) => node.id === "node-static-module-duplicate",
      ),
    ).toMatchObject({
      childDiagramId: undefined,
      isExpandable: false,
    });
  });

  test("copy/paste deep-clones a module's complete diagram hierarchy", () => {
    const authenticationModule = {
      ...createNode("node-auth", 80, 100, "Authentication"),
      type: "module" as const,
      width: 240,
      height: 136,
      isExpandable: true,
    };
    let state = createSystemDesignEditorState(createDocument());
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.addNode(
        authenticationModule,
        timestamp(1),
      ),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.openOrCreateModule(
        authenticationModule.id,
        { childDiagramId: "diagram-auth", at: timestamp(2) },
      ),
    );

    const api = {
      ...createNode("node-auth-api", 80, 100, "Auth API"),
      parentModuleId: authenticationModule.id,
    };
    const notificationModule = {
      ...createNode(
        "node-notification-module",
        320,
        100,
        "Notification",
      ),
      type: "module" as const,
      isExpandable: true,
      parentModuleId: authenticationModule.id,
      layer: 1,
    };
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.addNode(api, timestamp(3)),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.addNode(
        notificationModule,
        timestamp(4),
      ),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.addEdge(
        createEdge(
          "edge-auth-notification",
          api.id,
          notificationModule.id,
        ),
        timestamp(5),
      ),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.openOrCreateModule(
        notificationModule.id,
        {
          childDiagramId: "diagram-notification",
          at: timestamp(6),
        },
      ),
    );
    const worker = {
      ...createNode("node-email-worker", 100, 120, "Email Worker"),
      parentModuleId: notificationModule.id,
    };
    const queue = {
      ...createNode("node-email-queue", 340, 120, "Email Queue"),
      type: "message_queue" as const,
      parentModuleId: notificationModule.id,
      layer: 1,
    };
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.addNode(worker, timestamp(7)),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.addNode(queue, timestamp(8)),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.addEdge(
        createEdge("edge-worker-queue", worker.id, queue.id),
        timestamp(9),
      ),
    );

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.activateDiagram(
        state.document.rootDiagramId,
      ),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.selectNodes(
        [authenticationModule.id],
        "replace",
      ),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.copySelection(),
    );
    const historyAfterCopy = state.history.length;
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.pasteClipboard({
        nodeIdMap: { "node-auth": "node-auth-copy" },
        at: timestamp(10),
      }),
    );

    expect(state.history).toHaveLength(historyAfterCopy + 1);
    const originalModule = rootDiagram(state.document).nodes.find(
      (node) => node.id === authenticationModule.id,
    )!;
    const copiedModule = rootDiagram(state.document).nodes.find(
      (node) => node.id === "node-auth-copy",
    )!;
    expect(copiedModule.childDiagramId).toBeTruthy();
    expect(copiedModule.isExpandable).toBe(true);
    expect(copiedModule.childDiagramId).not.toBe(
      originalModule.childDiagramId,
    );

    const originalAuthDiagram =
      state.document.diagrams[originalModule.childDiagramId!];
    const copiedAuthDiagram =
      state.document.diagrams[copiedModule.childDiagramId!];
    expect(copiedAuthDiagram).not.toBe(originalAuthDiagram);
    expect(copiedAuthDiagram).toMatchObject({
      name: "Authentication",
      parentNodeId: copiedModule.id,
    });
    expect(
      copiedAuthDiagram.nodes.every(
        (node) => node.parentModuleId === copiedModule.id,
      ),
    ).toBe(true);
    const originalAuthNodeIds = new Set(
      originalAuthDiagram.nodes.map((node) => node.id),
    );
    expect(
      copiedAuthDiagram.nodes.every(
        (node) => !originalAuthNodeIds.has(node.id),
      ),
    ).toBe(true);
    expect(copiedAuthDiagram.edges).toHaveLength(1);
    expect(copiedAuthDiagram.edges[0].id).not.toBe(
      originalAuthDiagram.edges[0].id,
    );
    expect(
      copiedAuthDiagram.nodes.some(
        (node) =>
          node.id === copiedAuthDiagram.edges[0].sourceNodeId,
      ),
    ).toBe(true);
    expect(
      copiedAuthDiagram.nodes.some(
        (node) =>
          node.id === copiedAuthDiagram.edges[0].targetNodeId,
      ),
    ).toBe(true);

    const originalNestedModule = originalAuthDiagram.nodes.find(
      (node) => node.label === "Notification",
    )!;
    const copiedNestedModule = copiedAuthDiagram.nodes.find(
      (node) => node.label === "Notification",
    )!;
    expect(copiedNestedModule.childDiagramId).toBeTruthy();
    expect(copiedNestedModule.isExpandable).toBe(true);
    expect(copiedNestedModule.childDiagramId).not.toBe(
      originalNestedModule.childDiagramId,
    );
    const originalNestedDiagram =
      state.document.diagrams[originalNestedModule.childDiagramId!];
    const copiedNestedDiagram =
      state.document.diagrams[copiedNestedModule.childDiagramId!];
    expect(copiedNestedDiagram).not.toBe(originalNestedDiagram);
    expect(copiedNestedDiagram.parentNodeId).toBe(
      copiedNestedModule.id,
    );
    expect(
      copiedNestedDiagram.nodes.every(
        (node) => node.parentModuleId === copiedNestedModule.id,
      ),
    ).toBe(true);
    expect(copiedNestedDiagram.edges[0].id).not.toBe(
      originalNestedDiagram.edges[0].id,
    );
  });

  test("renaming a module renames its breadcrumb diagram in one history entry", () => {
    const moduleNode = {
      ...createNode("node-search", 80, 100, "Search"),
      type: "module" as const,
      isExpandable: true,
    };
    let state = createSystemDesignEditorState(createDocument());
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.addNode(moduleNode, timestamp(1)),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.openOrCreateModule(moduleNode.id, {
        childDiagramId: "diagram-search",
        at: timestamp(2),
      }),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.activateDiagram(
        state.document.rootDiagramId,
      ),
    );
    const historyBeforeRename = state.history.length;

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.updateNode(
        moduleNode.id,
        { label: "Discovery Platform" },
        timestamp(3),
      ),
    );

    expect(rootDiagram(state.document).nodes[0].label).toBe(
      "Discovery Platform",
    );
    expect(state.document.diagrams["diagram-search"].name).toBe(
      "Discovery Platform",
    );
    expect(state.history).toHaveLength(historyBeforeRename + 1);

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.undo(),
    );
    expect(rootDiagram(state.document).nodes[0].label).toBe("Search");
    expect(state.document.diagrams["diagram-search"].name).toBe(
      "Search",
    );
  });

  test("creates, revisits, and recursively deletes nested module diagrams", () => {
    const rootDiagramId = createDocument().rootDiagramId;
    const authenticationModule = {
      ...createNode("node-auth", 80, 100, "Authentication"),
      type: "module" as const,
      width: 240,
      height: 136,
      isExpandable: true,
    };
    let state = createSystemDesignEditorState(createDocument());

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.addNode(
        authenticationModule,
        timestamp(1),
      ),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.openOrCreateModule(
        authenticationModule.id,
        { childDiagramId: "diagram-auth", at: timestamp(2) },
      ),
    );

    expect(state.activeDiagramId).toBe("diagram-auth");
    expect(rootDiagram(state.document).nodes[0]).toMatchObject({
      id: authenticationModule.id,
      childDiagramId: "diagram-auth",
      isExpandable: true,
      isCollapsed: false,
    });
    expect(activeDiagram(state)).toMatchObject({
      id: "diagram-auth",
      name: "Authentication",
      parentNodeId: authenticationModule.id,
    });

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.addNode(
        createNode("node-token-service", 100, 120, "Token Service"),
        timestamp(3),
      ),
    );
    const tokenModule = {
      ...createNode("node-token-module", 340, 120, "Token Platform"),
      type: "module" as const,
      isExpandable: true,
    };
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.addNode(tokenModule, timestamp(4)),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.openOrCreateModule(tokenModule.id, {
        childDiagramId: "diagram-token-platform",
        at: timestamp(5),
      }),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.addNode(
        createNode("node-signing-worker", 120, 100, "Signing Worker"),
        timestamp(6),
      ),
    );

    const nestedDocument = state.document;
    const historyLength = state.history.length;
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.activateDiagram(rootDiagramId),
    );
    expect(state.document).toBe(nestedDocument);
    expect(state.history).toHaveLength(historyLength);
    expect(state.activeDiagramId).toBe(rootDiagramId);

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.activateDiagram("diagram-auth"),
    );
    expect(activeDiagram(state).nodes.map((node) => node.id)).toEqual([
      "node-token-service",
      "node-token-module",
    ]);
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.openOrCreateModule(tokenModule.id, {
        at: timestamp(7),
      }),
    );
    expect(state.activeDiagramId).toBe("diagram-token-platform");
    expect(activeDiagram(state).nodes[0].label).toBe("Signing Worker");
    expect(state.document).toBe(nestedDocument);
    expect(state.history).toHaveLength(historyLength);

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.activateDiagram(rootDiagramId),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.deleteNodes(
        [authenticationModule.id],
        timestamp(8),
      ),
    );
    expect(rootDiagram(state.document).nodes).toHaveLength(0);
    expect(Object.keys(state.document.diagrams)).toEqual([rootDiagramId]);
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
    expect(activeDiagram(state).viewport).toEqual({
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
    expect(activeDiagram(state).nodes).toHaveLength(0);
    expect(activeDiagram(state).viewport).toEqual({
      x: 140,
      y: -70,
      zoom: 1.4,
    });
  });

  test("applies delayed viewport commits to their originating diagram", () => {
    const moduleNode = {
      ...createNode("node-module", 80, 100, "Payments"),
      type: "module" as const,
      isExpandable: true,
    };
    let state = createSystemDesignEditorState(
      createDocument([moduleNode]),
    );
    const rootDiagramId = state.document.rootDiagramId;
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.openOrCreateModule(moduleNode.id, {
        childDiagramId: "diagram-payments",
        at: timestamp(1),
      }),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.setViewport(
        { x: -40, y: 25, zoom: 1.1 },
        timestamp(2),
      ),
    );

    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.setViewport(
        { x: 180, y: -90, zoom: 1.5 },
        timestamp(3),
        rootDiagramId,
      ),
    );

    expect(state.activeDiagramId).toBe("diagram-payments");
    expect(state.document.diagrams[rootDiagramId].viewport).toEqual({
      x: 180,
      y: -90,
      zoom: 1.5,
    });
    expect(state.document.diagrams["diagram-payments"].viewport).toEqual({
      x: -40,
      y: 25,
      zoom: 1.1,
    });
    expect(state.history).toHaveLength(1);
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
    expect(activeDiagram(state).nodes[0].label).toBe("node-api");
    expect(activeDiagram(state).viewport).toEqual({
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
    expect(activeDiagram(state).nodes[0].label).toBe("Renamed API");
    expect(activeDiagram(state).viewport).toEqual({
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

    expect(activeDiagram(state).nodes[0]).toMatchObject({
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
  test("loads and rewrites an existing schema-v2 problem document", async () => {
    const storage = new MemoryStorage();
    const schemaV2 = { ...createDocument(), schemaVersion: 2 };
    const key = "recallstack:admin:system-design:url-shortener";
    storage.setItem(key, JSON.stringify(schemaV2));
    const repository = createSystemDesignRepository(storage);

    const loaded = await repository.getDocument("url-shortener");
    expect(loaded?.schemaVersion).toBe(SYSTEM_DESIGN_SCHEMA_VERSION);
    expect(JSON.parse(storage.getItem(key) ?? "{}").schemaVersion).toBe(
      SYSTEM_DESIGN_SCHEMA_VERSION,
    );
  });

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

    await expect(repository.getDocument(started.problemId!)).resolves.toEqual(
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

    await repository.deleteDocument(started.problemId!);
    await expect(repository.getDocument(started.problemId!)).resolves.toBeNull();
    await expect(repository.listDocumentSummaries()).resolves.toHaveLength(1);
  });
});

test.describe("system-design import and validation", () => {
  test("validates standalone documents and round-trips typed freehand data", () => {
    const document = createEmptyStandaloneSystemDesignDocument(
      "Canvas",
      timestamp(0),
    );
    const stroke = createSystemDesignFreehandNode(
      [
        { x: -40, y: 18 },
        { x: -12, y: 42 },
        { x: 25, y: 10 },
      ],
      { stroke: "#22d3ee", strokeWidth: 4, opacity: 0.75 },
    );
    expect(stroke).not.toBeNull();
    Object.assign(stroke!.drawing!, {
      lineStyle: "dash_dot",
      dashPattern: [10, 5, 2, 5],
      animationMode: "moving_dots",
      animationSpeed: 1.75,
      animationDirection: "reverse",
    } satisfies Partial<NonNullable<SystemDesignNode["drawing"]>>);
    document.diagrams[document.rootDiagramId].nodes.push(stroke!);

    const parsed = parseSystemDesignDocumentJson(
      serializeSystemDesignDocument(document),
    );
    expect(parsed).not.toHaveProperty("problemId");
    expect(rootDiagram(parsed).nodes[0].drawing).toEqual(stroke?.drawing);
  });

  test("migrates an existing schema-v2 document to the current schema", () => {
    const schemaV2 = {
      ...createDocument(),
      schemaVersion: 2,
    };
    const migrated = parseSystemDesignDocumentJson(JSON.stringify(schemaV2));
    expect(migrated.schemaVersion).toBe(SYSTEM_DESIGN_SCHEMA_VERSION);
    expect(rootDiagram(migrated).nodes).toEqual(rootDiagram(createDocument()).nodes);
  });

  test("round-trips a valid document as formatted JSON", () => {
    const client = createNode("node-client", 20, 40, "Client");
    const api = { ...createNode("node-api", 300, 40, "API"), layer: 1 };
    const document = createDocument(
      [client, api],
      [createEdge("edge-client-api", client.id, api.id)],
      timestamp(1),
    );

    const json = serializeSystemDesignDocument(document);
    expect(json).toContain(
      `\n  "schemaVersion": ${SYSTEM_DESIGN_SCHEMA_VERSION}`,
    );
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
      schemaVersion: 999,
    };
    expect(validationIssuePaths(invalidSchema)).toContain("$.schemaVersion");
  });

  test("migrates a schema-v1 document into a canonical multi-diagram document", () => {
    const legacyNode = {
      ...createNode("node-cache"),
      type: "cache",
      technology: "Redis",
    };
    const legacyDocument = {
      schemaVersion: 1,
      id: "legacy-root-diagram",
      problemId: "url-shortener",
      title: "URL Shortener",
      status: "in_progress",
      nodes: [legacyNode],
      edges: [],
      viewport: { x: 12, y: -8, zoom: 1.2 },
      createdAt: timestamp(0),
      updatedAt: timestamp(1),
    };

    const migrated = parseSystemDesignDocumentJson(
      JSON.stringify(legacyDocument),
      "url-shortener",
    );

    expect(migrated).not.toHaveProperty("nodes");
    expect(migrated).not.toHaveProperty("edges");
    expect(migrated).not.toHaveProperty("viewport");
    expect(migrated.schemaVersion).toBe(SYSTEM_DESIGN_SCHEMA_VERSION);
    expect(migrated.rootDiagramId).toBe("legacy-root-diagram");
    expect(rootDiagram(migrated)).toMatchObject({
      id: "legacy-root-diagram",
      name: "URL Shortener",
      viewport: { x: 12, y: -8, zoom: 1.2 },
    });
    expect(rootDiagram(migrated).nodes[0].technology).toEqual({
      id: "redis",
      name: "Redis",
      category: "cache",
    });
  });

  test("rejects unsupported node types", () => {
    const document = createDocument();
    const invalidType = withRootDiagram(document, {
      nodes: [
        { ...createNode("node-api"), type: "unsupported_component" },
      ] as unknown as SystemDesignNode[],
    });
    expect(validationIssuePaths(invalidType)).toContain(
      "$.diagrams.diagram-url-shortener.nodes[0].type",
    );
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
      "$.diagrams.diagram-url-shortener.edges[0].targetNodeId",
    );

    const duplicate = createDocument(
      [source, target],
      [edge, { ...edge, id: "edge-request-duplicate" }],
    );
    expect(validationIssuePaths(duplicate)).toContain(
      "$.diagrams.diagram-url-shortener.edges[1]",
    );
  });
});

test.describe("system-design realtime convergence", () => {
  const committed = (
    sequence: number,
    opId: string,
    payload: unknown,
  ): RealtimeCommitMessage => ({
    v: 1,
    type: "op.commit",
    actorId: "remote-actor",
    opId,
    sequence,
    payload,
  });

  test("applies add, move, and delete through the existing reducer semantics", () => {
    const first = createNode("node-live", 100, 120, "Live service");
    let state = createSystemDesignEditorState(createDocument());

    state = applyCanvasOperation(state, {
      kind: "node.add",
      diagramId: state.activeDiagramId,
      node: first,
    }).state;
    expect(activeDiagram(state).nodes).toEqual([first]);

    state = applyCanvasOperation(state, {
      kind: "node.move",
      diagramId: state.activeDiagramId,
      positions: { [first.id]: { x: 340, y: 260 } },
    }).state;
    expect(activeDiagram(state).nodes[0]).toMatchObject({ x: 340, y: 260 });

    const second = { ...createNode("node-target", 600, 260), layer: 1 };
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.addNode(second, timestamp(3)),
    );
    state = systemDesignEditorReducer(
      state,
      systemDesignEditorActions.addEdge(
        createEdge("edge-live", first.id, second.id),
        timestamp(4),
      ),
    );
    state = applyCanvasOperation(state, {
      kind: "node.delete",
      diagramId: state.activeDiagramId,
      nodeIds: [first.id],
    }).state;
    expect(activeDiagram(state).nodes.map((node) => node.id)).toEqual([
      second.id,
    ]);
    expect(activeDiagram(state).edges).toEqual([]);
  });

  test("targets nested diagrams without changing the viewer's active diagram", () => {
    const document = createDocument();
    const childId = "diagram-child";
    document.diagrams[document.rootDiagramId].nodes = [
      {
        ...createNode("module-parent"),
        type: "module",
        childDiagramId: childId,
        isExpandable: true,
      },
    ];
    document.diagrams[childId] = {
      id: childId,
      name: "Child",
      parentNodeId: "module-parent",
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    let state = createSystemDesignEditorState(document);
    const rootId = state.activeDiagramId;
    state = applyCanvasOperation(state, {
      kind: "node.add",
      diagramId: childId,
      node: createNode("child-service"),
    }).state;

    expect(state.activeDiagramId).toBe(rootId);
    expect(state.document.diagrams[childId].nodes).toHaveLength(1);
    expect(state.selectedNodeIds).toEqual([]);
  });

  test("deduplicates committed operations and detects sequence gaps", () => {
    const tracker = new RealtimeSequenceTracker();
    const first = committed(1, "op-1", { kind: "node.delete" });
    const second = committed(2, "op-2", { kind: "node.delete" });

    expect(tracker.inspect(second, new Set())).toBe("gap");
    expect(tracker.inspect(first, new Set())).toBe("apply");
    tracker.accept(first);
    expect(tracker.inspect(first, new Set())).toBe("duplicate");
    expect(tracker.inspect(second, new Set(["op-2"]))).toBe("own");
    tracker.accept(second);
    expect(tracker.lastSequence).toBe(2);
  });

  test("reconstructs a full room state and rejects malformed envelopes", () => {
    const snapshot = createDocument();
    const diagramId = snapshot.rootDiagramId;
    const node = createNode("replayed-node");
    const document = reconstructRoomDocument(snapshot, [
      committed(1, "op-add", { kind: "node.add", diagramId, node }),
      committed(2, "op-move", {
        kind: "node.move",
        diagramId,
        positions: { [node.id]: { x: 720, y: 440 } },
      }),
    ]);
    expect(rootDiagram(document).nodes[0]).toMatchObject({
      id: node.id,
      x: 720,
      y: 440,
    });

    const emptyRoomState = parseRealtimeServerMessage(
      JSON.stringify({
        v: 1,
        type: "room.state",
        snapshot,
        stateMode: "full",
        historyStartsAt: 1,
      }),
    );
    expect(emptyRoomState).toMatchObject({
      type: "room.state",
      currentSequence: 0,
      operations: [],
      presence: [],
    });

    expect(() =>
      parseRealtimeServerMessage('{"v":2,"type":"room.state"}'),
    ).toThrow(/protocol version/i);
    expect(() =>
      parseCanvasOperation({
        kind: "node.move",
        diagramId,
        positions: { [node.id]: { x: Number.NaN, y: 1 } },
      }),
    ).toThrow(/position|operation/i);
  });
});

test.describe("system-design live node drag previews", () => {
  class ManualScheduler implements DragPreviewScheduler {
    private currentTime = 0;
    private nextId = 1;
    private readonly tasks = new Map<
      number,
      { callback: () => void; dueAt: number }
    >();

    now = () => this.currentTime;

    setTimeout = (callback: () => void, delay: number) => {
      const id = this.nextId++;
      this.tasks.set(id, { callback, dueAt: this.currentTime + delay });
      return id as unknown as ReturnType<typeof setTimeout>;
    };

    clearTimeout = (handle: ReturnType<typeof setTimeout>) => {
      this.tasks.delete(handle as unknown as number);
    };

    advance(milliseconds: number): void {
      const target = this.currentTime + milliseconds;
      while (true) {
        const next = [...this.tasks.entries()]
          .filter(([, task]) => task.dueAt <= target)
          .sort((left, right) => left[1].dueAt - right[1].dueAt)[0];
        if (!next) break;
        const [id, task] = next;
        this.tasks.delete(id);
        this.currentTime = task.dueAt;
        task.callback();
      }
      this.currentTime = target;
    }

    get pendingTaskCount(): number {
      return this.tasks.size;
    }
  }

  test("coalesces rapid local moves into one latest-only preview per interval", () => {
    const scheduler = new ManualScheduler();
    const sent: ReturnType<typeof parseNodeDragOperation>[] = [];
    const broadcaster = new NodeDragPreviewBroadcaster({
      scheduler,
      createSessionId: () => "drag-local",
      send: (operation) => {
        sent.push(operation);
        return true;
      },
    });

    broadcaster.begin("diagram-root", ["node-a"]);
    for (let x = 1; x <= 100; x += 1) {
      broadcaster.preview({ "node-a": { x, y: x * 2 } });
    }

    expect(sent).toHaveLength(1);
    expect(scheduler.pendingTaskCount).toBe(1);
    scheduler.advance(NODE_DRAG_PREVIEW_INTERVAL_MS);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual({
      kind: "node.drag.preview",
      dragSessionId: "drag-local",
      diagramId: "diagram-root",
      previewIndex: 1,
      positions: { "node-a": { x: 100, y: 200 } },
    });

    broadcaster.end();
    expect(sent.at(-1)?.kind).toBe("node.drag.end");
    expect(scheduler.pendingTaskCount).toBe(0);
  });

  test("keeps only the latest preview while transport backpressure clears", () => {
    const scheduler = new ManualScheduler();
    const sent: ReturnType<typeof parseNodeDragOperation>[] = [];
    let blocked = false;
    const broadcaster = new NodeDragPreviewBroadcaster({
      scheduler,
      createSessionId: () => "drag-backpressure",
      send: (operation) => {
        if (operation.kind === "node.drag.preview" && blocked) return false;
        sent.push(operation);
        return true;
      },
    });

    broadcaster.begin("diagram-root", ["node-a"]);
    blocked = true;
    broadcaster.preview({ "node-a": { x: 10, y: 20 } });
    scheduler.advance(NODE_DRAG_PREVIEW_INTERVAL_MS);
    broadcaster.preview({ "node-a": { x: 90, y: 120 } });
    expect(scheduler.pendingTaskCount).toBe(1);
    blocked = false;
    scheduler.advance(NODE_DRAG_PREVIEW_INTERVAL_MS);

    expect(sent.filter((operation) => operation.kind === "node.drag.preview"))
      .toEqual([
        {
          kind: "node.drag.preview",
          dragSessionId: "drag-backpressure",
          diagramId: "diagram-root",
          previewIndex: 1,
          positions: { "node-a": { x: 90, y: 120 } },
        },
      ]);
  });

  test("filters stale previews and clears transient state on one final move", () => {
    const document = createDocument([createNode("node-a")]);
    const diagramId = document.rootDiagramId;
    let state = createSystemDesignEditorState(document);
    const registry = new RemoteNodeDragRegistry();

    registry.apply(
      "actor-a",
      parseNodeDragOperation({
        kind: "node.drag.start",
        dragSessionId: "drag-a",
        diagramId,
        nodeIds: ["node-a"],
      }),
      0,
    );
    registry.apply(
      "actor-a",
      parseNodeDragOperation({
        kind: "node.drag.preview",
        dragSessionId: "drag-a",
        diagramId,
        previewIndex: 3,
        positions: { "node-a": { x: 300, y: 180 } },
      }),
      30,
    );
    expect(
      registry.apply(
        "actor-a",
        parseNodeDragOperation({
          kind: "node.drag.preview",
          dragSessionId: "drag-a",
          diagramId,
          previewIndex: 2,
          positions: { "node-a": { x: 20, y: 20 } },
        }),
        40,
      ),
    ).toBeNull();
    expect(registry.positionsForDiagram(diagramId)).toEqual({
      "node-a": { x: 300, y: 180 },
    });
    expect(state.history).toHaveLength(0);
    expect(activeDiagram(state).nodes[0]).toMatchObject({ x: 40, y: 60 });

    const finalPositions = { "node-a": { x: 360, y: 240 } };
    registry.clearCommitted(diagramId, Object.keys(finalPositions));
    state = applyCanvasOperation(state, {
      kind: "node.move",
      diagramId,
      positions: finalPositions,
    }).state;
    expect(registry.positionsForDiagram(diagramId)).toEqual({});
    expect(registry.ownedNodeIds(diagramId).size).toBe(0);
    expect(state.history).toHaveLength(1);
    expect(activeDiagram(state).nodes[0]).toMatchObject({ x: 360, y: 240 });
  });

  test("expires abandoned sessions and gives simultaneous drags first ownership", () => {
    const registry = new RemoteNodeDragRegistry();
    const diagramId = "diagram-root";
    const start = (actorId: string, dragSessionId: string, now: number) =>
      registry.apply(
        actorId,
        {
          kind: "node.drag.start",
          dragSessionId,
          diagramId,
          nodeIds: ["node-a"],
        },
        now,
      );

    start("actor-a", "drag-a", 0);
    start("actor-b", "drag-b", 10);
    registry.apply(
      "actor-b",
      {
        kind: "node.drag.preview",
        dragSessionId: "drag-b",
        diagramId,
        previewIndex: 1,
        positions: { "node-a": { x: 900, y: 900 } },
      },
      20,
    );
    registry.apply(
      "actor-a",
      {
        kind: "node.drag.preview",
        dragSessionId: "drag-a",
        diagramId,
        previewIndex: 1,
        positions: { "node-a": { x: 100, y: 120 } },
      },
      30,
    );
    expect(registry.positionsForDiagram(diagramId)).toEqual({
      "node-a": { x: 100, y: 120 },
    });

    const mutations = registry.expire(
      REMOTE_NODE_DRAG_TIMEOUT_MS + 31,
      REMOTE_NODE_DRAG_TIMEOUT_MS,
    );
    expect(mutations.flatMap((mutation) => mutation.clearedNodeIds)).toContain(
      "node-a",
    );
    expect(registry.ownedNodeIds(diagramId).size).toBe(0);
  });

  test("keeps consecutive drag sessions isolated from late old events", () => {
    const registry = new RemoteNodeDragRegistry();
    const diagramId = "diagram-root";
    registry.apply(
      "actor-a",
      {
        kind: "node.drag.preview",
        dragSessionId: "drag-first",
        diagramId,
        previewIndex: 1,
        positions: { "node-a": { x: 100, y: 100 } },
      },
      0,
    );
    registry.clearCommitted(diagramId, ["node-a"]);
    registry.apply(
      "actor-a",
      {
        kind: "node.drag.preview",
        dragSessionId: "drag-second",
        diagramId,
        previewIndex: 1,
        positions: { "node-a": { x: 200, y: 220 } },
      },
      20,
    );
    expect(
      registry.apply(
        "actor-a",
        {
          kind: "node.drag.preview",
          dragSessionId: "drag-first",
          diagramId,
          previewIndex: 2,
          positions: { "node-a": { x: 999, y: 999 } },
        },
        30,
      ),
    ).toBeNull();
    expect(registry.positionsForDiagram(diagramId)).toEqual({
      "node-a": { x: 200, y: 220 },
    });
  });

  test("isolates nested diagrams and rejects malformed preview payloads", () => {
    const registry = new RemoteNodeDragRegistry();
    registry.apply(
      "actor-a",
      {
        kind: "node.drag.preview",
        dragSessionId: "drag-child",
        diagramId: "diagram-child",
        previewIndex: 1,
        positions: { "child-node": { x: 55, y: 77 } },
      },
      0,
    );
    expect(registry.positionsForDiagram("diagram-root")).toEqual({});
    expect(registry.positionsForDiagram("diagram-child")).toEqual({
      "child-node": { x: 55, y: 77 },
    });

    expect(() =>
      parseNodeDragOperation({
        kind: "node.drag.preview",
        dragSessionId: "drag-bad",
        diagramId: "diagram-root",
        previewIndex: 0,
        positions: { "node-a": { x: Number.NaN, y: 1 } },
      }),
    ).toThrow(/drag operation/i);
    expect(() =>
      parseRealtimeServerMessage(
        JSON.stringify({ v: 1, type: "op.ephemeral", payload: {} }),
      ),
    ).toThrow(/ephemeral/i);
  });
});
