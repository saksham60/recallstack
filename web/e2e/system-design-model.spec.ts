import { expect, test } from "@playwright/test";
import { LocalStorageSystemDesignRepository } from "../src/features/system-design/repository/LocalStorageSystemDesignRepository";
import {
  SYSTEM_DESIGN_SCHEMA_VERSION,
  type SystemDesignDiagram,
  type SystemDesignDocument,
  type SystemDesignNode,
} from "../src/features/system-design/types/system-design.types";
import {
  parseSystemDesignDocumentJson,
  serializeSystemDesignDocument,
} from "../src/features/system-design/utils/diagram-import-export";
import {
  cloneSystemDesignDocument,
  createSystemDesignDocumentSummary,
  getSystemDesignDiagramBreadcrumbs,
} from "../src/features/system-design/utils/system-design-defaults";
import { validateSystemDesignDocument } from "../src/features/system-design/utils/diagram-validation";
import {
  alignSystemDesignNodes,
  distributeSystemDesignNodes,
} from "../src/features/system-design/utils/node-layout";

const now = "2026-07-30T00:00:00.000Z";

function createNode(
  id: string,
  overrides: Partial<SystemDesignNode> = {},
): SystemDesignNode {
  return {
    id,
    type: "service",
    label: id,
    x: 40,
    y: 60,
    width: 160,
    height: 88,
    layer: 0,
    locked: false,
    visible: true,
    ...overrides,
  };
}

function createNestedDocument(): SystemDesignDocument {
  const moduleNode = createNode("analytics-module", {
    type: "module",
    label: "Analytics",
    isExpandable: true,
    childDiagramId: "analytics-diagram",
  });
  const root: SystemDesignDiagram = {
    id: "root-diagram",
    name: "URL Shortener",
    nodes: [moduleNode],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  const child: SystemDesignDiagram = {
    id: "analytics-diagram",
    name: "Analytics Module",
    parentNodeId: moduleNode.id,
    nodes: [
      createNode("event-consumer", {
        type: "worker",
        parentModuleId: moduleNode.id,
        technology: {
          id: "kafka",
          name: "Apache Kafka",
          category: "messaging",
        },
      }),
      createNode("analytics-store", {
        type: "data_warehouse",
        layer: 1,
      }),
    ],
    edges: [
      {
        id: "analytics-stream",
        sourceNodeId: "event-consumer",
        targetNodeId: "analytics-store",
        sourcePort: "right",
        targetPort: "left",
        type: "stream",
      },
    ],
    viewport: { x: -20, y: 10, zoom: 1.1 },
  };
  return {
    schemaVersion: SYSTEM_DESIGN_SCHEMA_VERSION,
    id: "url-shortener-document",
    problemId: "url-shortener",
    title: "URL Shortener",
    status: "in_progress",
    rootDiagramId: root.id,
    diagrams: {
      [root.id]: root,
      [child.id]: child,
    },
    metadata: { owner: "admin", source: "practice" },
    createdAt: now,
    updatedAt: now,
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

test.describe("system-design schema v2", () => {
  test("validates nested diagrams and preserves hierarchy through cloning", () => {
    const document = createNestedDocument();
    const result = validateSystemDesignDocument(document);

    expect(result.valid).toBe(true);
    expect(result.valid && result.migrated).toBe(false);
    const clone = cloneSystemDesignDocument(document);
    expect(clone).toEqual(document);
    expect(clone.diagrams).not.toBe(document.diagrams);
    expect(clone.diagrams["analytics-diagram"].nodes).not.toBe(
      document.diagrams["analytics-diagram"].nodes,
    );
    expect(
      getSystemDesignDiagramBreadcrumbs(document, "analytics-diagram").map(
        (diagram) => diagram.name,
      ),
    ).toEqual(["URL Shortener", "Analytics Module"]);
    expect(createSystemDesignDocumentSummary(document)).toMatchObject({
      nodeCount: 3,
      edgeCount: 1,
      status: "in_progress",
    });
  });

  test("migrates schema v1 without root-level compatibility fields", () => {
    const legacy = {
      schemaVersion: 1,
      id: "legacy-diagram",
      problemId: "url-shortener",
      title: "Legacy URL Shortener",
      status: "completed",
      nodes: [
        {
          ...createNode("cache", { type: "cache" }),
          technology: "Redis",
        },
        {
          ...createNode("legacy-vendor", { layer: 1 }),
          technology: "Internal KV Store",
        },
      ],
      edges: [
        {
          id: "cache-read",
          sourceNodeId: "cache",
          targetNodeId: "legacy-vendor",
          sourcePort: "right",
          targetPort: "left",
          type: "data",
        },
      ],
      viewport: { x: 12, y: -8, zoom: 1.25 },
      metadata: { owner: "admin", release: "legacy" },
      createdAt: now,
      updatedAt: now,
    };

    const document = parseSystemDesignDocumentJson(JSON.stringify(legacy));
    const root = document.diagrams[document.rootDiagramId];

    expect(document).toMatchObject({
      schemaVersion: 2,
      id: legacy.id,
      problemId: legacy.problemId,
      title: legacy.title,
      status: legacy.status,
      metadata: legacy.metadata,
    });
    expect(root).toMatchObject({
      id: legacy.id,
      name: legacy.title,
      edges: legacy.edges,
      viewport: legacy.viewport,
    });
    expect(root.nodes[0].technology).toEqual({
      id: "redis",
      name: "Redis",
      category: "cache",
    });
    expect(root.nodes[1].technology).toEqual({
      id: "custom",
      name: "Internal KV Store",
      category: "custom",
    });

    const serialized = serializeSystemDesignDocument(document);
    const serializedValue = JSON.parse(serialized) as Record<string, unknown>;
    expect(serializedValue.schemaVersion).toBe(2);
    expect(serializedValue).not.toHaveProperty("nodes");
    expect(serializedValue).not.toHaveProperty("edges");
    expect(serializedValue).not.toHaveProperty("viewport");
  });

  test("rejects broken child-diagram references", () => {
    const document = createNestedDocument();
    document.diagrams["root-diagram"].nodes[0].childDiagramId =
      "missing-diagram";
    const result = validateSystemDesignDocument(document);

    expect(result.valid).toBe(false);
    expect(
      result.valid
        ? []
        : result.issues.map((validationIssue) => validationIssue.path),
    ).toContain(
      "$.diagrams.root-diagram.nodes[0].childDiagramId",
    );
  });

  test("rejects child diagrams referenced by non-module nodes", () => {
    const document = createNestedDocument();
    document.diagrams["root-diagram"].nodes[0].type = "service";
    const result = validateSystemDesignDocument(document);

    expect(result.valid).toBe(false);
    expect(
      result.valid
        ? []
        : result.issues.map((validationIssue) => validationIssue.message),
    ).toContain("Only module nodes can reference child diagrams.");
  });

  test("requires exactly one parent module reference per child diagram", () => {
    const document = createNestedDocument();
    document.diagrams["root-diagram"].nodes.push(
      createNode("duplicate-parent", {
        type: "module",
        isExpandable: true,
        childDiagramId: "analytics-diagram",
      }),
    );
    const result = validateSystemDesignDocument(document);

    expect(result.valid).toBe(false);
    expect(
      result.valid
        ? []
        : result.issues.find(
            (validationIssue) =>
              validationIssue.path ===
              "$.diagrams.analytics-diagram.parentNodeId",
          )?.message,
    ).toContain("exactly one parent module reference; found 2");
  });

  test("rejects orphan diagrams", () => {
    const document = createNestedDocument();
    document.diagrams["orphan-diagram"] = {
      id: "orphan-diagram",
      name: "Detached subsystem",
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    const result = validateSystemDesignDocument(document);

    expect(result.valid).toBe(false);
    expect(
      result.valid
        ? []
        : result.issues.find(
            (validationIssue) =>
              validationIssue.path === "$.diagrams.orphan-diagram",
          )?.message,
    ).toContain("Diagram is orphaned");
  });

  test("rejects cycles across multiple diagrams", () => {
    const document = createNestedDocument();
    document.diagrams["orphan-a"] = {
      id: "orphan-a",
      name: "Orphan A",
      parentNodeId: "orphan-b-module",
      nodes: [
        createNode("orphan-a-module", {
          type: "module",
          isExpandable: true,
          childDiagramId: "orphan-b",
        }),
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    document.diagrams["orphan-b"] = {
      id: "orphan-b",
      name: "Orphan B",
      parentNodeId: "orphan-a-module",
      nodes: [
        createNode("orphan-b-module", {
          type: "module",
          isExpandable: true,
          childDiagramId: "orphan-a",
        }),
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    const result = validateSystemDesignDocument(document);
    const messages = result.valid
      ? []
      : result.issues.map((validationIssue) => validationIssue.message);

    expect(result.valid).toBe(false);
    expect(messages).toContain(
      "Child-diagram references must not form a cycle.",
    );
    expect(
      messages.filter((message) => message.startsWith("Diagram is orphaned")),
    ).toHaveLength(2);
  });

  test("rejects spoofed registered technology identities", () => {
    const document = createNestedDocument();
    document.diagrams["analytics-diagram"].nodes[0].technology = {
      id: "kafka",
      name: "Kafka-compatible proxy",
      category: "compute",
    };
    const result = validateSystemDesignDocument(document);
    const issuePaths = result.valid
      ? []
      : result.issues.map((validationIssue) => validationIssue.path);

    expect(result.valid).toBe(false);
    expect(issuePaths).toContain(
      "$.diagrams.analytics-diagram.nodes[0].technology.name",
    );
    expect(issuePaths).toContain(
      "$.diagrams.analytics-diagram.nodes[0].technology.category",
    );
  });

  test("aligns and distributes movable nodes without shifting endpoints", () => {
    const nodes = [
      createNode("left", { x: 0, width: 40 }),
      createNode("middle", { x: 85, width: 40 }),
      createNode("right", { x: 300, width: 40 }),
      createNode("locked", { x: -500, width: 40, locked: true }),
    ];

    const aligned = alignSystemDesignNodes(nodes, "left");
    expect(aligned).toMatchObject({
      left: { x: 0 },
      middle: { x: 0 },
      right: { x: 0 },
    });
    expect(aligned).not.toHaveProperty("locked");

    const distributed = distributeSystemDesignNodes(nodes, "horizontal");
    expect(distributed.left.x).toBe(0);
    expect(distributed.middle.x).toBe(150);
    expect(distributed.right.x).toBe(300);
    expect(distributed).not.toHaveProperty("locked");
  });

  test("upgrades a persisted schema-v1 document on read", async () => {
    const storage = new MemoryStorage();
    const key = LocalStorageSystemDesignRepository.storageKey("url-shortener");
    storage.setItem(
      key,
      JSON.stringify({
        schemaVersion: 1,
        id: "legacy-diagram",
        problemId: "url-shortener",
        title: "URL Shortener",
        status: "in_progress",
        nodes: [createNode("api")],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        createdAt: now,
        updatedAt: now,
      }),
    );
    const repository = new LocalStorageSystemDesignRepository(storage);

    const document = await repository.getDocument("url-shortener");
    expect(document?.schemaVersion).toBe(2);
    expect(document?.diagrams[document.rootDiagramId].nodes).toHaveLength(1);

    const persisted = JSON.parse(storage.getItem(key) ?? "{}") as Record<
      string,
      unknown
    >;
    expect(persisted.schemaVersion).toBe(2);
    expect(persisted).not.toHaveProperty("nodes");
  });
});
